import { query, queryOne } from '@/lib/db';
import { importFromConnector, expireOffers, recordNotification } from './import';
import { getConnector } from '@/lib/connectors/registry';
import { getEmailProvider } from '@/lib/email';
import { listOffers } from './offers';
import type { Locale } from '@/lib/types';

/** Mirrors the `sync_logs.status` check constraint. */
export type SyncStatus =
  | 'running'
  | 'success'
  | 'partial'
  | 'failed'
  | 'cancelled'
  | 'skipped';

/**
 * `recordNotification` stores a text message; structured context is appended
 * as JSON on a second line so the payload survives without a schema change.
 */
function withContext(message: string, context?: Record<string, unknown>): string {
  if (!context || Object.keys(context).length === 0) return message;
  return `${message}\n${JSON.stringify(context)}`;
}

/**
 * Shared machinery for the automated workflows.
 *
 * The eight n8n scenarios call the internal HTTP endpoints; those endpoints
 * call these functions. Keeping the logic here means the same code path is
 * used whether the trigger is a schedule, a manual admin action, or a test.
 */

export interface SyncLogRow {
  id: string;
  workflow_name: string;
}

async function networkIdFor(slug?: string): Promise<string | null> {
  if (!slug) return null;
  const row = await queryOne<{ id: string }>('SELECT id FROM affiliate_networks WHERE slug = $1', [slug]);
  return row?.id ?? null;
}

export async function startSyncLog(
  workflowName: string,
  networkSlug?: string,
  triggeredBy = 'automation',
): Promise<string | null> {
  // `sync_logs` has no "triggered_by" column, so the origin is folded into
  // `execution_id` — the same field the import pipeline already uses.
  const row = await queryOne<{ id: string }>(
    `INSERT INTO sync_logs (network_id, workflow_name, execution_id, started_at, status)
     VALUES ($1, $2, $3, now(), 'running') RETURNING id`,
    [await networkIdFor(networkSlug), workflowName, `${triggeredBy}-${Date.now()}`],
  );
  return row?.id ?? null;
}

export async function finishSyncLog(
  id: string | null,
  status: SyncStatus,
  counts: {
    imported?: number;
    updated?: number;
    rejected?: number;
    expired?: number;
    skipped?: number;
  } = {},
  errorMessage?: string,
): Promise<void> {
  if (!id) return;
  await query(
    `UPDATE sync_logs
        SET status = $2, finished_at = now(),
            imported_count = $3, updated_count = $4, rejected_count = $5,
            expired_count = $6, warning_count = $7, error_message = $8
      WHERE id = $1`,
    [
      id,
      status,
      counts.imported ?? 0,
      counts.updated ?? 0,
      counts.rejected ?? 0,
      counts.expired ?? 0,
      // There is no skipped_count column; skips are recorded as warnings so
      // the count is still visible on the sync-logs screen.
      counts.skipped ?? 0,
      errorMessage ?? null,
    ],
  );
}

// ---------------------------------------------------------------------------
// 1. Automated offer import
// ---------------------------------------------------------------------------

export async function runImportWorkflow(
  networkSlug?: string,
  triggeredBy = 'automation',
): Promise<Record<string, unknown>> {
  const networks = networkSlug
    ? await query<{ slug: string; name: string }>(
        'SELECT slug, name FROM affiliate_networks WHERE slug = $1',
        [networkSlug],
      )
    : await query<{ slug: string; name: string }>(
        "SELECT slug, name FROM affiliate_networks WHERE status = 'enabled' ORDER BY name",
      );

  if (networks.length === 0) {
    return { skipped: true, reason: 'No enabled networks to import.' };
  }

  const results: Record<string, unknown>[] = [];

  for (const network of networks) {
    const connector = getConnector(network.slug);
    if (!connector) {
      results.push({
        network: network.slug,
        status: 'skipped',
        reason: 'No connector implementation registered for this network.',
      });
      continue;
    }

    try {
      // importFromConnector writes its own sync_logs row with the counters.
      const result = await importFromConnector(connector, `${triggeredBy}-${Date.now()}`);
      results.push({ network: network.slug, ...result });

      if (result.status === 'failed') {
        await recordNotification(
          'connector_error',
          'critical',
          'Import failed',
          withContext(`${network.slug}: ${result.errorMessage ?? 'unknown error'}`, {
            network: network.slug,
          }),
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await recordNotification(
        'connector_error',
        'critical',
        'Import failed',
        withContext(`${network.slug}: ${message}`, { network: network.slug }),
      );
      results.push({ network: network.slug, status: 'failed', error: message });
    }
  }

  return { networks: networks.length, results };
}

// ---------------------------------------------------------------------------
// 2. Expiration management
// ---------------------------------------------------------------------------

export async function runExpirationWorkflow(triggeredBy = 'automation'): Promise<Record<string, unknown>> {
  const logId = await startSyncLog('offer_expiration', undefined, triggeredBy);
  try {
    const expired = await expireOffers();

    // Warn about offers that will disappear within 48 hours.
    const soon = await query<{ slug: string; title: string; expires_at: string }>(
      `SELECT slug, title, expires_at FROM offers
        WHERE publication_status = 'published'
          AND expires_at IS NOT NULL
          AND expires_at BETWEEN now() AND now() + interval '48 hours'
        ORDER BY expires_at`,
    );

    if (soon.length > 0) {
      await recordNotification(
        'expiration_spike',
        'warning',
        'Offers expiring within 48 hours',
        withContext(`${soon.length} published offer(s) expire in the next two days.`, {
          offers: soon.map((offer) => offer.slug),
        }),
      );
    }

    await finishSyncLog(logId, 'success', { expired });
    return { expired, expiringSoon: soon.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishSyncLog(logId, 'failed', {}, message);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// 3. Affiliate link validation
// ---------------------------------------------------------------------------

export async function runLinkValidationWorkflow(
  limit = 40,
  triggeredBy = 'automation',
): Promise<Record<string, unknown>> {
  const logId = await startSyncLog('link_validation', undefined, triggeredBy);

  const offers = await query<{ id: string; slug: string; affiliate_url: string }>(
    `SELECT id, slug, affiliate_url FROM offers
      WHERE publication_status IN ('published', 'approved')
      ORDER BY link_last_checked_at NULLS FIRST, updated_at
      LIMIT $1`,
    [limit],
  );

  let ok = 0;
  let broken = 0;
  let unknown = 0;

  for (const offer of offers) {
    const status = await probeUrl(offer.affiliate_url);

    await query(
      `UPDATE offers
          SET link_last_checked_at = now(),
              link_status = $2,
              link_error_count = CASE WHEN $2 = 'broken' THEN link_error_count + 1 ELSE 0 END,
              publication_status = CASE
                WHEN $2 = 'broken' AND link_error_count + 1 >= 3 THEN 'suspended'
                ELSE publication_status END
        WHERE id = $1`,
      [offer.id, status],
    );

    if (status === 'ok') ok += 1;
    else if (status === 'broken') broken += 1;
    else unknown += 1;
  }

  if (broken > 0) {
    await recordNotification(
      'broken_link',
      'warning',
      'Broken affiliate links detected',
      `${broken} link(s) did not respond during validation.`,
    );
  }

  await finishSyncLog(logId, broken > 0 ? 'partial' : 'success', { skipped: unknown }, undefined);

  return { checked: offers.length, ok, broken, unknown };
}

/**
 * Probe an outbound URL with a HEAD request, falling back to GET when the
 * server refuses HEAD.
 *
 * Non-2xx is not treated as broken: many affiliate networks block datacenter
 * IP ranges with a 403 while the link works perfectly for a real visitor.
 * Only transport failures count as broken, and an offer is suspended after
 * three consecutive failures rather than a single unlucky probe.
 */
async function probeUrl(url: string): Promise<'ok' | 'broken' | 'unknown'> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    let response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': 'DealPassLinkValidator/1.0 (+link-health-check)' },
    });

    if (response.status === 405 || response.status === 501) {
      response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'user-agent': 'DealPassLinkValidator/1.0 (+link-health-check)' },
      });
    }

    return response.status < 500 ? 'ok' : 'unknown';
  } catch {
    return 'broken';
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// 4. Transaction / commission synchronisation
// ---------------------------------------------------------------------------

export async function runTransactionSyncWorkflow(
  daysBack = 3,
  triggeredBy = 'automation',
): Promise<Record<string, unknown>> {
  const networks = await query<{ slug: string; name: string; integration_type: string }>(
    "SELECT slug, name, integration_type FROM affiliate_networks WHERE status = 'enabled'",
  );

  const results: Record<string, unknown>[] = [];

  for (const network of networks) {
    const logId = await startSyncLog('transaction_sync', network.slug, triggeredBy);

    // No connector in this repository ships a verified transaction-mapping:
    // every provider is disabled pending official programme access. Rather
    // than fabricate conversions, the workflow records an explicit skip.
    await finishSyncLog(logId, 'skipped', {}, undefined);
    results.push({
      network: network.slug,
      status: 'skipped',
      reason: 'No verified transaction API mapping. Official programme access required.',
    });
  }

  return {
    windowDays: daysBack,
    networks: networks.length,
    results,
    note:
      networks.length === 0
        ? 'No enabled network. Enable a connector once its credentials and verified mapping are in place.'
        : 'Transaction sync activates per network as transaction mappings are verified.',
  };
}

// ---------------------------------------------------------------------------
// 5. Automated newsletter
// ---------------------------------------------------------------------------

export async function runNewsletterWorkflow(
  locale: Locale,
  triggeredBy = 'automation',
): Promise<Record<string, unknown>> {
  const logId = await startSyncLog('newsletter_dispatch', undefined, triggeredBy);

  const { confirmedSegments } = await import('./newsletter');

  const allSegments = await confirmedSegments();
  const segments = allSegments.filter((segment) => segment.language === locale);

  if (segments.length === 0) {
    await finishSyncLog(logId, 'success', { skipped: 0 });
    return { sent: 0, reason: 'No confirmed subscribers for this locale.' };
  }

  const { offers } = await listOffers({
    language: locale,
    sort: 'popular',
    perPage: 8,
  });

  if (offers.length === 0) {
    await finishSyncLog(logId, 'success', { skipped: segments.length });
    return { sent: 0, reason: 'No published offers to feature.' };
  }

  const provider = getEmailProvider();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const siteName = process.env.NEXT_PUBLIC_SITE_NAME ?? 'DealPass';

  const subject =
    locale === 'fr'
      ? `${offers.length} offres sélectionnées pour vous`
      : locale === 'ar'
        ? `${offers.length} عروض مختارة لك`
        : `${offers.length} offers picked for you`;

  const list = offers
    .map(
      (offer) =>
        `<li><a href="${siteUrl}/${locale}/offers/${offer.slug}">${escapeHtml(offer.title)}</a> — ${escapeHtml(offer.merchant_name)}</li>`,
    )
    .join('\n');

  const html = `
    <div dir="${locale === 'ar' ? 'rtl' : 'ltr'}">
      <h2>${escapeHtml(subject)}</h2>
      <ul>${list}</ul>
      <p><a href="__UNSUBSCRIBE__">Unsubscribe</a></p>
    </div>`;

  // One transactional send per recipient: every address is confirmed, and this
  // keeps the unsubscribe footer personal without a marketing campaign.
  let sent = 0;
  let failed = 0;
  const failures: string[] = [];

  for (const segment of segments) {
    for (const email of segment.emails) {
      try {
        await provider.sendTransactional({
          to: email,
          subject,
          html: html.replace('__UNSUBSCRIBE__', `${siteUrl}/${locale}/newsletter/unsubscribe?email=${encodeURIComponent(email)}`),
          text: offers
            .map((offer) => `${offer.title} — ${offer.merchant_name}\n${siteUrl}/${locale}/offers/${offer.slug}`)
            .join('\n\n'),
        });
        sent += 1;
      } catch (error) {
        failed += 1;
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }
  }

  await finishSyncLog(
    logId,
    failed > 0 ? 'partial' : 'success',
    { skipped: failed },
    failed > 0 ? failures.slice(0, 3).join(' | ') : undefined,
  );

  return {
    locale,
    recipients: segments.reduce((total, segment) => total + segment.emails.length, 0),
    sent,
    failed,
    subject,
    from: siteName,
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

// ---------------------------------------------------------------------------
// 6. Daily operations report
// ---------------------------------------------------------------------------

export async function runDailyReportWorkflow(triggeredBy = 'automation'): Promise<Record<string, unknown>> {
  const logId = await startSyncLog('daily_report', undefined, triggeredBy);

  const [offers, clicks, syncs, reports, subscribers] = await Promise.all([
    queryOne<{ total: string; published: string; pending: string; expired: string }>(
      `SELECT count(*) AS total,
              count(*) FILTER (WHERE publication_status = 'published') AS published,
              count(*) FILTER (WHERE publication_status = 'pending_validation') AS pending,
              count(*) FILTER (WHERE publication_status = 'expired') AS expired
         FROM offers WHERE deleted_at IS NULL`,
    ),
    queryOne<{ today: string; week: string }>(
      `SELECT count(*) FILTER (WHERE clicked_at > now() - interval '1 day') AS today,
              count(*) FILTER (WHERE clicked_at > now() - interval '7 days') AS week
         FROM clicks`,
    ),
    queryOne<{ failed: string; partial: string }>(
      `SELECT count(*) FILTER (WHERE status = 'failed') AS failed,
              count(*) FILTER (WHERE status = 'partial') AS partial
         FROM sync_logs WHERE started_at > now() - interval '1 day'`,
    ),
    queryOne<{ open: string }>(
      "SELECT count(*) AS open FROM coupon_reports WHERE status = 'open'",
    ),
    queryOne<{ confirmed: string }>(
      "SELECT count(*) AS confirmed FROM newsletter_subscribers WHERE consent_status = 'confirmed'",
    ),
  ]);

  const summary = {
    offersTotal: Number(offers?.total ?? 0),
    offersPublished: Number(offers?.published ?? 0),
    offersPending: Number(offers?.pending ?? 0),
    offersExpired: Number(offers?.expired ?? 0),
    clicksToday: Number(clicks?.today ?? 0),
    clicks7d: Number(clicks?.week ?? 0),
    failedSyncs: Number(syncs?.failed ?? 0),
    partialSyncs: Number(syncs?.partial ?? 0),
    openReports: Number(reports?.open ?? 0),
    confirmedSubscribers: Number(subscribers?.confirmed ?? 0),
    generatedAt: new Date().toISOString(),
  };

  const recipient = process.env.OPS_ALERT_EMAIL;
  if (recipient) {
    try {
      await getEmailProvider().sendTransactional({
        to: recipient,
        subject: `DealPass daily report — ${new Date().toISOString().slice(0, 10)}`,
        html: `<pre>${escapeHtml(JSON.stringify(summary, null, 2))}</pre>`,
        text: JSON.stringify(summary, null, 2),
      });
    } catch {
      // Reporting must never take the platform down.
    }
  }

  if (summary.failedSyncs > 0 || summary.openReports > 0) {
    await recordNotification(
      'system',
      'warning',
      'Daily report: items need attention',
      withContext(`${summary.failedSyncs} failed sync(s), ${summary.openReports} open report(s).`, summary),
    );
  }

  await finishSyncLog(logId, 'success');
  return summary;
}

// ---------------------------------------------------------------------------
// 7. Central error handling
// ---------------------------------------------------------------------------

export async function ingestError(payload: {
  workflow?: string;
  severity?: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  context?: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const severity = payload.severity ?? 'error';

  await recordNotification(
    'system',
    severity === 'error' || severity === 'critical' ? 'critical' : 'warning',
    payload.workflow ? `Workflow error: ${payload.workflow}` : 'Workflow error',
    withContext(payload.message, { ...(payload.context ?? {}), workflow: payload.workflow ?? null }),
  );

  if (payload.workflow) {
    await query(
      `INSERT INTO sync_logs (workflow_name, execution_id, status, started_at, finished_at, error_message)
       VALUES ($1, $2, 'failed', now(), now(), $3)`,
      [payload.workflow, `error-handler-${Date.now()}`, payload.message],
    );
  }

  // Escalate by email only for the severities that warrant waking someone up.
  const recipient = process.env.OPS_ALERT_EMAIL;
  if (recipient && (severity === 'critical' || severity === 'error')) {
    try {
      await getEmailProvider().sendTransactional({
        to: recipient,
        subject: `[${severity.toUpperCase()}] DealPass — ${payload.workflow ?? 'workflow'}`,
        text: `${payload.message}\n\n${JSON.stringify(payload.context ?? {}, null, 2)}`,
        html: `<h3>${escapeHtml(payload.message)}</h3><pre>${escapeHtml(JSON.stringify(payload.context ?? {}, null, 2))}</pre>`,
      });
    } catch {
      // Never let alerting failure mask the original error.
    }
  }

  return { recorded: true, severity, emailed: Boolean(recipient) };
}

// ---------------------------------------------------------------------------
// 8. Data-quality audit
// ---------------------------------------------------------------------------

export interface QualityIssue {
  check: string;
  count: number;
  severity: 'info' | 'warning' | 'error';
  detail: string;
}

export async function runDataQualityWorkflow(triggeredBy = 'automation'): Promise<Record<string, unknown>> {
  const logId = await startSyncLog('data_quality', undefined, triggeredBy);

  const checks: Array<{ check: string; sql: string; severity: QualityIssue['severity']; detail: string }> = [
    {
      check: 'missing_translation',
      severity: 'warning',
      detail: 'Published offers without a translation in every supported language.',
      sql: `SELECT count(*)::int AS count FROM offers o
             WHERE o.publication_status = 'published'
               AND (SELECT count(DISTINCT language_code) FROM offer_translations t WHERE t.offer_id = o.id) < 3`,
    },
    {
      check: 'expired_still_published',
      severity: 'error',
      detail: 'Offers past their end date that are still marked published.',
      sql: `SELECT count(*)::int AS count FROM offers
             WHERE publication_status = 'published' AND expires_at IS NOT NULL AND expires_at < now()`,
    },
    {
      check: 'missing_merchant',
      severity: 'error',
      detail: 'Offers whose merchant record is missing or inactive.',
      sql: `SELECT count(*)::int AS count FROM offers o
             LEFT JOIN merchants m ON m.id = o.merchant_id
             WHERE o.deleted_at IS NULL AND (m.id IS NULL OR m.status <> 'active')`,
    },
    {
      check: 'no_category',
      severity: 'warning',
      detail: 'Offers not attached to any category.',
      sql: `SELECT count(*)::int AS count FROM offers o
             WHERE o.deleted_at IS NULL
               AND NOT EXISTS (SELECT 1 FROM offer_categories c WHERE c.offer_id = o.id)`,
    },
    {
      check: 'low_confidence_published',
      severity: 'warning',
      detail: 'Published offers below the configured auto-publish threshold.',
      sql: `SELECT count(*)::int AS count FROM offers
             WHERE publication_status = 'published' AND confidence_score < 70`,
    },
    {
      check: 'unconfirmed_subscribers_stale',
      severity: 'info',
      detail: 'Pending subscribers older than seven days, eligible for purge.',
      sql: `SELECT count(*)::int AS count FROM newsletter_subscribers
             WHERE consent_status = 'pending' AND created_at < now() - interval '7 days'`,
    },
    {
      check: 'link_error_streak',
      severity: 'warning',
      detail: 'Offers with repeated link-check failures.',
      sql: `SELECT count(*)::int AS count FROM offers WHERE link_error_count > 0`,
    },
  ];

  const issues: QualityIssue[] = [];

  for (const check of checks) {
    const row = await queryOne<{ count: number }>(check.sql);
    const count = Number(row?.count ?? 0);
    if (count > 0) {
      issues.push({ check: check.check, count, severity: check.severity, detail: check.detail });
    }
  }

  const errors = issues.filter((issue) => issue.severity === 'error');

  if (errors.length > 0) {
    await recordNotification(
      'system',
      'critical',
      'Data-quality audit found blocking issues',
      withContext(errors.map((issue) => `${issue.check}: ${issue.count}`).join('; '), { issues }),
    );
  }

  await finishSyncLog(logId, errors.length > 0 ? 'partial' : 'success', {
    skipped: issues.length,
  });

  return { checked: checks.length, issues, healthy: errors.length === 0 };
}

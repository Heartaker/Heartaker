'use server';

import { revalidatePath } from 'next/cache';
import { query, queryOne } from '@/lib/db';
import { requirePermission, can } from '@/lib/auth/rbac';
import { getCurrentUser } from '@/lib/auth/session';
import { getConnector } from '@/lib/connectors/registry';
import { importFromConnector, expireOffers, recordNotification } from '@/lib/services/import';
import { writeAudit } from '@/lib/services/admin';
import { setSetting, getBrandSettings, getPublicationRules, getLocalizationSettings, getFeatureSettings, getSeoSettings, getDisclosures } from '@/lib/services/settings';
import { sanitizeError } from '@/lib/connectors/http';

/**
 * Server actions for the administration dashboard.
 *
 * Every action re-checks permissions server-side. A client cannot invoke an
 * action its role does not hold, even if the UI is manipulated — the check
 * happens again here, on the server, before any write.
 */

export interface ActionResult {
  ok: boolean;
  message: string;
}

// ---------------------------------------------------------------------------
// Offer moderation
// ---------------------------------------------------------------------------

type ModerationAction = 'approve' | 'reject' | 'suspend' | 'archive' | 'restore' | 'delete';

export async function moderateOffer(
  offerId: string,
  action: ModerationAction,
  locale = 'fr',
): Promise<ActionResult> {
  if (action === 'delete') await requirePermission('offers.delete');
  else if (action === 'approve') await requirePermission('offers.publish');
  else await requirePermission('offers.update');

  const user = await getCurrentUser();
  const before = await queryOne<{ publication_status: string; title: string }>(
    'SELECT publication_status, title FROM offers WHERE id = $1',
    [offerId],
  );
  if (!before) return { ok: false, message: 'Offer not found.' };

  const now = new Date().toISOString();

  if (action === 'delete') {
    await query(`UPDATE offers SET deleted_at = now(), updated_at = now() WHERE id = $1`, [offerId]);
  } else {
    const status =
      action === 'approve' ? 'published'
        : action === 'reject' ? 'rejected'
          : action === 'suspend' ? 'suspended'
            : action === 'archive' ? 'archived'
              : 'published';

    // The database refuses to publish an offer that lacks a code or a usable
    // destination (migration 0010), so an approval cannot create a broken page.
    await query(
      `UPDATE offers
          SET publication_status = $2,
              published_at = CASE WHEN $2 = 'published' AND published_at IS NULL THEN now() ELSE published_at END,
              expired_at   = CASE WHEN $2 = 'published' THEN NULL ELSE expired_at END,
              updated_at   = now()
        WHERE id = $1`,
      [offerId, status],
    );
  }

  await writeAudit({
    userId: user?.id ?? null,
    actorEmail: user?.email ?? null,
    action: `offer.${action}`,
    entityType: 'offer',
    entityId: offerId,
    previous: { publication_status: before.publication_status },
    next: { action },
  });

  revalidatePath(`/${locale}/admin`);
  revalidatePath(`/${locale}/admin/offers`);
  revalidatePath(`/${locale}/admin/review`);
  return { ok: true, message: `${before.title} → ${action}` };
}

export async function runExpirationWorkflow(locale = 'fr'): Promise<ActionResult> {
  await requirePermission('offers.update');
  const count = await expireOffers(`manual-${Date.now()}`);
  revalidatePath(`/${locale}/admin`);
  return { ok: true, message: `${count} offers expired` };
}

// ---------------------------------------------------------------------------
// Connectors
// ---------------------------------------------------------------------------

export async function testConnector(slug: string, locale = 'fr'): Promise<ActionResult> {
  await requirePermission('integrations.read');
  const connector = getConnector(slug);
  if (!connector) return { ok: false, message: 'Unknown connector.' };

  const result = await connector.testConnection();
  await query(
    `UPDATE affiliate_networks SET health_status = $2 WHERE slug = $1`,
    [slug, result.status === 'healthy' ? 'healthy' : result.status === 'not_configured' ? 'not_configured' : 'failing'],
  );
  revalidatePath(`/${locale}/admin/connectors`);
  return { ok: result.ok, message: result.message };
}

export async function syncConnector(slug: string, locale = 'fr'): Promise<ActionResult> {
  await requirePermission('integrations.sync');
  const connector = getConnector(slug);
  if (!connector) return { ok: false, message: 'Unknown connector.' };

  const user = await getCurrentUser();

  try {
    const result = await importFromConnector(connector, `manual-${Date.now()}`);
    await writeAudit({
      userId: user?.id ?? null,
      actorEmail: user?.email ?? null,
      action: 'connector.sync',
      entityType: 'affiliate_network',
      entityId: slug,
      next: result,
    });
    revalidatePath(`/${locale}/admin`);
    revalidatePath(`/${locale}/admin/offers`);
    revalidatePath(`/${locale}/admin/connectors`);
    revalidatePath(`/${locale}/admin/sync-logs`);
    return {
      ok: result.status !== 'failed',
      message: `Imported ${result.imported}, updated ${result.updated}, rejected ${result.rejected}`,
    };
  } catch (error) {
    const message = sanitizeError(error instanceof Error ? error.message : String(error));
    await recordNotification('connector_error', 'critical', `Manual sync failed: ${slug}`, message);
    return { ok: false, message };
  }
}

export async function setConnectorEnabled(
  slug: string,
  enabled: boolean,
  locale = 'fr',
): Promise<ActionResult> {
  await requirePermission('integrations.configure');
  const connector = getConnector(slug);
  if (!connector) return { ok: false, message: 'Unknown connector.' };

  // Refuse to enable a provider whose credentials are absent or whose response
  // mapping has not been verified — an unverified mapping must never run.
  if (enabled && slug !== 'demo') {
    const missing = (connector.requiredEnv ?? []).filter(
      (key) => !process.env[key]?.trim(),
    );
    if (missing.length > 0) {
      return { ok: false, message: `Cannot enable: missing ${missing.join(', ')}` };
    }
    if (!connector.mappingVerified) {
      return { ok: false, message: 'Cannot enable: response mapping is not verified.' };
    }
  }

  const user = await getCurrentUser();
  await query(
    `UPDATE affiliate_networks SET status = $2, updated_at = now() WHERE slug = $1`,
    [slug, enabled ? 'enabled' : 'disabled'],
  );
  await writeAudit({
    userId: user?.id ?? null,
    actorEmail: user?.email ?? null,
    action: enabled ? 'connector.enable' : 'connector.disable',
    entityType: 'affiliate_network',
    entityId: slug,
  });

  revalidatePath(`/${locale}/admin/connectors`);
  return { ok: true, message: enabled ? 'Connector enabled.' : 'Connector disabled.' };
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function saveBrandSettings(
  input: {
    siteName: string;
    slogan: string;
    domain: string;
    logoUrl: string;
    fontSans: string;
    fontDisplay: string;
    radius: string;
    brand: string;
    accent: string;
    ink: string;
    surface: string;
    line: string;
    defaultTheme: 'light' | 'dark';
  },
  locale = 'fr',
): Promise<ActionResult> {
  await requirePermission('settings.configure');
  const user = await getCurrentUser();

  await setSetting(
    'brand',
    {
      siteName: input.siteName.slice(0, 60),
      slogan: input.slogan.slice(0, 160),
      domain: input.domain.slice(0, 120),
      logoUrl: input.logoUrl.slice(0, 500),
      faviconUrl: '',
      fontSans: input.fontSans.slice(0, 80),
      fontDisplay: input.fontDisplay.slice(0, 80),
      radius: input.radius.slice(0, 20),
      defaultTheme: input.defaultTheme,
      colors: {
        brand: input.brand,
        accent: input.accent,
        ink: input.ink,
        surface: input.surface,
        line: input.line,
      },
    },
    user?.id ?? null,
  );

  await writeAudit({
    userId: user?.id ?? null,
    actorEmail: user?.email ?? null,
    action: 'settings.brand.update',
    entityType: 'site_settings',
    entityId: 'brand',
  });

  revalidatePath(`/${locale}`, 'layout');
  revalidatePath(`/${locale}/admin/settings`);
  return { ok: true, message: 'Brand identity saved.' };
}

export async function savePublicationSettings(
  input: {
    autoPublishThreshold: number;
    reviewThreshold: number;
    rejectBelow: number;
    requireTerms: boolean;
    requireCountry: boolean;
    maxDaysUntilExpiry: number;
  },
  locale = 'fr',
): Promise<ActionResult> {
  await requirePermission('settings.configure');
  const user = await getCurrentUser();

  // Guard against an administrator configuring contradictory thresholds.
  if (
    input.rejectBelow > input.reviewThreshold ||
    input.reviewThreshold > input.autoPublishThreshold
  ) {
    return {
      ok: false,
      message: 'Thresholds must satisfy: reject below ≤ review below ≤ auto-publish from.',
    };
  }

  const current = await getPublicationRules();
  await setSetting('publication', { ...current, ...input }, user?.id ?? null);

  await writeAudit({
    userId: user?.id ?? null,
    actorEmail: user?.email ?? null,
    action: 'settings.publication.update',
    entityType: 'site_settings',
    entityId: 'publication',
    next: input,
  });

  revalidatePath(`/${locale}/admin/settings`);
  return { ok: true, message: 'Publication rules saved.' };
}

export async function saveFeatureSettings(
  input: Record<string, boolean>,
  locale = 'fr',
): Promise<ActionResult> {
  await requirePermission('settings.configure');
  const user = await getCurrentUser();
  const current = await getFeatureSettings();
  await setSetting('features', { ...current, ...input }, user?.id ?? null);
  revalidatePath(`/${locale}`, 'layout');
  return { ok: true, message: 'Features saved.' };
}

export async function saveLocalizationSettings(
  input: {
    defaultLanguage: string;
    defaultCountry: string;
    defaultCurrency: string;
    autoDetect: boolean;
  },
  locale = 'fr',
): Promise<ActionResult> {
  await requirePermission('settings.configure');
  const user = await getCurrentUser();
  const current = await getLocalizationSettings();
  await setSetting('localization', { ...current, ...input }, user?.id ?? null);
  revalidatePath(`/${locale}`, 'layout');
  return { ok: true, message: 'Localisation saved.' };
}

export async function saveDisclosureSettings(
  input: { fr: string; en: string; ar: string },
  locale = 'fr',
): Promise<ActionResult> {
  await requirePermission('settings.configure');
  const user = await getCurrentUser();
  await setSetting('affiliate_disclosure', input, user?.id ?? null);
  revalidatePath(`/${locale}`, 'layout');
  return { ok: true, message: 'Disclosure saved.' };
}

/** Read the current settings for the settings form. */
export async function loadAllSettings() {
  await requirePermission('settings.read');
  const [brand, localization, features, seo, publication, disclosures] = await Promise.all([
    getBrandSettings(),
    getLocalizationSettings(),
    getFeatureSettings(),
    getSeoSettings(),
    getPublicationRules(),
    getDisclosures(),
  ]);
  return { brand, localization, features, seo, publication, disclosures };
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export async function resolveReport(reportId: string, resolution: 'resolved' | 'dismissed', locale = 'fr'): Promise<ActionResult> {
  await requirePermission('offers.review');
  const user = await getCurrentUser();
  await query(
    `UPDATE coupon_reports
        SET status = $2, resolved_at = now(), reviewed_at = now(), resolved_by = $3
      WHERE id = $1`,
    [reportId, resolution, user?.id ?? null],
  );
  revalidatePath(`/${locale}/admin/review`);
  return { ok: true, message: `Report ${resolution}.` };
}

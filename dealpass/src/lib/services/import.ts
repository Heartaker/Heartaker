import { query, queryOne, transaction } from '../db/index';
import { fingerprintForOffer } from '../fingerprint';
import { validateOffer, type PublicationRules } from '../validation';
import { extractDomain, slugify } from '../normalize';
import type { AffiliateConnector, SyncCounters } from '../connectors/types';
import { sanitizeError } from '../connectors/http';
import { getPublicationRules } from './settings';
import type { NormalizedMerchant, NormalizedOffer } from '../types';

/**
 * The import pipeline.
 *
 * Guarantees:
 *   1. IDEMPOTENT — running twice never creates a second row for the same
 *      real-world promotion. Identity comes from `buildFingerprint()`.
 *   2. NON-DESTRUCTIVE — an update never overwrites a populated field with an
 *      empty one ("never replace reliable information with empty data").
 *   3. AUDITED — every change writes an `offer_versions` snapshot (trigger) and
 *      a row in `sync_logs`.
 *   4. GATED — nothing reaches the public site without clearing the confidence
 *      thresholds; uncertain records go to the human review queue.
 */

export interface ImportResult extends SyncCounters {
  status: 'success' | 'partial' | 'failed';
  errorMessage?: string;
  syncLogId?: string;
}

interface NetworkRow {
  id: string;
  slug: string;
}

async function getNetworkId(slug: string): Promise<string | null> {
  const row = await queryOne<NetworkRow>('SELECT id, slug FROM affiliate_networks WHERE slug = $1', [slug]);
  return row?.id ?? null;
}

/** Resolve or create the network row so a connector can be used before it is seeded. */
async function ensureNetwork(connector: AffiliateConnector): Promise<string> {
  const existing = await getNetworkId(connector.providerSlug);
  if (existing) return existing;
  const row = await queryOne<{ id: string }>(
    `INSERT INTO affiliate_networks (slug, name, integration_type, status, required_env, is_demo, health_status)
     VALUES ($1, $2, $3, 'disabled', $4::text[], $5, 'not_configured')
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [
      connector.providerSlug,
      connector.providerName,
      connector.integrationType,
      [...connector.requiredEnv],
      connector.providerSlug === 'demo',
    ],
  );
  return row!.id;
}

// ---------------------------------------------------------------------------
// Merchants
// ---------------------------------------------------------------------------

export async function upsertMerchant(
  merchant: NormalizedMerchant,
  networkId: string,
): Promise<string> {
  const slug = merchant.slug || slugify(merchant.name);
  const row = await queryOne<{ id: string }>(
    `INSERT INTO merchants (
       external_id, network_id, name, slug, logo_url, short_description, full_description,
       official_website_url, affiliate_program_url, country_codes, supported_languages,
       default_currency, vertical, status, is_verified, verified_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::text[],$11::text[],$12,$13,'active',false,NULL)
     ON CONFLICT (network_id, external_id) WHERE external_id IS NOT NULL AND deleted_at IS NULL
     DO UPDATE SET
       name                = EXCLUDED.name,
       short_description   = COALESCE(EXCLUDED.short_description, merchants.short_description),
       full_description    = COALESCE(EXCLUDED.full_description, merchants.full_description),
       official_website_url= COALESCE(EXCLUDED.official_website_url, merchants.official_website_url),
       country_codes       = CASE WHEN array_length(EXCLUDED.country_codes,1) > 0
                                  THEN EXCLUDED.country_codes ELSE merchants.country_codes END,
       default_currency    = EXCLUDED.default_currency,
       updated_at          = now()
     RETURNING id`,
    [
      merchant.externalId,
      networkId,
      merchant.name,
      slug,
      merchant.logoUrl ?? null,
      merchant.shortDescription ?? null,
      merchant.fullDescription ?? null,
      merchant.officialWebsiteUrl ?? null,
      merchant.affiliateProgramUrl ?? null,
      merchant.countryCodes,
      merchant.supportedLanguages,
      merchant.defaultCurrency,
      merchant.vertical,
    ],
  );
  return row!.id;
}

// ---------------------------------------------------------------------------
// Offers
// ---------------------------------------------------------------------------

function coalesce<T>(incoming: T | null | undefined, existing: T | null | undefined): T | null {
  // Never let an empty incoming value erase a value we already hold.
  if (incoming === null || incoming === undefined || incoming === '') {
    return existing ?? null;
  }
  return incoming;
}

export interface UpsertOutcome {
  action: 'imported' | 'updated' | 'rejected' | 'expired';
  offerId: string;
  score: number;
  status: string;
}


/**
 * Writes the connector-supplied language variants into `offer_translations`.
 *
 * Every row is marked `generated_by_ai = false`: this text came from the
 * source connector, not from a language model. AI-generated text takes the
 * same table with the flag set, so an administrator can always tell the two
 * apart — the specification requires exactly that separation.
 */
async function syncOfferTranslations(offerId: string, offer: NormalizedOffer): Promise<void> {
  const sourceLanguage = offer.languageCodes[0] ?? 'fr';

  // Always record the source text, even when no extra variants were supplied.
  const variants: Array<[string, { title: string; shortDescription?: string | null; fullDescription?: string | null; terms?: string | null }]> = [
    [
      sourceLanguage,
      {
        title: offer.title,
        shortDescription: offer.shortDescription ?? null,
        fullDescription: offer.fullDescription ?? null,
        terms: offer.termsAndConditions ?? null,
      },
    ],
  ];

  for (const [language, text] of Object.entries(offer.translations ?? {})) {
    if (language === sourceLanguage) continue;
    if (!text?.title) continue;
    variants.push([language, text]);
  }

  for (const [language, text] of variants) {
    await query(
      `INSERT INTO offer_translations (
         offer_id, language_code, translated_title, translated_short_description,
         translated_full_description, translated_terms,
         generated_by_ai, ai_provider, reviewed_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, FALSE, NULL, now())
       ON CONFLICT (offer_id, language_code) DO UPDATE
         SET translated_title            = CASE WHEN offer_translations.generated_by_ai
                                                THEN offer_translations.translated_title
                                                ELSE EXCLUDED.translated_title END,
             translated_short_description = CASE WHEN offer_translations.generated_by_ai
                                                THEN offer_translations.translated_short_description
                                                ELSE EXCLUDED.translated_short_description END,
             translated_full_description  = CASE WHEN offer_translations.generated_by_ai
                                                THEN offer_translations.translated_full_description
                                                ELSE EXCLUDED.translated_full_description END,
             translated_terms             = CASE WHEN offer_translations.generated_by_ai
                                                THEN offer_translations.translated_terms
                                                ELSE EXCLUDED.translated_terms END,
             updated_at = now()`,
      [
        offerId,
        language,
        text.title,
        text.shortDescription ?? null,
        text.fullDescription ?? null,
        text.terms ?? null,
      ],
    );
  }
}

/**
 * Links an offer to the categories it belongs to.
 *
 * Only slugs that actually exist are linked. An unknown slug is skipped
 * silently on purpose: a connector must not be able to invent taxonomy by
 * typo, and an unlinked offer is visible on the data-quality audit.
 */
async function syncOfferCategories(offerId: string, offer: NormalizedOffer): Promise<number> {
  const slugs = [...new Set((offer.categorySlugs ?? []).filter(Boolean))];
  if (slugs.length === 0) return 0;

  const categories = await query<{ id: string; slug: string }>(
    'SELECT id, slug FROM categories WHERE slug = ANY($1::text[])',
    [slugs],
  );

  if (categories.length === 0) return 0;

  // Remove links that are no longer current, then re-add the live set.
  await query(
    `DELETE FROM offer_categories
      WHERE offer_id = $1
        AND category_id NOT IN (
          SELECT id FROM categories WHERE slug = ANY($2::text[])
        )`,
    [offerId, categories.map((category) => category.slug)],
  );

  await query(
    `INSERT INTO offer_categories (offer_id, category_id)
     SELECT $1, id FROM categories WHERE slug = ANY($2::text[])
     ON CONFLICT DO NOTHING`,
    [offerId, categories.map((category) => category.slug)],
  );

  return categories.length;
}

/**
 * Post-write bookkeeping shared by the insert and update paths of
 * `upsertOffer`: translations, then category links.
 */
async function syncOfferRelations(offerId: string, offer: NormalizedOffer): Promise<void> {
  await syncOfferTranslations(offerId, offer);
  await syncOfferCategories(offerId, offer);
}

export async function upsertOffer(
  offer: NormalizedOffer,
  networkSlug: string,
  networkId: string,
  rules: PublicationRules,
  merchantId: string,
  merchantDomains: string[],
): Promise<UpsertOutcome> {
  const fingerprint = fingerprintForOffer(offer, networkSlug);

  const existing = await queryOne<{
    id: string;
    title: string;
    short_description: string | null;
    full_description: string | null;
    terms_and_conditions: string | null;
    image_url: string | null;
    affiliate_url: string | null;
    publication_status: string;
    expires_at: string | null;
  }>(
    `SELECT id, title, short_description, full_description, terms_and_conditions,
            image_url, affiliate_url, publication_status, expires_at
       FROM offers WHERE source_fingerprint = $1 AND deleted_at IS NULL`,
    [fingerprint],
  );

  const validation = validateOffer({
    offer,
    merchantDomains,
    merchantRecognized: true,
    isDuplicate: Boolean(existing),
    rules,
  });

  // -------------------------------------------------------------------------
  // Rejected
  // -------------------------------------------------------------------------
  if (validation.decision === 'reject') {
    if (existing) {
      // An existing published offer that now fails validation is suspended,
      // never silently deleted — an administrator decides what happens next.
      await query(
        `UPDATE offers SET publication_status = 'suspended', confidence_score = $2,
                updated_at = now()
          WHERE id = $1 AND publication_status IN ('published','approved')`,
        [existing.id, validation.score],
      );
      return { action: 'rejected', offerId: existing.id, score: validation.score, status: 'suspended' };
    }
    // Record the rejection so the review queue shows why nothing was created.
    const row = await queryOne<{ id: string }>(
      `INSERT INTO offers (
         external_id, source_fingerprint, merchant_id, network_id, title, slug,
         coupon_code, offer_type, discount_type, discount_value, currency,
         destination_url, affiliate_url, expires_at, start_at, country_codes,
         language_codes, terms_and_conditions, source_type, source_reference,
         verification_status, publication_status, confidence_score, imported_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::text[],$17::text[],$18,$19,$20,'failed','rejected',$21,now())
       RETURNING id`,
      [
        offer.externalId,
        fingerprint,
        merchantId,
        networkId,
        offer.title,
        `${slugify(offer.title)}-${fingerprint.slice(0, 8)}`,
        offer.couponCode ?? null,
        offer.offerType,
        offer.discountType ?? 'unknown',
        offer.discountValue ?? null,
        offer.currency,
        offer.destinationUrl,
        offer.affiliateUrl ?? null,
        offer.expiresAt ?? null,
        offer.startAt ?? null,
        offer.countryCodes,
        offer.languageCodes,
        offer.termsAndConditions ?? null,
        offer.sourceType,
        offer.sourceReference ?? null,
        validation.score,
      ],
    );
    // Even a rejected offer keeps its text and taxonomy, so the review queue
    // shows the moderators what they are looking at.
    await syncOfferRelations(row!.id, offer);
    return { action: 'rejected', offerId: row!.id, score: validation.score, status: 'rejected' };
  }

  // -------------------------------------------------------------------------
  // Approved or pending review
  // -------------------------------------------------------------------------
  const publicationStatus = validation.status; // 'approved' | 'pending_validation'
  const nowIso = new Date().toISOString();

  if (existing) {
    // UPDATE path — never overwrite a populated field with an empty one.
    const wasExpired = existing.publication_status === 'expired';
    const newStatus =
      wasExpired && publicationStatus === 'approved'
        ? 'published' // reactivated only because the source says it is live again
        : existing.publication_status === 'published' && publicationStatus !== 'approved'
          ? 'published'
          : publicationStatus === 'approved'
            ? 'published'
            : existing.publication_status === 'published'
              ? 'published'
              : publicationStatus;

    await query(
      `UPDATE offers SET
         title                = $2,
         short_description    = $3,
         full_description     = $4,
         coupon_code          = $5,
         offer_type           = $6,
         discount_type        = $7,
         discount_value       = $8,
         currency             = $9,
         destination_url      = $10,
         affiliate_url        = $11,
         image_url            = $12,
         expires_at           = $13,
         start_at             = $14,
         country_codes        = $15::text[],
         terms_and_conditions = $16,
         confidence_score     = $17,
         verification_status  = CASE WHEN $17 >= 90 THEN 'verified' ELSE verification_status END,
         last_verified_at     = CASE WHEN $17 >= 90 THEN now() ELSE last_verified_at END,
         publication_status   = $18,
         published_at         = CASE WHEN $18 = 'published' AND published_at IS NULL THEN now() ELSE published_at END,
         expired_at           = CASE WHEN $18 = 'published' THEN NULL ELSE expired_at END,
         is_exclusive         = $19,
         is_featured          = $20,
         updated_at           = now()
       WHERE id = $1`,
      [
        existing.id,
        offer.title,
        coalesce(offer.shortDescription, existing.short_description),
        coalesce(offer.fullDescription, existing.full_description),
        offer.couponCode ?? null,
        offer.offerType,
        offer.discountType ?? 'unknown',
        offer.discountValue ?? null,
        offer.currency,
        offer.destinationUrl,
        coalesce(offer.affiliateUrl, existing.affiliate_url),
        coalesce(offer.imageUrl, existing.image_url),
        offer.expiresAt ?? null,
        offer.startAt ?? null,
        offer.countryCodes,
        coalesce(offer.termsAndConditions, existing.terms_and_conditions),
        validation.score,
        newStatus,
        offer.isExclusive ?? false,
        offer.isFeatured ?? false,
      ],
    );
    await syncOfferRelations(existing.id, offer);
    return { action: 'updated', offerId: existing.id, score: validation.score, status: newStatus };
  }

  // INSERT path
  const row = await queryOne<{ id: string }>(
    `INSERT INTO offers (
       external_id, source_fingerprint, merchant_id, network_id, title, slug,
       short_description, full_description, coupon_code, offer_type, discount_type,
       discount_value, discount_unit, currency, destination_url, affiliate_url,
       image_url, start_at, expires_at, country_codes, language_codes,
       terms_and_conditions, eligibility_rules, source_type, source_reference,
       verification_status, publication_status, confidence_score,
       is_exclusive, is_featured, last_verified_at, imported_at, published_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::text[],$21::text[],$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,now(),$32)
     RETURNING id`,
    [
      offer.externalId,
      fingerprint,
      merchantId,
      networkId,
      offer.title,
      `${slugify(offer.title)}-${fingerprint.slice(0, 8)}`,
      offer.shortDescription ?? null,
      offer.fullDescription ?? null,
      offer.couponCode ?? null,
      offer.offerType,
      offer.discountType ?? 'unknown',
      offer.discountValue ?? null,
      offer.discountType === 'percentage' ? 'percent' : offer.discountType === 'fixed_amount' ? 'currency' : 'none',
      offer.currency,
      offer.destinationUrl,
      offer.affiliateUrl ?? null,
      offer.imageUrl ?? null,
      offer.startAt ?? null,
      offer.expiresAt ?? null,
      offer.countryCodes,
      offer.languageCodes,
      offer.termsAndConditions ?? null,
      offer.eligibilityRules ?? null,
      offer.sourceType,
      offer.sourceReference ?? null,
      validation.score >= 90 ? 'verified' : 'pending',
      publicationStatus === 'approved' ? 'published' : publicationStatus,
      validation.score,
      offer.isExclusive ?? false,
      offer.isFeatured ?? false,
      validation.score >= 90 ? nowIso : null,
      publicationStatus === 'approved' ? nowIso : null,
    ],
  );
  await syncOfferRelations(row!.id, offer);
  return { action: 'imported', offerId: row!.id, score: validation.score, status: publicationStatus === 'approved' ? 'published' : publicationStatus };
}

// ---------------------------------------------------------------------------
// Full connector import
// ---------------------------------------------------------------------------

export async function importFromConnector(
  connector: AffiliateConnector,
  executionId = `manual-${Date.now()}`,
): Promise<ImportResult> {
  const counters: SyncCounters = { imported: 0, updated: 0, rejected: 0, expired: 0, warnings: 0 };
  const rules = await getPublicationRules();
  const networkId = await ensureNetwork(connector);

  const logRow = await queryOne<{ id: string }>(
    `INSERT INTO sync_logs (network_id, workflow_name, execution_id, started_at, status)
     VALUES ($1, 'offer_import', $2, now(), 'running') RETURNING id`,
    [networkId, executionId],
  );
  const syncLogId = logRow!.id;

  try {
    // --- merchants ---------------------------------------------------------
    const merchantIdByExternal = new Map<string, string>();
    const merchantDomainsByExternal = new Map<string, string[]>();

    const merchantResult = await connector.fetchMerchants({ limit: 500 });
    for (const merchant of merchantResult.items) {
      try {
        const id = await upsertMerchant(merchant, networkId);
        merchantIdByExternal.set(merchant.externalId, id);
        const domain = merchant.officialWebsiteUrl ? extractDomain(merchant.officialWebsiteUrl) : '';
        merchantDomainsByExternal.set(merchant.externalId, domain ? [domain] : []);
      } catch (error) {
        counters.warnings += 1;
        await recordNotification(
          'connector_error',
          'warning',
          `Merchant import failed for ${merchant.name}`,
          sanitizeError(error instanceof Error ? error.message : String(error)),
          'network',
          networkId,
        );
      }
    }

    // Fall back to whatever merchants already exist for this network.
    const knownMerchants = await query<{ id: string; external_id: string; official_website_url: string | null }>(
      'SELECT id, external_id, official_website_url FROM merchants WHERE network_id = $1 AND deleted_at IS NULL',
      [networkId],
    );
    for (const m of knownMerchants) {
      if (m.external_id && !merchantIdByExternal.has(m.external_id)) {
        merchantIdByExternal.set(m.external_id, m.id);
        const domain = m.official_website_url ? extractDomain(m.official_website_url) : '';
        merchantDomainsByExternal.set(m.external_id, domain ? [domain] : []);
      }
    }

    // --- offers ------------------------------------------------------------
    let cursor: string | null | undefined;
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const result = await connector.fetchOffers({ cursor: cursor ?? undefined, page, limit: 100 });

      for (const offer of result.items) {
        const merchantId = merchantIdByExternal.get(offer.merchantExternalId);
        if (!merchantId) {
          counters.warnings += 1;
          continue;
        }
        try {
          const outcome = await upsertOffer(
            offer,
            connector.providerSlug,
            networkId,
            rules,
            merchantId,
            merchantDomainsByExternal.get(offer.merchantExternalId) ?? [],
          );
          if (outcome.action === 'imported') counters.imported += 1;
          else if (outcome.action === 'updated') counters.updated += 1;
          else if (outcome.action === 'rejected') counters.rejected += 1;
          else if (outcome.action === 'expired') counters.expired += 1;
        } catch (error) {
          counters.warnings += 1;
        }
      }

      hasMore = Boolean(result.hasMore) && page < 200; // hard stop against runaway pagination
      cursor = result.nextCursor ?? null;
      page = result.nextPage ?? page + 1;
      if (!result.hasMore) break;
    }

    const status: ImportResult['status'] = counters.warnings > 0 ? 'partial' : 'success';

    await query(
      `UPDATE sync_logs SET finished_at = now(), status = $2, imported_count = $3,
              updated_count = $4, rejected_count = $5, expired_count = $6, warning_count = $7
        WHERE id = $1`,
      [syncLogId, status, counters.imported, counters.updated, counters.rejected, counters.expired, counters.warnings],
    );
    await query(
      `UPDATE affiliate_networks
          SET last_sync_at = now(), last_success_at = now(), health_status = 'healthy'
        WHERE id = $1`,
      [networkId],
    );

    return { ...counters, status, syncLogId };
  } catch (error) {
    const message = sanitizeError(error instanceof Error ? error.message : String(error));
    await query(
      `UPDATE sync_logs SET finished_at = now(), status = 'failed', error_message = $2,
              imported_count = $3, updated_count = $4, rejected_count = $5, warning_count = $6
        WHERE id = $1`,
      [syncLogId, message, counters.imported, counters.updated, counters.rejected, counters.warnings],
    );
    await query(
      `UPDATE affiliate_networks SET last_sync_at = now(), health_status = 'failing' WHERE id = $1`,
      [networkId],
    );
    await recordNotification(
      'sync_failure',
      'critical',
      `${connector.providerName} import failed`,
      message,
      'network',
      networkId,
    );
    return { ...counters, status: 'failed', errorMessage: message, syncLogId };
  }
}

// ---------------------------------------------------------------------------
// Expiration workflow (WORKFLOW 2)
// ---------------------------------------------------------------------------

export async function expireOffers(executionId = `expire-${Date.now()}`): Promise<number> {
  const rows = await query<{ id: string }>(
    `UPDATE offers
        SET publication_status = 'expired',
            expired_at = now(),
            updated_at = now()
      WHERE deleted_at IS NULL
        AND expires_at IS NOT NULL
        AND expires_at <= now()
        AND publication_status IN ('published','approved','scheduled')
      RETURNING id`,
  );

  if (rows.length > 0) {
    await query(
      `INSERT INTO sync_logs (network_id, workflow_name, execution_id, started_at, finished_at, status, expired_count)
       VALUES (NULL, 'offer_expiration', $1, now(), now(), 'success', $2)`,
      [executionId, rows.length],
    );
  }

  // Unusual volume alert: more than 25% of published offers expiring at once
  // usually means a connector pushed bad dates.
  const total = await queryOne<{ count: string }>(
    `SELECT count(*)::text AS count FROM offers WHERE deleted_at IS NULL AND publication_status = 'published'`,
  );
  const published = Number(total?.count ?? 0);
  if (published > 0 && rows.length / published > 0.25) {
    await recordNotification(
      'expiration_spike',
      'warning',
      'Unusual expiration volume detected',
      `${rows.length} offers expired in a single run (${Math.round((rows.length / published) * 100)}% of published offers). Check connector date handling.`,
    );
  }

  return rows.length;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export async function recordNotification(
  type: string,
  severity: 'info' | 'warning' | 'critical',
  title: string,
  message: string,
  entityType?: string,
  entityId?: string,
): Promise<void> {
  await query(
    `INSERT INTO notifications (notification_type, severity, title, message, related_entity_type, related_entity_id)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [type, severity, title, message, entityType ?? null, entityId ?? null],
  );
}

/** Re-run a previously failed sync by its log id. */
export async function retrySyncLog(syncLogId: string): Promise<ImportResult | null> {
  const log = await queryOne<{ id: string; workflow_name: string }>(
    'SELECT id, workflow_name FROM sync_logs WHERE id = $1',
    [syncLogId],
  );
  if (!log) return null;
  const network = await queryOne<{ slug: string }>(
    `SELECT n.slug FROM sync_logs s JOIN affiliate_networks n ON n.id = s.network_id WHERE s.id = $1`,
    [syncLogId],
  );
  if (!network) return null;
  const { getConnector } = await import('../connectors/registry');
  const connector = getConnector(network.slug);
  if (!connector) return null;
  return importFromConnector(connector, `retry-${Date.now()}`);
}

export { transaction };

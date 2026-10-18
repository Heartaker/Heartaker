import { query, queryOne } from '../db';

/**
 * Read models for the administration dashboard.
 *
 * Every function here is permission-checked by the caller (the admin layout
 * enforces authentication and staff status; each page checks the specific
 * permission before rendering actions).
 */

export interface AdminOfferRow {
  id: string;
  title: string;
  slug: string;
  merchant_name: string;
  offer_type: string;
  coupon_code: string | null;
  publication_status: string;
  verification_status: string;
  confidence_score: number;
  expires_at: string | null;
  last_verified_at: string | null;
  source_type: string;
  created_at: string;
}

export async function adminListOffers(options: {
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{ rows: AdminOfferRow[]; total: number }> {
  const limit = Math.min(200, options.limit ?? 50);
  const offset = options.offset ?? 0;

  const rows = await query<AdminOfferRow>(
    `SELECT o.id, o.title, o.slug, o.offer_type, o.coupon_code,
            o.publication_status, o.verification_status, o.confidence_score,
            o.expires_at, o.last_verified_at, o.source_type, o.created_at,
            m.name AS merchant_name
       FROM offers o
       JOIN merchants m ON m.id = o.merchant_id
      WHERE o.deleted_at IS NULL
        AND ($1::text IS NULL OR o.publication_status = $1)
        AND ($2::text IS NULL OR o.title ILIKE '%' || $2 || '%'
                              OR m.name ILIKE '%' || $2 || '%'
                              OR o.coupon_code ILIKE '%' || $2 || '%')
      ORDER BY
        CASE o.publication_status
          WHEN 'pending_validation' THEN 0
          WHEN 'imported' THEN 1
          WHEN 'suspended' THEN 2
          WHEN 'published' THEN 3
          WHEN 'expired' THEN 4
          WHEN 'rejected' THEN 5
          ELSE 6
        END,
        o.created_at DESC
      LIMIT $3 OFFSET $4`,
    [options.status ?? null, options.search ?? null, limit, offset],
  );

  const total = await queryOne<{ n: string }>(
    `SELECT count(*)::text AS n FROM offers o JOIN merchants m ON m.id = o.merchant_id
      WHERE o.deleted_at IS NULL
        AND ($1::text IS NULL OR o.publication_status = $1)
        AND ($2::text IS NULL OR o.title ILIKE '%' || $2 || '%'
                              OR m.name ILIKE '%' || $2 || '%'
                              OR o.coupon_code ILIKE '%' || $2 || '%')`,
    [options.status ?? null, options.search ?? null],
  );

  return { rows, total: Number(total?.n ?? 0) };
}

export interface DashboardStats {
  activeOffers: number;
  pendingReview: number;
  expiringSoon: number;
  expired: number;
  rejected: number;
  activeConnectors: number;
  failedSyncs: number;
  brokenLinks: number;
  reportedCoupons: number;
  clicksToday: number;
  clicks7d: number;
  conversions: number;
  commission: number;
  subscribers: number;
  confirmedSubscribers: number;
  merchants: number;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const row = await queryOne<Record<string, string>>(
    `SELECT
      (SELECT count(*)::text FROM offers WHERE deleted_at IS NULL
         AND publication_status = 'published'
         AND (expires_at IS NULL OR expires_at > now()))                        AS "activeOffers",
      (SELECT count(*)::text FROM offers WHERE deleted_at IS NULL
         AND publication_status = 'pending_validation')                         AS "pendingReview",
      (SELECT count(*)::text FROM offers WHERE deleted_at IS NULL
         AND publication_status = 'published'
         AND expires_at IS NOT NULL
         AND expires_at BETWEEN now() AND now() + interval '7 days')            AS "expiringSoon",
      (SELECT count(*)::text FROM offers WHERE deleted_at IS NULL
         AND publication_status = 'expired')                                    AS expired,
      (SELECT count(*)::text FROM offers WHERE deleted_at IS NULL
         AND publication_status = 'rejected')                                   AS rejected,
      (SELECT count(*)::text FROM affiliate_networks WHERE status = 'enabled')  AS "activeConnectors",
      (SELECT count(*)::text FROM sync_logs WHERE status = 'failed'
         AND started_at > now() - interval '24 hours')                          AS "failedSyncs",
      (SELECT count(DISTINCT offer_id)::text FROM link_checks
         WHERE outcome IN ('client_error','server_error','dns_error')
           AND checked_at > now() - interval '7 days')                          AS "brokenLinks",
      (SELECT count(*)::text FROM coupon_reports WHERE status = 'open')         AS "reportedCoupons",
      (SELECT count(*)::text FROM clicks WHERE clicked_at >= date_trunc('day', now())) AS "clicksToday",
      (SELECT count(*)::text FROM clicks WHERE clicked_at >= now() - interval '7 days') AS "clicks7d",
      (SELECT count(*)::text FROM conversions)                                  AS conversions,
      (SELECT coalesce(sum(commission_amount),0)::text FROM conversions
         WHERE conversion_status = 'approved')                                  AS commission,
      (SELECT count(*)::text FROM newsletter_subscribers)                       AS subscribers,
      (SELECT count(*)::text FROM newsletter_subscribers
         WHERE consent_status = 'confirmed')                                    AS "confirmedSubscribers",
      (SELECT count(*)::text FROM merchants WHERE deleted_at IS NULL)           AS merchants`,
  );

  const num = (key: string) => Number(row?.[key] ?? 0);
  return {
    activeOffers: num('activeOffers'),
    pendingReview: num('pendingReview'),
    expiringSoon: num('expiringSoon'),
    expired: num('expired'),
    rejected: num('rejected'),
    activeConnectors: num('activeConnectors'),
    failedSyncs: num('failedSyncs'),
    brokenLinks: num('brokenLinks'),
    reportedCoupons: num('reportedCoupons'),
    clicksToday: num('clicksToday'),
    clicks7d: num('clicks7d'),
    conversions: num('conversions'),
    commission: num('commission'),
    subscribers: num('subscribers'),
    confirmedSubscribers: num('confirmedSubscribers'),
    merchants: num('merchants'),
  };
}

export interface ConnectorRow {
  id: string;
  slug: string;
  name: string;
  integration_type: string;
  status: string;
  health_status: string;
  synchronization_frequency: string;
  last_sync_at: string | null;
  last_success_at: string | null;
  required_env: string[];
  compliance_notes: string | null;
  is_demo: boolean;
}

export async function adminListConnectors(): Promise<ConnectorRow[]> {
  return query<ConnectorRow>(
    `SELECT id, slug, name, integration_type, status, health_status,
            synchronization_frequency, last_sync_at, last_success_at,
            required_env, compliance_notes, is_demo
       FROM affiliate_networks
      ORDER BY is_demo DESC, name`,
  );
}

export interface SyncLogRow {
  id: string;
  workflow_name: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  imported_count: number;
  updated_count: number;
  rejected_count: number;
  expired_count: number;
  warning_count: number;
  error_message: string | null;
  network_slug: string | null;
}

export async function adminListSyncLogs(limit = 50): Promise<SyncLogRow[]> {
  return query<SyncLogRow>(
    `SELECT s.id, s.workflow_name, s.status, s.started_at, s.finished_at,
            s.imported_count, s.updated_count, s.rejected_count,
            s.expired_count, s.warning_count, s.error_message,
            n.slug AS network_slug
       FROM sync_logs s
       LEFT JOIN affiliate_networks n ON n.id = s.network_id
      ORDER BY s.started_at DESC
      LIMIT $1`,
    [limit],
  );
}

export interface AuditRow {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  actor_email: string | null;
  created_at: string;
}

export async function adminListAudit(limit = 100): Promise<AuditRow[]> {
  return query<AuditRow>(
    `SELECT id, action, entity_type, entity_id, actor_email, created_at
       FROM audit_logs ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
}

export interface SubscriberRow {
  id: string;
  email: string;
  language_code: string;
  country_code: string;
  delivery_frequency: string;
  consent_status: string;
  confirmed_at: string | null;
  unsubscribed_at: string | null;
  created_at: string;
}

export async function adminListSubscribers(limit = 200): Promise<SubscriberRow[]> {
  return query<SubscriberRow>(
    `SELECT id, email, language_code, country_code, delivery_frequency,
            consent_status, confirmed_at, unsubscribed_at, created_at
       FROM newsletter_subscribers ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
}

export interface ReportRow {
  id: string;
  reason: string;
  comment: string | null;
  status: string;
  created_at: string;
  offer_title: string;
}

export async function adminListReports(limit = 100): Promise<ReportRow[]> {
  return query<ReportRow>(
    `SELECT r.id, r.reason, r.comment, r.status, r.created_at, o.title AS offer_title
       FROM coupon_reports r JOIN offers o ON o.id = r.offer_id
      ORDER BY r.created_at DESC LIMIT $1`,
    [limit],
  );
}

/** Write an audit entry. Audit rows are never updated or deleted. */
export async function writeAudit(input: {
  userId: string | null;
  actorEmail?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  previous?: unknown;
  next?: unknown;
}): Promise<void> {
  await query(
    `INSERT INTO audit_logs (user_id, actor_email, action, entity_type, entity_id, previous_value, new_value)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)`,
    [
      input.userId,
      input.actorEmail ?? null,
      input.action,
      input.entityType,
      input.entityId ?? null,
      input.previous === undefined ? null : JSON.stringify(input.previous),
      input.next === undefined ? null : JSON.stringify(input.next),
    ],
  );
}

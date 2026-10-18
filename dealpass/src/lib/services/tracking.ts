import { randomBytes } from 'node:crypto';
import { query, queryOne } from '../db/index';
import { privacyHash } from '../normalize';
import type { ClickEventType } from '../types';

/**
 * Affiliate click tracking.
 *
 * Privacy rules enforced here:
 *   • No raw IP address is ever written to the database. If an identifier is
 *     needed for fraud prevention we store a salted, day-rotating hash.
 *   • The `sub_id` handed to the affiliate network is opaque. It contains no
 *     email, no name and no other personal data.
 *   • Visitors are not required to be logged in, so no account is linked to a
 *     click unless the visitor has explicitly signed in.
 */

function salt(): string {
  return process.env.DATA_ENCRYPTION_KEY || 'dealpass-default-salt-change-me';
}

/** Opaque, non-personal tracking identifier handed to the affiliate network. */
export function generateSubId(offerId: string): string {
  return `${offerId.replace(/-/g, '').slice(0, 12)}-${randomBytes(6).toString('hex')}`;
}

export interface ClickContext {
  offerId: string;
  merchantId: string;
  eventType: ClickEventType;
  sessionId?: string | null;
  country?: string | null;
  language?: string | null;
  deviceType?: string | null;
  referrer?: string | null;
  campaign?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export function detectDeviceType(userAgent: string | null | undefined): 'mobile' | 'tablet' | 'desktop' | 'bot' | 'unknown' {
  if (!userAgent) return 'unknown';
  const ua = userAgent.toLowerCase();
  if (/(bot|crawler|spider|curl|wget|headless)/.test(ua)) return 'bot';
  if (/(tablet|ipad|playbook|silk)/.test(ua)) return 'tablet';
  if (/mobile|android|iphone|ipod|windows phone/.test(ua)) return 'mobile';
  return 'desktop';
}

export async function recordClick(ctx: ClickContext): Promise<string> {
  const subId = generateSubId(ctx.offerId);
  const sessionHash = privacyHash(ctx.sessionId ?? `${ctx.offerId}-${Date.now()}`, salt());

  await query(
    `INSERT INTO clicks (offer_id, merchant_id, session_hash, event_type, country_code,
                         language_code, device_type, referrer, campaign, sub_id, ip_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      ctx.offerId,
      ctx.merchantId,
      sessionHash,
      ctx.eventType,
      ctx.country ?? null,
      ctx.language ?? null,
      ctx.deviceType ?? 'unknown',
      ctx.referrer?.slice(0, 500) ?? null,
      ctx.campaign ?? null,
      subId,
      // Only a salted, day-rotating digest — never the address itself.
      ctx.ip ? privacyHash(ctx.ip, salt(), true) : null,
    ],
  );

  return subId;
}

export interface RedirectTarget {
  url: string;
  offerId: string;
  merchantId: string;
}

/**
 * Resolve where an offer should send the visitor, recording the click.
 * Falls back to the plain destination when no affiliate URL exists — a visitor
 * is never blocked just because tracking is incomplete.
 */
export async function resolveOutboundUrl(
  offerId: string,
  context: Omit<ClickContext, 'offerId' | 'merchantId' | 'eventType'>,
): Promise<string | null> {
  const offer = await queryOne<{
    id: string;
    merchant_id: string;
    affiliate_url: string | null;
    destination_url: string;
    publication_status: string;
    expires_at: string | null;
  }>(
    `SELECT id, merchant_id, affiliate_url, destination_url, publication_status, expires_at
       FROM offers WHERE id = $1 AND deleted_at IS NULL`,
    [offerId],
  );

  if (!offer) return null;
  // Never send a visitor to an offer that is not legitimately live.
  if (!['published', 'approved'].includes(offer.publication_status)) return null;
  if (offer.expires_at && new Date(offer.expires_at) <= new Date()) return null;

  const subId = await recordClick({
    offerId: offer.id,
    merchantId: offer.merchant_id,
    eventType: 'click',
    ...context,
  });

  const base = offer.affiliate_url || offer.destination_url;
  try {
    const url = new URL(base);
    url.searchParams.set('utm_source', 'dealpass');
    url.searchParams.set('utm_medium', 'affiliate');
    url.searchParams.set('subid', subId);
    return url.toString();
  } catch {
    return base;
  }
}

/** Record a code reveal/copy that is not yet an outbound click. */
export async function recordCodeCopy(
  offerId: string,
  context: Omit<ClickContext, 'offerId' | 'merchantId' | 'eventType'>,
): Promise<void> {
  const offer = await queryOne<{ merchant_id: string }>(
    'SELECT merchant_id FROM offers WHERE id = $1',
    [offerId],
  );
  if (!offer) return;
  await recordClick({
    offerId,
    merchantId: offer.merchant_id,
    eventType: 'code_copy',
    ...context,
  });
}

// ---------------------------------------------------------------------------
// Analytics aggregates (administration dashboard)
// ---------------------------------------------------------------------------

export interface AnalyticsOverview {
  clicksToday: number;
  clicks7d: number;
  copies7d: number;
  topOffers: Array<{ title: string; clicks: number }>;
  topMerchants: Array<{ name: string; clicks: number }>;
  clicksByCountry: Array<{ country: string; clicks: number }>;
  conversions: { count: number; commission: number; currency: string };
}

export async function getAnalyticsOverview(): Promise<AnalyticsOverview> {
  const today = await queryOne<{ n: string }>(
    `SELECT count(*)::text AS n FROM clicks WHERE clicked_at >= date_trunc('day', now())`,
  );
  const week = await queryOne<{ n: string }>(
    `SELECT count(*)::text AS n FROM clicks WHERE clicked_at >= now() - interval '7 days'`,
  );
  const copies = await queryOne<{ n: string }>(
    `SELECT count(*)::text AS n FROM clicks WHERE event_type IN ('code_copy','code_reveal')
       AND clicked_at >= now() - interval '7 days'`,
  );
  const topOffers = await query<{ title: string; clicks: number }>(
    `SELECT o.title, count(*)::int AS clicks
       FROM clicks c JOIN offers o ON o.id = c.offer_id
      WHERE c.clicked_at >= now() - interval '30 days'
      GROUP BY o.title ORDER BY clicks DESC LIMIT 10`,
  );
  const topMerchants = await query<{ name: string; clicks: number }>(
    `SELECT m.name, count(*)::int AS clicks
       FROM clicks c JOIN merchants m ON m.id = c.merchant_id
      WHERE c.clicked_at >= now() - interval '30 days'
      GROUP BY m.name ORDER BY clicks DESC LIMIT 10`,
  );
  const byCountry = await query<{ country: string; clicks: number }>(
    `SELECT coalesce(country_code, '—') AS country, count(*)::int AS clicks
       FROM clicks WHERE clicked_at >= now() - interval '30 days'
      GROUP BY 1 ORDER BY clicks DESC LIMIT 10`,
  );
  const conv = await queryOne<{ n: string; commission: string | null; currency: string }>(
    `SELECT count(*)::text AS n, sum(commission_amount)::text AS commission,
            coalesce(min(currency), 'EUR') AS currency
       FROM conversions WHERE conversion_status = 'approved'`,
  );

  return {
    clicksToday: Number(today?.n ?? 0),
    clicks7d: Number(week?.n ?? 0),
    copies7d: Number(copies?.n ?? 0),
    topOffers,
    topMerchants,
    clicksByCountry: byCountry,
    conversions: {
      count: Number(conv?.n ?? 0),
      commission: Number(conv?.commission ?? 0),
      currency: conv?.currency ?? 'EUR',
    },
  };
}

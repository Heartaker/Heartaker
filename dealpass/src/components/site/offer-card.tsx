'use client';

import { useCallback, useId, useState } from 'react';
import Link from 'next/link';
import { Check, Copy, Flag, Heart, Tag, Ticket } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { cn } from '@/lib/cn';
import type { Locale, PublicOffer } from '@/lib/types';

interface OfferCardProps {
  offer: PublicOffer;
  locale: Locale;
  initialFavorite?: boolean;
  onToggleFavorite?: (offerId: string) => void;
  compact?: boolean;
}

function formatDate(iso: string | null, locale: Locale): string {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA' : locale === 'fr' ? 'fr-FR' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

function discountLabel(offer: PublicOffer, t: ReturnType<typeof getDictionary>): string | null {
  if (offer.discount_value === null) return null;
  if (offer.discount_type === 'percentage') {
    const pct = Number(offer.discount_value);
    const rounded = Number.isInteger(pct) ? pct : pct.toFixed(1);
    return localePercent(rounded, offer.offer_type === 'cashback' ? t.offer.cashback : null);
  }
  if (offer.discount_type === 'fixed_amount') {
    return `${offer.discount_value} ${offer.currency}`;
  }
  return null;
}

function localePercent(value: number | string, prefix: string | null): string {
  const base = `-${value}%`;
  return prefix ? `${prefix} ${base}` : base;
}

export function OfferCard({
  offer,
  locale,
  initialFavorite = false,
  onToggleFavorite,
  compact = false,
}: OfferCardProps) {
  const t = getDictionary(locale);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [favorite, setFavorite] = useState(initialFavorite);
  const [reported, setReported] = useState(false);
  const messageId = useId();

  const isExpired =
    offer.expires_at !== null && new Date(offer.expires_at).getTime() <= Date.now();
  const hasCode = Boolean(offer.coupon_code && offer.coupon_code.trim().length > 0);
  const discount = discountLabel(offer, t);
  const verified = offer.verification_status === 'verified' && !isExpired;
  const isDemo = offer.merchant_logo === null && offer.image_url === null && false; // reserved

  const copyCode = useCallback(async () => {
    const code = offer.coupon_code ?? '';
    if (!code) return;
    setRevealed(true);
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard is unavailable (insecure context, denied permission).
      // The code is still revealed so it can be selected manually.
      setCopied(false);
    }
    // Anonymous, privacy-preserving event — no personal data is sent.
    void fetch('/api/track', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ offerId: offer.id, eventType: 'code_copy' }),
      keepalive: true,
    }).catch(() => undefined);
  }, [offer.coupon_code, offer.id]);

  const toggleFavorite = useCallback(() => {
    setFavorite((current) => !current);
    onToggleFavorite?.(offer.id);
    void fetch('/api/favorites', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ offerId: offer.id }),
      keepalive: true,
    }).catch(() => undefined);
  }, [offer.id, onToggleFavorite]);

  const report = useCallback(() => {
    void fetch('/api/reports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ offerId: offer.id, reason: 'code_not_working' }),
      keepalive: true,
    }).catch(() => undefined);
    setReported(true);
  }, [offer.id]);

  return (
    <article
      className={cn(
        'group relative flex flex-col gap-3 rounded-card border border-line bg-surface p-4',
        'transition-shadow hover:shadow-md focus-within:shadow-md',
        isExpired && 'opacity-75',
      )}
      aria-labelledby={`offer-title-${offer.id}`}
    >
      {/* header: merchant + badges */}
      <div className="flex items-start justify-between gap-3">
        <Link
          href={`/${locale}/stores/${offer.merchant_slug}`}
          className="flex min-w-0 items-center gap-2"
        >
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-sm font-bold text-brand-700 dark:bg-brand-950 dark:text-brand-200"
          >
            {offer.merchant_name.slice(0, 2).toUpperCase()}
          </span>
          <span className="truncate text-sm font-medium text-ink hover:underline">
            {offer.merchant_name}
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-1">
          {offer.is_exclusive ? <Badge tone="accent">{t.offer.exclusive}</Badge> : null}
          {verified ? (
            <Badge tone="success">
              <Check className="h-3 w-3" aria-hidden="true" />
              {t.offer.verified}
            </Badge>
          ) : null}
        </div>
      </div>

      {/* title + discount */}
      <div className="flex items-start gap-3">
        {discount ? (
          <span
            className="shrink-0 rounded-lg bg-accent-500/10 px-2.5 py-1 text-base font-bold text-accent-600"
            aria-label={`${discount}`}
          >
            {discount}
          </span>
        ) : null}
        <h3 id={`offer-title-${offer.id}`} className="text-sm font-semibold leading-snug text-ink">
          <Link href={`/${locale}/offers/${offer.slug}`} className="hover:underline">
            {offer.title}
          </Link>
        </h3>
      </div>

      {!compact && offer.short_description ? (
        <p className="line-clamp-2 text-xs text-ink-muted">{offer.short_description}</p>
      ) : null}

      {/* code / no-code area */}
      {isExpired ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-center text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-200">
          {t.offer.expired}
        </p>
      ) : hasCode ? (
        <div className="mt-auto">
          <button
            type="button"
            onClick={copyCode}
            className={cn(
              'flex w-full items-center justify-between gap-2 rounded-lg border-2 border-dashed px-3 py-2.5',
              'transition-colors',
              revealed
                ? 'border-brand-500 bg-brand-50 dark:bg-brand-950'
                : 'border-line bg-surface-alt hover:border-brand-400',
            )}
            aria-describedby={messageId}
          >
            <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
              {hasCode ? <Ticket className="h-3.5 w-3.5" aria-hidden="true" /> : null}
              {revealed ? t.offer.codeRevealed : t.offer.showCode}
            </span>
            <span
              className={cn(
                'font-mono text-sm font-bold tracking-wider',
                revealed ? 'text-brand-800 dark:text-brand-200' : 'text-ink',
              )}
            >
              {revealed ? offer.coupon_code : '••••••••'}
            </span>
            <span className="sr-only">{t.offer.revealAndCopy}</span>
          </button>
        </div>
      ) : (
        <p className="mt-auto flex items-center gap-2 rounded-lg bg-surface-alt px-3 py-2.5 text-xs font-medium text-ink-muted">
          <Tag className="h-3.5 w-3.5" aria-hidden="true" />
          {t.offer.autoApplied}
        </p>
      )}

      {/* actions */}
      <div className="flex items-center gap-2">
        {isExpired ? null : (
          <a
            href={`/go/${offer.id}`}
            target="_blank"
            rel="nofollow sponsored noopener"
            className="btn-primary btn-sm flex-1"
          >
            {hasCode ? t.offer.getDeal : t.offer.getDeal}
            <span className="sr-only">{t.offer.opensNewTab}</span>
          </a>
        )}

        <button
          type="button"
          onClick={toggleFavorite}
          aria-pressed={favorite}
          aria-label={favorite ? t.offer.saved : t.offer.save}
          className={cn(
            'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line transition-colors',
            favorite
              ? 'border-red-300 bg-red-50 text-red-600'
              : 'text-ink-muted hover:bg-surface-alt hover:text-ink',
          )}
        >
          <Heart className={cn('h-4 w-4', favorite && 'fill-current')} aria-hidden="true" />
        </button>

        {reported ? (
          <span className="inline-flex h-8 items-center px-2 text-xs text-emerald-600">
            <Check className="h-4 w-4" aria-hidden="true" />
          </span>
        ) : (
          <button
            type="button"
            onClick={report}
            aria-label={t.offer.report}
            title={t.offer.report}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line text-ink-muted transition-colors hover:bg-surface-alt hover:text-ink"
          >
            <Flag className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* meta */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-muted">
        {offer.expires_at ? (
          <span>
            {t.offer.expiresOn} {formatDate(offer.expires_at, locale)}
          </span>
        ) : null}
        {offer.last_verified_at ? (
          <span>
            {t.offer.lastVerified} {formatDate(offer.last_verified_at, locale)}
          </span>
        ) : null}
        {offer.country_codes.length > 0 ? (
          <span className="truncate">
            {t.offer.validIn} {offer.country_codes.slice(0, 4).join(', ')}
            {offer.country_codes.length > 4 ? ` +${offer.country_codes.length - 4}` : ''}
          </span>
        ) : null}
      </div>

      {/* Accessible status message for the copy action — WCAG 4.1.3 */}
      <div id={messageId} role="status" aria-live="polite" className="sr-only">
        {copied ? t.offer.codeCopied : ''}
      </div>
      {copied ? (
        <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          {t.offer.codeCopied}
        </p>
      ) : null}
    </article>
  );
}

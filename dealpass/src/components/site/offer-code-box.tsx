'use client';

import { useCallback, useId, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { cn } from '@/lib/cn';
import type { Locale } from '@/lib/types';

/**
 * Reveal + copy control for the offer detail page.
 *
 * Behaviour per the specification: reveal the code, copy it, announce success
 * accessibly, record an anonymous copy event, and never present expiry as a
 * fake countdown.
 */
export function OfferCodeBox({
  code,
  offerId,
  locale,
}: {
  code: string;
  offerId: string;
  locale: Locale;
}) {
  const t = getDictionary(locale);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const statusId = useId();

  const revealAndCopy = useCallback(async () => {
    setRevealed(true);
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 3000);
    } catch {
      setCopied(false);
    }
    void fetch('/api/track', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ offerId, eventType: 'code_copy' }),
      keepalive: true,
    }).catch(() => undefined);
  }, [code, offerId]);

  return (
    <div className="card p-5">
      <button
        type="button"
        onClick={revealAndCopy}
        aria-describedby={statusId}
        className={cn(
          'flex w-full items-center justify-between gap-4 rounded-xl border-2 border-dashed px-5 py-4 transition-colors',
          revealed
            ? 'border-brand-500 bg-brand-50 dark:bg-brand-950'
            : 'border-line bg-surface-alt hover:border-brand-400',
        )}
      >
        <span className="text-start">
          <span className="block text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {revealed ? t.offer.codeRevealed : t.offer.showCode}
          </span>
          <span className="mt-0.5 block text-sm text-ink-muted">
            {t.offer.revealAndCopy}
          </span>
        </span>
        <span
          className={cn(
            'font-mono text-xl font-bold tracking-widest',
            revealed ? 'text-brand-800 dark:text-brand-200' : 'text-ink',
          )}
        >
          {revealed ? code : '••••••••'}
        </span>
      </button>

      <div className="mt-3 flex items-center justify-between gap-3">
        <a
          href={`/go/${offerId}`}
          target="_blank"
          rel="nofollow sponsored noopener"
          className="btn-primary btn-md flex-1"
        >
          {t.offer.getDeal}
          <span className="sr-only">{t.offer.opensNewTab}</span>
        </a>
        <button
          type="button"
          onClick={revealAndCopy}
          className="btn-outline btn-md"
          aria-label={t.offer.copyCode}
        >
          <Copy className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div id={statusId} role="status" aria-live="polite" className="min-h-5 text-center text-sm">
        {copied ? (
          <span className="inline-flex items-center gap-1.5 font-medium text-emerald-600">
            <Check className="h-4 w-4" aria-hidden="true" />
            {t.offer.codeCopied}
          </span>
        ) : null}
      </div>
    </div>
  );
}

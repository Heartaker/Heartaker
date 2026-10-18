'use client';

import { useState } from 'react';
import { getDictionary } from '@/lib/i18n/dictionaries';
import type { Locale } from '@/lib/types';

const REASONS = [
  'expired',
  'code_invalid',
  'code_not_working',
  'misleading_terms',
  'broken_link',
  'not_available_in_country',
  'other',
] as const;

const REASON_LABELS: Record<string, Record<Locale, string>> = {
  expired: { fr: 'Offre expirée', en: 'Offer expired', ar: 'العرض منتهي' },
  code_invalid: { fr: 'Code invalide', en: 'Invalid code', ar: 'كود غير صالح' },
  code_not_working: { fr: 'Le code ne fonctionne pas', en: 'Code does not work', ar: 'الكود لا يعمل' },
  misleading_terms: { fr: 'Conditions trompeuses', en: 'Misleading terms', ar: 'شروط مضللة' },
  broken_link: { fr: 'Lien cassé', en: 'Broken link', ar: 'رابط معطل' },
  not_available_in_country: { fr: 'Non disponible dans mon pays', en: 'Not available in my country', ar: 'غير متاح في بلدي' },
  other: { fr: 'Autre', en: 'Other', ar: 'أخرى' },
};

type State = 'idle' | 'sending' | 'sent' | 'error';

export function ReportForm({ offerId, locale }: { offerId: string; locale: Locale }) {
  const t = getDictionary(locale);
  const [reason, setReason] = useState<string>('code_not_working');
  const [comment, setComment] = useState('');
  const [state, setState] = useState<State>('idle');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setState('sending');
    try {
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ offerId, reason, comment: comment || undefined }),
      });
      setState(response.ok ? 'sent' : 'error');
    } catch {
      setState('error');
    }
  }

  if (state === 'sent') {
    return (
      <p role="status" className="text-sm font-medium text-emerald-600">
        {t.offer.reportThanks}
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label htmlFor="report-reason" className="label">
          {t.offer.reportReason}
        </label>
        <select
          id="report-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="input"
        >
          {REASONS.map((value) => (
            <option key={value} value={value}>
              {REASON_LABELS[value]?.[locale] ?? value}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="report-comment" className="label">
          {t.offer.reportComment}
        </label>
        <textarea
          id="report-comment"
          rows={3}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          className="input resize-y"
          maxLength={1000}
        />
      </div>

      <button type="submit" disabled={state === 'sending'} className="btn-outline btn-sm w-full">
        {state === 'sending' ? t.common.loading : t.offer.reportSubmit}
      </button>

      {state === 'error' ? (
        <p role="alert" className="text-sm text-red-600">
          {t.common.error}
        </p>
      ) : null}
    </form>
  );
}

'use client';

import { useState } from 'react';
import { getDictionary } from '@/lib/i18n/dictionaries';
import type { Locale } from '@/lib/types';

type State = 'idle' | 'sending' | 'done' | 'error' | 'duplicate';

export function NewsletterForm({ locale, className }: { locale: Locale; className?: string }) {
  const t = getDictionary(locale);
  const [email, setEmail] = useState('');
  const [state, setState] = useState<State>('idle');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setState('sending');
    try {
      const response = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, language: locale }),
      });
      const data = (await response.json()) as { ok?: boolean; code?: string };
      if (response.ok) setState('done');
      else setState(data.code === 'already_subscribed' ? 'duplicate' : 'error');
    } catch {
      setState('error');
    }
  }

  return (
    <form onSubmit={submit} className={className}>
      <label htmlFor="newsletter-email" className="sr-only">
        {t.newsletter.emailPlaceholder}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="newsletter-email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={t.newsletter.emailPlaceholder}
          className="input h-11 flex-1"
          aria-describedby="newsletter-status"
        />
        <button type="submit" disabled={state === 'sending' || state === 'done'} className="btn-accent btn-md h-11">
          {state === 'sending' ? t.common.loading : t.newsletter.submit}
        </button>
      </div>

      <div id="newsletter-status" role="status" aria-live="polite" className="mt-2 min-h-5 text-sm">
        {state === 'done' ? <span className="text-emerald-600">{t.newsletter.success}</span> : null}
        {state === 'duplicate' ? <span className="text-amber-600">{t.newsletter.alreadySubscribed}</span> : null}
        {state === 'error' ? <span className="text-red-600">{t.newsletter.error}</span> : null}
      </div>
    </form>
  );
}

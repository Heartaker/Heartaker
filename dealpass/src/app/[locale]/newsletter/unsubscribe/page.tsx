'use client';

import { useState } from 'react';
import { getDictionary } from '@/lib/i18n/dictionaries';
import type { Locale } from '@/lib/types';

export default function UnsubscribePage({ params }: { params: { locale: Locale } }) {
  const t = getDictionary(params.locale);
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(false);
    const response = await fetch('/api/newsletter/unsubscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = (await response.json()) as { ok: boolean };
    if (data.ok) setDone(true);
    else setError(true);
  }

  return (
    <div className="container-page flex min-h-[50vh] items-center justify-center py-16">
      <div className="card w-full max-w-md p-8">
        <h1 className="text-xl font-bold text-ink">{t.newsletter.unsubscribeTitle}</h1>

        {done ? (
          <p role="status" className="mt-4 text-sm text-emerald-600">
            {t.newsletter.unsubscribedBody}
          </p>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-3">
            <label htmlFor="unsubscribe-email" className="label">
              {t.account.email}
            </label>
            <input
              id="unsubscribe-email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="input"
              placeholder={t.newsletter.emailPlaceholder}
            />
            <button type="submit" className="btn-primary btn-md w-full">
              {t.footer.unsubscribe}
            </button>
            {error ? (
              <p role="alert" className="text-sm text-red-600">
                {t.common.error}
              </p>
            ) : null}
          </form>
        )}
      </div>
    </div>
  );
}

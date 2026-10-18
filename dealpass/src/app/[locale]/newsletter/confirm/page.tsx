import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CheckCircle2, XCircle } from 'lucide-react';
import { isLocale } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { confirmSubscription } from '@/lib/services/newsletter';
import type { Locale } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

/** Double opt-in landing page. Never indexed. */
export default async function ConfirmPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale: raw } = await params;
  const { token } = await searchParams;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const t = getDictionary(locale);

  const result = token ? await confirmSubscription(token) : 'invalid_token';
  const success = result === 'confirmed' || result === 'already_confirmed';

  return (
    <div className="container-page flex min-h-[50vh] items-center justify-center py-16">
      <div className="card max-w-md p-8 text-center">
        {success ? (
          <>
            <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-emerald-500" aria-hidden="true" />
            <h1 className="text-xl font-bold text-ink">{t.newsletter.confirmTitle}</h1>
            <p className="mt-2 text-sm text-ink-muted">{t.newsletter.confirmBody}</p>
          </>
        ) : (
          <>
            <XCircle className="mx-auto mb-4 h-12 w-12 text-red-500" aria-hidden="true" />
            <h1 className="text-xl font-bold text-ink">{t.newsletter.invalidToken}</h1>
            <p className="mt-2 text-sm text-ink-muted">{t.footer.unsubscribe}</p>
          </>
        )}
        <Link href={`/${locale}`} className="btn-primary btn-md mt-6">
          {t.notFound.cta}
        </Link>
      </div>
    </div>
  );
}

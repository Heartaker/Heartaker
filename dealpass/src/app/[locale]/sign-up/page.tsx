import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { SignUpForm } from '@/components/site/auth-forms';
import { isLocale } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { getCurrentUser } from '@/lib/auth/session';
import type { Locale } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

export default async function SignUpPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const t = getDictionary(locale);

  const user = await getCurrentUser();
  if (user) redirect(`/${locale}/account`);

  return (
    <div className="container-page flex min-h-[60vh] items-center justify-center py-12">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center text-2xl font-bold text-ink">{t.account.signUp}</h1>
        <div className="card p-6">
          <SignUpForm locale={locale} />
        </div>
        <p className="mt-4 text-center text-sm text-ink-muted">
          {t.account.signIn} ?{' '}
          <Link href={`/${locale}/sign-in`} className="text-brand-700 hover:underline dark:text-brand-300">
            {t.account.signInCta}
          </Link>
        </p>
      </div>
    </div>
  );
}

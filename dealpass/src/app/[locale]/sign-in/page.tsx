import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { SignInForm } from '@/components/site/auth-forms';
import { isLocale } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { getCurrentUser } from '@/lib/auth/session';
import type { Locale } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

export default async function SignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { locale: raw } = await params;
  const { next } = await searchParams;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const t = getDictionary(locale);

  const user = await getCurrentUser();
  if (user) redirect(next ?? `/${locale}/account`);

  return (
    <div className="container-page flex min-h-[60vh] items-center justify-center py-12">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-center text-2xl font-bold text-ink">{t.account.signIn}</h1>
        <p className="mb-6 text-center text-sm text-ink-muted">{t.account.demoNotice}</p>

        <div className="card p-6">
          <SignInForm locale={locale} next={next} />
        </div>

        <p className="mt-4 text-center text-sm text-ink-muted">
          {t.account.signUp} ?{' '}
          <Link href={`/${locale}/sign-up`} className="text-brand-700 hover:underline dark:text-brand-300">
            {t.account.signUpCta}
          </Link>
        </p>

        <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <strong>Demonstration account</strong>
          <br />
          admin@dealpass.example · ChangeMe-2026!
        </div>
      </div>
    </div>
  );
}

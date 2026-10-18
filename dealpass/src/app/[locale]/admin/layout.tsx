import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AdminSidebar, AdminSignOut, type AdminNavItem } from '@/components/admin/sidebar';
import { isLocale } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { getCurrentUser } from '@/lib/auth/session';
import { can, isStaff } from '@/lib/auth/rbac';
import type { Locale } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * Administration shell.
 *
 * Access control is enforced here for every admin page, so a child route
 * cannot be reached simply by guessing its URL. Individual pages additionally
 * check the specific permission they need.
 */
export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const t = getDictionary(locale);

  const user = await getCurrentUser();
  if (!user) redirect(`/${locale}/sign-in?next=/${locale}/admin`);
  if (!isStaff(user)) notFound(); // 404 rather than 403: do not advertise the route

  const items: AdminNavItem[] = [
    ...(can(user, 'offers.read')
      ? [{ href: `/${locale}/admin`, label: t.admin.dashboard, icon: 'offers' as const }]
      : []),
    ...(can(user, 'offers.read')
      ? [{ href: `/${locale}/admin/offers`, label: t.admin.offers, icon: 'offers' as const }]
      : []),
    ...(can(user, 'offers.review')
      ? [{ href: `/${locale}/admin/review`, label: t.admin.reviewQueue, icon: 'review' as const }]
      : []),
    ...(can(user, 'merchants.read')
      ? [{ href: `/${locale}/admin/merchants`, label: t.admin.merchants, icon: 'merchants' as const }]
      : []),
    ...(can(user, 'integrations.read')
      ? [{ href: `/${locale}/admin/connectors`, label: t.admin.connectors, icon: 'connectors' as const }]
      : []),
    ...(can(user, 'newsletters.read')
      ? [{ href: `/${locale}/admin/subscribers`, label: t.admin.subscribers, icon: 'subscribers' as const }]
      : []),
    ...(can(user, 'audit_logs.read')
      ? [{ href: `/${locale}/admin/audit`, label: t.admin.audit, icon: 'audit' as const }]
      : []),
    ...(can(user, 'integrations.read')
      ? [{ href: `/${locale}/admin/sync-logs`, label: t.admin.syncLogs, icon: 'logs' as const }]
      : []),
    ...(can(user, 'settings.configure') || can(user, 'settings.read')
      ? [{ href: `/${locale}/admin/settings`, label: t.admin.settings, icon: 'settings' as const }]
      : []),
  ];

  return (
    <div className="container-page py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">{t.admin.title}</h1>
          <p className="text-xs text-ink-muted">
            {user.email} · <span className="font-medium">{user.roleSlug}</span>
          </p>
        </div>
        <Link
          href={`/${locale}`}
          className="text-sm text-brand-700 hover:underline dark:text-brand-300"
        >
          ← {t.nav.home}
        </Link>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <AdminSidebar items={items} locale={locale} />
          <div className="mt-4 border-t border-line pt-3">
            <AdminSignOut />
          </div>
        </aside>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

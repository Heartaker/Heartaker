import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, CreditCard, Flag, Gift, Link2Off, MousePointer, Store, Users } from 'lucide-react';
import { StatCard } from '@/components/admin/stat-card';
import { DataTable } from '@/components/admin/data-table';
import { Badge } from '@/components/ui/badge';
import { isLocale } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { requireStaff } from '@/lib/auth/rbac';
import { getDashboardStats, adminListSyncLogs } from '@/lib/services/admin';
import type { Locale } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const t = getDictionary(locale);

  await requireStaff();
  const [stats, logs] = await Promise.all([getDashboardStats(), adminListSyncLogs(6)]);

  return (
    <div className="space-y-6">
      <section aria-labelledby="admin-overview">
        <h2 id="admin-overview" className="mb-3 text-base font-semibold text-ink">
          {t.admin.dashboard}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={t.admin.activeOffers} value={stats.activeOffers} href={`/${locale}/admin/offers`} icon={<Gift className="h-4 w-4" aria-hidden="true" />} />
          <StatCard
            label={t.admin.pendingReview}
            value={stats.pendingReview}
            tone={stats.pendingReview > 0 ? 'warning' : 'default'}
            href={`/${locale}/admin/review`}
          />
          <StatCard label={t.admin.expiringSoon} value={stats.expiringSoon} tone="warning" />
          <StatCard label={t.admin.expired} value={stats.expired} />
          <StatCard label={t.admin.activeConnectors} value={stats.activeConnectors} href={`/${locale}/admin/connectors`} icon={<Link2Off className="h-4 w-4" aria-hidden="true" />} />
          <StatCard label={t.admin.failedSyncs} value={stats.failedSyncs} tone={stats.failedSyncs > 0 ? 'danger' : 'default'} href={`/${locale}/admin/sync-logs`} />
          <StatCard label={t.admin.brokenLinks} value={stats.brokenLinks} tone={stats.brokenLinks > 0 ? 'warning' : 'default'} />
          <StatCard label={t.admin.reportedCoupons} value={stats.reportedCoupons} tone={stats.reportedCoupons > 0 ? 'warning' : 'default'} href={`/${locale}/admin/review`} icon={<Flag className="h-4 w-4" aria-hidden="true" />} />
          <StatCard label={t.admin.clicksToday} value={stats.clicksToday} icon={<MousePointer className="h-4 w-4" aria-hidden="true" />} />
          <StatCard label={t.admin.clicks7d} value={stats.clicks7d} />
          <StatCard label={t.admin.conversions} value={stats.conversions} />
          <StatCard label={t.admin.commissions} value={`${stats.commission.toFixed(2)} €`} icon={<CreditCard className="h-4 w-4" aria-hidden="true" />} />
          <StatCard label={t.admin.newsletter} value={`${stats.confirmedSubscribers}/${stats.subscribers}`} href={`/${locale}/admin/subscribers`} icon={<Users className="h-4 w-4" aria-hidden="true" />} />
          <StatCard label={t.admin.merchants} value={stats.merchants} href={`/${locale}/admin/merchants`} icon={<Store className="h-4 w-4" aria-hidden="true" />} />
        </div>
      </section>

      <section aria-labelledby="recent-syncs">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="recent-syncs" className="text-base font-semibold text-ink">
            {t.admin.syncLogs}
          </h2>
          <Link href={`/${locale}/admin/sync-logs`} className="text-sm text-brand-700 hover:underline dark:text-brand-300">
            {t.common.viewAll}
          </Link>
        </div>

        <DataTable
          headers={['Workflow', t.admin.status, 'Importées', 'Mises à jour', 'Rejetées', 'Date']}
          empty={t.admin.noData}
          rows={logs.map((log) => [
            <span key="w" className="font-medium">{log.workflow_name}</span>,
            <Badge
              key="s"
              tone={
                log.status === 'success' ? 'success'
                  : log.status === 'failed' ? 'danger'
                    : log.status === 'partial' ? 'warning' : 'neutral'
              }
            >
              {log.status}
            </Badge>,
            String(log.imported_count),
            String(log.updated_count),
            String(log.rejected_count),
            <span key="d" className="text-xs text-ink-muted">
              {new Date(log.started_at).toLocaleString(locale)}
            </span>,
          ])}
        />
      </section>

      {stats.failedSyncs > 0 ? (
        <p role="alert" className="flex items-center gap-2 rounded-card border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          {stats.failedSyncs} synchronisation(s) en échec au cours des dernières 24 h.
        </p>
      ) : null}
    </div>
  );
}

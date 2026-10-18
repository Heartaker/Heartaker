import { notFound } from 'next/navigation';
import { DataTable } from '@/components/admin/data-table';
import { Badge } from '@/components/ui/badge';
import { isLocale } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { requirePermission } from '@/lib/auth/rbac';
import { adminListSubscribers } from '@/lib/services/admin';
import { newsletterStats } from '@/lib/services/newsletter';
import { StatCard } from '@/components/admin/stat-card';
import type { Locale } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function SubscribersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const t = getDictionary(locale);

  await requirePermission('newsletters.read');
  const [rows, stats] = await Promise.all([adminListSubscribers(200), newsletterStats()]);

  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold text-ink">{t.admin.subscribers}</h2>

      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label="Total" value={stats.total} />
        <StatCard label={t.admin.newsletter} value={stats.confirmed} tone="success" />
        <StatCard label="Pending" value={stats.pending} tone="warning" />
        <StatCard label="Unsubscribed" value={stats.unsubscribed} />
      </div>

      <p className="rounded-card border border-line bg-surface-alt p-3 text-xs text-ink-muted">
        Marketing email is sent only to <strong>confirmed</strong> subscribers. Pending contacts
        have been sent a double opt-in link and are excluded from every campaign.
      </p>

      <DataTable
        headers={['Email', 'Lang', 'Pays', 'Fréquence', 'Statut', 'Confirmé le']}
        empty={t.admin.noData}
        rows={rows.map((row) => [
          <span key="e" className="font-mono text-xs">{row.email}</span>,
          <span key="l">{row.language_code}</span>,
          <span key="c">{row.country_code}</span>,
          <span key="f">{row.delivery_frequency}</span>,
          <Badge
            key="s"
            tone={
              row.consent_status === 'confirmed' ? 'success'
                : row.consent_status === 'pending' ? 'warning'
                  : 'neutral'
            }
          >
            {row.consent_status}
          </Badge>,
          <span key="d" className="text-xs text-ink-muted">
            {row.confirmed_at ? new Date(row.confirmed_at).toLocaleDateString(locale) : '—'}
          </span>,
        ])}
      />
    </div>
  );
}

import { notFound } from 'next/navigation';
import { DataTable } from '@/components/admin/data-table';
import { Badge } from '@/components/ui/badge';
import { isLocale } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { requirePermission } from '@/lib/auth/rbac';
import { adminListSyncLogs } from '@/lib/services/admin';
import type { Locale } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function SyncLogsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const t = getDictionary(locale);

  await requirePermission('integrations.read');
  const rows = await adminListSyncLogs(100);

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-ink">{t.admin.syncLogs}</h2>

      <DataTable
        headers={['Workflow', 'Network', 'Status', 'Imported', 'Updated', 'Rejected', 'Expired', 'Started', 'Error']}
        empty={t.admin.noData}
        rows={rows.map((row) => [
          <span key="w" className="font-medium">{row.workflow_name}</span>,
          <span key="n" className="text-xs">{row.network_slug ?? '—'}</span>,
          <Badge
            key="s"
            tone={
              row.status === 'success' ? 'success'
                : row.status === 'failed' ? 'danger'
                  : row.status === 'partial' ? 'warning' : 'neutral'
            }
          >
            {row.status}
          </Badge>,
          String(row.imported_count),
          String(row.updated_count),
          String(row.rejected_count),
          String(row.expired_count),
          <span key="d" className="text-xs text-ink-muted">
            {new Date(row.started_at).toLocaleString(locale)}
          </span>,
          <span key="e" className="max-w-xs truncate text-xs text-red-600">
            {row.error_message ?? '—'}
          </span>,
        ])}
      />
    </div>
  );
}

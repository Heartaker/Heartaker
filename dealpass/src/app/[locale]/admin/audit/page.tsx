import { notFound } from 'next/navigation';
import { DataTable } from '@/components/admin/data-table';
import { isLocale } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { requirePermission } from '@/lib/auth/rbac';
import { adminListAudit } from '@/lib/services/admin';
import type { Locale } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function AuditPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const t = getDictionary(locale);

  await requirePermission('audit_logs.read');
  const rows = await adminListAudit(200);

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-ink">{t.admin.audit}</h2>
      <p className="text-xs text-ink-muted">
        Append-only. Audit rows can never be updated or deleted — that is enforced by a
        database grant, not just by the interface.
      </p>

      <DataTable
        headers={['Action', 'Entity', 'Entity ID', 'Actor', 'When']}
        empty={t.admin.noData}
        rows={rows.map((row) => [
          <span key="a" className="font-mono text-xs">{row.action}</span>,
          <span key="t">{row.entity_type}</span>,
          <span key="i" className="font-mono text-xs text-ink-muted">
            {row.entity_id ? `${row.entity_id.slice(0, 12)}…` : '—'}
          </span>,
          <span key="u" className="text-xs">{row.actor_email ?? 'system'}</span>,
          <span key="w" className="text-xs text-ink-muted">
            {new Date(row.created_at).toLocaleString(locale)}
          </span>,
        ])}
      />
    </div>
  );
}

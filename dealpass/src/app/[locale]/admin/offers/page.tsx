import { notFound } from 'next/navigation';
import Link from 'next/link';
import { DataTable } from '@/components/admin/data-table';
import { Badge } from '@/components/ui/badge';
import { ActionButton } from '@/components/admin/action-button';
import { isLocale } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { requirePermission } from '@/lib/auth/rbac';
import { adminListOffers } from '@/lib/services/admin';
import { moderateOffer, runExpirationWorkflow } from '../actions';
import type { Locale, PublicationStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

const STATUS_TONES: Record<string, 'success' | 'warning' | 'danger' | 'neutral' | 'brand'> = {
  published: 'success',
  approved: 'success',
  pending_validation: 'warning',
  imported: 'neutral',
  rejected: 'danger',
  expired: 'neutral',
  suspended: 'danger',
  archived: 'neutral',
};

export default async function AdminOffersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { locale: raw } = await params;
  const { status, q } = await searchParams;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const t = getDictionary(locale);

  await requirePermission('offers.read');
  const { rows } = await adminListOffers({ status, search: q, limit: 100 });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-ink">{t.admin.offers}</h2>
        <ActionButton
          label="Lancer l'expiration"
          action={runExpirationWorkflow.bind(null, locale)}
          variant="outline"
        />
      </div>

      <form method="get" className="flex flex-wrap gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder={t.admin.search}
          className="input max-w-xs"
        />
        <select name="status" defaultValue={status ?? ''} className="input max-w-[200px]">
          <option value="">{t.admin.status} — tous</option>
          {(Object.keys(STATUS_TONES) as PublicationStatus[]).map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <button type="submit" className="btn-outline btn-sm">
          {t.admin.search}
        </button>
      </form>

      <DataTable
        headers={[t.admin.offer, t.admin.merchant, t.admin.score, t.admin.status, t.admin.expires, t.admin.actions]}
        empty={t.admin.noData}
        rows={rows.map((offer) => [
          <div key="o" className="max-w-xs">
            <Link
              href={`/${locale}/offers/${offer.slug}`}
              className="block truncate font-medium text-ink hover:underline"
            >
              {offer.title}
            </Link>
            <span className="text-xs text-ink-muted">{offer.offer_type}</span>
          </div>,
          <span key="m" className="text-sm">{offer.merchant_name}</span>,
          <span key="s" className="font-mono text-xs">{offer.confidence_score}</span>,
          <Badge key="st" tone={STATUS_TONES[offer.publication_status] ?? 'neutral'}>
            {offer.publication_status}
          </Badge>,
          <span key="e" className="text-xs text-ink-muted">
            {offer.expires_at ? new Date(offer.expires_at).toLocaleDateString(locale) : '—'}
          </span>,
          <div key="a" className="flex flex-wrap gap-1">
            {offer.publication_status !== 'published' ? (
              <ActionButton
                label={t.admin.approve}
                variant="primary"
                action={moderateOffer.bind(null, offer.id, 'approve', locale)}
              />
            ) : (
              <ActionButton
                label={t.admin.suspend}
                variant="outline"
                action={moderateOffer.bind(null, offer.id, 'suspend', locale)}
              />
            )}
            <ActionButton
              label={t.admin.reject}
              variant="danger"
              action={moderateOffer.bind(null, offer.id, 'reject', locale)}
            />
          </div>,
        ])}
      />
    </div>
  );
}

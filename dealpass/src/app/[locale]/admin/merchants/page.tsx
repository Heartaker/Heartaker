import { notFound } from 'next/navigation';
import Link from 'next/link';
import { DataTable } from '@/components/admin/data-table';
import { Badge } from '@/components/ui/badge';
import { isLocale } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { requirePermission } from '@/lib/auth/rbac';
import { listMerchants } from '@/lib/services/offers';
import type { Locale } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function AdminMerchantsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const t = getDictionary(locale);

  await requirePermission('merchants.read');
  const merchants = await listMerchants(undefined, 300);

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-ink">{t.admin.merchants}</h2>

      <DataTable
        headers={['Name', 'Vertical', 'Countries', 'Offers', 'Status', '']}
        empty={t.admin.noData}
        rows={merchants.map((merchant) => [
          <span key="n" className="font-medium">{merchant.name}</span>,
          <Badge key="v" tone="neutral">{merchant.vertical}</Badge>,
          <span key="c" className="text-xs text-ink-muted">
            {(merchant.country_codes ?? []).slice(0, 5).join(', ')}
            {(merchant.country_codes?.length ?? 0) > 5 ? ` +${(merchant.country_codes?.length ?? 0) - 5}` : ''}
          </span>,
          String(merchant.offer_count),
          <Badge key="s" tone={merchant.is_verified ? 'success' : 'neutral'}>
            {merchant.is_verified ? t.offer.verified : 'unverified'}
          </Badge>,
          <Link key="l" href={`/${locale}/stores/${merchant.slug}`} className="text-xs text-brand-700 hover:underline dark:text-brand-300">
            {t.common.viewAll}
          </Link>,
        ])}
      />
    </div>
  );
}

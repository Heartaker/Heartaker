import { notFound } from 'next/navigation';
import Link from 'next/link';
import { DataTable } from '@/components/admin/data-table';
import { Badge } from '@/components/ui/badge';
import { ActionButton } from '@/components/admin/action-button';
import { isLocale } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { requirePermission } from '@/lib/auth/rbac';
import { adminListOffers, adminListReports } from '@/lib/services/admin';
import { moderateOffer, resolveReport } from '../actions';
import type { Locale } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * Human review queue.
 *
 * Offers land here when their confidence score falls below the auto-publish
 * threshold, or when a required field is missing — the gate that keeps
 * uncertain records away from the public site.
 */
export default async function ReviewQueuePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const t = getDictionary(locale);

  await requirePermission('offers.review');
  const [{ rows }, reports] = await Promise.all([
    adminListOffers({ status: 'pending_validation', limit: 100 }),
    adminListReports(50),
  ]);

  return (
    <div className="space-y-8">
      <section aria-labelledby="review-queue">
        <h2 id="review-queue" className="mb-3 text-base font-semibold text-ink">
          {t.admin.pendingReview} ({rows.length})
        </h2>

        <DataTable
          headers={[t.admin.offer, t.admin.merchant, t.admin.score, t.admin.actions]}
          empty={t.admin.noData}
          rows={rows.map((offer) => [
            <div key="o" className="max-w-sm">
              <Link href={`/${locale}/offers/${offer.slug}`} className="block font-medium text-ink hover:underline">
                {offer.title}
              </Link>
              <span className="text-xs text-ink-muted">
                {offer.offer_type} · {offer.coupon_code ?? t.offer.noCodeRequired}
              </span>
            </div>,
            <span key="m" className="text-sm">{offer.merchant_name}</span>,
            <Badge key="s" tone={offer.confidence_score >= 70 ? 'warning' : 'danger'}>
              {offer.confidence_score}
            </Badge>,
            <div key="a" className="flex flex-wrap gap-1">
              <ActionButton
                label={t.admin.approve}
                variant="primary"
                action={moderateOffer.bind(null, offer.id, 'approve', locale)}
              />
              <ActionButton
                label={t.admin.reject}
                variant="danger"
                action={moderateOffer.bind(null, offer.id, 'reject', locale)}
              />
            </div>,
          ])}
        />
      </section>

      <section aria-labelledby="reports">
        <h2 id="reports" className="mb-3 text-base font-semibold text-ink">
          {t.admin.reportedCoupons} ({reports.length})
        </h2>
        <DataTable
          headers={[t.admin.offer, 'Reason', 'Comment', t.admin.status, t.admin.actions]}
          empty={t.admin.noData}
          rows={reports.map((report) => [
            <span key="o" className="max-w-xs truncate">{report.offer_title}</span>,
            <Badge key="r" tone="warning">{report.reason}</Badge>,
            <span key="c" className="max-w-sm text-xs text-ink-muted">{report.comment ?? '—'}</span>,
            <Badge key="s" tone={report.status === 'open' ? 'danger' : 'neutral'}>{report.status}</Badge>,
            <div key="a" className="flex flex-wrap gap-1">
              {report.status === 'open' ? (
                <>
                  <ActionButton
                    label="Resolve"
                    variant="primary"
                    action={resolveReport.bind(null, report.id, 'resolved', locale)}
                  />
                  <ActionButton
                    label="Dismiss"
                    variant="outline"
                    action={resolveReport.bind(null, report.id, 'dismissed', locale)}
                  />
                </>
              ) : (
                <span className="text-xs text-ink-muted">—</span>
              )}
            </div>,
          ])}
        />
      </section>
    </div>
  );
}

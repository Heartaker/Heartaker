'use client';

import { useCallback, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SlidersHorizontal, X } from 'lucide-react';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { COUNTRIES, CURRENCIES } from '@/lib/i18n/config';
import { OFFER_TYPES, type Locale } from '@/lib/types';
import { cn } from '@/lib/cn';

export interface FilterOption {
  value: string;
  label: string;
}

interface OfferFiltersProps {
  locale: Locale;
  categories: FilterOption[];
  merchants: FilterOption[];
  country: string;
}

const OFFER_TYPE_LABELS: Record<string, { fr: string; en: string; ar: string }> = {
  coupon_code: { fr: 'Code promo', en: 'Coupon code', ar: 'كود خصم' },
  automatic_discount: { fr: 'Remise automatique', en: 'Automatic discount', ar: 'خصم تلقائي' },
  flash_sale: { fr: 'Vente flash', en: 'Flash sale', ar: 'تخفيض سريع' },
  seasonal_sale: { fr: 'Soldes', en: 'Seasonal sale', ar: 'تخفيضات موسمية' },
  cashback: { fr: 'Cashback', en: 'Cashback', ar: 'استرداد نقدي' },
  free_shipping: { fr: 'Livraison offerte', en: 'Free shipping', ar: 'شحن مجاني' },
  exclusive_offer: { fr: 'Offre exclusive', en: 'Exclusive', ar: 'عرض حصري' },
  new_customer_offer: { fr: 'Nouveau client', en: 'New customer', ar: 'عميل جديد' },
  price_drop: { fr: 'Baisse de prix', en: 'Price drop', ar: 'انخفاض سعر' },
  travel_deal: { fr: 'Voyage', en: 'Travel', ar: 'سفر' },
  hotel_deal: { fr: 'Hôtel', en: 'Hotel', ar: 'فندق' },
  flight_deal: { fr: 'Vol', en: 'Flight', ar: 'طيران' },
  car_rental_deal: { fr: 'Location de voiture', en: 'Car rental', ar: 'تأجير سيارات' },
  activity_deal: { fr: 'Activité', en: 'Activity', ar: 'نشاط' },
  course_deal: { fr: 'Formation', en: 'Course', ar: 'دورة' },
  software_deal: { fr: 'Logiciel', en: 'Software', ar: 'برمجيات' },
};

/**
 * Facet filters.
 *
 * State lives in the URL, so every filtered view is shareable, bookmarkable
 * and cacheable — and the server can render it without client-side data
 * fetching.
 */
export function OfferFilters({ locale, categories, merchants, country }: OfferFiltersProps) {
  const t = getDictionary(locale);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  const update = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === null || value === '') params.delete(key);
      else params.set(key, value);
      params.delete('page'); // any filter change resets pagination
      const query = params.toString();
      router.push(query ? `${pathname}?${query}` : pathname);
    },
    [pathname, router, searchParams],
  );

  const activeCount = useMemo(
    () =>
      ['category', 'merchant', 'offerType', 'verified', 'exclusive', 'endingSoon', 'freeShipping', 'newCustomer', 'minDiscount', 'country']
        .filter((key) => searchParams.get(key)).length,
    [searchParams],
  );

  const selectClass =
    'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30';

  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="offer-filters"
        className="btn-outline btn-md w-full justify-between sm:hidden"
      >
        <span className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          {t.search.filters}
          {activeCount > 0 ? (
            <span className="rounded-full bg-brand-700 px-2 py-0.5 text-xs text-white">{activeCount}</span>
          ) : null}
        </span>
      </button>

      <div
        id="offer-filters"
        className={cn(
          'mt-3 grid gap-3 rounded-card border border-line bg-surface-alt p-4 sm:mt-0 sm:grid-cols-2 lg:grid-cols-5',
          open ? 'block' : 'hidden sm:grid',
        )}
      >
        <label>
          <span className="label">{t.search.category}</span>
          <select
            value={searchParams.get('category') ?? ''}
            onChange={(event) => update('category', event.target.value)}
            className={selectClass}
          >
            <option value="">{t.search.allCategories}</option>
            {categories.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="label">{t.search.merchant}</span>
          <select
            value={searchParams.get('merchant') ?? ''}
            onChange={(event) => update('merchant', event.target.value)}
            className={selectClass}
          >
            <option value="">{t.search.allMerchants}</option>
            {merchants.map((merchant) => (
              <option key={merchant.value} value={merchant.value}>
                {merchant.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="label">{t.search.offerType}</span>
          <select
            value={searchParams.get('offerType') ?? ''}
            onChange={(event) => update('offerType', event.target.value)}
            className={selectClass}
          >
            <option value="">{t.search.allTypes}</option>
            {OFFER_TYPES.map((type) => (
              <option key={type} value={type}>
                {OFFER_TYPE_LABELS[type]?.[locale] ?? type}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="label">{t.search.country}</span>
          <select
            value={searchParams.get('country') ?? ''}
            onChange={(event) => update('country', event.target.value)}
            className={selectClass}
          >
            <option value="">{t.search.allCountries}</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {locale === 'fr' ? c.nameFr : locale === 'en' ? c.nameEn : c.nameAr}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="label">{t.search.minDiscount}</span>
          <select
            value={searchParams.get('minDiscount') ?? ''}
            onChange={(event) => update('minDiscount', event.target.value)}
            className={selectClass}
          >
            <option value="">—</option>
            {[10, 20, 30, 40, 50, 60, 70].map((value) => (
              <option key={value} value={value}>
                {value}% +
              </option>
            ))}
          </select>
        </label>

        <fieldset className="sm:col-span-2 lg:col-span-5">
          <legend className="sr-only">{t.search.filters}</legend>
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'verified', label: t.search.verifiedOnly },
              { key: 'exclusive', label: t.search.exclusiveOnly },
              { key: 'endingSoon', label: t.search.endingSoon },
              { key: 'freeShipping', label: t.search.freeShipping },
              { key: 'newCustomer', label: t.search.newCustomer },
            ].map((filter) => {
              const active = searchParams.get(filter.key) === '1';
              return (
                <button
                  key={filter.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => update(filter.key, active ? null : '1')}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    active
                      ? 'border-brand-700 bg-brand-700 text-white'
                      : 'border-line bg-surface text-ink hover:bg-surface-alt',
                  )}
                >
                  {filter.label}
                </button>
              );
            })}

            {activeCount > 0 ? (
              <button
                type="button"
                onClick={() => router.push(pathname)}
                className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink-muted hover:bg-surface-alt"
              >
                <X className="h-3 w-3" aria-hidden="true" />
                {t.search.resetFilters}
              </button>
            ) : null}
          </div>
        </fieldset>
      </div>
    </div>
  );
}

/** Sort dropdown, also URL-driven. */
export function SortSelect({ locale }: { locale: Locale }) {
  const t = getDictionary(locale);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get('sort') ?? 'popular';

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-ink-muted">{t.search.sortBy}</span>
      <select
        value={current}
        onChange={(event) => {
          const params = new URLSearchParams(searchParams.toString());
          params.set('sort', event.target.value);
          params.delete('page');
          router.push(`${pathname}?${params.toString()}`);
        }}
        className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink"
      >
        <option value="popular">{t.sort.popular}</option>
        <option value="newest">{t.sort.newest}</option>
        <option value="discount">{t.sort.discount}</option>
        <option value="ending">{t.sort.ending}</option>
        <option value="verified">{t.sort.verified}</option>
      </select>
    </label>
  );
}

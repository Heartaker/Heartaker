/**
 * Domain types shared by the whole application.
 *
 * Connectors emit `Normalized*` records. Nothing outside a connector is ever
 * allowed to read a provider's raw payload shape.
 */

export const LOCALES = ['fr', 'en', 'ar'] as const;
export type Locale = (typeof LOCALES)[number];

export const RTL_LOCALES: readonly Locale[] = ['ar'];

export const OFFER_TYPES = [
  'coupon_code',
  'automatic_discount',
  'flash_sale',
  'seasonal_sale',
  'cashback',
  'free_shipping',
  'exclusive_offer',
  'new_customer_offer',
  'price_drop',
  'travel_deal',
  'hotel_deal',
  'flight_deal',
  'car_rental_deal',
  'activity_deal',
  'course_deal',
  'software_deal',
] as const;
export type OfferType = (typeof OFFER_TYPES)[number];

export const PUBLICATION_STATUSES = [
  'imported',
  'pending_validation',
  'approved',
  'scheduled',
  'published',
  'rejected',
  'expired',
  'suspended',
  'archived',
] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

export const VERIFICATION_STATUSES = ['unverified', 'pending', 'verified', 'failed', 'stale'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const DISCOUNT_TYPES = ['percentage', 'fixed_amount', 'unknown', 'none'] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export const SOURCE_TYPES = ['api', 'feed', 'csv', 'webhook', 'manual', 'demo'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const CLICK_EVENTS = ['view', 'code_reveal', 'code_copy', 'click', 'newsletter_click'] as const;
export type ClickEventType = (typeof CLICK_EVENTS)[number];

export const VERTICALS = ['shopping', 'travel', 'courses', 'software'] as const;
export type Vertical = (typeof VERTICALS)[number];

// ---------------------------------------------------------------------------
// Normalized records
// ---------------------------------------------------------------------------

export interface NormalizedMerchant {
  externalId: string;
  name: string;
  slug?: string;
  logoUrl?: string | null;
  shortDescription?: string | null;
  fullDescription?: string | null;
  officialWebsiteUrl?: string | null;
  affiliateProgramUrl?: string | null;
  countryCodes: string[];
  supportedLanguages: string[];
  defaultCurrency: string;
  vertical: Vertical;
}

export interface NormalizedOffer {
  externalId: string;
  merchantExternalId: string;

  title: string;
  shortDescription?: string | null;
  fullDescription?: string | null;

  couponCode?: string | null;
  offerType: OfferType;
  discountType: DiscountType;
  discountValue?: number | null;
  currency: string;

  originalPrice?: number | null;
  finalPrice?: number | null;

  destinationUrl: string;
  affiliateUrl?: string | null;
  imageUrl?: string | null;

  startAt?: Date | null;
  expiresAt?: Date | null;
  countryCodes: string[];
  languageCodes: string[];

  termsAndConditions?: string | null;
  eligibilityRules?: string | null;

  sourceType: SourceType;
  sourceReference?: string | null;
  isExclusive?: boolean;
  isFeatured?: boolean;
}

export interface NormalizedTransaction {
  externalTransactionId: string;
  merchantExternalId?: string | null;
  offerExternalId?: string | null;
  clickSubId?: string | null;
  orderValue?: number | null;
  commissionAmount?: number | null;
  currency: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'refunded';
  transactionAt?: Date | null;
  raw?: unknown;
}

// ---------------------------------------------------------------------------
// Public read models
// ---------------------------------------------------------------------------

export interface PublicOffer {
  id: string;
  title: string;
  slug: string;
  short_description: string | null;
  coupon_code: string | null;
  offer_type: OfferType;
  discount_type: DiscountType;
  discount_value: number | null;
  currency: string;
  expires_at: string | null;
  country_codes: string[];
  confidence_score: number;
  verification_status: VerificationStatus;
  last_verified_at: string | null;
  is_exclusive: boolean;
  is_featured: boolean;
  image_url: string | null;
  published_at: string | null;
  merchant_id: string;
  merchant_name: string;
  merchant_slug: string;
  merchant_logo: string | null;
  total_count?: number;
}

export interface PublicMerchant {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  short_description: string | null;
  country_codes: string[];
  vertical: string;
  is_verified: boolean;
}

export type SortOption = 'popular' | 'newest' | 'discount' | 'ending' | 'verified';

export interface OfferQuery {
  query?: string;
  country?: string;
  language?: string;
  currency?: string;
  category?: string;
  merchant?: string;
  vertical?: Vertical;
  offerTypes?: OfferType[];
  verifiedOnly?: boolean;
  newCustomer?: boolean;
  freeShipping?: boolean;
  exclusive?: boolean;
  endingSoon?: boolean;
  minDiscount?: number;
  sort?: SortOption;
  page?: number;
  perPage?: number;
}

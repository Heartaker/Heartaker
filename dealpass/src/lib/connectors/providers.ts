import type { ProviderDefinition } from './base';

/**
 * Provider registry data.
 *
 * IMPORTANT — READ BEFORE ENABLING ANY CONNECTOR
 * ------------------------------------------------
 * Every real provider below ships with `mappingVerified: false`. That flag
 * means: "the credential names, endpoints and field paths recorded here were
 * written from the provider's public documentation, but have NOT been executed
 * against a live approved account."
 *
 * `ConnectorBase` refuses to import anything while the flag is false, so no
 * unverified mapping can ever create a real offer. When you gain access to a
 * programme, run one import against the sandbox/test endpoint, confirm the
 * output, then set `mappingVerified: true` for that provider.
 *
 * Nothing here claims a partnership. A connector is only "active" once you
 * hold an approved account AND have enabled it in the dashboard.
 */

const enc = (value: string) => encodeURIComponent(value);

// ---------------------------------------------------------------------------
// Primary affiliate networks
// ---------------------------------------------------------------------------

const awin: ProviderDefinition = {
  slug: 'awin',
  name: 'Awin',
  authMethod: 'api_key',
  integrationType: 'api',
  requiredEnv: ['AWIN_PUBLISHER_ID', 'AWIN_API_TOKEN'],
  mappingVerified: false,
  docsUrl: 'https://developer.awin.com/',
  rateLimitPerMinute: 60,
  defaultOfferType: 'coupon_code',
  endpoints: {
    merchants: ({ creds }) => ({
      url: 'https://api.awin.com/publishers/{pid}/programmes?relationship=joined'.replace(
        '{pid}',
        creds.AWIN_PUBLISHER_ID ?? '',
      ),
      headers: { Authorization: `Bearer ${creds.AWIN_API_TOKEN ?? ''}` },
    }),
    offers: ({ creds, options }) => ({
      url: 'https://api.awin.com/publishers/{pid}/promotions'.replace(
        '{pid}',
        creds.AWIN_PUBLISHER_ID ?? '',
      ),
      headers: { Authorization: `Bearer ${creds.AWIN_API_TOKEN ?? ''}` },
    }),
  },
  extractItems: (payload) => (Array.isArray(payload) ? payload : []),
  offerFieldMap: {
    externalId: 'promotionId',
    merchantExternalId: 'advertiserId',
    title: 'title',
    shortDescription: 'description',
    couponCode: 'voucherCode',
    destinationUrl: 'deeplinkTrackingUrl',
    affiliateUrl: 'deeplinkTrackingUrl',
    offerType: 'promotionType',
    expiresAt: 'endDate',
    startAt: 'startDate',
    terms: 'termsAndConditions',
  },
  merchantFieldMap: {
    externalId: 'id',
    name: 'name',
    website: 'displayUrl',
    logo: 'logoUrl',
    description: 'description',
    currency: 'defaultCurrency',
  },
  generateAffiliateLink: (url, creds) =>
    `https://www.awin1.com/cread.php?awinmid=${creds.AWIN_PUBLISHER_ID ?? ''}&awinaffid=${creds.AWIN_PUBLISHER_ID ?? ''}&ued=${enc(url)}`,
  complianceNotes: 'Approved Awin publisher account required. Voucher codes must come from the approved promotion feed.',
};

const impact: ProviderDefinition = {
  slug: 'impact',
  name: 'Impact.com',
  authMethod: 'signature',
  integrationType: 'api',
  requiredEnv: ['IMPACT_ACCOUNT_ID', 'IMPACT_API_KEY', 'IMPACT_API_SECRET'],
  mappingVerified: false,
  docsUrl: 'https://developer.impact.com/',
  rateLimitPerMinute: 60,
  defaultOfferType: 'coupon_code',
  endpoints: {
    offers: ({ creds, options }) => ({
      url: `https://api.impact.com/Mediapartners/${creds.IMPACT_ACCOUNT_ID ?? ''}/Promotions`,
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${creds.IMPACT_API_KEY ?? ''}:${creds.IMPACT_API_SECRET ?? ''}`,
        ).toString('base64')}`,
      },
    }),
  },
  extractItems: (payload) => {
    const root = payload as { Promotions?: unknown[] } | null;
    return root?.Promotions ?? [];
  },
  offerFieldMap: {
    externalId: 'Id',
    merchantExternalId: 'CampaignId',
    title: 'Name',
    shortDescription: 'Description',
    couponCode: 'CouponCode',
    destinationUrl: 'TrackingLink',
    affiliateUrl: 'TrackingLink',
    expiresAt: 'EndDate',
    startAt: 'StartDate',
    terms: 'Terms',
  },
  complianceNotes: 'Requires approved advertiser relationships; each advertiser sets its own promotion rules.',
};

const cj: ProviderDefinition = {
  slug: 'cj',
  name: 'CJ Affiliate',
  authMethod: 'api_key',
  integrationType: 'api',
  requiredEnv: ['CJ_COMPANY_ID', 'CJ_API_TOKEN'],
  mappingVerified: false,
  docsUrl: 'https://developers.cj.com/',
  rateLimitPerMinute: 30,
  defaultOfferType: 'coupon_code',
  endpoints: {
    offers: () => ({
      url: 'https://ads.api.cj.com/graphql',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.CJ_API_TOKEN ?? ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `query { promotions(first: 100) { count resultList { promotionId advertiserId title description couponCode linkCode startDate endDate } } }`,
      }),
    }),
  },
  extractItems: (payload) => {
    const root = payload as { data?: { promotions?: { resultList?: unknown[] } } } | null;
    return root?.data?.promotions?.resultList ?? [];
  },
  offerFieldMap: {
    externalId: 'promotionId',
    merchantExternalId: 'advertiserId',
    title: 'title',
    shortDescription: 'description',
    couponCode: 'couponCode',
    destinationUrl: 'linkCode',
    expiresAt: 'endDate',
    startAt: 'startDate',
  },
  complianceNotes: 'Approved CJ account and accepted advertiser programmes required.',
};

const rakuten: ProviderDefinition = {
  slug: 'rakuten',
  name: 'Rakuten Advertising',
  authMethod: 'api_key',
  integrationType: 'api',
  requiredEnv: ['RAKUTEN_API_KEY'],
  mappingVerified: false,
  docsUrl: 'https://developers.rakutenadvertising.com/',
  rateLimitPerMinute: 30,
  defaultOfferType: 'coupon_code',
  endpoints: {
    offers: () => ({
      url: 'https://api.rakutenadvertising.com/affiliatesearch/1.0/offers',
      headers: { Authorization: `Bearer ${process.env.RAKUTEN_API_KEY ?? ''}` },
    }),
  },
  offerFieldMap: {
    externalId: 'offerId',
    merchantExternalId: 'advertiserId',
    title: 'offerName',
    shortDescription: 'offerDescription',
    couponCode: 'couponCode',
    destinationUrl: 'clickUrl',
    affiliateUrl: 'clickUrl',
    expiresAt: 'offerEnd',
    startAt: 'offerStart',
    terms: 'termsAndConditions',
  },
  complianceNotes: 'Approved publisher account required.',
};

const travelpayouts: ProviderDefinition = {
  slug: 'travelpayouts',
  name: 'Travelpayouts',
  authMethod: 'api_key',
  integrationType: 'api',
  requiredEnv: ['TRAVELPAYOUTS_TOKEN', 'TRAVELPAYOUTS_MARKER'],
  mappingVerified: false,
  docsUrl: 'https://support.travelpayouts.com/hc/en-us/categories/115000252588-API',
  rateLimitPerMinute: 60,
  defaultOfferType: 'travel_deal',
  defaultVertical: 'travel',
  endpoints: {
    offers: ({ creds }) => ({
      url: `https://api.travelpayouts.com/aviasales/v3/prices_for_dates?token=${creds.TRAVELPAYOUTS_TOKEN ?? ''}`,
    }),
  },
  generateAffiliateLink: (url, creds, meta) => {
    const target = new URL(url);
    target.searchParams.set('marker', creds.TRAVELPAYOUTS_MARKER ?? '');
    if (meta?.subId) target.searchParams.set('subid', meta.subId);
    return target.toString();
  },
  complianceNotes: 'Travel deals and widgets provided under the Travelpayouts partner terms.',
};

const feedico: ProviderDefinition = {
  slug: 'feedico',
  name: 'Feedico',
  authMethod: 'api_key',
  integrationType: 'feed',
  requiredEnv: ['FEEDICO_API_KEY'],
  mappingVerified: false,
  docsUrl: 'https://feedico.com/',
  rateLimitPerMinute: 30,
  defaultOfferType: 'coupon_code',
  endpoints: {},
  complianceNotes: 'Only usable with an approved Feedico account and API access.',
};

// ---------------------------------------------------------------------------
// Shopping & product platforms
// ---------------------------------------------------------------------------

const aliexpress: ProviderDefinition = {
  slug: 'aliexpress',
  name: 'AliExpress Affiliate',
  authMethod: 'signature',
  integrationType: 'api',
  requiredEnv: ['ALIEXPRESS_APP_KEY', 'ALIEXPRESS_APP_SECRET', 'ALIEXPRESS_TRACKING_ID'],
  mappingVerified: false,
  docsUrl: 'https://portals.aliexpress.com/',
  rateLimitPerMinute: 30,
  defaultOfferType: 'automatic_discount',
  endpoints: {},
  generateAffiliateLink: (url, creds, meta) => {
    const target = new URL(url);
    target.searchParams.set('aff_platform', 'portals-tool');
    target.searchParams.set('aff_trace_key', creds.ALIEXPRESS_TRACKING_ID ?? '');
    if (meta?.subId) target.searchParams.set('subid', meta.subId);
    return target.toString();
  },
  complianceNotes: 'Official Portals API only. Product names and images must come from the API response.',
};

const temu: ProviderDefinition = {
  slug: 'temu',
  name: 'Temu Affiliate',
  authMethod: 'api_key',
  integrationType: 'api',
  requiredEnv: ['TEMU_AFFILIATE_ID'],
  mappingVerified: false,
  docsUrl: 'https://affiliate.temu.com/',
  rateLimitPerMinute: 30,
  defaultOfferType: 'coupon_code',
  endpoints: {},
  complianceNotes: 'Approved affiliate account required. Do not display prices not returned by the official feed.',
};

const amazon: ProviderDefinition = {
  slug: 'amazon',
  name: 'Amazon Associates',
  authMethod: 'signature',
  integrationType: 'api',
  requiredEnv: ['AMAZON_ASSOCIATE_TAG', 'AMAZON_API_KEY', 'AMAZON_API_SECRET', 'AMAZON_MARKETPLACE'],
  mappingVerified: false,
  docsUrl: 'https://webservices.amazon.com/paapi5/documentation/',
  rateLimitPerMinute: 10,
  defaultOfferType: 'price_drop',
  endpoints: {},
  // The Associate tag is the only part of the Amazon link that identifies us,
  // and it is not a secret — appending it is safe and documented.
  generateAffiliateLink: (url, creds) => {
    const target = new URL(url);
    target.searchParams.set('tag', creds.AMAZON_ASSOCIATE_TAG ?? '');
    return target.toString();
  },
  complianceNotes:
    'PA-API v5 access is approval-gated. Associates programme rules forbid displaying prices that were not freshly retrieved and cached within the allowed window.',
};

const ebay: ProviderDefinition = {
  slug: 'ebay',
  name: 'eBay Partner Network',
  authMethod: 'oauth2',
  integrationType: 'api',
  requiredEnv: ['EBAY_CLIENT_ID', 'EBAY_CLIENT_SECRET', 'EBAY_CAMPAIGN_ID'],
  mappingVerified: false,
  docsUrl: 'https://developer.ebay.com/?tab=affiliate',
  rateLimitPerMinute: 30,
  defaultOfferType: 'automatic_discount',
  endpoints: {},
  generateAffiliateLink: (url, creds, meta) =>
    `https://rover.ebay.com/rover/1/711-53200-19255-0/1?campid=${creds.EBAY_CAMPAIGN_ID ?? ''}` +
    `&customid=${enc(meta?.subId ?? '')}&toolid=10001&mpre=${enc(url)}`,
  complianceNotes: 'Approved EPN account and EPID campaign required.',
};

const walmart: ProviderDefinition = {
  slug: 'walmart',
  name: 'Walmart Affiliate',
  authMethod: 'api_key',
  integrationType: 'api',
  requiredEnv: ['WALMART_AFFILIATE_ID', 'WALMART_CONSUMER_ID'],
  mappingVerified: false,
  docsUrl: 'https://walmart.io/docs/affiliate/introduction',
  rateLimitPerMinute: 30,
  defaultOfferType: 'automatic_discount',
  endpoints: {},
  complianceNotes: 'Approved affiliate account required.',
};

const shein: ProviderDefinition = {
  slug: 'shein',
  name: 'SHEIN Affiliate',
  authMethod: 'api_key',
  integrationType: 'api',
  requiredEnv: ['SHEIN_AFFILIATE_ID'],
  mappingVerified: false,
  docsUrl: 'https://shein.top/',
  rateLimitPerMinute: 30,
  defaultOfferType: 'coupon_code',
  endpoints: {},
  complianceNotes: 'Approved affiliate account required. Brand asset usage governed by the programme agreement.',
};

const iherb: ProviderDefinition = {
  slug: 'iherb',
  name: 'iHerb Affiliate',
  authMethod: 'api_key',
  integrationType: 'api',
  requiredEnv: ['IHERB_AFFILIATE_ID'],
  mappingVerified: false,
  docsUrl: 'https://www.iherb.com/affiliate',
  rateLimitPerMinute: 30,
  defaultOfferType: 'coupon_code',
  endpoints: {},
  generateAffiliateLink: (url, creds) => {
    const target = new URL(url);
    target.searchParams.set('rcode', creds.IHERB_AFFILIATE_ID ?? '');
    return target.toString();
  },
  complianceNotes: 'Approved affiliate account required. Health claims must never be added to offers.',
};

const udemy: ProviderDefinition = {
  slug: 'udemy',
  name: 'Udemy Affiliate',
  authMethod: 'api_key',
  integrationType: 'api',
  requiredEnv: ['UDEMY_AFFILIATE_ID'],
  mappingVerified: false,
  docsUrl: 'https://www.udemy.com/affiliate/',
  rateLimitPerMinute: 30,
  defaultOfferType: 'course_deal',
  defaultVertical: 'courses',
  endpoints: {},
  complianceNotes: 'Course prices are set by Udemy and must come from the official feed.',
};

const clickbank: ProviderDefinition = {
  slug: 'clickbank',
  name: 'ClickBank',
  authMethod: 'api_key',
  integrationType: 'api',
  requiredEnv: ['CLICKBANK_ACCOUNT_ID', 'CLICKBANK_API_KEY'],
  mappingVerified: false,
  docsUrl: 'https://developers.clickbank.com/',
  rateLimitPerMinute: 30,
  defaultOfferType: 'software_deal',
  defaultVertical: 'software',
  endpoints: {},
  complianceNotes: 'Approved account required. Vendor promotional claims must not be altered.',
};

// ---------------------------------------------------------------------------
// Travel platforms
// ---------------------------------------------------------------------------

const trip: ProviderDefinition = {
  slug: 'trip',
  name: 'Trip.com Affiliate',
  authMethod: 'api_key',
  integrationType: 'api',
  requiredEnv: ['TRIP_COM_AFFILIATE_ID'],
  mappingVerified: false,
  docsUrl: 'https://affiliate.trip.com/',
  rateLimitPerMinute: 30,
  defaultOfferType: 'hotel_deal',
  defaultVertical: 'travel',
  endpoints: {},
  complianceNotes: 'Approved affiliate account required.',
};

const expedia: ProviderDefinition = {
  slug: 'expedia',
  name: 'Expedia Group Affiliate',
  authMethod: 'api_key',
  integrationType: 'api',
  requiredEnv: ['EXPEDIA_AFFILIATE_ID', 'EXPEDIA_API_KEY'],
  mappingVerified: false,
  docsUrl: 'https://developers.expediapartnersolutions.com/',
  rateLimitPerMinute: 30,
  defaultOfferType: 'hotel_deal',
  defaultVertical: 'travel',
  endpoints: {},
  complianceNotes: 'Rates and availability must come from the official API.',
};

const booking: ProviderDefinition = {
  slug: 'booking',
  name: 'Booking.com Affiliate',
  authMethod: 'api_key',
  integrationType: 'api',
  requiredEnv: ['BOOKING_COM_AFFILIATE_ID'],
  mappingVerified: false,
  docsUrl: 'https://www.booking.com/affiliate-program/v2/index.html',
  rateLimitPerMinute: 30,
  defaultOfferType: 'hotel_deal',
  defaultVertical: 'travel',
  endpoints: {},
  generateAffiliateLink: (url, creds) => {
    const target = new URL(url);
    target.searchParams.set('aid', creds.BOOKING_COM_AFFILIATE_ID ?? '');
    return target.toString();
  },
  complianceNotes: 'Screenshots and brand assets governed by the partner agreement.',
};

const agoda: ProviderDefinition = {
  slug: 'agoda',
  name: 'Agoda Affiliate',
  authMethod: 'api_key',
  integrationType: 'api',
  requiredEnv: ['AGODA_AFFILIATE_ID'],
  mappingVerified: false,
  docsUrl: 'https://www.agoda.com/affiliates/',
  rateLimitPerMinute: 30,
  defaultOfferType: 'hotel_deal',
  defaultVertical: 'travel',
  endpoints: {},
  complianceNotes: 'Approved affiliate account required.',
};

const klook: ProviderDefinition = {
  slug: 'klook',
  name: 'Klook Affiliate',
  authMethod: 'api_key',
  integrationType: 'api',
  requiredEnv: ['KLOOK_AFFILIATE_ID'],
  mappingVerified: false,
  docsUrl: 'https://www.klook.com/affiliate/',
  rateLimitPerMinute: 30,
  defaultOfferType: 'activity_deal',
  defaultVertical: 'travel',
  endpoints: {},
  complianceNotes: 'Approved affiliate account required.',
};

const discovercars: ProviderDefinition = {
  slug: 'discovercars',
  name: 'DiscoverCars Affiliate',
  authMethod: 'api_key',
  integrationType: 'api',
  requiredEnv: ['DISCOVERCARS_AFFILIATE_ID'],
  mappingVerified: false,
  docsUrl: 'https://www.discovercars.com/affiliate-program',
  rateLimitPerMinute: 30,
  defaultOfferType: 'car_rental_deal',
  defaultVertical: 'travel',
  endpoints: {},
  complianceNotes: 'Approved affiliate account required.',
};

/** Every real provider, in display order. */
export const PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  awin, impact, cj, rakuten, travelpayouts, feedico,
  aliexpress, temu, amazon, ebay, walmart, shein, iherb, udemy, clickbank,
  trip, expedia, booking, agoda, klook, discovercars,
];

export const PROVIDER_BY_SLUG = new Map(PROVIDER_DEFINITIONS.map((p) => [p.slug, p]));

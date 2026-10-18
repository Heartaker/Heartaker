import type {
  AffiliateConnector,
  ConnectionTestResult,
  FetchOptions,
  MerchantResult,
  OfferResult,
  TrackingMetadata,
  TransactionResult,
  RateLimitStatus,
} from './types';
import {
  ConnectorMappingUnverifiedError,
  ConnectorNotConfiguredError,
  ConnectorRequestError,
} from './types';
import { providerFetch, readJson, asArray, asString, asNumber, getPath, sanitizeError } from './http';
import {
  slugify,
  cleanText,
  maskSecret,
  normalizeCountryCodes,
  normalizeCurrency,
  parseDate,
  normalizeUrl,
} from '../normalize';
import { DISCOUNT_TYPES, OFFER_TYPES, type DiscountType, type NormalizedMerchant, type NormalizedOffer, type NormalizedTransaction, type OfferType, type SourceType, type Vertical } from '../types';

export type Credentials = Record<string, string | undefined>;

export interface EndpointSpec {
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
}

export interface RequestContext {
  creds: Credentials;
  options: FetchOptions;
}

/** Dotted-path map from the provider's response shape to our normalized record. */
export interface OfferFieldMap {
  externalId: string;
  merchantExternalId: string;
  title: string;
  shortDescription?: string;
  fullDescription?: string;
  couponCode?: string;
  destinationUrl: string;
  affiliateUrl?: string;
  imageUrl?: string;
  offerType?: string;
  discountValue?: string;
  discountType?: string;
  currency?: string;
  originalPrice?: string;
  finalPrice?: string;
  expiresAt?: string;
  startAt?: string;
  countries?: string;
  languages?: string;
  terms?: string;
  isExclusive?: string;
}

export interface MerchantFieldMap {
  externalId: string;
  name: string;
  website?: string;
  logo?: string;
  description?: string;
  countries?: string;
  currency?: string;
}

export interface ProviderDefinition {
  slug: string;
  name: string;
  authMethod: AffiliateConnector['authMethod'];
  integrationType: AffiliateConnector['integrationType'];
  requiredEnv: readonly string[];
  mappingVerified: boolean;
  docsUrl: string;
  rateLimitPerMinute: number;
  /** Default offer type when the provider does not distinguish. */
  defaultOfferType?: OfferType;
  defaultVertical?: Vertical;
  endpoints: {
    offers?: (ctx: RequestContext) => EndpointSpec | undefined;
    merchants?: (ctx: RequestContext) => EndpointSpec | undefined;
    transactions?: (ctx: RequestContext) => EndpointSpec | undefined;
  };
  /** Extract the array of records from a decoded response body. */
  extractItems?: (payload: unknown) => unknown[];
  /** Decide whether another page should be requested. */
  nextPage?: (payload: unknown, current: FetchOptions) => number | null;
  offerFieldMap?: OfferFieldMap;
  merchantFieldMap?: MerchantFieldMap;
  generateAffiliateLink?: (url: string, creds: Credentials, meta?: TrackingMetadata) => string;
  complianceNotes?: string;
}

/**
 * Generic HTTP-backed connector.
 *
 * Implements the full operational contract — credential detection, health
 * checks, pagination, rate limiting, retries, sanitized errors — and delegates
 * only the provider-specific request shape and field mapping to its definition.
 *
 * Honesty guarantee: if `mappingVerified` is false the connector refuses to
 * import anything, even with valid credentials present. We would rather return
 * a precise error than let an unverified mapping silently create bad offers.
 */
export class ProviderConnector implements AffiliateConnector {
  readonly providerId: string;
  readonly providerName: string;
  readonly providerSlug: string;
  readonly authMethod: AffiliateConnector['authMethod'];
  readonly integrationType: AffiliateConnector['integrationType'];
  readonly requiredEnv: readonly string[];
  readonly mappingVerified: boolean;
  readonly docsUrl: string;

  constructor(private readonly def: ProviderDefinition) {
    this.providerId = def.slug;
    this.providerSlug = def.slug;
    this.providerName = def.name;
    this.authMethod = def.authMethod;
    this.integrationType = def.integrationType;
    this.requiredEnv = def.requiredEnv;
    this.mappingVerified = def.mappingVerified;
    this.docsUrl = def.docsUrl;
  }

  // -------------------------------------------------------------------------
  // Credentials
  // -------------------------------------------------------------------------
  protected readCredentials(): Credentials {
    const creds: Credentials = {};
    for (const key of this.def.requiredEnv) creds[key] = process.env[key];
    return creds;
  }

  missingCredentials(): string[] {
    return this.def.requiredEnv.filter((key) => {
      const value = process.env[key];
      return typeof value !== 'string' || value.trim().length === 0;
    });
  }

  get configured(): boolean {
    return this.missingCredentials().length === 0;
  }

  secretValues(): string[] {
    return this.def.requiredEnv
      .map((k) => process.env[k])
      .filter((v): v is string => typeof v === 'string' && v.length >= 8);
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------
  async isEnabled(): Promise<boolean> {
    if (!this.configured) return false;
    const { queryOne } = await import('../db/index');
    const row = await queryOne<{ status: string }>(
      'SELECT status FROM affiliate_networks WHERE slug = $1',
      [this.providerSlug],
    );
    return row?.status === 'enabled';
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const checkedAt = new Date().toISOString();
    const credentials = this.def.requiredEnv.map((name) => ({
      name,
      configured: Boolean(process.env[name]),
      masked: maskSecret(process.env[name]),
    }));

    if (!this.configured) {
      return {
        ok: false,
        status: 'not_configured',
        message: `Missing environment variables: ${this.missingCredentials().join(', ')}.`,
        credentials,
        checkedAt,
      };
    }

    if (!this.def.mappingVerified) {
      return {
        ok: false,
        status: 'not_implemented',
        message:
          `Credentials found, but this connector's response mapping has not been verified ` +
          `against ${this.def.name}'s current API documentation. It will not import anything yet. ` +
          `See ${this.docsUrl}.`,
        credentials,
        checkedAt,
      };
    }

    // Credentials present and mapping verified → prove the credential works by
    // issuing the cheapest available request.
    try {
      const ctx: RequestContext = { creds: this.readCredentials(), options: { page: 1, limit: 1 } };
      const spec = this.def.endpoints.merchants?.(ctx) ?? this.def.endpoints.offers?.(ctx);
      if (!spec) {
        return {
          ok: false,
          status: 'not_implemented',
          message: 'No test endpoint is defined for this connector.',
          credentials,
          checkedAt,
        };
      }
      const started = Date.now();
      const response = await providerFetch(this.providerSlug, spec.url, {
        method: spec.method ?? 'GET',
        headers: spec.headers,
        body: spec.body,
        requestsPerMinute: this.def.rateLimitPerMinute,
        secrets: this.secretValues(),
        maxRetries: 0,
      });
      return {
        ok: true,
        status: 'healthy',
        message: `${this.def.name} responded with HTTP ${response.status}.`,
        latencyMs: Date.now() - started,
        credentials,
        checkedAt,
      };
    } catch (error) {
      const message =
        error instanceof ConnectorRequestError
          ? error.message
          : sanitizeError(error instanceof Error ? error.message : String(error), this.secretValues());
      return { ok: false, status: 'failing', message, credentials, checkedAt };
    }
  }

  // -------------------------------------------------------------------------
  // Data
  // -------------------------------------------------------------------------
  protected assertOperational(): void {
    if (!this.configured) {
      throw new ConnectorNotConfiguredError(this.providerSlug, this.missingCredentials());
    }
    if (!this.def.mappingVerified) {
      throw new ConnectorMappingUnverifiedError(this.providerSlug);
    }
  }

  async fetchMerchants(options: FetchOptions = {}): Promise<MerchantResult> {
    this.assertOperational();
    const map = this.def.merchantFieldMap;
    if (!map || !this.def.endpoints.merchants) {
      return { items: [], hasMore: false };
    }
    const ctx: RequestContext = { creds: this.readCredentials(), options };
    const spec = this.def.endpoints.merchants(ctx);
    if (!spec) return { items: [], hasMore: false };

    const response = await providerFetch(this.providerSlug, spec.url, {
      method: spec.method ?? 'GET',
      headers: spec.headers,
      body: spec.body,
      requestsPerMinute: this.def.rateLimitPerMinute,
      secrets: this.secretValues(),
    });
    const payload = await readJson(response);
    const items = (this.def.extractItems?.(payload) ?? asArray(payload))
      .map((raw) => this.normalizeMerchant(raw))
      .filter((m): m is NormalizedMerchant => Boolean(m?.name && m?.externalId));

    return { items, hasMore: false };
  }

  async fetchOffers(options: FetchOptions = {}): Promise<OfferResult> {
    this.assertOperational();
    if (!this.def.endpoints.offers) return { items: [], hasMore: false };

    const ctx: RequestContext = { creds: this.readCredentials(), options };
    const spec = this.def.endpoints.offers(ctx);
    if (!spec) return { items: [], hasMore: false };

    const response = await providerFetch(this.providerSlug, spec.url, {
      method: spec.method ?? 'GET',
      headers: spec.headers,
      body: spec.body,
      requestsPerMinute: this.def.rateLimitPerMinute,
      secrets: this.secretValues(),
    });
    const payload = await readJson(response);
    const rawItems = this.def.extractItems?.(payload) ?? asArray(payload);

    const items: NormalizedOffer[] = [];
    for (const raw of rawItems) {
      const offer = this.normalizeOffer(raw);
      if (offer.title && offer.destinationUrl && offer.externalId) items.push(offer);
    }

    const nextPage = this.def.nextPage?.(payload, options) ?? null;
    return { items, hasMore: nextPage !== null, nextPage };
  }

  async fetchTransactions(options: FetchOptions = {}): Promise<TransactionResult> {
    this.assertOperational();
    if (!this.def.endpoints.transactions) return { items: [], hasMore: false };
    const ctx: RequestContext = { creds: this.readCredentials(), options };
    const spec = this.def.endpoints.transactions(ctx);
    if (!spec) return { items: [], hasMore: false };
    const response = await providerFetch(this.providerSlug, spec.url, {
      method: spec.method ?? 'GET',
      headers: spec.headers,
      body: spec.body,
      requestsPerMinute: this.def.rateLimitPerMinute,
      secrets: this.secretValues(),
    });
    const payload = await readJson(response);
    const items = (this.def.extractItems?.(payload) ?? asArray(payload))
      .map((raw) => this.normalizeTransaction(raw))
      .filter((t): t is NormalizedTransaction => Boolean(t?.externalTransactionId));
    return { items, hasMore: false };
  }

  // -------------------------------------------------------------------------
  // Links
  // -------------------------------------------------------------------------
  async generateAffiliateLink(url: string, metadata: TrackingMetadata = {}): Promise<string> {
    if (this.def.generateAffiliateLink) {
      return this.def.generateAffiliateLink(url, this.readCredentials(), metadata);
    }
    // Fall back to appending our own tracking parameters. Never append
    // personal data — `subId` is an opaque identifier.
    const target = new URL(url);
    if (metadata.subId) target.searchParams.set('utm_campaign', 'dealpass');
    if (metadata.subId) target.searchParams.set('subid', metadata.subId);
    if (metadata.offerId) target.searchParams.set('utm_content', metadata.offerId);
    target.searchParams.set('utm_source', 'dealpass');
    target.searchParams.set('utm_medium', 'affiliate');
    return target.toString();
  }

  // -------------------------------------------------------------------------
  // Normalization
  // -------------------------------------------------------------------------
  normalizeMerchant(rawMerchant: unknown): NormalizedMerchant {
    const map = this.def.merchantFieldMap;
    if (!map) throw new ConnectorMappingUnverifiedError(this.providerSlug);
    const name = asString(getPath(rawMerchant, map.name)) ?? '';
    return {
      externalId: asString(getPath(rawMerchant, map.externalId)) ?? slugify(name),
      name,
      slug: slugify(name),
      logoUrl: map.logo ? asString(getPath(rawMerchant, map.logo)) ?? null : null,
      shortDescription: map.description
        ? cleanText(asString(getPath(rawMerchant, map.description)))
        : null,
      officialWebsiteUrl: map.website ? asString(getPath(rawMerchant, map.website)) ?? null : null,
      countryCodes: map.countries
        ? normalizeCountryCodes(asString(getPath(rawMerchant, map.countries)))
        : [],
      defaultCurrency: normalizeCurrency(
        asString(getPath(rawMerchant, map.currency ?? '')) ?? undefined,
        'EUR',
      ),
      supportedLanguages: ['fr', 'en', 'ar'],
      vertical: this.def.defaultVertical ?? 'shopping',
    };
  }

  normalizeOffer(rawOffer: unknown): NormalizedOffer {
    const map = this.def.offerFieldMap;
    if (!map) throw new ConnectorMappingUnverifiedError(this.providerSlug);

    const rawType = (map.offerType ? asString(getPath(rawOffer, map.offerType)) : undefined) ?? '';
    const offerType = (OFFER_TYPES as readonly string[]).includes(rawType)
      ? (rawType as OfferType)
      : (this.def.defaultOfferType ?? 'coupon_code');

    const rawDiscountType = map.discountType
      ? asString(getPath(rawOffer, map.discountType))
      : undefined;
    const discountType: DiscountType = (DISCOUNT_TYPES as readonly string[]).includes(
      rawDiscountType ?? '',
    )
      ? (rawDiscountType as DiscountType)
      : 'unknown';

    const destinationUrl = asString(getPath(rawOffer, map.destinationUrl)) ?? '';
    const sourceType: SourceType =
      this.def.integrationType === 'api'
        ? 'api'
        : this.def.integrationType === 'feed'
          ? 'feed'
          : this.def.integrationType === 'csv'
            ? 'csv'
            : this.def.integrationType === 'webhook'
              ? 'webhook'
              : 'manual';

    return {
      externalId: asString(getPath(rawOffer, map.externalId)) ?? '',
      merchantExternalId: asString(getPath(rawOffer, map.merchantExternalId)) ?? '',
      title: cleanText(asString(getPath(rawOffer, map.title))) ?? '',
      shortDescription: map.shortDescription
        ? cleanText(asString(getPath(rawOffer, map.shortDescription)))
        : null,
      fullDescription: map.fullDescription
        ? cleanText(asString(getPath(rawOffer, map.fullDescription)))
        : null,
      couponCode: map.couponCode ? asString(getPath(rawOffer, map.couponCode)) ?? null : null,
      offerType,
      discountType,
      discountValue: map.discountValue ? asNumber(getPath(rawOffer, map.discountValue)) ?? null : null,
      currency: normalizeCurrency(asString(getPath(rawOffer, map.currency ?? '')) ?? undefined, 'EUR'),
      originalPrice: map.originalPrice
        ? asNumber(getPath(rawOffer, map.originalPrice)) ?? null
        : null,
      finalPrice: map.finalPrice ? asNumber(getPath(rawOffer, map.finalPrice)) ?? null : null,
      destinationUrl: normalizeUrl(destinationUrl) || destinationUrl,
      affiliateUrl: map.affiliateUrl ? asString(getPath(rawOffer, map.affiliateUrl)) ?? null : null,
      imageUrl: map.imageUrl ? asString(getPath(rawOffer, map.imageUrl)) ?? null : null,
      startAt: map.startAt ? parseDate(getPath(rawOffer, map.startAt)) : null,
      expiresAt: map.expiresAt ? parseDate(getPath(rawOffer, map.expiresAt)) : null,
      countryCodes: map.countries
        ? normalizeCountryCodes(asString(getPath(rawOffer, map.countries)))
        : [],
      languageCodes: ['fr', 'en', 'ar'],
      termsAndConditions: map.terms ? cleanText(asString(getPath(rawOffer, map.terms))) : null,
      isExclusive: map.isExclusive ? Boolean(getPath(rawOffer, map.isExclusive)) : false,
      sourceType,
      sourceReference: `${this.def.slug}:${asString(getPath(rawOffer, map.externalId)) ?? ''}`,
    };
  }

  normalizeTransaction(rawTransaction: unknown): NormalizedTransaction {
    return {
      externalTransactionId:
        asString(getPath(rawTransaction, 'id')) ??
        asString(getPath(rawTransaction, 'transactionId')) ??
        '',
      merchantExternalId: asString(getPath(rawTransaction, 'merchantId')) ?? null,
      offerExternalId: asString(getPath(rawTransaction, 'offerId')) ?? null,
      clickSubId: asString(getPath(rawTransaction, 'subId')) ?? null,
      orderValue: asNumber(getPath(rawTransaction, 'orderValue')) ?? null,
      commissionAmount: asNumber(getPath(rawTransaction, 'commission')) ?? null,
      currency: normalizeCurrency(asString(getPath(rawTransaction, 'currency')) ?? undefined, 'EUR'),
      status: 'pending',
      transactionAt: parseDate(getPath(rawTransaction, 'transactionAt')),
      raw: rawTransaction,
    };
  }

  async getRateLimitStatus(): Promise<RateLimitStatus> {
    return {
      remaining: this.def.rateLimitPerMinute,
      limit: this.def.rateLimitPerMinute,
    };
  }
}

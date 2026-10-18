import type {
  NormalizedMerchant,
  NormalizedOffer,
  NormalizedTransaction,
} from '../types';

/** Options accepted by every fetch method. */
export interface FetchOptions {
  /** Cursor / page token supplied by the connector's own pagination state. */
  cursor?: string;
  /** Page number for offset-based providers. */
  page?: number;
  /** Items per page. */
  limit?: number;
  /** Only fetch records modified since this date. */
  since?: Date;
  /** Country filter passed straight through to the provider when supported. */
  country?: string;
}

export interface Paginated<T> {
  items: T[];
  /** Next cursor, or null when the last page was reached. */
  nextCursor?: string | null;
  nextPage?: number | null;
  hasMore: boolean;
}

export type MerchantResult = Paginated<NormalizedMerchant>;
export type OfferResult = Paginated<NormalizedOffer>;
export type TransactionResult = Paginated<NormalizedTransaction>;

export interface ConnectionTestResult {
  ok: boolean;
  status: 'healthy' | 'degraded' | 'failing' | 'not_configured' | 'not_implemented';
  message: string;
  latencyMs?: number;
  /** Masked view of which credentials were found. Never contains values. */
  credentials?: Array<{ name: string; configured: boolean; masked: string | null }>;
  checkedAt: string;
}

export interface RateLimitStatus {
  remaining: number;
  limit: number;
  resetAt?: string;
}

export interface TrackingMetadata {
  subId?: string;
  offerId?: string;
  merchantId?: string;
  campaign?: string;
  clickId?: string;
}

export interface SyncCounters {
  imported: number;
  updated: number;
  rejected: number;
  expired: number;
  warnings: number;
}

/**
 * The contract every affiliate connector must implement — exactly the
 * interface named in the specification, plus the operational fields the
 * administration dashboard needs.
 *
 * Provider-specific logic never escapes the connector: the importer only ever
 * sees `Normalized*` records.
 */
export interface AffiliateConnector {
  // --- identity -----------------------------------------------------------
  readonly providerId: string;
  readonly providerName: string;
  readonly providerSlug: string;
  readonly authMethod: 'api_key' | 'oauth2' | 'basic' | 'signature' | 'none';
  readonly integrationType: 'api' | 'feed' | 'csv' | 'webhook' | 'manual' | 'demo';
  /** Environment variable names this connector needs. */
  readonly requiredEnv: readonly string[];

  /**
   * Whether this connector's response mapping has been verified against the
   * provider's current official documentation. Connectors are never enabled
   * with an unverified mapping.
   */
  readonly mappingVerified: boolean;

  // --- lifecycle ----------------------------------------------------------
  isEnabled(): Promise<boolean>;
  testConnection(): Promise<ConnectionTestResult>;

  // --- data ---------------------------------------------------------------
  fetchMerchants(options?: FetchOptions): Promise<MerchantResult>;
  fetchOffers(options?: FetchOptions): Promise<OfferResult>;
  fetchTransactions?(options?: FetchOptions): Promise<TransactionResult>;

  // --- links --------------------------------------------------------------
  generateAffiliateLink?(url: string, metadata?: TrackingMetadata): Promise<string>;

  // --- normalization ------------------------------------------------------
  normalizeMerchant(rawMerchant: unknown): NormalizedMerchant;
  normalizeOffer(rawOffer: unknown): NormalizedOffer;
  normalizeTransaction?(rawTransaction: unknown): NormalizedTransaction;

  // --- operational --------------------------------------------------------
  getRateLimitStatus?(): Promise<RateLimitStatus>;
}

/** Thrown when a connector is asked to work without its credentials. */
export class ConnectorNotConfiguredError extends Error {
  constructor(public readonly providerSlug: string, public readonly missing: string[]) {
    super(
      `Connector "${providerSlug}" is not configured. Missing: ${missing.join(', ')}. ` +
        `Add them to the environment, then enable the connector in the dashboard.`,
    );
    this.name = 'ConnectorNotConfiguredError';
  }
}

/**
 * Thrown when a connector has credentials but its provider-specific response
 * mapping has not yet been verified. Keeps us from implying a live integration
 * that we have not actually proven.
 */
export class ConnectorMappingUnverifiedError extends Error {
  constructor(public readonly providerSlug: string) {
    super(
      `Connector "${providerSlug}" has credentials but its response mapping is not verified. ` +
        `Confirm the field mapping against the provider's current documentation, then set ` +
        `mappingVerified = true in src/lib/connectors/providers.ts.`,
    );
    this.name = 'ConnectorMappingUnverifiedError';
  }
}

export class ConnectorRequestError extends Error {
  constructor(
    public readonly providerSlug: string,
    public readonly status: number | null,
    message: string,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'ConnectorRequestError';
  }
}

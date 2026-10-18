import { ConnectorRequestError } from './types';

/**
 * Hardened HTTP client for affiliate connectors.
 *
 * Provides, for every outbound provider call:
 *   • a per-connector token-bucket rate limiter
 *   • bounded retries with exponential backoff + full jitter
 *   • honouring of `Retry-After` (seconds or HTTP date)
 *   • total timeout enforcement
 *   • secret scrubbing from every error message
 */

interface Bucket {
  tokens: number;
  lastRefill: number;
  max: number;
  refillPerSecond: number;
}

const buckets = new Map<string, Bucket>();

function refill(bucket: Bucket): void {
  const now = Date.now();
  const elapsedSeconds = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(bucket.max, bucket.tokens + elapsedSeconds * bucket.refillPerSecond);
  bucket.lastRefill = now;
}

/**
 * Wait until the connector has a token available.
 * `requestsPerMinute` defaults to a conservative 30.
 */
export async function acquireRateLimit(providerSlug: string, requestsPerMinute = 30): Promise<void> {
  let bucket = buckets.get(providerSlug);
  if (!bucket) {
    bucket = { tokens: requestsPerMinute, lastRefill: Date.now(), max: requestsPerMinute, refillPerSecond: requestsPerMinute / 60 };
    buckets.set(providerSlug, bucket);
  }
  refill(bucket);
  if (bucket.tokens < 1) {
    const waitMs = ((1 - bucket.tokens) / bucket.refillPerSecond) * 1000;
    await sleep(Math.min(waitMs, 60_000));
    refill(bucket);
  }
  bucket.tokens -= 1;
}

export function resetRateLimit(providerSlug: string): void {
  buckets.delete(providerSlug);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return undefined;
}

/**
 * Remove anything resembling a credential from a string before it is logged,
 * stored in `sync_logs.error_message`, or returned to a client.
 */
export function sanitizeError(message: string, secrets: readonly (string | undefined)[] = []): string {
  let out = message;
  for (const secret of secrets) {
    if (secret && secret.length >= 8) {
      out = out.split(secret).join('[REDACTED]');
    }
  }
  // Structural scrubbing in case a secret leaks via a query string or JSON body.
  out = out
    .replace(/(api[_-]?key|token|secret|password|signature|authorization)["'\s:=]+[^\s,"'&}]+/gi, '$1=[REDACTED]')
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._\-+/=]+/gi, '$1 [REDACTED]')
    .replace(/([?&](?:api_?key|token|secret|signature|password|access_token)=)[^&\s]+/gi, '$1[REDACTED]');
  return out;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT';
  headers?: Record<string, string>;
  body?: string;
  /** Total timeout for a single attempt, including body read. */
  timeoutMs?: number;
  maxRetries?: number;
  requestsPerMinute?: number;
  /** Secrets to scrub from error messages. */
  secrets?: readonly (string | undefined)[];
}

const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

/**
 * Performs an HTTP request with rate limiting, retries and sanitized errors.
 * Never throws an unsanitized message.
 */
export async function providerFetch(
  providerSlug: string,
  url: string,
  options: RequestOptions = {},
): Promise<Response> {
  const {
    method = 'GET',
    headers = {},
    body,
    timeoutMs = 20_000,
    maxRetries = 3,
    requestsPerMinute = 30,
    secrets = [],
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    await acquireRateLimit(providerSlug, requestsPerMinute);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers: { accept: 'application/json', ...headers },
        body,
        signal: controller.signal,
        redirect: 'follow',
      });

      if (response.ok) return response;

      const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));

      // 429/503 → back off. 4xx other than 408/425/429 are terminal.
      if (RETRYABLE_STATUSES.has(response.status) && attempt < maxRetries) {
        const base = retryAfterMs ?? 500 * 2 ** attempt;
        const jitter = Math.random() * base * 0.3;
        await sleep(Math.min(base + jitter, 30_000));
        continue;
      }

      const text = await response.text().catch(() => '');
      throw new ConnectorRequestError(
        providerSlug,
        response.status,
        sanitizeError(`HTTP ${response.status} ${response.statusText}: ${text.slice(0, 400)}`, secrets),
        retryAfterMs,
      );
    } catch (error) {
      lastError = error;
      if (error instanceof ConnectorRequestError && !RETRYABLE_STATUSES.has(error.status ?? 0)) {
        throw error;
      }
      const isAbort = error instanceof Error && error.name === 'AbortError';
      if (attempt >= maxRetries) {
        const message = isAbort
          ? `Request timed out after ${timeoutMs}ms`
          : error instanceof Error
            ? error.message
            : String(error);
        throw new ConnectorRequestError(providerSlug, null, sanitizeError(message, secrets));
      }
      const base = 500 * 2 ** attempt;
      await sleep(Math.min(base + Math.random() * base * 0.3, 30_000));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new ConnectorRequestError(providerSlug, null, 'Request failed after retries');
}

/** Safely parse a JSON response, returning null instead of throwing. */
export async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** Read a value from a nested object using a dotted path. */
export function getPath(source: unknown, path: string): unknown {
  if (!source || typeof source !== 'object') return undefined;
  let current: unknown = source;
  for (const segment of path.split('.')) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/** Coerce an unknown value to a trimmed string, or undefined. */
export function asString(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

export function asNumber(value: unknown): number | undefined {
  if (value == null) return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') {
    // Handles "12,50", "12.50", "1 250", "20%"
    const cleaned = value.replace(/\s/g, '').replace(',', '.').replace('%', '');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    for (const key of ['items', 'data', 'results', 'records', 'offers', 'coupons', 'promotions']) {
      const nested = (value as Record<string, unknown>)[key];
      if (Array.isArray(nested)) return nested;
    }
  }
  return [];
}

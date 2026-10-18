import type { NextRequest } from 'next/server';

/**
 * Extract the client IP for rate-limiting and fraud heuristics only.
 * The value is NEVER stored directly — `recordClick` reduces it to a salted,
 * day-rotating hash before it reaches the database.
 */
export function clientIpFrom(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return request.headers.get('x-real-ip');
}

/** Small in-memory rate limiter, suitable for a single instance. */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    const fresh = { count: 1, resetAt: now + windowMs };
    buckets.set(key, fresh);
    return { allowed: true, remaining: limit - 1, resetAt: fresh.resetAt };
  }
  bucket.count += 1;
  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
  };
}

/** Periodic cleanup so the map cannot grow without bound. */
export function pruneRateLimits(): void {
  const now = Date.now();
  for (const [key, value] of buckets) {
    if (value.resetAt <= now) buckets.delete(key);
  }
}

/** Build a rate-limit key from an IP plus an action name. */
export function rateLimitKey(request: NextRequest, action: string): string {
  return `${action}:${clientIpFrom(request) ?? 'unknown'}`;
}

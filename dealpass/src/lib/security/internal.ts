import { headers } from 'next/headers';
import { timingSafeEqual } from 'node:crypto';

/**
 * Guards the internal automation endpoints that n8n calls.
 *
 * A single shared token is compared in constant time so the endpoint cannot be
 * probed byte-by-byte. If the token is not configured the endpoint refuses
 * every request — automation is opt-in, never accidentally open.
 */

const HEADER = 'x-dealpass-internal-token';

function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export async function isInternalCaller(): Promise<boolean> {
  const configured = process.env.INTERNAL_API_TOKEN;
  if (!configured || configured.length < 24) return false;

  const store = await headers();
  const provided = store.get(HEADER);
  if (!provided) return false;

  return safeEqual(provided, configured);
}

export function internalTokenConfigured(): boolean {
  const configured = process.env.INTERNAL_API_TOKEN;
  return Boolean(configured && configured.length >= 24);
}

/** Standard 401 body for the internal endpoints. */
export function unauthorizedResponse(): Response {
  const body = internalTokenConfigured()
    ? 'Invalid or missing internal token.'
    : 'INTERNAL_API_TOKEN is not configured. Automation endpoints are disabled until it is set to at least 24 characters.';
  return new Response(JSON.stringify({ error: body }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  });
}

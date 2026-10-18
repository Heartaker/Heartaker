import type { AffiliateConnector } from './types';
import { ProviderConnector } from './base';
import { PROVIDER_DEFINITIONS, PROVIDER_BY_SLUG } from './providers';
import { DemoConnector } from './demo';

/**
 * Single registry of every connector in the system.
 *
 * Adding a provider is a two-step change: define it in `providers.ts` and (if
 * it is not HTTP-based) add its class here. Nothing else in the application
 * needs to know the connector exists.
 */

let cache: AffiliateConnector[] | null = null;

export function allConnectors(): AffiliateConnector[] {
  cache ??= [
    ...PROVIDER_DEFINITIONS.map((def) => new ProviderConnector(def)),
    new DemoConnector(),
  ];
  return cache;
}

export function getConnector(slug: string): AffiliateConnector | null {
  return allConnectors().find((c) => c.providerSlug === slug) ?? null;
}

/** Connectors whose credentials are present in the environment. */
export function configuredConnectors(): AffiliateConnector[] {
  return allConnectors().filter((c) => {
    if (c instanceof ProviderConnector) return c.configured;
    return true; // demo connector needs no credentials
  });
}

/**
 * Connectors that can actually import right now: enabled in the database AND
 * (for HTTP providers) fully configured with a verified mapping.
 */
export async function operationalConnectors(): Promise<AffiliateConnector[]> {
  const { query } = await import('../db/index');
  const enabled = new Set(
    (
      await query<{ slug: string }>(
        `SELECT slug FROM affiliate_networks WHERE status = 'enabled'`,
      )
    ).map((r) => r.slug),
  );

  return allConnectors().filter((c) => {
    if (!enabled.has(c.providerSlug)) return false;
    if (c instanceof ProviderConnector) return c.configured && c.mappingVerified;
    return true;
  });
}

export { PROVIDER_BY_SLUG, ProviderConnector };

/** Credential status for the administration dashboard. Never returns values. */
export function connectorCredentialStatus(): Array<{
  slug: string;
  name: string;
  requiredEnv: readonly string[];
  configured: boolean;
  missing: string[];
  mappingVerified: boolean;
  docsUrl: string | undefined;
}> {
  return allConnectors().map((c) => {
    const missing =
      c instanceof ProviderConnector ? c.missingCredentials() : [];
    return {
      slug: c.providerSlug,
      name: c.providerName,
      requiredEnv: c.requiredEnv,
      configured: missing.length === 0,
      missing,
      mappingVerified: c.mappingVerified,
      docsUrl: c instanceof ProviderConnector ? (c as unknown as { docsUrl: string }).docsUrl : undefined,
    };
  });
}

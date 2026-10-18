import { describe, it, expect } from 'vitest';
import { allConnectors, getConnector, configuredConnectors, connectorCredentialStatus } from '@/lib/connectors/registry';
import { DemoConnector } from '@/lib/connectors/demo';
import { PROVIDER_BY_SLUG } from '@/lib/connectors/registry';

/**
 * The honesty tests.
 *
 * The specification is explicit: never claim an unavailable integration is
 * active, and never invent commercial information. These assertions are what
 * stop a future change from quietly turning on a connector that has no
 * credentials and no verified mapping.
 */
describe('connector registry', () => {
  it('registers every provider', () => {
    expect(allConnectors().length).toBeGreaterThan(15);
  });

  it('resolves a connector by slug', () => {
    expect(getConnector('demo')).toBeTruthy();
  });

  it('returns null for an unknown slug rather than throwing', () => {
    expect(getConnector('definitely-not-a-network')).toBeNull();
  });

  it('reports credential status with presence flags only, never a value', () => {
    const ALLOWED_KEYS = [
      'slug',
      'name',
      'requiredEnv',
      'configured',
      'missing',
      'mappingVerified',
      'docsUrl',
    ].sort();

    for (const status of connectorCredentialStatus()) {
      // The shape is closed: if a future change adds a field carrying an
      // actual credential value, this assertion fails the build.
      expect(Object.keys(status).sort(), `${status.slug} exposes an unexpected field`).toEqual(
        ALLOWED_KEYS,
      );

      // `missing` holds variable *names*, never values.
      for (const name of status.missing) {
        expect(name).toMatch(/^[A-Z][A-Z0-9_]*$/);
      }
      expect(typeof status.configured).toBe('boolean');
      expect(typeof status.mappingVerified).toBe('boolean');
    }
  });

  it('marks the demo connector as configuration-complete', () => {
    const demo = connectorCredentialStatus().find((status) => status.slug === 'demo');
    expect(demo?.configured).toBe(true);
    expect(demo?.missing).toEqual([]);
  });
});

describe('demo connector', () => {
  const connector = new DemoConnector();

  it('identifies itself as fictional', async () => {
    expect(connector.providerName.toLowerCase()).toContain('demonstration');
    expect(connector.integrationType).toBe('demo');
  });

  it('contacts no external service', async () => {
    const result = await connector.testConnection();
    expect(result.latencyMs).toBe(0);
    expect(result.message).toMatch(/no external service/i);
  });

  it('produces offers labelled as fictional in their own text', async () => {
    const { items } = await connector.fetchOffers({ limit: 50 });
    expect(items.length).toBeGreaterThan(0);
    for (const offer of items) {
      expect(offer.sourceType).toBe('demo');
      expect(offer.fullDescription ?? '').toMatch(/fictif|fictive|fictional|démonstration|demonstration/i);
    }
  });

  it('uses only example domains, never a real merchant', async () => {
    const { items } = await connector.fetchOffers({ limit: 50 });
    for (const offer of items) {
      expect(new URL(offer.destinationUrl).hostname).toMatch(/\.example$/);
    }
  });

  it('never ships a real brand logo', async () => {
    const { items } = await connector.fetchMerchants();
    expect(items.length).toBeGreaterThan(0);
    for (const merchant of items) {
      expect(merchant.logoUrl).toBeNull();
    }
  });

  it('supplies its catalogue taxonomy', async () => {
    const { items } = await connector.fetchOffers({ limit: 50 });
    const withCategories = items.filter((offer) => (offer.categorySlugs ?? []).length > 0);
    // Every generated offer belongs to a category; only the deliberate
    // edge-case records are intentionally left unclassified.
    expect(withCategories.length).toBeGreaterThan(items.length * 0.8);
  });

  it('supplies text in all three supported languages', async () => {
    const { items } = await connector.fetchOffers({ limit: 50 });
    const trilingual = items.filter((offer) =>
      ['fr', 'en', 'ar'].every((code) => Boolean(offer.translations?.[code]?.title)),
    );
    expect(trilingual.length).toBeGreaterThan(items.length * 0.8);
  });

  it('produces deterministic output for the same seed', async () => {
    const a = await new DemoConnector(42).fetchOffers({ limit: 50 });
    const b = await new DemoConnector(42).fetchOffers({ limit: 50 });
    expect(a.items.map((offer) => offer.title)).toEqual(b.items.map((offer) => offer.title));
  });
});

describe('provider definitions', () => {
  it('declares the credentials each provider needs', () => {
    for (const provider of Object.values(PROVIDER_BY_SLUG)) {
      expect(Array.isArray(provider.requiredEnv)).toBe(true);
    }
  });

  it('never marks a mapping as verified without documentation', () => {
    // Only the local demo connector can claim a verified mapping: it reads
    // data it generates itself. Every real provider ships unverified until
    // someone checks it against the official API documentation.
    for (const [slug, provider] of Object.entries(PROVIDER_BY_SLUG)) {
      if (slug === 'demo') continue;
      expect(provider.mappingVerified, `${slug} must not claim a verified mapping`).toBe(false);
    }
  });
});

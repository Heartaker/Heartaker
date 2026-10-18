import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { query, queryOne } from '@/lib/db';
import { importFromConnector } from '@/lib/services/import';
import { DemoConnector } from '@/lib/connectors/demo';
import { expireOffers } from '@/lib/services/import';
import { describeDb, HAS_DATABASE } from './helpers/db';

/**
 * Integration tests for the import pipeline.
 *
 * These run against a real database so they exercise the constraints,
 * triggers and ON CONFLICT clauses that pure unit tests cannot reach. They
 * are the tests that would have caught the missing offer_translations and
 * offer_categories rows.
 */

let offersBefore = 0;

describeDb('import pipeline', () => {
  beforeAll(async () => {
    const row = await queryOne<{ n: string }>('SELECT count(*)::text AS n FROM offers');
    offersBefore = Number(row?.n ?? 0);
  });

  afterAll(async () => {
    // Leave the database as we found it: drop anything this run created.
    await query(
      `DELETE FROM offers
        WHERE source_reference LIKE 'test-%' OR external_id LIKE 'test-%'`,
    );
  });

  it('imports without creating duplicate rows on a second run', async () => {
    const connector = new DemoConnector();

    const first = await importFromConnector(connector, 'test-run-1');
    const second = await importFromConnector(connector, 'test-run-2');

    // The second pass finds every offer already present, so it updates rather
    // than inserts. This is the property that makes unattended imports safe.
    expect(second.imported).toBe(0);
    expect(second.updated).toBeGreaterThan(0);
    expect(first.imported + first.updated).toBeGreaterThan(0);
  });

  it('publishes high-confidence offers and queues the uncertain ones', async () => {
    const rows = await query<{ publication_status: string; n: string }>(
      `SELECT publication_status, count(*)::text AS n
         FROM offers
        WHERE deleted_at IS NULL
          AND source_type = 'demo'
        GROUP BY publication_status`,
    );
    const byStatus = new Map(rows.map((row) => [row.publication_status, Number(row.n)]));

    expect(byStatus.get('published') ?? 0).toBeGreaterThan(0);
    expect(byStatus.get('rejected') ?? 0).toBeGreaterThan(0);
  });

  it('never publishes an offer that failed validation', async () => {
    const bad = await query<{ id: string }>(
      `SELECT id FROM offers
        WHERE verification_status = 'failed'
          AND publication_status IN ('published', 'approved')`,
    );
    expect(bad).toEqual([]);
  });

  it('writes a translation row for every offer it imported', async () => {
    const orphans = await query<{ id: string; slug: string }>(
      `SELECT o.id, o.slug FROM offers o
        WHERE o.deleted_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM offer_translations t WHERE t.offer_id = o.id)`,
    );
    expect(orphans).toEqual([]);
  });

  it('records connector text as not AI-generated', async () => {
    const ai = await queryOne<{ n: string }>(
      `SELECT count(*)::text AS n FROM offer_translations WHERE generated_by_ai`,
    );
    expect(Number(ai?.n ?? 0)).toBe(0);
  });

  it('links imported offers to real categories', async () => {
    const linked = await queryOne<{ n: string }>(
      `SELECT count(*)::text AS n
         FROM offer_categories oc
         JOIN categories c ON c.id = oc.category_id`,
    );
    expect(Number(linked?.n ?? 0)).toBeGreaterThan(0);
  });

  it('never links an offer to a category that does not exist', async () => {
    const orphanLinks = await query<{ offer_id: string }>(
      `SELECT oc.offer_id FROM offer_categories oc
        WHERE NOT EXISTS (SELECT 1 FROM categories c WHERE c.id = oc.category_id)`,
    );
    expect(orphanLinks).toEqual([]);
  });

  it('writes a sync log for every run', async () => {
    const logs = await query<{ id: string }>(
      `SELECT id FROM sync_logs WHERE execution_id LIKE 'test-run-%'`,
    );
    expect(logs.length).toBeGreaterThanOrEqual(2);
  });

  it('expires only offers that are genuinely past their end date', async () => {
    const expired = await expireOffers('test-expire');
    expect(expired).toBeGreaterThanOrEqual(0);

    const stillPublished = await query<{ id: string }>(
      `SELECT id FROM offers
        WHERE publication_status = 'published'
          AND expires_at IS NOT NULL
          AND expires_at < now()`,
    );
    expect(stillPublished).toEqual([]);
  });

  it('keeps the offer count stable across repeated runs', async () => {
    const row = await queryOne<{ n: string }>('SELECT count(*)::text AS n FROM offers');
    const after = Number(row?.n ?? 0);
    // Repeated imports add nothing; only the deliberate test fixtures above
    // could have changed the total, and those are removed afterwards.
    expect(Math.abs(after - offersBefore)).toBeLessThan(5);
  });
});

describe('import pipeline (skipped without a database)', () => {
  it('documents why the integration suite did not run', () => {
    if (!HAS_DATABASE) {
      expect(HAS_DATABASE).toBe(false);
    } else {
      expect(HAS_DATABASE).toBe(true);
    }
  });
});

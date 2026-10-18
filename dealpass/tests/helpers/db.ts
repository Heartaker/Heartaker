import { describe, it, expect, beforeAll } from 'vitest';

/**
 * Database availability probe.
 *
 * Integration tests need a live Postgres. Locally that is PGlite behind the
 * socket server on port 5433; in CI it is a service container. When neither
 * is present the database suite is skipped rather than failed — a missing
 * database is an environment problem, not a code defect.
 */
export const HAS_DATABASE = Boolean(process.env.DATABASE_URL);

/** Wraps a suite so it only registers when a database is reachable. */
export function describeDb(name: string, factory: () => void): void {
  if (HAS_DATABASE) {
    describe(`[db] ${name}`, factory);
  } else {
    describe.skip(`[db] ${name} (DATABASE_URL not set)`, factory);
  }
}

export { describe, it, expect, beforeAll };

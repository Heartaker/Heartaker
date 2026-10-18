import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * DealPass test configuration.
 *
 * Two projects:
 *   • `unit`   — pure functions, no database, no network. Always runs.
 *   • `db`     — integration tests against a real Postgres/PGlite instance.
 *                Skipped automatically when DATABASE_URL is absent, so the
 *                suite is useful in CI without provisioning a database.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    globals: false,
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    reporters: ['default'],
  },
});

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Load .env.local for the test run.
 *
 * Vitest does not read Next's env files, and the database-backed tests need
 * DATABASE_URL. Values already present in the environment win, so CI can
 * override anything.
 */
function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(resolve(process.cwd(), '.env.local'));
loadEnvFile(resolve(process.cwd(), '.env'));

// Tests must never touch a production database.
if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_PROD_TESTS) {
  throw new Error('Refusing to run tests against a production environment.');
}

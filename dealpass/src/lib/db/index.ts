/**
 * Database abstraction layer.
 *
 * Design goal: the application never talks to a vendor SDK. It only calls
 * `query()`, which is satisfied by one of two interchangeable drivers:
 *
 *   • PGlite  — real PostgreSQL 17 compiled to WebAssembly, persisted to disk.
 *               Zero setup. Used for local development and for the test suite.
 *   • pg      — node-postgres against a real PostgreSQL server (Supabase,
 *               Neon, RDS, self-hosted). Used for staging and production.
 *
 * Both drivers execute byte-identical SQL from `supabase/migrations/*.sql`,
 * so a migration that passes locally cannot silently fail in production.
 *
 * SECURITY: this module is server-only. It must never be imported from a
 * file marked "use client" — doing so would leak the connection credentials.
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export interface QueryResultRow {
  [column: string]: unknown;
}

export interface DbDriver {
  readonly name: 'pglite' | 'postgres';
  /** Parameterised query. Uses $1, $2 … placeholders. */
  query<T = QueryResultRow>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  /** Multi-statement script (migrations only). Uses the simple protocol. */
  exec(sql: string): Promise<void>;
  /** Run `fn` inside a single transaction; rolls back if it throws. */
  transaction<T>(fn: (tx: DbDriver) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Driver: PGlite
// ---------------------------------------------------------------------------

type PGliteLike = {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
  transaction<T>(fn: (tx: PGliteLike) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};

function createPgliteDriver(instance: PGliteLike): DbDriver {
  return {
    name: 'pglite',
    async query<T>(sql: string, params: readonly unknown[] = []) {
      const res = await instance.query<T>(sql, params as unknown[]);
      return res.rows;
    },
    async exec(sql: string) {
      await instance.exec(sql);
    },
    transaction<T>(fn: (tx: DbDriver) => Promise<T>) {
      return instance.transaction((tx) => fn(createPgliteDriver(tx)));
    },
    async close() {
      await instance.close();
    },
  };
}

// ---------------------------------------------------------------------------
// Driver: node-postgres
// ---------------------------------------------------------------------------

type PoolLike = {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  connect(): Promise<{
    query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
    release(): void;
  }>;
  end(): Promise<void>;
};

function createPostgresDriver(pool: PoolLike): DbDriver {
  return {
    name: 'postgres',
    async query<T>(sql: string, params: readonly unknown[] = []) {
      const res = await pool.query<T>(sql, params as unknown[]);
      return res.rows;
    },
    async exec(sql: string) {
      await pool.query(sql);
    },
    async transaction<T>(fn: (tx: DbDriver) => Promise<T>) {
      const client = await pool.connect();
      const tx: DbDriver = {
        name: 'postgres',
        async query<R>(sql: string, params: readonly unknown[] = []) {
          const res = await client.query<R>(sql, params as unknown[]);
          return res.rows;
        },
        async exec(sql: string) {
          await client.query(sql);
        },
        transaction<R>(inner: (t: DbDriver) => Promise<R>) {
          return inner(tx);
        },
        async close() {
          /* managed by the caller */
        },
      };
      try {
        await client.query('BEGIN');
        const result = await fn(tx);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

declare global {
  // eslint-disable-next-line no-var
  var __dealpassDb: Promise<DbDriver> | undefined;
}

async function createDriver(): Promise<DbDriver> {
  const url = process.env.DATABASE_URL?.trim();

  if (url) {
    const { Pool } = await import('pg');

    // TLS is on by default — a database connection should never be plaintext
    // by accident. It is disabled only for explicit local addresses, or when
    // DATABASE_SSL is set to "false".
    const host = safeHostname(url);
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    const sslEnv = process.env.DATABASE_SSL?.toLowerCase();
    const useSsl = sslEnv ? sslEnv === 'true' : !isLocal;

    // The local PGlite socket server serialises queries and supports a single
    // connection at a time, so opening more than one actively breaks it.
    // Supabase and other hosted databases want a real pool.
    const defaultMax = isLocal ? 1 : 10;

    const pool = new Pool({
      connectionString: url,
      max: Number(process.env.DATABASE_POOL_MAX ?? defaultMax),
      ssl: useSsl ? { rejectUnauthorized: process.env.DATABASE_SSL_INSECURE !== 'true' } : undefined,
      connectionTimeoutMillis: 15_000,
      idleTimeoutMillis: 30_000,
    });

    // Without this listener a dropped backend connection raises an unhandled
    // 'error' event and takes the process down.
    pool.on('error', (error: Error) => {
      console.error('[db] idle client error:', error.message);
    });

    return createPostgresDriver(pool as unknown as PoolLike);
  }

  const { PGlite } = await import('@electric-sql/pglite');
  const dataDir = path.resolve(process.cwd(), process.env.PGLITE_DATA_DIR ?? '.data/pglite');
  // PGlite's Node filesystem layer calls mkdirSync without `recursive`, so the
  // parent directory has to exist first.
  const { mkdirSync } = await import('node:fs');
  mkdirSync(path.dirname(dataDir), { recursive: true });
  const instance = await PGlite.create({ dataDir });
  return createPgliteDriver(instance as unknown as PGliteLike);
}

export function getDb(): Promise<DbDriver> {
  globalThis.__dealpassDb ??= createDriver();
  return globalThis.__dealpassDb;
}

/** Convenience wrapper used across the service layer. */
export async function query<T = QueryResultRow>(
  sql: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  const db = await getDb();
  return db.query<T>(sql, params);
}

export async function queryOne<T = QueryResultRow>(
  sql: string,
  params: readonly unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export async function transaction<T>(fn: (tx: DbDriver) => Promise<T>): Promise<T> {
  const db = await getDb();
  return db.transaction(fn);
}

/**
 * Run a query as a specific database role. Used by the RLS test-suite to prove
 * that an anonymous visitor cannot read unpublished rows.
 * Never call this with user-supplied input.
 */
export async function asRole<T = QueryResultRow>(
  role: 'anon' | 'authenticated',
  sql: string,
  params: readonly unknown[] = [],
  userId?: string | null,
): Promise<T[]> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    await tx.query(`SET LOCAL ROLE ${role === 'anon' ? 'anon' : 'authenticated'}`);
    if (userId) {
      await tx.query(`SET LOCAL dealpass.user_id = '${userId.replace(/'/g, '')}'`);
    }
    return tx.query<T>(sql, params);
  });
}

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------

const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations');

export async function ensureSchemaTracking(db: DbDriver): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

/**
 * Applies every pending migration in filename order, each inside its own
 * transaction. Already-applied files are skipped, so this is idempotent and
 * safe to run on every boot.
 */
export async function runMigrations(): Promise<string[]> {
  const db = await getDb();
  await ensureSchemaTracking(db);

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const applied = new Set(
    (await db.query<{ filename: string }>('SELECT filename FROM schema_migrations')).map(
      (r) => r.filename,
    ),
  );

  const newlyApplied: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    try {
      await db.exec(`BEGIN;\n${sql}\nCOMMIT;`);
    } catch (error) {
      await db.exec('ROLLBACK;').catch(() => undefined);
      throw new Error(
        `Migration ${file} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    await db.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
    newlyApplied.push(file);
  }

  return newlyApplied;
}

/** Extract the hostname from a connection string without throwing on bad input. */
function safeHostname(connectionString: string): string {
  try {
    return new URL(connectionString.replace(/^postgres(ql)?:\/\//, 'http://')).hostname;
  } catch {
    return '';
  }
}

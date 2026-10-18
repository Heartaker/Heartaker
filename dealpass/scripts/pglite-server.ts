/**
 * Local PostgreSQL server for development.
 *
 * Runs PGlite (real PostgreSQL compiled to WebAssembly) behind a TCP socket
 * that speaks the standard PostgreSQL wire protocol. The application then
 * connects to it with the ordinary `pg` driver — the exact same code path it
 * uses against Supabase in production.
 *
 * Why this exists
 * ---------------
 * PGlite is a single-process embedded database. Next.js dev spawns several
 * worker processes, and every one of them opening the same data directory
 * leads to a corrupted or empty view of the data. Serving PGlite over a
 * socket from ONE process removes that class of bug entirely, and it means
 * local development and production run byte-identical SQL through the same
 * driver.
 *
 * Usage:  npm run db:server
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const PORT = Number(process.env.PGLITE_PORT ?? 5433);
const HOST = process.env.PGLITE_HOST ?? '127.0.0.1';
const DATA_DIR = path.resolve(process.cwd(), process.env.PGLITE_DATA_DIR ?? '.data/pglite');

async function main() {
  mkdirSync(path.dirname(DATA_DIR), { recursive: true });

  const db = await PGlite.create({ dataDir: DATA_DIR });
  const server = new PGLiteSocketServer({
    db,
    port: PORT,
    host: HOST,
    // The default is 1, which drops every extra connection. Next.js dev runs
    // several worker processes, each with its own pool, so we allow many
    // concurrent connections — the server's internal query queue still
    // serialises them, which is what PGlite actually requires.
    maxConnections: 50,
  });

  await server.start();

  console.log(`✅ PGlite is listening on ${HOST}:${PORT}`);
  console.log(`   data directory : ${DATA_DIR}`);
  console.log(`   connect with   : DATABASE_URL=postgres://postgres@${HOST}:${PORT}/postgres`);
  console.log('   Press Ctrl+C to stop.');

  const stop = async () => {
    console.log('\n⏹  Stopping PGlite…');
    try {
      await server.stop();
      await db.close();
    } catch {
      /* ignore shutdown races */
    }
    process.exit(0);
  };

  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((error) => {
  console.error('Failed to start PGlite server:', error);
  process.exit(1);
});

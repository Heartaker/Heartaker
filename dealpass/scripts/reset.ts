/**
 * Drop everything in the public schema and re-apply all migrations.
 *   npm run db:reset
 * Destructive — development use only.
 */
import { runMigrations, getDb, query } from '../src/lib/db';

async function main() {
  const db = await getDb();
  console.log(`▶ resetting database (driver: ${db.name})…`);
  await db.exec(`DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;`);
  console.log('✔ schema dropped');
  const applied = await runMigrations();
  console.log(`✔ applied ${applied.length} migrations`);
  await db.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

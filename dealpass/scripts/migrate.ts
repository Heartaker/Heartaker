/**
 * Apply all pending migrations.
 *   npm run db:migrate
 */
import { runMigrations, getDb, query } from '../src/lib/db/index';

async function main() {
  const applied = await runMigrations();
  if (applied.length === 0) {
    console.log('✔ Database already up to date.');
  } else {
    for (const f of applied) console.log(`✔ applied ${f}`);
  }

  const db = await getDb();
  console.log(`  driver: ${db.name}`);

  const tables = await query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
  );
  console.log(`  tables: ${tables.length}`);

  const rls = await query<{ relname: string; rowsecurity: boolean }>(
    `SELECT relname, relrowsecurity AS rowsecurity FROM pg_class
     WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND relrowsecurity = true`,
  );
  console.log(`  row-level security enabled on: ${rls.length} tables`);

  await db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Seed the database with the demonstration dataset.
 *   npm run db:seed
 *
 * Runs migrations first, then imports through the real connector pipeline —
 * the same code path an affiliate sync uses — so seeding also proves the
 * pipeline, the deduplication and the expiration workflow actually work.
 */
import { runMigrations, query, queryOne } from '../src/lib/db/index';
import { DemoConnector } from '../src/lib/connectors/demo';
import { importFromConnector, expireOffers } from '../src/lib/services/import';
import { hashPassword } from '../src/lib/auth/password';

async function clearDemoData() {
  await query(`DELETE FROM offers WHERE source_type = 'demo'`);
  await query(
    `DELETE FROM merchants m USING affiliate_networks n
      WHERE m.network_id = n.id AND n.slug = 'demo'`,
  );
  await query(`DELETE FROM sync_logs WHERE execution_id LIKE 'seed-%'`);
}

async function main() {
  await runMigrations();

  console.log('▶ clearing previous demonstration data…');
  await clearDemoData();

  const connector = new DemoConnector();

  console.log('▶ import #1 (fresh)…');
  const first = await importFromConnector(connector, `seed-${Date.now()}`);
  console.log(`  imported ${first.imported}  updated ${first.updated}  rejected ${first.rejected}  warnings ${first.warnings}`);

  console.log('▶ import #2 (identical payload — must create nothing)…');
  const second = await importFromConnector(connector, `seed-${Date.now()}`);
  console.log(`  imported ${second.imported}  updated ${second.updated}  rejected ${second.rejected}  warnings ${second.warnings}`);

  if (second.imported !== 0) {
    console.error(`  ✗ IDEMPOTENCY FAILURE: second import created ${second.imported} new offers.`);
    process.exit(1);
  }
  console.log('  ✓ idempotent — duplicate imports update in place');

  // ---- exercise the expiration workflow ----------------------------------
  // Nothing expires until time passes, so back-date a few published offers and
  // run the same workflow n8n would trigger nightly.
  console.log('▶ simulating the passage of time (back-dating 3 published offers)…');
  const aged = await query<{ id: string }>(
    `UPDATE offers SET expires_at = now() - interval '2 days'
      WHERE id IN (
        SELECT id FROM offers
         WHERE publication_status = 'published' AND deleted_at IS NULL
         ORDER BY published_at LIMIT 3
      )
      RETURNING id`,
  );
  console.log(`  back-dated ${aged.length} offers`);

  const expired = await expireOffers(`seed-expire-${Date.now()}`);
  console.log(`  ✓ expiration workflow moved ${expired} offers to "expired"`);

  // ---- demonstration administrator ---------------------------------------
  const email = 'admin@dealpass.example';
  const existing = await queryOne<{ id: string }>('SELECT id FROM profiles WHERE email = $1', [email]);
  if (!existing) {
    const role = await queryOne<{ id: string }>("SELECT id FROM roles WHERE slug = 'super_admin'");
    const passwordHash = await hashPassword('ChangeMe-2026!');
    await query(
      `INSERT INTO profiles (id, email, display_name, role_id, password_hash, email_verified_at, preferred_language)
       VALUES (gen_random_uuid(), $1, 'Demo Administrator', $2, $3, now(), 'fr')`,
      [email, role!.id, passwordHash],
    );
    console.log(`\n✔ created administrator ${email}`);
    console.log('  password: ChangeMe-2026!   ← change this immediately');
  }

  // ---- summary ------------------------------------------------------------
  const stats = await queryOne<Record<string, string>>(
    `SELECT
       (SELECT count(*)::text FROM offers WHERE deleted_at IS NULL)                        AS offers,
       (SELECT count(*)::text FROM offers WHERE publication_status = 'published')          AS published,
       (SELECT count(*)::text FROM offers WHERE publication_status = 'pending_validation') AS review_queue,
       (SELECT count(*)::text FROM offers WHERE publication_status = 'rejected')           AS rejected,
       (SELECT count(*)::text FROM offers WHERE publication_status = 'expired')            AS expired,
       (SELECT count(*)::text FROM offers WHERE publication_status = 'suspended')          AS suspended,
       (SELECT count(*)::text FROM merchants)                                              AS merchants,
       (SELECT count(*)::text FROM categories)                                             AS categories,
       (SELECT count(*)::text FROM affiliate_networks)                                     AS networks`,
  );
  console.log('\n  database summary:');
  for (const [k, v] of Object.entries(stats ?? {})) console.log(`    ${k.padEnd(14)} ${v}`);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

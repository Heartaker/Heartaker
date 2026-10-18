/**
 * Creates a signed-in session for the demonstration administrator and prints
 * the raw session token.
 *
 * This is a development convenience only. It exists because the admin area is
 * otherwise unreachable without walking the sign-in form, and because the
 * seeded password must be changed before any real deployment.
 *
 *   npx tsx --env-file-if-exists=.env.local scripts/dev-session.ts
 *
 * Then set the cookie in your browser:
 *   dealpass_session=<token>
 */
import pg from 'pg';
import crypto from 'node:crypto';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set. Start the database first (npm run db:server).');
  }

  const client = new pg.Client(url);
  await client.connect();

  const user = await client.query(
    "SELECT id FROM profiles WHERE email = 'admin@dealpass.example'",
  );
  if (user.rowCount === 0) {
    throw new Error('No admin user found. Run: npm run db:seed');
  }

  // Sessions are stored as a SHA-256 digest; the token itself is never kept.
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const ipHash = crypto.createHash('sha256').update('dev-session').digest('hex');

  await client.query(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at, ip_hash, user_agent)
     VALUES (gen_random_uuid(), $1, $2, now() + interval '7 days', $3, $4)`,
    [user.rows[0].id, tokenHash, ipHash, 'dev-session-script'],
  );

  console.log(token);
  await client.end();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

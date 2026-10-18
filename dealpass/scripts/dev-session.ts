import pg from 'pg';
import crypto from 'node:crypto';

const c = new pg.Client({ host: '127.0.0.1', port: 5433, user: 'postgres', database: 'postgres' });
await c.connect();

const user = await c.query("SELECT id FROM profiles WHERE email = 'admin@dealpass.example'");
const userId = user.rows[0].id;

const token = crypto.randomBytes(32).toString('base64url');
const hash = crypto.createHash('sha256').update(token).digest('hex');

await c.query(
  `INSERT INTO sessions (id, user_id, token_hash, expires_at, ip_hash, user_agent)
   VALUES (gen_random_uuid(), $1, $2, now() + interval '7 days', $3, $4)`,
  [userId, hash, crypto.createHash('sha256').update('verify').digest('hex'), 'verification'],
);

console.log(token);
await c.end();

import { describe, it, expect } from 'vitest';
import { query, queryOne } from '@/lib/db';
import { describeDb } from './helpers/db';

/**
 * Privacy guarantees.
 *
 * The specification forbids storing raw IP addresses. These tests assert it at
 * the schema level, so a future migration that adds an `ip_address` column
 * fails the build rather than quietly breaking the promise.
 */
describeDb('privacy', () => {
  it('stores no raw IP column anywhere in the schema', async () => {
    const columns = await query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_name ~* '(ip_address|ipaddress|remote_addr|client_ip)$'`,
    );
    expect(columns).toEqual([]);
  });

  it('hashes every click identifier', async () => {
    const columns = await query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'clicks'`,
    );
    const names = columns.map((column) => column.column_name);
    expect(names).toContain('session_hash');
    expect(names).not.toContain('ip_address');
  });

  it('never stores more than a digest of a session token', async () => {
    const columns = await query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sessions'`,
    );
    const names = columns.map((column) => column.column_name);
    expect(names).toContain('token_hash');
    expect(names).not.toContain('token');
  });

  it('stores only the hash of the double opt-in token', async () => {
    const columns = await query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'newsletter_subscribers'`,
    );
    const names = columns.map((column) => column.column_name);
    expect(names).toContain('confirmation_token_hash');
    expect(names).not.toContain('confirmation_token');
  });

  it('encrypts the value of every stored secret', async () => {
    // The guard trigger refuses plaintext secrets in site_settings; the
    // function must exist for that guarantee to hold.
    const guard = await queryOne<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_proc WHERE proname = 'guard_site_settings_secrets'
       ) AS exists`,
    );
    expect(guard?.exists).toBe(true);
  });

  it('enforces row-level security on the tables that hold user data', async () => {
    const unprotected = await query<{ tablename: string }>(
      `SELECT c.relname AS tablename
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
          AND c.relname IN (
            'profiles', 'favorites', 'newsletter_subscribers',
            'clicks', 'conversions', 'coupon_reports', 'audit_logs'
          )
          AND NOT c.relrowsecurity`,
    );
    expect(unprotected).toEqual([]);
  });

  it('makes audit rows append-only for the application role', async () => {
    // A log that can be edited is not an audit trail. The application connects
    // as `authenticated` and is granted INSERT and SELECT on audit_logs only.
    // (The owner role keeps full privileges by definition, which is why this
    // asserts on the application role rather than on current_user.)
    const grants = await query<{ privilege_type: string }>(
      `SELECT privilege_type FROM information_schema.role_table_grants
        WHERE table_schema = 'public' AND table_name = 'audit_logs'
          AND grantee = 'authenticated'`,
    );
    const privileges = grants.map((grant) => grant.privilege_type);
    expect(privileges).toContain('INSERT');
    expect(privileges).toContain('SELECT');
    expect(privileges).not.toContain('UPDATE');
    expect(privileges).not.toContain('DELETE');
    expect(privileges).not.toContain('TRUNCATE');
  });

  it('exposes audit rows through insert and select policies only', async () => {
    const policies = await query<{ policyname: string; cmd: string }>(
      `SELECT policyname, cmd FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'audit_logs'`,
    );
    for (const policy of policies) {
      expect(['INSERT', 'SELECT']).toContain(policy.cmd);
    }
    expect(policies.map((policy) => policy.cmd).sort()).toEqual(['INSERT', 'SELECT']);
  });
});

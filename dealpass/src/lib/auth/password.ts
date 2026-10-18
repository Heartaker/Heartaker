import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/**
 * Password hashing with scrypt (memory-hard, no external dependency).
 *
 * Format: `scrypt$<salt-hex>$<hash-hex>`
 *
 * NOTE: this exists so the platform is usable out of the box without any
 * third-party identity provider. For production, Supabase Auth (or another
 * managed IdP) is strongly recommended — see docs/AUTHENTICATION.md.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scryptAsync(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1]!, 'hex');
  const expected = Buffer.from(parts[2]!, 'hex');
  if (expected.length !== KEY_LENGTH) return false;
  const derived = await scryptAsync(password, salt, KEY_LENGTH);
  return timingSafeEqual(derived, expected);
}

/** Constant-time comparison helper used for tokens and signatures. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Minimum password policy applied by every auth form. */
export const PASSWORD_POLICY = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireDigit: true,
  requireSymbol: true,
} as const;

export interface PasswordCheck {
  ok: boolean;
  errors: string[];
}

export function checkPasswordPolicy(password: string): PasswordCheck {
  const errors: string[] = [];
  if (password.length < PASSWORD_POLICY.minLength) {
    errors.push(`Use at least ${PASSWORD_POLICY.minLength} characters.`);
  }
  if (PASSWORD_POLICY.requireUppercase && !/[A-Z]/.test(password)) errors.push('Add an uppercase letter.');
  if (PASSWORD_POLICY.requireLowercase && !/[a-z]/.test(password)) errors.push('Add a lowercase letter.');
  if (PASSWORD_POLICY.requireDigit && !/\d/.test(password)) errors.push('Add a digit.');
  if (PASSWORD_POLICY.requireSymbol && !/[^A-Za-z0-9]/.test(password)) errors.push('Add a symbol.');
  return { ok: errors.length === 0, errors };
}

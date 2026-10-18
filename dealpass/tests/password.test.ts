import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, checkPasswordPolicy } from '@/lib/auth/password';

describe('checkPasswordPolicy', () => {
  it('accepts a strong password', () => {
    expect(checkPasswordPolicy('ChangeMe-2026!').ok).toBe(true);
  });

  it('rejects a password shorter than 12 characters', () => {
    const result = checkPasswordPolicy('Ab1!xyz');
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/12/);
  });

  it('requires all four character classes', () => {
    expect(checkPasswordPolicy('alllowercaseletters').ok).toBe(false);
    expect(checkPasswordPolicy('ALLUPPERCASELETTERS').ok).toBe(false);
    expect(checkPasswordPolicy('MixedCaseWithoutDigits!').ok).toBe(false);
  });

  it('rejects an empty password', () => {
    expect(checkPasswordPolicy('').ok).toBe(false);
  });
});

describe('hashPassword / verifyPassword', () => {
  it('verifies a correct password', async () => {
    const hash = await hashPassword('ChangeMe-2026!');
    expect(await verifyPassword('ChangeMe-2026!', hash)).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('ChangeMe-2026!');
    expect(await verifyPassword('ChangeMe-2025!', hash)).toBe(false);
  });

  it('never stores the plaintext', async () => {
    const hash = await hashPassword('ChangeMe-2026!');
    expect(hash).not.toContain('ChangeMe-2026!');
  });

  it('produces a different hash for the same password', async () => {
    const a = await hashPassword('ChangeMe-2026!');
    const b = await hashPassword('ChangeMe-2026!');
    expect(a).not.toBe(b);
    expect(await verifyPassword('ChangeMe-2026!', a)).toBe(true);
    expect(await verifyPassword('ChangeMe-2026!', b)).toBe(true);
  });

  it('returns false rather than throwing for a missing hash', async () => {
    expect(await verifyPassword('anything', null)).toBe(false);
  });
});

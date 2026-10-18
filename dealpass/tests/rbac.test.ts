import { describe, it, expect } from 'vitest';
import { can, isStaff, canAny, assignableRoles } from '@/lib/auth/rbac';
import type { SessionUser } from '@/lib/auth/session';

function user(roleSlug: string, permissions: string[]): SessionUser {
  return {
    id: 'user-1',
    email: 'staff@dealpass.example',
    displayName: null,
    roleSlug,
    permissions,
    preferredLanguage: 'fr',
    preferredCountry: 'DZ',
    preferredCurrency: 'DZD',
  } as SessionUser;
}

describe('can', () => {
  it('denies everything to an anonymous visitor', () => {
    expect(can(null, 'offers.read')).toBe(false);
    expect(can(null, '')).toBe(false);
  });

  it('grants a permission the role holds', () => {
    expect(can(user('editor', ['offers.read', 'offers.update']), 'offers.update')).toBe(true);
  });

  it('denies a permission the role does not hold', () => {
    expect(can(user('editor', ['offers.read']), 'offers.delete')).toBe(false);
  });

  it('grants everything to super_admin', () => {
    expect(can(user('super_admin', []), 'settings.configure')).toBe(true);
    expect(can(user('super_admin', []), 'anything.at.all')).toBe(true);
  });

  it('does not grant super powers to a plain admin', () => {
    expect(can(user('admin', ['offers.read']), 'audit_logs.delete')).toBe(false);
  });
});

describe('canAny', () => {
  it('is true when at least one permission is held', () => {
    expect(canAny(user('editor', ['offers.read']), ['offers.delete', 'offers.read'])).toBe(true);
  });

  it('is false when none are held', () => {
    expect(canAny(user('editor', ['offers.read']), ['offers.delete'])).toBe(false);
  });
});

describe('isStaff', () => {
  it('treats registered users as non-staff', () => {
    expect(isStaff(user('registered_user', []))).toBe(false);
  });

  it('treats every operational role as staff', () => {
    for (const role of ['super_admin', 'admin', 'editor', 'reviewer', 'analyst', 'support']) {
      expect(isStaff(user(role, []))).toBe(true);
    }
  });

  it('rejects an anonymous visitor', () => {
    expect(isStaff(null)).toBe(false);
  });
});

describe('assignableRoles', () => {
  it('lets a super_admin grant every role', () => {
    expect(assignableRoles('super_admin')).toContain('super_admin');
  });

  it('never lets anyone else grant super_admin', () => {
    for (const role of ['admin', 'editor', 'reviewer', 'analyst', 'support']) {
      expect(assignableRoles(role)).not.toContain('super_admin');
    }
  });
});

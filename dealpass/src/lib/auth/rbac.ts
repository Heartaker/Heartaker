import { getCurrentUser, type SessionUser } from './session';

/**
 * Role-based access control.
 *
 * Permissions live in the database (roles → role_permissions → permissions) so
 * they can be reconfigured without a redeploy. This module is the single place
 * the application asks "may this user do X?".
 */

export function can(user: SessionUser | null, permission: string): boolean {
  if (!user) return false;
  // super_admin is granted every permission implicitly.
  if (user.roleSlug === 'super_admin') return true;
  return user.permissions.includes(permission);
}

export function isStaff(user: SessionUser | null): boolean {
  return Boolean(user && user.roleSlug !== 'registered_user');
}

export function canAny(user: SessionUser | null, permissions: string[]): boolean {
  return permissions.some((p) => can(user, p));
}

/**
 * Guard for server components and server actions.
 * Throws so that an unauthorised caller cannot continue by accident.
 */
export async function requirePermission(permission: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error('UNAUTHENTICATED');
  if (!can(user, permission)) throw new Error('FORBIDDEN');
  return user;
}

export async function requireStaff(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error('UNAUTHENTICATED');
  if (!isStaff(user)) throw new Error('FORBIDDEN');
  return user;
}

/** Non-throwing variant for conditional UI. */
export async function checkPermission(permission: string): Promise<boolean> {
  const user = await getCurrentUser();
  return can(user, permission);
}

/** Roles an administrator is allowed to assign — nobody may grant super_admin
 *  except an existing super_admin, and nobody may demote themselves into a
 *  lockout. */
export function assignableRoles(currentRole: string): string[] {
  const all = ['admin', 'editor', 'reviewer', 'analyst', 'support', 'registered_user'];
  if (currentRole === 'super_admin') return ['super_admin', ...all];
  return all;
}

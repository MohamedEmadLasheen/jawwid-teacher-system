import type { Permission, UserRole } from './types';

export interface AccessUser {
  role: UserRole;
  permissions: Permission[];
}

/**
 * The single source of truth for "can this user access X".
 *
 * - super_admin always passes (it may have an empty permissions array,
 *   e.g. the bootstrap account, so we must never gate it by permissions).
 * - A null/empty `anyOf` means "any authenticated user" (no restriction).
 * - Otherwise the user must hold at least one of the listed permissions.
 */
export function userCan(user: AccessUser | null | undefined, anyOf?: Permission[] | null): boolean {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  if (!anyOf || anyOf.length === 0) return true;
  return anyOf.some((p) => user.permissions.includes(p));
}

/**
 * Permissions required to see/visit each top-level route.
 * `null` = available to every authenticated user.
 */
export const ROUTE_PERMISSIONS: Record<string, Permission[] | null> = {
  '/dashboard': null,
  '/teachers': ['manage_teachers', 'view_reports', 'view_all_data'],
  '/supervisors': ['manage_supervisors', 'create_supervisor', 'edit_supervisor', 'delete_supervisor'],
  '/action-center': [
    'teacher_evaluations', 'quality_monitoring', 'performance_reviews',
    'manage_complaints', 'improvement_plans', 'teacher_followup', 'operational_notes',
  ],
  '/bonuses': ['view_all_data'],
  '/deductions': ['view_all_data'],
  '/activity-log': ['view_audit_logs'],
  '/settings': null,   // self-gates internally (own password vs super-admin tabs)
  '/profile': null,
};

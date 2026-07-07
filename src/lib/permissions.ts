import type { UserRole, Permission } from './types';

// ─── Super Admin ONLY permissions ─────────────────────────────────────────────
// These can NEVER be granted to System Admin or below.
export const SUPER_ADMIN_ONLY_PERMISSIONS: Permission[] = [
  // Governance
  'manage_roles',
  'manage_permissions',
  // Security / Audit
  'view_audit_logs',
  'delete_records',
  'restore_records',
  'security_settings',
  // System
  'system_settings',
  // Ownership / Financial governance
  'create_admin',
  'edit_admin',
  'disable_admin',
  'export_data',
];

// ─── Permissions that System Admin CAN be granted ─────────────────────────────
export const SYSTEM_ADMIN_ASSIGNABLE_PERMISSIONS: Permission[] = [
  'manage_teachers',
  'view_reports',
  'view_evaluations',
  'manage_supervisors',
  'teacher_onboarding',
  'teacher_followup',
  'operational_notes',
  'teacher_evaluations',
  'quality_monitoring',
  'performance_reviews',
  'manage_complaints',
  'improvement_plans',
  'create_supervisor',
  'edit_supervisor',
  'delete_supervisor',
  'view_all_data',
  'manage_financials',
  'manage_students',
  'manage_parents',
  'manage_courses',
];

// ─── Permission categories for UI grouping ────────────────────────────────────
export const PERMISSION_CATEGORIES: {
  key: string;
  labelAr: string;
  labelEn: string;
  permissions: Permission[];
  superAdminOnly?: boolean;
}[] = [
  {
    key: 'governance',
    labelAr: 'الحوكمة',
    labelEn: 'Governance',
    superAdminOnly: true,
    permissions: ['manage_roles', 'manage_permissions', 'create_admin', 'edit_admin', 'disable_admin'],
  },
  {
    key: 'security',
    labelAr: 'الأمان والتدقيق',
    labelEn: 'Security & Audit',
    superAdminOnly: true,
    permissions: ['view_audit_logs', 'delete_records', 'restore_records', 'security_settings', 'system_settings'],
  },
  {
    key: 'financial',
    labelAr: 'التحكم المالي',
    labelEn: 'Financial Control',
    superAdminOnly: true,
    permissions: ['export_data'],
  },
  {
    key: 'operations',
    labelAr: 'العمليات اليومية',
    labelEn: 'Daily Operations',
    superAdminOnly: false,
    permissions: [
      'manage_teachers', 'view_reports', 'view_evaluations', 'manage_supervisors',
      'create_supervisor', 'edit_supervisor', 'delete_supervisor', 'view_all_data',
      'manage_financials', 'manage_students', 'manage_parents', 'manage_courses',
    ],
  },
  {
    key: 'quality',
    labelAr: 'الجودة والمتابعة',
    labelEn: 'Quality & Follow-Up',
    superAdminOnly: false,
    permissions: [
      'teacher_evaluations', 'quality_monitoring', 'performance_reviews',
      'manage_complaints', 'improvement_plans',
    ],
  },
  {
    key: 'onboarding',
    labelAr: 'التأهيل والملاحظات',
    labelEn: 'Onboarding & Notes',
    superAdminOnly: false,
    permissions: ['teacher_onboarding', 'teacher_followup', 'operational_notes'],
  },
];

// ─── Default role permissions ─────────────────────────────────────────────────
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  super_admin: [
    ...SUPER_ADMIN_ONLY_PERMISSIONS,
    ...SYSTEM_ADMIN_ASSIGNABLE_PERMISSIONS,
  ],
  // System Admin gets a restricted default set — NO super-admin-only permissions
  admin: [
    'manage_teachers',
    'view_reports',
    'view_evaluations',
    'manage_supervisors',
    'teacher_onboarding',
    'teacher_followup',
    'operational_notes',
    'teacher_evaluations',
    'quality_monitoring',
    'performance_reviews',
    'manage_complaints',
    'improvement_plans',
    'create_supervisor',
    'edit_supervisor',
    'view_all_data',
    'manage_financials',
    'manage_students',
    'manage_parents',
    'manage_courses',
  ],
  operation_admin: [
    'teacher_onboarding',
    'teacher_followup',
    'operational_notes',
    'manage_teachers',
    'view_reports',
    'manage_students',
    'manage_parents',
    'manage_courses',
  ],
  quality_admin: [
    'teacher_evaluations',
    'quality_monitoring',
    'performance_reviews',
    'manage_complaints',
    'improvement_plans',
    'view_evaluations',
    'view_reports',
  ],
  // Supervisors get no permissions by default — they are granted
  // individually via the Supervisors → Permissions dialog.
  supervisor: [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function hasPermission(userPermissions: Permission[], permission: Permission): boolean {
  return userPermissions.includes(permission);
}

export function hasAnyPermission(userPermissions: Permission[], permissions: Permission[]): boolean {
  return permissions.some((p) => userPermissions.includes(p));
}

export function isSuperAdmin(role: UserRole): boolean {
  return role === 'super_admin';
}

export function canExport(role: UserRole): boolean {
  return role === 'super_admin';
}

export function canDelete(role: UserRole): boolean {
  return role === 'super_admin';
}

export function canRestore(role: UserRole): boolean {
  return role === 'super_admin';
}

export function isSuperAdminOnlyPermission(permission: Permission): boolean {
  return SUPER_ADMIN_ONLY_PERMISSIONS.includes(permission);
}

export function isAssignableToAdmin(permission: Permission): boolean {
  return SYSTEM_ADMIN_ASSIGNABLE_PERMISSIONS.includes(permission);
}
/** Shared badge/colour constants used across multiple pages. */

export const levelColors: Record<string, string> = {
  silver: 'bg-gray-100 text-gray-700 border-gray-200',
  gold: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  platinum: 'bg-blue-100 text-blue-800 border-blue-200',
};

export const riskColors: Record<string, string> = {
  low: 'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-red-100 text-red-800',
};

export const perfColors: Record<string, string> = {
  elite: 'bg-purple-100 text-purple-800',
  excellent: 'bg-green-100 text-green-800',
  good: 'bg-blue-100 text-blue-800',
  needs_improvement: 'bg-yellow-100 text-yellow-800',
  at_risk: 'bg-red-100 text-red-800',
};

export const complaintStatusColors: Record<string, string> = {
  open: 'bg-blue-100 text-blue-800',
  under_review: 'bg-yellow-100 text-yellow-800',
  resolved: 'bg-green-100 text-green-800',
  closed: 'bg-gray-100 text-gray-700',
};

export const approvalStatusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
};

export const planStatusColors: Record<string, string> = {
  open: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-100 text-gray-700',
};

/** Chart palette aligned with the brand primary #0E5A6B */
export const CHART_COLORS = ['#0E5A6B', '#D4A24C', '#10b981', '#f59e0b', '#ef4444'];

/** Performance distribution colours for charts */
export const PERF_CHART_COLORS: Record<string, string> = {
  elite: '#7c3aed',
  excellent: '#10b981',
  good: '#3b82f6',
  needs_improvement: '#f59e0b',
  at_risk: '#ef4444',
};

/**
 * THE palette an Operations Supervisor's colour is chosen from.
 *
 * `supervisors.color_hex` is the single source of truth for an Admin's
 * colour, and a student is coloured by resolving `supervisorId → colorHex` —
 * never by a colour stored on the student. This array is only the set of
 * values the Supervisors page offers when picking one, kept here so the
 * schedule legend, the student form and that picker cannot drift apart.
 *
 * The first four are the canonical colours of the four real Operations
 * Supervisors as the live schedule already uses them (Dina red, Zainab
 * orange, Rehab light blue, Asmaa green — seeded by migrations 006/023 and
 * matching scripts/import-schedule/import_schedule.py). They must stay in the
 * list: a palette that cannot reproduce an existing Admin's colour makes that
 * Admin uneditable without silently recolouring their students.
 */
export const SUPERVISOR_COLOR_PALETTE = [
  '#E06666', '#F9CB9C', '#C9DAF8', '#93C47D',
  '#6FA8DC', '#8E7CC3', '#76A5AF', '#E69138', '#C27BA0', '#45818E', '#A64D79',
];

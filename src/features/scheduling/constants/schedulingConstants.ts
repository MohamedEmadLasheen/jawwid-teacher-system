import type { DayOfWeek } from '@/lib/types';

export const DAYS_OF_WEEK: { value: DayOfWeek; labelKey: string }[] = [
  { value: 0, labelKey: 'scheduling.day.sunday' },
  { value: 1, labelKey: 'scheduling.day.monday' },
  { value: 2, labelKey: 'scheduling.day.tuesday' },
  { value: 3, labelKey: 'scheduling.day.wednesday' },
  { value: 4, labelKey: 'scheduling.day.thursday' },
  { value: 5, labelKey: 'scheduling.day.friday' },
  { value: 6, labelKey: 'scheduling.day.saturday' },
];

export const SLOT_MINUTES = 30;
export const PRIME_TIME_START_MINUTE = 13 * 60;
export const PRIME_TIME_END_MINUTE = 18 * 60;
export const DEFAULT_TIMEZONE = 'Asia/Dubai';

// The visible timeline viewport: 8:00 AM - 8:00 PM in 30-min columns (24
// columns). This is a VIEWPORT choice for admin readability, not a statement
// about teacher working hours — those come from shift templates and are
// comfortably inside this range. A lesson can start mid-column (e.g. :40);
// it renders at its exact minute, never snapped.
//
// Anything scheduled outside this window is not drawn. Widening the viewport
// is a two-line change here and needs no other edit — every position is
// derived from these bounds by timelineGeometry.
export const GRID_START_MINUTE = 8 * 60;   // 8:00 AM
export const GRID_END_MINUTE = 20 * 60;    // 8:00 PM
export const GRID_COLUMNS: number[] = Array.from(
  { length: (GRID_END_MINUTE - GRID_START_MINUTE) / SLOT_MINUTES },
  (_, i) => GRID_START_MINUTE + i * SLOT_MINUTES
);

export const GRID_COLUMN_WIDTH = 96;
export const GRID_ROW_HEIGHT = 64;
export const GRID_TEACHER_COLUMN_WIDTH = 176;

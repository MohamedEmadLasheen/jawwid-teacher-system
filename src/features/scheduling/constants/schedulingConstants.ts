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

// Real operating hours run ~7AM to past midnight (confirmed from the source
// spreadsheet); the visible grid covers 7AM-midnight in 30-min columns. A
// lesson can start mid-column (e.g. :40) — it still renders, just snapped to
// its containing 30-min column with the exact time shown as text, not lost.
export const GRID_START_MINUTE = 7 * 60;
export const GRID_END_MINUTE = 24 * 60;
export const GRID_COLUMNS: number[] = Array.from(
  { length: (GRID_END_MINUTE - GRID_START_MINUTE) / SLOT_MINUTES },
  (_, i) => GRID_START_MINUTE + i * SLOT_MINUTES
);

export const GRID_COLUMN_WIDTH = 96;
export const GRID_ROW_HEIGHT = 64;
export const GRID_TEACHER_COLUMN_WIDTH = 176;

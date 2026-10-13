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

// The timeline axis: the WHOLE day, 00:00 - midnight, in 30-min columns (48
// columns). This is the range a lesson can be drawn and picked in, and it is
// exactly the range the data model permits: `lessons` constrains
// `start_minute` to 0..1439 and `start_minute + duration_minutes <= 1440`, so
// no stored lesson can fall outside the axis and nothing is silently hidden.
//
// It used to start at 08:00 as a readability choice, which meant a valid
// stored lesson before 08:00 (the operations workbook has 05:45 and 07:30
// lessons) was fetched but never drawn, and could not be picked in a time
// picker. Readability is now kept by WHERE THE GRID OPENS, not by cutting the
// axis: see DEFAULT_VIEW_START_MINUTE.
//
// Working hours are unrelated to this range — they come from shift templates,
// drive only a row's background shading, and never decide whether a lesson
// is drawn. A lesson can start mid-column (e.g. :40); it renders at its exact
// minute, never snapped. Every position is derived from these bounds by
// timelineGeometry.
export const GRID_START_MINUTE = 0;         // 12:00 AM
export const GRID_END_MINUTE = 24 * 60;     // midnight (12:00 AM, end of day)
/**
 * Where the grids open (scrolled to on load) and the default start offered
 * for a new lesson: 08:00, the start of the academy's working day. A view
 * preference only — the axis itself spans the whole day.
 */
export const DEFAULT_VIEW_START_MINUTE = 8 * 60;
export const GRID_COLUMNS: number[] = Array.from(
  { length: (GRID_END_MINUTE - GRID_START_MINUTE) / SLOT_MINUTES },
  (_, i) => GRID_START_MINUTE + i * SLOT_MINUTES
);

export const GRID_COLUMN_WIDTH = 96;
export const GRID_ROW_HEIGHT = 64;
export const GRID_TEACHER_COLUMN_WIDTH = 176;

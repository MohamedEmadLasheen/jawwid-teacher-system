import { GRID_COLUMNS } from '../constants/schedulingConstants';
import {
  computeWorkingWindow, computeFreeIntervals, isColumnInWorkingWindow,
  type MinuteInterval,
} from './timelineGeometry';
import type { LessonWithParticipants } from '@/services/scheduling/lessons.service';
import type { UnifiedAvailabilitySlot } from '@/services/scheduling/teacherAvailability.service';

export interface ScheduleRowLayout {
  /** The teacher's merged working window (empty when they have no availability configured). */
  workingWindow: MinuteInterval[];
  /** Inside the working window and not covered by a lesson — real sellable capacity. */
  freeIntervals: MinuteInterval[];
  /** One flag per GRID_COLUMNS index: does this 30-min column fall inside the working window? */
  columnInWindow: boolean[];
  /** True when the teacher has any availability at all — gates all shift-aware shading. */
  hasWorkingWindow: boolean;
}

/**
 * The pure layout computation behind ScheduleGridRow, kept separate so it is
 * testable without rendering.
 *
 * Lessons are no longer bucketed into columns here: they are positioned
 * directly from their own start/duration by the canonical geometry in
 * timelineGeometry.ts, so a 40-minute lesson is 40 minutes wide rather than
 * being rounded up to two 30-minute columns. What this function produces is
 * only the *background* of the row — the working window, the free gaps inside
 * it, and the per-column shading flags.
 *
 * `occupancy` exists because `lessons` is the FILTERED list: with a supervisor
 * or status filter on, a teacher's other lessons are hidden from the row but
 * their minutes are still sold. Passing the row's unfiltered occupancy keeps
 * the red "on shift, no student" band honest — without it, filtering would
 * repaint booked time as free capacity. Omit it and occupancy falls back to
 * `lessons`, which is what the per-teacher weekly view and the pure geometry
 * suites rely on.
 */
export function computeRowLayout(
  lessons: LessonWithParticipants[],
  availability: UnifiedAvailabilitySlot[],
  occupancy?: MinuteInterval[]
): ScheduleRowLayout {
  const workingWindow = computeWorkingWindow(availability);
  const occupied: MinuteInterval[] = occupancy ?? lessons.map((l) => ({
    startMinute: l.startMinute,
    endMinute: l.startMinute + l.durationMinutes,
  }));

  return {
    workingWindow,
    freeIntervals: computeFreeIntervals(availability, occupied),
    columnInWindow: GRID_COLUMNS.map((columnStart) => isColumnInWorkingWindow(columnStart, workingWindow)),
    hasWorkingWindow: workingWindow.length > 0,
  };
}

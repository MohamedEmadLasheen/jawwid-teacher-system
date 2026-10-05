import { GRID_COLUMNS, GRID_END_MINUTE } from '../constants/schedulingConstants';
import { computeWorkingWindow, subtractIntervals, type MinuteInterval } from './timelineGeometry';

/** Why a candidate start time cannot be chosen. `null` means it can. */
export type LessonTimeBlockReason = 'outside_timeline' | 'outside_working_window' | 'overlaps_lesson';

export interface LessonTimeOption {
  /** Candidate start, minutes since local midnight — always a grid column. */
  startMinute: number;
  /** Where the lesson would end if moved here. */
  endMinute: number;
  /** The lesson's existing start, i.e. the initially selected row. */
  isCurrent: boolean;
  /** Selectable: nothing locally disqualifies it. The server still decides. */
  isSelectable: boolean;
  blockReason: LessonTimeBlockReason | null;
}

/**
 * The candidate start times for moving one lesson, derived — never
 * enumerated. Every candidate is a column of the configured timeline
 * (GRID_COLUMNS, i.e. GRID_START_MINUTE…GRID_END_MINUTE in SLOT_MINUTES
 * steps), so widening the viewport or changing the slot size changes this
 * list with no edit here, and no hour, teacher or shift is hardcoded.
 *
 * A candidate is rejected locally for one of three reasons, in priority
 * order, each evaluated against the lesson's REAL duration rather than a
 * single slot — moving a 60-minute lesson to 7:30 PM is rejected because it
 * would end at 8:30 PM, past the timeline:
 *
 *   outside_timeline       start + duration runs past GRID_END_MINUTE.
 *   outside_working_window any part of the lesson would fall outside the
 *                          teacher's merged working window. Skipped entirely
 *                          when the teacher has no window configured, which
 *                          is the same condition that gates all shift-aware
 *                          shading in computeRowLayout — absence of data must
 *                          not read as "unavailable everywhere".
 *   overlaps_lesson        the span would overlap another lesson of the same
 *                          teacher. The lesson being moved is excluded by the
 *                          caller, so its own slot never blocks itself.
 *
 * This is a PRE-FILTER for the picker, not a conflict algorithm. It cannot
 * see student double-booking or anything else outside the row it was handed,
 * so the authority on whether a move is legal remains
 * check_schedule_conflict via useCheckScheduleConflict (and
 * apply_schedule_change re-checks it server-side at write time). Blocked
 * candidates are returned rather than dropped so the picker can say why.
 */
export function buildLessonTimeOptions(params: {
  currentStartMinute: number;
  durationMinutes: number;
  /** The teacher's raw availability slots for the day; merged here. */
  availability: MinuteInterval[];
  /** Same-teacher lessons EXCLUDING the one being moved. */
  otherLessons: MinuteInterval[];
}): LessonTimeOption[] {
  const { currentStartMinute, durationMinutes, availability, otherLessons } = params;
  const workingWindow = computeWorkingWindow(availability);
  const hasWorkingWindow = workingWindow.length > 0;

  return GRID_COLUMNS.map((startMinute) => {
    const endMinute = startMinute + durationMinutes;
    const span: MinuteInterval = { startMinute, endMinute };
    const isCurrent = startMinute === currentStartMinute;

    let blockReason: LessonTimeBlockReason | null = null;
    if (endMinute > GRID_END_MINUTE) {
      blockReason = 'outside_timeline';
    } else if (hasWorkingWindow && subtractIntervals([span], workingWindow).length > 0) {
      // Anything left after removing the working window is time the teacher
      // does not work — so the lesson is not fully covered.
      blockReason = 'outside_working_window';
    } else if (otherLessons.some((l) => l.startMinute < endMinute && startMinute < l.endMinute)) {
      blockReason = 'overlaps_lesson';
    }

    return {
      startMinute,
      endMinute,
      isCurrent,
      // The lesson's own current time stays selectable so the picker always
      // has a selected row to open on, even if the schedule has drifted
      // around it (e.g. its window was narrowed after it was booked).
      isSelectable: isCurrent || blockReason === null,
      blockReason: isCurrent ? null : blockReason,
    };
  });
}

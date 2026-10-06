import { isLiveLesson } from './sameTimeSlot';
import type { LessonWithParticipants } from '@/services/scheduling/lessons.service';

/**
 * An occurrence-level deviation for ONE date. Never merged into the lesson.
 *
 * This mirrors a lesson_exceptions row: it says what happens to a single
 * dated occurrence, not what the weekly schedule is.
 */
export interface OccurrenceException {
  status: string;
  overrideTeacherId: string | null;
  overrideStartMinute: number | null;
  overrideDurationMinutes: number | null;
}

/**
 * One row of a student's weekly schedule.
 *
 * The two concepts are deliberately kept as separate fields rather than
 * folded together:
 *
 *   lesson              the RECURRING record — the schedule itself. Stored
 *                       day_of_week / start_minute / duration / teacher,
 *                       exactly as the database holds them.
 *   occurrenceException a temporary deviation for ONE date, or null.
 *
 * Merging them is the mistake this shape exists to prevent: a reschedule or a
 * cancellation is occurrence-level state, and treating it as the recurring
 * value makes a temporary change look permanent. Anything rendering a row
 * must read the schedule from `lesson` and treat `occurrenceException` as an
 * annotation on a named date.
 */
export interface StudentWeeklyEntry {
  lesson: LessonWithParticipants;
  /** The next date this lesson's weekday falls on (YYYY-MM-DD). */
  occurrenceDate: string;
  occurrenceException: OccurrenceException | null;
}

/**
 * A student's complete live recurring weekly schedule.
 *
 * Membership is strictly `lesson_participants`: a lesson belongs to the
 * student if and only if the student is a participant of it. It is never
 * inferred from the teacher, the day or the time — two students sharing a
 * teacher, or a slot, have nothing to do with each other here.
 *
 * NOT the same concept as "the same time slot", which is day+minute across
 * all teachers and ignores students entirely. These two views answer
 * different questions and must not be confused.
 *
 * Only live lessons ('trial', 'active') are returned, so ended and paused
 * records — history — never appear. Note that fetchLessons() does NOT filter
 * lifecycle (unlike fetchLessonsForDay), so this filter is load-bearing.
 *
 * Sorted by weekday, then start minute, then id for a stable order.
 */
export function findStudentWeeklyLessons(
  studentId: string,
  allLessons: LessonWithParticipants[]
): LessonWithParticipants[] {
  return allLessons
    .filter(
      (lesson) =>
        isLiveLesson(lesson) &&
        lesson.participants.some((p) => p.studentId === studentId)
    )
    .sort(
      (a, b) =>
        a.dayOfWeek - b.dayOfWeek ||
        a.startMinute - b.startMinute ||
        a.id.localeCompare(b.id)
    );
}

/** True when the occurrence for this row's date is cancelled. */
export function isOccurrenceCancelled(entry: StudentWeeklyEntry): boolean {
  return entry.occurrenceException?.status === 'cancelled';
}

/**
 * True when the occurrence is rescheduled AND actually differs from the
 * stored record. A 'rescheduled' row whose overrides all match the recurring
 * values changes nothing the admin needs warning about.
 */
export function isOccurrenceRescheduled(entry: StudentWeeklyEntry): boolean {
  const exc = entry.occurrenceException;
  if (exc?.status !== 'rescheduled') return false;
  const { lesson } = entry;
  return (
    (exc.overrideTeacherId !== null && exc.overrideTeacherId !== lesson.teacherId) ||
    (exc.overrideStartMinute !== null && exc.overrideStartMinute !== lesson.startMinute) ||
    (exc.overrideDurationMinutes !== null &&
      exc.overrideDurationMinutes !== lesson.durationMinutes)
  );
}

/**
 * What the single overridden occurrence actually looks like — shown beside
 * the recurring values, never in place of them.
 */
export function occurrenceOverride(entry: StudentWeeklyEntry): {
  teacherId: string;
  startMinute: number;
  durationMinutes: number;
} {
  const exc = entry.occurrenceException;
  const { lesson } = entry;
  return {
    teacherId: exc?.overrideTeacherId ?? lesson.teacherId,
    startMinute: exc?.overrideStartMinute ?? lesson.startMinute,
    durationMinutes: exc?.overrideDurationMinutes ?? lesson.durationMinutes,
  };
}

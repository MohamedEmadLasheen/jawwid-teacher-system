import type { LessonWithParticipants } from '@/services/scheduling/lessons.service';

/**
 * THE CANONICAL DEFINITION — part of the scheduling contract.
 *
 *   Same time slot = same original day_of_week
 *                  + same original start_minute
 *                  + across all live teachers.
 *
 * The student takes no part in membership. The teacher takes no part in
 * membership. Other days take no part. "Live" means lifecycle 'trial' or
 * 'active'. The set is resolved ONCE from the originally clicked lesson,
 * before any mutation.
 *
 * Do not redefine this without changing the contract deliberately —
 * sametimeslot.test.mjs guards every edge of it.
 */

/**
 * Lifecycles a schedule change may touch.
 *
 * The same two the database's EXCLUDE constraints police
 * ('trial', 'active'): those are the lessons that actually occupy a slot. A
 * paused or ended lesson is history — it must never be swept up by a bulk
 * edit or a bulk removal.
 */
export const LIVE_LIFECYCLES = ['trial', 'active'] as const;

export function isLiveLesson(lesson: Pick<LessonWithParticipants, 'lifecycleStatus'>): boolean {
  return (LIVE_LIFECYCLES as readonly string[]).includes(lesson.lifecycleStatus);
}

/** The coordinates that define a slot: one weekday, one start minute. */
export interface TimeSlot {
  dayOfWeek: number;
  startMinute: number;
}

/**
 * THE definition of "the same time slot": same day of week, same start
 * minute, ANY teacher.
 *
 * On Sunday at 10:00, teacher A/student X, teacher B/student Y and teacher
 * C/student Z are one slot — the vertical column of the grid. Sunday 10:30,
 * Monday 10:00 and Sunday 11:00 are different slots. Neither the teacher nor
 * the student participates in membership: two lessons are in the same slot
 * when they happen at the same time on the same weekday, full stop.
 *
 * `slot` must be the ORIGINAL day and start of the lesson being edited, read
 * before anything is written. The caller resolves the target set once and
 * reuses it: recomputing after the first lesson moves would resolve the
 * DESTINATION slot instead and could sweep in lessons that merely happen to
 * live at the new time.
 *
 * Only live lessons are returned, so ended and paused records — history —
 * are never modified.
 */
export function findLessonsInSlot(
  slot: TimeSlot,
  allLessons: LessonWithParticipants[]
): LessonWithParticipants[] {
  return allLessons
    .filter(
      (lesson) =>
        isLiveLesson(lesson) &&
        lesson.dayOfWeek === slot.dayOfWeek &&
        lesson.startMinute === slot.startMinute
    )
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * The slot's lessons with `subject` guaranteed present and first.
 *
 * The subject is pinned rather than assumed: the grid overlays this
 * occurrence's lesson_exceptions onto what it draws, so a lesson rescheduled
 * for this one date is displayed at its override time while its stored row
 * still holds the original. Resolving the slot from what the admin clicked
 * and then pinning the subject keeps the edited lesson in its own target set
 * either way.
 */
export function findSlotTargets(
  subject: LessonWithParticipants,
  allLessons: LessonWithParticipants[]
): LessonWithParticipants[] {
  const slot: TimeSlot = { dayOfWeek: subject.dayOfWeek, startMinute: subject.startMinute };
  const inSlot = findLessonsInSlot(slot, allLessons).filter((l) => l.id !== subject.id);
  return [subject, ...inSlot];
}

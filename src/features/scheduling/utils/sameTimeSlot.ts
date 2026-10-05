import type { LessonWithParticipants } from '@/services/scheduling/lessons.service';

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

/**
 * The lessons that count as "the same time slot" as `subject`.
 *
 * THE DEFINITION, because the schema did not have one: a lesson is in the
 * slot when it starts at the same minute of the day AND shares at least one
 * student with the subject. Day of week is deliberately NOT part of the
 * match — the set is the student's recurring weekly pattern at that time
 * ("Ahmed's 3:00 PM lessons"), which is the thing an admin means when they
 * move "the 3 o'clock" to 4 o'clock.
 *
 * Two readings were rejected:
 *   * same teacher + day + start — the EXCLUDE constraint on
 *     (teacher_id, day_of_week, time_range) makes that set exactly one
 *     lesson, always, so the scope would be a no-op dressed up as a bulk
 *     action.
 *   * same day + start across every teacher — a vertical column of unrelated
 *     students, which no single edit can sensibly apply to (changing the
 *     teacher would collide them all into one).
 *
 * The subject itself is always included and always first, so callers can use
 * the result as the complete work list and `length` as an honest count.
 *
 * Matching is by participant student id, not by name: two students may share
 * a name, and a lesson may be a group lesson, where sharing ANY student is
 * enough to make it the same weekly commitment.
 */
export function findSameTimeSlotLessons(
  subject: LessonWithParticipants,
  allLessons: LessonWithParticipants[]
): LessonWithParticipants[] {
  const subjectStudentIds = new Set(subject.participants.map((p) => p.studentId));

  // A lesson with no participants can only ever match itself; without this
  // the empty-intersection test would quietly pull in every other orphan
  // lesson that happens to start at the same minute.
  if (subjectStudentIds.size === 0) return [subject];

  const others = allLessons.filter(
    (lesson) =>
      lesson.id !== subject.id &&
      isLiveLesson(lesson) &&
      lesson.startMinute === subject.startMinute &&
      lesson.participants.some((p) => subjectStudentIds.has(p.studentId))
  );

  // Stable, readable order: by day, then by lesson id so repeated runs agree.
  others.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.id.localeCompare(b.id));

  return [subject, ...others];
}

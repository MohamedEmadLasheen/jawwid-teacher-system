import * as lessonsSvc from '@/services/scheduling/lessons.service';
import * as availabilitySvc from '@/services/scheduling/teacherAvailability.service';
import * as rpcSvc from '@/services/scheduling/scheduleRpc.service';
import { overlapsPrimeTime } from '@/features/scheduling/utils/primeTime';
import { SLOT_MINUTES, PRIME_TIME_START_MINUTE, PRIME_TIME_END_MINUTE } from '@/features/scheduling/constants/schedulingConstants';
import { MAX_CANDIDATE_SLOTS_PER_LESSON, MIN_TEACHER_PRESERVATION_AFTER_MOVE } from './config';
import type { MoveCandidate } from './types';
import type { LessonWithParticipants } from '@/services/scheduling/lessons.service';
import type { UnifiedAvailabilitySlot } from '@/services/scheduling/teacherAvailability.service';
import type { DayOfWeek } from '@/lib/types';

/** Reuses get_teacher_preservation_score's own formula (migration 008) so the "after" prediction
 * is never invented: same-teacher/same-day means teacher & day components are unchanged; only the
 * time component resets to 0 the instant a real time change is applied. */
function predictPreservationAfterTimeShift(currentScore: { teacher: number; day: number }): number {
  return Math.round(currentScore.teacher + currentScore.day);
}

function findFreeSlotsInDay(
  lessons: LessonWithParticipants[],
  availability: UnifiedAvailabilitySlot[],
  teacherId: string,
  durationMinutes: number
): number[] {
  const teacherLessons = lessons.filter((l) => l.teacherId === teacherId);
  // availability is read from v_teacher_availability_unified, which already unions
  // both explicit teacher_availability blocks AND active shift assignments — the
  // one honest signal for "this teacher can actually work this slot." A Prime Time
  // move must never be proposed into a slot that's merely calendar-empty: no
  // recorded availability/shift coverage means no candidate slots at all, full stop.
  const teacherAvailability = availability.filter((a) => a.teacherId === teacherId);
  if (teacherAvailability.length === 0) return [];

  const slots: number[] = [];
  for (let start = PRIME_TIME_START_MINUTE; start + durationMinutes <= PRIME_TIME_END_MINUTE; start += SLOT_MINUTES) {
    const end = start + durationMinutes;
    const withinAvailability = teacherAvailability.some((a) => a.startMinute <= start && a.endMinute >= end);
    if (!withinAvailability) continue;
    const overlapsLesson = teacherLessons.some((l) => start < l.startMinute + l.durationMinutes && end > l.startMinute);
    if (!overlapsLesson) slots.push(start);
  }
  return slots;
}

/**
 * Steps 1-2 — takes a pool of the academy's busiest teachers by real weekly
 * lesson count (get_schedule_health_metrics()'s occupancy-based
 * mostOccupiedTeacher is always 0% today since no availability data is
 * recorded anywhere, so it can never identify anyone — lesson count is the
 * one real, always-populated workload signal), and for each — most overloaded
 * first — picks one of their non-Prime-Time lessons and generates candidate
 * moves into a free Prime Time slot on the same day, filtered by conflicts
 * (via the existing check_schedule_conflict RPC) and the preservation-score
 * gate. Collects one lesson-move opportunity per teacher (not just the first
 * teacher in the pool) so the Dashboard can rank a real, small queue instead
 * of freezing on a single recommendation — a teacher with no opening (e.g.
 * already fully Prime-Time-packed) is simply skipped, never blanks the queue.
 */
export async function generateMoveCandidates(
  overloadedTeachers: { teacherId: string; fullName: string; weeklyLessons: number }[]
): Promise<MoveCandidate[]> {
  if (overloadedTeachers.length === 0) return [];

  const days: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];
  const [lessonsByDay, availabilityByDay] = await Promise.all([
    Promise.all(days.map((d) => lessonsSvc.fetchLessonsForDay(d))),
    Promise.all(days.map((d) => availabilitySvc.fetchUnifiedAvailabilityForDay(d))),
  ]);

  const allCandidates: MoveCandidate[] = [];

  for (const teacher of overloadedTeachers) {
    for (const day of days) {
      const dayLessons = lessonsByDay[day];
      const teacherLessons = dayLessons.filter((l) => l.teacherId === teacher.teacherId);
      const candidateLesson = teacherLessons.find((l) => !overlapsPrimeTime(l.startMinute, l.durationMinutes));
      if (!candidateLesson) continue;

      const freeSlots = findFreeSlotsInDay(dayLessons, availabilityByDay[day], teacher.teacherId, candidateLesson.durationMinutes)
        .filter((s) => s !== candidateLesson.startMinute)
        .slice(0, MAX_CANDIDATE_SLOTS_PER_LESSON);
      if (freeSlots.length === 0) continue;

      const preservation = await rpcSvc.getTeacherPreservationScore(candidateLesson.id);
      if (!preservation) continue;
      const preservationAfter = predictPreservationAfterTimeShift(preservation.breakdown);
      if (preservationAfter < MIN_TEACHER_PRESERVATION_AFTER_MOVE) continue;

      const candidates: MoveCandidate[] = [];
      for (const toStartMinute of freeSlots) {
        const conflict = await rpcSvc.checkScheduleConflict({
          teacherId: teacher.teacherId,
          studentIds: candidateLesson.participants.map((p) => p.studentId),
          dayOfWeek: day,
          startMinute: toStartMinute,
          durationMinutes: candidateLesson.durationMinutes,
          excludeLessonId: candidateLesson.id,
        });
        if (conflict.hasConflict) continue;

        candidates.push({
          lesson: candidateLesson,
          teacherId: teacher.teacherId,
          teacherName: teacher.fullName,
          dayOfWeek: day,
          fromStartMinute: candidateLesson.startMinute,
          toStartMinute,
          durationMinutes: candidateLesson.durationMinutes,
          fromInPrimeTime: overlapsPrimeTime(candidateLesson.startMinute, candidateLesson.durationMinutes),
          toInPrimeTime: overlapsPrimeTime(toStartMinute, candidateLesson.durationMinutes),
          preservationBeforeScore: preservation.score,
          preservationAfterScore: preservationAfter,
          teacherWeeklyLessons: teacher.weeklyLessons,
        });
      }

      if (candidates.length > 0) {
        allCandidates.push(...candidates);
        break; // one lesson-move opportunity per teacher; move on to the next teacher
      }
    }
  }

  return allCandidates;
}

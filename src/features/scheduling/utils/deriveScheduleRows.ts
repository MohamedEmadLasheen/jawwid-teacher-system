import { overlapsPrimeTime } from './primeTime';
import {
  computeFreeIntervals, computeOutsideWindowIntervals, type MinuteInterval,
} from './timelineGeometry';
import type { ScheduleFilters } from '@/store/scheduleUiStore';
import type { Teacher } from '@/lib/types';
import type { LessonExceptionOverride, LessonWithParticipants } from '@/services/scheduling/lessons.service';
import type { UnifiedAvailabilitySlot } from '@/services/scheduling/teacherAvailability.service';

export interface ScheduleGridTeacherRow {
  teacher: Teacher;
  availability: UnifiedAvailabilitySlot[];
  /** The lessons that survived the lesson-level filters — what the row draws. */
  lessons: LessonWithParticipants[];
  /**
   * Every lesson this teacher actually has today, as plain minute intervals,
   * regardless of the active filters.
   *
   * This is what the row's free-capacity bands are computed against, and it
   * is the whole reason filtering cannot invent capacity: filtering to
   * "Trial" hides a teacher's active lessons from `lessons`, but their
   * minutes are still booked, so the red "no student" band must not appear
   * over them.
   */
  occupancy: MinuteInterval[];
}

export interface DeriveScheduleRowsInput {
  /** Roster teachers, already in roster order — the only rows the Schedule shows. */
  rosterTeachers: Teacher[];
  /** The day's lessons, AFTER applyOccurrenceExceptions. */
  lessons: LessonWithParticipants[];
  /** The day's unified availability rows, for every teacher. */
  availability: UnifiedAvailabilitySlot[];
  /** studentId → owning supervisor, for the supervisor filter. */
  supervisorIdByStudentId: Map<string, string | null | undefined>;
  /** studentId → full name, for the search box. */
  studentNameById: Map<string, string>;
  /** teacherId → the shift template ids they hold an active assignment to. */
  templateIdsByTeacherId: Map<string, string[]>;
  filters: ScheduleFilters;
  searchQuery: string;
}

const asInterval = (lesson: LessonWithParticipants): MinuteInterval => ({
  startMinute: lesson.startMinute,
  endMinute: lesson.startMinute + lesson.durationMinutes,
});

/**
 * Folds today's occurrence-scoped deviations into the recurring lessons.
 *
 * A "this occurrence" change only ever writes a `lesson_exceptions` row and
 * never the `lessons` row, so without this the grid would show the recurring
 * shape and silently contradict what the admin just did. Cancellations drop
 * the lesson for the day; reschedules move/resize/reassign the copy.
 *
 * Pure, and it does not mutate the input array or any lesson in it — the
 * React Query cache holds those objects.
 */
export function applyOccurrenceExceptions(
  lessons: LessonWithParticipants[],
  exceptions: LessonExceptionOverride[]
): LessonWithParticipants[] {
  if (exceptions.length === 0) return lessons;
  const byLessonId = new Map(exceptions.map((e) => [e.lessonId, e]));

  return lessons
    .filter((l) => byLessonId.get(l.id)?.status !== 'cancelled')
    .map((l) => {
      const exception = byLessonId.get(l.id);
      if (exception?.status !== 'rescheduled') return l;
      const startMinute = exception.overrideStartMinute ?? l.startMinute;
      const durationMinutes = exception.overrideDurationMinutes ?? l.durationMinutes;
      return {
        ...l,
        teacherId: exception.overrideTeacherId ?? l.teacherId,
        startMinute,
        durationMinutes,
        endMinute: startMinute + durationMinutes,
      };
    });
}

/**
 * THE schedule filter pipeline: roster + lessons + availability + filter
 * state → the visible rows. Pure, so every filter combination is provable
 * without React, a browser or a database (see
 * scripts/schedule-geometry-tests/filters.test.mjs).
 *
 * Three kinds of predicate, combined with AND across kinds and OR within
 * each multi-select — which is what makes "Full-time + Dina + Trial" mean
 * "full-time teachers, showing Dina's trial lessons" rather than a union:
 *
 *   1. TEACHER-level (teacherIds, teacherType, shiftTemplateIds) — decide
 *      whether the row exists at all.
 *   2. LESSON-level (course, lifecycle, supervisor, student, prime time,
 *      group size, time range, outside-shift) — narrow what the row draws.
 *      Existing behaviour is preserved: a row whose lessons all fail stays
 *      visible and simply renders empty, so the roster does not jump around
 *      while an admin explores.
 *   3. ROW-level visual-state (availableOnly, outsideShiftOnly) — drop rows
 *      that have nothing of the kind being looked for. These are computed
 *      from availability and `occupancy`, never from lesson status, and
 *      never by emptying the lesson list.
 *
 * Nothing here mutates its inputs; the result is derived state and belongs
 * in a memo, not in a store.
 */
export function deriveScheduleRows(input: DeriveScheduleRowsInput): ScheduleGridTeacherRow[] {
  const {
    rosterTeachers, lessons, availability, supervisorIdByStudentId,
    studentNameById, templateIdsByTeacherId, filters,
  } = input;
  const search = input.searchQuery.trim().toLowerCase();

  return rosterTeachers
    // ── 1. teacher-level ────────────────────────────────────────────────
    .filter((t) => !t.isDeleted)
    .filter((t) => filters.teacherIds.length === 0 || filters.teacherIds.includes(t.id))
    .filter((t) => !filters.teacherType || t.teacherType === filters.teacherType)
    .filter((t) => {
      if (filters.shiftTemplateIds.length === 0) return true;
      const templateIds = templateIdsByTeacherId.get(t.id) ?? [];
      return templateIds.some((id) => filters.shiftTemplateIds.includes(id));
    })
    .map((teacher) => {
      const teacherAvailability = availability.filter((a) => a.teacherId === teacher.id);
      const allLessons = lessons.filter((l) => l.teacherId === teacher.id);
      // Booked minutes, fixed before any lesson filter runs — see `occupancy`.
      const occupancy = allLessons.map(asInterval);

      // ── 2. lesson-level ───────────────────────────────────────────────
      let teacherLessons = allLessons;

      if (filters.coursePendingOnly) {
        teacherLessons = teacherLessons.filter((l) => !l.courseId);
      } else if (filters.courseIds.length > 0) {
        teacherLessons = teacherLessons.filter((l) => l.courseId && filters.courseIds.includes(l.courseId));
      }
      if (filters.lifecycleStatuses.length > 0) {
        teacherLessons = teacherLessons.filter((l) => filters.lifecycleStatuses.includes(l.lifecycleStatus));
      }
      if (filters.supervisorIds.length > 0) {
        teacherLessons = teacherLessons.filter((l) =>
          l.participants.some((p) => {
            const supervisorId = supervisorIdByStudentId.get(p.studentId);
            return supervisorId != null && filters.supervisorIds.includes(supervisorId);
          })
        );
      }
      if (filters.studentIds.length > 0) {
        teacherLessons = teacherLessons.filter((l) =>
          l.participants.some((p) => filters.studentIds.includes(p.studentId))
        );
      }
      if (filters.primeTimeOnly) {
        teacherLessons = teacherLessons.filter((l) => overlapsPrimeTime(l.startMinute, l.durationMinutes));
      }
      if (filters.groupFilter === 'group') {
        teacherLessons = teacherLessons.filter((l) => l.participants.length > 1);
      } else if (filters.groupFilter === 'one_to_one') {
        teacherLessons = teacherLessons.filter((l) => l.participants.length <= 1);
      }
      if (filters.timeRangeStart !== null) {
        teacherLessons = teacherLessons.filter((l) => l.startMinute >= filters.timeRangeStart!);
      }
      if (filters.timeRangeEnd !== null) {
        teacherLessons = teacherLessons.filter((l) => l.startMinute + l.durationMinutes <= filters.timeRangeEnd!);
      }
      // Outside shift narrows to the lessons that are actually the anomaly:
      // the ones sticking out of the teacher's own working window.
      if (filters.outsideShiftOnly) {
        teacherLessons = teacherLessons.filter(
          (l) => computeOutsideWindowIntervals(teacherAvailability, [asInterval(l)]).length > 0
        );
      }

      return { teacher, availability: teacherAvailability, lessons: teacherLessons, occupancy };
    })
    // ── 3. row-level visual state ───────────────────────────────────────
    .filter((row) => {
      // FREE TIME: real unsold capacity — inside the working window and not
      // covered by ANY of today's lessons. A teacher with no availability
      // configured has no window, so computeFreeIntervals reports nothing
      // free and the row drops out rather than looking wide open.
      if (!filters.availableOnly) return true;
      return computeFreeIntervals(row.availability, row.occupancy).length > 0;
    })
    .filter((row) => {
      // OUTSIDE SHIFT: at least one lesson really is outside the window. The
      // lesson-level pass above already reduced `lessons` to those, so an
      // empty list here means this teacher has none.
      if (!filters.outsideShiftOnly) return true;
      return row.lessons.length > 0;
    })
    // ── search ──────────────────────────────────────────────────────────
    .filter((row) => {
      if (!search) return true;
      if (row.teacher.fullName.toLowerCase().includes(search)) return true;
      return row.lessons.some((l) =>
        l.participants.some((p) => (studentNameById.get(p.studentId) ?? '').toLowerCase().includes(search))
      );
    });
}

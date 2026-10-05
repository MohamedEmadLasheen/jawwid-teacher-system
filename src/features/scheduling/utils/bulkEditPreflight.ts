import type { LessonWithParticipants } from '@/services/scheduling/lessons.service';

/** The edit being proposed. Any field left undefined keeps its current value. */
export interface ProposedChange {
  teacherId?: string;
  dayOfWeek?: number;
  startMinute?: number;
  durationMinutes?: number;
}

export interface BatchCollision {
  kind: 'teacher' | 'student';
  /** The two lessons that would occupy the same place at once. */
  lessonIdA: string;
  lessonIdB: string;
  /** The teacher or student they would both need. */
  subjectId: string;
}

/** The lesson as it WOULD be after the change, used for the simulation. */
function project(lesson: LessonWithParticipants, change: ProposedChange) {
  const startMinute = change.startMinute ?? lesson.startMinute;
  const durationMinutes = change.durationMinutes ?? lesson.durationMinutes;
  return {
    id: lesson.id,
    teacherId: change.teacherId ?? lesson.teacherId,
    dayOfWeek: change.dayOfWeek ?? lesson.dayOfWeek,
    startMinute,
    endMinute: startMinute + durationMinutes,
    studentIds: lesson.participants.map((p) => p.studentId),
  };
}

const overlaps = (a: { startMinute: number; endMinute: number }, b: { startMinute: number; endMinute: number }) =>
  a.startMinute < b.endMinute && b.startMinute < a.endMinute;

/**
 * Does the batch collide with ITSELF once applied?
 *
 * check_schedule_conflict compares one proposed lesson against what is
 * already stored. It is therefore structurally blind to the failure mode a
 * bulk edit introduces: apply the same change to several lessons at once and
 * they can land on top of each other, even though each one individually was
 * fine against the database.
 *
 * The concrete case this exists for: a slot is every lesson at one day+time
 * across all teachers, so Sunday 10:00 might be teachers A, B and C. Moving
 * "all lessons in this slot" to teacher D asks for three lessons with the
 * same teacher, same day and the same minutes — each passes its own check
 * (D is free at that time), and then the second one hits the EXCLUDE
 * constraint on (teacher_id, day_of_week, time_range) at write time, after
 * the first has already committed.
 *
 * Catching it here is what lets the dialog refuse the whole operation before
 * touching anything, instead of discovering it halfway through.
 *
 * Mirrors the two EXCLUDE constraints migration 008 defines: one teacher
 * cannot be in two places at once, and neither can one student.
 */
export function findBatchCollisions(
  lessons: LessonWithParticipants[],
  change: ProposedChange
): BatchCollision[] {
  const projected = lessons.map((l) => project(l, change));
  const collisions: BatchCollision[] = [];

  for (let i = 0; i < projected.length; i++) {
    for (let j = i + 1; j < projected.length; j++) {
      const a = projected[i];
      const b = projected[j];
      if (a.dayOfWeek !== b.dayOfWeek || !overlaps(a, b)) continue;

      if (a.teacherId === b.teacherId) {
        collisions.push({ kind: 'teacher', lessonIdA: a.id, lessonIdB: b.id, subjectId: a.teacherId });
        continue;
      }
      const shared = a.studentIds.find((s) => b.studentIds.includes(s));
      if (shared) {
        collisions.push({ kind: 'student', lessonIdA: a.id, lessonIdB: b.id, subjectId: shared });
      }
    }
  }

  return collisions;
}

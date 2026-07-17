import type { Lesson } from '@/lib/types';

/** Pure re-implementation of get_teacher_preservation_score's formula
 * (migration 008: teacher 60 / day 25 / time 15, capped, 30-day ramp) —
 * lets academy-wide aggregation avoid one RPC call per lesson. */
export function computeLessonPreservationScore(lesson: Pick<Lesson, 'teacherId' | 'originalTeacherId' | 'sameDaySince' | 'sameTimeSince'>, today: Date = new Date()): number {
  const teacher = lesson.teacherId === lesson.originalTeacherId ? 60 : 0;
  const daysSinceDay = Math.floor((today.getTime() - new Date(lesson.sameDaySince).getTime()) / 86400000);
  const daysSinceTime = Math.floor((today.getTime() - new Date(lesson.sameTimeSince).getTime()) / 86400000);
  const day = Math.min(25, (daysSinceDay / 30) * 25);
  const time = Math.min(15, (daysSinceTime / 30) * 15);
  return Math.round(teacher + day + time);
}

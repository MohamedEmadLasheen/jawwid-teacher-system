import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as lessonsSvc from '@/services/scheduling/lessons.service';
import { schedulingKeys } from '../api/queryKeys';
import { findSlotTargets } from '../utils/sameTimeSlot';
import type { LessonWithParticipants } from '@/services/scheduling/lessons.service';

/**
 * The lessons that share `subject`'s time slot — same weekday, same start
 * minute, any teacher. See findSlotTargets.
 *
 * It reads the whole lessons table rather than the per-day grid query
 * (schedulingKeys.grid(day)) because the grid's rows are the UI's FILTERED
 * view: a lesson hidden by a teacher or course filter is still in the slot
 * and would still be changed, so a bulk edit must count it. This uses the two
 * whole-table queries the app already defines —
 * fetchLessons and fetchLessonParticipants, under their existing keys — and
 * joins them here. No new service function, no new endpoint, and any other
 * screen already using those keys shares the cache.
 *
 * It reads the lessons table directly rather than the grid's filtered rows on
 * purpose: a bulk edit must see every lesson it is about to change, not the
 * subset the UI's filters happen to be showing.
 */
export function useSameTimeSlotLessons(subject: LessonWithParticipants | null) {
  const lessonsQuery = useQuery({
    queryKey: schedulingKeys.lessons(),
    queryFn: lessonsSvc.fetchLessons,
    enabled: !!subject,
  });
  const participantsQuery = useQuery({
    queryKey: schedulingKeys.lessonParticipants(),
    queryFn: lessonsSvc.fetchLessonParticipants,
    enabled: !!subject,
  });

  const lessons = useMemo<LessonWithParticipants[]>(() => {
    if (!subject) return [];
    const rows = lessonsQuery.data ?? [];
    const participants = participantsQuery.data ?? [];
    if (rows.length === 0) return [subject];

    const byLessonId = new Map<string, typeof participants>();
    for (const p of participants) {
      const list = byLessonId.get(p.lessonId);
      if (list) list.push(p);
      else byLessonId.set(p.lessonId, [p]);
    }

    const withParticipants: LessonWithParticipants[] = rows.map((lesson) => ({
      ...lesson,
      participants: byLessonId.get(lesson.id) ?? [],
    }));

    // Resolved from the subject's ORIGINAL day and start, once. The caller
    // holds on to this list for the whole operation: recomputing it after the
    // first lesson has moved would resolve the destination slot instead.
    return findSlotTargets(subject, withParticipants);
  }, [subject, lessonsQuery.data, participantsQuery.data]);

  return {
    /** Subject first, then the rest of the slot. Always at least [subject]. */
    lessons,
    /** Everything except the subject — what "all in this slot" adds. */
    others: lessons.slice(1),
    isLoading: lessonsQuery.isLoading || participantsQuery.isLoading,
    error: lessonsQuery.error || participantsQuery.error,
  };
}

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getRecommendationQueue } from '../recommendationEngine';
import { OVERLOAD_LESSON_COUNT_MULTIPLIER, MIN_WEEKLY_LESSONS_FOR_OVERLOAD } from '../recommendationEngine/config';
import { useAcademyHealth } from '@/features/scheduling/hooks/useAcademyHealth';
import { useApplyScheduleChange } from '@/features/scheduling/hooks/useScheduleRpc';
import { nextDateForDayOfWeek } from '@/features/scheduling/utils/nextDateForDayOfWeek';

/** Bounds how many overloaded teachers the candidate generator will try before giving up —
 * each one costs a handful of RPC round-trips, so this keeps a quiet-schedule dashboard fast. */
const MAX_OVERLOADED_TEACHERS_TRIED = 5;

/**
 * AI Action Queue: wires the Recommendation Engine into React. Identifies
 * overloaded teachers (real weekly lesson count), fetches one ranked queue
 * item per teacher (each with its own time-slot alternatives), and exposes
 * queue navigation — Ignore/Apply both advance to the next queue item
 * instead of leaving the section empty. "View all" exposes the full ranked
 * queue. Nothing here is invented: an empty queue means no valid, safe move
 * exists right now, and is shown as such rather than a fake recommendation.
 */
export function useSmartRecommendation() {
  const { isLoading: healthLoading, health } = useAcademyHealth();

  const overloadedTeachers = useMemo(() => {
    if (!health) return [];
    return [...health.teacherRows]
      .filter((t) => t.weeklyLessons >= MIN_WEEKLY_LESSONS_FOR_OVERLOAD && t.weeklyLessons >= health.overview.avgLessonsPerTeacher * OVERLOAD_LESSON_COUNT_MULTIPLIER)
      .sort((a, b) => b.weeklyLessons - a.weeklyLessons)
      .slice(0, MAX_OVERLOADED_TEACHERS_TRIED)
      .map((t) => ({ teacherId: t.teacherId, fullName: t.teacherName, weeklyLessons: t.weeklyLessons }));
  }, [health]);

  const overloadedTeacher = overloadedTeachers[0] ?? null;
  const enabled = !healthLoading && overloadedTeachers.length > 0;

  const query = useQuery({
    queryKey: ['dashboard', 'smartRecommendation', 'queue', overloadedTeachers.map((t) => t.teacherId)],
    queryFn: () => getRecommendationQueue(overloadedTeachers),
    enabled,
  });

  const queue = query.data ?? [];
  const [queueIndex, setQueueIndex] = useState(0);
  const [altIndex, setAltIndex] = useState(0);
  const [showQueue, setShowQueue] = useState(false);

  const currentItem = queue[queueIndex] ?? null;
  const recommendations = currentItem ? [currentItem.candidate, ...currentItem.alternatives] : [];
  const selected = recommendations[altIndex] ?? recommendations[0] ?? null;
  const allReviewed = queue.length > 0 && queueIndex >= queue.length;

  const applyChange = useApplyScheduleChange();

  const goToNext = () => {
    setQueueIndex((i) => i + 1);
    setAltIndex(0);
  };

  const apply = async () => {
    if (!selected) return;
    const { candidate } = selected;
    await applyChange.mutateAsync({
      action: 'move_lesson',
      payload: {
        lesson_id: candidate.lesson.id,
        new_start_minute: candidate.toStartMinute,
        scope: 'all_future',
        occurrence_date: nextDateForDayOfWeek(candidate.dayOfWeek),
      },
    });
    // apply_schedule_change's own invalidation covers schedulingKeys.all, but this
    // recommendation queue lives under its own key — refetch so the applied move's
    // teacher/lesson no longer reappears, and start the (regenerated) queue from 0.
    await query.refetch();
    setQueueIndex(0);
    setAltIndex(0);
    applyChange.reset(); // otherwise the next queue item's Apply button renders as already-applied/disabled
  };

  return {
    isLoading: healthLoading || (enabled && query.isLoading),
    overloadedTeacher,
    recommendations,
    selected,
    selectedIndex: altIndex,
    selectOption: setAltIndex,
    ignored: allReviewed,
    ignore: goToNext,
    apply,
    isApplying: applyChange.isPending,
    applySucceeded: applyChange.isSuccess,
    queuePosition: queueIndex + 1,
    queueTotal: queue.length,
    queue,
    showQueue,
    toggleShowQueue: () => setShowQueue((v) => !v),
    jumpToQueueItem: (i: number) => { setQueueIndex(i); setAltIndex(0); setShowQueue(false); },
  };
}

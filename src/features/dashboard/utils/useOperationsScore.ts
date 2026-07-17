import { useMemo } from 'react';
import { useScheduleHealth } from '@/features/scheduling/hooks/useScheduleHealth';
import { useScheduleGrid } from '@/features/scheduling/hooks/useScheduleGrid';
import { useStudents } from '@/features/scheduling/hooks/useStudents';
import { computeOperationsScore } from './operationsScore';
import { generateTodaysMissions } from './todaysMissions';
import { DEFAULT_FILTERS } from '@/store/scheduleUiStore';
import type { DayOfWeek } from '@/lib/types';

function todayAsDayOfWeek(): DayOfWeek {
  return new Date().getDay() as DayOfWeek;
}

/**
 * Composes the existing scheduling hooks (useScheduleHealth,
 * useScheduleGrid, useStudents) into the Live Status tiles + Operations
 * Score — no new queries beyond what get_schedule_health_metrics()
 * (extended) already returns, and "Lessons Today" reuses the exact same
 * exception-aware grid hook the Master Schedule/Weekly View use.
 */
export function useOperationsScore() {
  const health = useScheduleHealth();
  const todayGrid = useScheduleGrid(todayAsDayOfWeek(), DEFAULT_FILTERS, '');
  const students = useStudents();

  const lessonsToday = todayGrid.rows.reduce((sum, row) => sum + row.lessons.length, 0);
  const pausedStudentsCount = (students.data ?? []).filter((s) => s.status === 'paused' && !s.isDeleted).length;

  const scoreInputs = useMemo(() => {
    if (!health.data) return null;
    const m = health.data;
    return {
      unresolvedConflicts: 0, // Coming Soon — conflict queue not built yet
      unusedPrimeTimeSlots: Math.round(m.unusedPrimeTimeHours * 2),
      sellableEmptySlots: Math.round(m.totalEmptyHours * 2),
      teachersAbove95Pct: m.teachersAbove95PctCount,
      teachersBelow40Pct: m.teachersBelow40PctCount,
      schedulablePausedStudents: m.pausedStudentsSchedulableCount,
      unresolvedParentRequests: 0, // Coming Soon — parent requests not built yet
    };
  }, [health.data]);

  const scoreResult = useMemo(() => (scoreInputs ? computeOperationsScore(scoreInputs) : null), [scoreInputs]);
  const missions = useMemo(() => (scoreInputs ? generateTodaysMissions(scoreInputs) : []), [scoreInputs]);

  return {
    isLoading: health.isLoading || todayGrid.isLoading || students.isLoading,
    error: health.error || todayGrid.error || students.error,
    health: health.data,
    lessonsToday,
    pausedStudentsCount,
    scoreResult,
    missions,
  };
}

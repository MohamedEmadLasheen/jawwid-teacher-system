import { PRIME_TIME_START_MINUTE, PRIME_TIME_END_MINUTE } from '../constants/schedulingConstants';
import type { Lesson } from '@/lib/types';
import type { UnifiedAvailabilitySlot } from '@/services/scheduling/teacherAvailability.service';

export interface TeacherWorkloadMetrics {
  dailyHours: number;
  weeklyHours: number;
  monthlyHours: number;
  primeTimeHours: number;
  emptyHours: number;
  availableHours: number;
  bookedLessons: number;
  completedLessons: number;
  cancelledLessons: number;
  trialLessons: number;
  occupancyPct: number;
}

/**
 * Pure — same occupancy/prime-time math shape as get_schedule_health_metrics()
 * (migrations 009/012/013), computed client-side for one teacher so it's
 * reusable anywhere (teacher page, future dashboards/reports) without a
 * per-teacher RPC round trip. dailyHours/monthlyHours are explicit averages
 * derived from the recurring weekly rule — this schema has no per-calendar-
 * date log of hours actually taught, so they're not invented daily/monthly
 * facts, just the weekly rate expressed at those granularities.
 */
export function computeTeacherWorkload(
  lessons: Lesson[],
  availability: UnifiedAvailabilitySlot[],
  exceptionStatuses: { status: string }[]
): TeacherWorkloadMetrics {
  const activeLessons = lessons.filter((l) => l.lifecycleStatus === 'trial' || l.lifecycleStatus === 'active');

  const bookedMinutes = activeLessons.reduce((sum, l) => sum + l.durationMinutes, 0);
  const availableMinutes = availability.reduce((sum, a) => sum + (a.endMinute - a.startMinute), 0);

  const primeBookedMinutes = activeLessons.reduce((sum, l) => {
    const end = l.startMinute + l.durationMinutes;
    return sum + Math.max(0, Math.min(end, PRIME_TIME_END_MINUTE) - Math.max(l.startMinute, PRIME_TIME_START_MINUTE));
  }, 0);

  const weeklyHours = Math.round((bookedMinutes / 60) * 10) / 10;

  return {
    dailyHours: Math.round((weeklyHours / 7) * 10) / 10,
    weeklyHours,
    monthlyHours: Math.round(weeklyHours * (30 / 7) * 10) / 10,
    primeTimeHours: Math.round((primeBookedMinutes / 60) * 10) / 10,
    emptyHours: Math.round((Math.max(availableMinutes - bookedMinutes, 0) / 60) * 10) / 10,
    availableHours: Math.round((availableMinutes / 60) * 10) / 10,
    bookedLessons: activeLessons.length,
    completedLessons: exceptionStatuses.filter((e) => e.status === 'completed').length,
    cancelledLessons: exceptionStatuses.filter((e) => e.status === 'cancelled').length,
    trialLessons: activeLessons.filter((l) => l.lifecycleStatus === 'trial').length,
    occupancyPct: availableMinutes > 0 ? Math.round((bookedMinutes / availableMinutes) * 1000) / 10 : 0,
  };
}

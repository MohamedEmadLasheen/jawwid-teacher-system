import { useApplyScheduleChange } from './useScheduleRpc';
import { nextDateForDayOfWeek } from '../utils/nextDateForDayOfWeek';
import type { LessonWithParticipants } from '@/services/scheduling/lessons.service';
import type { DayOfWeek } from '@/lib/types';

/** Recurring-change scope, exactly as apply_schedule_change understands it. */
export type LessonChangeScope = 'this_occurrence' | 'all_future';

/**
 * THE shared lesson action handlers. Mobile Quick Actions and the desktop
 * dialogs call these; none of them builds an RPC payload itself, so there is
 * one definition of what "move", "cancel this occurrence" and "end" mean.
 *
 * Every call goes through useApplyScheduleChange → apply_schedule_change,
 * which is atomic, re-checks conflicts server-side, and invalidates the
 * scheduling queries on success. No action name, payload key or RPC is
 * introduced here — these are the three the schedule already had:
 *
 *   move_lesson        'this_occurrence' writes a lesson_exceptions row
 *                      (status 'rescheduled') for that date and leaves the
 *                      recurring row untouched; 'all_future' updates the
 *                      lessons row and lets the RPC maintain
 *                      same_day_since / same_time_since.
 *   cancel_occurrence  writes a lesson_exceptions row (status 'cancelled')
 *                      for one date. The lesson keeps its id and its history.
 *   end_lesson         sets lifecycle_status='ended' and effective_until.
 *                      The lesson keeps its id, participants and history.
 *
 * Neither removal path deletes anything: there is no DELETE here, and the
 * only DELETE anywhere in apply_schedule_change is 'remove_participant',
 * which this hook does not expose. "Remove from schedule" is a lifecycle
 * transition, not a deletion.
 */
export function useLessonActions() {
  const applyChange = useApplyScheduleChange();

  /**
   * Moves a lesson's time and/or teacher. Only the fields that actually
   * change are sent: apply_schedule_change COALESCEs a missing key to the
   * lesson's current value, so omitting them is what keeps an unrelated
   * attribute from being rewritten (and keeps same_time_since honest).
   */
  const moveLesson = (args: {
    lesson: LessonWithParticipants;
    newStartMinute?: number;
    newTeacherId?: string;
    scope: LessonChangeScope;
  }) => {
    const { lesson, newStartMinute, newTeacherId, scope } = args;
    const timeChanged = newStartMinute !== undefined && newStartMinute !== lesson.startMinute;
    const teacherChanged = newTeacherId !== undefined && newTeacherId !== lesson.teacherId;

    return applyChange.mutateAsync({
      action: 'move_lesson',
      payload: {
        lesson_id: lesson.id,
        new_start_minute: timeChanged ? newStartMinute : undefined,
        new_teacher_id: teacherChanged ? newTeacherId : undefined,
        scope,
        occurrence_date:
          scope === 'this_occurrence'
            ? nextDateForDayOfWeek(lesson.dayOfWeek as DayOfWeek)
            : undefined,
      },
    });
  };

  /** Removes ONE dated occurrence. The recurring lesson itself survives. */
  const cancelOccurrence = (args: { lesson: LessonWithParticipants }) =>
    applyChange.mutateAsync({
      action: 'cancel_occurrence',
      payload: {
        lesson_id: args.lesson.id,
        occurrence_date: nextDateForDayOfWeek(args.lesson.dayOfWeek as DayOfWeek),
      },
    });

  /**
   * Ends the recurring lesson from today forward. effective_until is left to
   * the RPC, which defaults it to CURRENT_DATE — the database's date, not the
   * browser's.
   */
  const endLesson = (args: { lesson: LessonWithParticipants }) =>
    applyChange.mutateAsync({
      action: 'end_lesson',
      payload: { lesson_id: args.lesson.id },
    });

  return {
    moveLesson,
    cancelOccurrence,
    endLesson,
    isPending: applyChange.isPending,
    error: applyChange.error,
    reset: applyChange.reset,
  };
}

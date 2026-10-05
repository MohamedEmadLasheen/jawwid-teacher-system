import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle, CheckCircle2, ChevronLeft, Clock, Info, Trash2, UserRound,
} from 'lucide-react';
import {
  Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useTeacherStore } from '@/store/teacherStore';
import { useStudents } from '../hooks/useStudents';
import { useCurrentPrimaryTeachers } from '../hooks/usePrimaryTeacherAssignments';
import { useCheckScheduleConflict } from '../hooks/useScheduleRpc';
import { useTeacherDaySlots } from '../hooks/useTeacherDaySlots';
import { useLessonActions, type LessonChangeScope } from '../hooks/useLessonActions';
import { buildLessonTimeOptions, type LessonTimeOption } from '../utils/lessonTimeOptions';
import { minuteToDisplayLabel } from '../utils/timeGrid';
import { DAYS_OF_WEEK } from '../constants/schedulingConstants';
import type { LessonWithParticipants } from '@/services/scheduling/lessons.service';
import type { ScheduleConflictResult } from '@/lib/types';

interface LessonQuickActionsSheetProps {
  lesson: LessonWithParticipants;
  onClose: () => void;
  /** Hands off to the existing LessonDetailDialog. */
  onViewDetails: () => void;
}

type Step = 'actions' | 'time' | 'teacher' | 'remove';

/** 52px: comfortably above the 44px floor for the primary one-handed targets. */
const PRIMARY_ACTION = 'w-full justify-start gap-3 min-h-[52px] text-base';
const ROW_ACTION = 'w-full justify-between gap-2 min-h-[48px] text-start';

/**
 * Mobile Quick Actions for one lesson.
 *
 * Replaces the full LessonDetailDialog as the FIRST thing a tap opens below
 * 768px. The two operations Operations actually performs on a phone — change
 * the time, take the lesson off the schedule — are each two taps from here
 * instead of a time input, a preview, a second dialog and a scope choice.
 * The full dialog is still one tap away under "View details", and nothing it
 * can do was moved or removed.
 *
 * It owns no scheduling logic: candidate times come from
 * buildLessonTimeOptions (the configured timeline + the teacher's working
 * window), the verdict on a chosen time comes from useCheckScheduleConflict,
 * and every write goes through useLessonActions → apply_schedule_change.
 */
export function LessonQuickActionsSheet({
  lesson, onClose, onViewDetails,
}: LessonQuickActionsSheetProps) {
  const { t } = useTranslation();
  const { teachers } = useTeacherStore();
  const { data: students = [] } = useStudents();
  const checkConflict = useCheckScheduleConflict();
  const actions = useLessonActions();
  // Unfiltered day data for this teacher: capacity must be judged against
  // everything booked, not against what the grid's filters leave visible.
  const { availability, lessons: teacherLessons } = useTeacherDaySlots(
    lesson.teacherId,
    lesson.dayOfWeek
  );
  const otherLessons = useMemo(
    () => teacherLessons.filter((l) => l.id !== lesson.id),
    [teacherLessons, lesson.id]
  );

  const [step, setStep] = useState<Step>('actions');
  const [selectedStartMinute, setSelectedStartMinute] = useState<number | null>(null);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ScheduleConflictResult | null>(null);
  const [scope, setScope] = useState<LessonChangeScope>('this_occurrence');
  const [teacherQuery, setTeacherQuery] = useState('');

  const studentIds = lesson.participants.map((p) => p.studentId);
  const studentNames = studentIds
    .map((id) => students.find((s) => s.id === id)?.fullName)
    .filter((n): n is string => !!n);
  const teacher = teachers.find((tc) => tc.id === lesson.teacherId);
  const dayLabel = t(DAYS_OF_WEEK[lesson.dayOfWeek]?.labelKey ?? '');
  const endMinute = lesson.startMinute + lesson.durationMinutes;

  const timeOptions = useMemo(
    () =>
      buildLessonTimeOptions({
        currentStartMinute: lesson.startMinute,
        durationMinutes: lesson.durationMinutes,
        availability,
        otherLessons: otherLessons.map((l) => ({
          startMinute: l.startMinute,
          endMinute: l.startMinute + l.durationMinutes,
        })),
      }),
    [lesson.startMinute, lesson.durationMinutes, availability, otherLessons]
  );

  // The student's confirmed Primary Teacher is listed first and labelled, but
  // never pre-selected: the admin still picks and confirms it like any other
  // teacher. Same rule the desktop dialog follows.
  const { data: primaryTeacherByStudent } = useCurrentPrimaryTeachers(studentIds);
  const primaryIds = new Set(
    studentIds.map((id) => primaryTeacherByStudent?.get(id)).filter((id): id is string => !!id)
  );
  const singlePrimaryTeacherId = primaryIds.size === 1 ? [...primaryIds][0] : null;

  const teacherOptions = useMemo(() => {
    const q = teacherQuery.trim().toLowerCase();
    const pool = teachers
      .filter((tc) => !tc.isDeleted && tc.id !== lesson.teacherId)
      .filter((tc) => !q || tc.fullName.toLowerCase().includes(q));
    if (!singlePrimaryTeacherId) return pool;
    return [
      ...pool.filter((tc) => tc.id === singlePrimaryTeacherId),
      ...pool.filter((tc) => tc.id !== singlePrimaryTeacherId),
    ];
  }, [teachers, teacherQuery, lesson.teacherId, singlePrimaryTeacherId]);

  /** Runs the one conflict check for whatever is currently proposed. */
  const evaluate = async (next: { startMinute?: number; teacherId?: string }) => {
    setConflict(null);
    const result = await checkConflict.mutateAsync({
      teacherId: next.teacherId ?? lesson.teacherId,
      studentIds,
      dayOfWeek: lesson.dayOfWeek,
      startMinute: next.startMinute ?? lesson.startMinute,
      durationMinutes: lesson.durationMinutes,
      excludeLessonId: lesson.id,
    });
    setConflict(result);
  };

  const pickTime = async (option: LessonTimeOption) => {
    if (!option.isSelectable) return;
    setSelectedStartMinute(option.startMinute);
    await evaluate({ startMinute: option.startMinute, teacherId: selectedTeacherId ?? undefined });
  };

  const pickTeacher = async (teacherId: string) => {
    setSelectedTeacherId(teacherId);
    await evaluate({ teacherId, startMinute: selectedStartMinute ?? undefined });
  };

  const hasSelection = selectedStartMinute !== null || selectedTeacherId !== null;
  const blocked = checkConflict.isPending || !!conflict?.hasConflict || actions.isPending;

  const confirmMove = async () => {
    await actions.moveLesson({
      lesson,
      newStartMinute: selectedStartMinute ?? undefined,
      newTeacherId: selectedTeacherId ?? undefined,
      scope,
    });
    onClose();
  };

  const confirmCancelOccurrence = async () => {
    await actions.cancelOccurrence({ lesson });
    onClose();
  };

  const confirmEndLesson = async () => {
    await actions.endLesson({ lesson });
    onClose();
  };

  /** Back to the action list, discarding any pending selection. */
  const backToActions = () => {
    setStep('actions');
    setSelectedStartMinute(null);
    setSelectedTeacherId(null);
    setConflict(null);
    setTeacherQuery('');
  };

  const conflictState = checkConflict.isPending
    ? 'checking'
    : conflict
      ? conflict.hasConflict ? 'conflict' : 'available'
      : 'none';

  /** Shared by the time and teacher flows — identical semantics, one markup. */
  const renderVerdictAndConfirm = (summary: string) => (
    <div className="space-y-3 pt-1">
      <p className="text-sm">
        <span className="text-muted-foreground">{t('scheduling.quick.newValue')}: </span>
        <strong data-testid="qa-selection">{summary}</strong>
      </p>

      <div
        data-testid="qa-conflict-status"
        data-state={conflictState}
        className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
          conflictState === 'conflict'
            ? 'border-red-200 bg-red-50 text-red-800'
            : conflictState === 'available'
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-gray-200 bg-gray-50 text-gray-700'
        }`}
      >
        {conflictState === 'conflict' ? (
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        ) : conflictState === 'available' ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
        ) : (
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
        )}
        <span>
          {conflictState === 'checking'
            ? t('scheduling.quick.checking')
            : conflictState === 'conflict'
              ? `${t('scheduling.quick.conflict')} — ${conflict?.message ?? ''}`
              : conflictState === 'available'
                ? t('scheduling.quick.available')
                : t('scheduling.quick.pickToCheck')}
        </span>
      </div>

      {/* Scope is asked only once something is actually selected — the whole
          point of the mobile flow is that the common case is two taps. */}
      <div data-testid="qa-scope" className="space-y-2">
        <p className="text-sm font-medium">{t('scheduling.quick.applyTo')}</p>
        <RadioGroup value={scope} onValueChange={(v) => setScope(v as LessonChangeScope)}>
          <label className="flex items-center gap-3 min-h-[48px] text-sm">
            <RadioGroupItem value="this_occurrence" data-testid="qa-scope-this" />
            {t('scheduling.thisOccurrence')}
          </label>
          <label className="flex items-center gap-3 min-h-[48px] text-sm">
            <RadioGroupItem value="all_future" data-testid="qa-scope-future" />
            {t('scheduling.allFuture')}
          </label>
        </RadioGroup>
      </div>

      {/* Sticky, because the picker plus the verdict plus the scope is taller
          than a phone: without this the confirm sits below the fold and the
          "tap a time, confirm" flow needs a scroll in between. */}
      <div className="sticky bottom-0 -mx-4 bg-background px-4 pb-1 pt-2">
        <Button
          type="button"
          data-testid="qa-confirm"
          className="w-full min-h-[52px] text-base"
          disabled={blocked}
          onClick={confirmMove}
        >
          {t('scheduling.quick.confirmChange')}
        </Button>
      </div>
    </div>
  );

  return (
    <Drawer open onOpenChange={(open) => !open && onClose()}>
      <DrawerContent
        data-testid="quick-actions"
        /* Capped so the grid stays partly visible behind the sheet, and the
           body scrolls rather than the sheet growing past the viewport.
           The safe-area pad keeps the last action clear of the home bar. */
        className="max-h-[85vh] pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <div className="mx-auto w-full max-w-md overflow-y-auto px-4 pt-2">
          {/* --- context header: who, when, with whom ------------------- */}
          <div className="pb-3 text-start">
            <DrawerTitle data-testid="qa-student" className="text-base font-semibold">
              {studentNames.length > 0 ? studentNames.join(', ') : t('scheduling.quick.noStudents')}
            </DrawerTitle>
            <DrawerDescription className="text-sm text-muted-foreground">
              <span data-testid="qa-day">{dayLabel}</span>
              {' · '}
              <span data-testid="qa-time">
                {minuteToDisplayLabel(lesson.startMinute)}–{minuteToDisplayLabel(endMinute)}
              </span>
            </DrawerDescription>
            <p data-testid="qa-teacher" className="text-sm text-muted-foreground">
              {teacher?.fullName ?? '—'}
            </p>
          </div>

          {step !== 'actions' && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="qa-back"
              className="mb-2 -ms-2 min-h-[44px]"
              onClick={backToActions}
            >
              <ChevronLeft className="h-4 w-4 me-1 rtl:rotate-180" />
              {t('common.back')}
            </Button>
          )}

          {/* --- step: the four actions --------------------------------- */}
          {step === 'actions' && (
            <div className="space-y-2 pb-2">
              <Button
                type="button"
                variant="outline"
                data-testid="qa-change-time"
                className={PRIMARY_ACTION}
                onClick={() => setStep('time')}
              >
                <Clock className="h-5 w-5" />
                {t('scheduling.changeTime')}
              </Button>
              <Button
                type="button"
                variant="outline"
                data-testid="qa-move-teacher"
                className={PRIMARY_ACTION}
                onClick={() => setStep('teacher')}
              >
                <UserRound className="h-5 w-5" />
                {t('scheduling.quick.moveToTeacher')}
              </Button>
              <Button
                type="button"
                variant="outline"
                data-testid="qa-remove"
                className={`${PRIMARY_ACTION} text-red-700 border-red-200 hover:bg-red-50`}
                onClick={() => setStep('remove')}
              >
                <Trash2 className="h-5 w-5" />
                {t('scheduling.quick.removeFromSchedule')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                data-testid="qa-view-details"
                className="w-full min-h-[48px] text-sm"
                onClick={onViewDetails}
              >
                {t('scheduling.quick.viewDetails')}
              </Button>
            </div>
          )}

          {/* --- step: change time ------------------------------------- */}
          {step === 'time' && (
            <div className="space-y-3 pb-2">
              <p className="text-sm font-medium">{t('scheduling.changeTime')}</p>
              <div
                data-testid="qa-time-list"
                className="max-h-[40vh] overflow-y-auto rounded-lg border divide-y"
              >
                {timeOptions.map((option) => {
                  const selected = selectedStartMinute === option.startMinute;
                  return (
                    <button
                      key={option.startMinute}
                      type="button"
                      data-testid="qa-time-option"
                      data-start-minute={option.startMinute}
                      data-selected={selected}
                      data-current={option.isCurrent}
                      data-blocked={!option.isSelectable}
                      data-block-reason={option.blockReason ?? ''}
                      disabled={!option.isSelectable}
                      onClick={() => pickTime(option)}
                      className={`${ROW_ACTION} flex items-center px-4 text-sm ${
                        selected ? 'bg-primary/10 font-semibold' : 'bg-white'
                      } ${option.isSelectable ? 'hover:bg-accent' : 'opacity-50 cursor-not-allowed'}`}
                    >
                      <span>{minuteToDisplayLabel(option.startMinute)}</span>
                      <span className="text-xs text-muted-foreground">
                        {option.isCurrent
                          ? t('scheduling.quick.currentTime')
                          : option.blockReason === 'outside_timeline'
                            ? t('scheduling.quick.blockOutsideTimeline')
                            : option.blockReason === 'outside_working_window'
                              ? t('scheduling.quick.blockOutsideWindow')
                              : option.blockReason === 'overlaps_lesson'
                                ? t('scheduling.quick.blockOverlaps')
                                : ''}
                      </span>
                    </button>
                  );
                })}
              </div>

              {hasSelection && renderVerdictAndConfirm(
                `${minuteToDisplayLabel(selectedStartMinute ?? lesson.startMinute)}${
                  selectedTeacherId
                    ? ` · ${teachers.find((tc) => tc.id === selectedTeacherId)?.fullName ?? ''}`
                    : ''
                }`
              )}
            </div>
          )}

          {/* --- step: move to another teacher ------------------------- */}
          {step === 'teacher' && (
            <div className="space-y-3 pb-2">
              <p className="text-sm font-medium">{t('scheduling.quick.moveToTeacher')}</p>
              <Input
                data-testid="qa-teacher-search"
                className="min-h-[48px]"
                placeholder={t('scheduling.selectTeacher')}
                value={teacherQuery}
                onChange={(e) => setTeacherQuery(e.target.value)}
              />
              <div
                data-testid="qa-teacher-list"
                className="max-h-[35vh] overflow-y-auto rounded-lg border divide-y"
              >
                {teacherOptions.map((tc) => (
                  <button
                    key={tc.id}
                    type="button"
                    data-testid="qa-teacher-option"
                    data-teacher-id={tc.id}
                    data-selected={selectedTeacherId === tc.id}
                    data-primary={tc.id === singlePrimaryTeacherId}
                    onClick={() => pickTeacher(tc.id)}
                    className={`${ROW_ACTION} flex items-center px-4 text-sm ${
                      selectedTeacherId === tc.id ? 'bg-primary/10 font-semibold' : 'bg-white'
                    } hover:bg-accent`}
                  >
                    <span>{tc.fullName}</span>
                    {tc.id === singlePrimaryTeacherId && (
                      <span className="text-xs text-primary">{t('scheduling.primaryTeacher')}</span>
                    )}
                  </button>
                ))}
              </div>

              {hasSelection && renderVerdictAndConfirm(
                `${teachers.find((tc) => tc.id === selectedTeacherId)?.fullName ?? ''}${
                  selectedStartMinute !== null
                    ? ` · ${minuteToDisplayLabel(selectedStartMinute)}`
                    : ''
                }`
              )}
            </div>
          )}

          {/* --- step: remove from schedule ---------------------------- */}
          {step === 'remove' && (
            <div className="space-y-3 pb-2" data-testid="qa-remove-confirm">
              <p className="text-sm font-medium">{t('scheduling.quick.removeTitle')}</p>

              {/* Each option states its consequence BEFORE it is tapped, and
                  names what it actually does. Neither deletes the lesson. */}
              <div className="space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  data-testid="qa-remove-occurrence"
                  className="w-full min-h-[52px] flex-col items-start gap-0.5 py-2 text-start whitespace-normal"
                  disabled={actions.isPending}
                  onClick={confirmCancelOccurrence}
                >
                  <span className="text-sm font-semibold">{t('scheduling.quick.removeThisOccurrence')}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {t('scheduling.quick.removeThisOccurrenceHint')}
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  data-testid="qa-remove-end"
                  className="w-full min-h-[52px] flex-col items-start gap-0.5 py-2 text-start whitespace-normal text-red-700 border-red-200 hover:bg-red-50"
                  disabled={actions.isPending}
                  onClick={confirmEndLesson}
                >
                  <span className="text-sm font-semibold">{t('scheduling.quick.removeAllFuture')}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {t('scheduling.quick.removeAllFutureHint')}
                  </span>
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">{t('scheduling.quick.removeNoDelete')}</p>
            </div>
          )}

          {/* An explicit way out, on every step. The drag handle and the
              overlay both dismiss the sheet, but neither is labelled, and on
              a phone a thumb needs one unambiguous target that is never a
              mis-swipe away from applying something. Closing never mutates. */}
          <DrawerClose asChild>
            <Button
              type="button"
              variant="ghost"
              data-testid="qa-close"
              className="mt-2 w-full min-h-[48px] text-sm text-muted-foreground"
            >
              {t('common.close')}
            </Button>
          </DrawerClose>

          {actions.error && (
            <p data-testid="qa-error" className="pt-2 text-sm text-red-600">
              {actions.error instanceof Error ? actions.error.message : String(actions.error)}
            </p>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

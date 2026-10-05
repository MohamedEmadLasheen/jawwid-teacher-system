import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, Trash2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useTeacherStore } from '@/store/teacherStore';
import { useStudents } from '../hooks/useStudents';
import { useCheckScheduleConflict } from '../hooks/useScheduleRpc';
import { useLessonActions } from '../hooks/useLessonActions';
import { useSameTimeSlotLessons } from '../hooks/useSameTimeSlotLessons';
import { DAYS_OF_WEEK, GRID_COLUMNS } from '../constants/schedulingConstants';
import { minuteToDisplayLabel } from '../utils/timeGrid';
import { nextDateForDayOfWeek } from '../utils/nextDateForDayOfWeek';
import type { LessonWithParticipants } from '@/services/scheduling/lessons.service';
import type { DayOfWeek } from '@/lib/types';

/** The durations the scheduling system already offers. Not extended here. */
const DURATIONS = [30, 60, 90, 120];

/** Which lessons an edit or a removal applies to. */
type SlotScope = 'this_lesson' | 'whole_slot';

interface LessonEditDialogProps {
  lesson: LessonWithParticipants;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Lesson Details — scheduling only.
 *
 * This card used to carry session recording, attendance reasons, make-up,
 * the preservation score, participant management and End Lesson alongside
 * the scheduling controls. It now does one job: change when/with whom a
 * lesson happens, or take it off the schedule. The operations features were
 * not deleted — AttendanceSection and its hooks stay in the repo, unmounted,
 * for a future Operations surface.
 *
 * It owns no scheduling logic. The slot membership rule is
 * findSameTimeSlotLessons, the verdict on a proposed change is
 * check_schedule_conflict, and every write is apply_schedule_change through
 * useLessonActions — the same path the mobile sheet and the drag simulator
 * use.
 */
export function LessonEditDialog({ lesson, onClose, onSaved }: LessonEditDialogProps) {
  const { t } = useTranslation();
  const { teachers } = useTeacherStore();
  const { data: students = [] } = useStudents();
  const checkConflict = useCheckScheduleConflict();
  const actions = useLessonActions();
  const { lessons: slotLessons, others: slotOthers } = useSameTimeSlotLessons(lesson);

  const [teacherId, setTeacherId] = useState(lesson.teacherId);
  const [dayOfWeek, setDayOfWeek] = useState<DayOfWeek>(lesson.dayOfWeek as DayOfWeek);
  const [startMinute, setStartMinute] = useState(lesson.startMinute);
  const [duration, setDuration] = useState(lesson.durationMinutes);

  const [scope, setScope] = useState<SlotScope | null>(null);
  const [verdict, setVerdict] = useState<{ ok: boolean; message: string } | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SlotScope | null>(null);

  const studentNames = lesson.participants
    .map((p) => students.find((s) => s.id === p.studentId)?.fullName)
    .filter((n): n is string => !!n);
  const currentTeacher = teachers.find((tc) => tc.id === lesson.teacherId);

  const dayChanged = dayOfWeek !== lesson.dayOfWeek;
  const dirty =
    teacherId !== lesson.teacherId ||
    dayChanged ||
    startMinute !== lesson.startMinute ||
    duration !== lesson.durationMinutes;

  /**
   * Why "all lessons in this time slot" can be unavailable.
   *
   * A slot is the student's weekly pattern at one time of day — Sunday,
   * Tuesday and Thursday at 3:00 PM are three lessons in one slot. Moving
   * that whole pattern to a single new day is not a thing the schedule can
   * represent: all three would land on the same day at the same minute, and
   * the student EXCLUDE constraint on (student_id, day_of_week, time_range)
   * would reject the second and third. Rather than apply the day to one
   * lesson and quietly skip it on the others — a silent partial — the wider
   * scope is withdrawn and the reason is shown.
   */
  const slotScopeBlockedReason =
    slotOthers.length === 0 ? 'only_one' : dayChanged ? 'day_changed' : null;

  /** Reset the verdict whenever the proposal changes — it no longer applies. */
  const change = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setVerdict(null);
    setOutcome(null);
  };

  // If the wider scope was selected and then became unavailable (the admin
  // changed the day afterwards), it must not silently stay selected.
  const effectiveScope: SlotScope | null =
    scope === 'whole_slot' && slotScopeBlockedReason ? null : scope;

  const targets = useMemo(
    () => (effectiveScope === 'whole_slot' ? slotLessons : [lesson]),
    [effectiveScope, slotLessons, lesson]
  );

  /**
   * Checks every lesson the save would touch, before touching any of them.
   * Bulk writes are not transactional across lessons, so the only way to keep
   * a partial apply rare is to ask first.
   */
  const verify = async () => {
    setOutcome(null);
    for (const target of targets) {
      const result = await checkConflict.mutateAsync({
        teacherId,
        studentIds: target.participants.map((p) => p.studentId),
        dayOfWeek,
        startMinute,
        durationMinutes: duration,
        excludeLessonId: target.id,
      });
      if (result.hasConflict) {
        setVerdict({
          ok: false,
          message: t('scheduling.edit.conflictOn', {
            day: t(DAYS_OF_WEEK[target.dayOfWeek].labelKey),
            message: result.message,
          }),
        });
        return false;
      }
    }
    setVerdict({ ok: true, message: t('scheduling.edit.noConflicts', { n: targets.length }) });
    return true;
  };

  const handleSave = async () => {
    if (!effectiveScope) return;
    if (!(await verify())) return;

    const { succeeded, failed } = await actions.applyToEach(targets, (target) =>
      actions.moveLesson({
        lesson: target,
        newTeacherId: teacherId,
        // Safe to send unconditionally: the wider scope is unavailable
        // whenever the day has changed, so either this is the only target or
        // the day is unchanged and the field is a no-op.
        newDayOfWeek: dayOfWeek,
        newStartMinute: startMinute,
        newDurationMinutes: duration,
        scope: 'all_future',
      })
    );

    if (failed) {
      setOutcome(t('scheduling.edit.partialApply', {
        done: succeeded.length,
        total: targets.length,
        message: failed.error instanceof Error ? failed.error.message : String(failed.error),
      }));
      return;
    }
    onSaved();
  };

  const handleDelete = async () => {
    const which = confirmDelete;
    setConfirmDelete(null);
    if (!which) return;

    if (which === 'this_lesson') {
      // One dated occurrence; the weekly lesson survives.
      await actions.cancelOccurrence({ lesson });
    } else {
      // Every lesson in the slot stops recurring from today forward.
      const { succeeded, failed } = await actions.applyToEach(slotLessons, (target) =>
        actions.endLesson({ lesson: target })
      );
      if (failed) {
        setOutcome(t('scheduling.edit.partialApply', {
          done: succeeded.length,
          total: slotLessons.length,
          message: failed.error instanceof Error ? failed.error.message : String(failed.error),
        }));
        return;
      }
    }
    onSaved();
  };

  const busy = checkConflict.isPending || actions.isPending;

  /** One line naming exactly what a scope would touch. */
  const scopeSummary = (which: SlotScope) =>
    which === 'this_lesson'
      ? t('scheduling.edit.scopeThisSummary', {
          day: t(DAYS_OF_WEEK[lesson.dayOfWeek].labelKey),
          time: minuteToDisplayLabel(lesson.startMinute),
        })
      : t('scheduling.edit.scopeSlotSummary', {
          n: slotLessons.length,
          days: slotLessons.map((l) => t(DAYS_OF_WEEK[l.dayOfWeek].labelKey)).join('، '),
        });

  return (
    <>
      <Dialog open onOpenChange={(v) => !v && onClose()}>
        <DialogContent
          data-testid="lesson-edit"
          className="w-[calc(100vw-16px)] max-w-lg max-h-[92vh] overflow-y-auto p-4 sm:p-6"
        >
          <DialogHeader>
            <DialogTitle>{t('scheduling.edit.title')}</DialogTitle>
            <DialogDescription data-testid="lesson-summary" className="text-start">
              <span className="block font-medium text-foreground">
                {studentNames.join(', ') || t('scheduling.quick.noStudents')}
              </span>
              <span className="block">
                {currentTeacher?.fullName ?? '—'}
                {' · '}
                {t(DAYS_OF_WEEK[lesson.dayOfWeek].labelKey)}
                {' · '}
                {minuteToDisplayLabel(lesson.startMinute)}–{minuteToDisplayLabel(lesson.endMinute)}
                {' · '}
                {t('scheduling.edit.durationMinutes', { n: lesson.durationMinutes })}
              </span>
            </DialogDescription>
          </DialogHeader>

          {/* ---------- SECTION 1 — edit ---------------------------------- */}
          <section className="space-y-3" data-testid="edit-section">
            <h3 className="text-sm font-semibold">{t('scheduling.edit.sectionEdit')}</h3>

            <div className="space-y-1">
              <Label htmlFor="edit-teacher">{t('scheduling.teacher')}</Label>
              <Select value={teacherId} onValueChange={change(setTeacherId)}>
                <SelectTrigger id="edit-teacher" data-testid="edit-teacher"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {teachers.filter((tc) => !tc.isDeleted).map((tc) => (
                    <SelectItem key={tc.id} value={tc.id}>{tc.fullName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="edit-day">{t('scheduling.dayColumn')}</Label>
                <Select
                  value={String(dayOfWeek)}
                  onValueChange={change((v: string) => setDayOfWeek(Number(v) as DayOfWeek))}
                >
                  <SelectTrigger id="edit-day" data-testid="edit-day"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DAYS_OF_WEEK.map((d) => (
                      <SelectItem key={d.value} value={String(d.value)}>{t(d.labelKey)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="edit-time">{t('scheduling.startTime')}</Label>
                {/* The configured timeline's own columns — the same source the
                    grid and the mobile picker use, so no hour is hardcoded. */}
                <Select
                  value={String(startMinute)}
                  onValueChange={change((v: string) => setStartMinute(Number(v)))}
                >
                  <SelectTrigger id="edit-time" data-testid="edit-time"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {GRID_COLUMNS.map((m) => (
                      <SelectItem key={m} value={String(m)}>{minuteToDisplayLabel(m)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="edit-duration">{t('scheduling.duration')}</Label>
              <Select
                value={String(duration)}
                onValueChange={change((v: string) => setDuration(Number(v)))}
              >
                <SelectTrigger id="edit-duration" data-testid="edit-duration"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DURATIONS.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {t('scheduling.edit.durationMinutes', { n: d })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Scope appears only once something has actually changed, and
                nothing can be saved until it is chosen — a change is never
                applied to more than one lesson by default. */}
            {dirty && (
              <div className="space-y-2 rounded-lg border p-3" data-testid="edit-scope">
                <p className="text-sm font-medium">{t('scheduling.edit.applyTo')}</p>
                <RadioGroup
                  value={scope ?? ''}
                  onValueChange={(v) => { setScope(v as SlotScope); setVerdict(null); setOutcome(null); }}
                >
                  <label className="flex items-start gap-3 text-sm min-h-11">
                    <RadioGroupItem value="this_lesson" data-testid="scope-this" className="mt-0.5" />
                    <span>
                      {t('scheduling.edit.scopeThis')}
                      <span className="block text-xs text-muted-foreground">
                        {scopeSummary('this_lesson')}
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start gap-3 text-sm min-h-11">
                    <RadioGroupItem
                      value="whole_slot"
                      data-testid="scope-slot"
                      className="mt-0.5"
                      disabled={slotScopeBlockedReason !== null}
                    />
                    <span>
                      {t('scheduling.edit.scopeSlot')}
                      <span
                        className="block text-xs text-muted-foreground"
                        data-testid="scope-slot-note"
                        data-blocked={slotScopeBlockedReason ?? ''}
                      >
                        {slotScopeBlockedReason === 'only_one'
                          ? t('scheduling.edit.scopeSlotOnlyOne')
                          : slotScopeBlockedReason === 'day_changed'
                            ? t('scheduling.edit.scopeSlotDayChanged')
                            : scopeSummary('whole_slot')}
                      </span>
                    </span>
                  </label>
                </RadioGroup>
              </div>
            )}

            {verdict && (
              <div
                data-testid="edit-verdict"
                data-ok={verdict.ok}
                className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
                  verdict.ok
                    ? 'border-green-200 bg-green-50 text-green-800'
                    : 'border-red-200 bg-red-50 text-red-800'
                }`}
              >
                {verdict.ok
                  ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                  : <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />}
                <span>{verdict.message}</span>
              </div>
            )}

            {outcome && (
              <p data-testid="edit-outcome" className="text-sm text-red-600">{outcome}</p>
            )}
          </section>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="min-h-11">
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              data-testid="save-changes"
              className="min-h-11"
              disabled={!dirty || !effectiveScope || busy}
              onClick={handleSave}
            >
              {t('scheduling.edit.save')}
            </Button>
          </DialogFooter>

          {/* ---------- SECTION 2 — remove ------------------------------- */}
          <section
            className="mt-2 space-y-2 rounded-lg border border-red-200 bg-red-50/40 p-3"
            data-testid="delete-section"
          >
            <h3 className="text-sm font-semibold text-red-800">{t('scheduling.edit.sectionDelete')}</h3>
            <p className="text-xs text-muted-foreground">{t('scheduling.edit.deleteExplainer')}</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                data-testid="delete-this"
                className="min-h-11 text-red-700 border-red-200 hover:bg-red-50"
                disabled={busy}
                onClick={() => setConfirmDelete('this_lesson')}
              >
                <Trash2 className="h-4 w-4 me-1.5" />
                {t('scheduling.edit.deleteThis')}
              </Button>
              <Button
                type="button"
                variant="outline"
                data-testid="delete-slot"
                className="min-h-11 text-red-700 border-red-200 hover:bg-red-50"
                disabled={busy || slotOthers.length === 0}
                onClick={() => setConfirmDelete('whole_slot')}
              >
                <Trash2 className="h-4 w-4 me-1.5" />
                {t('scheduling.edit.deleteSlot', { n: slotLessons.length })}
              </Button>
            </div>
          </section>
        </DialogContent>
      </Dialog>

      {/* Explicit confirmation, stating the consequence and the count. */}
      <AlertDialog open={confirmDelete !== null} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent data-testid="delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDelete === 'whole_slot'
                ? t('scheduling.edit.confirmSlotTitle', { n: slotLessons.length })
                : t('scheduling.edit.confirmThisTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription data-testid="delete-confirm-body">
              {confirmDelete === 'whole_slot'
                ? t('scheduling.edit.confirmSlotBody', {
                    n: slotLessons.length,
                    days: slotLessons.map((l) => t(DAYS_OF_WEEK[l.dayOfWeek].labelKey)).join('، '),
                  })
                : t('scheduling.edit.confirmThisBody', {
                    date: nextDateForDayOfWeek(lesson.dayOfWeek as DayOfWeek),
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="delete-cancel" className="min-h-11">
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="delete-confirm-action"
              className="min-h-11 bg-red-600 hover:bg-red-700 text-white"
              onClick={handleDelete}
            >
              {t('scheduling.edit.confirmAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

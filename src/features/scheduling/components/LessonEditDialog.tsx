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
import { useStudentWeeklySchedule } from '../hooks/useStudentWeeklySchedule';
import { StudentWeeklyScheduleList, type NewLessonDraft } from './StudentWeeklyScheduleList';
import { findBatchCollisions } from '../utils/bulkEditPreflight';
import { DAYS_OF_WEEK, GRID_COLUMNS } from '../constants/schedulingConstants';
import { minuteToDisplayLabel } from '../utils/timeGrid';
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

  const anchorParticipantIds = lesson.participants.map((p) => p.studentId);
  /**
   * Which student's weekly schedule is on screen.
   *
   * No entry point into this card carries a student id — the grid, the
   * teacher week view and the mobile sheet all pass a lesson. So a lesson
   * with one participant identifies its student unambiguously and selects it;
   * a group lesson does not, and an arbitrary pick would silently show one
   * student's schedule while implying it is another's. Groups therefore start
   * with no selection and ask.
   */
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(
    anchorParticipantIds.length === 1 ? anchorParticipantIds[0] : null
  );
  const [selectedLessonId, setSelectedLessonId] = useState<string>(lesson.id);

  const {
    entries: weeklyEntries,
    byId: storedById,
    isLoading: weeklyLoading,
    exceptionsLoading,
  } = useStudentWeeklySchedule(selectedStudentId);

  /**
   * The lesson being edited, as the database STORES it.
   *
   * `lesson` comes from the grid, which overlays this occurrence's
   * exceptions, so a lesson rescheduled for one date arrives carrying the
   * override. Editing and slot resolution must both work from the recurring
   * record instead: a temporary deviation must never redefine the schedule,
   * nor which lessons share its slot. Falls back to the clicked object only
   * while the stored table is still loading.
   */
  const target = storedById.get(selectedLessonId) ?? lesson;

  const {
    lessons: slotLessons,
    others: slotOthers,
    isLoading: slotLoading,
  } = useSameTimeSlotLessons(target);

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

  const dirty =
    teacherId !== target.teacherId ||
    dayOfWeek !== target.dayOfWeek ||
    startMinute !== target.startMinute ||
    duration !== target.durationMinutes;

  /**
   * Why the wider scope is unavailable, if it is.
   *
   * 'loading' matters as much as 'only_one'. Until the slot query resolves,
   * `slotLessons` is just [subject] — not because the lesson is alone, but
   * because the answer has not arrived. Saying "this is the only lesson in
   * this time slot", or showing a count of 1, would be a false statement
   * about the schedule, and an admin could reasonably act on it. While it is
   * loading the card makes NO claim about membership at all.
   *
   * Changing the day does not withdraw the scope: the whole slot moves to the
   * new day together, and whether that is legal is decided by preflight
   * across every target — all of them or none.
   */
  const slotScopeBlockedReason: 'loading' | 'only_one' | null =
    slotLoading ? 'loading' : slotOthers.length === 0 ? 'only_one' : null;

  /** Nothing may be said about the slot — or done to it — until it is known. */
  const slotUnknown = slotLoading;

  /**
   * Point the editor at another of the student's lessons.
   *
   * The fields reset to THAT lesson's stored recurring values, and every
   * derived judgement is dropped: a verdict, an outcome and a chosen scope
   * were all about the previous lesson. The slot re-resolves on its own,
   * because useSameTimeSlotLessons is asked about `target`.
   */
  const selectLesson = (lessonId: string) => {
    const next = storedById.get(lessonId);
    if (!next) return;
    setSelectedLessonId(lessonId);
    setTeacherId(next.teacherId);
    setDayOfWeek(next.dayOfWeek as DayOfWeek);
    setStartMinute(next.startMinute);
    setDuration(next.durationMinutes);
    setScope(null);
    setVerdict(null);
    setOutcome(null);
  };

  /** Switching student re-aims the weekly list; the edit target follows. */
  const selectStudent = (studentId: string) => {
    setSelectedStudentId(studentId);
  };

  /** One explicit new recurring lesson for the selected student. */
  const addLesson = async (draft: NewLessonDraft) => {
    if (!selectedStudentId) return;
    setOutcome(null);
    const check = await checkConflict.mutateAsync({
      teacherId: draft.teacherId,
      studentIds: [selectedStudentId],
      dayOfWeek: draft.dayOfWeek,
      startMinute: draft.startMinute,
      durationMinutes: draft.durationMinutes,
    });
    if (check.hasConflict) {
      setVerdict({ ok: false, message: t('scheduling.weekly.addConflict', { message: check.message }) });
      return;
    }
    await actions.createLesson({
      teacherId: draft.teacherId,
      dayOfWeek: draft.dayOfWeek,
      startMinute: draft.startMinute,
      durationMinutes: draft.durationMinutes,
      studentIds: [selectedStudentId],
    });
    setVerdict({ ok: true, message: t('scheduling.weekly.addDone') });
  };

  /** Reset the verdict whenever the proposal changes — it no longer applies. */
  const change = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setVerdict(null);
    setOutcome(null);
  };

  const effectiveScope: SlotScope | null =
    scope === 'whole_slot' && slotScopeBlockedReason ? null : scope;

  /**
   * ONLY the fields the admin actually changed.
   *
   * This is what gets sent, and therefore what must be simulated. An
   * unchanged field has to stay per-lesson: the slot holds several teachers,
   * so projecting the subject's teacher onto all of them would both invent a
   * collision that is not being requested and check the wrong teacher against
   * the database. moveLesson drops unchanged fields for the same reason, and
   * these two must not disagree.
   */
  const proposed = {
    teacherId: teacherId !== target.teacherId ? teacherId : undefined,
    dayOfWeek: dayOfWeek !== target.dayOfWeek ? dayOfWeek : undefined,
    startMinute: startMinute !== target.startMinute ? startMinute : undefined,
    durationMinutes: duration !== target.durationMinutes ? duration : undefined,
  };

  /** What `target` would look like after the change — unchanged fields kept. */
  const resolveFor = (target: LessonWithParticipants) => ({
    teacherId: proposed.teacherId ?? target.teacherId,
    dayOfWeek: proposed.dayOfWeek ?? target.dayOfWeek,
    startMinute: proposed.startMinute ?? target.startMinute,
    durationMinutes: proposed.durationMinutes ?? target.durationMinutes,
  });

  const targets = useMemo(
    () => (effectiveScope === 'whole_slot' ? slotLessons : [target]),
    [effectiveScope, slotLessons, target]
  );

  /**
   * A run died partway. Surface exactly what happened and re-read the
   * schedule, so the screen stops showing a mix of applied and unapplied
   * lessons that no longer matches the database.
   */
  const reportPartial = (
    done: number,
    total: number,
    failed: { lesson: LessonWithParticipants; error: unknown }
  ) => {
    setOutcome(t('scheduling.edit.partialApply', {
      done,
      total,
      failedId: failed.lesson.id,
      message: failed.error instanceof Error ? failed.error.message : String(failed.error),
    }));
    void actions.reconcile();
  };

  /**
   * PREFLIGHT — the whole batch is validated before a single lesson is
   * written, and a failure anywhere means nothing is written at all.
   *
   * Two independent checks, because one is not enough:
   *
   *   1. check_schedule_conflict per target, against what is stored. This is
   *      the existing authority on teacher/student double-booking.
   *   2. findBatchCollisions across the projected batch. The RPC compares one
   *      lesson against the database and cannot see the batch colliding with
   *      ITSELF — moving a whole slot onto one teacher asks for several
   *      lessons at the same teacher/day/time, each individually fine, and the
   *      second would hit the EXCLUDE constraint at write time after the
   *      first had already committed.
   *
   * Returns true only when every target passes both.
   */
  const preflight = async (): Promise<boolean> => {
    setOutcome(null);

    const collisions = findBatchCollisions(targets, proposed);
    if (collisions.length > 0) {
      const c = collisions[0];
      const name = c.kind === 'teacher'
        ? teachers.find((tc) => tc.id === c.subjectId)?.fullName ?? c.subjectId
        : students.find((st) => st.id === c.subjectId)?.fullName ?? c.subjectId;
      setVerdict({
        ok: false,
        message: t(
          c.kind === 'teacher'
            ? 'scheduling.edit.batchTeacherCollision'
            : 'scheduling.edit.batchStudentCollision',
          { name, n: targets.length }
        ),
      });
      return false;
    }

    for (const target of targets) {
      const next = resolveFor(target);
      const result = await checkConflict.mutateAsync({
        teacherId: next.teacherId,
        studentIds: target.participants.map((p) => p.studentId),
        dayOfWeek: next.dayOfWeek,
        startMinute: next.startMinute,
        durationMinutes: next.durationMinutes,
        excludeLessonId: target.id,
      });
      if (result.hasConflict) {
        setVerdict({
          ok: false,
          message: t('scheduling.edit.conflictOn', {
            day: t(DAYS_OF_WEEK[target.dayOfWeek].labelKey),
            teacher: teachers.find((tc) => tc.id === target.teacherId)?.fullName ?? '—',
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
    // Nothing is written unless every target passes.
    if (!(await preflight())) return;

    const { succeeded, failed } = await actions.applyToEach(targets, (target) =>
      // Only the changed fields travel, so an untouched teacher or day stays
      // whatever that particular lesson already had. The target list was
      // resolved from the ORIGINAL slot before any write, so the set never
      // shifts to the destination slot as lessons move.
      actions.moveLesson({
        lesson: target,
        newTeacherId: proposed.teacherId,
        newDayOfWeek: proposed.dayOfWeek as DayOfWeek | undefined,
        newStartMinute: proposed.startMinute,
        newDurationMinutes: proposed.durationMinutes,
        scope: 'all_future',
      })
    );

    if (failed) {
      // Preflight passed and a write still failed, so the schedule is now
      // partly changed. Say so explicitly rather than letting it pass as a
      // success: which lesson failed, how many had already been applied, and
      // that the operation was not atomic. The card stays open with the
      // message visible — nothing overwrites or hides it.
      reportPartial(succeeded.length, targets.length, failed);
      return;
    }
    onSaved();
  };

  /**
   * Removal, for both scopes, is end_lesson.
   *
   * What this card acts on is the RECURRING lesson record: useScheduleGrid
   * loads lessons rows and only overlays this occurrence's lesson_exceptions
   * for display, and the id on the card is the lessons row id. So "delete
   * this lesson" has to end the recurrence — cancel_occurrence would cancel a
   * single date while the weekly lesson quietly carried on, which is not what
   * the admin asked for.
   *
   * end_lesson sets lifecycle_status='ended' and effective_until. No row is
   * deleted, the id is stable, and the history stays.
   */
  const handleDelete = async () => {
    const which = confirmDelete;
    setConfirmDelete(null);
    if (!which) return;

    const toEnd = which === 'this_lesson' ? [target] : slotLessons;
    const { succeeded, failed } = await actions.applyToEach(toEnd, (target) =>
      actions.endLesson({ lesson: target })
    );
    if (failed) {
      reportPartial(succeeded.length, toEnd.length, failed);
      return;
    }
    onSaved();
  };

  const busy = checkConflict.isPending || actions.isPending;

  /**
   * A failed preflight stands until the configuration changes.
   *
   * Retrying was always safe — preflight re-runs and writes nothing — but a
   * button that looks actionable while the exact same invalid configuration
   * is on screen invites a click that cannot succeed. The block is cleared by
   * a change to any field preflight actually evaluates (teacher, day, time,
   * duration) or to the scope, each of which already resets `verdict`;
   * nothing else touches it, so an unrelated interaction never re-enables or
   * disables Save on its own.
   */
  const blockedByPreflight = verdict !== null && !verdict.ok;

  /** The teachers whose lessons are in the slot, for the scope summary. */
  const slotTeacherNames = slotLessons
    .map((l) => teachers.find((tc) => tc.id === l.teacherId)?.fullName ?? '—')
    .join('، ');

  /** One line naming exactly what a scope would touch. */
  const scopeSummary = (which: SlotScope) =>
    which === 'this_lesson'
      ? t('scheduling.edit.scopeThisSummary', {
          day: t(DAYS_OF_WEEK[target.dayOfWeek].labelKey),
          time: minuteToDisplayLabel(target.startMinute),
        })
      : t('scheduling.edit.scopeSlotSummary', {
          n: slotLessons.length,
          day: t(DAYS_OF_WEEK[target.dayOfWeek].labelKey),
          time: minuteToDisplayLabel(target.startMinute),
          teachers: slotTeacherNames,
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

          {/* ---------- the student's weekly schedule --------------------- */}
          {anchorParticipantIds.length > 0 && (
            <StudentWeeklyScheduleList
              participants={anchorParticipantIds
                .map((id) => students.find((st) => st.id === id))
                .filter((st): st is NonNullable<typeof st> => !!st)}
              selectedStudentId={selectedStudentId}
              onSelectStudent={selectStudent}
              entries={weeklyEntries}
              isLoading={weeklyLoading}
              exceptionsLoading={exceptionsLoading}
              selectedLessonId={selectedLessonId}
              anchorLessonId={lesson.id}
              onSelectLesson={selectLesson}
              teachers={teachers}
              onAddLesson={addLesson}
              addDisabled={busy}
            />
          )}

          {/* ---------- SECTION 1 — edit ---------------------------------- */}
          <section className="space-y-3" data-testid="edit-section">
            <h3 className="text-sm font-semibold">{t('scheduling.edit.sectionEdit')}</h3>

            {/* Which lesson these controls act on — never left implicit once
                the weekly list can move the target. */}
            <p data-testid="editing-target" className="text-sm text-muted-foreground">
              {t('scheduling.weekly.editing')}:{' '}
              <strong className="text-foreground">
                {t(DAYS_OF_WEEK[target.dayOfWeek].labelKey)}
                {' · '}
                {minuteToDisplayLabel(target.startMinute)}
                {' · '}
                {teachers.find((tc) => tc.id === target.teacherId)?.fullName ?? '—'}
              </strong>
            </p>

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
                        {slotScopeBlockedReason === 'loading'
                          ? t('scheduling.edit.scopeSlotLoading')
                          : slotScopeBlockedReason === 'only_one'
                            ? t('scheduling.edit.scopeSlotOnlyOne')
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
              disabled={!dirty || !effectiveScope || busy || blockedByPreflight}
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
                disabled={busy || slotUnknown || slotOthers.length === 0}
                onClick={() => setConfirmDelete('whole_slot')}
              >
                <Trash2 className="h-4 w-4 me-1.5" />
                {slotUnknown
                  ? t('scheduling.edit.deleteSlotLoading')
                  : t('scheduling.edit.deleteSlot', { n: slotLessons.length })}
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
                    day: t(DAYS_OF_WEEK[target.dayOfWeek].labelKey),
                    time: minuteToDisplayLabel(target.startMinute),
                    teachers: slotTeacherNames,
                  })
                : t('scheduling.edit.confirmThisBody', {
                    day: t(DAYS_OF_WEEK[target.dayOfWeek].labelKey),
                    time: minuteToDisplayLabel(target.startMinute),
                    teacher: teachers.find((tc) => tc.id === target.teacherId)?.fullName ?? '—',
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

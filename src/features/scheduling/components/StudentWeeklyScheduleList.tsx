import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { DAYS_OF_WEEK, GRID_COLUMNS } from '../constants/schedulingConstants';
import { minuteToDisplayLabel } from '../utils/timeGrid';
import {
  isOccurrenceCancelled, isOccurrenceRescheduled, occurrenceOverride,
  type StudentWeeklyEntry,
} from '../utils/studentWeeklySchedule';
import type { Student, Teacher, DayOfWeek } from '@/lib/types';

/** The durations the scheduling system already offers. Not extended here. */
const DURATIONS = [30, 60, 90, 120];

export interface NewLessonDraft {
  teacherId: string;
  dayOfWeek: DayOfWeek;
  startMinute: number;
  durationMinutes: number;
}

interface StudentWeeklyScheduleListProps {
  participants: Student[];
  selectedStudentId: string | null;
  onSelectStudent: (id: string) => void;
  entries: StudentWeeklyEntry[];
  isLoading: boolean;
  exceptionsLoading: boolean;
  /** The lesson currently being edited. */
  selectedLessonId: string | null;
  /** The lesson the admin originally clicked — marked CURRENT LESSON. */
  anchorLessonId: string;
  onSelectLesson: (lessonId: string) => void;
  teachers: Teacher[];
  onAddLesson: (draft: NewLessonDraft) => void;
  addDisabled?: boolean;
}

/**
 * A student's recurring weekly schedule, as an entry point for editing it.
 *
 * Every row is a RECURRING lesson rendered from its stored values. An
 * exception affecting that row's next occurrence appears as a dated
 * annotation beside it — "Cancelled on Tue 13 Oct" — never by changing the
 * row. A rescheduled occurrence additionally shows what that one date
 * actually looks like, so both facts are visible at once and the override is
 * never mistaken for the schedule.
 *
 * CURRENT LESSON is matched by lesson id, not by day and time: the clicked
 * lesson may be displayed at an override time by the grid, and matching on
 * time would then mark the wrong row, or none.
 *
 * Selecting a row changes which lesson is being edited. It never edits
 * anything by itself, and there is no scope here that spans the student's
 * schedule — each lesson is an independent record.
 */
export function StudentWeeklyScheduleList({
  participants, selectedStudentId, onSelectStudent,
  entries, isLoading, exceptionsLoading,
  selectedLessonId, anchorLessonId, onSelectLesson,
  teachers, onAddLesson, addDisabled,
}: StudentWeeklyScheduleListProps) {
  const { t, i18n } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<NewLessonDraft>({
    teacherId: teachers[0]?.id ?? '',
    dayOfWeek: 0,
    startMinute: GRID_COLUMNS[0],
    durationMinutes: 30,
  });

  /** "Tue 13 Oct" in the active language. */
  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language === 'ar' ? 'ar' : 'en-GB', {
      weekday: 'short', day: 'numeric', month: 'short',
    }).format(new Date(`${iso}T00:00:00`));

  const teacherName = (id: string) => teachers.find((tc) => tc.id === id)?.fullName ?? '—';

  // A group lesson gives no hint which participant the admin means, so one
  // must be chosen rather than guessed.
  const needsStudentChoice = !selectedStudentId && participants.length > 1;

  return (
    <section className="space-y-3" data-testid="student-weekly">
      <h3 className="text-sm font-semibold">{t('scheduling.weekly.title')}</h3>

      {participants.length > 1 && (
        <div className="space-y-1" data-testid="student-switcher">
          <Label>{t('scheduling.weekly.students')}</Label>
          <div className="flex flex-wrap gap-2">
            {participants.map((s) => (
              <Button
                key={s.id}
                type="button"
                size="sm"
                variant={selectedStudentId === s.id ? 'default' : 'outline'}
                data-testid="student-chip"
                data-student-id={s.id}
                data-selected={selectedStudentId === s.id}
                className="min-h-11"
                onClick={() => onSelectStudent(s.id)}
              >
                {s.fullName}
              </Button>
            ))}
          </div>
        </div>
      )}

      {needsStudentChoice ? (
        <p data-testid="weekly-choose-student" className="text-sm text-muted-foreground">
          {t('scheduling.weekly.chooseStudent')}
        </p>
      ) : isLoading ? (
        <p data-testid="weekly-loading" className="text-sm text-muted-foreground">
          {t('scheduling.weekly.loading')}
        </p>
      ) : (
        <>
          <div
            data-testid="weekly-list"
            className="max-h-[34vh] overflow-y-auto rounded-lg border divide-y"
          >
            {entries.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">{t('scheduling.weekly.empty')}</p>
            ) : (
              entries.map((entry) => {
                const { lesson } = entry;
                const selected = lesson.id === selectedLessonId;
                const isAnchor = lesson.id === anchorLessonId;
                const cancelled = isOccurrenceCancelled(entry);
                const rescheduled = isOccurrenceRescheduled(entry);
                const override = occurrenceOverride(entry);
                return (
                  <button
                    key={lesson.id}
                    type="button"
                    data-testid="weekly-row"
                    data-lesson-id={lesson.id}
                    data-selected={selected}
                    data-current={isAnchor}
                    data-cancelled={cancelled}
                    data-rescheduled={rescheduled}
                    onClick={() => onSelectLesson(lesson.id)}
                    className={`w-full min-h-[52px] px-3 py-2 text-start ${
                      selected ? 'bg-primary/10' : 'bg-white hover:bg-accent'
                    }`}
                  >
                    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="text-sm font-semibold">
                        {t(DAYS_OF_WEEK[lesson.dayOfWeek].labelKey)}
                      </span>
                      {/* Stored recurring values — the schedule itself. */}
                      <span className="text-sm">
                        {minuteToDisplayLabel(lesson.startMinute)}–
                        {minuteToDisplayLabel(lesson.startMinute + lesson.durationMinutes)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t('scheduling.edit.durationMinutes', { n: lesson.durationMinutes })}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        · {teacherName(lesson.teacherId)}
                      </span>
                      {isAnchor && (
                        <span
                          data-testid="weekly-current-badge"
                          className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary"
                        >
                          {t('scheduling.weekly.currentLesson')}
                        </span>
                      )}
                    </span>

                    {/* Occurrence-level annotations. Dated, and never applied
                        to the recurring values above. */}
                    {!exceptionsLoading && cancelled && (
                      <span
                        data-testid="weekly-cancelled"
                        className="mt-0.5 block text-xs text-red-700"
                      >
                        {t('scheduling.weekly.cancelledOn', { date: formatDate(entry.occurrenceDate) })}
                      </span>
                    )}
                    {!exceptionsLoading && rescheduled && (
                      <span
                        data-testid="weekly-rescheduled"
                        className="mt-0.5 block text-xs text-amber-700"
                      >
                        {t('scheduling.weekly.rescheduledOn', { date: formatDate(entry.occurrenceDate) })}
                        {' · '}
                        {t('scheduling.weekly.thatDateOnly', {
                          time: minuteToDisplayLabel(override.startMinute),
                          teacher: teacherName(override.teacherId),
                        })}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* One explicit new recurring lesson for the selected student. No
              multi-day picker, no replication across the schedule. */}
          {!adding ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="weekly-add-open"
              className="min-h-11"
              disabled={addDisabled || !selectedStudentId}
              onClick={() => setAdding(true)}
            >
              <Plus className="h-4 w-4 me-1.5" />
              {t('scheduling.weekly.addLesson')}
            </Button>
          ) : (
            <div className="space-y-3 rounded-lg border p-3" data-testid="weekly-add-form">
              <p className="text-sm font-medium">{t('scheduling.weekly.addTitle')}</p>
              <div className="space-y-1">
                <Label htmlFor="add-teacher">{t('scheduling.teacher')}</Label>
                <Select
                  value={draft.teacherId}
                  onValueChange={(v) => setDraft((d) => ({ ...d, teacherId: v }))}
                >
                  <SelectTrigger id="add-teacher" data-testid="add-teacher"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {teachers.filter((tc) => !tc.isDeleted).map((tc) => (
                      <SelectItem key={tc.id} value={tc.id}>{tc.fullName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="add-day">{t('scheduling.dayColumn')}</Label>
                  <Select
                    value={String(draft.dayOfWeek)}
                    onValueChange={(v) => setDraft((d) => ({ ...d, dayOfWeek: Number(v) as DayOfWeek }))}
                  >
                    <SelectTrigger id="add-day" data-testid="add-day"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DAYS_OF_WEEK.map((d) => (
                        <SelectItem key={d.value} value={String(d.value)}>{t(d.labelKey)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="add-time">{t('scheduling.startTime')}</Label>
                  <Select
                    value={String(draft.startMinute)}
                    onValueChange={(v) => setDraft((d) => ({ ...d, startMinute: Number(v) }))}
                  >
                    <SelectTrigger id="add-time" data-testid="add-time"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {GRID_COLUMNS.map((m) => (
                        <SelectItem key={m} value={String(m)}>{minuteToDisplayLabel(m)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="add-duration">{t('scheduling.duration')}</Label>
                <Select
                  value={String(draft.durationMinutes)}
                  onValueChange={(v) => setDraft((d) => ({ ...d, durationMinutes: Number(v) }))}
                >
                  <SelectTrigger id="add-duration" data-testid="add-duration"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DURATIONS.map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {t('scheduling.edit.durationMinutes', { n: d })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  data-testid="weekly-add-confirm"
                  className="min-h-11"
                  disabled={addDisabled || !draft.teacherId}
                  onClick={() => { onAddLesson(draft); setAdding(false); }}
                >
                  {t('scheduling.weekly.addConfirm')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  data-testid="weekly-add-cancel"
                  className="min-h-11"
                  onClick={() => setAdding(false)}
                >
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

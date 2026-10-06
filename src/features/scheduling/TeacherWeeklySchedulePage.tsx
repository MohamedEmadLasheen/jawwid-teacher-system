import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useAcademyHealth } from './hooks/useAcademyHealth';
import { useScheduleRoster } from './hooks/useScheduleRoster';
import { minuteToDisplayLabel } from './utils/timeGrid';
import { TeacherWeekGrid } from './components/TeacherWeekGrid';
import { ColorLegend } from './components/ColorLegend';
import { ScheduleRosterLegend } from './components/ScheduleRosterLegend';
import { LessonDetailDialog } from './components/LessonDetailDialog';
import { ChangeSimulatorDialog } from './components/ChangeSimulatorDialog';
import { Card, CardContent } from '@/components/ui/card';
import { SearchableSelect, type SearchableSelectGroup } from '@/components/ui/searchable-select';
import type { DayOfWeek } from '@/lib/types';
import type { LessonWithParticipants } from '@/services/scheduling/lessons.service';

interface ProposedMove {
  lesson: LessonWithParticipants;
  newTeacherId: string;
  newStartMinute: number;
}

/**
 * Per-teacher weekly view — another lens over the exact same schedule data
 * as the Master Schedule (same useScheduleGrid hook, same RPCs, same
 * dialogs), so a change made here is a change in the one shared lessons/
 * lesson_participants/lesson_exceptions dataset and is picked up by the
 * Master Schedule via the same React Query invalidation, and vice versa.
 */
export function TeacherWeeklySchedulePage() {
  const { t } = useTranslation();
  // The selector offers exactly the Schedule roster — teachers with an
  // active shift assignment — grouped by their working window. Every other
  // teacher in the academy is deliberately absent.
  const { groups, rosterTeachers } = useScheduleRoster();
  const activeTeachers = rosterTeachers;
  const [searchParams] = useSearchParams();
  const [teacherId, setTeacherId] = useState('');
  const { health: academyHealth } = useAcademyHealth();
  const teacherRow = academyHealth?.teacherRows.find((r) => r.teacherId === teacherId);
  const teacherHasAvailability = (teacherRow?.availableHours ?? 0) > 0;

  // teachers loads asynchronously (fetched into the store on login), so the
  // default selection can't be resolved synchronously at mount — pick the
  // teacher requested via ?teacherId= (e.g. linked from a Teacher Profile),
  // falling back to the first teacher once the list actually arrives.
  useEffect(() => {
    if (teacherId) return;
    const requested = searchParams.get('teacherId');
    if (requested && activeTeachers.some((tc) => tc.id === requested)) {
      setTeacherId(requested);
    } else if (activeTeachers.length > 0) {
      setTeacherId(activeTeachers[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTeachers.length, searchParams]);

  /**
   * The roster, shaped for the selector — same groups, same order, same
   * members as the grouped Select showed, with each shift window still
   * labelled by its own working hours. Nothing is filtered out here; the
   * search field filters a copy at render time and never this list.
   */
  const teacherGroups = useMemo<SearchableSelectGroup[]>(
    () => groups.map((group) => ({
      key: group.templateId,
      label: (
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {group.name} — {minuteToDisplayLabel(group.startMinute)}–{minuteToDisplayLabel(group.endMinute)}
        </span>
      ),
      options: group.teachers.map((tc) => ({ value: tc.id, label: tc.fullName })),
    })),
    [groups]
  );

  const [createTarget, setCreateTarget] = useState<{ teacherId: string; dayOfWeek: DayOfWeek; startMinute: number } | null>(null);
  const [editingLesson, setEditingLesson] = useState<LessonWithParticipants | null>(null);
  const [proposedMove, setProposedMove] = useState<ProposedMove | null>(null);

  return (
    <div className="space-y-4">
      <h1 className="text-xl sm:text-2xl font-bold text-primary">{t('scheduling.teacherWeeklySchedule')}</h1>

      <div className="space-y-3">
        <SearchableSelect
          /* Dynamic collection: searchable by architecture, not by today's count. */
          searchable
          data-testid="weekly-teacher-select"
          className="h-9 text-sm w-64"
          value={teacherId}
          onChange={setTeacherId}
          groups={teacherGroups}
          placeholder={t('scheduling.selectTeacher')}
          searchPlaceholder={t('teachers.search')}
          emptyText={t('common.noResults')}
          aria-label={t('scheduling.selectTeacher')}
        />
        <ScheduleRosterLegend />
        <ColorLegend />
      </div>

      {teacherId && teacherRow && (
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div>
                <p className="text-lg font-bold text-primary">{teacherRow.weeklyLessons}</p>
                <p className="text-[10px] text-muted-foreground">{t('scheduling.workload.weeklyLessons')}</p>
              </div>
              <div>
                <p className="text-lg font-bold text-primary">{teacherRow.studentsCount}</p>
                <p className="text-[10px] text-muted-foreground">{t('teachers.currentStudents')}</p>
              </div>
              <div>
                <p className="text-lg font-bold text-amber-600">{teacherRow.primeTimeHours}h</p>
                <p className="text-[10px] text-muted-foreground">{t('scheduling.intel.primeTime.used')}</p>
              </div>
              <div>
                <p className="text-lg font-bold text-blue-600">{teacherRow.preservationPct}%</p>
                <p className="text-[10px] text-muted-foreground">{t('scheduling.intel.preservation.avgPct')}</p>
              </div>
            </div>
            {teacherHasAvailability ? (
              <div className="grid grid-cols-2 gap-3 text-center mt-3 pt-3 border-t">
                <div>
                  <p className="text-sm font-semibold">{teacherRow.emptyHours}h</p>
                  <p className="text-[10px] text-muted-foreground">{t('scheduling.intel.overview.emptyHours')}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold">{teacherRow.sellableHours}h</p>
                  <p className="text-[10px] text-muted-foreground">{t('scheduling.intel.sellable.title')}</p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2 mt-3">
                {t('scheduling.weeklyView.availabilityNeeded')}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {teacherId ? (
        <TeacherWeekGrid
          teacherId={teacherId}
          onEmptyClick={(tId, dayOfWeek, startMinute) => setCreateTarget({ teacherId: tId, dayOfWeek, startMinute })}
          onLessonClick={(lesson) => setEditingLesson(lesson)}
          onProposeMove={(lesson, newTeacherId, newStartMinute) => setProposedMove({ lesson, newTeacherId, newStartMinute })}
        />
      ) : (
        <p className="text-sm text-muted-foreground">{t('scheduling.selectTeacher')}</p>
      )}

      {createTarget && (
        <LessonDetailDialog
          mode="create"
          teacherId={createTarget.teacherId}
          dayOfWeek={createTarget.dayOfWeek}
          startMinute={createTarget.startMinute}
          onClose={() => setCreateTarget(null)}
          onSaved={() => setCreateTarget(null)}
        />
      )}

      {editingLesson && (
        <LessonDetailDialog
          mode="edit"
          lesson={editingLesson}
          onClose={() => setEditingLesson(null)}
          onSaved={() => setEditingLesson(null)}
          onProposeMove={(lesson, newTeacherId, newStartMinute) => {
            setEditingLesson(null);
            setProposedMove({ lesson, newTeacherId, newStartMinute });
          }}
        />
      )}

      {proposedMove && (
        <ChangeSimulatorDialog
          lesson={proposedMove.lesson}
          proposedTeacherId={proposedMove.newTeacherId}
          proposedStartMinute={proposedMove.newStartMinute}
          onClose={() => setProposedMove(null)}
          onConfirmed={() => setProposedMove(null)}
        />
      )}
    </div>
  );
}

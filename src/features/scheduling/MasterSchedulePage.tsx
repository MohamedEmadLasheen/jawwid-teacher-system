import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useScheduleUiStore } from '@/store/scheduleUiStore';
import { ScheduleHealthPanel } from './components/ScheduleHealthPanel';
import { ScheduleIntelligenceCenter } from './components/ScheduleIntelligenceCenter';
import { ScheduleFilterBar } from './components/ScheduleFilterBar';
import { ColorLegend } from './components/ColorLegend';
import { PrimeTimeIndicator } from './components/PrimeTimeIndicator';
import { MasterScheduleGrid } from './components/MasterScheduleGrid';
import { LessonDetailDialog } from './components/LessonDetailDialog';
import { ChangeSimulatorDialog } from './components/ChangeSimulatorDialog';
import { DAYS_OF_WEEK } from './constants/schedulingConstants';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { DayOfWeek } from '@/lib/types';
import type { LessonWithParticipants } from '@/services/scheduling/lessons.service';

interface ProposedMove {
  lesson: LessonWithParticipants;
  newTeacherId: string;
  newStartMinute: number;
}

export function MasterSchedulePage() {
  const { t } = useTranslation();
  const { selectedDay, setSelectedDay } = useScheduleUiStore();
  const [searchParams] = useSearchParams();

  // Deep-link support (e.g. Dashboard conflict cards: /schedule?day=N) — mirrors
  // the ?issue= convention already used on /students, reusing the existing day-tab state.
  useEffect(() => {
    const dayParam = searchParams.get('day');
    if (dayParam !== null) setSelectedDay(Number(dayParam) as DayOfWeek);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [createTarget, setCreateTarget] = useState<{ teacherId: string; startMinute: number } | null>(null);
  const [editingLesson, setEditingLesson] = useState<LessonWithParticipants | null>(null);
  const [proposedMove, setProposedMove] = useState<ProposedMove | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-xl sm:text-2xl font-bold text-primary">{t('scheduling.masterSchedule')}</h1>
        <Button asChild size="sm" variant="outline">
          <Link to="/schedule/teacher"><CalendarDays className="h-4 w-4 me-1.5" />{t('scheduling.teacherWeeklySchedule')}</Link>
        </Button>
      </div>

      <ScheduleHealthPanel />

      <ScheduleIntelligenceCenter />

      <div className="space-y-3">
        <ScheduleFilterBar />
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Tabs value={String(selectedDay)} onValueChange={(v) => setSelectedDay(Number(v) as DayOfWeek)}>
            <TabsList>
              {DAYS_OF_WEEK.map((d) => (
                <TabsTrigger key={d.value} value={String(d.value)}>{t(d.labelKey)}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <PrimeTimeIndicator />
        </div>
        <ColorLegend />
      </div>

      <MasterScheduleGrid
        onEmptyClick={(teacherId, startMinute) => setCreateTarget({ teacherId, startMinute })}
        onLessonClick={(lesson) => setEditingLesson(lesson)}
        onProposeMove={(lesson, newTeacherId, newStartMinute) => setProposedMove({ lesson, newTeacherId, newStartMinute })}
      />

      {createTarget && (
        <LessonDetailDialog
          mode="create"
          teacherId={createTarget.teacherId}
          dayOfWeek={selectedDay}
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

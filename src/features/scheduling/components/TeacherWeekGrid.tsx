import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { DndContext, type DragEndEvent } from '@dnd-kit/core';
import { useScheduleGrid } from '../hooks/useScheduleGrid';
import { useResponsiveColumnWidth } from '../hooks/useResponsiveColumnWidth';
import { ScheduleGridRow } from './ScheduleGridRow';
import { minuteToLabel } from '../utils/timeGrid';
import { isColumnInPrimeTime } from '../utils/primeTime';
import { DAYS_OF_WEEK, GRID_COLUMNS, GRID_TEACHER_COLUMN_WIDTH } from '../constants/schedulingConstants';
import { DEFAULT_FILTERS, type ScheduleFilters } from '@/store/scheduleUiStore';
import type { DayOfWeek } from '@/lib/types';
import type { LessonWithParticipants } from '@/services/scheduling/lessons.service';

interface TeacherWeekGridProps {
  teacherId: string;
  onEmptyClick: (teacherId: string, dayOfWeek: DayOfWeek, startMinute: number) => void;
  onLessonClick: (lesson: LessonWithParticipants) => void;
  onProposeMove: (lesson: LessonWithParticipants, newTeacherId: string, newStartMinute: number) => void;
}

/**
 * Same schedule data and same row/cell rendering as MasterScheduleGrid —
 * just one row per day (for a single teacher) instead of one row per
 * teacher (for a single day). Reuses useScheduleGrid/ScheduleGridRow/
 * LessonCell/DraggableLessonCard unchanged; no separate query or business
 * logic. Each day gets its own DndContext so a drag can only be dropped
 * within its own day-row — dragging a lesson to a different day is done
 * via the detail dialog, not drag, matching the Master Schedule's own
 * same-day-only drag scope.
 */
export function TeacherWeekGrid({ teacherId, onEmptyClick, onLessonClick, onProposeMove }: TeacherWeekGridProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const columnWidth = useResponsiveColumnWidth(containerRef, GRID_COLUMNS.length);
  const filters: ScheduleFilters = { ...DEFAULT_FILTERS, teacherIds: [teacherId] };

  // Fixed 7 calls (one per real calendar day) — not a .map() over a hook,
  // so the same hooks fire in the same order on every render.
  const sunday = useScheduleGrid(0, filters, '');
  const monday = useScheduleGrid(1, filters, '');
  const tuesday = useScheduleGrid(2, filters, '');
  const wednesday = useScheduleGrid(3, filters, '');
  const thursday = useScheduleGrid(4, filters, '');
  const friday = useScheduleGrid(5, filters, '');
  const saturday = useScheduleGrid(6, filters, '');
  const days = [sunday, monday, tuesday, wednesday, thursday, friday, saturday];

  const isLoading = days.some((d) => d.isLoading);
  const error = days.find((d) => d.error)?.error;

  if (error) {
    const message = error instanceof Error
      ? error.message
      : (error as { message?: string })?.message ?? 'Failed to load the schedule.';
    return <p className="text-sm text-red-600 p-4">{message}</p>;
  }

  return (
    <div className="border rounded-lg overflow-hidden bg-white">
      <div className="flex border-b border-gray-200 bg-gray-50 overflow-x-auto">
        <div style={{ width: GRID_TEACHER_COLUMN_WIDTH }} className="shrink-0 sticky start-0 z-20 bg-gray-50 border-e border-gray-200" />
        <div className="flex">
          {GRID_COLUMNS.map((minute) => (
            <div
              key={minute}
              style={{ width: columnWidth }}
              className={`shrink-0 text-[10px] text-center py-2 border-e border-gray-100 truncate ${isColumnInPrimeTime(minute) ? 'bg-amber-50 font-medium text-amber-700' : 'text-muted-foreground'}`}
            >
              {minuteToLabel(minute)}
            </div>
          ))}
        </div>
      </div>

      <div ref={containerRef} className="overflow-auto" style={{ maxHeight: '70vh' }}>
        {isLoading ? (
          <p className="text-sm text-muted-foreground p-4">…</p>
        ) : (
          DAYS_OF_WEEK.map(({ value: dayOfWeek, labelKey }) => {
            const row = days[dayOfWeek].rows[0];
            if (!row) return null;

            const handleDragEnd = (event: DragEndEvent) => {
              const { active, over } = event;
              if (!over) return;
              const lesson = active.data.current?.lesson as LessonWithParticipants | undefined;
              const target = over.data.current as { teacherId: string; startMinute: number } | undefined;
              if (!lesson || !target) return;
              if (target.teacherId === lesson.teacherId && target.startMinute === lesson.startMinute) return;
              onProposeMove(lesson, target.teacherId, target.startMinute);
            };

            return (
              <DndContext key={dayOfWeek} onDragEnd={handleDragEnd}>
                <ScheduleGridRow
                  row={row}
                  columnWidth={columnWidth}
                  label={t(labelKey)}
                  onEmptyClick={(tId, startMinute) => onEmptyClick(tId, dayOfWeek, startMinute)}
                  onLessonClick={onLessonClick}
                />
              </DndContext>
            );
          })
        )}
      </div>
    </div>
  );
}

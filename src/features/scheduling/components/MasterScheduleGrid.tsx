import { useRef } from 'react';
import { DndContext, type DragEndEvent } from '@dnd-kit/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useScheduleUiStore } from '@/store/scheduleUiStore';
import { useScheduleGrid } from '../hooks/useScheduleGrid';
import { useResponsiveColumnWidth } from '../hooks/useResponsiveColumnWidth';
import { ScheduleGridRow } from './ScheduleGridRow';
import { CurrentTimeIndicator } from './CurrentTimeIndicator';
import { minuteToLabel } from '../utils/timeGrid';
import { isColumnInPrimeTime } from '../utils/primeTime';
import { GRID_COLUMNS, GRID_ROW_HEIGHT, GRID_TEACHER_COLUMN_WIDTH } from '../constants/schedulingConstants';
import type { LessonWithParticipants } from '@/services/scheduling/lessons.service';

interface MasterScheduleGridProps {
  onEmptyClick: (teacherId: string, startMinute: number) => void;
  onLessonClick: (lesson: LessonWithParticipants) => void;
  onProposeMove: (lesson: LessonWithParticipants, newTeacherId: string, newStartMinute: number) => void;
}

export function MasterScheduleGrid({ onEmptyClick, onLessonClick, onProposeMove }: MasterScheduleGridProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const { selectedDay, filters, searchQuery } = useScheduleUiStore();
  const { rows, isLoading, error } = useScheduleGrid(selectedDay, filters, searchQuery);
  const columnWidth = useResponsiveColumnWidth(parentRef, GRID_COLUMNS.length);
  const isToday = selectedDay === new Date().getDay();

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => GRID_ROW_HEIGHT,
    overscan: 8,
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const lesson = active.data.current?.lesson as LessonWithParticipants | undefined;
    const target = over.data.current as { teacherId: string; startMinute: number } | undefined;
    if (!lesson || !target) return;
    if (target.teacherId === lesson.teacherId && target.startMinute === lesson.startMinute) return;
    onProposeMove(lesson, target.teacherId, target.startMinute);
  };

  if (error) {
    const message = error instanceof Error
      ? error.message
      : (error as { message?: string })?.message ?? 'Failed to load the schedule.';
    return <p className="text-sm text-red-600 p-4">{message}</p>;
  }

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="border rounded-lg overflow-hidden bg-white">
        {/* Time header */}
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

        {/* Virtualized teacher rows */}
        <div ref={parentRef} className="overflow-auto relative" style={{ height: '65vh' }}>
          {isLoading ? (
            <p className="text-sm text-muted-foreground p-4">…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">—</p>
          ) : (
            <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
              {isToday && <CurrentTimeIndicator columnWidth={columnWidth} height={virtualizer.getTotalSize()} />}
              {virtualizer.getVirtualItems().map((virtualRow) => (
                <div
                  key={rows[virtualRow.index].teacher.id}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: virtualRow.size,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <ScheduleGridRow row={rows[virtualRow.index]} columnWidth={columnWidth} onEmptyClick={onEmptyClick} onLessonClick={onLessonClick} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DndContext>
  );
}

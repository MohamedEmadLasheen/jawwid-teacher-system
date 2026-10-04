import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DndContext, type DragEndEvent } from '@dnd-kit/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useScheduleUiStore } from '@/store/scheduleUiStore';
import { useScheduleGrid } from '../hooks/useScheduleGrid';
import { useResponsiveColumnWidth } from '../hooks/useResponsiveColumnWidth';
import { ScheduleGridRow } from './ScheduleGridRow';
import { ScheduleTimeHeader } from './ScheduleTimeHeader';
import { CurrentTimeIndicator } from './CurrentTimeIndicator';
import { timelineWidth } from '../utils/timelineGeometry';
import { GRID_COLUMNS, GRID_ROW_HEIGHT, GRID_TEACHER_COLUMN_WIDTH } from '../constants/schedulingConstants';
import type { LessonWithParticipants } from '@/services/scheduling/lessons.service';

interface MasterScheduleGridProps {
  onEmptyClick: (teacherId: string, startMinute: number) => void;
  onLessonClick: (lesson: LessonWithParticipants) => void;
  onProposeMove: (lesson: LessonWithParticipants, newTeacherId: string, newStartMinute: number) => void;
}

/**
 * Header and rows share ONE scroll container: the teacher column is
 * `sticky start-0` and the time header `sticky top-0`, so both stay frozen
 * while the single timeline scrolls underneath them. Because there is only
 * one horizontal scroller, the header cannot drift away from the lessons —
 * no scroll-position synchronisation to get wrong.
 *
 * Rows are still vertically virtualized. Since the virtualized list no
 * longer starts at the top of the scroll container (the sticky header
 * precedes it), the measured header offset is handed to the virtualizer as
 * `scrollMargin` and subtracted back out when positioning each row — the
 * standard offset-list pattern, so row windowing stays exact rather than
 * relying on overscan to hide a constant error.
 */
export function MasterScheduleGrid({ onEmptyClick, onLessonClick, onProposeMove }: MasterScheduleGridProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { selectedDay, filters, searchQuery } = useScheduleUiStore();
  const { rows, isLoading, error } = useScheduleGrid(selectedDay, filters, searchQuery);
  const columnWidth = useResponsiveColumnWidth(scrollRef, GRID_COLUMNS.length);
  const isToday = selectedDay === new Date().getDay();

  // Distance from the top of the scroll container to the top of the row list
  // (i.e. the sticky header's height). Measured rather than hardcoded so a
  // font/padding change can't silently desynchronise virtualization.
  const [listOffset, setListOffset] = useState(0);
  useEffect(() => {
    const scroller = scrollRef.current;
    const list = listRef.current;
    if (!scroller || !list) return;

    const measure = () => {
      setListOffset(
        list.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    observer.observe(list);
    return () => observer.disconnect();
  }, [isLoading, rows.length]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => GRID_ROW_HEIGHT,
    overscan: 8,
    scrollMargin: listOffset,
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

  const contentWidth = GRID_TEACHER_COLUMN_WIDTH + timelineWidth(columnWidth);

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="border rounded-lg overflow-hidden bg-white">
        <div ref={scrollRef} className="overflow-auto" style={{ height: '65vh' }}>
          <div style={{ width: contentWidth }}>
            <ScheduleTimeHeader columnWidth={columnWidth} cornerLabel={t('scheduling.teacherColumn')} />

            <div ref={listRef}>
              {isLoading ? (
                <p className="text-sm text-muted-foreground p-4">…</p>
              ) : rows.length === 0 ? (
                <p className="text-sm text-muted-foreground p-4">—</p>
              ) : (
                <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
                  {isToday && (
                    <CurrentTimeIndicator columnWidth={columnWidth} height={virtualizer.getTotalSize()} />
                  )}
                  {virtualizer.getVirtualItems().map((virtualRow) => (
                    <div
                      key={rows[virtualRow.index].teacher.id}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: virtualRow.size,
                        transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
                      }}
                    >
                      <ScheduleGridRow
                        row={rows[virtualRow.index]}
                        columnWidth={columnWidth}
                        onEmptyClick={onEmptyClick}
                        onLessonClick={onLessonClick}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </DndContext>
  );
}

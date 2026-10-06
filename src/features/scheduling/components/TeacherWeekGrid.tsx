import { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { DndContext, type DragEndEvent } from '@dnd-kit/core';
import { useScheduleGrid } from '../hooks/useScheduleGrid';
import { useScheduleMetrics } from '../hooks/useScheduleMetrics';
import { useScheduleDragSensors } from '../hooks/useScheduleDragSensors';
import { ScheduleGridRow } from './ScheduleGridRow';
import { ScheduleTimeHeader } from './ScheduleTimeHeader';
import { timelineWidth } from '../utils/timelineGeometry';
import { DAYS_OF_WEEK, GRID_COLUMNS } from '../constants/schedulingConstants';
import { DEFAULT_FILTERS, useScheduleUiStore, type ScheduleFilters } from '@/store/scheduleUiStore';
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
 *
 * Header and body live in ONE scroll container: the day column is
 * `sticky start-0` and the time header `sticky top-0`, so days stay frozen
 * on the left while the whole timeline — labels, grid lines, free bands and
 * lessons — scrolls horizontally as a single unit. There is no second
 * scroller to keep in sync, so header drift is structurally impossible.
 */
export function TeacherWeekGrid({ teacherId, onEmptyClick, onLessonClick, onProposeMove }: TeacherWeekGridProps) {
  // Same activation constraints as the master grid: without them a tap on a
  // lesson is claimed by the drag sensor on touch, and a swipe that starts on
  // a card drags the lesson instead of scrolling the page.
  const sensors = useScheduleDragSensors();
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const { columnWidth, teacherColumnWidth, rowHeight, isCompact } = useScheduleMetrics(scrollRef, GRID_COLUMNS.length);
  /**
   * The legend's filters, straight from the one store the Master Schedule
   * uses — so a chip means the same thing on both screens and there is no
   * second filter engine.
   *
   * `teacherIds` is forced LAST and deliberately: this view is pinned to the
   * teacher chosen in the selector above, and a teacher filter left over from
   * the Master Schedule must never be able to swap the week out from under it.
   */
  const storeFilters = useScheduleUiStore((state) => state.filters);
  const filters = useMemo<ScheduleFilters>(
    () => ({ ...storeFilters, teacherIds: [teacherId] }),
    [storeFilters, teacherId]
  );

  /**
   * The same week with NO legend filters applied.
   *
   * It exists because this view's rows are DAYS, not teachers. The shared
   * engine drops a row with nothing left to draw — right for the Master
   * Schedule, wrong here, where a week that silently loses Wednesday reads as
   * a broken calendar rather than a filtered one. When the filtered pass drops
   * a day, this pass supplies the day's shell: its real availability and its
   * real `occupancy`, with an empty lesson list.
   *
   * Using the unfiltered row for that shell is also what keeps capacity
   * honest — occupancy never comes from the filtered lesson set, so hiding a
   * lesson cannot repaint its minutes as free.
   *
   * It costs no extra requests: both passes read the same React Query keys,
   * so they share one cache entry per day.
   */
  const baseFilters = useMemo<ScheduleFilters>(
    () => ({ ...DEFAULT_FILTERS, teacherIds: [teacherId] }),
    [teacherId]
  );

  // Fixed 7+7 calls (one pair per real calendar day) — not a .map() over a
  // hook, so the same hooks fire in the same order on every render.
  const sunday = useScheduleGrid(0, filters, '');
  const monday = useScheduleGrid(1, filters, '');
  const tuesday = useScheduleGrid(2, filters, '');
  const wednesday = useScheduleGrid(3, filters, '');
  const thursday = useScheduleGrid(4, filters, '');
  const friday = useScheduleGrid(5, filters, '');
  const saturday = useScheduleGrid(6, filters, '');
  const days = [sunday, monday, tuesday, wednesday, thursday, friday, saturday];

  const baseSunday = useScheduleGrid(0, baseFilters, '');
  const baseMonday = useScheduleGrid(1, baseFilters, '');
  const baseTuesday = useScheduleGrid(2, baseFilters, '');
  const baseWednesday = useScheduleGrid(3, baseFilters, '');
  const baseThursday = useScheduleGrid(4, baseFilters, '');
  const baseFriday = useScheduleGrid(5, baseFilters, '');
  const baseSaturday = useScheduleGrid(6, baseFilters, '');
  const baseDays = [baseSunday, baseMonday, baseTuesday, baseWednesday, baseThursday, baseFriday, baseSaturday];

  const isLoading = days.some((d) => d.isLoading);
  const error = days.find((d) => d.error)?.error;

  if (error) {
    const message = error instanceof Error
      ? error.message
      : (error as { message?: string })?.message ?? 'Failed to load the schedule.';
    return <p className="text-sm text-red-600 p-4">{message}</p>;
  }

  const contentWidth = teacherColumnWidth + timelineWidth(columnWidth);

  return (
    <div className="border rounded-lg overflow-hidden bg-white">
      <div ref={scrollRef} className="overflow-auto" style={{ maxHeight: '70vh' }}>
        <div style={{ width: contentWidth }}>
          <ScheduleTimeHeader
            columnWidth={columnWidth}
            teacherColumnWidth={teacherColumnWidth}
            isCompact={isCompact}
            cornerLabel={t('scheduling.dayColumn')}
          />

          {isLoading ? (
            <p className="text-sm text-muted-foreground p-4">…</p>
          ) : (
            DAYS_OF_WEEK.map(({ value: dayOfWeek, labelKey }) => {
              // Every one of the seven days stays on screen. A day the
              // filters emptied falls back to its unfiltered shell with no
              // lessons — same availability, same occupancy, nothing drawn.
              const base = baseDays[dayOfWeek].rows[0];
              const row = days[dayOfWeek].rows[0] ?? (base && { ...base, lessons: [] });
              // Only a teacher who is not on the roster at all has no shell.
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
                <DndContext key={dayOfWeek} sensors={sensors} onDragEnd={handleDragEnd}>
                  <div style={{ height: rowHeight }}>
                    <ScheduleGridRow
                      row={row}
                      columnWidth={columnWidth}
                      teacherColumnWidth={teacherColumnWidth}
                      isCompact={isCompact}
                      label={t(labelKey)}
                      onEmptyClick={(tId, startMinute) => onEmptyClick(tId, dayOfWeek, startMinute)}
                      onLessonClick={onLessonClick}
                    />
                  </div>
                </DndContext>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

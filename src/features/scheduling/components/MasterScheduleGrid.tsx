import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DndContext, type DragEndEvent } from '@dnd-kit/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Button } from '@/components/ui/button';
import { useScheduleUiStore, hasActiveFilters } from '@/store/scheduleUiStore';
import { useScheduleGrid } from '../hooks/useScheduleGrid';
import { useScheduleMetrics } from '../hooks/useScheduleMetrics';
import { useScheduleDragSensors } from '../hooks/useScheduleDragSensors';
import { useScheduleRoster } from '../hooks/useScheduleRoster';
import { ScheduleGridRow } from './ScheduleGridRow';
import { ScheduleTimeHeader, scheduleContentWidth } from './ScheduleTimeHeader';
import { CurrentTimeIndicator } from './CurrentTimeIndicator';
import { GRID_COLUMNS } from '../constants/schedulingConstants';
import { minuteToDisplayLabel } from '../utils/timeGrid';
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
  const { selectedDay, filters, searchQuery, setSearchQuery, resetFilters } = useScheduleUiStore();
  const { rows, isLoading, error } = useScheduleGrid(selectedDay, filters, searchQuery);
  const { columnWidth, teacherColumnWidth, rowHeight, isCompact } = useScheduleMetrics(scrollRef, GRID_COLUMNS.length);
  const { groups, templateIdsByTeacherId } = useScheduleRoster();
  const isFiltered = hasActiveFilters(filters) || searchQuery.trim().length > 0;
  const isToday = selectedDay === new Date().getDay();

  // One flat list of group headers + teacher rows, so a single virtualizer
  // covers both. Group membership and labels come from the roster, so nothing
  // here enumerates teachers or hours.
  const GROUP_HEADER_HEIGHT = 34;
  const items = useMemo(() => {
    // Group membership comes from the roster hook, the same map the shift-group
    // filter and the roster legend read — not a second local derivation.
    const groupOf = (teacherId: string) => templateIdsByTeacherId.get(teacherId)?.[0];
    const byTemplate = new Map(groups.map((g) => [g.templateId, g]));

    const out: Array<
      | { kind: 'group'; key: string; name: string; startMinute: number; endMinute: number; count: number }
      | { kind: 'row'; key: string; row: (typeof rows)[number] }
    > = [];
    let current: string | null = null;
    for (const row of rows) {
      const templateId = groupOf(row.teacher.id);
      if (templateId && templateId !== current) {
        current = templateId;
        const g = byTemplate.get(templateId)!;
        // Counted over the VISIBLE rows, so the banner agrees with what is
        // drawn under it while a filter is active.
        const count = rows.filter((r) => groupOf(r.teacher.id) === templateId).length;
        out.push({ kind: 'group', key: `g-${templateId}`, name: g.name, startMinute: g.startMinute, endMinute: g.endMinute, count });
      }
      out.push({ kind: 'row', key: row.teacher.id, row });
    }
    return out;
  }, [rows, groups, templateIdsByTeacherId]);

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
  }, [isLoading, items.length]);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (items[index]?.kind === 'group' ? GROUP_HEADER_HEIGHT : rowHeight),
    overscan: 8,
    scrollMargin: listOffset,
  });

  // Drag must not steal the tap: see useScheduleDragSensors for why the
  // defaults are unusable on touch and what each constraint is for.
  const sensors = useScheduleDragSensors();

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

  // One column wider than the axis: the header's terminal boundary cell
  // lives past the last schedulable column. Rows stay axis-width.
  const contentWidth = scheduleContentWidth(columnWidth, teacherColumnWidth);

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="border rounded-lg overflow-hidden bg-white">
        <div ref={scrollRef} className="overflow-auto" style={{ height: '65vh' }}>
          <div style={{ width: contentWidth }}>
            <ScheduleTimeHeader
              columnWidth={columnWidth}
              teacherColumnWidth={teacherColumnWidth}
              isCompact={isCompact}
              cornerLabel={t('scheduling.teacherColumn')}
            />

            <div ref={listRef}>
              {isLoading ? (
                <p className="text-sm text-muted-foreground p-4">…</p>
              ) : rows.length === 0 ? (
                // A filter combination can legitimately match nothing (an
                // empty Free-time day, a supervisor with no lessons today).
                // Say so, and offer the one-click way back.
                <div className="p-4 flex flex-wrap items-center gap-3">
                  <p className="text-sm text-muted-foreground">
                    {isFiltered ? t('scheduling.noFilterMatches') : '—'}
                  </p>
                  {isFiltered && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { resetFilters(); setSearchQuery(''); }}
                    >
                      {t('scheduling.clearFilters')}
                    </Button>
                  )}
                </div>
              ) : (
                <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
                  {isToday && (
                    <CurrentTimeIndicator
                      columnWidth={columnWidth}
                      teacherColumnWidth={teacherColumnWidth}
                      height={virtualizer.getTotalSize()}
                    />
                  )}
                  {virtualizer.getVirtualItems().map((virtualRow) => {
                    const item = items[virtualRow.index];
                    return (
                      <div
                        key={item.key}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: virtualRow.size,
                          transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
                        }}
                      >
                        {item.kind === 'group' ? (
                          // Group banner. Sticky on the inline axis so the label
                          // stays readable while the timeline scrolls sideways.
                          <div className="flex h-full items-center border-b border-gray-200 bg-muted/60">
                            <div
                              style={{ width: teacherColumnWidth }}
                              className="shrink-0 sticky start-0 z-30 bg-muted/60 h-full flex items-center px-1.5"
                            >
                              <span className="text-[11px] font-bold uppercase tracking-wide truncate">
                                {item.name}
                              </span>
                            </div>
                            <span className="text-[11px] text-muted-foreground whitespace-nowrap px-2">
                              {minuteToDisplayLabel(item.startMinute)}–{minuteToDisplayLabel(item.endMinute)} · {item.count}
                            </span>
                          </div>
                        ) : (
                          <ScheduleGridRow
                            row={item.row}
                            columnWidth={columnWidth}
                            teacherColumnWidth={teacherColumnWidth}
                            isCompact={isCompact}
                            onEmptyClick={onEmptyClick}
                            onLessonClick={onLessonClick}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </DndContext>
  );
}

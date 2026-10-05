import { useMemo } from 'react';
import { LessonCell } from './LessonCell';
import { ScheduleSlotCell } from './ScheduleSlotCell';
import { computeRowLayout } from '../utils/computeRowLayout';
import { minuteToX, minuteSpanToWidth, timelineWidth } from '../utils/timelineGeometry';
import { GRID_COLUMNS } from '../constants/schedulingConstants';
import type { ScheduleGridTeacherRow } from '../hooks/useScheduleGrid';
import type { LessonWithParticipants } from '@/services/scheduling/lessons.service';

interface ScheduleGridRowProps {
  row: ScheduleGridTeacherRow;
  columnWidth: number;
  /** Width of the frozen label column — responsive, from useScheduleMetrics. */
  teacherColumnWidth: number;
  /** Below desktop: larger, wrappable label text. */
  isCompact?: boolean;
  onEmptyClick: (teacherId: string, startMinute: number) => void;
  onLessonClick: (lesson: LessonWithParticipants) => void;
  /** Overrides the row's leading-column label (defaults to the teacher's name) — used by the per-teacher weekly view, where each row is a day rather than a teacher. */
  label?: string;
}

/**
 * One schedule row, drawn as three layers that all share the single
 * timelineGeometry coordinate system:
 *
 *   0. 30-minute background columns — grid lines, Prime Time tint,
 *      outside-shift hatching, drop targets, click-to-create.
 *   1. Free-capacity bands — inside the teacher's working window and not
 *      covered by a lesson. Non-interactive, so layer 0 still receives the
 *      click that creates a lesson there.
 *   2. Lesson cards — absolutely positioned at their exact start minute and
 *      exact duration width.
 *
 * The leading label column is `sticky start-0`, which freezes it against the
 * grid's single horizontal scroll container while every layer above scrolls
 * together as one timeline.
 */
export function ScheduleGridRow({ row, columnWidth, teacherColumnWidth, isCompact = false, onEmptyClick, onLessonClick, label }: ScheduleGridRowProps) {
  const layout = useMemo(() => computeRowLayout(row.lessons, row.availability), [row.lessons, row.availability]);
  const axisWidth = timelineWidth(columnWidth);

  return (
    <div className="flex h-full border-b border-gray-100">
      <div
        style={{ width: teacherColumnWidth }}
        className={`shrink-0 sticky start-0 z-30 bg-white border-e border-gray-200 flex items-center ${isCompact ? 'px-1.5' : 'px-3'}`}
      >
        {/* Two lines before ellipsis on compact: most teacher names fit, and a
            name the admin cannot read defeats the point of a frozen column. */}
        <p className={isCompact
          ? 'text-[13px] font-semibold leading-tight line-clamp-2 break-words'
          : 'text-sm font-medium truncate'}>
          {label ?? row.teacher.fullName}
        </p>
      </div>

      <div className="relative shrink-0 h-full" style={{ width: axisWidth }}>
        {/* Layer 0 — background columns */}
        <div className="absolute inset-0 flex">
          {GRID_COLUMNS.map((columnStart, idx) => (
            <ScheduleSlotCell
              key={columnStart}
              teacherId={row.teacher.id}
              columnStart={columnStart}
              columnWidth={columnWidth}
              inWindow={layout.columnInWindow[idx]}
              hasWorkingWindow={layout.hasWorkingWindow}
              onEmptyClick={onEmptyClick}
            />
          ))}
        </div>

        {/* Layer 1 — UNUSED capacity inside the working window. Red is an
            admin utilisation alert: the teacher is on shift but has no
            student. It is drawn under the lesson layer and is
            pointer-events-none, so a lesson card always wins visually and
            the slot underneath stays clickable. */}
        {layout.freeIntervals.map((interval) => (
          <div
            key={`free-${interval.startMinute}`}
            aria-hidden
            className="absolute top-0 h-full z-10 pointer-events-none bg-red-100/80 border-y-2 border-red-300"
            style={{
              // Logical inset, not `left` — see LessonCell: the axis reverses
              // under dir="rtl", so a physical offset would mirror away from
              // the header while the flex slot columns followed it.
              insetInlineStart: minuteToX(interval.startMinute, columnWidth),
              width: minuteSpanToWidth(interval.startMinute, interval.endMinute, columnWidth),
            }}
          />
        ))}

        {/* Layer 2 — lessons */}
        {row.lessons.map((lesson) => (
          <LessonCell
            key={lesson.id}
            lesson={lesson}
            columnWidth={columnWidth}
            isCompact={isCompact}
            onLessonClick={onLessonClick}
          />
        ))}
      </div>
    </div>
  );
}

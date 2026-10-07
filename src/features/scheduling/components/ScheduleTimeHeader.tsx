import { minuteToDisplayLabel } from '../utils/timeGrid';
import { isColumnInPrimeTime } from '../utils/primeTime';
import { timelineWidth } from '../utils/timelineGeometry';
import { GRID_COLUMNS, GRID_END_MINUTE } from '../constants/schedulingConstants';

interface ScheduleTimeHeaderProps {
  columnWidth: number;
  /** Width of the frozen leading column — responsive, from useScheduleMetrics. */
  teacherColumnWidth: number;
  /** Below desktop: larger labels, since the columns are wider there. */
  isCompact?: boolean;
  /** Label for the frozen leading column (e.g. "Day" / "Teacher"). */
  cornerLabel?: string;
}

/**
 * Width of the scrollable CONTENT, which is one column wider than the axis.
 *
 * The header carries 33 visual cells — the 32 schedulable columns plus the
 * terminal boundary cell — while every row carries only the 32. Grids size
 * their scroll content with this so the terminal cell is reachable by
 * scrolling instead of being cut off at the axis end. It is deliberately NOT
 * in timelineGeometry: nothing that positions a lesson may ever see it.
 */
export function scheduleContentWidth(columnWidth: number, teacherColumnWidth: number): number {
  return teacherColumnWidth + timelineWidth(columnWidth) + columnWidth;
}

/**
 * The single time header used by every schedule grid.
 *
 * It is rendered *inside* the grid's one horizontal scroll container (never
 * in a scroller of its own), so it cannot drift out of sync with the rows:
 * `sticky top-0` freezes it vertically while it scrolls horizontally with the
 * body as one timeline. Its column widths are the same `columnWidth` that
 * timelineGeometry turns into lesson positions, so label boundaries and
 * lesson edges coincide by construction rather than by coincidence.
 *
 * The header is one column WIDER than the axis, because of the terminal
 * boundary cell at the end. The first 32 cells still line up with the rows
 * exactly — both start at the same origin and step by the same columnWidth —
 * so the extra cell can only ever appear past the end of the schedule.
 */
export function ScheduleTimeHeader({ columnWidth, teacherColumnWidth, isCompact = false, cornerLabel }: ScheduleTimeHeaderProps) {
  const cellType = isCompact ? 'text-[11px] py-2.5 font-medium' : 'text-[9px] py-2';

  return (
    <div className="flex sticky top-0 z-40 bg-gray-50 border-b border-gray-200">
      <div
        style={{ width: teacherColumnWidth }}
        className="shrink-0 sticky start-0 z-50 bg-gray-50 border-e border-gray-200 flex items-center px-3"
      >
        {cornerLabel && (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground truncate">
            {cornerLabel}
          </span>
        )}
      </div>

      {/* The schedulable axis: exactly GRID_COLUMNS wide, exactly what the rows
          are wide. Nothing may be added inside this box. */}
      <div className="flex shrink-0" style={{ width: timelineWidth(columnWidth) }}>
        {GRID_COLUMNS.map((minute) => (
          <div
            key={minute}
            style={{ width: columnWidth }}
            className={`shrink-0 leading-tight text-center border-e border-gray-100 truncate ${cellType} ${
              isColumnInPrimeTime(minute) ? 'bg-amber-50 font-medium text-amber-700' : 'text-muted-foreground'
            }`}
          >
            {minuteToDisplayLabel(minute)}
          </div>
        ))}
      </div>

      {/*
        TERMINAL BOUNDARY CELL — a sibling of the axis, never a member of it.

        It is a flex item in the same row as the column cells, so it renders
        BESIDE "11:30 PM" on one line, exactly one column wide, with the same
        padding and type. Same row and same box model is what keeps their
        vertical centres aligned and their text boxes disjoint, at every column
        width and in both directions, with no offset or font trick.

        Because it sits OUTSIDE the axis box, it adds nothing to
        timelineWidth(): lesson positions, row widths and every geometry
        calculation are untouched, GRID_COLUMNS stays 32, and the time picker —
        derived from GRID_COLUMNS — still ends at 11:30 PM. The schedule body
        still ends at 32 × columnWidth; only the header reaches past it.

        Flex order, not a physical offset, is what places it after the final
        column, so dir="rtl" mirrors the whole row and the boundary appears at
        the mirrored end with no direction-specific code.

        `pointer-events-none` so it can never be read as a schedulable slot:
        it cannot be clicked, cannot open lesson creation, and cannot be hit by
        an empty-cell handler.
      */}
      <div
        data-testid="timeline-end-label"
        aria-hidden
        className={`shrink-0 pointer-events-none select-none leading-tight text-center truncate border-s-2 border-gray-300 bg-gray-100/70 font-semibold text-gray-600 ${cellType}`}
        style={{ width: columnWidth }}
      >
        {minuteToDisplayLabel(GRID_END_MINUTE)}
      </div>
    </div>
  );
}

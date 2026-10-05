import { minuteToDisplayLabel } from '../utils/timeGrid';
import { isColumnInPrimeTime } from '../utils/primeTime';
import { timelineWidth } from '../utils/timelineGeometry';
import { GRID_COLUMNS, GRID_TEACHER_COLUMN_WIDTH } from '../constants/schedulingConstants';

interface ScheduleTimeHeaderProps {
  columnWidth: number;
  /** Label for the frozen leading column (e.g. "Day" / "Teacher"). */
  cornerLabel?: string;
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
 */
export function ScheduleTimeHeader({ columnWidth, cornerLabel }: ScheduleTimeHeaderProps) {
  return (
    <div className="flex sticky top-0 z-40 bg-gray-50 border-b border-gray-200">
      <div
        style={{ width: GRID_TEACHER_COLUMN_WIDTH }}
        className="shrink-0 sticky start-0 z-50 bg-gray-50 border-e border-gray-200 flex items-center px-3"
      >
        {cornerLabel && (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground truncate">
            {cornerLabel}
          </span>
        )}
      </div>
      <div className="flex shrink-0" style={{ width: timelineWidth(columnWidth) }}>
        {GRID_COLUMNS.map((minute) => (
          <div
            key={minute}
            style={{ width: columnWidth }}
            className={`shrink-0 text-[9px] leading-tight text-center py-2 border-e border-gray-100 truncate ${
              isColumnInPrimeTime(minute) ? 'bg-amber-50 font-medium text-amber-700' : 'text-muted-foreground'
            }`}
          >
            {minuteToDisplayLabel(minute)}
          </div>
        ))}
      </div>
    </div>
  );
}

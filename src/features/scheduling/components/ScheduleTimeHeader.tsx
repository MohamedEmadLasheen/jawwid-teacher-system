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
 * The single time header used by every schedule grid.
 *
 * It is rendered *inside* the grid's one horizontal scroll container (never
 * in a scroller of its own), so it cannot drift out of sync with the rows:
 * `sticky top-0` freezes it vertically while it scrolls horizontally with the
 * body as one timeline. Its column widths are the same `columnWidth` that
 * timelineGeometry turns into lesson positions, so label boundaries and
 * lesson edges coincide by construction rather than by coincidence.
 */
export function ScheduleTimeHeader({ columnWidth, teacherColumnWidth, isCompact = false, cornerLabel }: ScheduleTimeHeaderProps) {
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
      <div className="flex shrink-0 relative" style={{ width: timelineWidth(columnWidth) }}>
        {GRID_COLUMNS.map((minute) => (
          <div
            key={minute}
            style={{ width: columnWidth }}
            className={`shrink-0 leading-tight text-center border-e border-gray-100 truncate ${isCompact ? 'text-[11px] py-2.5 font-medium' : 'text-[9px] py-2'} ${
              isColumnInPrimeTime(minute) ? 'bg-amber-50 font-medium text-amber-700' : 'text-muted-foreground'
            }`}
          >
            {minuteToDisplayLabel(minute)}
          </div>
        ))}

        {/*
          The terminal boundary: where the axis STOPS, not another slot.

          GRID_COLUMNS is untouched, so this adds no schedulable column — the
          last bookable slot is still 11:30 PM → midnight, and
          lessonTimeOptions (which derives its choices from GRID_COLUMNS) is
          unaffected. The anchor is zero-width and absolutely positioned, so it
          contributes no layout width either: the header stays exactly
          timelineWidth(columnWidth) and cannot desynchronise from the rows or
          push the document sideways.

          The label hangs off a zero-width anchor via `inset-inline-end: 0`, so
          it extends back toward the start of the axis in BOTH directions —
          no `transform` or physical `left/right`, which would mirror wrongly
          under dir="rtl".

          It sits on its OWN baseline at the bottom of the header rather than
          beside the 11:30 PM label. Sharing that column horizontally does not
          survive a phone: at the compact face "11:30 PM" and "12:00 AM" need
          ~100px of an 80px column and overlapped by 24px (6px even after
          shrinking both). On its own line the two never compete at any column
          width, in either direction.

          The text comes from the same minuteToDisplayLabel used by every other
          label, so midnight reads "12:00 AM" (AM — midnight, not noon) with no
          second copy of the formatting rules.
        */}
        <div
          aria-hidden
          className="absolute top-0 bottom-0 border-e-2 border-gray-300"
          style={{ insetInlineStart: timelineWidth(columnWidth), width: 0 }}
        >
          <div
            data-testid="timeline-end-label"
            className="absolute bottom-0 whitespace-nowrap pe-1 text-[9px] leading-none pb-0.5 font-semibold text-gray-600"
            style={{ insetInlineEnd: 0 }}
          >
            {minuteToDisplayLabel(GRID_END_MINUTE)}
          </div>
        </div>
      </div>
    </div>
  );
}

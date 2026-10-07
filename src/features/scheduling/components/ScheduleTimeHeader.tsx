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
      {/*
        `pb-4` reserves a TERMINAL STRIP along the bottom of the axis that the
        column cells can never enter — they are flex items of this box, so
        padding is outside their content box by construction. The terminal
        label lives in that strip and the column labels live above it, which is
        what makes an overlap structurally impossible rather than a matter of
        the two happening to miss each other.

        The previous attempt positioned the label at `bottom-0` with no
        reserved space, so it sat ON TOP of the final column's label box. The
        clearance it appeared to have was only the slack between the cell's
        padding and its text — 0.3px on a phone, and NEGATIVE on desktop where
        the header is shorter (py-2 + 9px text). Measured, it intersected
        "11:30 PM" at all six supported widths in both directions.
      */}
      <div className="flex shrink-0 relative pb-4" style={{ width: timelineWidth(columnWidth) }}>
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

          It sits in the reserved terminal strip (the `pb-4` above), on its own
          baseline BELOW the column labels — never in the same horizontal label
          box as "11:30 PM". The two therefore cannot intersect at any column
          width, zoom level or direction: the separation comes from layout, not
          from a font size, a negative margin or a lucky pixel offset.

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
            className="absolute bottom-0 pb-0.5 pe-1 whitespace-nowrap text-[9px] leading-none font-semibold text-gray-600"
            style={{ insetInlineEnd: 0 }}
          >
            {minuteToDisplayLabel(GRID_END_MINUTE)}
          </div>
        </div>
      </div>
    </div>
  );
}

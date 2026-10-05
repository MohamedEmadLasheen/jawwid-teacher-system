import { useEffect, useState, type RefObject } from 'react';
import { GRID_COLUMN_WIDTH, GRID_ROW_HEIGHT, GRID_TEACHER_COLUMN_WIDTH } from '../constants/schedulingConstants';

export interface ScheduleMetrics {
  /** Rendered width of one SLOT_MINUTES column. */
  columnWidth: number;
  /** Width of the frozen teacher/day column. */
  teacherColumnWidth: number;
  /** Height of one teacher row. */
  rowHeight: number;
  /** True below the desktop breakpoint — denser type, fewer card details. */
  isCompact: boolean;
}

/**
 * Breakpoint ladder, by viewport width. Measured rather than guessed: the
 * widest 12-hour label ("10:30 AM") renders 40px at the header's 9px font, so
 * a column has to clear ~41px before it clips at all, and wants meaningfully
 * more than that to be comfortable on a phone held at arm's length.
 *
 * The frozen label column is sized from its own content, measured at the
 * compact 13px semibold face: the widest single word it must hold is
 * "Wednesday" (74.2px) on the day grid and "Mohammed" (74.5px) on the teacher
 * grid — a single word cannot wrap, so it is what actually sets the floor.
 * With the compact 6px side padding and the 1px divider that needs ~87px,
 * which is why 88 is the narrowest honest value here. Arabic is far shorter
 * (widest is "الخميس" at 43.6px) and never binds.
 *
 * Below `desktop` the timeline does NOT fit itself to the viewport. It keeps a
 * comfortable fixed column and lets the user scroll horizontally on purpose —
 * squeezing twenty-four columns into a 375px phone is what made the old
 * layout unreadable (375 - 176 teacher column = 199px / 24 ≈ 8px per column,
 * which then clamped to the 40px floor and simply overflowed anyway).
 */
const BREAKPOINTS = [
  { maxWidth: 400, columnWidth: 80, teacherColumnWidth: 88, rowHeight: 68, isCompact: true },
  { maxWidth: 768, columnWidth: 84, teacherColumnWidth: 96, rowHeight: 68, isCompact: true },
  { maxWidth: 1024, columnWidth: 80, teacherColumnWidth: 150, rowHeight: 66, isCompact: true },
] as const;

/**
 * Desktop keeps the original fit-to-container behaviour, but the floor rises
 * from 40px to 48px: 40 was a pixel under the widest label's own width, so
 * labels were clipping at the narrowest desktop windows. Everything wider
 * than the fitted width is unchanged.
 */
const DESKTOP_MIN_COLUMN_WIDTH = 48;

function metricsForViewport(viewportWidth: number, containerWidth: number, columnCount: number): ScheduleMetrics {
  const bp = BREAKPOINTS.find((b) => viewportWidth < b.maxWidth);
  if (bp) {
    return {
      columnWidth: bp.columnWidth,
      teacherColumnWidth: bp.teacherColumnWidth,
      rowHeight: bp.rowHeight,
      isCompact: bp.isCompact,
    };
  }

  const available = containerWidth - GRID_TEACHER_COLUMN_WIDTH;
  const fitted = columnCount > 0 ? Math.floor(available / columnCount) : GRID_COLUMN_WIDTH;
  return {
    columnWidth: Math.max(DESKTOP_MIN_COLUMN_WIDTH, fitted),
    teacherColumnWidth: GRID_TEACHER_COLUMN_WIDTH,
    rowHeight: GRID_ROW_HEIGHT,
    isCompact: false,
  };
}

/**
 * THE single source of the schedule's rendered dimensions.
 *
 * Every width here is a whole number of pixels, and the header/lesson
 * alignment guarantee rests on that: the header lays out N fixed-width
 * columns so boundary k sits at exactly `k * columnWidth`, and
 * timelineGeometry's `minuteToX` of that boundary minute evaluates to the
 * same integer. A fractional width would let the two accumulate different
 * rounding and drift apart across the axis.
 *
 * Replaces useResponsiveColumnWidth, which only returned a column width and
 * always tried to fit every column into the container.
 */
export function useScheduleMetrics(
  containerRef: RefObject<HTMLElement | null>,
  columnCount: number
): ScheduleMetrics {
  const [metrics, setMetrics] = useState<ScheduleMetrics>(() =>
    metricsForViewport(
      typeof window === 'undefined' ? 1280 : window.innerWidth,
      typeof window === 'undefined' ? 1280 : window.innerWidth,
      columnCount
    )
  );

  useEffect(() => {
    const compute = () => {
      const containerWidth = containerRef.current?.clientWidth ?? window.innerWidth;
      const next = metricsForViewport(window.innerWidth, containerWidth, columnCount);
      setMetrics((prev) =>
        prev.columnWidth === next.columnWidth &&
        prev.teacherColumnWidth === next.teacherColumnWidth &&
        prev.rowHeight === next.rowHeight &&
        prev.isCompact === next.isCompact
          ? prev
          : next
      );
    };

    compute();
    const observer = new ResizeObserver(compute);
    if (containerRef.current) observer.observe(containerRef.current);
    window.addEventListener('resize', compute);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', compute);
    };
  }, [containerRef, columnCount]);

  return metrics;
}

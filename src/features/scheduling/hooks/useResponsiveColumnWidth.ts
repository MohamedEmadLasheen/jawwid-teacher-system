import { useEffect, useState, type RefObject } from 'react';
import { GRID_TEACHER_COLUMN_WIDTH, GRID_COLUMN_WIDTH } from '../constants/schedulingConstants';

const MIN_COLUMN_WIDTH = 40;

/** Computes a column width that fits every column into the container's
 * width (minimal horizontal scrolling), never shrinking below a legible
 * minimum — below that, horizontal scroll takes back over naturally.
 *
 * The returned width is always a whole number of pixels, and the entire
 * header/lesson alignment guarantee rests on that: the header lays out N
 * fixed-width columns so boundary k sits at exactly `k * columnWidth`, and
 * timelineGeometry's `minuteToX` of that boundary minute evaluates to the
 * same integer. A fractional width would let the two accumulate different
 * rounding and drift apart across the axis. */
export function useResponsiveColumnWidth(containerRef: RefObject<HTMLElement | null>, columnCount: number): number {
  const [width, setWidth] = useState(GRID_COLUMN_WIDTH);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || columnCount === 0) return;

    const compute = () => {
      const available = el.clientWidth - GRID_TEACHER_COLUMN_WIDTH;
      const fitted = Math.floor(available / columnCount);
      setWidth(Math.max(MIN_COLUMN_WIDTH, fitted));
    };

    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(el);
    return () => observer.disconnect();
  }, [containerRef, columnCount]);

  return width;
}

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { DEFAULT_VIEW_START_MINUTE } from '../constants/schedulingConstants';
import { minuteToX } from '../utils/timelineGeometry';

/**
 * Opens a schedule grid scrolled to DEFAULT_VIEW_START_MINUTE (08:00).
 *
 * The axis spans the whole day so that a lesson before 08:00 is drawable,
 * but the working day starts at 08:00 and that is what an admin expects to
 * see first. This restores the old opening view without cutting the axis.
 *
 * The column width settles after mount (useScheduleMetrics measures the
 * container in an effect), so the offset is re-applied whenever it changes —
 * until the user scrolls the timeline themselves, after which their position
 * is never overridden.
 *
 * Under dir="rtl" the timeline runs right-to-left and browsers report
 * scrollLeft as zero-or-negative, so the offset is negated there.
 */
export function useInitialTimelineScroll(
  scrollRef: RefObject<HTMLElement | null>,
  columnWidth: number,
  minute: number = DEFAULT_VIEW_START_MINUTE
) {
  const applied = useRef<number | null>(null);
  const userMoved = useRef(false);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || userMoved.current) return;
    const x = minuteToX(minute, columnWidth);
    const target = getComputedStyle(el).direction === 'rtl' ? -x : x;
    el.scrollLeft = target;
    // Read back: the browser clamps to the scrollable range.
    applied.current = el.scrollLeft;
  }, [scrollRef, columnWidth, minute]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      if (applied.current !== null && Math.abs(el.scrollLeft - applied.current) > 1) userMoved.current = true;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [scrollRef]);
}

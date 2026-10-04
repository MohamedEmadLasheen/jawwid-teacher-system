import { GRID_START_MINUTE, GRID_END_MINUTE, SLOT_MINUTES, GRID_COLUMNS } from '../constants/schedulingConstants';

/**
 * THE canonical time→pixel coordinate system for the schedule.
 *
 * Every horizontally-positioned schedule element — time header labels,
 * vertical grid lines, lesson cards, free-time bands, availability
 * boundaries and the "now" marker — derives its x/width from the functions
 * here, so there is exactly one definition of "where is 15:30" and no
 * element can drift away from the header.
 *
 * The scale is driven entirely by `columnWidth` (the rendered width of one
 * SLOT_MINUTES column, chosen by useResponsiveColumnWidth). Because the
 * header lays out N fixed-width columns, column boundary k sits at exactly
 * `k * columnWidth`; `minuteToX` of that same boundary minute evaluates to
 * `k * columnWidth` too, so boundaries coincide to the pixel at every
 * zoom/responsive width — provided columnWidth stays an integer, which the
 * hook guarantees.
 *
 * All minute values are minutes-since-local-midnight in the academy's own
 * business timezone, exactly as stored in Postgres (`start_minute`,
 * `end_minute`). Nothing here parses or converts a Date, so the geometry
 * cannot shift a lesson or a shift boundary across a timezone.
 */

/** Total minutes the visible timeline spans (07:00 → 24:00 = 1020). */
export const TIMELINE_MINUTES = GRID_END_MINUTE - GRID_START_MINUTE;

/** Full pixel width of the scrollable time axis (excludes the frozen label column). */
export function timelineWidth(columnWidth: number): number {
  return GRID_COLUMNS.length * columnWidth;
}

/** Clamps a minute value into the visible timeline window. */
export function clampToTimeline(minute: number): number {
  return Math.min(Math.max(minute, GRID_START_MINUTE), GRID_END_MINUTE);
}

/**
 * x-offset (px) of a minute, measured from the start of the time axis.
 *
 * The multiplication deliberately happens BEFORE the division by
 * SLOT_MINUTES: at a 30-minute boundary the numerator is an exact multiple
 * of SLOT_MINUTES, so the result is the exact integer `columnIndex *
 * columnWidth` — the very offset the header's fixed-width cells produce.
 * Scaling by a precomputed `columnWidth / SLOT_MINUTES` instead would make
 * that ratio inexact in binary for most odd column widths (61px, say) and
 * leave a tiny residual offset between the header and the lesson layer.
 */
export function minuteToX(minute: number, columnWidth: number): number {
  return ((clampToTimeline(minute) - GRID_START_MINUTE) * columnWidth) / SLOT_MINUTES;
}

/**
 * Pixel width of the [startMinute, endMinute) span, clipped to the visible
 * window. A 30-min span is exactly one column wide; a 40-min span is
 * exactly 40/30 of a column — durations are never rounded up to a column.
 */
export function minuteSpanToWidth(startMinute: number, endMinute: number, columnWidth: number): number {
  return Math.max(0, minuteToX(endMinute, columnWidth) - minuteToX(startMinute, columnWidth));
}

/** A half-open [startMinute, endMinute) range of minutes-since-midnight. */
export interface MinuteInterval {
  startMinute: number;
  endMinute: number;
}

/** Sorts and unions overlapping/touching intervals. Input is not mutated. */
export function mergeIntervals(intervals: MinuteInterval[]): MinuteInterval[] {
  const sorted = [...intervals]
    .filter((i) => i.endMinute > i.startMinute)
    .sort((a, b) => a.startMinute - b.startMinute);

  const merged: MinuteInterval[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval.startMinute <= last.endMinute) {
      last.endMinute = Math.max(last.endMinute, interval.endMinute);
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

/** `base` minus `cuts` — the set-difference of two interval lists. */
export function subtractIntervals(base: MinuteInterval[], cuts: MinuteInterval[]): MinuteInterval[] {
  let remaining = mergeIntervals(base);

  for (const cut of mergeIntervals(cuts)) {
    const next: MinuteInterval[] = [];
    for (const segment of remaining) {
      // Disjoint — the cut doesn't touch this segment.
      if (cut.endMinute <= segment.startMinute || cut.startMinute >= segment.endMinute) {
        next.push(segment);
        continue;
      }
      // Keep whatever sticks out before / after the cut.
      if (cut.startMinute > segment.startMinute) {
        next.push({ startMinute: segment.startMinute, endMinute: cut.startMinute });
      }
      if (cut.endMinute < segment.endMinute) {
        next.push({ startMinute: cut.endMinute, endMinute: segment.endMinute });
      }
    }
    remaining = next;
  }

  return remaining;
}

/** Clips intervals to the visible timeline window, dropping empty results. */
export function clipIntervalsToTimeline(intervals: MinuteInterval[]): MinuteInterval[] {
  return intervals
    .map((i) => ({ startMinute: clampToTimeline(i.startMinute), endMinute: clampToTimeline(i.endMinute) }))
    .filter((i) => i.endMinute > i.startMinute);
}

/**
 * The teacher's actual working window for this row — the union of their
 * availability slots (hourly blocks and/or assigned shift templates, as
 * already unified by v_teacher_availability_unified).
 *
 * A teacher with no availability rows yields `[]`, which is what keeps this
 * whole feature additive: rows for teachers outside the configured shift
 * groups get no working window, therefore no free-capacity highlighting,
 * and render exactly as they did before.
 */
export function computeWorkingWindow(availability: MinuteInterval[]): MinuteInterval[] {
  return clipIntervalsToTimeline(mergeIntervals(availability));
}

/**
 * FREE capacity: inside the working window AND not covered by a lesson.
 *
 * Time outside the working window is deliberately absent from the result —
 * it is "outside the shift", never free sellable capacity. So a 14:00–19:00
 * teacher reports nothing free at 13:00, and a 14:00–18:00 part-timer
 * reports nothing free at 18:30, no matter how empty the grid looks there.
 */
export function computeFreeIntervals(
  availability: MinuteInterval[],
  occupied: MinuteInterval[]
): MinuteInterval[] {
  const window = computeWorkingWindow(availability);
  if (window.length === 0) return [];
  return subtractIntervals(window, clipIntervalsToTimeline(occupied));
}

/** Whether a 30-min header column falls inside the teacher's working window. */
export function isColumnInWorkingWindow(columnStartMinute: number, availability: MinuteInterval[]): boolean {
  return availability.some((a) => a.startMinute <= columnStartMinute && a.endMinute > columnStartMinute);
}

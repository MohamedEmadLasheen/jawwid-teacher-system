import { useEffect, useState } from 'react';
import { minuteToX } from '../utils/timelineGeometry';
import { GRID_START_MINUTE, GRID_END_MINUTE } from '../constants/schedulingConstants';

function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * A "now" marker for this grid's actual layout — time runs horizontally
 * here (teachers are rows), so the live marker is a vertical line at the
 * current-time x-position rather than Google Calendar's horizontal one;
 * same purpose (always-aligned live position), adapted to this grid's
 * existing orientation instead of redesigning it. Only rendered for
 * today's day-tab (by the caller) and updates every minute.
 *
 * Its x-position comes from the same timelineGeometry used by the header and
 * the lesson cards, so the marker lands exactly on the current minute
 * instead of being snapped to a 30-minute column.
 */
export function CurrentTimeIndicator({ columnWidth, teacherColumnWidth, height }: { columnWidth: number; teacherColumnWidth: number; height: number }) {
  const [minutes, setMinutes] = useState(nowMinutes());

  useEffect(() => {
    const id = setInterval(() => setMinutes(nowMinutes()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (minutes < GRID_START_MINUTE || minutes >= GRID_END_MINUTE) return null;

  const offsetPx = teacherColumnWidth + minuteToX(minutes, columnWidth);

  return (
    <div
      className="absolute top-0 z-[25] pointer-events-none w-0.5 bg-red-500"
      // Logical inset so the marker tracks the same reversed axis the header
      // uses under dir="rtl"; `left` would pin it to the physical left edge.
      style={{ insetInlineStart: offsetPx, height }}
    >
      {/* start-0 is logical, but the centering translate is physical — it has
          to flip too, or the badge sits a half-width off the line in RTL. */}
      <span className="absolute -top-4 -translate-x-1/2 rtl:translate-x-1/2 start-0 text-[9px] font-semibold text-red-500 bg-white px-1 rounded">
        {'NOW'}
      </span>
    </div>
  );
}

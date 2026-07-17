import { useEffect, useState } from 'react';
import { GRID_START_MINUTE, GRID_END_MINUTE, SLOT_MINUTES, GRID_TEACHER_COLUMN_WIDTH } from '../constants/schedulingConstants';

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
 */
export function CurrentTimeIndicator({ columnWidth, height }: { columnWidth: number; height: number }) {
  const [minutes, setMinutes] = useState(nowMinutes());

  useEffect(() => {
    const id = setInterval(() => setMinutes(nowMinutes()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (minutes < GRID_START_MINUTE || minutes >= GRID_END_MINUTE) return null;

  const offsetPx = GRID_TEACHER_COLUMN_WIDTH + ((minutes - GRID_START_MINUTE) / SLOT_MINUTES) * columnWidth;

  return (
    <div
      className="absolute top-0 z-30 pointer-events-none w-0.5 bg-red-500"
      style={{ left: offsetPx, height }}
    >
      <span className="absolute -top-4 -translate-x-1/2 start-0 text-[9px] font-semibold text-red-500 bg-white px-1 rounded">
        {'NOW'}
      </span>
    </div>
  );
}

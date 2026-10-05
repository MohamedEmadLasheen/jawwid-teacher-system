import { useDroppable } from '@dnd-kit/core';
import { isColumnInPrimeTime } from '../utils/primeTime';

interface ScheduleSlotCellProps {
  teacherId: string;
  columnStart: number;
  columnWidth: number;
  /** Does this column fall inside the teacher's configured working window? */
  inWindow: boolean;
  /** False when the teacher has no availability configured at all. */
  hasWorkingWindow: boolean;
  onEmptyClick: (teacherId: string, startMinute: number) => void;
}

/**
 * One 30-minute background column: the vertical grid line, the Prime Time
 * tint, the outside-shift shading, the drop target and the click-to-create
 * hit area.
 *
 * This is purely the row's background — lesson cards and free-capacity bands
 * are absolutely positioned on top of it by ScheduleGridRow at their exact
 * minute offsets, so nothing here ever decides where a lesson sits.
 *
 * A teacher with no availability record (common for the legacy-imported
 * schedule, whose source spreadsheet never captured working hours) must not
 * be blocked from booking — shading is informational only and every empty
 * column stays a valid slot to create a lesson in.
 */
export function ScheduleSlotCell({
  teacherId, columnStart, columnWidth, inWindow, hasWorkingWindow, onEmptyClick,
}: ScheduleSlotCellProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${teacherId}:${columnStart}`,
    data: { teacherId, startMinute: columnStart },
  });

  const primeTime = isColumnInPrimeTime(columnStart);
  // Outside the working window is NOT free capacity — it is shaded out. Rows
  // with no configured window keep the pre-existing neutral look.
  const outsideShift = hasWorkingWindow && !inWindow;

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => onEmptyClick(teacherId, columnStart)}
      style={{ width: columnWidth }}
      className={`shrink-0 h-full border-e border-gray-100 transition-colors hover:bg-gray-100/70 cursor-pointer ${
        isOver
          ? 'bg-blue-100'
          : outsideShift
            ? 'bg-gray-200/70 bg-[repeating-linear-gradient(45deg,transparent,transparent_5px,rgba(0,0,0,0.045)_5px,rgba(0,0,0,0.045)_10px)]'
            : primeTime
              ? 'bg-amber-50/60'
              : hasWorkingWindow
                ? ''
                : 'bg-gray-50/80'
      }`}
    />
  );
}

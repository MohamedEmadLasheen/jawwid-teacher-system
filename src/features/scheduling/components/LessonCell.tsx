import { useDroppable } from '@dnd-kit/core';
import { DraggableLessonCard } from './DraggableLessonCard';
import { isColumnInPrimeTime } from '../utils/primeTime';
import { GRID_COLUMN_WIDTH } from '../constants/schedulingConstants';
import type { RowCellState } from '../utils/computeRowCells';
import type { LessonWithParticipants } from '@/services/scheduling/lessons.service';

interface LessonCellProps {
  teacherId: string;
  columnStart: number;
  state: Exclude<RowCellState, { kind: 'continuation' }>;
  onEmptyClick: (teacherId: string, startMinute: number) => void;
  onLessonClick: (lesson: LessonWithParticipants) => void;
}

/** Continuation cells (the rest of a spanning lesson) are filtered out by
 * ScheduleGridRow before reaching here — the lesson's own cell already
 * reserves that width, so rendering a placeholder for them would double it. */
export function LessonCell({ teacherId, columnStart, state, onEmptyClick, onLessonClick }: LessonCellProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${teacherId}:${columnStart}`,
    data: { teacherId, startMinute: columnStart },
  });

  const primeTime = isColumnInPrimeTime(columnStart);

  if (state.kind === 'lesson') {
    return (
      <div
        ref={setNodeRef}
        style={{ width: GRID_COLUMN_WIDTH * state.span }}
        className={`shrink-0 h-full border-e border-gray-100 p-0.5 ${isOver ? 'bg-blue-50' : ''}`}
      >
        <DraggableLessonCard lesson={state.lesson} onClick={() => onLessonClick(state.lesson)} />
      </div>
    );
  }

  const isAvailable = state.kind === 'available';

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => isAvailable && onEmptyClick(teacherId, columnStart)}
      style={{ width: GRID_COLUMN_WIDTH }}
      className={`shrink-0 h-full border-e border-gray-100 transition-colors ${
        isOver ? 'bg-blue-50' : primeTime ? 'bg-amber-50/60' : ''
      } ${isAvailable ? 'hover:bg-gray-50 cursor-pointer' : 'bg-gray-50/80 cursor-not-allowed'}`}
      disabled={!isAvailable}
      aria-label={isAvailable ? undefined : 'unavailable'}
    />
  );
}

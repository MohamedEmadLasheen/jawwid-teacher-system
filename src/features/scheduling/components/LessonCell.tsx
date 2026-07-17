import { useDroppable } from '@dnd-kit/core';
import { DraggableLessonCard } from './DraggableLessonCard';
import { LessonHoverCard } from './LessonHoverCard';
import { isColumnInPrimeTime } from '../utils/primeTime';
import type { RowCellState } from '../utils/computeRowCells';
import type { LessonWithParticipants } from '@/services/scheduling/lessons.service';

interface LessonCellProps {
  teacherId: string;
  columnStart: number;
  columnWidth: number;
  state: Exclude<RowCellState, { kind: 'continuation' }>;
  onEmptyClick: (teacherId: string, startMinute: number) => void;
  onLessonClick: (lesson: LessonWithParticipants) => void;
}

/** Continuation cells (the rest of a spanning lesson) are filtered out by
 * ScheduleGridRow before reaching here — the lesson's own cell already
 * reserves that width, so rendering a placeholder for them would double it. */
export function LessonCell({ teacherId, columnStart, columnWidth, state, onEmptyClick, onLessonClick }: LessonCellProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${teacherId}:${columnStart}`,
    data: { teacherId, startMinute: columnStart },
  });

  const primeTime = isColumnInPrimeTime(columnStart);

  if (state.kind === 'lesson') {
    return (
      <div
        ref={setNodeRef}
        style={{ width: columnWidth * state.span }}
        className={`shrink-0 h-full border-e border-gray-100 p-0.5 ${isOver ? 'bg-blue-50' : ''}`}
      >
        <LessonHoverCard lesson={state.lesson}>
          <DraggableLessonCard lesson={state.lesson} onClick={() => onLessonClick(state.lesson)} />
        </LessonHoverCard>
      </div>
    );
  }

  const isAvailable = state.kind === 'available';

  // No availability record for a teacher (common for the legacy-imported
  // schedule, since the source spreadsheet never captured working hours)
  // must not block booking — availability is informational shading only,
  // every empty cell is a valid slot to create a lesson in.
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => onEmptyClick(teacherId, columnStart)}
      style={{ width: columnWidth }}
      className={`shrink-0 h-full border-e border-gray-100 transition-colors hover:bg-gray-50 cursor-pointer ${
        isOver ? 'bg-blue-50' : primeTime ? 'bg-amber-50/60' : isAvailable ? '' : 'bg-gray-50/80'
      }`}
    />
  );
}

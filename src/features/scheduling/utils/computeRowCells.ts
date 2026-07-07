import { GRID_COLUMNS, SLOT_MINUTES } from '../constants/schedulingConstants';
import type { LessonWithParticipants } from '@/services/scheduling/lessons.service';
import type { UnifiedAvailabilitySlot } from '@/services/scheduling/teacherAvailability.service';

export type RowCellState =
  | { kind: 'lesson'; lesson: LessonWithParticipants; span: number }
  | { kind: 'continuation' }
  | { kind: 'available' }
  | { kind: 'unavailable' };

/** One entry per GRID_COLUMNS index — the pure layout computation behind ScheduleGridRow, kept separate so it's testable without rendering. */
export function computeRowCells(lessons: LessonWithParticipants[], availability: UnifiedAvailabilitySlot[]): RowCellState[] {
  const cells: RowCellState[] = GRID_COLUMNS.map((columnStart) => {
    const isAvailable = availability.some((a) => a.startMinute <= columnStart && a.endMinute > columnStart);
    return { kind: isAvailable ? 'available' : 'unavailable' };
  });

  for (const lesson of lessons) {
    const startIdx = GRID_COLUMNS.findIndex((c) => c > lesson.startMinute) - 1;
    const clampedStartIdx = Math.max(0, startIdx < 0 ? 0 : startIdx);
    const span = Math.max(1, Math.ceil(lesson.durationMinutes / SLOT_MINUTES));
    for (let i = 0; i < span; i++) {
      const idx = clampedStartIdx + i;
      if (idx >= cells.length) break;
      cells[idx] = i === 0 ? { kind: 'lesson', lesson, span } : { kind: 'continuation' };
    }
  }

  return cells;
}

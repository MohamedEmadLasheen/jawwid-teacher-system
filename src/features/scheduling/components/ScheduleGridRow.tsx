import { useMemo } from 'react';
import { LessonCell } from './LessonCell';
import { computeRowCells } from '../utils/computeRowCells';
import { GRID_COLUMNS, GRID_TEACHER_COLUMN_WIDTH } from '../constants/schedulingConstants';
import type { ScheduleGridTeacherRow } from '../hooks/useScheduleGrid';
import type { LessonWithParticipants } from '@/services/scheduling/lessons.service';

interface ScheduleGridRowProps {
  row: ScheduleGridTeacherRow;
  onEmptyClick: (teacherId: string, startMinute: number) => void;
  onLessonClick: (lesson: LessonWithParticipants) => void;
}

export function ScheduleGridRow({ row, onEmptyClick, onLessonClick }: ScheduleGridRowProps) {
  const cells = useMemo(() => computeRowCells(row.lessons, row.availability), [row.lessons, row.availability]);

  return (
    <div className="flex h-full border-b border-gray-100">
      <div
        style={{ width: GRID_TEACHER_COLUMN_WIDTH }}
        className="shrink-0 sticky start-0 z-10 bg-white border-e border-gray-200 flex items-center px-3"
      >
        <p className="text-sm font-medium truncate">{row.teacher.fullName}</p>
      </div>
      <div className="flex">
        {cells.map((state, idx) =>
          state.kind === 'continuation' ? null : (
            <LessonCell
              key={GRID_COLUMNS[idx]}
              teacherId={row.teacher.id}
              columnStart={GRID_COLUMNS[idx]}
              state={state}
              onEmptyClick={onEmptyClick}
              onLessonClick={onLessonClick}
            />
          )
        )}
      </div>
    </div>
  );
}

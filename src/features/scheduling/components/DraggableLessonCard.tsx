import { useTranslation } from 'react-i18next';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useStudents } from '../hooks/useStudents';
import { useSupervisorStore } from '@/store/supervisorStore';
import { getLessonSupervisorColor, getLessonBorderStyle } from '../utils/lessonColor';
import { minuteToLabel } from '../utils/timeGrid';
import type { LessonWithParticipants } from '@/services/scheduling/lessons.service';

interface DraggableLessonCardProps {
  lesson: LessonWithParticipants;
  onClick: () => void;
}

export function DraggableLessonCard({ lesson, onClick }: DraggableLessonCardProps) {
  const { t } = useTranslation();
  const { data: students = [] } = useStudents();
  const { supervisors } = useSupervisorStore();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lesson.id,
    data: { lesson },
  });

  const supervisorColor = getLessonSupervisorColor(lesson.participants, students, supervisors);
  const borderStyle = getLessonBorderStyle(lesson.lifecycleStatus);
  const studentNames = lesson.participants
    .map((p) => students.find((s) => s.id === p.studentId)?.fullName)
    .filter(Boolean)
    .join(', ');

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      {...listeners}
      {...attributes}
      style={{
        transform: CSS.Translate.toString(transform),
        borderColor: supervisorColor ?? undefined,
        borderStyle,
        opacity: isDragging ? 0.4 : 1,
      }}
      className="w-full h-full text-start px-1.5 py-1 rounded-md border-2 bg-white hover:shadow-md transition-shadow overflow-hidden cursor-grab active:cursor-grabbing"
    >
      <p className="text-[11px] font-medium truncate leading-tight">{studentNames || '—'}</p>
      <p className="text-[10px] text-muted-foreground truncate leading-tight">
        {minuteToLabel(lesson.startMinute)}–{minuteToLabel(lesson.endMinute)}
        {lesson.participants.length > 1 && <span className="ms-1 font-medium">· {t('scheduling.groupLesson')}</span>}
      </p>
    </button>
  );
}

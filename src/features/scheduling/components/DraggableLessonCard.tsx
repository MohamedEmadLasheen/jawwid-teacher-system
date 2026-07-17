import { useTranslation } from 'react-i18next';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useStudents } from '../hooks/useStudents';
import { useCourses } from '../hooks/useCourses';
import { useSupervisorStore } from '@/store/supervisorStore';
import { getLessonSupervisorColor, getLessonBorderStyle } from '../utils/lessonColor';
import { minuteToLabel } from '../utils/timeGrid';
import type { LessonWithParticipants } from '@/services/scheduling/lessons.service';

interface DraggableLessonCardProps {
  lesson: LessonWithParticipants;
  onClick: () => void;
}

export function DraggableLessonCard({ lesson, onClick }: DraggableLessonCardProps) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const { data: students = [] } = useStudents();
  const { data: courses = [] } = useCourses();
  const { supervisors } = useSupervisorStore();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lesson.id,
    data: { lesson },
  });

  const supervisorColor = getLessonSupervisorColor(lesson.participants, students, supervisors);
  const borderStyle = getLessonBorderStyle(lesson.lifecycleStatus);
  const course = courses.find((c) => c.id === lesson.courseId);
  const firstStudentName = students.find((s) => s.id === lesson.participants[0]?.studentId)?.fullName ?? '—';
  const isGroup = lesson.participants.length > 1;

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
      className="w-full h-full text-start px-1.5 py-1 rounded-md border-2 bg-white hover:shadow-md transition-shadow overflow-hidden cursor-grab active:cursor-grabbing flex flex-col"
    >
      <p className="text-[11px] font-medium truncate leading-tight">
        {isGroup ? `${firstStudentName} +${lesson.participants.length - 1}` : firstStudentName}
      </p>
      <p className="text-[10px] text-muted-foreground truncate leading-tight">
        {minuteToLabel(lesson.startMinute)}–{minuteToLabel(lesson.endMinute)}
      </p>
      {course && <p className="text-[9px] text-muted-foreground truncate leading-tight">{isAr ? course.nameAr : course.nameEn}</p>}
      {isGroup && (
        <p className="text-[9px] font-medium text-primary truncate leading-tight mt-auto">
          {t('scheduling.participantsCount', { count: lesson.participants.length })}
        </p>
      )}
    </button>
  );
}

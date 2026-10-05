import { useTranslation } from 'react-i18next';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useStudents } from '../hooks/useStudents';
import { useCourses } from '../hooks/useCourses';
import { useSupervisorStore } from '@/store/supervisorStore';
import { useIsMobile } from '@/hooks/use-mobile';
import { getLessonSupervisorColor, getLessonBorderStyle } from '../utils/lessonColor';
import { minuteToDisplayLabel } from '../utils/timeGrid';
import type { LessonWithParticipants } from '@/services/scheduling/lessons.service';

interface DraggableLessonCardProps {
  lesson: LessonWithParticipants;
  onClick: () => void;
  /** Below desktop: bigger type, and secondary details dropped so the student
   *  name and time stay legible in a card only ~80px wide. */
  isCompact?: boolean;
}

export function DraggableLessonCard({ lesson, onClick, isCompact = false }: DraggableLessonCardProps) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  // Touch dragging is off below 768px (see useScheduleDragSensors), so the
  // card must not advertise a grab affordance it will not honour there.
  const isMobile = useIsMobile();
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
      className={`w-full h-full text-start rounded-md border-2 bg-white hover:shadow-md transition-shadow overflow-hidden ${isMobile ? '' : 'cursor-grab active:cursor-grabbing'} flex flex-col justify-center ${isCompact ? "px-1.5 py-1.5 gap-0.5" : "px-1.5 py-1"}`}
    >
      <p className={`font-semibold leading-tight ${isCompact ? 'text-[12px] line-clamp-2 break-words' : 'text-[11px] truncate'}`}>
        {isGroup ? `${firstStudentName} +${lesson.participants.length - 1}` : firstStudentName}
      </p>
      <p className={`text-muted-foreground truncate leading-tight ${isCompact ? 'text-[11px]' : 'text-[10px]'}`}>
        {minuteToDisplayLabel(lesson.startMinute)}
      </p>
      {/* Course and participant count are desktop-only: at mobile card widths
          they crowd out the two things an admin actually scans for. */}
      {!isCompact && course && (
        <p className="text-[9px] text-muted-foreground truncate leading-tight">{isAr ? course.nameAr : course.nameEn}</p>
      )}
      {!isCompact && isGroup && (
        <p className="text-[9px] font-medium text-primary truncate leading-tight mt-auto">
          {t('scheduling.participantsCount', { count: lesson.participants.length })}
        </p>
      )}
    </button>
  );
}

import { useTranslation } from 'react-i18next';
import { useStudents } from '../hooks/useStudents';
import { useCourses } from '../hooks/useCourses';
import { useParentNameByStudentId } from '../hooks/useParents';
import { useTeacherStore } from '@/store/teacherStore';
import { useSupervisorStore } from '@/store/supervisorStore';
import { minuteToDisplayLabel } from '../utils/timeGrid';
import {
  HoverCard, HoverCardContent, HoverCardTrigger,
} from '@/components/ui/hover-card';
import { useIsMobile } from '@/hooks/use-mobile';
import type { LessonWithParticipants } from '@/services/scheduling/lessons.service';
import type { ReactNode } from 'react';

interface LessonHoverCardProps {
  lesson: LessonWithParticipants;
  children: ReactNode;
}

/** Rich desktop hover preview — reuses the same data hooks already used
 * elsewhere in the grid (students, courses, teachers, supervisors, parents);
 * no new queries. Attendance/Payment Status have no data source anywhere in
 * the schema yet, so they render as honest "Coming Soon" lines rather than
 * invented values, matching the same convention used on the Dashboard.
 *
 * DESKTOP ONLY, and it enforces that itself.
 *
 * Radix ignores touch for hovering but still opens on FOCUS, and a tap
 * focuses the trigger — so on a phone this unfurled over the schedule on
 * every tap, which is exactly what mobile Quick Actions replaces. LessonCell
 * already declines to render it below 768px; this second gate means a future
 * call site cannot reintroduce the problem by forgetting, and that the
 * preview is never merely hidden while its interaction stays live. Below the
 * breakpoint the children are returned bare: no trigger, no portal, no
 * listeners, nothing to open. */
export function LessonHoverCard({ lesson, children }: LessonHoverCardProps) {
  const isMobile = useIsMobile();
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const { data: students = [] } = useStudents();
  const { data: courses = [] } = useCourses();
  const parentNameByStudentId = useParentNameByStudentId();
  const { teachers } = useTeacherStore();
  const { supervisors } = useSupervisorStore();

  const teacher = teachers.find((tc) => tc.id === lesson.teacherId);
  const course = courses.find((c) => c.id === lesson.courseId);
  const lessonStudents = lesson.participants.map((p) => students.find((s) => s.id === p.studentId)).filter(Boolean);
  const supervisorIds = new Set(lessonStudents.map((s) => s?.supervisorId).filter(Boolean));
  const supervisorNames = supervisors.filter((sup) => supervisorIds.has(sup.id)).map((sup) => sup.name);
  const parentNames = lessonStudents
    .map((s) => (s ? parentNameByStudentId.get(s.id) : undefined))
    .filter(Boolean);

  // Hooks above run unconditionally (they are the same cached queries the
  // grid already reads); only the hover machinery is skipped.
  if (isMobile) return <>{children}</>;

  return (
    <HoverCard openDelay={200}>
      {/* Not asChild: DraggableLessonCard doesn't forward a ref (it already
          uses its own internal ref for dnd-kit), so Slot-merging a ref onto
          it would warn. `display: contents` (tried first) removes the
          trigger from layout entirely, which also zeroes its geometry —
          Radix then anchors the popover at (0,0) instead of the lesson
          card, so it renders off-screen. block+w-full+h-full keeps a real,
          correctly-sized anchor box matching the cell underneath. */}
      <HoverCardTrigger className="block w-full h-full">{children}</HoverCardTrigger>
      <HoverCardContent className="w-72 text-sm space-y-1.5" side="top">
        <Row label={t('scheduling.hover.students')} value={lessonStudents.map((s) => s?.fullName).join(', ') || '—'} />
        <Row label={t('scheduling.hover.course')} value={course ? (isAr ? course.nameAr : course.nameEn) : t('scheduling.coursePending')} />
        <Row label={t('scheduling.hover.teacher')} value={teacher?.fullName ?? '—'} />
        <Row label={t('scheduling.hover.supervisor')} value={supervisorNames.join(', ') || '—'} />
        <Row label={t('scheduling.hover.parents')} value={parentNames.join(', ') || '—'} />
        <Row label={t('scheduling.hover.duration')} value={`${minuteToDisplayLabel(lesson.startMinute)}–${minuteToDisplayLabel(lesson.endMinute)} (${lesson.durationMinutes}m)`} />
        <Row label={t('scheduling.hover.lessonType')} value={lessonStudents.length > 1 ? t('scheduling.groupLesson') : t('scheduling.hover.oneToOne')} />
        <Row label={t('scheduling.hover.attendance')} value={t('dashboard.coach.comingSoon')} />
        <Row label={t('scheduling.hover.paymentStatus')} value={t('dashboard.coach.comingSoon')} />
        <Row label={t('scheduling.hover.status')} value={t(`scheduling.lifecycle.${lesson.lifecycleStatus}`)} />
        {lesson.notes && <Row label={t('scheduling.hover.notes')} value={lesson.notes} />}
      </HoverCardContent>
    </HoverCard>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-end">{value}</span>
    </div>
  );
}

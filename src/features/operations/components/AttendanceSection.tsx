import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/authStore';
import { userCan } from '@/lib/access';
import { useSessionReportsForLesson, useCreateSessionReport } from '../hooks/useLessonSessionReports';
import { nextDateForDayOfWeek } from '@/features/scheduling/utils/nextDateForDayOfWeek';
import { MarkAttendanceRow } from './MarkAttendanceRow';
import type { LessonWithParticipants } from '@/services/scheduling/lessons.service';
import type { Student, DayOfWeek, LessonSessionReport } from '@/lib/types';

/**
 * Mark Attendance — the direct replacement for coloring a spreadsheet
 * day-cell. Renders one row per participant (most lessons have exactly
 * one). When every participant has a report for this occurrence, the
 * whole section calls onAllMarked after a brief pause so the supervisor
 * can see the confirmation before the dialog closes — "move to the next
 * lesson automatically whenever possible" scoped honestly to what's
 * actually available in Phase 1: no cross-lesson queue exists yet (that's
 * Phase 2's Smart Queue), so "next" here means closing this dialog once
 * this lesson's own roster is fully marked, ready for the next tap on the
 * grid — not an automatic jump to another lesson.
 */
export function AttendanceSection({
  lesson, students, onAllMarked,
}: {
  lesson: LessonWithParticipants;
  students: Student[];
  onAllMarked?: () => void;
}) {
  const { t } = useTranslation();
  const { currentUser } = useAuthStore();
  const canManage = userCan(currentUser, ['manage_session_reports']);
  const canView = canManage || userCan(currentUser, ['view_session_reports']);

  const occurrenceDate = nextDateForDayOfWeek(lesson.dayOfWeek as DayOfWeek);
  const participantIds = useMemo(() => lesson.participants.map((p) => p.id), [lesson.participants]);
  const { data: reports, isLoading, isError } = useSessionReportsForLesson(participantIds);
  const createReport = useCreateSessionReport();

  const reportByParticipant = useMemo(() => {
    const map = new Map<string, LessonSessionReport>();
    (reports ?? []).forEach((r) => {
      if (r.occurrenceDate === occurrenceDate) map.set(r.lessonParticipantId, r);
    });
    return map;
  }, [reports, occurrenceDate]);

  const allMarked = lesson.participants.length > 0 && lesson.participants.every((p) => reportByParticipant.has(p.id));

  useEffect(() => {
    if (!allMarked) return;
    const timeout = setTimeout(() => onAllMarked?.(), 700);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allMarked]);

  if (!canView) return null;

  return (
    <div className="border rounded-lg p-3 bg-muted/20">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        {t('operations.attendance.title')}
      </p>

      {isLoading && <p className="text-sm text-muted-foreground py-2">{t('common.loading')}</p>}
      {isError && <p className="text-sm text-red-600 py-2">{t('operations.attendance.loadError')}</p>}

      {!isLoading && !isError && lesson.participants.map((p) => {
        const student = students.find((s) => s.id === p.studentId);
        return (
          <MarkAttendanceRow
            key={p.id}
            studentName={student?.fullName ?? '—'}
            existingReport={reportByParticipant.get(p.id)}
            canManage={canManage}
            isSaving={createReport.isPending}
            onSave={(status, reasonNote, isMakeup) => {
              createReport.mutate({
                lessonParticipantId: p.id,
                occurrenceDate,
                status,
                isMakeupSession: isMakeup,
                reasonNote,
                createdBy: currentUser?.id ?? null,
              });
            }}
          />
        );
      })}

      {createReport.isError && (
        <p className="text-xs text-red-600 mt-2">{t('operations.attendance.saveError')}</p>
      )}
    </div>
  );
}

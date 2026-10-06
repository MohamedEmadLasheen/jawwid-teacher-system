import { useMemo } from 'react';
import { useLessons, useLessonParticipants } from './useLessons';
import type { LessonWithParticipants } from '@/services/scheduling/lessons.service';

/**
 * Every lesson as the database STORES it, joined to its participants.
 *
 * "Stored" is the whole point. The grid hands components an occurrence-
 * overlaid copy — a lesson rescheduled for one date is displayed at its
 * override time — which is right for drawing a day, and wrong for anything
 * reasoning about the recurring schedule. This is the unoverlaid truth:
 * teacher, day, start minute and duration exactly as persisted.
 *
 * No lifecycle filter is applied here; fetchLessons() returns ended and
 * paused rows too. Callers filter (findStudentWeeklyLessons does).
 *
 * Reuses the app's existing whole-table queries under their existing keys, so
 * it adds no request — StudentsPage, TeachersPage, LessonsPage and the
 * dashboard already populate them.
 */
export function useStoredLessons() {
  const lessonsQuery = useLessons();
  const participantsQuery = useLessonParticipants();

  const lessons = useMemo<LessonWithParticipants[]>(() => {
    const rows = lessonsQuery.data ?? [];
    const participants = participantsQuery.data ?? [];
    if (rows.length === 0) return [];

    const byLessonId = new Map<string, typeof participants>();
    for (const p of participants) {
      const list = byLessonId.get(p.lessonId);
      if (list) list.push(p);
      else byLessonId.set(p.lessonId, [p]);
    }
    return rows.map((lesson) => ({ ...lesson, participants: byLessonId.get(lesson.id) ?? [] }));
  }, [lessonsQuery.data, participantsQuery.data]);

  const byId = useMemo(() => new Map(lessons.map((l) => [l.id, l])), [lessons]);

  return {
    lessons,
    /** Stored record by lesson id — use to un-overlay a clicked lesson. */
    byId,
    isLoading: lessonsQuery.isLoading || participantsQuery.isLoading,
    error: lessonsQuery.error || participantsQuery.error,
  };
}

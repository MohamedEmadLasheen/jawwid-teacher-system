import { supabase } from '@/lib/supabase';
import type { Lesson, LessonParticipant } from '@/lib/types';
import type { Database } from '@/lib/database.types';

type Row = Database['public']['Tables']['lessons']['Row'];
type ParticipantRow = Database['public']['Tables']['lesson_participants']['Row'];

function toLesson(row: Row): Lesson {
  return {
    id: row.id,
    branchId: row.branch_id,
    teacherId: row.teacher_id,
    courseId: row.course_id,
    dayOfWeek: row.day_of_week as Lesson['dayOfWeek'],
    startMinute: row.start_minute,
    durationMinutes: row.duration_minutes,
    endMinute: row.end_minute,
    timezone: row.timezone,
    lifecycleStatus: row.lifecycle_status as Lesson['lifecycleStatus'],
    effectiveFrom: row.effective_from,
    effectiveUntil: row.effective_until,
    originalTeacherId: row.original_teacher_id,
    sameDaySince: row.same_day_since,
    sameTimeSince: row.same_time_since,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toLessonParticipant(row: ParticipantRow): LessonParticipant {
  return {
    id: row.id,
    lessonId: row.lesson_id,
    studentId: row.student_id,
    createdAt: row.created_at,
  };
}

export async function fetchLessons(): Promise<Lesson[]> {
  const { data, error } = await supabase
    .from('lessons')
    .select('*')
    .order('day_of_week', { ascending: true })
    .order('start_minute', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toLesson);
}

export interface LessonWithParticipants extends Lesson {
  participants: LessonParticipant[];
}

/** Fetches one day's lessons with their participants in a single nested-select request — the Master Grid's primary query. */
export async function fetchLessonsForDay(dayOfWeek: number): Promise<LessonWithParticipants[]> {
  const { data, error } = await supabase
    .from('lessons')
    .select('*, lesson_participants(id, student_id, created_at)')
    .eq('day_of_week', dayOfWeek)
    .in('lifecycle_status', ['trial', 'active'])
    .order('start_minute', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...toLesson(row),
    participants: (row.lesson_participants ?? []).map((p: { id: string; student_id: string; created_at: string }) =>
      toLessonParticipant({ id: p.id, lesson_id: row.id, student_id: p.student_id, created_at: p.created_at })
    ),
  }));
}

export async function fetchLessonParticipants(): Promise<LessonParticipant[]> {
  const { data, error } = await supabase.from('lesson_participants').select('*');
  if (error) throw error;
  return (data ?? []).map(toLessonParticipant);
}

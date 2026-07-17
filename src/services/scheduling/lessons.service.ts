import { supabase, fetchAllRows } from '@/lib/supabase';
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
  const rows = await fetchAllRows<Row>((from, to) =>
    supabase
      .from('lessons')
      .select('*')
      .order('day_of_week', { ascending: true })
      .order('start_minute', { ascending: true })
      .order('id', { ascending: true }) // tiebreaker: day_of_week/start_minute alone repeat across teachers, and .range() pagination needs a fully deterministic order or ties can be duplicated/dropped across page boundaries
      .range(from, to)
  );
  return rows.map(toLesson);
}

export interface LessonWithParticipants extends Lesson {
  participants: LessonParticipant[];
}

type LessonWithParticipantsRow = Row & { lesson_participants: { id: string; student_id: string; created_at: string }[] | null };

/** Fetches one day's lessons with their participants in a single nested-select request — the Master Grid's primary query.
 * Paginated: at demo/production scale a single day can hold well over 1000 recurring lessons, past PostgREST's default cap. */
export async function fetchLessonsForDay(dayOfWeek: number): Promise<LessonWithParticipants[]> {
  const rows = await fetchAllRows<LessonWithParticipantsRow>((from, to) =>
    supabase
      .from('lessons')
      .select('*, lesson_participants(id, student_id, created_at)')
      .eq('day_of_week', dayOfWeek)
      .in('lifecycle_status', ['trial', 'active'])
      .order('start_minute', { ascending: true })
      .order('id', { ascending: true }) // tiebreaker — see fetchLessons()
      .range(from, to)
  );
  return rows.map((row) => ({
    ...toLesson(row),
    participants: (row.lesson_participants ?? []).map((p) =>
      toLessonParticipant({ id: p.id, lesson_id: row.id, student_id: p.student_id, created_at: p.created_at })
    ),
  }));
}

export async function fetchLessonParticipants(): Promise<LessonParticipant[]> {
  const rows = await fetchAllRows<ParticipantRow>((from, to) =>
    supabase.from('lesson_participants').select('*').order('id', { ascending: true }).range(from, to)
  );
  return rows.map(toLessonParticipant);
}

export interface LessonExceptionOverride {
  lessonId: string;
  status: string;
  overrideTeacherId: string | null;
  overrideStartMinute: number | null;
  overrideDurationMinutes: number | null;
}

/** Single-occurrence deviations (cancelled/rescheduled) for one calendar date — joined against that day's recurring lessons by the grid so a "this occurrence" change is actually visible. */
export async function fetchExceptionsForDate(occurrenceDate: string): Promise<LessonExceptionOverride[]> {
  const { data, error } = await supabase
    .from('lesson_exceptions')
    .select('lesson_id, status, override_teacher_id, override_start_minute, override_duration_minutes')
    .eq('occurrence_date', occurrenceDate);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    lessonId: row.lesson_id,
    status: row.status,
    overrideTeacherId: row.override_teacher_id,
    overrideStartMinute: row.override_start_minute,
    overrideDurationMinutes: row.override_duration_minutes,
  }));
}

/** All-time completed/cancelled occurrence counts for a set of lessons — used by teacherWorkload.ts. */
export async function fetchExceptionStatusCounts(lessonIds: string[]): Promise<{ status: string }[]> {
  if (lessonIds.length === 0) return [];
  const { data, error } = await supabase
    .from('lesson_exceptions')
    .select('status')
    .in('lesson_id', lessonIds)
    .in('status', ['completed', 'cancelled']);
  if (error) throw error;
  return data ?? [];
}

export interface LessonExceptionRecord {
  lessonId: string;
  status: string;
  overrideTeacherId: string | null;
  createdAt: string;
}

/** Every exception ever recorded (all lessons, all dates) — the one query behind
 * Schedule Stability (changes today/week/month, teacher changes, cancelled/
 * rescheduled totals) and per-teacher completed/cancelled counts academy-wide,
 * so the Intelligence Center doesn't issue one query per teacher. */
export async function fetchAllExceptions(): Promise<LessonExceptionRecord[]> {
  const rows = await fetchAllRows<{ lesson_id: string; status: string; override_teacher_id: string | null; created_at: string }>(
    (from, to) =>
      supabase.from('lesson_exceptions').select('lesson_id, status, override_teacher_id, created_at').order('id', { ascending: true }).range(from, to)
  );
  return rows.map((row) => ({
    lessonId: row.lesson_id,
    status: row.status,
    overrideTeacherId: row.override_teacher_id,
    createdAt: row.created_at,
  }));
}

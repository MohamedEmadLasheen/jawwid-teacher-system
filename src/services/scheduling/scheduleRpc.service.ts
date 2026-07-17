import { supabase } from '@/lib/supabase';
import type { ScheduleConflictResult, TeacherPreservationScore, ScheduleHealthMetrics, ScheduleConflictRow } from '@/lib/types';

function toConflictResult(raw: unknown): ScheduleConflictResult {
  const r = raw as {
    has_conflict: boolean;
    teacher_conflict: { lesson_id: string; teacher_id: string } | null;
    student_conflicts: { student_id: string; lesson_id: string }[];
    message: string;
  };
  return {
    hasConflict: r.has_conflict,
    teacherConflict: r.teacher_conflict
      ? { lessonId: r.teacher_conflict.lesson_id, teacherId: r.teacher_conflict.teacher_id }
      : null,
    studentConflicts: (r.student_conflicts ?? []).map((c) => ({ studentId: c.student_id, lessonId: c.lesson_id })),
    message: r.message,
  };
}

export async function checkScheduleConflict(params: {
  teacherId: string;
  studentIds: string[];
  dayOfWeek: number;
  startMinute: number;
  durationMinutes: number;
  excludeLessonId?: string;
}): Promise<ScheduleConflictResult> {
  const { data, error } = await supabase.rpc('check_schedule_conflict', {
    p_teacher_id: params.teacherId,
    p_student_ids: params.studentIds,
    p_day_of_week: params.dayOfWeek,
    p_start_minute: params.startMinute,
    p_duration_minutes: params.durationMinutes,
    p_exclude_lesson_id: params.excludeLessonId ?? null,
  });
  if (error) throw error;
  return toConflictResult(data);
}

/** Dispatches every schedule mutation (create/move/cancel/end/participant changes) through one atomic, conflict-checked RPC. */
export async function applyScheduleChange(action: string, payload: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await supabase.rpc('apply_schedule_change', {
    p_action: action,
    p_payload: payload,
  });
  if (error) throw error;
  return data;
}

export async function getTeacherPreservationScore(lessonId: string): Promise<TeacherPreservationScore | null> {
  const { data, error } = await supabase.rpc('get_teacher_preservation_score', { p_lesson_id: lessonId });
  if (error) throw error;
  if (!data) return null;
  const r = data as {
    score: number;
    teacher_preserved: boolean;
    day_stable_days: number;
    time_stable_days: number;
    breakdown: { teacher: number; day: number; time: number };
  };
  return {
    score: r.score,
    teacherPreserved: r.teacher_preserved,
    dayStableDays: r.day_stable_days,
    timeStableDays: r.time_stable_days,
    breakdown: r.breakdown,
  };
}

/** Reads get_active_schedule_conflicts() — a set-based, read-only SQL scan (migration 016),
 * never a frontend loop making one RPC call per lesson pair. Raw facts/codes only; the
 * frontend resolves teacher/student names and localizes everything. */
export async function getActiveScheduleConflicts(): Promise<ScheduleConflictRow[]> {
  const { data, error } = await supabase.rpc('get_active_schedule_conflicts');
  if (error) throw error;
  const rows = (data ?? []) as {
    conflict_type: 'teacher_double_booking' | 'student_double_booking';
    teacher_id: string | null;
    student_id: string | null;
    lesson_id_a: string;
    lesson_id_b: string;
    day_of_week: number;
    start_minute_a: number;
    duration_minutes_a: number;
    start_minute_b: number;
    duration_minutes_b: number;
  }[];
  return rows.map((r) => ({
    conflictType: r.conflict_type,
    teacherId: r.teacher_id,
    studentId: r.student_id,
    lessonIdA: r.lesson_id_a,
    lessonIdB: r.lesson_id_b,
    dayOfWeek: r.day_of_week as ScheduleConflictRow['dayOfWeek'],
    startMinuteA: r.start_minute_a,
    durationMinutesA: r.duration_minutes_a,
    startMinuteB: r.start_minute_b,
    durationMinutesB: r.duration_minutes_b,
  }));
}

export async function getScheduleHealthMetrics(): Promise<ScheduleHealthMetrics> {
  const { data, error } = await supabase.rpc('get_schedule_health_metrics');
  if (error) throw error;
  const r = data as {
    teacher_occupancy_rate: number;
    total_empty_hours: number;
    unused_prime_time_hours: number;
    prime_time_occupancy_pct: number;
    most_occupied_teacher: { teacher_id: string; full_name: string; occupancy_pct: number } | null;
    least_utilized_teacher: { teacher_id: string; full_name: string; occupancy_pct: number } | null;
    total_available_bookable_slots: number;
    teachers_above_95pct_count: number;
    teachers_below_40pct_count: number;
    paused_students_schedulable_count: number;
  };
  return {
    teacherOccupancyRate: r.teacher_occupancy_rate,
    totalEmptyHours: r.total_empty_hours,
    unusedPrimeTimeHours: r.unused_prime_time_hours,
    primeTimeOccupancyPct: r.prime_time_occupancy_pct,
    mostOccupiedTeacher: r.most_occupied_teacher
      ? { teacherId: r.most_occupied_teacher.teacher_id, fullName: r.most_occupied_teacher.full_name, occupancyPct: r.most_occupied_teacher.occupancy_pct }
      : null,
    leastUtilizedTeacher: r.least_utilized_teacher
      ? { teacherId: r.least_utilized_teacher.teacher_id, fullName: r.least_utilized_teacher.full_name, occupancyPct: r.least_utilized_teacher.occupancy_pct }
      : null,
    totalAvailableBookableSlots: r.total_available_bookable_slots,
    teachersAbove95PctCount: r.teachers_above_95pct_count,
    teachersBelow40PctCount: r.teachers_below_40pct_count,
    pausedStudentsSchedulableCount: r.paused_students_schedulable_count,
  };
}

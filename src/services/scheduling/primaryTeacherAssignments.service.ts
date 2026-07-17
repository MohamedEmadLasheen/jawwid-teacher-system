import { supabase } from '@/lib/supabase';
import type { PrimaryTeacherInferenceRow } from '@/lib/types';

interface RawInferenceRow {
  student_id: string;
  student_name: string;
  candidate_teacher_id: string | null;
  candidate_teacher_name: string | null;
  analyzed_lesson_count: number;
  candidate_lesson_count: number;
  candidate_share_pct: number | string | null;
  distinct_teacher_count: number;
  most_recent_lesson_since: string | null;
  second_candidate_teacher_id: string | null;
  second_candidate_teacher_name: string | null;
  second_candidate_share_pct: number | string | null;
  confirmed_teacher_id: string | null;
  confirmed_teacher_name: string | null;
  confidence: PrimaryTeacherInferenceRow['confidence'];
  status: PrimaryTeacherInferenceRow['status'];
  reason_code: string;
}

/** Reads get_primary_teacher_inference_report() (migration 017/018) — read-only,
 * set-based evidence generation. Never writes; source of truth for the Primary
 * Teacher Review page's summary counts and queue. */
export async function fetchPrimaryTeacherInferenceReport(): Promise<PrimaryTeacherInferenceRow[]> {
  const { data, error } = await supabase.rpc('get_primary_teacher_inference_report');
  if (error) throw error;
  const rows = (data ?? []) as RawInferenceRow[];
  return rows.map((r) => ({
    studentId: r.student_id,
    studentName: r.student_name,
    candidateTeacherId: r.candidate_teacher_id,
    candidateTeacherName: r.candidate_teacher_name,
    analyzedLessonCount: r.analyzed_lesson_count,
    candidateLessonCount: r.candidate_lesson_count,
    candidateSharePct: r.candidate_share_pct !== null ? Number(r.candidate_share_pct) : null,
    distinctTeacherCount: r.distinct_teacher_count,
    mostRecentLessonSince: r.most_recent_lesson_since,
    secondCandidateTeacherId: r.second_candidate_teacher_id,
    secondCandidateTeacherName: r.second_candidate_teacher_name,
    secondCandidateSharePct: r.second_candidate_share_pct !== null ? Number(r.second_candidate_share_pct) : null,
    confirmedTeacherId: r.confirmed_teacher_id,
    confirmedTeacherName: r.confirmed_teacher_name,
    confidence: r.confidence,
    status: r.status,
    reasonCode: r.reason_code,
  }));
}

/** Task D — reads confirmed current primary-teacher assignments directly from
 * student_teacher_assignments (RLS already permits authenticated SELECT since
 * migration 017; no new migration/RPC needed for this read). Used to give
 * scheduling UI a deterministic "keep the confirmed Primary Teacher first"
 * signal — never auto-applied, always just a prioritized/labeled option for
 * a human to act on. */
export async function fetchCurrentPrimaryTeachersByStudentIds(
  studentIds: string[]
): Promise<Map<string, string>> {
  if (studentIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from('student_teacher_assignments')
    .select('student_id, teacher_id')
    .in('student_id', studentIds)
    .is('ended_at', null);
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.student_id as string, row.teacher_id as string]));
}

/** Calls confirm_primary_teacher_assignment() (migration 019) — the ONLY path that
 * writes a confirmed row. Atomically ends any existing current assignment and
 * inserts the new one; never touches lessons/lesson_participants. */
export async function confirmPrimaryTeacherAssignment(params: {
  studentId: string;
  teacherId: string;
  createdBy?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc('confirm_primary_teacher_assignment', {
    p_student_id: params.studentId,
    p_teacher_id: params.teacherId,
    p_created_by: params.createdBy ?? null,
  });
  if (error) throw error;
  return data as string;
}

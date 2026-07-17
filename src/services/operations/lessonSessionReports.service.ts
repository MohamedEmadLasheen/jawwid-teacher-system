import { supabase } from '@/lib/supabase';
import type { LessonSessionReport } from '@/lib/types';

/** Migration 020's table hasn't been added to the generated database.types.ts
 * yet, so — same precedent as primaryTeacherAssignments.service.ts for
 * student_teacher_assignments — raw rows are typed by hand here. */
interface RawLessonSessionReport {
  id: string;
  lesson_participant_id: string;
  occurrence_date: string;
  status: LessonSessionReport['status'];
  is_makeup_session: boolean;
  delivered_by_teacher_id: string | null;
  performance_level: LessonSessionReport['performanceLevel'];
  session_number_in_package: number | null;
  content_covered: string;
  homework: string;
  next_session_plan: string;
  reason_note: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function toLessonSessionReport(row: RawLessonSessionReport): LessonSessionReport {
  return {
    id: row.id,
    lessonParticipantId: row.lesson_participant_id,
    occurrenceDate: row.occurrence_date,
    status: row.status,
    isMakeupSession: row.is_makeup_session,
    deliveredByTeacherId: row.delivered_by_teacher_id,
    performanceLevel: row.performance_level,
    sessionNumberInPackage: row.session_number_in_package,
    contentCovered: row.content_covered,
    homework: row.homework,
    nextSessionPlan: row.next_session_plan,
    reasonNote: row.reason_note,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** All reports ever recorded for one specific lesson slot + student (one
 * lesson_participant_id), most recent occurrence first. */
export async function fetchSessionReportsForLessonParticipant(
  lessonParticipantId: string
): Promise<LessonSessionReport[]> {
  const { data, error } = await supabase
    .from('lesson_session_reports')
    .select('*')
    .eq('lesson_participant_id', lessonParticipantId)
    .order('occurrence_date', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as RawLessonSessionReport[]).map(toLessonSessionReport);
}

/** All reports for a whole lesson's participant set in one query — avoids
 * one round-trip per student for group lessons. */
export async function fetchSessionReportsForLessonParticipants(
  lessonParticipantIds: string[]
): Promise<LessonSessionReport[]> {
  if (lessonParticipantIds.length === 0) return [];
  const { data, error } = await supabase
    .from('lesson_session_reports')
    .select('*')
    .in('lesson_participant_id', lessonParticipantIds)
    .order('occurrence_date', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as RawLessonSessionReport[]).map(toLessonSessionReport);
}

export interface CreateSessionReportInput {
  lessonParticipantId: string;
  occurrenceDate: string;
  status: LessonSessionReport['status'];
  isMakeupSession: boolean;
  deliveredByTeacherId?: string | null;
  performanceLevel?: LessonSessionReport['performanceLevel'];
  sessionNumberInPackage?: number | null;
  contentCovered?: string;
  homework?: string;
  nextSessionPlan?: string;
  reasonNote?: string;
  createdBy?: string | null;
}

/** Records one session's outcome — the direct replacement for coloring a
 * spreadsheet day-cell. A duplicate (same lesson_participant_id +
 * occurrence_date) is rejected by the table's own unique constraint. */
export async function createSessionReport(input: CreateSessionReportInput): Promise<LessonSessionReport> {
  const { data, error } = await supabase
    .from('lesson_session_reports')
    .insert({
      lesson_participant_id: input.lessonParticipantId,
      occurrence_date: input.occurrenceDate,
      status: input.status,
      is_makeup_session: input.isMakeupSession,
      delivered_by_teacher_id: input.deliveredByTeacherId ?? null,
      performance_level: input.performanceLevel ?? null,
      session_number_in_package: input.sessionNumberInPackage ?? null,
      content_covered: input.contentCovered ?? '',
      homework: input.homework ?? '',
      next_session_plan: input.nextSessionPlan ?? '',
      reason_note: input.reasonNote ?? '',
      created_by: input.createdBy ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return toLessonSessionReport(data as RawLessonSessionReport);
}

import { supabase } from '@/lib/supabase';
import type { SessionEvaluation, SessionEvaluationDraft } from '@/lib/types';
import type { Database } from '@/lib/database.types';
import { parseCriteria, serializeCriteria } from '@/lib/evaluationCriteria';

type Row = Database['public']['Tables']['session_evaluations']['Row'];

function toEvaluation(row: Row): SessionEvaluation {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    evaluatorId: row.evaluator_id ?? '',
    evaluatorName: row.evaluator_name,
    sessionDate: row.session_date,
    tajweedAccuracy: row.tajweed_accuracy as SessionEvaluation['tajweedAccuracy'],
    pronunciation: row.pronunciation as SessionEvaluation['pronunciation'],
    correctionQuality: row.correction_quality as SessionEvaluation['correctionQuality'],
    listeningSkills: row.listening_skills as SessionEvaluation['listeningSkills'],
    punctuality: row.punctuality as SessionEvaluation['punctuality'],
    timeManagement: row.time_management as SessionEvaluation['timeManagement'],
    studentEngagement: row.student_engagement as SessionEvaluation['studentEngagement'],
    classFlow: row.class_flow as SessionEvaluation['classFlow'],
    professionalism: row.professionalism as SessionEvaluation['professionalism'],
    clarity: row.clarity as SessionEvaluation['clarity'],
    encouragement: row.encouragement as SessionEvaluation['encouragement'],
    parentCommunication: row.parent_communication as SessionEvaluation['parentCommunication'],
    lessonPreparation: row.lesson_preparation as SessionEvaluation['lessonPreparation'],
    explanationQuality: row.explanation_quality as SessionEvaluation['explanationQuality'],
    errorCorrection: row.error_correction as SessionEvaluation['errorCorrection'],
    followUp: row.follow_up as SessionEvaluation['followUp'],
    behavioralObservation: row.behavioral_observation as SessionEvaluation['behavioralObservation'],
    quickNotes: row.quick_notes,
    // GENERAL COMMENT. Coalesced because the column is nullable in the schema
    // (migration 001 declared it `TEXT DEFAULT ''`, not NOT NULL), so a
    // historical row can genuinely hold SQL NULL here.
    customNote: row.custom_note ?? '',
    // `null` for a historical evaluation whose `criteria` is the '{}' default.
    // Never defaulted to nine ratings — see parseCriteria.
    criteria: parseCriteria(row.criteria),
    overallScore: row.overall_score,
    grade: row.grade as SessionEvaluation['grade'],
    createdAt: row.created_at,
  };
}

export async function fetchEvaluations(): Promise<SessionEvaluation[]> {
  const { data, error } = await supabase
    .from('session_evaluations')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toEvaluation);
}

export async function createEvaluation(
  ev: SessionEvaluationDraft
): Promise<SessionEvaluation> {
  const { data, error } = await supabase
    .from('session_evaluations')
    .insert({
      teacher_id: ev.teacherId,
      evaluator_id: ev.evaluatorId || null,
      evaluator_name: ev.evaluatorName,
      session_date: ev.sessionDate,
      // The 16 legacy criterion columns are deliberately NOT written. A
      // 9-criteria evaluation does not score them, and writing a value would
      // claim a rating nobody gave. Their DEFAULT 'good' stands and is
      // meaningless for these rows; `criteria <> '{}'` is what tells the two
      // eras apart (migration 024). Historical rows keep their real values.
      behavioral_observation: ev.behavioralObservation,
      quick_notes: ev.quickNotes,
      custom_note: ev.customNote,
      // Serialised whole, so each criterion's comment is stored inside the
      // criterion it belongs to and cannot land on another one. `{}` is never
      // written by this path: a new evaluation always carries all nine.
      criteria: ev.criteria ? serializeCriteria(ev.criteria) : {},
      overall_score: ev.overallScore,
      grade: ev.grade,
    })
    .select()
    .single();
  if (error) throw error;
  return toEvaluation(data);
}

export async function deleteEvaluation(id: string): Promise<void> {
  const { error } = await supabase.from('session_evaluations').delete().eq('id', id);
  if (error) throw error;
}

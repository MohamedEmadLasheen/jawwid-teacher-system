import { supabase } from '@/lib/supabase';
import type { SessionEvaluation } from '@/lib/types';
import type { Database } from '@/lib/database.types';

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
    customNote: row.custom_note,
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
  ev: Omit<SessionEvaluation, 'id' | 'createdAt'>
): Promise<SessionEvaluation> {
  const { data, error } = await supabase
    .from('session_evaluations')
    .insert({
      teacher_id: ev.teacherId,
      evaluator_id: ev.evaluatorId || null,
      evaluator_name: ev.evaluatorName,
      session_date: ev.sessionDate,
      tajweed_accuracy: ev.tajweedAccuracy,
      pronunciation: ev.pronunciation,
      correction_quality: ev.correctionQuality,
      listening_skills: ev.listeningSkills,
      punctuality: ev.punctuality,
      time_management: ev.timeManagement,
      student_engagement: ev.studentEngagement,
      class_flow: ev.classFlow,
      professionalism: ev.professionalism,
      clarity: ev.clarity,
      encouragement: ev.encouragement,
      parent_communication: ev.parentCommunication,
      lesson_preparation: ev.lessonPreparation,
      explanation_quality: ev.explanationQuality,
      error_correction: ev.errorCorrection,
      follow_up: ev.followUp,
      behavioral_observation: ev.behavioralObservation,
      quick_notes: ev.quickNotes,
      custom_note: ev.customNote,
      overall_score: ev.overallScore,
      grade: ev.grade,
    })
    .select()
    .single();
  if (error) throw error;
  return toEvaluation(data);
}

import type { Teacher, SessionEvaluation, Complaint, ImprovementPlan, Deduction, RiskLevel, TeacherRiskProfile } from './types';

export function calculateRisk(
  teacher: Teacher,
  evaluations: SessionEvaluation[],
  complaints: Complaint[],
  plans: ImprovementPlan[],
  deductions: Deduction[]
): TeacherRiskProfile {
  const teacherEvals = evaluations.filter((e) => e.teacherId === teacher.id);
  const teacherComplaints = complaints.filter((c) => c.teacherId === teacher.id && c.status !== 'closed');
  const openPlans = plans.filter((p) => p.teacherId === teacher.id && (p.status === 'open' || p.status === 'in_progress'));
  const recentDeductions = deductions.filter((d) => {
    if (d.teacherId !== teacher.id) return false;
    const date = new Date(d.date);
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    return date >= threeMonthsAgo;
  });

  const avgScore = teacherEvals.length
    ? teacherEvals.reduce((s, e) => s + e.overallScore, 0) / teacherEvals.length
    : 100;

  // Risk scoring (0-100, higher = more risk)
  let riskScore = 0;

  // Complaints factor (0-40 points)
  riskScore += Math.min(teacherComplaints.length * 10, 40);

  // Evaluation score factor (0-30 points) - low scores = high risk
  if (avgScore < 50) riskScore += 30;
  else if (avgScore < 65) riskScore += 20;
  else if (avgScore < 75) riskScore += 10;
  else if (avgScore < 85) riskScore += 5;

  // Open improvement plans (0-20 points)
  riskScore += Math.min(openPlans.length * 8, 20);

  // Recent deductions (0-10 points)
  riskScore += Math.min(recentDeductions.length * 3, 10);

  let riskLevel: RiskLevel;
  if (riskScore >= 50) riskLevel = 'high';
  else if (riskScore >= 25) riskLevel = 'medium';
  else riskLevel = 'low';

  return {
    riskLevel,
    riskScore,
    factors: {
      complaints: teacherComplaints.length,
      avgEvalScore: Math.round(avgScore),
      openPlans: openPlans.length,
      recentDeductions: recentDeductions.length,
    },
  };
}

export function calculateEvaluationScore(eval_: Omit<SessionEvaluation, 'overallScore' | 'grade' | 'id' | 'createdAt'>): { score: number; grade: SessionEvaluation['grade'] } {
  const section1 = (eval_.tajweedAccuracy + eval_.pronunciation + eval_.correctionQuality + eval_.listeningSkills) / 4;
  const section2 = (eval_.punctuality + eval_.timeManagement + eval_.studentEngagement + eval_.classFlow) / 4;
  const section3 = (eval_.professionalism + eval_.clarity + eval_.encouragement + eval_.parentCommunication) / 4;
  const section4 = (eval_.lessonPreparation + eval_.explanationQuality + eval_.errorCorrection + eval_.followUp) / 4;

  // Behavioral bonus/penalty
  const behaviorMap: Record<string, number> = {
    excellent: 5,
    good: 3,
    needs_improvement: -3,
    critical_issue: -10,
  };
  const behaviorBonus = behaviorMap[eval_.behavioralObservation] || 0;

  const rawAvg = (section1 + section2 + section3 + section4) / 4; // 1-5
  const score = Math.max(0, Math.min(100, Math.round((rawAvg / 5) * 100 + behaviorBonus)));

  let grade: SessionEvaluation['grade'];
  if (score >= 90) grade = 'excellent';
  else if (score >= 75) grade = 'good';
  else if (score >= 60) grade = 'average';
  else if (score >= 45) grade = 'weak';
  else grade = 'critical';

  return { score, grade };
}
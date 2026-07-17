import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useTeacherStore, computePerformanceScore, computeRiskProfile } from '@/store/teacherStore';
import { useAcademyHealth } from '@/features/scheduling/hooks/useAcademyHealth';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type Confidence = 'high' | 'limited' | 'none';

interface TeacherIntelRow {
  id: string;
  name: string;
  score: number | null;
  confidence: Confidence;
  weeklyLessons: number;
  stabilityPct: number | null;
  riskLevel: 'low' | 'medium' | 'high';
  riskScore: number;
  reasonCode: string;
  reasonParams: Record<string, string | number>;
  actionKey: string;
  actionTo: string;
}

/** Transparent Teacher Intelligence Score — reuses the existing
 * computePerformanceScore/computeRiskProfile (already used on Teachers/Teacher
 * Profile) blended with academyHealth's per-teacher schedule stability
 * (preservationPct) and real weekly lesson count. No new scoring engine,
 * no fabricated data: a teacher with no evaluations/lessons is excluded from
 * ranking rather than scored as if data existed. */
export function TeacherIntelligenceSection() {
  const { t } = useTranslation();
  const { teachers, evaluations, complaints, improvementPlans, deductions } = useTeacherStore();
  const { health: academyHealth, isLoading } = useAcademyHealth();

  const rows: TeacherIntelRow[] = useMemo(() => {
    if (!academyHealth) return [];
    const teacherRowById = new Map(academyHealth.teacherRows.map((r) => [r.teacherId, r]));
    const activeTeachers = teachers.filter((tc) => !tc.isDeleted && tc.status === 'active');

    return activeTeachers.map((tc) => {
      const teacherEvals = evaluations.filter((e) => e.teacherId === tc.id);
      const openComplaints = complaints.filter((c) => c.teacherId === tc.id && c.status !== 'closed');
      const openPlans = improvementPlans.filter((p) => p.teacherId === tc.id && (p.status === 'open' || p.status === 'in_progress'));
      const recentDeds = deductions.filter((d) => d.teacherId === tc.id);
      const scheduleRow = teacherRowById.get(tc.id);
      const weeklyLessons = scheduleRow?.weeklyLessons ?? 0;

      const hasQuality = teacherEvals.length > 0;
      const hasStability = weeklyLessons > 0;
      const { score: qualityScore } = computePerformanceScore(tc.id, evaluations, complaints, improvementPlans, deductions);
      const stabilityPct = hasStability ? scheduleRow!.preservationPct : null;

      let score: number | null = null;
      let confidence: Confidence = 'none';
      if (hasQuality && hasStability) { score = Math.round((qualityScore + stabilityPct!) / 2); confidence = 'high'; }
      else if (hasQuality) { score = qualityScore; confidence = 'limited'; }
      else if (hasStability) { score = stabilityPct; confidence = 'limited'; }

      const { riskLevel, riskScore } = computeRiskProfile(tc.id, evaluations, complaints, improvementPlans, deductions);

      // Primary reason — inspects which real signal actually drove the risk, in priority order.
      let reasonCode = 'dashboard.teacherIntel.reason.none';
      let reasonParams: Record<string, string | number> = {};
      let actionKey = 'dashboard.teacherIntel.action.reviewProfile';
      let actionTo = `/teachers/${tc.id}`;
      if (openComplaints.length > 0) {
        reasonCode = 'dashboard.teacherIntel.reason.complaints';
        reasonParams = { count: openComplaints.length };
        actionKey = 'dashboard.teacherIntel.action.reviewComplaints';
        actionTo = '/action-center';
      } else if (teacherEvals.length > 0) {
        const avg = teacherEvals.reduce((s, e) => s + e.overallScore, 0) / teacherEvals.length;
        if (avg < 60) {
          reasonCode = 'dashboard.teacherIntel.reason.lowEvaluation';
          reasonParams = { avg: Math.round(avg) };
          actionKey = 'dashboard.teacherIntel.action.reviewEvaluations';
          actionTo = `/teachers/${tc.id}`;
        }
      }
      if (reasonCode === 'dashboard.teacherIntel.reason.none' && openPlans.length > 0) {
        reasonCode = 'dashboard.teacherIntel.reason.improvementPlan';
        reasonParams = { count: openPlans.length };
        actionKey = 'dashboard.teacherIntel.action.reviewImprovementPlan';
        actionTo = '/action-center';
      }
      if (reasonCode === 'dashboard.teacherIntel.reason.none' && recentDeds.length > 0) {
        reasonCode = 'dashboard.teacherIntel.reason.deductions';
        reasonParams = { count: recentDeds.length };
        actionKey = 'dashboard.teacherIntel.action.reviewDeductions';
        actionTo = '/adjustments';
      }

      return {
        id: tc.id, name: tc.fullName, score, confidence, weeklyLessons, stabilityPct,
        riskLevel, riskScore, reasonCode, reasonParams, actionKey, actionTo,
      };
    });
  }, [teachers, evaluations, complaints, improvementPlans, deductions, academyHealth]);

  if (isLoading || rows.length === 0) return null;

  const top10 = [...rows].filter((r) => r.confidence !== 'none').sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 10);
  const attention10 = [...rows].filter((r) => r.riskLevel !== 'low').sort((a, b) => b.riskScore - a.riskScore).slice(0, 10);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <div className="space-y-2">
        <h3 className="text-base font-bold text-primary">{t('dashboard.teacherIntel.topTitle')}</h3>
        <Card>
          <CardContent className="p-3 divide-y">
            {top10.map((r, i) => (
              <div key={r.id} className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-bold text-secondary w-4 shrink-0">{i + 1}</span>
                  <div className="min-w-0">
                    <Link to={`/teachers/${r.id}`} className="text-sm font-medium truncate hover:underline">{r.name}</Link>
                    <p className="text-[10px] text-muted-foreground">
                      {t('dashboard.teacherIntel.confidenceLabel')}: {t(`dashboard.teacherIntel.confidence.${r.confidence}`)}
                    </p>
                  </div>
                </div>
                <Badge className="bg-green-100 text-green-800 text-xs shrink-0">{r.score}</Badge>
              </div>
            ))}
            {top10.length === 0 && <p className="text-xs text-muted-foreground py-2">{t('dashboard.teacherIntel.insufficientData')}</p>}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        <h3 className="text-base font-bold text-primary">{t('dashboard.teacherIntel.attentionTitle')}</h3>
        <Card>
          <CardContent className="p-3 divide-y">
            {attention10.map((r) => (
              <div key={r.id} className="py-2 first:pt-0 last:pb-0 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <Link to={`/teachers/${r.id}`} className="text-sm font-medium truncate hover:underline">{r.name}</Link>
                  <Badge className={`text-xs shrink-0 ${r.riskLevel === 'high' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                    {t(`risk.${r.riskLevel}`)}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{t(r.reasonCode, r.reasonParams)}</p>
                <Link to={r.actionTo} className="text-xs text-primary font-medium hover:underline">{t(r.actionKey)}</Link>
              </div>
            ))}
            {attention10.length === 0 && <p className="text-xs text-muted-foreground py-2">{t('dashboard.teacherIntel.noneNeedingAttention')}</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

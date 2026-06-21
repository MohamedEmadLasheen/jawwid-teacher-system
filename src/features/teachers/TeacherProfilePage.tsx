import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useTeacherStore, computeRiskProfile, computePerformanceScore, formatCurrency } from '@/store/teacherStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  ArrowRight, ArrowLeft, User, Briefcase, TrendingUp, History,
  Clock, Star, AlertTriangle, CheckCircle2, XCircle, FileText,
  DollarSign, Calendar, Phone, Mail, Globe, Award,
} from 'lucide-react';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import type { TeacherTimelineEvent } from '@/lib/types';

export function TeacherProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const {
    teachers, evaluations, complaints, improvementPlans,
    deductions, bonuses, recommendations, adminNotes,
  } = useTeacherStore();

  const teacher = teachers.find((t) => t.id === id);
  if (!teacher) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">{t('common.noData')}</p>
        <Button onClick={() => navigate('/teachers')} className="mt-4">
          {t('common.back')}
        </Button>
      </div>
    );
  }

  const teacherEvals = evaluations.filter((e) => e.teacherId === id);
  const teacherComplaints = complaints.filter((c) => c.teacherId === id);
  const teacherPlans = improvementPlans.filter((p) => p.teacherId === id);
  const teacherDeductions = deductions.filter((d) => d.teacherId === id);
  const teacherBonuses = bonuses.filter((b) => b.teacherId === id);
  const teacherRecs = recommendations.filter((r) => r.teacherId === id);
  const teacherNotes = adminNotes.filter((n) => n.teacherId === id);

  const { riskLevel, riskScore } = computeRiskProfile(id!, evaluations, complaints, improvementPlans, deductions);
  const { score: perfScore, category: perfCat } = computePerformanceScore(id!, evaluations, complaints, improvementPlans, deductions);

  const avgEval = teacherEvals.length
    ? Math.round(teacherEvals.reduce((s, e) => s + e.overallScore, 0) / teacherEvals.length)
    : 0;

  const totalBonusEGP = teacherBonuses.filter((b) => b.currency === 'EGP').reduce((s, b) => s + b.amount, 0);
  const totalBonusUSD = teacherBonuses.filter((b) => b.currency === 'USD').reduce((s, b) => s + b.amount, 0);
  const totalDedEGP = teacherDeductions.filter((d) => d.currency === 'EGP').reduce((s, d) => s + d.amount, 0);
  const totalDedUSD = teacherDeductions.filter((d) => d.currency === 'USD').reduce((s, d) => s + d.amount, 0);

  const formatDate = (dateStr: string) => {
    try { return format(new Date(dateStr), 'dd MMM yyyy', { locale: isAr ? ar : undefined }); }
    catch { return dateStr; }
  };

  // Build timeline
  const timeline: TeacherTimelineEvent[] = [
    {
      id: 'hired',
      teacherId: teacher.id,
      date: teacher.joiningDate,
      eventType: 'hired',
      titleAr: 'انضمام المعلم',
      titleEn: 'Teacher Hired',
    },
    ...teacherEvals.map((e) => ({
      id: e.id,
      teacherId: teacher.id,
      date: e.sessionDate,
      eventType: 'evaluation' as const,
      titleAr: `تقييم — ${e.overallScore}%`,
      titleEn: `Evaluation — ${e.overallScore}%`,
      score: e.overallScore,
    })),
    ...teacherBonuses.map((b) => ({
      id: b.id,
      teacherId: teacher.id,
      date: b.date,
      eventType: 'bonus' as const,
      titleAr: `مكافأة — ${formatCurrency(b.amount, b.currency)}`,
      titleEn: `Bonus — ${formatCurrency(b.amount, b.currency)}`,
      amount: b.amount,
      currency: b.currency,
    })),
    ...teacherDeductions.map((d) => ({
      id: d.id,
      teacherId: teacher.id,
      date: d.date,
      eventType: 'deduction' as const,
      titleAr: `خصم — ${formatCurrency(d.amount, d.currency)}`,
      titleEn: `Deduction — ${formatCurrency(d.amount, d.currency)}`,
      amount: d.amount,
      currency: d.currency,
    })),
    ...teacherComplaints.map((c) => ({
      id: c.id,
      teacherId: teacher.id,
      date: c.createdAt.split('T')[0],
      eventType: 'complaint_submitted' as const,
      titleAr: 'شكوى مقدمة',
      titleEn: 'Complaint Submitted',
    })),
    ...teacherPlans.map((p) => ({
      id: p.id,
      teacherId: teacher.id,
      date: p.createdAt.split('T')[0],
      eventType: 'plan_created' as const,
      titleAr: 'خطة تحسين',
      titleEn: 'Improvement Plan Created',
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const riskColors = { low: 'bg-green-100 text-green-800', medium: 'bg-yellow-100 text-yellow-800', high: 'bg-red-100 text-red-800' };
  const perfColors: Record<string, string> = {
    elite: 'bg-purple-100 text-purple-800',
    excellent: 'bg-green-100 text-green-800',
    good: 'bg-blue-100 text-blue-800',
    needs_improvement: 'bg-yellow-100 text-yellow-800',
    at_risk: 'bg-red-100 text-red-800',
  };
  const levelColors: Record<string, string> = {
    silver: 'bg-gray-100 text-gray-700',
    gold: 'bg-yellow-100 text-yellow-800',
    platinum: 'bg-blue-100 text-blue-800',
  };

  const timelineIcons: Record<string, React.ReactNode> = {
    hired: <Award className="h-4 w-4 text-secondary" />,
    evaluation: <Star className="h-4 w-4 text-blue-500" />,
    bonus: <TrendingUp className="h-4 w-4 text-green-500" />,
    deduction: <AlertTriangle className="h-4 w-4 text-red-500" />,
    complaint_submitted: <XCircle className="h-4 w-4 text-orange-500" />,
    complaint_resolved: <CheckCircle2 className="h-4 w-4 text-green-500" />,
    plan_created: <FileText className="h-4 w-4 text-purple-500" />,
    plan_closed: <CheckCircle2 className="h-4 w-4 text-purple-500" />,
  };

  const BackIcon = isAr ? ArrowRight : ArrowLeft;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Back + Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={() => navigate('/teachers')}>
          <BackIcon className="h-4 w-4 me-1" />
          {t('common.back')}
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-primary">{teacher.fullName}</h1>
          <div className="flex flex-wrap gap-2 mt-1">
            <Badge className={teacher.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}>
              {t(`teachers.${teacher.status}`)}
            </Badge>
            <Badge className={levelColors[teacher.level]}>{t(`teachers.${teacher.level}`)}</Badge>
            <Badge className={riskColors[riskLevel]}>{t(`risk.${riskLevel}`)} — {riskScore}</Badge>
            <Badge className={perfColors[perfCat]}>{t(`performance.${perfCat}`)} — {perfScore}%</Badge>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: t('evaluation.overallScore'), value: `${avgEval}%`, color: 'text-blue-600' },
          { label: t('complaint.title'), value: teacherComplaints.length, color: 'text-orange-600' },
          { label: t('plan.title'), value: teacherPlans.filter((p) => p.status === 'open' || p.status === 'in_progress').length, color: 'text-purple-600' },
          { label: t('evaluation.title'), value: teacherEvals.length, color: 'text-green-600' },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4 text-center">
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="personal">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="personal">{t('teachers.personalInfo')}</TabsTrigger>
          <TabsTrigger value="employment">{t('teachers.employmentInfo')}</TabsTrigger>
          <TabsTrigger value="performance">{t('teachers.performance')}</TabsTrigger>
          <TabsTrigger value="history">{t('common.actions')}</TabsTrigger>
          <TabsTrigger value="financial">{t('teachers.financialSummary')}</TabsTrigger>
          <TabsTrigger value="timeline">{t('teachers.timeline')}</TabsTrigger>
        </TabsList>

        {/* Personal Info */}
        <TabsContent value="personal">
          <Card>
            <CardHeader><CardTitle className="text-primary">{t('teachers.personalInfo')}</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InfoItem icon={<User />} label={t('teachers.fullName')} value={teacher.fullName} />
              <InfoItem icon={<Phone />} label={t('teachers.phone')} value={teacher.phone} />
              <InfoItem icon={<Mail />} label={t('teachers.email')} value={teacher.email} />
              <InfoItem icon={<Globe />} label={t('teachers.nationality')} value={teacher.nationality} />
              <InfoItem icon={<Calendar />} label={t('teachers.joiningDate')} value={formatDate(teacher.joiningDate)} />
              <InfoItem icon={<Clock />} label={t('common.createdAt')} value={formatDate(teacher.createdAt)} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Employment Info */}
        <TabsContent value="employment">
          <Card>
            <CardHeader><CardTitle className="text-primary">{t('teachers.employmentInfo')}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InfoItem icon={<Briefcase />} label={t('teachers.salaryType')} value={t(`salaryType.${teacher.salaryType}`)} />
                <InfoItem icon={<DollarSign />} label={t('teachers.salaryCurrency')} value={t(`currency.${teacher.salaryCurrency}`)} />
                <InfoItem icon={<DollarSign />} label={t('teachers.monthlySalary')} value={formatCurrency(teacher.monthlySalary, teacher.salaryCurrency)} />
                <InfoItem icon={<Globe />} label={t('teachers.teachingMarket')} value={t(`teachingMarket.${teacher.teachingMarket}`)} />
                <InfoItem icon={<Star />} label={t('teachers.level')} value={t(`teachers.${teacher.level}`)} />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">{t('teachers.specializations')}</p>
                <div className="flex flex-wrap gap-2">
                  {teacher.specializations.map((spec) => (
                    <Badge key={spec} className="bg-primary text-white">{t(`specialization.${spec}`)}</Badge>
                  ))}
                  {teacher.specializations.length === 0 && <span className="text-sm text-muted-foreground">—</span>}
                </div>
              </div>
              {teacher.notes && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">{t('teachers.notes')}</p>
                  <p className="text-sm bg-gray-50 p-3 rounded-lg border">{teacher.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Performance */}
        <TabsContent value="performance">
          <div className="space-y-4">
            {/* Monthly Performance Score */}
            <Card>
              <CardHeader><CardTitle className="text-primary">{t('performance.title')}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-4xl font-bold text-primary">{perfScore}</p>
                    <p className="text-sm text-muted-foreground">{t('performance.score')}</p>
                  </div>
                  <Badge className={`${perfColors[perfCat]} text-base px-4 py-2`}>
                    {t(`performance.${perfCat}`)}
                  </Badge>
                </div>
                <Progress value={perfScore} className="h-3" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <ScoreBar label={t('performance.evaluationsWeight')} value={Math.round((avgEval / 100) * 50)} max={50} color="bg-blue-500" />
                  <ScoreBar label={t('performance.complaintsWeight')} value={Math.max(0, 20 - teacherComplaints.filter((c) => c.status !== 'closed').length * 5)} max={20} color="bg-orange-500" />
                  <ScoreBar label={t('performance.adminWeight')} value={Math.max(0, 20 - teacherDeductions.length * 4)} max={20} color="bg-purple-500" />
                  <ScoreBar label={t('performance.plansWeight')} value={Math.max(0, 10 - teacherPlans.filter((p) => p.status === 'open' || p.status === 'in_progress').length * 5)} max={10} color="bg-yellow-500" />
                </div>
              </CardContent>
            </Card>

            {/* Risk Engine */}
            <Card>
              <CardHeader><CardTitle className="text-primary">{t('risk.title')}</CardTitle></CardHeader>
              <CardContent>
                <div className="flex items-center justify-between mb-4">
                  <Badge className={`${riskColors[riskLevel]} text-base px-4 py-2`}>
                    {t(`risk.${riskLevel}`)}
                  </Badge>
                  <p className="text-2xl font-bold text-primary">{riskScore}/100</p>
                </div>
                <Progress value={riskScore} className="h-3 mb-4" />
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-muted-foreground">{t('risk.complaints')}</p>
                    <p className="font-bold text-orange-600">{teacherComplaints.filter((c) => c.status !== 'closed').length}</p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-muted-foreground">{t('risk.avgScore')}</p>
                    <p className="font-bold text-blue-600">{avgEval}%</p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-muted-foreground">{t('risk.openPlans')}</p>
                    <p className="font-bold text-purple-600">{teacherPlans.filter((p) => p.status === 'open' || p.status === 'in_progress').length}</p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-muted-foreground">{t('risk.recentDeductions')}</p>
                    <p className="font-bold text-red-600">{teacherDeductions.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* History */}
        <TabsContent value="history">
          <div className="space-y-4">
            {/* Evaluations */}
            <Card>
              <CardHeader><CardTitle className="text-primary text-base">{t('teachers.evaluations')}</CardTitle></CardHeader>
              <CardContent>
                {teacherEvals.length === 0 ? <p className="text-sm text-muted-foreground">{t('evaluation.noEvaluations')}</p> : (
                  <div className="space-y-2">
                    {teacherEvals.map((e) => (
                      <div key={e.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                        <div>
                          <p className="text-sm font-medium">{e.evaluatorName}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(e.sessionDate)}</p>
                        </div>
                        <Badge className={e.overallScore >= 80 ? 'bg-green-100 text-green-800' : e.overallScore >= 60 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}>
                          {e.overallScore}%
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Complaints */}
            <Card>
              <CardHeader><CardTitle className="text-primary text-base">{t('teachers.complaints')}</CardTitle></CardHeader>
              <CardContent>
                {teacherComplaints.length === 0 ? <p className="text-sm text-muted-foreground">{t('complaint.noComplaints')}</p> : (
                  <div className="space-y-2">
                    {teacherComplaints.map((c) => (
                      <div key={c.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                        <div>
                          <p className="text-sm font-medium">{c.description}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(c.createdAt)}</p>
                        </div>
                        <Badge className={c.status === 'resolved' || c.status === 'closed' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}>
                          {t(`complaint.${c.status}`)}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Improvement Plans */}
            <Card>
              <CardHeader><CardTitle className="text-primary text-base">{t('teachers.improvementPlans')}</CardTitle></CardHeader>
              <CardContent>
                {teacherPlans.length === 0 ? <p className="text-sm text-muted-foreground">{t('plan.noPlans')}</p> : (
                  <div className="space-y-2">
                    {teacherPlans.map((p) => (
                      <div key={p.id} className="p-3 bg-gray-50 rounded-lg border">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm font-medium">{p.issue}</p>
                          <Badge className={p.status === 'completed' ? 'bg-green-100 text-green-800' : p.status === 'failed' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}>
                            {t(`plan.${p.status}`)}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{t('plan.targetDate')}: {formatDate(p.targetDate)}</p>
                        {p.followUpPercentage > 0 && (
                          <div className="mt-2">
                            <div className="flex justify-between text-xs mb-1">
                              <span>{t('plan.followUpPercentage')}</span>
                              <span>{p.followUpPercentage}%</span>
                            </div>
                            <Progress value={p.followUpPercentage} className="h-1.5" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recommendations */}
            <Card>
              <CardHeader><CardTitle className="text-primary text-base">{t('teachers.recommendations')}</CardTitle></CardHeader>
              <CardContent>
                {teacherRecs.length === 0 ? <p className="text-sm text-muted-foreground">{t('recommendation.noRecommendations')}</p> : (
                  <div className="space-y-2">
                    {teacherRecs.map((r) => (
                      <div key={r.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                        <div>
                          <p className="text-sm font-medium">{t(`recommendation.${r.category}`)}</p>
                          <p className="text-xs text-muted-foreground">{r.content}</p>
                        </div>
                        <Badge>{t(`recommendation.${r.status}`)}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Admin Notes */}
            <Card>
              <CardHeader><CardTitle className="text-primary text-base">{t('teachers.adminNotes')}</CardTitle></CardHeader>
              <CardContent>
                {teacherNotes.length === 0 ? <p className="text-sm text-muted-foreground">{t('common.noData')}</p> : (
                  <div className="space-y-2">
                    {teacherNotes.map((n) => (
                      <div key={n.id} className="p-3 bg-gray-50 rounded-lg border">
                        <p className="text-sm">{n.content}</p>
                        <p className="text-xs text-muted-foreground mt-1">{n.createdBy} — {formatDate(n.createdAt)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Financial Summary */}
        <TabsContent value="financial">
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">{t('teachers.currentSalary')}</p>
                  <p className="text-xl font-bold text-primary">{formatCurrency(teacher.monthlySalary, teacher.salaryCurrency)}</p>
                  <p className="text-xs text-muted-foreground">{t(`salaryType.${teacher.salaryType}`)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">{t('teachers.totalBonuses')}</p>
                  {totalBonusEGP > 0 && <p className="text-lg font-bold text-green-600">{formatCurrency(totalBonusEGP, 'EGP')}</p>}
                  {totalBonusUSD > 0 && <p className="text-lg font-bold text-green-600">{formatCurrency(totalBonusUSD, 'USD')}</p>}
                  {totalBonusEGP === 0 && totalBonusUSD === 0 && <p className="text-lg font-bold text-green-600">—</p>}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">{t('teachers.totalDeductions')}</p>
                  {totalDedEGP > 0 && <p className="text-lg font-bold text-red-600">{formatCurrency(totalDedEGP, 'EGP')}</p>}
                  {totalDedUSD > 0 && <p className="text-lg font-bold text-red-600">{formatCurrency(totalDedUSD, 'USD')}</p>}
                  {totalDedEGP === 0 && totalDedUSD === 0 && <p className="text-lg font-bold text-red-600">—</p>}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">{t('teachers.netAdjustments')}</p>
                  <p className={`text-lg font-bold ${(totalBonusEGP - totalDedEGP) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(Math.abs(totalBonusEGP - totalDedEGP), 'EGP')}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Bonus History */}
            <Card>
              <CardHeader><CardTitle className="text-primary text-base">{t('teachers.bonusHistory')}</CardTitle></CardHeader>
              <CardContent>
                {teacherBonuses.length === 0 ? <p className="text-sm text-muted-foreground">{t('bonus.noBonuses')}</p> : (
                  <div className="space-y-2">
                    {teacherBonuses.map((b) => (
                      <div key={b.id} className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-100">
                        <div>
                          <p className="text-sm font-medium">{t(`bonus.${b.category}`)}</p>
                          <p className="text-xs text-muted-foreground">{b.reason} — {formatDate(b.date)}</p>
                        </div>
                        <div className="text-end">
                          <p className="text-sm font-bold text-green-600">+{formatCurrency(b.amount, b.currency)}</p>
                          <Badge className={b.approvalStatus === 'approved' ? 'bg-green-100 text-green-800' : b.approvalStatus === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}>
                            {t(`bonus.${b.approvalStatus}`)}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Deduction History */}
            <Card>
              <CardHeader><CardTitle className="text-primary text-base">{t('teachers.deductionHistory')}</CardTitle></CardHeader>
              <CardContent>
                {teacherDeductions.length === 0 ? <p className="text-sm text-muted-foreground">{t('deduction.noDeductions')}</p> : (
                  <div className="space-y-2">
                    {teacherDeductions.map((d) => (
                      <div key={d.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-100">
                        <div>
                          <p className="text-sm font-medium">{t(`deduction.${d.category}`)}</p>
                          <p className="text-xs text-muted-foreground">{d.reason} — {formatDate(d.date)}</p>
                        </div>
                        <p className="text-sm font-bold text-red-600">-{formatCurrency(d.amount, d.currency)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Timeline */}
        <TabsContent value="timeline">
          <Card>
            <CardHeader><CardTitle className="text-primary">{t('teachers.timeline')}</CardTitle></CardHeader>
            <CardContent>
              {timeline.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">{t('common.noData')}</p>
              ) : (
                <div className="relative">
                  <div className="absolute start-5 top-0 bottom-0 w-0.5 bg-gray-200" />
                  <div className="space-y-4">
                    {timeline.map((event) => (
                      <div key={event.id} className="flex items-start gap-4 ps-12 relative">
                        <div className="absolute start-3 w-5 h-5 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center">
                          {timelineIcons[event.eventType] || <Clock className="h-3 w-3 text-gray-400" />}
                        </div>
                        <div className="flex-1 bg-gray-50 rounded-lg p-3 border">
                          <p className="text-sm font-medium">{isAr ? event.titleAr : event.titleEn}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {formatDate(event.date)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 border">
      <span className="text-primary mt-0.5 flex-shrink-0">{icon}</span>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

function ScoreBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value}/{max}</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${(value / max) * 100}%` }} />
      </div>
    </div>
  );
}


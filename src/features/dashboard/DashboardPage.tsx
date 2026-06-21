import { useTranslation } from 'react-i18next';
import { useTeacherStore, computeRiskProfile, computePerformanceScore, formatCurrency } from '@/store/teacherStore';
import { useLogStore } from '@/store/logStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import {
  Users, UserCheck, AlertTriangle, TrendingUp, TrendingDown,
  ClipboardList, Star, Calendar, Award, Activity,
} from 'lucide-react';
import { CHART_COLORS, PERF_CHART_COLORS, perfColors } from '@/lib/uiConstants';

export function DashboardPage() {
  const { t } = useTranslation();
  const { teachers, evaluations, complaints, improvementPlans, deductions, bonuses } = useTeacherStore();
  const { logs } = useLogStore();

  const activeTeachers = teachers.filter((t) => !t.isDeleted && t.status === 'active');
  const today = new Date().toISOString().split('T')[0];
  const thisMonth = new Date().toISOString().slice(0, 7);

  const evalsToday = evaluations.filter((e) => e.createdAt.startsWith(today)).length;
  const complaintsToday = complaints.filter((c) => c.createdAt.startsWith(today)).length;
  const bonusesToday = bonuses.filter((b) => b.createdAt.startsWith(today)).length;
  const deductionsToday = deductions.filter((d) => d.createdAt.startsWith(today)).length;
  const plansToday = improvementPlans.filter((p) => p.createdAt.startsWith(today)).length;

  const riskCounts = { low: 0, medium: 0, high: 0 };
  const teacherPerformances: { id: string; name: string; score: number; category: string }[] = [];

  activeTeachers.forEach((teacher) => {
    const { riskLevel } = computeRiskProfile(teacher.id, evaluations, complaints, improvementPlans, deductions);
    riskCounts[riskLevel]++;
    const { score, category } = computePerformanceScore(teacher.id, evaluations, complaints, improvementPlans, deductions);
    teacherPerformances.push({ id: teacher.id, name: teacher.fullName, score, category });
  });

  const atRiskCount = riskCounts.high;
  const withComplaints = new Set(complaints.filter((c) => c.status !== 'closed').map((c) => c.teacherId)).size;
  const openPlans = improvementPlans.filter((p) => p.status === 'open' || p.status === 'in_progress').length;
  const avgEvalScore = evaluations.length
    ? Math.round(evaluations.reduce((s, e) => s + e.overallScore, 0) / evaluations.length)
    : 0;

  const monthlyBonusEGP = bonuses.filter((b) => b.createdAt.startsWith(thisMonth) && b.currency === 'EGP').reduce((s, b) => s + b.amount, 0);
  const monthlyDedEGP = deductions.filter((d) => d.createdAt.startsWith(thisMonth) && d.currency === 'EGP').reduce((s, d) => s + d.amount, 0);

  const sortedByPerf = [...teacherPerformances].sort((a, b) => b.score - a.score);
  const top5 = sortedByPerf.slice(0, 5);
  const bottom5 = sortedByPerf.slice(-5).reverse();

  const complaintCountMap: Record<string, number> = {};
  complaints.forEach((c) => { complaintCountMap[c.teacherId] = (complaintCountMap[c.teacherId] || 0) + 1; });
  const mostComplainedId = Object.entries(complaintCountMap).sort((a, b) => b[1] - a[1])[0]?.[0];
  const mostComplainedTeacher = teachers.find((t) => t.id === mostComplainedId);

  const resolvedComplaints = complaints.filter((c) => c.status === 'resolved' || c.status === 'closed').length;
  const resolutionRate = complaints.length ? Math.round((resolvedComplaints / complaints.length) * 100) : 100;

  const levelData = [
    { name: t('teachers.silver'), value: activeTeachers.filter((t) => t.level === 'silver').length },
    { name: t('teachers.gold'), value: activeTeachers.filter((t) => t.level === 'gold').length },
    { name: t('teachers.platinum'), value: activeTeachers.filter((t) => t.level === 'platinum').length },
  ];

  const perfDistribution = [
    { name: t('performance.elite'), value: teacherPerformances.filter((p) => p.category === 'elite').length, color: PERF_CHART_COLORS.elite },
    { name: t('performance.excellent'), value: teacherPerformances.filter((p) => p.category === 'excellent').length, color: PERF_CHART_COLORS.excellent },
    { name: t('performance.good'), value: teacherPerformances.filter((p) => p.category === 'good').length, color: PERF_CHART_COLORS.good },
    { name: t('performance.needs_improvement'), value: teacherPerformances.filter((p) => p.category === 'needs_improvement').length, color: PERF_CHART_COLORS.needs_improvement },
    { name: t('performance.at_risk'), value: teacherPerformances.filter((p) => p.category === 'at_risk').length, color: PERF_CHART_COLORS.at_risk },
  ];

  const riskData = [
    { name: t('risk.low'), value: riskCounts.low, color: '#10b981' },
    { name: t('risk.medium'), value: riskCounts.medium, color: '#f59e0b' },
    { name: t('risk.high'), value: riskCounts.high, color: '#ef4444' },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold text-primary">{t('dashboard.title')}</h1>

      {/* Today Section */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5" />
          {t('dashboard.todaySection')}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
          {[
            { label: t('dashboard.evaluationsToday'), value: evalsToday, icon: <Star className="h-4 w-4" />, color: 'text-blue-600' },
            { label: t('dashboard.newComplaintsToday'), value: complaintsToday, icon: <AlertTriangle className="h-4 w-4" />, color: 'text-orange-600' },
            { label: t('dashboard.bonusesToday'), value: bonusesToday, icon: <TrendingUp className="h-4 w-4" />, color: 'text-green-600' },
            { label: t('dashboard.deductionsToday'), value: deductionsToday, icon: <TrendingDown className="h-4 w-4" />, color: 'text-red-600' },
            { label: t('dashboard.plansToday'), value: plansToday, icon: <ClipboardList className="h-4 w-4" />, color: 'text-purple-600' },
          ].map((stat) => (
            <Card key={stat.label} className="overflow-hidden">
              <CardContent className="p-3 flex items-center gap-2">
                <span className={`${stat.color} shrink-0`}>{stat.icon}</span>
                <div className="min-w-0">
                  <p className={`text-lg font-bold leading-tight ${stat.color}`}>{stat.value}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight line-clamp-2">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Main KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <StatCard icon={<Users className="h-4 w-4" />} label={t('dashboard.totalTeachers')} value={teachers.filter((t) => !t.isDeleted).length} color="text-primary" />
        <StatCard icon={<UserCheck className="h-4 w-4" />} label={t('dashboard.activeTeachers')} value={activeTeachers.length} color="text-green-600" />
        <StatCard icon={<AlertTriangle className="h-4 w-4" />} label={t('dashboard.teachersAtRisk')} value={atRiskCount} color="text-red-600" />
        <StatCard icon={<Star className="h-4 w-4" />} label={t('dashboard.avgEvalScore')} value={`${avgEvalScore}%`} color="text-blue-600" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <StatCard icon={<ClipboardList className="h-4 w-4" />} label={t('dashboard.teachersWithComplaints')} value={withComplaints} color="text-orange-600" />
        <StatCard icon={<Activity className="h-4 w-4" />} label={t('dashboard.openPlans')} value={openPlans} color="text-purple-600" />
        <StatCard icon={<TrendingUp className="h-4 w-4" />} label={`${t('dashboard.monthlyBonuses')} (EGP)`} value={formatCurrency(monthlyBonusEGP, 'EGP')} color="text-green-600" />
        <StatCard icon={<TrendingDown className="h-4 w-4" />} label={`${t('dashboard.monthlyDeductions')} (EGP)`} value={formatCurrency(monthlyDedEGP, 'EGP')} color="text-red-600" />
      </div>

      {/* Quality Metrics */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          {t('dashboard.qualityMetrics')}
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          <MetricCard label={t('dashboard.avgEvalScore')} value={`${avgEvalScore}%`} color={avgEvalScore >= 80 ? 'text-green-600' : avgEvalScore >= 60 ? 'text-yellow-600' : 'text-red-600'} />
          <MetricCard label={t('dashboard.complaintResolutionRate')} value={`${resolutionRate}%`} color={resolutionRate >= 80 ? 'text-green-600' : 'text-yellow-600'} />
          <MetricCard label={t('dashboard.attendanceRate')} value="95%" color="text-green-600" />
          <MetricCard label={t('dashboard.teacherRetentionRate')} value={`${Math.round((activeTeachers.length / Math.max(teachers.filter((t) => !t.isDeleted).length, 1)) * 100)}%`} color="text-blue-600" />
        </div>
      </div>

      {/* Charts — stack on mobile */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <Card>
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-xs text-primary">{t('risk.title')}</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-3">
            <ResponsiveContainer width="100%" height={150}>
              <PieChart>
                <Pie data={riskData} cx="50%" cy="50%" innerRadius={35} outerRadius={58} dataKey="value"
                  label={({ name, value }) => value > 0 ? `${name}: ${value}` : ''} labelLine={false}>
                  {riskData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-xs text-primary">{t('dashboard.performanceDistribution')}</CardTitle>
          </CardHeader>
          <CardContent className="px-1 pb-3">
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={perfDistribution} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 8 }} interval={0} />
                <YAxis tick={{ fontSize: 8 }} />
                <Tooltip />
                <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                  {perfDistribution.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="sm:col-span-2 lg:col-span-1">
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-xs text-primary">{t('dashboard.levelDistribution')}</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-3">
            <ResponsiveContainer width="100%" height={150}>
              <PieChart>
                <Pie data={levelData} cx="50%" cy="50%" outerRadius={58} dataKey="value"
                  label={({ name, value }) => value > 0 ? `${name}: ${value}` : ''} labelLine={false}>
                  {levelData.map((_, index) => (
                    <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Top / Bottom Teachers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <Card>
          <CardHeader className="pb-2 pt-3 px-3 sm:px-4">
            <CardTitle className="text-xs sm:text-sm text-primary flex items-center gap-2">
              <Award className="h-4 w-4 text-secondary shrink-0" />
              {t('dashboard.top10Teachers')}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-4 pb-3">
            <div className="space-y-2">
              {top5.map((tp, i) => (
                <div key={tp.id} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-bold text-secondary w-4 shrink-0">{i + 1}</span>
                    <span className="text-xs sm:text-sm truncate">{tp.name}</span>
                  </div>
                  <Badge className={`${perfColors[tp.category]} text-xs shrink-0`}>{tp.score}%</Badge>
                </div>
              ))}
              {top5.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">{t('common.noData')}</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-3 px-3 sm:px-4">
            <CardTitle className="text-xs sm:text-sm text-primary flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
              {t('dashboard.bottom10Teachers')}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-4 pb-3">
            <div className="space-y-2">
              {bottom5.map((tp, i) => (
                <div key={tp.id} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-bold text-red-400 w-4 shrink-0">{i + 1}</span>
                    <span className="text-xs sm:text-sm truncate">{tp.name}</span>
                  </div>
                  <Badge className={`${perfColors[tp.category]} text-xs shrink-0`}>{tp.score}%</Badge>
                </div>
              ))}
              {bottom5.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">{t('common.noData')}</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Most Complained + Recent Activity */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <Card>
          <CardHeader className="pb-2 pt-3 px-3 sm:px-4">
            <CardTitle className="text-xs sm:text-sm text-primary">{t('dashboard.mostComplained')}</CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-4 pb-3">
            {mostComplainedTeacher ? (
              <div className="flex items-center gap-3 p-3 bg-orange-50 rounded-lg border border-orange-100">
                <div className="w-9 h-9 bg-orange-500 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0">
                  {mostComplainedTeacher.fullName.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{mostComplainedTeacher.fullName}</p>
                  <p className="text-xs text-muted-foreground">
                    {complaintCountMap[mostComplainedTeacher.id]} {t('complaint.title')}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">{t('common.noData')}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-3 px-3 sm:px-4">
            <CardTitle className="text-xs sm:text-sm text-primary">{t('dashboard.recentActivity')}</CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-4 pb-3">
            <div className="space-y-2">
              {logs.slice(0, 5).map((log) => (
                <div key={log.id} className="flex items-start gap-2 text-xs">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                  <div className="min-w-0">
                    <span className="font-medium">{log.userName}</span>
                    <span className="text-muted-foreground"> — {log.action}: </span>
                    <span className="truncate">{log.target}</span>
                  </div>
                </div>
              ))}
              {logs.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">{t('activityLog.noLogs')}</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-3 flex items-center gap-2">
        <span className={`${color} shrink-0`}>{icon}</span>
        <div className="min-w-0">
          <p className={`text-base sm:text-lg font-bold leading-tight ${color}`}>{value}</p>
          <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight line-clamp-2">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-3 text-center">
        <p className={`text-xl sm:text-2xl font-bold ${color}`}>{value}</p>
        <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 line-clamp-2">{label}</p>
      </CardContent>
    </Card>
  );
}


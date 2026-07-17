import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { useOperationsScore } from '../utils/useOperationsScore';
import { useAcademyHealth } from '@/features/scheduling/hooks/useAcademyHealth';
import { useStudents } from '@/features/scheduling/hooks/useStudents';
import { useLessonParticipants } from '@/features/scheduling/hooks/useLessons';
import { computeTomorrowRisks } from '../utils/tomorrowRisk';
import { detectUnassignedStudents } from '../intelligenceEngine/unassignedStudentDetector';
import { detectScheduleConflicts } from '../intelligenceEngine/scheduleConflictDetector';
import { useActiveScheduleConflicts } from '@/features/scheduling/hooks/useScheduleConflicts';
import { DAYS_OF_WEEK } from '@/features/scheduling/constants/schedulingConstants';
import { SmartRecommendationSection } from './SmartRecommendationSection';
import { TeacherIntelligenceSection } from './TeacherIntelligenceSection';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Calendar, Clock, Percent, AlertTriangle, ClipboardList, UserCheck, ArrowUpRight,
} from 'lucide-react';

function greetingKey(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'dashboard.coach.greetingMorning';
  if (hour < 18) return 'dashboard.coach.greetingAfternoon';
  return 'dashboard.coach.greetingEvening';
}

const HEALTH_STYLE: Record<'stable' | 'needsAttention' | 'highRisk', string> = {
  stable: 'bg-green-50 border-green-200 text-green-700',
  needsAttention: 'bg-amber-50 border-amber-200 text-amber-700',
  highRisk: 'bg-red-50 border-red-200 text-red-700',
};

/** Operations Command Center: today's real operational status first (Action
 * Required, Students Needing Attention, Data Attention), Smart Recommendations
 * last — reuses existing hooks/utils (useOperationsScore, useAcademyHealth,
 * computeTomorrowRisks) with no duplicated scheduling logic. */
export function OperationsCoachSection() {
  const { t } = useTranslation();
  const { currentUser } = useAuthStore();
  const { isLoading, error, health, lessonsToday, missions } = useOperationsScore();
  const { health: academyHealth, allLessons, isLoading: academyLoading } = useAcademyHealth();
  const { data: students = [] } = useStudents();
  const { data: allParticipants = [] } = useLessonParticipants();
  const { data: activeConflicts = [] } = useActiveScheduleConflicts();
  const hasAvailabilityData = academyHealth?.overview.hasAvailabilityData ?? true;

  const todayDayOfWeek = new Date().getDay();

  // Real signals reused from already-computed data — no new scheduling logic.
  const teacherNameById = useMemo(
    () => new Map((academyHealth?.teacherRows ?? []).map((r) => [r.teacherId, r.teacherName])),
    [academyHealth]
  );
  const todaysRisks = useMemo(
    () => (academyHealth
      // 'busiestTeacherTomorrow' flags whoever has the most lessons — a workload
      // fact, not an operational risk (a full schedule is not a problem by itself).
      // 'groupLessons' flags a lesson that HASN'T been cancelled — potential exposure
      // if it were, not a current incident — so it doesn't belong in the urgent count either.
      // Only real current-incident signals (e.g. low preservation) surface here.
      ? computeTomorrowRisks(allLessons, teacherNameById, todayDayOfWeek).filter((r) => r.id !== 'busiestTeacherTomorrow' && r.id !== 'groupLessons')
      : []),
    [academyHealth, allLessons, teacherNameById, todayDayOfWeek]
  );
  const lessonsAtRiskCount = todaysRisks.reduce((s, r) => s + r.count, 0);

  const activeTeachersToday = academyHealth?.teacherRows.filter((r) => r.todayLessons > 0).length ?? 0;

  const studentIdsWithLessons = useMemo(() => new Set(allParticipants.map((p) => p.studentId)), [allParticipants]);
  // Intelligence Candidate Engine V1 (Part 2, Detector A+B): tiers unassigned active
  // students by real enrollment recency instead of flagging all of them Critical —
  // see unassignedStudentDetector.ts for why lesson-based urgency tiers don't apply
  // to this schema. 'urgent' (newly enrolled, still time-sensitive) surfaces in
  // Action Required; 'backlog' (older, still real but not time-critical) surfaces
  // in Students Needing Attention only, so nothing is silently dropped.
  const unassignedCandidates = useMemo(
    () => detectUnassignedStudents(students, studentIdsWithLessons),
    [students, studentIdsWithLessons]
  );
  const urgentUnassigned = useMemo(() => unassignedCandidates.filter((c) => c.priority === 'high'), [unassignedCandidates]);
  const backlogUnassigned = useMemo(() => unassignedCandidates.filter((c) => c.priority === 'medium'), [unassignedCandidates]);

  // Task A / Detector C: real active double-bookings from get_active_schedule_conflicts()
  // (migration 016) — every conflict is a genuine current incident (an overlap already
  // exists in the data), not hypothetical exposure, so all of them count toward the urgent bucket.
  const studentNameById = useMemo(() => new Map(students.map((s) => [s.id, s.fullName])), [students]);
  const conflictCandidates = useMemo(
    () => detectScheduleConflicts(activeConflicts, teacherNameById, studentNameById),
    [activeConflicts, teacherNameById, studentNameById]
  );

  const teachersWithoutAvailability = academyHealth?.teacherRows.filter((r) => r.availableHours === 0).length ?? 0;

  const urgentActions = missions.filter((m) => !m.comingSoon && (m.titleCount ?? 0) > 0);
  const pendingActionsCount = urgentActions.length;

  const dataReady = !isLoading && !academyLoading;
  const totalIssues = urgentActions.length + lessonsAtRiskCount + urgentUnassigned.length + conflictCandidates.length;
  const healthLevel: 'stable' | 'needsAttention' | 'highRisk' = totalIssues === 0 ? 'stable' : totalIssues <= 5 ? 'needsAttention' : 'highRisk';

  if (error) {
    const message = error instanceof Error ? error.message : (error as { message?: string })?.message ?? 'Failed to load.';
    return <p className="text-sm text-red-600">{message}</p>;
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold text-primary">
        {t(greetingKey(), { name: currentUser?.name ?? '' })}
      </h2>

      {/* Section 2 — Operations Health Status */}
      {dataReady && (
        <div className={`rounded-lg border p-3 flex items-center gap-3 ${HEALTH_STYLE[healthLevel]}`}>
          <Badge className={`${HEALTH_STYLE[healthLevel]} border-0 font-semibold shrink-0`}>{t(`dashboard.health.${healthLevel}`)}</Badge>
          <p className="text-sm">
            {healthLevel === 'stable'
              ? t('dashboard.health.summaryStable')
              : t(`dashboard.health.${healthLevel === 'needsAttention' ? 'summaryNeedsAttention' : 'summaryHighRisk'}`, { count: totalIssues })}
          </p>
        </div>
      )}

      {/* Section 1 — Today's Operational Status */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
        <LiveStatTile to="/schedule" icon={<Calendar className="h-4 w-4" />} label={t('dashboard.coach.lessonsToday')} value={isLoading ? '…' : lessonsToday} color="text-primary" />
        <LiveStatTile to="/teachers" icon={<UserCheck className="h-4 w-4" />} label={t('dashboard.coach.activeTeachersToday')} value={academyLoading ? '…' : activeTeachersToday} color="text-green-600" />
        <LiveStatTile to="/schedule" icon={<AlertTriangle className="h-4 w-4" />} label={t('dashboard.coach.lessonsAtRisk')} value={academyLoading ? '…' : lessonsAtRiskCount} color={lessonsAtRiskCount > 0 ? 'text-red-600' : 'text-green-600'} />
        <LiveStatTile
          to="/schedule"
          icon={<Percent className="h-4 w-4" />}
          label={t('dashboard.coach.availableSlots')}
          value={isLoading ? '…' : (!hasAvailabilityData ? t('common.notAvailable') : health?.totalAvailableBookableSlots ?? 0)}
          color="text-blue-600"
        />
        <LiveStatTile
          to="/schedule"
          icon={<Clock className="h-4 w-4" />}
          label={t('dashboard.coach.primeTimeOccupancy')}
          value={isLoading ? '…' : (!hasAvailabilityData ? t('common.notAvailable') : `${health?.primeTimeOccupancyPct ?? 0}%`)}
          color="text-amber-600"
        />
        <LiveStatTile to="/action-center" icon={<ClipboardList className="h-4 w-4" />} label={t('dashboard.coach.pendingActions')} value={isLoading ? '…' : pendingActionsCount} color="text-purple-600" />
      </div>

      {/* Section 3 — Action Required */}
      {dataReady && (
        <div className="space-y-2">
          <h3 className="text-base font-bold text-primary">{t('dashboard.actionRequired.title')}</h3>
          {urgentActions.length === 0 && todaysRisks.length === 0 && urgentUnassigned.length === 0 && conflictCandidates.length === 0 ? (
            <Card><CardContent className="p-4 text-sm text-muted-foreground">{t('dashboard.actionRequired.empty')}</CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {conflictCandidates.map((c) => (
                <Card key={c.id}>
                  <CardContent className="p-4 space-y-2">
                    <Badge className={`text-xs font-medium ${c.priority === 'critical' ? 'bg-red-100 text-red-700' : c.priority === 'high' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                      {c.priority === 'critical' ? t('dashboard.mission.priority.critical') : t(`risk.${c.priority}`)}
                    </Badge>
                    <p className="text-sm font-semibold">{t(c.reasonCode, c.reasonParams)}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.dayOfWeek !== undefined && `${t(DAYS_OF_WEEK.find((d) => d.value === c.dayOfWeek)!.labelKey)} — `}
                      {t(c.evidenceCode, c.evidenceParams)}
                    </p>
                    <Link to={c.actionTo} className="text-xs text-primary font-medium hover:underline inline-flex items-center gap-1">
                      <ArrowUpRight className="h-3 w-3" />{t(c.actionCode)}
                    </Link>
                  </CardContent>
                </Card>
              ))}
              {urgentUnassigned.length > 0 && (
                <Card>
                  <CardContent className="p-4 space-y-2">
                    <Badge className="bg-red-100 text-red-700 text-xs font-medium">{t('dashboard.mission.priority.critical')}</Badge>
                    <p className="text-sm font-semibold">{t('dashboard.actionRequired.unassignedStudents', { count: urgentUnassigned.length })}</p>
                    <Link to="/students?issue=unassigned-teacher" className="text-xs text-primary font-medium hover:underline inline-flex items-center gap-1">
                      <ArrowUpRight className="h-3 w-3" />{t('dashboard.actionRequired.openStudents')}
                    </Link>
                  </CardContent>
                </Card>
              )}
              {todaysRisks.map((risk) => (
                <Card key={risk.id}>
                  <CardContent className="p-4 space-y-2">
                    <Badge className={`text-xs font-medium ${risk.level === 'high' ? 'bg-red-100 text-red-700' : risk.level === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                      {t(`dashboard.risk.level.${risk.level}`)}
                    </Badge>
                    <p className="text-sm font-semibold">{t(risk.labelKey, { count: risk.count, teacher: risk.teacherName })}</p>
                    <Link to="/schedule" className="text-xs text-primary font-medium hover:underline inline-flex items-center gap-1">
                      <ArrowUpRight className="h-3 w-3" />{t('dashboard.recommendation.viewSchedule')}
                    </Link>
                  </CardContent>
                </Card>
              ))}
              {urgentActions.map((task) => (
                <Card key={task.id}>
                  <CardContent className="p-4 space-y-2">
                    <Badge className="bg-orange-100 text-orange-700 text-xs font-medium">{t(`dashboard.mission.priority.${task.priority}`)}</Badge>
                    <p className="text-sm font-semibold">{t(task.titleKey, { count: task.titleCount ?? 0 })}</p>
                    <Link to={task.ctaTo} className="text-xs text-primary font-medium hover:underline inline-flex items-center gap-1">
                      <ArrowUpRight className="h-3 w-3" />{t(task.ctaLabelKey)}
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Section 6 — Students Needing Attention (backlog tier: real issue, not time-critical) */}
      {dataReady && backlogUnassigned.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-base font-bold text-primary">{t('dashboard.studentsAttention.title')}</h3>
          <Card>
            <CardContent className="p-3 divide-y">
              {backlogUnassigned.slice(0, 5).map((c) => (
                <div key={c.id} className="flex items-center justify-between py-2 first:pt-0 last:pb-0 gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Badge className="bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0">{t(`risk.${c.priority}`)}</Badge>
                      <p className="text-sm font-medium truncate">{c.label}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t(c.reasonCode)} · {t(c.evidenceCode, c.evidenceParams)}
                    </p>
                  </div>
                  <Link to={c.actionTo} className="text-xs text-primary font-medium hover:underline shrink-0">{t(c.actionCode)}</Link>
                </div>
              ))}
              {backlogUnassigned.length > 5 && (
                <div className="pt-2">
                  <Link to="/students?issue=unassigned-teacher" className="text-xs text-primary font-medium hover:underline">{t('dashboard.studentsAttention.viewAll')}</Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Section 7 — Data Attention */}
      {dataReady && teachersWithoutAvailability > 0 && (
        <div className="space-y-2">
          <h3 className="text-base font-bold text-primary">{t('dashboard.dataAttention.title')}</h3>
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="p-4 text-sm text-amber-800">
              {t('dashboard.dataAttention.teachersNoAvailability', { count: teachersWithoutAvailability })}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Part 5 — Teacher Intelligence (analytics; ranks below real operational problems) */}
      <TeacherIntelligenceSection />

      {/* Section 4 — Smart Recommendations (never above real operational problems) */}
      <SmartRecommendationSection />
    </div>
  );
}

function LiveStatTile({ icon, label, value, subLabel, color, to }: {
  icon: React.ReactNode; label: string; value: string | number; subLabel?: string; color: string; to?: string;
}) {
  const content = (
    <CardContent className="p-3 flex items-center gap-2">
      <span className={`${color} shrink-0`}>{icon}</span>
      <div className="min-w-0">
        <p className={`text-lg font-bold leading-tight ${color}`}>{value}</p>
        <p className="text-[10px] text-muted-foreground leading-tight line-clamp-2">
          {label}{subLabel ? ` · ${subLabel}` : ''}
        </p>
      </div>
    </CardContent>
  );
  if (!to) return <Card className="overflow-hidden">{content}</Card>;
  return (
    <Card className="overflow-hidden">
      <Link to={to} className="block hover:bg-accent/50 transition-colors">{content}</Link>
    </Card>
  );
}

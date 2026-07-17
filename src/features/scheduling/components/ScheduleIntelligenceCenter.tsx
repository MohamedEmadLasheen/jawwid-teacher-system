import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAcademyHealth } from '../hooks/useAcademyHealth';
import { useScheduleHealth } from '../hooks/useScheduleHealth';
import { useScheduleUiStore } from '@/store/scheduleUiStore';
import { SmartRecommendationSection } from '@/features/dashboard/components/SmartRecommendationSection';
import { TeacherIntelligenceTable } from './TeacherIntelligenceTable';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DAYS_OF_WEEK } from '../constants/schedulingConstants';
import type { DayOfWeek } from '@/lib/types';

const RATING_COLOR: Record<string, string> = {
  excellent: 'text-green-600',
  good: 'text-blue-600',
  needs_attention: 'text-amber-600',
  critical: 'text-red-600',
};

function MetricCard({ label, value, onClick, color, available = true }: { label: string; value: string | number; onClick?: () => void; color?: string; available?: boolean }) {
  const displayValue = available ? value : 'N/A';
  return (
    <Card className={onClick && available ? 'cursor-pointer hover:border-primary transition-colors' : undefined} onClick={available ? onClick : undefined}>
      <CardContent className="p-4">
        <p className={`text-lg font-bold truncate ${available ? color ?? '' : 'text-muted-foreground'}`} title={available ? String(value) : 'Availability data incomplete'}>{displayValue}</p>
        <p className="text-xs text-muted-foreground mt-1">{label}</p>
      </CardContent>
    </Card>
  );
}

export function ScheduleIntelligenceCenter() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setFilter, setSelectedDay, resetFilters } = useScheduleUiStore();
  const { isLoading, health, scoreResult } = useAcademyHealth();
  const { data: legacyHealth } = useScheduleHealth();

  const goToSchedule = () => navigate('/schedule');
  const drillDown = (fn: () => void) => { resetFilters(); fn(); goToSchedule(); };

  if (isLoading || !health || !scoreResult) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i}><CardContent className="p-4 h-20 animate-pulse bg-gray-50" /></Card>
        ))}
      </div>
    );
  }

  const dayLabel = (v: string) => t(DAYS_OF_WEEK.find((d) => String(d.value) === v)?.labelKey ?? '');

  const hasAvail = health.overview.hasAvailabilityData;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-primary">{t('scheduling.intel.title')}</h2>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">{t('scheduling.intel.tab.overview')}</TabsTrigger>
          <TabsTrigger value="teachers">{t('scheduling.intel.tab.teachers')}</TabsTrigger>
          <TabsTrigger value="recommendations">{t('scheduling.intel.tab.recommendations')}</TabsTrigger>
        </TabsList>

        {/* Overview: core operational metrics + Prime Time + Preservation, merged */}
        <TabsContent value="overview" className="space-y-3 pt-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label={t('scheduling.intel.overview.occupancyRate')} value={`${health.overview.teacherOccupancyRate}%`} onClick={() => drillDown(() => {})} available={hasAvail} />
            <MetricCard label={t('scheduling.intel.overview.primeTimeOccupancy')} value={`${health.overview.primeTimeOccupancyPct}%`} onClick={() => drillDown(() => setFilter('primeTimeOnly', true))} available={hasAvail} />
            <MetricCard label={t('scheduling.intel.overview.emptyHours')} value={`${health.overview.totalEmptyHours}h`} onClick={() => drillDown(() => setFilter('availableOnly', true))} available={hasAvail} />
            <MetricCard label={t('scheduling.intel.overview.availableSlots')} value={health.overview.availableBookableSlots} onClick={() => drillDown(() => setFilter('availableOnly', true))} available={hasAvail} />
            <MetricCard label={t('scheduling.intel.overview.lessonsToday')} value={health.overview.lessonsToday} onClick={() => drillDown(() => setSelectedDay(new Date().getDay() as DayOfWeek))} />
            <MetricCard label={t('scheduling.intel.overview.lessonsWeek')} value={health.overview.lessonsWeekly} />
            <MetricCard label={t('scheduling.intel.overview.activeStudents')} value={health.overview.activeStudents} />
            <MetricCard label={t('scheduling.intel.overview.activeTeachers')} value={health.overview.activeTeachers} />
            <MetricCard label={t('scheduling.intel.overview.weeklyCapacity')} value={`${health.overview.weeklyCapacityHours}h`} available={hasAvail} />
            <MetricCard label={t('scheduling.intel.capacity.weeklySellable')} value={`${health.capacity.weeklySellableCapacityHours}h`} available={hasAvail} />
            <MetricCard label={t('scheduling.intel.preservation.avgPct')} value={`${health.preservation.avgPct}%`} />
            <MetricCard label={t('scheduling.intel.preservation.studentsChangedTeacher')} value={health.preservation.studentsChangedTeacher} />
          </div>

          <h3 className="text-sm font-semibold text-muted-foreground pt-2">{t('scheduling.intel.distribution.title')}</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <MetricCard label={t('scheduling.intel.distribution.overloaded')} value={health.distribution.overloaded} color="text-red-600" available={hasAvail} />
            <MetricCard label={t('scheduling.intel.distribution.balanced')} value={health.distribution.balanced} color="text-green-600" available={hasAvail} />
            <MetricCard label={t('scheduling.intel.distribution.underutilized')} value={health.distribution.underutilized} color="text-blue-600" available={hasAvail} />
          </div>

          <h3 className="text-sm font-semibold text-muted-foreground pt-2">{t('scheduling.intel.primeTime.title')}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label={t('scheduling.intel.primeTime.busiestDay')} value={health.primeTime.busiestDay ? dayLabel(health.primeTime.busiestDay) : '—'} />
            <MetricCard label={t('scheduling.intel.primeTime.quietestDay')} value={health.primeTime.quietestDay ? dayLabel(health.primeTime.quietestDay) : '—'} />
            <MetricCard label={t('scheduling.intel.primeTime.bestOpportunity')} value={health.primeTime.bestOpportunityHour ?? '—'} color="text-green-600" available={hasAvail} />
          </div>
        </TabsContent>

        {/* Teacher Workload Analytics */}
        <TabsContent value="teachers" className="pt-3">
          <TeacherIntelligenceTable rows={health.teacherRows} />
        </TabsContent>

        {/* Smart Recommendations (reuses Phase 6 engine) */}
        <TabsContent value="recommendations" className="pt-3">
          <SmartRecommendationSection health={legacyHealth} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

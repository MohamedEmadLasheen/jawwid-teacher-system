import { useTranslation } from 'react-i18next';
import { useScheduleHealth } from '../hooks/useScheduleHealth';
import { Card, CardContent } from '@/components/ui/card';

export function ScheduleHealthPanel() {
  const { t } = useTranslation();
  const { data, isLoading } = useScheduleHealth();

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}><CardContent className="p-4 h-20 animate-pulse bg-gray-50" /></Card>
        ))}
      </div>
    );
  }

  // No teacher has any recorded availability at all yet (the legacy import
  // never captured working hours) — every occupancy/capacity metric below
  // is genuinely uncomputable right now, not a real zero. Show that
  // honestly instead of a misleading "0%"/"0h"/"0".
  const noAvailabilityData = data.mostOccupiedTeacher === null;
  const noData = t('scheduling.health.noData');

  const metrics = [
    { label: t('scheduling.health.occupancyRate'), value: noAvailabilityData ? noData : `${data.teacherOccupancyRate}%`, color: noAvailabilityData ? 'text-muted-foreground' : 'text-blue-600' },
    { label: t('scheduling.health.emptyHours'), value: noAvailabilityData ? noData : `${data.totalEmptyHours}h`, color: noAvailabilityData ? 'text-muted-foreground' : 'text-gray-700' },
    { label: t('scheduling.health.unusedPrimeTime'), value: noAvailabilityData ? noData : `${data.unusedPrimeTimeHours}h`, color: noAvailabilityData ? 'text-muted-foreground' : 'text-amber-600' },
    { label: t('scheduling.health.mostOccupied'), value: data.mostOccupiedTeacher ? `${data.mostOccupiedTeacher.fullName} (${data.mostOccupiedTeacher.occupancyPct}%)` : noData, color: data.mostOccupiedTeacher ? 'text-green-600' : 'text-muted-foreground' },
    { label: t('scheduling.health.leastUtilized'), value: data.leastUtilizedTeacher ? `${data.leastUtilizedTeacher.fullName} (${data.leastUtilizedTeacher.occupancyPct}%)` : noData, color: data.leastUtilizedTeacher ? 'text-red-600' : 'text-muted-foreground' },
    { label: t('scheduling.health.availableSlots'), value: noAvailabilityData ? noData : data.totalAvailableBookableSlots, color: noAvailabilityData ? 'text-muted-foreground' : 'text-primary' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {metrics.map((m) => (
        <Card key={m.label}>
          <CardContent className="p-4">
            <p className={`text-lg font-bold truncate ${m.color}`} title={String(m.value)}>{m.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{m.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

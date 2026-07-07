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

  const metrics = [
    { label: t('scheduling.health.occupancyRate'), value: `${data.teacherOccupancyRate}%`, color: 'text-blue-600' },
    { label: t('scheduling.health.emptyHours'), value: `${data.totalEmptyHours}h`, color: 'text-gray-700' },
    { label: t('scheduling.health.unusedPrimeTime'), value: `${data.unusedPrimeTimeHours}h`, color: 'text-amber-600' },
    { label: t('scheduling.health.mostOccupied'), value: data.mostOccupiedTeacher ? `${data.mostOccupiedTeacher.fullName} (${data.mostOccupiedTeacher.occupancyPct}%)` : '—', color: 'text-green-600' },
    { label: t('scheduling.health.leastUtilized'), value: data.leastUtilizedTeacher ? `${data.leastUtilizedTeacher.fullName} (${data.leastUtilizedTeacher.occupancyPct}%)` : '—', color: 'text-red-600' },
    { label: t('scheduling.health.availableSlots'), value: data.totalAvailableBookableSlots, color: 'text-primary' },
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

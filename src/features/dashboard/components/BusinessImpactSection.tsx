import { useTranslation } from 'react-i18next';
import { useAcademyHealth } from '@/features/scheduling/hooks/useAcademyHealth';
import { useSmartRecommendation } from '../utils/useSmartRecommendation';
import { Card, CardContent } from '@/components/ui/card';

function ImpactTile({ value, label, color }: { value: string | number; label: string; color: string }) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-3 text-center">
        <p className={`text-lg font-bold ${color}`}>{value}</p>
        <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 line-clamp-2">{label}</p>
      </CardContent>
    </Card>
  );
}

/** Real, already-computed figures (useAcademyHealth's preservation/primeTime aggregates,
 * plus the sum of the recommendation engine's own per-candidate score gains) — no new
 * calculation, just surfacing what's already there in one compact row. */
export function BusinessImpactSection() {
  const { t } = useTranslation();
  const { isLoading, health } = useAcademyHealth();
  const { recommendations } = useSmartRecommendation();

  if (isLoading || !health) return null;

  const potentialScoreGain = recommendations.reduce((s, r) => s + r.operationsScoreGain, 0);

  return (
    <div className="space-y-2">
      <h2 className="text-base font-bold text-primary">{t('dashboard.impact.title')}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {potentialScoreGain > 0 && (
          <ImpactTile value={`+${potentialScoreGain}`} label={t('dashboard.impact.potentialScoreGain')} color="text-green-600" />
        )}
        <ImpactTile value={`${health.primeTime.usedHours}h`} label={t('dashboard.impact.primeTimeBooked')} color="text-amber-600" />
        <ImpactTile value={`${health.preservation.avgPct}%`} label={t('dashboard.impact.preservationAvg')} color="text-blue-600" />
        <ImpactTile value={health.preservation.studentsChangedTeacher} label={t('dashboard.impact.studentsChangedTeacher')} color="text-purple-600" />
      </div>
    </div>
  );
}

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAcademyHealth } from '@/features/scheduling/hooks/useAcademyHealth';
import { computeTomorrowRisks, type RiskLevel } from '../utils/tomorrowRisk';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const LEVEL_STYLE: Record<RiskLevel, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-blue-100 text-blue-700',
};

export function TomorrowRiskSection() {
  const { t } = useTranslation();
  const { isLoading, health, allLessons } = useAcademyHealth();

  const risks = useMemo(() => {
    if (!health) return [];
    const teacherNameById = new Map(health.teacherRows.map((r) => [r.teacherId, r.teacherName]));
    const tomorrowDayOfWeek = (new Date().getDay() + 1) % 7;
    return computeTomorrowRisks(allLessons, teacherNameById, tomorrowDayOfWeek);
  }, [health, allLessons]);

  if (isLoading) return null;
  if (risks.length === 0) return null;

  return (
    <div className="space-y-2">
      <h2 className="text-base font-bold text-primary">{t('dashboard.risk.title')}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {risks.map((r) => (
          <Card key={r.id}>
            <CardContent className="p-4 space-y-1.5">
              <Badge className={`${LEVEL_STYLE[r.level]} text-xs font-medium`}>{t(`dashboard.risk.level.${r.level}`)}</Badge>
              <p className="text-sm font-semibold">
                {t(r.labelKey, { count: r.count, teacher: r.teacherName })}
              </p>
              <Link to="/schedule" className="text-xs text-primary font-medium hover:underline">
                {t('dashboard.recommendation.viewSchedule')}
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

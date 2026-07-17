import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { MissionTask, MissionPriority } from '../utils/todaysMissions';

const PRIORITY_STYLE: Record<MissionPriority, { emoji: string; badgeClass: string; labelKey: string }> = {
  critical: { emoji: '🔴', badgeClass: 'bg-red-100 text-red-700', labelKey: 'dashboard.mission.priority.critical' },
  important: { emoji: '🟠', badgeClass: 'bg-orange-100 text-orange-700', labelKey: 'dashboard.mission.priority.important' },
  recommended: { emoji: '🟡', badgeClass: 'bg-yellow-100 text-yellow-700', labelKey: 'dashboard.mission.priority.recommended' },
  opportunity: { emoji: '🟢', badgeClass: 'bg-green-100 text-green-700', labelKey: 'dashboard.mission.priority.opportunity' },
};

interface TodaysMissionSectionProps {
  missions: MissionTask[];
  isLoading: boolean;
}

export function TodaysMissionSection({ missions, isLoading }: TodaysMissionSectionProps) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="space-y-2">
        <h2 className="text-base font-bold text-primary">{t('dashboard.mission.title')}</h2>
        <p className="text-sm text-muted-foreground">…</p>
      </div>
    );
  }

  const actionable = missions.filter((m) => !m.comingSoon);
  const comingSoon = missions.filter((m) => m.comingSoon);

  return (
    <div className="space-y-2">
      <h2 className="text-base font-bold text-primary">{t('dashboard.mission.title')}</h2>

      {actionable.length === 0 && comingSoon.every((m) => (m.titleCount ?? 0) === 0) ? (
        <Card><CardContent className="p-4 text-sm text-muted-foreground">{t('dashboard.mission.allClear')}</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-3">
          {actionable.map((task) => <MissionCard key={task.id} task={task} />)}
        </div>
      )}
    </div>
  );
}

function MissionCard({ task }: { task: MissionTask }) {
  const { t } = useTranslation();
  const style = PRIORITY_STYLE[task.priority];

  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Badge className={`${style.badgeClass} text-xs font-medium`}>
            {style.emoji} {t(style.labelKey)}
          </Badge>
          {task.isRevenueOpportunity && (
            <span className="text-[10px] text-muted-foreground">{t('dashboard.mission.revenueOpportunity')}</span>
          )}
        </div>

        <p className="text-sm font-semibold">{t(task.titleKey, { count: task.titleCount ?? 0 })}</p>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="text-green-600 font-medium">+{task.scoreGain} {t('dashboard.mission.scorePoints')}</span>
          {task.estimatedMinutes !== null && (
            <span>{t('dashboard.mission.estimatedTime', { minutes: Math.round(task.estimatedMinutes) })}</span>
          )}
        </div>

        <Button asChild size="sm" variant="outline" className="mt-1">
          <Link to={task.ctaTo}>{t(task.ctaLabelKey)}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

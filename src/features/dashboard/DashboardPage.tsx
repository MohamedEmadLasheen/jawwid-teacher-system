import { useTranslation } from 'react-i18next';
import { OperationsCoachSection } from './components/OperationsCoachSection';

/** Simplified per operations feedback: focuses only on today's core
 * operational tiles, Urgent Actions, and the Smart Recommended Action.
 * Quality Metrics/Risk/Performance/Level charts and Top/Bottom Teachers
 * are not removed from the app — they remain reachable via Teachers and
 * Action Center, just no longer duplicated here. */
export function DashboardPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-4 sm:space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold text-primary">{t('dashboard.title')}</h1>
      <OperationsCoachSection />
    </div>
  );
}

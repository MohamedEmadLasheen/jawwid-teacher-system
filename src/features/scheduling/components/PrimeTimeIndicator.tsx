import { useTranslation } from 'react-i18next';
import { Clock } from 'lucide-react';

export function PrimeTimeIndicator() {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
      <Clock className="h-3 w-3" />
      {t('scheduling.primeTime')}: 1:00 PM – 6:00 PM
    </span>
  );
}

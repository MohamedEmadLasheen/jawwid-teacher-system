import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DAYS_OF_WEEK } from '../constants/schedulingConstants';
import type { SearchableSelectOption } from '@/components/ui/searchable-select';

/**
 * The seven weekdays as selector options, translated.
 *
 * A FIXED list of seven — over the five-option line, so every weekday
 * selector is searchable. It carries no `searchable` flag because searchable
 * is the default; only a fixed list of five or fewer opts out.
 *
 * It lives here because four screens need the identical list (lesson edit,
 * the internal lessons form, and both availability editors) and the mapping
 * from DAYS_OF_WEEK to {value,label} is exactly the kind of three-line
 * duplication that drifts apart one screen at a time.
 */
export function useDayOptions(): SearchableSelectOption[] {
  const { t } = useTranslation();
  return useMemo(
    () => DAYS_OF_WEEK.map((d) => ({ value: String(d.value), label: t(d.labelKey) })),
    [t]
  );
}

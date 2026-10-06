import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DAYS_OF_WEEK } from '../constants/schedulingConstants';
import type { SearchableSelectOption } from '@/components/ui/searchable-select';

/**
 * The seven weekdays as selector options, translated.
 *
 * A FIXED list, so it carries no `searchable` flag — SEARCH_THRESHOLD decides,
 * and seven is over the line, so every weekday selector gets a search field.
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

import type { DayOfWeek } from '@/lib/types';

/** The next calendar date (YYYY-MM-DD) matching dayOfWeek (0=Sunday), including today if it matches. */
export function nextDateForDayOfWeek(dayOfWeek: DayOfWeek, from: Date = new Date()): string {
  const result = new Date(from);
  const currentDay = result.getDay();
  const diff = (dayOfWeek - currentDay + 7) % 7;
  result.setDate(result.getDate() + diff);
  return result.toISOString().slice(0, 10);
}

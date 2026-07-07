import { PRIME_TIME_START_MINUTE, PRIME_TIME_END_MINUTE } from '../constants/schedulingConstants';

/** Whether a lesson/slot overlaps Prime Time (1-6PM Asia/Dubai). */
export function overlapsPrimeTime(startMinute: number, durationMinutes: number): boolean {
  const endMinute = startMinute + durationMinutes;
  return startMinute < PRIME_TIME_END_MINUTE && endMinute > PRIME_TIME_START_MINUTE;
}

export function isColumnInPrimeTime(columnStartMinute: number): boolean {
  return columnStartMinute >= PRIME_TIME_START_MINUTE && columnStartMinute < PRIME_TIME_END_MINUTE;
}

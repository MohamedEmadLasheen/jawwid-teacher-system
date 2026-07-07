/** Converts minutes-since-midnight (0-1439) to an "HH:MM" 24h label. */
export function minuteToLabel(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Parses an "HH:MM" (24h) input into minutes-since-midnight. */
export function labelToMinute(label: string): number {
  const [h, m] = label.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Two formatters, deliberately kept apart:
 *
 *   minuteToLabel        24-hour "HH:MM" — the MACHINE format. `<input
 *                        type="time">` only accepts this, and labelToMinute
 *                        only parses this, so every form round-trip must
 *                        keep using it.
 *   minuteToDisplayLabel 12-hour "h:MM AM/PM" — the READING format, for
 *                        surfaces an admin scans (timeline header, lesson
 *                        cards, shift-window labels).
 *
 * Switching minuteToLabel itself to 12-hour would silently break every
 * `<input type="time">` bound to it: the browser rejects a non-"HH:MM"
 * value, the field renders blank, and labelToMinute can no longer parse what
 * comes back.
 */

/** Converts minutes-since-midnight (0-1439) to an "HH:MM" 24h label. */
export function minuteToLabel(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Converts minutes-since-midnight to a 12-hour label, e.g. 690 → "11:30 AM",
 * 720 → "12:00 PM", 750 → "12:30 PM", 780 → "1:00 PM", 1200 → "8:00 PM".
 *
 * Noon and midnight are the cases worth stating: hour 12 stays 12 (PM), and
 * hour 0 becomes 12 (AM) — a naive `h % 12` turns both into "0".
 *
 * Hours are not zero-padded ("1:00 PM", not "01:00 PM") because that is how
 * the times read in the request, and padding adds visual noise to a header
 * that is already dense. Minutes always are.
 */
export function minuteToDisplayLabel(minute: number): string {
  const h24 = Math.floor(minute / 60) % 24;
  const m = minute % 60;
  const period = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

/** Parses an "HH:MM" (24h) input into minutes-since-midnight. */
export function labelToMinute(label: string): number {
  const [h, m] = label.split(':').map(Number);
  return h * 60 + m;
}

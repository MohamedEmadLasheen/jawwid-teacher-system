/**
 * THE LESSON DURATION CONTRACT — one place, for every screen that sets one.
 *
 * Duration was offered as a fixed dropdown of 30/60/90/120 in four separate
 * components, each with its own copy of the list. The academy's lessons are
 * not shaped like that: 40, 45 and 50 minutes are ordinary. The dropdown was
 * the ONLY thing imposing those four values — the column has always been
 *
 *     duration_minutes SMALLINT NOT NULL DEFAULT 30 CHECK (duration_minutes > 0)
 *
 * (migration 008), and the scheduling engine has always computed from the
 * stored integer rather than from a slot count: a 40-minute lesson is already
 * drawn exactly 40/30 of a column wide and ends exactly at :40. So this module
 * adds no capability to the system; it removes an artificial restriction, and
 * states the validation the dropdown used to provide implicitly.
 *
 * Pure — imports one constant and no React, no i18n, no Supabase — so the
 * existing esbuild+node runner can assert on it directly.
 */

import { GRID_END_MINUTE } from '../constants/schedulingConstants';

export type LessonDurationError =
  /** Nothing typed. The dropdown could not express this; a text field can. */
  | 'required'
  /** Not a number at all — letters, symbols, a stray minus on its own. */
  | 'not_a_number'
  /** A number, but not whole. Lessons are scheduled in whole minutes. */
  | 'not_integer'
  /** Zero or negative. Mirrors the database's own CHECK (> 0). */
  | 'not_positive'
  /**
   * The lesson would run past the end of the day.
   *
   * NOT an invented business limit — it is the constraint the system already
   * enforces in two places: the database's
   * `CHECK (start_minute + duration_minutes <= 1440)` (migration 008) and the
   * picker's `outside_timeline` rule in lessonTimeOptions.ts. Checking it here
   * turns a save-time rejection into an inline message while the user is
   * still typing.
   */
  | 'past_midnight';

export interface LessonDurationResult {
  ok: boolean;
  /** The parsed value, present only when `ok`. Exactly what was typed. */
  minutes?: number;
  error?: LessonDurationError;
}

/**
 * The largest duration a lesson starting at `startMinute` may have.
 *
 * Derived from the day's end rather than fixed, because the real limit depends
 * on when the lesson starts: at 23:00 a lesson may run 60 minutes, at 23:30
 * only 30. Used for the input's `max` attribute as well as validation, so the
 * browser's own stepper cannot walk past it.
 */
export function maxDurationMinutes(startMinute: number): number {
  return Math.max(0, GRID_END_MINUTE - startMinute);
}

/**
 * Validate what the user typed, and return the exact integer it denotes.
 *
 * Takes the RAW STRING rather than a number, deliberately: `Number('')` is 0
 * and `Number('45.5')` is 45.5, so a caller that coerced first could not tell
 * "empty" from "zero", nor reject a decimal. The field's own text is the only
 * place both distinctions still exist.
 *
 * `startMinute` is optional so a caller that has not yet chosen a start time
 * can still validate the number itself; the midnight rule is simply skipped.
 *
 * NEVER rounds, clamps or substitutes. 45 in, 45 out — or a refusal naming
 * what is wrong. A silent correction here would be the exact failure the
 * dropdown already represented.
 */
export function validateLessonDuration(
  raw: string,
  startMinute?: number
): LessonDurationResult {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: false, error: 'required' };

  // Reject anything that is not a plain decimal number before Number() gets a
  // chance to be generous: it accepts '0x1E', '1e3', Infinity and whitespace.
  if (!/^[+-]?\d*\.?\d+$/.test(trimmed)) return { ok: false, error: 'not_a_number' };

  const value = Number(trimmed);
  if (!Number.isFinite(value)) return { ok: false, error: 'not_a_number' };
  if (!Number.isInteger(value)) return { ok: false, error: 'not_integer' };
  if (value <= 0) return { ok: false, error: 'not_positive' };

  if (startMinute !== undefined && startMinute + value > GRID_END_MINUTE) {
    return { ok: false, error: 'past_midnight' };
  }

  return { ok: true, minutes: value };
}

/** Convenience for call sites that only need the yes/no. */
export function isValidLessonDuration(raw: string, startMinute?: number): boolean {
  return validateLessonDuration(raw, startMinute).ok;
}

import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  maxDurationMinutes, validateLessonDuration, type LessonDurationError,
} from '../utils/lessonDuration';

/**
 * Lesson duration, typed in minutes.
 *
 * Replaces the fixed 30/60/90/120 `<Select>` that four separate components
 * each carried their own copy of. One control instead of four so the four
 * screens cannot drift on what is valid, what the error says, or whether the
 * typed value survives — which is exactly how the old version ended up with
 * the same `DURATIONS` array written out four times.
 *
 * It owns no duration rules. Parsing, the integer requirement and the
 * past-midnight bound all come from utils/lessonDuration.ts; this renders them.
 *
 * The caller keeps the value as the RAW STRING it was typed as, not a number.
 * That is what lets the field distinguish an empty box from a zero, show a
 * half-typed "4" without snapping it to anything, and reject "45.5" instead of
 * quietly storing 45 — and it is why `onChange` hands back both the text and
 * the parsed integer, the latter only once the text is actually valid.
 */

interface Props {
  /** The field's text, exactly as typed. */
  value: string;
  /**
   * `minutes` is defined only when `value` parses to a valid duration, so a
   * caller can keep its committed number untouched while the user is mid-edit.
   */
  onChange: (value: string, minutes: number | undefined) => void;
  /**
   * The lesson's start, used for the max/past-midnight rule. Omit when no
   * start has been chosen yet — the bound is then simply not applied.
   */
  startMinute?: number;
  /** Show the error now. Callers gate this on a save attempt or on blur. */
  showError?: boolean;
  id?: string;
  'data-testid'?: string;
  className?: string;
}

export function LessonDurationInput({
  value, onChange, startMinute, showError = false,
  id = 'lesson-duration', 'data-testid': testId = 'lesson-duration', className,
}: Props) {
  const { t } = useTranslation();

  const result = validateLessonDuration(value, startMinute);
  const invalid = showError && !result.ok;
  const errorId = `${id}-error`;

  const messages: Record<LessonDurationError, string> = {
    required: t('scheduling.durationError.required'),
    not_a_number: t('scheduling.durationError.notANumber'),
    not_integer: t('scheduling.durationError.notInteger'),
    not_positive: t('scheduling.durationError.notPositive'),
    past_midnight: t('scheduling.durationError.pastMidnight'),
  };

  return (
    <div className={className}>
      <Label htmlFor={id}>{t('scheduling.duration')}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          data-testid={testId}
          /* type="number" gives phones the numeric keypad and desktop the
             stepper. inputMode is set too because iOS Safari ignores the
             former for keypad selection in some versions. */
          type="number"
          inputMode="numeric"
          min={1}
          /* Derived from the start time, so the stepper itself cannot walk a
             lesson past midnight. Validation repeats the rule for typed input. */
          max={startMinute !== undefined ? maxDurationMinutes(startMinute) : undefined}
          /* step=1, not 30: stepping must not re-impose the half-hour grid the
             dropdown enforced. */
          step={1}
          value={value}
          onChange={(e) => {
            const next = e.target.value;
            onChange(next, validateLessonDuration(next, startMinute).minutes);
          }}
          placeholder={t('scheduling.durationPlaceholder')}
          aria-invalid={invalid}
          aria-describedby={invalid ? errorId : undefined}
          className={invalid ? 'border-red-500' : undefined}
        />
        {/* The unit, stated rather than implied by the old "60 minutes"
            option labels. Logical spacing only, so it sits after the field
            under either text direction. */}
        <span className="shrink-0 text-sm text-muted-foreground">
          {t('scheduling.durationUnit')}
        </span>
      </div>
      {invalid && result.error && (
        <p id={errorId} data-testid={`${testId}-error`} className="mt-1 text-xs text-red-600">
          {messages[result.error]}
        </p>
      )}
    </div>
  );
}

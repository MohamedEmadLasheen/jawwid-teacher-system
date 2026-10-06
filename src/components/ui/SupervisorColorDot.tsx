import { cn } from '@/lib/utils';

interface SupervisorColorDotProps {
  /**
   * The Admin's canonical colour, read from `supervisors.color_hex`. It is
   * nullable on purpose: a supervisor without a colour draws a neutral
   * outline rather than a misleading filled dot.
   */
  colorHex?: string | null;
  /** `sm` for inline list/option rows, `md` for the legend's larger key. */
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * THE Admin colour swatch. One definition, used by the schedule legend, the
 * student form, the student list, the lesson student picker and the
 * supervisors page.
 *
 * It renders a colour and nothing else — it never decides what the colour is.
 * The value always arrives from `supervisors.color_hex`, which is the single
 * source of truth: a student is coloured by resolving
 * `student.supervisorId → supervisor.colorHex`, never by a colour stored on
 * the student. That is what makes re-assigning a student to a different Admin
 * re-colour them everywhere with no second write.
 *
 * Purely decorative, so it is hidden from assistive technology: every call
 * site already renders the Admin's name as text next to it, and announcing
 * "image" before each name would only add noise.
 */
export function SupervisorColorDot({ colorHex, size = 'sm', className }: SupervisorColorDotProps) {
  return (
    <span
      aria-hidden="true"
      data-testid="supervisor-color-dot"
      data-color={colorHex ?? ''}
      className={cn(
        'inline-block rounded-full shrink-0',
        size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3',
        !colorHex && 'border border-muted-foreground/40',
        className
      )}
      style={colorHex ? { backgroundColor: colorHex } : undefined}
    />
  );
}

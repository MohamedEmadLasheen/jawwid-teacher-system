import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface LegendFilterChipProps {
  /** Whether this chip's value is currently part of the schedule filter state. */
  active: boolean;
  onToggle: () => void;
  /**
   * False renders a plain, non-interactive chip. The legends are also shown
   * on the per-teacher weekly view, which reads DEFAULT_FILTERS rather than
   * the store, so a clickable chip there would be an affordance that does
   * nothing — a worse outcome than a static label.
   */
  interactive: boolean;
  /** Shape and padding — identical in every state, which is what prevents reflow. */
  className?: string;
  /**
   * How the chip looks when it is NOT selected (and when it is not
   * interactive at all). Defaults to an invisible border: the border is
   * always drawn so selecting cannot change the box, and Tailwind's bare
   * `border` would otherwise fall back to `currentColor` and outline every
   * legend item.
   */
  restingClassName?: string;
  /** Stable hook for the layout/filter tests. */
  testId?: string;
  children: ReactNode;
}

/**
 * THE legend chip. One definition of how a legend item looks and behaves as
 * a filter toggle, shared by the roster legend and the colour legend so
 * hover, selected, focus and keyboard behaviour cannot diverge between them.
 *
 * Selection is drawn with COLOUR ONLY — the border is always present and
 * always 1px, padding never changes, and the font weight is deliberately
 * left alone (a bolder selected label is wider, which reflows the whole
 * wrapped legend and moves the grid underneath it).
 *
 * `aria-pressed` carries the state and the chip's visible text is its
 * accessible name (deliberately no aria-label, which would hide the dynamic
 * window/count detail from screen readers). A real <button> brings
 * Enter/Space, tab order and the app's focus ring for free.
 */
export function LegendFilterChip({
  active, onToggle, interactive, className, restingClassName = 'border-transparent', testId, children,
}: LegendFilterChipProps) {
  const shape = cn('inline-flex items-center gap-1.5 border transition-colors', className);

  if (!interactive) {
    return <span data-testid={testId} className={cn(shape, restingClassName)}>{children}</span>;
  }

  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={active}
      onClick={onToggle}
      className={cn(
        shape,
        'cursor-pointer ring-offset-background',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        active
          ? 'border-primary bg-primary/10 text-primary hover:bg-primary/20'
          : cn(restingClassName, 'hover:bg-muted hover:text-foreground')
      )}
    >
      {children}
    </button>
  );
}

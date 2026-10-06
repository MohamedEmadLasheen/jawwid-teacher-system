import * as React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';

import { cn } from '@/lib/utils';
import { matchesSearch } from '@/lib/searchText';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { useVisualViewport } from '@/hooks/use-visual-viewport';

export interface SearchableSelectOption {
  value: string;
  /** The display string, and the primary thing a query is matched against. */
  label: string;
  /**
   * Extra text folded into the haystack but never shown — a parent's name, a
   * raw id, an Arabic spelling alongside an English one. Matching treats it
   * exactly like the label.
   */
  searchText?: string;
  /** Richer cell content (a colour swatch, a badge). `label` still drives search. */
  node?: React.ReactNode;
  disabled?: boolean;
}

export interface SearchableSelectGroup {
  key: string;
  /**
   * Group heading — e.g. a shift window. Rendered, never matched against.
   * Omit it for an unlabelled group; it must be undefined rather than null,
   * which is why it is normalised before reaching CommandGroup (see below).
   */
  label?: React.ReactNode;
  options: SearchableSelectOption[];
}


/** Breathing room between the mobile panel and the edges of the visible area. */
const MOBILE_PANEL_MARGIN = 8;

interface SearchableSelectProps {
  value?: string;
  onChange: (value: string) => void;
  /** Flat list. Mutually exclusive with `groups`. */
  options?: SearchableSelectOption[];
  /** Grouped list, with headings preserved. Mutually exclusive with `options`. */
  groups?: SearchableSelectGroup[];
  placeholder?: string;
  searchPlaceholder?: string;
  /** Shown in place of the list when nothing matches the query. */
  emptyText?: string;
  disabled?: boolean;
  /**
   * Opt OUT of the search field. Defaults to searchable.
   *
   * Searchability is a property of the code, never of today's record count.
   * There is deliberately no `options.length > N` rule here: a dynamic
   * collection would then render one control at four records and a different
   * one at six, and the search affordance would appear and disappear as rows
   * are added — exactly what the policy forbids.
   *
   * Pass `searchable={false}` ONLY for a list that is fixed in the code and
   * five options or fewer. Everything else — any enum longer than five, and
   * every database-backed collection — stays searchable by default, so a new
   * call site is correct without its author having to remember a flag.
   */
  searchable?: boolean;
  className?: string;
  contentClassName?: string;
  id?: string;
  'data-testid'?: string;
  'aria-label'?: string;
  /**
   * Error state, forwarded to the trigger so a failed required-field check is
   * announced and not merely coloured. The red border itself stays the
   * caller's `className`, matching how Input is styled elsewhere.
   */
  'aria-invalid'?: boolean;
  /** Id of the element holding the error message, for the same reason. */
  'aria-describedby'?: string;
}

/**
 * The app's one searchable single-select.
 *
 * Built on the Command (cmdk) and Popover primitives the project already
 * ships, so it inherits listbox/option semantics, Arrow-key traversal, Enter
 * to choose and Escape to dismiss rather than reimplementing any of it.
 * Filtering is handled here instead of by cmdk's built-in fuzzy scorer, via
 * the shared `matchesSearch`, because the scorer has no notion of Arabic
 * orthography.
 *
 * It replaces four near-identical popover+Command+filter blocks that had
 * grown up across the scheduling feature. Being generic over
 * `SearchableSelectOption` is deliberate: teachers, students, courses,
 * supervisors and shift templates all reduce to a value and a label, so none
 * of them needs its own control.
 *
 * It holds no domain knowledge and performs no I/O. Options are whatever the
 * caller already has in memory, and every keystroke filters that array — no
 * query is issued, so growing to hundreds of teachers costs nothing but a
 * `filter` pass, memoised below.
 *
 * RTL: the popover is pinned to the trigger's own width, which makes its box
 * identical under either direction, and the portalled content inherits `dir`
 * from <html>. Nothing here is positioned with a physical left/right.
 */
export function SearchableSelect({
  value,
  onChange,
  options,
  groups,
  placeholder,
  searchPlaceholder,
  emptyText,
  disabled = false,
  searchable,
  className,
  contentClassName,
  id,
  'data-testid': testId,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');

  /**
   * One shape downstream, whether the caller passed a list or groups. The
   * flat case is a single unlabelled group — `label` left undefined, never
   * null, for the reason given at the CommandGroup below.
   */
  const allGroups = React.useMemo<SearchableSelectGroup[]>(
    () => groups ?? [{ key: '__flat__', options: options ?? [] }],
    [groups, options]
  );

  const showSearch = searchable ?? true;

  /**
   * Groups that still have a matching option, with the non-matching options
   * dropped. An emptied group disappears along with its heading, so a shift
   * window never sits above an empty list.
   */
  const visibleGroups = React.useMemo(() => {
    if (!query.trim()) return allGroups;
    return allGroups
      .map((group) => ({
        ...group,
        options: group.options.filter((option) =>
          matchesSearch(`${option.label} ${option.searchText ?? ''}`, query)
        ),
      }))
      .filter((group) => group.options.length > 0);
  }, [allGroups, query]);

  /**
   * Counted over OPTIONS, not groups. With no query the filter is skipped
   * entirely, so an empty collection arrives here as one group holding zero
   * options — a non-empty `visibleGroups` that has nothing to show. Testing
   * the group count rendered a blank popover with no explanation whenever a
   * collection was simply empty (an academy with no shift templates yet).
   */
  const hasResults = visibleGroups.some((group) => group.options.length > 0);

  const selected = React.useMemo(() => {
    for (const group of allGroups) {
      const hit = group.options.find((option) => option.value === value);
      if (hit) return hit;
    }
    return undefined;
  }, [allGroups, value]);

  /** A stale query must not be what the next opening starts from. */
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  /**
   * Whether this control sits inside a modal dialog — decided when it opens,
   * because that is when the answer is both knowable and needed.
   *
   * A modal Radix Dialog mounts react-remove-scroll, which cancels wheel
   * events whose target is not inside the dialog's own subtree. This popover
   * is portalled to <body>, so it is "outside" by that test and its wheel
   * events are cancelled: the option list still overflows and still paints a
   * scrollbar, but the wheel does nothing. Clicking and the arrow keys kept
   * working (cmdk scrolls the active item programmatically), which is why it
   * read as a cosmetic scrollbar rather than a dead list.
   *
   * Marking the popover `modal` makes it own the innermost scroll lock, so its
   * own content becomes the allowed scroll region and the wheel reaches the
   * list again.
   *
   * Deliberately NOT modal everywhere: outside a dialog the popover needs no
   * lock, and taking one would freeze the page behind it and shift the layout
   * by the scrollbar width every time any dropdown opened.
   */
  const [inDialog, setInDialog] = React.useState(false);

  const handleOpenChange = (next: boolean) => {
    // Batched with setOpen, so the popover's first render already knows.
    if (next) setInDialog(!!triggerRef.current?.closest('[role="dialog"]'));
    setOpen(next);
    if (!next) setQuery('');
  };

  const choose = (next: string) => {
    onChange(next);
    handleOpenChange(false);
  };

  const isMobile = useIsMobile();
  /* Subscribed only while a mobile panel is actually open. */
  const viewport = useVisualViewport(isMobile && open);

  /**
   * The search field and the result list, identical on both presentations.
   *
   * Written once so the two layouts can never drift on what matching does,
   * what the empty state says, or how a choice is applied — only on where the
   * box is drawn.
   */
  const searchField = showSearch ? (
    <CommandInput
      value={query}
      onValueChange={setQuery}
      placeholder={searchPlaceholder}
      /* shrink-0 is load-bearing in the mobile flex column: without it the
         input is the first thing the layout gives up when the keyboard
         shortens the panel, which is exactly the field the user is typing
         into. */
      className="shrink-0"
    />
  ) : null;

  const resultList = (listClassName: string) => (
    <CommandList className={listClassName}>
      {hasResults ? (
        visibleGroups.map((group) => (
          /* `?? undefined` is load-bearing: cmdk folds the heading
             into its value computation with
             `typeof part === 'object' && 'current' in part`, and
             `typeof null === 'object'`, so a null heading throws
             "Cannot use 'in' operator to search for 'current' in null"
             and takes the whole tree down with it. */
          <CommandGroup key={group.key} heading={group.label ?? undefined}>
            {group.options.map((option) => (
              <CommandItem
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                onSelect={() => choose(option.value)}
                /* The current choice stays legible while scrolling a
                   long list, not only via the tick. */
                className={cn(
                  option.value === value && 'font-semibold',
                  /* A comfortable touch target on a phone; desktop rows are
                     unchanged. */
                  isMobile && 'min-h-11'
                )}
              >
                <Check
                  className={cn(
                    'me-2 h-4 w-4 shrink-0',
                    option.value === value ? 'opacity-100' : 'opacity-0'
                  )}
                />
                <span className="truncate">{option.node ?? option.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))
      ) : (
        /* Rendered directly rather than through CommandEmpty, which
           keys off cmdk's own filtered count and so never fires while
           shouldFilter is false. */
        <div
          data-testid="searchable-select-empty"
          className="py-6 text-center text-sm text-muted-foreground"
        >
          {emptyText}
        </div>
      )}
    </CommandList>
  );

  const trigger = (
    <Button
      ref={triggerRef}
      id={id}
      type="button"
      variant="outline"
      role="combobox"
      aria-expanded={open}
      aria-label={ariaLabel}
      aria-invalid={ariaInvalid}
      aria-describedby={ariaDescribedBy}
      data-testid={testId}
      disabled={disabled}
      className={cn('w-full justify-between font-normal', className)}
      /* Radix opens a popover on Enter and Space because the trigger is a
         real button; the arrow keys are added so reaching for the list
         the way a native select behaves still works. */
      onKeyDown={(event) => {
        if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
          event.preventDefault();
          setOpen(true);
        }
      }}
    >
      <span className={cn('truncate', !selected && 'text-muted-foreground')}>
        {selected ? selected.node ?? selected.label : placeholder}
      </span>
      <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
    </Button>
  );

  /**
   * MOBILE — a panel pinned to the VISIBLE viewport, not an anchored popover.
   *
   * An anchored popover cannot be made correct here. Radix positions it with
   * a transformed, fixed wrapper and sizes it from
   * `--radix-popper-available-height`, which Floating UI derives from the
   * LAYOUT viewport. iOS does not shrink the layout viewport when the
   * keyboard opens, so the popover is sized and placed against a screen that
   * is partly behind the keyboard: the search field — the top of the box —
   * ends up somewhere the user cannot see or reach, and the list scrolls
   * under the keys. Making the box shorter does not fix that; it is anchored
   * to the wrong rectangle.
   *
   * So on a phone the control stops being anchored to its trigger. It becomes
   * a dialog whose top, left, width and max height come from
   * `window.visualViewport` and are recomputed as the keyboard opens, closes
   * and scrolls. Radix Dialog supplies the rest of what this needs and the
   * popover never did: a focus trap, dismissal, and a body scroll lock so the
   * form behind cannot become the scroll container.
   *
   * Auto-focus is deliberately declined. Letting the panel open first and the
   * keyboard appear only when the field is tapped means the full list is
   * browsable and scrollable without the keyboard ever covering it — and it
   * matches what a phone user expects from a picker.
   */
  if (isMobile) {
    return (
      <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
        <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            data-testid={testId ? `${testId}-panel` : undefined}
            aria-label={ariaLabel ?? placeholder ?? searchPlaceholder}
            onOpenAutoFocus={(event) => event.preventDefault()}
            className={cn(
              'fixed z-50 flex flex-col overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg outline-none',
              'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
              contentClassName
            )}
            style={{
              top: viewport.offsetTop + MOBILE_PANEL_MARGIN,
              left: viewport.offsetLeft + MOBILE_PANEL_MARGIN,
              width: Math.max(0, viewport.width - MOBILE_PANEL_MARGIN * 2),
              maxHeight: Math.max(0, viewport.height - MOBILE_PANEL_MARGIN * 2),
            }}
          >
            {/* Radix requires an accessible name on dialog content. */}
            <DialogPrimitive.Title className="sr-only">
              {ariaLabel ?? placeholder ?? searchPlaceholder}
            </DialogPrimitive.Title>
            <Command shouldFilter={false} className="flex min-h-0 flex-1 flex-col">
              {searchField}
              {/* min-h-0 lets the list actually shrink inside the flex column
                  instead of forcing the panel past its max height, and the
                  max-h cap the desktop list carries is dropped so the panel's
                  own viewport-derived height is the only limit. */}
              {resultList('max-h-none min-h-0 flex-1 overflow-y-auto')}
            </Command>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange} modal={inDialog}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>

      {/* Pinned to the trigger width (with a floor, so a narrow filter still
          shows a readable name) and clamped to the space Radix reports as
          actually available, which is what keeps a long roster inside the
          viewport instead of running off the bottom of a dialog. */}
      <PopoverContent
        align="start"
        collisionPadding={8}
        className={cn(
          'w-[--radix-popover-trigger-width] min-w-[13rem] p-0',
          contentClassName
        )}
      >
        <Command shouldFilter={false}>
          {searchField}
          {resultList(
            'max-h-[min(18rem,var(--radix-popover-content-available-height,18rem))]'
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}

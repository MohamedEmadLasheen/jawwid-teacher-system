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

/**
 * Above this many options a search field appears. At or below it a FIXED list
 * is short enough to read at a glance.
 *
 * This threshold decides the BOUNDED case only. A collection that grows with
 * the data — teachers, students, courses, supervisors, shift templates,
 * participants — must pass `searchable` explicitly and never rely on this
 * count, because today's record count is not a property of the control. An
 * academy with four teachers would otherwise render a different control than
 * the same screen with six, and the search affordance would appear and
 * disappear as rows are added.
 */
export const SEARCH_THRESHOLD = 5;

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
   * Force the search field on or off.
   *
   * Pass `searchable` for every DYNAMIC collection — anything whose length is
   * a function of how much data the academy has. Leave it undefined only for
   * a FIXED list (a weekday, a duration, an enum), where the option count is
   * a property of the code and the SEARCH_THRESHOLD rule can decide.
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

  const total = React.useMemo(
    () => allGroups.reduce((n, g) => n + g.options.length, 0),
    [allGroups]
  );

  const showSearch = searchable ?? total > SEARCH_THRESHOLD;

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
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setQuery('');
  };

  const choose = (next: string) => {
    onChange(next);
    handleOpenChange(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
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
      </PopoverTrigger>

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
          {showSearch && (
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder={searchPlaceholder}
            />
          )}
          <CommandList className="max-h-[min(18rem,var(--radix-popover-content-available-height,18rem))]">
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
                      className={cn(option.value === value && 'font-semibold')}
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
        </Command>
      </PopoverContent>
    </Popover>
  );
}

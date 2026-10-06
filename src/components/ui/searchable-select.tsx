import * as React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';

import { cn } from '@/lib/utils';
import { matchesSearch } from '@/lib/searchMatch';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface SearchableSelectOption {
  value: string;
  label: string;
  /**
   * Extra text the search box should match beyond `label` — a record id, a
   * parent's name, a phone number. Entity knowledge lives at the call site;
   * this component never learns what a teacher or a student is.
   */
  searchText?: string;
  disabled?: boolean;
  /** Rendered instead of the plain label. `label` still drives search and the trigger. */
  render?: React.ReactNode;
}

export interface SearchableSelectGroup {
  /** Heading text, e.g. "Full-time — 12:00 PM–7:00 PM". */
  label: string;
  options: SearchableSelectOption[];
}

interface CommonProps {
  /** Flat list. Mutually exclusive with `groups`. */
  options?: SearchableSelectOption[];
  /** Grouped list, headings preserved through filtering. Mutually exclusive with `options`. */
  groups?: SearchableSelectGroup[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  /** Classes for the trigger button. */
  className?: string;
  /** Classes for the popover panel. */
  contentClassName?: string;
  id?: string;
  testId?: string;
  ariaLabel?: string;
}

interface SingleProps extends CommonProps {
  value?: string;
  onValueChange: (value: string) => void;
}

interface MultiProps extends CommonProps {
  values: string[];
  onValuesChange: (values: string[]) => void;
  /** Trigger text when more than one option is selected. Defaults to a comma list. */
  summarize?: (selected: SearchableSelectOption[]) => string;
}

/** Flattens either input shape into the groups the body renders. */
function toGroups(options?: SearchableSelectOption[], groups?: SearchableSelectGroup[]): SearchableSelectGroup[] {
  if (groups) return groups;
  return [{ label: '', options: options ?? [] }];
}

function allOptions(groups: SearchableSelectGroup[]): SearchableSelectOption[] {
  return groups.flatMap((g) => g.options);
}

/**
 * The shared popover body. Both the single- and multi-select wrappers render
 * this, so search, grouping, keyboard handling and empty-group behaviour have
 * exactly one implementation.
 *
 * FILTERING IS DONE HERE, NOT BY cmdk's SCORER. cmdk filters item-by-item and
 * leaves a group heading standing over nothing; computing the visible groups
 * ourselves means an emptied group is simply not rendered, which is what keeps
 * "Part-time" from appearing above an empty space when the search only matches
 * full-timers. It also makes the match rule exactly `matchesSearch`, shared
 * with the Quick Actions drawer, rather than cmdk's fuzzy ranking.
 */
function SearchableBody({
  groups, query, onQueryChange, searchPlaceholder, emptyText, isSelected, onPick, multiple,
}: {
  groups: SearchableSelectGroup[];
  query: string;
  onQueryChange: (q: string) => void;
  searchPlaceholder: string;
  emptyText: string;
  isSelected: (value: string) => boolean;
  onPick: (value: string) => void;
  multiple: boolean;
}) {
  const visible = React.useMemo(
    () =>
      groups
        .map((group) => ({
          ...group,
          options: group.options.filter((o) => matchesSearch(`${o.label} ${o.searchText ?? ''}`, query)),
        }))
        // An empty group must not leave its heading behind.
        .filter((group) => group.options.length > 0),
    [groups, query]
  );

  return (
    // shouldFilter={false}: the filtering above is authoritative. Leaving
    // cmdk's own scorer on as well would hide items this rule matched.
    <Command shouldFilter={false}>
      <CommandInput placeholder={searchPlaceholder} value={query} onValueChange={onQueryChange} />
      <CommandList className="max-h-64">
        {visible.length === 0 && <CommandEmpty>{emptyText}</CommandEmpty>}
        {visible.map((group, index) => (
          <CommandGroup key={group.label || `group-${index}`} heading={group.label || undefined}>
            {group.options.map((option) => (
              <CommandItem
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                onSelect={() => !option.disabled && onPick(option.value)}
              >
                {multiple ? (
                  <Checkbox checked={isSelected(option.value)} className="me-2 shrink-0" tabIndex={-1} />
                ) : (
                  // Logical margin, not `mr-`: the popover mirrors under
                  // dir="rtl" and a physical margin would sit on the wrong side.
                  <Check className={cn('me-2 h-4 w-4 shrink-0', isSelected(option.value) ? 'opacity-100' : 'opacity-0')} />
                )}
                <span className="truncate">{option.render ?? option.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </Command>
  );
}

/** Trigger + panel chrome shared by both wrappers. */
function SearchableShell({
  open, onOpenChange, triggerText, isPlaceholder, disabled, className, contentClassName,
  id, testId, ariaLabel, children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerText: string;
  isPlaceholder: boolean;
  disabled?: boolean;
  className?: string;
  contentClassName?: string;
  id?: string;
  testId?: string;
  ariaLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          data-testid={testId}
          type="button"
          variant="outline"
          // role="combobox" + aria-expanded is the contract Radix's own
          // SelectTrigger exposes, so role-based tests and screen readers see
          // no difference from the control this replaces.
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn(
            'h-10 w-full justify-between font-normal',
            isPlaceholder && 'text-muted-foreground',
            className
          )}
        >
          <span className="truncate text-start">{triggerText}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        // Matches the trigger, but never narrower than a usable search box —
        // several call sites have a 144px trigger.
        className={cn('w-[--radix-popover-trigger-width] min-w-[14rem] max-w-[calc(100vw-2rem)] p-0', contentClassName)}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

/**
 * THE searchable single-select.
 *
 * Use this for every selector in the app that is either a fixed list of more
 * than five options or backed by a database collection of any size — see
 * scripts/schedule-geometry-tests/selectors.test.mjs, which enforces that rule
 * over the Scheduling source and fails the build when a new plain <Select>
 * breaks it.
 *
 * Accepts `options` (flat) or `groups` (headed sections, preserved through
 * filtering). Search matches `label` plus whatever `searchText` the call site
 * supplies, through the shared `matchesSearch`.
 */
export function SearchableSelect({
  options, groups, value, onValueChange, placeholder = '', searchPlaceholder = 'Search…',
  emptyText = '—', disabled, className, contentClassName, id, testId, ariaLabel,
}: SingleProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const resolved = React.useMemo(() => toGroups(options, groups), [options, groups]);
  const selected = React.useMemo(
    () => allOptions(resolved).find((o) => o.value === value),
    [resolved, value]
  );

  // Each opening starts from the full list; a stale query would silently hide
  // options the next time the picker is opened.
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setQuery('');
  };

  return (
    <SearchableShell
      open={open}
      onOpenChange={handleOpenChange}
      triggerText={selected?.label ?? placeholder}
      isPlaceholder={!selected}
      disabled={disabled}
      className={className}
      contentClassName={contentClassName}
      id={id}
      testId={testId}
      ariaLabel={ariaLabel}
    >
      <SearchableBody
        groups={resolved}
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder={searchPlaceholder}
        emptyText={emptyText}
        multiple={false}
        isSelected={(v) => v === value}
        onPick={(v) => {
          onValueChange(v);
          handleOpenChange(false);
        }}
      />
    </SearchableShell>
  );
}

/**
 * The multi-select sibling — same body, same match rule, same grouping, but
 * the panel stays open and each row carries a checkbox.
 *
 * Kept in this file rather than a second module so there is one searchable
 * picker implementation in the codebase, not two that can drift.
 */
export function SearchableMultiSelect({
  options, groups, values, onValuesChange, placeholder = '', searchPlaceholder = 'Search…',
  emptyText = '—', disabled, className, contentClassName, id, testId, ariaLabel, summarize,
}: MultiProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const resolved = React.useMemo(() => toGroups(options, groups), [options, groups]);
  const selected = React.useMemo(
    () => allOptions(resolved).filter((o) => values.includes(o.value)),
    [resolved, values]
  );

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setQuery('');
  };

  const triggerText = selected.length === 0
    ? placeholder
    : summarize
      ? summarize(selected)
      : selected.map((o) => o.label).join(', ');

  return (
    <SearchableShell
      open={open}
      onOpenChange={handleOpenChange}
      triggerText={triggerText}
      isPlaceholder={selected.length === 0}
      disabled={disabled}
      className={className}
      contentClassName={contentClassName}
      id={id}
      testId={testId}
      ariaLabel={ariaLabel}
    >
      <SearchableBody
        groups={resolved}
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder={searchPlaceholder}
        emptyText={emptyText}
        multiple
        isSelected={(v) => values.includes(v)}
        onPick={(v) =>
          onValuesChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v])
        }
      />
    </SearchableShell>
  );
}

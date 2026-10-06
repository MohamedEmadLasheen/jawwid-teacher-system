import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandInput, CommandList, CommandGroup, CommandItem,
} from '@/components/ui/command';
import { ChevronsUpDown } from 'lucide-react';
import * as React from 'react';
import { useMemo, useState } from 'react';
import { matchesSearch } from '@/lib/searchText';

export interface MultiSelectOption {
  id: string;
  label: string;
  /** Extra text to match against search (e.g. parent name, raw ID) beyond the label. */
  searchText?: string;
  /**
   * Richer row content (a colour swatch, a badge). `label` still drives both
   * search and the closed trigger's summary, so the extra content is
   * decoration and never part of the haystack — the same contract
   * SearchableSelectOption.node has.
   */
  node?: React.ReactNode;
}

interface MultiSelectFilterProps {
  options: MultiSelectOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder: string;
  className?: string;
  /**
   * What the closed trigger shows once more than one option is picked.
   * 'count' ("3 selected") suits the dense filter bar; 'labels' names them
   * all, which is what a form field wants when the choice is the content
   * rather than a filter.
   */
  summaryMode?: 'count' | 'labels';
  /**
   * Force the search field on or off — same contract as SearchableSelect:
   * pass `searchable` for any collection that grows with the data, and leave
   * it `false` only for a list fixed in the code with five options or fewer.
   * There is no count-based rule — see SearchableSelect.
   */
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  'data-testid'?: string;
}

/** Generic searchable multi-select used by the schedule filter bar (Teacher,
 * Course, Supervisor, Status, Student) — one implementation, reused instead
 * of duplicating near-identical popover+search+checkbox logic per filter. */
export function MultiSelectFilter({
  options, selectedIds, onChange, placeholder, className,
  summaryMode = 'count', searchable, searchPlaceholder, emptyText,
  'data-testid': testId,
}: MultiSelectFilterProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  /** Same rule as the single-select, so the two controls behave alike: an
   *  explicit `searchable` wins, otherwise the bounded-list threshold. */
  const showSearch = searchable ?? true;

  /** Filtered here rather than by cmdk's fuzzy scorer, through the shared
   *  matcher — one search rule for every selector in the app. */
  const visible = useMemo(
    () => (query.trim()
      ? options.filter((o) => matchesSearch(`${o.label} ${o.searchText ?? ''}`, query))
      : options),
    [options, query]
  );

  const toggle = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  /** A stale query must not be what the next opening starts from. */
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setQuery('');
  };

  const selectedLabels = options.filter((o) => selectedIds.includes(o.id)).map((o) => o.label);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={placeholder}
          data-testid={testId}
          className={`h-9 text-sm justify-between font-normal shrink-0 ${className ?? 'w-40'}`}
        >
          <span className="truncate">
            {selectedLabels.length === 0
              ? placeholder
              : selectedLabels.length === 1
                ? selectedLabels[0]
                : summaryMode === 'labels'
                  ? selectedLabels.join(', ')
                  : t('scheduling.filterSelectedCount', { count: selectedLabels.length })}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0">
        <Command shouldFilter={false}>
          {showSearch && (
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder={searchPlaceholder ?? placeholder}
            />
          )}
          <CommandList className="max-h-[min(16rem,var(--radix-popover-content-available-height,16rem))]">
            {visible.length > 0 ? (
              <CommandGroup>
                {visible.map((o) => (
                  <CommandItem key={o.id} value={o.id} onSelect={() => toggle(o.id)}>
                    <Checkbox checked={selectedIds.includes(o.id)} className="me-2" />
                    {o.node ?? <span className="truncate">{o.label}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : (
              /* Rendered directly rather than through CommandEmpty, which
                 keys off cmdk's own filtered count and so never fires while
                 shouldFilter is false. */
              <div
                data-testid="multi-select-empty"
                className="py-6 text-center text-sm text-muted-foreground"
              >
                {emptyText ?? t('common.noResults')}
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

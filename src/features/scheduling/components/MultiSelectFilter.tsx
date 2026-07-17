import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from '@/components/ui/command';
import { ChevronsUpDown } from 'lucide-react';
import { useState } from 'react';

export interface MultiSelectOption {
  id: string;
  label: string;
  /** Extra text to match against search (e.g. parent name, raw ID) beyond the label. */
  searchText?: string;
}

interface MultiSelectFilterProps {
  options: MultiSelectOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder: string;
  className?: string;
}

/** Generic searchable multi-select used by the schedule filter bar (Teacher,
 * Course, Supervisor, Status, Student) — one implementation, reused instead
 * of duplicating near-identical popover+search+checkbox logic per filter. */
export function MultiSelectFilter({ options, selectedIds, onChange, placeholder, className }: MultiSelectFilterProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const toggle = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  const selectedLabels = options.filter((o) => selectedIds.includes(o.id)).map((o) => o.label);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className={`h-9 text-sm justify-between font-normal shrink-0 ${className ?? 'w-40'}`}>
          <span className="truncate">
            {selectedLabels.length === 0
              ? placeholder
              : selectedLabels.length === 1
                ? selectedLabels[0]
                : t('scheduling.filterSelectedCount', { count: selectedLabels.length })}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0">
        <Command filter={(value, search) => {
          const option = options.find((o) => o.id === value);
          if (!option) return 0;
          const haystack = `${option.label} ${option.searchText ?? ''}`.toLowerCase();
          return haystack.includes(search.toLowerCase()) ? 1 : 0;
        }}>
          <CommandInput placeholder={placeholder} />
          <CommandList className="max-h-64">
            <CommandEmpty>—</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem key={o.id} value={o.id} onSelect={() => toggle(o.id)}>
                  <Checkbox checked={selectedIds.includes(o.id)} className="me-2" />
                  {o.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

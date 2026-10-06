import { useTranslation } from 'react-i18next';
import { SearchableMultiSelect } from '@/components/ui/searchable-select';

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

/**
 * The schedule filter bar's multi-select (Teacher, Student, Course,
 * Supervisor, Status).
 *
 * Now a thin adapter over the shared SearchableMultiSelect rather than its own
 * popover+command+search implementation. Keeping it as a named component
 * preserves the bar's own API and its "{n} selected" summary, while the
 * matching rule, grouping, keyboard handling and RTL behaviour come from the
 * one canonical picker — so a search here can never behave differently from a
 * search in the lesson dialogs.
 */
export function MultiSelectFilter({ options, selectedIds, onChange, placeholder, className }: MultiSelectFilterProps) {
  const { t } = useTranslation();

  return (
    <SearchableMultiSelect
      values={selectedIds}
      onValuesChange={onChange}
      placeholder={placeholder}
      searchPlaceholder={placeholder}
      ariaLabel={placeholder}
      className={`h-9 text-sm shrink-0 ${className ?? 'w-40'}`}
      options={options.map((o) => ({ value: o.id, label: o.label, searchText: o.searchText }))}
      // One selection shows its own label; several collapse to "{n} selected".
      // That is the bar's long-standing trigger text, and the legend chips are
      // kept in step with it by reading the same label back out.
      summarize={(selected) =>
        selected.length === 1
          ? selected[0].label
          : t('scheduling.filterSelectedCount', { count: selected.length })}
    />
  );
}

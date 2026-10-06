import { useTranslation } from 'react-i18next';
import { useSupervisorStore } from '@/store/supervisorStore';
import { useScheduleUiStore } from '@/store/scheduleUiStore';
import { LegendFilterChip } from './LegendFilterChip';
import type { LessonLifecycleStatus } from '@/lib/types';

interface ColorLegendProps {
  /**
   * Turn the legend into filters. Off by default — see
   * ScheduleRosterLegend: the per-teacher weekly view renders its grid from
   * DEFAULT_FILTERS, so toggles there would be inert.
   */
  interactive?: boolean;
}

/** Drawn exactly as the grid draws each lifecycle status, so the swatch is the key. */
const LIFECYCLE_LEGEND: { status: LessonLifecycleStatus; borderClass: string }[] = [
  { status: 'trial', borderClass: 'border-dashed' },
  { status: 'active', borderClass: 'border-solid' },
  { status: 'paused', borderClass: 'border-dotted' },
];

/**
 * The schedule's colour key — and, when interactive, the fastest way to
 * filter by what you can see.
 *
 * Each item writes to the SAME field in scheduleUiStore that the filter bar
 * writes to, so there is one source of truth per dimension and the two UIs
 * stay in step automatically: picking Trial here lights up Trial in the
 * status filter, and picking it there lights up this chip.
 *
 *   supervisor swatch  → filters.supervisorIds     (shared with the bar)
 *   Free time          → filters.availableOnly     (shared with the bar's
 *                        "Available slots only" switch and the Intelligence
 *                        Centre's empty-hours drill-down)
 *   Outside shift      → filters.outsideShiftOnly
 *   trial/active/…     → filters.lifecycleStatuses (shared with the bar)
 *
 * The supervisor list is whatever supervisors exist with a colour assigned —
 * no names are written down here — and the lifecycle items come from one
 * array, so Trial is not special-cased.
 */
export function ColorLegend({ interactive = false }: ColorLegendProps) {
  const { t } = useTranslation();
  const { supervisors } = useSupervisorStore();
  const { filters, setFilter, toggleFilterValue } = useScheduleUiStore();
  const activeSupervisors = supervisors.filter((s) => s.status === 'active' && s.colorHex);

  // Identical padding in every state keeps toggling from reflowing the row.
  const chipShape = 'text-xs rounded-md px-1.5 py-1 min-h-7';

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      {activeSupervisors.map((s) => (
        <LegendFilterChip
          key={s.id}
          testId={`legend-supervisor-${s.id}`}
          interactive={interactive}
          active={filters.supervisorIds.includes(s.id)}
          onToggle={() => toggleFilterValue('supervisorIds', s.id)}
          className={chipShape}
        >
          <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.colorHex! }} />
          {s.name}
        </LegendFilterChip>
      ))}

      <span className="w-px h-4 bg-border" />

      <LegendFilterChip
        testId="legend-free-time"
        interactive={interactive}
        active={filters.availableOnly}
        onToggle={() => setFilter('availableOnly', !filters.availableOnly)}
        className={chipShape}
      >
        <span className="inline-block w-3 h-3 rounded-sm bg-red-100 border-2 border-red-300 shrink-0" />
        {t('scheduling.freeCapacity')}
      </LegendFilterChip>

      <LegendFilterChip
        testId="legend-outside-shift"
        interactive={interactive}
        active={filters.outsideShiftOnly}
        onToggle={() => setFilter('outsideShiftOnly', !filters.outsideShiftOnly)}
        className={chipShape}
      >
        <span className="inline-block w-3 h-3 rounded-sm bg-gray-200 border border-gray-300 shrink-0" />
        {t('scheduling.outsideShift')}
      </LegendFilterChip>

      <span className="w-px h-4 bg-border" />

      {LIFECYCLE_LEGEND.map(({ status, borderClass }) => (
        <LegendFilterChip
          key={status}
          testId={`legend-status-${status}`}
          interactive={interactive}
          active={filters.lifecycleStatuses.includes(status)}
          onToggle={() => toggleFilterValue('lifecycleStatuses', status)}
          className={chipShape}
        >
          <span className={`inline-block w-3 h-3 rounded-sm border-2 border-gray-400 shrink-0 ${borderClass}`} />
          {t(`scheduling.lifecycle.${status}`)}
        </LegendFilterChip>
      ))}
    </div>
  );
}

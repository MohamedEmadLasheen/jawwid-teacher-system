import { useScheduleRoster } from '../hooks/useScheduleRoster';
import { useScheduleUiStore } from '@/store/scheduleUiStore';
import { minuteToDisplayLabel } from '../utils/timeGrid';
import { LegendFilterChip } from './LegendFilterChip';

interface ScheduleRosterLegendProps {
  /**
   * Turn the chips into shift-group filters. Off by default: the per-teacher
   * weekly view shows this legend too but renders its grid from
   * DEFAULT_FILTERS, so a toggle there would do nothing.
   */
  interactive?: boolean;
}

/**
 * Shows each Schedule group with its current working window and headcount,
 * e.g. "Full-time · 12:00 PM–7:00 PM · 8" — and, when interactive, makes
 * each one a filter for that roster group.
 *
 * Every value is read from the availability configuration — the group label
 * is the shift template's name, the window is its start/end minute, and the
 * count is how many teachers hold an active assignment — so renaming a
 * group, moving a boundary or adding a third shift updates both the label
 * and the filter with no code change. Nothing here is hardcoded, including
 * what the filter matches: the chip toggles the group's own
 * `shiftTemplateId`, which is the same identity buildScheduleRoster groups
 * by, rather than a guess from `teacherType` or a group name.
 *
 * Selecting several groups ORs them (Full-time + Part-time shows both);
 * selecting none means "no shift-group restriction", not "nothing".
 */
export function ScheduleRosterLegend({ interactive = false }: ScheduleRosterLegendProps) {
  const { groups } = useScheduleRoster();
  const { filters, toggleFilterValue } = useScheduleUiStore();
  if (groups.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {groups.map((group) => {
        const active = filters.shiftTemplateIds.includes(group.templateId);
        return (
          <LegendFilterChip
            key={group.templateId}
            testId={`legend-shift-${group.templateId}`}
            interactive={interactive}
            active={active}
            onToggle={() => toggleFilterValue('shiftTemplateIds', group.templateId)}
            className="text-xs rounded-full px-2.5 py-1 min-h-7"
            restingClassName="border-border bg-muted/40"
          >
            <span className="font-medium">{group.name}</span>
            <span className={active ? 'text-primary/80' : 'text-muted-foreground'}>
              {minuteToDisplayLabel(group.startMinute)}–{minuteToDisplayLabel(group.endMinute)}
            </span>
            <span className="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-primary/10 text-primary font-semibold">
              {group.teachers.length}
            </span>
          </LegendFilterChip>
        );
      })}
    </div>
  );
}

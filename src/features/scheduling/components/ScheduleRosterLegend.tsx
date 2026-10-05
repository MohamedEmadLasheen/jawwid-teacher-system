import { useScheduleRoster } from '../hooks/useScheduleRoster';
import { minuteToDisplayLabel } from '../utils/timeGrid';

/**
 * Shows each Schedule group with its current working window and headcount,
 * e.g. "Full-time · 12:00 PM–7:00 PM · 8".
 *
 * Every value is read from the availability configuration — the group label
 * is the shift template's name and the window is its start/end minute — so
 * moving a boundary or renaming a group updates this with no code change.
 * Nothing here is hardcoded.
 */
export function ScheduleRosterLegend() {
  const { groups } = useScheduleRoster();
  if (groups.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {groups.map((group) => (
        <span
          key={group.templateId}
          className="inline-flex items-center gap-1.5 text-xs rounded-full border border-border bg-muted/40 px-2.5 py-1"
        >
          <span className="font-medium">{group.name}</span>
          <span className="text-muted-foreground">
            {minuteToDisplayLabel(group.startMinute)}–{minuteToDisplayLabel(group.endMinute)}
          </span>
          <span className="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-primary/10 text-primary font-semibold">
            {group.teachers.length}
          </span>
        </span>
      ))}
    </div>
  );
}

import { useMemo } from 'react';
import { useTeacherStore } from '@/store/teacherStore';
import { useShiftTemplates, useTeacherShiftAssignments } from './useShiftTemplates';
import { buildScheduleRoster, type ScheduleRosterGroup } from '../utils/buildScheduleRoster';

export type { ScheduleRosterGroup };

/**
 * THE Schedule teacher roster.
 *
 * Membership and working windows are entirely data-driven: a teacher is on
 * the roster if and only if they hold an active assignment to an active
 * shift template, and their window is that template's start/end minute. The
 * roster is therefore whatever the availability configuration says it is —
 * no teacher list and no window is hardcoded in the UI.
 *
 * Two consequences that matter:
 *   * Moving a boundary (12:00→11:00, 19:00→20:00, …) is a one-row UPDATE
 *     on shift_templates. No component changes, because every consumer
 *     reads startMinute/endMinute from here and feeds them through the
 *     canonical timelineGeometry.
 *   * Adding or removing a teacher is an assignment change. Nothing in the
 *     UI enumerates who belongs.
 *
 * Built from the existing shift-template hooks rather than a new query, so
 * there is still exactly one availability data path. The grouping itself
 * lives in buildScheduleRoster so it is testable without React.
 */
export function useScheduleRoster() {
  const { teachers } = useTeacherStore();
  const templatesQuery = useShiftTemplates();
  const assignmentsQuery = useTeacherShiftAssignments();

  const groups = useMemo(
    () => buildScheduleRoster(templatesQuery.data ?? [], assignmentsQuery.data ?? [], teachers),
    [templatesQuery.data, assignmentsQuery.data, teachers]
  );

  /** Flat roster in group order — the complete set of Schedule teachers. */
  const rosterTeachers = useMemo(() => groups.flatMap((g) => g.teachers), [groups]);

  /** Fast membership test for filtering grid rows. */
  const rosterTeacherIds = useMemo(() => new Set(rosterTeachers.map((t) => t.id)), [rosterTeachers]);

  /**
   * teacherId → the shift template ids they hold an active assignment to,
   * in group order. THE canonical answer to "which roster group is this
   * teacher in", so the shift-group filter, the grid's group banners and the
   * legend chips all agree by construction instead of each re-deriving it.
   *
   * A list rather than a single id because the schema permits a teacher to
   * be assigned to more than one template; the filter then matches on any of
   * them, which is the OR-within-a-category rule.
   */
  const templateIdsByTeacherId = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const group of groups) {
      for (const teacher of group.teachers) {
        const existing = map.get(teacher.id);
        if (existing) existing.push(group.templateId);
        else map.set(teacher.id, [group.templateId]);
      }
    }
    return map;
  }, [groups]);

  return {
    groups,
    rosterTeachers,
    rosterTeacherIds,
    templateIdsByTeacherId,
    isLoading: templatesQuery.isLoading || assignmentsQuery.isLoading,
    error: templatesQuery.error || assignmentsQuery.error,
  };
}

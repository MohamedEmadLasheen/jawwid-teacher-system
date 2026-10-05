import { SCHEDULE_ROSTER_DISPLAY_ORDER } from '../constants/scheduleRosterOrder';
import type { ShiftTemplate, TeacherShiftAssignment, Teacher } from '@/lib/types';

export interface ScheduleRosterGroup {
  /** Shift template id — the group's stable identity. */
  templateId: string;
  /** Group label, straight from the template name (e.g. "Full-time"). */
  name: string;
  /** Working window, minutes since local midnight. */
  startMinute: number;
  endMinute: number;
  teachers: Teacher[];
}

/**
 * Pure roster computation behind useScheduleRoster, kept separate so the
 * rules can be tested without React or a database.
 *
 * A teacher is on the roster if and only if they hold an ACTIVE assignment
 * to an ACTIVE shift template, and their working window is that template's
 * start/end minute. Nothing here enumerates teachers or hours — both come
 * entirely from the availability configuration, which is what lets
 * management move a boundary or change the roster with a data change alone.
 *
 * Groups sort by when their day starts (earliest first), so the longer
 * full-time window leads. Teachers inside a group follow
 * SCHEDULE_ROSTER_DISPLAY_ORDER, and anyone absent from that list still
 * appears — sorted after the listed ones, alphabetically — so a teacher
 * added in the database is never silently hidden.
 *
 * Soft-deleted teachers and teachers with no matching record are dropped.
 */
export function buildScheduleRoster(
  templates: ShiftTemplate[],
  assignments: TeacherShiftAssignment[],
  teachers: Teacher[]
): ScheduleRosterGroup[] {
  const activeTemplates = templates.filter((tpl) => tpl.isActive);
  const activeAssignments = assignments.filter((a) => a.isActive);
  if (activeTemplates.length === 0 || activeAssignments.length === 0) return [];

  const teacherById = new Map(teachers.filter((t) => !t.isDeleted).map((t) => [t.id, t]));

  const rank = (teacher: Teacher) => {
    const idx = SCHEDULE_ROSTER_DISPLAY_ORDER.indexOf(teacher.id);
    return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
  };

  return activeTemplates
    .map((tpl) => {
      const memberIds = new Set(
        activeAssignments.filter((a) => a.shiftTemplateId === tpl.id).map((a) => a.teacherId)
      );
      const members = [...memberIds]
        .map((id) => teacherById.get(id))
        .filter((t): t is Teacher => Boolean(t))
        .sort((a, b) => rank(a) - rank(b) || a.fullName.localeCompare(b.fullName));

      return {
        templateId: tpl.id,
        name: tpl.name,
        startMinute: tpl.startMinute,
        endMinute: tpl.endMinute,
        teachers: members,
      };
    })
    .filter((group) => group.teachers.length > 0)
    .sort((a, b) => a.startMinute - b.startMinute || b.endMinute - a.endMinute);
}

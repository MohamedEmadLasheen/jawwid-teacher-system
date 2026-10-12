import { SCHEDULE_ROSTER_DISPLAY_ORDER } from '../constants/scheduleRosterOrder';
import { isLegacyScheduleAnchor } from './legacyAnchor';
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
  /**
   * Which members of `teachers` are legacy schedule anchors: retained
   * identities whose preserved assignments still render, but who are not
   * current staff. The UI labels these; nothing may offer them new work.
   */
  legacyTeacherIds: string[];
}

/**
 * The roster plus what it could NOT place.
 *
 * An active assignment whose teacher cannot be resolved used to vanish here
 * with no trace, which is how a whole shift group could disappear from the
 * grid unnoticed. It is now reported.
 */
export interface ScheduleRosterDiagnostics {
  groups: ScheduleRosterGroup[];
  /** Active assignments whose teacher row is absent from the teacher list. */
  unresolved: { teacherId: string; templateId: string }[];
  /**
   * Active assignments resolving to an ordinary soft-deleted teacher — not a
   * legacy anchor. These stay hidden, as they always were, but are reported
   * rather than silently dropped.
   */
  hiddenSoftDeleted: { teacherId: string; templateId: string }[];
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
 * LEGACY SCHEDULE ANCHORS. A retained previous teacher identity -- soft
 * deleted AND status 'inactive', see legacyAnchor.ts -- is resolved and
 * rendered, because preserved schedule rows reference it and the shift it
 * describes still exists. Before this, the map was built from non-deleted
 * teachers only, so an anchor's assignments were dropped and a group left with
 * no resolvable members disappeared from the grid entirely: the schedule rows
 * survived in the database and in v_teacher_availability_unified while
 * vanishing from the view the user actually looks at.
 *
 * Anchors sort after active teachers within their group and are named in
 * `legacyTeacherIds` so the UI can label them. They are never eligible for new
 * work: every picker, the roster page and the Smart Assistant candidate list
 * filter on isDeleted, which excludes them.
 *
 * An ORDINARY soft-deleted teacher -- deleted through the normal path, which
 * leaves status alone -- is still dropped. Only a deliberate anchor displays.
 */
export function buildScheduleRoster(
  templates: ShiftTemplate[],
  assignments: TeacherShiftAssignment[],
  teachers: Teacher[]
): ScheduleRosterGroup[] {
  return buildScheduleRosterWithDiagnostics(templates, assignments, teachers).groups;
}

/**
 * The same computation, with the assignments it could not place.
 *
 * `buildScheduleRoster` delegates to this, so there is one implementation and
 * the diagnostics describe exactly the roster the UI renders.
 */
export function buildScheduleRosterWithDiagnostics(
  templates: ShiftTemplate[],
  assignments: TeacherShiftAssignment[],
  teachers: Teacher[]
): ScheduleRosterDiagnostics {
  const activeTemplates = templates.filter((tpl) => tpl.isActive);
  const activeAssignments = assignments.filter((a) => a.isActive);
  if (activeTemplates.length === 0 || activeAssignments.length === 0) {
    return { groups: [], unresolved: [], hiddenSoftDeleted: [] };
  }

  // EVERY teacher, so a preserved assignment can be resolved. What may be
  // DISPLAYED is decided per member below, not by omitting rows from the map:
  // omitting them is what made the groups disappear.
  const teacherById = new Map(teachers.map((t) => [t.id, t]));

  const rank = (teacher: Teacher) => {
    const idx = SCHEDULE_ROSTER_DISPLAY_ORDER.indexOf(teacher.id);
    return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
  };
  // Anchors are historical, so they follow the current staff whatever their
  // position in the display order.
  const sortKey = (teacher: Teacher) =>
    (isLegacyScheduleAnchor(teacher) ? 1 : 0);

  const unresolved: { teacherId: string; templateId: string }[] = [];
  const hiddenSoftDeleted: { teacherId: string; templateId: string }[] = [];

  const groups = activeTemplates
    .map((tpl) => {
      const memberIds = new Set(
        activeAssignments.filter((a) => a.shiftTemplateId === tpl.id).map((a) => a.teacherId)
      );
      const members: Teacher[] = [];
      for (const id of memberIds) {
        const teacher = teacherById.get(id);
        if (teacher === undefined) {
          // The assignment points at a teacher row that is not present.
          unresolved.push({ teacherId: id, templateId: tpl.id });
          continue;
        }
        if (teacher.isDeleted && !isLegacyScheduleAnchor(teacher)) {
          hiddenSoftDeleted.push({ teacherId: id, templateId: tpl.id });
          continue;
        }
        members.push(teacher);
      }
      members.sort((a, b) =>
        sortKey(a) - sortKey(b) || rank(a) - rank(b) || a.fullName.localeCompare(b.fullName));

      return {
        templateId: tpl.id,
        name: tpl.name,
        startMinute: tpl.startMinute,
        endMinute: tpl.endMinute,
        teachers: members,
        legacyTeacherIds: members.filter(isLegacyScheduleAnchor).map((t) => t.id),
      };
    })
    .filter((group) => group.teachers.length > 0)
    .sort((a, b) => a.startMinute - b.startMinute || b.endMinute - a.endMinute);

  return { groups, unresolved, hiddenSoftDeleted };
}

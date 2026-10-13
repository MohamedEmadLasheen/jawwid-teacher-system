import { SCHEDULE_ROSTER_DISPLAY_ORDER } from '../constants/scheduleRosterOrder';
import { isLegacyScheduleAnchor } from './legacyAnchor';
import { minuteToDisplayLabel } from './timeGrid';
import type { ShiftTemplate, TeacherShiftAssignment, Teacher } from '@/lib/types';

/**
 * Identity of the Hourly group. Not a shift template id: hourly teachers hold
 * no shift assignment, so the group has no template behind it. It travels in
 * the same `templateId` slot so the group filter, the legend and the grid's
 * group banners keep one identity per group with no second code path.
 */
export const HOURLY_GROUP_ID = 'hourly';

export interface ScheduleRosterGroup {
  /** Shift template id — the group's stable identity — or HOURLY_GROUP_ID. */
  templateId: string;
  /** 'shift' for a shift-template group, 'hourly' for the Hourly group. */
  kind: 'shift' | 'hourly';
  /** Group label, straight from the template name (e.g. "Full-time"); "Hourly" for the Hourly group. */
  name: string;
  /**
   * Working window, minutes since local midnight. NULL for the Hourly group:
   * an hourly teacher's working hours are not recorded anywhere, and the
   * roster must not invent them.
   */
  startMinute: number | null;
  endMinute: number | null;
  teachers: Teacher[];
  /**
   * Which members of `teachers` are legacy schedule anchors: retained
   * identities whose preserved assignments still render, but who are not
   * current staff. The UI labels these; nothing may offer them new work.
   */
  legacyTeacherIds: string[];
}

/**
 * "12:00 PM–7:00 PM" for a shift group; null for the Hourly group, whose
 * working hours are unknown and must not be displayed as if they were.
 */
export function rosterGroupWindowLabel(group: Pick<ScheduleRosterGroup, 'startMinute' | 'endMinute'>): string | null {
  if (group.startMinute === null || group.endMinute === null) return null;
  return `${minuteToDisplayLabel(group.startMinute)}–${minuteToDisplayLabel(group.endMinute)}`;
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
 *
 * THE HOURLY GROUP. A teacher who holds no active shift assignment but does
 * hold booked (trial/active) lessons — `scheduledTeacherIds` — is placed in a
 * final "Hourly" group. Without it those lessons were fetched but never drawn,
 * because rows exist only for roster members. The group carries no working
 * window (startMinute/endMinute are null): nothing records an hourly teacher's
 * hours, so the row gets no shading, no free-capacity band and no
 * outside-shift flag — the same inert treatment computeWorkingWindow already
 * gives any teacher without availability. Shift groups are built exactly as
 * before; a teacher on a shift group is never also listed as hourly.
 */
export function buildScheduleRoster(
  templates: ShiftTemplate[],
  assignments: TeacherShiftAssignment[],
  teachers: Teacher[],
  scheduledTeacherIds: ReadonlySet<string> = new Set()
): ScheduleRosterGroup[] {
  return buildScheduleRosterWithDiagnostics(templates, assignments, teachers, scheduledTeacherIds).groups;
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
  teachers: Teacher[],
  scheduledTeacherIds: ReadonlySet<string> = new Set()
): ScheduleRosterDiagnostics {
  // EVERY teacher, so a preserved assignment can be resolved. What may be
  // DISPLAYED is decided per member below, not by omitting rows from the map:
  // omitting them is what made the groups disappear.
  const teacherById = new Map(teachers.map((t) => [t.id, t]));

  const shift = buildShiftGroups(templates, assignments, teacherById);
  const onShiftGroup = new Set(shift.groups.flatMap((g) => g.teachers.map((t) => t.id)));

  // Hourly: booked lessons, no shift group. A soft-deleted teacher is not
  // shown here (an anchor only displays through the shift it anchors).
  const hourlyMembers = [...scheduledTeacherIds]
    .filter((id) => !onShiftGroup.has(id))
    .map((id) => teacherById.get(id))
    .filter((t): t is Teacher => t !== undefined && !t.isDeleted)
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  const groups = hourlyMembers.length === 0 ? shift.groups : [
    ...shift.groups,
    {
      templateId: HOURLY_GROUP_ID,
      kind: 'hourly' as const,
      name: 'Hourly',
      startMinute: null,
      endMinute: null,
      teachers: hourlyMembers,
      legacyTeacherIds: [],
    },
  ];
  return { groups, unresolved: shift.unresolved, hiddenSoftDeleted: shift.hiddenSoftDeleted };
}

function buildShiftGroups(
  templates: ShiftTemplate[],
  assignments: TeacherShiftAssignment[],
  teacherById: Map<string, Teacher>
): ScheduleRosterDiagnostics {
  const activeTemplates = templates.filter((tpl) => tpl.isActive);
  const activeAssignments = assignments.filter((a) => a.isActive);
  if (activeTemplates.length === 0 || activeAssignments.length === 0) {
    return { groups: [], unresolved: [], hiddenSoftDeleted: [] };
  }

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
        kind: 'shift' as const,
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

import { indexById } from './entityIndex';
import type { Lesson, LessonParticipant, Student, Supervisor } from '@/lib/types';

const STATUS_STYLE: Record<Lesson['lifecycleStatus'], string> = {
  trial: 'dashed',
  active: 'solid',
  paused: 'dotted',
  ended: 'solid',
};

/**
 * A lesson's colour, derived — never stored.
 *
 *     participant → student.supervisorId → supervisor.colorHex
 *
 * The responsible Admin is the single source of truth, so re-assigning a
 * student to a different Admin re-colours every lesson they appear in on the
 * next render, with no second write and nothing to keep in sync. Neither the
 * lesson nor the student row holds a colour, which is also why there is no
 * such thing here as a colour that disagrees with the legend.
 *
 * A group lesson's students can in principle belong to different Operations
 * Supervisors; the cell can only show one color. We use the first-added
 * participant's supervisor as the primary color (per the plan's documented
 * resolution) — the full per-student breakdown is one click away in the lesson
 * detail dialog, never silently hidden.
 *
 * Returns null when the first owning student cannot be resolved to an Admin
 * with a colour — a legacy unassigned student draws the grid's default border
 * rather than borrowing someone else's colour.
 *
 * The two lookups are indexed (see entityIndex) because this runs once per
 * lesson card on every render of the grid.
 */
export function getLessonSupervisorColor(
  participants: LessonParticipant[],
  students: Student[],
  supervisors: Supervisor[]
): string | null {
  const studentById = indexById(students);
  const supervisorById = indexById(supervisors);
  const sorted = [...participants].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const participant of sorted) {
    const student = studentById.get(participant.studentId);
    if (!student?.supervisorId) continue;
    const supervisor = supervisorById.get(student.supervisorId);
    if (supervisor?.colorHex) return supervisor.colorHex;
  }
  return null;
}

export function getLessonBorderStyle(lifecycleStatus: Lesson['lifecycleStatus']): string {
  return STATUS_STYLE[lifecycleStatus] ?? 'solid';
}

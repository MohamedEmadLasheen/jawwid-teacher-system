import type { Lesson, LessonParticipant, Student, Supervisor } from '@/lib/types';

const STATUS_STYLE: Record<Lesson['lifecycleStatus'], string> = {
  trial: 'dashed',
  active: 'solid',
  paused: 'dotted',
  ended: 'solid',
};

/**
 * A group lesson's students can in principle belong to different
 * Operations Supervisors; the cell can only show one color. We use the
 * first-added participant's supervisor as the primary color (per the
 * plan's documented resolution) — the full per-student breakdown is one
 * click away in the lesson detail dialog, never silently hidden.
 */
export function getLessonSupervisorColor(
  participants: LessonParticipant[],
  students: Student[],
  supervisors: Supervisor[]
): string | null {
  const sorted = [...participants].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const participant of sorted) {
    const student = students.find((s) => s.id === participant.studentId);
    if (!student?.supervisorId) continue;
    const supervisor = supervisors.find((s) => s.id === student.supervisorId);
    if (supervisor?.colorHex) return supervisor.colorHex;
  }
  return null;
}

export function getLessonBorderStyle(lifecycleStatus: Lesson['lifecycleStatus']): string {
  return STATUS_STYLE[lifecycleStatus] ?? 'solid';
}

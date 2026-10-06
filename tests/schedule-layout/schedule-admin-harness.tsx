import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@/index.css';
import i18n from '@/i18n';

import { LessonDetailDialog } from '@/features/scheduling/components/LessonDetailDialog';
import { DraggableLessonCard } from '@/features/scheduling/components/DraggableLessonCard';
import { schedulingKeys } from '@/features/scheduling/api/queryKeys';
import { useTeacherStore } from '@/store/teacherStore';
import { useSupervisorStore } from '@/store/supervisorStore';
import { nextDateForDayOfWeek } from '@/features/scheduling/utils/nextDateForDayOfWeek';
import type { LessonWithParticipants } from '@/services/scheduling/lessons.service';
import type { DayOfWeek } from '@/lib/types';

/**
 * RESPONSIBLE ADMIN IN THE SCHEDULE, through the REAL entry point.
 *
 * LessonDetailDialog is what MasterSchedulePage and the teacher week view
 * open — in `create` mode from an empty slot and in `edit` mode from a lesson
 * — so the delegation to LessonEditDialog is part of what is under test here,
 * not bypassed.
 *
 * `@/lib/supabase` is aliased to supabase-stub.ts, which records every write
 * with its payload AND applies updates to the seeded rows. That is what makes
 * the assertions real rather than theatrical: the test can prove the write was
 * `{supervisor_id: <admin>}` against `students` filtered by that one student
 * id, and that a refetch afterwards returns the changed owner.
 *
 * A lesson card is rendered alongside the dialog so the DERIVED colour is
 * observable: it has no colour of its own, so a reassignment has to repaint
 * it through students.supervisor_id -> supervisors.color_hex or not at all.
 *
 *   ?dir=ltr|rtl    direction, applied to <html> as the app does
 *   ?mode=create    the create dialog (default)
 *   ?mode=edit      the edit dialog, opened on the group lesson
 *   ?anchor=single  edit mode opens a one-student lesson instead
 *
 * Fixtures only — no production data, no network.
 */
const params = new URLSearchParams(window.location.search);
const DIR = (params.get('dir') === 'rtl' ? 'rtl' : 'ltr') as 'ltr' | 'rtl';
const MODE = params.get('mode') === 'edit' ? 'edit' : 'create';
const SINGLE_ANCHOR = params.get('anchor') === 'single';
i18n.changeLanguage(DIR === 'rtl' ? 'ar' : 'en');
document.documentElement.dir = DIR;
document.documentElement.lang = DIR === 'rtl' ? 'ar' : 'en';

const DAY = 0 as DayOfWeek;
const START = 14 * 60;

// ── the four real Operations Supervisors, canonical colours ─────────────
const DINA = 'adm-dina', ZAINAB = 'adm-zainab', REHAB = 'adm-rehab', ASMAA = 'adm-asmaa';
const COLORS: Record<string, string> = {
  [DINA]: '#E06666', [ZAINAB]: '#F9CB9C', [REHAB]: '#C9DAF8', [ASMAA]: '#93C47D',
};
const supervisors = [
  { id: DINA, name: 'Dina' }, { id: ZAINAB, name: 'Zainab' },
  { id: REHAB, name: 'Rehab' }, { id: ASMAA, name: 'Asmaa' },
].map((s) => ({
  ...s, email: '', phone: '', department: 'تشغيل', status: 'active',
  permissions: [], colorHex: COLORS[s.id], createdAt: '', updatedAt: '',
})) as any[];

const teachers = [
  { id: 'T1', fullName: 'Arwa Teacher' },
  { id: 'T2', fullName: 'Doaa Teacher' },
].map((t) => ({
  ...t, phone: '', email: '', nationality: '', joiningDate: null, monthlySalary: 0,
  salaryCurrency: 'EGP', salaryType: 'fixed', teachingMarket: 'arab', specializations: [],
  status: 'active', level: 'silver', notes: '', isDeleted: false, deletedAt: null,
  teacherType: 'shift', branchId: null, maxWeeklyHours: null,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
})) as any[];

/**
 * Students as DATABASE ROWS, served by the stub, so every read in this
 * harness goes through the real students.service + mapper and every write
 * lands where a real one would.
 *
 *   ARWA  — owned by Dina (the "already assigned" case)
 *   AHMED — owned by nobody (the legacy/unassigned case)
 *   OMAR  — owned by Asmaa (so a group spans two different Admins)
 */
const ARWA = 'S-arwa', AHMED = 'S-ahmed', OMAR = 'S-omar';
const studentRow = (id: string, full_name: string, supervisor_id: string | null) => ({
  id, branch_id: null, full_name, date_of_birth: null, country: '', timezone: 'Asia/Dubai',
  gender: null, level: '', status: 'active', enrollment_source: '', supervisor_id,
  is_returning: false, course_id: null, notes: '', is_deleted: false, deleted_at: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
});

const studentRows = [
  studentRow(ARWA, 'Arwa Ahmed', DINA),
  studentRow(AHMED, 'Ahmed Mohamed', null),
  studentRow(OMAR, 'Omar Ali', ASMAA),
];

const mkLesson = (id: string, studentIds: string[]): LessonWithParticipants => ({
  id, branchId: null, teacherId: 'T1', courseId: null, dayOfWeek: DAY,
  startMinute: START, durationMinutes: 60, endMinute: START + 60,
  timezone: 'Asia/Dubai', lifecycleStatus: 'active',
  effectiveFrom: '2026-01-01', effectiveUntil: null, originalTeacherId: 'T1',
  sameDaySince: '2026-01-01', sameTimeSince: '2026-01-01', notes: '',
  createdAt: '', updatedAt: '',
  participants: studentIds.map((studentId, i) => ({
    id: `${id}-p${i}`, lessonId: id, studentId, createdAt: `2026-01-0${i + 1}T00:00:00Z`,
  })),
} as unknown as LessonWithParticipants);

/** The lesson being edited, and a SECOND lesson for the same student —
 *  that second one is how "all other lessons reflect the new Admin" is
 *  observable rather than asserted by hand-wave. */
const EDITED = SINGLE_ANCHOR ? mkLesson('L-solo', [ARWA]) : mkLesson('L-group', [ARWA, OMAR]);
const OTHER_LESSON = mkLesson('L-other', [ARWA]);
const lessons = [EDITED, OTHER_LESSON];

// The stub serves the tables the real services read, and records the writes.
const stub = (window as any).__supabaseStub;
stub.tables = {
  students: studentRows,
  lessons: [],
  lesson_participants: [],
  lesson_exceptions: [],
  parents: [],
  student_parents: [],
  courses: [],
};

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
queryClient.setQueryData(schedulingKeys.students(), undefined);
queryClient.setQueryData(schedulingKeys.courses(), []);
queryClient.setQueryData(schedulingKeys.parents(), []);
queryClient.setQueryData(schedulingKeys.studentParents(), []);
queryClient.setQueryData(schedulingKeys.lessons(), lessons);
queryClient.setQueryData(schedulingKeys.lessonParticipants(), lessons.flatMap((l) => l.participants));
queryClient.setQueryData(schedulingKeys.grid(DAY), lessons);
queryClient.setQueryData(schedulingKeys.availabilityForDay(DAY), []);
queryClient.setQueryData(schedulingKeys.exceptionsForDate(nextDateForDayOfWeek(DAY)), []);

useTeacherStore.setState({ teachers } as any);
useSupervisorStore.setState({ supervisors } as any);

function Harness() {
  return (
    <div style={{ padding: 8 }} className="space-y-3">
      {/* The derived colour, watched live. These cards store no colour, so a
          reassignment can only reach them through the student record. */}
      <div className="flex gap-2" style={{ height: 56 }}>
        {lessons.map((l) => (
          <div key={l.id} style={{ width: 140 }}>
            <DraggableLessonCard lesson={l} onClick={() => {}} />
          </div>
        ))}
      </div>

      {MODE === 'create' ? (
        <LessonDetailDialog
          mode="create"
          teacherId="T1"
          dayOfWeek={DAY}
          startMinute={START}
          onClose={() => {}}
          onSaved={() => { (window as any).__created = true; }}
        />
      ) : (
        <LessonDetailDialog
          mode="edit"
          lesson={EDITED}
          onClose={() => {}}
          onSaved={() => {}}
        />
      )}

      <div data-testid="ready" />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}><Harness /></QueryClientProvider>
);

(window as unknown as Record<string, unknown>).__scheduleAdminFixtures = {
  dinaId: DINA, zainabId: ZAINAB, rehabId: REHAB, asmaaId: ASMAA,
  colors: COLORS,
  adminNames: ['Dina', 'Zainab', 'Rehab', 'Asmaa'],
  arwaId: ARWA, ahmedId: AHMED, omarId: OMAR,
  editedLessonId: EDITED.id,
  otherLessonId: OTHER_LESSON.id,
  /** The students table as the stub currently holds it — i.e. the database. */
  studentsTable: () => (window as any).__supabaseStub.tables.students.map(
    (r: any) => ({ id: r.id, supervisor_id: r.supervisor_id })
  ),
  writes: () => (window as any).__supabaseStub.tableWrites,
  rpcCalls: () => (window as any).__supabaseStub.rpcCalls,
};

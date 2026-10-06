import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@/index.css';
import i18n from '@/i18n';

import { StudentForm } from '@/features/scheduling/components/StudentForm';
import { ColorLegend } from '@/features/scheduling/components/ColorLegend';
import { MasterScheduleGrid } from '@/features/scheduling/components/MasterScheduleGrid';
import { SupervisorColorDot } from '@/components/ui/SupervisorColorDot';
import { schedulingKeys } from '@/features/scheduling/api/queryKeys';
import { useTeacherStore } from '@/store/teacherStore';
import { useSupervisorStore } from '@/store/supervisorStore';
import { useScheduleUiStore, DEFAULT_FILTERS } from '@/store/scheduleUiStore';
import { nextDateForDayOfWeek } from '@/features/scheduling/utils/nextDateForDayOfWeek';
import { supervisorColorByStudentId } from '@/features/scheduling/utils/responsibleAdmins';
import {
  studentInsertPayload, studentUpdatePatch, toStudent,
} from '@/services/scheduling/students.mapper';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { Student } from '@/lib/types';
import type { LessonWithParticipants } from '@/services/scheduling/lessons.service';
import type { DayOfWeek } from '@/lib/types';

/**
 * STUDENT OWNERSHIP, end to end, in the real components:
 *
 *   the real StudentForm (create AND edit) → a stand-in persistence layer that
 *   is the real students.mapper (so the row written and read back is the real
 *   shape) → the real MasterScheduleGrid and the real ColorLegend.
 *
 * What pure tests cannot prove and this harness can:
 *
 *   * the Responsible Admin control is a real combobox listing the four
 *     Admins, each with its canonical colour dot;
 *   * it refuses to submit without an Admin and says why;
 *   * creating a student persists the Admin and the grid draws that Admin's
 *     colour;
 *   * editing the student from Dina to Asmaa repaints the grid red → green;
 *   * a reload (remount from the stored row) keeps the new colour, because the
 *     colour was never stored — it is resolved from the Admin every time;
 *   * all of it under RTL and on a phone viewport.
 *
 * ?dir=ltr|rtl   direction, applied to <html> as the app does
 *
 * Fixtures only — no production data, no network (@/lib/supabase is stubbed).
 */
const params = new URLSearchParams(window.location.search);
const DIR = (params.get('dir') === 'rtl' ? 'rtl' : 'ltr') as 'ltr' | 'rtl';
i18n.changeLanguage(DIR === 'rtl' ? 'ar' : 'en');
document.documentElement.dir = DIR;
document.documentElement.lang = DIR === 'rtl' ? 'ar' : 'en';

const DAY = 0 as DayOfWeek;
const FULL = { id: 'tpl-full', start: 12 * 60, end: 19 * 60 };

// ── the four real Operations Supervisors, with their canonical colours ──
const DINA = 'adm-dina', ZAINAB = 'adm-zainab', REHAB = 'adm-rehab', ASMAA = 'adm-asmaa';
const COLORS: Record<string, string> = {
  [DINA]: '#E06666',        // red
  [ZAINAB]: '#F9CB9C',      // orange
  [REHAB]: '#C9DAF8',       // light blue
  [ASMAA]: '#93C47D',       // green
};
const mkAdmin = (id: string, name: string, status: 'active' | 'inactive' = 'active') => ({
  id, name, email: '', phone: '', department: 'تشغيل', status,
  permissions: [], colorHex: COLORS[id] ?? null, createdAt: '', updatedAt: '',
});
const supervisors = [
  mkAdmin(DINA, 'Dina'),
  mkAdmin(ZAINAB, 'Zainab'),
  mkAdmin(REHAB, 'Rehab'),
  mkAdmin(ASMAA, 'Asmaa'),
  // A departed Admin: must not be offered for a new student.
  mkAdmin('adm-gone', 'Former Admin', 'inactive'),
] as any[];

const mkTeacher = (id: string, fullName: string) => ({
  id, fullName, phone: '', email: '', nationality: '', joiningDate: null, monthlySalary: 0,
  salaryCurrency: 'EGP', salaryType: 'fixed', teachingMarket: 'arab', specializations: [],
  status: 'active', level: 'silver', notes: '', isDeleted: false, deletedAt: null,
  teacherType: 'shift', branchId: null, maxWeeklyHours: null,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
});
const teachers = [mkTeacher('FT-1', 'Arwa Ahmed')] as any[];

const shiftTemplates = [
  { id: FULL.id, name: 'Full-time', startMinute: FULL.start, endMinute: FULL.end, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timezone: 'Asia/Dubai', isActive: true, createdAt: '', updatedAt: '' },
] as any[];
const shiftAssignments = [
  { id: 'A-FT-1', teacherId: 'FT-1', shiftTemplateId: FULL.id, dayOfWeek: DAY, isActive: true, createdAt: '', updatedAt: '' },
] as any[];
const availability = [
  { teacherId: 'FT-1', dayOfWeek: DAY, startMinute: FULL.start, endMinute: FULL.end, timezone: 'Asia/Dubai', source: 'shift' as const },
];

/**
 * The seeded students, as DATABASE ROWS. They go through the real mapper on
 * the way in, so what the UI reads is what a refresh would actually read.
 *
 *   AHMED  — owned by Dina, and has a lesson, so his colour is visible on the grid
 *   LEGACY — the production reality this feature has to tolerate: a student who
 *            predates the ownership rule and has no Admin. Never auto-assigned.
 */
const row = (over: Record<string, unknown>) => ({
  id: 'x', branch_id: null, full_name: 'X', date_of_birth: null, country: '', timezone: 'Asia/Dubai',
  gender: null, level: '', status: 'active', enrollment_source: '', supervisor_id: null,
  is_returning: false, course_id: null, notes: '', is_deleted: false, deleted_at: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', ...over,
}) as any;

const SEED_ROWS = [
  row({ id: 'stu-ahmed', full_name: 'Ahmed Mohamed', supervisor_id: DINA }),
  row({ id: 'stu-legacy', full_name: 'Legacy Student', supervisor_id: null }),
];

const LESSON_ID = 'L-ahmed';
const lessons = [{
  id: LESSON_ID, branchId: null, teacherId: 'FT-1', courseId: null, dayOfWeek: DAY,
  startMinute: 14 * 60, durationMinutes: 60, endMinute: 15 * 60,
  timezone: 'Asia/Dubai', lifecycleStatus: 'active',
  effectiveFrom: '2026-01-01', effectiveUntil: null, originalTeacherId: 'FT-1',
  sameDaySince: '2026-01-01', sameTimeSince: '2026-01-01', notes: '',
  createdAt: '', updatedAt: '',
  participants: [{ id: `${LESSON_ID}-p`, lessonId: LESSON_ID, studentId: 'stu-ahmed', createdAt: '2026-01-01T00:00:00Z' }],
}] as unknown as LessonWithParticipants[];

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });

/**
 * The stand-in "database": a module-level array of ROWS, written through the
 * real `studentInsertPayload` / `studentUpdatePatch` and read through the real
 * `toStudent`. Nothing about the ownership column is faked, so a passing
 * assertion here is an assertion about the production mapping.
 *
 * It persists across remounts, which is what lets the reload test be a real
 * reload rather than a re-render.
 */
let STORE: any[] = [...SEED_ROWS];
let nextId = 1;

function publish() {
  queryClient.setQueryData(schedulingKeys.students(), STORE.map(toStudent));
}

function createStudent(draft: Omit<Student, 'id' | 'createdAt' | 'updatedAt' | 'isDeleted'>) {
  const inserted = row({
    ...studentInsertPayload(draft),
    id: `stu-new-${nextId++}`,
  });
  STORE = [...STORE, inserted];
  publish();
  return toStudent(inserted);
}

function updateStudent(id: string, updates: Partial<Student>) {
  const patch = studentUpdatePatch(updates);
  STORE = STORE.map((r) => (r.id === id ? { ...r, ...patch } : r));
  publish();
}

publish();
queryClient.setQueryData(schedulingKeys.courses(), []);
queryClient.setQueryData(schedulingKeys.parents(), []);
queryClient.setQueryData(schedulingKeys.studentParents(), []);
queryClient.setQueryData(schedulingKeys.shiftTemplates(), shiftTemplates);
queryClient.setQueryData(schedulingKeys.teacherShiftAssignments(undefined), shiftAssignments);
queryClient.setQueryData(schedulingKeys.grid(DAY), lessons);
queryClient.setQueryData(schedulingKeys.availabilityForDay(DAY), availability);
queryClient.setQueryData(schedulingKeys.exceptionsForDate(nextDateForDayOfWeek(DAY)), []);

useTeacherStore.setState({ teachers } as any);
useSupervisorStore.setState({ supervisors } as any);
useScheduleUiStore.setState({ selectedDay: DAY, searchQuery: '', filters: DEFAULT_FILTERS });

/** Mirrors the Students page: a list, and the form in a dialog. */
function Harness() {
  const students = (queryClient.getQueryData(schedulingKeys.students()) ?? []) as Student[];
  const [, forceRender] = useState(0);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [lastCreatedId, setLastCreatedId] = useState<string | null>(null);

  const refresh = () => forceRender((n) => n + 1);
  const colorByStudentId = supervisorColorByStudentId(students, supervisors as any);
  const adminById = new Map(supervisors.map((s) => [s.id, s]));

  return (
    <div style={{ padding: 8 }} className="space-y-3">
      <ColorLegend interactive />

      <Button size="sm" data-testid="open-create" onClick={() => setCreating(true)}>Add Student</Button>

      {/* The student list, each row stating its owner — the same thing the
          real Students page shows on its cards. */}
      <ul className="space-y-1">
        {students.map((s) => (
          <li key={s.id} data-testid={`row-${s.id}`} className="flex items-center gap-2 text-sm">
            <SupervisorColorDot colorHex={colorByStudentId.get(s.id)} />
            <span data-testid={`row-name-${s.id}`}>{s.fullName}</span>
            <span
              data-testid={`row-admin-${s.id}`}
              data-admin-id={s.supervisorId ?? ''}
              data-admin-color={colorByStudentId.get(s.id) ?? ''}
            >
              {s.supervisorId ? adminById.get(s.supervisorId)?.name : 'Unassigned'}
            </span>
            <Button size="sm" variant="outline" data-testid={`edit-${s.id}`} onClick={() => setEditing(s)}>Edit</Button>
          </li>
        ))}
      </ul>

      <MasterScheduleGrid onEmptyClick={() => {}} onLessonClick={() => {}} onProposeMove={() => {}} />

      {/* What the "database" holds, projected for assertions. Proves the
          relationship is a single id column and that no colour was stored. */}
      <div
        data-testid="db-state"
        data-rows={JSON.stringify(STORE.map((r) => ({ id: r.id, full_name: r.full_name, supervisor_id: r.supervisor_id })))}
        data-columns={JSON.stringify(Object.keys(STORE[0] ?? {}))}
        data-last-created={lastCreatedId ?? ''}
      />

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="w-[calc(100vw-16px)] max-w-2xl max-h-[92vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader><DialogTitle>Add Student</DialogTitle></DialogHeader>
          <StudentForm
            onSubmit={(data) => {
              const created = createStudent(data);
              setLastCreatedId(created.id);
              setCreating(false);
              refresh();
            }}
            onCancel={() => setCreating(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={() => setEditing(null)}>
        <DialogContent className="w-[calc(100vw-16px)] max-w-2xl max-h-[92vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader><DialogTitle>Edit Student</DialogTitle></DialogHeader>
          {editing && (
            <StudentForm
              student={editing}
              onSubmit={(data) => {
                updateStudent(editing.id, data);
                setEditing(null);
                refresh();
              }}
              onCancel={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <div data-testid="ready" />
    </div>
  );
}

/**
 * A RELOAD, not a re-render: the tree is thrown away and rebuilt from the
 * stored rows. If any colour were cached on a student or a lesson, this is
 * where it would come back wrong.
 */
let currentRoot = createRoot(document.getElementById('root')!);
const mount = () => currentRoot.render(
  <QueryClientProvider client={queryClient}><Harness /></QueryClientProvider>
);
mount();

function reload() {
  currentRoot.unmount();
  currentRoot = createRoot(document.getElementById('root')!);
  mount();
}

(window as unknown as Record<string, unknown>).__adminFixtures = {
  dinaId: DINA, zainabId: ZAINAB, rehabId: REHAB, asmaaId: ASMAA,
  colors: COLORS,
  adminNames: ['Dina', 'Zainab', 'Rehab', 'Asmaa'],
  lessonCardTestId: `lesson-card-${LESSON_ID}`,
  ahmedId: 'stu-ahmed',
  legacyId: 'stu-legacy',
  reload,
};

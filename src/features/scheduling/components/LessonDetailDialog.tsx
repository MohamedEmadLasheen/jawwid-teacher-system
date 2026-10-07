import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTeacherStore } from '@/store/teacherStore';
import { useStudents, useUpdateStudent } from '../hooks/useStudents';
import { useCourses } from '../hooks/useCourses';
import { useParentNameByStudentId } from '../hooks/useParents';
import { useApplyScheduleChange, useCheckScheduleConflict } from '../hooks/useScheduleRpc';
import { LessonEditDialog } from './LessonEditDialog';
import { StudentAdminAssignmentList } from './StudentAdminAssignmentList';
import { SupervisorColorDot } from '@/components/ui/SupervisorColorDot';
import { useSupervisorStore } from '@/store/supervisorStore';
import { supervisorColorByStudentId, selectableAdmins } from '../utils/responsibleAdmins';
import {
  resolveStudentAdminRows, blockingAdminStudentIds, pendingAdminWrites,
} from '../utils/studentAdminAssignment';
import { DAYS_OF_WEEK } from '../constants/schedulingConstants';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { SearchableSelect, type SearchableSelectOption } from '@/components/ui/searchable-select';
import { MultiSelectFilter } from './MultiSelectFilter';
import { LessonDurationInput } from './LessonDurationInput';
import { Label } from '@/components/ui/label';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import type { LessonWithParticipants } from '@/services/scheduling/lessons.service';
import type { DayOfWeek } from '@/lib/types';

type LessonDetailDialogProps =
  | {
      mode: 'create';
      teacherId: string;
      dayOfWeek: DayOfWeek;
      startMinute: number;
      onClose: () => void;
      onSaved: () => void;
      onProposeMove?: never;
    }
  | {
      mode: 'edit';
      lesson: LessonWithParticipants;
      onClose: () => void;
      onSaved: () => void;
      /** Still accepted so existing call sites compile unchanged; the edit
       *  card now saves through useLessonActions rather than proposing a
       *  move, so it is no longer read. The grid's drag path still uses its
       *  own onProposeMove and the ChangeSimulatorDialog. */
      onProposeMove?: (lesson: LessonWithParticipants, newTeacherId: string, newStartMinute: number) => void;
    };

/**
 * Create a lesson, or edit one.
 *
 * Edit is delegated to LessonEditDialog, which is scheduling-only: teacher,
 * day, time, duration, an explicit scope, and a separated removal section.
 * The operational features this dialog used to carry in edit mode (session
 * recording, attendance reasons, make-up, the preservation score, participant
 * management, End Lesson) are gone from the card by request. None of that
 * code was deleted — AttendanceSection, MarkAttendanceRow, their hooks and
 * their service all remain, unmounted, for a future Operations surface.
 *
 * Create mode is untouched, and both call sites keep the same props.
 */
export function LessonDetailDialog(props: LessonDetailDialogProps) {
  if (props.mode === 'edit') {
    return (
      <LessonEditDialog lesson={props.lesson} onClose={props.onClose} onSaved={props.onSaved} />
    );
  }
  return <CreateLessonDialog {...props} />;
}

function CreateLessonDialog(props: Extract<LessonDetailDialogProps, { mode: 'create' }>) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const { teachers } = useTeacherStore();
  const { data: students = [] } = useStudents();
  const { data: courses = [] } = useCourses();
  const parentNameByStudentId = useParentNameByStudentId();
  const { supervisors } = useSupervisorStore();
  const applyChange = useApplyScheduleChange();
  const checkConflict = useCheckScheduleConflict();
  const updateStudent = useUpdateStudent();

  const dayOfWeek = props.dayOfWeek;

  // Ready for multi-teacher lessons later — array-shaped state, single-select UI/submission for now.
  const [teacherIds, setTeacherIds] = useState<string[]>([props.teacherId]);
  const teacherId = teacherIds[0];
  const teacher = teachers.find((tc) => tc.id === teacherId);

  const [selectedDays, setSelectedDays] = useState<DayOfWeek[]>([dayOfWeek]);
  const toggleDay = (day: DayOfWeek) => {
    setSelectedDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
    setPreview(null);
  };

  const [courseId, setCourseId] = useState('');
  /**
   * Duration is held as the TEXT the user typed plus the integer it parses to.
   * Keeping only a number could not tell an empty field from a zero, nor hold
   * a half-typed value without snapping it — which is what the fixed dropdown
   * this replaces used to hide.
   */
  const [durationText, setDurationText] = useState('30');
  const [duration, setDuration] = useState<number | undefined>(30);
  const [durationTouched, setDurationTouched] = useState(false);
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ hasConflict: boolean; message: string } | null>(null);

  /**
   * Responsible-Admin choices made in THIS dialog, keyed by student id.
   *
   * Unsaved input layered over `students.supervisor_id` — never a second
   * source of truth. It is written back to the student rows on create, and
   * only for the students it actually changed.
   */
  const [adminDrafts, setAdminDrafts] = useState<Record<string, string>>({});
  const [showAdminErrors, setShowAdminErrors] = useState(false);

  const adminRows = useMemo(
    () => resolveStudentAdminRows(studentIds, students, adminDrafts),
    [studentIds, students, adminDrafts]
  );
  // Blocking requires something to choose — see blockingAdminStudentIds.
  const assignableAdmins = useMemo(() => selectableAdmins(supervisors), [supervisors]);
  const missingAdmins = blockingAdminStudentIds(adminRows, assignableAdmins.length);

  const chooseAdmin = (studentId: string, supervisorId: string) => {
    setAdminDrafts((prev) => ({ ...prev, [studentId]: supervisorId }));
    setShowAdminErrors(false);
  };

  /**
   * The participant set changed, so any previous verdict describes a
   * configuration that is no longer on screen. Same invalidation the
   * per-student toggle did; only the shape of the incoming value differs.
   */
  const setStudentIdsChecked = (ids: string[]) => {
    setStudentIds(ids);
    setPreview(null);
  };

  /**
   * Option lists for the three searchable fields. Each is built from data the
   * dialog has already loaded — no query is issued while searching.
   */
  const teacherOptions = useMemo<SearchableSelectOption[]>(
    () => teachers
      .filter((tc) => !tc.isDeleted)
      .map((tc) => ({ value: tc.id, label: tc.fullName })),
    [teachers]
  );

  const courseOptions = useMemo<SearchableSelectOption[]>(
    () => courses.map((c) => ({
      value: c.id,
      label: isAr ? c.nameAr : c.nameEn,
      // Either spelling finds the course, whichever language is displayed.
      searchText: isAr ? c.nameEn : c.nameAr,
    })),
    [courses, isAr]
  );

  /**
   * A student is findable by their own name, their parent's, or their id —
   * the same three haystacks the local implementation searched.
   *
   * Each row carries its Responsible Admin's colour so ownership is visible
   * while choosing, not only afterwards. The dot is `node`, never `label`, so
   * it stays decoration and out of the search haystack.
   */
  const adminColorByStudentId = useMemo(
    () => supervisorColorByStudentId(students, supervisors),
    [students, supervisors]
  );

  const studentOptions = useMemo(
    () => students
      .filter((st) => !st.isDeleted)
      .map((st) => ({
        id: st.id,
        label: st.fullName,
        searchText: `${parentNameByStudentId.get(st.id) ?? ''} ${st.id}`,
        node: (
          <span className="inline-flex items-center gap-2 min-w-0">
            <SupervisorColorDot colorHex={adminColorByStudentId.get(st.id)} />
            <span className="truncate">{st.fullName}</span>
          </span>
        ),
      })),
    [students, parentNameByStudentId, adminColorByStudentId]
  );

  const handlePreview = async () => {
    // A half-typed duration must not reach the conflict check: it would be
    // answering a question about a lesson that does not exist yet.
    if (duration === undefined) { setDurationTouched(true); return; }
    const result = await checkConflict.mutateAsync({
      teacherId,
      studentIds,
      dayOfWeek: selectedDays[0] ?? dayOfWeek,
      startMinute: props.startMinute,
      durationMinutes: duration,
    });
    setPreview({ hasConflict: result.hasConflict, message: result.message });
  };

  const handleCreate = async () => {
    // The exact integer typed, or no save at all — never a substituted
    // default. The button is disabled too; this is the guard that holds if a
    // submit arrives by any other route.
    if (duration === undefined) { setDurationTouched(true); return; }
    // Ownership first. Every selected student must have a Responsible Admin
    // before a lesson exists for them, and the assignment is written to the
    // STUDENT row — there is no lesson-level admin to write.
    if (missingAdmins.length > 0) {
      setShowAdminErrors(true);
      return;
    }

    // Only the students whose admin actually changed; an existing assignment
    // is preserved untouched, so creating a lesson for already-owned students
    // issues no student write at all.
    const writes = pendingAdminWrites(adminRows);
    for (const write of writes) {
      await updateStudent.mutateAsync({
        id: write.studentId,
        updates: { supervisorId: write.supervisorId },
      });
    }

    // One lesson configuration, applied once per selected day — reuses the
    // exact same create_lesson action per day rather than a new bulk API.
    await Promise.all(selectedDays.map((day) =>
      applyChange.mutateAsync({
        action: 'create_lesson',
        payload: {
          teacher_id: teacherId,
          course_id: courseId || null,
          day_of_week: day,
          start_minute: props.startMinute,
          duration_minutes: duration,
          student_ids: studentIds,
        },
      })
    ));
    props.onSaved();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && props.onClose()}>
      <DialogContent className="w-[calc(100vw-16px)] max-w-lg max-h-[92vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{t('scheduling.createNewLesson')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label>{t('scheduling.teacher')}</Label>
            <SearchableSelect
              /* Dynamic collection: searchable by architecture, not by today's count. */
              searchable
              data-testid="create-teacher"
              value={teacherId}
              onChange={(id) => setTeacherIds([id])}
              options={teacherOptions}
              placeholder={t('scheduling.selectTeacher')}
              searchPlaceholder={t('teachers.search')}
              emptyText={t('common.noResults')}
              aria-label={t('scheduling.teacher')}
            />
          </div>

          <div className="space-y-1">
              <Label>{t('scheduling.days')}</Label>
              <div className="flex flex-wrap gap-3 border rounded-lg p-3">
                {DAYS_OF_WEEK.map((d) => (
                  <label key={d.value} className="flex items-center gap-1.5 text-sm">
                    <Checkbox checked={selectedDays.includes(d.value)} onCheckedChange={() => toggleDay(d.value)} />
                    {t(d.labelKey)}
                  </label>
                ))}
              </div>
            </div>

          <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t('students.course')}</Label>
                <SearchableSelect
                  /* Dynamic collection: searchable by architecture, not by today's count. */
                  searchable
                  data-testid="create-course"
                  value={courseId}
                  onChange={setCourseId}
                  options={courseOptions}
                  placeholder={t('students.coursePending')}
                  searchPlaceholder={t('courses.search')}
                  emptyText={t('common.noResults')}
                  aria-label={t('students.course')}
                />
              </div>
              <div className="space-y-1">
                <LessonDurationInput
                  id="create-duration"
                  data-testid="create-duration"
                  value={durationText}
                  startMinute={props.startMinute}
                  showError={durationTouched}
                  onChange={(text, minutes) => {
                    setDurationText(text);
                    setDuration(minutes);
                    setDurationTouched(true);
                    setPreview(null);
                  }}
                />
              </div>
          </div>

          <div className="space-y-1">
            <Label>{t('scheduling.participants')}</Label>
            <MultiSelectFilter
              data-testid="create-participants"
              className="w-full"
              /* Dynamic collection: searchable by architecture, not by today's count. */
              searchable
              options={studentOptions}
              selectedIds={studentIds}
              onChange={setStudentIdsChecked}
              placeholder={t('scheduling.participants')}
              searchPlaceholder={t('students.search')}
              summaryMode="labels"
            />
          </div>

          {/* Student -> Responsible Admin, one row per selected student.
              Rendered from the same student records the picker above lists,
              so no extra query and no assumption that a group shares an
              Admin. */}
          <StudentAdminAssignmentList
            idPrefix="create"
            rows={adminRows}
            onChange={chooseAdmin}
            showErrors={showAdminErrors}
            disabled={applyChange.isPending || updateStudent.isPending}
          />

          {showAdminErrors && missingAdmins.length > 0 && (
            <div
              data-testid="create-admin-missing"
              role="alert"
              className="flex items-center gap-2 p-3 rounded-lg text-sm bg-red-50 text-red-800 border border-red-200"
            >
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {t('scheduling.responsibleAdmin.missing')}
            </div>
          )}

          {preview && (
            <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${preview.hasConflict ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-green-50 text-green-800 border border-green-200'}`}>
              {preview.hasConflict ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
              {preview.message}
            </div>
          )}

        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handlePreview} disabled={studentIds.length === 0 || duration === undefined}>{t('scheduling.preview')}</Button>
          <Button
            type="button" onClick={handleCreate}
            disabled={studentIds.length === 0 || selectedDays.length === 0 || duration === undefined || (preview !== null && preview.hasConflict)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {t('scheduling.createNewLesson')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTeacherStore } from '@/store/teacherStore';
import { useStudents } from '../hooks/useStudents';
import { useCourses } from '../hooks/useCourses';
import { useParentNameByStudentId } from '../hooks/useParents';
import { useApplyScheduleChange, useCheckScheduleConflict } from '../hooks/useScheduleRpc';
import { LessonEditDialog } from './LessonEditDialog';
import { DAYS_OF_WEEK } from '../constants/schedulingConstants';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { SearchableSelect, type SearchableSelectOption } from '@/components/ui/searchable-select';
import { MultiSelectFilter } from './MultiSelectFilter';
import { Label } from '@/components/ui/label';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import type { LessonWithParticipants } from '@/services/scheduling/lessons.service';
import type { DayOfWeek } from '@/lib/types';

const DURATIONS = [30, 60, 90, 120];

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
  const applyChange = useApplyScheduleChange();
  const checkConflict = useCheckScheduleConflict();

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
  const [duration, setDuration] = useState(30);
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ hasConflict: boolean; message: string } | null>(null);

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

  /** A student is findable by their own name, their parent's, or their id —
   *  the same three haystacks the local implementation searched. */
  const studentOptions = useMemo(
    () => students
      .filter((st) => !st.isDeleted)
      .map((st) => ({
        id: st.id,
        label: st.fullName,
        searchText: `${parentNameByStudentId.get(st.id) ?? ''} ${st.id}`,
      })),
    [students, parentNameByStudentId]
  );

  const handlePreview = async () => {
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
                <Label>{t('scheduling.duration')}</Label>
                <Select value={String(duration)} onValueChange={(v) => { setDuration(Number(v)); setPreview(null); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DURATIONS.map((d) => (
                      <SelectItem key={d} value={String(d)}>{d} {t('courses.minutes')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

          {preview && (
            <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${preview.hasConflict ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-green-50 text-green-800 border border-green-200'}`}>
              {preview.hasConflict ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
              {preview.message}
            </div>
          )}

        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handlePreview} disabled={studentIds.length === 0}>{t('scheduling.preview')}</Button>
          <Button
            type="button" onClick={handleCreate}
            disabled={studentIds.length === 0 || selectedDays.length === 0 || (preview !== null && preview.hasConflict)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {t('scheduling.createNewLesson')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

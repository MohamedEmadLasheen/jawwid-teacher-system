import { useState } from 'react';
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { SearchableSelect, SearchableMultiSelect } from '@/components/ui/searchable-select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
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
  /**
   * Kept in DAYS_OF_WEEK order rather than click order, so the trigger reads
   * "Sunday, Wednesday" however the two were picked, and the lessons are
   * created in week order. Selection itself is unchanged: still a free
   * multi-pick of any subset of the seven days.
   */
  const changeDays = (values: string[]) => {
    const picked = new Set(values.map(Number));
    setSelectedDays(DAYS_OF_WEEK.filter((d) => picked.has(d.value)).map((d) => d.value));
    setPreview(null);
  };

  const [courseId, setCourseId] = useState('');
  const [duration, setDuration] = useState(30);
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ hasConflict: boolean; message: string } | null>(null);

  const changeStudents = (ids: string[]) => {
    setStudentIds(ids);
    setPreview(null);
  };

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
              testId="create-teacher"
              ariaLabel={t('scheduling.teacher')}
              value={teacherId}
              onValueChange={(id) => setTeacherIds([id])}
              placeholder={t('scheduling.teacher')}
              searchPlaceholder={t('scheduling.teacher')}
              options={teachers.filter((tc) => !tc.isDeleted).map((tc) => ({
                value: tc.id, label: tc.fullName, searchText: tc.id,
              }))}
            />
          </div>

          <div className="space-y-1">
              <Label htmlFor="create-days">{t('scheduling.days')}</Label>
              {/* Seven fixed options — over the threshold, so searchable like
                  every other list of its size. Still a multi-pick of any
                  subset of the week; only the control changed. */}
              <SearchableMultiSelect
                id="create-days"
                testId="create-days"
                ariaLabel={t('scheduling.days')}
                values={selectedDays.map(String)}
                onValuesChange={changeDays}
                placeholder="—"
                searchPlaceholder={t('common.search')}
                options={DAYS_OF_WEEK.map((d) => ({ value: String(d.value), label: t(d.labelKey) }))}
              />
            </div>

          <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t('students.course')}</Label>
                <SearchableSelect
                  testId="create-course"
                  ariaLabel={t('students.course')}
                  value={courseId}
                  onValueChange={setCourseId}
                  placeholder={t('students.coursePending')}
                  searchPlaceholder={t('students.course')}
                  options={courses.map((c) => ({
                    value: c.id,
                    label: isAr ? c.nameAr : c.nameEn,
                    // Either language finds the course, whichever the UI shows.
                    searchText: `${c.nameAr} ${c.nameEn}`,
                  }))}
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
            {/* Participants are a multi-select over every student in the
                academy — thousands of rows. Searchable by student name,
                parent name or id, as before. */}
            <SearchableMultiSelect
              testId="create-participants"
              ariaLabel={t('scheduling.participants')}
              values={studentIds}
              onValuesChange={changeStudents}
              placeholder="—"
              searchPlaceholder={t('scheduling.searchStudentParentId')}
              options={students.filter((s) => !s.isDeleted).map((s) => ({
                value: s.id,
                label: s.fullName,
                searchText: `${parentNameByStudentId.get(s.id) ?? ''} ${s.id}`,
              }))}
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

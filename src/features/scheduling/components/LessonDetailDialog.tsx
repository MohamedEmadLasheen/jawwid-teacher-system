import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTeacherStore } from '@/store/teacherStore';
import { useStudents } from '../hooks/useStudents';
import { useCourses } from '../hooks/useCourses';
import { useParentNameByStudentId } from '../hooks/useParents';
import { useApplyScheduleChange, useCheckScheduleConflict } from '../hooks/useScheduleRpc';
import { useCurrentPrimaryTeachers } from '../hooks/usePrimaryTeacherAssignments';
import { TeacherPreservationScoreBadge } from './TeacherPreservationScoreBadge';
import { DAYS_OF_WEEK } from '../constants/schedulingConstants';
import { labelToMinute, minuteToLabel } from '../utils/timeGrid';
import { nextDateForDayOfWeek } from '../utils/nextDateForDayOfWeek';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from '@/components/ui/command';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { CheckCircle2, AlertTriangle, X, ChevronsUpDown } from 'lucide-react';
import type { LessonWithParticipants } from '@/services/scheduling/lessons.service';
import type { DayOfWeek, Teacher, Student } from '@/lib/types';

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
      onProposeMove: (lesson: LessonWithParticipants, newTeacherId: string, newStartMinute: number) => void;
    };

/** Searchable teacher combobox — search by name or raw ID. Kept as a
 * single-select control for now; state shape upstream (teacherIds: string[])
 * is ready for multi-teacher lessons if that's ever supported, without any
 * change needed here beyond widening selection. */
function TeacherSearchSelect({ teachers, value, onChange, placeholder }: {
  teachers: Teacher[]; value: string; onChange: (id: string) => void; placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = teachers.find((t) => t.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
          <span className="truncate">{selected?.fullName ?? placeholder}</span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command filter={(value, search) => {
          const teacher = teachers.find((t) => t.id === value);
          if (!teacher) return 0;
          const haystack = `${teacher.fullName} ${teacher.id}`.toLowerCase();
          return haystack.includes(search.toLowerCase()) ? 1 : 0;
        }}>
          <CommandInput placeholder={placeholder} />
          <CommandList>
            <CommandEmpty>—</CommandEmpty>
            <CommandGroup>
              {teachers.map((t) => (
                <CommandItem key={t.id} value={t.id} onSelect={() => { onChange(t.id); setOpen(false); }}>
                  {t.fullName}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Searchable student multi-select — search by student name, parent name, or raw ID. */
function StudentSearchSelect({ students, parentNameByStudentId, selectedIds, onToggle }: {
  students: Student[];
  parentNameByStudentId: Map<string, string>;
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
          <span className="truncate">
            {selectedIds.length > 0
              ? students.filter((s) => selectedIds.includes(s.id)).map((s) => s.fullName).join(', ')
              : '—'}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command filter={(value, search) => {
          const student = students.find((s) => s.id === value);
          if (!student) return 0;
          const parentName = parentNameByStudentId.get(student.id) ?? '';
          const haystack = `${student.fullName} ${parentName} ${student.id}`.toLowerCase();
          return haystack.includes(search.toLowerCase()) ? 1 : 0;
        }}>
          <CommandInput placeholder="Search student, parent, or ID…" />
          <CommandList className="max-h-52">
            <CommandEmpty>—</CommandEmpty>
            <CommandGroup>
              {students.map((s) => (
                <CommandItem key={s.id} value={s.id} onSelect={() => onToggle(s.id)}>
                  <Checkbox checked={selectedIds.includes(s.id)} className="me-2" />
                  {s.fullName}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function LessonDetailDialog(props: LessonDetailDialogProps) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const { teachers } = useTeacherStore();
  const { data: students = [] } = useStudents();
  const { data: courses = [] } = useCourses();
  const parentNameByStudentId = useParentNameByStudentId();
  const applyChange = useApplyScheduleChange();
  const checkConflict = useCheckScheduleConflict();

  const isCreate = props.mode === 'create';
  const dayOfWeek = isCreate ? props.dayOfWeek : (props.lesson.dayOfWeek as DayOfWeek);

  // Ready for multi-teacher lessons later — array-shaped state, single-select UI/submission for now.
  const [teacherIds, setTeacherIds] = useState<string[]>([isCreate ? props.teacherId : props.lesson.teacherId]);
  const teacherId = teacherIds[0];
  const teacher = teachers.find((tc) => tc.id === teacherId);

  // Task D — confirmed Primary Teacher is the first scheduling priority: when
  // changing an existing lesson's teacher, the student's confirmed Primary
  // Teacher (if any, and if all participants share the same one) is surfaced
  // and listed first — never auto-applied, purely a prioritized/labeled
  // option a human still has to pick and preview like any other teacher.
  const participantStudentIds = !isCreate ? props.lesson.participants.map((p) => p.studentId) : [];
  const { data: primaryTeacherByStudent } = useCurrentPrimaryTeachers(participantStudentIds);
  const primaryTeacherIds = new Set(
    participantStudentIds.map((id) => primaryTeacherByStudent?.get(id)).filter((id): id is string => !!id)
  );
  const singlePrimaryTeacherId = primaryTeacherIds.size === 1 ? [...primaryTeacherIds][0] : null;
  const primaryTeacher = singlePrimaryTeacherId ? teachers.find((tc) => tc.id === singlePrimaryTeacherId) : null;
  const changeTeacherOptions = singlePrimaryTeacherId
    ? [
        ...teachers.filter((tc) => !tc.isDeleted && tc.id === singlePrimaryTeacherId),
        ...teachers.filter((tc) => !tc.isDeleted && tc.id !== singlePrimaryTeacherId),
      ]
    : teachers.filter((tc) => !tc.isDeleted);

  const [selectedDays, setSelectedDays] = useState<DayOfWeek[]>([dayOfWeek]);
  const toggleDay = (day: DayOfWeek) => {
    setSelectedDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
    setPreview(null);
  };

  const [courseId, setCourseId] = useState(isCreate ? '' : props.lesson.courseId ?? '');
  const [duration, setDuration] = useState(isCreate ? 30 : props.lesson.durationMinutes);
  const [studentIds, setStudentIds] = useState<string[]>(isCreate ? [] : props.lesson.participants.map((p) => p.studentId));
  const [preview, setPreview] = useState<{ hasConflict: boolean; message: string } | null>(null);
  const [newTeacherId, setNewTeacherId] = useState('');
  const [newTimeLabel, setNewTimeLabel] = useState(!isCreate ? minuteToLabel(props.lesson.startMinute) : '');

  const toggleStudent = (id: string) => {
    setStudentIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
    setPreview(null);
  };

  const handlePreview = async () => {
    const result = await checkConflict.mutateAsync({
      teacherId,
      studentIds,
      dayOfWeek: selectedDays[0] ?? dayOfWeek,
      startMinute: isCreate ? props.startMinute : props.lesson.startMinute,
      durationMinutes: duration,
    });
    setPreview({ hasConflict: result.hasConflict, message: result.message });
  };

  const handleCreate = async () => {
    if (!isCreate) return;
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

  const handleCancelOccurrence = async () => {
    if (isCreate) return;
    await applyChange.mutateAsync({
      action: 'cancel_occurrence',
      payload: { lesson_id: props.lesson.id, occurrence_date: nextDateForDayOfWeek(dayOfWeek) },
    });
    props.onSaved();
  };

  const handleEndLesson = async () => {
    if (isCreate) return;
    await applyChange.mutateAsync({ action: 'end_lesson', payload: { lesson_id: props.lesson.id } });
    props.onSaved();
  };

  const handleRemoveParticipant = async (studentId: string) => {
    if (isCreate) return;
    await applyChange.mutateAsync({ action: 'remove_participant', payload: { lesson_id: props.lesson.id, student_id: studentId } });
    props.onSaved();
  };

  const handleAddParticipant = async (studentId: string) => {
    if (isCreate) return;
    await applyChange.mutateAsync({ action: 'add_participant', payload: { lesson_id: props.lesson.id, student_id: studentId } });
    props.onSaved();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && props.onClose()}>
      <DialogContent className="w-[calc(100vw-16px)] max-w-lg max-h-[92vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isCreate ? t('scheduling.createNewLesson') : t('scheduling.editLesson')}
            {!isCreate && <TeacherPreservationScoreBadge lessonId={props.lesson.id} />}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {isCreate ? (
            <div className="space-y-1">
              <Label>{t('scheduling.teacher')}</Label>
              <TeacherSearchSelect
                teachers={teachers.filter((tc) => !tc.isDeleted)}
                value={teacherId}
                onChange={(id) => setTeacherIds([id])}
                placeholder={t('scheduling.teacher')}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {teacher?.fullName} · {t(DAYS_OF_WEEK.find((d) => d.value === dayOfWeek)!.labelKey)}
              {` · ${minuteToLabel(props.lesson.startMinute)}–${minuteToLabel(props.lesson.endMinute)}`}
            </p>
          )}

          {isCreate && (
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
          )}

          {isCreate && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t('students.course')}</Label>
                <Select value={courseId} onValueChange={setCourseId}>
                  <SelectTrigger><SelectValue placeholder={t('students.coursePending')} /></SelectTrigger>
                  <SelectContent>
                    {courses.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{isAr ? c.nameAr : c.nameEn}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
          )}

          <div className="space-y-1">
            <Label>{t('scheduling.participants')}</Label>
            {isCreate ? (
              <StudentSearchSelect
                students={students.filter((s) => !s.isDeleted)}
                parentNameByStudentId={parentNameByStudentId}
                selectedIds={studentIds}
                onToggle={toggleStudent}
              />
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {props.lesson.participants.map((p) => {
                    const student = students.find((s) => s.id === p.studentId);
                    return (
                      <Badge key={p.id} variant="outline" className="gap-1">
                        {student?.fullName ?? '—'}
                        <button type="button" onClick={() => handleRemoveParticipant(p.studentId)}><X className="h-3 w-3" /></button>
                      </Badge>
                    );
                  })}
                </div>
                <Select value="" onValueChange={handleAddParticipant}>
                  <SelectTrigger className="h-9"><SelectValue placeholder={t('scheduling.addParticipant')} /></SelectTrigger>
                  <SelectContent>
                    {students.filter((s) => !s.isDeleted && !props.lesson.participants.some((p) => p.studentId === s.id)).map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.fullName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {isCreate && preview && (
            <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${preview.hasConflict ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-green-50 text-green-800 border border-green-200'}`}>
              {preview.hasConflict ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
              {preview.message}
            </div>
          )}

          {!isCreate && singlePrimaryTeacherId && (
            <p className="text-xs text-muted-foreground">
              {singlePrimaryTeacherId === teacherId
                ? t('scheduling.withPrimaryTeacher')
                : t('scheduling.confirmedPrimaryTeacher', { teacher: primaryTeacher?.fullName ?? '—' })}
            </p>
          )}

          {!isCreate && (
            <div className="space-y-3 border-t pt-3">
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label>{t('scheduling.changeTeacher')}</Label>
                  <Select value={newTeacherId} onValueChange={setNewTeacherId}>
                    <SelectTrigger><SelectValue placeholder={teacher?.fullName} /></SelectTrigger>
                    <SelectContent>
                      {changeTeacherOptions.map((tc) => (
                        <SelectItem key={tc.id} value={tc.id}>
                          {tc.fullName}{tc.id === singlePrimaryTeacherId ? ` (${t('scheduling.primaryTeacher')})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button" variant="outline"
                  disabled={!newTeacherId || newTeacherId === teacherId}
                  onClick={() => props.onProposeMove(props.lesson, newTeacherId, props.lesson.startMinute)}
                >
                  {t('scheduling.preview')}
                </Button>
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label>{t('scheduling.changeTime')}</Label>
                  <Input type="time" value={newTimeLabel} onChange={(e) => setNewTimeLabel(e.target.value)} />
                </div>
                <Button
                  type="button" variant="outline"
                  disabled={!newTimeLabel || labelToMinute(newTimeLabel) === props.lesson.startMinute}
                  onClick={() => props.onProposeMove(props.lesson, teacherId, labelToMinute(newTimeLabel))}
                >
                  {t('scheduling.preview')}
                </Button>
              </div>
              <div className="flex gap-2 flex-wrap pt-1">
                <Button type="button" variant="outline" size="sm" onClick={handleCancelOccurrence}>{t('scheduling.cancelOccurrence')}</Button>
                <Button type="button" variant="outline" size="sm" className="text-red-600" onClick={handleEndLesson}>{t('scheduling.endLesson')}</Button>
              </div>
            </div>
          )}
        </div>

        {isCreate && (
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
        )}
      </DialogContent>
    </Dialog>
  );
}

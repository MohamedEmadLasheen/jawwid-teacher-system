import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTeacherStore } from '@/store/teacherStore';
import { useStudents } from '../hooks/useStudents';
import { useCourses } from '../hooks/useCourses';
import { useApplyScheduleChange, useCheckScheduleConflict } from '../hooks/useScheduleRpc';
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
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { CheckCircle2, AlertTriangle, X, Plus } from 'lucide-react';
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
      onProposeMove: (lesson: LessonWithParticipants, newTeacherId: string, newStartMinute: number) => void;
    };

export function LessonDetailDialog(props: LessonDetailDialogProps) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const { teachers } = useTeacherStore();
  const { data: students = [] } = useStudents();
  const { data: courses = [] } = useCourses();
  const applyChange = useApplyScheduleChange();
  const checkConflict = useCheckScheduleConflict();

  const isCreate = props.mode === 'create';
  const teacherId = isCreate ? props.teacherId : props.lesson.teacherId;
  const dayOfWeek = isCreate ? props.dayOfWeek : (props.lesson.dayOfWeek as DayOfWeek);
  const teacher = teachers.find((tc) => tc.id === teacherId);

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
      dayOfWeek,
      startMinute: isCreate ? props.startMinute : props.lesson.startMinute,
      durationMinutes: duration,
    });
    setPreview({ hasConflict: result.hasConflict, message: result.message });
  };

  const handleCreate = async () => {
    if (!isCreate) return;
    await applyChange.mutateAsync({
      action: 'create_lesson',
      payload: {
        teacher_id: teacherId,
        course_id: courseId || null,
        day_of_week: dayOfWeek,
        start_minute: props.startMinute,
        duration_minutes: duration,
        student_ids: studentIds,
      },
    });
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
          <p className="text-sm text-muted-foreground">
            {teacher?.fullName} · {t(DAYS_OF_WEEK.find((d) => d.value === dayOfWeek)!.labelKey)}
            {!isCreate && ` · ${minuteToLabel(props.lesson.startMinute)}–${minuteToLabel(props.lesson.endMinute)}`}
          </p>

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
              <div className="flex flex-wrap gap-3 max-h-40 overflow-y-auto border rounded-lg p-3">
                {students.filter((s) => !s.isDeleted).map((s) => (
                  <label key={s.id} className="flex items-center gap-1.5 text-sm">
                    <Checkbox checked={studentIds.includes(s.id)} onCheckedChange={() => toggleStudent(s.id)} />
                    {s.fullName}
                  </label>
                ))}
              </div>
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

          {!isCreate && (
            <div className="space-y-3 border-t pt-3">
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label>{t('scheduling.changeTeacher')}</Label>
                  <Select value={newTeacherId} onValueChange={setNewTeacherId}>
                    <SelectTrigger><SelectValue placeholder={teacher?.fullName} /></SelectTrigger>
                    <SelectContent>
                      {teachers.filter((tc) => !tc.isDeleted).map((tc) => (
                        <SelectItem key={tc.id} value={tc.id}>{tc.fullName}</SelectItem>
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
              disabled={studentIds.length === 0 || (preview !== null && preview.hasConflict)}
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

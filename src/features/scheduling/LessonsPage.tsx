import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTeacherStore } from '@/store/teacherStore';
import { useStudents } from './hooks/useStudents';
import { useCourses } from './hooks/useCourses';
import { useLessons, useLessonParticipants } from './hooks/useLessons';
import { useCheckScheduleConflict, useApplyScheduleChange } from './hooks/useScheduleRpc';
import { DAYS_OF_WEEK } from './constants/schedulingConstants';
import { labelToMinute, minuteToDisplayLabel } from './utils/timeGrid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import type { DayOfWeek } from '@/lib/types';

const DURATIONS = [30, 60, 90, 120];

export function LessonsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const { teachers } = useTeacherStore();
  const { data: students = [] } = useStudents();
  const { data: courses = [] } = useCourses();
  const { data: lessons = [], isLoading } = useLessons();
  const { data: participants = [] } = useLessonParticipants();
  const checkConflict = useCheckScheduleConflict();
  const applyChange = useApplyScheduleChange();

  const [teacherId, setTeacherId] = useState('');
  const [courseId, setCourseId] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState<DayOfWeek>(0);
  const [startLabel, setStartLabel] = useState('16:00');
  const [duration, setDuration] = useState(30);
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ hasConflict: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleStudent = (id: string) => {
    setStudentIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
    setPreview(null);
  };

  const handlePreview = async () => {
    if (!teacherId || studentIds.length === 0) return;
    const result = await checkConflict.mutateAsync({
      teacherId,
      studentIds,
      dayOfWeek,
      startMinute: labelToMinute(startLabel),
      durationMinutes: duration,
    });
    setPreview({ hasConflict: result.hasConflict, message: result.message });
  };

  const handleCreate = async () => {
    if (!teacherId || studentIds.length === 0) return;
    setError(null);
    try {
      await applyChange.mutateAsync({
        action: 'create_lesson',
        payload: {
          teacher_id: teacherId,
          course_id: courseId || null,
          day_of_week: dayOfWeek,
          start_minute: labelToMinute(startLabel),
          duration_minutes: duration,
          student_ids: studentIds,
        },
      });
      setStudentIds([]);
      setPreview(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : (e as { message?: string })?.message ?? 'Failed to create the lesson.';
      setError(message);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl sm:text-2xl font-bold text-primary">{t('scheduling.lessonsInternal')}</h1>
      <p className="text-xs text-muted-foreground">{t('scheduling.lessonsInternalHint')}</p>

      <Card>
        <CardHeader><CardTitle className="text-base">{t('scheduling.createLesson')}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>{t('nav.teachers')}</Label>
              <Select value={teacherId} onValueChange={(v) => { setTeacherId(v); setPreview(null); }}>
                <SelectTrigger><SelectValue placeholder={t('nav.teachers')} /></SelectTrigger>
                <SelectContent>
                  {teachers.filter((tc) => !tc.isDeleted).map((tc) => (
                    <SelectItem key={tc.id} value={tc.id}>{tc.fullName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
              <Label>{t('scheduling.day.sunday')}</Label>
              <Select value={String(dayOfWeek)} onValueChange={(v) => { setDayOfWeek(Number(v) as DayOfWeek); setPreview(null); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DAYS_OF_WEEK.map((d) => (
                    <SelectItem key={d.value} value={String(d.value)}>{t(d.labelKey)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t('scheduling.startTime')}</Label>
              <Input type="time" value={startLabel} onChange={(e) => { setStartLabel(e.target.value); setPreview(null); }} />
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
            <Label>{t('nav.students')}</Label>
            <div className="flex flex-wrap gap-3 max-h-40 overflow-y-auto border rounded-lg p-3">
              {students.filter((s) => !s.isDeleted).map((s) => (
                <label key={s.id} className="flex items-center gap-1.5 text-sm">
                  <Checkbox checked={studentIds.includes(s.id)} onCheckedChange={() => toggleStudent(s.id)} />
                  {s.fullName}
                </label>
              ))}
              {students.length === 0 && <p className="text-xs text-muted-foreground">{t('students.noStudents')}</p>}
            </div>
          </div>

          {preview && (
            <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${preview.hasConflict ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-green-50 text-green-800 border border-green-200'}`}>
              {preview.hasConflict ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
              {preview.message}
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg text-sm bg-red-50 text-red-800 border border-red-200">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={handlePreview} disabled={!teacherId || studentIds.length === 0}>
              {t('scheduling.preview')}
            </Button>
            <Button
              type="button"
              onClick={handleCreate}
              disabled={!teacherId || studentIds.length === 0 || (preview !== null && preview.hasConflict)}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {t('scheduling.createLesson')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{t('scheduling.lessonsInternal')} ({lessons.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {!isLoading && lessons.length === 0 && <p className="text-sm text-muted-foreground">{t('common.noData')}</p>}
          {lessons.map((lesson) => {
            const teacher = teachers.find((tc) => tc.id === lesson.teacherId);
            const course = courses.find((c) => c.id === lesson.courseId);
            const lessonStudentIds = participants.filter((p) => p.lessonId === lesson.id).map((p) => p.studentId);
            const lessonStudents = students.filter((s) => lessonStudentIds.includes(s.id));
            return (
              <div key={lesson.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border text-sm">
                <div>
                  <p className="font-medium">{teacher?.fullName ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">
                    {t(DAYS_OF_WEEK.find((d) => d.value === lesson.dayOfWeek)!.labelKey)} · {minuteToDisplayLabel(lesson.startMinute)}–{minuteToDisplayLabel(lesson.endMinute)} ·{' '}
                    {course ? (isAr ? course.nameAr : course.nameEn) : t('students.coursePending')}
                  </p>
                  <p className="text-xs text-muted-foreground">{lessonStudents.map((s) => s.fullName).join(', ') || '—'}</p>
                </div>
                <Badge variant="outline">{t(`scheduling.lifecycle.${lesson.lifecycleStatus}`)}</Badge>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

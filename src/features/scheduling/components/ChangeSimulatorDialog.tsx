import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTeacherStore } from '@/store/teacherStore';
import { useCheckScheduleConflict, useApplyScheduleChange } from '../hooks/useScheduleRpc';
import { minuteToDisplayLabel } from '../utils/timeGrid';
import { nextDateForDayOfWeek } from '../utils/nextDateForDayOfWeek';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import type { LessonWithParticipants } from '@/services/scheduling/lessons.service';
import type { DayOfWeek } from '@/lib/types';

interface ChangeSimulatorDialogProps {
  lesson: LessonWithParticipants;
  proposedTeacherId: string;
  proposedStartMinute: number;
  onClose: () => void;
  onConfirmed: () => void;
}

export function ChangeSimulatorDialog({ lesson, proposedTeacherId, proposedStartMinute, onClose, onConfirmed }: ChangeSimulatorDialogProps) {
  const { t } = useTranslation();
  const { teachers } = useTeacherStore();
  const checkConflict = useCheckScheduleConflict();
  const applyChange = useApplyScheduleChange();
  const [scope, setScope] = useState<'this_occurrence' | 'all_future'>('this_occurrence');

  useEffect(() => {
    checkConflict.mutate({
      teacherId: proposedTeacherId,
      studentIds: lesson.participants.map((p) => p.studentId),
      dayOfWeek: lesson.dayOfWeek,
      startMinute: proposedStartMinute,
      durationMinutes: lesson.durationMinutes,
      excludeLessonId: lesson.id,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id, proposedTeacherId, proposedStartMinute]);

  const teacherChanged = proposedTeacherId !== lesson.teacherId;
  const timeChanged = proposedStartMinute !== lesson.startMinute;
  const movingAwayFromOriginal = teacherChanged && lesson.teacherId === lesson.originalTeacherId;
  const proposedTeacher = teachers.find((tc) => tc.id === proposedTeacherId);
  const result = checkConflict.data;

  const handleConfirm = async () => {
    await applyChange.mutateAsync({
      action: 'move_lesson',
      payload: {
        lesson_id: lesson.id,
        new_teacher_id: teacherChanged ? proposedTeacherId : undefined,
        new_start_minute: timeChanged ? proposedStartMinute : undefined,
        scope,
        occurrence_date: scope === 'this_occurrence' ? nextDateForDayOfWeek(lesson.dayOfWeek as DayOfWeek) : undefined,
      },
    });
    onConfirmed();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t('scheduling.moveLesson')}</DialogTitle></DialogHeader>

        <div className="space-y-3">
          <div className="text-sm space-y-1">
            {teacherChanged && (
              <p>{t('scheduling.changeTeacher')}: <strong>{proposedTeacher?.fullName ?? '—'}</strong></p>
            )}
            {timeChanged && (
              <p>{t('scheduling.changeTime')}: <strong>{minuteToDisplayLabel(proposedStartMinute)}</strong></p>
            )}
            {movingAwayFromOriginal && (
              <p className="text-amber-700 text-xs">⚠ {t('scheduling.preservationScore')}: this moves away from the original teacher.</p>
            )}
          </div>

          {checkConflict.isPending ? (
            <p className="text-sm text-muted-foreground">…</p>
          ) : result ? (
            <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${result.hasConflict ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-green-50 text-green-800 border border-green-200'}`}>
              {result.hasConflict ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
              {result.hasConflict ? t('scheduling.conflictDetected') : t('scheduling.safe')}: {result.message}
            </div>
          ) : null}

          <div className="space-y-2">
            <RadioGroup value={scope} onValueChange={(v) => setScope(v as 'this_occurrence' | 'all_future')}>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="this_occurrence" />
                {t('scheduling.thisOccurrence')}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="all_future" />
                {t('scheduling.allFuture')}
              </label>
            </RadioGroup>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={checkConflict.isPending || result?.hasConflict || applyChange.isPending}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {t('scheduling.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

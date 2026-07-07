import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { DayOfWeek } from '@/lib/types';
import { DAYS_OF_WEEK } from '../constants/schedulingConstants';
import { labelToMinute, minuteToLabel } from '../utils/timeGrid';
import {
  useTeacherAvailability, useCreateTeacherAvailability, useDeleteTeacherAvailability,
} from '../hooks/useTeacherAvailability';
import {
  useShiftTemplates, useTeacherShiftAssignments, useAssignTeacherShift, useUnassignTeacherShift,
} from '../hooks/useShiftTemplates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, X } from 'lucide-react';

interface TeacherAvailabilityTabProps {
  teacherId: string;
  teacherType: 'hourly' | 'shift';
}

export function TeacherAvailabilityTab({ teacherId, teacherType }: TeacherAvailabilityTabProps) {
  return teacherType === 'hourly'
    ? <HourlyAvailabilityEditor teacherId={teacherId} />
    : <ShiftAssignmentEditor teacherId={teacherId} />;
}

function HourlyAvailabilityEditor({ teacherId }: { teacherId: string }) {
  const { t } = useTranslation();
  const { data: blocks = [] } = useTeacherAvailability(teacherId);
  const createBlock = useCreateTeacherAvailability();
  const deleteBlock = useDeleteTeacherAvailability();

  const [dayOfWeek, setDayOfWeek] = useState<DayOfWeek>(0);
  const [startLabel, setStartLabel] = useState('16:00');
  const [endLabel, setEndLabel] = useState('18:00');

  const handleAdd = () => {
    createBlock.mutate({
      teacherId,
      dayOfWeek,
      startMinute: labelToMinute(startLabel),
      endMinute: labelToMinute(endLabel),
      timezone: 'Asia/Dubai',
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {blocks.length === 0 && <p className="text-xs text-muted-foreground">{t('scheduling.noAvailability')}</p>}
        {blocks.map((b) => (
          <Badge key={b.id} variant="outline" className="gap-1 py-1">
            {t(DAYS_OF_WEEK.find((d) => d.value === b.dayOfWeek)!.labelKey)} · {minuteToLabel(b.startMinute)}–{minuteToLabel(b.endMinute)}
            <button type="button" onClick={() => deleteBlock.mutate(b.id)}>
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Select value={String(dayOfWeek)} onValueChange={(v) => setDayOfWeek(Number(v) as DayOfWeek)}>
          <SelectTrigger className="h-9 text-sm w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {DAYS_OF_WEEK.map((d) => (
              <SelectItem key={d.value} value={String(d.value)}>{t(d.labelKey)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="time" value={startLabel} onChange={(e) => setStartLabel(e.target.value)} className="h-9 w-28" />
        <span className="text-xs text-muted-foreground">{t('scheduling.to')}</span>
        <Input type="time" value={endLabel} onChange={(e) => setEndLabel(e.target.value)} className="h-9 w-28" />
        <Button type="button" size="sm" onClick={handleAdd}>
          <Plus className="h-4 w-4 me-1" />
          {t('scheduling.addBlock')}
        </Button>
      </div>
    </div>
  );
}

function ShiftAssignmentEditor({ teacherId }: { teacherId: string }) {
  const { t } = useTranslation();
  const { data: templates = [] } = useShiftTemplates();
  const { data: assignments = [] } = useTeacherShiftAssignments(teacherId);
  const assignShift = useAssignTeacherShift();
  const unassignShift = useUnassignTeacherShift();

  const [dayOfWeek, setDayOfWeek] = useState<DayOfWeek>(0);
  const [shiftTemplateId, setShiftTemplateId] = useState('');

  const handleAssign = () => {
    if (!shiftTemplateId) return;
    assignShift.mutate({ teacherId, shiftTemplateId, dayOfWeek });
    setShiftTemplateId('');
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {assignments.length === 0 && <p className="text-xs text-muted-foreground">{t('scheduling.noShiftAssignments')}</p>}
        {assignments.map((a) => {
          const template = templates.find((s) => s.id === a.shiftTemplateId);
          return (
            <Badge key={a.id} variant="outline" className="gap-1 py-1">
              {t(DAYS_OF_WEEK.find((d) => d.value === a.dayOfWeek)!.labelKey)} · {template?.name ?? '—'}
              <button type="button" onClick={() => unassignShift.mutate(a.id)}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Select value={String(dayOfWeek)} onValueChange={(v) => setDayOfWeek(Number(v) as DayOfWeek)}>
          <SelectTrigger className="h-9 text-sm w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {DAYS_OF_WEEK.map((d) => (
              <SelectItem key={d.value} value={String(d.value)}>{t(d.labelKey)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={shiftTemplateId} onValueChange={setShiftTemplateId}>
          <SelectTrigger className="h-9 text-sm w-48"><SelectValue placeholder={t('scheduling.selectShift')} /></SelectTrigger>
          <SelectContent>
            {templates.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name} ({minuteToLabel(s.startMinute)}–{minuteToLabel(s.endMinute)})</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" size="sm" onClick={handleAssign} disabled={!shiftTemplateId}>
          <Plus className="h-4 w-4 me-1" />
          {t('scheduling.assign')}
        </Button>
      </div>

      <Link to="/shift-templates" className="text-xs text-primary underline">
        {t('scheduling.manageShiftTemplates')}
      </Link>
    </div>
  );
}

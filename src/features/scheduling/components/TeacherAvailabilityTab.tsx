import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { DayOfWeek } from '@/lib/types';
import { DAYS_OF_WEEK } from '../constants/schedulingConstants';
import { labelToMinute, minuteToDisplayLabel } from '../utils/timeGrid';
import {
  useTeacherAvailability, useCreateTeacherAvailability, useDeleteTeacherAvailability,
} from '../hooks/useTeacherAvailability';
import {
  useShiftTemplates, useTeacherShiftAssignments, useAssignTeacherShift, useUnassignTeacherShift,
} from '../hooks/useShiftTemplates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useDayOptions } from '../hooks/useDayOptions';
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
  const dayOptions = useDayOptions();
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
            {t(DAYS_OF_WEEK.find((d) => d.value === b.dayOfWeek)!.labelKey)} · {minuteToDisplayLabel(b.startMinute)}–{minuteToDisplayLabel(b.endMinute)}
            <button type="button" onClick={() => deleteBlock.mutate(b.id)}>
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <SearchableSelect
          className="h-9 text-sm w-36"
          value={String(dayOfWeek)}
          onChange={(v) => setDayOfWeek(Number(v) as DayOfWeek)}
          options={dayOptions}
          searchPlaceholder={t('scheduling.dayColumn')}
          emptyText={t('common.noResults')}
          aria-label={t('scheduling.dayColumn')}
        />
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
  const dayOptions = useDayOptions();
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
        <SearchableSelect
          className="h-9 text-sm w-36"
          value={String(dayOfWeek)}
          onChange={(v) => setDayOfWeek(Number(v) as DayOfWeek)}
          options={dayOptions}
          searchPlaceholder={t('scheduling.dayColumn')}
          emptyText={t('common.noResults')}
          aria-label={t('scheduling.dayColumn')}
        />
        <SearchableSelect
          className="h-9 text-sm w-48"
          value={shiftTemplateId}
          onChange={setShiftTemplateId}
          /* Dynamic collection: searchable by architecture, not by today's count. */
          searchable
          options={templates.map((s) => ({
            value: s.id,
            label: `${s.name} (${minuteToDisplayLabel(s.startMinute)}–${minuteToDisplayLabel(s.endMinute)})`,
          }))}
          placeholder={t('scheduling.selectShift')}
          searchPlaceholder={t('scheduling.selectShift')}
          emptyText={t('common.noResults')}
          aria-label={t('scheduling.selectShift')}
        />
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

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ShiftTemplate } from '@/lib/types';
import { labelToMinute, minuteToLabel } from '../utils/timeGrid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface ShiftTemplateFormProps {
  template?: ShiftTemplate;
  onSubmit: (data: Omit<ShiftTemplate, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onCancel: () => void;
}

export function ShiftTemplateForm({ template, onSubmit, onCancel }: ShiftTemplateFormProps) {
  const { t } = useTranslation();

  const [form, setForm] = useState({
    name: template?.name ?? '',
    startLabel: template ? minuteToLabel(template.startMinute) : '09:00',
    endLabel: template ? minuteToLabel(template.endMinute) : '13:00',
    timezone: template?.timezone ?? 'Asia/Dubai',
    isActive: template?.isActive ?? true,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name: form.name,
      startMinute: labelToMinute(form.startLabel),
      endMinute: labelToMinute(form.endLabel),
      timezone: form.timezone,
      isActive: form.isActive,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <Label>{t('scheduling.shiftName')} *</Label>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>{t('scheduling.startTime')}</Label>
          <Input type="time" value={form.startLabel} onChange={(e) => setForm({ ...form, startLabel: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>{t('scheduling.endTime')}</Label>
          <Input type="time" value={form.endLabel} onChange={(e) => setForm({ ...form, endLabel: e.target.value })} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
        <Label>{t('courses.active')}</Label>
      </div>
      <div className="flex gap-3 pt-2">
        <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground">{t('common.save')}</Button>
        <Button type="button" variant="outline" onClick={onCancel}>{t('common.cancel')}</Button>
      </div>
    </form>
  );
}

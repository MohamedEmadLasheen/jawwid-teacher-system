import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Student, StudentGender, StudentStatus } from '@/lib/types';
import { useSupervisorStore } from '@/store/supervisorStore';
import { useCourses } from '../hooks/useCourses';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';

interface StudentFormProps {
  student?: Student;
  onSubmit: (data: Omit<Student, 'id' | 'createdAt' | 'updatedAt' | 'isDeleted'>) => void;
  onCancel: () => void;
}

export function StudentForm({ student, onSubmit, onCancel }: StudentFormProps) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const { supervisors } = useSupervisorStore();
  const { data: courses = [] } = useCourses();

  const [form, setForm] = useState({
    fullName: student?.fullName ?? '',
    dateOfBirth: student?.dateOfBirth ?? '',
    country: student?.country ?? '',
    timezone: student?.timezone ?? 'Asia/Dubai',
    gender: student?.gender,
    level: student?.level ?? '',
    status: (student?.status ?? 'active') as StudentStatus,
    enrollmentSource: student?.enrollmentSource ?? '',
    supervisorId: student?.supervisorId ?? undefined,
    isReturning: student?.isReturning ?? false,
    courseId: student?.courseId ?? undefined,
    notes: student?.notes ?? '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>{t('students.fullName')} *</Label>
          <Input
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            required
          />
        </div>

        <div className="space-y-1">
          <Label>{t('students.dateOfBirth')}</Label>
          <Input
            type="date"
            value={form.dateOfBirth}
            onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
          />
        </div>

        <div className="space-y-1">
          <Label>{t('students.country')}</Label>
          <Input
            value={form.country}
            onChange={(e) => setForm({ ...form, country: e.target.value })}
          />
        </div>

        <div className="space-y-1">
          <Label>{t('students.timezone')}</Label>
          <Input
            value={form.timezone}
            onChange={(e) => setForm({ ...form, timezone: e.target.value })}
          />
        </div>

        <div className="space-y-1">
          <Label>{t('students.gender')}</Label>
          <Select
            value={form.gender ?? ''}
            onValueChange={(v) => setForm({ ...form, gender: v as StudentGender })}
          >
            <SelectTrigger><SelectValue placeholder={t('students.gender')} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="male">{t('students.male')}</SelectItem>
              <SelectItem value="female">{t('students.female')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label>{t('students.level')}</Label>
          <Input
            value={form.level}
            onChange={(e) => setForm({ ...form, level: e.target.value })}
          />
        </div>

        <div className="space-y-1">
          <Label>{t('students.status')}</Label>
          <Select
            value={form.status}
            onValueChange={(v) => setForm({ ...form, status: v as StudentStatus })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">{t('students.active')}</SelectItem>
              <SelectItem value="paused">{t('students.paused')}</SelectItem>
              <SelectItem value="trial">{t('students.trial')}</SelectItem>
              <SelectItem value="withdrawn">{t('students.withdrawn')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label>{t('students.enrollmentSource')}</Label>
          <Input
            value={form.enrollmentSource}
            onChange={(e) => setForm({ ...form, enrollmentSource: e.target.value })}
          />
        </div>

        <div className="space-y-1">
          <Label>{t('students.supervisor')}</Label>
          {/* Supervisors are a database collection — searchable structurally,
              not because of how many rows exist today. */}
          <SearchableSelect
            testId="student-supervisor"
            ariaLabel={t('students.supervisor')}
            value={form.supervisorId ?? ''}
            onValueChange={(v) => setForm({ ...form, supervisorId: v })}
            placeholder={t('students.selectSupervisor')}
            searchPlaceholder={t('students.supervisor')}
            options={supervisors.map((s) => ({
              value: s.id,
              label: s.name,
              render: (
                <span className="inline-flex items-center gap-2">
                  {s.colorHex && (
                    <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.colorHex }} />
                  )}
                  {s.name}
                </span>
              ),
            }))}
          />
        </div>

        <div className="space-y-1">
          <Label>{t('students.course')}</Label>
          <SearchableSelect
            testId="student-course"
            ariaLabel={t('students.course')}
            value={form.courseId ?? ''}
            onValueChange={(v) => setForm({ ...form, courseId: v })}
            placeholder={t('students.coursePending')}
            searchPlaceholder={t('students.course')}
            options={courses.map((c) => ({
              value: c.id, label: isAr ? c.nameAr : c.nameEn, searchText: `${c.nameAr} ${c.nameEn}`,
            }))}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Switch checked={form.isReturning} onCheckedChange={(v) => setForm({ ...form, isReturning: v })} />
        <Label>{t('students.isReturning')}</Label>
      </div>

      <div className="space-y-1">
        <Label>{t('students.notes')}</Label>
        <Textarea
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          rows={3}
        />
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground">
          {t('common.save')}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}

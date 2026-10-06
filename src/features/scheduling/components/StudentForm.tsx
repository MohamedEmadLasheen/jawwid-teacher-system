import { useMemo, useState } from 'react';
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
import { SearchableSelect, type SearchableSelectOption } from '@/components/ui/searchable-select';

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

  /**
   * Supervisors keep the colour swatch the Select showed: `node` is what gets
   * drawn, `label` is what gets searched and what the closed trigger falls
   * back to, so the dot is decoration and never part of the haystack.
   */
  const supervisorOptions = useMemo<SearchableSelectOption[]>(
    () => supervisors.map((s) => ({
      value: s.id,
      label: s.name,
      node: (
        <span className="inline-flex items-center gap-2">
          {s.colorHex && (
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.colorHex }} />
          )}
          {s.name}
        </span>
      ),
    })),
    [supervisors]
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
          <SearchableSelect
            value={form.supervisorId ?? ''}
            onChange={(v) => setForm({ ...form, supervisorId: v })}
            /* Dynamic collection: searchable by architecture, not by today's count. */
            searchable
            options={supervisorOptions}
            placeholder={t('students.selectSupervisor')}
            searchPlaceholder={t('students.selectSupervisor')}
            emptyText={t('common.noResults')}
            aria-label={t('students.supervisor')}
          />
        </div>

        <div className="space-y-1">
          <Label>{t('students.course')}</Label>
          <SearchableSelect
            value={form.courseId ?? ''}
            onChange={(v) => setForm({ ...form, courseId: v })}
            /* Dynamic collection: searchable by architecture, not by today's count. */
            searchable
            options={courseOptions}
            placeholder={t('students.coursePending')}
            searchPlaceholder={t('courses.search')}
            emptyText={t('common.noResults')}
            aria-label={t('students.course')}
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

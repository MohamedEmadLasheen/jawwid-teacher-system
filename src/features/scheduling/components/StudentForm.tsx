import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Student, StudentGender, StudentStatus } from '@/lib/types';
import { useSupervisorStore } from '@/store/supervisorStore';
import { useCourses } from '../hooks/useCourses';
import { buildSupervisorOptions } from '../utils/supervisorOptions';
import { validateStudentDraft, type StudentValidationErrors } from '../utils/studentValidation';
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
   * The responsible-Admin list, built by the one shared builder so this form,
   * the Students page filter and the schedule legend cannot drift apart. The
   * student's current Admin is always kept in the list, so opening an existing
   * student can never silently blank an assignment made by someone else.
   */
  const supervisorOptions = useMemo<SearchableSelectOption[]>(
    () => buildSupervisorOptions(supervisors, student?.supervisorId),
    [supervisors, student?.supervisorId]
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

  /**
   * Validation errors, shown only once a submit has been attempted — an
   * untouched form is not "wrong" yet, it is simply unfinished.
   */
  const [errors, setErrors] = useState<StudentValidationErrors>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // The responsible Admin is required here rather than in the database: see
    // the long note in utils/studentValidation.ts. Nothing is submitted until
    // ownership is explicit, so this application never writes another
    // unassigned student.
    const nextErrors = validateStudentDraft(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="student-full-name">{t('students.fullName')} *</Label>
          <Input
            id="student-full-name"
            value={form.fullName}
            onChange={(e) => {
              setForm({ ...form, fullName: e.target.value });
              setErrors(({ fullName: _cleared, ...rest }) => rest);
            }}
            required
            aria-invalid={errors.fullName ? true : undefined}
            aria-describedby={errors.fullName ? 'student-full-name-error' : undefined}
            className={errors.fullName ? 'border-destructive focus-visible:ring-destructive' : undefined}
          />
          {errors.fullName && (
            <p id="student-full-name-error" role="alert" className="text-xs text-destructive">
              {t('common.required')}
            </p>
          )}
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
          <Label htmlFor="student-supervisor">{t('students.supervisor')} *</Label>
          <SearchableSelect
            id="student-supervisor"
            data-testid="student-supervisor"
            value={form.supervisorId ?? ''}
            onChange={(v) => {
              setForm({ ...form, supervisorId: v });
              // Clearing the error on selection, not on the next submit, is
              // what keeps the red state from outliving the problem.
              setErrors(({ supervisorId: _cleared, ...rest }) => rest);
            }}
            /* Dynamic collection: searchable by architecture, not by today's count. */
            searchable
            options={supervisorOptions}
            placeholder={t('students.selectSupervisor')}
            searchPlaceholder={t('students.selectSupervisor')}
            emptyText={t('common.noResults')}
            aria-label={t('students.supervisor')}
            aria-invalid={errors.supervisorId ? true : undefined}
            aria-describedby={errors.supervisorId ? 'student-supervisor-error' : undefined}
            className={errors.supervisorId ? 'border-destructive focus-visible:ring-destructive' : undefined}
          />
          {errors.supervisorId && (
            <p id="student-supervisor-error" data-testid="student-supervisor-error" role="alert" className="text-xs text-destructive">
              {t('students.supervisorRequired')}
            </p>
          )}
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

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Course, CourseCategory } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SearchableSelect } from '@/components/ui/searchable-select';

interface CourseFormProps {
  course?: Course;
  onSubmit: (data: Omit<Course, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onCancel: () => void;
}

const ALL_CATEGORIES: CourseCategory[] = [
  'quran', 'arabic_language', 'islamic_studies', 'tajweed',
  'noor_al_bayan', 'adults_quran', 'adults_arabic', 'english_language',
];

export function CourseForm({ course, onSubmit, onCancel }: CourseFormProps) {
  const { t } = useTranslation();

  const [form, setForm] = useState({
    nameEn: course?.nameEn ?? '',
    nameAr: course?.nameAr ?? '',
    category: (course?.category ?? 'quran') as CourseCategory,
    defaultDurationMinutes: course?.defaultDurationMinutes ?? 30,
    isActive: course?.isActive ?? true,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>{t('courses.nameEn')} *</Label>
          <Input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} required />
        </div>
        <div className="space-y-1">
          <Label>{t('courses.nameAr')} *</Label>
          <Input value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} required dir="rtl" />
        </div>
        <div className="space-y-1">
          <Label>{t('courses.category')}</Label>
          <SearchableSelect
            testId="course-category"
            ariaLabel={t('courses.category')}
            value={form.category}
            onValueChange={(v) => setForm({ ...form, category: v as CourseCategory })}
            searchPlaceholder={t('courses.category')}
            options={ALL_CATEGORIES.map((cat) => ({ value: cat, label: t(`specialization.${cat}`) }))}
          />
        </div>
        <div className="space-y-1">
          <Label>{t('courses.defaultDuration')}</Label>
          <Input
            type="number"
            min="1"
            step="30"
            value={form.defaultDurationMinutes}
            onChange={(e) => setForm({ ...form, defaultDurationMinutes: Number(e.target.value) })}
          />
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

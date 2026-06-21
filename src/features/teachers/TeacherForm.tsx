import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Teacher, Specialization, SalaryCurrency, SalaryType, TeachingMarket } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';

interface TeacherFormProps {
  teacher?: Teacher;
  onSubmit: (data: Omit<Teacher, 'id' | 'createdAt' | 'updatedAt' | 'isDeleted'>) => void;
  onCancel: () => void;
}

const ALL_SPECIALIZATIONS: Specialization[] = [
  'quran', 'arabic_language', 'islamic_studies', 'tajweed',
  'noor_al_bayan', 'adults_quran', 'adults_arabic', 'english_language',
];

export function TeacherForm({ teacher, onSubmit, onCancel }: TeacherFormProps) {
  const { t } = useTranslation();

  const [form, setForm] = useState({
    fullName: teacher?.fullName ?? '',
    phone: teacher?.phone ?? '',
    email: teacher?.email ?? '',
    nationality: teacher?.nationality ?? '',
    joiningDate: teacher?.joiningDate ?? '',
    monthlySalary: teacher?.monthlySalary ?? 0,
    salaryCurrency: (teacher?.salaryCurrency ?? 'EGP') as SalaryCurrency,
    salaryType: (teacher?.salaryType ?? 'fixed') as SalaryType,
    teachingMarket: (teacher?.teachingMarket ?? 'arab') as TeachingMarket,
    specializations: teacher?.specializations ?? [] as Specialization[],
    status: teacher?.status ?? 'active',
    level: teacher?.level ?? 'silver',
    notes: teacher?.notes ?? '',
  });

  const toggleSpecialization = (spec: Specialization) => {
    setForm((prev) => ({
      ...prev,
      specializations: prev.specializations.includes(spec)
        ? prev.specializations.filter((s) => s !== spec)
        : [...prev.specializations, spec],
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...form,
      status: form.status as Teacher['status'],
      level: form.level as Teacher['level'],
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Full Name */}
        <div className="space-y-1">
          <Label>{t('teachers.fullName')} *</Label>
          <Input
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            required
          />
        </div>

        {/* Phone */}
        <div className="space-y-1">
          <Label>{t('teachers.phone')}</Label>
          <Input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </div>

        {/* Email */}
        <div className="space-y-1">
          <Label>{t('teachers.email')}</Label>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>

        {/* Nationality */}
        <div className="space-y-1">
          <Label>{t('teachers.nationality')}</Label>
          <Input
            value={form.nationality}
            onChange={(e) => setForm({ ...form, nationality: e.target.value })}
          />
        </div>

        {/* Joining Date */}
        <div className="space-y-1">
          <Label>{t('teachers.joiningDate')}</Label>
          <Input
            type="date"
            value={form.joiningDate}
            onChange={(e) => setForm({ ...form, joiningDate: e.target.value })}
          />
        </div>

        {/* Monthly Salary */}
        <div className="space-y-1">
          <Label>{t('teachers.monthlySalary')}</Label>
          <Input
            type="number"
            min="0"
            value={form.monthlySalary}
            onChange={(e) => setForm({ ...form, monthlySalary: Number(e.target.value) })}
          />
        </div>

        {/* Salary Currency */}
        <div className="space-y-1">
          <Label>{t('teachers.salaryCurrency')}</Label>
          <Select
            value={form.salaryCurrency}
            onValueChange={(v) => setForm({ ...form, salaryCurrency: v as SalaryCurrency })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="EGP">{t('currency.EGP')}</SelectItem>
              <SelectItem value="USD">{t('currency.USD')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Salary Type */}
        <div className="space-y-1">
          <Label>{t('teachers.salaryType')}</Label>
          <Select
            value={form.salaryType}
            onValueChange={(v) => setForm({ ...form, salaryType: v as SalaryType })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="fixed">{t('salaryType.fixed')}</SelectItem>
              <SelectItem value="hourly">{t('salaryType.hourly')}</SelectItem>
              <SelectItem value="hybrid">{t('salaryType.hybrid')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Teaching Market */}
        <div className="space-y-1">
          <Label>{t('teachers.teachingMarket')}</Label>
          <Select
            value={form.teachingMarket}
            onValueChange={(v) => setForm({ ...form, teachingMarket: v as TeachingMarket })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="arab">{t('teachingMarket.arab')}</SelectItem>
              <SelectItem value="non_arab">{t('teachingMarket.non_arab')}</SelectItem>
              <SelectItem value="both">{t('teachingMarket.both')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Status */}
        <div className="space-y-1">
          <Label>{t('teachers.status')}</Label>
          <Select
            value={form.status}
            onValueChange={(v) => setForm({ ...form, status: v as Teacher['status'] })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">{t('teachers.active')}</SelectItem>
              <SelectItem value="inactive">{t('teachers.inactive')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Level */}
        <div className="space-y-1">
          <Label>{t('teachers.level')}</Label>
          <Select
            value={form.level}
            onValueChange={(v) => setForm({ ...form, level: v as Teacher['level'] })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="silver">{t('teachers.silver')}</SelectItem>
              <SelectItem value="gold">{t('teachers.gold')}</SelectItem>
              <SelectItem value="platinum">{t('teachers.platinum')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Specializations */}
      <div className="space-y-2">
        <Label>{t('teachers.specializations')} *</Label>
        <div className="flex flex-wrap gap-2">
          {ALL_SPECIALIZATIONS.map((spec) => {
            const selected = form.specializations.includes(spec);
            return (
              <button
                key={spec}
                type="button"
                onClick={() => toggleSpecialization(spec)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  selected
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-primary'
                }`}
              >
                {t(`specialization.${spec}`)}
              </button>
            );
          })}
        </div>
        {form.specializations.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {form.specializations.map((spec) => (
              <Badge key={spec} className="bg-primary text-white gap-1">
                {t(`specialization.${spec}`)}
                <button type="button" onClick={() => toggleSpecialization(spec)}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="space-y-1">
        <Label>{t('teachers.notes')}</Label>
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

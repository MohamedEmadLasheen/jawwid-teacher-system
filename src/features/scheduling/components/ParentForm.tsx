import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Parent, PreferredLanguage } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

interface ParentFormProps {
  parent?: Parent;
  onSubmit: (data: Omit<Parent, 'id' | 'createdAt' | 'updatedAt' | 'isDeleted'>) => void;
  onCancel: () => void;
}

export function ParentForm({ parent, onSubmit, onCancel }: ParentFormProps) {
  const { t } = useTranslation();

  const [form, setForm] = useState({
    fullName: parent?.fullName ?? '',
    phone: parent?.phone ?? '',
    email: parent?.email ?? '',
    country: parent?.country ?? '',
    timezone: parent?.timezone ?? 'Asia/Dubai',
    preferredLanguage: (parent?.preferredLanguage ?? 'ar') as PreferredLanguage,
    notes: parent?.notes ?? '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>{t('parents.fullName')} *</Label>
          <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
        </div>
        <div className="space-y-1">
          <Label>{t('parents.phone')}</Label>
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>{t('parents.email')}</Label>
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>{t('parents.country')}</Label>
          <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>{t('parents.timezone')}</Label>
          <Input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>{t('parents.preferredLanguage')}</Label>
          <Select value={form.preferredLanguage} onValueChange={(v) => setForm({ ...form, preferredLanguage: v as PreferredLanguage })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ar">العربية</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label>{t('parents.notes')}</Label>
        <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground">{t('common.save')}</Button>
        <Button type="button" variant="outline" onClick={onCancel}>{t('common.cancel')}</Button>
      </div>
    </form>
  );
}

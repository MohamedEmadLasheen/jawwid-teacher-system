import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SearchableSelect, type SearchableSelectOption } from '@/components/ui/searchable-select';
import type { Teacher } from '@/lib/types';

/**
 * Single reusable dialog for every "assign a primary teacher" action (Confirm
 * Teacher / Choose Different Teacher / Choose Teacher Manually / Change Primary
 * Teacher) — they all do the exact same write (confirm_primary_teacher_assignment),
 * differing only in whether a teacher is pre-selected. Never schedules a lesson
 * or claims availability — this confirms PRIMARY TEACHER identity only.
 */
export function AssignPrimaryTeacherDialog({
  studentName, teachers, defaultTeacherId, isSaving, onCancel, onConfirm,
}: {
  studentName: string;
  teachers: Teacher[];
  defaultTeacherId: string | null;
  isSaving: boolean;
  onCancel: () => void;
  onConfirm: (teacherId: string) => void;
}) {
  const { t } = useTranslation();
  const [teacherId, setTeacherId] = useState<string | null>(defaultTeacherId);
  const selected = teachers.find((tc) => tc.id === teacherId);

  const teacherOptions = useMemo<SearchableSelectOption[]>(
    () => teachers.map((tc) => ({ value: tc.id, label: tc.fullName })),
    [teachers]
  );

  return (
    <Dialog open onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t('teacherReview.dialog.title')}</DialogTitle></DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{studentName}</p>

          <SearchableSelect
            /* Dynamic collection: searchable by architecture, not by today's count. */
            searchable
            data-testid="assign-primary-teacher"
            value={teacherId ?? undefined}
            onChange={setTeacherId}
            options={teacherOptions}
            placeholder={t('teacherReview.dialog.selectPlaceholder')}
            searchPlaceholder={t('teachers.search')}
            emptyText={t('common.noResults')}
            aria-label={t('teacherReview.dialog.selectPlaceholder')}
          />

          {selected && (
            <p className="text-sm bg-muted/50 rounded-md p-2.5">
              {t('teacherReview.dialog.confirmText', { teacher: selected.fullName })}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>{t('common.cancel')}</Button>
          <Button
            type="button"
            disabled={!teacherId || isSaving}
            onClick={() => teacherId && onConfirm(teacherId)}
          >
            {t('common.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

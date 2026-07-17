import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronsUpDown } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
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
  const [open, setOpen] = useState(false);
  const selected = teachers.find((tc) => tc.id === teacherId);

  return (
    <Dialog open onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t('teacherReview.dialog.title')}</DialogTitle></DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{studentName}</p>

          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                <span className="truncate">{selected?.fullName ?? t('teacherReview.dialog.selectPlaceholder')}</span>
                <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
              <Command filter={(value, search) => {
                const tc = teachers.find((x) => x.id === value);
                if (!tc) return 0;
                return tc.fullName.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
              }}
              >
                <CommandInput placeholder={t('common.search')} />
                <CommandList>
                  <CommandEmpty>{t('common.noData')}</CommandEmpty>
                  <CommandGroup>
                    {teachers.map((tc) => (
                      <CommandItem key={tc.id} value={tc.id} onSelect={() => { setTeacherId(tc.id); setOpen(false); }}>
                        {tc.fullName}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

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

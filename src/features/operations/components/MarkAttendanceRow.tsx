import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2 } from 'lucide-react';
import type { LessonSessionReport, LessonSessionReportStatus } from '@/lib/types';

/**
 * One reason chip per button — each carries both the underlying status
 * (what gets stored, what counts against a package later) and its own
 * label text (used directly as reason_note, so no typing needed for the
 * common cases). Only "Other" opens a free-text field, per spec.
 *
 * "Sick"/"Parent Requested Reschedule"/"Technical Issue" are modeled as
 * excused_family (doesn't count) — a deliberate default favoring the
 * family in ambiguous cases; "No Answer" is absent_student (counts, no
 * notice given); "Teacher Excused" is excused_teacher. These mappings are
 * a judgment call flagged for review, not a hidden assumption.
 */
const REASON_CHIPS: { key: string; labelKey: string; status: LessonSessionReportStatus }[] = [
  { key: 'sick', labelKey: 'operations.attendance.reason.sick', status: 'excused_family' },
  { key: 'noAnswer', labelKey: 'operations.attendance.reason.noAnswer', status: 'absent_student' },
  { key: 'parentReschedule', labelKey: 'operations.attendance.reason.parentReschedule', status: 'excused_family' },
  { key: 'technicalIssue', labelKey: 'operations.attendance.reason.technicalIssue', status: 'excused_family' },
  { key: 'teacherExcused', labelKey: 'operations.attendance.reason.teacherExcused', status: 'excused_teacher' },
  { key: 'other', labelKey: 'operations.attendance.reason.other', status: 'excused_family' },
];

const STATUS_LABEL_KEY: Record<LessonSessionReportStatus, string> = {
  delivered: 'operations.attendance.status.delivered',
  absent_student: 'operations.attendance.status.absentStudent',
  excused_family: 'operations.attendance.status.excusedFamily',
  excused_teacher: 'operations.attendance.status.excusedTeacher',
};

export function MarkAttendanceRow({
  studentName, existingReport, canManage, isSaving, onSave,
}: {
  studentName: string;
  existingReport: LessonSessionReport | undefined;
  canManage: boolean;
  isSaving: boolean;
  onSave: (status: LessonSessionReportStatus, reasonNote: string, isMakeup: boolean) => void;
}) {
  const { t } = useTranslation();
  const [isMakeup, setIsMakeup] = useState(false);
  const [showOtherInput, setShowOtherInput] = useState(false);
  const [otherText, setOtherText] = useState('');

  // Already recorded for this occurrence — read-only summary, no re-edit in this milestone.
  if (existingReport) {
    return (
      <div className="flex items-center justify-between gap-2 py-2 border-b last:border-b-0">
        <span className="text-sm font-medium truncate">{studentName}</span>
        <Badge className="bg-green-100 text-green-800 gap-1 shrink-0">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {t(STATUS_LABEL_KEY[existingReport.status])}
        </Badge>
      </div>
    );
  }

  return (
    <div className="py-2.5 border-b last:border-b-0 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium truncate">{studentName}</span>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
          <Checkbox checked={isMakeup} onCheckedChange={(v) => setIsMakeup(!!v)} className="h-3.5 w-3.5" />
          {t('operations.attendance.makeup')}
        </label>
      </div>

      {/* Present — one tap, saves immediately, no separate Save button. */}
      <Button
        type="button"
        className="w-full bg-green-600 hover:bg-green-700 text-white h-12 text-base font-semibold"
        disabled={!canManage || isSaving}
        onClick={() => onSave('delivered', '', isMakeup)}
      >
        <CheckCircle2 className="h-5 w-5 me-1.5" />
        {t('operations.attendance.present')}
      </Button>

      {/* Reason chips are always visible, not hidden behind a second tap —
          any non-Present case is exactly one tap too, except "Other". */}
      <div className="flex flex-wrap gap-1.5">
        {REASON_CHIPS.map((chip) => (
          <Button
            key={chip.key}
            type="button"
            variant="outline"
            size="sm"
            className="h-9 text-xs px-3"
            disabled={!canManage || isSaving}
            onClick={() => {
              if (chip.key === 'other') { setShowOtherInput(true); return; }
              onSave(chip.status, t(chip.labelKey), isMakeup);
            }}
          >
            {t(chip.labelKey)}
          </Button>
        ))}
      </div>

      {showOtherInput && (
        <div className="flex items-center gap-2">
          <Input
            autoFocus
            placeholder={t('operations.attendance.otherPlaceholder')}
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && otherText.trim()) onSave('excused_family', otherText.trim(), isMakeup);
            }}
            className="h-10 text-sm"
          />
          <Button
            type="button"
            disabled={!otherText.trim() || isSaving}
            onClick={() => onSave('excused_family', otherText.trim(), isMakeup)}
          >
            {t('common.confirm')}
          </Button>
        </div>
      )}
    </div>
  );
}

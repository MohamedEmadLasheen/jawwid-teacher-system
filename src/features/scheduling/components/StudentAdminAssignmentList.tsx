import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSupervisorStore } from '@/store/supervisorStore';
import { SupervisorColorDot } from '@/components/ui/SupervisorColorDot';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Label } from '@/components/ui/label';
import { buildSupervisorOptions } from '../utils/supervisorOptions';
import type { StudentAdminRow } from '../utils/studentAdminAssignment';

interface StudentAdminAssignmentListProps {
  rows: StudentAdminRow[];
  /** A choice was made for one student. The caller holds the draft. */
  onChange: (studentId: string, supervisorId: string) => void;
  /** Show the required-field error on rows still missing an admin. */
  showErrors?: boolean;
  disabled?: boolean;
  /** Distinguishes the two dialogs' control ids when both are in the DOM. */
  idPrefix: string;
}

/**
 * "Student → Responsible Admin", for the Schedule's create and edit flows.
 *
 * ONE ROW PER STUDENT, deliberately. A group lesson's students can belong to
 * different Admins, so a single control over the whole lesson would be a lie
 * — and the lesson is not what is being assigned in the first place. Each row
 * reads and writes exactly one `students.supervisor_id`; there is no
 * lesson-level ownership anywhere in this component, and the heading says so
 * rather than leaving the user to infer it.
 *
 * Nothing here defines an Admin or a colour. The options come from the shared
 * `buildSupervisorOptions` and the swatch from the shared `SupervisorColorDot`
 * — the same two the student form, the students list and the schedule legend
 * use, so the four Admins are defined once and the Schedule cannot drift.
 *
 * Already-assigned students arrive prefilled and are left alone unless the
 * user changes them. Unassigned students show the required marker and, once
 * `showErrors` is set, the same message the student form uses.
 */
export function StudentAdminAssignmentList({
  rows, onChange, showErrors = false, disabled = false, idPrefix,
}: StudentAdminAssignmentListProps) {
  const { t } = useTranslation();
  const { supervisors } = useSupervisorStore();

  // Built once for the whole panel rather than per row: every row offers the
  // same Admins, and the only per-row difference is which one is selected.
  const options = useMemo(() => buildSupervisorOptions(supervisors), [supervisors]);
  const adminById = useMemo(() => new Map(supervisors.map((s) => [s.id, s])), [supervisors]);

  /**
   * Nothing to show when there is no student selected — or when no Admin
   * exists to assign. An empty, unusable dropdown with a red asterisk beside
   * it would demand something the user cannot give; see
   * `blockingAdminStudentIds` for the same reasoning on the blocking side.
   */
  if (rows.length === 0 || options.length === 0) return null;

  return (
    <div className="space-y-2" data-testid={`${idPrefix}-admin-panel`}>
      <Label>{t('scheduling.responsibleAdmin.sectionTitle')}</Label>
      {/* Says plainly that this is a property of the student, not of the
          lesson — the one thing a reader could otherwise get wrong here. */}
      <p className="text-xs text-muted-foreground">{t('scheduling.responsibleAdmin.hint')}</p>

      <div className="space-y-2.5 border rounded-lg p-3">
        {rows.map((row) => {
          const admin = row.effectiveSupervisorId ? adminById.get(row.effectiveSupervisorId) : undefined;
          const invalid = showErrors && row.isMissing;
          const controlId = `${idPrefix}-admin-${row.studentId}`;

          return (
            <div
              key={row.studentId}
              data-testid={`${idPrefix}-admin-row-${row.studentId}`}
              data-admin-id={row.effectiveSupervisorId ?? ''}
              data-admin-color={admin?.colorHex ?? ''}
              data-missing={String(row.isMissing)}
              className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:items-center gap-1.5 sm:gap-3"
            >
              <label htmlFor={controlId} className="flex items-center gap-2 text-sm min-w-0 cursor-pointer">
                <SupervisorColorDot colorHex={admin?.colorHex} />
                <span className="truncate">{row.fullName}</span>
                {row.isMissing && <span className="text-destructive shrink-0">*</span>}
              </label>

              <div className="space-y-1 min-w-0">
                <SearchableSelect
                  id={controlId}
                  data-testid={controlId}
                  value={row.effectiveSupervisorId ?? ''}
                  onChange={(value) => onChange(row.studentId, value)}
                  /* Dynamic collection: searchable by architecture, not by today's count. */
                  searchable
                  options={options}
                  disabled={disabled}
                  placeholder={t('students.selectSupervisor')}
                  searchPlaceholder={t('students.selectSupervisor')}
                  emptyText={t('common.noResults')}
                  aria-label={`${t('students.supervisor')} — ${row.fullName}`}
                  aria-invalid={invalid ? true : undefined}
                  aria-describedby={invalid ? `${controlId}-error` : undefined}
                  className={invalid ? 'border-destructive focus-visible:ring-destructive' : undefined}
                />
                {invalid && (
                  <p id={`${controlId}-error`} data-testid={`${controlId}-error`} role="alert" className="text-xs text-destructive">
                    {t('students.supervisorRequired')}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

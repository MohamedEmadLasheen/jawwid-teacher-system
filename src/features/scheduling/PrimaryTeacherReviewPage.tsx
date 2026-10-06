import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/authStore';
import { useLogStore } from '@/store/logStore';
import { useTeacherStore } from '@/store/teacherStore';
import { userCan } from '@/lib/access';
import { usePrimaryTeacherInferenceReport, useConfirmPrimaryTeacherAssignment } from './hooks/usePrimaryTeacherAssignments';
import { computeEvidenceStrength, type EvidenceStrength } from './utils/evidenceStrength';
import { AssignPrimaryTeacherDialog } from './components/AssignPrimaryTeacherDialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchableSelect, type SearchableSelectOption } from '@/components/ui/searchable-select';
import { EmptyState } from '@/components/ui/EmptyState';
import { Search } from 'lucide-react';
import type { PrimaryTeacherInferenceRow } from '@/lib/types';

type FilterKey = 'all_pending' | 'high' | 'medium' | 'needs_review' | 'insufficient' | 'no_candidate' | 'confirmed';

const EVIDENCE_BADGE_STYLE: Record<EvidenceStrength, string> = {
  strong: 'bg-green-100 text-green-800',
  moderate: 'bg-blue-100 text-blue-800',
  limited: 'bg-amber-100 text-amber-800',
  ambiguous: 'bg-orange-100 text-orange-800',
  none: 'bg-gray-100 text-gray-600',
};

function tierOf(row: PrimaryTeacherInferenceRow): number {
  if (row.status === 'no_candidate') return 5;
  if (row.confidence === 'insufficient') return 4;
  if (row.confidence === 'low') return 3;
  if (row.confidence === 'medium') return 2;
  return 1; // 'high'
}

/** Deterministic default queue order (Task C spec): confirmed excluded, then
 * strongest/easiest evidence first, tier by tier — never AI-ranked. */
function compareQueue(a: PrimaryTeacherInferenceRow, b: PrimaryTeacherInferenceRow): number {
  const tierDiff = tierOf(a) - tierOf(b);
  if (tierDiff !== 0) return tierDiff;
  const shareDiff = (b.candidateSharePct ?? 0) - (a.candidateSharePct ?? 0);
  if (shareDiff !== 0) return shareDiff;
  const lessonDiff = b.analyzedLessonCount - a.analyzedLessonCount;
  if (lessonDiff !== 0) return lessonDiff;
  return a.distinctTeacherCount - b.distinctTeacherCount;
}

function matchesFilter(row: PrimaryTeacherInferenceRow, filter: FilterKey): boolean {
  switch (filter) {
    case 'all_pending': return row.status !== 'confirmed';
    case 'high': return row.confidence === 'high' && row.status !== 'confirmed';
    case 'medium': return row.confidence === 'medium';
    case 'needs_review': return row.confidence === 'low';
    case 'insufficient': return row.confidence === 'insufficient';
    case 'no_candidate': return row.status === 'no_candidate';
    case 'confirmed': return row.status === 'confirmed';
    default: return true;
  }
}

interface DialogState {
  row: PrimaryTeacherInferenceRow;
  defaultTeacherId: string | null;
}

export function PrimaryTeacherReviewPage() {
  const { t } = useTranslation();
  const { currentUser } = useAuthStore();
  const { addLog } = useLogStore();
  const { teachers } = useTeacherStore();
  const { data: rows = [], isLoading } = usePrimaryTeacherInferenceReport();
  const confirmAssignment = useConfirmPrimaryTeacherAssignment();

  const canWrite = userCan(currentUser, ['manage_students', 'manage_teachers']);
  const activeTeachers = useMemo(() => teachers.filter((tc) => !tc.isDeleted && tc.status === 'active'), [teachers]);

  const [filter, setFilter] = useState<FilterKey>('all_pending');
  const [evidenceFilter, setEvidenceFilter] = useState<EvidenceStrength | 'all'>('all');
  const [search, setSearch] = useState('');
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const [dialogState, setDialogState] = useState<DialogState | null>(null);

  const summary = useMemo(() => ({
    total: rows.length,
    confirmed: rows.filter((r) => r.status === 'confirmed').length,
    high: rows.filter((r) => r.confidence === 'high' && r.status !== 'confirmed').length,
    medium: rows.filter((r) => r.confidence === 'medium').length,
    needsReview: rows.filter((r) => r.confidence === 'low').length,
    insufficient: rows.filter((r) => r.confidence === 'insufficient').length,
    noCandidate: rows.filter((r) => r.status === 'no_candidate').length,
  }), [rows]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => !skippedIds.has(r.studentId))
      .filter((r) => matchesFilter(r, filter))
      .filter((r) => evidenceFilter === 'all' || computeEvidenceStrength(r) === evidenceFilter)
      .filter((r) => !q || r.studentName.toLowerCase().includes(q)
        || (r.candidateTeacherName ?? '').toLowerCase().includes(q)
        || (r.confirmedTeacherName ?? '').toLowerCase().includes(q))
      .sort(compareQueue);
  }, [rows, filter, evidenceFilter, search, skippedIds]);

  /**
   * Both review filters are FIXED enums of seven and six — over the line, and at
   * seven and six options respectively they are both over the line.
   */
  const statusFilterOptions = useMemo<SearchableSelectOption[]>(() => [
    { value: 'all_pending', label: t('teacherReview.filters.allPending') },
    { value: 'high', label: t('teacherReview.filters.high') },
    { value: 'medium', label: t('teacherReview.filters.medium') },
    { value: 'needs_review', label: t('teacherReview.filters.needsReview') },
    { value: 'insufficient', label: t('teacherReview.filters.insufficient') },
    { value: 'no_candidate', label: t('teacherReview.filters.noCandidate') },
    { value: 'confirmed', label: t('teacherReview.filters.confirmed') },
  ], [t]);

  const evidenceFilterOptions = useMemo<SearchableSelectOption[]>(() => [
    { value: 'all', label: t('teacherReview.filters.allEvidence') },
    { value: 'strong', label: t('teacherReview.evidence.strong') },
    { value: 'moderate', label: t('teacherReview.evidence.moderate') },
    { value: 'limited', label: t('teacherReview.evidence.limited') },
    { value: 'ambiguous', label: t('teacherReview.evidence.ambiguous') },
    { value: 'none', label: t('teacherReview.evidence.none') },
  ], [t]);

  const handleConfirm = (row: PrimaryTeacherInferenceRow, teacherId: string) => {
    const teacherName = activeTeachers.find((tc) => tc.id === teacherId)?.fullName ?? teacherId;
    const isChange = !!row.confirmedTeacherId;
    confirmAssignment.mutate(
      { studentId: row.studentId, teacherId, createdBy: currentUser?.id ?? null },
      {
        onSuccess: () => {
          if (currentUser) {
            addLog({
              userId: currentUser.id, userName: currentUser.name, userRole: currentUser.role,
              action: isChange ? 'تغيير المعلم الأساسي' : 'تأكيد المعلم الأساسي',
              target: row.studentName,
              details: isChange
                ? `تم تغيير المعلم الأساسي من ${row.confirmedTeacherName ?? '—'} إلى ${teacherName}`
                : `تم تعيين ${teacherName} كمعلم أساسي`,
              beforeValue: row.confirmedTeacherName ?? undefined,
              afterValue: teacherName,
              tableName: 'student_teacher_assignments',
              recordId: row.studentId,
            });
          }
          setDialogState(null);
        },
      }
    );
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">{t('common.loading')}</p>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-primary">{t('teacherReview.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t('teacherReview.progress', { confirmed: summary.confirmed, total: summary.total })}
          {skippedIds.size > 0 && ` · ${t('teacherReview.skippedNote', { count: skippedIds.size })}`}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-3">
        {([
          ['analyzed', summary.total, 'text-primary'],
          ['confirmed', summary.confirmed, 'text-green-600'],
          ['high', summary.high, 'text-emerald-600'],
          ['medium', summary.medium, 'text-blue-600'],
          ['needsReview', summary.needsReview, 'text-orange-600'],
          ['insufficient', summary.insufficient, 'text-amber-600'],
          ['noCandidate', summary.noCandidate, 'text-red-600'],
        ] as const).map(([key, value, color]) => (
          <Card key={key}>
            <CardContent className="p-3">
              <p className={`text-lg font-bold ${color}`}>{value}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">{t(`teacherReview.summary.${key}`)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="ps-8" placeholder={t('teacherReview.search.placeholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <SearchableSelect
          className="w-[180px]"
          value={filter}
          onChange={(v) => setFilter(v as FilterKey)}
          options={statusFilterOptions}
          searchPlaceholder={t('common.search')}
          emptyText={t('common.noResults')}
          aria-label={t('common.filter')}
        />
        <SearchableSelect
          className="w-[170px]"
          value={evidenceFilter}
          onChange={(v) => setEvidenceFilter(v as EvidenceStrength | 'all')}
          options={evidenceFilterOptions}
          searchPlaceholder={t('common.search')}
          emptyText={t('common.noResults')}
          aria-label={t('teacherReview.filters.allEvidence')}
        />
      </div>

      {visibleRows.length === 0 ? (
        <EmptyState title={t('teacherReview.emptyState')} />
      ) : (
        <div className="space-y-2">
          {visibleRows.map((row) => {
            const strength = computeEvidenceStrength(row);
            return (
              <Card key={row.studentId}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div>
                      <p className="text-sm font-semibold">{row.studentName}</p>
                      <p className="text-sm text-muted-foreground">
                        {row.status === 'confirmed'
                          ? `${t('teacherReview.card.currentTeacher')}: ${row.confirmedTeacherName ?? '—'}`
                          : (row.candidateTeacherName ?? '—')}
                      </p>
                    </div>
                    <div className="flex gap-1.5 flex-wrap justify-end">
                      {row.status !== 'confirmed' && row.confidence && (
                        <Badge className="text-[10px]">{t(`teacherReview.filters.${row.confidence === 'low' ? 'needsReview' : row.confidence}`)}</Badge>
                      )}
                      <Badge className={`text-[10px] ${EVIDENCE_BADGE_STYLE[strength]}`}>{t(`teacherReview.evidence.${strength}`)}</Badge>
                    </div>
                  </div>

                  {row.status !== 'no_candidate' && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{t('teacherReview.card.analyzedLessons')}: <strong className="text-foreground">{row.analyzedLessonCount}</strong></span>
                      <span>{t('teacherReview.card.candidateLessons')}: <strong className="text-foreground">{row.candidateLessonCount}</strong></span>
                      <span>{t('teacherReview.card.sharePct')}: <strong className="text-foreground">{row.candidateSharePct ?? '—'}%</strong></span>
                      <span>{t('teacherReview.card.distinctTeachers')}: <strong className="text-foreground">{row.distinctTeacherCount}</strong></span>
                      {row.secondCandidateTeacherName && (
                        <span className="col-span-2">{t('teacherReview.card.secondCandidate')}: <strong className="text-foreground">{row.secondCandidateTeacherName}</strong> ({row.secondCandidateSharePct}%)</span>
                      )}
                      {row.mostRecentLessonSince && (
                        <span className="col-span-2">{t('teacherReview.card.mostRecentLesson')}: <strong className="text-foreground">{new Date(row.mostRecentLessonSince).toLocaleDateString()}</strong></span>
                      )}
                    </div>
                  )}

                  {row.confidence === 'insufficient' && (
                    <p className="text-xs text-amber-700">{t('teacherReview.messages.insufficientData')}</p>
                  )}
                  {row.status === 'no_candidate' && (
                    <p className="text-xs text-red-700">{t('teacherReview.messages.noCandidate')}</p>
                  )}

                  {canWrite && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {row.status === 'confirmed' && (
                        <Button size="sm" variant="outline" onClick={() => setDialogState({ row, defaultTeacherId: row.confirmedTeacherId })}>
                          {t('teacherReview.actions.changePrimaryTeacher')}
                        </Button>
                      )}
                      {row.status === 'inferred' && row.candidateTeacherId && (
                        <>
                          <Button size="sm" onClick={() => setDialogState({ row, defaultTeacherId: row.candidateTeacherId })}>
                            {t('teacherReview.actions.confirmTeacher')}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setDialogState({ row, defaultTeacherId: null })}>
                            {t('teacherReview.actions.chooseDifferent')}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setSkippedIds((prev) => new Set(prev).add(row.studentId))}>
                            {t('teacherReview.actions.skip')}
                          </Button>
                        </>
                      )}
                      {row.confidence === 'low' && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => setDialogState({ row, defaultTeacherId: row.candidateTeacherId })}>
                            {t('teacherReview.actions.chooseTeacher')}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setSkippedIds((prev) => new Set(prev).add(row.studentId))}>
                            {t('teacherReview.actions.skip')}
                          </Button>
                        </>
                      )}
                      {row.confidence === 'insufficient' && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => setDialogState({ row, defaultTeacherId: row.candidateTeacherId })}>
                            {t('teacherReview.actions.chooseTeacherManually')}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setSkippedIds((prev) => new Set(prev).add(row.studentId))}>
                            {t('teacherReview.actions.skip')}
                          </Button>
                        </>
                      )}
                      {row.status === 'no_candidate' && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => setDialogState({ row, defaultTeacherId: null })}>
                            {t('teacherReview.actions.chooseTeacherManually')}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setSkippedIds((prev) => new Set(prev).add(row.studentId))}>
                            {t('teacherReview.actions.skip')}
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {dialogState && (
        <AssignPrimaryTeacherDialog
          studentName={dialogState.row.studentName}
          teachers={activeTeachers}
          defaultTeacherId={dialogState.defaultTeacherId}
          isSaving={confirmAssignment.isPending}
          onCancel={() => setDialogState(null)}
          onConfirm={(teacherId) => handleConfirm(dialogState.row, teacherId)}
        />
      )}
    </div>
  );
}

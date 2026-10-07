import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTeacherStore } from '@/store/teacherStore';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import {
  SearchableSelect, type SearchableSelectOption,
} from '@/components/ui/searchable-select';
import { Zap } from 'lucide-react';
import {
  EVALUATION_CRITERION_KEYS, RATING_OPTIONS, applyTemplate, computeEvaluationScore,
  emptyCriteria, gradeForScore, setCriterion, validateEvaluationDraft,
  type BehavioralObservation, type EvaluationCriterionKey,
} from '@/lib/evaluationCriteria';
import type { QuickRating, EvaluationGrade, SessionEvaluationDraft } from '@/lib/types';

const QUICK_NOTES_OPTIONS = [
  'outstanding_session', 'good_session', 'weak_engagement',
  'weak_tajweed', 'needs_monitoring', 'parent_followup', 're_evaluation',
];

const COMMENT_LIBRARY = [
  'comment_excellent_interaction',
  'comment_classroom_improvement',
  'comment_parent_communication',
  'comment_attendance_improvement',
  'comment_lesson_preparation',
];

const RATING_COLORS: Record<QuickRating, string> = {
  excellent: 'bg-green-500 text-white border-green-500',
  good: 'bg-blue-500 text-white border-blue-500',
  acceptable: 'bg-yellow-500 text-white border-yellow-500',
  needs_improvement: 'bg-red-500 text-white border-red-500',
};

const BEHAVIORAL_OPTIONS: readonly BehavioralObservation[] = [
  'excellent', 'good', 'needs_improvement', 'critical_issue',
];

interface Props {
  onClose: () => void;
}

/**
 * Create a session evaluation: one teacher, the nine criteria with a comment
 * each, and one general comment about the lesson as a whole.
 *
 * The criterion list, the scoring arithmetic and the validation rule all come
 * from src/lib/evaluationCriteria.ts — this file renders them and owns no copy
 * of any of them.
 */
export function SessionEvaluationForm({ onClose }: Props) {
  const { t } = useTranslation();
  const { currentUser } = useAuthStore();
  const { teachers, addEvaluation } = useTeacherStore();

  const [teacherId, setTeacherId] = useState('');
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split('T')[0]);
  const [behavioral, setBehavioral] = useState<BehavioralObservation>('good');
  const [quickNotes, setQuickNotes] = useState<string[]>([]);
  /** The GENERAL comment — about the evaluation as a whole, not any one criterion. */
  const [generalComment, setGeneralComment] = useState('');
  const [criteria, setCriteria] = useState(emptyCriteria);
  /**
   * Validation messages appear only once a save has been attempted, so the
   * form does not open already scolding the user about a teacher they have not
   * had the chance to pick yet.
   */
  const [submitAttempted, setSubmitAttempted] = useState(false);
  /**
   * A failed save used to be invisible: the dialog closed on the optimistic
   * assumption that the write succeeded, so a rejected insert (RLS, network,
   * an invalid draft) silently discarded everything the evaluator had typed.
   * The dialog now stays open and says so, and the form state is still there
   * to retry from.
   */
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);

  const score = computeEvaluationScore(criteria, behavioral);
  const grade = gradeForScore(score);

  const errors = validateEvaluationDraft({ teacherId });
  const teacherMissing = errors.includes('teacher_required');

  const activeTeachers = teachers.filter((tc) => !tc.isDeleted && tc.status === 'active');

  /**
   * Existing teacher records, reused as-is. The selector only ever reports an
   * id back, so no code path here can create a teacher or edit one.
   *
   * `searchText` folds the id into the haystack the way the Schedule filters
   * do, so pasting an id finds the row. Name matching itself — partial,
   * any-order, and Arabic orthography-insensitive — is handled by the shared
   * `matchesSearch` inside SearchableSelect; nothing about it is re-specified
   * here.
   */
  const teacherOptions = useMemo<SearchableSelectOption[]>(
    () => activeTeachers.map((tc) => ({ value: tc.id, label: tc.fullName, searchText: tc.id })),
    [activeTeachers]
  );

  const toggleNote = (note: string) => {
    setQuickNotes((prev) =>
      prev.includes(note) ? prev.filter((n) => n !== note) : [...prev, note]
    );
  };

  /** Appends to the GENERAL comment, which is what the library has always fed. */
  const addLibraryComment = (commentKey: string) => {
    const text = t(`evaluation.${commentKey}`);
    setGeneralComment((prev) => (prev ? `${prev}\n${text}` : text));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitAttempted(true);
    setSaveError('');
    // Validated as a whole — a teacher AND a complete set of nine scored
    // criteria — whatever the state of the submit button. An evaluation that
    // names nobody is about nobody, and an incomplete criteria set must never
    // reach the service, which would reject it anyway.
    if (validateEvaluationDraft({ teacherId, criteria }).length > 0) return;

    const evalData: SessionEvaluationDraft = {
      teacherId,
      sessionDate,
      evaluatorId: currentUser?.id ?? '',
      evaluatorName: currentUser?.name ?? '',
      // SessionEvaluationDraft excludes the 16 legacy criterion fields by
      // construction: a 9-criteria evaluation does not score them, and the
      // service does not write their columns either (see migration 024).
      behavioralObservation: behavioral,
      quickNotes,
      customNote: generalComment.trim(),
      criteria,
      overallScore: score,
      grade,
    };

    // Awaited, so the dialog closes only once the row actually exists.
    setSaving(true);
    try {
      await addEvaluation(evalData);
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const gradeColors: Record<EvaluationGrade, string> = {
    excellent: 'bg-green-500',
    good: 'bg-blue-500',
    average: 'bg-yellow-500',
    weak: 'bg-orange-500',
    critical: 'bg-red-500',
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-h-[75vh] overflow-y-auto pe-1">
      {/* Teacher + Date */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="evaluation-teacher">{t('common.teacher')} *</Label>
          <SearchableSelect
            id="evaluation-teacher"
            data-testid="evaluation-teacher"
            /* A dynamic collection: searchable by architecture, not by how many
               teachers the academy happens to hold today. */
            searchable
            value={teacherId || undefined}
            onChange={setTeacherId}
            options={teacherOptions}
            placeholder={t('evaluation.selectTeacher')}
            searchPlaceholder={t('teachers.search')}
            emptyText={t('common.noResults')}
            aria-label={t('evaluation.selectTeacher')}
            aria-invalid={submitAttempted && teacherMissing}
            aria-describedby={submitAttempted && teacherMissing ? 'evaluation-teacher-error' : undefined}
            className={submitAttempted && teacherMissing ? 'border-red-500' : undefined}
          />
          {submitAttempted && teacherMissing && (
            <p id="evaluation-teacher-error" data-testid="evaluation-teacher-error" className="text-xs text-red-600">
              {t('evaluation.teacherRequired')}
            </p>
          )}
        </div>
        <div className="space-y-1">
          <Label htmlFor="evaluation-session-date">{t('evaluation.sessionDate')}</Label>
          <Input
            id="evaluation-session-date"
            type="date"
            value={sessionDate}
            onChange={(e) => setSessionDate(e.target.value)}
          />
        </div>
      </div>

      {/* Live Score */}
      <div className="bg-gray-50 rounded-xl p-4 border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">{t('evaluation.overallScore')}</span>
          <div className="flex items-center gap-2">
            <span data-testid="evaluation-score" className="text-2xl font-bold text-primary">{score}</span>
            <Badge className={`${gradeColors[grade]} text-white`}>{t(`evaluation.${grade}`)}</Badge>
          </div>
        </div>
        <Progress value={score} className="h-3" />
      </div>

      {/* Quick Templates */}
      <div>
        <p className="text-sm font-medium mb-2 flex items-center gap-2">
          <Zap className="h-4 w-4 text-secondary" />
          {t('evaluation.quickTemplate')}
        </p>
        <div className="flex gap-2 flex-wrap">
          {['template_excellent', 'template_followup', 'template_attendance'].map((tpl) => (
            <Button
              key={tpl}
              type="button"
              variant="outline"
              size="sm"
              data-testid={`evaluation-${tpl}`}
              onClick={() => setCriteria((prev) => applyTemplate(prev, tpl))}
              className="text-xs border-secondary text-secondary hover:bg-secondary hover:text-white"
            >
              {t(`evaluation.${tpl}`)}
            </Button>
          ))}
        </div>
      </div>

      {/* The nine criteria. Each one owns its score AND its own comment. */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-primary border-b pb-1">
          {t('evaluation.criteriaTitle')}
        </h4>
        <div className="space-y-3">
          {EVALUATION_CRITERION_KEYS.map((key: EvaluationCriterionKey, index) => (
            <div
              key={key}
              data-testid={`criterion-${key}`}
              className="space-y-2 rounded-lg border bg-white p-3"
            >
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <span className="text-sm text-gray-700 flex gap-1.5 min-w-[11rem] flex-1">
                  {/* shrink-0 is load-bearing: without it the flex row steals
                      width from the number before the label, and "1." breaks
                      across two lines once a criterion name wraps. No physical
                      left/right, so the index sits before the label under
                      either text direction. */}
                  <span className="shrink-0 text-muted-foreground tabular-nums">{index + 1}.</span>
                  <span>{t(`evaluation.criterion.${key}`)}</span>
                </span>
                <div className="flex gap-1 flex-wrap">
                  {RATING_OPTIONS.map((rating) => (
                    <button
                      key={rating}
                      type="button"
                      data-testid={`criterion-${key}-rating-${rating}`}
                      aria-pressed={criteria[key].score === rating}
                      onClick={() => setCriteria((prev) => setCriterion(prev, key, { score: rating }))}
                      className={`px-2 py-1 rounded text-xs border transition-all ${
                        criteria[key].score === rating
                          ? RATING_COLORS[rating]
                          : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      {t(`evaluation.${rating}`)}
                    </button>
                  ))}
                </div>
              </div>
              {/* This criterion's OWN optional comment. Writing here cannot
                  reach any other criterion — setCriterion patches one key. */}
              <Textarea
                data-testid={`criterion-${key}-comment`}
                aria-label={`${t(`evaluation.criterion.${key}`)} — ${t('evaluation.criterionComment')}`}
                value={criteria[key].comment}
                onChange={(e) => setCriteria((prev) => setCriterion(prev, key, { comment: e.target.value }))}
                placeholder={t('evaluation.criterionCommentPlaceholder')}
                rows={2}
                className="text-sm"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Behavioural observation */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-primary border-b pb-1">
          {t('evaluation.section5')}
        </h4>
        <div className="flex gap-2 flex-wrap">
          {BEHAVIORAL_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              data-testid={`behavioral-${opt}`}
              aria-pressed={behavioral === opt}
              onClick={() => setBehavioral(opt)}
              className={`px-3 py-1.5 rounded-full text-xs border transition-all ${
                behavioral === opt
                  ? opt === 'excellent' ? 'bg-green-500 text-white border-green-500'
                    : opt === 'good' ? 'bg-blue-500 text-white border-blue-500'
                    : opt === 'needs_improvement' ? 'bg-yellow-500 text-white border-yellow-500'
                    : 'bg-red-500 text-white border-red-500'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
              }`}
            >
              {t(`evaluation.behavioral${opt.charAt(0).toUpperCase() + opt.slice(1).replace(/_([a-z])/g, (_, c) => c.toUpperCase())}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Quick Notes */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-primary border-b pb-1">
          {t('evaluation.section6')}
        </h4>
        <div className="flex flex-wrap gap-2">
          {QUICK_NOTES_OPTIONS.map((note) => (
            <button
              key={note}
              type="button"
              aria-pressed={quickNotes.includes(note)}
              onClick={() => toggleNote(note)}
              className={`px-2 py-1 rounded-full text-xs border transition-all ${
                quickNotes.includes(note)
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-primary'
              }`}
            >
              {t(`evaluation.${note}`)}
            </button>
          ))}
        </div>
      </div>

      {/* GENERAL COMMENT — about the lesson as a whole. Separated from the
          per-criterion comments above by its own heading and helper line, so
          the two are never mistaken for each other. */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-primary border-b pb-1">
          {t('evaluation.generalComment')}
        </h4>
        <p className="text-xs text-muted-foreground">{t('evaluation.generalCommentHint')}</p>
        <div className="flex flex-wrap gap-2">
          {COMMENT_LIBRARY.map((ck) => (
            <button
              key={ck}
              type="button"
              onClick={() => addLibraryComment(ck)}
              className="px-2 py-1 rounded text-xs border bg-white text-gray-600 border-gray-300 hover:border-secondary hover:text-secondary transition-all"
            >
              + {t(`evaluation.${ck}`)}
            </button>
          ))}
        </div>
        <Textarea
          data-testid="evaluation-general-comment"
          aria-label={t('evaluation.generalComment')}
          value={generalComment}
          onChange={(e) => setGeneralComment(e.target.value)}
          placeholder={t('evaluation.generalCommentPlaceholder')}
          rows={3}
        />
      </div>

      <div className="flex gap-3 pt-2">
        <Button
          type="submit"
          data-testid="evaluation-save"
          /* Still disabled without a teacher — the same affordance the form
             always had. handleSubmit re-checks anyway, so a submit reaching it
             by any other route (Enter in a field, a programmatic submit) is
             rejected rather than relying on the button's state. */
          disabled={teacherMissing || saving}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          {t('common.save')}
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          {t('common.cancel')}
        </Button>
      </div>

      {saveError && (
        <p data-testid="evaluation-save-error" className="text-xs text-red-600" role="alert">
          {saveError}
        </p>
      )}
    </form>
  );
}

import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { EVALUATION_CRITERION_KEYS, type EvaluationCriteria } from '@/lib/evaluationCriteria';
import type { QuickRating } from '@/lib/types';

/**
 * READ-ONLY read-back of the nine criteria of one saved evaluation.
 *
 * The per-criterion scores and comments were persisted from the day the
 * feature shipped, but nothing rendered them: a supervisor could type nine
 * observations and never see one again. This is the screen that closes that —
 * and nothing more. There is no input, no handler and no write anywhere in
 * this file; it takes a `criteria` object and draws it.
 *
 * It renders the nine from EVALUATION_CRITERION_KEYS and looks every label up
 * through `evaluation.criterion.<key>`, so it holds no second copy of the
 * criterion list and cannot drift from the form that produced the data.
 *
 * NOT rendered at all for a historical evaluation — the caller only mounts it
 * when `criteria` is non-null. Nine invented "Good" ratings for a lesson
 * nobody scored that way would be fabricated data about a real teacher, and an
 * empty panel would be worse than no panel.
 */

/**
 * The read-only score palette. Deliberately the muted
 * `bg-<colour>-100 / text-<colour>-700` pairing the grade badge beside it
 * already uses, rather than the saturated fills of the form's rating buttons:
 * these are a record of a judgement, not controls inviting one.
 */
const SCORE_COLORS: Record<QuickRating, string> = {
  excellent: 'bg-emerald-100 text-emerald-700',
  good: 'bg-blue-100 text-blue-700',
  acceptable: 'bg-amber-100 text-amber-700',
  needs_improvement: 'bg-red-100 text-red-700',
};

interface Props {
  criteria: EvaluationCriteria;
  /** The evaluation's id, so each row's control and panel are addressable. */
  evaluationId: string;
}

export function EvaluationDetails({ criteria, evaluationId }: Props) {
  const { t } = useTranslation();

  return (
    /* Collapsed by default: the list stays as compact as it was before this
       section existed, and a supervisor scanning twenty evaluations sees the
       same rows they always did. */
    <Collapsible className="mt-2">
      <CollapsibleTrigger
        data-testid={`evaluation-details-toggle-${evaluationId}`}
        className="flex items-center gap-1 text-xs font-medium text-primary group"
      >
        {t('evaluation.viewDetails')}
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>

      <CollapsibleContent
        data-testid={`evaluation-details-${evaluationId}`}
        className="pt-2"
      >
        <ol className="space-y-2">
          {EVALUATION_CRITERION_KEYS.map((key, index) => {
            const comment = criteria[key].comment.trim();
            return (
              <li
                key={key}
                data-testid={`evaluation-detail-${evaluationId}-${key}`}
                className="rounded-md border bg-white p-2"
              >
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <span className="flex gap-1.5 text-xs text-gray-700 flex-1 min-w-[10rem]">
                    {/* shrink-0 keeps "1." on one line when a long criterion
                        name wraps; no physical left/right, so the index leads
                        the label under either direction. */}
                    <span className="shrink-0 text-muted-foreground tabular-nums">{index + 1}.</span>
                    <span>{t(`evaluation.criterion.${key}`)}</span>
                  </span>
                  <span
                    data-testid={`evaluation-detail-${evaluationId}-${key}-score`}
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${SCORE_COLORS[criteria[key].score]}`}
                  >
                    {t(`evaluation.${criteria[key].score}`)}
                  </span>
                </div>

                {/* Only when there is one. An uncommented criterion shows
                    nothing at all — never an empty box, and never the string
                    "undefined" that an unguarded render would produce. */}
                {comment && (
                  <p
                    data-testid={`evaluation-detail-${evaluationId}-${key}-comment`}
                    className="mt-1 text-xs text-gray-600 whitespace-pre-line break-words"
                  >
                    {comment}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  );
}

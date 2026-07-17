import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useSmartRecommendation } from '../utils/useSmartRecommendation';
import { minuteToLabel } from '@/features/scheduling/utils/timeGrid';
import { DAYS_OF_WEEK } from '@/features/scheduling/constants/schedulingConstants';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { ArrowDown, ChevronDown } from 'lucide-react';

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E'];

/** Shows only the single best recommendation by default (spec: no visible Operations
 * Score/Estimated Implementation/Confidence). Alternatives (Option B/C…) only appear
 * once "View Alternatives" is clicked — the ranking logic itself is unchanged, this
 * only affects what's rendered by default. */
export function SmartRecommendationSection() {
  const { t } = useTranslation();
  const {
    isLoading, overloadedTeacher, recommendations, selected, selectedIndex, selectOption,
    ignored, ignore, apply, isApplying, applySucceeded,
    queuePosition, queueTotal, queue, showQueue, toggleShowQueue, jumpToQueueItem,
  } = useSmartRecommendation();
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  if (!isLoading && !overloadedTeacher) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-base font-bold text-primary">{t('dashboard.recommendation.title')}</h2>
        {!isLoading && queueTotal > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {t('dashboard.recommendation.queuePosition', { position: Math.min(queuePosition, queueTotal), total: queueTotal })}
            </span>
            {queueTotal > 1 && (
              <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={toggleShowQueue}>
                {showQueue ? t('dashboard.recommendation.hideQueue') : t('dashboard.recommendation.viewQueue')}
              </Button>
            )}
          </div>
        )}
      </div>

      {showQueue && queueTotal > 1 && (
        <Card>
          <CardContent className="p-3 space-y-1.5">
            {queue.map((item, i) => (
              <button
                key={item.candidate.candidate.teacherId}
                onClick={() => jumpToQueueItem(i)}
                className={`w-full text-start text-xs px-2.5 py-1.5 rounded-md border transition-colors ${
                  i === queuePosition - 1 ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border hover:bg-accent'
                }`}
              >
                {i + 1}. {t('dashboard.recommendation.moveLesson', { teacher: item.candidate.candidate.teacherName })}
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">…</p>
      ) : ignored || recommendations.length === 0 ? (
        <Card><CardContent className="p-4 text-sm text-muted-foreground">
          {ignored ? t('dashboard.recommendation.allReviewed') : t('dashboard.recommendation.none')}
        </CardContent></Card>
      ) : selected && (
        <div className="space-y-2">
          {showAlternatives && recommendations.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {recommendations.map((r, i) => (
                <button
                  key={i}
                  onClick={() => selectOption(i)}
                  className={`text-xs px-2.5 py-1.5 rounded-md border transition-colors ${
                    i === selectedIndex ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border text-muted-foreground hover:bg-accent'
                  }`}
                >
                  {t('dashboard.recommendation.option', { letter: OPTION_LETTERS[i] ?? i + 1 })}
                  {' '}{minuteToLabel(r.candidate.toStartMinute)}
                  {i === 0 && <span className="ms-1 text-green-600 font-semibold">· {t('dashboard.recommendation.recommended')}</span>}
                </button>
              ))}
            </div>
          )}

          <Card>
            <CardContent className="p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold">
                  {t('dashboard.recommendation.moveLesson', { teacher: selected.candidate.teacherName })}
                </p>
                <p className="text-xs text-muted-foreground">{t(DAYS_OF_WEEK.find((d) => d.value === selected.candidate.dayOfWeek)!.labelKey)}</p>
                <div className="flex items-center gap-2 mt-1 text-sm">
                  <span className="font-medium">{minuteToLabel(selected.candidate.fromStartMinute)}</span>
                  <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium text-primary">{minuteToLabel(selected.candidate.toStartMinute)}</span>
                </div>
              </div>

              {/* Impact summary — describes only the real effect of this specific move
                  (a same-teacher time shift into Prime Time), never workload reduction. */}
              <p className="text-xs text-muted-foreground border-t pt-2">
                {t('dashboard.recommendation.impactSummary')}
              </p>

              {previewing && (
                <div className="space-y-1 bg-muted/40 rounded-md p-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('dashboard.recommendation.expectedImpact')}</p>
                  {selected.factors.filter((f) => f.points !== 0).map((f) => (
                    <p key={f.id} className="text-xs flex items-start gap-1.5">
                      <span className={f.points > 0 ? 'text-green-600' : 'text-red-600'}>{f.points > 0 ? '✔' : '✖'}</span>
                      <span>{t(f.labelCode, f.labelParams)}</span>
                    </p>
                  ))}
                </div>
              )}

              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-primary group">
                  {t('dashboard.recommendation.why')}
                  <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-1.5 pt-2">
                  <p className="text-xs text-muted-foreground">{t('dashboard.recommendation.whyIntro')}</p>
                  {selected.factors.map((f) => (
                    <p key={f.id} className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <span className="mt-0.5">•</span><span>{t(f.detailCode, f.detailParams)}</span>
                    </p>
                  ))}
                </CollapsibleContent>
              </Collapsible>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={() => setPreviewing((v) => !v)}>
                  {previewing ? t('dashboard.recommendation.hidePreview') : t('dashboard.recommendation.previewChange')}
                </Button>
                <Button size="sm" onClick={apply} disabled={isApplying || applySucceeded}>
                  {applySucceeded ? t('dashboard.recommendation.applied') : t('dashboard.recommendation.apply')}
                </Button>
                {recommendations.length > 1 && !showAlternatives && (
                  <Button size="sm" variant="ghost" onClick={() => setShowAlternatives(true)}>
                    {t('dashboard.recommendation.viewAlternatives')}
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={ignore} disabled={isApplying || applySucceeded}>
                  {t('dashboard.recommendation.ignore')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

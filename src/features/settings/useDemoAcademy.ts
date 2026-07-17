import { useCallback, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as demoDataSvc from '@/services/demoData.service';
import { DEMO_CATEGORY_ESTIMATES, buildDemoGenStages, type DemoCategoryKey, type DemoGenStage } from '@/services/demoData.service';
import { useTeacherStore } from '@/store/teacherStore';

const DEMO_MODE_QUERY_KEY = ['demoMode', 'active'];

/** Supabase RPC failures are plain PostgrestError objects (not `instanceof
 * Error`), so a naive `e instanceof Error ? e.message : String(e)` renders
 * as the useless "[object Object]" — extract the real message either way. */
function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

/** Demo generation/deletion touches almost every table in the app — both the
 * React Query cache (scheduling/students/parents/courses/lessons) and the
 * separate Zustand fetch-everything store (teachers/evaluations/complaints/
 * bonuses/deductions/improvement plans) need a full refresh afterwards. */
function useRefreshEverything() {
  const queryClient = useQueryClient();
  const fetchAllTeacherData = useTeacherStore((s) => s.fetchAll);
  return useCallback(async () => {
    await Promise.all([queryClient.invalidateQueries(), fetchAllTeacherData()]);
  }, [queryClient, fetchAllTeacherData]);
}

export function useDemoModeActive() {
  return useQuery({ queryKey: DEMO_MODE_QUERY_KEY, queryFn: demoDataSvc.isDemoModeActive });
}

export function useDeleteDemoAcademy() {
  const refreshEverything = useRefreshEverything();
  const [isPending, setIsPending] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mutate = useCallback(() => {
    setIsPending(true);
    setError(null);
    demoDataSvc.deleteDemoAcademy()
      .then(async () => { await refreshEverything(); setIsSuccess(true); })
      .catch((e: unknown) => setError(getErrorMessage(e)))
      .finally(() => setIsPending(false));
  }, [refreshEverything]);
  return { mutate, isPending, isSuccess, error };
}

export type DemoGenCategoryProgress = Record<DemoCategoryKey, { current: number; total: number }>;

function freshCategories(): DemoGenCategoryProgress {
  return Object.fromEntries(
    (Object.keys(DEMO_CATEGORY_ESTIMATES) as DemoCategoryKey[]).map((k) => [k, { current: 0, total: DEMO_CATEGORY_ESTIMATES[k] }])
  ) as DemoGenCategoryProgress;
}

/**
 * Runs the staged generator sequentially, updating category progress after
 * every small batch call so the UI reflects real, live progress (never a
 * frozen spinner). A failed batch stops the run in place — already-committed
 * batches stay committed, nothing is duplicated — and retry() resumes from
 * exactly that batch rather than restarting the whole academy.
 */
export function useGenerateDemoAcademy() {
  const refreshEverything = useRefreshEverything();
  const stagesRef = useRef<DemoGenStage[] | null>(null);
  const [categories, setCategories] = useState<DemoGenCategoryProgress>(freshCategories);
  const [stageIndex, setStageIndex] = useState(0);
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [failedStageKey, setFailedStageKey] = useState<string | null>(null);

  const runFrom = useCallback(async (fromIndex: number) => {
    const stages = stagesRef.current;
    if (!stages) return;
    setStatus('running');
    setError(null);
    setFailedStageKey(null);

    for (let i = fromIndex; i < stages.length; i++) {
      const stage = stages[i];
      try {
        const result = await stage.run();
        setCategories((prev) => {
          const next = { ...prev, [stage.category]: { ...prev[stage.category], current: prev[stage.category].current + result.amount } };
          if (result.extra) {
            next[result.extra.category] = { ...next[result.extra.category], current: next[result.extra.category].current + result.extra.amount };
          }
          return next;
        });
        setStageIndex(i + 1);
      } catch (e) {
        setStatus('error');
        setError(getErrorMessage(e));
        setFailedStageKey(stage.key);
        setStageIndex(i);
        return;
      }
    }

    setStatus('done');
    await refreshEverything();
  }, [refreshEverything]);

  const start = useCallback(() => {
    stagesRef.current = buildDemoGenStages();
    setCategories(freshCategories());
    setStageIndex(0);
    void runFrom(0);
  }, [runFrom]);

  const retry = useCallback(() => {
    void runFrom(stageIndex);
  }, [runFrom, stageIndex]);

  const totalStages = stagesRef.current?.length ?? 0;
  const overallCurrent = Object.values(categories).reduce((s, c) => s + c.current, 0);
  const overallTotal = Object.values(categories).reduce((s, c) => s + c.total, 0);
  const overallPct = overallTotal > 0 ? Math.min(100, Math.round((overallCurrent / overallTotal) * 100)) : 0;

  return { start, retry, categories, status, error, failedStageKey, stageIndex, totalStages, overallPct };
}

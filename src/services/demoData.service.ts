import { supabase } from '@/lib/supabase';

/** Deletes every is_demo = true row (and only those), in dependency order. */
export async function deleteDemoAcademy(): Promise<void> {
  const { error } = await supabase.rpc('delete_demo_academy');
  if (error) throw error;
}

/** Cheap existence check used by the app-wide "DEMO MODE" banner. */
export async function isDemoModeActive(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_demo_mode_active');
  if (error) throw error;
  return Boolean(data);
}

async function rpc<T = unknown>(fn: string, params?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, params);
  if (error) throw error;
  return data as T;
}

/** One category shown in the progress UI (e.g. "Teachers 150 / 150"). */
export type DemoCategoryKey = 'foundation' | 'teachers' | 'students' | 'lessons' | 'history' | 'quality';

export interface StageResult {
  /** Increment for this stage's own category. */
  amount: number;
  /** Some stages (lessons) produce rows in a second category (history) from
   * the same call — reported here instead of a second RPC round-trip. */
  extra?: { category: DemoCategoryKey; amount: number };
}

/**
 * Staged Demo Academy generation — each stage is its own small RPC call
 * (its own transaction), so no single call approaches the API role's
 * statement_timeout the way the old one-shot generate_demo_academy() did.
 * A failed stage rolls back on its own (already-committed stages are
 * untouched), so retrying just re-runs that one stage — never duplicates.
 */
export interface DemoGenStage {
  key: string;
  category: DemoCategoryKey;
  run: () => Promise<StageResult>;
}

const STUDENT_BATCH_SIZE = 300;
const STUDENT_BATCHES = 10; // 3000 total
const TEACHER_BATCH_SIZE = 25;
const TEACHER_BATCHES = 6; // 150 total
// The per-student conflict-check subquery (run up to 10x per lesson, once per
// group participant) makes lesson generation the expensive stage — even a
// 10-teacher batch hit the API role's statement_timeout live. One teacher
// per batch keeps every call small regardless of that teacher's archetype.
const LESSON_BATCH_SIZE = 1; // teacher per batch
const LESSON_BATCHES = 150; // 150 teachers total

/** Real (not invented) estimates for progress-bar denominators — lessons/history
 * totals vary slightly per run since capacity-fill depends on each teacher's
 * archetype, so these are honest targets, not guaranteed final counts. */
export const DEMO_CATEGORY_ESTIMATES: Record<DemoCategoryKey, number> = {
  foundation: 1 + 12 + 25 + 350 + 3, // reset + supervisors + courses + parents + shift templates
  teachers: 150,
  students: 3000,
  lessons: 9000,
  history: 19000,
  quality: 415,
};

export function buildDemoGenStages(): DemoGenStage[] {
  const stages: DemoGenStage[] = [
    { key: 'reset', category: 'foundation', run: async () => { await deleteDemoAcademy(); return { amount: 1 }; } },
    { key: 'supervisors', category: 'foundation', run: async () => ({ amount: (await rpc<{ inserted: number }>('demo_gen_supervisors')).inserted }) },
    { key: 'courses', category: 'foundation', run: async () => ({ amount: (await rpc<{ inserted: number }>('demo_gen_courses')).inserted }) },
    { key: 'parents', category: 'foundation', run: async () => ({ amount: (await rpc<{ inserted: number }>('demo_gen_parents')).inserted }) },
    { key: 'shiftTemplates', category: 'foundation', run: async () => ({ amount: (await rpc<{ inserted: number }>('demo_gen_shift_templates')).inserted }) },
  ];
  for (let i = 0; i < TEACHER_BATCHES; i++) {
    stages.push({ key: `teachers-${i}`, category: 'teachers', run: async () => ({ amount: (await rpc<{ inserted: number }>('demo_gen_teachers', { p_batch: i, p_batch_size: TEACHER_BATCH_SIZE })).inserted }) });
  }
  for (let i = 0; i < STUDENT_BATCHES; i++) {
    stages.push({ key: `students-${i}`, category: 'students', run: async () => ({ amount: (await rpc<{ inserted: number }>('demo_gen_students', { p_batch: i, p_batch_size: STUDENT_BATCH_SIZE })).inserted }) });
  }
  for (let i = 0; i < LESSON_BATCHES; i++) {
    stages.push({
      key: `lessons-${i}`,
      category: 'lessons',
      run: async () => {
        const r = await rpc<{ lessons_inserted: number; exceptions_inserted: number }>('demo_gen_lessons', { p_batch: i, p_batch_size: LESSON_BATCH_SIZE });
        return { amount: r.lessons_inserted, extra: { category: 'history', amount: r.exceptions_inserted } };
      },
    });
  }
  stages.push({ key: 'quality', category: 'quality', run: async () => {
    const r = await rpc<{ complaints: number; evaluations: number; improvement_plans: number; bonuses: number; deductions: number }>('demo_gen_quality');
    return { amount: r.complaints + r.evaluations + r.improvement_plans + r.bonuses + r.deductions };
  } });
  return stages;
}

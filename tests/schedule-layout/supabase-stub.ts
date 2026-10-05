/**
 * Layout-test stub for `@/lib/supabase`. The layout tests render real
 * scheduling components with fixture data seeded directly into React Query,
 * so no query ever needs to reach the network — and the test suite can never
 * touch the real database.
 *
 * It also RECORDS what the components asked the database to do, which is how
 * the quick-actions tests prove the negative cases: that "Remove from
 * schedule" issues cancel_occurrence / end_lesson and never a DELETE, and
 * that closing a sheet without confirming issues nothing at all. Assertions
 * about an absence need a witness; this is it.
 *
 * Everything is exposed on window.__supabaseStub:
 *   rpcCalls   [{ fn, args }]            every .rpc(...) call, in order
 *   tableOps   [{ table, op }]           every .from(table).<op>() call
 *   conflict   boolean                   drives check_schedule_conflict
 *   conflictMessage string
 *   reset()                              clears both logs
 */
export interface StubRpcCall { fn: string; args: unknown }
export interface StubTableOp { table: string; op: string }

interface SupabaseStubControl {
  rpcCalls: StubRpcCall[];
  tableOps: StubTableOp[];
  conflict: boolean;
  conflictMessage: string;
  /**
   * Lesson ids whose conflict check should come back positive, so a test can
   * make ONE member of a bulk target set fail. A global flag cannot express
   * "the third target conflicts", which is exactly the case that proves a
   * bulk edit writes nothing when preflight finds a problem.
   */
  conflictLessonIds: string[];
  /**
   * Lesson ids whose apply_schedule_change WRITE should throw, after
   * preflight has already passed. This is the only way to exercise the
   * partial-failure path: a runtime error mid-batch, which no amount of
   * validation can rule out while the mutation is N calls rather than one
   * transaction.
   */
  failWriteForLessonIds: string[];
  /**
   * Seeded table contents, in DB row shape (snake_case), keyed by table name.
   *
   * Without this a harness could only pre-fill React Query's cache, which
   * survives exactly until the first mutation: useApplyScheduleChange
   * invalidates the scheduling keys on success, the queries refetch, and the
   * stub hands back [] — so a second action in the same session sees an empty
   * schedule. Serving the rows here keeps a multi-step test honest.
   */
  tables: Record<string, unknown[]>;
  reset: () => void;
}

const control: SupabaseStubControl = {
  rpcCalls: [],
  tableOps: [],
  conflict: false,
  conflictMessage: 'Teacher is already booked at this time.',
  conflictLessonIds: [],
  failWriteForLessonIds: [],
  tables: {},
  reset() {
    control.rpcCalls.length = 0;
    control.tableOps.length = 0;
    control.conflictLessonIds.length = 0;
    control.failWriteForLessonIds.length = 0;
    control.conflict = false;
  },
};

if (typeof window !== 'undefined') {
  (window as unknown as { __supabaseStub: SupabaseStubControl }).__supabaseStub = control;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

function chain(table: string): any {
  const rows = () => control.tables[table] ?? [];
  const settled = () => Promise.resolve({ data: rows(), error: null });
  const proxy: any = new Proxy({} as any, {
    get(_target, prop) {
      // The table this builder is for, so the fetchAllRows stub below can
      // resolve the right rows without parsing a query.
      if (prop === '__table') return table;
      if (prop === 'then' || prop === 'catch' || prop === 'finally') {
        const p = settled();
        return (p as any)[prop].bind(p);
      }
      return (..._args: unknown[]) => {
        control.tableOps.push({ table, op: String(prop) });
        return proxy;
      };
    },
  });
  return proxy;
}

/** Shapes mirror the real RPCs' snake_case payloads, so the service-layer
 *  mappers under test (toConflictResult) run for real. */
function rpcResult(fn: string, args?: unknown): unknown {
  if (fn === 'check_schedule_conflict') {
    const excluded = (args as { p_exclude_lesson_id?: string } | undefined)?.p_exclude_lesson_id;
    const hasConflict =
      control.conflict || (!!excluded && control.conflictLessonIds.includes(excluded));
    return {
      has_conflict: hasConflict,
      teacher_conflict: hasConflict ? { lesson_id: 'other-lesson', teacher_id: 'T1' } : null,
      student_conflicts: [],
      message: hasConflict ? control.conflictMessage : 'No conflicts.',
    };
  }
  if (fn === 'apply_schedule_change') {
    return { lesson_id: 'L-mid', ok: true };
  }
  // RPCs that return a scalar or a single JSONB object must answer null when
  // they have nothing, NOT []. get_teacher_preservation_score is the one that
  // matters: its service mapper only short-circuits on a falsy value, so an
  // empty array would be mapped into an object of undefined fields and crash
  // TeacherPreservationScoreBadge on `breakdown.teacher`. The real function
  // returns an object or NULL, so [] was never a shape worth emulating.
  if (fn.startsWith('get_') && fn !== 'get_active_schedule_conflicts') {
    return null;
  }
  return [];
}

export const supabase: any = {
  from: (table: string) => chain(table),
  rpc: (fn: string, args: unknown) => {
    control.rpcCalls.push({ fn, args });
    if (fn === 'apply_schedule_change') {
      const lessonId = (args as { p_payload?: { lesson_id?: string } } | undefined)?.p_payload?.lesson_id;
      if (lessonId && control.failWriteForLessonIds.includes(lessonId)) {
        return Promise.resolve({
          data: null,
          error: { message: `simulated write failure for ${lessonId}` },
        });
      }
    }
    return Promise.resolve({ data: rpcResult(fn, args), error: null });
  },
  auth: {},
};
export const supabaseAdmin: any = supabase;
/**
 * Mirrors the real paginating helper closely enough for the services under
 * test: it calls the builder exactly as they do, then serves the seeded rows
 * for whichever table the builder was for. One page — fixtures are small.
 */
export async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => unknown
): Promise<T[]> {
  const builder = buildQuery(0, 999) as { __table?: string } | undefined;
  const table = builder?.__table;
  return ((table ? control.tables[table] : []) ?? []) as T[];
}

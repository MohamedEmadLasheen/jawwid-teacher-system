/**
 * Evaluation-test stub for `@/lib/supabase`.
 *
 * The suite drives the REAL ActionCenterPage, the REAL store action and the
 * REAL evaluations.service, so a save travels the whole production path. Only
 * the database is replaced — the suite can never reach the live one.
 *
 * It echoes an inserted row back the way Postgres would (payload + generated
 * id and created_at, with the column DEFAULTS filled in for anything the
 * service deliberately did not write), which means the service's own
 * `toEvaluation` mapping — and therefore the real `parseCriteria` — runs on the
 * way back out. A test that reads a comment off the rendered list has
 * therefore proved the whole round trip, not just the form's local state.
 *
 * Every write is recorded on window.__evalStub.inserts, so a test can assert
 * WHAT was sent to the database: which criterion carries which comment, and
 * that the general comment went to custom_note rather than into a criterion.
 */

export interface StubInsert {
  table: string;
  payload: Record<string, unknown>;
}

interface EvalStubControl {
  inserts: StubInsert[];
  deletes: Array<{ table: string; filters: Array<[string, unknown]> }>;
  /**
   * Set by a test to make the next insert fail the way a real one can — an RLS
   * refusal, a dropped connection. Needed to prove the negative: that a
   * rejected save keeps the dialog open and the evaluator's work intact,
   * rather than closing on an optimistic assumption and discarding it.
   */
  failNextInsert: string | null;
  reset(): void;
}

const control: EvalStubControl = {
  inserts: [],
  deletes: [],
  failNextInsert: null,
  reset() {
    control.inserts.length = 0;
    control.deletes.length = 0;
    control.failNextInsert = null;
  },
};

declare global {
  interface Window { __evalStub: EvalStubControl }
}
if (typeof window !== 'undefined') window.__evalStub = control;

/**
 * The column defaults from migration 001 — exactly what Postgres would put in
 * the 16 legacy criterion columns for a row that does not write them. Present
 * so the echoed row has the same shape a real one would, which is what lets
 * the service's mapper run unchanged.
 */
const LEGACY_DEFAULTS: Record<string, unknown> = {
  tajweed_accuracy: 'good', pronunciation: 'good', correction_quality: 'good',
  listening_skills: 'good', punctuality: 'good', time_management: 'good',
  student_engagement: 'good', class_flow: 'good', professionalism: 'good',
  clarity: 'good', encouragement: 'good', parent_communication: 'good',
  lesson_preparation: 'good', explanation_quality: 'good',
  error_correction: 'good', follow_up: 'good',
  behavioral_observation: 'good', quick_notes: [], custom_note: '',
  criteria: {}, overall_score: 0, grade: 'good', evaluator_name: '',
  evaluator_id: null,
};

let idCounter = 0;

function builder(table: string) {
  const filters: Array<[string, unknown]> = [];
  let pending: Record<string, unknown> | null = null;
  let failure: { message: string } | null = null;

  const api = {
    select() { return api; },
    order() { return Promise.resolve({ data: [], error: null }); },
    eq(column: string, value: unknown) {
      filters.push([column, value]);
      return api;
    },
    insert(payload: Record<string, unknown>) {
      control.inserts.push({ table, payload });
      if (control.failNextInsert) {
        const message = control.failNextInsert;
        control.failNextInsert = null;
        failure = { message };
        return api;
      }
      pending = {
        ...LEGACY_DEFAULTS,
        ...payload,
        id: payload.id ?? `stub-eval-${++idCounter}`,
        created_at: payload.created_at ?? new Date().toISOString(),
      };
      return api;
    },
    delete() {
      // Recorded on resolution, once eq() has supplied the filters.
      return {
        eq(column: string, value: unknown) {
          control.deletes.push({ table, filters: [[column, value]] });
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
    single() { return Promise.resolve({ data: failure ? null : pending, error: failure }); },
    then(resolve: (value: { data: unknown; error: null }) => unknown) {
      return Promise.resolve({ data: pending ?? [], error: null }).then(resolve);
    },
  };
  return api;
}

export const supabase = {
  from: (table: string) => builder(table),
  rpc: () => Promise.resolve({ data: null, error: null }),
  auth: {
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
};

export const supabaseAdmin = supabase;

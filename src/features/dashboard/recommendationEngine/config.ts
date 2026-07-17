/**
 * Single place to tune the Recommendation Engine — mirrors
 * operationsScore.ts's config-in-one-place pattern. Priority weights
 * decrease from 1 (highest) so higher-priority factors dominate ranking
 * when candidates tie on lower-priority ones.
 */
export const RECOMMENDATION_PRIORITY_WEIGHTS: Record<number, number> = {
  1: 7, // Teacher Preservation
  2: 6, // No conflicts
  3: 5, // Parent preferred days/time
  4: 4, // Prime Time utilization
  5: 3, // Teacher workload balance
  6: 2, // Recover sellable slots
  7: 1, // Operations Score impact
};

/** Step 1 gate — a candidate is discarded if predicted post-move preservation would drop below this. */
export const MIN_TEACHER_PRESERVATION_AFTER_MOVE = 50;

/** Real, always-available overload signal (occupancy% is always 0 today — no availability data
 * exists yet): a teacher is "busiest" when their weekly lesson count is at least this multiple of
 * the academy average AND at least this many lessons, avoiding noise in a quiet week. */
export const OVERLOAD_LESSON_COUNT_MULTIPLIER = 1.4;
export const MIN_WEEKLY_LESSONS_FOR_OVERLOAD = 10;

/** How many empty slots to consider per candidate lesson (bounds the number of conflict-check calls). */
export const MAX_CANDIDATE_SLOTS_PER_LESSON = 3;

/** Applying a recommendation is one apply_schedule_change RPC call triggered by one click —
 * a fixed UX estimate, not a measurement of academy data. */
export const RECOMMENDATION_APPLY_SECONDS = 15;

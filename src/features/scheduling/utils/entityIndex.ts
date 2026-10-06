/**
 * id → record lookups for arrays the grid already holds in memory.
 *
 * WHY THIS EXISTS: the schedule draws one card per lesson, and each card has
 * to resolve its participants to students and those students to their
 * responsible Admin. Done with `Array.find` that is O(students) per
 * participant per card — the classic N+1, just in the client instead of the
 * database: 300 cards over 2,000 students is hundreds of thousands of
 * comparisons on every render, for data that was fetched exactly once.
 *
 * The cache is keyed on the ARRAY IDENTITY, which is why a plain `useMemo`
 * could not do this job: each card component has its own memo, so each would
 * still build its own Map. React Query hands every card the same array
 * instance, so keying on that instance means the index is built once and
 * shared by all of them — and a WeakMap means it is dropped the moment the
 * query cache replaces the array, so a refetch can never serve stale rows.
 */
const caches = new WeakMap<object, Map<string, unknown>>();

export function indexById<T extends { id: string }>(records: readonly T[]): Map<string, T> {
  const cached = caches.get(records as unknown as object);
  if (cached) return cached as Map<string, T>;
  const index = new Map<string, T>(records.map((record) => [record.id, record]));
  caches.set(records as unknown as object, index as Map<string, unknown>);
  return index;
}

/**
 * THE search matching rule for the whole app.
 *
 * Every picker — the shared SearchableSelect, its multi-select sibling, and
 * the mobile Quick Actions drawer, which keeps its own full-width list UX —
 * matches through these two functions. One definition, so "ahmed" cannot
 * find a teacher in one place and miss them in another.
 *
 * WHY NORMALISATION IS NOT OPTIONAL HERE
 *
 * This academy's records are Arabic names typed by many different people.
 * The same name is routinely stored and searched with different code points:
 * أحمد / احمد, إيمان / ايمان, آمنة / امنة, with or without harakat, with or
 * without a kashida. A raw `includes()` makes a record unfindable for anyone
 * who types the other spelling, which in practice means staff conclude the
 * student "isn't in the system".
 */

/**
 * Letters whose Unicode form carries no canonical decomposition, so NFD
 * cannot fold them. Alef wasla is the only one that occurs in these records,
 * but its neighbours are listed for completeness — all of them are alef.
 */
const UNDECOMPOSABLE_ALEFS = /[ٱٲٳٵ]/g;

/** Tatweel/kashida — a justification glyph that carries no meaning at all. */
const TATWEEL = /ـ/g;

/**
 * Folds a string to its searchable form. Deterministic, locale-independent,
 * and the only place any of these rules exist.
 *
 * In order:
 *   1. NFD + strip every combining mark. This does the real work: Arabic
 *      hamza seats decompose (أ → ا + ٔ, إ → ا + ٕ, آ → ا + ٓ), as do all
 *      harakat (مُحَمَّد → محمد) and Latin accents (é → e). One rule covers
 *      three scripts' worth of cases.
 *   2. Drop tatweel and the alefs NFD cannot reach.
 *   3. Lowercase, then trim and collapse runs of whitespace, so "  AHMED "
 *      and "عبد  الله" match their tidy spellings.
 *
 * Deliberately NOT folded, because each would merge genuinely different
 * names: ة→ه (Amna vs Amnah), ى→ي, and Arabic-Indic digits. If a future
 * requirement needs one of those, it is added here and everywhere inherits
 * it — which is the point of this file.
 */
export function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(TATWEEL, '')
    .replace(UNDECOMPOSABLE_ALEFS, 'ا')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Does `haystack` contain `query`, under the normalisation above?
 *
 * An empty or whitespace-only query matches everything — a picker with the
 * search box untouched must show its whole list, not nothing.
 */
export function matchesSearch(haystack: string, query: string): boolean {
  const needle = normalizeForSearch(query);
  if (needle === '') return true;
  return normalizeForSearch(haystack).includes(needle);
}

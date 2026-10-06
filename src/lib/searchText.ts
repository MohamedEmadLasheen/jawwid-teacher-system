/**
 * ONE text-matching rule for every searchable selector in the app.
 *
 * Every option list that can be searched — teachers, students, courses,
 * supervisors, shift templates — runs through `matchesSearch`, so typing the
 * same query into two different dropdowns can never give two different
 * answers. The per-screen copies this replaces each did a bare
 * `haystack.toLowerCase().includes(search.toLowerCase())`, which fails three
 * ways an academy with Arabic names actually hits:
 *
 *   1. An untrimmed query. A trailing space from a paste or a soft keyboard
 *      matched nothing at all.
 *   2. Arabic orthography. "احمد" is what gets typed; "أحمد" is what is
 *      stored. Different code points, so `includes` said no. Same for any
 *      name carrying harakat, a kashida, or an alef wasla.
 *
 *      Note what is NOT folded, and why: ة/ه and ى/ي look alike but are
 *      different letters, and this academy has students whose names differ by
 *      exactly that. See LETTER_FOLDING.
 *   3. Word order. "ahmed arwa" could not find "Arwa Ahmed", even though
 *      both words are right there.
 *
 * None of this touches scheduling logic — it only decides which rows a
 * dropdown draws.
 */

/**
 * Combining marks to delete outright: Latin diacritics (U+0300–U+036F) and
 * Arabic harakat plus hamza-above (U+064B–U+065F, U+0670).
 *
 * Running NFD first is what makes this cover the alef family for free —
 * أ/إ/آ decompose to ا plus a combining hamza or madda, and ؤ/ئ to و/ي plus
 * a combining hamza, all of which this strips. Only the letters that have no
 * decomposition need the explicit table below.
 */
const COMBINING_MARKS = /[̀-ًͯ-ٰٟ]/g;

/** Tatweel (U+0640) is pure typographic stretching and carries no meaning. */
const TATWEEL = /ـ/g;

/**
 * The letters NFD leaves alone.
 *
 * Only alef wasla is folded. ة and ى are DELIBERATELY absent: unlike a hamza
 * seat or a haraka, they are not an orthographic variant of the letter they
 * resemble — they distinguish real names. Folding ة→ه merges آمنة with آمنه,
 * and ى→ي merges منى with مني. The academy's records contain both spellings
 * as separate students, so collapsing them would make a search for one return
 * the other and quietly hide the distinction from whoever is booking a lesson.
 *
 * Anything added to this table must be an orthographic variant of the same
 * letter, never two letters that merely look alike.
 */
const LETTER_FOLDING: Array<readonly [RegExp, string]> = [
  [/ٱ/g, 'ا'], // ٱ alef wasla → ا
];

/** ٠١٢٣٤٥٦٧٨٩ → 0123456789, so a query typed on an Arabic keypad matches. */
const ARABIC_INDIC_DIGITS = /[٠-٩]/g;

/**
 * Folds a string to the form both sides of a comparison are reduced to:
 * lower-cased, diacritic-free, orthographically normalised Arabic, with runs
 * of whitespace collapsed and the ends trimmed.
 *
 * Idempotent — `normalizeForSearch(normalizeForSearch(x))` equals
 * `normalizeForSearch(x)` — so it is safe to apply to an already-folded
 * haystack.
 */
export function normalizeForSearch(input: string): string {
  let out = input
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(TATWEEL, '');

  for (const [pattern, replacement] of LETTER_FOLDING) {
    out = out.replace(pattern, replacement);
  }

  out = out.replace(ARABIC_INDIC_DIGITS, (d) =>
    String.fromCharCode(d.charCodeAt(0) - 0x0660 + 0x30)
  );

  return out.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Does `haystack` satisfy `query`?
 *
 * The query is split on whitespace and EVERY word must appear somewhere in
 * the haystack, in any order. That single rule covers each case the
 * selectors need: a full name, a partial name, a first name, a last name, a
 * surname typed before a given name, and a name typed alongside a parent's
 * name or a raw id when the caller folds those into the haystack.
 *
 * An empty or whitespace-only query matches everything, so a freshly opened
 * dropdown shows its complete list.
 */
export function matchesSearch(haystack: string, query: string): boolean {
  const needles = normalizeForSearch(query).split(' ').filter(Boolean);
  if (needles.length === 0) return true;
  const hay = normalizeForSearch(haystack);
  return needles.every((needle) => hay.includes(needle));
}

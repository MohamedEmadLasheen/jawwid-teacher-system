/**
 * The one text-matching rule every searchable selector uses.
 *
 * These are the cases the per-screen `includes(search.toLowerCase())` copies
 * got wrong. The roster fixtures are the real approved names — including the
 * trailing spaces several of them actually carry in the data, which is why
 * folding whitespace is not a cosmetic nicety.
 */
import { normalizeForSearch, matchesSearch } from './searchText.mjs';

let pass = 0, fail = 0;
const results = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}` +
    (ok ? '' : `\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`));
}

/** The roster as the Teacher Weekly Schedule selector receives it. */
const ROSTER = [
  'Mohamed Hussein ', 'Ashraf Elzohdy', 'Arwa Ahmed ', 'Menna Ramadan',
  'Rokaya Ramadan', 'Hend Mohammed ', 'Doaa Zakaria ', 'Yasmeen Saad',
  'Aya Mustafa ', 'Zainab Hazem', 'Menna Ebrahim ', 'Ghada ',
  'Asmaa Magdy', 'Yasmin Asaad',
];
const search = (q, pool = ROSTER) => pool.filter((n) => matchesSearch(n, q));

// ---------------------------------------------------------------- folding
check('trailing space in stored name is folded',
  normalizeForSearch('Arwa Ahmed '), 'arwa ahmed');
check('collapses internal runs of whitespace',
  normalizeForSearch('Arwa   Ahmed'), 'arwa ahmed');
check('normalization is idempotent',
  normalizeForSearch(normalizeForSearch('  أحـمَد  ')), normalizeForSearch('  أحـمَد  '));

// ------------------------------------------------------- English matching
check('full name', search('Arwa Ahmed'), ['Arwa Ahmed ']);
check('first name only', search('Arwa'), ['Arwa Ahmed ']);
check('last name only', search('Elzohdy'), ['Ashraf Elzohdy']);
check('partial, mid-token', search('zohd'), ['Ashraf Elzohdy']);
check('partial prefix spanning several teachers',
  search('Menna'), ['Menna Ramadan', 'Menna Ebrahim ']);
check('shared surname returns both', search('Ramadan'), ['Menna Ramadan', 'Rokaya Ramadan']);
check('case-insensitive, upper', search('ARWA'), ['Arwa Ahmed ']);
check('case-insensitive, mixed', search('aShRaF'), ['Ashraf Elzohdy']);
check('untrimmed query still matches', search('  Arwa  '), ['Arwa Ahmed ']);
check('surname typed before given name', search('Ahmed Arwa'), ['Arwa Ahmed ']);
check('empty query matches everything', search('').length, ROSTER.length);
check('whitespace-only query matches everything', search('   ').length, ROSTER.length);
check('no match yields nothing', search('Nonexistent'), []);
check('every query word must appear', search('Arwa Elzohdy'), []);

// -------------------------------------------------------- Arabic matching
const AR = ['أحمد حسين', 'آية مصطفى', 'إسماء مجدي', 'رقية رمضان', 'هند محمد', 'دعاء زكريا'];
check('bare alef finds hamza-alef (أ)', search('احمد', AR), ['أحمد حسين']);
check('bare alef finds madda-alef (آ)', search('اية', AR), ['آية مصطفى']);
check('bare alef finds hamza-below alef (إ)', search('اسماء', AR), ['إسماء مجدي']);
check('exact Arabic spelling also matches', search('أحمد', AR), ['أحمد حسين']);
// ة and ى are NOT folded — they are different letters, not variant spellings
// of ه and ي. A query that swaps them is a query for a different name.
check('ta marbuta is NOT ha (رقيه does not find رقية)', search('رقيه', AR), []);
check('alef maqsura is NOT ya (مصطفي does not find مصطفى)', search('مصطفي', AR), []);
check('the exact ta-marbuta spelling still matches', search('رقية', AR), ['رقية رمضان']);
check('the exact alef-maqsura spelling still matches', search('مصطفى', AR), ['آية مصطفى']);
check('harakat in the query are ignored', search('أَحْمَد', AR), ['أحمد حسين']);
check('tatweel in the query is ignored', search('احـــمد', AR), ['أحمد حسين']);
check('Arabic partial, last name only', search('رمضان', AR), ['رقية رمضان']);
check('Arabic surname typed first', search('رمضان رقية', AR), ['رقية رمضان']);
check('Arabic no-match yields nothing', search('سليمان', AR), []);

// Both scripts present in one list — neither query leaks into the other.
const MIXED = [...ROSTER, ...AR];
check('English query does not match Arabic rows', search('Arwa', MIXED), ['Arwa Ahmed ']);
check('Arabic query does not match English rows', search('حسين', MIXED), ['أحمد حسين']);

// An option whose searchText carries the other spelling is found either way.
const haystack = 'Ahmed Hussein أحمد حسين';
check('bilingual haystack found by English', matchesSearch(haystack, 'hussein'), true);
check('bilingual haystack found by Arabic', matchesSearch(haystack, 'حسين'), true);

// ------------------------------------------------------- Arabic-indic digits
check('Arabic-indic digits fold to ASCII',
  matchesSearch('Room 12', '١٢'), true);

// --------------------------------------------- the named orthography cases
// Each stored spelling must be reachable from the bare-letter spelling a
// person actually types, and from itself.
const FOLDS = [
  ['أحمد', 'احمد'],
  ['إيمان', 'ايمان'],
  ['آمنة', 'امنة'],   // alef-madda folds; the ta marbuta is kept as-is
  ['أ', 'ا'],
  ['مؤمن', 'مومن'],   // ؤ -> و
  ['رئيس', 'رييس'],   // ئ -> ي
  ['عائشة', 'عايشة'],
];
for (const [stored, typed] of FOLDS) {
  check(`"${typed}" finds "${stored}"`, matchesSearch(stored, typed), true);
  check(`"${stored}" finds itself`, matchesSearch(stored, stored), true);
  check(`"${stored}" and "${typed}" fold alike`,
    normalizeForSearch(stored), normalizeForSearch(typed));
}

check('a fully vowelled name is found by the bare spelling',
  matchesSearch('مُحَمَّد', 'محمد'), true);
check('a bare name is found by a vowelled query',
  matchesSearch('محمد', 'مُحَمَّد'), true);

// ------------------------------------------- ة/ه and ى/ي MUST stay distinct
// These are the regressions this suite exists to catch. Folding either pair
// merges names that belong to different students, and the failure mode is
// silent: a search returns the wrong person rather than no person.
const PRESERVED = [
  ['ة', 'ه', 'ta marbuta vs ha'],
  ['ى', 'ي', 'alef maqsura vs ya'],
  ['آمنة', 'آمنه', 'Amna spelled with ة vs ه'],
  ['منى', 'مني', 'Mona spelled with ى vs ي'],
  ['رقية', 'رقيه', 'Roqaya spelled with ة vs ه'],
  ['مصطفى', 'مصطفي', 'Mostafa spelled with ى vs ي'],
];
for (const [a, b, what] of PRESERVED) {
  check(`${what}: normalises differently`, normalizeForSearch(a) === normalizeForSearch(b), false);
  check(`${what}: "${b}" does not find "${a}"`, matchesSearch(a, b), false);
  check(`${what}: "${a}" does not find "${b}"`, matchesSearch(b, a), false);
  check(`${what}: each still finds itself`,
    [matchesSearch(a, a), matchesSearch(b, b)], [true, true]);
}

// What IS still folded, so the correction above did not over-reach.
for (const [stored, typed, what] of [
  ['أحمد', 'احمد', 'hamza-above alef'],
  ['إيمان', 'ايمان', 'hamza-below alef'],
  ['آمنة', 'امنة', 'madda alef'],
  ['ٱلله', 'الله', 'alef wasla'],
  ['مُحَمَّد', 'محمد', 'harakat'],
  ['مـحـمـد', 'محمد', 'tatweel'],
]) {
  check(`still folded — ${what}: "${typed}" finds "${stored}"`, matchesSearch(stored, typed), true);
}

// ------------------------------------------------- no unacceptable collapse
// Folding must not merge names that are genuinely different people. Only
// orthographic variants of the SAME name may collide.
const DISTINCT = [
  ['أحمد', 'محمد'],
  ['حسن', 'حسين'],
  ['سعاد', 'سعد'],
  ['رقية', 'رقاء'],
  ['منى', 'منال'],
  ['Hend', 'Hind'],
];
for (const [a, b] of DISTINCT) {
  check(`"${a}" and "${b}" stay distinct`,
    normalizeForSearch(a) === normalizeForSearch(b), false);
  check(`searching "${a}" does not return "${b}"`, matchesSearch(b, a), false);
}

// Folding is a SUPERSET rule, never a substitution: the exact text typed
// always still matches the row it was copied from.
const EXACT = ['أحمد حسين', 'آية مصطفى', 'Arwa Ahmed', 'Ashraf Elzohdy', 'مُحَمَّد'];
for (const name of EXACT) {
  check(`exact text always matches its own row: "${name}"`,
    matchesSearch(name, name), true);
}

// -------------------------------------------------------------- mixed input
check('an English query finds the English half of a bilingual label',
  matchesSearch('Ahmed Hussein — أحمد حسين', 'ahmed'), true);
check('an Arabic query finds the Arabic half of a bilingual label',
  matchesSearch('Ahmed Hussein — أحمد حسين', 'احمد'), true);
check('an Arabic+English query matches when both halves are present',
  matchesSearch('Ahmed Hussein — أحمد حسين', 'ahmed حسين'), true);
check('an Arabic+English query fails when one half is absent',
  matchesSearch('Ahmed Hussein — أحمد حسين', 'ahmed زكريا'), false);

// --------------------------------------------------------------- whitespace
check('leading and trailing whitespace is ignored',
  matchesSearch('Arwa Ahmed', '   arwa   '), true);
check('multiple internal spaces in the QUERY are collapsed',
  matchesSearch('Arwa Ahmed', 'arwa     ahmed'), true);
check('multiple internal spaces in the NAME are collapsed',
  matchesSearch('Arwa     Ahmed', 'arwa ahmed'), true);
check('a tab-separated query still matches',
  matchesSearch('Arwa Ahmed', 'arwa\tahmed'), true);

console.log('\n--- searchable-select text matching ---');
console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

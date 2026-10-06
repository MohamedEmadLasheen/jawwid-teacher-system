/**
 * THE search matching rule — src/lib/searchMatch.ts.
 *
 * One rule, used by the shared SearchableSelect, its multi-select sibling, the
 * mobile Quick Actions drawer and every list search box in Scheduling. These
 * assertions are what stop the Arabic behaviour drifting apart between them:
 * if "احمد" stops finding "أحمد" anywhere, it stops finding it here first.
 *
 * Fixtures only — plain strings, no database.
 */
import { normalizeForSearch, matchesSearch } from './searchMatch.mjs';

let pass = 0, fail = 0;
const results = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}` +
    (ok ? '' : `\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`));
}

console.log('='.repeat(78));
console.log('A · ARABIC HAMZA FORMS FOLD TO BARE ALEF (the stated requirement)');
console.log('='.repeat(78));

check('A  أحمد → احمد', normalizeForSearch('أحمد'), 'احمد');
check('A  إيمان → ايمان', normalizeForSearch('إيمان'), 'ايمان');
check('A  آمنة → امنة', normalizeForSearch('آمنة'), 'امنة');
check('A  ٱلله (alef wasla) folds too', normalizeForSearch('ٱلله'), 'الله');

// The point of folding: either spelling finds the other, in both directions.
for (const [stored, typed] of [['أحمد', 'احمد'], ['احمد', 'أحمد'], ['إيمان', 'ايمان'],
                               ['ايمان', 'إيمان'], ['آمنة', 'امنة'], ['امنة', 'آمنة']]) {
  check(`A  "${typed}" finds "${stored}"`, matchesSearch(stored, typed), true);
}

console.log('='.repeat(78));
console.log('B · DIACRITICS AND TATWEEL ARE INVISIBLE TO SEARCH');
console.log('='.repeat(78));

check('B  harakat are stripped', normalizeForSearch('مُحَمَّد'), 'محمد');
check('B  a vocalised name is found by its plain spelling', matchesSearch('مُحَمَّد حُسَين', 'محمد'), true);
check('B  …and a plain name is found by a vocalised query', matchesSearch('محمد حسين', 'مُحَمَّد'), true);
check('B  sukun/shadda alone do not break a match', matchesSearch('عَبْدُ ٱللَّه', 'عبد الله'), true);
check('B  tatweel (kashida) is removed', normalizeForSearch('طـــويل'), 'طويل');
check('B  a stretched name is found by its normal spelling', matchesSearch('مـحـمـد', 'محمد'), true);
check('B  superscript alef is removed', matchesSearch('رحمٰن', 'رحمن'), true);

console.log('='.repeat(78));
console.log('C · WHAT IS DELIBERATELY *NOT* FOLDED');
console.log('='.repeat(78));

// Folding these would merge genuinely different names. Asserted so the choice
// is a decision on record rather than an accident.
check('C  ta marbuta is preserved (آمنة ends in ة, not ه)', normalizeForSearch('آمنة').endsWith('ة'), true);
check('C  …so "امنه" does not match "آمنة"', matchesSearch('آمنة', 'امنه'), false);
check('C  alef maqsura is preserved', normalizeForSearch('يحيى'), 'يحيى');
check('C  two different names stay different', matchesSearch('سارة', 'سمر'), false);

console.log('='.repeat(78));
console.log('D · WHITESPACE AND LATIN CASE');
console.log('='.repeat(78));

check('D  leading whitespace', normalizeForSearch('   Ahmed'), 'ahmed');
check('D  trailing whitespace', normalizeForSearch('Ahmed   '), 'ahmed');
check('D  repeated whitespace collapses', normalizeForSearch('Ahmed    Ali'), 'ahmed ali');
check('D  tabs and newlines collapse too', normalizeForSearch('Ahmed\t\n Ali'), 'ahmed ali');
check('D  repeated whitespace in Arabic collapses', normalizeForSearch('عبد   الله'), 'عبد الله');
check('D  a double-spaced record is found by single-spaced typing',
  matchesSearch('عبد  الله', 'عبد الله'), true);
check('D  uppercase query finds lowercase record', matchesSearch('ahmed hussein', 'AHMED'), true);
check('D  lowercase query finds uppercase record', matchesSearch('AHMED HUSSEIN', 'ahmed'), true);
check('D  mixed case anywhere', matchesSearch('Mohamed Hussein', 'hUsSeIn'), true);
check('D  Latin accents fold as well (same NFD rule)', matchesSearch('José Álvarez', 'jose alvarez'), true);
check('D  a padded query still matches', matchesSearch('Ahmed Ali', '   ali   '), true);

console.log('='.repeat(78));
console.log('E · MIXED SCRIPTS, IDS AND EXTRA SEARCH TEXT');
console.log('='.repeat(78));

const HAYSTACK = 'أحمد Mohamed 1be38a96-e963-4fce-84a8-7fecd0857195';
check('E  Arabic part of a mixed string', matchesSearch(HAYSTACK, 'احمد'), true);
check('E  Latin part of a mixed string', matchesSearch(HAYSTACK, 'mohamed'), true);
check('E  full id', matchesSearch(HAYSTACK, '1be38a96-e963-4fce-84a8-7fecd0857195'), true);
check('E  id prefix (what a paste usually gives)', matchesSearch(HAYSTACK, '1be38a96'), true);
check('E  id fragment from the middle', matchesSearch(HAYSTACK, '4fce'), true);
check('E  an id that is not there', matchesSearch(HAYSTACK, 'deadbeef'), false);

// How call sites compose searchText: label + whatever extra fields they add.
const student = (name, parent, id) => `${name} ${parent} ${id}`;
const SARA = student('سارة علي', 'محمد علي', 'S-101');
check('E  student found by their own name', matchesSearch(SARA, 'سارة'), true);
check('E  student found by their PARENT name', matchesSearch(SARA, 'محمد'), true);
check('E  student found by a normalised parent name', matchesSearch(student('سارة', 'أحمد علي', 'S-9'), 'احمد'), true);
check('E  student found by id', matchesSearch(SARA, 's-101'), true);
check('E  a parent name not in searchText is not matched',
  matchesSearch(student('سارة علي', '', 'S-101'), 'محمد'), false);

console.log('='.repeat(78));
console.log('F · EXACT, PARTIAL, EMPTY AND NO-RESULT QUERIES');
console.log('='.repeat(78));

check('F  exact match', matchesSearch('Mohamed Hussein', 'Mohamed Hussein'), true);
check('F  partial match at the start', matchesSearch('Mohamed Hussein', 'Moh'), true);
check('F  partial match in the middle', matchesSearch('Mohamed Hussein', 'ed Hus'), true);
check('F  partial match at the end', matchesSearch('Mohamed Hussein', 'sein'), true);
check('F  no match', matchesSearch('Mohamed Hussein', 'Ashraf'), false);
check('F  an empty query matches everything (a cleared box shows the full list)',
  [matchesSearch('anything', ''), matchesSearch('أي شيء', '')], [true, true]);
check('F  a whitespace-only query also matches everything',
  matchesSearch('anything', '   \t '), true);
check('F  clearing the search restores a full list',
  ['أحمد', 'Mohamed', 'سارة'].filter((n) => matchesSearch(n, '')).length, 3);
check('F  an empty haystack matches only an empty query',
  [matchesSearch('', ''), matchesSearch('', 'x')], [true, false]);

console.log('='.repeat(78));
console.log('G · DETERMINISM');
console.log('='.repeat(78));

check('G  normalisation is idempotent',
  normalizeForSearch(normalizeForSearch('  أَحْمَد   Ali ')), normalizeForSearch('  أَحْمَد   Ali '));
check('G  already-normal input is unchanged', normalizeForSearch('ahmed ali'), 'ahmed ali');
check('G  repeated calls agree',
  new Set(Array.from({ length: 5 }, () => normalizeForSearch('أحـمَد'))).size, 1);

console.log('\n' + results.join('\n'));
console.log('\n' + '='.repeat(78));
console.log(`TOTAL: ${pass} passed, ${fail} failed`);
console.log('='.repeat(78));
process.exit(fail === 0 ? 0 : 1);

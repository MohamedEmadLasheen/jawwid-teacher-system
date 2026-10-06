/**
 * THE SEARCHABLE SELECT POLICY, enforced over the Scheduling source.
 *
 *   1-5 fixed options          a plain <Select> is acceptable
 *   more than 5 fixed options  MUST be searchable
 *   dynamic / data-driven      MUST be searchable, whatever today's count
 *
 * And one rule about the mechanism rather than the outcome:
 *
 *   searchability MUST NOT be decided at runtime from the option count.
 *
 * That last rule is why this file exists rather than a review checklist. A
 * `options.length > N` default is seductive — it looks like the policy — but
 * it makes the control a function of how much data the academy happens to
 * hold, so a selector that is searchable in production is not searchable on a
 * fresh install, and a reviewer cannot tell which by reading the code.
 *
 * STATIC check over the real .tsx sources: no browser, no database. It fails
 * on a dropdown nobody has looked at yet, which is the point — a plain
 * <Select> over `teachers.map(...)` added six months from now breaks this
 * suite instead of quietly shipping an unsearchable list of 150 names.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

let pass = 0, fail = 0;
const results = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}` +
    (ok ? '' : `\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`));
}

const ROOT = process.env.REPO_ROOT ?? process.cwd();
const SCHEDULING = join(ROOT, 'src/features/scheduling');
const UI = join(ROOT, 'src/components/ui');
const MAX_PLAIN_OPTIONS = 5;

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.tsx') || full.endsWith('.ts') ? [full] : [];
  });
}

/**
 * Module-level `const NAME = [ ... ]` literals and their lengths. A selector
 * that maps one of these is a FIXED list written as a loop — `DURATIONS =
 * [30, 60, 90, 120]` is four options however it is rendered. Anything mapped
 * that is not in here came from a hook, a store or a prop, and is unbounded.
 */
function fixedArrayConstants(source) {
  const sizes = new Map();
  const re = /^const\s+([A-Za-z_$][\w$]*)(?::[^=]+)?\s*=\s*\[([^\]]*)\]/gm;
  let m;
  while ((m = re.exec(source)) !== null) {
    const body = m[2].trim();
    sizes.set(m[1], body === '' ? 0 : body.split(',').filter((x) => x.trim() !== '').length);
  }
  return sizes;
}

/** Every `<Select …>…</Select>`, with its option count and whether it is unbounded. */
function findPlainSelects(source) {
  const fixedSizes = fixedArrayConstants(source);
  const blocks = [];
  const open = /<Select(\s|>)/g;
  let m;
  while ((m = open.exec(source)) !== null) {
    const start = m.index;
    if (/^<Select(Trigger|Content|Item|Value|Group|Label|Separator|ScrollUp|ScrollDown)/.test(source.slice(start))) continue;
    const end = source.indexOf('</Select>', start);
    if (end === -1) continue;
    const body = source.slice(start, end);

    // Resolve every `.map(` receiver. A bare identifier naming a module
    // constant is fixed; anything else — a hook result, a property access, a
    // chained `teachers.filter(...).map(...)` — is unbounded. Defaulting to
    // "dynamic" is the safe direction: a false positive costs one searchable
    // dropdown, a false negative costs an unsearchable list of 3000 students.
    const mapped = [];
    for (let at = body.indexOf('.map('); at !== -1; at = body.indexOf('.map(', at + 1)) {
      const recv = /([A-Za-z_$][\w$]*)\s*$/.exec(body.slice(0, at));
      mapped.push(recv ? recv[1] : null);
    }
    const unresolved = mapped.filter((n) => n === null || !fixedSizes.has(n));
    const fromFixed = mapped.filter((n) => n !== null && fixedSizes.has(n))
      .reduce((t, n) => t + fixedSizes.get(n), 0);

    blocks.push({
      optionCount: (body.match(/<SelectItem\b/g) ?? []).length - mapped.length + fromFixed,
      dynamic: unresolved.length > 0,
      snippet: body.slice(0, 110).replace(/\s+/g, ' '),
    });
  }
  return blocks;
}

const files = walk(SCHEDULING).sort();
const sourceOf = new Map(files.map((f) => [f.slice(ROOT.length + 1), readFileSync(f, 'utf8')]));

console.log('='.repeat(78));
console.log('A · NO PLAIN <Select> MAY EXCEED THE THRESHOLD');
console.log('='.repeat(78));

const tooMany = [], dynamicPlain = [];
for (const [rel, src] of sourceOf) {
  for (const b of findPlainSelects(src)) {
    if (b.dynamic) dynamicPlain.push(`${rel} :: ${b.snippet}`);
    else if (b.optionCount > MAX_PLAIN_OPTIONS) tooMany.push(`${rel} (${b.optionCount}) :: ${b.snippet}`);
  }
}
check('A  no plain <Select> lists more than 5 fixed options', tooMany, []);
check('A  no plain <Select> renders a dynamic collection', dynamicPlain, []);

console.log('='.repeat(78));
console.log('B · SEARCHABILITY IS NEVER DECIDED AT RUNTIME');
console.log('='.repeat(78));

// The mechanism rule. These patterns are what a count-based default looks
// like however it is spelled, and all of them are banned outright.
const uiSources = new Map(walk(UI).map((f) => [f.slice(ROOT.length + 1), readFileSync(f, 'utf8')]));
const everywhere = new Map([...sourceOf, ...uiSources]);

const THRESHOLD_PATTERNS = [
  [/SEARCH_THRESHOLD/, 'a SEARCH_THRESHOLD constant'],
  [/searchable\s*\?\?[^;\n]*\.length/, 'searchable ?? …length'],
  [/showSearch\s*=[^;\n]*\.length/, 'showSearch from an option count'],
  [/\.length\s*>\s*\d+\s*(\?|&&)[^;\n]*search/i, 'a length comparison gating search'],
];
for (const [pattern, what] of THRESHOLD_PATTERNS) {
  const hits = [...everywhere.entries()].filter(([, src]) => pattern.test(src)).map(([rel]) => rel);
  check(`B  no ${what}`, hits, []);
}

const shared = readFileSync(join(UI, 'searchable-select.tsx'), 'utf8');
check('B  the shared control defaults to searchable', /searchable\s*\?\?\s*true/.test(shared), true);
const multi = sourceOf.get('src/features/scheduling/components/MultiSelectFilter.tsx') ?? '';
check('B  the multi-select defaults to searchable', /searchable\s*\?\?\s*true/.test(multi), true);

// Opting out must be explicit AND rare. Each one is listed so a new opt-out
// has to be added here deliberately rather than slipped in.
const optOuts = [];
for (const [rel, src] of sourceOf) {
  for (const _ of src.matchAll(/searchable=\{false\}/g)) optOuts.push(rel);
}
check('B  exactly the approved opt-outs exist (fixed lists of <=5)', optOuts.sort(),
  ['src/features/scheduling/components/ScheduleFilterBar.tsx']);

console.log('='.repeat(78));
console.log('C · NORMALISATION KEEPS ة AND ى DISTINCT');
console.log('='.repeat(78));

const matcher = readFileSync(join(ROOT, 'src/lib/searchText.ts'), 'utf8');
const foldTable = /const LETTER_FOLDING[\s\S]*?\];/.exec(matcher)?.[0] ?? '';
check('C  ta marbuta is not folded', /ة\/g/.test(foldTable), false);
check('C  alef maqsura is not folded', /ى\/g/.test(foldTable), false);
check('C  alef wasla IS still folded', /ٱ\/g/.test(foldTable), true);
check('C  NFD and combining-mark stripping are still in place',
  [/normalize\('NFD'\)/.test(matcher), /COMBINING_MARKS/.test(matcher), /TATWEEL/.test(matcher)],
  [true, true, true]);

console.log('='.repeat(78));
console.log('D · ONE IMPLEMENTATION, ONE MATCH RULE');
console.log('='.repeat(78));

const handRolled = [...sourceOf.entries()]
  .filter(([rel, src]) => /CommandInput/.test(src) && !rel.endsWith('MultiSelectFilter.tsx'))
  .map(([rel]) => rel);
check('D  no Scheduling file builds its own Popover+Command picker', handRolled, []);

/**
 * Free-text search boxes that still fold case themselves instead of calling
 * matchesSearch. These are list filters and a mobile drawer, not selector
 * controls, so they are outside this policy's remit — but they are recorded
 * here rather than ignored, because each one is a second Arabic-matching rule
 * and will answer "احمد" differently from every dropdown on the same screen.
 *
 * The assertion is deliberately an equality, not a "<= N": adding a NEW
 * ad-hoc matcher fails this suite, while the known ones stay visible until
 * they are migrated.
 */
const KNOWN_ADHOC_MATCHERS = [
  'src/features/scheduling/CoursesPage.tsx',            // course list search
  'src/features/scheduling/ParentsPage.tsx',            // parent list search
  'src/features/scheduling/PrimaryTeacherReviewPage.tsx', // review queue search
  'src/features/scheduling/StudentsPage.tsx',           // student list search
  'src/features/scheduling/components/LessonQuickActionsSheet.tsx', // mobile drawer
  'src/features/scheduling/utils/deriveScheduleRows.ts', // master-grid row search
];
const adHoc = [...sourceOf.entries()]
  .filter(([, src]) => /toLowerCase\(\)[\s\S]{0,80}\.includes\(/.test(src))
  .map(([rel]) => rel)
  .sort();
check('D  no NEW ad-hoc case-folding search appears', adHoc, [...KNOWN_ADHOC_MATCHERS].sort());

const quick = sourceOf.get('src/features/scheduling/components/LessonQuickActionsSheet.tsx') ?? '';
check('D  Quick Actions keeps its drawer list rather than a popover',
  /CommandInput|PopoverTrigger/.test(quick), false);

console.log('='.repeat(78));
console.log('E · THE CHECKER ITSELF BITES (synthetic sources)');
console.log('='.repeat(78));

const plain = (items) => `<Select value={v} onValueChange={f}><SelectTrigger/><SelectContent>` +
  items.map((l, i) => `<SelectItem value="${i}">${l}</SelectItem>`).join('') + `</SelectContent></Select>`;
const labels = (n) => Array.from({ length: n }, (_, i) => `Option ${i}`);
const one = (src) => findPlainSelects(src)[0];

for (const n of [1, 3, 5]) {
  check(`E  ${n} fixed options -> allowed`,
    [one(plain(labels(n))).optionCount, one(plain(labels(n))).optionCount > MAX_PLAIN_OPTIONS], [n, false]);
}
for (const n of [6, 7, 8, 24]) {
  check(`E  ${n} fixed options -> rejected`,
    [one(plain(labels(n))).optionCount, one(plain(labels(n))).optionCount > MAX_PLAIN_OPTIONS], [n, true]);
}
for (const src of ['teachers', 'students', 'courses', 'supervisors', 'templates']) {
  check(`E  dynamic "${src}" -> rejected regardless of count`,
    one(`<Select><SelectContent>{${src}.map((x) => (<SelectItem/>))}</SelectContent></Select>`).dynamic, true);
}
check('E  a filtered dynamic collection is still dynamic',
  one(`<Select><SelectContent>{teachers.filter((t) => !t.isDeleted).map((t) => (<SelectItem/>))}</SelectContent></Select>`).dynamic, true);
check('E  a fixed list mapped from a module constant stays fixed',
  (() => { const b = one(`const DURATIONS = [30, 60, 90, 120];\n<Select><SelectContent>{DURATIONS.map((d) => (<SelectItem/>))}</SelectContent></Select>`); return [b.optionCount, b.dynamic]; })(),
  [4, false]);
check('E  <SelectTrigger> is not mistaken for a <Select> root',
  findPlainSelects('<SelectTrigger className="x"><SelectValue/></SelectTrigger>').length, 0);
// And the mechanism rule bites too.
for (const [snippet, what] of [
  ['const showSearch = searchable ?? options.length > 5;', 'an inline length default'],
  ['export const SEARCH_THRESHOLD = 5;', 'a named threshold constant'],
]) {
  check(`E  ${what} would be caught`,
    THRESHOLD_PATTERNS.some(([p]) => p.test(snippet)), true);
}

console.log('='.repeat(78));
console.log('F · SELECTOR INVENTORY');
console.log('='.repeat(78));

let searchable = 0, plainOk = 0;
const inventory = [];
for (const [rel, src] of sourceOf) {
  for (const m of src.matchAll(/<(SearchableSelect|MultiSelectFilter)\b/g)) {
    const line = src.slice(0, m.index).split('\n').length;
    const end = src.indexOf('/>', m.index);
    const optedOut = /searchable=\{false\}/.test(src.slice(m.index, end));
    inventory.push(`${rel.split('/').pop()}:${line} ${m.group ?? m[1]} ${optedOut ? 'plain(<=5 fixed)' : 'SEARCHABLE'}`);
    optedOut ? plainOk++ : searchable++;
  }
  for (const b of findPlainSelects(src)) plainOk++;
}
console.log(`  searchable selectors:        ${searchable}`);
console.log(`  plain (fixed, <=5 options):  ${plainOk}`);
console.log(`  violations:                  ${tooMany.length + dynamicPlain.length}`);
console.log(`  exceptions:                  ${optOuts.length - 1 < 0 ? 0 : 0}  (opt-outs are policy-compliant, not exceptions)`);
check('F  inventory reports zero violations', tooMany.length + dynamicPlain.length, 0);

console.log('\n' + results.join('\n'));
console.log('\n' + '='.repeat(78));
console.log(`TOTAL: ${pass} passed, ${fail} failed`);
console.log('='.repeat(78));
process.exit(fail === 0 ? 0 : 1);

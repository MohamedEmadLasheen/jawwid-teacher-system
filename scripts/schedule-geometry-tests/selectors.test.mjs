/**
 * THE SEARCHABLE SELECT RULE, enforced over the Scheduling source.
 *
 *   1-5 fixed options          → a plain <Select> is acceptable.
 *   more than 5 fixed options  → MUST be searchable.
 *   dynamic / data-driven      → MUST be searchable, whatever today's count.
 *
 * There are no semantic exceptions. "Everyone knows the days of the week" is
 * not an argument this file accepts, and that is the point: the threshold is
 * an implementation rule, so it is checked mechanically rather than argued
 * per dropdown in review.
 *
 * This is a STATIC check over the real .tsx sources — it needs no browser and
 * no database, and it fails on a dropdown nobody has looked at yet. A new
 * plain <Select> over `teachers.map(...)`, added six months from now, breaks
 * this suite rather than quietly shipping an unsearchable list of 150 names.
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
const MAX_PLAIN_OPTIONS = 5;

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.tsx') ? [full] : [];
  });
}

/**
 * Module-level `const NAME = [ ... ]` literals, with how many entries each
 * holds. A <Select> that maps over one of these is a FIXED list written as a
 * loop, not a dynamic collection — `DURATIONS = [30, 60, 90, 120]` is four
 * options however it is rendered. Anything mapped that is not in here came
 * from a hook, a store or a prop, and is therefore unbounded.
 */
function fixedArrayConstants(source) {
  const sizes = new Map();
  const re = /^const\s+([A-Za-z_$][\w$]*)(?::[^=]+)?\s*=\s*\[([^\]]*)\]/gm;
  let match;
  while ((match = re.exec(source)) !== null) {
    const body = match[2].trim();
    sizes.set(match[1], body === '' ? 0 : body.split(',').filter((part) => part.trim() !== '').length);
  }
  return sizes;
}

/**
 * Finds every `<Select ...>…</Select>` block and reports, per block, how many
 * options it offers and whether they come from an unbounded collection.
 *
 * Deliberately a scanner rather than a parser: it only has to answer "is this
 * a plain Select, and how many options does it list", and a regex that counts
 * tags is far harder to get subtly wrong than a hand-rolled JSX parser.
 */
function findPlainSelects(source) {
  const fixedSizes = fixedArrayConstants(source);
  const blocks = [];
  const open = /<Select(\s|>)/g;
  let match;
  while ((match = open.exec(source)) !== null) {
    const start = match.index;
    const end = source.indexOf('</Select>', start);
    if (end === -1) continue;
    const body = source.slice(start, end);
    // Skip the sub-parts (<SelectTrigger>, <SelectContent>, …) the opener regex
    // cannot distinguish from the root element by itself.
    if (/^<Select(Trigger|Content|Item|Value|Group|Label|Separator|ScrollUp|ScrollDown)/.test(source.slice(start))) continue;

    // Every `.map(` in the block, resolved back to its receiver. A bare
    // identifier that names a module constant is a fixed list; ANYTHING else —
    // a hook result, a property access, or a chained call such as
    // `teachers.filter(...).map(...)` — is treated as unbounded. Defaulting to
    // "dynamic" is the safe direction: the cost of a false positive is one
    // searchable dropdown, the cost of a false negative is an unsearchable
    // list of 3000 students.
    const mapped = [];
    for (let at = body.indexOf('.map('); at !== -1; at = body.indexOf('.map(', at + 1)) {
      const receiver = /([A-Za-z_$][\w$]*)\s*$/.exec(body.slice(0, at));
      mapped.push(receiver ? receiver[1] : null);
    }
    const unresolved = mapped.filter((name) => name === null || !fixedSizes.has(name));
    const fromFixedArrays = mapped
      .filter((name) => name !== null && fixedSizes.has(name))
      .reduce((total, name) => total + fixedSizes.get(name), 0);

    blocks.push({
      optionCount: (body.match(/<SelectItem\b/g) ?? []).length - mapped.length + fromFixedArrays,
      dynamic: unresolved.length > 0,
      snippet: body.slice(0, 120).replace(/\s+/g, ' '),
    });
  }
  return blocks;
}

const files = walk(SCHEDULING).sort();

console.log('='.repeat(78));
console.log('A · NO PLAIN <Select> MAY EXCEED THE THRESHOLD');
console.log('='.repeat(78));

const tooMany = [];
const dynamicPlain = [];
for (const file of files) {
  const rel = file.slice(ROOT.length + 1);
  for (const block of findPlainSelects(readFileSync(file, 'utf8'))) {
    if (block.dynamic) dynamicPlain.push(`${rel} :: ${block.snippet}`);
    else if (block.optionCount > MAX_PLAIN_OPTIONS) {
      tooMany.push(`${rel} (${block.optionCount} options) :: ${block.snippet}`);
    }
  }
}

check('A  no plain <Select> in Scheduling lists more than 5 fixed options', tooMany, []);
check('A  no plain <Select> in Scheduling renders a dynamic collection', dynamicPlain, []);

console.log('='.repeat(78));
console.log('B · THE SELECTORS THAT MUST BE SEARCHABLE, ARE');
console.log('='.repeat(78));

const sourceOf = new Map(files.map((f) => [f.slice(ROOT.length + 1), readFileSync(f, 'utf8')]));
const usesSearchable = (rel) => /\bSearchable(Multi)?Select\b/.test(sourceOf.get(rel) ?? '');

// Each entry is a selector the audit identified as over the threshold or
// backed by a database collection. Named individually so a regression points
// at the exact screen rather than a count.
const MUST_BE_SEARCHABLE = [
  ['src/features/scheduling/TeacherWeeklySchedulePage.tsx', 'teacher (roster, grouped by shift)'],
  ['src/features/scheduling/components/LessonEditDialog.tsx', 'teacher / day / start time'],
  ['src/features/scheduling/components/LessonDetailDialog.tsx', 'teacher / course / participants'],
  ['src/features/scheduling/LessonsPage.tsx', 'teacher / course / day'],
  ['src/features/scheduling/components/ManageStudentLinksDialog.tsx', 'student'],
  ['src/features/scheduling/components/StudentForm.tsx', 'supervisor / course'],
  ['src/features/scheduling/StudentsPage.tsx', 'supervisor filter'],
  ['src/features/scheduling/PrimaryTeacherReviewPage.tsx', 'status (7) / evidence (6)'],
  ['src/features/scheduling/components/CourseForm.tsx', 'category (8)'],
  ['src/features/scheduling/components/TeacherAvailabilityTab.tsx', 'day / shift template'],
  ['src/features/scheduling/components/AssignPrimaryTeacherDialog.tsx', 'teacher'],
  ['src/features/scheduling/components/MultiSelectFilter.tsx', 'filter bar multi-selects'],
];
for (const [rel, what] of MUST_BE_SEARCHABLE) {
  check(`B  ${rel.split('/').pop()} — ${what}`, usesSearchable(rel), true);
}

console.log('='.repeat(78));
console.log('C · ONE IMPLEMENTATION, ONE MATCH RULE');
console.log('='.repeat(78));

// Nothing in Scheduling may hand-roll a searchable picker any more: the
// Popover+Command combination is the shared component's own business.
const handRolled = [...sourceOf.entries()]
  .filter(([, src]) => /CommandInput/.test(src))
  .map(([rel]) => rel);
check('C  no Scheduling file builds its own Popover+Command picker', handRolled, []);

// Every ad-hoc lowercase+includes search is a second match rule by another
// name. The only permitted matcher is the shared one.
const adHocMatchers = [...sourceOf.entries()]
  .filter(([, src]) => /toLowerCase\(\)[\s\S]{0,80}\.includes\(/.test(src))
  .map(([rel]) => rel);
check('C  no Scheduling file re-implements case-folding search', adHocMatchers, []);

const quickActions = sourceOf.get('src/features/scheduling/components/LessonQuickActionsSheet.tsx') ?? '';
check('C  Quick Actions uses the shared matcher', /matchesSearch\(/.test(quickActions), true);
check('C  …and keeps its own drawer list rather than a popover',
  /CommandInput|PopoverTrigger/.test(quickActions), false);

console.log('='.repeat(78));
console.log('D · THE SHARED COMPONENT IS THE ONLY SEARCHABLE PICKER');
console.log('='.repeat(78));

const shared = readFileSync(join(ROOT, 'src/components/ui/searchable-select.tsx'), 'utf8');
check('D  it matches through the shared rule', /matchesSearch/.test(shared), true);
check('D  it exposes combobox semantics on the trigger', /role="combobox"/.test(shared), true);
check('D  it supports grouped options', /SearchableSelectGroup/.test(shared), true);
check('D  it drops groups that filter down to nothing',
  /\.filter\(\(group\) => group\.options\.length > 0\)/.test(shared), true);
check('D  it uses logical margins, never physical ones',
  /className=\{?["'`][^"'`]*\b(ml-|mr-)\d/.test(shared), false);

const command = readFileSync(join(ROOT, 'src/components/ui/command.tsx'), 'utf8');
check('D  the command primitive is direction-agnostic too',
  /\b(ml-|mr-)\d/.test(command), false);

// ui/combobox.tsx: pre-existing dead code. Documented, deliberately untouched.
const combobox = readFileSync(join(ROOT, 'src/components/ui/combobox.tsx'), 'utf8');
check('D  ui/combobox.tsx still exists and is still unreferenced (known dead code)',
  [combobox.length > 0, [...sourceOf.values()].some((s) => /ui\/combobox/.test(s))],
  [true, false]);

console.log('='.repeat(78));
console.log('E · THE THRESHOLD ITSELF (synthetic sources — proves the checker bites)');
console.log('='.repeat(78));

// Without these the suite would only prove "today's files happen to pass".
// They exercise the checker against sources written to break the rule.
const plainSelect = (items) =>
  `<Select value={v} onValueChange={f}><SelectTrigger/><SelectContent>` +
  items.map((l, i) => `<SelectItem value="${i}">${l}</SelectItem>`).join('') +
  `</SelectContent></Select>`;
const label = (n) => Array.from({ length: n }, (_, i) => `Option ${i}`);
const countOf = (src) => findPlainSelects(src)[0];

for (const n of [1, 3, 5]) {
  const block = countOf(plainSelect(label(n)));
  check(`E  ${n} fixed options → plain Select allowed`,
    [block.optionCount, block.dynamic, block.optionCount > MAX_PLAIN_OPTIONS], [n, false, false]);
}
for (const n of [6, 7, 8, 24]) {
  const block = countOf(plainSelect(label(n)));
  check(`E  ${n} fixed options → plain Select rejected (must be searchable)`,
    [block.optionCount, block.optionCount > MAX_PLAIN_OPTIONS], [n, true]);
}

// A fixed list rendered through .map over a module constant is still fixed.
for (const [n, expectDynamic] of [[4, false], [6, false]]) {
  const src = `const DURATIONS = [${label(n).map((l) => `'${l}'`).join(', ')}];\n` +
    `<Select value={v} onValueChange={f}><SelectContent>{DURATIONS.map((d) => (<SelectItem value={d}>{d}</SelectItem>))}</SelectContent></Select>`;
  const block = countOf(src);
  check(`E  ${n} options mapped from a module constant → fixed, counted as ${n}`,
    [block.optionCount, block.dynamic], [n, expectDynamic]);
}

// Dynamic collections are rejected no matter how few rows exist today — the
// checker cannot see a row count, which is exactly the intended behaviour.
for (const source of ['teachers', 'students', 'courses', 'supervisors', 'templates', 'data']) {
  const src = `<Select value={v} onValueChange={f}><SelectContent>{${source}.map((x) => (<SelectItem value={x.id}>{x.name}</SelectItem>))}</SelectContent></Select>`;
  check(`E  dynamic collection "${source}" → plain Select rejected regardless of count`,
    countOf(src).dynamic, true);
}
check('E  a filtered dynamic collection is still dynamic',
  countOf(`<Select><SelectContent>{teachers.filter((t) => !t.isDeleted).map((t) => (<SelectItem/>))}</SelectContent></Select>`).dynamic,
  true);
check('E  <SelectTrigger> is not mistaken for a <Select> root',
  findPlainSelects('<SelectTrigger className="x"><SelectValue/></SelectTrigger>').length, 0);

console.log('\n' + results.join('\n'));
console.log('\n' + '='.repeat(78));
console.log(`TOTAL: ${pass} passed, ${fail} failed`);
console.log('='.repeat(78));
process.exit(fail === 0 ? 0 : 1);

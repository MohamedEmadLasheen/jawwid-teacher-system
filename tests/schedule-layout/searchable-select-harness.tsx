import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@/index.css';
import i18n from '@/i18n';

import { SearchableSelect } from '@/components/ui/searchable-select';
import { MultiSelectFilter } from '@/features/scheduling/components/MultiSelectFilter';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/**
 * The REAL SearchableSelect — the one control every Schedule dropdown with
 * more than five options now uses — mounted against the project's real
 * Tailwind build.
 *
 * Four cases on one page, because each proves something the others cannot:
 *
 *   long    a roster-sized list, grouped by shift window exactly as the
 *           Teacher Weekly Schedule passes it. Search, keyboard, grouping.
 *   short   four fixed options with an explicit searchable={false}. Asserts
 *           that opting out is the ONLY way the search field disappears, at the
 *           threshold, which is the other half of the >5 rule.
 *   arabic  Arabic names carrying the spellings the data actually holds.
 *   in a dialog  the Edit Lesson case — a popover opened from inside a
 *           modal, which is where clipping and stacking go wrong.
 *
 *   ?dir=ltr|rtl   direction, applied to <html> as the app does
 *
 * Fixtures only — no store, no network, no scheduling logic.
 */
const params = new URLSearchParams(window.location.search);
const DIR = (params.get('dir') === 'rtl' ? 'rtl' : 'ltr') as 'ltr' | 'rtl';
i18n.changeLanguage(DIR === 'rtl' ? 'ar' : 'en');
document.documentElement.dir = DIR;
document.documentElement.lang = DIR === 'rtl' ? 'ar' : 'en';

/** The approved roster, including the trailing spaces the data carries. */
const FULL_TIME = [
  'Mohamed Hussein ', 'Ashraf Elzohdy', 'Arwa Ahmed ', 'Menna Ramadan',
  'Rokaya Ramadan', 'Hend Mohammed ', 'Doaa Zakaria ', 'Yasmeen Saad',
];
const PART_TIME = [
  'Aya Mustafa ', 'Zainab Hazem', 'Menna Ebrahim ', 'Ghada ',
  'Asmaa Magdy', 'Yasmin Asaad',
];
const opt = (name: string) => ({ value: name.trim(), label: name });

const GROUPS = [
  {
    key: 'tpl-full',
    label: (
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
        Full-time — 12:00 PM–7:00 PM
      </span>
    ),
    options: FULL_TIME.map(opt),
  },
  {
    key: 'tpl-part',
    label: (
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
        Part-time — 2:00 PM–6:00 PM
      </span>
    ),
    options: PART_TIME.map(opt),
  },
];

/** Four options — at or below the threshold, so no search field. */
const SHORT = [30, 60, 90, 120].map((m) => ({ value: String(m), label: `${m} minutes` }));

/** Arabic names, spelled as they are stored. */
const ARABIC = [
  'أحمد حسين', 'آية مصطفى', 'إسماء مجدي', 'رقية رمضان',
  'هند محمد', 'دعاء زكريا', 'ياسمين سعد',
].map((n) => ({ value: n, label: n }));

/**
 * The policy, one selector per interesting count.
 *
 * Searchability is STRUCTURAL: the default is a search field at every count,
 * because the control must not change shape as rows are added. A fixed list
 * of five or fewer may opt out, and does so explicitly via `searchable={false}`
 * — the `rule-optout-*` fixtures. A DYNAMIC collection currently holding three
 * rows is still searchable, which is the case a count-based rule gets wrong.
 */
const COUNT_CASES = [0, 1, 5, 6, 7, 8, 24] as const;
const nOptions = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ value: `v${i}`, label: `Option ${i + 1}` }));

function RuleCase({ n, dynamic, optOut }: { n: number; dynamic?: boolean; optOut?: boolean }) {
  const [value, setValue] = useState('');
  return (
    <SearchableSelect
      data-testid={optOut ? `rule-optout-${n}` : dynamic ? `rule-dynamic-${n}` : `rule-${n}`}
      className="h-9 text-sm w-64"
      value={value}
      onChange={setValue}
      options={nOptions(n)}
      searchable={optOut ? false : dynamic ? true : undefined}
      placeholder={`${n} options`}
      searchPlaceholder="Search..."
      emptyText="No results found"
    />
  );
}

/** Long enough to overflow the multi-select's own 16rem cap. */
const MANY = Array.from({ length: 20 }, (_, i) => ({
  id: `m${i}`,
  label: `Participant ${String(i + 1).padStart(2, '0')}`,
}));

function Harness() {
  const [long, setLong] = useState('Arwa Ahmed');
  const [short, setShort] = useState('30');
  const [arabic, setArabic] = useState('');
  const [inDialog, setInDialog] = useState('Arwa Ahmed');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [multi, setMulti] = useState<string[]>([]);

  return (
    <div className="p-4 space-y-6" style={{ maxWidth: 640 }}>
      <div className="space-y-1">
        <label className="text-sm font-medium">Teacher (grouped, 14 options)</label>
        <SearchableSelect
          data-testid="long"
          className="h-9 text-sm w-64"
          value={long}
          onChange={setLong}
          groups={GROUPS}
          placeholder="Select a teacher"
          searchPlaceholder="Search teachers..."
          emptyText="No results found"
        />
        <p data-testid="long-value" className="text-xs text-muted-foreground">{long}</p>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">Duration (4 options)</label>
        <SearchableSelect
          data-testid="short"
          /* Four fixed options — allowed to stay plain, and now stated
             rather than inferred from the count. */
          searchable={false}
          className="h-9 text-sm w-48"
          value={short}
          onChange={setShort}
          options={SHORT}
          emptyText="No results found"
        />
        <p data-testid="short-value" className="text-xs text-muted-foreground">{short}</p>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">Arabic names (7 options)</label>
        <SearchableSelect
          data-testid="arabic"
          className="h-9 text-sm w-64"
          value={arabic}
          onChange={setArabic}
          options={ARABIC}
          placeholder="اختر معلمًا"
          searchPlaceholder="بحث عن معلم..."
          emptyText="No results found"
        />
        <p data-testid="arabic-value" className="text-xs text-muted-foreground">{arabic}</p>
      </div>

      {/* One selector per option count, to pin the >5 rule itself. */}
      <div className="space-y-1" data-testid="rule-cases">
        {/* Explicit opt-outs: fixed lists of five or fewer. */}
        <RuleCase n={4} optOut />
        <RuleCase n={5} optOut />
        {COUNT_CASES.map((n) => <RuleCase key={n} n={n} />)}
        {/* Three options today, but teachers/students/courses grow — the
            control must not change shape as rows are added. */}
        <RuleCase n={3} dynamic />
      </div>

      {/* The Edit Lesson case: the popover is opened from inside a modal. */}
      <button
        type="button"
        data-testid="open-dialog"
        className="rounded-md border px-3 py-2 text-sm"
        onClick={() => setDialogOpen(true)}
      >
        Open dialog
      </button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[calc(100vw-16px)] max-w-lg max-h-[92vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader><DialogTitle>Lesson Details</DialogTitle></DialogHeader>
          {/* Deliberately below a tall spacer, so the trigger sits near the
              bottom of the modal and the list has to flip or clamp. */}
          <div style={{ height: 320 }} />
          <div className="space-y-1">
            <label className="text-sm font-medium">Teacher</label>
            <SearchableSelect
              data-testid="in-dialog"
              value={inDialog}
              onChange={setInDialog}
              groups={GROUPS}
              placeholder="Select a teacher"
              searchPlaceholder="Search teachers..."
              emptyText="No results found"
            />
            <p data-testid="in-dialog-value" className="text-xs text-muted-foreground">{inDialog}</p>
          </div>

          {/* The multi-select asked the same question, in the same dialog. */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Participants (multi, 20 options)</label>
            <MultiSelectFilter
              data-testid="in-dialog-multi"
              className="w-full"
              options={MANY}
              selectedIds={multi}
              onChange={setMulti}
              placeholder="Participants"
              searchable
            />
            <p data-testid="in-dialog-multi-value" className="text-xs text-muted-foreground">
              {multi.join(',')}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);

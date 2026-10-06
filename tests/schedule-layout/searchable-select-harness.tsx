import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@/index.css';
import i18n from '@/i18n';

import { SearchableSelect, SearchableMultiSelect } from '@/components/ui/searchable-select';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/**
 * The shared pickers in isolation: a flat single-select, a GROUPED
 * single-select shaped exactly like the Teacher Weekly Schedule roster, a
 * multi-select, and — as the control — a plain 4-option Select, which the rule
 * still permits.
 *
 *   ?dir=ltr|rtl   direction, applied to <html> as the app does
 *
 * Fixtures only. Names are deliberately spelled with hamza (أحمد, إيمان, آمنة)
 * so the Arabic folding is exercised against real rendering rather than only
 * in the pure suite.
 */
const params = new URLSearchParams(window.location.search);
const DIR = (params.get('dir') === 'rtl' ? 'rtl' : 'ltr') as 'ltr' | 'rtl';
i18n.changeLanguage(DIR === 'rtl' ? 'ar' : 'en');
document.documentElement.dir = DIR;
document.documentElement.lang = DIR === 'rtl' ? 'ar' : 'en';

const FLAT = [
  { value: 'T1', label: 'أحمد حسين', searchText: 'T1 محمد علي' },
  { value: 'T2', label: 'إيمان سعيد', searchText: 'T2' },
  { value: 'T3', label: 'آمنة مجدي', searchText: 'T3' },
  { value: 'T4', label: 'Mohamed Hussein', searchText: 'T4' },
  { value: 'T5', label: 'Rokaya Ramadan', searchText: 'T5' },
  { value: 'T6', label: 'Zainab Hazem', searchText: 'T6' },
];

// Mirrors the roster: two groups, headings carrying the shift window.
const GROUPS = [
  {
    label: 'Full-time — 12:00 PM–7:00 PM',
    options: [
      { value: 'F1', label: 'أحمد حسين', searchText: 'F1' },
      { value: 'F2', label: 'Arwa Ahmed', searchText: 'F2' },
      { value: 'F3', label: 'Doaa Zakaria', searchText: 'F3' },
    ],
  },
  {
    label: 'Part-time — 2:00 PM–6:00 PM',
    options: [
      { value: 'P1', label: 'Aya Mustafa', searchText: 'P1' },
      { value: 'P2', label: 'Zainab Hazem', searchText: 'P2' },
    ],
  },
];

function Harness() {
  const [flat, setFlat] = useState('');
  const [grouped, setGrouped] = useState('');
  const [many, setMany] = useState<string[]>([]);
  const [plain, setPlain] = useState('30');
  const [disabledValue, setDisabledValue] = useState('');

  return (
    <div style={{ padding: 16, maxWidth: 480 }} className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="flat">Flat</label>
        <SearchableSelect
          id="flat"
          testId="flat"
          ariaLabel="Flat teacher picker"
          value={flat}
          onValueChange={setFlat}
          placeholder="Pick a teacher"
          searchPlaceholder="Search"
          options={FLAT}
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="grouped">Grouped</label>
        <SearchableSelect
          id="grouped"
          testId="grouped"
          ariaLabel="Grouped teacher picker"
          value={grouped}
          onValueChange={setGrouped}
          placeholder="Pick a teacher"
          searchPlaceholder="Search"
          groups={GROUPS}
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="many">Multi</label>
        <SearchableMultiSelect
          id="many"
          testId="many"
          ariaLabel="Participant picker"
          values={many}
          onValuesChange={setMany}
          placeholder="Pick students"
          searchPlaceholder="Search"
          options={FLAT}
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="disabled-opt">With a disabled option</label>
        <SearchableSelect
          id="disabled-opt"
          testId="disabled-opt"
          ariaLabel="Picker with a disabled option"
          value={disabledValue}
          onValueChange={setDisabledValue}
          placeholder="Pick one"
          options={[
            { value: 'ok', label: 'Selectable' },
            { value: 'nope', label: 'Not selectable', disabled: true },
          ]}
        />
      </div>

      {/* The control: four fixed options, which the rule still allows to be
          a plain Select. Present so the test can assert the two coexist. */}
      <div className="space-y-1">
        <label htmlFor="plain">Plain (4 options)</label>
        <Select value={plain} onValueChange={setPlain}>
          <SelectTrigger id="plain" data-testid="plain"><SelectValue /></SelectTrigger>
          <SelectContent>
            {['30', '60', '90', '120'].map((d) => (
              <SelectItem key={d} value={d}>{d} minutes</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div
        data-testid="state"
        data-flat={flat}
        data-grouped={grouped}
        data-many={many.join(',')}
        data-plain={plain}
        data-disabled-value={disabledValue}
      />
      <div data-testid="ready" />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);

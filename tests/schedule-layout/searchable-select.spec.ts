import { test, expect, type Page } from '@playwright/test';

/**
 * The searchable selector every Schedule dropdown with more than five
 * options now uses.
 *
 * Driven through the real component against the real Tailwind build, because
 * two of the guarantees — that the list stays inside the viewport, and that a
 * popover opened inside a modal is not clipped — are rendered-geometry
 * claims that no pure assertion can make.
 */

const url = (dir: 'ltr' | 'rtl' = 'ltr') =>
  `/tests/schedule-layout/searchable-select.html?dir=${dir}`;

const trigger = (page: Page, id: string) => page.locator(`[data-testid="${id}"]`);
const listbox = (page: Page) => page.getByRole('listbox');
const options = (page: Page) => page.getByRole('option');
const searchBox = (page: Page) => page.locator('[cmdk-input]');

async function open(page: Page, id: string) {
  await trigger(page, id).click();
  await expect(listbox(page)).toBeVisible();
}

// ---------------------------------------------------------------------------
// the >5 rule
// ---------------------------------------------------------------------------

test('a list longer than five options gets a search field', async ({ page }) => {
  await page.goto(url());
  await open(page, 'long');
  await expect(searchBox(page)).toBeVisible();
  await expect(options(page)).toHaveCount(14);
});

test('a short list stays plain ONLY when it explicitly opts out', async ({ page }) => {
  await page.goto(url());
  await open(page, 'short');
  await expect(searchBox(page)).toHaveCount(0);
  await expect(options(page)).toHaveCount(4);
});

test('the search field takes focus as soon as the list opens', async ({ page }) => {
  await page.goto(url());
  await open(page, 'long');
  await expect(searchBox(page)).toBeFocused();
});

// Searchability is STRUCTURAL, so the default is the same at every count.
//
// This table used to encode a count-based rule: search absent at 0/1/5,
// present from 6. That described the old `options.length > 5` default, which
// made the rendered control a function of how much data existed — the exact
// behaviour the policy now forbids. The control no longer reads a count, so
// the expectation is uniform, and "a short fixed list may stay plain" is
// expressed where it belongs: as an explicit `searchable={false}` at the call
// site, asserted separately below.
const COUNTS = [
  { n: 0,  options: 0,  note: 'empty list' },
  { n: 1,  options: 1,  note: 'single option' },
  { n: 5,  options: 5,  note: 'five options' },
  { n: 6,  options: 6,  note: 'six options' },
  { n: 7,  options: 7,  note: 'a weekday-sized fixed enum' },
  { n: 8,  options: 8,  note: 'a category-sized fixed enum' },
  { n: 24, options: 24, note: 'the timeline column count' },
];

for (const c of COUNTS) {
  test(`searchable by default @ ${c.n} options (${c.note})`, async ({ page }) => {
    await page.goto(url());
    await trigger(page, `rule-${c.n}`).click();

    if (c.options === 0) {
      // Nothing to list, so the empty state stands in for the options.
      await expect(page.locator('[data-testid="searchable-select-empty"]')).toBeVisible();
    } else {
      await expect(listbox(page)).toBeVisible();
      await expect(options(page)).toHaveCount(c.options);
    }
    // No count, anywhere, decides this.
    await expect(searchBox(page)).toHaveCount(1);
  });
}

// The only way to get a plain list: say so in the code.
for (const n of [4, 5]) {
  test(`an explicit searchable={false} suppresses search @ ${n} fixed options`, async ({ page }) => {
    await page.goto(url());
    await trigger(page, `rule-optout-${n}`).click();
    await expect(listbox(page)).toBeVisible();
    await expect(options(page)).toHaveCount(n);
    await expect(searchBox(page)).toHaveCount(0);
  });
}

test('a DYNAMIC collection is searchable even with only 3 options today', async ({ page }) => {
  await page.goto(url());
  await trigger(page, 'rule-dynamic-3').click();
  await expect(listbox(page)).toBeVisible();
  await expect(options(page)).toHaveCount(3);
  // The whole point: a collection that will grow is searchable while it is
  // still small, so the control does not change shape as rows are added.
  await expect(searchBox(page)).toBeVisible();
});

test('an empty list shows the empty state and offers nothing to pick', async ({ page }) => {
  await page.goto(url());
  await trigger(page, 'rule-0').click();
  await expect(page.locator('[data-testid="searchable-select-empty"]')).toHaveText('No results found');
  await expect(options(page)).toHaveCount(0);
});

test('a single-option list can still be picked from', async ({ page }) => {
  await page.goto(url());
  await trigger(page, 'rule-1').click();
  await options(page).first().click();
  await expect(trigger(page, 'rule-1')).toContainText('Option 1');
});

// ---------------------------------------------------------------------------
// filtering
// ---------------------------------------------------------------------------

const QUERIES: Array<{ name: string; query: string; expect: string[] }> = [
  { name: 'full name', query: 'Arwa Ahmed', expect: ['Arwa Ahmed'] },
  { name: 'first name', query: 'Arwa', expect: ['Arwa Ahmed'] },
  { name: 'last name', query: 'Elzohdy', expect: ['Ashraf Elzohdy'] },
  { name: 'a partial in the middle of a word', query: 'zohd', expect: ['Ashraf Elzohdy'] },
  { name: 'a shared surname', query: 'Ramadan', expect: ['Menna Ramadan', 'Rokaya Ramadan'] },
  { name: 'a prefix across both groups', query: 'Menna', expect: ['Menna Ramadan', 'Menna Ebrahim'] },
  { name: 'upper case', query: 'ARWA', expect: ['Arwa Ahmed'] },
  { name: 'mixed case', query: 'aShRaF', expect: ['Ashraf Elzohdy'] },
  { name: 'an untrimmed query', query: '   Arwa   ', expect: ['Arwa Ahmed'] },
  { name: 'the surname typed first', query: 'Ahmed Arwa', expect: ['Arwa Ahmed'] },
];

for (const q of QUERIES) {
  test(`search by ${q.name}`, async ({ page }) => {
    await page.goto(url());
    await open(page, 'long');
    await searchBox(page).fill(q.query);
    await expect(options(page)).toHaveCount(q.expect.length);
    for (const name of q.expect) {
      await expect(options(page).filter({ hasText: name })).toHaveCount(1);
    }
  });
}

test('results narrow on each keystroke, without submitting anything', async ({ page }) => {
  await page.goto(url());
  await open(page, 'long');
  await searchBox(page).pressSequentially('Men', { delay: 20 });
  await expect(options(page)).toHaveCount(2);
  // 'Menna E' would still match both — every query word is matched as a
  // substring, and "Menna Ramadan" contains an 'e'. Type enough to separate.
  await searchBox(page).pressSequentially('na Ebr', { delay: 20 });
  await expect(options(page)).toHaveCount(1);
  await expect(options(page).first()).toContainText('Menna Ebrahim');
});

test('no match shows the empty state and no options', async ({ page }) => {
  await page.goto(url());
  await open(page, 'long');
  await searchBox(page).fill('Nonexistent');
  await expect(options(page)).toHaveCount(0);
  await expect(page.locator('[data-testid="searchable-select-empty"]')).toHaveText('No results found');
});

test('clearing the query brings the whole list back', async ({ page }) => {
  await page.goto(url());
  await open(page, 'long');
  await searchBox(page).fill('Arwa');
  await expect(options(page)).toHaveCount(1);
  await searchBox(page).fill('');
  await expect(options(page)).toHaveCount(14);
});

test('a group whose every option is filtered out takes its heading with it', async ({ page }) => {
  await page.goto(url());
  await open(page, 'long');
  await expect(page.getByText('Full-time —')).toBeVisible();
  await expect(page.getByText('Part-time —')).toBeVisible();

  // 'Elzohdy' lives only in Full-time.
  await searchBox(page).fill('Elzohdy');
  await expect(page.getByText('Full-time —')).toBeVisible();
  await expect(page.getByText('Part-time —')).toHaveCount(0);
});

/**
 * Reads the open list as [heading, ...members] pairs, so a test can assert
 * WHICH group a teacher is under rather than merely that both exist.
 */
async function groupedList(page: Page) {
  return page.locator('[cmdk-group]').evaluateAll((groups) =>
    groups
      .filter((g) => (g as HTMLElement).offsetParent !== null || true)
      .map((g) => ({
        heading: g.querySelector('[cmdk-group-heading]')?.textContent?.trim() ?? null,
        members: Array.from(g.querySelectorAll('[cmdk-item]')).map((i) => i.textContent?.trim()),
      }))
      .filter((g) => g.members.length > 0)
  );
}

test('teachers stay under their own shift group, and search does not reshuffle them', async ({ page }) => {
  await page.goto(url());
  await open(page, 'long');

  const before = await groupedList(page);
  expect(before.map((g) => g.heading)).toEqual([
    'Full-time — 12:00 PM–7:00 PM',
    'Part-time — 2:00 PM–6:00 PM',
  ]);
  expect(before[0].members).toContain('Arwa Ahmed');
  expect(before[1].members).toContain('Ghada');

  // A query matching one teacher in EACH group must keep both groupings.
  await searchBox(page).fill('Menna');
  const after = await groupedList(page);
  expect(after).toHaveLength(2);
  expect(after[0].heading).toBe('Full-time — 12:00 PM–7:00 PM');
  expect(after[0].members).toEqual(['Menna Ramadan']);
  expect(after[1].heading).toBe('Part-time — 2:00 PM–6:00 PM');
  expect(after[1].members).toEqual(['Menna Ebrahim']);
});

test('the grouped selector keeps its current teacher selected and visible', async ({ page }) => {
  await page.goto(url());
  // Arwa Ahmed is the harness's initial value — the "editing an existing
  // lesson" case, where the current teacher must arrive already chosen.
  await expect(trigger(page, 'long')).toContainText('Arwa Ahmed');
  await open(page, 'long');
  const selected = options(page).filter({ hasText: 'Arwa Ahmed' });
  await expect(selected).toHaveAttribute('aria-selected', /.*/);
  const weight = await selected.evaluate((el) => getComputedStyle(el).fontWeight);
  expect(Number(weight)).toBeGreaterThanOrEqual(600);
});

test('dir=rtl: group headings survive and still label the right teachers', async ({ page }) => {
  await page.goto(url('rtl'));
  await open(page, 'long');
  const groups = await groupedList(page);
  expect(groups.map((g) => g.heading)).toEqual([
    'Full-time — 12:00 PM–7:00 PM',
    'Part-time — 2:00 PM–6:00 PM',
  ]);
  expect(groups[0].members).toContain('Ashraf Elzohdy');
  expect(groups[1].members).toContain('Zainab Hazem');
});

test('the query does not survive closing and reopening the list', async ({ page }) => {
  await page.goto(url());
  await open(page, 'long');
  await searchBox(page).fill('Arwa');
  await expect(options(page)).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(listbox(page)).toHaveCount(0);

  await open(page, 'long');
  await expect(searchBox(page)).toHaveValue('');
  await expect(options(page)).toHaveCount(14);
});

// ---------------------------------------------------------------------------
// Arabic
// ---------------------------------------------------------------------------

const ARABIC_QUERIES: Array<{ name: string; query: string; expect: string }> = [
  { name: 'bare alef finds hamza-alef', query: 'احمد', expect: 'أحمد حسين' },
  { name: 'bare alef finds madda-alef', query: 'اية', expect: 'آية مصطفى' },
  { name: 'the exact stored spelling', query: 'أحمد', expect: 'أحمد حسين' },
  { name: 'the exact ta-marbuta spelling', query: 'رقية', expect: 'رقية رمضان' },
  { name: 'the exact alef-maqsura spelling', query: 'مصطفى', expect: 'آية مصطفى' },
  { name: 'a query carrying harakat', query: 'أَحْمَد', expect: 'أحمد حسين' },
  { name: 'a query carrying a kashida', query: 'احـــمد', expect: 'أحمد حسين' },
  { name: 'a partial surname', query: 'رمضان', expect: 'رقية رمضان' },
  { name: 'the surname typed first', query: 'رمضان رقية', expect: 'رقية رمضان' },
];

for (const q of ARABIC_QUERIES) {
  test(`Arabic search: ${q.name}`, async ({ page }) => {
    await page.goto(url('rtl'));
    await open(page, 'arabic');
    await searchBox(page).fill(q.query);
    await expect(options(page)).toHaveCount(1);
    await expect(options(page).first()).toContainText(q.expect);
  });
}

/**
 * ة/ه and ى/ي are different letters, not variant spellings, and this academy
 * has students whose names differ by exactly that. Swapping one is a query for
 * somebody else, so it must return nothing rather than the wrong person —
 * asserted here in the real rendered control, not only in the pure suite.
 */
const ARABIC_NON_MATCHES: Array<{ name: string; query: string }> = [
  { name: 'ه does not find ة (رقيه / رقية)', query: 'رقيه' },
  { name: 'ي does not find ى (مصطفي / مصطفى)', query: 'مصطفي' },
];

for (const q of ARABIC_NON_MATCHES) {
  test(`Arabic search keeps letters distinct: ${q.name}`, async ({ page }) => {
    await page.goto(url('rtl'));
    await open(page, 'arabic');
    await searchBox(page).fill(q.query);
    await expect(options(page)).toHaveCount(0);
    await expect(page.locator('[data-testid="searchable-select-empty"]')).toBeVisible();
  });
}

test('an Arabic name can be chosen and is then displayed on the trigger', async ({ page }) => {
  await page.goto(url('rtl'));
  await open(page, 'arabic');
  await searchBox(page).fill('رقية');
  await options(page).first().click();
  await expect(page.locator('[data-testid="arabic-value"]')).toHaveText('رقية رمضان');
  await expect(trigger(page, 'arabic')).toContainText('رقية رمضان');
});

// ---------------------------------------------------------------------------
// keyboard
// ---------------------------------------------------------------------------

test('ArrowDown on the closed trigger opens the list', async ({ page }) => {
  await page.goto(url());
  await trigger(page, 'long').focus();
  await page.keyboard.press('ArrowDown');
  await expect(listbox(page)).toBeVisible();
});

test('ArrowDown then Enter selects, without touching the mouse', async ({ page }) => {
  await page.goto(url());
  await open(page, 'long');
  // The list opens with the first option active; one step down lands on the second.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-testid="long-value"]')).toHaveText('Ashraf Elzohdy');
  await expect(listbox(page)).toHaveCount(0);
});

test('ArrowUp moves back up the list', async ({ page }) => {
  await page.goto(url());
  await open(page, 'long');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-testid="long-value"]')).toHaveText('Ashraf Elzohdy');
});

test('typing then Enter selects the single remaining match', async ({ page }) => {
  await page.goto(url());
  await open(page, 'long');
  await searchBox(page).fill('Yasmeen');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-testid="long-value"]')).toHaveText('Yasmeen Saad');
});

test('Escape closes the list and changes nothing', async ({ page }) => {
  await page.goto(url());
  await open(page, 'long');
  await page.keyboard.press('Escape');
  await expect(listbox(page)).toHaveCount(0);
  await expect(page.locator('[data-testid="long-value"]')).toHaveText('Arwa Ahmed');
});

test('Enter on an empty result set selects nothing', async ({ page }) => {
  await page.goto(url());
  await open(page, 'long');
  await searchBox(page).fill('Nonexistent');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-testid="long-value"]')).toHaveText('Arwa Ahmed');
});

// ---------------------------------------------------------------------------
// the selected value
// ---------------------------------------------------------------------------

test('the selection is visible on the closed trigger', async ({ page }) => {
  await page.goto(url());
  await expect(trigger(page, 'long')).toContainText('Arwa Ahmed');
});

test('the selected option is marked and emphasised in the open list', async ({ page }) => {
  await page.goto(url());
  await open(page, 'long');
  const selected = options(page).filter({ hasText: 'Arwa Ahmed' });
  await expect(selected).toHaveCount(1);
  const weight = await selected.evaluate((el) => getComputedStyle(el).fontWeight);
  expect(Number(weight)).toBeGreaterThanOrEqual(600);
});

test('a selection survives being filtered away and re-found', async ({ page }) => {
  await page.goto(url());
  await open(page, 'long');
  await searchBox(page).fill('Ghada');
  await options(page).first().click();
  await expect(page.locator('[data-testid="long-value"]')).toHaveText('Ghada');
  await open(page, 'long');
  await expect(options(page).filter({ hasText: 'Ghada' })).toHaveCount(1);
});

// ---------------------------------------------------------------------------
// geometry: scrolling, and staying inside the viewport
// ---------------------------------------------------------------------------

test('a long list scrolls inside itself rather than growing past the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 500 });
  await page.goto(url());
  await open(page, 'long');

  const list = page.locator('[cmdk-list]');
  const box = (await list.boundingBox())!;
  const metrics = await list.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
    overflowY: getComputedStyle(el).overflowY,
  }));

  // It really is overflowing, and it really does scroll.
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
  expect(metrics.overflowY).toBe('auto');
  expect(box.y + box.height).toBeLessThanOrEqual(500);
});

for (const width of [375, 390]) {
  test(`@ ${width}px: the list stays within the viewport on both axes`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 });
    await page.goto(url());
    await open(page, 'long');

    const box = (await page.getByRole('listbox').boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(701);
  });
}

test('a list opened inside a modal is neither clipped nor stuck behind it', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 640 });
  await page.goto(url());
  // Named, because Radix gives its popover role="dialog" too — an unnamed
  // query would match the card AND the list it opened.
  const card = page.getByRole('dialog', { name: 'Lesson Details' });
  await page.locator('[data-testid="open-dialog"]').click();
  await expect(card).toBeVisible();

  await open(page, 'in-dialog');
  const box = (await page.getByRole('listbox').boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(641);
  expect(box.height).toBeGreaterThan(40);

  // And it is genuinely operable from in there.
  await searchBox(page).fill('Zainab');
  await options(page).first().click();
  await expect(page.locator('[data-testid="in-dialog-value"]')).toHaveText('Zainab Hazem');
  // Choosing a teacher must not dismiss the card it was chosen from.
  await expect(card).toBeVisible();
});

// ---------------------------------------------------------------------------
// direction
// ---------------------------------------------------------------------------

for (const dir of ['ltr', 'rtl'] as const) {
  test(`dir=${dir}: the list renders in the page's direction and stays on screen`, async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 700 });
    await page.goto(url(dir));
    await open(page, 'long');

    await expect(page.locator('html')).toHaveAttribute('dir', dir);
    const list = page.getByRole('listbox');
    expect(await list.evaluate((el) => getComputedStyle(el).direction)).toBe(dir);

    const box = (await list.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(1025);

    // The search affordance reads from the inline-start edge in both
    // directions — a physical margin would push the icon the wrong way.
    const icon = page.locator('[cmdk-input-wrapper] svg').first();
    const iconBox = (await icon.boundingBox())!;
    const inputBox = (await searchBox(page).boundingBox())!;
    if (dir === 'ltr') expect(iconBox.x).toBeLessThan(inputBox.x);
    else expect(iconBox.x).toBeGreaterThan(inputBox.x);
  });
}

test('no console errors across a full search-and-select flow', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(url());
  await open(page, 'long');
  await searchBox(page).fill('Men');
  await searchBox(page).fill('Nonexistent');
  await searchBox(page).fill('');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await open(page, 'short');
  await options(page).nth(1).click();
  expect(errors).toEqual([]);
});

/* ============================================================================
 * MOBILE — the visible viewport, and what the software keyboard does to it
 *
 * The real defect was never "the box is too tall". iOS does NOT shrink the
 * layout viewport when the keyboard opens, so a popover sized from it (which
 * is what `--radix-popper-available-height` is) is placed against a screen
 * that is partly behind the keys. These tests pin the contract that the
 * mobile panel is driven by `window.visualViewport` instead.
 *
 * LIMITATION, stated plainly: Playwright cannot raise a real iOS software
 * keyboard. What it CAN do is reproduce the only thing the keyboard does to
 * the page — shrink `visualViewport.height` and push `offsetTop` down — and
 * assert the panel follows. A real-device check is still required for the
 * rendering itself and is reported separately.
 * ==========================================================================*/

const PHONE = { width: 375, height: 812 };
/** Roughly an iPhone keyboard with its accessory bar. */
const KEYBOARD_H = 336;

/**
 * Replaces window.visualViewport with a controllable stand-in BEFORE any app
 * code runs, so the component subscribes to this one. The shape and the
 * events are the same; only the numbers are ours to move.
 */
async function installViewportHarness(page: Page) {
  await page.addInitScript(() => {
    const bus = new EventTarget();
    const state = { width: 0, height: 0, offsetTop: 0, offsetLeft: 0 };
    const stub = {
      get width() { return state.width || window.innerWidth; },
      get height() { return state.height || window.innerHeight; },
      get offsetTop() { return state.offsetTop; },
      get offsetLeft() { return state.offsetLeft; },
      addEventListener: bus.addEventListener.bind(bus),
      removeEventListener: bus.removeEventListener.bind(bus),
      dispatchEvent: bus.dispatchEvent.bind(bus),
    };
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      get: () => stub,
    });
    (window as unknown as Record<string, unknown>).__setVisualViewport = (
      patch: Partial<typeof state>
    ) => {
      Object.assign(state, patch);
      bus.dispatchEvent(new Event('resize'));
    };
  });
}

/** Mimics the keyboard opening: the visible area shortens. */
const showKeyboard = (page: Page, viewportHeight = PHONE.height) =>
  page.evaluate((h) => {
    (window as unknown as Record<string, (p: unknown) => void>).__setVisualViewport({
      height: h,
    });
  }, viewportHeight - KEYBOARD_H);

const hideKeyboard = (page: Page, viewportHeight = PHONE.height) =>
  page.evaluate((h) => {
    (window as unknown as Record<string, (p: unknown) => void>).__setVisualViewport({
      height: h,
    });
  }, viewportHeight);

const panelBox = async (page: Page) => {
  const box = await page.locator('[data-testid="long-panel"]').boundingBox();
  if (!box) throw new Error('mobile panel not rendered');
  return box;
};

/**
 * The panel reacts to a viewport change inside a requestAnimationFrame (the
 * keyboard emits a burst of resize events and the component coalesces them),
 * so a read taken in the same tick as the change can still see the old box.
 * Settle on the height before asserting.
 */
const panelHeight = (page: Page) =>
  expect.poll(async () => Math.round((await panelBox(page)).height), { timeout: 3000 });

test('mobile: opening the selector shows the search field immediately', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await installViewportHarness(page);
  await page.goto(url());

  await trigger(page, 'long').click();
  const panel = page.locator('[data-testid="long-panel"]');
  await expect(panel).toBeVisible();
  await expect(searchBox(page)).toBeVisible();

  // The search field is at the TOP of the panel, above the first option.
  const search = (await searchBox(page).boundingBox())!;
  const firstOption = (await options(page).first().boundingBox())!;
  expect(search.y).toBeLessThan(firstOption.y);
});

test('mobile: the panel is pinned to the visible viewport, not the trigger', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await installViewportHarness(page);
  await page.goto(url());

  await trigger(page, 'long').click();
  const box = await panelBox(page);
  expect(box.y).toBeCloseTo(8, 0);
  expect(box.x).toBeCloseTo(8, 0);
  expect(box.width).toBeCloseTo(PHONE.width - 16, 0);
  expect(box.y + box.height).toBeLessThanOrEqual(PHONE.height);
});

test('mobile: the keyboard shortens the panel and the search field stays visible', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await installViewportHarness(page);
  await page.goto(url());

  await trigger(page, 'long').click();
  const before = Math.round((await panelBox(page)).height);

  await showKeyboard(page);
  // The panel genuinely shrank — it is not merely clipped.
  await panelHeight(page).toBeLessThan(before);
  const after = await panelBox(page);
  // And it fits entirely inside what is still visible above the keyboard.
  const visible = PHONE.height - KEYBOARD_H;
  expect(after.y + after.height).toBeLessThanOrEqual(visible + 1);

  // The search field — the thing being typed into — is inside that area.
  const search = (await searchBox(page).boundingBox())!;
  expect(search.y).toBeGreaterThanOrEqual(0);
  expect(search.y + search.height).toBeLessThanOrEqual(visible + 1);
});

test('mobile: the result list keeps its own scrolling while the keyboard is up', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await installViewportHarness(page);
  await page.goto(url());

  await trigger(page, 'long').click();
  await showKeyboard(page);

  const list = page.locator('[cmdk-list]');
  const metrics = await list.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
    overflowY: getComputedStyle(el).overflowY,
  }));
  expect(metrics.overflowY).toBe('auto');
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);

  // It really scrolls, rather than just reporting that it could.
  const moved = await list.evaluate((el) => {
    el.scrollTop = 120;
    return el.scrollTop;
  });
  expect(moved).toBeGreaterThan(0);
});

test('mobile: the panel follows the visual viewport when iOS scrolls it', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await installViewportHarness(page);
  await page.goto(url());

  await trigger(page, 'long').click();
  await page.evaluate(() => {
    (window as unknown as Record<string, (p: unknown) => void>).__setVisualViewport({
      offsetTop: 60,
    });
  });
  await expect
    .poll(async () => Math.round((await panelBox(page)).y), { timeout: 3000 })
    .toBe(68); // 60 offset + the 8px margin
});

test('mobile: the panel recovers its height when the keyboard closes', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await installViewportHarness(page);
  await page.goto(url());

  await trigger(page, 'long').click();
  const before = Math.round((await panelBox(page)).height);

  await showKeyboard(page);
  await panelHeight(page).toBeLessThan(before);

  await hideKeyboard(page);
  // Recovered, within a couple of pixels of where it started — an exact
  // match would be asserting sub-pixel layout rounding, not the behaviour.
  await panelHeight(page).toBeGreaterThan(before - 5);
});

test('mobile: the page behind cannot scroll while the panel is open', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await installViewportHarness(page);
  await page.goto(url());

  const before = await page.evaluate(() => getComputedStyle(document.body).overflow);
  await trigger(page, 'long').click();
  await expect(page.locator('[data-testid="long-panel"]')).toBeVisible();

  const locked = await page.evaluate(() => getComputedStyle(document.body).overflow);
  expect(locked).toBe('hidden');
  expect(locked).not.toBe(before);

  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="long-panel"]')).toHaveCount(0);
  await expect.poll(async () =>
    page.evaluate(() => getComputedStyle(document.body).overflow)
  ).toBe(before);
});

test('mobile: search, grouping and selection all still work in the panel', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await installViewportHarness(page);
  await page.goto(url());

  await trigger(page, 'long').click();
  await showKeyboard(page);

  await searchBox(page).fill('ramad');
  await expect(options(page)).toHaveCount(2);
  await expect(page.getByText('Full-time —')).toBeVisible();
  await expect(page.getByText('Part-time —')).toHaveCount(0);

  await options(page).first().click();
  await expect(page.locator('[data-testid="long-value"]')).toHaveText('Menna Ramadan');
  await expect(page.locator('[data-testid="long-panel"]')).toHaveCount(0);
});

test('mobile: Arabic search works in the panel, in RTL', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await installViewportHarness(page);
  await page.goto(url('rtl'));

  await trigger(page, 'arabic').click();
  await showKeyboard(page);
  // Bare alef finding hamza-alef — a fold the current policy keeps. ة and ى
  // are deliberately NOT folded (they distinguish real names), so this must
  // not be written as رقيه → رقية.
  await searchBox(page).fill('احمد');
  await expect(options(page)).toHaveCount(1);

  const panel = page.locator('[data-testid="arabic-panel"]');
  expect(await panel.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl');
  const box = (await panel.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(PHONE.width + 1);

  await options(page).first().click();
  await expect(page.locator('[data-testid="arabic-value"]')).toHaveText('أحمد حسين');
});

test('mobile: a <=5 option list still gets no search field', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await installViewportHarness(page);
  await page.goto(url());

  await trigger(page, 'short').click();
  await expect(page.locator('[data-testid="short-panel"]')).toBeVisible();
  await expect(searchBox(page)).toHaveCount(0);
  await expect(options(page)).toHaveCount(4);
});

test('desktop: still an anchored popover, with no dialog panel and no scroll lock', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await installViewportHarness(page);
  await page.goto(url());

  const before = await page.evaluate(() => getComputedStyle(document.body).overflow);
  await trigger(page, 'long').click();

  // The mobile panel must not exist at desktop widths.
  await expect(page.locator('[data-testid="long-panel"]')).toHaveCount(0);
  await expect(page.locator('[data-radix-popper-content-wrapper]')).toHaveCount(1);
  await expect(page.evaluate(() => getComputedStyle(document.body).overflow)).resolves.toBe(before);

  // Still anchored to the trigger. Compared on CENTRES, not edges: the
  // shadcn popover carries a `zoom-in-95` enter animation that does not
  // complete under reduced motion, leaving the box at 95% scale about its
  // own centre — a pre-existing rendering quirk of the primitive, unrelated
  // to this change, which an edge comparison would trip over.
  const t = (await trigger(page, 'long').boundingBox())!;
  const popover = (await page
    .locator('[data-radix-popper-content-wrapper] > *')
    .first()
    .boundingBox())!;
  expect(Math.abs((popover.x + popover.width / 2) - (t.x + t.width / 2)))
    .toBeLessThanOrEqual(2);
  // It hangs below its trigger rather than being pinned to the viewport.
  expect(popover.y).toBeGreaterThan(t.y);
});

/* ============================================================================
 * SCROLLING INSIDE A DIALOG — the regression this file exists to prevent
 *
 * A modal Radix Dialog mounts react-remove-scroll, which cancels wheel events
 * whose target is not inside the dialog's own subtree. These popovers are
 * portalled to <body>, so they were "outside" by that test: the list still
 * overflowed and still painted a scrollbar, but the wheel did nothing and the
 * options past the fold were unreachable with a mouse.
 *
 * Every assertion below is deliberately BEHAVIOURAL. `overflow-y: auto`,
 * `scrollHeight > clientHeight` and a visible scrollbar were all TRUE while
 * the bug was live — asserting any of them would have passed throughout. The
 * only thing that distinguishes working from broken is whether a real,
 * trusted wheel gesture moves scrollTop, so that is what is measured.
 * ==========================================================================*/

/** The element that actually scrolls: cmdk's list, not the popover. */
const cmdkList = (page: Page) => page.locator('[cmdk-list]');

const listMetrics = (page: Page) =>
  page.evaluate(() => {
    const l = document.querySelector('[cmdk-list]')!;
    return {
      scrollTop: Math.round(l.scrollTop),
      scrollHeight: l.scrollHeight,
      clientHeight: l.clientHeight,
      maxScroll: l.scrollHeight - l.clientHeight,
    };
  });

/** A real trusted wheel over the centre of the list. */
async function wheelOverList(page: Page, deltaY: number) {
  const box = (await cmdkList(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, deltaY);
  await page.waitForTimeout(300);
}

/** Is this option both inside the list's visible box and the top hit at its centre? */
const optionReachable = (page: Page, name: string) =>
  page.evaluate((n) => {
    const list = document.querySelector('[cmdk-list]')!;
    const lr = list.getBoundingClientRect();
    const el = [...document.querySelectorAll('[cmdk-item]')]
      .find((i) => (i as HTMLElement).innerText.trim() === n);
    if (!el) return { rendered: false, visible: false, hitTests: false };
    const b = el.getBoundingClientRect();
    const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
    return {
      rendered: true,
      visible: b.top >= lr.top - 1 && b.bottom <= lr.bottom + 1,
      hitTests: (hit?.closest('[cmdk-item]') as HTMLElement | null)?.innerText.trim() === n,
    };
  }, name);

test('in a dialog: a real wheel gesture scrolls the option list', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(url());
  await page.locator('[data-testid="open-dialog"]').click();
  await expect(page.getByRole('dialog', { name: 'Lesson Details' })).toBeVisible();

  await trigger(page, 'in-dialog').click();
  await expect(cmdkList(page)).toBeVisible();

  const before = await listMetrics(page);
  // Precondition: there is genuinely something to scroll. This is a
  // precondition, NOT the assertion — it was true while the bug was live.
  expect(before.maxScroll).toBeGreaterThan(0);
  expect(before.scrollTop).toBe(0);

  await wheelOverList(page, 200);
  const after = await listMetrics(page);
  expect(after.scrollTop).toBeGreaterThan(before.scrollTop);
});

test('in a dialog: the last option is reachable by wheel and can be selected', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(url());
  await page.locator('[data-testid="open-dialog"]').click();
  await trigger(page, 'in-dialog').click();
  await expect(cmdkList(page)).toBeVisible();

  const LAST = 'Yasmin Asaad';
  expect(await optionReachable(page, LAST)).toMatchObject({ rendered: true, visible: false });

  await wheelOverList(page, 2000);
  const metrics = await listMetrics(page);
  expect(metrics.scrollTop).toBe(metrics.maxScroll);

  // Reachable: on screen AND the top element at its own centre.
  expect(await optionReachable(page, LAST)).toMatchObject({ visible: true, hitTests: true });

  // And actually selectable by a plain click at that position.
  await page.getByRole('option', { name: LAST, exact: true }).click();
  await expect(page.locator('[data-testid="in-dialog-value"]')).toHaveText(LAST);
  await expect(page.getByRole('dialog', { name: 'Lesson Details' })).toBeVisible();
});

test('in a dialog: the multi-select list scrolls by wheel too', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(url());
  await page.locator('[data-testid="open-dialog"]').click();
  await trigger(page, 'in-dialog-multi').click();
  await expect(cmdkList(page)).toBeVisible();

  const before = await listMetrics(page);
  expect(before.maxScroll).toBeGreaterThan(0);
  await wheelOverList(page, 400);
  const after = await listMetrics(page);
  expect(after.scrollTop).toBeGreaterThan(before.scrollTop);

  await wheelOverList(page, 2000);
  expect(await optionReachable(page, 'Participant 20')).toMatchObject({
    visible: true, hitTests: true,
  });
});

test('outside a dialog: wheel still scrolls, and no scroll lock is taken', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(url());

  const lockBefore = await page.evaluate(() => document.body.getAttribute('data-scroll-locked'));
  await trigger(page, 'long').click();
  await expect(cmdkList(page)).toBeVisible();

  const before = await listMetrics(page);
  await wheelOverList(page, 200);
  const after = await listMetrics(page);
  expect(after.scrollTop).toBeGreaterThan(before.scrollTop);

  // The popover must NOT take a lock outside a dialog: doing so would freeze
  // the page behind every dropdown and shift the layout by the scrollbar.
  expect(await page.evaluate(() => document.body.getAttribute('data-scroll-locked')))
    .toBe(lockBefore);
});

test('in a dialog: Escape closes the list, keeps the dialog, restores focus', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(url());
  await page.locator('[data-testid="open-dialog"]').click();
  const card = page.getByRole('dialog', { name: 'Lesson Details' });

  await trigger(page, 'in-dialog').click();
  await expect(cmdkList(page)).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(cmdkList(page)).toHaveCount(0);
  await expect(card).toBeVisible();
  await expect(trigger(page, 'in-dialog')).toBeFocused();

  // The dialog's own lock survives the popover's lock being released.
  expect(await page.evaluate(() => document.body.getAttribute('data-scroll-locked'))).toBe('1');

  // And the dialog is still usable afterwards.
  await trigger(page, 'in-dialog').click();
  await expect(cmdkList(page)).toBeVisible();
});

test('dir=rtl, in a dialog: wheel scrolling works the same', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(url('rtl'));
  await page.locator('[data-testid="open-dialog"]').click();
  await trigger(page, 'in-dialog').click();
  await expect(cmdkList(page)).toBeVisible();

  expect(await cmdkList(page).evaluate((el) => getComputedStyle(el).direction)).toBe('rtl');
  const before = await listMetrics(page);
  expect(before.maxScroll).toBeGreaterThan(0);
  await wheelOverList(page, 300);
  expect((await listMetrics(page)).scrollTop).toBeGreaterThan(before.scrollTop);
});

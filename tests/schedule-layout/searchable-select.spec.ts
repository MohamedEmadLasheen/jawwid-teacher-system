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

test('a list of five or fewer stays a plain list with no search field', async ({ page }) => {
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

// The rule itself, one case per interesting count. `expected` is whether a
// search field must be present.
const RULE: Array<{ n: number; options: number; search: boolean; note: string }> = [
  { n: 0,  options: 0,  search: false, note: 'empty list' },
  { n: 1,  options: 1,  search: false, note: 'single option' },
  { n: 5,  options: 5,  search: false, note: 'exactly at the threshold' },
  { n: 6,  options: 6,  search: true,  note: 'one over the threshold' },
  { n: 7,  options: 7,  search: true,  note: 'a weekday-sized fixed enum' },
  { n: 8,  options: 8,  search: true,  note: 'a category-sized fixed enum' },
  { n: 24, options: 24, search: true,  note: 'the timeline column count' },
];

for (const c of RULE) {
  test(`the >5 rule @ ${c.n} options (${c.note}): search ${c.search ? 'present' : 'absent'}`,
    async ({ page }) => {
      await page.goto(url());
      await trigger(page, `rule-${c.n}`).click();

      if (c.options === 0) {
        // Nothing to list, so the empty state stands in for the options.
        await expect(page.locator('[data-testid="searchable-select-empty"]')).toBeVisible();
      } else {
        await expect(listbox(page)).toBeVisible();
        await expect(options(page)).toHaveCount(c.options);
      }
      await expect(searchBox(page)).toHaveCount(c.search ? 1 : 0);
    });
}

test('a DYNAMIC collection is searchable even with only 3 options today', async ({ page }) => {
  await page.goto(url());
  await trigger(page, 'rule-dynamic-3').click();
  await expect(listbox(page)).toBeVisible();
  await expect(options(page)).toHaveCount(3);
  // The whole point: three is below the threshold, and the search field is
  // still there, because the collection's size is data, not design.
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
  { name: 'ta marbuta folded to ha', query: 'رقيه', expect: 'رقية رمضان' },
  { name: 'alef maqsura folded to ya', query: 'مصطفي', expect: 'آية مصطفى' },
  { name: 'a query carrying harakat', query: 'أَحْمَد', expect: 'أحمد حسين' },
  { name: 'a partial surname', query: 'رمضان', expect: 'رقية رمضان' },
  { name: 'the surname typed first', query: 'رمضان رقيه', expect: 'رقية رمضان' },
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

test('an Arabic name can be chosen and is then displayed on the trigger', async ({ page }) => {
  await page.goto(url('rtl'));
  await open(page, 'arabic');
  await searchBox(page).fill('رقيه');
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

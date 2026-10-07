import { test, expect, type Page } from '@playwright/test';

/**
 * READ-BACK of a saved evaluation's nine criteria.
 *
 * The scores and comments were persisted from the day the feature shipped, but
 * nothing rendered them: a supervisor could type nine observations and never
 * see one again. These assert the screen that closes that, and — just as
 * importantly — that it stays read-only and never invents data for a
 * historical evaluation.
 *
 * Driven through the real Action Center, in both text directions and at both
 * widths. Only the database is stubbed.
 */

const CRITERIA = [
  'cameraAppearanceLighting',
  'studentEngagement',
  'mistakeCorrectionQuality',
  'interactiveEngagement',
  'recitationTajweed',
  'fushaCommitment',
  'punctuality',
  'halaqahManagement',
  'explanationClarity',
] as const;

/** The fixture that carries a distinct score and comment on every criterion. */
const ALL_NINE = 'ev-all-nine';
/** Two criteria commented, seven not — the realistic case. */
const PARTIAL = 'ev-nine';
/** criteria === null: created before the nine criteria existed. */
const LEGACY = 'ev-historical';

async function open(page: Page, dir: 'ltr' | 'rtl' = 'ltr') {
  await page.goto(`/tests/evaluation/evaluation.html?dir=${dir}`);
  await expect(page.getByTestId(`evaluation-row-${ALL_NINE}`)).toBeVisible();
}

const toggle = (page: Page, id: string) => page.getByTestId(`evaluation-details-toggle-${id}`);
const panel = (page: Page, id: string) => page.getByTestId(`evaluation-details-${id}`);
const score = (page: Page, id: string, key: string) =>
  page.getByTestId(`evaluation-detail-${id}-${key}-score`);
const comment = (page: Page, id: string, key: string) =>
  page.getByTestId(`evaluation-detail-${id}-${key}-comment`);

async function expand(page: Page, id: string) {
  await toggle(page, id).click();
  await expect(panel(page, id)).toBeVisible();
}

// ======================================================================
test.describe('reading the nine criteria back', () => {
  test('all nine scores render', async ({ page }) => {
    await open(page);
    await expand(page, ALL_NINE);

    // The fixture cycles the four ratings across the nine criteria.
    const EXPECTED = ['Excellent', 'Good', 'Acceptable', 'Needs Improvement'];
    for (const [i, key] of CRITERIA.entries()) {
      await expect(score(page, ALL_NINE, key)).toHaveText(EXPECTED[i % 4]);
    }
    await expect(page.locator(`[data-testid^="evaluation-detail-${ALL_NINE}-"][data-testid$="-score"]`))
      .toHaveCount(9);
  });

  test('all nine comments render, each under its own criterion', async ({ page }) => {
    await open(page);
    await expand(page, ALL_NINE);

    for (const [i, key] of CRITERIA.entries()) {
      await expect(comment(page, ALL_NINE, key)).toHaveText(`Observation for criterion ${i + 1}.`);
    }
    await expect(page.locator(`[data-testid^="evaluation-detail-${ALL_NINE}-"][data-testid$="-comment"]`))
      .toHaveCount(9);
  });

  test('a comment stays attached to the criterion it was written for', async ({ page }) => {
    await open(page);
    await expand(page, PARTIAL);

    // The two that were commented, with the right text on the right criterion.
    await expect(comment(page, PARTIAL, 'studentEngagement'))
      .toHaveText(/attention dropped during the final 10 minutes/);
    await expect(comment(page, PARTIAL, 'punctuality')).toHaveText('Joined four minutes late.');
    // Not swapped, and not duplicated onto each other.
    await expect(comment(page, PARTIAL, 'studentEngagement'))
      .not.toHaveText('Joined four minutes late.');
  });

  test('the criterion names and their order are the required nine', async ({ page }) => {
    await open(page);
    await expand(page, ALL_NINE);

    const rows = page.locator(`[data-testid^="evaluation-detail-${ALL_NINE}-"]`)
      .filter({ hasNot: page.locator('[data-testid$="-score"]') });
    await expect(panel(page, ALL_NINE)).toContainText('Camera, appearance, and lighting');
    await expect(panel(page, ALL_NINE)).toContainText('Student engagement with the teacher');
    await expect(panel(page, ALL_NINE)).toContainText('Punctuality');
    await expect(panel(page, ALL_NINE)).toContainText('Halaqah/class management');
    expect(await rows.count()).toBeGreaterThanOrEqual(9);

    // Numbered 1..9 in order.
    const text = await panel(page, ALL_NINE).innerText();
    const numbers = [...text.matchAll(/^\s*(\d)\./gm)].map((m) => Number(m[1]));
    expect(numbers.slice(0, 9)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  test('an uncommented criterion renders no comment element at all', async ({ page }) => {
    await open(page);
    await expand(page, PARTIAL);

    // Seven of the nine were never commented.
    for (const key of CRITERIA) {
      if (key === 'studentEngagement' || key === 'punctuality') continue;
      await expect(comment(page, PARTIAL, key)).toHaveCount(0);
    }
    await expect(page.locator(`[data-testid^="evaluation-detail-${PARTIAL}-"][data-testid$="-comment"]`))
      .toHaveCount(2);
    // But all nine still show a score.
    await expect(page.locator(`[data-testid^="evaluation-detail-${PARTIAL}-"][data-testid$="-score"]`))
      .toHaveCount(9);
    // And nothing reads as placeholder garbage.
    await expect(panel(page, PARTIAL)).not.toContainText(/undefined|null|NaN|\[object/);
  });

  test('the general comment still sits under the teacher name', async ({ page }) => {
    await open(page);
    const row = page.getByTestId(`evaluation-row-${PARTIAL}`);
    await expect(page.getByTestId(`evaluation-general-comment-${PARTIAL}`))
      .toHaveText(/Overall, the lesson was good/);
    // Above the details control, which comes last.
    const commentBox = (await page.getByTestId(`evaluation-general-comment-${PARTIAL}`).boundingBox())!;
    const toggleBox = (await toggle(page, PARTIAL).boundingBox())!;
    expect(toggleBox.y).toBeGreaterThan(commentBox.y);
    await expect(row).toBeVisible();
  });

  test('the summary line keeps its score and grade when expanded', async ({ page }) => {
    await open(page);
    const row = page.getByTestId(`evaluation-row-${PARTIAL}`);
    await expect(row).toContainText('70');
    await expand(page, PARTIAL);
    // Expanding changes nothing about the summary.
    await expect(row).toContainText('70');
    await expect(row).toContainText('Good');
  });
});

// ======================================================================
test.describe('legacy evaluations are protected', () => {
  test('a historical evaluation gets NO details control', async ({ page }) => {
    await open(page);
    await expect(page.getByTestId(`evaluation-row-${LEGACY}`)).toBeVisible();
    // criteria === null, so there is nothing to read back and nothing is offered.
    await expect(toggle(page, LEGACY)).toHaveCount(0);
    await expect(panel(page, LEGACY)).toHaveCount(0);
  });

  test('no nine ratings are fabricated for it anywhere in its row', async ({ page }) => {
    await open(page);
    const row = page.getByTestId(`evaluation-row-${LEGACY}`);
    await expect(row.locator('[data-testid*="evaluation-detail-"]')).toHaveCount(0);
    // Its own information is intact and unchanged.
    await expect(row).toContainText('Ashraf Elzohdy');
    await expect(row).toContainText('83');
    await expect(row).toContainText('Good');
  });

  test('old and new evaluations coexist in one list without error', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page);
    await expand(page, ALL_NINE);
    await expect(page.getByTestId(`evaluation-row-${LEGACY}`)).toBeVisible();
    await expect(page.getByTestId('evaluation-row-ev-historical-note')).toBeVisible();
    expect(errors).toEqual([]);
  });
});

// ======================================================================
test.describe('the details view is read-only', () => {
  test('it is collapsed by default', async ({ page }) => {
    await open(page);
    await expect(toggle(page, ALL_NINE)).toBeVisible();
    // Radix keeps the content mounted and `hidden` so it can measure its
    // height for the animation, so this asserts it is not SHOWN rather than
    // not present. Hidden content is out of the accessibility tree and out of
    // innerText, which is what "collapsed" has to mean.
    await expect(toggle(page, ALL_NINE)).toHaveAttribute('data-state', 'closed');
    await expect(panel(page, ALL_NINE)).toBeHidden();
    await expect(score(page, ALL_NINE, 'punctuality')).toBeHidden();
    // The row reads as compactly as it did before this section existed.
    await expect(page.getByTestId(`evaluation-row-${ALL_NINE}`))
      .not.toContainText('Observation for criterion 1.');
  });

  test('clicking expands, clicking again collapses', async ({ page }) => {
    await open(page);
    await expand(page, ALL_NINE);
    await expect(toggle(page, ALL_NINE)).toHaveAttribute('data-state', 'open');

    await toggle(page, ALL_NINE).click();
    await expect(toggle(page, ALL_NINE)).toHaveAttribute('data-state', 'closed');
    await expect(score(page, ALL_NINE, 'punctuality')).toBeHidden();
  });

  test('each row expands independently', async ({ page }) => {
    await open(page);
    await expand(page, ALL_NINE);
    // The other 9-criteria row stays shut.
    await expect(toggle(page, PARTIAL)).toHaveAttribute('data-state', 'closed');
  });

  test('expanding offers no way to change anything and writes nothing', async ({ page }) => {
    await open(page);
    await expand(page, ALL_NINE);

    const p = panel(page, ALL_NINE);
    await expect(p.locator('input, textarea, select')).toHaveCount(0);
    await expect(p.locator('button')).toHaveCount(0);
    // Nothing reached the database by looking at an evaluation.
    expect(await page.evaluate(() => window.__evalStub.inserts.length)).toBe(0);
    expect(await page.evaluate(() => window.__evalStub.deletes.length)).toBe(0);
  });

  test('the data is unchanged by being read', async ({ page }) => {
    await open(page);
    await expand(page, ALL_NINE);
    await toggle(page, ALL_NINE).click();
    await expand(page, ALL_NINE);

    // Same values after an expand/collapse/expand cycle.
    for (const [i, key] of CRITERIA.entries()) {
      await expect(comment(page, ALL_NINE, key)).toHaveText(`Observation for criterion ${i + 1}.`);
    }
  });
});

// ======================================================================
test.describe('Arabic / RTL / mobile', () => {
  test('criterion labels and scores are Arabic in RTL', async ({ page }) => {
    await open(page, 'rtl');
    await expand(page, ALL_NINE);
    const text = await panel(page, ALL_NINE).innerText();
    expect(text).toMatch(/[؀-ۿ]/);
    // The labels themselves, not merely some Arabic somewhere on the page.
    await expect(panel(page, ALL_NINE)).toContainText('الكاميرا والمظهر والإضاءة');
    await expect(panel(page, ALL_NINE)).toContainText('إدارة الحلقة/الفصل');
    await expect(score(page, ALL_NINE, 'cameraAppearanceLighting')).toHaveText('ممتاز');
  });

  test('the details control is localised', async ({ page }) => {
    await open(page, 'rtl');
    await expect(toggle(page, ALL_NINE)).toContainText('عرض تفاصيل التقييم');
  });

  test('an Arabic comment renders inside its own row in RTL', async ({ page }) => {
    await open(page, 'rtl');
    await openFormAndSaveArabic(page);

    const row = page.locator('[data-testid^="evaluation-row-stub-eval-"]').first();
    const id = (await row.getAttribute('data-testid'))!.replace('evaluation-row-', '');
    await expand(page, id);

    await expect(comment(page, id, 'studentEngagement')).toHaveText('تفاعل الطالب كان جيدًا في معظم الحصة.');
    const rowBox = (await row.boundingBox())!;
    const cBox = (await comment(page, id, 'studentEngagement').boundingBox())!;
    expect(cBox.x).toBeGreaterThanOrEqual(rowBox.x - 1);
    expect(cBox.x + cBox.width).toBeLessThanOrEqual(rowBox.x + rowBox.width + 1);
  });

  for (const dir of ['ltr', 'rtl'] as const) {
    test(`no horizontal overflow on mobile (${dir}), expanded`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await open(page, dir);
      await expand(page, ALL_NINE);
      await expand(page, PARTIAL);

      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow).toBeLessThanOrEqual(1);

      // The panel stays inside its card.
      const rowBox = (await page.getByTestId(`evaluation-row-${ALL_NINE}`).boundingBox())!;
      const panelBox = (await panel(page, ALL_NINE).boundingBox())!;
      expect(panelBox.x).toBeGreaterThanOrEqual(rowBox.x - 1);
      expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(rowBox.x + rowBox.width + 1);
    });

    test(`no horizontal overflow on desktop (${dir}), expanded`, async ({ page }) => {
      await open(page, dir);
      await expand(page, ALL_NINE);
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }

  test('the searchable teacher selector is unaffected by the new section', async ({ page }) => {
    await open(page, 'rtl');
    await expand(page, ALL_NINE);
    await page.getByRole('button', { name: /إضافة تقييم/ }).click();
    await page.getByTestId('evaluation-teacher').click();
    const search = page.getByPlaceholder(/بحث عن معلم/);
    await expect(search).toBeVisible();
    await search.fill('حسين');
    await page.waitForTimeout(80);
    await expect(page.getByRole('option')).toHaveCount(2);
  });
});

/** Saves a 9-criteria evaluation carrying Arabic comments. */
async function openFormAndSaveArabic(page: Page) {
  await page.getByRole('button', { name: /Add Evaluation|إضافة تقييم/ }).click();
  await page.getByTestId('evaluation-teacher').click();
  const search = page.getByPlaceholder(/Search teachers|بحث عن معلم/);
  await search.fill('محمد حسين');
  await page.waitForTimeout(80);
  await page.getByRole('option', { name: 'محمد حسين' }).click();
  await page.getByTestId('criterion-studentEngagement-comment').fill('تفاعل الطالب كان جيدًا في معظم الحصة.');
  await page.getByTestId('evaluation-general-comment').fill('بشكل عام الحصة كانت جيدة.');
  await page.getByTestId('evaluation-save').click();
  await expect(page.locator('[data-testid^="evaluation-row-stub-eval-"]').first()).toBeVisible();
}

declare global {
  interface Window {
    __evalStub: {
      inserts: Array<{ table: string; payload: Record<string, unknown> }>;
      deletes: Array<{ table: string; filters: Array<[string, unknown]> }>;
      failNextInsert: string | null;
    };
  }
}

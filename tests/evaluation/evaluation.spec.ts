import { test, expect, type Page } from '@playwright/test';

/**
 * What tests/evaluation/supabase-stub.ts records. Declared here because the
 * spec runs in Node and reads this out of the page, rather than importing the
 * stub module.
 */
declare global {
  interface Window {
    __evalStub: { inserts: Array<{ table: string; payload: Record<string, unknown> }> };
  }
}

/**
 * The teacher-evaluation feature, driven through the real Action Center in a
 * real browser: the searchable teacher selector, the nine criteria, a comment
 * per criterion, the general comment, and the general comment appearing under
 * the teacher's name once the evaluation is saved.
 *
 * Nothing is stubbed but the database (tests/evaluation/supabase-stub.ts), so
 * every save travels the production path — store action, service, mapper —
 * and the list row a test reads was produced by the same code production
 * runs.
 *
 * Run in both directions: the application ships Arabic, and an RTL-broken
 * selector or an overflowing comment is a real defect, not a cosmetic one.
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

const GENERAL_COMMENT =
  'Overall, the lesson was good. The teacher handled the student well, but should focus more on correcting pronunciation mistakes.';
const ENGAGEMENT_COMMENT =
  'Student was engaged for most of the lesson, but attention dropped during the final 10 minutes.';
const PUNCTUALITY_COMMENT = 'Joined four minutes late.';

async function open(page: Page, dir: 'ltr' | 'rtl' = 'ltr') {
  await page.goto(`/tests/evaluation/evaluation.html?dir=${dir}`);
  await expect(page.getByTestId('evaluation-row-ev-nine')).toBeVisible();
}

/** Open the Add Evaluation dialog. */
async function openForm(page: Page) {
  await page.getByRole('button', { name: /Add Evaluation|إضافة تقييم/ }).click();
  await expect(page.getByTestId('evaluation-teacher')).toBeVisible();
}

/** Type into the teacher selector's search field and return the visible options. */
async function searchTeachers(page: Page, query: string) {
  await page.getByTestId('evaluation-teacher').click();
  const search = page.getByPlaceholder(/Search teachers|بحث عن معلم/);
  await expect(search).toBeVisible();
  await search.fill(query);
  // The list filters in place, with no request issued — give the re-render a tick.
  await page.waitForTimeout(80);
  return page.getByRole('option');
}

async function pickTeacher(page: Page, query: string, name: string | RegExp) {
  await searchTeachers(page, query);
  await page.getByRole('option', { name }).click();
  await expect(page.getByTestId('evaluation-teacher')).not.toHaveText(
    /Select a teacher|اختر معلمًا/
  );
}

// ======================================================================
test.describe('teacher selection', () => {
  test('the selector is searchable, not a bare list of every teacher', async ({ page }) => {
    await open(page);
    await openForm(page);
    await page.getByTestId('evaluation-teacher').click();
    await expect(page.getByPlaceholder(/Search teachers/)).toBeVisible();
  });

  test('search by full name', async ({ page }) => {
    await open(page);
    await openForm(page);
    const options = await searchTeachers(page, 'Arwa Ahmed');
    await expect(options).toHaveCount(1);
    await expect(options.first()).toContainText('Arwa Ahmed');
  });

  test('search by partial name', async ({ page }) => {
    await open(page);
    await openForm(page);
    // 'Ram' is a fragment of a surname two teachers share.
    const options = await searchTeachers(page, 'Ram');
    await expect(options).toHaveCount(2);
    await expect(options.nth(0)).toContainText('Menna Ramadan');
    await expect(options.nth(1)).toContainText('Rokaya Ramadan');
  });

  test('search by the LAST part of a name', async ({ page }) => {
    await open(page);
    await openForm(page);
    const options = await searchTeachers(page, 'Elzohdy');
    await expect(options).toHaveCount(1);
    await expect(options.first()).toContainText('Ashraf Elzohdy');
  });

  test('search is case-insensitive', async ({ page }) => {
    await open(page);
    await openForm(page);
    await expect(await searchTeachers(page, 'aShRaF')).toHaveCount(1);
  });

  test('Arabic name: the given name finds the teacher', async ({ page }) => {
    await open(page);
    await openForm(page);
    // محمد حسين and محمد عبد الله both begin with محمد.
    const options = await searchTeachers(page, 'محمد');
    await expect(options).toHaveCount(2);
    await expect(options.nth(0)).toContainText('محمد حسين');
  });

  test('Arabic name: the SECOND name finds the same teacher', async ({ page }) => {
    await open(page);
    await openForm(page);
    // The requirement, literally: searching حسين must find محمد حسين.
    const options = await searchTeachers(page, 'حسين');
    await expect(options).toHaveCount(2);
    await expect(options.nth(0)).toContainText('محمد حسين');
    await expect(options.nth(1)).toContainText('حسين أحمد');
  });

  test('Arabic orthography is folded: bare alef finds hamza-alef', async ({ page }) => {
    await open(page);
    await openForm(page);
    // Stored as آية; typed as ايه/اية on an ordinary keyboard.
    const options = await searchTeachers(page, 'اية');
    await expect(options).toHaveCount(1);
    await expect(options.first()).toContainText('آية مصطفى');
  });

  test('no results is handled gracefully', async ({ page }) => {
    await open(page);
    await openForm(page);
    await searchTeachers(page, 'Nobody By This Name');
    await expect(page.getByTestId('searchable-select-empty')).toBeVisible();
    await expect(page.getByRole('option')).toHaveCount(0);
  });

  test('selecting a teacher is explicit, and selects exactly one', async ({ page }) => {
    await open(page);
    await openForm(page);
    await pickTeacher(page, 'Arwa', /Arwa Ahmed/);
    await expect(page.getByTestId('evaluation-teacher')).toContainText('Arwa Ahmed');

    // Choosing another REPLACES it — an evaluation has one teacher.
    await pickTeacher(page, 'Ashraf', /Ashraf Elzohdy/);
    await expect(page.getByTestId('evaluation-teacher')).toContainText('Ashraf Elzohdy');
    await expect(page.getByTestId('evaluation-teacher')).not.toContainText('Arwa');
  });

  test('saving without a teacher fails validation and writes nothing', async ({ page }) => {
    await open(page);
    await openForm(page);
    await expect(page.getByTestId('evaluation-save')).toBeDisabled();

    // Submit the form directly, bypassing the disabled button, to prove the
    // guard is in the handler and not only in the button's state.
    await page.evaluate(() => {
      document.querySelector('form')?.requestSubmit();
    });
    await expect(page.getByTestId('evaluation-teacher-error')).toBeVisible();
    // The dialog stays open and nothing reached the database.
    await expect(page.getByTestId('evaluation-teacher')).toBeVisible();
    expect(await page.evaluate(() => window.__evalStub.inserts.length)).toBe(0);
  });
});

// ======================================================================
test.describe('the nine criteria', () => {
  test('all nine appear, each with a score and its own comment field', async ({ page }) => {
    await open(page);
    await openForm(page);

    for (const key of CRITERIA) {
      await expect(page.getByTestId(`criterion-${key}`)).toBeVisible();
      await expect(page.getByTestId(`criterion-${key}-comment`)).toBeVisible();
      for (const rating of ['excellent', 'good', 'acceptable', 'needs_improvement']) {
        await expect(page.getByTestId(`criterion-${key}-rating-${rating}`)).toBeVisible();
      }
    }
    // Exactly nine — no leftover criteria from the form this replaces.
    await expect(page.locator('[data-testid^="criterion-"][data-testid$="-comment"]')).toHaveCount(9);
  });

  test('the existing 4-level scale is preserved, and scores persist', async ({ page }) => {
    await open(page);
    await openForm(page);
    await pickTeacher(page, 'Arwa', /Arwa Ahmed/);

    // All nine default to 'good' → 70 with the default 'good' behaviour,
    // which is the pre-existing formula's answer.
    await expect(page.getByTestId('evaluation-score')).toHaveText('70');

    await page.getByTestId('criterion-punctuality-rating-needs_improvement').click();
    await expect(page.getByTestId('criterion-punctuality-rating-needs_improvement'))
      .toHaveAttribute('aria-pressed', 'true');
    // Dropping one criterion from good(3) to needs_improvement(1) must move the
    // score — proving the criterion is actually in the computation.
    await expect(page.getByTestId('evaluation-score')).not.toHaveText('70');

    await page.getByTestId('evaluation-save').click();
    const payload = await page.evaluate(() => window.__evalStub.inserts[0].payload);
    expect((payload.criteria as Record<string, { score: string }>).punctuality.score)
      .toBe('needs_improvement');
    expect((payload.criteria as Record<string, { score: string }>).recitationTajweed.score)
      .toBe('good');
    expect(Object.keys(payload.criteria as object)).toHaveLength(9);
  });

  test('a quick template sets scores without inventing comments', async ({ page }) => {
    await open(page);
    await openForm(page);
    await pickTeacher(page, 'Arwa', /Arwa Ahmed/);
    await page.getByTestId('criterion-studentEngagement-comment').fill(ENGAGEMENT_COMMENT);

    await page.getByTestId('evaluation-template_excellent').click();
    await expect(page.getByTestId('criterion-punctuality-rating-excellent'))
      .toHaveAttribute('aria-pressed', 'true');
    // The supervisor's own observation survives the template.
    await expect(page.getByTestId('criterion-studentEngagement-comment')).toHaveValue(ENGAGEMENT_COMMENT);
    // And the template wrote none of its own.
    await expect(page.getByTestId('criterion-punctuality-comment')).toHaveValue('');
  });
});

// ======================================================================
test.describe('per-criterion comments', () => {
  test('each criterion can take its own comment, and they do not collide', async ({ page }) => {
    await open(page);
    await openForm(page);
    await pickTeacher(page, 'Arwa', /Arwa Ahmed/);

    // Every one of the nine gets a distinct comment.
    for (const [i, key] of CRITERIA.entries()) {
      await page.getByTestId(`criterion-${key}-comment`).fill(`comment ${i + 1}`);
    }
    for (const [i, key] of CRITERIA.entries()) {
      await expect(page.getByTestId(`criterion-${key}-comment`)).toHaveValue(`comment ${i + 1}`);
    }

    await page.getByTestId('evaluation-save').click();
    const criteria = await page.evaluate(
      () => window.__evalStub.inserts[0].payload.criteria as Record<string, { comment: string }>
    );
    // Each comment is stored inside the criterion it was typed into.
    CRITERIA.forEach((key, i) => expect(criteria[key].comment).toBe(`comment ${i + 1}`));
    // Nine distinct texts — no shared field anywhere on the path.
    expect(new Set(Object.values(criteria).map((c) => c.comment)).size).toBe(9);
  });

  test('commenting on one criterion leaves the others empty', async ({ page }) => {
    await open(page);
    await openForm(page);
    await pickTeacher(page, 'Arwa', /Arwa Ahmed/);

    await page.getByTestId('criterion-studentEngagement-comment').fill(ENGAGEMENT_COMMENT);
    await page.getByTestId('criterion-punctuality-comment').fill(PUNCTUALITY_COMMENT);

    for (const key of CRITERIA) {
      if (key === 'studentEngagement' || key === 'punctuality') continue;
      await expect(page.getByTestId(`criterion-${key}-comment`)).toHaveValue('');
    }

    await page.getByTestId('evaluation-save').click();
    const criteria = await page.evaluate(
      () => window.__evalStub.inserts[0].payload.criteria as Record<string, { comment: string }>
    );
    expect(criteria.studentEngagement.comment).toBe(ENGAGEMENT_COMMENT);
    expect(criteria.punctuality.comment).toBe(PUNCTUALITY_COMMENT);
    expect(criteria.recitationTajweed.comment).toBe('');
  });

  test('comments are optional — an evaluation saves with none', async ({ page }) => {
    await open(page);
    await openForm(page);
    await pickTeacher(page, 'Arwa', /Arwa Ahmed/);
    await page.getByTestId('evaluation-save').click();

    const payload = await page.evaluate(() => window.__evalStub.inserts[0].payload);
    expect(payload.custom_note).toBe('');
    const criteria = payload.criteria as Record<string, { comment: string }>;
    expect(Object.values(criteria).every((c) => c.comment === '')).toBe(true);
  });
});

// ======================================================================
test.describe('the general comment', () => {
  test('is a separate field from the per-criterion comments', async ({ page }) => {
    await open(page);
    await openForm(page);
    await pickTeacher(page, 'Arwa', /Arwa Ahmed/);

    await page.getByTestId('criterion-studentEngagement-comment').fill(ENGAGEMENT_COMMENT);
    await page.getByTestId('evaluation-general-comment').fill(GENERAL_COMMENT);

    // Typing the general comment did not touch any criterion.
    await expect(page.getByTestId('criterion-studentEngagement-comment')).toHaveValue(ENGAGEMENT_COMMENT);
    await expect(page.getByTestId('criterion-punctuality-comment')).toHaveValue('');

    await page.getByTestId('evaluation-save').click();
    const payload = await page.evaluate(() => window.__evalStub.inserts[0].payload);
    // The general comment goes to the whole-evaluation field...
    expect(payload.custom_note).toBe(GENERAL_COMMENT);
    // ...and nowhere near a criterion.
    const criteria = payload.criteria as Record<string, { comment: string }>;
    expect(Object.values(criteria).some((c) => c.comment === GENERAL_COMMENT)).toBe(false);
    expect(criteria.studentEngagement.comment).toBe(ENGAGEMENT_COMMENT);
  });

  test('appears under the teacher name as soon as the evaluation is saved', async ({ page }) => {
    await open(page);
    await openForm(page);
    await pickTeacher(page, 'Arwa', /Arwa Ahmed/);
    await page.getByTestId('evaluation-general-comment').fill(GENERAL_COMMENT);
    await page.getByTestId('evaluation-save').click();

    // The dialog closed and the new row is in the list, without a reload.
    const row = page.locator('[data-testid^="evaluation-row-stub-eval-"]').first();
    await expect(row).toBeVisible();
    await expect(row).toContainText('Arwa Ahmed');

    const comment = row.locator('[data-testid^="evaluation-general-comment-"]');
    await expect(comment).toBeVisible();
    await expect(comment).toHaveText(GENERAL_COMMENT);

    // IMMEDIATELY under the name: the comment's top edge sits below the
    // name's, and above the evaluator/date line.
    const nameBox = (await row.locator('p').first().boundingBox())!;
    const commentBox = (await comment.boundingBox())!;
    const dateBox = (await row.locator('p').last().boundingBox())!;
    expect(commentBox.y).toBeGreaterThan(nameBox.y);
    // Directly beneath the name — a small gap, nothing interposed.
    expect(commentBox.y - (nameBox.y + nameBox.height)).toBeLessThan(16);
    // And above the remaining evaluation information.
    expect(commentBox.y).toBeLessThan(dateBox.y);
  });

  test('does not dominate the row', async ({ page }) => {
    await open(page);
    const row = page.getByTestId('evaluation-row-ev-nine');
    const name = row.locator('p').first();
    const comment = page.getByTestId('evaluation-general-comment-ev-nine');

    const nameSize = await name.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    const commentSize = await comment.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    // Smaller than the teacher's name, which stays the row's headline.
    expect(commentSize).toBeLessThan(nameSize);

    // Long comments are capped rather than allowed to push the row open.
    const clamp = await comment.evaluate((el) => getComputedStyle(el).webkitLineClamp);
    expect(clamp).toBe('3');
  });
});

// ======================================================================
test.describe('backward compatibility', () => {
  test('a historical evaluation still renders, with its original score', async ({ page }) => {
    await open(page);
    const row = page.getByTestId('evaluation-row-ev-historical');
    await expect(row).toBeVisible();
    await expect(row).toContainText('Ashraf Elzohdy');
    // Score and grade are untouched by this feature.
    await expect(row).toContainText('83');
    await expect(row).toContainText(/Good|جيد/);
  });

  test('a historical evaluation with no comment grows no invented one', async ({ page }) => {
    await open(page);
    await expect(page.getByTestId('evaluation-general-comment-ev-historical')).toHaveCount(0);
    // No empty placeholder line either.
    const row = page.getByTestId('evaluation-row-ev-historical');
    await expect(row.locator('p.italic')).toHaveCount(0);
  });

  test('a historical evaluation that DOES carry a note displays it', async ({ page }) => {
    await open(page);
    await expect(page.getByTestId('evaluation-general-comment-ev-historical-note'))
      .toHaveText('Legacy note kept from the old form.');
  });

  test('the list renders old and new evaluations together without error', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page);
    await expect(page.getByTestId('evaluation-row-ev-nine')).toBeVisible();
    await expect(page.getByTestId('evaluation-row-ev-historical')).toBeVisible();
    await expect(page.getByTestId('evaluation-row-ev-historical-note')).toBeVisible();
    expect(errors).toEqual([]);
  });
});

// ======================================================================
test.describe('Arabic / RTL', () => {
  test('the page is in RTL and the roster reads in Arabic', async ({ page }) => {
    await open(page, 'rtl');
    expect(await page.evaluate(() => document.documentElement.dir)).toBe('rtl');
    await expect(page.getByTestId('evaluation-row-ev-nine')).toContainText('محمد حسين');
  });

  test('the searchable selector works in RTL', async ({ page }) => {
    await open(page, 'rtl');
    await openForm(page);
    const options = await searchTeachers(page, 'حسين');
    await expect(options).toHaveCount(2);
    await page.getByRole('option', { name: 'محمد حسين' }).click();
    await expect(page.getByTestId('evaluation-teacher')).toContainText('محمد حسين');
  });

  test('the popover stays inside the dialog in RTL', async ({ page }) => {
    await open(page, 'rtl');
    await openForm(page);
    await page.getByTestId('evaluation-teacher').click();
    const trigger = (await page.getByTestId('evaluation-teacher').boundingBox())!;
    const listbox = (await page.getByRole('listbox').boundingBox())!;
    // Pinned to the trigger's own box, so the panel is identical under either
    // direction and cannot hang off the edge.
    expect(Math.abs(listbox.x - trigger.x)).toBeLessThan(24);
    expect(listbox.x).toBeGreaterThanOrEqual(0);
    expect(listbox.x + listbox.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  });

  test('an Arabic comment renders and overflows nothing', async ({ page }) => {
    await open(page, 'rtl');
    await openForm(page);
    await pickTeacher(page, 'محمد حسين', 'محمد حسين');

    const ARABIC_COMMENT =
      'بشكل عام كانت الحصة جيدة، وتعامل المعلم مع الطالب بشكل مناسب، لكن ينبغي التركيز أكثر على تصحيح أخطاء النطق والتجويد خلال الحصة القادمة.';
    await page.getByTestId('criterion-studentEngagement-comment').fill('تفاعل الطالب كان جيدًا في معظم الحصة.');
    await page.getByTestId('evaluation-general-comment').fill(ARABIC_COMMENT);
    await page.getByTestId('evaluation-save').click();

    const comment = page.locator('[data-testid^="evaluation-general-comment-stub-eval-"]').first();
    await expect(comment).toHaveText(ARABIC_COMMENT);

    // No horizontal overflow introduced anywhere on the page.
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);

    // And the comment stays within its own row.
    const row = page.locator('[data-testid^="evaluation-row-stub-eval-"]').first();
    const rowBox = (await row.boundingBox())!;
    const commentBox = (await comment.boundingBox())!;
    expect(commentBox.x).toBeGreaterThanOrEqual(rowBox.x - 1);
    expect(commentBox.x + commentBox.width).toBeLessThanOrEqual(rowBox.x + rowBox.width + 1);
  });

  test('the nine criterion labels are Arabic in RTL', async ({ page }) => {
    await open(page, 'rtl');
    await openForm(page);
    for (const key of CRITERIA) {
      const text = await page.getByTestId(`criterion-${key}`).locator('span').nth(2).innerText();
      expect(text).toMatch(/[؀-ۿ]/);
    }
  });
});

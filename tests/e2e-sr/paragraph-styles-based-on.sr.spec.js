/**
 * NVDA journeys — Paragraph Styles tab, Based On (#200, PR #293).
 *
 * 1. Open the Edit form of a child style, Tab to the "Based on" select,
 *    change it (Reset to Base must hide for another choice and come back
 *    for the saved parent), then activate Reset to Base and accept its
 *    confirm. The deliverable is what NVDA says for the select (label,
 *    value, help text), for the Reset button, and after the reset.
 * 2. Delete a parent style from its card. Its child must keep its look and
 *    lose the link; the deliverable is the delete announcement and where
 *    focus lands.
 *
 * Capture note: as in paragraph-styles-admin-edit.sr.spec.js, the saves
 * make REST round trips, so the spec waits for the DOM and then reads the
 * focus with NVDA again. The select's value is changed with Playwright
 * (selectOption fires the change event the form listens to): an arrow key
 * through NVDA would depend on browse versus focus mode. Scratch styles are
 * deleted at the end.
 */
const { nvdaTest: test } = require('@guidepup/playwright');
const { expect } = require('@playwright/test');
const h = require('./helpers');

test.use({ nvdaStartOptions: { capture: true } });

const TAB_URL = '/wp-admin/options-general.php?page=typography-stylist&tab=paragraph-styles';

/** Create a parent and a child based on it; return their ids as strings. */
async function seedStyles(page, prefix) {
  await page.goto(TAB_URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.wp && window.wp.apiFetch, null, { timeout: 60000 });
  return page.evaluate(async (prefix) => {
    const parent = await window.wp.apiFetch({
      path: '/typost/v1/paragraph-styles',
      method: 'POST',
      data: { name: prefix + ' Parent', properties: { fontStyle: 'italic', fontSize: '20', lineHeight: 1.5 } },
    });
    const child = await window.wp.apiFetch({
      path: '/typost/v1/paragraph-styles',
      method: 'POST',
      data: { name: prefix + ' Child', basedOn: Number(parent.id), properties: { fontWeight: '700' } },
    });
    return { parentId: String(parent.id), childId: String(child.id) };
  }, prefix);
}

/** Delete the scratch styles; a style that is already gone is skipped. */
async function deleteStyles(page, ids) {
  await page.evaluate(async (ids) => {
    for (const id of ids) {
      try {
        await window.wp.apiFetch({ path: '/typost/v1/paragraph-styles/' + id, method: 'DELETE' });
      } catch (e) {
        // Already gone
      }
    }
  }, ids);
}

/** A style as the REST API returns it (client shape), or null. */
async function readStyle(page, id) {
  return page.evaluate(async (id) => {
    const styles = await window.wp.apiFetch({ path: '/typost/v1/paragraph-styles' });
    return styles.find((s) => String(s.id) === String(id)) || null;
  }, id);
}

test.describe('Paragraph Styles Based On with NVDA', () => {
  test('Based on select and Reset to Base', async ({ page, nvda }) => {
    const { parentId, childId } = await seedStyles(page, 'SR Based On');
    try {
      await page.reload({ waitUntil: 'load' });
      const card = page.locator(`.typost-ps-style-card[data-style-id="${childId}"]`);
      await card.waitFor({ timeout: 60000 });
      const focusTitles = await h.focusBrowser(page, nvda);

      // Open the child's Edit form; focus moves to Name
      await card.locator('.typost-ps-edit-btn').focus();
      await h.delay(300);
      await nvda.press('Enter');
      await card.locator('form').waitFor({ state: 'visible', timeout: 60000 });
      await page.waitForFunction((id) => document.activeElement && document.activeElement.id === 'typost-ps-edit-name-' + id, childId, { timeout: 10000 });
      await h.delay(800);

      // Tab to Based on: its label, value and help text
      const selectStops = await h.tabUntil(page, nvda, (el) => el.id === `typost-ps-edit-based-on-${childId}`, 3);
      const basedOnPhrase = selectStops.length ? selectStops[selectStops.length - 1].phrase : '';
      const select = card.locator(`#typost-ps-edit-based-on-${childId}`);
      const options = await select.evaluate((el) => Array.from(el.options).map((o) => o.value));
      const reset = card.locator('.typost-ps-reset-base-btn');
      const resetOnOpen = await reset.isVisible();

      // Another choice hides Reset to Base; the saved parent shows it again
      await select.selectOption('0');
      await h.delay(300);
      const resetForNone = await reset.isVisible();
      await nvda.perform(nvda.keyboardCommands.reportCurrentFocus);
      const nonePhrase = await nvda.lastSpokenPhrase();
      await select.selectOption(parentId);
      await h.delay(300);
      const resetForParent = await reset.isVisible();

      // Tab from Cancel to Reset to Base
      await card.locator('.typost-ps-cancel-edit-btn').focus();
      await h.delay(300);
      await nvda.press('Tab');
      await h.delay(450);
      const resetPhrase = await nvda.lastSpokenPhrase();
      const resetFocus = await h.describeFocus(page);

      // Activate it; Playwright accepts the confirm
      page.once('dialog', (dialog) => dialog.accept());
      await nvda.press('Enter');
      await card.locator('form').waitFor({ state: 'detached', timeout: 60000 });
      await h.delay(1500);
      const resetDonePhrase = await nvda.lastSpokenPhrase();
      await nvda.perform(nvda.keyboardCommands.reportCurrentFocus);
      const afterResetPhrase = await nvda.lastSpokenPhrase();
      const afterReset = await page.evaluate((id) => {
        const details = document.querySelector(`.typost-ps-style-card[data-style-id="${id}"] .typost-ps-style-card-details`);
        return {
          focus: document.activeElement && String(document.activeElement.className || ''),
          spoken: (document.getElementById('a11y-speak-polite') || {}).textContent || '',
          details: details ? details.textContent.replace(/\s+/g, ' ').trim() : '',
        };
      }, childId);
      const stored = await readStyle(page, childId);

      const log = await h.saveSpeechLog(nvda, 'paragraph-styles-based-on-reset', {
        focusTitles, selectStops, basedOnPhrase, options, resetOnOpen, resetForNone, nonePhrase,
        resetForParent, resetPhrase, resetFocus, resetDonePhrase, afterResetPhrase, afterReset, stored,
      });

      // Product assertions
      expect(options, 'the select leaves out the style itself').not.toContain(childId);
      expect(options).toContain(parentId);
      expect(resetOnOpen, 'Reset to Base shows for a child with overrides').toBe(true);
      expect(resetForNone, 'Reset to Base hides when None is chosen').toBe(false);
      expect(resetForParent, 'Reset to Base comes back for the saved parent').toBe(true);
      expect(resetFocus && resetFocus.className).toContain('typost-ps-reset-base-btn');
      expect(stored && Number(stored.basedOn), 'the child keeps its parent').toBe(Number(parentId));
      expect(Object.keys((stored && stored.ownProperties) || {}), 'the reset removes every override').toHaveLength(0);
      expect(afterReset.focus, 'focus returns to the Edit button').toContain('typost-ps-edit-btn');
      expect(afterReset.spoken, 'the reset is announced').toMatch(/reset/i);
      expect(afterReset.details).toMatch(/Based on:/);

      // Screen-reader assertions
      expect(basedOnPhrase, 'the select is read with its label').toMatch(/based on/i);
      expect(resetPhrase, 'Reset to Base is read as a button').toMatch(/reset to base.*button|button.*reset to base/i);
      expect(log.length).toBeGreaterThan(0);
    } finally {
      await deleteStyles(page, [childId, parentId]);
    }
  });

  test('delete a parent: the child keeps its look', async ({ page, nvda }) => {
    const { parentId, childId } = await seedStyles(page, 'SR Delete Parent');
    try {
      await page.reload({ waitUntil: 'load' });
      const parentCard = page.locator(`.typost-ps-style-card[data-style-id="${parentId}"]`);
      await parentCard.waitFor({ timeout: 60000 });
      const resolvedBefore = (await readStyle(page, childId)).properties;
      const focusTitles = await h.focusBrowser(page, nvda);

      await parentCard.locator('.typost-ps-delete-btn').focus();
      await h.delay(300);
      await nvda.perform(nvda.keyboardCommands.reportCurrentFocus);
      const deletePhrase = await nvda.lastSpokenPhrase();

      page.once('dialog', (dialog) => dialog.accept());
      await nvda.press('Enter');
      await parentCard.waitFor({ state: 'detached', timeout: 60000 });
      await h.delay(2500);
      const deletedPhrase = await nvda.lastSpokenPhrase();
      await nvda.perform(nvda.keyboardCommands.reportCurrentFocus);
      const afterDeletePhrase = await nvda.lastSpokenPhrase();
      const afterDelete = await page.evaluate((id) => {
        const details = document.querySelector(`.typost-ps-style-card[data-style-id="${id}"] .typost-ps-style-card-details`);
        const a = document.activeElement;
        return {
          focus: a ? a.tagName + ' ' + String(a.className || '') + ' ' + (a.closest('.typost-ps-style-card') ? a.closest('.typost-ps-style-card').getAttribute('data-style-id') : '') : '',
          spoken: (document.getElementById('a11y-speak-polite') || {}).textContent || '',
          childDetails: details ? details.textContent.replace(/\s+/g, ' ').trim() : '',
        };
      }, childId);
      const child = await readStyle(page, childId);

      const log = await h.saveSpeechLog(nvda, 'paragraph-styles-based-on-delete', {
        focusTitles, deletePhrase, deletedPhrase, afterDeletePhrase, afterDelete, child, resolvedBefore,
      });

      // Product assertions
      expect(child.basedOn, 'the child loses the link').toBeUndefined();
      expect(child.properties, 'the child keeps its look').toEqual(resolvedBefore);
      expect(afterDelete.childDetails, 'the child card no longer says Based on').not.toMatch(/Based on:/);
      expect(afterDelete.spoken, 'the delete is announced').toMatch(/deleted/i);

      // Screen-reader assertions
      expect(deletePhrase, 'Delete is read as a button').toMatch(/delete.*button|button.*delete/i);
      expect(log.length).toBeGreaterThan(0);
    } finally {
      await deleteStyles(page, [childId, parentId]);
    }
  });
});

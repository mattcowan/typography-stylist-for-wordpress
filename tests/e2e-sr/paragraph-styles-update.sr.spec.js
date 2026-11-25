/**
 * NVDA journey — "Update Style…" in the Quick Feature Toggles (#452).
 *
 * Text in a Typography Stylist block carries a scratch style. The journey
 * changes the text's letter spacing, so the panel says "This text is
 * different from the style.", then works the confirmation with keys sent
 * through NVDA: Enter on "Update Style…" (focus must land on "Cancel",
 * read with the question that names the style and says every page
 * changes), Enter on "Cancel" (focus back on "Update Style…", no request),
 * Enter on "Update Style…" again, Tab to "Yes, Update Style", Enter (one
 * request; the result is spoken politely and focus lands on the style
 * badge), and Escape (the dialog closes). It creates and deletes its own
 * style.
 *
 * The one-time hint ("To change the style, use “Update Style” at the top
 * of this dialog") and the result come through the live region after a
 * debounce or a REST round trip, after Guidepup's capture window: the
 * journey checks them in the DOM (see README, "Known harness limits").
 */
const { nvdaTest: test } = require('@guidepup/playwright');
const { expect } = require('@playwright/test');
const h = require('./helpers');

test.use({ nvdaStartOptions: { capture: true } });

test.describe('Update Style with NVDA', () => {
  let styleId = null;

  test.afterEach(async ({ page }) => {
    if (styleId) {
      await page.evaluate((id) => wp.apiFetch({ path: `/typost/v1/paragraph-styles/${id}`, method: 'DELETE' }).catch(() => {}), styleId).catch(() => {});
      styleId = null;
    }
    await h.deleteCurrentPost(page);
  });

  test('confirm, cancel and update a style from the Quick Feature Toggles', async ({ page, nvda }) => {
    await h.openNewPost(page);
    const focusTitles = await h.focusBrowser(page, nvda);

    const style = await page.evaluate(async () => {
      const created = await wp.apiFetch({
        path: '/typost/v1/paragraph-styles',
        method: 'POST',
        data: { name: 'ZZ 452 SR ' + Date.now(), properties: { fontWeight: '300', letterSpacing: 20 } },
      });
      window.typostData.paragraphStyles = await wp.apiFetch({ path: '/typost/v1/paragraph-styles' });
      document.dispatchEvent(new CustomEvent('typost-paragraph-styles-updated'));
      return created;
    });
    styleId = style.id;

    const clientId = await h.insertBlock(page, 'typost/block', {
      content: `Typography <span class="typost-styled" data-style-id="${style.id}">Stylist</span> Block Test`,
    });
    await h.selectText(page, clientId, 11, 18); // "Stylist"
    const openPhrase = await h.activateToolbarButton(page, nvda, 'Typography Stylist Features');
    const modal = page.locator('.components-modal__frame');
    await modal.waitFor({ timeout: 30000 });
    await page.waitForTimeout(1200);
    const panel = modal.locator('.typost-ps-panel').first();
    const badgeAtOpen = await panel.locator('.typost-ps-badge-name').textContent();

    // The change on the text (no speech needed)
    await modal.getByRole('spinbutton', { name: 'Letter Spacing (for selected text)' }).fill('120');
    await page.waitForTimeout(1500);
    const statusAfterChange = await panel.locator('.typost-ps-status').textContent().catch(() => null);
    const hintInRegion = await page.evaluate(() => (document.getElementById('a11y-speak-polite') || {}).textContent || '');

    // Enter on "Update Style…": focus moves to "Cancel"
    await panel.getByRole('button', { name: 'Update Style…' }).focus();
    await nvda.press('Enter');
    await h.delay(900);
    const confirmStep = { phrase: await nvda.lastSpokenPhrase(), focus: await h.describeFocus(page) };

    // Enter on "Cancel": focus back on "Update Style…", nothing sent
    const writes = [];
    page.on('request', (request) => {
      if (/paragraph-styles(%2F|\/)\d+/.test(request.url()) && request.method() !== 'GET') writes.push(request.method());
    });
    await nvda.press('Enter');
    await h.delay(900);
    const cancelStep = { phrase: await nvda.lastSpokenPhrase(), focus: await h.describeFocus(page), writes: writes.length };

    // Again, then Tab to "Yes, Update Style" and Enter
    await nvda.press('Enter');
    await h.delay(900);
    await nvda.press('Tab');
    await h.delay(700);
    const yesStep = { phrase: await nvda.lastSpokenPhrase(), focus: await h.describeFocus(page) };
    await nvda.press('Enter');
    await page.waitForTimeout(4000);
    const resultStep = {
      phrase: await nvda.lastSpokenPhrase(),
      focus: await h.describeFocus(page),
      polite: await page.evaluate(() => (document.getElementById('a11y-speak-polite') || {}).textContent || ''),
      status: await panel.locator('.typost-ps-status').textContent().catch(() => null),
      writes: writes.length,
    };

    const close = await h.closeModalWithEscape(page, nvda, '.components-modal__frame');
    const log = await h.saveSpeechLog(nvda, 'paragraph-styles-update', { focusTitles, openPhrase, badgeAtOpen, statusAfterChange, hintInRegion, confirmStep, cancelStep, yesStep, resultStep, close });

    // Product assertions
    expect(badgeAtOpen).toBe(style.name);
    expect(statusAfterChange).toBe('This text is different from the style.');
    expect(hintInRegion).toContain(`This text is different from the style “${style.name}”. To change the style, use “Update Style” at the top of this dialog.`);
    expect(confirmStep.focus.className).toContain('typost-ps-confirm-cancel');
    expect(cancelStep.focus.className).toContain('typost-ps-update-btn');
    expect(cancelStep.writes).toBe(0);
    expect(yesStep.focus.className).toContain('typost-ps-confirm-yes');
    expect(resultStep.writes).toBe(1);
    expect(resultStep.focus.className).toContain('typost-ps-badge');
    expect(resultStep.polite).toContain(`“${style.name}” is updated. All text that uses this style changed.`);
    expect(close.closed, 'Escape should close the dialog from the badge').toBe(true);

    // Screen-reader assertions: the confirmation is read with its question
    expect(confirmStep.phrase, '"Cancel" should be read with the question').toMatch(/Cancel/);
    const escapedName = style.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    expect(h.spoke(log, new RegExp(escapedName + '.{0,3} on all pages')), 'the question should name the style and say every page changes').toBe(true);
    expect(cancelStep.phrase).toMatch(/Update Style/);
    expect(yesStep.phrase).toMatch(/Yes, Update Style/);
  });
});

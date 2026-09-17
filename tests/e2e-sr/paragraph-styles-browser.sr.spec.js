/**
 * NVDA journey 2 — Paragraph Styles browser (toolbar button).
 *
 * In a Typography Stylist block, select a word, open the "Paragraph Styles"
 * toolbar button with Enter (through NVDA), Tab until a style row has focus,
 * apply it with Enter. Asserts that rows are announced with their name and
 * pressed state, that the modal closes on apply, that the style wrapped the
 * selection, and that focus returns to the toolbar button. Requires the
 * "Paragraph Styles toolbar button" option to be on.
 */
const { nvdaTest: test } = require('@guidepup/playwright');
const { expect } = require('@playwright/test');
const h = require('./helpers');

test.use({ nvdaStartOptions: { capture: true } });

test.describe('Paragraph Styles browser with NVDA', () => {
  test.afterEach(async ({ page }) => {
    await h.deleteCurrentPost(page);
  });

  test('tab to a style row and apply it to the selection', async ({ page, nvda }) => {
    await h.openNewPost(page);
    // Bring Firefox to the front for NVDA before touching the editor.
    const focusTitles = await h.focusBrowser(page, nvda);
    const clientId = await h.insertBlock(page, 'typost/block', { content: 'Typography Stylist Block Test' });
    await h.selectText(page, clientId, 11, 18); // "Stylist"

    const styles = await page.evaluate(() => (window.typostData.paragraphStyles || []).map((s) => s.name));
    test.skip(styles.length < 2, 'Needs at least two saved paragraph styles on the site');

    const openPhrase = await h.activateToolbarButton(page, nvda, 'Paragraph Styles');
    await page.waitForSelector('.typost-ps-browser-row', { timeout: 30000 });
    await page.waitForTimeout(1200);
    const focusAtOpen = await h.describeFocus(page);

    // Tab until a style row has focus, recording every stop on the way.
    const tabStops = await h.tabUntil(page, nvda, (el) => el.className.includes('typost-ps-browser-row'), 10);
    const focusedRow = await page.evaluate(() => {
      const el = document.activeElement;
      return el && el.classList.contains('typost-ps-browser-row')
        ? { name: el.querySelector('.typost-ps-browser-name').textContent, pressed: el.getAttribute('aria-pressed') }
        : null;
    });
    const rowPhrase = await nvda.lastSpokenPhrase();

    await nvda.press('Enter');
    await page.waitForTimeout(1200);
    const applyPhrase = await nvda.lastSpokenPhrase();

    const after = await page.evaluate((id) => {
      const b = wp.data.select('core/block-editor').getBlock(id);
      const active = document.activeElement;
      return {
        content: b.attributes.content,
        modalOpen: !!document.querySelector('.typost-ps-browser-modal'),
        focusLabel: active && (active.getAttribute('aria-label') || active.textContent.trim().slice(0, 40)),
      };
    }, clientId);

    const log = await h.saveSpeechLog(nvda, 'paragraph-styles-browser', { focusTitles, openPhrase, focusAtOpen, tabStops, focusedRow, rowPhrase, applyPhrase, after, styles });

    // Product assertions.
    expect(focusedRow, 'Tab must reach a style row').not.toBeNull();
    expect(after.modalOpen).toBe(false);
    expect(after.content).toMatch(/<span class="typost-styled" data-style-id="\d+">Stylist<\/span>/);
    expect(after.focusLabel).toBe('Paragraph Styles');

    // Screen-reader assertions.
    expect(openPhrase, 'opening should announce the dialog').toMatch(/Paragraph Styles/i);
    expect(rowPhrase, 'a row should be announced with its name').toMatch(new RegExp(focusedRow.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
    expect(rowPhrase, 'a row should announce its pressed state').toMatch(/toggle button|pressed/i);
  });
});

/**
 * NVDA journey 1 — Glyphs panel.
 *
 * Select the "W" of a heading, open the Glyphs toolbar button with Enter
 * (through NVDA), Tab through the dialog's controls to the glyph grid, arrow
 * to the first stylistic alternate, insert it with Enter, close with Escape.
 * Asserts what NVDA announces at each step and that the insertion landed.
 */
const { nvdaTest: test } = require('@guidepup/playwright');
const { expect } = require('@playwright/test');
const h = require('./helpers');

test.use({ nvdaStartOptions: { capture: true } });

test.describe('Glyphs panel with NVDA', () => {
  test.afterEach(async ({ page }) => {
    await h.deleteCurrentPost(page);
  });

  test('tab to the grid, arrow to an alternate, insert it', async ({ page, nvda }) => {
    await h.openNewPost(page);
    // Bring Firefox to the front for NVDA before touching the editor.
    const focusTitles = await h.focusBrowser(page, nvda);
    const clientId = await h.insertBlock(page, 'core/heading', { level: 2, content: 'Wonderful Wedding' });
    await h.selectText(page, clientId, 0, 1);

    const openPhrase = await h.activateToolbarButton(page, nvda, 'Glyphs');
    await page.waitForSelector('.typost-glyph-cell', { timeout: 60000 });
    await page.waitForTimeout(1500);
    const focusAtOpen = await h.describeFocus(page);

    // Tab to the grid, recording every stop on the way (that is the journey).
    const tabStops = await h.tabUntil(page, nvda, (el) => el.className.includes('typost-glyphs-grid'), 14);
    const focusAtGrid = await h.describeFocus(page);

    const activeCell = () => page.evaluate(() => {
      const grid = document.querySelector('.typost-glyphs-grid');
      const id = grid && grid.getAttribute('aria-activedescendant');
      const cell = id && document.getElementById(id);
      return cell ? cell.getAttribute('aria-label') : null;
    });
    const initialCell = await activeCell();

    // Arrow keys must reach the grid: probe once, switch NVDA mode if needed.
    const modePhrases = await h.ensureFocusMode(nvda, async () => {
      await nvda.press('ArrowRight');
      await h.delay(400);
      return (await activeCell()) !== initialCell;
    });

    let cell = await activeCell();
    let guard = 0;
    while (!/salt \(Stylistic Alternates\) #1 of/.test(cell || '') && guard++ < 4) {
      await h.delay(600); // let the previous announcement finish so the next one is captured
      await nvda.press('ArrowRight');
      await h.delay(400);
      cell = await activeCell();
    }
    const cellPhrase = await nvda.lastSpokenPhrase();

    await nvda.press('Enter');
    await page.waitForTimeout(1200);
    const insertPhrase = await nvda.lastSpokenPhrase();
    const html = await h.blockHtml(page, clientId);
    // Where did focus go after the insertion? (If it left the dialog, Escape
    // can no longer close it — that is a product finding, not a harness one.)
    const focusAfterInsert = await h.describeFocus(page);
    const focusInCanvas = await h.describeCanvasFocus(page);
    // Containment is the real assertion: focus on the body or a toolbar
    // button outside the dialog is as broken as focus in the canvas.
    const focusInsideDialog = await page.evaluate(() => {
      const modal = document.querySelector('.components-modal__frame.typost-glyphs-modal');
      return Boolean(modal && modal.contains(document.activeElement));
    });

    const close = await h.closeModalWithEscape(page, nvda, '.typost-glyph-cell');
    const modalClosed = close.closed;
    const closePhrase = close.phrases.join(' | ');
    const escapesNeeded = close.escapesNeeded;

    const log = await h.saveSpeechLog(nvda, 'glyphs-panel', { focusTitles,
      openPhrase, focusAtOpen, tabStops, focusAtGrid, initialCell, modePhrases, cell, cellPhrase, insertPhrase, closePhrase, escapesNeeded, close, focusAfterInsert, focusInCanvas, focusInsideDialog, html, modalClosed,
    });

    // Product assertions (true regardless of exact NVDA wording).
    expect(focusAtGrid.className, 'Tab must be able to reach the glyph grid').toContain('typost-glyphs-grid');
    expect(cell).toMatch(/salt \(Stylistic Alternates\) #1 of/);
    expect(html).toContain('data-features="salt"');
    // SR-7: after Enter inserts a glyph, focus jumps into the editor canvas and
    // the dialog can no longer be closed with Escape. Expected to fail until fixed.
    expect(focusInsideDialog, 'focus must stay inside the dialog after inserting (SR-7)').toBe(true);
    expect(modalClosed, 'Escape should close the dialog (SR-7)').toBe(true);

    // Screen-reader assertions.
    expect(openPhrase, 'opening the panel should announce the dialog').toMatch(/Glyphs/i);
    expect(cellPhrase, 'arrowing should announce the cell').toMatch(/Stylistic Alternates/i);
    expect(h.spoke(log, /Inserted/i), 'Enter should announce the live region').toBe(true);
  });
});

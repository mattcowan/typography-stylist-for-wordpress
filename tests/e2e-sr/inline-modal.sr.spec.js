/**
 * NVDA journey 3 — inline editor modal ("Typography Stylist Features").
 *
 * Select a word in a core heading, open the modal from the toolbar with
 * Enter (through NVDA), Tab through the first controls recording what NVDA
 * says for each, toggle "Standard Ligatures" with Space, close with Escape.
 * The Tab log is the deliverable: it shows which controls are announced
 * without a name and which stops should not be focusable at all.
 */
const { nvdaTest: test } = require('@guidepup/playwright');
const { expect } = require('@playwright/test');
const h = require('./helpers');

test.use({ nvdaStartOptions: { capture: true } });

const TAB_STOPS = 16;

test.describe('Inline editor modal with NVDA', () => {
  test.afterEach(async ({ page }) => {
    await h.deleteCurrentPost(page);
  });

  test('tab through controls and toggle a feature', async ({ page, nvda }) => {
    await h.openNewPost(page);
    // Bring Firefox to the front for NVDA before touching the editor.
    const focusTitles = await h.focusBrowser(page, nvda);
    const clientId = await h.insertBlock(page, 'core/heading', { level: 2, content: 'Clean Heading Test' });
    await h.selectText(page, clientId, 6, 13); // "Heading"

    const openPhrase = await h.activateToolbarButton(page, nvda, 'Typography Stylist Features');
    await page.waitForSelector('.components-modal__frame .typost-ps-panel', { timeout: 30000 });
    await page.waitForTimeout(1200);
    const focusAtOpen = await h.describeFocus(page);

    // Walk the first N Tab stops and record each one.
    const stops = await h.tabUntil(page, nvda, () => false, TAB_STOPS);

    // Jump to the Standard Ligatures checkbox and toggle it with Space.
    const ligaInput = page.locator('.components-modal__frame input[type="checkbox"]').first();
    // The toggle is the journey's primary interaction: a missing checkbox must
    // fail the test, not quietly skip its assertions.
    await expect(ligaInput).toHaveCount(1);
    let toggled = null;
    {
      await ligaInput.focus();
      await h.delay(400);
      await nvda.press('Space');
      await page.waitForTimeout(900);
      toggled = {
        phrase: await nvda.lastSpokenPhrase(),
        checked: await ligaInput.isChecked(),
        html: await h.blockHtml(page, clientId),
        focusAfter: await h.describeFocus(page),
        focusInCanvas: await h.describeCanvasFocus(page),
        focusInsideModal: await page.locator('.components-modal__frame')
          .evaluate((modal) => modal.contains(document.activeElement)),
      };
    }

    // "Browse styles…" (Session B feature): focus the button, open the style
    // browser with Enter through NVDA, record what it announces and where
    // focus lands (a style row, SR-6), then close it with Escape. The inline
    // modal stays open underneath, so the final close below still applies.
    const browseButton = page.locator('.components-modal__frame .typost-ps-browse-btn');
    let browse = null;
    if (await browseButton.count()) {
      await browseButton.focus();
      await h.delay(400);
      await nvda.press('Enter');
      await page.waitForSelector('.typost-ps-browser-modal', { timeout: 30000 }).catch(() => null);
      await page.waitForTimeout(1200);
      browse = {
        openPhrase: await nvda.lastSpokenPhrase(),
        focusAtOpen: await h.describeFocus(page),
        rowCount: await page.locator('.typost-ps-browser-row').count(),
      };
      browse.close = await h.closeModalWithEscape(page, nvda, '.typost-ps-browser-modal');
      await h.delay(800);
      browse.focusAfterClose = await h.describeFocus(page);
      browse.hostReopened = await page.evaluate(() => {
        const host = document.querySelector('.components-modal__frame.typost-modal');
        return Boolean(host && host.contains(document.activeElement));
      });
      await h.delay(500);
    }

    const close = await h.closeModalWithEscape(page, nvda, '.components-modal__frame');

    // Classify the stops for the report.
    const unnamedControls = stops
      .filter((s) => s.el && (s.el.tag === 'SELECT' || s.el.type === 'range' || s.el.type === 'text') && !s.el.ariaLabel && !s.el.labelText)
      .map((s) => ({ id: s.el.id, tag: s.el.tag, phrase: s.phrase }));
    const silentStops = stops.filter((s) => !s.phrase).map((s) => s.el);
    const longestPhrase = stops.reduce((m, s) => Math.max(m, (s.phrase || '').length), 0);

    const log = await h.saveSpeechLog(nvda, 'inline-modal', { focusTitles, openPhrase, focusAtOpen, stops, toggled, browse, close, unnamedControls, silentStops, longestPhrase });

    // Browse styles: the browser announces itself, opens on a style row, and
    // Escape returns focus to the button that opened it.
    expect(browse, 'the inline modal should offer "Browse styles…"').not.toBeNull();
    expect(browse.openPhrase, 'opening the browser should announce the dialog').toMatch(/Paragraph Styles/i);
    if (browse.rowCount > 0) {
      expect(browse.focusAtOpen && browse.focusAtOpen.className, 'the browser should open on a style row (SR-6)').toContain('typost-ps-browser-row');
    }
    expect(browse.close.closed, 'Escape should close the browser').toBe(true);
    // Opening the browser makes WordPress close the inline modal (as with the
    // Glyphs panel); closing the browser reopens it, and focus lands inside it.
    expect(browse.hostReopened, 'closing the browser should reopen the inline modal with focus inside it').toBe(true);

    // Product assertions.
    if (toggled) {
      expect(toggled.checked).toBe(true);
      expect(toggled.html).toMatch(/data-features="[^"]*liga/);
      expect(toggled.phrase, 'Space should announce the new state').toMatch(/checked/i);
      // SR-7: after Space toggles a feature, focus jumps into the editor canvas
      // and the modal can no longer be closed with Escape. Expected to fail until fixed.
      expect(toggled.focusInsideModal, 'focus must stay inside the modal after toggling (SR-7)').toBe(true);
    }
    expect(close.closed, 'Escape should close the modal (SR-7)').toBe(true);

    // Screen-reader assertions — these encode the findings and are expected
    // to FAIL until the modal is fixed (SR-2 unnamed selects, SR-3 one stop
    // reading the whole modal, SR-4 silent focusable stops).
    expect(openPhrase, 'opening should announce the dialog').toMatch(/Typography Stylist/i);
    // The tips notice used to be pushed into the live region on mount and was
    // read before the dialog's name (same mechanism as SR-1 on the Glyphs panel).
    expect(openPhrase, 'the dialog name should come before any notice text').toMatch(/^Typography Stylist/);
    // SR-4: the drag handle and the scroll wrappers are no longer Tab stops.
    const wrapperStops = stops.filter((s) => s.el && /typost-modal-header|typost-modal-content|typost-scrollable-content/.test(s.el.className));
    expect(wrapperStops, `Wrappers reached by Tab: ${JSON.stringify(wrapperStops.map((s) => s.el.className))}`).toEqual([]);
    expect(unnamedControls, `Controls announced without a name: ${JSON.stringify(unnamedControls.map((u) => u.id))}`).toEqual([]);
    expect(longestPhrase, 'no single Tab stop should read the whole modal').toBeLessThan(400);
    expect(silentStops, `Focusable elements announced as nothing: ${JSON.stringify(silentStops.map((e) => e && (e.className || e.tag)))}`).toEqual([]);
  });
});

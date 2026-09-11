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

    const close = await h.closeModalWithEscape(page, nvda, '.components-modal__frame');

    // Classify the stops for the report.
    const unnamedControls = stops
      .filter((s) => s.el && (s.el.tag === 'SELECT' || s.el.type === 'range' || s.el.type === 'text') && !s.el.ariaLabel && !s.el.labelText)
      .map((s) => ({ id: s.el.id, tag: s.el.tag, phrase: s.phrase }));
    const silentStops = stops.filter((s) => !s.phrase).map((s) => s.el);
    const longestPhrase = stops.reduce((m, s) => Math.max(m, (s.phrase || '').length), 0);

    const log = await h.saveSpeechLog(nvda, 'inline-modal', { focusTitles, openPhrase, focusAtOpen, stops, toggled, close, unnamedControls, silentStops, longestPhrase });

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
    expect(unnamedControls, `Controls announced without a name: ${JSON.stringify(unnamedControls.map((u) => u.id))}`).toEqual([]);
    expect(longestPhrase, 'no single Tab stop should read the whole modal').toBeLessThan(400);
    expect(silentStops, `Focusable elements announced as nothing: ${JSON.stringify(silentStops.map((e) => e && (e.className || e.tag)))}`).toEqual([]);
  });
});

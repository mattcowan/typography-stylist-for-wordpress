/**
 * NVDA journey 5 — inline editor modal on a core paragraph (Session E).
 *
 * Journey 3 covers the modal on a heading. This one opens it on a paragraph
 * block, walks the first Tab stops, then drives the Font Size select with the
 * arrow keys through NVDA: Inherit → Responsive (Fluid). That reveals the
 * three size sliders; the journey records how they are announced, then puts
 * the values out of order (Minimum 120, Maximum 8) through NVDA key presses
 * and asserts that the out-of-order warning is announced: the block editor
 * always showed one, the inline modal gained it with QA finding E-1.
 */
const { nvdaTest: test } = require('@guidepup/playwright');
const { expect } = require('@playwright/test');
const h = require('./helpers');

test.use({ nvdaStartOptions: { capture: true } });

const TAB_STOPS = 10;
const MODAL = '.components-modal__frame.typost-modal';

test.describe('Inline editor modal on a paragraph with NVDA', () => {
  test.afterEach(async ({ page }) => {
    await h.deleteCurrentPost(page);
  });

  test('open on a paragraph, switch the size to responsive, cross the sliders', async ({ page, nvda }) => {
    await h.openNewPost(page);
    const focusTitles = await h.focusBrowser(page, nvda);
    const clientId = await h.insertBlock(page, 'core/paragraph', { content: 'Paragraph journey sample text' });
    await h.selectText(page, clientId, 18, 24); // "sample"

    const openPhrase = await h.activateToolbarButton(page, nvda, 'Typography Stylist Features');
    await page.waitForSelector(MODAL + ' .typost-fontsize-section select', { timeout: 30000 });
    await page.waitForTimeout(1200);
    const focusAtOpen = await h.describeFocus(page);

    const stops = await h.tabUntil(page, nvda, () => false, TAB_STOPS);

    // Font Size select: read it, then ArrowDown to "Responsive (Fluid)".
    const sizeSelect = page.locator(MODAL + ' .typost-fontsize-section select');
    await sizeSelect.focus();
    await h.delay(300);
    await nvda.perform(nvda.keyboardCommands.reportCurrentFocus);
    const sizePhrase = await nvda.lastSpokenPhrase();
    await nvda.press('ArrowDown');
    await page.waitForSelector(MODAL + ' .typost-fontsize-controls input[type="range"]', { timeout: 15000 });
    await h.delay(700);
    const responsivePhrase = await nvda.lastSpokenPhrase();
    const sizeValue = await sizeSelect.inputValue();

    // The three sliders that appeared: Tab onto each and record the phrase.
    const sliders = await h.tabUntil(page, nvda, (el) => /Maximum Size/i.test(el.labelText || ''), 8);
    const sliderStops = sliders.filter((s) => s.el && s.el.type === 'range');

    // Cross the values through NVDA itself: End on the Minimum slider (120)
    // and Home on the Maximum slider (8). Guidepup only records speech that
    // lands around its own key presses, so a Playwright fill would leave the
    // Notice's mount announcement unrecorded even when NVDA spoke it (that is
    // what the first run of this journey showed). The warning Notice mounts
    // on the Home press and core speaks it in that window.
    const ranges = page.locator(MODAL + ' .typost-fontsize-controls input[type="range"]');
    await ranges.nth(0).focus();
    await h.delay(300);
    await nvda.press('End');
    await h.delay(700);
    const minCrossPhrase = await nvda.lastSpokenPhrase();
    await ranges.nth(2).focus();
    await h.delay(300);
    await nvda.press('Home');
    await h.delay(1500);
    const afterCrossPhrase = await nvda.lastSpokenPhrase();
    const crossed = await page.evaluate(({ id, MODAL }) => {
      const m = document.querySelector(MODAL);
      return {
        html: window.__qa.html(id),
        notices: Array.from(m.querySelectorAll('.components-notice')).map((n) => n.textContent.trim().slice(0, 120)).filter((t) => !/Tip:/.test(t)),
        live: window.__qa.live(),
      };
    }, { id: clientId, MODAL });

    const close = await h.closeModalWithEscape(page, nvda, MODAL);
    const focusAfterClose = await h.describeFocus(page);

    const log = await h.saveSpeechLog(nvda, 'inline-paragraph', {
      focusTitles, openPhrase, focusAtOpen, stops, sizePhrase, responsivePhrase, sizeValue, sliderStops,
      minCrossPhrase, afterCrossPhrase, crossed, close, focusAfterClose,
    });
    // Anchored to the two crossing presses, not the whole log
    const orderWarningSpoken = /Font sizes are out of order/i.test(String(minCrossPhrase) + ' ' + String(afterCrossPhrase));

    // Product assertions.
    expect(sizeValue, 'ArrowDown should select Responsive').toBe('responsive');
    expect(sliderStops.length, 'the three size sliders should be reachable by Tab').toBeGreaterThanOrEqual(3);
    expect(crossed.html, 'crossed values still write the clamp() as typed (soft validation)').toMatch(/clamp\(120px/);
    expect(crossed.notices.some((n) => /out of order/i.test(n)), 'the inline modal shows the out-of-order Notice (E-1)').toBe(true);
    expect(close.closed, 'Escape should close the modal').toBe(true);

    // Screen-reader assertions.
    expect(openPhrase, 'opening should announce the dialog').toMatch(/Typography Stylist/i);
    expect(sizePhrase, 'the size select should carry its label').toMatch(/Font Size/i);
    expect(responsivePhrase, 'the new option should be announced').toMatch(/Responsive/i);
    for (const s of sliderStops) {
      expect(s.phrase, 'each slider should be announced with its label').toMatch(/Size/i);
    }
    const unnamed = stops.filter((s) => s.el && /INPUT|SELECT|BUTTON/.test(s.el.tag) && s.phrase && !/[a-z]/i.test(s.phrase));
    expect(unnamed, 'no control should be announced without a name').toEqual([]);
    expect(orderWarningSpoken, `the out-of-order Notice must be spoken when it mounts (E-1); heard: ${afterCrossPhrase}`).toBe(true);
  });
});

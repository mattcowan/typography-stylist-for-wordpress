/**
 * NVDA journey 4 — Settings → Typography Stylist (admin tabs, Session E).
 *
 * Land on the Custom Fonts tab, arrow through the tablist with NVDA, Tab into
 * the Options panel, change the Admin Color Scheme select with the arrow
 * keys, save it with Enter, clear the font cache with Enter, then put the
 * scheme back. The deliverable is what NVDA says for each tab, for the
 * select, and for the two role="status" confirmation messages. The color
 * scheme is restored to its starting value at the end.
 *
 * Capture note: the confirmation messages arrive after a REST round trip.
 * Guidepup only records speech that lands inside the quiet window after its
 * own key press, so a slow site can make a real announcement look missing.
 * The spec records the DOM text of each message alongside the phrase and
 * only asserts the DOM; the phrase is quoted in the report when captured.
 */
const { nvdaTest: test } = require('@guidepup/playwright');
const { expect } = require('@playwright/test');
const h = require('./helpers');

test.use({ nvdaStartOptions: { capture: true } });

const SETTINGS_URL = '/wp-admin/options-general.php?page=typography-stylist';

test.describe('Settings tabs with NVDA', () => {
  test('arrow through tabs, change the color scheme, save and clear the cache', async ({ page, nvda }) => {
    await page.goto(SETTINGS_URL, { waitUntil: 'load' });
    await page.waitForSelector('.typost-admin-tabs [role="tab"]', { timeout: 60000 });
    const startingScheme = await page.locator('#typost_admin_color_scheme').inputValue();
    const focusTitles = await h.focusBrowser(page, nvda);

    // The tablist uses a roving tabindex: only the selected tab is a Tab
    // stop, and the arrow keys move between tabs. Arrow keys need NVDA's
    // focus mode; ensureFocusMode probes whether ArrowRight moved focus.
    await page.locator('#typost-tab-button-fonts').focus();
    await h.delay(300);
    await nvda.perform(nvda.keyboardCommands.reportCurrentFocus);
    const firstTabPhrase = await nvda.lastSpokenPhrase();
    const modeHeard = await h.ensureFocusMode(nvda, async () => {
      const before = await h.describeFocus(page);
      await nvda.press('ArrowRight');
      await h.delay(500);
      const after = await h.describeFocus(page);
      return !!(before && after && before.id !== after.id);
    });

    // Walk the tabs with ArrowRight until the Options tab is selected.
    const tabs = [];
    for (let i = 0; i < 8; i++) {
      const el = await h.describeFocus(page);
      if (el && el.id === 'typost-tab-button-options') break;
      await nvda.press('ArrowRight');
      await h.delay(600);
      tabs.push({ phrase: await nvda.lastSpokenPhrase(), el: await h.describeFocus(page) });
    }
    const onOptions = await h.describeFocus(page);

    // Tab into the panel: the first stop after the tablist.
    const intoPanel = await h.tabUntil(page, nvda, () => true, 1);

    // The Admin Color Scheme select: focus it with Playwright, let NVDA read
    // it, then pick the next scheme with ArrowDown.
    const select = page.locator('#typost_admin_color_scheme');
    await select.focus();
    await h.delay(300);
    await nvda.perform(nvda.keyboardCommands.reportCurrentFocus);
    const selectPhrase = await nvda.lastSpokenPhrase();
    await nvda.press('ArrowDown');
    await h.delay(600);
    const changedPhrase = await nvda.lastSpokenPhrase();
    const changedValue = await select.inputValue();

    // Save with Enter on the submit button (announces the status message).
    const optionsSave = page.locator('button[name="typost_save_options_settings"]');
    await optionsSave.focus();
    await h.delay(300);
    await nvda.press('Enter');
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('.typost-settings-ajax-message')).some((m) => /saved/i.test(m.textContent)),
      null,
      { timeout: 60000 }
    );
    await h.delay(800);
    const savePhrase = await nvda.lastSpokenPhrase();
    const saveState = await page.evaluate(() => ({
      scheme: document.querySelector('.typost-admin-wrap').getAttribute('data-color-scheme'),
      styleInjected: !!document.getElementById('typost-admin-color-scheme-inline-css'),
      messages: Array.from(document.querySelectorAll('.typost-settings-ajax-message')).map((m) => ({ role: m.getAttribute('role'), text: m.textContent.trim() })).filter((m) => m.text),
      focus: document.activeElement && (document.activeElement.getAttribute('name') || document.activeElement.id),
    }));

    // Clear the font cache with Enter.
    const clearCache = page.locator('button[name="typost_clear_cache"]');
    await clearCache.focus();
    await h.delay(300);
    await nvda.press('Enter');
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('.typost-settings-ajax-message')).some((m) => /cache cleared/i.test(m.textContent)),
      null,
      { timeout: 60000 }
    );
    await h.delay(800);
    const clearPhrase = await nvda.lastSpokenPhrase();
    const clearState = await page.evaluate(() => ({
      messages: Array.from(document.querySelectorAll('.typost-settings-ajax-message')).map((m) => m.textContent.trim()).filter(Boolean),
      focus: document.activeElement && (document.activeElement.getAttribute('name') || document.activeElement.id),
    }));

    // Restore the color scheme.
    await select.selectOption(startingScheme);
    await optionsSave.click();
    await page.waitForFunction(
      (wanted) => document.querySelector('.typost-admin-wrap').getAttribute('data-color-scheme') === wanted,
      startingScheme,
      { timeout: 60000 }
    );

    const log = await h.saveSpeechLog(nvda, 'admin-tabs', {
      focusTitles, firstTabPhrase, modeHeard, tabs, onOptions, intoPanel, selectPhrase, changedPhrase, changedValue,
      savePhrase, saveState, clearPhrase, clearState, startingScheme,
    });

    // Product assertions.
    expect(onOptions && onOptions.id, 'ArrowRight should reach the Options tab').toBe('typost-tab-button-options');
    expect(changedValue, 'ArrowDown should change the scheme').not.toBe(startingScheme);
    expect(saveState.scheme, 'the page should restyle without a reload').toBe(changedValue);
    expect(saveState.messages.some((m) => m.role === 'status' && /saved/i.test(m.text)), 'the save should confirm in a status region').toBe(true);
    expect(saveState.focus, 'focus should stay on the Save button').toBe('typost_save_options_settings');
    expect(clearState.messages.some((m) => /cache cleared/i.test(m)), 'clearing the cache should confirm').toBe(true);

    // Screen-reader assertions.
    expect(firstTabPhrase, 'a tab should be announced as a tab').toMatch(/tab/i);
    for (const t of tabs) {
      expect(t.phrase, 'every arrowed tab should be announced with its name').toMatch(/tab/i);
    }
    expect(selectPhrase, 'the scheme select should carry its label').toMatch(/color scheme/i);
    expect(changedPhrase, 'ArrowDown should announce the new option').not.toBe('');
    expect(log.length).toBeGreaterThan(0);
  });
});

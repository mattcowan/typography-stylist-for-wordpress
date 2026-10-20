/**
 * NVDA journey — Paragraph Styles tab, the full Edit form (#221, PR #292).
 *
 * Create a scratch style, open its Edit form with Enter, Tab through the
 * first fields, submit an empty name, then fix the name and save with
 * Enter on Save. The deliverable is what NVDA says when the form opens,
 * for the error (the field must be read as invalid, with the message),
 * and after the save (the "saved" announcement and the Edit button). The
 * scratch style is deleted at the end.
 *
 * Capture note: the save makes two REST round trips (PATCH, then the
 * admin-card refresh), and Edit makes one before the form opens. Guidepup
 * only records speech inside the quiet window after its own key press, so
 * the spec waits for the DOM, then reads the focus with NVDA again. The
 * assertions are on the DOM; the phrases are quoted in the QA report.
 */
const { nvdaTest: test } = require('@guidepup/playwright');
const { expect } = require('@playwright/test');
const h = require('./helpers');

test.use({ nvdaStartOptions: { capture: true } });

const TAB_URL = '/wp-admin/options-general.php?page=typography-stylist&tab=paragraph-styles';
const STYLE_NAME = 'SR Edit Form';

test.describe('Paragraph Styles Edit form with NVDA', () => {
  test('open Edit, hear an error on the field, save', async ({ page, nvda }) => {
    await page.goto(TAB_URL, { waitUntil: 'load' });
    await page.waitForFunction(() => window.wp && window.wp.apiFetch, null, { timeout: 60000 });
    const styleId = await page.evaluate(async (name) => {
      const style = await window.wp.apiFetch({
        path: '/typost/v1/paragraph-styles',
        method: 'POST',
        data: { name, properties: { fontId: 0, fontSize: '24', lineHeight: 1.4 } },
      });
      return String(style.id);
    }, STYLE_NAME);

    try {
      await page.reload({ waitUntil: 'load' });
      const card = page.locator(`.typost-ps-style-card[data-style-id="${styleId}"]`);
      await card.waitFor({ timeout: 60000 });
      const focusTitles = await h.focusBrowser(page, nvda);

      // The Edit button, read by NVDA
      await card.locator('.typost-ps-edit-btn').focus();
      await h.delay(300);
      await nvda.perform(nvda.keyboardCommands.reportCurrentFocus);
      const editPhrase = await nvda.lastSpokenPhrase();

      // Enter opens the form after the stored style is fetched; focus moves to Name
      await nvda.press('Enter');
      await card.locator('form').waitFor({ state: 'visible', timeout: 60000 });
      await page.waitForFunction((id) => document.activeElement && document.activeElement.id === 'typost-ps-edit-name-' + id, styleId, { timeout: 10000 });
      await h.delay(800);
      const openPhrase = await nvda.lastSpokenPhrase();
      await nvda.perform(nvda.keyboardCommands.reportCurrentFocus);
      const namePhrase = await nvda.lastSpokenPhrase();
      const openFocus = await h.describeFocus(page);

      // The first fields after Name
      const firstStops = await h.tabUntil(page, nvda, () => false, 4);

      // Empty name, then Enter in the field: the alert and the invalid field
      const nameInput = card.locator(`#typost-ps-edit-name-${styleId}`);
      await nameInput.fill('');
      await nameInput.focus();
      await h.delay(300);
      await nvda.press('Enter');
      await h.delay(1000);
      const errorPhrase = await nvda.lastSpokenPhrase();
      await nvda.perform(nvda.keyboardCommands.reportCurrentFocus);
      const errorFocusPhrase = await nvda.lastSpokenPhrase();
      const errorState = await nameInput.evaluate((el) => {
        const box = el.form.querySelector('.typost-ps-edit-error');
        return {
          focused: document.activeElement === el,
          invalid: el.getAttribute('aria-invalid'),
          describedby: el.getAttribute('aria-describedby'),
          boxId: box.id,
          message: box.hidden ? null : box.textContent,
        };
      });

      // Fix the name, change a value, save with Enter on Save
      await nameInput.fill(STYLE_NAME + ' saved');
      await card.locator(`#typost-ps-edit-line-height-${styleId}`).fill('1.6');
      await card.locator('.typost-ps-save-edit-btn').focus();
      await h.delay(300);
      await nvda.press('Enter');
      await card.locator('form').waitFor({ state: 'detached', timeout: 60000 });
      await h.delay(1500);
      const savePhrase = await nvda.lastSpokenPhrase();
      await nvda.perform(nvda.keyboardCommands.reportCurrentFocus);
      const afterSavePhrase = await nvda.lastSpokenPhrase();
      const afterSave = await page.evaluate(() => ({
        focus: document.activeElement && String(document.activeElement.className || ''),
        spoken: (document.getElementById('a11y-speak-polite') || {}).textContent || '',
        invalidLeft: document.querySelectorAll('.typost-ps-style-card [aria-invalid]').length,
      }));

      const log = await h.saveSpeechLog(nvda, 'paragraph-styles-admin-edit', {
        focusTitles, editPhrase, openPhrase, namePhrase, openFocus, firstStops,
        errorPhrase, errorFocusPhrase, errorState, savePhrase, afterSavePhrase, afterSave,
      });

      // Product assertions
      expect(openFocus && openFocus.id, 'Edit should move focus to the name field').toBe(`typost-ps-edit-name-${styleId}`);
      expect(errorState.focused, 'the error should focus the name field').toBe(true);
      expect(errorState.invalid, 'the name field should be marked invalid').toBe('true');
      expect(errorState.describedby, 'the message should describe the field').toContain(errorState.boxId);
      expect(errorState.message).toMatch(/name/i);
      expect(afterSave.focus, 'focus should return to the Edit button').toContain('typost-ps-edit-btn');
      expect(afterSave.spoken, 'the save should be announced').toMatch(/saved/i);
      expect(afterSave.invalidLeft).toBe(0);

      // Screen-reader assertions
      expect(editPhrase, 'Edit should be read as a button').toMatch(/edit.*button|button.*edit/i);
      expect(namePhrase, 'the name field should carry its label').toMatch(/name/i);
      expect(log.length).toBeGreaterThan(0);
    } finally {
      await page.evaluate(async (id) => {
        try {
          await window.wp.apiFetch({ path: '/typost/v1/paragraph-styles/' + id, method: 'DELETE' });
        } catch (e) {
          // Already gone
        }
      }, styleId);
    }
  });
});

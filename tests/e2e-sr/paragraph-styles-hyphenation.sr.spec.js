/**
 * NVDA journey — the Hyphenation fields of the Edit form (#208).
 *
 * Has NVDA read the Hyphenate checkbox, turn it on with Space, read each field
 * that appears, then submit a limit of 0 and hear where the error lands. It
 * saves nothing: the form is canceled and the scratch style is deleted.
 *
 * Capture note: Guidepup records speech only in the quiet window after its own
 * key press. A field's name and role are asserted on the phrase itself.
 */
const { nvdaTest: test } = require('@guidepup/playwright');
const { expect } = require('@playwright/test');
const h = require('./helpers');

test.use({ nvdaStartOptions: { capture: true } });

const TAB_URL = '/wp-admin/options-general.php?page=typography-stylist&tab=paragraph-styles';

const FIELDS = [
  ['hyphenateLimitWord', /shortest word to hyphenate/i],
  ['hyphenateLimitBefore', /fewest letters before a hyphen/i],
  ['hyphenateLimitAfter', /fewest letters after a hyphen/i],
  ['hyphenateCharacter', /hyphen character/i],
];

test.describe('Paragraph Styles hyphenation fields with NVDA', () => {
  test('hear the checkbox, the limits, the character and the error', async ({ page, nvda }) => {
    await page.goto(TAB_URL, { waitUntil: 'load' });
    await page.waitForFunction(() => window.wp && window.wp.apiFetch, null, { timeout: 60000 });
    const id = await page.evaluate(() => window.wp.apiFetch({
      path: '/typost/v1/paragraph-styles',
      method: 'POST',
      data: { name: 'SR Hyphenation', properties: { fontId: 0, fontSize: '24', lineHeight: 1.4 } },
    }).then((style) => String(style.id)));

    const hear = async (locator) => {
      await locator.focus();
      await h.delay(300);
      await nvda.perform(nvda.keyboardCommands.reportCurrentFocus);
      return nvda.lastSpokenPhrase();
    };

    try {
      await page.reload({ waitUntil: 'load' });
      const card = page.locator(`.typost-ps-style-card[data-style-id="${id}"]`);
      await card.waitFor({ timeout: 60000 });
      const focusTitles = await h.focusBrowser(page, nvda);

      await card.locator('.typost-ps-edit-btn').focus();
      await h.delay(300);
      await nvda.press('Enter');
      const form = card.locator('form');
      await form.waitFor({ state: 'visible', timeout: 60000 });
      await h.delay(800);
      const field = (name) => form.locator(`[data-field="${name}"]`);

      const checkboxOff = await hear(field('hyphens'));
      const hiddenWhenOff = !(await field('hyphenateLimitWord').isVisible());

      await nvda.press('Space');
      await h.delay(800);
      const togglePhrase = await nvda.lastSpokenPhrase();
      const checked = await field('hyphens').isChecked();
      const visibleWhenOn = await field('hyphenateLimitWord').isVisible();

      const fieldPhrases = {};
      for (const [name] of FIELDS) {
        fieldPhrases[name] = await hear(field(name));
      }
      const characterDescribedby = await field('hyphenateCharacter').evaluate((el) => {
        const help = el.ownerDocument.getElementById(el.getAttribute('aria-describedby'));
        return help ? help.textContent : '';
      });

      // A limit of 0, submitted with Enter on Save
      await field('hyphenateLimitWord').fill('0');
      await form.locator('.typost-ps-save-edit-btn').focus();
      await h.delay(300);
      await nvda.press('Enter');
      await h.delay(1200);
      const errorPhrase = await nvda.lastSpokenPhrase();
      await nvda.perform(nvda.keyboardCommands.reportCurrentFocus);
      const errorFocusPhrase = await nvda.lastSpokenPhrase();
      const errorState = await page.evaluate(() => {
        const a = document.activeElement;
        const box = a && a.form ? a.form.querySelector('.typost-ps-edit-error') : null;
        return {
          field: a ? a.getAttribute('data-field') : null,
          invalid: a ? a.getAttribute('aria-invalid') : null,
          describedby: a ? a.getAttribute('aria-describedby') : null,
          boxId: box ? box.id : null,
          message: box && !box.hidden ? box.textContent : null,
        };
      });

      await form.getByRole('button', { name: /cancel/i }).first().click();
      await form.waitFor({ state: 'detached', timeout: 15000 });
      const stored = await page.evaluate(async (styleId) => {
        const all = await window.wp.apiFetch({ path: '/typost/v1/paragraph-styles' });
        const style = (Array.isArray(all) ? all : all.styles).find((s) => String(s.id) === styleId);
        return style.properties.hyphens || '';
      }, id);

      const log = await h.saveSpeechLog(nvda, 'paragraph-styles-hyphenation', {
        focusTitles, checkboxOff, hiddenWhenOff, togglePhrase, checked, visibleWhenOn,
        fieldPhrases, characterDescribedby, errorPhrase, errorFocusPhrase, errorState, stored,
      });

      // Screen-reader assertions
      expect(checkboxOff, 'NVDA names the checkbox and its role').toMatch(/hyphenate.*check ?box|check ?box.*hyphenate/i);
      expect(checkboxOff, 'the help is read with the checkbox').toMatch(/page language/i);
      expect(togglePhrase, 'Space announces the new state').toMatch(/checked/i);
      for (const [name, expected] of FIELDS) {
        expect(fieldPhrases[name], `NVDA should name the ${name} field`).toMatch(expected);
      }
      expect(fieldPhrases.hyphenateCharacter, 'the character help is read with the field').toMatch(/up to 4 characters/i);
      expect(errorFocusPhrase, 'focus lands on the named field').toMatch(/shortest word to hyphenate/i);

      // Product assertions
      expect(hiddenWhenOff, 'the limits hide while Hyphenate is off').toBe(true);
      expect(checked && visibleWhenOn, 'Space turns it on and shows the limits').toBe(true);
      expect(characterDescribedby).toMatch(/angle brackets, braces or semicolons/);
      expect(errorState.field, 'the error focuses the limit').toBe('hyphenateLimitWord');
      expect(errorState.invalid, 'the limit is marked invalid').toBe('true');
      expect(errorState.describedby, 'the message describes the field').toContain(errorState.boxId);
      expect(errorState.message).toMatch(/whole number/i);
      expect(stored, 'Cancel saves nothing').toBe('');
      expect(log.length).toBeGreaterThan(0);
    } finally {
      await page.evaluate(async (styleId) => {
        try {
          await window.wp.apiFetch({ path: '/typost/v1/paragraph-styles/' + styleId, method: 'DELETE' });
        } catch (e) {
          // Already gone
        }
      }, id);
    }
  });
});

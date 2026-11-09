/**
 * NVDA journey — the Edit form fields of #199 (indents and spacing), #215
 * (text color and outline) and #196 (GREP rules).
 *
 * The Edit form journey (paragraph-styles-admin-edit) stops at the first
 * fields. This one focuses each new field and has NVDA read it, then goes
 * through the parts that change with input: the contrast notice, the outline
 * error, and adding, moving, removing and failing a GREP rule. It saves
 * nothing: the form is canceled and both scratch styles are deleted.
 *
 * Capture note: Guidepup records speech only in the quiet window after its
 * own key press, so a live-region message counts only when an NVDA key press
 * caused it. Those phrases are quoted in the log and the assertions are on
 * the DOM; a field's name and role are asserted on the phrase itself.
 */
const { nvdaTest: test } = require('@guidepup/playwright');
const { expect } = require('@playwright/test');
const h = require('./helpers');

test.use({ nvdaStartOptions: { capture: true } });

const TAB_URL = '/wp-admin/options-general.php?page=typography-stylist&tab=paragraph-styles';

// data-field => what NVDA must say for it
const FIELDS = [
  ['indentStart', /left indent/i],
  ['indentStartUnit', /left indent unit/i],
  ['indentEnd', /right indent/i],
  ['firstLineIndent', /first line indent/i],
  ['indentAfterSame', /only after a paragraph with the same style/i],
  ['spaceBefore', /space before/i],
  ['spaceAfter', /space after/i],
  ['textColor', /text color/i],
  ['textStrokeWidth', /outline width/i],
  ['textStrokeColor', /outline color/i],
  ['textStrokePosition', /outline position/i],
];

test.describe('Paragraph Styles new Edit form fields with NVDA', () => {
  test('hear each field, the contrast notice, the outline error and the GREP rule list', async ({ page, nvda }) => {
    await page.goto(TAB_URL, { waitUntil: 'load' });
    await page.waitForFunction(() => window.wp && window.wp.apiFetch, null, { timeout: 60000 });
    const ids = await page.evaluate(async () => {
      const make = (name) => window.wp.apiFetch({
        path: '/typost/v1/paragraph-styles',
        method: 'POST',
        data: { name, properties: { fontId: 0, fontSize: '24', lineHeight: 1.4 } },
      }).then((style) => String(style.id));
      return { target: await make('SR Fields Target'), style: await make('SR Fields') };
    });

    const hear = async (locator) => {
      await locator.focus();
      await h.delay(300);
      await nvda.perform(nvda.keyboardCommands.reportCurrentFocus);
      return nvda.lastSpokenPhrase();
    };
    const focusState = () => page.evaluate(() => {
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

    try {
      await page.reload({ waitUntil: 'load' });
      const card = page.locator(`.typost-ps-style-card[data-style-id="${ids.style}"]`);
      await card.waitFor({ timeout: 60000 });
      const focusTitles = await h.focusBrowser(page, nvda);

      await card.locator('.typost-ps-edit-btn').focus();
      await h.delay(300);
      await nvda.press('Enter');
      const form = card.locator('form');
      await form.waitFor({ state: 'visible', timeout: 60000 });
      await h.delay(800);
      const field = (name) => form.locator(`[data-field="${name}"]`);

      // Each field, read by NVDA
      const fieldPhrases = {};
      for (const [name] of FIELDS) {
        fieldPhrases[name] = await hear(field(name));
      }

      // Contrast notice: the last character is an NVDA key press, so the
      // polite status message falls inside the capture window
      await field('textColor').selectOption('custom');
      await h.delay(300);
      const customPhrase = await hear(field('textColorCustom'));
      await field('textColorCustom').fill('#ddddd');
      await field('textColorCustom').focus();
      await h.delay(300);
      await nvda.press('d');
      await h.delay(1200);
      const contrastPhrase = await nvda.lastSpokenPhrase();
      if (await field('textColorCustom').inputValue() !== '#dddddd') {
        await field('textColorCustom').fill('#dddddd');
        await h.delay(300);
      }
      const contrast = await form.locator('.typost-ps-edit-contrast').evaluate((el) => ({
        role: el.getAttribute('role'),
        text: el.textContent,
      }));

      // Outline error: transparent text with no outline, submitted with Enter on Save
      await field('textColor').selectOption('transparent');
      await field('textStrokeWidth').fill('0');
      await form.locator('.typost-ps-save-edit-btn').focus();
      await h.delay(300);
      await nvda.press('Enter');
      await h.delay(1200);
      const outlineErrorPhrase = await nvda.lastSpokenPhrase();
      await nvda.perform(nvda.keyboardCommands.reportCurrentFocus);
      const outlineFocusPhrase = await nvda.lastSpokenPhrase();
      const outlineState = await focusState();
      await field('textColor').selectOption('');
      await h.delay(300);

      // GREP rules: add two
      const addRule = form.locator('.typost-ps-grep-add');
      await addRule.focus();
      await h.delay(300);
      await nvda.press('Enter');
      await form.locator('.typost-ps-grep-rule').first().waitFor({ timeout: 10000 });
      await h.delay(1000);
      const addFirstPhrase = await nvda.lastSpokenPhrase();
      await addRule.focus();
      await h.delay(300);
      await nvda.press('Enter');
      await page.waitForFunction(() => document.querySelectorAll('.typost-ps-grep-rule').length === 2);
      await h.delay(1000);
      const addSecondPhrase = await nvda.lastSpokenPhrase();
      const list = await form.locator('[data-grep-rules]').evaluate((ol) => ({
        tag: ol.tagName,
        role: ol.getAttribute('role'),
        items: [...ol.children].map((li) => ({
          tag: li.tagName,
          role: li.getAttribute('role'),
          group: li.firstElementChild.getAttribute('role'),
          label: li.firstElementChild.getAttribute('aria-label'),
        })),
      }));

      // The second rule's controls
      const second = form.locator('.typost-ps-grep-rule').nth(1);
      const patternPhrase = await hear(second.locator('[data-grep="pattern"]'));
      const stylePhrase = await hear(second.locator('[data-grep="styleId"]'));
      const movePhrase = await hear(second.locator('.typost-ps-grep-up'));
      const removePhrase = await hear(second.locator('.typost-ps-grep-remove'));

      // Move it up with Enter: the move is announced and focus stays on a move button
      await second.locator('.typost-ps-grep-up').focus();
      await h.delay(300);
      await nvda.press('Enter');
      await h.delay(1200);
      const movedPhrase = await nvda.lastSpokenPhrase();
      const movedFocus = await h.describeFocus(page);
      const movedSpoken = await page.evaluate(() => (document.getElementById('a11y-speak-polite') || {}).textContent || '');

      // Remove the second rule with Enter: the removal is announced and focus is kept in the form
      await form.locator('.typost-ps-grep-rule').nth(1).locator('.typost-ps-grep-remove').focus();
      await h.delay(300);
      await nvda.press('Enter');
      await h.delay(1200);
      const removedPhrase = await nvda.lastSpokenPhrase();
      const removedFocus = await h.describeFocus(page);
      const removedSpoken = await page.evaluate(() => (document.getElementById('a11y-speak-polite') || {}).textContent || '');
      const rulesLeft = await form.locator('.typost-ps-grep-rule').count();

      // A bad custom pattern: the error goes to the field
      const rule = form.locator('.typost-ps-grep-rule').first();
      await rule.locator('[data-grep="pattern"]').selectOption('custom');
      await rule.locator('[data-grep="styleId"]').selectOption(ids.target);
      await h.delay(300);
      const regexPhrase = await hear(rule.locator('[data-grep="regex"]'));
      await rule.locator('[data-grep="regex"]').fill('(');
      await form.locator('.typost-ps-save-edit-btn').focus();
      await h.delay(300);
      await nvda.press('Enter');
      await h.delay(1200);
      const regexErrorPhrase = await nvda.lastSpokenPhrase();
      await nvda.perform(nvda.keyboardCommands.reportCurrentFocus);
      const regexFocusPhrase = await nvda.lastSpokenPhrase();
      const regexState = await focusState();

      // Nothing was saved
      await form.getByRole('button', { name: /cancel/i }).first().click();
      await form.waitFor({ state: 'detached', timeout: 15000 });
      const stored = await page.evaluate(async (id) => {
        const all = await window.wp.apiFetch({ path: '/typost/v1/paragraph-styles' });
        const style = (Array.isArray(all) ? all : all.styles).find((s) => String(s.id) === id);
        return { rules: (style.grepRules || []).length, textColor: style.properties.textColor || '' };
      }, ids.style);

      const log = await h.saveSpeechLog(nvda, 'paragraph-styles-admin-fields', {
        focusTitles, fieldPhrases, customPhrase, contrastPhrase, contrast,
        outlineErrorPhrase, outlineFocusPhrase, outlineState,
        addFirstPhrase, addSecondPhrase, list, patternPhrase, stylePhrase, movePhrase, removePhrase,
        movedPhrase, movedFocus, movedSpoken, removedPhrase, removedFocus, removedSpoken, rulesLeft,
        regexPhrase, regexErrorPhrase, regexFocusPhrase, regexState, stored,
      });

      // Screen-reader assertions: each field carries its name
      for (const [name, expected] of FIELDS) {
        expect(fieldPhrases[name], `NVDA should name the ${name} field`).toMatch(expected);
      }
      expect(customPhrase, 'the custom color field carries its name').toMatch(/custom text color/i);
      expect(patternPhrase, 'a rule names its pattern select').toMatch(/pattern/i);
      expect(stylePhrase, 'a rule names its style select').toMatch(/apply style/i);
      expect(movePhrase, 'the move button names its rule').toMatch(/move rule 2 up/i);
      expect(removePhrase, 'the remove button names its rule').toMatch(/remove rule 2/i);
      expect(regexPhrase, 'the custom pattern field carries its name').toMatch(/regular expression/i);

      // Product assertions
      expect(contrast.role, 'the contrast notice is a status region').toBe('status');
      expect(contrast.text, 'a low contrast color shows the notice').toMatch(/low contrast/i);

      expect(outlineState.field, 'the outline error focuses the text color').toBe('textColor');
      expect(outlineState.invalid, 'the text color is marked invalid').toBe('true');
      expect(outlineState.describedby, 'the message describes the field').toContain(outlineState.boxId);
      expect(outlineState.message).toMatch(/outline/i);

      expect(list.tag, 'the rules are an ordered list').toBe('OL');
      expect(list.role, 'the list keeps its role').toBeNull();
      expect(list.items.map((i) => i.tag)).toEqual(['LI', 'LI']);
      expect(list.items.map((i) => i.role)).toEqual([null, null]);
      expect(list.items.map((i) => [i.group, i.label])).toEqual([['group', 'GREP rule 1'], ['group', 'GREP rule 2']]);

      expect(movedSpoken, 'the move is announced').toMatch(/moved to position 1/i);
      expect(String(movedFocus && movedFocus.className), 'focus stays on a move button').toMatch(/typost-ps-grep-(up|down)/);
      expect(removedSpoken, 'the removal is announced').toMatch(/removed/i);
      expect(removedFocus && removedFocus.tag, 'focus is not lost').not.toBe('BODY');
      expect(rulesLeft).toBe(1);

      expect(regexState.field, 'the pattern error focuses the field').toBe('grep-0-regex');
      expect(regexState.invalid, 'the pattern field is marked invalid').toBe('true');
      expect(regexState.message).toMatch(/not valid/i);

      expect(stored, 'Cancel saves nothing').toEqual({ rules: 0, textColor: '' });
      expect(log.length).toBeGreaterThan(0);
    } finally {
      await page.evaluate(async ({ style, target }) => {
        for (const id of [style, target]) {
          try {
            await window.wp.apiFetch({ path: '/typost/v1/paragraph-styles/' + id, method: 'DELETE' });
          } catch (e) {
            // Already gone
          }
        }
      }, ids);
    }
  });
});

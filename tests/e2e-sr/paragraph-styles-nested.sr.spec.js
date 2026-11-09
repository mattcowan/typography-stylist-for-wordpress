/**
 * NVDA journey — the Nested styles list of the Edit form (#195).
 *
 * Adds two rules, has NVDA read each control and the fields that change with
 * the unit, moves and removes a rule, then submits a rule with no style and
 * hears where the error lands. It saves nothing: the form is canceled and the
 * scratch styles are deleted.
 *
 * Capture note: Guidepup records speech only in the quiet window after its own
 * key press. A live-region message is read from the DOM as well, and the
 * assertions on it are on the DOM.
 */
const { nvdaTest: test } = require('@guidepup/playwright');
const { expect } = require('@playwright/test');
const h = require('./helpers');

test.use({ nvdaStartOptions: { capture: true } });

const TAB_URL = '/wp-admin/options-general.php?page=typography-stylist&tab=paragraph-styles';

test.describe('Paragraph Styles nested rules with NVDA', () => {
  test('add, hear, move, remove and fail a nested rule', async ({ page, nvda }) => {
    await page.goto(TAB_URL, { waitUntil: 'load' });
    await page.waitForFunction(() => window.wp && window.wp.apiFetch, null, { timeout: 60000 });
    const ids = await page.evaluate(async () => {
      const make = (name) => window.wp.apiFetch({
        path: '/typost/v1/paragraph-styles',
        method: 'POST',
        data: { name, properties: { fontId: 0, fontSize: '24', lineHeight: 1.4 } },
      }).then((style) => String(style.id));
      return { target: await make('SR Nested Target'), style: await make('SR Nested') };
    });

    const hear = async (locator) => {
      await locator.focus();
      await h.delay(300);
      await nvda.perform(nvda.keyboardCommands.reportCurrentFocus);
      return nvda.lastSpokenPhrase();
    };
    const spoken = () => page.evaluate(() => (document.getElementById('a11y-speak-polite') || {}).textContent || '');

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

      // Add two rules
      const add = form.locator('.typost-ps-nested-add');
      const addButtonPhrase = await hear(add);
      await nvda.press('Enter');
      await form.locator('.typost-ps-nested-rule').first().waitFor({ timeout: 10000 });
      await h.delay(1000);
      const addFirstPhrase = await nvda.lastSpokenPhrase();
      const addFirstFocus = await h.describeFocus(page);
      await add.focus();
      await h.delay(300);
      await nvda.press('Enter');
      await page.waitForFunction(() => document.querySelectorAll('.typost-ps-nested-rule').length === 2);
      await h.delay(1000);
      const addSecondPhrase = await nvda.lastSpokenPhrase();

      const list = await form.locator('[data-nested-rules]').evaluate((ol) => ({
        tag: ol.tagName,
        items: [...ol.children].map((li) => ({
          tag: li.tagName,
          group: li.firstElementChild.getAttribute('role'),
          label: li.firstElementChild.getAttribute('aria-label'),
        })),
      }));

      // Each control of the second rule
      const second = form.locator('.typost-ps-nested-rule').nth(1);
      const control = (name) => second.locator(`[data-nested="${name}"]`);
      const stylePhrase = await hear(control('styleId'));
      const endPhrase = await hear(control('end'));
      const countPhrase = await hear(control('count'));
      const unitPhrase = await hear(control('unit'));

      // The fields change with the unit
      await control('unit').selectOption('marker');
      await h.delay(300);
      const markerPhrase = await hear(control('marker'));
      await control('unit').selectOption('line');
      await h.delay(300);
      const lineState = {
        end: await control('end').isVisible(),
        count: await control('count').isVisible(),
        marker: await control('marker').isVisible(),
      };
      const unitLinePhrase = await hear(control('unit'));
      await control('unit').selectOption('words');
      await h.delay(300);

      const upPhrase = await hear(second.locator('.typost-ps-nested-up'));
      const downFirstDisabled = await form.locator('.typost-ps-nested-rule').first().locator('.typost-ps-nested-up').isDisabled();
      const removePhrase = await hear(second.locator('.typost-ps-nested-remove'));

      // Move it up with Enter: announced, and focus stays on a move button
      await second.locator('.typost-ps-nested-up').focus();
      await h.delay(300);
      await nvda.press('Enter');
      await h.delay(1200);
      const movedPhrase = await nvda.lastSpokenPhrase();
      const movedFocus = await h.describeFocus(page);
      const movedSpoken = await spoken();

      // Remove the second rule with Enter: announced, and focus stays in the form
      await form.locator('.typost-ps-nested-rule').nth(1).locator('.typost-ps-nested-remove').focus();
      await h.delay(300);
      await nvda.press('Enter');
      await h.delay(1200);
      const removedPhrase = await nvda.lastSpokenPhrase();
      const removedFocus = await h.describeFocus(page);
      const removedSpoken = await spoken();
      const rulesLeft = await form.locator('.typost-ps-nested-rule').count();

      // A rule with no style: the error goes to the select
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
      const stored = await page.evaluate(async (id) => {
        const all = await window.wp.apiFetch({ path: '/typost/v1/paragraph-styles' });
        const style = (Array.isArray(all) ? all : all.styles).find((s) => String(s.id) === id);
        return (style.nestedRules || []).length;
      }, ids.style);

      const log = await h.saveSpeechLog(nvda, 'paragraph-styles-nested', {
        focusTitles, addButtonPhrase, addFirstPhrase, addFirstFocus, addSecondPhrase, list,
        stylePhrase, endPhrase, countPhrase, unitPhrase, markerPhrase, lineState, unitLinePhrase,
        upPhrase, downFirstDisabled, removePhrase, movedPhrase, movedFocus, movedSpoken,
        removedPhrase, removedFocus, removedSpoken, rulesLeft, errorPhrase, errorFocusPhrase, errorState, stored,
      });

      // Screen-reader assertions: each control carries its name
      expect(addButtonPhrase, 'the add button carries its name').toMatch(/add nested rule/i);
      expect(stylePhrase, 'the style select is named').toMatch(/apply style/i);
      expect(endPhrase, 'the end select is named').toMatch(/ends/i);
      expect(countPhrase, 'the count field is named').toMatch(/count/i);
      expect(unitPhrase, 'the unit select is named').toMatch(/unit/i);
      expect(markerPhrase, 'the character field is named').toMatch(/character/i);
      expect(markerPhrase, 'the character help is read with the field').toMatch(/case-sensitive/i);
      expect(upPhrase, 'the move button names its rule').toMatch(/move nested rule 2 up/i);
      expect(removePhrase, 'the remove button names its rule').toMatch(/remove nested rule 2/i);
      expect(errorFocusPhrase, 'focus lands on the named select').toMatch(/apply style/i);

      // Product assertions
      expect(list.tag, 'the rules are an ordered list').toBe('OL');
      expect(list.items.map((i) => [i.tag, i.group, i.label])).toEqual([['LI', 'group', 'Nested rule 1'], ['LI', 'group', 'Nested rule 2']]);
      expect(addFirstFocus && addFirstFocus.tag, 'adding a rule keeps focus on the page').not.toBe('BODY');
      expect(lineState, 'First line hides the end, the count and the character').toEqual({ end: false, count: false, marker: false });
      expect(downFirstDisabled, 'the first rule cannot move up').toBe(true);
      expect(movedSpoken, 'the move is announced').toMatch(/moved to position 1/i);
      expect(String(movedFocus && movedFocus.className), 'focus stays on a move button').toMatch(/typost-ps-nested-(up|down)/);
      expect(removedSpoken, 'the removal is announced').toMatch(/removed/i);
      expect(removedFocus && removedFocus.tag, 'focus is not lost').not.toBe('BODY');
      expect(rulesLeft).toBe(1);
      expect(errorState.invalid, 'the select is marked invalid').toBe('true');
      expect(errorState.describedby, 'the message describes the field').toContain(errorState.boxId);
      expect(errorState.message, 'the error shows').toBeTruthy();
      expect(stored, 'Cancel saves nothing').toBe(0);
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

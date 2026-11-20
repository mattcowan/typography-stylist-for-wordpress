/**
 * NVDA journey - the searchable Paragraph Style field in the Quick Feature
 * Toggles (#453).
 *
 * In a Typography Stylist block, select a word, open "Typography Stylist
 * Features", and reach the Paragraph Style combobox. Asserts that NVDA reads
 * the field with the name "Paragraph Style" (QA finding SR-2: not "combo box,
 * - Select a style -, collapsed"), that typing part of a style name opens a
 * list and announces a result count, that Tab from the field does not stop on
 * the bare suggestions list (SR-5), and that typing, Down Arrow and Enter
 * applies the style to the selection with focus still inside the dialog.
 *
 * It only reads: it creates no style and saves nothing. It needs at least one
 * saved paragraph style, and the style's name must hold three or more
 * characters. The post it makes is deleted afterwards.
 *
 * Run it on the oldest WordPress the plugin supports (5.8, components 14.1.11)
 * and on the current release too: core changed the combobox's markup and its
 * key handling between them. 5.8 shows no placeholder, and the current release
 * highlights the first match before Down Arrow is pressed.
 */
const { nvdaTest: test } = require('@guidepup/playwright');
const { expect } = require('@playwright/test');
const h = require('./helpers');

test.use({ nvdaStartOptions: { capture: true } });

const MODAL = '.components-modal__content';
const COMBOBOX = MODAL + ' .typost-ps-panel input[role="combobox"]';

test.describe('Paragraph Style combobox with NVDA', () => {
  test.afterEach(async ({ page }) => {
    await h.deleteCurrentPost(page);
  });

  test('read the field, search by typing, leave it with Tab, pick with the keyboard', async ({ page, nvda }) => {
    await h.openNewPost(page);
    const focusTitles = await h.focusBrowser(page, nvda);
    const clientId = await h.insertBlock(page, 'typost/block', { content: 'Typography Stylist Block Test' });
    await h.selectText(page, clientId, 11, 18); // "Stylist"

    const styles = await page.evaluate(() => (window.typostData.paragraphStyles || []).map((s) => ({ id: s.id, name: String(s.name || '') })));
    test.skip(styles.length < 1, 'Needs at least one saved paragraph style on the site');
    const target = styles.find((s) => s.name.trim().length >= 3);
    test.skip(!target, 'Needs a style name of three or more characters');
    // The middle of the name: a native select cannot find this, a combobox can
    const name = target.name.trim();
    const query = name.length > 6 ? name.slice(1, 5) : name.slice(0, 3);

    const openPhrase = await h.activateToolbarButton(page, nvda, 'Typography Stylist Features');
    await page.waitForSelector(COMBOBOX, { timeout: 30000 });
    await page.waitForTimeout(1200);

    // The field, read by NVDA. Playwright moves focus (a key sent with
    // page.keyboard would never be logged), then NVDA reports the focus.
    await page.locator(COMBOBOX).focus();
    await h.delay(500);
    await nvda.perform(nvda.keyboardCommands.reportCurrentFocus);
    await h.delay(600);
    const fieldPhrase = await nvda.lastSpokenPhrase();
    const focusAtField = await h.describeFocus(page);

    // Typing must reach the field, not NVDA's browse cursor.
    const modePhrases = await h.ensureFocusMode(nvda, async () => {
      await nvda.type('x');
      await h.delay(300);
      const typed = (await page.locator(COMBOBOX).inputValue()) === 'x';
      await page.locator(COMBOBOX).fill('');
      return typed;
    });
    await page.locator(COMBOBOX).fill('');
    await page.locator(COMBOBOX).focus();

    // Search by typing part of the name.
    await nvda.type(query);
    await h.delay(1200);
    const typedPhrase = await nvda.lastSpokenPhrase();
    const matches = await page.evaluate(() => Array.from(document.querySelectorAll('.typost-ps-style-picker ul[role="listbox"] li')).map((n) => n.textContent));

    // SR-5: Tab leaves the field. The suggestions list is not a stop.
    const listTabindex = await page.evaluate(() => {
      const ul = document.querySelector('.typost-ps-style-picker ul[role="listbox"]');
      return ul ? ul.getAttribute('tabindex') : null;
    });
    await nvda.press('Tab');
    await h.delay(600);
    const afterTab = await h.describeFocus(page);
    const tabPhrase = await nvda.lastSpokenPhrase();

    // Back into the field, search again, pick with Down Arrow and Enter.
    await page.locator(COMBOBOX).focus();
    await page.locator(COMBOBOX).fill('');
    await nvda.type(query);
    await h.delay(900);
    await nvda.press('ArrowDown');
    await h.delay(700);
    const downPhrase = await nvda.lastSpokenPhrase();
    // With two or more matches, current core highlights the first one before
    // ArrowDown, so ArrowDown lands on the second. Read the highlighted row
    // instead of assuming which style it is.
    const highlighted = await page.evaluate(() => {
      const row = document.querySelector('.typost-ps-style-picker [role="option"][aria-selected="true"]');
      return row ? row.textContent : null;
    });
    await nvda.press('Enter');
    await page.waitForTimeout(1500);
    const enterPhrase = await nvda.lastSpokenPhrase();

    const after = await page.evaluate(() => {
      const a = document.activeElement;
      return {
        focusInDialog: !!(a && a.closest('.components-modal__content')),
        focusTag: a ? a.tagName : null,
        badge: (document.querySelector('.typost-ps-badge-name') || {}).textContent || null,
      };
    });
    const html = await h.blockHtml(page, clientId);

    const log = await h.saveSpeechLog(nvda, 'paragraph-styles-combobox', {
      focusTitles, openPhrase, fieldPhrase, focusAtField, modePhrases, query, typedPhrase, matches,
      listTabindex, afterTab, tabPhrase, downPhrase, highlighted, enterPhrase, after, html, styles,
    });

    // Product assertions.
    expect(focusAtField && focusAtField.role, 'the field should be a combobox').toBe('combobox');
    expect(matches.length, `typing "${query}" should list at least one style`).toBeGreaterThan(0);
    expect(matches.join(' ').toLowerCase(), 'the list should hold the style that was searched').toContain(name.toLowerCase());
    // SR-5
    if (listTabindex !== null) {
      expect(listTabindex, 'the suggestions list should not be a Tab stop (SR-5)').toBe('-1');
    }
    expect(afterTab && afterTab.role, 'Tab should not stop on the suggestions list (SR-5)').not.toBe('listbox');
    expect(afterTab && afterTab.tag, 'Tab should not stop on the suggestions list (SR-5)').not.toBe('UL');
    expect(html, 'Enter should apply the style to the selection').toMatch(/data-style-id="\d+"/);
    expect(after.focusInDialog, 'focus should stay inside the dialog after the pick').toBe(true);
    expect(after.focusTag, 'focus should not fall to the page body').not.toBe('BODY');

    // Screen-reader assertions. The wording differs between WordPress
    // releases, so assert the facts and read the log for the exact phrases.
    expect(fieldPhrase, 'NVDA should read the accessible name (SR-2)').toMatch(/Paragraph Style/i);
    expect(fieldPhrase, 'NVDA should not read the old select wording (SR-2)').not.toMatch(/Select a style, collapsed/i);
    expect(log.some((phrase) => /result/i.test(phrase)), 'NVDA should announce a result count (core live region)').toBe(true);
    expect(highlighted, 'Down Arrow should leave one row highlighted').not.toBeNull();
    const highlightedName = highlighted.split(' — ')[0].trim();
    expect(downPhrase, 'Down Arrow should announce the highlighted style').toMatch(new RegExp(highlightedName.slice(0, 3).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  });
});

/**
 * NVDA journey 2 — Paragraph Styles browser (toolbar button).
 *
 * In a Typography Stylist block, select a word, open the "Paragraph Styles"
 * toolbar button with Enter (through NVDA), arrow through the style listbox,
 * jump with first-letter type-ahead, apply the cursor row with Enter. Asserts
 * that the browser opens with focus on the listbox (the cursor on a row as
 * its active descendant), that options are announced with their name, that
 * the modal closes on apply, that the style wrapped the selection, and that
 * focus returns to the toolbar button. Requires the "Paragraph Styles
 * toolbar button" option to be on and at least two saved styles.
 */
const { nvdaTest: test } = require('@guidepup/playwright');
const { expect } = require('@playwright/test');
const h = require('./helpers');

test.use({ nvdaStartOptions: { capture: true } });

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test.describe('Paragraph Styles browser with NVDA', () => {
  test.afterEach(async ({ page }) => {
    await h.deleteCurrentPost(page);
  });

  test('arrow to a style row, type-ahead, and apply it to the selection', async ({ page, nvda }) => {
    await h.openNewPost(page);
    // Bring Firefox to the front for NVDA before touching the editor.
    const focusTitles = await h.focusBrowser(page, nvda);
    const clientId = await h.insertBlock(page, 'typost/block', { content: 'Typography Stylist Block Test' });
    await h.selectText(page, clientId, 11, 18); // "Stylist"

    const styles = await page.evaluate(() => (window.typostData.paragraphStyles || []).map((s) => s.name));
    test.skip(styles.length < 2, 'Needs at least two saved paragraph styles on the site');

    const openPhrase = await h.activateToolbarButton(page, nvda, 'Paragraph Styles');
    await page.waitForSelector('.typost-ps-browser-row', { timeout: 30000 });
    await page.waitForTimeout(1200);
    const focusAtOpen = await h.describeFocus(page);

    // The listbox cursor: the row named by aria-activedescendant on the
    // focused listbox, in DOM order across groups.
    const describeCursor = () => page.evaluate(() => {
      const list = document.activeElement;
      if (!list || list.getAttribute('role') !== 'listbox') return null;
      const id = list.getAttribute('aria-activedescendant');
      const row = id ? document.getElementById(id) : null;
      if (!row) return null;
      const rows = Array.from(document.querySelectorAll('.typost-ps-browser-row'));
      return {
        id,
        index: rows.indexOf(row),
        name: row.querySelector('.typost-ps-browser-name').textContent,
        selected: row.getAttribute('aria-selected'),
        isCursor: row.classList.contains('is-cursor'),
      };
    });
    const cursorAtOpen = await describeCursor();
    const rowNames = await page.evaluate(() => Array.from(document.querySelectorAll('.typost-ps-browser-row .typost-ps-browser-name')).map((n) => n.textContent));

    // Arrows must reach the listbox, not NVDA's browse-mode cursor. The probe
    // presses ArrowDown and reports whether the cursor row changed.
    const modePhrases = await h.ensureFocusMode(nvda, async () => {
      await nvda.press('ArrowDown');
      await h.delay(450);
      const moved = await describeCursor();
      return Boolean(moved && cursorAtOpen && moved.id !== cursorAtOpen.id);
    });

    // Home, then one step down and one step up, recording every phrase.
    await nvda.press('Home');
    await h.delay(600);
    const homeStep = { phrase: await nvda.lastSpokenPhrase(), cursor: await describeCursor() };
    await nvda.press('ArrowDown');
    await h.delay(600);
    const downStep = { phrase: await nvda.lastSpokenPhrase(), cursor: await describeCursor() };
    await nvda.press('ArrowUp');
    await h.delay(600);
    const upStep = { phrase: await nvda.lastSpokenPhrase(), cursor: await describeCursor() };

    // Type-ahead: the first letter of the second row's name, pressed through
    // NVDA from the first row. The search starts after the cursor, so the
    // second row is the first candidate.
    const secondName = rowNames[1] || '';
    const letterMatch = secondName.match(/[a-z0-9]/i);
    test.skip(!letterMatch, 'The second style name has no letter or digit to type');
    const letter = letterMatch[0].toLowerCase();
    await nvda.press(letter);
    await h.delay(700);
    const typeAhead = { letter, phrase: await nvda.lastSpokenPhrase(), cursor: await describeCursor() };
    // Let the 500 ms type-ahead buffer reset before the next key.
    await h.delay(600);

    await nvda.press('Enter');
    await page.waitForTimeout(1200);
    const applyPhrase = await nvda.lastSpokenPhrase();

    const after = await page.evaluate((id) => {
      const b = wp.data.select('core/block-editor').getBlock(id);
      const active = document.activeElement;
      return {
        content: b.attributes.content,
        modalOpen: !!document.querySelector('.typost-ps-browser-modal'),
        focusLabel: active && (active.getAttribute('aria-label') || active.textContent.trim().slice(0, 40)),
      };
    }, clientId);

    const log = await h.saveSpeechLog(nvda, 'paragraph-styles-browser', { focusTitles, openPhrase, focusAtOpen, cursorAtOpen, rowNames, modePhrases, homeStep, downStep, upStep, typeAhead, applyPhrase, after, styles });

    // Product assertions.
    // SR-6: the browser opens with focus on the style listbox, cursor on a row
    // (the applied one, else the first), not on the frame — from there Tab
    // reached Modal's silent scroll wrapper and Close before any style.
    expect(focusAtOpen && focusAtOpen.role, 'the browser should open with focus on the listbox (SR-6)').toBe('listbox');
    expect(focusAtOpen.className).toContain('typost-ps-browser-list');
    expect(cursorAtOpen, 'the listbox should name a cursor row through aria-activedescendant').not.toBeNull();
    expect(cursorAtOpen.isCursor, 'the cursor row should carry the is-cursor class').toBe(true);
    // The selection carries no style yet, so no row is selected.
    expect(cursorAtOpen.selected).toBe('false');
    expect(homeStep.cursor && homeStep.cursor.index, 'Home should put the cursor on the first row').toBe(0);
    expect(downStep.cursor && downStep.cursor.index, 'ArrowDown should move the cursor to the second row').toBe(1);
    expect(upStep.cursor && upStep.cursor.index, 'ArrowUp should move the cursor back to the first row').toBe(0);
    expect(typeAhead.cursor && typeAhead.cursor.index, `typing "${letter}" should move the cursor to the second row`).toBe(1);
    expect(typeAhead.cursor.name.toLowerCase().startsWith(letter)).toBe(true);
    expect(after.modalOpen).toBe(false);
    expect(after.content).toMatch(/<span class="typost-styled" data-style-id="\d+">Stylist<\/span>/);
    expect(after.focusLabel).toBe('Paragraph Styles');

    // Screen-reader assertions. NVDA announces an option as its name plus
    // its state and position ("<name>, <detail>, not selected, 2 of 6" or
    // similar); the wording varies, so assert the name and that something
    // was spoken.
    expect(openPhrase, 'opening should announce the dialog').toMatch(/Paragraph Styles/i);
    expect(downStep.phrase, 'ArrowDown should announce the new cursor row').not.toBe('');
    expect(downStep.phrase, 'the announced option should carry the row name').toMatch(new RegExp(escapeRegExp(downStep.cursor.name), 'i'));
    expect(typeAhead.phrase, 'type-ahead should announce the row it landed on').toMatch(new RegExp(escapeRegExp(typeAhead.cursor.name), 'i'));
  });
});

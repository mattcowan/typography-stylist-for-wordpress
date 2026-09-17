/**
 * Shared helpers for the NVDA journeys.
 *
 * How Guidepup captures speech (read from @guidepup/guidepup NVDAClient):
 * a phrase is recorded ONLY around a Guidepup command (`nvda.press`,
 * `nvda.perform`, `nvda.click`, ...). Before each command it cancels current
 * speech, sends the keys, then collects what NVDA says until speech goes
 * quiet. Speech caused by a Playwright click or `page.keyboard` is never
 * logged. So the rules are:
 *  - Build editor state through wp.data (insertBlock, a verified DOM Range)
 *    with Playwright — nothing to hear there.
 *  - Every step whose announcement matters goes through `nvda.*`: focus the
 *    control with Playwright, then activate/navigate with `nvda.press`.
 *  - Start NVDA with `capture: true` (see the spec files) so the whole
 *    announcement is kept, not just its first chunk.
 */
const fs = require('fs');
const path = require('path');
const { WindowsKeyCodes, WindowsModifiers } = require('@guidepup/guidepup');

// Not under test-results: Playwright wipes that folder at the start of every run.
const LOG_DIR = path.resolve(__dirname, 'logs');

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Open a fresh post in the block editor, dismiss the welcome guide, and
 * install the window.__qa helpers used by every journey.
 */
async function openNewPost(page) {
  await page.goto('/wp-admin/post-new.php', { waitUntil: 'load' });
  await page.waitForSelector('iframe[name="editor-canvas"]', { timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    try {
      const prefs = wp.data.select('core/preferences');
      if (prefs.get('core/edit-post', 'welcomeGuide')) wp.data.dispatch('core/preferences').set('core/edit-post', 'welcomeGuide', false);
      if (prefs.get('core', 'welcomeGuide')) wp.data.dispatch('core/preferences').set('core', 'welcomeGuide', false);
    } catch (e) { /* preferences store shape differs by WP version */ }
  });
  await page.addScriptTag({ path: path.join(__dirname, 'qa-helpers.js') });
}

/**
 * Bring the Firefox window to the front so NVDA's keystrokes land in it.
 *
 * Guidepup's own navigateToWebContent() does this too, but it also clicks
 * the page body (which has hung in headed Firefox) and presses Ctrl+Home.
 * This version only checks the window title through NVDA and Alt+Esc-cycles
 * applications until the browser reports the editor title.
 */
async function focusBrowser(page, nvda) {
  await page.bringToFront();
  await delay(300);
  const wanted = /Add Post|Edit Post|Word ?Press/i;
  const seen = [];
  let focused = false;
  for (let i = 0; i < 8; i++) {
    await nvda.perform(nvda.keyboardCommands.reportTitle);
    const title = await nvda.lastSpokenPhrase();
    seen.push(title);
    if (wanted.test(title)) {
      focused = true;
      break;
    }
    await nvda.perform({ keyCode: [WindowsKeyCodes.Escape], modifiers: [WindowsModifiers.Alt] }, { capture: false });
    await delay(500);
  }
  if (!focused) {
    // Never carry on: every later keystroke would land in whatever
    // application is in the foreground instead of the browser.
    throw new Error(`Could not bring Firefox to the front for NVDA. Titles seen: ${JSON.stringify(seen)}`);
  }
  await nvda.clearSpokenPhraseLog();
  return seen;
}

/** Insert a block and return its clientId. */
async function insertBlock(page, name, attrs) {
  return page.evaluate(async ({ name, attrs }) => window.__qa.insert(name, attrs), { name, attrs });
}

/**
 * Select a text range inside a block with a real DOM Range and confirm the
 * block-editor store saw it. Throws when the store disagrees, because every
 * downstream assertion would otherwise test the wrong text.
 */
async function selectText(page, clientId, start, end) {
  const result = await page.evaluate(
    async ({ clientId, start, end }) => window.__qa.selectTextVerified(clientId, start, end),
    { clientId, start, end }
  );
  if (!result.ok) {
    throw new Error(`Selection ${start}-${end} did not reach the store: ${JSON.stringify(result.store)}`);
  }
  return result;
}

/** Serialized block HTML (what save() would write). */
async function blockHtml(page, clientId) {
  return page.evaluate((id) => window.__qa.html(id), clientId);
}

/**
 * Focus a block-toolbar button (Playwright) and activate it with Enter sent
 * through NVDA, so whatever opens is announced and captured. Returns the
 * phrase NVDA spoke for the activation.
 */
async function activateToolbarButton(page, nvda, label) {
  const button = page.locator(`.block-editor-block-toolbar button[aria-label="${label}"]`);
  await button.waitFor({ timeout: 15000 });
  await button.focus();
  await delay(300);
  await nvda.press('Enter');
  await delay(300);
  return nvda.lastSpokenPhrase();
}

/**
 * Make sure NVDA is in focus mode so arrow keys and Enter reach the widget
 * under test instead of moving NVDA's browse cursor.
 *
 * NVDA+Space toggles the mode and normally announces "focus mode" or "browse
 * mode" (unless the profile plays a sound instead, in which case the phrase
 * is empty). Strategy: toggle once; if NVDA says "browse mode" toggle again;
 * if it says nothing, `probe()` (a test-supplied check that the app reacted
 * to a key) decides whether to toggle once more. Returns the phrases heard.
 */
async function ensureFocusMode(nvda, probe) {
  const heard = [];
  await nvda.perform(nvda.keyboardCommands.toggleBetweenBrowseAndFocusMode);
  await delay(300);
  heard.push(await nvda.lastSpokenPhrase());
  if (/browse mode/i.test(heard[0])) {
    await nvda.perform(nvda.keyboardCommands.toggleBetweenBrowseAndFocusMode);
    await delay(300);
    heard.push(await nvda.lastSpokenPhrase());
  } else if (!/focus mode/i.test(heard[0]) && probe) {
    const reacted = await probe();
    if (!reacted) {
      await nvda.perform(nvda.keyboardCommands.toggleBetweenBrowseAndFocusMode);
      await delay(300);
      heard.push(await nvda.lastSpokenPhrase());
    }
  }
  return heard;
}

/**
 * Write the spoken-phrase log to tests/e2e-sr/logs/<name>.json and return
 * it. The logs are the real deliverable of these journeys: they show what a
 * screen-reader user actually hears, which is what the QA report quotes.
 */
async function saveSpeechLog(nvda, name, extra) {
  await delay(500);
  const log = await nvda.spokenPhraseLog();
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(LOG_DIR, `${name}.json`),
    JSON.stringify({ name, recordedAt: new Date().toISOString(), phrases: log, ...(extra || {}) }, null, 2)
  );
  return log;
}

/** Describe document.activeElement (tag, className, id, aria-label, text). */
async function describeFocus(page) {
  return page.evaluate(() => {
    const a = document.activeElement;
    if (!a) return null;
    const labelEl = a.id ? document.querySelector('label[for="' + a.id + '"]') : null;
    return {
      tag: a.tagName,
      type: a.type || null,
      role: a.getAttribute('role'),
      id: a.id || null,
      className: String(a.className || ''),
      ariaLabel: a.getAttribute('aria-label'),
      labelText: labelEl ? labelEl.textContent.trim() : null,
      text: (a.textContent || '').trim().slice(0, 60),
    };
  });
}

/** Describe the focused element inside the editor canvas iframe, if any. */
async function describeCanvasFocus(page) {
  return page.evaluate(() => {
    const f = document.querySelector('iframe[name="editor-canvas"]');
    const a = f && f.contentDocument && f.contentDocument.activeElement;
    if (!a || a.tagName === 'BODY') return null;
    return { tag: a.tagName, className: String(a.className || '').slice(0, 80), contentEditable: a.getAttribute('contenteditable'), block: a.closest('[data-block]') ? a.closest('[data-block]').getAttribute('data-type') : null };
  });
}

/**
 * Press Tab through NVDA until predicate(activeElementInfo) is true or
 * max presses were sent. Returns every stop with the phrase NVDA spoke.
 */
async function tabUntil(page, nvda, predicate, max) {
  const stops = [];
  for (let i = 0; i < max; i++) {
    await nvda.press('Tab');
    await delay(450);
    const el = await describeFocus(page);
    stops.push({ phrase: await nvda.lastSpokenPhrase(), el });
    if (el && predicate(el)) break;
  }
  return stops;
}

/**
 * Close the open modal with Escape through NVDA. NVDA consumes the first
 * Escape when it uses it to leave focus mode, so a screen-reader user may need
 * two; openSelector tells us when the modal is really gone. Returns the
 * phrases heard and how many presses it took.
 */
async function closeModalWithEscape(page, nvda, openSelector) {
  const phrases = [];
  let closed = false;
  for (let i = 0; i < 2 && !closed; i++) {
    await nvda.press('Escape');
    await delay(700);
    phrases.push(await nvda.lastSpokenPhrase());
    closed = (await page.locator(openSelector).count()) === 0;
  }
  // Diagnostic fallback: a protocol-level Escape bypasses NVDA entirely. If
  // this one closes the modal, NVDA swallowed the real keystrokes; if it does
  // not, the modal itself ignores Escape in this focus state.
  let closedByProtocolKey = null;
  let focusBefore = null;
  if (!closed) {
    focusBefore = await describeFocus(page);
    await page.keyboard.press('Escape');
    await delay(700);
    closedByProtocolKey = (await page.locator(openSelector).count()) === 0;
  }
  return { closed, phrases, escapesNeeded: phrases.length, closedByProtocolKey, focusBefore };
}

/** True when any phrase in the log matches the pattern. */
function spoke(log, pattern) {
  return log.some((phrase) => pattern.test(phrase));
}

/** Delete the scratch draft the editor auto-created. */
async function deleteCurrentPost(page) {
  await page.evaluate(async () => {
    const id = wp.data.select('core/editor').getCurrentPostId();
    if (!id) return;
    try { await wp.apiFetch({ path: `/wp/v2/posts/${id}?force=true`, method: 'DELETE' }); } catch (e) { /* draft may not exist yet */ }
  }).catch(() => {});
}

module.exports = {
  delay,
  openNewPost,
  focusBrowser,
  insertBlock,
  selectText,
  blockHtml,
  activateToolbarButton,
  ensureFocusMode,
  describeFocus,
  describeCanvasFocus,
  closeModalWithEscape,
  tabUntil,
  saveSpeechLog,
  spoke,
  deleteCurrentPost,
};

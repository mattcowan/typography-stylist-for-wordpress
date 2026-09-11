# Screen-reader tests (NVDA)

These tests drive the block editor with a real NVDA screen reader and record what it says. They use [Guidepup](https://www.guidepup.dev/) with `@guidepup/playwright`.

## What they do

Each file is one journey:

- `glyphs-panel.sr.spec.js` — open the Glyphs panel from the block toolbar, Tab to the glyph grid, arrow to an alternate, insert it with Enter, close with Escape.
- `paragraph-styles-browser.sr.spec.js` — open the Paragraph Styles browser from the block toolbar, Tab to a style row, apply it with Enter.
- `inline-modal.sr.spec.js` — open the Typography Stylist modal on a heading, Tab through the first 16 controls, toggle Standard Ligatures with Space, close with Escape.

Each run writes `tests/e2e-sr/logs/<journey>.json`. The file holds every phrase NVDA spoke and the DOM element that had focus at each Tab stop. Read these logs to see what a screen-reader user hears.

Some assertions fail on purpose. They encode known findings (see the QA report in `private/`). A failure with `(SR-n)` in its message is a product finding, not a harness problem.

## Set up (once per machine, Windows only)

```bash
npm install
npx @guidepup/setup setup
npx @guidepup/setup install nvda
npx playwright install firefox
cp .env.example .env
```

Put the site URL and a login with `edit_posts` in `.env` (`WP_BASE_URL`, `WP_USERNAME`, `WP_PASSWORD`). The Paragraph Styles journey needs the "Paragraph Styles toolbar button" option on and at least two saved styles.

Guidepup installs a portable NVDA in `%LOCALAPPDATA%\guidepup\nvda`. It does not change an existing NVDA install. The automated NVDA is silent; its speech goes to a log, not to the speakers.

## Run

```bash
npm run test:sr
```

The run opens a headed Firefox window and takes about six minutes. Do not use the keyboard or mouse while it runs. Guidepup sends keystrokes to the window in the foreground, so a click into another app sends the keys there and the test stalls. `npm test` does not include these tests.

## How the harness works

- The editor state (blocks, text selection) is built through `wp.data` with Playwright. Nothing to hear there.
- Guidepup records speech only around its own commands. Every step whose announcement matters focuses the control with Playwright and then sends the key with `nvda.press()`. Keys sent with `page.keyboard` bypass NVDA and are never logged.
- NVDA starts with `capture: true` so the full announcement is kept.
- `helpers.js` holds the shared steps: `focusBrowser`, `activateToolbarButton`, `tabUntil`, `ensureFocusMode`, `closeModalWithEscape`, `saveSpeechLog`.
- `qa-helpers.js` is injected into the page. It inserts blocks and makes a real DOM selection that is verified against the block-editor store.

## Known harness limits

- One arrow press is sometimes recorded as an empty phrase when NVDA speaks after Guidepup's one-second window. The same cell is announced correctly at the next stop.
- NVDA's mode toggle (NVDA+Space) plays a sound in this profile and says nothing. `ensureFocusMode` probes the widget instead of trusting the announcement.
- In NVDA focus mode the first Escape can be consumed by NVDA. `closeModalWithEscape` sends up to two and records how many it took.

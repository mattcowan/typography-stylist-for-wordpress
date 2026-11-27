# E2E Testing with Playwright

## Overview

This directory contains end-to-end (E2E) tests for the Typography Stylist plugin using Playwright. These tests verify that inline typography features work correctly in the WordPress block editor and prevent regression of critical functionality.

## Setup

### 1. Install Dependencies

```bash
npm install
```

This installs Playwright and all required dependencies (already listed in `devDependencies`).

### 2. Install Playwright Browsers

```bash
npx playwright install chromium firefox
```

This downloads the Chromium and Firefox browser binaries required for running tests. The `firefox-focus` project runs only the tests tagged `@firefox`, which check keyboard focus in Firefox.

### 3. Configure Credentials

Copy the example environment file and add your WordPress credentials:

```bash
cp .env.example .env
```

Edit `.env` with your local WordPress installation details:

```env
WP_BASE_URL=http://localhost:8080
WP_USERNAME=your_username
WP_PASSWORD=your_password
WP_ADMIN_PATH=/wp-admin
```

Set `WP_BASE_URL` to the URL of your test site. The tests make their own draft posts, so the site needs no test content.

**IMPORTANT**: Never commit your `.env` file to Git. It contains sensitive credentials and is already git-ignored.

### 4. Start WordPress

Ensure your WordPress installation is running at the URL specified in `.env`:

```bash
# For WAMP (on Windows)
# Start WAMP server

# For other local dev environments
# docker-compose up -d
# or wp server
```

## Running Tests

### Run All Tests

```bash
npm run test:e2e
```

Runs all E2E tests in headless mode and generates an HTML report.

### Interactive UI Mode

```bash
npm run test:e2e:ui
```

Opens Playwright's interactive UI where you can:
- Run individual tests
- See test execution step-by-step
- Debug failing tests
- View DOM snapshots at each step

### Headed Mode (See Browser)

```bash
npm run test:e2e:headed
```

Runs tests with the browser window visible. Useful for watching tests execute and understanding what's happening.

### Debug Mode

```bash
npm run test:e2e:debug
```

Runs tests in debug mode with Playwright Inspector. Allows you to:
- Step through tests line-by-line
- Set breakpoints
- Inspect page state at any point

### View Test Report

After running tests, view the HTML report:

```bash
npm run test:e2e:report
```

This opens the Playwright HTML report in your browser showing:
- Test results (pass/fail)
- Screenshots of failures
- Videos of test execution (for failures)
- Detailed trace logs

## Test Coverage

### `typography-stylist.spec.js` — Quick Feature Toggles on selected text

The block's Quick Feature Toggles apply each control as it changes (debounced);
there is no Apply button. Each test inserts a Typography Stylist block with
"Hello Beautiful World", selects a word with the keyboard, changes a control,
and checks the block's stored content (what gets saved):

- **Persistence:** responsive font size (`data-fontsize="responsive"`, the
  three slider values, a `clamp()`), font weight, letter spacing, line height
  and font family each style only the selection and stay after the dialog
  closes. The font family test adds a font definition for Georgia through the
  REST API and deletes it afterwards, so it needs no font files.
- **Sequential application:** line height on one word, then letter spacing on
  another, leaves each word with only its own property.
- **Detection:** letter spacing, line height, font weight, and a font size
  plus an OpenType feature (`ss01`) on the same word read back into the
  controls when the word is selected again.
- **Collapsed caret:** a new letter spacing with the caret inside a styled
  word updates that span in place.
- **Partial selection:** a new letter spacing on part of a styled word splits
  the span into three.

### `paragraph-style-selection-scope.spec.js` — #303

The Paragraph Style panel in the Quick Feature Toggles works on the selected
text, not the whole block. Tests tagged `@firefox` also run in Firefox.

### `paragraph-style-update.spec.js` — #452

"Update Style…" in the block sidebar opens a confirmation that names the
style. "Cancel" sends nothing and gives focus back to the button. "Yes,
Update Style" sends one request, shows and speaks the result, and puts
focus on the style badge. A refused request (a 429 made by the test) keeps
the confirmation open, shows and speaks the error, keeps focus on the
button, and keeps the change on the block. The sidebar follows a style
applied while it is open. With the lock flag on (set in the page, not in
the site option), the panel has no button that changes a style, and Detach
puts focus on the panel heading. A core Paragraph block gives its own
weight and line height to its style and loses them; its preset size stays.
Tests tagged `@firefox` also run in Firefox.

### `saved-markup.spec.js` — #373

The editor opens each save format and feature the plugin has written and
writes it back unchanged: the v1 and v2 (px) blocks through their
deprecations, rem sizes, fit to width, First Letter Hang, case, paragraph
style classes, a block after Detach, and inline spans. The markup is in
[fixtures/saved-markup](fixtures/saved-markup/README.md), which also says
how to regenerate it. It runs in Chromium only: no test here has the
`@firefox` tag, so Firefox does not measure the fit to width fixture.

### `inline-format.spec.js` — #373

The inline format on a core Heading and a core Paragraph: a word selected
with the keyboard gets one OpenType feature and one responsive size in the
Typography Stylist Features dialog, and the stored span is compared with
the expected string. Each test runs with new sizes written in rem and in
px (the value of the "Write new font sizes in px" option is set in the
page; the site option is not changed). It runs in Chromium only.

### `editor-text-margins.spec.js` — #422

For h1, h2 and p, a Typography Stylist block and the matching core block,
both with a top and bottom margin of 0 in the Dimensions panel, between
core Paragraphs: the Typography Stylist block's text has no margin or
padding of its own in the editor, and the space above and below it is the
same as for the core block (within 1px). Works on its own draft. It runs
in Chromium only.

### `inline-extension-listeners.spec.js` — #386

The inline editor's side of the extension API on a core Paragraph: a style
picked in the style browser styles the selected text and the dialog opens
again; `typost-insert-content` inserts at the selection; the dialog opens
again when `typost_glyphs_panel_closed` fires; the
`typost_current_editor_state` filter returns the open dialog's state after
a feature is turned on; `typost-convert-to-block` converts the Paragraph;
and a toolbar button that an extension adds later shows. These tests failed
in wp-env before #386, because the inline editor registered its listeners
in its constructor (see "Running in wp-env" below). Each test works on its
own draft, and the first on its own paragraph style ("ZZ #386 …"). It runs
in Chromium only.

### `heading-level.spec.js` — #409, #410

The Typography Stylist block's "Change heading level" button: its name
carries the current tag and follows a pick, a block from the main inserter
starts with the tag picked last and stores it, a pick of Heading 1 is not
remembered, and `createBlock('typost/block')` with no `tagName` still gives
h2. Each test gets a new browser context, so nothing is remembered at the
start; the test removes the remembered tag first and puts back what it
found. It runs in Chromium only.

### `reset-panel-focus.spec.js` — #420

The block sidebar's Reset Features panel with real key presses, from the
panel toggle on: each opener focuses its confirmation's Cancel (with the
question and message as its description, without the emoji), Cancel and
Yes give focus back to the opener, the polite live region says the result,
one undo restores the block after Yes, Reset All, and a change to another
control (an attribute update and typing in HTML anchor) does not move
focus. A caret is put in the block first, for Firefox. Tagged `@firefox`,
so it also runs in the firefox-focus project. Each test works on its own
draft.

### `strip-styling.spec.js` — #411, #412

"Remove all styling" in the block toolbar on a styled block (a responsive
size, a feature span, bold, a link, a text color, padding and alignment):
the stored content and attributes match the expected values character for
character, focus stays on the button, the polite live region says "All
styling removed from the block.", and one undo brings the styled block
back. A second test turns an empty Paragraph that has a paragraph style
class and colors into a Typography Stylist block with
`switchToBlockType()`, and expects only its tag (`p`) and `fontWeight: ''`:
WordPress copies the class and the colors, and the plugin's filter removes
them. The clear confirmation option and the size unit are set in the page
only. It runs in Chromium only.

### `hook-container-unmount.spec.js` — #419

What an extension renders into a hook container is unmounted when the
container leaves the page. The Paragraph Styles panel calls the
`typost_current_editor_state` filter while the inline dialog is open (and
its "different from the style" line updates), and not after the dialog closes; after 10
opens and closes, one panel follows the store; the same after the Quick
Feature Toggles close and after the block sidebar shows another block. A
planted extension that renders into three containers with
`wp.element.render()` shows its content, stays mounted while the dialog
re-renders, and is unmounted when the dialog closes. Two tests set a
Variable Fonts axis on a block in the sidebar, then show a second block in
the same font, once after another block and once directly: the second block
shows the axis defaults. They are skipped on a site with no variable font
that has an axis other than weight (wp-env has none). The calls are counted
by a page script that wraps `typostHooks.applyFilters`. Each test works on
its own draft, and the first four on their own paragraph style ("ZZ #419
…"). It runs in Chromium only.

### `module-roots.spec.js` — #456

The bundled modules render with `wp.element.createRoot()` where WordPress
has it. A page script replaces `wp.element`, when WordPress sets it, with a
copy that records each root a module makes and whether it was unmounted,
and records the React messages about `render()` and
`unmountComponentAtNode()` with the module that caused them. Each test
opens and closes the inline dialog (once with the Glyphs panel, whose close
opens the dialog again), the Quick Feature Toggles and the block sidebar,
and counts the Paragraph Styles panel's calls to the
`typost_current_editor_state` filter, as `hook-container-unmount.spec.js`
does. The first test removes `render()` and `unmountComponentAtNode()`
before any script runs, as React 19 does: the panels and the Glyphs button
show, and every module root whose container left the page is unmounted
(with a variable font, the sidebar's axes too). Hook actions that other
extensions on the site add are left out in that test, because they can
still call `render()`. The second test expects no "ReactDOM.render is no
longer supported" message caused by a module; React logs it only with
`SCRIPT_DEBUG` on (wp-env has it on). Each test works on its own draft and
paragraph style ("ZZ #456 …"). It runs in Chromium only.

### `helpers.js`

Shared helpers (open the editor, select text with the keyboard, REST
requests as the logged-in user). Not a spec file.

## Writing New Tests

Follow the helpers in the spec files:

- Insert blocks through the editor store (`wp.blocks.createBlock` +
  `insertBlocks`) instead of the inserter UI.
- Select text with the keyboard, then wait until the store reports the
  selection (`getSelectionStart()` / `getSelectionEnd()`).
- Wait for results with `expect.poll()` on the block's stored content instead
  of fixed `waitForTimeout()` delays; the controls apply after a debounce.
- Prefer roles and labels (`getByRole('spinbutton', { name: 'Letter Spacing
  (for selected text)' })`) over CSS classes.
- Make each test independent: create what it needs and delete it afterwards
  (the draft post, styles, fonts). The suite runs against any WordPress with
  the plugin active, including a fresh `wp-env` site.

## Configuration

### Playwright Config

Located at [playwright.config.js](../../playwright.config.js).

Key settings:
- **`workers: 1`** - Single worker prevents WordPress state conflicts
- **`fullyParallel: false`** - Tests run sequentially (WordPress shares state)
- **`baseURL`** - Loaded from `.env` file (`WP_BASE_URL`)
- **`globalSetup`** - Handles WordPress login before tests run
- **`screenshot: 'only-on-failure'`** - Captures screenshots when tests fail
- **`video: 'retain-on-failure'`** - Records video for failed tests

### Global Setup

Located at [global-setup.js](global-setup.js).

Handles WordPress authentication:
1. Launches browser
2. Navigates to `/wp-login.php`
3. Fills in username and password from `.env`
4. Turns the editor's welcome guide off in the user's saved preferences
   (the `persisted_preferences` user meta), when it is not off already,
   and keeps every other preference. Without this, for a new user (every
   fresh wp-env site) the guide could open in the middle of a test and
   take every click.
5. Saves authentication state to `auth.json`
6. All tests reuse this authenticated state

## Troubleshooting

### Tests Fail with "Element not found"

**Cause**: Timing issue - element hasn't loaded yet.

**Solution**: Add `await page.waitForSelector('.element-class')` before interacting.

### Tests Fail with "Selection not working"

**Cause**: WordPress editor selection is complex and timing-sensitive.

**Solution**:
- Use `click({ clickCount: 3 })` to select all
- Use `keyboard.press()` to navigate and select text
- Add `waitForTimeout(300)` after selection changes

### Authentication Fails

**Cause**: Incorrect credentials or WordPress not running.

**Solution**:
1. Verify `.env` file has correct credentials
2. Check WordPress is running at `WP_BASE_URL`
3. Delete `auth.json` and run tests again (regenerates auth state)

### Tests Pass Locally but Fail in CI

**Cause**: Different timing or environment differences.

**Solution**:
- Increase timeouts in CI environment
- Use `process.env.CI` checks in config
- Set `retries: 2` for CI (already configured)

## Security

### Credential Management

- ✅ **`.env`** - Contains actual credentials, **git-ignored**, **never commit**
- ✅ **`.env.example`** - Template with placeholders, **safe to commit**
- ✅ **`auth.json`** - Generated authentication state, **git-ignored**
- ❌ **Never commit credentials** to package.json, test files, or config files

### Package Distribution

E2E tests are:
- ✅ Included in Git repository (source control)
- ✅ Listed in `devDependencies` (development only)
- ❌ **Excluded from the plugin zip** (via `.distignore`)
- ❌ Not distributed to end users

Rationale: E2E tests are for development/CI only, not needed in production plugin.

## Running in wp-env (and in CI)

The suite does not need a local development site. It runs against any WordPress where this plugin is active, through
`WP_BASE_URL`, `WP_USERNAME` and `WP_PASSWORD`. The repository's
`.wp-env.json` maps this checkout as a plugin, so with Docker running:

```bash
npm run build                       # wp-env serves the minified assets
npx @wordpress/env start            # http://localhost:8888, admin / password
WP_BASE_URL=http://localhost:8888 WP_USERNAME=admin WP_PASSWORD=password npm run test:e2e
```

To try the next WordPress locally, add a git-ignored `.wp-env.override.json`:

```json
{
  "core": "https://wordpress.org/nightly-builds/wordpress-latest.zip",
  "plugins": [ ".", "https://downloads.wordpress.org/plugin/gutenberg.zip" ]
}
```

That is what the weekly **Compatibility** workflow
(`.github/workflows/compat.yml`, #189) does: it runs this suite in wp-env
with WordPress trunk and the latest Gutenberg every Monday and on demand,
and attaches the Playwright report to a failed run. It does not run on push
or pull request. See `RELEASING.md` § 9.

The **CI** workflow (`.github/workflows/ci.yml`, job "E2E (stable
WordPress)", #373) runs the same suite in wp-env with the stable WordPress
on each pull request to `main`, on each push to `main`, and on manual runs.
A failed test fails the pull request.

wp-env turns on `SCRIPT_DEBUG`, so the editor runs React's development
build, which mounts each component, unmounts it and mounts it again in
StrictMode. Code that registers listeners in a constructor, or anywhere
outside a mount and unmount pair, works on a site with `SCRIPT_DEBUG` off
and fails there (#386, `inline-extension-listeners.spec.js`).

The screen-reader suite (`npm run test:sr`, `tests/e2e-sr/`) needs Windows
and NVDA, so it stays local.

## Additional Resources

- [Playwright Documentation](https://playwright.dev/)
- [WordPress E2E Testing Best Practices](https://developer.wordpress.org/block-editor/reference-guides/packages/packages-e2e-tests/)
- [Playwright Test API](https://playwright.dev/docs/api/class-test)
- [Playwright Locators](https://playwright.dev/docs/locators)

## Support

For issues with E2E tests:
1. Check this README for troubleshooting steps
2. Review test output and error messages
3. Use `npm run test:e2e:debug` to step through failing tests
4. Open an issue on GitHub with test output and environment details

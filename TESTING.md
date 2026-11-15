# Testing Guide for Typography Stylist

## Overview

The plugin has four test suites:

| Suite | Tool | Where | Command | Runs in CI |
| --- | --- | --- | --- | --- |
| Unit tests for JavaScript | Jest | the `__tests__/` folders | `npm test` | on every pull request, and on each push to `main` |
| Unit tests for PHP | PHPUnit with Brain Monkey | `tests/Unit/` | `npm run test:php` | on every pull request, and on each push to `main` |
| End-to-end tests | Playwright | `tests/e2e/` | `npm run test:e2e` | on pull requests to `main`, and every week against WordPress trunk |
| Screen-reader journeys | Playwright with Guidepup and NVDA | `tests/e2e-sr/` | `npm run test:sr` | no (Windows only, by hand) |

`npm run test:all` runs Jest and PHPUnit. None of the tests ship in the plugin zip.

Install the tools once with `npm install` (Jest, Playwright) and `composer install` (PHPUnit).

## Jest

Jest tests the pure functions of the editors, the block's `save()` output, and the hand-written scripts of the modules. `npm test` runs `wp-scripts test-unit-jest` with the settings in `jest.config.js` and `jest.setup.js`. The tests run in jsdom, not in a browser.

Jest runs every file in a `__tests__/` folder:

- `__tests__/` (plugin root): tests that read the documentation, for example `hooks-doc.test.js`.
- `assets/js/__tests__/`: the inline editor modules, the shared modules and the settings page scripts.
- `blocks/typography-stylist/__tests__/`: the Typography Stylist block.
- `glyphs-panel/__tests__/`, `variable-fonts/__tests__/`, `paragraph-styles/__tests__/`: the bundled modules.
- `scripts/__tests__/`: the version check script (`scripts/check-versions.js`).
- `tests/e2e-sr/__tests__/`: the setup code of the screen-reader journeys (not the journeys).

Shared fixtures are in `tests/fixtures/` and `paragraph-styles/__tests__/fixtures/`. Some fixtures are read by Jest and by PHPUnit, so that the JavaScript and the PHP copy of a function give the same result. [docs/twins.md](docs/twins.md) lists these pairs and their tests.

```bash
npm test                                   # all Jest tests
npm test -- blocks/typography-stylist/__tests__/save.test.js   # one file
npm test -- --testNamePattern="sanitize"   # tests whose name matches
npm run test:watch                         # run again when a file changes
npm test -- --coverage                     # coverage report
```

Give the path of the file after `--`. Do not use `wp-scripts test-unit-js`: it prints a message about Vitest and runs no test.

## PHPUnit

PHPUnit tests the PHP classes without a WordPress installation. Brain Monkey replaces the WordPress functions that a test needs. The settings are in `phpunit.xml.dist`. `tests/bootstrap.php` defines the plugin constants and starts Brain Monkey, and the tests load the plugin files that they need.

- `tests/Unit/`: the test classes, one file for each topic.
- `tests/TestCase.php`, `tests/ExportTestCase.php`, `tests/Support/`: shared base classes and helpers.

```bash
composer install
npm run test:php                                  # all PHPUnit tests
vendor/bin/phpunit tests/Unit/SafeStyleCssTest.php   # one file
```

Some tests need real WordPress files: the HTML API (WordPress 6.9 or later) for the GREP and nested styles tests, and the block parser for the synced pattern test. Set the environment variable `TYPOST_WP_DIR` to the root of a WordPress installation or checkout. Without it, these tests are skipped. In CI, the "PHP tests" job fetches these files from WordPress 6.9 and runs `vendor/bin/phpunit --fail-on-skipped`, so a skipped test fails the job.

## End-to-end tests (`tests/e2e/`)

These Playwright tests drive the real block editor in a browser. They insert blocks, select text with real key presses, and check the saved markup and the frontend. Each test makes its own drafts and deletes them. The settings are in `playwright.config.js`: Chromium runs all tests, and Firefox runs only the tests tagged `@firefox` (keyboard focus checks).

To run them on your computer you need a WordPress site with the plugin active:

```bash
npx playwright install chromium firefox
cp .env.example .env    # then set WP_BASE_URL, WP_USERNAME, WP_PASSWORD
npm run build           # the editor needs the compiled files
npm run test:e2e
```

[tests/e2e/README.md](tests/e2e/README.md) has the details and the other commands (`test:e2e:ui`, `test:e2e:debug`, `test:e2e:headed`).

In CI, the "E2E (stable WordPress)" job in `.github/workflows/ci.yml` runs the suite in wp-env on the latest WordPress release, for pull requests to `main`, pushes to `main` and manual runs. `.github/workflows/compat.yml` runs it every week on WordPress trunk.

## Screen-reader journeys (`tests/e2e-sr/`)

These tests drive the editor and the settings page with a real NVDA screen reader, through Guidepup, and record what NVDA says. Each file is one journey, for example the Glyphs panel or the Paragraph Styles browser. They run on Windows only, and they are not part of `npm test` or of CI.

A run takes control of the keyboard. Guidepup sends key presses to the window in the foreground, so do not use the keyboard or the mouse while a run goes on. [tests/e2e-sr/README.md](tests/e2e-sr/README.md) tells you how to set up NVDA and how to run the journeys (`npm run test:sr`, settings in `playwright.nvda.config.js`).

## How to write a unit test

- **Test the real code.** Import the function from its file. Do not copy it into the test.
- **Put logic in pure functions.** A function with no side effects is easy to test. The editors keep such functions in `blocks/typography-stylist/utils.js`, `assets/js/inline-editor/` and the shared modules in `assets/js/`.
- **Use the AAA pattern:** arrange the data, act (call the function), assert the result.
- **Test one behavior in each test,** and give the test a name that says the behavior: `should apply inline when text is selected`, not `test1`.
- **Keep tests independent.** A test must not depend on the result of another test.
- **Test the edge cases:** `null`, `undefined`, empty strings, values out of range, content saved by an older version.
- **A new test must be able to fail.** Break the code that it guards once, and see the test fail.
- **A test that reads a source file as text** (it checks that a pattern is or is not in the file) can pass when the code moves. When you move code, plant a violation once to prove that the test still finds it.

[docs/decisions/testing-practices.md](docs/decisions/testing-practices.md) gives more rules, and how to test the plugin by hand in WordPress.

## When You Add or Change a Hook

`__tests__/hooks-doc.test.js` compares the hooks in the code with the entries in `HOOKS.md`. It fails when one side has a hook that the other side does not have. The comment at the top of the test file gives the full rules.

- **A new hook:** add an entry to `HOOKS.md`. Put the name in backticks at the start of a heading, of the first cell of a table row, or of a bold paragraph. Put a PHP filter under "PHP Filters" and a PHP action under "PHP Actions". Put a JavaScript hook under "JavaScript Hooks".
- **A name built at run time:** write the changing part as a placeholder, for example `typost_admin_tab_content_{tab_id}`.
- **A hook name the test cannot read:** the test fails and names the file and the line. Write the name as a literal string, and call `window.typostHooks.doAction()` or `window.typostHooks.applyFilters()` directly.
- **A new component that fires a hook named by a prop:** add it to `JS_HOOK_WRAPPERS` in the test file. `HookPoint` is the only such component today. Give the component name, the prop, the kind (action or filter) and the file. Do not import the component under another name.

## Resources

- [Jest documentation](https://jestjs.io/docs/getting-started)
- [Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Playwright documentation](https://playwright.dev/docs/intro)
- [Brain Monkey documentation](https://giuseppe-mazzapica.gitbook.io/brain-monkey)
- [Guidepup documentation](https://www.guidepup.dev/)

/**
 * docs/twins.md names the test and the fixture that guard each twin (#358).
 *
 * A row is only as good as the file it points to. When a test or a fixture
 * is renamed or deleted, this fails until the row is updated, so the table
 * cannot go stale without anyone seeing it.
 *
 * It checks three forms the table uses, all in backticks:
 * - a path from the plugin root inside a `__tests__` folder or under
 *   `tests/` (a `:line` suffix is ignored);
 * - a Jest file by name alone (`style-css.test.js`): a file of that name
 *   must be in some `__tests__` folder;
 * - a PHPUnit class by name alone (`ParagraphStylesStyleCssTest`): the file
 *   `tests/Unit/<name>.php` must exist.
 *
 * It does not check that the table lists every twin: nothing can know that
 * a new twin exists.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const SKIP_DIRS = ['node_modules', 'vendor', 'build', '.git'];

/**
 * The names of every Jest test file in the plugin's `__tests__` folders.
 *
 * @return {Set<string>} File names without their folders.
 */
function jestFileNames() {
	const names = new Set();
	(function walk(dir, inTests) {
		fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
			if (entry.isDirectory()) {
				if (SKIP_DIRS.indexOf(entry.name) === -1) {
					walk(path.join(dir, entry.name), inTests || entry.name === '__tests__');
				}
			} else if (inTests && /\.test\.js$/.test(entry.name)) {
				names.add(entry.name);
			}
		});
	})(ROOT, false);
	return names;
}

/**
 * The tests and fixtures a Markdown text names in backticks.
 *
 * @param {string} markdown
 * @return {{paths: string[], jestNames: string[], phpunitNames: string[]}}
 */
function guardNames(markdown) {
	const paths = new Set();
	const jestNames = new Set();
	const phpunitNames = new Set();
	const token = /`([^`\n]+)`/g;
	let match;
	while ((match = token.exec(markdown))) {
		const name = match[1].replace(/:\d+(-\d+)?$/, '');
		if (/^[\w.-]+\.test\.js$/.test(name)) {
			jestNames.add(name);
		} else if (/^[A-Z]\w*Test$/.test(name)) {
			phpunitNames.add(name);
		} else if (/^[\w./-]+\.(js|php|json)$/.test(name) && (/(^|\/)__tests__\//.test(name) || /^tests\//.test(name))) {
			paths.add(name);
		}
	}
	return { paths: Array.from(paths), jestNames: Array.from(jestNames), phpunitNames: Array.from(phpunitNames) };
}

/**
 * The names that point to no file.
 *
 * @param {{paths: string[], jestNames: string[], phpunitNames: string[]}} names
 * @return {string[]}
 */
function missing(names) {
	const jestFiles = jestFileNames();
	return [].concat(
		names.paths.filter((name) => !fs.existsSync(path.join(ROOT, name))),
		names.jestNames.filter((name) => !jestFiles.has(name)),
		names.phpunitNames.filter((name) => !fs.existsSync(path.join(ROOT, 'tests', 'Unit', name + '.php')))
	);
}

describe('docs/twins.md names tests and fixtures that exist (#358)', () => {
	const names = guardNames(fs.readFileSync(path.join(ROOT, 'docs', 'twins.md'), 'utf8'));

	it('finds the names in each form the table uses', () => {
		// A change to how the table writes names must not empty the scan
		expect(names.paths.length).toBeGreaterThanOrEqual(40);
		expect(names.paths).toContain('paragraph-styles/__tests__/fixtures/style-css.json');
		expect(names.paths).toContain('tests/Unit/SyncedPatternContentParityTest.php');
		expect(names.paths).toContain('assets/js/__tests__/twin-parity.test.js');
		expect(names.jestNames).toContain('style-css.test.js');
		expect(names.phpunitNames).toContain('ParagraphStylesStyleCssTest');
	});

	it('every test and fixture the table names exists', () => {
		expect(missing(names)).toEqual([]);
	});

	it('control: a name that points to no file is reported, in each form', () => {
		const planted = guardNames(
			'| 99 | x | `tests/Unit/NoSuchParityTest.php:12` | `assets/js/__tests__/no-such.test.js` | `no-such-twin.test.js`, `NoSuchTwinTest` | `utils.js` |'
		);
		expect(planted).toEqual({
			paths: ['tests/Unit/NoSuchParityTest.php', 'assets/js/__tests__/no-such.test.js'],
			jestNames: ['no-such-twin.test.js'],
			phpunitNames: ['NoSuchTwinTest'],
		});
		expect(missing(planted)).toEqual([
			'tests/Unit/NoSuchParityTest.php',
			'assets/js/__tests__/no-such.test.js',
			'no-such-twin.test.js',
			'NoSuchTwinTest',
		]);
	});
});

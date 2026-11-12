/**
 * Parity tests for the Paragraph Styles module's JavaScript twins (#358).
 *
 * The admin script (assets/js/admin.js) is hand-written ES5 with no build
 * and keeps its own copies of a few ps-utils.js helpers. Neither copy is
 * exported, so tests/js/twin-source.js cuts both out of their source by
 * name and the test runs them on the same inputs. docs/twins.md lists every
 * twin and the test that holds it.
 */

const { loadFunction } = require('../../tests/js/twin-source.js');

describe('sizeModeOf (admin.js and ps-utils.js)', () => {
	const admin = loadFunction('paragraph-styles/assets/js/admin.js', 'sizeModeOf');
	const lib = loadFunction('paragraph-styles/assets/js/lib/ps-utils.js', 'sizeModeOf');

	test.each([
		['responsive'], ['fit'], ['inherit'], [''], [undefined], [null],
		['24'], [24], ['0'], [0], ['-3'], ['abc'], ['1e2'], [' 12 '], [true],
	])('%p', (fontSize) => {
		expect(admin(fontSize)).toBe(lib(fontSize));
	});
});

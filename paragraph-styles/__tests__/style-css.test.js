/**
 * The main rule of a paragraph style (#358).
 *
 * buildStyleCssBlock() must match generate_style_css() in
 * paragraph-styles.php byte for byte, so both read
 * fixtures/style-css.json (the PHP reader is
 * tests/Unit/ParagraphStylesStyleCssTest.php). A case with a "php" key is a
 * known difference between the two generators: JS is held to "css" and PHP
 * to "php", so a change to either side is deliberate.
 */

const fixture = require('./fixtures/style-css.json');
const { buildStyleCssBlock } = require('../assets/js/lib/ps-utils');

describe('style CSS (shared fixture)', () => {
	test('the fixture is read', () => {
		// A control: an empty list would let every case pass by never running
		expect(fixture.cases.length).toBeGreaterThanOrEqual(40);
	});

	test.each(fixture.cases.map((c) => [c.label, c]))('%s', (label, c) => {
		expect(buildStyleCssBlock(c.style)).toBe(c.css);
	});

	test('every known difference names what PHP writes instead', () => {
		const differs = fixture.cases.filter((c) => /^differs:/.test(c.label));
		expect(differs.length).toBeGreaterThan(0);
		differs.forEach((c) => {
			expect(typeof c.php).toBe('string');
			expect(c.php).not.toBe(c.css);
		});
		// And only those: a "php" key on any other case would hide a drift
		fixture.cases.filter((c) => !/^differs:/.test(c.label)).forEach((c) => {
			expect(c.php).toBeUndefined();
		});
	});
});

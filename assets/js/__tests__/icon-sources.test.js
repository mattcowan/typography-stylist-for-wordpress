/**
 * The SVG files under assets/images/icons/ are described as the canonical
 * source for the icon path data that is inlined into five other places. That
 * claim is only worth anything if something enforces it, so this does.
 *
 * Without these tests the failure is quiet and slow: someone edits an icon in
 * one place, the other copies keep rendering the old shape, and nobody notices
 * until the toolbar and the inserter disagree.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const ICONS = path.join(ROOT, 'assets/images/icons');

const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

/**
 * Every SVG path-data string in a file, in document order.
 *
 * Matches the data itself rather than a `d` attribute, because the icons reach
 * the DOM three different ways: as a `d` attribute in JSX and block.json, and
 * as a named constant (GLYPHS_ICON_PATH, PS_ICON_PATH) that is only assigned
 * to `d` later. Keying on the attribute alone silently found nothing in the
 * module files, which made the test pass-by-omission until it was checked.
 */
const paths = (source) =>
	Array.from(source.matchAll(/['"]([Mm]\s*-?\d[^'"]{50,})['"]/g)).map((m) => m[1]);

/** The `d` attributes of one source SVG. */
const svgPaths = (name) => paths(fs.readFileSync(path.join(ICONS, name), 'utf8'));

describe('icon sources', () => {
	const files = ['block.svg', 'toolbar-t.svg', 'toolbar-g.svg', 'toolbar-p.svg'];

	it.each(files)('%s exists and holds path data', (name) => {
		expect(svgPaths(name).length).toBeGreaterThan(0);
	});

	// The reviewer's point: a contributor copies the markup out of one of these
	// files into a new component. Whatever they copy has to already be correct,
	// which means carrying the same attributes as the inline copies.
	it.each(files)('%s carries the attributes the inline copies carry', (name) => {
		const svg = fs.readFileSync(path.join(ICONS, name), 'utf8');
		const tag = svg.match(/<svg[^>]*>/)[0];

		expect(tag).toContain('viewBox="0 0 256 256"');
		expect(tag).toContain('width="24"');
		expect(tag).toContain('height="24"');
		expect(tag).toContain('aria-hidden="true"');
		expect(tag).toContain('focusable="false"');
		expect(svg).toContain('fill="currentColor"');
	});

	it('all four icons share one 256x256 grid', () => {
		files.forEach((name) => {
			const svg = fs.readFileSync(path.join(ICONS, name), 'utf8');
			expect(svg).toContain('viewBox="0 0 256 256"');
		});
	});
});

describe('inline copies match their source', () => {
	it('the TS monogram matches block.svg in both block registrations', () => {
		const expected = svgPaths('block.svg');

		expect(expected).toHaveLength(2);
		expect(paths(read('blocks/typography-stylist/index.js'))).toEqual(expected);
		expect(paths(read('blocks/typography-stylist/block.json'))).toEqual(expected);
	});

	it('the swash T matches toolbar-t.svg in both popover editors', () => {
		const [expected] = svgPaths('toolbar-t.svg');

		expect(paths(read('blocks/typography-stylist/edit.js'))).toContain(expected);
		expect(paths(read('assets/js/block-editor.js'))).toContain(expected);
	});

	it('the swash G matches toolbar-g.svg in the Glyphs Panel', () => {
		const [expected] = svgPaths('toolbar-g.svg');

		expect(paths(read('glyphs-panel/assets/js/editor.js'))).toContain(expected);
	});

	it('the swash P matches toolbar-p.svg in Paragraph Styles', () => {
		const [expected] = svgPaths('toolbar-p.svg');

		expect(paths(read('paragraph-styles/assets/js/editor.js'))).toContain(expected);
	});

	// The block icon and the popover-launcher icon are deliberately different
	// marks that both live in blocks/typography-stylist/. Asserting it stops a
	// future reader "fixing" the inconsistency.
	it('the block icon and the toolbar T stay different marks', () => {
		const [monogram] = svgPaths('block.svg');
		const [swashT] = svgPaths('toolbar-t.svg');

		expect(monogram).not.toEqual(swashT);
		expect(paths(read('blocks/typography-stylist/index.js'))).toContain(monogram);
		expect(paths(read('blocks/typography-stylist/edit.js'))).toContain(swashT);
	});

	// Superseded marks. Named explicitly so a revert or a bad merge that
	// reintroduces one fails loudly instead of shipping a mismatched set.
	it.each([
		['old swash T', 'M22.621,323.219'],
		['old swash G', 'M947.303 860.064'],
		['old Ps ligature', 'M533.134 422.428'],
	])('no file still carries the %s', (_label, fragment) => {
		const sources = [
			'blocks/typography-stylist/index.js',
			'blocks/typography-stylist/edit.js',
			'blocks/typography-stylist/block.json',
			'assets/js/block-editor.js',
			'glyphs-panel/assets/js/editor.js',
			'paragraph-styles/assets/js/editor.js',
		];

		sources.forEach((file) => {
			expect(read(file)).not.toContain(fragment);
		});
	});
});

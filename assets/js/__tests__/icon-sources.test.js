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

/**
 * Every file that inlines an icon, and which source it must agree with.
 *
 * Each of these files carries exactly the paths for its own icon and nothing
 * else, which is what lets the assertions below compare whole sets rather than
 * merely checking the expected path is somewhere among them. `toContain` would
 * pass a file that inlined one path of a two-path icon.
 */
const INLINE_COPIES = [
	['blocks/typography-stylist/index.js', 'block.svg'],
	['blocks/typography-stylist/block.json', 'block.svg'],
	['blocks/typography-stylist/edit.js', 'toolbar-t.svg'],
	['assets/js/block-editor.js', 'toolbar-t.svg'],
	['glyphs-panel/assets/js/editor.js', 'toolbar-g.svg'],
	['paragraph-styles/assets/js/editor.js', 'toolbar-p.svg'],
];

describe('inline copies match their source', () => {
	it.each(INLINE_COPIES)('%s carries exactly the paths from %s', (file, svg) => {
		const expected = svgPaths(svg);

		expect(expected.length).toBeGreaterThan(0);
		expect(paths(read(file))).toEqual(expected);
	});

	it('the TS monogram is two paths, so a partial copy is a failure', () => {
		expect(svgPaths('block.svg')).toHaveLength(2);
	});

	// The attribute check on the source files is not enough on its own: it
	// passes happily while someone deletes aria-hidden from the JSX. Verified
	// by simulating exactly that — stripping the attributes from block.json
	// left all the other assertions green.
	it.each(INLINE_COPIES.map(([file]) => file))(
		'%s keeps the icon a11y attributes',
		(file) => {
			const source = read(file);

			// Three syntaxes reach the DOM here: JSX attributes, a
			// createElement props object, and a quoted SVG string in
			// block.json. Match the intent rather than one spelling.
			expect(source).toMatch(/aria-hidden["']?\s*[:=]\s*["']true["']/);
			expect(source).toMatch(/focusable["']?\s*[:=]\s*["']false["']/);
		}
	);

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

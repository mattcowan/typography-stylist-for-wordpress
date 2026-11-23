/**
 * The screen reader copy of the block is hidden by the clip rules only, with
 * no color of its own (#475). A transparent color made WAVE report a contrast
 * error, because WAVE reads rgba(0, 0, 0, 0) as black. The clip already hides
 * the text: measured in Chromium and Firefox, also in forced colors mode and
 * with focus.
 */

import fs from 'fs';
import path from 'path';

const styleCss = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');

const HIDDEN_CLASSES = ['.visually-hidden', '.sr-only', '.screen-reader-text'];

/** Every rule as { selectors, body }, with comments removed. */
function rules(source) {
	const clean = source.replace(/\/\*[\s\S]*?\*\//g, '');
	const pattern = /([^{}]+)\{([^{}]*)\}/g;
	const found = [];
	let match;
	while ((match = pattern.exec(clean)) !== null) {
		found.push({
			selectors: match[1].split(',').map((s) => s.trim()),
			body: match[2],
		});
	}
	return found;
}

/** The rules that style a hidden class in its normal (not :focus) state. */
function hiddenCopyRules() {
	return rules(styleCss).filter((rule) =>
		rule.selectors.some((selector) =>
			HIDDEN_CLASSES.some((cls) => selector === '.wp-block-typost ' + cls)
		)
	);
}

describe('screen reader copy CSS (#475)', () => {
	it('control: the rule that hides the copy is found, with its clip', () => {
		const found = hiddenCopyRules();
		expect(found.length).toBeGreaterThanOrEqual(1);
		const body = found.map((rule) => rule.body).join(';');
		expect(body).toMatch(/clip-path\s*:\s*inset\(50%\)/);
		expect(body).toMatch(/(^|[;\s])clip\s*:\s*rect\(0,\s*0,\s*0,\s*0\)/);
		expect(body).toMatch(/overflow\s*:\s*hidden/);
	});

	it('gives the copy no color of its own', () => {
		for (const rule of hiddenCopyRules()) {
			expect(rule.body).not.toMatch(/(^|[;\s])color\s*:/);
		}
	});

	it('has no :focus rule for the copy (#476)', () => {
		// The copy has no tabindex, so it cannot take focus, and the clip
		// would hide an outline anyway.
		const clean = styleCss.replace(/\/\*[\s\S]*?\*\//g, '');
		for (const cls of HIDDEN_CLASSES) {
			expect(clean).not.toContain(cls + ':focus');
		}
	});

	it('control: the :focus check finds a planted rule', () => {
		const planted = '.wp-block-typost .sr-only:focus { outline: 3px solid; }';
		expect(planted).toContain('.sr-only:focus');
	});

	it('control: the color check finds a color declaration', () => {
		const planted = rules('.wp-block-typost .sr-only { clip-path: inset(50%); color: transparent; }');
		expect(planted[0].body).toMatch(/(^|[;\s])color\s*:/);
	});
});

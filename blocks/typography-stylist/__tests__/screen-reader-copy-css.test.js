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

// Every selector of the screen reader copy, with the old "Custom" class that
// save() once wrote. It shares the rule today; if it ever gets a rule of its
// own, a color there must fail the test too.
const HIDDEN_SELECTORS = HIDDEN_CLASSES.map((cls) => '.wp-block-typost ' + cls).concat(['.wp-block-typost > .custom']);

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
		rule.selectors.some((selector) => HIDDEN_SELECTORS.includes(selector))
	);
}

// The copy's classes, with the old "Custom" class that the copy rule also
// styles (.wp-block-typost > .custom).
const COPY_CLASSES = HIDDEN_CLASSES.concat(['.custom']);

/**
 * The copy classes that have a :focus rule in the source, comments removed.
 * A rule counts when one compound selector (the part between combinators)
 * has both the class and a :focus pseudo-class, in any order and with other
 * conditions between them: `.sr-only:focus`, `.sr-only:hover:focus`,
 * `.sr-only:focus-visible`. A rule inside a media query counts too.
 */
function focusRuleClasses(source) {
	const found = new Set();
	for (const rule of rules(source)) {
		for (const selector of rule.selectors) {
			for (const compound of selector.split(/\s*[\s>+~]\s*/)) {
				if (!/:focus/.test(compound)) {
					continue;
				}
				for (const cls of COPY_CLASSES) {
					const name = cls.slice(1).replace(/-/g, '\\-');
					if (new RegExp('\\.' + name + '(?![\\w-])').test(compound)) {
						found.add(cls);
					}
				}
			}
		}
	}
	return COPY_CLASSES.filter((cls) => found.has(cls));
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
		expect(focusRuleClasses(styleCss)).toEqual([]);
	});

	it('control: the :focus check finds a planted rule, also inside a media query, and skips a comment', () => {
		expect(focusRuleClasses('.wp-block-typost .sr-only:focus { outline: 3px solid; }')).toEqual(['.sr-only']);
		expect(focusRuleClasses('@media (prefers-contrast: high) { .wp-block-typost .screen-reader-text:focus { outline-width: 4px; } }')).toEqual(['.screen-reader-text']);
		expect(focusRuleClasses('/* .sr-only:focus was removed (#476) */')).toEqual([]);
	});

	it('control: the :focus check finds the old Custom class, :focus after another condition, and :focus-visible', () => {
		expect(focusRuleClasses('.wp-block-typost > .custom:focus { outline: 0; }')).toEqual(['.custom']);
		expect(focusRuleClasses('.wp-block-typost .sr-only:hover:focus { outline: 0; }')).toEqual(['.sr-only']);
		expect(focusRuleClasses('.wp-block-typost .visually-hidden:focus-visible { outline: 0; }')).toEqual(['.visually-hidden']);
	});

	it('control: the :focus check skips a focused ancestor, a longer class name, and the copy rule without :focus', () => {
		expect(focusRuleClasses('.wp-block-typost:focus .sr-only { outline: 0; }')).toEqual([]);
		expect(focusRuleClasses('.sr-only-extra:focus { outline: 0; }')).toEqual([]);
		expect(focusRuleClasses('.wp-block-typost > .custom, .wp-block-typost .sr-only { clip-path: inset(50%); }')).toEqual([]);
	});

	it('control: the color check finds a color declaration', () => {
		const planted = rules('.wp-block-typost .sr-only { clip-path: inset(50%); color: transparent; }');
		expect(planted[0].body).toMatch(/(^|[;\s])color\s*:/);
	});
});

/**
 * The block's own Line indent (core's Text indent support, WordPress 7.0+,
 * #348): declared in block.json, rendered on the wrapper by core (editor
 * useBlockProps(), frontend Typost::add_block_support_attributes()), passed
 * to the visual copy by style.css, kept off fit-to-width lines, and it turns
 * the First Letter Hang off the way a style's first line indent does.
 */

import fs from 'fs';
import path from 'path';
import { renderToString } from '@wordpress/element';
import { hasBlockTextIndent, buildBlockFontSizeCss, buildResponsiveClamp, formatFontSizeLength } from '../utils';

jest.mock('@wordpress/block-editor');

// eslint-disable-next-line import/first -- the mock must be set up first
import save from '../save';

const blockJson = require('../block.json');
const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
const editorCss = fs.readFileSync(path.join(__dirname, '..', 'editor.css'), 'utf8');

/** The declarations of the first rule whose selector list matches. */
function ruleBody(source, selectorPattern) {
	const match = new RegExp(selectorPattern.source + '\\s*\\{([^}]*)\\}').exec(source);
	return match ? match[1] : null;
}

describe('block.json', () => {
	it('declares core\'s Text indent support', () => {
		expect(blockJson.supports.typography.textIndent).toBe(true);
	});

	it('keeps the other typography supports', () => {
		expect(blockJson.supports.typography.lineHeight).toBe(true);
		expect(blockJson.supports.typography.fontSize).toBe(false);
	});
});

describe('save()', () => {
	const base = {
		content: 'First words',
		tagName: 'p',
		features: [],
		fontSize: 'inherit',
		fontWeight: '400',
		letterSpacing: 0,
		lineHeight: 0,
		screenReaderClass: 'visually-hidden',
		styleClass: '',
		initialHang: 0.2,
	};

	it('writes the same markup with a Text indent, so no deprecation is needed', () => {
		const without = renderToString(save({ attributes: base }));
		const withIndent = renderToString(save({ attributes: { ...base, style: { typography: { textIndent: '24px' } } } }));
		expect(withIndent).toBe(without);
		expect(withIndent).not.toMatch(/text-indent/);
	});

	it('writes the same markup for a fit block with a Text indent', () => {
		const fit = { ...base, fontSize: 'fit', fitLineSizes: [0.5] };
		expect(renderToString(save({ attributes: { ...fit, style: { typography: { textIndent: '2em' } } } })))
			.toBe(renderToString(save({ attributes: fit })));
	});
});

describe('hasBlockTextIndent', () => {
	it('is true for any value core writes as an inline text-indent, 0 included', () => {
		expect(hasBlockTextIndent({ typography: { textIndent: '24px' } })).toBe(true);
		expect(hasBlockTextIndent({ typography: { textIndent: '1.5em' } })).toBe(true);
		expect(hasBlockTextIndent({ typography: { textIndent: '0' } })).toBe(true);
	});

	it('is false with no value', () => {
		// A number 0 too: core's style engine writes nothing for it (PHP
		// is_valid_style_value() keeps only the string '0'; JS generateRule()
		// drops falsy values), so the CSS presence test does not match (PR #368 review)
		for (const style of [undefined, null, {}, { typography: {} }, { typography: { textIndent: '' } }, { typography: { textIndent: null } }, { typography: { textIndent: 0 } }, { typography: 'x' }]) {
			expect(hasBlockTextIndent(style)).toBe(false);
		}
	});
});

describe('style.css', () => {
	it('passes the wrapper\'s Text indent to the visual copy, over a theme or style rule, and turns the hang off', () => {
		const body = ruleBody(css, /\.wp-block-typost\[style\*="text-indent:"\] > :is\(\.typost-styled, \.typost-block-content\):not\(\.typost-fit\)/);
		expect(body).not.toBeNull();
		expect(body).toMatch(/text-indent: inherit !important;/);
		expect(body).toMatch(/--typost-hang-on: 0;/);
	});

	it('keeps fit-to-width lines unindented, since each frontend line is a block', () => {
		const body = ruleBody(css, /\.wp-block-typost \.typost-fit,\s*\.wp-block-typost \.typost-fit \.typost-line/);
		expect(body).not.toBeNull();
		expect(body).toMatch(/text-indent: 0;/);
	});

	it('control: the rule finder finds a rule known to be there', () => {
		expect(ruleBody(css, /\.wp-block-typost\.has-text-color > :is\(\.typost-styled, \.typost-block-content\)/)).toMatch(/color: inherit/);
	});
});

describe('editor.css', () => {
	it('keeps the editor hang rule, which the !important Text indent rule overrides', () => {
		// Same (0,4,0) specificity as the Text indent rule, so only !important
		// decides the order across the two files
		expect(ruleBody(editorCss, /\.wp-block-typost > \.typost-block-content\.typost-hang:not\(\.typost-fit\)/)).toMatch(/text-indent: calc/);
	});
});

describe('buildBlockFontSizeCss (#363)', () => {
	// The size Detach multiplies em values by: what save() writes for the
	// visual copy, so the kept indent matches at every width
	it('a responsive size is the clamp save() writes, in the block\'s unit', () => {
		const attrs = { fontSize: 'responsive', fontSizeMin: 16, fontSizePreferred: 32, fontSizeMax: 64 };
		expect(buildBlockFontSizeCss(attrs, 'rem')).toBe(buildResponsiveClamp(16, 32, 64, 'rem'));
		expect(buildBlockFontSizeCss(attrs, 'px')).toBe(buildResponsiveClamp(16, 32, 64, 'px'));
		expect(buildBlockFontSizeCss(attrs, 'rem')).toBe('clamp(1rem, 2rem + 3vw, 4rem)');
	});

	it('a fixed size is the length save() writes', () => {
		expect(buildBlockFontSizeCss({ fontSize: 24 }, 'rem')).toBe(formatFontSizeLength(24, 'rem'));
		expect(buildBlockFontSizeCss({ fontSize: '24' }, 'px')).toBe('24px');
	});

	it.each([['inherit'], ['fit'], ['0'], [0], [''], [undefined], ['large']])('%p gives no size', (fontSize) => {
		expect(buildBlockFontSizeCss({ fontSize, fontSizeMin: 16, fontSizePreferred: 32, fontSizeMax: 64 }, 'rem')).toBe('');
	});
});

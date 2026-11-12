/**
 * The block's own Line indent (core's Text indent support, WordPress 7.0+,
 * #348): declared in block.json, rendered on the wrapper by core (editor
 * useBlockProps(), frontend Typost::add_block_support_attributes()), passed
 * to the visual copy by style.css, kept off fit-to-width lines, and it turns
 * the First Letter Hang off the way a style's first line indent does. Since
 * #364 the wrapper repeats it as --typost-text-indent, which the copy reads.
 */

import fs from 'fs';
import path from 'path';
import { renderToString } from '@wordpress/element';
import { hasBlockTextIndent, withBlockTextIndentProperty, BLOCK_TEXT_INDENT_PROPERTY, buildFitProbeClassName, buildBlockFontSizeCss, buildResponsiveClamp, formatFontSizeLength } from '../utils';

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

describe('withBlockTextIndentProperty (#364)', () => {
	it('repeats the Text indent core wrote into the wrapper props as --typost-text-indent', () => {
		for (const value of ['24px', '1.5em', '0', 'calc(1.5 * clamp(1rem, 2rem + 3vw, 4rem))', 'var(--wp--preset--spacing--20)']) {
			const props = { className: 'wp-block-typost x', style: { lineHeight: 1.2, textIndent: value } };
			expect(withBlockTextIndentProperty(props)).toEqual({
				className: 'wp-block-typost x',
				style: { lineHeight: 1.2, textIndent: value, [BLOCK_TEXT_INDENT_PROPERTY]: value },
			});
		}
		expect(BLOCK_TEXT_INDENT_PROPERTY).toBe('--typost-text-indent');
	});

	it('returns the props unchanged when core wrote no Text indent', () => {
		// Before WordPress 7.0 core writes none, and it writes none for a falsy
		// value. A number is left out: React adds px to text-indent but not to
		// a custom property, so the copy inherits the wrapper's value as before
		for (const style of [undefined, null, {}, { color: 'red' }, { textIndent: '' }, { textIndent: '  ' }, { textIndent: 24 }, { textIndent: null }, 'text-indent: 2em']) {
			const props = { className: 'wp-block-typost', style };
			expect(withBlockTextIndentProperty(props)).toBe(props);
		}
		expect(withBlockTextIndentProperty(undefined)).toBeUndefined();
	});

	it('does not change the props it was given', () => {
		const props = { style: { textIndent: '2em' } };
		withBlockTextIndentProperty(props);
		expect(props).toEqual({ style: { textIndent: '2em' } });
	});

	it('agrees with hasBlockTextIndent() and the style.css presence test for every value core writes', () => {
		// The editor wrapper's style attribute as React writes it
		const attr = (props) => (/style="([^"]*)"/.exec(renderToString(<div style={props.style} />)) || [])[1] || '';
		for (const textIndent of ['24px', '1.5em', '0']) {
			const props = withBlockTextIndentProperty({ style: { textIndent } });
			expect(hasBlockTextIndent({ typography: { textIndent } })).toBe(true);
			expect(attr(props)).toContain('text-indent:');
			expect(attr(props)).toContain('--typost-text-indent:' + textIndent);
		}
	});
});

describe('style.css', () => {
	it('passes the block\'s Text indent to the visual copy from the custom property, over a theme or style rule, and turns the hang off', () => {
		const body = ruleBody(css, /\.wp-block-typost\[style\*="text-indent:"\] > :is\(\.typost-styled, \.typost-block-content\):not\(\.typost-fit, \.typost-fit-editing\)/);
		expect(body).not.toBeNull();
		// #364: var(), so an em value resolves against the text's own size;
		// inherit passed the wrapper's computed px (intent moved: the rule
		// still passes the block's indent to the copy)
		expect(body).toMatch(/text-indent: var\(--typost-text-indent\) !important;/);
		expect(body).toMatch(/--typost-hang-on: 0;/);
	});

	it('leaves out the copy fit measurement builds, which keeps typost-fit-editing and drops typost-fit (#364)', () => {
		// buildFitProbeClassName() is what the measuring hook gives its probe
		const probe = buildFitProbeClassName('typost-block-content typost-styled typost-fit typost-fit-editing typost-ps-3 block-editor-rich-text__editable rich-text').split(' ');
		expect(probe).toContain('typost-fit-editing');
		expect(probe).not.toContain('typost-fit');
		const rule = /\.wp-block-typost\[style\*="text-indent:"\] > :is\(\.typost-styled, \.typost-block-content\):not\(([^)]*)\)/.exec(css);
		expect(rule).not.toBeNull();
		const excluded = rule[1].split(',').map((s) => s.trim().replace(/^\./, ''));
		expect(probe.some((name) => excluded.includes(name))).toBe(true);
	});

	it('reads --typost-text-indent in that rule only, so spans that inherit it ignore it', () => {
		const readers = (source) => (source.match(/var\(--typost-text-indent/g) || []).length;
		expect(readers(css)).toBe(1);
		expect(readers(editorCss)).toBe(0);
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

describe('edit.js (#364)', () => {
	it('gives the editor wrapper the property, from the props core\'s block supports produced', () => {
		// edit.js is the composition root and cannot be rendered here
		const edit = fs.readFileSync(path.join(__dirname, '..', 'edit.js'), 'utf8');
		expect(edit).toMatch(/const blockProps = withBlockTextIndentProperty\(useBlockProps\(\{/);
		expect(edit).toMatch(/<div \{\.\.\.blockProps\}>/);
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

/**
 * "Remove all styling" (#411) and a block made from an empty block (#412):
 * the action the toolbar button and "Reset Entire Block" share, the filter
 * that undoes what WordPress copies after a transform, the transforms in
 * index.js, the confirmation flag, and the markup save() writes for the
 * result.
 */

jest.mock('@wordpress/block-editor');
jest.mock('@wordpress/a11y', () => ({ speak: jest.fn() }), { virtual: true });

import { speak } from '@wordpress/a11y';
import save from '../save';
import blockJson from '../block.json';
import { buildStripStylesAttributes, stripBlockStyles } from '../strip-styles/strip-styles';
import { resetEmptySourceBlock } from '../strip-styles/empty-source';
import createResetActions from '../qft/reset-actions';

const { buildThemeLookAttributes } = require('../../../assets/js/theme-look.js');

// react-dom/server needs TextEncoder, which jsdom does not provide
const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = global.TextEncoder || TextEncoder;
global.TextDecoder = global.TextDecoder || TextDecoder;
const { renderToStaticMarkup } = require('react-dom/server');

const defaults = () => Object.fromEntries(Object.entries(blockJson.attributes).map(([k, v]) => [k, v.default]));

// A block with every kind of styling the action removes
const STYLED = {
	...defaults(),
	content: '<span class="typost-styled" data-features="dlig" style="font-feature-settings: &quot;dlig&quot; 1">Moonlit</span> <strong>garden</strong><br><a href="/party"><em>party</em></a>',
	tagName: 'h3',
	features: ['liga', 'swsh'],
	fontId: 12,
	fontFamily: 'Bookmania',
	fontWeight: '300',
	fontStyle: 'italic',
	fontSize: 'fit',
	fontSizeMin: 20,
	fontSizePreferred: 40,
	fontSizeMax: 90,
	fontSizeUnit: 'px',
	fitLineSizes: [0.2, 0.3],
	fitMaxSize: 120,
	fitWordSizes: [0.2, 0.3],
	fitLineHangs: [0, 0.1],
	initialHang: 0.2,
	textCase: 'small-caps',
	fakeSmallCaps: false,
	letterSpacing: 50,
	lineHeight: 1.4,
	screenReaderClass: 'sr-only',
	textAlign: 'center',
	styleClass: 'typost-ps-4',
	fontVariationSettings: '"wght" 500',
	layeredConfigId: 3,
	animationConfigId: 4,
	align: 'wide',
	anchor: 'my-anchor',
	className: 'typost-styled typost-ps-2 extra',
	textColor: 'ink-2',
	backgroundColor: 'paper-2',
	style: { color: { text: '#a00' }, spacing: { padding: { top: '20px' }, margin: { top: '40px' } }, typography: { lineHeight: '2', textIndent: '2em' } },
};

describe('buildStripStylesAttributes', () => {
	it('strips the content and takes the block to the theme look', () => {
		expect(buildStripStylesAttributes(STYLED.content)).toEqual({
			...buildThemeLookAttributes(),
			content: 'Moonlit garden<br><a href="/party">party</a>',
		});
	});

	it('leaves the kept and undecided attributes out, so setAttributes keeps them', () => {
		const changes = buildStripStylesAttributes(STYLED.content);
		['tagName', 'align', 'anchor', 'fontSizeUnit', 'screenReaderClass', 'layeredConfigId', 'animationConfigId', 'lock', 'metadata'].forEach((key) => {
			expect(Object.prototype.hasOwnProperty.call(changes, key)).toBe(false);
		});
	});

	it('removes every style setting named in #411', () => {
		const after = { ...STYLED, ...buildStripStylesAttributes(STYLED.content) };
		expect(after).toMatchObject({
			fontId: 0, fontFamily: '', fontWeight: '', fontStyle: '', fontSize: 'inherit', letterSpacing: 0, lineHeight: 0,
			features: [], textCase: '', fakeSmallCaps: true, initialHang: 0, fitLineHangs: [], fitLineSizes: [], fitWordSizes: [],
			fitMaxSize: 0, fontVariationSettings: '', styleClass: '',
		});
		['style', 'textColor', 'backgroundColor', 'className', 'textAlign'].forEach((key) => expect(after[key]).toBeUndefined());
		expect(after).toMatchObject({ tagName: 'h3', align: 'wide', anchor: 'my-anchor', fontSizeUnit: 'px', screenReaderClass: 'sr-only', layeredConfigId: 3, animationConfigId: 4 });
	});
});

describe('save() for a stripped block', () => {
	it('writes no style, no font data and no style class: the theme renders the tag', () => {
		const after = { ...STYLED, ...buildStripStylesAttributes(STYLED.content) };
		const html = renderToStaticMarkup(save({ attributes: after }));
		// The visual copy: no inline style at all. (The RichText.Content mock
		// writes the value as escaped text, so only the tags are compared.)
		expect(html).toContain('<h3 class="typost-styled" aria-hidden="true" data-layered-config-id="3" data-animation-config-id="4">');
		expect(html).not.toMatch(/style=|font-weight|data-font|data-style-id|typost-ps-|typost-fit/);
	});

	it("writes no font-weight for '', and font-weight 400 for '400' or no attribute (the reason the reset uses '')", () => {
		const base = { ...defaults(), content: 'x', tagName: 'h2' };
		expect(renderToStaticMarkup(save({ attributes: { ...base, fontWeight: '' } }))).not.toContain('font-weight');
		expect(renderToStaticMarkup(save({ attributes: { ...base, fontWeight: '400' } }))).toContain('font-weight:400');
		expect(renderToStaticMarkup(save({ attributes: base }))).toContain('font-weight:400');
	});
});

describe('stripBlockStyles', () => {
	beforeEach(() => speak.mockClear());

	it('calls setAttributes once (one undo step) and speaks the result politely', () => {
		const setAttributes = jest.fn();
		stripBlockStyles({ content: STYLED.content, setAttributes });
		expect(setAttributes).toHaveBeenCalledTimes(1);
		expect(setAttributes).toHaveBeenCalledWith(buildStripStylesAttributes(STYLED.content));
		expect(speak).toHaveBeenCalledTimes(1);
		expect(speak).toHaveBeenCalledWith('All styling removed from the block.', 'polite');
	});
});

describe('Reset Entire Block in the sidebar is the same action (#411)', () => {
	it('writes what the toolbar action writes, in one call, and closes both confirmations', () => {
		const setAttributes = jest.fn();
		const setShowFullResetConfirm = jest.fn();
		const setShowInlineResetConfirm = jest.fn();
		const { resetEntireBlock } = createResetActions({ content: STYLED.content, resolvedApplyRange: null, setAttributes, setShowFullResetConfirm, setShowInlineResetConfirm });
		resetEntireBlock();
		expect(setAttributes).toHaveBeenCalledTimes(1);
		expect(setAttributes).toHaveBeenCalledWith(buildStripStylesAttributes(STYLED.content));
		// Not the old responsive 16 / 32 / 64 (#411)
		expect(setAttributes.mock.calls[0][0].fontSize).toBe('inherit');
		expect(setShowFullResetConfirm).toHaveBeenCalledWith(false);
		expect(setShowInlineResetConfirm).toHaveBeenCalledWith(false);
	});
});

describe('resetEmptySourceBlock (blocks.switchToBlockType.transformedBlock)', () => {
	const typost = (attributes) => ({ name: 'typost/block', clientId: 'n', attributes: { ...defaults(), ...attributes }, innerBlocks: [] });
	// What WordPress 7.1.3 adds after the plugin's transform: the class and colors
	const carried = { className: 'typost-styled typost-ps-2', textColor: 'ink-2', backgroundColor: 'paper-2', style: { color: { text: '#a00' } } };

	it.each([
		['an empty Paragraph', { name: 'core/paragraph', attributes: { content: '' } }, 'p'],
		['a Paragraph of spaces', { name: 'core/paragraph', attributes: { content: '  &nbsp;' } }, 'p'],
		['a Heading with a line break', { name: 'core/heading', attributes: { content: '<br>', level: 4 } }, 'h4'],
	])('takes away what WordPress copied from %s', (_, source, tagName) => {
		const result = typost({ tagName, fontSizeUnit: 'px', fontWeight: '', ...carried, metadata: { name: 'Intro' } });
		const out = resetEmptySourceBlock(result, [source], 0, [result]);
		expect(out.attributes).toMatchObject({ tagName, fontSizeUnit: 'px', content: '', fontWeight: '', metadata: { name: 'Intro' } });
		['className', 'textColor', 'backgroundColor', 'style'].forEach((key) => expect(out.attributes[key]).toBeUndefined());
		expect(out.clientId).toBe('n');
	});

	it('leaves a source with text alone', () => {
		const result = typost({ content: 'Hi', ...carried });
		expect(resetEmptySourceBlock(result, [{ name: 'core/paragraph', attributes: { content: 'Hi' } }], 0, [result])).toBe(result);
	});

	it('leaves other result blocks alone', () => {
		const result = { name: 'core/paragraph', attributes: { content: '', ...carried } };
		expect(resetEmptySourceBlock(result, [{ name: 'core/heading', attributes: { content: '' } }], 0, [result])).toBe(result);
	});

	it('leaves a source that is not a core Paragraph or Heading alone', () => {
		const result = typost({ ...carried });
		expect(resetEmptySourceBlock(result, [{ name: 'other/block', attributes: {} }], 0, [result])).toBe(result);
	});

	it('leaves several sources or several results alone', () => {
		const result = typost({ ...carried });
		const empty = { name: 'core/paragraph', attributes: { content: '' } };
		expect(resetEmptySourceBlock(result, [empty, empty], 0, [result])).toBe(result);
		expect(resetEmptySourceBlock(result, [empty], 0, [result, result])).toBe(result);
	});

	it('accepts a single source block that is not in an array', () => {
		const result = typost({ ...carried });
		const out = resetEmptySourceBlock(result, { name: 'core/paragraph', attributes: { content: '' } }, 0, [result]);
		expect(out.attributes.className).toBeUndefined();
	});

	it('returns a missing result unchanged', () => {
		expect(resetEmptySourceBlock(undefined, [], 0, [])).toBeUndefined();
	});
});

describe('save() for a block made from an empty source', () => {
	it('writes the tag with no style', () => {
		const attrs = { ...defaults(), ...require('../../../assets/js/theme-look.js').buildEmptySourceBlockAttributes('h2', 'rem') };
		const html = renderToStaticMarkup(save({ attributes: attrs }));
		expect(html).toBe('<div class="wp-block-typost"><h2 class="visually-hidden"></h2><h2 class="typost-styled" aria-hidden="true"></h2></div>');
	});
});

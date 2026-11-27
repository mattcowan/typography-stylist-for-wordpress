/**
 * Settings a Typography Stylist block changes on top of its paragraph style
 * (#451): the overrideKeys attribute, what save() and the editor write for
 * it, how a change of the author fills it, the re-sync after Update Style,
 * and the reset control.
 */

import { create } from 'react-test-renderer';

jest.mock('@wordpress/block-editor');

import save from '../save';
import buildEditorStyle from '../editor-style';
import {
	STYLE_OVERRIDE_KEYS,
	STYLE_OVERRIDE_ATTRIBUTES,
	normalizeOverrideKeys,
	overrideKeysToMap,
	resolveOverrideKeysPatch,
	isStyleUpdateSource,
	resolveStyleSyncUpdate,
	resolveDerivedStyleSync,
	buildStyleOverrideReset,
	stylePropertyOverrides
} from '../utils';

const blockJson = require('../block.json');

// The style the block uses, and the block's copy of its values
const STYLE = {
	id: 7,
	name: 'Body',
	properties: { fontId: 37, fontWeight: '300', features: ['onum'], letterSpacing: 20, fontSize: 'responsive', fontSizeMin: 16, fontSizePreferred: 20, fontSizeMax: 24, fontSizeUnit: 'rem', textCase: 'uppercase', initialHang: 0.1 }
};
const STYLES = [STYLE];

const styledBlock = (overrides) => ({
	content: 'Moonlit garden party',
	tagName: 'h2',
	features: ['onum'],
	fontFamily: 'Garamond',
	fontId: 37,
	fontSize: 'responsive',
	fontSizeMin: 16,
	fontSizePreferred: 20,
	fontSizeMax: 24,
	fontSizeUnit: 'rem',
	fitLineSizes: [],
	fitMaxSize: 0,
	fitWordSizes: [],
	initialHang: 0.1,
	fitLineHangs: [],
	textCase: 'uppercase',
	fakeSmallCaps: true,
	fontWeight: '300',
	fontStyle: '',
	letterSpacing: 20,
	lineHeight: 0,
	screenReaderClass: 'visually-hidden',
	styleClass: 'typost-ps-7',
	overrideKeys: [],
	fontVariationSettings: '',
	layeredConfigId: 0,
	animationConfigId: 0,
	...overrides
});

const savedVisual = (attributes) => create(save({ attributes })).toJSON().children[1];
const savedStyle = (attributes) => savedVisual(attributes).props.style;

describe('block.json', () => {
	test('overrideKeys is an array with an empty default', () => {
		expect(blockJson.attributes.overrideKeys).toEqual({ type: 'array', default: [] });
	});

	test('every override key stands for attributes the block has, and the keys are those of stylePropertyOverrides()', () => {
		STYLE_OVERRIDE_KEYS.forEach((key) => {
			STYLE_OVERRIDE_ATTRIBUTES[key].forEach((attr) => {
				expect(blockJson.attributes[attr]).toBeDefined();
			});
		});
		// Every key that stylePropertyOverrides() can report is a key here
		const everything = stylePropertyOverrides(
			{ fontId: 1, fontWeight: '900', fontStyle: 'italic', fontSize: 'fit', letterSpacing: 9, lineHeight: 9, features: ['x'], fontVariationSettings: 'x', initialHang: 0.2, textCase: 'lowercase' },
			{}
		);
		expect(Object.keys(everything).sort()).toEqual(STYLE_OVERRIDE_KEYS.slice().sort());
	});

	test('fit line data is content and in no key', () => {
		const all = [].concat(...Object.values(STYLE_OVERRIDE_ATTRIBUTES));
		['fitLineSizes', 'fitWordSizes', 'fitLineHangs', 'content', 'styleClass', 'fontSizeUnit'].forEach((attr) => {
			expect(all).not.toContain(attr);
		});
	});
});

describe('normalizeOverrideKeys / overrideKeysToMap', () => {
	test('known keys only, once each, in save order', () => {
		expect(normalizeOverrideKeys(['textCase', 'fontWeight', 'bogus', 'fontWeight', 'features'])).toEqual(['features', 'fontWeight', 'textCase']);
		expect(overrideKeysToMap(['fontWeight'])).toEqual({ fontWeight: true });
	});

	test.each([[undefined], [null], [''], ['fontWeight'], [{}], [[]]])('%p gives no keys', (value) => {
		expect(normalizeOverrideKeys(value)).toEqual([]);
		expect(overrideKeysToMap(value)).toEqual({});
	});
});

describe('save() under a paragraph style', () => {
	test('an empty list writes what save() wrote before #451: text-align only', () => {
		const block = styledBlock({ fontWeight: '700', features: ['dlig'], letterSpacing: 99, textAlign: 'center' });
		expect(savedStyle(block)).toEqual({ textAlign: 'center' });
		// A missing attribute (a block saved before #451, parsed with no default) is the same
		const tree = JSON.stringify(create(save({ attributes: block })).toJSON());
		expect(JSON.stringify(create(save({ attributes: { ...block, overrideKeys: undefined } })).toJSON())).toBe(tree);
		expect(savedStyle(styledBlock({}))).toEqual({});
	});

	test('listed settings are written inline; the rest come from the class', () => {
		const style = savedStyle(styledBlock({ fontWeight: '700', features: ['dlig'], letterSpacing: 99, overrideKeys: ['fontWeight', 'features'] }));
		expect(style).toEqual({ fontFeatureSettings: '"dlig" 1', fontWeight: '700' });
	});

	test('the visual copy keeps the style class and data-style-id', () => {
		const visual = savedVisual(styledBlock({ fontWeight: '700', overrideKeys: ['fontWeight'] }));
		expect(visual.props.className).toBe('typost-styled typost-ps-7');
		expect(visual.props['data-style-id']).toBe('7');
	});

	test('values that say "none" on top of a style are written so they win over the class', () => {
		// No features over a style with features; Default case as Normal; no hang
		const style = savedStyle(styledBlock({ features: [], textCase: '', initialHang: 0, overrideKeys: ['features', 'textCase', 'initialHang'] }));
		expect(style).toEqual({ fontFeatureSettings: 'normal', textTransform: 'none', fontVariantCaps: 'normal', '--typost-hang': '0' });
	});

	test('a size, a font, a case, an axis setting and line height', () => {
		const style = savedStyle(styledBlock({
			fontSize: 'responsive', fontSizeMin: 20, fontSizePreferred: 30, fontSizeMax: 48,
			fontId: 12, lineHeight: 1.3, textCase: 'small-caps', fakeSmallCaps: false, fontStyle: 'italic',
			fontVariationSettings: '"wght" 650', initialHang: 0.25,
			overrideKeys: ['fontSize', 'fontId', 'lineHeight', 'textCase', 'fontStyle', 'fontVariationSettings', 'initialHang']
		}));
		const { fontSize, ...rest } = style;
		expect(rest).toEqual({
			fontFamily: 'var(--font-12)',
			fontStyle: 'italic',
			lineHeight: '1.3',
			textTransform: 'none',
			fontVariantCaps: 'small-caps',
			fontSynthesisSmallCaps: 'none',
			fontVariationSettings: '"wght" 650',
			'--typost-hang': '0.25'
		});
		// The block's unit (rem), 20 / 48 px
		expect(fontSize).toMatch(/^clamp\(1\.25rem, .*, 3rem\)$/);
	});

	test('a fixed size override is written in the block unit', () => {
		expect(savedStyle(styledBlock({ fontSize: '24', overrideKeys: ['fontSize'] })).fontSize).toBe('1.5rem');
		expect(savedStyle(styledBlock({ fontSize: '24', fontSizeUnit: 'px', overrideKeys: ['fontSize'] })).fontSize).toBe('24px');
	});

	test('no spacing, no line height, upright and no axes on top of a style write their keyword (round 1, 8.1)', () => {
		const style = savedStyle(styledBlock({ letterSpacing: 0, lineHeight: 0, fontStyle: '', fontVariationSettings: '', overrideKeys: ['fontStyle', 'letterSpacing', 'lineHeight', 'fontVariationSettings'] }));
		expect(style).toEqual({ fontStyle: 'normal', letterSpacing: 'normal', lineHeight: 'normal', fontVariationSettings: 'normal' });
	});

	test('the theme\'s weight, font and size have no keyword and write nothing, as the editor', () => {
		// They are never listed (resolveOverrideKeysPatch); a hand-made list writes nothing
		const style = savedStyle(styledBlock({ fontSize: 'inherit', fontWeight: '', fontId: 0, fontFamily: '', overrideKeys: ['fontSize', 'fontWeight', 'fontId'] }));
		expect(style).toEqual({});
	});

	test('without a styleClass the list changes nothing', () => {
		const plain = styledBlock({ styleClass: '', fontWeight: '700', features: [] });
		const tree = JSON.stringify(create(save({ attributes: { ...plain, overrideKeys: [] } })).toJSON());
		expect(JSON.stringify(create(save({ attributes: { ...plain, overrideKeys: ['features', 'fontWeight', 'textCase', 'initialHang'] } })).toJSON())).toBe(tree);
	});
});

describe('the editor renders what save() writes (#451)', () => {
	// Editor style object for the same block, with the list as the map
	const editorStyleOf = (attributes) => buildEditorStyle({
		...attributes,
		sizePreviewUnit: attributes.fontSizeUnit,
		styleOverrides: attributes.styleClass ? overrideKeysToMap(attributes.overrideKeys) : null
	});
	// React keeps numbers as numbers in the editor (lineHeight)
	const asStrings = (style) => Object.fromEntries(Object.entries(style).map(([k, v]) => [k, String(v)]));

	test.each([
		[[]],
		[['fontWeight']],
		[['features']],
		[['fontWeight', 'features', 'letterSpacing']],
		[['textCase']],
		[['initialHang']],
		[['fontSize']],
		[['fontId', 'fontStyle', 'lineHeight', 'fontVariationSettings']],
		[STYLE_OVERRIDE_KEYS]
	])('list %p', (keys) => {
		const block = styledBlock({ fontWeight: '700', features: [], letterSpacing: 50, textCase: '', initialHang: 0, fontSize: '24', fontId: 12, fontStyle: 'italic', lineHeight: 1.2, fontVariationSettings: '"wght" 650', overrideKeys: keys });
		expect(asStrings(editorStyleOf(block))).toEqual(savedStyle(block));
	});

	test.each([
		[['letterSpacing', 'lineHeight', 'fontStyle', 'fontVariationSettings']],
		[['fontWeight', 'fontId', 'fontSize']],
		[STYLE_OVERRIDE_KEYS]
	])('list %p with the "none" and theme values', (keys) => {
		const block = styledBlock({ fontWeight: '', fontId: 0, fontFamily: '', fontSize: 'inherit', letterSpacing: 0, lineHeight: 0, fontStyle: '', fontVariationSettings: '', features: [], textCase: '', initialHang: 0, overrideKeys: keys });
		expect(asStrings(editorStyleOf(block))).toEqual(savedStyle(block));
	});
});

describe('resolveOverrideKeysPatch: a change of the author', () => {
	const current = styledBlock({});

	test('a value that differs from the style is listed', () => {
		expect(resolveOverrideKeysPatch(current, { fontWeight: '700' }, STYLES)).toEqual({ fontWeight: '700', overrideKeys: ['fontWeight'] });
	});

	test('a value equal to the style is not listed, and leaves the list when it was', () => {
		expect(resolveOverrideKeysPatch(current, { fontWeight: '300' }, STYLES)).toEqual({ fontWeight: '300' });
		const overridden = styledBlock({ fontWeight: '700', features: ['dlig'], overrideKeys: ['features', 'fontWeight'] });
		expect(resolveOverrideKeysPatch(overridden, { fontWeight: '300' }, STYLES)).toEqual({ fontWeight: '300', overrideKeys: ['features'] });
	});

	test('keys the change does not set keep their state, also a stale copy that differs from the style', () => {
		// letterSpacing 99 is an old copy (the style changed later): not an override
		const stale = styledBlock({ letterSpacing: 99, features: ['dlig'], overrideKeys: ['features'] });
		expect(resolveOverrideKeysPatch(stale, { fontWeight: '700' }, STYLES).overrideKeys).toEqual(['features', 'fontWeight']);
	});

	test('a key with several attributes: case and fake small caps, the size and its bounds, the font id and family', () => {
		const smallCaps = styledBlock({ textCase: 'small-caps', overrideKeys: ['textCase'] });
		expect(resolveOverrideKeysPatch(smallCaps, { fakeSmallCaps: false }, STYLES).overrideKeys).toBeUndefined();
		expect(resolveOverrideKeysPatch(current, { fontSizeMax: 40 }, STYLES).overrideKeys).toEqual(['fontSize']);
		expect(resolveOverrideKeysPatch(current, { fontId: 12, fontFamily: 'Other' }, STYLES).overrideKeys).toEqual(['fontId']);
	});

	test('a size override takes the style\'s unit, as Detach does', () => {
		const pxBlock = styledBlock({ fontSizeUnit: 'px' });
		expect(resolveOverrideKeysPatch(pxBlock, { fontSize: 'fit' }, STYLES)).toEqual({ fontSize: 'fit', overrideKeys: ['fontSize'], fontSizeUnit: 'rem' });
		// Already in the style's unit: nothing more
		expect(resolveOverrideKeysPatch(current, { fontSize: 'fit' }, STYLES)).toEqual({ fontSize: 'fit', overrideKeys: ['fontSize'] });
		// A style saved before #233 has no unit: px
		const oldStyle = [{ ...STYLE, properties: { ...STYLE.properties, fontSizeUnit: undefined } }];
		expect(resolveOverrideKeysPatch(current, { fontSize: 'fit' }, oldStyle).fontSizeUnit).toBe('px');
	});

	test('the theme\'s weight, font or size under a style is not an override, and leaves the list (round 1, 8.1)', () => {
		// No keyword can write them past the class, so they would say "own value" while the style shows
		expect(resolveOverrideKeysPatch(current, { fontWeight: '' }, STYLES)).toEqual({ fontWeight: '' });
		expect(resolveOverrideKeysPatch(current, { fontId: 0, fontFamily: '' }, STYLES)).toEqual({ fontId: 0, fontFamily: '' });
		expect(resolveOverrideKeysPatch(current, { fontSize: 'inherit' }, STYLES)).toEqual({ fontSize: 'inherit' });
		const overridden = styledBlock({ fontWeight: '700', fontSize: 'fit', overrideKeys: ['fontWeight', 'fontSize'] });
		expect(resolveOverrideKeysPatch(overridden, { fontWeight: '' }, STYLES).overrideKeys).toEqual(['fontSize']);
		expect(resolveOverrideKeysPatch(overridden, { fontSize: 'inherit' }, STYLES).overrideKeys).toEqual(['fontWeight']);
		// Values with a keyword are overrides
		expect(resolveOverrideKeysPatch(current, { letterSpacing: 0 }, STYLES).overrideKeys).toEqual(['letterSpacing']);
	});

	test('a style apply, Detach or Remove all styling empties the list', () => {
		const overridden = styledBlock({ fontWeight: '700', overrideKeys: ['fontWeight'] });
		expect(resolveOverrideKeysPatch(overridden, { styleClass: 'typost-ps-8', fontWeight: '300' }, STYLES)).toEqual({ styleClass: 'typost-ps-8', fontWeight: '300', overrideKeys: [] });
		expect(resolveOverrideKeysPatch(overridden, { styleClass: '' }, STYLES)).toEqual({ styleClass: '', overrideKeys: [] });
		// Nothing listed: the change is left as it is
		const patch = { styleClass: '' };
		expect(resolveOverrideKeysPatch(current, patch, STYLES)).toBe(patch);
	});

	test('changes that touch no style setting, and changes with their own list, are left as they are', () => {
		const content = { content: 'New text' };
		expect(resolveOverrideKeysPatch(current, content, STYLES)).toBe(content);
		const fit = { fitLineSizes: [0.2], fitWordSizes: [0.3] };
		expect(resolveOverrideKeysPatch(current, fit, STYLES)).toBe(fit);
		const own = { fontWeight: '700', overrideKeys: [] };
		expect(resolveOverrideKeysPatch(current, own, STYLES)).toBe(own);
	});

	test('no style, or a class that names no known style: nothing is listed', () => {
		const plain = styledBlock({ styleClass: '' });
		const patch = { fontWeight: '700' };
		expect(resolveOverrideKeysPatch(plain, patch, STYLES)).toBe(patch);
		expect(resolveOverrideKeysPatch(styledBlock({ styleClass: 'typost-ps-99' }), patch, STYLES)).toBe(patch);
		expect(resolveOverrideKeysPatch(current, patch, undefined)).toBe(patch);
		expect(resolveOverrideKeysPatch(null, patch, STYLES)).toBe(patch);
		expect(resolveOverrideKeysPatch(current, null, STYLES)).toBe(null);
	});
});

describe('isStyleUpdateSource: which block ran Update Style', () => {
	test('the selected block, when the event has no detail (other senders, before #452)', () => {
		expect(isStyleUpdateSource(undefined, STYLE, true)).toBe(true);
		expect(isStyleUpdateSource(null, STYLE, true)).toBe(true);
		expect(isStyleUpdateSource(undefined, STYLE, false)).toBe(false);
	});

	test('with the #452 detail: the block\'s own style, from its sidebar or its Quick Feature Toggles', () => {
		expect(isStyleUpdateSource({ styleId: 7, editorSource: 'inspector' }, STYLE, true)).toBe(true);
		expect(isStyleUpdateSource({ styleId: '7', editorSource: 'qft' }, STYLE, true)).toBe(true);
		expect(isStyleUpdateSource({ styleId: 8, editorSource: 'inspector' }, STYLE, true)).toBe(false);
		expect(isStyleUpdateSource({ styleId: 7, editorSource: 'inline' }, STYLE, true)).toBe(false);
		expect(isStyleUpdateSource({ styleId: 7, editorSource: 'core-block' }, STYLE, true)).toBe(false);
		expect(isStyleUpdateSource({ styleId: 7, editorSource: 'inspector' }, STYLE, false)).toBe(false);
	});
});

describe('resolveStyleSyncUpdate: after Update Style', () => {
	// The style after the update: weight 500, letter spacing 40
	const updated = { ...STYLE, properties: { ...STYLE.properties, fontWeight: '500', letterSpacing: 40 } };
	const props = { ...updated.properties, fontStyle: '', lineHeight: 0, fontVariationSettings: '', fakeSmallCaps: true };
	const idMap = { 37: { family: 'Garamond' } };

	test('another block keeps its overrides and takes the new values for the rest', () => {
		const other = styledBlock({ fontWeight: '700', overrideKeys: ['fontWeight'] });
		const update = resolveStyleSyncUpdate(other, updated, props, idMap, false);
		expect(update.fontWeight).toBeUndefined();
		expect(update.letterSpacing).toBe(40);
		expect(update.overrideKeys).toBeUndefined();
	});

	test('another block keeps an override that now equals the style', () => {
		const other = styledBlock({ fontWeight: '500', overrideKeys: ['fontWeight'] });
		const update = resolveStyleSyncUpdate(other, updated, props, idMap, false);
		expect(update.overrideKeys).toBeUndefined();
		expect(update.fontWeight).toBeUndefined();
	});

	test('the source block clears the keys it saved into the style, and keeps the others', () => {
		// It saved weight 500 into the style; its features stay its own
		const source = styledBlock({ fontWeight: '500', letterSpacing: 40, features: ['dlig'], overrideKeys: ['features', 'fontWeight', 'letterSpacing'] });
		const update = resolveStyleSyncUpdate(source, updated, props, idMap, true);
		expect(update.overrideKeys).toEqual(['features']);
		expect(update.fontWeight).toBe('500');
		expect(update.features).toBeUndefined();
	});

	test('a block in line with the style needs no change', () => {
		const inLine = styledBlock({ fontWeight: '500', letterSpacing: 40 });
		expect(resolveStyleSyncUpdate(inLine, updated, props, idMap, false)).toBeNull();
		expect(resolveStyleSyncUpdate(inLine, updated, props, idMap, true)).toBeNull();
		expect(resolveStyleSyncUpdate(null, updated, props, idMap, true)).toBeNull();
	});

	test('the font family follows the font id', () => {
		const other = styledBlock({ fontId: 12, fontFamily: 'Other' });
		expect(resolveStyleSyncUpdate(other, updated, props, idMap, false)).toMatchObject({ fontId: 37, fontFamily: 'Garamond' });
	});
});

describe('resolveDerivedStyleSync: a stale copy follows the style when the block shows (round 1, 8.2)', () => {
	const props = { ...STYLE.properties, fontStyle: '', lineHeight: 0, fontVariationSettings: '', fakeSmallCaps: true };
	const idMap = { 37: { family: 'Garamond' } };

	test('an unlisted value that differs from the style takes the style\'s value; listed keys stay', () => {
		// Saved before the style changed its weight to 300: not an override
		const stale = styledBlock({ fontWeight: '700', features: ['dlig'], overrideKeys: ['features'] });
		expect(resolveDerivedStyleSync(stale, STYLE, props, idMap)).toEqual({ fontWeight: '300' });
	});

	test('only real changes: a block in line with the style, or one the style cannot correct, gives null', () => {
		expect(resolveDerivedStyleSync(styledBlock({}), STYLE, props, idMap)).toBeNull();
		// The style's bounds are missing (not normalized on apply): the copy cannot be corrected, so nothing is written again and again
		const noBounds = { ...STYLE, properties: { fontSize: 'responsive' } };
		expect(resolveDerivedStyleSync(styledBlock({ fontSizeMin: 30 }), noBounds, { fontSize: 'responsive' }, idMap)).toBeNull();
		expect(resolveDerivedStyleSync(null, STYLE, props, idMap)).toBeNull();
	});

	test('never touches the list: it keeps the author\'s overrides', () => {
		const update = resolveDerivedStyleSync(styledBlock({ letterSpacing: 99, fontWeight: '900', overrideKeys: ['fontWeight'] }), STYLE, props, idMap);
		expect(update).toEqual({ letterSpacing: 20 });
	});

	test('never changes fit to width, which save() writes under the class (#451 round 1, smoke post 17716)', () => {
		// A fit block under a responsive style: fit writes the lines and the typost-fit class
		const fitBlock = styledBlock({ fontSize: 'fit', fontWeight: '700' });
		expect(resolveDerivedStyleSync(fitBlock, STYLE, props, idMap)).toEqual({ fontWeight: '300' });
		// A responsive block under a fit style, and a fit cap that differs
		const fitStyle = { ...STYLE, properties: { ...STYLE.properties, fontSize: 'fit', fitMaxSize: 120 } };
		const fitProps = { ...props, fontSize: 'fit', fitMaxSize: 120 };
		expect(resolveDerivedStyleSync(styledBlock({}), fitStyle, fitProps, idMap)).toBeNull();
		expect(resolveDerivedStyleSync(styledBlock({ fontSize: 'fit', fitMaxSize: 0 }), fitStyle, fitProps, idMap)).toBeNull();
		// The family is not filled in when another key changes
		expect(resolveDerivedStyleSync(styledBlock({ fontFamily: '', fontWeight: '700' }), STYLE, props, idMap)).toEqual({ fontWeight: '300' });
		// A responsive size whose bounds differ is followed (no markup under the class)
		expect(resolveDerivedStyleSync(styledBlock({ fontSizeMax: 64 }), STYLE, props, idMap)).toEqual({ fontSizeMax: 24 });
	});

	test('an old font follows the style: under the class data-font-id and data-font only feed the font scan (round 2, user decision)', () => {
		expect(resolveDerivedStyleSync(styledBlock({ fontId: 12, fontFamily: 'Other' }), STYLE, props, idMap)).toEqual({ fontId: 37, fontFamily: 'Garamond' });
	});

	test('a style with no font clears the old family too, in both re-syncs (round 3)', () => {
		// normalizeApplyProperties() gives fontId 0 and no family for a style without a font
		const noFont = { id: 7, properties: { fontWeight: '300' } };
		const noFontProps = { ...props, fontId: 0, fontWeight: '300' };
		const old = styledBlock({ fontId: 37, fontFamily: 'Garamond', fontWeight: '300' });
		expect(resolveDerivedStyleSync(old, noFont, noFontProps, idMap)).toMatchObject({ fontId: 0, fontFamily: '' });
		expect(resolveStyleSyncUpdate(old, noFont, noFontProps, idMap, false)).toMatchObject({ fontId: 0, fontFamily: '' });
		// A family the style carries itself is kept
		expect(resolveDerivedStyleSync(old, noFont, { ...noFontProps, fontFamily: 'Own Family' }, idMap)).toMatchObject({ fontId: 0, fontFamily: 'Own Family' });
		// Control: a style with a font takes the family from fontIdMap
		expect(resolveStyleSyncUpdate(styledBlock({ fontId: 12, fontFamily: 'Other' }), STYLE, props, idMap, false)).toMatchObject({ fontId: 37, fontFamily: 'Garamond' });
	});
});

describe('the fit rule is shared by both re-syncs (round 2, finding A)', () => {
	const idMap = { 37: { family: 'Garamond' } };
	// A style with no size: normalizeApplyProperties() gives fontSize 'inherit'
	const noSize = { id: 7, properties: { fontId: 37, fontWeight: '300' } };
	const noSizeProps = { fontId: 37, fontWeight: '300', fontSize: 'inherit', fontStyle: '', letterSpacing: 0, lineHeight: 0, features: [], fontVariationSettings: '', initialHang: 0, textCase: '', fakeSmallCaps: true };
	const fitBlock = () => styledBlock({ fontSize: 'fit', fitMaxSize: 120, fontWeight: '300', features: [], letterSpacing: 0, textCase: '', initialHang: 0 });

	test('Update Style elsewhere does not turn an unlisted fit block into a non-fit block, nor change its cap', () => {
		const update = resolveStyleSyncUpdate(fitBlock(), noSize, noSizeProps, idMap, false);
		expect(update).toBeNull();
		// Another key that differs is still copied, the size is not
		const other = resolveStyleSyncUpdate({ ...fitBlock(), fontWeight: '700' }, noSize, noSizeProps, idMap, false);
		expect(other.fontWeight).toBe('300');
		expect(other.fontSize).toBeUndefined();
		expect(other.fitMaxSize).toBeUndefined();
		// The source block too
		expect(resolveStyleSyncUpdate(fitBlock(), noSize, noSizeProps, idMap, true)).toBeNull();
	});

	test('a non-fit block does not become fit when its style is fit', () => {
		const fitStyle = { id: 7, properties: { fontSize: 'fit', fontWeight: '300' } };
		const fitProps = { ...noSizeProps, fontId: 0, fontSize: 'fit' };
		const update = resolveStyleSyncUpdate(styledBlock({ fontSize: 'responsive', fontWeight: '300', fontId: 0 }), fitStyle, fitProps, idMap, false);
		expect(update === null || update.fontSize === undefined).toBe(true);
	});

	test('a non-fit size still follows a non-fit style through the event', () => {
		const update = resolveStyleSyncUpdate(styledBlock({ fontSize: '24' }), STYLE, { ...STYLE.properties, fontStyle: '', lineHeight: 0, fontVariationSettings: '', fakeSmallCaps: true }, idMap, false);
		expect(update.fontSize).toBe('responsive');
	});
});

describe('buildStyleOverrideReset: the reset control', () => {
	const props = { ...STYLE.properties, fontStyle: '', lineHeight: 0, fontVariationSettings: '', fakeSmallCaps: true };

	test('the setting takes the style\'s values and leaves the list', () => {
		const block = styledBlock({ fontWeight: '700', features: ['dlig'], overrideKeys: ['features', 'fontWeight'] });
		expect(buildStyleOverrideReset(block, 'fontWeight', props, {})).toEqual({ fontWeight: '300', overrideKeys: ['features'] });
		expect(buildStyleOverrideReset(block, 'features', props, {})).toEqual({ features: ['onum'], overrideKeys: ['fontWeight'] });
	});

	test('a key with several attributes resets all of them', () => {
		const block = styledBlock({ textCase: 'small-caps', fakeSmallCaps: false, overrideKeys: ['textCase'] });
		expect(buildStyleOverrideReset(block, 'textCase', props, {})).toEqual({ textCase: 'uppercase', fakeSmallCaps: true, overrideKeys: [] });
	});

	test('an unknown key does nothing', () => {
		expect(buildStyleOverrideReset(styledBlock({}), 'content', props, {})).toBeNull();
	});
});

/**
 * #278: the shared editor state reports the font and weight *rendering* at
 * the selection (fontId, fontWeight) for consumers that draw (the Glyphs
 * panel), and the font and weight *set* on the text (explicitFontId,
 * explicitFontWeight) for consumers that persist (Paragraph Styles). Before,
 * Paragraph Styles read the rendered values, so a theme's font or weight
 * showed "(modified)" on apply, and Detach and Save wrote it into content
 * and styles.
 */

import { buildQftEditorState } from '../utils';

const psUtils = require('../../../paragraph-styles/assets/js/lib/ps-utils.js');

describe('buildQftEditorState: explicitFontId', () => {
	test('the theme-inherited font is rendered, not explicit', () => {
		const state = buildQftEditorState({ fontId: 0, inheritedFontId: 7 });
		// fontId keeps its meaning (HOOKS.md contract)
		expect(state.fontId).toBe(7);
		expect(state.explicitFontId).toBe(0);
	});

	test('a block font is explicit', () => {
		expect(buildQftEditorState({ fontId: 12, inheritedFontId: 7 }).explicitFontId).toBe(12);
	});

	test('an inline span font at the cursor is explicit and wins over the block font', () => {
		expect(buildQftEditorState({ fontId: 12, inlineFontId: '40' }).explicitFontId).toBe(40);
	});

	test('reports 0 when no font is set', () => {
		expect(buildQftEditorState({}).explicitFontId).toBe(0);
	});
});

describe('buildQftEditorState: explicitFontWeight', () => {
	test('<strong> bold renders but is not explicit', () => {
		const state = buildQftEditorState({ fontWeight: '400', selectionRenderedFontWeight: '700' });
		expect(state.fontWeight).toBe('700');
		expect(state.explicitFontWeight).toBe('400');
	});

	test('a weight stored on the selected text is explicit', () => {
		expect(buildQftEditorState({ fontWeight: '400', selectionRenderedFontWeight: '600', selectionStoredFontWeight: '600' }).explicitFontWeight).toBe('600');
	});

	test('the weight of the paragraph style on the selected text is explicit', () => {
		// A <strong> inside the style span renders 700; the style's weight is the set one
		expect(buildQftEditorState({ fontWeight: '400', selectionRenderedFontWeight: '700', selectionStyleFontWeight: '300' }).explicitFontWeight).toBe('300');
	});

	test('falls back to the block weight', () => {
		expect(buildQftEditorState({ fontWeight: '500' }).explicitFontWeight).toBe('500');
		expect(buildQftEditorState({}).explicitFontWeight).toBe('');
	});
});

describe('Paragraph Styles reads the explicit channels', () => {
	// A core heading whose font (7) and weight (700) come from the theme,
	// under a style that sets only case and letter spacing
	const style = { textCase: 'uppercase', letterSpacing: 50 };
	const inlineState = {
		editorType: 'inline',
		fontId: 7,
		explicitFontId: 0,
		fontWeight: '700',
		selectionFontWeight: '',
		explicitFontWeight: '',
		fontStyle: '',
		explicitFontStyle: '',
		textCase: 'uppercase',
		fakeSmallCaps: true,
		fontSize: 'inherit',
		letterSpacing: 50,
		lineHeight: 0,
		features: [],
		fontVariationSettings: '',
	};

	test('the badge does not show "(modified)" for an inherited font and weight', () => {
		expect(psUtils.isStyleModified(inlineState, style)).toBe(false);
	});

	test('Detach and Save store no inherited font or weight', () => {
		const properties = psUtils.buildPropertiesFromState(inlineState);
		expect(properties).not.toHaveProperty('fontId');
		expect(properties).not.toHaveProperty('fontWeight');
		expect(properties).toEqual({ textCase: 'uppercase', letterSpacing: 50 });
		expect(psUtils.buildPropertiesForStyleSave(inlineState, style, false)).not.toHaveProperty('fontId');
	});

	test('a font and weight set on the text are kept', () => {
		const own = Object.assign({}, inlineState, { fontId: 12, explicitFontId: 12, fontWeight: '600', explicitFontWeight: '600' });
		expect(psUtils.isStyleModified(own, style)).toBe(true);
		expect(psUtils.isStyleModified(own, Object.assign({ fontId: 12, fontWeight: '600' }, style))).toBe(false);
		const properties = psUtils.buildPropertiesFromState(own);
		expect(properties.fontId).toBe(12);
		expect(properties.fontWeight).toBe('600');
	});

	test('a style with a font is "(modified)" when the text has only the theme font', () => {
		expect(psUtils.isStyleModified(inlineState, Object.assign({ fontId: 7 }, style))).toBe(true);
	});

	test('a provider without the explicit keys keeps the rendered values (older states, extensions)', () => {
		const legacy = { fontId: 7, fontWeight: '700' };
		expect(psUtils.buildPropertiesFromState(legacy)).toEqual({ fontId: 7, fontWeight: '700' });
		expect(psUtils.isStyleModified(legacy, {})).toBe(true);
		expect(psUtils.isStyleModified({ selectedFontId: 12, selectedFontWeight: '700' }, { fontId: 12, fontWeight: '700' })).toBe(false);
	});

	test('the QFT state round-trips through Paragraph Styles', () => {
		const qft = buildQftEditorState({ fontId: 0, inheritedFontId: 7, fontWeight: '400', selectionRenderedFontWeight: '700' });
		const properties = psUtils.buildPropertiesFromState(qft);
		expect(properties).not.toHaveProperty('fontId');
		expect(properties.fontWeight).toBe('400');
	});
});

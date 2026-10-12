/**
 * Tests for the weight the block reports for the selected text (#254).
 *
 * A glyph inserted by the Glyphs panel into text under a paragraph style
 * came out at the block's weight: the selection's weight was looked up on
 * data-fontweight spans only, so the style span was skipped and the block
 * attribute was reported, and the panel wrote that weight inline over the
 * style's class. The state now reports the rendered weight (style-aware)
 * as fontWeight and only a stored weight as selectionFontWeight, which is
 * the one the panel writes.
 */

import { parseInlineStylesAtCursor, resolveSelectionFontWeights, buildQftEditorState } from '../utils';

const { resolveParagraphStyleFontWeight, resolveSpanStoredFontWeight } = require('../../../assets/js/inline-apply-rules.js');

const STYLES = [
	{ id: 3, name: 'Light', properties: { fontWeight: '400' } },
	{ id: 5, name: 'No weight', properties: { fontSize: 'fixed' } },
	{ id: 6, name: 'Keyword', properties: { fontWeight: 'bold' } }
];

// The block's QFT state for a selection, as edit.js builds it
const stateFor = (html, start, end, blockWeight = '700', strongBold = null) => {
	const parsed = parseInlineStylesAtCursor(html, start, end);
	const weights = resolveSelectionFontWeights(parsed, strongBold);
	return buildQftEditorState({
		fontWeight: blockWeight,
		selectionRenderedFontWeight: weights.rendered,
		selectionStoredFontWeight: weights.stored
	});
};

describe('resolveParagraphStyleFontWeight', () => {
	test('returns the weight the style sets', () => {
		expect(resolveParagraphStyleFontWeight(STYLES, '3')).toBe('400');
		expect(resolveParagraphStyleFontWeight(STYLES, 3)).toBe('400');
	});

	test('maps normal and bold to numbers, keeps relative keywords', () => {
		expect(resolveParagraphStyleFontWeight(STYLES, 6)).toBe('700');
		expect(resolveParagraphStyleFontWeight([{ id: 1, properties: { fontWeight: 'normal' } }], 1)).toBe('400');
		expect(resolveParagraphStyleFontWeight([{ id: 1, properties: { fontWeight: 'bolder' } }], 1)).toBe('bolder');
	});

	test('returns empty for a style with no weight, an unknown style, or no id', () => {
		expect(resolveParagraphStyleFontWeight(STYLES, 5)).toBe('');
		expect(resolveParagraphStyleFontWeight(STYLES, 99)).toBe('');
		expect(resolveParagraphStyleFontWeight(STYLES, '')).toBe('');
		expect(resolveParagraphStyleFontWeight(STYLES, '0')).toBe('');
		expect(resolveParagraphStyleFontWeight(null, 3)).toBe('');
	});

	test('rejects weights the style CSS would not emit', () => {
		expect(resolveParagraphStyleFontWeight([{ id: 1, properties: { fontWeight: '0' } }], 1)).toBe('');
		expect(resolveParagraphStyleFontWeight([{ id: 1, properties: { fontWeight: '1200' } }], 1)).toBe('');
		expect(resolveParagraphStyleFontWeight([{ id: 1, properties: { fontWeight: 'heavy' } }], 1)).toBe('');
	});
});

describe('selection weight under a paragraph style (#254)', () => {
	beforeEach(() => {
		window.typostData = { paragraphStyles: STYLES };
	});

	afterEach(() => {
		delete window.typostData;
	});

	test('text in a style span reports the style weight and stores none', () => {
		// Block weight 700, style 400: the issue's example
		const html = 'Wo<span class="typost-styled" data-style-id="3">rd</span>s';
		const state = stateFor(html, 2, 3);
		expect(state.fontWeight).toBe('400');
		expect(state.selectionFontWeight).toBe('');
	});

	test('a style that sets no weight leaves the block weight', () => {
		const html = '<span class="typost-styled" data-style-id="5">Words</span>';
		const state = stateFor(html, 1, 2);
		expect(state.fontWeight).toBe('700');
		expect(state.selectionFontWeight).toBe('');
	});

	test('a style span inside a weight span overrides it', () => {
		const html = '<span class="typost-styled" data-fontweight="900" style="font-weight: 900">A<span class="typost-styled" data-style-id="3">bc</span></span>';
		const parsed = parseInlineStylesAtCursor(html, 1, 2);
		expect(parsed.styleFontWeight).toBe('400');
		// The parser's own fontWeight keeps its old meaning (QFT controls)
		expect(parsed.fontWeight).toBe('900');
		const state = stateFor(html, 1, 2);
		expect(state.fontWeight).toBe('400');
		expect(state.selectionFontWeight).toBe('');
	});

	test('a weight span inside a style span is stored', () => {
		const html = '<span class="typost-styled" data-style-id="3">A<span class="typost-styled" data-fontweight="700" style="font-weight: 700">bc</span></span>';
		const state = stateFor(html, 1, 2, '400');
		expect(state.fontWeight).toBe('700');
		expect(state.selectionFontWeight).toBe('700');
	});

	test('a weight on the style span itself wins over the style', () => {
		const html = '<span class="typost-styled" data-style-id="3" data-fontweight="800" style="font-weight: 800">Words</span>';
		const state = stateFor(html, 1, 2);
		expect(state.fontWeight).toBe('800');
		expect(state.selectionFontWeight).toBe('800');
	});

	test('a data-only weight on a style span loses to the style', () => {
		// What the inline apply path writes when a style is applied over a
		// 900 span: the data attribute stays, the inline font-weight does not,
		// so the style's class renders 400 (review of #254)
		const html = '<span class="typost-styled" data-style-id="3" data-fontweight="900">Words</span>';
		const parsed = parseInlineStylesAtCursor(html, 1, 2);
		expect(parsed.fontWeight).toBe('900'); // raw, for the QFT controls
		expect(parsed.styleFontWeight).toBe('400');
		const state = stateFor(html, 1, 2);
		expect(state.fontWeight).toBe('400');
		expect(state.selectionFontWeight).toBe('');
	});

	test('a data-only weight under a style with no weight takes the weight around it', () => {
		const inner = '<span class="typost-styled" data-style-id="5" data-fontweight="900">Words</span>';
		const parsed = parseInlineStylesAtCursor(inner, 1, 2);
		expect(parsed.fontWeight).toBe('900'); // raw
		expect(parsed.storedFontWeight).toBeNull();
		// Block weight, as nothing on the span renders
		expect(stateFor(inner, 1, 2).fontWeight).toBe('700');
		expect(stateFor(inner, 1, 2).selectionFontWeight).toBe('');
		// An outer weight span that renders is found
		const nested = '<span class="typost-styled" data-fontweight="300" style="font-weight: 300">' + inner + '</span>';
		const state = stateFor(nested, 1, 2);
		expect(state.fontWeight).toBe('300');
		expect(state.selectionFontWeight).toBe('300');
	});

	test('<strong> inside a style span renders bold, stores nothing', () => {
		const html = '<span class="typost-styled" data-style-id="3">a <strong>bc</strong></span>';
		const parsed = parseInlineStylesAtCursor(html, 2, 4);
		expect(parsed.boldInsideStyleSpan).toBe(true);
		const state = stateFor(html, 2, 4);
		expect(state.fontWeight).toBe('700');
		expect(state.selectionFontWeight).toBe('');
	});

	test('a selection only partly in <strong> inside a style span keeps the style weight', () => {
		const html = '<span class="typost-styled" data-style-id="3">a <strong>bc</strong></span>';
		expect(stateFor(html, 0, 4).fontWeight).toBe('400');
	});

	test('a style span inside <strong> renders the style weight', () => {
		const html = '<strong>a <span class="typost-styled" data-style-id="3">bc</span></strong>';
		const parsed = parseInlineStylesAtCursor(html, 2, 4);
		expect(parsed.boldInsideStyleSpan).toBe(false);
		// edit.js skips detectStrongBoldAtRange when a style weight is found
		const state = stateFor(html, 2, 4, '700', null);
		expect(state.fontWeight).toBe('400');
		expect(state.selectionFontWeight).toBe('');
	});
});

describe('resolveSpanStoredFontWeight (inline editor format attributes)', () => {
	// getStoredFontWeight() in block-editor.js passes the active format's
	// attributes through this rule
	test('a data-only weight under a style is not stored', () => {
		expect(resolveSpanStoredFontWeight({ dataWeight: '900', styleAttr: undefined, styleId: '3' }, STYLES))
			.toEqual({ stored: '', styleWeight: '400' });
	});

	test('an inline font-weight on the style span keeps the weight stored', () => {
		expect(resolveSpanStoredFontWeight({ dataWeight: '900', styleAttr: 'font-weight: 900', styleId: '3' }, STYLES))
			.toEqual({ stored: '900', styleWeight: '' });
	});

	test('a property that only ends in font-weight is not a font-weight declaration', () => {
		expect(resolveSpanStoredFontWeight({ dataWeight: '900', styleAttr: '--x-font-weight: 900', styleId: '3' }, STYLES).stored)
			.toBe('');
		expect(resolveSpanStoredFontWeight({ dataWeight: '900', styleAttr: 'color: red; font-weight:900', styleId: '3' }, STYLES).stored)
			.toBe('900');
	});

	test('a span with no style keeps the data weight', () => {
		expect(resolveSpanStoredFontWeight({ dataWeight: '900' }, STYLES)).toEqual({ stored: '900', styleWeight: '' });
		expect(resolveSpanStoredFontWeight({ dataWeight: '900', styleId: '0' }, STYLES)).toEqual({ stored: '900', styleWeight: '' });
	});

	test('a data-only weight under a style with no weight, or a deleted style, decides nothing', () => {
		// No CSS reads data-fontweight: the weight around the span shows
		expect(resolveSpanStoredFontWeight({ dataWeight: '900', styleId: '5' }, STYLES)).toEqual({ stored: '', styleWeight: '' });
		expect(resolveSpanStoredFontWeight({ dataWeight: '900', styleId: '99' }, STYLES)).toEqual({ stored: '', styleWeight: '' });
	});

	test('nothing stored and no style gives empty values', () => {
		expect(resolveSpanStoredFontWeight({}, STYLES)).toEqual({ stored: '', styleWeight: '' });
		expect(resolveSpanStoredFontWeight(null, null)).toEqual({ stored: '', styleWeight: '' });
	});
});

describe('selection weight without a paragraph style', () => {
	test('a bold span is rendered and stored', () => {
		const html = 'A <span class="typost-styled" data-fontweight="700" style="font-weight: 700">bold</span> word';
		const state = stateFor(html, 3, 4, '400');
		expect(state.fontWeight).toBe('700');
		expect(state.selectionFontWeight).toBe('700');
	});

	test('<strong> is rendered but not stored', () => {
		const state = stateFor('A <strong>bold</strong> word', 3, 4, '400', '700');
		expect(state.fontWeight).toBe('700');
		expect(state.selectionFontWeight).toBe('');
	});

	test('text with no span reports the block weight and stores none', () => {
		const state = stateFor('Plain words', 1, 2, '700');
		expect(state.fontWeight).toBe('700');
		expect(state.selectionFontWeight).toBe('');
	});

	test('a style span with no styles localized falls back as before', () => {
		const html = '<span class="typost-styled" data-style-id="3">Words</span>';
		const state = stateFor(html, 1, 2, '700');
		expect(state.fontWeight).toBe('700');
		expect(state.selectionFontWeight).toBe('');
	});
});

describe('resolveSelectionFontWeights', () => {
	test('returns nulls for no detection', () => {
		expect(resolveSelectionFontWeights(null, null)).toEqual({ rendered: null, stored: null });
	});

	test('buildQftEditorState reports an empty selectionFontWeight by default', () => {
		expect(buildQftEditorState({ fontWeight: '400' }).selectionFontWeight).toBe('');
		expect(buildQftEditorState({ selectionStoredFontWeight: 600 }).selectionFontWeight).toBe('600');
	});
});

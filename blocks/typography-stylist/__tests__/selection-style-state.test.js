/**
 * #303: with text selected, the Paragraph Style panel in the Quick Feature
 * Toggles works on that text. The block reports the values set on the
 * selected text (resolveSelectionStyleState) in its shared editor state, and
 * the panel captures, diffs and applies on them. Before, the panel captured
 * the block's attributes and applied block-level, so a style saved from one
 * letter restyled the whole block and did not describe the letter.
 */

import { resolveSelectionStyleState, buildQftEditorState, selectionHasOneStyleSet, detachParagraphStyleFromSelection, parseStyleString } from '../utils';

const psUtils = require('../../../paragraph-styles/assets/js/lib/ps-utils.js');

const STYLES = [
	{ id: 3, name: 'Display', properties: { fontId: 12, fontWeight: '700', letterSpacing: 80, features: ['swsh'] } },
	{ id: 4, name: 'Weight only', properties: { fontWeight: '300' } },
	{ id: 5, name: 'Fluid', properties: { fontSize: 'responsive', fontSizeUnit: 'rem', fontSizeMin: 20, fontSizePreferred: 30, fontSizeMax: 60 } },
	{ id: 6, name: 'Hung small caps', properties: { fontWeight: '600', initialHang: 0.25, textCase: 'small-caps' } }
];

const UNSET = {
	fontId: 0,
	explicitFontId: 0,
	fontWeight: '',
	explicitFontWeight: '',
	fontStyle: '',
	explicitFontStyle: '',
	fontSize: 'inherit',
	fontSizeMin: 0,
	fontSizePreferred: 0,
	fontSizeMax: 0,
	fitMaxSize: 0,
	letterSpacing: 0,
	lineHeight: 0,
	features: [],
	fontVariationSettings: ''
};

describe('resolveSelectionStyleState', () => {
	test('is null for a caret or no content', () => {
		expect(resolveSelectionStyleState('The quick brown fox', 2, 2, STYLES)).toBeNull();
		expect(resolveSelectionStyleState('', 0, 1, STYLES)).toBeNull();
	});

	test('plain text sets nothing', () => {
		expect(resolveSelectionStyleState('The quick brown fox', 0, 1, STYLES)).toEqual(UNSET);
	});

	test('a letter with its own weight reports only that weight', () => {
		const html = '<span class="typost-styled" data-fontweight="700" style="font-weight: 700">T</span>he quick brown fox';
		expect(resolveSelectionStyleState(html, 0, 1, STYLES)).toEqual(Object.assign({}, UNSET, {
			fontWeight: '700',
			explicitFontWeight: '700'
		}));
	});

	test('reads every property the Quick Feature Toggles write on a span', () => {
		const html = '<span class="typost-styled" data-font-id="40" data-fontstyle="italic" data-fontsize="responsive" ' +
			'data-fontsize-min="18" data-fontsize-preferred="24" data-fontsize-max="48" data-letterspacing="80" ' +
			'data-lineheight="1.2" data-features="swsh,salt" data-font-variation-settings="&quot;wght&quot; 650" ' +
			'style="font-family: var(--font-40); font-style: italic; letter-spacing: 0.08em; line-height: 1.2">T</span>he';
		expect(resolveSelectionStyleState(html, 0, 1, STYLES)).toEqual(Object.assign({}, UNSET, {
			fontId: 40,
			explicitFontId: 40,
			fontStyle: 'italic',
			explicitFontStyle: 'italic',
			fontSize: 'responsive',
			fontSizeMin: 18,
			fontSizePreferred: 24,
			fontSizeMax: 48,
			letterSpacing: 80,
			lineHeight: 1.2,
			features: ['swsh', 'salt'],
			fontVariationSettings: '"wght" 650'
		}));
	});

	test('nested spans: each property comes from the first span out that sets it', () => {
		// Spacing on the outer span, the swash on the letter inside it
		const html = '<span class="typost-styled" data-letterspacing="80" style="letter-spacing: 0.08em">' +
			'<span class="typost-styled" data-features="swsh" style="font-feature-settings: &quot;swsh&quot; 1">T</span>he</span> quick';
		const state = resolveSelectionStyleState(html, 0, 1, STYLES);
		expect(state.letterSpacing).toBe(80);
		expect(state.features).toEqual(['swsh']);
	});

	test('a fixed size is reported as its px value', () => {
		const html = '<span class="typost-styled" data-fontsize="24px" style="font-size: 1.5rem">T</span>he';
		expect(resolveSelectionStyleState(html, 0, 1, STYLES).fontSize).toBe('24');
	});

	test('a span wrapped by the selection apply reports its style', () => {
		const html = '<span class="typost-styled" data-style-id="3">T</span>he quick brown fox';
		expect(resolveSelectionStyleState(html, 0, 1, STYLES)).toEqual(Object.assign({}, UNSET, {
			fontId: 12,
			explicitFontId: 12,
			fontWeight: '700',
			explicitFontWeight: '700',
			letterSpacing: 80,
			features: ['swsh']
		}));
	});

	test('a declared override on the style span beats the style', () => {
		// The author changed the styled letter's spacing in the Quick Feature Toggles
		const html = '<span class="typost-styled" data-style-id="3" data-letterspacing="120" style="letter-spacing: 0.12em">T</span>he';
		const state = resolveSelectionStyleState(html, 0, 1, STYLES);
		expect(state.letterSpacing).toBe(120);
		expect(state.fontWeight).toBe('700');
		expect(state.features).toEqual(['swsh']);
	});

	test('a data attribute on the style span without its declaration does not render', () => {
		// The inline apply path keeps data-* under a style without the inline declaration
		const html = '<span class="typost-styled" data-style-id="3" data-fontweight="400" data-letterspacing="10" data-font-id="40">T</span>he';
		const state = resolveSelectionStyleState(html, 0, 1, STYLES);
		expect(state.fontWeight).toBe('700');
		expect(state.letterSpacing).toBe(80);
		expect(state.fontId).toBe(12);
	});

	test('a span inside the style span overrides it', () => {
		const html = '<span class="typost-styled" data-style-id="3"><span class="typost-styled" data-fontweight="300" style="font-weight: 300">T</span>he</span>';
		const state = resolveSelectionStyleState(html, 0, 1, STYLES);
		expect(state.fontWeight).toBe('300');
		expect(state.letterSpacing).toBe(80);
	});

	test('a span outside the style span counts only for what the style does not set', () => {
		// Style 4 sets only a weight: the outer weight is hidden, the outer spacing shows
		const html = '<span class="typost-styled" data-fontweight="900" data-letterspacing="50" style="font-weight: 900; letter-spacing: 0.05em">' +
			'<span class="typost-styled" data-style-id="4">T</span>he</span>';
		const state = resolveSelectionStyleState(html, 0, 1, STYLES);
		expect(state.fontWeight).toBe('300');
		expect(state.letterSpacing).toBe(50);
	});

	test('a responsive style reports its size trio', () => {
		const html = '<span class="typost-styled" data-style-id="5">T</span>he';
		const state = resolveSelectionStyleState(html, 0, 1, STYLES);
		expect(state.fontSize).toBe('responsive');
		expect([state.fontSizeMin, state.fontSizePreferred, state.fontSizeMax]).toEqual([20, 30, 60]);
	});

	test('a deleted style sets nothing, and its unrendered data attributes do not count', () => {
		const html = '<span class="typost-styled" data-letterspacing="50" style="letter-spacing: 0.05em">' +
			'<span class="typost-styled" data-style-id="99" data-letterspacing="10">T</span>he</span>';
		expect(resolveSelectionStyleState(html, 0, 1, STYLES).letterSpacing).toBe(50);
	});

	test('no styles list: a style span sets nothing, nothing throws', () => {
		const html = '<span class="typost-styled" data-letterspacing="50" style="letter-spacing: 0.05em">' +
			'<span class="typost-styled" data-style-id="3">T</span>he</span>';
		expect(resolveSelectionStyleState(html, 0, 1, undefined)).toEqual(Object.assign({}, UNSET, { letterSpacing: 50 }));
		expect(resolveSelectionStyleState(html, 0, 1, null).letterSpacing).toBe(50);
	});

	test('a raw glyph alternate is not a feature the style captures', () => {
		const html = '<span class="typost-styled" data-feature-settings="&quot;salt&quot; 2" style="font-feature-settings: &quot;salt&quot; 2">T</span>he';
		expect(resolveSelectionStyleState(html, 0, 1, STYLES).features).toEqual([]);
	});

	test('a selection across runs reads the innermost span it overlaps, as the controls do', () => {
		const html = '<span class="typost-styled" data-fontweight="700" style="font-weight: 700">T</span>he quick';
		expect(resolveSelectionStyleState(html, 0, 3, STYLES).fontWeight).toBe('700');
	});

	test('reports no hang and no case, which are not selection properties', () => {
		const html = '<span class="typost-styled" data-style-id="6">T</span>he';
		const state = resolveSelectionStyleState(html, 0, 1, STYLES);
		expect(state).not.toHaveProperty('initialHang');
		expect(state).not.toHaveProperty('textCase');
		expect(state.fontWeight).toBe('600');
	});
});

describe('buildQftEditorState: selection keys', () => {
	// The block attributes of the issue's example: weight 400, no style
	const block = {
		fontId: 0,
		fontWeight: '400',
		fontStyle: '',
		fontSize: 'inherit',
		letterSpacing: 0,
		lineHeight: 0,
		features: [],
		styleClass: '',
		initialHang: 0,
		textCase: '',
		paragraphStyles: STYLES
	};

	test('a caret reports no selection', () => {
		const state = buildQftEditorState(Object.assign({}, block, { content: 'The quick', selectionRange: null }));
		expect(state.hasSelection).toBe(false);
		expect(state.selection).toBeNull();
		expect(state.selectionParagraphStyleId).toBe(0);
	});

	test('a collapsed range is a caret', () => {
		const state = buildQftEditorState(Object.assign({}, block, { content: 'The quick', selectionRange: { start: 2, end: 2 } }));
		expect(state.hasSelection).toBe(false);
	});

	test('a selection reports its own values beside the block keys', () => {
		const content = '<span class="typost-styled" data-fontweight="700" style="font-weight: 700">T</span>he quick';
		const state = buildQftEditorState(Object.assign({}, block, { content, selectionRange: { start: 0, end: 1 } }));
		expect(state.hasSelection).toBe(true);
		expect(state.selection.explicitFontWeight).toBe('700');
		// The block keys keep their meaning
		expect(state.explicitFontWeight).toBe('400');
		expect(state.letterSpacing).toBe(0);
	});

	test('the selection style is the style that covers the selection, not the block style', () => {
		const content = '<span class="typost-styled" data-style-id="3">T</span>he quick';
		const state = buildQftEditorState(Object.assign({}, block, { content, styleClass: 'typost-ps-4', selectionRange: { start: 0, end: 1 } }));
		expect(state.paragraphStyleId).toBe(4);
		expect(state.selectionParagraphStyleId).toBe(3);
	});

	test('a selectionStyleId handed over by the toolbar click wins', () => {
		const content = '<span class="typost-styled" data-style-id="3">T</span>he quick';
		const state = buildQftEditorState(Object.assign({}, block, { content, selectionRange: { start: 0, end: 1 }, selectionStyleId: 0 }));
		expect(state.selectionParagraphStyleId).toBe(0);
	});

	test('reads the styles from typostData when none are passed', () => {
		window.typostData = { paragraphStyles: STYLES };
		try {
			const content = '<span class="typost-styled" data-style-id="4">T</span>he';
			const source = Object.assign({}, block, { content, selectionRange: { start: 0, end: 1 } });
			delete source.paragraphStyles;
			expect(buildQftEditorState(source).selection.fontWeight).toBe('300');
		} finally {
			delete window.typostData;
		}
	});
});

describe('Paragraph Style panel in the Quick Feature Toggles (#303)', () => {
	const block = {
		fontId: 0,
		fontWeight: '400',
		fontStyle: '',
		fontSize: 'inherit',
		letterSpacing: 0,
		lineHeight: 0,
		features: [],
		styleClass: '',
		initialHang: 0,
		textCase: '',
		paragraphStyles: STYLES
	};
	const stateFor = (content, range, extra) => buildQftEditorState(Object.assign({}, block, { content, selectionRange: range }, extra || {}));

	test('Save from one letter captures that letter, not the block', () => {
		// "T" with letter spacing 80 and Swashes, from the issue
		const content = '<span class="typost-styled" data-letterspacing="80" data-features="swsh" ' +
			'style="letter-spacing: 0.08em; font-feature-settings: &quot;swsh&quot; 1">T</span>he quick brown fox';
		const scope = psUtils.resolvePanelScope('qft', stateFor(content, { start: 0, end: 1 }));
		expect(scope.applyTo).toBe('selection');
		// No weight: the letter sets none, and 400 is the block's
		expect(psUtils.buildPropertiesFromState(scope.state)).toEqual({ letterSpacing: 80, features: ['swsh'] });
	});

	test('the new style applies to the selection only', () => {
		const content = '<span class="typost-styled" data-fontweight="700" style="font-weight: 700">T</span>he quick';
		const scope = psUtils.resolvePanelScope('qft', stateFor(content, { start: 0, end: 1 }));
		const detail = psUtils.buildApplyEventDetail({ id: 9, properties: { fontWeight: '700' } }, 'qft', undefined, scope.applyTo);
		expect(detail.applyTo).toBe('selection');
		expect(detail.paragraphStyleId).toBe(9);
	});

	test('after the apply the badge shows the selection style, unmodified', () => {
		const content = '<span class="typost-styled" data-style-id="3">T</span>he quick';
		const scope = psUtils.resolvePanelScope('qft', stateFor(content, { start: 0, end: 1 }, { styleClass: 'typost-ps-4' }));
		expect(scope.activeStyleId).toBe(3);
		expect(psUtils.isStyleModified(scope.state, STYLES[0].properties)).toBe(false);
	});

	test('an override on the styled text shows "(modified)" and goes into Update Style', () => {
		const content = '<span class="typost-styled" data-style-id="3" data-letterspacing="120" style="letter-spacing: 0.12em">T</span>he';
		const scope = psUtils.resolvePanelScope('qft', stateFor(content, { start: 0, end: 1 }));
		expect(psUtils.isStyleModified(scope.state, STYLES[0].properties)).toBe(true);
		expect(psUtils.buildStyleUpdateProperties(scope.state, STYLES[0], STYLES).letterSpacing).toBe(120);
	});

	test('Update Style from a selection keeps the style\'s hang and case', () => {
		const content = '<span class="typost-styled" data-style-id="6" data-fontweight="800" style="font-weight: 800">T</span>he';
		const scope = psUtils.resolvePanelScope('qft', stateFor(content, { start: 0, end: 1 }));
		expect(psUtils.isStyleModified(scope.state, STYLES[3].properties)).toBe(true);
		expect(psUtils.buildStyleUpdateProperties(scope.state, STYLES[3], STYLES)).toEqual({
			fontWeight: '800',
			initialHang: 0.25,
			textCase: 'small-caps'
		});
	});

	test('a selection in a styled block shows no style when the text has none', () => {
		const scope = psUtils.resolvePanelScope('qft', stateFor('The quick', { start: 0, end: 1 }, { styleClass: 'typost-ps-3' }));
		expect(scope.activeStyleId).toBe(0);
	});

	test('with a caret the panel stays block-level', () => {
		const scope = psUtils.resolvePanelScope('qft', stateFor('The quick', null, { styleClass: 'typost-ps-3' }));
		expect(scope.applyTo).toBeUndefined();
		expect(scope.activeStyleId).toBe(3);
		expect(psUtils.buildPropertiesFromState(scope.state).fontWeight).toBe('400');
	});

	test('the Inspector panel stays block-level with text selected', () => {
		const content = '<span class="typost-styled" data-fontweight="700" style="font-weight: 700">T</span>he quick';
		const scope = psUtils.resolvePanelScope('inspector', stateFor(content, { start: 0, end: 1 }));
		expect(scope.applyTo).toBeUndefined();
		expect(psUtils.buildPropertiesFromState(scope.state).fontWeight).toBe('400');
	});

	test('block-level panels read the block\'s font, weight and font style, not the selected text\'s', () => {
		// What edit.js reports for a 700-weight, font-40, italic letter in a
		// block with weight 300 and font 12
		const content = '<span class="typost-styled" data-fontweight="700" data-font-id="40" data-fontstyle="italic">T</span>he';
		const state = stateFor(content, { start: 0, end: 1 }, {
			fontId: 12,
			fontWeight: '300',
			inlineFontId: '40',
			inlineExplicitFontStyle: 'italic',
			selectionStoredFontWeight: '700',
			styleClass: 'typost-ps-4'
		});
		// The shared keys keep reporting the selected text (#278)
		expect([state.explicitFontId, state.explicitFontWeight, state.explicitFontStyle]).toEqual([40, '700', 'italic']);
		const inspector = psUtils.resolvePanelScope('inspector', state);
		expect(psUtils.isStyleModified(inspector.state, STYLES[1].properties)).toBe(true);
		expect(psUtils.buildPropertiesFromState(inspector.state)).toEqual({ fontId: 12, fontWeight: '300' });
		// No longer "(modified)" for a block whose own values match its style
		const matching = psUtils.resolvePanelScope('inspector', Object.assign({}, state, { block: { explicitFontId: 0, explicitFontWeight: '300', explicitFontStyle: '' } }));
		expect(psUtils.isStyleModified(matching.state, STYLES[1].properties)).toBe(false);
		// The Quick Feature Toggles panel with a caret is block-level too
		const caret = stateFor(content, null, { fontId: 12, fontWeight: '300', inlineFontId: '40', selectionStoredFontWeight: '700' });
		expect(psUtils.buildPropertiesFromState(psUtils.resolvePanelScope('qft', caret).state)).toEqual({ fontId: 12, fontWeight: '300' });
	});
});

describe('selectionHasOneStyleSet', () => {
	test('one span that is the whole selection', () => {
		const html = '<span class="typost-styled" data-fontweight="700" style="font-weight: 700">T</span>he';
		expect(selectionHasOneStyleSet(html, 0, 1)).toBe(true);
	});

	test('a selection inside a longer span, and nested spans that all cover it', () => {
		const html = '<span class="typost-styled" data-letterspacing="80" style="letter-spacing: 0.08em">' +
			'<span class="typost-styled" data-fontweight="700" style="font-weight: 700">The</span> quick</span>';
		expect(selectionHasOneStyleSet(html, 0, 3)).toBe(true);
		expect(selectionHasOneStyleSet(html, 1, 2)).toBe(true);
	});

	test('a span over part of the selection is more than one set', () => {
		const html = '<span class="typost-styled" data-fontweight="700" style="font-weight: 700">T</span>he quick';
		expect(selectionHasOneStyleSet(html, 0, 3)).toBe(false);
		const inside = 'The <span class="typost-styled" data-fontweight="700" style="font-weight: 700">q</span>uick';
		expect(selectionHasOneStyleSet(inside, 0, 9)).toBe(false);
	});

	test('plain text is one set', () => {
		expect(selectionHasOneStyleSet('The quick', 0, 3)).toBe(true);
	});

	test('a span with its own case is not: the capture leaves case out', () => {
		const html = '<span class="typost-styled" data-textcase="uppercase" style="text-transform: uppercase; font-variant-caps: normal">T</span>he';
		expect(selectionHasOneStyleSet(html, 0, 1)).toBe(false);
	});

	test('a caret or no content is not a selection', () => {
		expect(selectionHasOneStyleSet('The', 1, 1)).toBe(false);
		expect(selectionHasOneStyleSet('', 0, 1)).toBe(false);
	});
});

describe('detachParagraphStyleFromSelection', () => {
	const DETACH_STYLES = [
		{ id: 3, properties: { fontId: 12, fontWeight: '700', fontStyle: 'italic', letterSpacing: 80, lineHeight: 1.2, features: ['swsh', 'salt'], fontVariationSettings: '"wght" 650' } },
		{ id: 5, properties: { fontSize: 'responsive', fontSizeUnit: 'rem', fontSizeMin: 16, fontSizePreferred: 32, fontSizeMax: 64 } },
		{ id: 7, properties: { fontSize: 24 } },
		{ id: 8, properties: { fontSize: 'fit', fontSizeUnit: 'rem', fitMaxSize: 0, fontSizeMin: 16, fontSizePreferred: 32, fontSizeMax: 64 } },
		{ id: 9, properties: { textCase: 'small-caps', fakeSmallCaps: false } },
		{ id: 10, properties: {} }
	];
	const spanOf = (html) => {
		const holder = document.createElement('div');
		holder.innerHTML = html;
		return holder.querySelector('span');
	};

	test('writes the style\'s values onto the span in place of its data-style-id', () => {
		const result = detachParagraphStyleFromSelection('<span class="typost-styled" data-style-id="3">T</span>he', 0, 1, DETACH_STYLES);
		expect(result.success).toBe(true);
		const span = spanOf(result.content);
		expect(span.hasAttribute('data-style-id')).toBe(false);
		expect(span.getAttribute('data-font-id')).toBe('12');
		expect(span.getAttribute('data-fontweight')).toBe('700');
		expect(span.getAttribute('data-fontstyle')).toBe('italic');
		expect(span.getAttribute('data-letterspacing')).toBe('80');
		expect(span.getAttribute('data-lineheight')).toBe('1.2');
		expect(span.getAttribute('data-features')).toBe('swsh,salt');
		expect(span.getAttribute('data-font-variation-settings')).toBe('"wght" 650');
		expect(parseStyleString(span.getAttribute('style'))).toEqual({
			'font-family': 'var(--font-12)',
			'font-weight': '700',
			'font-style': 'italic',
			'letter-spacing': '0.08em',
			'line-height': '1.2',
			'font-feature-settings': '"swsh" 1, "salt" 1',
			'font-variation-settings': '"wght" 650'
		});
	});

	test('the detached text reads back as the same values', () => {
		const before = '<span class="typost-styled" data-style-id="3">T</span>he';
		const after = detachParagraphStyleFromSelection(before, 0, 1, DETACH_STYLES).content;
		expect(resolveSelectionStyleState(after, 0, 1, DETACH_STYLES)).toEqual(resolveSelectionStyleState(before, 0, 1, DETACH_STYLES));
	});

	test('a property the span declares itself keeps its own value', () => {
		const html = '<span class="typost-styled" data-style-id="3" data-letterspacing="120" style="letter-spacing: 0.12em">T</span>he';
		const span = spanOf(detachParagraphStyleFromSelection(html, 0, 1, DETACH_STYLES).content);
		expect(span.getAttribute('data-letterspacing')).toBe('120');
		expect(parseStyleString(span.getAttribute('style'))['letter-spacing']).toBe('0.12em');
		expect(span.getAttribute('data-fontweight')).toBe('700');
	});

	test('a data attribute that rendered nothing is replaced or removed', () => {
		const html = '<span class="typost-styled" data-style-id="9" data-fontweight="300" data-textcase="uppercase">T</span>he';
		const span = spanOf(detachParagraphStyleFromSelection(html, 0, 1, DETACH_STYLES).content);
		expect(span.hasAttribute('data-fontweight')).toBe(false);
		expect(span.getAttribute('data-textcase')).toBe('small-caps');
		expect(span.getAttribute('data-fakesmallcaps')).toBe('false');
		expect(parseStyleString(span.getAttribute('style'))).toEqual({
			'text-transform': 'none',
			'font-variant-caps': 'small-caps',
			'font-synthesis-small-caps': 'none'
		});
	});

	test('sizes use the style\'s unit', () => {
		const rem = spanOf(detachParagraphStyleFromSelection('<span class="typost-styled" data-style-id="5">T</span>he', 0, 1, DETACH_STYLES).content);
		expect(rem.getAttribute('data-fontsize')).toBe('responsive');
		expect([rem.getAttribute('data-fontsize-min'), rem.getAttribute('data-fontsize-preferred'), rem.getAttribute('data-fontsize-max')]).toEqual(['16', '32', '64']);
		expect(parseStyleString(rem.getAttribute('style'))['font-size']).toBe('clamp(1rem, 2rem + 3vw, 4rem)');
		// A style saved before rem (no unit) is px
		const px = spanOf(detachParagraphStyleFromSelection('<span class="typost-styled" data-style-id="7">T</span>he', 0, 1, DETACH_STYLES).content);
		expect(px.getAttribute('data-fontsize')).toBe('24');
		expect(parseStyleString(px.getAttribute('style'))['font-size']).toBe('24px');
	});

	test('a fit style becomes its fallback clamp, as it rendered on a span', () => {
		const span = spanOf(detachParagraphStyleFromSelection('<span class="typost-styled" data-style-id="8">T</span>he', 0, 1, DETACH_STYLES).content);
		expect(span.getAttribute('data-fontsize')).toBe('responsive');
		expect(parseStyleString(span.getAttribute('style'))['font-size']).toBe('clamp(1rem, 2rem + 3vw, 4rem)');
	});

	test('spans inside keep their own styling', () => {
		const html = '<span class="typost-styled" data-style-id="3"><span class="typost-styled" data-fontweight="300" style="font-weight: 300">T</span>he</span>';
		const result = detachParagraphStyleFromSelection(html, 0, 3, DETACH_STYLES).content;
		const holder = document.createElement('div');
		holder.innerHTML = result;
		const [outer, inner] = holder.querySelectorAll('span');
		expect(outer.getAttribute('data-fontweight')).toBe('700');
		expect(inner.getAttribute('data-fontweight')).toBe('300');
		expect(inner.getAttribute('style')).toBe('font-weight: 300');
	});

	test('a style with no values, or a deleted style, leaves no empty span', () => {
		expect(detachParagraphStyleFromSelection('<span class="typost-styled" data-style-id="10">T</span>he', 0, 1, DETACH_STYLES).content).toBe('The');
		expect(detachParagraphStyleFromSelection('<span class="typost-styled" data-style-id="99">T</span>he', 0, 1, DETACH_STYLES).content).toBe('The');
		// A deleted style's span keeps its own declared styling
		const own = detachParagraphStyleFromSelection('<span class="typost-styled" data-style-id="99" data-letterspacing="50" style="letter-spacing: 0.05em">T</span>he', 0, 1, DETACH_STYLES).content;
		expect(own).toBe('<span class="typost-styled" data-letterspacing="50" style="letter-spacing: 0.05em">T</span>he');
	});

	test('a deleted style\'s span loses the data attributes that rendered nothing (PR #311 review)', () => {
		// data-letterspacing="10" has no declaration: under the data-style-id it
		// rendered nothing, so after Detach it must not read as the span's value
		const html = '<span class="typost-styled" data-style-id="99" data-letterspacing="10" data-fontweight="700" style="font-weight: 700">T</span>he';
		const result = detachParagraphStyleFromSelection(html, 0, 1, DETACH_STYLES).content;
		expect(result).toBe('<span class="typost-styled" data-fontweight="700" style="font-weight: 700">T</span>he');
		expect(resolveSelectionStyleState(result, 0, 1, DETACH_STYLES).letterSpacing).toBe(0);
	});

	test('does nothing without a style span in the selection', () => {
		const html = 'The <span class="typost-styled" data-style-id="3">quick</span>';
		expect(detachParagraphStyleFromSelection(html, 0, 3, DETACH_STYLES)).toEqual({ success: false, content: html });
		expect(detachParagraphStyleFromSelection(html, 5, 5, DETACH_STYLES).success).toBe(false);
	});
});

/**
 * Tests for the inline editor's modules split out of block-editor.js
 * (#357): the extension bridge, Convert to block, span reading, the hook
 * registry, the option lists and the block DOM readers; and for the helpers
 * now shared with the block's build, which utils.js re-exports.
 */

const { resolveApplyEventChanges, buildApplyEventState, resolveInsertRange, createStateProviderFilter, createPanelClosedHandler } = require('../inline-editor/extension-bridge.js');
const { resolveConvertTagName, buildPartialConvertContent, scheduleConvertFallback } = require('../inline-editor/convert-to-block.js');
const { findStyledSpanInContent, readSpanFeatures } = require('../inline-editor/span-reading.js');
const { createHookRegistry } = require('../inline-editor/hook-registry.js');
const { groupFeatures, getCategoryTitle, getFilteredWeightOptions, buildFeaturePreviewStyle } = require('../inline-editor/feature-options.js');
const { findBlockTextElement, getBlockInheritedWeight } = require('../inline-editor/block-dom.js');
const { escapeAttribute } = require('../inline-editor/sanitize.js');

beforeAll(() => {
	global.wp = Object.assign({}, global.wp, {
		i18n: { __: (text) => text, sprintf: (format, ...args) => format.replace(/%s/g, () => args.shift()) },
	});
});

const state = {
	selectedFeatures: ['liga'],
	selectedFont: '',
	selectedFontId: 0,
	fontSize: 'inherit',
	fontSizeMin: 16,
	fontSizePreferred: 24,
	fontSizeMax: 32,
	fontWeight: '400',
	fontStyle: '',
	textCase: '',
	fakeSmallCaps: true,
	letterSpacing: 0,
	lineHeight: 0,
	paragraphStyleId: 0,
	animationId: 0,
	fontVariationSettings: '',
};

describe('extension bridge', () => {
	test('a style, an animation or features reset the pending changes', () => {
		expect(resolveApplyEventChanges({ paragraphStyleId: 'ps-1' }, {})).toBeNull();
		expect(resolveApplyEventChanges({ animationId: 0 }, {})).toBeNull();
		expect(resolveApplyEventChanges({}, { features: [] })).toBeNull();
	});

	test('other properties are recorded in a fixed order', () => {
		expect(resolveApplyEventChanges({}, {
			fontVariationSettings: '', lineHeight: 1, letterSpacing: 0, fontSizeMax: 40, fakeSmallCaps: false, fontStyle: '', fontWeight: '', fontId: 3,
		})).toEqual(['font', 'fontWeight', 'fontStyle', 'textCase', 'fontSize', 'letterSpacing', 'lineHeight', 'fontVariationSettings']);
		expect(resolveApplyEventChanges({}, {})).toEqual([]);
	});

	test('an apply event overrides only the fields it carries, with the defaults for falsy values', () => {
		const next = buildApplyEventState({ paragraphStyleId: '' }, { fontId: 5, fontWeight: '', textCase: 'UPPERCASE', fontVariationSettings: '"wght" 1; x' }, state, (id) => 'family-' + id);
		expect(next).toEqual(Object.assign({}, {
			selectedFontId: 5,
			selectedFont: 'family-5',
			fontWeight: '400',
			fontStyle: '',
			textCase: '',
			fakeSmallCaps: true,
			fontSize: 'inherit',
			fontSizeMin: 16,
			fontSizePreferred: 24,
			fontSizeMax: 32,
			letterSpacing: 0,
			lineHeight: 0,
			selectedFeatures: ['liga'],
			paragraphStyleId: 0,
			animationId: 0,
			fontVariationSettings: '',
		}));
		expect(buildApplyEventState({}, { fontId: 0 }, Object.assign({}, state, { selectedFontId: 9, selectedFont: 'x' }), () => 'never').selectedFont).toBe('');
	});

	test('an insertion uses the saved range when the live one collapsed', () => {
		const value = { start: 2, end: 2, text: 'Hello World' };
		expect(resolveInsertRange(value, 6, 11, null)).toEqual({ start: 6, end: 11 });
		expect(resolveInsertRange(value, null, null, null)).toEqual({ start: 2, end: 2 });
	});

	test('an insertion without a selection uses the extension range, then the end; it is ordered and clamped', () => {
		const value = { start: undefined, end: undefined, text: 'Hello' };
		expect(resolveInsertRange(value, null, null, { start: 4.7, end: 1 })).toEqual({ start: 1, end: 4 });
		expect(resolveInsertRange(value, null, null, { start: 3 })).toEqual({ start: 3, end: 3 });
		expect(resolveInsertRange(value, null, null, { start: 40, end: 50 })).toEqual({ start: 5, end: 5 });
		expect(resolveInsertRange(value, null, null, null)).toEqual({ start: 5, end: 5 });
	});

	test('the state provider answers only for the inline editor', () => {
		const self = {
			state: Object.assign({}, state, { selectedFontId: 0, textCase: 'Uppercase', fakeSmallCaps: undefined }),
			getInheritedFontId: () => 12,
			getExplicitFontId: () => 0,
			getEffectiveFontWeight: () => '700',
			getSetFontWeight: () => '',
			getStoredFontWeight: () => '',
			getRenderedFontStyle: () => 'italic',
			getExplicitFontStyle: () => '',
		};
		const filter = createStateProviderFilter(self);
		const passed = { editorType: 'qft' };
		expect(filter(passed, 'qft')).toBe(passed);
		const inline = filter({}, 'inline');
		expect(inline).toMatchObject({ editorType: 'inline', fontId: 12, fontWeight: '700', fontStyle: 'italic', textCase: '', fakeSmallCaps: true, features: ['liga'], selectionParagraphStyleId: 0 });
		expect(Object.keys(inline)).toEqual(['editorType', 'fontId', 'explicitFontId', 'fontWeight', 'explicitFontWeight', 'selectionFontWeight', 'fontStyle', 'explicitFontStyle', 'textCase', 'fakeSmallCaps', 'fontSize', 'fontSizeMin', 'fontSizePreferred', 'fontSizeMax', 'letterSpacing', 'lineHeight', 'features', 'paragraphStyleId', 'selectionParagraphStyleId', 'animationId', 'fontVariationSettings']);
	});

	test('a closed panel reopens the modal with its range, unless it was launched from the toolbar', () => {
		window.typostHooks = createHookRegistry();
		const opened = jest.fn();
		window.typostHooks.addAction('typost_inline_modal_opened', opened);
		const self = { _isMounted: true, state: { isOpen: false }, setState: jest.fn(function(update, done) { this.state = Object.assign({}, this.state, update); done(); }) };
		const handler = createPanelClosedHandler(self);
		handler('qft', {});
		handler('inline', { reopenHost: false });
		expect(self.setState).not.toHaveBeenCalled();
		handler('inline', { range: { start: 2, end: 5 } });
		expect(self.state).toEqual({ isOpen: true, savedSelectionStart: 2, savedSelectionEnd: 5 });
		expect(opened).toHaveBeenCalledWith(self.state);
		self._isMounted = false;
		handler('inline', {});
		expect(self.setState).toHaveBeenCalledTimes(1);
	});
});

describe('convert to block', () => {
	test('the tag follows the block', () => {
		expect(resolveConvertTagName({ name: 'core/heading', attributes: { level: 3 } })).toBe('h3');
		expect(resolveConvertTagName({ name: 'core/heading', attributes: {} })).toBe('h2');
		expect(resolveConvertTagName({ name: 'core/paragraph', attributes: {} })).toBe('p');
		expect(resolveConvertTagName({ name: 'typost/block', attributes: { tagName: 'h4' } })).toBe('h4');
		expect(resolveConvertTagName({ name: 'other/block', attributes: {} })).toBe('h2');
	});

	// Pins the output as it was before #357. The style value is not
	// attribute-escaped, so a feature's quotes end the style attribute early;
	// reported separately as a bug, not changed by this refactor.
	test('plain text: the selection is wrapped, the rest escaped', () => {
		const content = buildPartialConvertContent({
			existingContent: 'Convert <b part',
			fullText: 'Convert <b part',
			start: 11,
			end: 15,
			state: Object.assign({}, state, { fontSize: 'responsive', letterSpacing: 25 }),
			spanWeight: '700',
			sizeUnit: 'rem',
			clearWeight: false,
			shared: undefined,
		});
		// KNOWN DEFECT: the unescaped quotes below are the bug, not the test.
		// Fix buildPartialConvertContent(), then update this expectation.
		expect(content).toBe('Convert &lt;b <span class="typost-styled" data-features="liga" data-fontsize="responsive" data-fontsize-min="16" data-fontsize-preferred="24" data-fontsize-max="32" style="font-feature-settings: "liga" 1; font-weight: 700; letter-spacing: 0.025em; font-size: clamp(1rem, 1.5rem + 1vw, 2rem)">part</span>');
	});

	test('HTML content goes through the shared applier, after a weight clear', () => {
		const shared = {
			removePropertyFromSelection: jest.fn(() => ({ success: true, content: 'cleared' })),
			applyStylingSafeStringMethod: jest.fn(() => ({ success: true, content: 'applied' })),
		};
		const args = { existingContent: 'a <em>b</em>', fullText: 'a b', start: 2, end: 3, state, spanWeight: '', sizeUnit: 'rem', clearWeight: true, shared };
		expect(buildPartialConvertContent(args)).toBe('applied');
		expect(shared.removePropertyFromSelection).toHaveBeenCalledWith('a <em>b</em>', 2, 3, 'data-fontweight', 'font-weight');
		expect(shared.applyStylingSafeStringMethod).toHaveBeenCalledWith('cleared', 2, 3, { 'data-features': 'liga' }, 'font-feature-settings: "liga" 1');
		// A failed apply keeps the content rather than rebuilding it from text
		shared.applyStylingSafeStringMethod.mockReturnValue({ success: false });
		expect(buildPartialConvertContent(Object.assign({}, args, { clearWeight: false }))).toBe('a <em>b</em>');
	});

	test('the fallback runs only when the old block is still there and no Typography Stylist block is selected', () => {
		jest.useFakeTimers();
		const blocks = { old: { name: 'core/heading' } };
		let selected = null;
		global.wp = Object.assign({}, global.wp, { data: { select: () => ({ getBlock: (id) => blocks[id] || null, getSelectedBlock: () => selected }) } });
		const onFallback = jest.fn();
		scheduleConvertFallback('gone', onFallback);
		scheduleConvertFallback('old', onFallback);
		jest.advanceTimersByTime(99);
		expect(onFallback).not.toHaveBeenCalled();
		jest.advanceTimersByTime(1);
		expect(onFallback).toHaveBeenCalledTimes(1);
		selected = { name: 'typost/block' };
		scheduleConvertFallback('old', onFallback);
		jest.advanceTimersByTime(100);
		expect(onFallback).toHaveBeenCalledTimes(1);
		jest.useRealTimers();
	});
});

describe('span reading', () => {
	const content = 'Hello <span class="typost-styled" data-features="liga">Beau<br><span class="typost-styled" style="font-feature-settings: &quot;ss01&quot; 1, \'dlig\' 1">tiful</span></span> World';

	test('the innermost span at the caret or overlapping the selection wins', () => {
		expect(readSpanFeatures(findStyledSpanInContent(content, 12, 12))).toEqual(['ss01', 'dlig']);
		expect(readSpanFeatures(findStyledSpanInContent(content, 7, 7))).toEqual(['liga']);
		expect(readSpanFeatures(findStyledSpanInContent(content, 5, 12))).toEqual(['ss01', 'dlig']);
		expect(findStyledSpanInContent(content, 0, 3)).toBeNull();
		expect(readSpanFeatures(null)).toEqual([]);
	});
});

describe('hook registry', () => {
	test('actions and filters run by priority and can be removed', () => {
		const hooks = createHookRegistry();
		const order = [];
		const late = () => order.push('late');
		hooks.addAction('a', late, 20);
		hooks.addAction('a', (x) => order.push('early ' + x), 5);
		hooks.doAction('a', 1);
		hooks.removeAction('a', late);
		hooks.doAction('a', 2);
		expect(order).toEqual(['early 1', 'late', 'early 2']);
		hooks.addFilter('f', (v, extra) => v + extra, 10);
		hooks.addFilter('f', (v) => v * 2, 1);
		expect(hooks.applyFilters('f', 3, 1)).toBe(7);
		hooks.removeFilter('missing', late);
		hooks.removeAction('missing', late);
	});
});

describe('option lists', () => {
	test('features are grouped by category, filtered per font when the shared helper exists', () => {
		const data = { features: [{ id: 'liga', category: 'ligatures' }, { id: 'ss01', category: 'stylistic-sets' }, { id: 'x' }], fontFeatureVisibility: { 3: {} } };
		expect(groupFeatures(data, 0, undefined)).toEqual({ ligatures: [data.features[0]], 'stylistic-sets': [data.features[1]], other: [data.features[2]] });
		const shared = { filterFeaturesByVisibility: jest.fn(() => [data.features[1]]) };
		expect(groupFeatures(data, 3, shared)).toEqual({ 'stylistic-sets': [data.features[1]] });
		expect(shared.filterFeaturesByVisibility).toHaveBeenCalledWith(data.features, 3, data.fontFeatureVisibility);
	});

	test('category titles, with the key for an unknown one', () => {
		expect(getCategoryTitle('alternates')).toBe('Swashes & Alternates');
		expect(getCategoryTitle('mystery')).toBe('mystery');
	});

	test('weights follow the font, all of them when it has no list', () => {
		expect(getFilteredWeightOptions(0, {})).toHaveLength(9);
		expect(getFilteredWeightOptions(4, { 4: { availableWeights: [] } })).toHaveLength(9);
		expect(getFilteredWeightOptions(4, { 4: { availableWeights: ['300', '700'] } })).toEqual([
			{ label: '300 (Light)', value: '300' },
			{ label: '700 (Bold)', value: '700' },
		]);
	});

	test('a preview shows the feature with the selected ones, in the font, style and case of the text', () => {
		expect(buildFeaturePreviewStyle('dlig', ['liga', 'dlig'], 'Bookmania', 'italic', 'uppercase', true)).toEqual({
			fontFeatureSettings: '"dlig" 1, "liga" 1',
			fontFamily: 'Bookmania',
			fontStyle: 'italic',
			textTransform: 'uppercase',
			fontVariantCaps: 'normal',
		});
		expect(buildFeaturePreviewStyle('liga', [], '', '', '', true)).toEqual({ fontFeatureSettings: '"liga" 1' });
	});
});

describe('block DOM', () => {
	test('finds the text element of each block type, in both wrapper structures', () => {
		document.body.innerHTML = '<h2 data-block="a">A</h2><div data-block="b"><p>B</p></div><div data-block="c"><div class="typost-block-content">C</div></div><div data-block="d"><div contenteditable="true">D</div></div>';
		expect(findBlockTextElement('a', 'core/heading').textContent).toBe('A');
		expect(findBlockTextElement('b', 'core/paragraph').textContent).toBe('B');
		expect(findBlockTextElement('c', 'typost/block').textContent).toBe('C');
		expect(findBlockTextElement('d', 'other/block').textContent).toBe('D');
		expect(findBlockTextElement('zz', 'core/heading')).toBeNull();
		expect(findBlockTextElement('', 'core/heading')).toBeNull();
	});

	test('maps weight keywords to numbers', () => {
		document.body.innerHTML = '<h2 data-block="a">A</h2>';
		const win = (weight) => ({ getComputedStyle: () => ({ getPropertyValue: () => weight }) });
		expect(getBlockInheritedWeight('a', 'core/heading', document, win('bold'))).toBe('700');
		expect(getBlockInheritedWeight('a', 'core/heading', document, win('600'))).toBe('600');
		expect(getBlockInheritedWeight('a', 'core/heading', document, win('bolder than'))).toBe('');
		expect(getBlockInheritedWeight('a', 'core/heading', document, win(''))).toBe('');
	});
});

describe('escapeAttribute', () => {
	test('escapes what a double-quoted attribute needs', () => {
		expect(escapeAttribute('a & "b" <c>')).toBe('a &amp; &quot;b&quot; &lt;c&gt;');
		expect(escapeAttribute(24)).toBe('24');
	});
});

describe('helpers shared with the block build (#357)', () => {
	test('utils.js re-exports the shared functions themselves, not copies', () => {
		const utils = require('../../../blocks/typography-stylist/utils.js');
		expect(utils.buildTextOffsetMap).toBe(require('../text-offsets.js').buildTextOffsetMap);
		expect(utils.buildBreakOffsetMap).toBe(require('../text-offsets.js').buildBreakOffsetMap);
		expect(utils.filterToolbarButtons).toBe(require('../toolbar-buttons.js').filterToolbarButtons);
		expect(utils.getClosestWeight).toBe(require('../font-weights.js').getClosestWeight);
		expect(utils.sanitizeFontVariationSettings).toBe(require('../font-variation-settings.js').sanitizeFontVariationSettings);
	});
});

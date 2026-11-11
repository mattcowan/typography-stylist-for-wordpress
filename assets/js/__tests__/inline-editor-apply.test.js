/**
 * Tests for assets/js/inline-editor/apply-features.js (#357): the span a
 * full rebuild of the inline format writes, and the per-run patch of a
 * mixed selection. The expected strings are the spans the inline editor
 * wrote before #357 moved this code out of block-editor.js, so a change
 * here is a change to saved content.
 */

const {
	isSelectionLost,
	findSelectionFormat,
	resolveRawFeatureSettings,
	featuresToCSS,
	isEmptyFormatState,
	buildFormatAttributes,
	buildPatchFromPending,
	applyPatchToRuns,
} = require('../inline-editor/apply-features.js');

const FORMAT = 'typost/features';

// The popover state with nothing set, as clearFeatures() leaves it
function emptyState(overrides) {
	return Object.assign({
		selectedFeatures: [],
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
	}, overrides);
}

const noExtras = { weightToWrite: '', caseValue: '', rawFeatureSettings: '', sizeUnit: 'rem' };

describe('isSelectionLost', () => {
	test('a collapsed live selection with a saved range uses the saved range', () => {
		expect(isSelectionLost({ start: 3, end: 3 }, 6, 15)).toBe(true);
	});

	test('a live range, no saved bounds, or a saved caret do not', () => {
		expect(isSelectionLost({ start: 6, end: 15 }, 6, 15)).toBe(false);
		expect(isSelectionLost({ start: 3, end: 3 }, null, null)).toBe(false);
		expect(isSelectionLost({ start: 3, end: 3 }, 4, 4)).toBe(false);
	});
});

describe('findSelectionFormat', () => {
	const typost = { type: FORMAT, attributes: { 'data-features': 'liga' } };
	const value = { formats: [[], [{ type: 'core/bold' }, typost]] };

	test('reads the saved start when the selection was lost', () => {
		expect(findSelectionFormat(value, true, 1, FORMAT, () => null)).toBe(typost);
		expect(findSelectionFormat(value, true, 0, FORMAT, () => null)).toBeUndefined();
	});

	test('asks getActiveFormat otherwise', () => {
		const getActive = jest.fn(() => 'active');
		expect(findSelectionFormat(value, false, 1, FORMAT, getActive)).toBe('active');
		expect(getActive).toHaveBeenCalledWith(value, FORMAT);
	});
});

describe('resolveRawFeatureSettings', () => {
	const format = { attributes: { 'data-feature-settings': '"salt" 2, "swsh" 0' } };

	test('returns the raw value, pruned by each pending toggle in order', () => {
		const prune = jest.fn((raw, tag) => raw.replace(new RegExp(`, "${tag}" \\d+`), ''));
		const pending = { featureToggles: [{ tag: 'swsh', enabled: true }] };
		expect(resolveRawFeatureSettings(format, pending, { pruneRawFeatureSettings: prune })).toBe('"salt" 2');
		expect(prune).toHaveBeenCalledWith('"salt" 2, "swsh" 0', 'swsh', true);
	});

	test('without the shared helper or pending changes the value is kept', () => {
		expect(resolveRawFeatureSettings(format, { featureToggles: [{ tag: 'swsh', enabled: true }] }, {})).toBe('"salt" 2, "swsh" 0');
		expect(resolveRawFeatureSettings(format, null, { pruneRawFeatureSettings: () => 'x' })).toBe('"salt" 2, "swsh" 0');
		expect(resolveRawFeatureSettings(undefined, null, {})).toBe('');
	});
});

describe('featuresToCSS', () => {
	test('writes each tag on', () => {
		expect(featuresToCSS(['liga', 'dlig'])).toBe('"liga" 1, "dlig" 1');
	});
});

describe('isEmptyFormatState', () => {
	test('the cleared state is empty', () => {
		expect(isEmptyFormatState(emptyState(), noExtras)).toBe(true);
	});

	test.each([
		['a feature', { selectedFeatures: ['liga'] }, {}],
		['a font', { selectedFont: 'Bookmania' }, {}],
		['a size', { fontSize: 'responsive' }, {}],
		['a style', { fontStyle: 'italic' }, {}],
		['letter spacing', { letterSpacing: 10 }, {}],
		['a paragraph style', { paragraphStyleId: 'ps-1' }, {}],
		['a weight to write', {}, { weightToWrite: '700' }],
		['a case', {}, { caseValue: 'uppercase' }],
		['raw feature settings', {}, { rawFeatureSettings: '"salt" 2' }],
	])('%s is not empty', (_label, state, extras) => {
		expect(isEmptyFormatState(emptyState(state), Object.assign({}, noExtras, extras))).toBe(false);
	});
});

describe('buildFormatAttributes', () => {
	test('the full span, declarations in the order the editor has always written them', () => {
		const attributes = buildFormatAttributes(emptyState({
			selectedFeatures: ['dlig'],
			selectedFont: 'bookmania',
			selectedFontId: 1,
			fontStyle: 'italic',
			letterSpacing: 50,
			lineHeight: 1.2,
			fontSize: 'responsive',
			fontSizeMin: 20,
		}), { weightToWrite: '700', caseValue: 'small-caps', rawFeatureSettings: '', sizeUnit: 'rem' });

		expect(attributes).toEqual({
			'data-features': 'dlig',
			'data-font': 'bookmania',
			'data-font-id': '1',
			'data-fontweight': '700',
			'data-fontstyle': 'italic',
			'data-textcase': 'small-caps',
			'data-letterspacing': '50',
			'data-lineheight': '1.2',
			'data-fontsize': 'responsive',
			'data-fontsize-min': '20',
			'data-fontsize-preferred': '24',
			'data-fontsize-max': '32',
			style: 'font-feature-settings: "dlig" 1; font-family: var(--font-1); font-weight: 700; font-style: italic; text-transform: none; font-variant-caps: small-caps; font-synthesis-small-caps: auto; letter-spacing: 0.05em; line-height: 1.2; font-size: clamp(1.25rem, 1.5rem + 0.75vw, 2rem)',
		});
	});

	test('a size the author did not change keeps a px span byte for byte', () => {
		const attributes = buildFormatAttributes(emptyState({ selectedFeatures: ['liga', 'dlig'], fontSize: 'responsive' }), Object.assign({}, noExtras, { sizeUnit: 'px' }));
		expect(attributes.style).toBe('font-feature-settings: "liga" 1, "dlig" 1; font-size: clamp(16px, 1.5rem + 1vw, 32px)');
	});

	test('a fixed size is a length with no slider attributes (#255)', () => {
		const attributes = buildFormatAttributes(emptyState({ fontSize: '64' }), Object.assign({}, noExtras, { sizeUnit: 'px' }));
		expect(attributes['data-fontsize']).toBe('64');
		expect(attributes['data-fontsize-min']).toBeUndefined();
		expect(attributes.style).toBe('font-size: 64px');
	});

	test('raw feature settings lead, toggled tags not in them are appended', () => {
		const attributes = buildFormatAttributes(emptyState({ selectedFeatures: ['salt', 'liga'] }), Object.assign({}, noExtras, { rawFeatureSettings: '"salt" 2' }));
		expect(attributes['data-feature-settings']).toBe('"salt" 2');
		expect(attributes['data-features']).toBe('salt,liga');
		expect(attributes.style).toBe('font-feature-settings: "salt" 2, "liga" 1');
	});

	test('under a paragraph style the data attributes stay and no style is written', () => {
		const attributes = buildFormatAttributes(emptyState({ paragraphStyleId: 'ps-3', selectedFeatures: ['liga'], animationId: 7, letterSpacing: 20 }), Object.assign({}, noExtras, { weightToWrite: '700' }));
		expect(attributes).toEqual({
			'data-style-id': 'ps-3',
			'data-animation-id': '7',
			'data-features': 'liga',
			'data-fontweight': '700',
			'data-letterspacing': '20',
		});
	});

	test('invalid variation settings are dropped, valid ones normalized', () => {
		expect(buildFormatAttributes(emptyState({ fontVariationSettings: '"wght" 700; color:red' }), noExtras)).toEqual({ style: '' });
		expect(buildFormatAttributes(emptyState({ fontVariationSettings: "'wght' 650" }), noExtras)).toEqual({
			'data-font-variation-settings': '"wght" 650',
			style: 'font-variation-settings: "wght" 650',
		});
	});

	test('a font name without an id is written as given', () => {
		expect(buildFormatAttributes(emptyState({ selectedFont: 'Georgia' }), noExtras)).toEqual({
			'data-font': 'Georgia',
			style: 'font-family: Georgia',
		});
	});
});

describe('buildPatchFromPending', () => {
	const pending = (keys, featureToggles = []) => ({ keys: new Set(keys), featureToggles });

	test('a font change sets the font and removes the axes', () => {
		expect(buildPatchFromPending(emptyState({ selectedFont: 'bookmania', selectedFontId: 1 }), pending(['font']), false)).toEqual({
			dataAttrs: { 'data-font': 'bookmania', 'data-font-id': '1', 'data-font-variation-settings': null },
			styleDecls: { 'font-family': 'var(--font-1)', 'font-variation-settings': null },
			featureToggles: [],
		});
	});

	test('a weight clear removes the weight', () => {
		const patch = buildPatchFromPending(emptyState({ fontWeight: '700' }), pending(['fontWeight']), true);
		expect(patch.dataAttrs).toEqual({ 'data-fontweight': null });
		expect(patch.styleDecls).toEqual({ 'font-weight': null });
	});

	test('zero spacing and line height remove theirs; a style and the toggles carry over', () => {
		const toggles = [{ tag: 'liga', enabled: false }];
		const patch = buildPatchFromPending(emptyState({ fontStyle: 'italic' }), pending(['letterSpacing', 'lineHeight', 'fontStyle'], toggles), false);
		expect(patch.dataAttrs).toEqual({ 'data-letterspacing': null, 'data-lineheight': null, 'data-fontstyle': 'italic' });
		expect(patch.styleDecls).toEqual({ 'letter-spacing': null, 'line-height': null, 'font-style': 'italic' });
		expect(patch.featureToggles).toEqual(toggles);
		expect(patch.featureToggles).not.toBe(toggles);
	});

	test('a size of inherit removes every size attribute', () => {
		const patch = buildPatchFromPending(emptyState(), pending(['fontSize']), false);
		expect(patch.dataAttrs).toEqual({ 'data-fontsize': null, 'data-fontsize-min': null, 'data-fontsize-preferred': null, 'data-fontsize-max': null });
		expect(patch.styleDecls).toEqual({ 'font-size': null });
	});
});

describe('applyPatchToRuns', () => {
	test('patches each run, and removes the format where the patch leaves nothing', () => {
		const calls = [];
		const richText = {
			applyFormat: (value, format, start, end) => { calls.push(['apply', format.attributes.n, start, end]); return value + 'a'; },
			removeFormat: (value, type, start, end) => { calls.push(['remove', type, start, end]); return value + 'r'; },
		};
		const runs = [
			{ start: 0, end: 4, attributes: { n: 1 } },
			{ start: 4, end: 9, attributes: { n: 2 } },
			{ start: 9, end: 10, attributes: null },
		];
		const shared = { patchTypostFormatAttributes: (attrs) => (attrs && attrs.n === 1 ? { n: 'p1' } : null) };
		expect(applyPatchToRuns('v', runs, {}, shared, richText, FORMAT)).toBe('var');
		expect(calls).toEqual([['apply', 'p1', 0, 4], ['remove', FORMAT, 4, 9]]);
	});
});

/**
 * Tests for the inline editor apply rules (assets/js/inline-apply-rules.js).
 *
 * QA 2026-09 Session E: E-2 (a feature toggle must not write the display
 * default weight), E-3 (a partial-selection convert must not restyle the
 * whole block), E-1 (the inline modal warns about out-of-order sizes).
 */
const {
	isValidFontSizeRange,
	resolveWeightToWrite,
	buildConvertBlockAttributes,
} = require('../../../assets/js/inline-apply-rules.js');

describe('isValidFontSizeRange (inline modal, E-1)', () => {
	it('accepts sizes in non-decreasing order', () => {
		expect(isValidFontSizeRange(16, 24, 32)).toBe(true);
		expect(isValidFontSizeRange(16, 16, 16)).toBe(true);
	});

	it('rejects a minimum above the maximum', () => {
		expect(isValidFontSizeRange(64, 24, 16)).toBe(false);
	});

	it('rejects a preferred size outside the range', () => {
		expect(isValidFontSizeRange(16, 40, 32)).toBe(false);
		expect(isValidFontSizeRange(16, 8, 32)).toBe(false);
	});

	it('coerces numeric strings and ignores non-numbers', () => {
		expect(isValidFontSizeRange('64', '24', '16')).toBe(false);
		expect(isValidFontSizeRange('', 24, 32)).toBe(true);
	});
});

describe('resolveWeightToWrite (E-2)', () => {
	it('keeps a weight the selection already carries', () => {
		expect(resolveWeightToWrite({ explicitWeight: '600', authorPicked: false, stateWeight: '400' })).toBe('600');
	});

	it('writes the modal weight only when the author picked it', () => {
		expect(resolveWeightToWrite({ explicitWeight: '', authorPicked: true, stateWeight: '700' })).toBe('700');
	});

	it('writes nothing for the display default or an inherited weight', () => {
		// A feature toggle on a theme-bold heading: state shows 700 (rendered),
		// the author never touched the select, nothing is stored yet.
		expect(resolveWeightToWrite({ explicitWeight: '', authorPicked: false, stateWeight: '700' })).toBe('');
		expect(resolveWeightToWrite({ explicitWeight: '', authorPicked: false, stateWeight: '400' })).toBe('');
	});

	it('lets a pick in this session replace the stored weight', () => {
		// Changing the weight of already-weighted text must write the new value
		expect(resolveWeightToWrite({ explicitWeight: '300', authorPicked: true, stateWeight: '700' })).toBe('700');
	});

	it('tolerates missing facts', () => {
		expect(resolveWeightToWrite()).toBe('');
		expect(resolveWeightToWrite({ authorPicked: true })).toBe('');
	});
});

describe('buildConvertBlockAttributes (E-3)', () => {
	const state = {
		selectedFeatures: ['liga'],
		selectedFont: 'Fraunces',
		fontSize: 'responsive',
		fontSizeMin: 16,
		fontSizePreferred: 24,
		fontSizeMax: 32,
		fontWeight: '400',
		letterSpacing: 50,
		lineHeight: 1.8,
	};

	it('gives a new block inherit defaults when only part of the text is selected', () => {
		const attrs = buildConvertBlockAttributes({
			partialSelection: true, isNewBlock: true, content: 'Convert <span>sample</span> words', tagName: 'p', effectiveWeight: '700', state,
		});
		expect(attrs).toEqual({
			content: 'Convert <span>sample</span> words',
			tagName: 'p',
			features: [],
			fontFamily: '',
			fontSize: 'inherit',
			fontWeight: '700',
			letterSpacing: 0,
			lineHeight: 0,
		});
		expect(attrs).not.toHaveProperty('fontSizeMin');
	});

	it('only replaces the content of an existing block on a partial selection', () => {
		const attrs = buildConvertBlockAttributes({
			partialSelection: true, isNewBlock: false, content: 'x', existingFeatures: ['dlig'], state,
		});
		expect(attrs).toEqual({ content: 'x', features: ['dlig'] });
	});

	it('carries the modal settings to a new block when the whole block is converted', () => {
		const attrs = buildConvertBlockAttributes({
			partialSelection: false, isNewBlock: true, content: 'Whole text', tagName: 'h2', effectiveWeight: '700', state,
		});
		expect(attrs).toEqual({
			content: 'Whole text',
			tagName: 'h2',
			features: ['liga'],
			fontFamily: 'Fraunces',
			fontSize: 'responsive',
			fontSizeMin: 16,
			fontSizePreferred: 24,
			fontSizeMax: 32,
			fontWeight: '700',
			letterSpacing: 50,
			lineHeight: 1.8,
		});
	});

	it('updates an existing block with the modal settings when nothing is selected', () => {
		const attrs = buildConvertBlockAttributes({
			partialSelection: false, isNewBlock: false, content: 'Whole text', state,
		});
		expect(attrs.fontWeight).toBe('400');
		expect(attrs.letterSpacing).toBe(50);
		expect(attrs).not.toHaveProperty('tagName');
	});

	it('falls back to 400 when no weight is known', () => {
		const attrs = buildConvertBlockAttributes({ partialSelection: true, isNewBlock: true, content: '', tagName: 'p', state: {} });
		expect(attrs.fontWeight).toBe('400');
	});
});

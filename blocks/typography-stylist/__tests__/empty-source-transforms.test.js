/**
 * A block made from an empty block (#412): the block transforms in index.js,
 * "Convert to block" (buildConvertBlockAttributes() in
 * assets/js/inline-apply-rules.js), and the toolbar button's confirmation
 * flag (#411). Sources with text must convert exactly as before.
 */

const mockRegister = jest.fn();
const mockAddFilter = jest.fn();
jest.mock('@wordpress/blocks', () => ({
	registerBlockType: (...args) => mockRegister(...args),
	createBlock: (name, attributes) => ({ name, attributes }),
}), { virtual: true });
jest.mock('@wordpress/hooks', () => ({ addFilter: (...args) => mockAddFilter(...args) }));
jest.mock('../edit', () => () => null);
jest.mock('../save', () => () => null);
jest.mock('../deprecated', () => []);
jest.mock('@wordpress/components', () => ({}), { virtual: true });

const { buildThemeLookAttributes, buildEmptySourceBlockAttributes } = require('../../../assets/js/theme-look.js');
const { buildConvertBlockAttributes } = require('../../../assets/js/inline-apply-rules.js');
const { resetEmptySourceBlock } = require('../strip-styles/empty-source');
const { shouldConfirmStripStyles } = require('../strip-styles/strip-styles-button');

let transforms;
beforeAll(() => {
	window.typostData = { newFontSizeUnit: 'px' };
	require('../index');
	transforms = mockRegister.mock.calls[0][1].transforms.from;
});

const fromParagraph = () => transforms.find((t) => t.blocks.includes('core/paragraph'));
const fromHeading = () => transforms.find((t) => t.blocks.includes('core/heading'));

describe('index.js registers the empty-source filter', () => {
	it('after the WordPress filters (priority 20)', () => {
		expect(mockAddFilter).toHaveBeenCalledWith('blocks.switchToBlockType.transformedBlock', 'typost/block/empty-source', resetEmptySourceBlock, 20);
	});
});

describe('the transforms from an empty block (#412)', () => {
	it.each(['', '   ', '<br>', '<span class="typost-styled" style="font-weight: 700"> <br></span>', '&nbsp;'])('Paragraph %j gives the tag, the unit and the theme look', (content) => {
		expect(fromParagraph().transform({ content, className: 'typost-styled typost-ps-2' })).toEqual({
			name: 'typost/block',
			attributes: buildEmptySourceBlockAttributes('p', 'px'),
		});
	});

	it.each([1, 2, 3, 4, 5, 6])('Heading level %i gives h%i', (level) => {
		const block = fromHeading().transform({ content: '', level });
		expect(block.attributes).toEqual(buildEmptySourceBlockAttributes(`h${level}`, 'px'));
		expect(block.attributes.fontWeight).toBe('');
	});
});

describe('the transforms from a block with text are unchanged', () => {
	it('Paragraph: content, tag, no features, the unit; no weight without a selected source', () => {
		expect(fromParagraph().transform({ content: 'Moonlit <em>garden</em>' })).toEqual({
			name: 'typost/block',
			attributes: { content: 'Moonlit <em>garden</em>', tagName: 'p', features: [], fontSizeUnit: 'px' },
		});
	});

	it('Heading: the level becomes the tag', () => {
		expect(fromHeading().transform({ content: 'Title', level: 3 }).attributes).toEqual({ content: 'Title', tagName: 'h3', features: [], fontSizeUnit: 'px' });
	});
});

describe('buildConvertBlockAttributes with an empty source (#412)', () => {
	const busyState = {
		selectedFeatures: ['dlig'], selectedFont: 'Bookmania', fontSize: 'responsive', fontSizeMin: 20, fontSizePreferred: 30,
		fontSizeMax: 60, fontWeight: '700', letterSpacing: 40, lineHeight: 1.5, textCase: 'uppercase', fakeSmallCaps: false,
	};

	it.each([false, true])('a new block gets only the tag, the unit and the theme look (partial selection: %s)', (partialSelection) => {
		expect(buildConvertBlockAttributes({
			emptySource: true, partialSelection, isNewBlock: true, content: '<span class="typost-styled"> </span>', tagName: 'h2',
			effectiveWeight: '700', fontSizeUnit: 'rem', state: busyState,
		})).toEqual(buildEmptySourceBlockAttributes('h2', 'rem'));
	});

	it('ignores the dialog state entirely', () => {
		const attrs = buildConvertBlockAttributes({ emptySource: true, isNewBlock: true, tagName: 'p', state: busyState });
		expect(attrs).toEqual({ ...buildThemeLookAttributes(), content: '', tagName: 'p' });
	});

	it('does not touch an existing Typography Stylist block (emptySource ignored)', () => {
		const withFlag = buildConvertBlockAttributes({ emptySource: true, isNewBlock: false, partialSelection: false, content: '', state: busyState });
		const without = buildConvertBlockAttributes({ isNewBlock: false, partialSelection: false, content: '', state: busyState });
		expect(withFlag).toEqual(without);
	});

	it('converts a source with text as before', () => {
		const args = { partialSelection: false, isNewBlock: true, content: 'Kicker', tagName: 'h2', effectiveWeight: '700', fontSizeUnit: 'px', state: busyState };
		expect(buildConvertBlockAttributes({ ...args, emptySource: false })).toEqual(buildConvertBlockAttributes(args));
		expect(buildConvertBlockAttributes(args)).toMatchObject({ features: ['dlig'], fontFamily: 'Bookmania', fontWeight: '700', fontSize: 'responsive' });
	});
});

describe('isConvertSourceEmpty: the text Convert to block judges (review of #412)', () => {
	const { isConvertSourceEmpty } = require('../../../assets/js/inline-editor/convert-to-block.js');

	it('is not empty for a block whose text is not in a content attribute (a Pullquote)', () => {
		expect(isConvertSourceEmpty(undefined, 'Quoted words')).toBe(false);
	});

	it('reads the RichText text as text, not markup (round 2 review)', () => {
		expect(isConvertSourceEmpty(undefined, '<b>')).toBe(false);
		expect(isConvertSourceEmpty(undefined, '<br>')).toBe(false);
		expect(isConvertSourceEmpty(undefined, '&nbsp;')).toBe(false);
	});

	it('is empty when neither the content attribute nor the RichText has text', () => {
		expect(isConvertSourceEmpty(undefined, '')).toBe(true);
		expect(isConvertSourceEmpty('', '')).toBe(true);
		expect(isConvertSourceEmpty('<br>', '\n')).toBe(true);
	});

	it('judges the content attribute when there is one', () => {
		expect(isConvertSourceEmpty('<span class="typost-styled"> </span>', ' ')).toBe(true);
		expect(isConvertSourceEmpty('Words', 'Words')).toBe(false);
		expect(isConvertSourceEmpty({ toString: () => 'Rich' }, 'Rich')).toBe(false);
	});
});

describe('shouldConfirmStripStyles: the Options tab "clear confirmation" setting', () => {
	it.each([
		[{ showClearConfirmation: true }, true],
		[{ showClearConfirmation: '1' }, true],
		[{ showClearConfirmation: '' }, false],
		[{ showClearConfirmation: '0' }, false],
		[{ showClearConfirmation: false }, false],
		[{}, false],
		[undefined, false],
	])('%j asks first: %s', (data, expected) => {
		expect(shouldConfirmStripStyles(data)).toBe(expected);
	});
});

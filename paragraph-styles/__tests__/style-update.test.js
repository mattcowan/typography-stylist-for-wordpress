/**
 * #452: "Update Style" from the editor, and the lock on style changes.
 *
 * - isFlagEnabled(): the editor reads the lock flag like the inline
 *   editor's flags, so a "0" or "false" that reached JavaScript as a string
 *   is off.
 * - styleRequestErrorText(): the panel shows the server's message when a
 *   save fails (a 429, the lock's 403), else the fallback.
 * - The core Paragraph and Heading subset: the block's own weight, italic,
 *   line height, letter spacing, case and fixed size go into the style; a
 *   preset font family, a preset or fluid size and values that cannot be
 *   converted stay on the block; after the save the copied settings are
 *   removed from the block, and nothing else.
 */

const {
	isFlagEnabled,
	styleRequestErrorText,
	CORE_BLOCK_STYLE_KEYS,
	readCoreBlockTypography,
	isFluidTypography,
	coreBlockStyleDifferences,
	buildCoreBlockStyleState,
	buildCoreBlockClearUpdate,
	buildStyleUpdateProperties,
	resolveStyleList,
	isStyleModified,
} = require('../assets/js/lib/ps-utils');

describe('isFlagEnabled (the lock flag)', () => {
	test.each([
		[true, true],
		[1, true],
		['1', true],
		['true', true],
		[false, false],
		[0, false],
		['0', false],
		['false', false],
		[' FALSE ', false],
		['', false],
		[null, false],
		[undefined, false],
	])('%p is %p', (value, expected) => {
		expect(isFlagEnabled(value)).toBe(expected);
	});
});

describe('styleRequestErrorText', () => {
	test('the server message of a refused request', () => {
		expect(styleRequestErrorText({ code: 'rate_limit_exceeded', message: 'Too many requests. Please try again later.' }, 'fallback'))
			.toBe('Too many requests. Please try again later.');
	});

	test('the fallback without a message', () => {
		expect(styleRequestErrorText(undefined, 'fallback')).toBe('fallback');
		expect(styleRequestErrorText({ code: 'fetch_error' }, 'fallback')).toBe('fallback');
		expect(styleRequestErrorText({ message: '   ' }, 'fallback')).toBe('fallback');
		expect(styleRequestErrorText(new Error(''), 'fallback')).toBe('fallback');
	});
});

describe('readCoreBlockTypography (core block subset)', () => {
	test('a block with no settings of its own copies nothing', () => {
		expect(readCoreBlockTypography({ content: 'x' })).toEqual({ state: {}, keys: [], skipped: [] });
		expect(readCoreBlockTypography(undefined)).toEqual({ state: {}, keys: [], skipped: [] });
		expect(readCoreBlockTypography({ style: { typography: {} } })).toEqual({ state: {}, keys: [], skipped: [] });
	});

	test('weight, italic, line height, letter spacing in em, case and a px size', () => {
		const read = readCoreBlockTypography({
			style: { typography: { fontWeight: '700', fontStyle: 'italic', lineHeight: '1.45', letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '28px' } },
		});
		expect(read.state).toEqual({
			explicitFontWeight: '700',
			explicitFontStyle: 'italic',
			fontSize: '28',
			lineHeight: 1.45,
			letterSpacing: 50,
			textCase: 'uppercase',
		});
		expect(read.keys).toEqual(CORE_BLOCK_STYLE_KEYS);
		expect(read.skipped).toEqual([]);
	});

	test('a rem size is converted at 16px, like the plugin writes rem', () => {
		expect(readCoreBlockTypography({ style: { typography: { fontSize: '1.5rem' } } }).state.fontSize).toBe('24');
		expect(readCoreBlockTypography({ style: { typography: { fontSize: '1.3rem' } } }).state.fontSize).toBe('20.8');
	});

	test('a preset size, a fluid or relative size and a preset font family stay on the block', () => {
		expect(readCoreBlockTypography({ fontSize: 'large' })).toEqual({ state: {}, keys: [], skipped: ['fontSize'] });
		['clamp(1rem, 2vw, 2rem)', '1.2em', '120%', 'var(--wp--preset--font-size--large)'].forEach((size) => {
			expect(readCoreBlockTypography({ style: { typography: { fontSize: size } } }).skipped).toEqual(['fontSize']);
		});
		expect(readCoreBlockTypography({ fontFamily: 'serif' }).skipped).toEqual(['fontFamily']);
		expect(readCoreBlockTypography({ style: { typography: { fontFamily: 'var:preset|font-family|serif' } } }).skipped).toEqual(['fontFamily']);
	});

	test('with fluid typography on, a custom px or rem size is fluid too and stays on the block', () => {
		['28px', '1.5rem'].forEach((size) => {
			const read = readCoreBlockTypography({ style: { typography: { fontSize: size, fontWeight: '700' } } }, { fluidTypography: true });
			expect(read.state).toEqual({ explicitFontWeight: '700' });
			expect(read.keys).toEqual(['fontWeight']);
			expect(read.skipped).toEqual(['fontSize']);
		});
		expect(readCoreBlockTypography({ style: { typography: { fontSize: '28px' } } }, { fluidTypography: false }).state.fontSize).toBe('28');
	});

	test('letter spacing in px or rem uses the rendered font size, and stays without it', () => {
		const block = { style: { typography: { letterSpacing: '2px' } } };
		expect(readCoreBlockTypography(block, { fontSizePx: 20 }).state.letterSpacing).toBe(100);
		expect(readCoreBlockTypography({ style: { typography: { letterSpacing: '0.125rem' } } }, { fontSizePx: 20 }).state.letterSpacing).toBe(100);
		expect(readCoreBlockTypography(block).skipped).toEqual(['letterSpacing']);
		expect(readCoreBlockTypography(block, { fontSizePx: 0 }).skipped).toEqual(['letterSpacing']);
		expect(readCoreBlockTypography({ style: { typography: { letterSpacing: '-0.02em' } } }).state.letterSpacing).toBe(-20);
		expect(readCoreBlockTypography({ style: { typography: { letterSpacing: '0' } } }).state.letterSpacing).toBe(0);
	});

	test('values it cannot read stay on the block', () => {
		const read = readCoreBlockTypography({ style: { typography: { fontWeight: 'var(--weight)', fontStyle: 'slanted', lineHeight: '24px' } } });
		expect(read.keys).toEqual([]);
		expect(read.skipped).toEqual(['fontWeight', 'fontStyle', 'lineHeight']);
	});

	test('bold and normal weights are read as numbers', () => {
		expect(readCoreBlockTypography({ style: { typography: { fontWeight: 'bold' } } }).state.explicitFontWeight).toBe('700');
		expect(readCoreBlockTypography({ style: { typography: { fontWeight: 400 } } }).state.explicitFontWeight).toBe('400');
	});

	test('case "none" is the style\'s Normal case', () => {
		expect(readCoreBlockTypography({ style: { typography: { textTransform: 'none' } } }).state.textCase).toBe('none');
	});
});

describe('isFluidTypography', () => {
	test.each([
		[{ __experimentalFeatures: { typography: { fluid: true } } }, true],
		[{ __experimentalFeatures: { typography: { fluid: { minFontSize: '15px', maxViewportWidth: '1200px' } } } }, true],
		[{ __experimentalFeatures: { typography: { fluid: false } } }, false],
		[{ __experimentalFeatures: { typography: {} } }, false],
		[{ __experimentalFeatures: {} }, false],
		[{}, false],
		[undefined, false],
		[{ __experimentalFeatures: { typography: { fluid: 'true' } } }, false],
	])('%j is %p', (settings, expected) => {
		expect(isFluidTypography(settings)).toBe(expected);
	});
});

describe('coreBlockStyleDifferences', () => {
	const style = { fontWeight: '300', letterSpacing: 20, lineHeight: 1.5, fontSize: '24' };

	test('only the settings that differ from the style', () => {
		const read = readCoreBlockTypography({ style: { typography: { fontWeight: '300', lineHeight: '1.8', letterSpacing: '0.02em', fontSize: '24px', textTransform: 'uppercase' } } });
		expect(coreBlockStyleDifferences(read, style)).toEqual(['lineHeight', 'textCase']);
	});

	test('a weight of 400 on a style with no weight is no difference', () => {
		expect(coreBlockStyleDifferences(readCoreBlockTypography({ style: { typography: { fontWeight: '400' } } }), {})).toEqual([]);
	});

	test('a fixed size on a responsive style differs', () => {
		expect(coreBlockStyleDifferences(readCoreBlockTypography({ style: { typography: { fontSize: '24px' } } }), { fontSize: 'responsive' })).toEqual(['fontSize']);
	});
});

describe('Update Style from a core block', () => {
	const styles = resolveStyleList([
		{ id: 1, name: 'Body', properties: { fontId: 5, fontWeight: '300', fontSize: 'responsive', fontSizeMin: 16, fontSizePreferred: 18, fontSizeMax: 20, fontSizeUnit: 'rem', letterSpacing: 20, initialHang: 0.2, textColor: '#aa0000', alignment: 'center', features: ['onum'] } },
		{ id: 2, name: 'Quote', basedOn: 1, properties: { fontStyle: 'italic' } },
	]);
	const body = styles.find((s) => s.id === 1);
	const quote = styles.find((s) => s.id === 2);

	test('an untouched style state is not modified', () => {
		expect(isStyleModified(buildCoreBlockStyleState(body.properties, {}), body.properties)).toBe(false);
	});

	test('the block\'s weight and line height go into the style; everything else stays', () => {
		const read = readCoreBlockTypography({ style: { typography: { fontWeight: '600', lineHeight: '1.7' } } });
		const properties = buildStyleUpdateProperties(buildCoreBlockStyleState(body.properties, read.state), body, styles, 'rem');
		expect(properties).toEqual({
			fontId: 5,
			fontWeight: '600',
			fontSize: 'responsive',
			fontSizeMin: 16,
			fontSizePreferred: 18,
			fontSizeMax: 20,
			fontSizeUnit: 'rem',
			letterSpacing: 20,
			lineHeight: 1.7,
			features: ['onum'],
			// Settings no core control has, and the hang, stay as they were
			initialHang: 0.2,
			textColor: '#aa0000',
			alignment: 'center',
		});
	});

	test('a fixed size replaces a responsive size and keeps the style\'s unit', () => {
		const read = readCoreBlockTypography({ style: { typography: { fontSize: '30px' } } });
		const properties = buildStyleUpdateProperties(buildCoreBlockStyleState(body.properties, read.state), body, styles, 'px');
		expect(properties.fontSize).toBe('30');
		expect(properties.fontSizeUnit).toBe('rem');
		expect(properties.fontSizeMin).toBeUndefined();
		expect(properties.fontSizePreferred).toBeUndefined();
		expect(properties.fontSizeMax).toBeUndefined();
	});

	test('a style based on another saves only what differs from its parent', () => {
		const read = readCoreBlockTypography({ style: { typography: { fontWeight: '300', letterSpacing: '0.05em' } } });
		// The weight equals the parent's: it stays inherited
		expect(buildStyleUpdateProperties(buildCoreBlockStyleState(quote.properties, read.state), quote, styles, 'rem'))
			.toEqual({ fontStyle: 'italic', letterSpacing: 50 });
	});
});

describe('buildCoreBlockClearUpdate', () => {
	test('removes only the copied settings', () => {
		const attributes = {
			style: {
				typography: { fontWeight: '700', lineHeight: '1.6', fontFamily: 'serif', textTransform: 'uppercase' },
				color: { text: '#111' },
			},
		};
		expect(buildCoreBlockClearUpdate(attributes, ['fontWeight', 'textCase'])).toEqual({
			style: { typography: { lineHeight: '1.6', fontFamily: 'serif' }, color: { text: '#111' } },
		});
		// The attributes object is not changed in place
		expect(attributes.style.typography.fontWeight).toBe('700');
	});

	test('removes an empty typography object, and the style when nothing is left', () => {
		expect(buildCoreBlockClearUpdate({ style: { typography: { fontSize: '28px' }, color: { text: '#111' } } }, ['fontSize']))
			.toEqual({ style: { color: { text: '#111' } } });
		expect(buildCoreBlockClearUpdate({ style: { typography: { letterSpacing: '1px' } } }, ['letterSpacing']))
			.toEqual({ style: undefined });
	});

	test('a setting changed while the request ran stays; one that did not change goes', () => {
		// What was read and sent when the author confirmed
		const sent = { fontWeight: '700', lineHeight: '1.6' };
		// The author changed the weight on the block before the save returned
		const now = { style: { typography: { fontWeight: '900', lineHeight: '1.6' } } };
		expect(buildCoreBlockClearUpdate(now, ['fontWeight', 'lineHeight'], sent)).toEqual({
			style: { typography: { fontWeight: '900' } },
		});
		// Nothing changed: both go
		expect(buildCoreBlockClearUpdate({ style: { typography: { fontWeight: '700', lineHeight: '1.6' } } }, ['fontWeight', 'lineHeight'], sent))
			.toEqual({ style: undefined });
		// Only the changed one is left: nothing to remove
		expect(buildCoreBlockClearUpdate({ style: { typography: { fontWeight: '900' } } }, ['fontWeight'], sent)).toBeNull();
	});

	test('nothing to remove', () => {
		expect(buildCoreBlockClearUpdate({}, ['fontWeight'])).toBeNull();
		expect(buildCoreBlockClearUpdate({ style: { typography: { lineHeight: '1.6' } } }, [])).toBeNull();
		expect(buildCoreBlockClearUpdate({ style: { typography: { lineHeight: '1.6' } } }, ['fontWeight'])).toBeNull();
	});
});

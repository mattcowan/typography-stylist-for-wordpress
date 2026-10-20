/**
 * Based On (#200): a paragraph style inherits every property it does not
 * set from another style.
 *
 * The resolution, the compare and the CSS of a child style are held to the
 * same fixture as the PHP twins (tests/Unit/ParagraphStylesBasedOnTest.php),
 * so the editor and the server agree on what a child renders.
 */

const {
	resolveStyleProperties,
	resolveStyleList,
	computeStyleOverrides,
	buildStyleUpdateProperties,
	mergeStyleProperties,
	compactStyleProperties,
	buildStyleCssBlock,
	isStyleModified,
	MAX_BASED_ON_LEVELS,
} = require('../assets/js/lib/ps-utils');

const fixture = require('./fixtures/based-on.json');

describe('resolveStyleProperties (shared fixture)', () => {
	fixture.resolve.forEach(({ label, styles, expected }) => {
		test(label, () => {
			Object.keys(expected).forEach((id) => {
				const style = styles.find((s) => String(s.id) === id);
				expect(resolveStyleProperties(style, styles)).toEqual(expected[id]);
			});
		});
	});

	test('the fixture is read', () => {
		// A control: an empty fixture would let every case pass by never running
		expect(fixture.resolve.length).toBeGreaterThanOrEqual(8);
		expect(fixture.equality.length).toBeGreaterThanOrEqual(15);
	});

	test('a style without a parent gets the very object it stores', () => {
		const props = { fontId: 3 };
		expect(resolveStyleProperties({ id: 1, properties: props }, [])).toBe(props);
	});

	test('MAX_BASED_ON_LEVELS matches PHP', () => {
		expect(MAX_BASED_ON_LEVELS).toBe(10);
	});
});

describe('computeStyleOverrides compares like PHP drop_inherited_properties (shared fixture)', () => {
	fixture.equality.forEach(({ label, key, a, b, equal }) => {
		test(`${label}: ${equal ? 'inherited' : 'override'}`, () => {
			const overrides = computeStyleOverrides(a, b);
			expect(Object.prototype.hasOwnProperty.call(overrides, key)).toBe(!equal);
		});
	});
});

describe('computeStyleOverrides matches PHP compute_overrides (shared fixture)', () => {
	test('the fixture is read', () => {
		expect(fixture.overrides.length).toBeGreaterThanOrEqual(5);
	});

	fixture.overrides.forEach(({ label, full, parent, expected }) => {
		test(label, () => {
			expect(computeStyleOverrides(full, parent)).toEqual(expected);
		});
	});
});

describe('child style CSS (shared fixture)', () => {
	fixture.css.forEach(({ label, styles, id, css }) => {
		test(label, () => {
			const style = resolveStyleList(styles).find((s) => s.id === id);
			expect(buildStyleCssBlock(style)).toBe(css);
		});
	});
});

describe('resolveStyleList', () => {
	const styles = fixture.resolve[1].styles; // Body, Body – First, Caption

	test('gives a child resolved properties and keeps what it stores in ownProperties', () => {
		const caption = resolveStyleList(styles).find((s) => s.id === 3);
		expect(caption.ownProperties).toEqual({ fontSize: '14', fontSizeUnit: 'rem', letterSpacing: 20 });
		expect(caption.properties.fontId).toBe(5);
		expect(caption.properties.fontSize).toBe('14');
	});

	test('leaves a style without a parent as it is (old styles unchanged)', () => {
		const list = resolveStyleList(styles);
		expect(list[0]).toBe(styles[0]);
		expect(list[0].ownProperties).toBeUndefined();
	});

	test('is idempotent: resolving the client shape again gives the same result', () => {
		const once = resolveStyleList(styles);
		expect(resolveStyleList(once)).toEqual(once);
	});

	test('an updated parent reaches its children when the list is resolved again', () => {
		const once = resolveStyleList(styles);
		const parentUpdated = once.map((s) => (s.id === 1 ? { ...s, properties: { ...s.properties, fontId: 8 } } : s));
		const again = resolveStyleList(parentUpdated);
		expect(again.find((s) => s.id === 2).properties.fontId).toBe(8);
		expect(again.find((s) => s.id === 3).properties.fontId).toBe(8);
	});
});

describe('merge and compact', () => {
	test('a group key without its lead key is ignored', () => {
		expect(mergeStyleProperties({ fontSize: '20' }, { fontSizeUnit: 'rem' })).toEqual({ fontSize: '20' });
	});

	test('compact keeps an explicit Normal case and an upright style', () => {
		expect(compactStyleProperties({ textCase: 'none', fontStyle: 'normal', fontWeight: '400' }))
			.toEqual({ textCase: 'none', fontStyle: 'normal', fontWeight: '400' });
	});
});

describe('computeStyleOverrides', () => {
	const body = fixture.resolve[1].styles[0].properties;

	test('keeps only what differs from the parent', () => {
		const full = { ...body, letterSpacing: 20 };
		expect(computeStyleOverrides(full, body)).toEqual({ letterSpacing: 20 });
	});

	test('a property the parent sets and the look does not is stored empty, so it stays unset', () => {
		const { initialHang, features, fontId, ...rest } = body;
		expect(computeStyleOverrides(rest, body)).toEqual({ initialHang: 0, features: [], fontId: 0 });
	});

	test('a size the look does not set is stored as inherit; a case as Default', () => {
		const { fontSize, fontSizeUnit, fontSizeMin, fontSizePreferred, fontSizeMax, ...noSize } = body;
		expect(computeStyleOverrides(noSize, body)).toEqual({ fontSize: 'inherit' });
		expect(computeStyleOverrides({}, { textCase: 'uppercase' })).toEqual({ textCase: '' });
	});

	test('a changed size sends the whole size group', () => {
		const full = { ...body, fontSizeMax: 24 };
		expect(computeStyleOverrides(full, body)).toEqual({
			fontSize: 'responsive', fontSizeUnit: 'rem', fontSizeMin: 16, fontSizePreferred: 18, fontSizeMax: 24,
		});
	});

	test('the overrides resolve back to the look', () => {
		const full = { fontId: 9, fontWeight: '400', fontSize: '14', fontSizeUnit: 'rem', lineHeight: 1.6, features: ['liga', 'onum'], textCase: 'small-caps' };
		const overrides = computeStyleOverrides(full, body);
		const resolved = resolveStyleProperties(
			{ id: 2, basedOn: 1, properties: overrides },
			[{ id: 1, properties: body }]
		);
		expect(resolved).toEqual(full);
	});
});

describe('buildStyleUpdateProperties (Update Style)', () => {
	const styles = resolveStyleList(fixture.resolve[1].styles);
	const caption = styles.find((s) => s.id === 3);

	// The state an editor reports for text with Caption applied
	const captionState = {
		explicitFontId: 5,
		explicitFontWeight: '400',
		explicitFontStyle: '',
		fontSize: '14',
		letterSpacing: 20,
		lineHeight: 1.6,
		features: ['liga', 'onum'],
		fontVariationSettings: '',
		initialHang: 0.1,
		textCase: '',
		fakeSmallCaps: true,
	};

	test('an untouched child is not modified against its resolved properties', () => {
		expect(isStyleModified(captionState, caption.properties)).toBe(false);
	});

	test('saving an untouched child keeps every inherited value inherited', () => {
		expect(buildStyleUpdateProperties(captionState, caption, styles, 'rem'))
			.toEqual({ fontSize: '14', fontSizeUnit: 'rem', letterSpacing: 20 });
	});

	test('a value set back to the parent\'s becomes inherited again', () => {
		const state = { ...captionState, letterSpacing: 0 };
		expect(buildStyleUpdateProperties(state, caption, styles, 'rem')).toEqual({ fontSize: '14', fontSizeUnit: 'rem' });
	});

	test('a new override is added', () => {
		const state = { ...captionState, explicitFontStyle: 'italic' };
		expect(buildStyleUpdateProperties(state, caption, styles, 'rem'))
			.toEqual({ fontSize: '14', fontSizeUnit: 'rem', letterSpacing: 20, fontStyle: 'italic' });
	});

	test('an editor that does not report the hang keeps the inherited hang inherited', () => {
		const { initialHang, ...inlineState } = captionState;
		expect(buildStyleUpdateProperties(inlineState, caption, styles, 'rem'))
			.toEqual({ fontSize: '14', fontSizeUnit: 'rem', letterSpacing: 20 });
	});

	test('a style without a parent sends its whole look, as before', () => {
		const body = styles[0];
		const state = { explicitFontId: 5, explicitFontWeight: '400', fontSize: 'inherit', lineHeight: 1.6 };
		expect(buildStyleUpdateProperties(state, body, styles, 'rem')).toEqual({ fontId: 5, fontWeight: '400', lineHeight: 1.6, initialHang: 0.1 });
	});

	test('a child whose parent is gone sends its whole look', () => {
		const orphan = { id: 7, basedOn: 99, properties: { fontId: 2 } };
		expect(buildStyleUpdateProperties({ explicitFontId: 2 }, orphan, styles, 'rem')).toEqual({ fontId: 2 });
	});
});

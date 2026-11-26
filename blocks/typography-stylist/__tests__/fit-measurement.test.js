/**
 * Fit-to-width measurement and editing value (#388).
 *
 * A post with a fit block that the author only opened was dirty on some
 * opens. The measurement writes the new ratios marked not persistent, but
 * the ratios were also in the RichText value. Core's RichText marks the last
 * block change as persistent whenever its value changes and its text does
 * not (useMarkPersistent in @wordpress/block-editor), so the write became a
 * persistent change, and core's block sync then sent it to the post as an
 * edit. The value now holds no ratio: each line reads its size from a
 * custom property that the block wrapper carries.
 *
 * The real editor path (dirty flag, undo, both browsers) is checked in
 * tests/e2e/saved-markup.spec.js and by hand.
 */

jest.mock('@wordpress/data', () => {
	const actions = {
		__unstableMarkNextChangeAsNotPersistent: jest.fn(),
	};
	return { dispatch: () => actions, __actions: actions };
}, { virtual: true });

jest.mock('@wordpress/block-editor', () => ({ store: 'core/block-editor' }), { virtual: true });

import { renderHook, act } from '@testing-library/react';
import { useLayoutEffect, useRef } from '@wordpress/element';
import useFitMeasurement from '../hooks/use-fit-measurement';
import {
	wrapFitLinesBySizeProperty,
	buildFitLineSizeProperties,
	fitLineSizeProperty,
	buildFitFontSize,
	buildFitLinesHtml,
	unwrapFitLines,
	computeHungFitRatio,
	computeFitWordRatio,
} from '../utils';

const dataActions = require('@wordpress/data').__actions;

const CONTENT = 'Moonlit garden<br>party tonight';

function blockProps(overrides) {
	return Object.assign({
		fontSize: 'fit',
		content: CONTENT,
		fontId: '',
		fontFamily: '',
		fontWeight: '',
		fontStyle: '',
		letterSpacing: 0,
		features: [],
		fontVariationSettings: '',
		fitLineSizes: [0.1444, 0.1668],
		fitWordSizes: [0.2875, 0.2959],
		fitMaxSize: 0,
		setAttributes: jest.fn(),
		initialHang: 0,
		fitLineHangs: [],
		textAlign: '',
		blockFontSizeUnit: 'rem',
		clientId: 'fit-block',
		textCase: '',
		fakeSmallCaps: false,
	}, overrides);
}

describe('useFitMeasurement: the editing value holds no ratio', () => {
	it('a new measurement changes the line sizes, not the RichText value', () => {
		const { result, rerender } = renderHook((props) => useFitMeasurement(props), { initialProps: blockProps() });
		const before = result.current;
		rerender(blockProps({ fitLineSizes: [0.1484, 0.1781], fitWordSizes: [0.2937, 0.3216] }));
		expect(result.current.fitEditingValue).toBe(before.fitEditingValue);
		expect(result.current.fitLineSizeStyle).not.toEqual(before.fitLineSizeStyle);
		expect(result.current.fitLineSizeStyle).toEqual({
			[fitLineSizeProperty(0)]: buildFitFontSize(0.1484, 0, 'rem', 0.2937),
			[fitLineSizeProperty(1)]: buildFitFontSize(0.1781, 0, 'rem', 0.3216),
		});
	});

	it('a RichText that marks a same-text value change as persistent sees no change when only the ratios change', () => {
		// The rule of core's useMarkPersistent: a layout effect on the value
		// that marks the last change persistent when the text is the same.
		const marks = [];
		const useRichTextMark = (html) => {
			const previous = useRef(null);
			useLayoutEffect(() => {
				const text = html.replace(/<br>/g, '\n').replace(/<[^>]*>/g, '');
				if (previous.current !== null && previous.current === text) {
					marks.push(html);
				}
				previous.current = text;
			}, [html]);
		};
		const { rerender } = renderHook((props) => useRichTextMark(useFitMeasurement(props).fitEditingValue), { initialProps: blockProps() });
		rerender(blockProps({ fitLineSizes: [0.1484, 0.1781], fitWordSizes: [0.2937, 0.3216] }));
		rerender(blockProps({ fitLineSizes: [0.15, 0.18], fitWordSizes: [0.3, 0.33], fitMaxSize: 96 }));
		expect(marks).toEqual([]);
		// A hang is an author's edit and still changes the value
		rerender(blockProps({ fitLineSizes: [0.15, 0.18], fitWordSizes: [0.3, 0.33], fitMaxSize: 96, fitLineHangs: [0, 0.1] }));
		expect(marks).toHaveLength(1);
	});

	it('is empty unless the block is fit to width and has content', () => {
		const { result, rerender } = renderHook((props) => useFitMeasurement(props), { initialProps: blockProps({ fontSize: 'responsive' }) });
		expect(result.current).toEqual({ fitEditingValue: '', fitLineSizeStyle: undefined });
		rerender(blockProps({ content: '' }));
		expect(result.current).toEqual({ fitEditingValue: '', fitLineSizeStyle: undefined });
		rerender(blockProps({ fitLineSizes: [], fitWordSizes: [] }));
		expect(result.current.fitLineSizeStyle).toBeUndefined();
		expect(result.current.fitEditingValue).not.toBe('');
	});
});

describe('wrapFitLinesBySizeProperty', () => {
	it('wraps each line with a size read from its custom property, keeping the <br> separators', () => {
		expect(wrapFitLinesBySizeProperty(CONTENT, [])).toBe(
			'<span class="typost-line" style="font-size:var(--typost-fit-line-0)">Moonlit garden</span>'
			+ '<br><span class="typost-line" style="font-size:var(--typost-fit-line-1)">party tonight</span>'
		);
	});

	it('keeps the hang of lines 2+ after the size, as the frontend tag does', () => {
		expect(wrapFitLinesBySizeProperty('one<br>two', [0.3, 0.12])).toBe(
			'<span class="typost-line" style="font-size:var(--typost-fit-line-0)">one</span>'
			+ '<br><span class="typost-line" style="font-size:var(--typost-fit-line-1);--typost-line-hang:0.12">two</span>'
		);
	});

	it('leaves empty lines unwrapped and keeps the line index of the lines after them', () => {
		expect(wrapFitLinesBySizeProperty('one<br><br>three', [])).toBe(
			'<span class="typost-line" style="font-size:var(--typost-fit-line-0)">one</span>'
			+ '<br><br><span class="typost-line" style="font-size:var(--typost-fit-line-2)">three</span>'
		);
	});

	it('round-trips through unwrapFitLines, inline markup included', () => {
		const flat = 'A <span class="typost-styled" data-features="swsh" style="font-feature-settings: &quot;swsh&quot; 1">swash</span><br><br>three';
		expect(unwrapFitLines(wrapFitLinesBySizeProperty(flat, [0, 0.1, 0.2]))).toBe(flat);
	});

	it('returns an empty string for no content', () => {
		expect(wrapFitLinesBySizeProperty('', [])).toBe('');
		expect(wrapFitLinesBySizeProperty(undefined)).toBe('');
	});
});

describe('buildFitLineSizeProperties', () => {
	it('gives each measured line the font-size of its frontend line', () => {
		const sizes = [0.1484, 0.1781];
		const words = [0.2937, 0.3216];
		const properties = buildFitLineSizeProperties(CONTENT, sizes, 96, 'rem', words);
		const frontend = buildFitLinesHtml(CONTENT, sizes, 96, [], 'rem', words);
		const frontendSizes = Array.from(frontend.matchAll(/font-size:([^"]*)"/g), (m) => m[1]);
		expect(Object.values(properties)).toEqual(frontendSizes);
		expect(Object.keys(properties)).toEqual([ '--typost-fit-line-0', '--typost-fit-line-1' ]);
	});

	it('writes px lines as px lines', () => {
		expect(buildFitLineSizeProperties('one', [0.2], 0, 'px')).toEqual({ '--typost-fit-line-0': 'calc(0.2 * 100cqi)' });
	});

	it('gives no property to a line without a usable ratio or with no text', () => {
		expect(buildFitLineSizeProperties('one<br><br>three<br>four', [0.1, 0.2, 0.3, 'x'], 0, 'px')).toEqual({
			'--typost-fit-line-0': 'calc(0.1 * 100cqi)',
			'--typost-fit-line-2': 'calc(0.3 * 100cqi)',
		});
		expect(buildFitLineSizeProperties('one', null, 0, 'px')).toEqual({});
		expect(buildFitLineSizeProperties('', [0.1], 0, 'px')).toEqual({});
	});
});

describe('useFitMeasurement: the probe renders the attributes the heading renders (#458)', () => {
	// A style apply copies the style's values into the attributes, and a
	// style with no weight gives fontWeight '400'. Under the style that copy
	// does not render (buildEditorStyle(), save.js): the heading shows the
	// theme's weight. The probe measured at 400 anyway, so in a theme with
	// bold headings the lines were 5% to 8% wider than the box.
	const STYLED = { styleClass: 'typost-ps-9', fontWeight: '400', fontId: 12, fontStyle: 'italic', letterSpacing: -30, features: ['liga'], fontVariationSettings: '"wght" 650', textCase: 'uppercase' };
	let probeStyle;
	let rectSpy;

	beforeEach(() => {
		jest.useFakeTimers();
		document.body.innerHTML = '<div data-block="fit-block"><h2 class="typost-block-content typost-styled typost-fit typost-ps-9"></h2></div>';
		probeStyle = null;
		rectSpy = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
			if (this.style.left === '-9999px' && !probeStyle) {
				probeStyle = {
					fontFamily: this.style.fontFamily,
					fontWeight: this.style.fontWeight,
					fontStyle: this.style.fontStyle,
					letterSpacing: this.style.letterSpacing,
					fontFeatureSettings: this.style.fontFeatureSettings,
					fontVariationSettings: this.style.fontVariationSettings,
					textTransform: this.style.textTransform,
				};
			}
			return { width: 500, height: 100, top: 0, left: 0, right: 500, bottom: 100, x: 0, y: 0 };
		});
	});

	afterEach(() => {
		rectSpy.mockRestore();
		jest.useRealTimers();
		document.body.innerHTML = '';
	});

	function measureProbe(props) {
		renderHook((p) => useFitMeasurement(p), { initialProps: blockProps(props) });
		act(() => {
			jest.advanceTimersByTime(400);
		});
		return probeStyle;
	}

	const NONE = { fontFamily: '', fontWeight: '', fontStyle: '', letterSpacing: '', fontFeatureSettings: '', fontVariationSettings: '', textTransform: '' };
	const ALL = { fontFamily: 'var(--font-12)', fontWeight: '400', fontStyle: 'italic', letterSpacing: '-0.03em', fontFeatureSettings: '"liga" 1', fontVariationSettings: '"wght" 650', textTransform: 'uppercase' };

	it('under a paragraph style, sets none of the block attributes the style class renders', () => {
		expect(measureProbe(Object.assign({ styleOverrides: {} }, STYLED))).toEqual(NONE);
	});

	it('under a paragraph style, sets only the attributes the block overrides', () => {
		expect(measureProbe(Object.assign({ styleOverrides: { fontWeight: true, letterSpacing: true } }, STYLED)))
			.toEqual(Object.assign({}, NONE, { fontWeight: '400', letterSpacing: '-0.03em' }));
	});

	it('without a paragraph style, sets every attribute, as before', () => {
		expect(measureProbe(Object.assign({}, STYLED, { styleClass: '', styleOverrides: null }))).toEqual(ALL);
	});
});

describe('useFitMeasurement: the measurement write', () => {
	// jsdom lays nothing out: the probe reports 500px as one line and 250px
	// at min-content
	const NOWRAP_WIDTH = 500;
	const WORD_WIDTH = 250;
	let rectSpy;

	beforeEach(() => {
		jest.useFakeTimers();
		dataActions.__unstableMarkNextChangeAsNotPersistent.mockClear();
		document.body.innerHTML = '<div data-block="fit-block"><h2 class="typost-block-content typost-fit"></h2></div>';
		rectSpy = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
			const width = this.style.whiteSpace === 'normal' ? WORD_WIDTH : NOWRAP_WIDTH;
			return { width, height: 100, top: 0, left: 0, right: width, bottom: 100, x: 0, y: 0 };
		});
	});

	afterEach(() => {
		rectSpy.mockRestore();
		jest.useRealTimers();
		document.body.innerHTML = '';
	});

	const measured = {
		fitLineSizes: [computeHungFitRatio(100, NOWRAP_WIDTH, 0), computeHungFitRatio(100, NOWRAP_WIDTH, 0)],
		fitWordSizes: [computeFitWordRatio(100, WORD_WIDTH, 0), computeFitWordRatio(100, WORD_WIDTH, 0)],
	};

	it('marks the write of other ratios not persistent, before it writes', () => {
		const setAttributes = jest.fn(() => {
			expect(dataActions.__unstableMarkNextChangeAsNotPersistent).toHaveBeenCalledTimes(1);
		});
		renderHook((props) => useFitMeasurement(props), { initialProps: blockProps({ setAttributes }) });
		act(() => {
			jest.advanceTimersByTime(400);
		});
		expect(setAttributes).toHaveBeenCalledTimes(1);
		expect(setAttributes).toHaveBeenCalledWith(measured);
		// Kept out of the undo history (WordPress 7.1 or later; older
		// versions ignore the argument): the first undo after an edit then
		// goes back to the opened post, with no second step that brings
		// back only the stored ratios
		expect(dataActions.__unstableMarkNextChangeAsNotPersistent).toHaveBeenCalledWith({ history: 'ignore' });
	});

	it('writes nothing when the stored ratios already match', () => {
		const setAttributes = jest.fn();
		renderHook((props) => useFitMeasurement(props), { initialProps: blockProps(Object.assign({ setAttributes }, measured)) });
		act(() => {
			jest.advanceTimersByTime(400);
		});
		expect(setAttributes).not.toHaveBeenCalled();
		expect(dataActions.__unstableMarkNextChangeAsNotPersistent).not.toHaveBeenCalled();
	});
});

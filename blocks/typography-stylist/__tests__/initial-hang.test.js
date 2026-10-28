/**
 * Hanging initial (#242): the first letter moves into the margin so a swash
 * hangs past the text edge. Pure helpers, the fit-to-width line markup, the
 * shared editor state, the paragraph-style override diff, and save output.
 */

import { renderToString } from '@wordpress/element';
import {
	normalizeHang,
	initialHangApplies,
	resolveHangTextAlign,
	styleAlignmentToTextAlign,
	resolveFitLineHang,
	computeHungFitRatio,
	computeFitRatio,
	buildFitLineOpenTag,
	buildFitLinesHtml,
	wrapFitLines,
	unwrapFitLines,
	setFitLineHang,
	buildFitLinePreviews,
	stylePropertyOverrides,
	buildQftEditorState,
	INITIAL_HANG_MAX,
} from '../utils';

jest.mock('@wordpress/block-editor');

// eslint-disable-next-line import/first -- the mock must be set up first
import save from '../save';

describe('normalizeHang', () => {
	test('keeps a valid value, rounded to three decimals', () => {
		expect(normalizeHang(0.12)).toBe(0.12);
		expect(normalizeHang('0.25')).toBe(0.25);
		expect(normalizeHang(0.12345)).toBe(0.123);
	});

	test('rounds a half-step up, as PHP round() does', () => {
		// 0.1235 * 1000 is 123.49999… in floating point
		expect(normalizeHang(0.1235)).toBe(0.124);
	});

	test('empty, zero, negative and non-numeric input means no hang', () => {
		[undefined, null, '', 0, '0', -0.2, 'abc', NaN, Infinity, true, {}, []].forEach((value) => {
			expect(normalizeHang(value)).toBe(0);
		});
	});

	test('rejects strings PHP is_numeric() rejects', () => {
		expect(normalizeHang('0x1A')).toBe(0);
		expect(normalizeHang('0.1em')).toBe(0);
	});

	test('values that round to zero, including exponent-form ones, are 0', () => {
		expect(normalizeHang(1e-7)).toBe(0);
		expect(normalizeHang(0.0004)).toBe(0);
		expect(normalizeHang(0.0005)).toBe(0.001);
	});

	test('caps at INITIAL_HANG_MAX', () => {
		expect(normalizeHang(5)).toBe(INITIAL_HANG_MAX);
		expect(normalizeHang('1e3')).toBe(INITIAL_HANG_MAX);
	});

	test('matches the PHP twin on overflow and surrounding whitespace', () => {
		expect(normalizeHang('1e999')).toBe(0);
		expect(normalizeHang(' 0.15 ')).toBe(0.15);
	});
});

describe('styleAlignmentToTextAlign (Detach keeps the alignment, PR #329 review)', () => {
	test('Justify stays justify on the block, which renders it inline', () => {
		expect(styleAlignmentToTextAlign('justify', false)).toBe('justify');
	});

	test('matches its twin in the Paragraph Styles module for every value', () => {
		const { alignmentToBlockAlign } = require('../../../paragraph-styles/assets/js/lib/ps-utils.js');
		['', 'start', 'center', 'end', 'justify', 'left', undefined].forEach((value) => {
			[false, true].forEach((rtl) => {
				expect(styleAlignmentToTextAlign(value, rtl)).toBe(alignmentToBlockAlign(value, rtl));
			});
		});
	});
});

describe('resolveHangTextAlign (PR #329 review)', () => {
	test('the block\'s own alignment wins', () => {
		expect(resolveHangTextAlign('left', 'center', false, false)).toBe('left');
	});

	test('a centered or end-aligned style turns the hang off for the notice', () => {
		expect(initialHangApplies(resolveHangTextAlign('', 'center', false, false), false)).toBe(false);
		expect(initialHangApplies(resolveHangTextAlign('', 'end', false, false), false)).toBe(false);
		expect(initialHangApplies(resolveHangTextAlign('', 'end', false, true), true)).toBe(false);
	});

	test('start and justify keep the hang', () => {
		expect(initialHangApplies(resolveHangTextAlign('', 'start', false, false), false)).toBe(true);
		expect(initialHangApplies(resolveHangTextAlign('', 'justify', false, false), false)).toBe(true);
	});

	test('a fit block ignores the style\'s alignment, as the guarded rule does', () => {
		expect(resolveHangTextAlign('', 'center', true, false)).toBe('');
	});
});

describe('initialHangApplies', () => {
	test('start-aligned, unset and justified text hangs', () => {
		expect(initialHangApplies(undefined, false)).toBe(true);
		expect(initialHangApplies('', false)).toBe(true);
		expect(initialHangApplies('left', false)).toBe(true);
		expect(initialHangApplies('justify', false)).toBe(true);
	});

	test('centered and end-aligned text does not hang', () => {
		expect(initialHangApplies('center', false)).toBe(false);
		expect(initialHangApplies('right', false)).toBe(false);
	});

	test('in right-to-left text the end side is left', () => {
		expect(initialHangApplies('right', true)).toBe(true);
		expect(initialHangApplies('left', true)).toBe(false);
		expect(initialHangApplies('center', true)).toBe(false);
	});
});

describe('resolveFitLineHang', () => {
	test('line 1 uses the block value, later lines their own entry', () => {
		expect(resolveFitLineHang(0, 0.12, [0.5, 0.2], true)).toBe(0.12);
		expect(resolveFitLineHang(1, 0.12, [0.5, 0.2], true)).toBe(0.2);
		expect(resolveFitLineHang(2, 0.12, [0.5, 0.2], true)).toBe(0);
	});

	test('nothing hangs when the alignment turns the hang off', () => {
		expect(resolveFitLineHang(0, 0.12, [0, 0.2], false)).toBe(0);
		expect(resolveFitLineHang(1, 0.12, [0, 0.2], false)).toBe(0);
	});

	test('a missing array is no hang', () => {
		expect(resolveFitLineHang(1, 0.12, undefined, true)).toBe(0);
	});
});

describe('computeHungFitRatio', () => {
	test('without a hang it equals computeFitRatio', () => {
		expect(computeHungFitRatio(100, 500, 0)).toBe(computeFitRatio(100, 500));
	});

	test('a hang shortens the width the line must fill', () => {
		// 0.2em at 100px = 20px; 100 / (500 - 20)
		expect(computeHungFitRatio(100, 500, 0.2)).toBe(computeFitRatio(100, 480));
	});
});

describe('buildFitLineOpenTag', () => {
	test('is byte-identical to the pre-hang markup without a hang', () => {
		expect(buildFitLineOpenTag(0.2, 0, [], 1)).toBe('<span class="typost-line" style="font-size:calc(0.2 * 100cqi)">');
		expect(buildFitLineOpenTag(undefined, 0, undefined, 0)).toBe('<span class="typost-line">');
	});

	test('a later line carries its hang as a custom property', () => {
		expect(buildFitLineOpenTag(0.2, 0, [0, 0.15], 1))
			.toBe('<span class="typost-line" style="font-size:calc(0.2 * 100cqi);--typost-line-hang:0.15">');
		expect(buildFitLineOpenTag(undefined, 0, [0, 0.15], 1))
			.toBe('<span class="typost-line" style="--typost-line-hang:0.15">');
	});

	test('line 1 never carries a line hang (it hangs through ::first-letter)', () => {
		expect(buildFitLineOpenTag(0.2, 0, [0.3], 0)).toBe('<span class="typost-line" style="font-size:calc(0.2 * 100cqi)">');
	});
});

describe('fit-to-width line markup with hangs', () => {
	const content = 'Swash<br>Moonlit';

	test('frontend markup puts the hang on line 2 only', () => {
		expect(buildFitLinesHtml(content, [0.2, 0.3], 0, [0, 0.1])).toBe(
			'<span class="typost-line" style="font-size:calc(0.2 * 100cqi)">Swash</span>'
			+ '<span class="typost-line" style="font-size:calc(0.3 * 100cqi);--typost-line-hang:0.1">Moonlit</span>'
		);
	});

	test('frontend markup without hangs is unchanged', () => {
		expect(buildFitLinesHtml(content, [0.2, 0.3], 0)).toBe(
			'<span class="typost-line" style="font-size:calc(0.2 * 100cqi)">Swash</span>'
			+ '<span class="typost-line" style="font-size:calc(0.3 * 100cqi)">Moonlit</span>'
		);
	});

	test('the editing value carries the same hang and unwraps to the flat content', () => {
		const wrapped = wrapFitLines(content, [0.2, 0.3], 0, [0, 0.1]);
		expect(wrapped).toContain('--typost-line-hang:0.1');
		expect(unwrapFitLines(wrapped)).toBe(content);
	});
});

describe('setFitLineHang', () => {
	test('sets one line and pads with zeros', () => {
		expect(setFitLineHang([], 2, 0.1)).toEqual([0, 0, 0.1]);
	});

	test('never stores a value for line 1', () => {
		expect(setFitLineHang([], 0, 0.3)).toEqual([]);
		expect(setFitLineHang([0.4, 0.1], 1, 0.1)).toEqual([0, 0.1]);
	});

	test('drops trailing zeros, so resetting every line gives the default []', () => {
		expect(setFitLineHang([0, 0.1], 1, 0)).toEqual([]);
		expect(setFitLineHang([0, 0.1, 0.2], 2, 0)).toEqual([0, 0.1]);
	});

	test('normalizes values and ignores a bad index', () => {
		expect(setFitLineHang([0, '0.2'], 1, '0.12345')).toEqual([0, 0.123]);
		expect(setFitLineHang([0, 0.2], -1, 0.5)).toEqual([0, 0.2]);
		expect(setFitLineHang(null, 1, 0.2)).toEqual([0, 0.2]);
	});
});

describe('buildFitLinePreviews', () => {
	test('gives the plain-text start of each line', () => {
		expect(buildFitLinePreviews('<span class="typost-styled" data-features="swsh">The</span> Moon<br><br>A &amp; B'))
			.toEqual(['The Moon', '', 'A & B']);
	});

	test('cuts long lines with an ellipsis', () => {
		expect(buildFitLinePreviews('Extraordinarily long headline', 10)).toEqual(['Extraordin…']);
	});
});

describe('paragraph style integration', () => {
	test('a hang that differs from the style is an override', () => {
		expect(stylePropertyOverrides({ initialHang: 0.2 }, { initialHang: 0.1 }).initialHang).toBe(true);
		expect(stylePropertyOverrides({ initialHang: 0 }, { initialHang: 0.1 }).initialHang).toBe(true);
	});

	test('an absent hang equals 0', () => {
		expect(stylePropertyOverrides({ initialHang: 0 }, {}).initialHang).toBeUndefined();
		expect(stylePropertyOverrides({}, {}).initialHang).toBeUndefined();
		expect(stylePropertyOverrides({ initialHang: 0.1 }, { initialHang: '0.1' }).initialHang).toBeUndefined();
	});

	test('the shared QFT state reports the block hang, 0 when unset', () => {
		expect(buildQftEditorState({ initialHang: 0.15 }).initialHang).toBe(0.15);
		expect(buildQftEditorState({}).initialHang).toBe(0);
	});
});

describe('save output', () => {
	const base = {
		content: 'Swash',
		tagName: 'h2',
		features: ['swsh'],
		fontFamily: '',
		fontId: 0,
		fontSize: 'inherit',
		fontSizeMin: 16,
		fontSizePreferred: 32,
		fontSizeMax: 64,
		fitLineSizes: [],
		fitMaxSize: 0,
		fontWeight: '400',
		fontStyle: '',
		letterSpacing: 0,
		lineHeight: 0,
		screenReaderClass: 'visually-hidden',
		styleClass: '',
		fontVariationSettings: '',
	};

	test('no hang (and absent attributes) leaves the markup unchanged', () => {
		const before = renderToString(save({ attributes: base }));
		const withZero = renderToString(save({ attributes: { ...base, initialHang: 0, fitLineHangs: [] } }));
		expect(withZero).toBe(before);
		expect(before).not.toContain('--typost-hang');
	});

	test('a hang is written as a custom property on the visible copy only', () => {
		const html = renderToString(save({ attributes: { ...base, initialHang: 0.12 } }));
		expect(html).toContain('--typost-hang:0.12');
		// One occurrence: the screen reader copy carries no style
		expect(html.split('--typost-hang').length - 1).toBe(1);
	});

	test('under a paragraph style the class supplies the hang', () => {
		const html = renderToString(save({ attributes: { ...base, initialHang: 0.12, styleClass: 'typost-ps-3' } }));
		expect(html).not.toContain('--typost-hang');
	});

	test('fit-to-width lines 2+ carry their own hang, even under a style', () => {
		const html = renderToString(save({ attributes: {
			...base,
			content: 'Swash<br>Moonlit',
			fontSize: 'fit',
			fitLineSizes: [0.2, 0.3],
			fitLineHangs: [0, 0.1],
			styleClass: 'typost-ps-3',
		} }));
		expect(html).toContain('--typost-line-hang:0.1');
	});
});

describe('plain typography switch (#315)', () => {
	const fs = require('fs');
	const path = require('path');
	const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');

	// style.css divides a hung fit line's size by (1 + R × hang) when the
	// switch is on. Ink of a line at size s is s × (measured / ref).
	const ref = 100;
	const container = 760;

	it.each([
		[480, 0.2],
		[910, 0.05],
		[300, 1],
	])('a line measured %ipx wide with a %f em hang fills the block once the hang is off', (measured, hang) => {
		const ratio = computeHungFitRatio(ref, measured, hang);
		const size = ratio * container;
		const plainSize = size / (1 + ratio * hang);

		// Hung: ink minus the hang fills the container
		expect(size * (measured / ref) - hang * size).toBeCloseTo(container, -1);
		// Plain, no hang: the whole ink fills it, not hang × size more
		expect(plainSize * (measured / ref)).toBeCloseTo(container, -1);
		expect(size * (measured / ref) - container).toBeGreaterThan(hang * size * 0.99);
	});

	it('a line held below R × 100cqi by its cap stays inside too', () => {
		const ratio = computeHungFitRatio(ref, 480, 0.2);
		const capped = Math.min(ratio * container, 120);
		expect((capped / (1 + ratio * 0.2)) * 4.8).toBeLessThanOrEqual(container);
	});

	it('gates every hang margin on --typost-plain', () => {
		const margins = css.match(/margin-inline-start: calc\(var\(--typost-(?:line-)?hang, 0\)[^;]*;/g);
		expect(margins).toHaveLength(3);
		margins.forEach((rule) => {
			expect(rule).toContain('* (1 - var(--typost-plain, 0)) * -1em');
		});
	});

	it('divides both fit-line sizes by the hang each line was measured with', () => {
		expect(css).toContain('.typost-line[style*="--typost-fit-ratio"] {\n\tfont-size: calc(var(--typost-fit-size) / (1 + var(--typost-fit-ratio) * var(--typost-line-hang, 0) * var(--typost-hang-on, 1) * var(--typost-plain, 0))) !important;');
		expect(css).toContain('.typost-line[style*="--typost-fit-ratio"]:first-child {\n\tfont-size: calc(var(--typost-fit-size) / (1 + var(--typost-fit-ratio) * var(--typost-hang, 0) * var(--typost-hang-on, 1) * var(--typost-plain, 0))) !important;');
	});

	it('turns the switch off in the editor', () => {
		expect(css).toMatch(/\.wp-block-typost\.block-editor-block-list__block \{\n\t--typost-plain: 0;\n\}/);
	});
});

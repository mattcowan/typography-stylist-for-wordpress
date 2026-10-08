/**
 * Test Suite: font sizes in rem for new content (#233)
 *
 * New blocks default to fontSizeUnit 'rem' and write their sizes divided by
 * 16, so they follow the reader's default font size setting. Blocks saved
 * before #233 are migrated to 'px' (see deprecated.test.js) and keep the
 * exact px markup. Authors still enter every size in px.
 */

import { create } from 'react-test-renderer';

jest.mock('@wordpress/block-editor');

import save from '../save';
import blockJson from '../block.json';
import {
	buildFitFontSize,
	buildFitLineOpenTag,
	buildFitLinesHtml,
	wrapFitLines,
	buildResponsiveClamp,
	formatFontSizeLength,
	resolveFontSizeUnit,
	pxToRem
} from '../utils';

const units = require('../../../assets/js/font-size-units.js');

// block.json defaults, as core applies them to a new block
const defaults = Object.fromEntries(
	Object.entries(blockJson.attributes)
		.filter(([, schema]) => 'default' in schema)
		.map(([key, schema]) => [key, schema.default])
);

const visual = (attributes) => create(save({ attributes: { ...defaults, content: 'Headline', ...attributes } })).toJSON().children[1];

describe('font-size-units.js', () => {
	it('resolves only an explicit rem to rem', () => {
		expect(resolveFontSizeUnit('rem')).toBe('rem');
		expect(resolveFontSizeUnit('px')).toBe('px');
		// Missing means a block or style saved before #233
		expect(resolveFontSizeUnit(undefined)).toBe('px');
		expect(resolveFontSizeUnit('')).toBe('px');
		expect(resolveFontSizeUnit('em')).toBe('px');
	});

	it('converts px to rem exactly for whole and decimal sizes', () => {
		expect(pxToRem(16)).toBe(1);
		expect(pxToRem(24)).toBe(1.5);
		expect(pxToRem(17)).toBe(1.0625);
		expect(pxToRem(36.5)).toBe(2.28125);
		expect(pxToRem('13.3')).toBe(0.83125);
		expect(pxToRem(400)).toBe(25);
	});

	it('rounds to six decimals and gives 0 below 0.0001rem or for junk', () => {
		expect(pxToRem(0.001968)).toBe(0.000123);
		expect(pxToRem(0.001)).toBe(0);
		expect(pxToRem(0)).toBe(0);
		expect(pxToRem('abc')).toBe(0);
		expect(pxToRem(undefined)).toBe(0);
	});

	it('formats a length in either unit', () => {
		expect(formatFontSizeLength(24, 'px')).toBe('24px');
		expect(formatFontSizeLength('24', undefined)).toBe('24px');
		expect(formatFontSizeLength(24, 'rem')).toBe('1.5rem');
	});

	it('builds the rem clamp from the issue example', () => {
		expect(buildResponsiveClamp(16, 32, 64, 'rem')).toBe('clamp(1rem, 2rem + 3vw, 4rem)');
	});

	it('is the same function the inline editor requires', () => {
		expect(units.buildResponsiveClamp(13, 29, 42, 'rem')).toBe(buildResponsiveClamp(13, 29, 42, 'rem'));
		expect(units.buildResponsiveClamp(13, 29, 42)).toBe(buildResponsiveClamp(13, 29, 42));
	});
});

describe('block.json', () => {
	it('defaults new blocks to rem', () => {
		expect(blockJson.attributes.fontSizeUnit).toEqual({ type: 'string', enum: ['px', 'rem'], default: 'rem' });
	});
});

describe('save() with the rem default (new blocks)', () => {
	it('writes a responsive 16 / 32 / 64 size as clamp(1rem, 2rem + 3vw, 4rem)', () => {
		expect(visual({ fontSize: 'responsive' }).props.style.fontSize).toBe('clamp(1rem, 2rem + 3vw, 4rem)');
	});

	it('writes a fixed size of 24 as 1.5rem', () => {
		expect(visual({ fontSize: '24' }).props.style.fontSize).toBe('1.5rem');
	});

	it('keeps the decimals of a fixed decimal size', () => {
		expect(visual({ fontSize: '36.5' }).props.style.fontSize).toBe('2.28125rem');
	});

	it('writes the fit fallback clamp and the cap in rem', () => {
		const tree = visual({ fontSize: 'fit', content: 'One<br>Two', fitLineSizes: [0.2, 0.3], fitMaxSize: 96 });
		expect(tree.props.style.fontSize).toBe('clamp(1rem, 2rem + 3vw, 4rem)');
		expect(tree.children[0]).toBe(
			'<span class="typost-line" style="font-size:min(calc(0.2 * 100cqi), 6rem)">One</span>' +
			'<span class="typost-line" style="font-size:min(calc(0.3 * 100cqi), 6rem)">Two</span>'
		);
	});

	it('writes no unit at all for an uncapped fit line (cqi only)', () => {
		const tree = visual({ fontSize: 'fit', content: 'One', fitLineSizes: [0.2] });
		expect(tree.children[0]).toBe('<span class="typost-line" style="font-size:calc(0.2 * 100cqi)">One</span>');
	});

	it('writes an inherit block byte-identically in both units', () => {
		const rem = JSON.stringify(visual({ fontSize: 'inherit', fontSizeUnit: 'rem' }));
		const px = JSON.stringify(visual({ fontSize: 'inherit', fontSizeUnit: 'px' }));
		expect(rem).toBe(px);
		expect(visual({ fontSize: 'inherit' }).props.style.fontSize).toBeUndefined();
	});

	it('writes no size under a styleClass in either unit', () => {
		expect(visual({ fontSize: '24', styleClass: 'typost-ps-4' }).props.style.fontSize).toBeUndefined();
	});
});

describe('save() for a block migrated to px (saved before #233)', () => {
	it('keeps the px responsive clamp, float artifacts included', () => {
		expect(visual({ fontSize: 'responsive', fontSizeUnit: 'px', fontSizeMin: 13, fontSizePreferred: 29, fontSizeMax: 42 }).props.style.fontSize)
			.toBe('clamp(13px, 1.8125rem + 1.8124999999999998vw, 42px)');
	});

	it('keeps a fixed px size', () => {
		expect(visual({ fontSize: '24', fontSizeUnit: 'px' }).props.style.fontSize).toBe('24px');
	});

	it('keeps the fit cap in px', () => {
		const tree = visual({ fontSize: 'fit', fontSizeUnit: 'px', content: 'One', fitLineSizes: [0.2], fitMaxSize: 96 });
		expect(tree.children[0]).toBe('<span class="typost-line" style="font-size:min(calc(0.2 * 100cqi), 96px)">One</span>');
	});
});

describe('fit helpers take the unit', () => {
	it('defaults to px for callers that pass none', () => {
		expect(buildFitFontSize(0.2, 96)).toBe('min(calc(0.2 * 100cqi), 96px)');
		expect(buildFitLineOpenTag(0.2, 96, [], 0)).toBe('<span class="typost-line" style="font-size:min(calc(0.2 * 100cqi), 96px)">');
	});

	it('writes the cap in rem when asked', () => {
		expect(buildFitFontSize(0.2, 120, 'rem')).toBe('min(calc(0.2 * 100cqi), 7.5rem)');
		expect(buildFitLineOpenTag(0.2, 120, [0, 0.1], 1, 'rem'))
			.toBe('<span class="typost-line" style="font-size:min(calc(0.2 * 100cqi), 7.5rem);--typost-line-hang:0.1">');
	});

	it('gives the editing value and the saved markup the same unit', () => {
		// The editor renders wrapFitLines, the frontend buildFitLinesHtml;
		// both must carry the same cap so the editor and the frontend agree
		expect(wrapFitLines('A<br>B', [0.2, 0.3], 96, [], 'rem')).toBe(
			'<span class="typost-line" style="font-size:min(calc(0.2 * 100cqi), 6rem)">A</span><br>' +
			'<span class="typost-line" style="font-size:min(calc(0.3 * 100cqi), 6rem)">B</span>'
		);
		expect(buildFitLinesHtml('A<br>B', [0.2, 0.3], 96, [], 'rem')).toBe(
			'<span class="typost-line" style="font-size:min(calc(0.2 * 100cqi), 6rem)">A</span>' +
			'<span class="typost-line" style="font-size:min(calc(0.3 * 100cqi), 6rem)">B</span>'
		);
	});
});

/**
 * Test Suite: font sizes that grow with browser zoom (#234, #235)
 *
 * Browser zoom narrows the viewport in CSS px. At zoom z in a window W px
 * wide the reader sees z × size(W / z). WCAG 1.4.4 for fluid type is read
 * as "2× by 500% zoom". These tests evaluate the emitted CSS the way a
 * browser does, so they check the strings that are saved, not a formula
 * copied from the code.
 *
 * Content saved before #233 (px) keeps its markup; new content (rem) gets
 * the zoom-safe forms.
 */

import { create } from 'react-test-renderer';

jest.mock('@wordpress/block-editor');

import save from '../save';
import blockJson from '../block.json';
import { buildFitFontSize, buildResponsiveClamp } from '../utils';

const units = require('../../../assets/js/font-size-units.js');

const defaults = Object.fromEntries(
	Object.entries(blockJson.attributes)
		.filter(([, schema]) => 'default' in schema)
		.map(([key, schema]) => [key, schema.default])
);

const visual = (attributes) => create(save({ attributes: { ...defaults, content: 'Headline', ...attributes } })).toJSON().children[1];

/**
 * Evaluate a clamp(min, pref + slope vw, max) string at a viewport width,
 * with rem = 16px (zoom does not change rem in CSS px). CSS clamp() is
 * max(min, min(val, max)).
 */
function parseClamp(clamp) {
	const length = (token) => {
		const m = token.trim().match(/^(-?[\d.]+)(px|rem)$/);
		if (!m) {
			throw new Error(`Unexpected length: ${token}`);
		}
		return m[2] === 'rem' ? Number(m[1]) * 16 : Number(m[1]);
	};
	const m = clamp.match(/^clamp\(([^,]+),\s*([\d.]+(?:px|rem))\s*\+\s*(-?[\d.e-]+)vw,\s*([^)]+)\)$/);
	if (!m) {
		throw new Error(`Unexpected clamp: ${clamp}`);
	}
	return { min: length(m[1]), pref: length(m[2]), vw: Number(m[3]), max: length(m[4]) };
}

const sizeAt = (c, viewport) => Math.max(c.min, Math.min(c.pref + (c.vw * viewport) / 100, c.max));
const evaluateClamp = (clamp, viewport) => sizeAt(parseClamp(clamp), viewport);

// On-screen size at a zoom level, relative to the size at 100%
const zoomRatio = (clamp, windowWidth, zoom) =>
	(zoom * evaluateClamp(clamp, windowWidth / zoom)) / evaluateClamp(clamp, windowWidth);

// The smallest ratio at 500% zoom over windows from 320 to 1920px
function worstRatioAt500(clamp) {
	const c = parseClamp(clamp);
	let worst = Infinity;
	for (let w = 320; w <= 1920; w += 1) {
		worst = Math.min(worst, (5 * sizeAt(c, w / 5)) / sizeAt(c, w));
	}
	return worst;
}

// Rounding the vw term to four decimals can move a size by about 0.001px
const TOLERANCE = 1e-4;

describe('responsive sizes and zoom (#234)', () => {
	describe('the issue measurements (px, content saved before #233)', () => {
		// The table in #234, measured in Chromium. The model must agree, or
		// the tests below prove nothing.
		it.each([
			[16, 32, 64, 1920, 200, 1.90],
			[16, 32, 64, 1920, 500, 3.40],
			[16, 32, 64, 1280, 200, 1.60],
			[16, 32, 64, 1280, 500, 3.10],
			[16, 32, 64, 390, 500, 3.93],
			[16, 16, 120, 1920, 500, 1.71],
			[16, 16, 120, 1280, 500, 1.65],
			[16, 16, 120, 390, 500, 2.55],
			[24, 24, 96, 1920, 500, 2.15],
			[24, 24, 96, 1280, 500, 2.18]
		])('%i / %i / %i in a %ipx window at %i%% zoom gives %fx', (min, pref, max, windowWidth, zoom, expected) => {
			const clamp = buildResponsiveClamp(min, pref, max, 'px');
			expect(zoomRatio(clamp, windowWidth, zoom / 100)).toBeCloseTo(expected, 2);
		});
	});

	describe('new content (rem)', () => {
		it.each([1920, 1280, 390])('16 / 16 / 120 reaches 2x at 500%% zoom in a %ipx window', (windowWidth) => {
			const clamp = buildResponsiveClamp(16, 16, 120, 'rem');
			expect(zoomRatio(clamp, windowWidth, 5)).toBeGreaterThanOrEqual(2 - TOLERANCE);
		});

		it('writes the limited slope for 16 / 16 / 120', () => {
			expect(buildResponsiveClamp(16, 16, 120, 'rem')).toBe('clamp(1rem, 1rem + 2.5vw, 7.5rem)');
		});

		it('leaves the default 16 / 32 / 64 unchanged (it already doubles)', () => {
			expect(buildResponsiveClamp(16, 32, 64, 'rem')).toBe('clamp(1rem, 2rem + 3vw, 4rem)');
		});

		it('leaves 24 / 24 / 96 unchanged (max is 4 × preferred)', () => {
			expect(buildResponsiveClamp(24, 24, 96, 'rem')).toBe('clamp(1.5rem, 1.5rem + 4.5vw, 6rem)');
		});

		it('every Inspector value set doubles by 500% zoom in every window from 320 to 1920px', () => {
			// The Inspector sliders run 8–120px. A 7px step reaches both ends
			// and mixes odd and even values; each limited case lands on the
			// bound, so a wrong bound fails here.
			const failures = [];
			for (let min = 8; min <= 120; min += 7) {
				for (let pref = 8; pref <= 120; pref += 7) {
					for (let max = 8; max <= 120; max += 7) {
						const clamp = buildResponsiveClamp(min, pref, max, 'rem');
						if (worstRatioAt500(clamp) < 2 - TOLERANCE) {
							failures.push(`${min}/${pref}/${max}`);
						}
					}
				}
			}
			expect(failures).toEqual([]);
		});

		it('never grows faster than the author set', () => {
			for (let min = 8; min <= 120; min += 8) {
				for (let pref = 8; pref <= 120; pref += 8) {
					for (let max = min + 8; max <= 120; max += 8) {
						const zoom = units.getResponsiveZoomLimit(min, pref, max);
						expect(zoom.limitedVw).toBeLessThanOrEqual(zoom.vw);
					}
				}
			}
		});

		it('is not limited more than it must be: the limited size reaches 2x exactly in a 1920px window', () => {
			const clamp = buildResponsiveClamp(16, 16, 120, 'rem');
			expect(zoomRatio(clamp, 1920, 5)).toBeCloseTo(2, 3);
			expect(evaluateClamp(clamp, 1920)).toBeCloseTo(64, 3);
		});

		it('does not change the size at 100% zoom in a window where the old slope already doubles', () => {
			// 16 / 32 / 64 is not limited, so it renders as #233 wrote it
			const before = 'clamp(1rem, 2rem + 3vw, 4rem)';
			for (const w of [320, 390, 768, 1280, 1920]) {
				expect(evaluateClamp(buildResponsiveClamp(16, 32, 64, 'rem'), w)).toBe(evaluateClamp(before, w));
			}
		});

		it('leaves out-of-order and flat sizes alone', () => {
			expect(units.getResponsiveZoomLimit(64, 32, 16).limited).toBe(false);
			expect(units.getResponsiveZoomLimit(40, 40, 40).limited).toBe(false);
			expect(buildResponsiveClamp(64, 32, 16, 'rem')).toBe('clamp(4rem, 2rem + -3vw, 1rem)');
		});

		it('saves the limited clamp from a new block', () => {
			const attributes = { fontSize: 'responsive', fontSizeMin: 16, fontSizePreferred: 16, fontSizeMax: 120 };
			expect(visual(attributes).props.style.fontSize).toBe('clamp(1rem, 1rem + 2.5vw, 7.5rem)');
		});

		it('saves the old slope for a block saved before #233', () => {
			const attributes = { fontSize: 'responsive', fontSizeMin: 16, fontSizePreferred: 16, fontSizeMax: 120, fontSizeUnit: 'px' };
			expect(visual(attributes).props.style.fontSize).toBe('clamp(16px, 1rem + 6.5vw, 120px)');
		});
	});

	describe('getResponsiveZoomNotice()', () => {
		it('says a new size grows more slowly, and what it reaches', () => {
			expect(units.getResponsiveZoomNotice(16, 16, 120, 'rem')).toEqual({ kind: 'slower', reach: 64, max: 120, minPreferred: 30 });
		});

		it('says an older px size does not double', () => {
			expect(units.getResponsiveZoomNotice(16, 16, 120, 'px')).toEqual({ kind: 'fails', reach: 64, max: 120, minPreferred: 30 });
		});

		it('is null when the size doubles as set', () => {
			expect(units.getResponsiveZoomNotice(16, 32, 64, 'rem')).toBeNull();
			expect(units.getResponsiveZoomNotice(24, 24, 96, 'px')).toBeNull();
		});

		it('its advice works: Intermediate at minPreferred removes the notice', () => {
			for (let max = 40; max <= 120; max += 1) {
				const notice = units.getResponsiveZoomNotice(16, 16, max, 'rem');
				if (notice) {
					expect(units.getResponsiveZoomNotice(16, notice.minPreferred, max, 'rem')).toBeNull();
					expect(units.getResponsiveZoomNotice(16, 16, notice.reach, 'rem')).toBeNull();
				}
			}
		});

		it('is null exactly when the px clamp doubles in every window', () => {
			for (let min = 8; min <= 120; min += 8) {
				for (let pref = 8; pref <= 120; pref += 8) {
					for (let max = 8; max <= 120; max += 8) {
						const doubles = worstRatioAt500(buildResponsiveClamp(min, pref, max, 'px')) >= 2 - TOLERANCE;
						expect([`${min}/${pref}/${max}`, units.getResponsiveZoomNotice(min, pref, max, 'px') === null])
							.toEqual([`${min}/${pref}/${max}`, doubles]);
					}
				}
			}
		});
	});
});

describe('the paragraph style twin (ps-utils.js)', () => {
	const psUtils = require('../../../paragraph-styles/assets/js/lib/ps-utils.js');

	it('writes the same vw term as core for every slider value set', () => {
		// The PHP generator is held to the same strings by the shared
		// fixture (paragraph-styles/__tests__/fixtures/font-size-unit-css.json)
		const mismatches = [];
		for (let min = 8; min <= 120; min += 3) {
			for (let pref = 8; pref <= 120; pref += 3) {
				for (let max = 8; max <= 120; max += 3) {
					const vwTerm = buildResponsiveClamp(min, pref, max, 'rem').match(/\+ (-?[\d.e-]+)vw/)[1];
					if (String(psUtils.responsiveZoomVw(min, pref, max)) !== vwTerm) {
						mismatches.push(`${min}/${pref}/${max}`);
					}
				}
			}
		}
		expect(mismatches).toEqual([]);
	});
});

describe('fit-to-width lines and zoom (#235)', () => {
	it('keeps the px line expression of blocks saved before #233', () => {
		expect(buildFitFontSize(0.1, 0, 'px')).toBe('calc(0.1 * 100cqi)');
		expect(buildFitFontSize(0.1, 96, 'px')).toBe('min(calc(0.1 * 100cqi), 96px)');
	});

	it('sizes a new line from --typost-fit-width, which falls back to 100cqi', () => {
		expect(buildFitFontSize(0.1, 0, 'rem')).toBe('calc(0.1 * var(--typost-fit-width, 100cqi))');
		expect(buildFitFontSize(0.1, 96, 'rem')).toBe('min(calc(0.1 * var(--typost-fit-width, 100cqi)), 6rem)');
	});

	it('saves the new expression on the lines of a new fit block', () => {
		const html = JSON.stringify(visual({ fontSize: 'fit', fitLineSizes: [0.1] }));
		expect(html).toContain('font-size:calc(0.1 * var(--typost-fit-width, 100cqi))');
	});
});

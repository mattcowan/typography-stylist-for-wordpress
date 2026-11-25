/**
 * Test Suite: Fit-to-width editing value transforms
 * (wrapFitLinesBySizeProperty + buildFitLineSizeProperties / unwrapFitLines)
 *
 * The fit-mode editing surface feeds RichText a WRAPPED value (per-line
 * span.typost-line wrappers joined with '<br>') while the stored content
 * attribute stays flat br-model HTML. Since #388 each wrapper's font-size
 * is `var(--typost-fit-line-N)` and the sizes are custom properties on the
 * block wrapper (buildFitLineSizeProperties). These transforms are the
 * entire boundary — everything else in the plugin sees the flat model, so
 * the tests here lock in four invariants:
 *
 * 1. Round-trip identity: unwrapFitLines(wrapFitLinesBySizeProperty(x))
 *    === x for already-normalized content (the only normalization is
 *    splitContentIntoLines' documented cloning of spans that straddle a
 *    <br>).
 * 2. Offset invariance: buildTextOffsetMap sees identical offsets over
 *    the flat and wrapped forms — the '<br>' kept between wrappers is
 *    the same +1 the flat model has, so store selection offsets and the
 *    whole QFT machinery carry over unchanged.
 * 3. The wrapped serialization format: class first, then style, no
 *    trailing semicolon (the attribute order wp.richText
 *    create()/toHTMLString() round-trips byte-identically).
 * 4. The line sizes: each line's custom property holds the font-size the
 *    frontend line gets (buildFitLinesHtml), cap included.
 */

import {
	wrapFitLinesBySizeProperty,
	buildFitLineSizeProperties,
	unwrapFitLines,
	buildFitLinesHtml,
	buildTextOffsetMap
} from '../utils';

// Offsets helper: flatten a buildTextOffsetMap run over an HTML string
// into comparable [start, end, text] tuples.
function offsetTuples(html) {
	const parser = new DOMParser();
	const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
	return buildTextOffsetMap(doc.body.firstChild, doc).map(e => [e.start, e.end, e.text]);
}

// The font-size of each frontend line, in line order (lines with no
// font-size are left out, as buildFitLineSizeProperties leaves them out).
function frontendSizes(content, sizes, maxSize, unit, words) {
	return Array.from(
		buildFitLinesHtml(content, sizes, maxSize, [], unit, words).matchAll(/font-size:([^;"]*)/g),
		(m) => m[1]
	);
}

describe('Typography Stylist - fit editing value transforms', () => {

	// ===== wrapFitLinesBySizeProperty: the value =====

	describe('wrapFitLinesBySizeProperty', () => {
		it('wraps each line and keeps <br> separators', () => {
			expect(wrapFitLinesBySizeProperty('one<br>two', [])).toBe(
				'<span class="typost-line" style="font-size:var(--typost-fit-line-0)">one</span><br>' +
				'<span class="typost-line" style="font-size:var(--typost-fit-line-1)">two</span>'
			);
		});

		it('does NOT wrap empty lines (zero-length spans become replacement chars in the rich-text record)', () => {
			expect(wrapFitLinesBySizeProperty('one<br><br>three', [])).toBe(
				'<span class="typost-line" style="font-size:var(--typost-fit-line-0)">one</span><br>' +
				'<br>' +
				'<span class="typost-line" style="font-size:var(--typost-fit-line-2)">three</span>'
			);
			expect(wrapFitLinesBySizeProperty('<br>two', [])).toBe(
				'<br><span class="typost-line" style="font-size:var(--typost-fit-line-1)">two</span>'
			);
			expect(wrapFitLinesBySizeProperty('one<br>', [])).toBe(
				'<span class="typost-line" style="font-size:var(--typost-fit-line-0)">one</span><br>'
			);
		});

		it('preserves inner styled spans verbatim', () => {
			const line = '<span data-font-id="36" style="font-family: var(--font-36);" class="typost-styled">You</span>';
			expect(wrapFitLinesBySizeProperty(`${line}<br>plain`, [])).toBe(
				`<span class="typost-line" style="font-size:var(--typost-fit-line-0)">${line}</span><br>` +
				'<span class="typost-line" style="font-size:var(--typost-fit-line-1)">plain</span>'
			);
		});

		it('returns empty string for empty content', () => {
			expect(wrapFitLinesBySizeProperty('', [])).toBe('');
			expect(wrapFitLinesBySizeProperty(null, [])).toBe('');
			expect(wrapFitLinesBySizeProperty(undefined, [])).toBe('');
		});

		it('tolerates missing/invalid hang arrays', () => {
			const bare = '<span class="typost-line" style="font-size:var(--typost-fit-line-0)">one</span>';
			expect(wrapFitLinesBySizeProperty('one', undefined)).toBe(bare);
			expect(wrapFitLinesBySizeProperty('one', null)).toBe(bare);
			expect(wrapFitLinesBySizeProperty('one', [null])).toBe(bare);
		});

		it('does not change when only the measured ratios change (#388)', () => {
			// The value takes no ratio at all: the same content and hangs
			// give the same string, whatever the sizes are.
			const value = wrapFitLinesBySizeProperty('one<br>two', [0, 0.1]);
			expect(buildFitLineSizeProperties('one<br>two', [0.1, 0.2], 0, 'px'))
				.not.toEqual(buildFitLineSizeProperties('one<br>two', [0.15, 0.25], 0, 'px'));
			expect(wrapFitLinesBySizeProperty('one<br>two', [0, 0.1])).toBe(value);
		});
	});

	// ===== buildFitLineSizeProperties: the sizes =====

	describe('buildFitLineSizeProperties', () => {
		it('gives each line its calc() size', () => {
			expect(buildFitLineSizeProperties('one<br>two', [0.1, 0.2], 0, 'px')).toEqual({
				'--typost-fit-line-0': 'calc(0.1 * 100cqi)',
				'--typost-fit-line-1': 'calc(0.2 * 100cqi)',
			});
		});

		it('applies the fitMaxSize cap to every sized line', () => {
			expect(buildFitLineSizeProperties('one<br>two', [0.1, 0.2], 96, 'px')).toEqual({
				'--typost-fit-line-0': 'min(calc(0.1 * 100cqi), 96px)',
				'--typost-fit-line-1': 'min(calc(0.2 * 100cqi), 96px)',
			});
		});

		it('gives no property to unmeasured lines', () => {
			expect(buildFitLineSizeProperties('one<br>two', [0.1], 0, 'px')).toEqual({
				'--typost-fit-line-0': 'calc(0.1 * 100cqi)',
			});
		});

		it('gives no property to empty lines, and keeps the index of the lines after them', () => {
			expect(buildFitLineSizeProperties('one<br><br>three', [0.1, 0.2, 0.3], 0, 'px')).toEqual({
				'--typost-fit-line-0': 'calc(0.1 * 100cqi)',
				'--typost-fit-line-2': 'calc(0.3 * 100cqi)',
			});
		});

		it('tolerates missing/invalid ratios arrays', () => {
			expect(buildFitLineSizeProperties('one', undefined, 0, 'px')).toEqual({});
			expect(buildFitLineSizeProperties('one', null, 0, 'px')).toEqual({});
			expect(buildFitLineSizeProperties('one', [null], 0, 'px')).toEqual({});
		});

		it('matches the frontend line sizes, with and without a cap, in px and rem', () => {
			const content = 'You are invited<br>April<br>Feb';
			const sizes = [0.0639, 0.1829, 0.0583];
			const words = [0.09, 0.2, 0.1];
			[[0, 'px'], [96, 'px'], [0, 'rem'], [96, 'rem']].forEach(([cap, unit]) => {
				expect(Object.values(buildFitLineSizeProperties(content, sizes, cap, unit, words)))
					.toEqual(frontendSizes(content, sizes, cap, unit, words));
			});
		});
	});

	// ===== unwrapFitLines =====

	describe('unwrapFitLines', () => {
		it('strips wrappers and keeps separators', () => {
			expect(unwrapFitLines(
				'<span class="typost-line" style="font-size:var(--typost-fit-line-0)">one</span><br>' +
				'<span class="typost-line">two</span>'
			)).toBe('one<br>two');
		});

		it('concatenates adjacent wrappers with no <br> between them (backspace-merge shape)', () => {
			expect(unwrapFitLines(
				'<span class="typost-line" style="font-size:var(--typost-fit-line-0)">abcd</span>' +
				'<span class="typost-line" style="font-size:var(--typost-fit-line-1)">ef</span>'
			)).toBe('abcdef');
		});

		it('keeps a <br> that ended up inside a wrapper (defensive)', () => {
			expect(unwrapFitLines('<span class="typost-line">ab<br>cd</span>')).toBe('ab<br>cd');
		});

		it('preserves inner markup, entities, and formatting tags verbatim', () => {
			const inner = '<span data-letterspacing="-50" style="letter-spacing: -0.05em" class="typost-styled">&amp;</span><strong>bold</strong><em>it</em>';
			expect(unwrapFitLines(`<span class="typost-line">${inner}</span>`)).toBe(inner);
		});

		it('leaves non-wrapper spans alone', () => {
			const html = '<span class="typost-styled" data-font-id="7">x</span><br>plain';
			expect(unwrapFitLines(html)).toBe(html);
		});

		it('returns empty string for empty input', () => {
			expect(unwrapFitLines('')).toBe('');
			expect(unwrapFitLines(null)).toBe('');
			expect(unwrapFitLines(undefined)).toBe('');
		});
	});

	// ===== Round-trip identity =====

	describe('round-trip identity', () => {
		const cases = [
			'Hello world',
			'one<br>two<br>three',
			'one<br><br>three',
			'<br>two',
			'one<br>',
			'You are invited<br><span data-font-id="40" data-fontweight="400" style="font-family: var(--font-40); font-weight: 400;" class="typost-styled">April &amp; Andy</span><br>February 31',
			'<strong>bold</strong><br><em>italic</em>',
			'a &lt; b &amp; c<br>d'
		];

		cases.forEach(content => {
			it(`unwrap(wrap(x)) === x for ${JSON.stringify(content.slice(0, 40))}`, () => {
				expect(unwrapFitLines(wrapFitLinesBySizeProperty(content, []))).toBe(content);
				expect(unwrapFitLines(wrapFitLinesBySizeProperty(content, [0, 0.1, 0.2]))).toBe(content);
			});
		});

		it('normalizes a span straddling a <br> into per-line clones (documented, offset-neutral)', () => {
			const straddling = '<span class="typost-styled" data-font-id="7">a<br>b</span>';
			const normalized = unwrapFitLines(wrapFitLinesBySizeProperty(straddling, []));
			expect(normalized).toBe(
				'<span class="typost-styled" data-font-id="7">a</span><br>' +
				'<span class="typost-styled" data-font-id="7">b</span>'
			);
			// The normalization changes neither the offsets…
			expect(offsetTuples(normalized)).toEqual(offsetTuples(straddling));
			// …nor the frontend markup.
			expect(buildFitLinesHtml(normalized, [0.1, 0.2], 0))
				.toBe(buildFitLinesHtml(straddling, [0.1, 0.2], 0));
			// And it is a fixed point: a second round trip is identity.
			expect(unwrapFitLines(wrapFitLinesBySizeProperty(normalized, []))).toBe(normalized);
		});
	});

	// ===== Offset invariance =====

	describe('offset invariance (flat vs wrapped)', () => {
		const cases = [
			'one<br>two<br>three',
			'one<br><br>three',
			'<br>two',
			'one<br>',
			'You<br><span data-font-id="40" class="typost-styled">April &amp; Andy</span><br>Feb',
			'<span class="typost-styled" data-font-id="7">nested <span class="typost-styled" data-fontweight="700">deep</span></span><br>x'
		];

		cases.forEach(content => {
			it(`buildTextOffsetMap is identical over flat and wrapped for ${JSON.stringify(content.slice(0, 40))}`, () => {
				const wrapped = wrapFitLinesBySizeProperty(content, [0, 0.1, 0.2]);
				expect(offsetTuples(wrapped)).toEqual(offsetTuples(content));
			});
		});
	});

	// ===== Serialization format =====

	describe('wrapper serialization format', () => {
		it('emits class first, then style, with no trailing semicolon', () => {
			// The attribute order and spacing of the Phase 0 spike (WP 7.0.2),
			// where toHTMLString(create({html: wrapped})) === wrapped held for
			// this shape. A hang follows the size, separated by ';'.
			const wrapped = wrapFitLinesBySizeProperty('You are invited<br>April<br>Feb', [0, 0.1]);
			expect(wrapped).toBe(
				'<span class="typost-line" style="font-size:var(--typost-fit-line-0)">You are invited</span><br>' +
				'<span class="typost-line" style="font-size:var(--typost-fit-line-1);--typost-line-hang:0.1">April</span><br>' +
				'<span class="typost-line" style="font-size:var(--typost-fit-line-2)">Feb</span>'
			);
		});
	});
});

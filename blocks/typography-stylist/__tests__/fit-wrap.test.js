/**
 * Test Suite: Fit-to-width editing value transforms (wrapFitLines /
 * unwrapFitLines)
 *
 * The fit-mode editing surface feeds RichText a WRAPPED value (per-line
 * span.typost-line wrappers joined with '<br>') while the stored content
 * attribute stays flat br-model HTML. These transforms are the entire
 * boundary — everything else in the plugin sees the flat model, so the
 * tests here lock in three invariants:
 *
 * 1. Round-trip identity: unwrapFitLines(wrapFitLines(x)) === x for
 *    already-normalized content (the only normalization is
 *    splitContentIntoLines' documented cloning of spans that straddle a
 *    <br>).
 * 2. Offset invariance: buildTextOffsetMap sees identical offsets over
 *    the flat and wrapped forms — the '<br>' kept between wrappers is
 *    the same +1 the flat model has, so store selection offsets and the
 *    whole QFT machinery carry over unchanged.
 * 3. The wrapped serialization format matches what wp.richText
 *    create()/toHTMLString() round-trips byte-identically (verified
 *    against WP 7.0.2 at spike time; fixture frozen here).
 */

import {
	wrapFitLines,
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

describe('Typography Stylist - fit editing value transforms', () => {

	// ===== wrapFitLines =====

	describe('wrapFitLines', () => {
		it('wraps each line and keeps <br> separators', () => {
			expect(wrapFitLines('one<br>two', [0.1, 0.2], 0)).toBe(
				'<span class="typost-line" style="font-size:calc(0.1 * 100cqi)">one</span><br>' +
				'<span class="typost-line" style="font-size:calc(0.2 * 100cqi)">two</span>'
			);
		});

		it('applies the fitMaxSize cap to every sized line', () => {
			expect(wrapFitLines('one<br>two', [0.1, 0.2], 96)).toBe(
				'<span class="typost-line" style="font-size:min(calc(0.1 * 100cqi), 96px)">one</span><br>' +
				'<span class="typost-line" style="font-size:min(calc(0.2 * 100cqi), 96px)">two</span>'
			);
		});

		it('omits font-size for unmeasured lines', () => {
			expect(wrapFitLines('one<br>two', [0.1], 0)).toBe(
				'<span class="typost-line" style="font-size:calc(0.1 * 100cqi)">one</span><br>' +
				'<span class="typost-line">two</span>'
			);
		});

		it('does NOT wrap empty lines (zero-length spans become replacement chars in the rich-text record)', () => {
			expect(wrapFitLines('one<br><br>three', [0.1, 0.2, 0.3], 0)).toBe(
				'<span class="typost-line" style="font-size:calc(0.1 * 100cqi)">one</span><br>' +
				'<br>' +
				'<span class="typost-line" style="font-size:calc(0.3 * 100cqi)">three</span>'
			);
			expect(wrapFitLines('<br>two', [0.1, 0.2], 0)).toBe(
				'<br><span class="typost-line" style="font-size:calc(0.2 * 100cqi)">two</span>'
			);
			expect(wrapFitLines('one<br>', [0.1, 0.2], 0)).toBe(
				'<span class="typost-line" style="font-size:calc(0.1 * 100cqi)">one</span><br>'
			);
		});

		it('preserves inner styled spans verbatim', () => {
			const line = '<span data-font-id="36" style="font-family: var(--font-36);" class="typost-styled">You</span>';
			expect(wrapFitLines(`${line}<br>plain`, [0.5], 0)).toBe(
				`<span class="typost-line" style="font-size:calc(0.5 * 100cqi)">${line}</span><br>` +
				'<span class="typost-line">plain</span>'
			);
		});

		it('returns empty string for empty content', () => {
			expect(wrapFitLines('', [0.1], 0)).toBe('');
			expect(wrapFitLines(null, [0.1], 0)).toBe('');
			expect(wrapFitLines(undefined, [0.1], 0)).toBe('');
		});

		it('tolerates missing/invalid ratios arrays', () => {
			expect(wrapFitLines('one', undefined, 0)).toBe('<span class="typost-line">one</span>');
			expect(wrapFitLines('one', null, 0)).toBe('<span class="typost-line">one</span>');
			expect(wrapFitLines('one', [null], 0)).toBe('<span class="typost-line">one</span>');
		});
	});

	// ===== unwrapFitLines =====

	describe('unwrapFitLines', () => {
		it('strips wrappers and keeps separators', () => {
			expect(unwrapFitLines(
				'<span class="typost-line" style="font-size:calc(0.1 * 100cqi)">one</span><br>' +
				'<span class="typost-line">two</span>'
			)).toBe('one<br>two');
		});

		it('concatenates adjacent wrappers with no <br> between them (backspace-merge shape)', () => {
			expect(unwrapFitLines(
				'<span class="typost-line" style="font-size:calc(0.1 * 100cqi)">abcd</span>' +
				'<span class="typost-line" style="font-size:calc(0.2 * 100cqi)">ef</span>'
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
				expect(unwrapFitLines(wrapFitLines(content, [0.1, 0.2, 0.3], 0))).toBe(content);
			});
		});

		it('normalizes a span straddling a <br> into per-line clones (documented, offset-neutral)', () => {
			const straddling = '<span class="typost-styled" data-font-id="7">a<br>b</span>';
			const normalized = unwrapFitLines(wrapFitLines(straddling, [0.1, 0.2], 0));
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
			expect(unwrapFitLines(wrapFitLines(normalized, [0.1, 0.2], 0))).toBe(normalized);
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
				const wrapped = wrapFitLines(content, [0.5, 0.25, 0.125], 120);
				expect(offsetTuples(wrapped)).toEqual(offsetTuples(content));
			});
		});
	});

	// ===== Serialization format frozen from the runtime spike =====

	describe('rich-text round-trip fixture (WP 7.0.2 spike)', () => {
		it('emits the exact wrapper serialization wp.richText.toHTMLString() reproduces byte-identically', () => {
			// Frozen from the Phase 0 spike on mnc4 (WP 7.0.2):
			// toHTMLString(create({html: wrapped})) === wrapped for this shape —
			// class attribute first, then style, font-size only, no trailing
			// semicolon, single spaces inside calc()/min().
			const wrapped = wrapFitLines('You are invited<br>April<br>Feb', [0.0639, 0.1829, 0.0583], 0);
			expect(wrapped).toBe(
				'<span class="typost-line" style="font-size:calc(0.0639 * 100cqi)">You are invited</span><br>' +
				'<span class="typost-line" style="font-size:calc(0.1829 * 100cqi)">April</span><br>' +
				'<span class="typost-line" style="font-size:calc(0.0583 * 100cqi)">Feb</span>'
			);
		});
	});
});

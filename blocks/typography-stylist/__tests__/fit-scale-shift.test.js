/**
 * Test Suite: Fit-relative scale + vertical shift (data-fitscale /
 * data-fitshift)
 *
 * Per-selection relative sizing inside Fit-to-Width blocks. The two
 * attributes are strictly separate from data-fontsize (which fit mode
 * neutralizes): em-relative font-size scales linearly with the fitted
 * line, so the stored width-per-size ratio stays valid as long as the
 * scaled span is INCLUDED in measurement; vertical-align: Nem moves the
 * inline box without changing its advance, so it never affects
 * measurement at all.
 */

import {
	parseInlineStylesAtCursor,
	updateSpanPropertyInPlace,
	splitSpanAndApply,
	removePropertyFromSelection,
	stripRedundantFontSizeAttrs,
	mergeTypostSpanStyling,
	overrideStylingInDescendantSpans,
	wrapFitLines,
	unwrapFitLines
} from '../utils';

describe('parseInlineStylesAtCursor — fitScale / fitShift detection', () => {
	test('detects both properties on the span at the cursor', () => {
		const html = 'April <span class="typost-styled" data-fitscale="0.6" data-fitshift="0.35" style="font-size: 0.6em; vertical-align: 0.35em">&amp;</span> Andy';
		const result = parseInlineStylesAtCursor(html, 6, 7);
		expect(result.fitScale).toBe(0.6);
		expect(result.fitShift).toBe(0.35);
	});

	test('reports null when the attributes are absent', () => {
		const html = 'April <span class="typost-styled" data-letterspacing="50" style="letter-spacing: 0.05em">&amp;</span> Andy';
		const result = parseInlineStylesAtCursor(html, 6, 7);
		expect(result.fitScale).toBeNull();
		expect(result.fitShift).toBeNull();
	});

	test('inherits from an ancestor span (walk-up)', () => {
		const html = '<span class="typost-styled" data-fitscale="0.5" style="font-size: 0.5em"><span class="typost-styled" data-fontweight="700" style="font-weight: 700">Hi</span></span>';
		const result = parseInlineStylesAtCursor(html, 0, 2);
		expect(result.fitScale).toBe(0.5);
		expect(result.fontWeight).toBe('700');
	});

	test('negative shift parses as a float', () => {
		const html = '<span class="typost-styled" data-fitshift="-0.25" style="vertical-align: -0.25em">low</span>';
		const result = parseInlineStylesAtCursor(html, 1, 1);
		expect(result.fitShift).toBe(-0.25);
	});
});

describe('three-tier apply round-trips', () => {
	test('updateSpanPropertyInPlace adds data-fitscale to the span at a collapsed cursor', () => {
		const html = 'April <span class="typost-styled" data-features="ss01" style="font-feature-settings: &quot;ss01&quot; 1">&amp;</span> Andy';
		const result = updateSpanPropertyInPlace(html, 6, 'data-fitscale', '0.6', 'font-size', '0.6em');
		expect(result.success).toBe(true);
		expect(result.content).toContain('data-fitscale="0.6"');
		expect(result.content).toContain('font-size: 0.6em');
		// Existing feature styling untouched
		expect(result.content).toContain('data-features="ss01"');
	});

	test('updateSpanPropertyInPlace updates an existing data-fitscale in place (no nesting)', () => {
		const html = '<span class="typost-styled" data-fitscale="0.6" style="font-size: 0.6em">&amp;</span>';
		const result = updateSpanPropertyInPlace(html, 0, 'data-fitscale', '0.4', 'font-size', '0.4em');
		expect(result.success).toBe(true);
		expect(result.content).toContain('data-fitscale="0.4"');
		expect(result.content).toContain('font-size: 0.4em');
		expect((result.content.match(/typost-styled/g) || []).length).toBe(1);
	});

	test('splitSpanAndApply re-scales only the selected part of a scaled span', () => {
		const html = '<span class="typost-styled" data-fitscale="0.8" style="font-size: 0.8em">ABCD</span>';
		const result = splitSpanAndApply(html, 1, 3, 'data-fitscale',
			{ 'data-fitscale': '0.5' }, 'font-size: 0.5em');
		expect(result.success).toBe(true);
		expect(result.content).toContain('data-fitscale="0.5"');
		expect(result.content).toContain('data-fitscale="0.8"');
	});

	test('updateSpanPropertyInPlace applies data-fitshift alongside an existing scale', () => {
		const html = '<span class="typost-styled" data-fitscale="0.6" style="font-size: 0.6em">&amp;</span>';
		const result = updateSpanPropertyInPlace(html, 0, 'data-fitshift', '0.35', 'vertical-align', '0.35em');
		expect(result.success).toBe(true);
		expect(result.content).toContain('data-fitscale="0.6"');
		expect(result.content).toContain('data-fitshift="0.35"');
		expect(result.content).toContain('font-size: 0.6em');
		expect(result.content).toContain('vertical-align: 0.35em');
	});
});

describe('removePropertyFromSelection — reset paths', () => {
	test('removes data-fitscale and its font-size declaration', () => {
		const html = '<span class="typost-styled" data-fitscale="0.6" data-fitshift="0.35" style="font-size: 0.6em; vertical-align: 0.35em">&amp;</span>';
		const result = removePropertyFromSelection(html, 0, 1, 'data-fitscale', 'font-size');
		expect(result.success).toBe(true);
		expect(result.content).not.toContain('data-fitscale');
		expect(result.content).not.toContain('font-size');
		// Shift survives
		expect(result.content).toContain('data-fitshift="0.35"');
		expect(result.content).toContain('vertical-align: 0.35em');
	});

	test('collapsed caret at the start of a single-glyph span removes the property (PR fix)', () => {
		// A one-character span has no interior text position, so every caret
		// sits on a node boundary — the overlap-based lookup could never
		// match it and the Reset silently no-opped.
		const html = 'April <span class="typost-styled" data-fitscale="0.6" data-letterspacing="-173" style="letter-spacing: -0.173em; font-size: 0.6em">&amp;</span> Andy';
		const result = removePropertyFromSelection(html, 6, 6, 'data-fitscale', 'font-size');
		expect(result.success).toBe(true);
		expect(result.content).not.toContain('data-fitscale');
		expect(result.content).not.toContain('font-size');
		// Unrelated property survives, span not unwrapped
		expect(result.content).toContain('data-letterspacing="-173"');
	});

	test('collapsed caret walks up to the ancestor span carrying the property', () => {
		const html = '<span class="typost-styled" data-fitscale="0.6" style="font-size: 0.6em"><span class="typost-styled" data-fontweight="700" style="font-weight: 700">Hi</span></span>';
		const result = removePropertyFromSelection(html, 0, 0, 'data-fitscale', 'font-size');
		expect(result.success).toBe(true);
		expect(result.content).not.toContain('data-fitscale');
		expect(result.content).toContain('data-fontweight="700"');
	});

	test('collapsed caret in unstyled text leaves content unchanged', () => {
		const html = 'Plain <span class="typost-styled" data-fitscale="0.6" style="font-size: 0.6em">x</span>';
		const result = removePropertyFromSelection(html, 2, 2, 'data-fitscale', 'font-size');
		expect(result.success).toBe(true);
		expect(result.content).toBe(html);
	});

	test('a span left with only data-fitshift is not unwrapped when fitscale is removed', () => {
		// removePropertyFromSpan must count the fit attributes as remaining
		// styling or the unwrap check could discard them
		const html = '<span class="typost-styled" data-fitscale="0.6" data-fitshift="0.3" style="font-size: 0.6em; vertical-align: 0.3em">&amp;</span>';
		const result = removePropertyFromSelection(html, 0, 1, 'data-fitscale', 'font-size');
		expect(result.success).toBe(true);
		expect(result.content).toContain('data-fitshift="0.3"');
		expect(result.content).toContain('vertical-align: 0.3em');
	});

	test('removes data-fitshift and its vertical-align declaration', () => {
		const html = '<span class="typost-styled" data-fitscale="0.6" data-fitshift="0.35" style="font-size: 0.6em; vertical-align: 0.35em">&amp;</span>';
		const result = removePropertyFromSelection(html, 0, 1, 'data-fitshift', 'vertical-align');
		expect(result.success).toBe(true);
		expect(result.content).not.toContain('data-fitshift');
		expect(result.content).not.toContain('vertical-align');
		expect(result.content).toContain('data-fitscale="0.6"');
	});
});

describe('stripRedundantFontSizeAttrs — data-fontsize coexistence guard', () => {
	test('removes data-fontsize* from spans that gained data-fitscale', () => {
		const html = '<span class="typost-styled" data-fitscale="0.6" data-fontsize="responsive" data-fontsize-min="16" data-fontsize-preferred="32" data-fontsize-max="64" style="font-size: 0.6em">&amp;</span>';
		const out = stripRedundantFontSizeAttrs(html);
		expect(out).toContain('data-fitscale="0.6"');
		expect(out).not.toContain('data-fontsize');
		expect(out).toContain('font-size: 0.6em');
	});

	test('leaves data-fontsize alone on spans without data-fitscale', () => {
		const html = '<span class="typost-styled" data-fontsize="responsive" style="font-size: clamp(16px, 2rem + 3vw, 64px)">Hi</span>';
		expect(stripRedundantFontSizeAttrs(html)).toBe(html);
	});

	test('passes through empty/absent content unchanged', () => {
		expect(stripRedundantFontSizeAttrs('')).toBe('');
		expect(stripRedundantFontSizeAttrs('plain text')).toBe('plain text');
	});
});

describe('mergeTypostSpanStyling — preservation of scale/shift', () => {
	const makeSpan = (html) => {
		document.body.innerHTML = html;
		return document.body.querySelector('span');
	};

	test('applying another property preserves data-fitscale/-fitshift and their declarations', () => {
		const span = makeSpan('<span class="typost-styled" data-fitscale="0.6" data-fitshift="0.35" style="font-size: 0.6em; vertical-align: 0.35em">&amp;</span>');
		mergeTypostSpanStyling(span, { 'data-fontweight': '700' }, 'font-weight: 700');
		expect(span.getAttribute('data-fitscale')).toBe('0.6');
		expect(span.getAttribute('data-fitshift')).toBe('0.35');
		expect(span.getAttribute('style')).toContain('font-size: 0.6em');
		expect(span.getAttribute('style')).toContain('vertical-align: 0.35em');
		expect(span.getAttribute('style')).toContain('font-weight: 700');
	});
});

describe('overrideStylingInDescendantSpans — wrapper scale replaces inner scales', () => {
	test('a wrapping data-fitscale strips descendant scales instead of compounding', () => {
		document.body.innerHTML = '<span id="w" class="typost-styled" data-fitscale="0.5" style="font-size: 0.5em">a<span class="typost-styled" data-fitscale="0.6" data-fontweight="700" style="font-size: 0.6em; font-weight: 700">b</span></span>';
		const wrapper = document.getElementById('w');
		overrideStylingInDescendantSpans(wrapper, { 'data-fitscale': '0.5' }, 'font-size: 0.5em');
		const inner = wrapper.querySelector('span');
		expect(inner.hasAttribute('data-fitscale')).toBe(false);
		expect(inner.getAttribute('style')).not.toContain('font-size');
		// Unrelated property survives
		expect(inner.getAttribute('data-fontweight')).toBe('700');
	});

	test('a wrapping data-fitshift strips descendant shifts', () => {
		document.body.innerHTML = '<span id="w" class="typost-styled" data-fitshift="0.2" style="vertical-align: 0.2em">a<span class="typost-styled" data-fitshift="-0.1" style="vertical-align: -0.1em">b</span></span>';
		const wrapper = document.getElementById('w');
		overrideStylingInDescendantSpans(wrapper, { 'data-fitshift': '0.2' }, 'vertical-align: 0.2em');
		// Inner span had nothing left — it gets unwrapped entirely
		expect(wrapper.querySelector('span')).toBeNull();
		expect(wrapper.textContent).toBe('ab');
	});
});

describe('wrapFitLines / unwrapFitLines — round-trip carries the spans verbatim', () => {
	test('fitscale/fitshift spans survive the fit editing-value round trip', () => {
		const flat = 'April <span class="typost-styled" data-fitscale="0.6" data-fitshift="0.35" style="font-size: 0.6em; vertical-align: 0.35em">&amp;</span> Andy<br>Forever';
		const wrapped = wrapFitLines(flat, [0.02, 0.05], 0);
		expect(wrapped).toContain('data-fitscale="0.6"');
		expect(wrapped).toContain('data-fitshift="0.35"');
		expect(unwrapFitLines(wrapped)).toBe(flat);
	});
});

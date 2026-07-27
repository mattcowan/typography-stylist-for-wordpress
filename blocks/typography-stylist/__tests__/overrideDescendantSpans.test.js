/**
 * Tests for overrideStylingInDescendantSpans() — making a property applied to
 * a wrapping span actually take effect inside wrapped typost-styled spans
 * (the "select all + change font in the QFT looks like it did nothing" bug).
 */

import { overrideStylingInDescendantSpans } from '../utils';

function buildWrapper(innerHtml, attributes, styleString) {
	document.body.innerHTML = '';
	const wrapper = document.createElement('span');
	wrapper.className = 'typost-styled';
	Object.keys(attributes).forEach((key) => wrapper.setAttribute(key, attributes[key]));
	if (styleString) {
		wrapper.setAttribute('style', styleString);
	}
	wrapper.innerHTML = innerHtml;
	document.body.appendChild(wrapper);
	return wrapper;
}

describe('overrideStylingInDescendantSpans', () => {
	const fontAttrs = { 'data-font-id': '11' };
	const fontStyle = 'font-family: var(--font-11)';

	test('font change strips descendant font declarations so the wrapper wins', () => {
		const wrapper = buildWrapper(
			'<span class="typost-styled" data-features="ss01" data-font-id="4" data-fontsize="40px" style="font-feature-settings: \'ss01\' 1; font-family: var(--font-4); font-size: 40px">El</span>' +
			'<span class="typost-styled" data-font-id="4" style="font-family: var(--font-4)">egant</span>',
			fontAttrs, fontStyle
		);
		overrideStylingInDescendantSpans(wrapper, fontAttrs, fontStyle);

		const first = wrapper.querySelectorAll('span.typost-styled')[0];
		// Font gone from the descendant — wrapper cascades
		expect(first.getAttribute('data-font-id')).toBeNull();
		expect(first.getAttribute('style')).not.toContain('font-family');
		// Everything else intact
		expect(first.getAttribute('data-features')).toBe('ss01');
		expect(first.getAttribute('data-fontsize')).toBe('40px');
		expect(first.getAttribute('style')).toContain("font-feature-settings: 'ss01' 1");
		expect(first.getAttribute('style')).toContain('font-size: 40px');
	});

	test('descendants left with nothing are unwrapped (no nesting build-up)', () => {
		const wrapper = buildWrapper(
			'<span class="typost-styled" data-font-id="4" style="font-family: var(--font-4)">egant</span>',
			fontAttrs, fontStyle
		);
		overrideStylingInDescendantSpans(wrapper, fontAttrs, fontStyle);
		expect(wrapper.querySelectorAll('span.typost-styled')).toHaveLength(0);
		expect(wrapper.textContent).toBe('egant');
	});

	test('font change also invalidates descendant variation-axis settings', () => {
		const wrapper = buildWrapper(
			'<span class="typost-styled" data-font-id="4" data-font-variation-settings=\'"wght" 628\' style=\'font-family: var(--font-4); font-variation-settings: "wght" 628; font-size: 20px\'>x</span>',
			fontAttrs, fontStyle
		);
		overrideStylingInDescendantSpans(wrapper, fontAttrs, fontStyle);
		const span = wrapper.querySelector('span.typost-styled');
		expect(span.getAttribute('data-font-variation-settings')).toBeNull();
		expect(span.getAttribute('style')).toBe('font-size: 20px');
	});

	test('applied features merge into descendants that declare their own settings', () => {
		const attrs = { 'data-features': 'liga' };
		const style = 'font-feature-settings: "liga" 1';
		const wrapper = buildWrapper(
			'<span class="typost-styled" data-features="swsh" style=\'font-feature-settings: "swsh" 1\'>a</span>' +
			'<span class="typost-styled" data-fontsize="20px" style="font-size: 20px">b</span>',
			attrs, style
		);
		overrideStylingInDescendantSpans(wrapper, attrs, style);
		const spans = wrapper.querySelectorAll('span.typost-styled');
		// Own settings: wrapper's tag merged in (inner decl replaces outer in CSS)
		expect(spans[0].getAttribute('data-features')).toBe('swsh,liga');
		expect(spans[0].getAttribute('style')).toBe('font-feature-settings: "swsh" 1, "liga" 1');
		// No own settings: untouched — it inherits the wrapper's declaration
		expect(spans[1].getAttribute('style')).toBe('font-size: 20px');
	});

	test('weight and size applies cascade the same way', () => {
		const attrs = { 'data-fontweight': '700', 'data-fontsize': '60px' };
		const style = 'font-weight: 700; font-size: 60px';
		const wrapper = buildWrapper(
			'<span class="typost-styled" data-fontweight="300" data-fontsize="40px" data-features="ss02" style=\'font-weight: 300; font-size: 40px; font-feature-settings: "ss02" 1\'>x</span>',
			attrs, style
		);
		overrideStylingInDescendantSpans(wrapper, attrs, style);
		const span = wrapper.querySelector('span.typost-styled');
		expect(span.getAttribute('data-fontweight')).toBeNull();
		expect(span.getAttribute('data-fontsize')).toBeNull();
		expect(span.getAttribute('style')).toBe('font-feature-settings: "ss02" 1');
		expect(span.getAttribute('data-features')).toBe('ss02');
	});
});

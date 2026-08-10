/**
 * A span carrying data-style-id renders entirely through the paragraph style's
 * CSS class, so it has no inline style of its own. removePropertyFromSpan must
 * still treat it as meaningful: unwrapping it because "nothing is left" would
 * silently drop the paragraph style when some other property is removed.
 */

import { removePropertyFromSpan, removePropertyFromSelection } from '../utils';

const spanFrom = (html) => {
	const host = document.createElement('div');
	host.innerHTML = html;
	return host.firstChild;
};

describe('removePropertyFromSpan with data-style-id', () => {
	test('keeps a span that still carries a paragraph style', () => {
		const span = spanFrom('<span class="typost-styled" data-style-id="4" data-fontweight="700" style="font-weight: 700">Hi</span>');
		const shouldUnwrap = removePropertyFromSpan(span, 'data-fontweight', 'font-weight');

		expect(shouldUnwrap).toBe(false);
		expect(span.getAttribute('data-style-id')).toBe('4');
		expect(span.getAttribute('data-fontweight')).toBeNull();
	});

	test('unwraps once the paragraph style itself is removed', () => {
		const span = spanFrom('<span class="typost-styled" data-style-id="4">Hi</span>');
		expect(removePropertyFromSpan(span, 'data-style-id', '')).toBe(true);
	});

	test('keeps a span whose other properties outlive the style', () => {
		const span = spanFrom('<span class="typost-styled" data-style-id="4" data-features="swsh">Hi</span>');
		expect(removePropertyFromSpan(span, 'data-style-id', '')).toBe(false);
		expect(span.getAttribute('data-features')).toBe('swsh');
	});
});

describe('removePropertyFromSelection detaching a paragraph style', () => {
	test('strips data-style-id from the selection and unwraps the bare span', () => {
		const content = 'A <span class="typost-styled" data-style-id="4">styled</span> word';
		const result = removePropertyFromSelection(content, 2, 8, 'data-style-id', '');

		expect(result.success).toBe(true);
		expect(result.content).not.toContain('data-style-id');
		expect(result.content).not.toContain('typost-styled');
		expect(result.content).toContain('styled');
	});

	test('leaves surrounding text untouched', () => {
		const content = 'A <span class="typost-styled" data-style-id="4">styled</span> word';
		const result = removePropertyFromSelection(content, 2, 8, 'data-style-id', '');

		const host = document.createElement('div');
		host.innerHTML = result.content;
		expect(host.textContent).toBe('A styled word');
	});
});

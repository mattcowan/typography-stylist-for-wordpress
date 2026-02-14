/**
 * Test Suite: Property Removal Utilities
 *
 * Tests for debounce, removePropertyFromSpan, and removePropertyFromSelection
 * utilities used for Reset button functionality.
 */

import { debounce, removePropertyFromSpan, removePropertyFromSelection } from '../utils';

describe('Typography Stylist - debounce()', () => {

	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.runOnlyPendingTimers();
		jest.useRealTimers();
	});

	it('should delay function execution by specified time', () => {
		const mockFn = jest.fn();
		const debouncedFn = debounce(mockFn, 300);

		debouncedFn();
		expect(mockFn).not.toHaveBeenCalled();

		jest.advanceTimersByTime(300);
		expect(mockFn).toHaveBeenCalledTimes(1);
	});

	it('should reset delay on repeated calls', () => {
		const mockFn = jest.fn();
		const debouncedFn = debounce(mockFn, 300);

		debouncedFn();
		jest.advanceTimersByTime(150);
		debouncedFn(); // Reset timer
		jest.advanceTimersByTime(150);

		expect(mockFn).not.toHaveBeenCalled(); // Still waiting

		jest.advanceTimersByTime(150); // Total 300ms from last call
		expect(mockFn).toHaveBeenCalledTimes(1);
	});

	it('should pass arguments to debounced function', () => {
		const mockFn = jest.fn();
		const debouncedFn = debounce(mockFn, 300);

		debouncedFn('arg1', 'arg2', 123);
		jest.advanceTimersByTime(300);

		expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2', 123);
	});

	it('should support cancel method to prevent execution', () => {
		const mockFn = jest.fn();
		const debouncedFn = debounce(mockFn, 300);

		debouncedFn();
		jest.advanceTimersByTime(150);
		debouncedFn.cancel();
		jest.advanceTimersByTime(300);

		expect(mockFn).not.toHaveBeenCalled();
	});

	it('should handle multiple rapid calls, executing only once', () => {
		const mockFn = jest.fn();
		const debouncedFn = debounce(mockFn, 400);

		// Simulate rapid slider adjustments
		for (let i = 0; i < 10; i++) {
			debouncedFn(i);
			jest.advanceTimersByTime(50);
		}

		// Should not have executed yet (last call was < 400ms ago)
		expect(mockFn).not.toHaveBeenCalled();

		jest.advanceTimersByTime(400);
		expect(mockFn).toHaveBeenCalledTimes(1);
		expect(mockFn).toHaveBeenCalledWith(9); // Last value
	});
});

describe('Typography Stylist - removePropertyFromSpan()', () => {

	it('should remove single property from span', () => {
		const doc = new DOMParser().parseFromString('<div></div>', 'text/html');
		const span = doc.createElement('span');
		span.className = 'typost-styled';
		span.setAttribute('data-letterspacing', '100');
		span.setAttribute('data-fontweight', '700');
		span.setAttribute('style', 'letter-spacing: 0.1em; font-weight: 700');

		const shouldUnwrap = removePropertyFromSpan(span, 'data-letterspacing', 'letter-spacing');

		expect(shouldUnwrap).toBe(false); // Still has fontweight
		expect(span.hasAttribute('data-letterspacing')).toBe(false);
		expect(span.getAttribute('style')).not.toContain('letter-spacing');
		expect(span.getAttribute('style')).toContain('font-weight: 700');
		expect(span.getAttribute('data-fontweight')).toBe('700');
	});

	it('should signal unwrap when removing last property', () => {
		const doc = new DOMParser().parseFromString('<div></div>', 'text/html');
		const span = doc.createElement('span');
		span.className = 'typost-styled';
		span.setAttribute('data-letterspacing', '100');
		span.setAttribute('style', 'letter-spacing: 0.1em');

		const shouldUnwrap = removePropertyFromSpan(span, 'data-letterspacing', 'letter-spacing');

		expect(shouldUnwrap).toBe(true);
		expect(span.hasAttribute('data-letterspacing')).toBe(false);
		expect(span.hasAttribute('style')).toBe(false);
	});

	it('should preserve other properties when removing one', () => {
		const doc = new DOMParser().parseFromString('<div></div>', 'text/html');
		const span = doc.createElement('span');
		span.className = 'typost-styled';
		span.setAttribute('data-letterspacing', '100');
		span.setAttribute('data-fontweight', '700');
		span.setAttribute('data-features', 'ss01');
		span.setAttribute('style', 'letter-spacing: 0.1em; font-weight: 700; font-feature-settings: "ss01" 1');

		const shouldUnwrap = removePropertyFromSpan(span, 'data-letterspacing', 'letter-spacing');

		expect(shouldUnwrap).toBe(false);
		expect(span.getAttribute('data-fontweight')).toBe('700');
		expect(span.getAttribute('data-features')).toBe('ss01');
		expect(span.getAttribute('style')).toContain('font-weight: 700');
		expect(span.getAttribute('style')).toContain('font-feature-settings');
	});

	it('should handle span with no style attribute', () => {
		const doc = new DOMParser().parseFromString('<div></div>', 'text/html');
		const span = doc.createElement('span');
		span.className = 'typost-styled';
		span.setAttribute('data-letterspacing', '100');
		span.setAttribute('data-fontweight', '700');
		// No style attribute

		const shouldUnwrap = removePropertyFromSpan(span, 'data-letterspacing', 'letter-spacing');

		expect(shouldUnwrap).toBe(false); // Still has fontweight
		expect(span.hasAttribute('data-letterspacing')).toBe(false);
	});

	it('should handle removing font-id property', () => {
		const doc = new DOMParser().parseFromString('<div></div>', 'text/html');
		const span = doc.createElement('span');
		span.className = 'typost-styled';
		span.setAttribute('data-font-id', 'custom-font');
		span.setAttribute('data-features', 'ss01');
		span.setAttribute('style', 'font-family: var(--font-custom-font); font-feature-settings: "ss01" 1');

		const shouldUnwrap = removePropertyFromSpan(span, 'data-font-id', 'font-family');

		expect(shouldUnwrap).toBe(false); // Still has features
		expect(span.hasAttribute('data-font-id')).toBe(false);
		expect(span.getAttribute('style')).not.toContain('font-family');
		expect(span.getAttribute('data-features')).toBe('ss01');
	});

	it('should handle removing line-height property', () => {
		const doc = new DOMParser().parseFromString('<div></div>', 'text/html');
		const span = doc.createElement('span');
		span.className = 'typost-styled';
		span.setAttribute('data-lineheight', '1.8');
		span.setAttribute('style', 'line-height: 1.8');

		const shouldUnwrap = removePropertyFromSpan(span, 'data-lineheight', 'line-height');

		expect(shouldUnwrap).toBe(true);
		expect(span.hasAttribute('data-lineheight')).toBe(false);
	});
});

describe('Typography Stylist - removePropertyFromSelection()', () => {

	it('should remove property from single span in selection', () => {
		const html = '<span class="typost-styled" data-letterspacing="100" style="letter-spacing: 0.1em">Beautiful</span>';
		const result = removePropertyFromSelection(html, 0, 9, 'data-letterspacing', 'letter-spacing');

		expect(result.success).toBe(true);
		// Span should be unwrapped since it has no other properties
		expect(result.content).toBe('Beautiful');
	});

	it('should preserve span when other properties remain', () => {
		const html = '<span class="typost-styled" data-letterspacing="100" data-fontweight="700" style="letter-spacing: 0.1em; font-weight: 700">Text</span>';
		const result = removePropertyFromSelection(html, 0, 4, 'data-letterspacing', 'letter-spacing');

		expect(result.success).toBe(true);
		expect(result.content).toContain('data-fontweight="700"');
		expect(result.content).not.toContain('data-letterspacing');
		expect(result.content).toContain('font-weight: 700');
		expect(result.content).not.toContain('letter-spacing');
	});

	it('should handle nested spans, removing property from parent', () => {
		const html = '<span class="typost-styled" data-letterspacing="100" style="letter-spacing: 0.1em">Outer <span class="typost-styled" data-features="ss01" style="font-feature-settings: &quot;ss01&quot; 1">Inner</span> text</span>';
		const result = removePropertyFromSelection(html, 0, 15, 'data-letterspacing', 'letter-spacing');

		expect(result.success).toBe(true);
		// Parent span should be unwrapped, but inner feature span should remain
		expect(result.content).toContain('data-features="ss01"');
		expect(result.content).not.toContain('data-letterspacing');
	});

	it('should handle selection with no styled spans', () => {
		const html = 'Plain text without spans';
		const result = removePropertyFromSelection(html, 0, 10, 'data-letterspacing', 'letter-spacing');

		expect(result.success).toBe(true);
		expect(result.content).toBe('Plain text without spans');
	});

	it('should handle collapsed cursor position', () => {
		const html = '<span class="typost-styled" data-letterspacing="100" style="letter-spacing: 0.1em">Beautiful</span>';
		const result = removePropertyFromSelection(html, 5, 5, 'data-letterspacing', 'letter-spacing');

		expect(result.success).toBe(true);
		expect(result.content).toBe('Beautiful'); // Span unwrapped
	});

	it('should handle multiple spans with property', () => {
		const html = '<span class="typost-styled" data-letterspacing="100" style="letter-spacing: 0.1em">First</span> <span class="typost-styled" data-letterspacing="100" style="letter-spacing: 0.1em">Second</span>';
		const result = removePropertyFromSelection(html, 0, 13, 'data-letterspacing', 'letter-spacing');

		expect(result.success).toBe(true);
		expect(result.content).not.toContain('data-letterspacing');
		expect(result.content).toBe('First Second');
	});

	it('should only remove specified property, not others', () => {
		const html = '<span class="typost-styled" data-letterspacing="100" data-fontweight="700" data-features="ss01" style="letter-spacing: 0.1em; font-weight: 700; font-feature-settings: &quot;ss01&quot; 1">Text</span>';
		const result = removePropertyFromSelection(html, 0, 4, 'data-letterspacing', 'letter-spacing');

		expect(result.success).toBe(true);
		expect(result.content).toContain('data-fontweight="700"');
		expect(result.content).toContain('data-features="ss01"');
		expect(result.content).not.toContain('data-letterspacing');
		expect(result.content).toContain('font-weight: 700');
		expect(result.content).toContain('font-feature-settings');
	});

	it('should handle empty content', () => {
		const result = removePropertyFromSelection('', 0, 0, 'data-letterspacing', 'letter-spacing');

		expect(result.success).toBe(false);
	});

	it('should handle null content', () => {
		const result = removePropertyFromSelection(null, 0, 0, 'data-letterspacing', 'letter-spacing');

		expect(result.success).toBe(false);
	});

	it('should remove font-size property from responsive font span', () => {
		const html = '<span class="typost-styled" data-fontsize="responsive" data-fontsize-min="16" data-fontsize-preferred="32" data-fontsize-max="64" style="font-size: clamp(16px, 2vw + 1rem, 64px)">Text</span>';
		const result = removePropertyFromSelection(html, 0, 4, 'data-fontsize', 'font-size');

		expect(result.success).toBe(true);
		expect(result.content).not.toContain('data-fontsize');
		expect(result.content).not.toContain('data-fontsize-min');
		expect(result.content).not.toContain('data-fontsize-preferred');
		expect(result.content).not.toContain('data-fontsize-max');
		expect(result.content).not.toContain('font-size');
		// Span should be completely unwrapped since all attributes removed
		expect(result.content).toBe('Text');
	});

	it('should remove responsive font-size while preserving other span styles', () => {
		const html =
			'<span class="typost-styled" data-fontsize="responsive" data-fontsize-min="16" data-fontsize-preferred="32" data-fontsize-max="64" data-fontweight="700" style="font-size: clamp(16px, 2vw + 1rem, 64px); font-weight: 700">Text</span>';
		const result = removePropertyFromSelection(html, 0, 4, 'data-fontsize', 'font-size');

		expect(result.success).toBe(true);
		// Responsive font-size data attributes and CSS should be removed
		expect(result.content).not.toContain('data-fontsize="responsive"');
		expect(result.content).not.toContain('data-fontsize-min');
		expect(result.content).not.toContain('data-fontsize-preferred');
		expect(result.content).not.toContain('data-fontsize-max');
		expect(result.content).not.toContain('font-size');
		// Other styling should remain and span should be preserved
		expect(result.content).toContain('<span');
		expect(result.content).toContain('</span>');
		expect(result.content).toContain('data-fontweight="700"');
		expect(result.content).toContain('font-weight: 700');
	});

	it('should remove font-weight property', () => {
		const html = '<span class="typost-styled" data-fontweight="700" style="font-weight: 700">Bold text</span>';
		const result = removePropertyFromSelection(html, 0, 9, 'data-fontweight', 'font-weight');

		expect(result.success).toBe(true);
		expect(result.content).toBe('Bold text');
	});

	it('should remove font-id property', () => {
		const html = '<span class="typost-styled" data-font-id="custom-font" style="font-family: var(--font-custom-font)">Custom font text</span>';
		const result = removePropertyFromSelection(html, 0, 16, 'data-font-id', 'font-family');

		expect(result.success).toBe(true);
		expect(result.content).toBe('Custom font text');
	});
});

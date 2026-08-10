/**
 * Tests for detectBlockComputedWeight() — reading the weight a block is
 * actually rendering at.
 *
 * Themes make headings bold through CSS, never through a stored attribute, so
 * converting a core heading to a Typography Stylist block used to drop it to
 * the block's default 400 and visibly lighten the text.
 */

import { detectBlockComputedWeight } from '../utils';

// No editor-canvas iframe in jsdom, so the helper falls back to `document`
const mountBlock = (clientId, innerHTML) => {
	const host = document.createElement('div');
	host.innerHTML = innerHTML.replace(/CLIENT_ID/g, clientId);
	document.body.appendChild(host);
	return host;
};

describe('detectBlockComputedWeight', () => {
	afterEach(() => {
		document.body.innerHTML = '';
	});

	test('reads the weight from the text element inside a block wrapper', () => {
		mountBlock('abc', '<div data-block="CLIENT_ID"><h2 class="typost-block-content" style="font-weight: 700">Hi</h2></div>');
		expect(detectBlockComputedWeight('abc')).toBe('700');
	});

	test('reads the weight when the wrapper IS the text element (WordPress 6.5+)', () => {
		mountBlock('abc', '<h2 data-block="CLIENT_ID" style="font-weight: 600">Hi</h2>');
		expect(detectBlockComputedWeight('abc', 'h1,h2,h3,h4,h5,h6,p')).toBe('600');
	});

	test('normalizes keyword weights to numbers, which is what the attribute stores', () => {
		mountBlock('abc', '<h2 data-block="CLIENT_ID" style="font-weight: bold">Hi</h2>');
		expect(detectBlockComputedWeight('abc', 'h1,h2,h3,h4,h5,h6,p')).toBe('700');

		document.body.innerHTML = '';
		mountBlock('def', '<p data-block="CLIENT_ID" style="font-weight: normal">Hi</p>');
		expect(detectBlockComputedWeight('def', 'h1,h2,h3,h4,h5,h6,p')).toBe('400');
	});

	test('returns empty string when the block is not in the DOM', () => {
		expect(detectBlockComputedWeight('missing')).toBe('');
	});

	test('returns empty string when no text element matches the selector', () => {
		mountBlock('abc', '<div data-block="CLIENT_ID"><span>no heading here</span></div>');
		expect(detectBlockComputedWeight('abc', 'h1,h2,h3,h4,h5,h6,p')).toBe('');
	});

	test('returns empty string without a client ID, so callers keep their default', () => {
		expect(detectBlockComputedWeight('')).toBe('');
		expect(detectBlockComputedWeight(null)).toBe('');
	});
});

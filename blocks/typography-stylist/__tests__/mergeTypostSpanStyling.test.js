/**
 * Tests for mergeTypostSpanStyling() — the single shared implementation of
 * "apply styling onto a span whose entire text is selected", previously
 * duplicated (and drifting) between applyOrMergeStyling and
 * applyStylingSafeStringMethod. Includes the two bug fixes that motivated
 * the extraction: raw indexed alternates survive rebuilds, and font changes
 * invalidate font-specific variation-axis settings.
 */

import { mergeTypostSpanStyling, splitSpanAndApply } from '../utils';

function makeSpan(attrs) {
	const span = document.createElement('span');
	span.className = 'typost-styled';
	Object.keys(attrs || {}).forEach((k) => span.setAttribute(k, attrs[k]));
	span.textContent = 'Elegant';
	return span;
}

describe('mergeTypostSpanStyling — preservation matrix', () => {
	test('applying line-height preserves font, size, weight and their declarations', () => {
		const span = makeSpan({
			'data-font-id': '4',
			'data-fontsize': '40px',
			'data-fontweight': '300',
			style: 'font-family: var(--font-4); font-size: 40px; font-weight: 300',
		});
		mergeTypostSpanStyling(span, { 'data-lineheight': '1.5' }, 'line-height: 1.5');
		expect(span.getAttribute('data-font-id')).toBe('4');
		expect(span.getAttribute('data-lineheight')).toBe('1.5');
		const style = span.getAttribute('style');
		expect(style).toContain('font-family: var(--font-4)');
		expect(style).toContain('font-size: 40px');
		expect(style).toContain('font-weight: 300');
		expect(style).toContain('line-height: 1.5');
	});

	test('new font always overrides the preserved font-family declaration', () => {
		const span = makeSpan({ 'data-font-id': '4', style: 'font-family: var(--font-4)' });
		mergeTypostSpanStyling(span, { 'data-font-id': '11' }, 'font-family: var(--font-11)');
		expect(span.getAttribute('data-font-id')).toBe('11');
		expect(span.getAttribute('style')).toContain('var(--font-11)');
		expect(span.getAttribute('style')).not.toContain('var(--font-4)');
	});
});

describe('mergeTypostSpanStyling — feature merging', () => {
	test('features combine and deduplicate; declaration rebuilds with all tags', () => {
		const span = makeSpan({ 'data-features': 'swsh', style: 'font-feature-settings: "swsh" 1' });
		mergeTypostSpanStyling(span, { 'data-features': 'liga,swsh' }, 'font-feature-settings: "liga" 1, "swsh" 1');
		expect(span.getAttribute('data-features')).toBe('swsh,liga');
		expect(span.getAttribute('style')).toBe('font-feature-settings: "swsh" 1, "liga" 1');
	});

	test('feature-only merge rebuilds the declaration even with an empty styleString (string-method gap)', () => {
		const span = makeSpan({ 'data-features': 'swsh', style: 'font-feature-settings: "swsh" 1' });
		mergeTypostSpanStyling(span, { 'data-features': 'liga' }, '');
		expect(span.getAttribute('style')).toBe('font-feature-settings: "swsh" 1, "liga" 1');
	});
});

describe('mergeTypostSpanStyling — bug #2: raw indexed alternates', () => {
	test('raw data-feature-settings survives a feature merge', () => {
		const span = makeSpan({
			'data-feature-settings': '"salt" 2',
			style: 'font-feature-settings: "salt" 2',
		});
		mergeTypostSpanStyling(span, { 'data-features': 'liga' }, 'font-feature-settings: "liga" 1');
		expect(span.getAttribute('data-feature-settings')).toBe('"salt" 2');
		expect(span.getAttribute('style')).toBe('font-feature-settings: "salt" 2, "liga" 1');
	});

	test('raw alternates survive a font apply over the span (the reported wipe)', () => {
		const span = makeSpan({
			'data-features': 'liga',
			'data-feature-settings': '"salt" 2',
			style: 'font-feature-settings: "salt" 2, "liga" 1',
		});
		mergeTypostSpanStyling(span, { 'data-font-id': '11' }, 'font-family: var(--font-11)');
		const style = span.getAttribute('style');
		expect(style).toContain('font-feature-settings: "salt" 2, "liga" 1');
		expect(style).toContain('font-family: var(--font-11)');
	});

	test('a tag already covered by the raw value is not duplicated', () => {
		const span = makeSpan({
			'data-feature-settings': '"salt" 2',
			style: 'font-feature-settings: "salt" 2',
		});
		mergeTypostSpanStyling(span, { 'data-features': 'salt' }, 'font-feature-settings: "salt" 1');
		expect(span.getAttribute('style')).toBe('font-feature-settings: "salt" 2');
	});
});

describe('mergeTypostSpanStyling — bug #3: variation settings vs font changes', () => {
	const vfAttrs = {
		'data-font-id': '4',
		'data-font-variation-settings': '"wght" 628',
		style: 'font-family: var(--font-4); font-variation-settings: "wght" 628; font-size: 20px',
	};

	test('font CHANGE removes variation attr and declaration', () => {
		const span = makeSpan(vfAttrs);
		mergeTypostSpanStyling(span, { 'data-font-id': '11' }, 'font-family: var(--font-11)');
		expect(span.getAttribute('data-font-variation-settings')).toBeNull();
		expect(span.getAttribute('style')).not.toContain('font-variation-settings');
		expect(span.getAttribute('style')).toContain('font-size: 20px');
	});

	test('SAME font re-apply keeps variation settings', () => {
		const span = makeSpan(vfAttrs);
		mergeTypostSpanStyling(span, { 'data-font-id': '4' }, 'font-family: var(--font-4)');
		expect(span.getAttribute('data-font-variation-settings')).toBe('"wght" 628');
		expect(span.getAttribute('style')).toContain('font-variation-settings: "wght" 628');
	});

	test('non-font applies keep variation settings', () => {
		const span = makeSpan(vfAttrs);
		mergeTypostSpanStyling(span, { 'data-fontweight': '700' }, 'font-weight: 700');
		expect(span.getAttribute('data-font-variation-settings')).toBe('"wght" 628');
		expect(span.getAttribute('style')).toContain('font-variation-settings: "wght" 628');
	});
});

describe('mergeTypostSpanStyling — stale legacy data-font on font changes', () => {
	const legacyAttrs = {
		'data-font': 'Old Family',
		'data-font-id': '4',
		style: 'font-family: var(--font-4)',
	};

	test('font CHANGE removes the legacy family-name attribute', () => {
		const span = makeSpan(legacyAttrs);
		mergeTypostSpanStyling(span, { 'data-font-id': '11' }, 'font-family: var(--font-11)');
		expect(span.getAttribute('data-font')).toBeNull();
		expect(span.getAttribute('data-font-id')).toBe('11');
	});

	test('SAME font re-apply keeps a still-accurate data-font', () => {
		const span = makeSpan(legacyAttrs);
		mergeTypostSpanStyling(span, { 'data-font-id': '4' }, 'font-family: var(--font-4)');
		expect(span.getAttribute('data-font')).toBe('Old Family');
	});

	test('non-font applies keep data-font (Glyphs Panel cross-font spans)', () => {
		const span = makeSpan({ 'data-font': '"Inter", sans-serif', style: 'font-family: "Inter", sans-serif' });
		mergeTypostSpanStyling(span, { 'data-lineheight': '1.5' }, 'line-height: 1.5');
		expect(span.getAttribute('data-font')).toBe('"Inter", sans-serif');
	});

	test('an explicitly passed data-font survives a font change', () => {
		const span = makeSpan(legacyAttrs);
		mergeTypostSpanStyling(span, { 'data-font': 'New Family', 'data-font-id': '11' }, 'font-family: var(--font-11)');
		expect(span.getAttribute('data-font')).toBe('New Family');
	});
});

describe('splitSpanAndApply — stale data-font in the split path', () => {
	test('font change strips data-font from the new-font segment only', () => {
		const content = '<span class="typost-styled" data-font="Old Family" data-font-id="4" style="font-family: var(--font-4)">Elegant</span>';
		const result = splitSpanAndApply(content, 2, 4, 'data-font-id',
			{ 'data-font-id': '11' }, 'font-family: var(--font-11)');
		expect(result.success).toBe(true);
		const div = document.createElement('div');
		div.innerHTML = result.content;
		const spans = div.querySelectorAll('span.typost-styled');
		expect(spans[0].getAttribute('data-font')).toBe('Old Family'); // before segment keeps old font
		expect(spans[1].getAttribute('data-font-id')).toBe('11');
		expect(spans[1].getAttribute('data-font')).toBeNull();
		expect(spans[2].getAttribute('data-font')).toBe('Old Family'); // after segment keeps old font
	});
});

describe('splitSpanAndApply — bug #3 in the split path', () => {
	test('font change on a sub-range drops variation settings only in the new-font segment', () => {
		const content = '<span class="typost-styled" data-font-id="4" data-font-variation-settings=\'"wght" 628\' style=\'font-family: var(--font-4); font-variation-settings: "wght" 628\'>Elegant</span>';
		const result = splitSpanAndApply(content, 2, 4, 'data-font-id',
			{ 'data-font-id': '11' }, 'font-family: var(--font-11)');
		expect(result.success).toBe(true);
		const doc = new DOMParser().parseFromString(`<div>${result.content}</div>`, 'text/html');
		const spans = doc.querySelectorAll('span.typost-styled');
		expect(spans).toHaveLength(3);
		// before/after keep the old font AND its axes
		expect(spans[0].getAttribute('data-font-variation-settings')).toBe('"wght" 628');
		expect(spans[2].getAttribute('data-font-variation-settings')).toBe('"wght" 628');
		// the re-fonted middle segment does not
		expect(spans[1].getAttribute('data-font-id')).toBe('11');
		expect(spans[1].getAttribute('data-font-variation-settings')).toBeNull();
		expect(spans[1].getAttribute('style')).not.toContain('font-variation-settings');
	});
});

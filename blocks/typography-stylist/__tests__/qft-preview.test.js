/**
 * Quick Feature Toggles live preview helpers (qft-preview.js, moved out of
 * edit.js in #356): the temporary preview span, the range it wraps, and the
 * cleanup that keeps it out of saved content.
 */

import { removePreviewSpans, getRangeForOffsets, applyPreviewStyles } from '../qft-preview';

function parse(html) {
	const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
	return { doc, container: doc.body.firstChild };
}

describe('removePreviewSpans', () => {
	it('unwraps preview spans and keeps their children', () => {
		expect(removePreviewSpans('Hello <span class="typost-preview-temp" style="letter-spacing: 0.05em">Beautiful <em>big</em></span> World'))
			.toBe('Hello Beautiful <em>big</em> World');
	});

	it('leaves other spans alone', () => {
		const html = 'A <span class="typost-styled" data-features="ss01">B</span> C';
		expect(removePreviewSpans(html)).toBe(html);
	});

	it('returns an empty value unchanged', () => {
		expect(removePreviewSpans('')).toBe('');
		expect(removePreviewSpans(null)).toBe(null);
		expect(removePreviewSpans(undefined)).toBe(undefined);
	});
});

describe('getRangeForOffsets', () => {
	it('covers the text between two offsets', () => {
		const { doc, container } = parse('Hello <b>Beautiful</b> World');
		const range = getRangeForOffsets(container, 6, 15, doc);
		expect(range.toString()).toBe('Beautiful');
	});

	it('counts a <br> as one character', () => {
		const { doc, container } = parse('Line1<br>Line2');
		expect(getRangeForOffsets(container, 6, 11, doc).toString()).toBe('Line2');
	});

	it('returns null past the end of the text', () => {
		const { doc, container } = parse('Short');
		expect(getRangeForOffsets(container, 10, 12, doc)).toBeNull();
	});
});

describe('applyPreviewStyles', () => {
	const base = (overrides) => ({
		content: 'Hello Beautiful World',
		selectionStart: { clientId: 'a', offset: 6 },
		selectionEnd: { clientId: 'a', offset: 15 },
		clientId: 'a',
		styles: { 'letter-spacing': '0.05em', 'line-height': null, 'font-size': '' },
		setAttributes: jest.fn(),
		originalContentRef: { current: null },
		...overrides,
	});

	it('wraps the selection in a preview span with the set styles only', () => {
		const args = base();
		expect(applyPreviewStyles(args)).toBe(true);
		expect(args.setAttributes).toHaveBeenCalledWith({
			content: 'Hello <span class="typost-preview-temp" style="letter-spacing: 0.05em;">Beautiful</span> World',
		});
		expect(args.originalContentRef.current).toBe('Hello Beautiful World');
	});

	it('previews from the original content, so spans never nest', () => {
		const args = base({
			content: 'Hello <span class="typost-preview-temp">Beautiful</span> World',
			originalContentRef: { current: 'Hello Beautiful World' },
			styles: { 'line-height': 2 },
		});
		applyPreviewStyles(args);
		expect(args.setAttributes).toHaveBeenCalledWith({
			content: 'Hello <span class="typost-preview-temp" style="line-height: 2;">Beautiful</span> World',
		});
	});

	it('does nothing without an expanded selection in this block', () => {
		[
			base({ selectionEnd: { clientId: 'a', offset: 6 } }),
			base({ selectionStart: { clientId: 'b', offset: 6 } }),
			base({ content: '' }),
			base({ selectionStart: null }),
		].forEach((args) => {
			expect(applyPreviewStyles(args)).toBe(false);
			expect(args.setAttributes).not.toHaveBeenCalled();
		});
	});

	it('fails quietly when the range cannot be wrapped', () => {
		const args = base({ content: 'He<b>llo Beau</b>tiful World', selectionStart: { clientId: 'a', offset: 3 }, selectionEnd: { clientId: 'a', offset: 12 } });
		expect(applyPreviewStyles(args)).toBe(false);
		expect(args.setAttributes).not.toHaveBeenCalled();
	});
});

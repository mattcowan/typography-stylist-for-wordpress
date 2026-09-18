/**
 * The style on the selected text, as reported to the toolbar style browser
 * (QA finding: browser scope indicator). The block's own style lives in
 * paragraphStyleId; the selection's lives in selectionParagraphStyleId and
 * is the style that COVERS the whole selection, not one that merely
 * overlaps it.
 */
import { findCoveringParagraphStyleId, buildQftEditorState } from '../utils';

describe('findCoveringParagraphStyleId', () => {
	test('reports the data-style-id of the span that exactly holds the selection', () => {
		const html = 'Typography <span class="typost-styled" data-style-id="5">Stylist</span> Block';
		expect(findCoveringParagraphStyleId(html, 11, 18)).toBe(5);
	});

	test('reports the style of a span that contains the selection with room to spare', () => {
		const html = '<span class="typost-styled" data-style-id="3">Alpha Beta Gamma</span>';
		expect(findCoveringParagraphStyleId(html, 6, 10)).toBe(3);
	});

	test('walks up from an inner span without a style to a styled ancestor', () => {
		const html = '<span class="typost-styled" data-style-id="3">Alpha <span class="typost-styled" data-fontweight="700">Beta</span></span>';
		expect(findCoveringParagraphStyleId(html, 6, 10)).toBe(3);
	});

	test('prefers the innermost containing style', () => {
		const html = '<span class="typost-styled" data-style-id="3">Alpha <span class="typost-styled" data-style-id="7">Beta</span></span>';
		expect(findCoveringParagraphStyleId(html, 6, 10)).toBe(7);
	});

	test('a style over only part of the selection is NOT the selection\'s style', () => {
		// "Alpha Beta" selected, only "Beta" is styled — the browser must not
		// press style 5 or offer to detach it
		const html = 'Alpha <span class="typost-styled" data-style-id="5">Beta</span> Gamma';
		expect(findCoveringParagraphStyleId(html, 0, 10)).toBe(0);
		// The reverse: selection starts inside the span and runs past it
		expect(findCoveringParagraphStyleId(html, 7, 12)).toBe(0);
	});

	test('is 0 for a styled span without a paragraph style', () => {
		const html = 'Alpha <span class="typost-styled" data-fontsize="48">Beta</span>';
		expect(findCoveringParagraphStyleId(html, 6, 10)).toBe(0);
	});

	test('is 0 when the selection touches no span, or for an empty range', () => {
		const html = 'Alpha <span class="typost-styled" data-style-id="5">Beta</span> Gamma';
		expect(findCoveringParagraphStyleId(html, 0, 5)).toBe(0);
		expect(findCoveringParagraphStyleId(html, 7, 7)).toBe(0);
		expect(findCoveringParagraphStyleId('', 0, 3)).toBe(0);
	});
});

describe('buildQftEditorState: selectionParagraphStyleId', () => {
	test('carries the selection style separately from the block style', () => {
		const state = buildQftEditorState({ styleClass: 'typost-ps-4', selectionStyleId: 7 });
		expect(state.paragraphStyleId).toBe(4);
		expect(state.selectionParagraphStyleId).toBe(7);
	});

	test('reports 0 when the selection carries no style, even on a styled block', () => {
		const state = buildQftEditorState({ styleClass: 'typost-ps-4' });
		expect(state.paragraphStyleId).toBe(4);
		expect(state.selectionParagraphStyleId).toBe(0);
	});
});

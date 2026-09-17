/**
 * The style on the selected text, as reported to the toolbar style browser
 * (QA finding: browser scope indicator). The block's own style lives in
 * paragraphStyleId; the selection's lives in selectionParagraphStyleId.
 */
import { parseInlineStylesAtCursor, buildQftEditorState } from '../utils';

describe('parseInlineStylesAtCursor: styleId', () => {
	test('reports the data-style-id of the span at the selection', () => {
		const html = 'Typography <span class="typost-styled" data-style-id="5">Stylist</span> Block';
		const detected = parseInlineStylesAtCursor(html, 11, 18);
		expect(detected.styleId).toBe(5);
	});

	test('inherits the style from an outer span when the inner one has none', () => {
		const html = '<span class="typost-styled" data-style-id="3">Alpha <span class="typost-styled" data-fontweight="700">Beta</span></span>';
		const detected = parseInlineStylesAtCursor(html, 6, 10);
		expect(detected.fontWeight).toBe('700');
		expect(detected.styleId).toBe(3);
	});

	test('is 0 for a styled span without a paragraph style', () => {
		const html = 'Alpha <span class="typost-styled" data-fontsize="48">Beta</span>';
		expect(parseInlineStylesAtCursor(html, 6, 10).styleId).toBe(0);
	});

	test('is 0 (null result) when the selection touches no span', () => {
		const html = 'Alpha <span class="typost-styled" data-style-id="5">Beta</span> Gamma';
		expect(parseInlineStylesAtCursor(html, 0, 5)).toBeNull();
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

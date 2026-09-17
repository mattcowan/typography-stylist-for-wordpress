/**
 * Tests for shouldSwapInsertion (GP-1).
 *
 * Swap semantics belong to browsing alternates of one character. Switching
 * to a different character must produce a plain insertion so the editor
 * places it after the glyph that only stayed selected for swapping.
 */
const { shouldSwapInsertion } = require('../assets/js/lib/insertion.js');

describe('shouldSwapInsertion', () => {
	test('never swaps from the all-glyphs view', () => {
		expect(shouldSwapInsertion({ inAlternatesView: false, altKey: null, lastAltKey: null, selectionText: 'W' })).toBe(false);
		expect(shouldSwapInsertion({ inAlternatesView: false, altKey: 'W', lastAltKey: 'W', selectionText: 'W' })).toBe(false);
	});

	test('first pick swaps when the launch selection is the browsed character', () => {
		expect(shouldSwapInsertion({ inAlternatesView: true, altKey: 'W', lastAltKey: null, selectionText: 'W' })).toBe(true);
	});

	test('first pick from a caret, or for a different character than the selection, inserts', () => {
		expect(shouldSwapInsertion({ inAlternatesView: true, altKey: '&', lastAltKey: null, selectionText: '' })).toBe(false);
		expect(shouldSwapInsertion({ inAlternatesView: true, altKey: '&', lastAltKey: null, selectionText: 'W' })).toBe(false);
	});

	test('later picks swap while the browsed character is unchanged', () => {
		expect(shouldSwapInsertion({ inAlternatesView: true, altKey: '&', lastAltKey: '&', selectionText: '' })).toBe(true);
		expect(shouldSwapInsertion({ inAlternatesView: true, altKey: 'Th', lastAltKey: 'Th', selectionText: 'Th' })).toBe(true);
	});

	test('the QA scenario: "&" then a swash "W" must insert, not swap', () => {
		expect(shouldSwapInsertion({ inAlternatesView: true, altKey: 'W', lastAltKey: '&', selectionText: '' })).toBe(false);
	});

	test('an empty browsed character never swaps', () => {
		expect(shouldSwapInsertion({ inAlternatesView: true, altKey: '', lastAltKey: null, selectionText: '' })).toBe(false);
		expect(shouldSwapInsertion(null)).toBe(false);
	});
});

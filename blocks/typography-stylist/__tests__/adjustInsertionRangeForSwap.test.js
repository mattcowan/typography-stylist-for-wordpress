/**
 * Tests for adjustInsertionRangeForSwap (GP-1).
 *
 * Scenario from the QA run: heading "Seq", caret at end, Glyphs panel,
 * "&" base glyph inserted, then the alternates field changed to "W" and a
 * swash W inserted — the "&" was replaced instead of the W being appended.
 */
import { adjustInsertionRangeForSwap } from '../utils';

describe('adjustInsertionRangeForSwap', () => {
	const afterAmp = { start: 3, end: 4, text: '&', swap: true }; // "Seq&" with & still selected

	test('a different character after a swapped glyph goes after it, not over it', () => {
		expect(adjustInsertionRangeForSwap({ start: 3, end: 4 }, afterAmp, false, 'Seq&')).toEqual({ start: 4, end: 4 });
	});

	test('another alternate of the same glyph still replaces it', () => {
		expect(adjustInsertionRangeForSwap({ start: 3, end: 4 }, afterAmp, true, 'Seq&')).toEqual({ start: 3, end: 4 });
	});

	test('an alternate picked right after a caret insertion replaces the glyph just inserted', () => {
		const sequenceInsert = { start: 3, end: 4, text: '&', swap: false }; // caret collapsed at 4
		expect(adjustInsertionRangeForSwap({ start: 4, end: 4 }, sequenceInsert, true, 'Seq&')).toEqual({ start: 3, end: 4 });
	});

	test('a sequence insertion at the collapsed caret is untouched', () => {
		const sequenceInsert = { start: 3, end: 4, text: '&', swap: false };
		expect(adjustInsertionRangeForSwap({ start: 4, end: 4 }, sequenceInsert, false, 'Seq&')).toEqual({ start: 4, end: 4 });
	});

	test('the record is ignored once the text moved on', () => {
		// The author typed after the glyph: "Seq&x" — the recorded range no longer holds "&".
		expect(adjustInsertionRangeForSwap({ start: 5, end: 5 }, { start: 4, end: 5, text: '&', swap: true }, true, 'Seq&x')).toEqual({ start: 5, end: 5 });
		// Same offsets but different text (content was edited elsewhere)
		expect(adjustInsertionRangeForSwap({ start: 3, end: 4 }, afterAmp, false, 'SeqW')).toEqual({ start: 3, end: 4 });
	});

	test('a selection elsewhere is never touched', () => {
		expect(adjustInsertionRangeForSwap({ start: 0, end: 1 }, afterAmp, false, 'Seq&')).toEqual({ start: 0, end: 1 });
		expect(adjustInsertionRangeForSwap({ start: 1, end: 1 }, afterAmp, true, 'Seq&')).toEqual({ start: 1, end: 1 });
	});

	test('no record means no change', () => {
		expect(adjustInsertionRangeForSwap({ start: 2, end: 5 }, null, true, 'Seq&')).toEqual({ start: 2, end: 5 });
		expect(adjustInsertionRangeForSwap({ start: 2, end: 5 }, {}, false, 'Seq&')).toEqual({ start: 2, end: 5 });
	});
});

/**
 * countInlineParagraphStyleConflicts — the inline editor's "ask before a
 * paragraph style replaces the selection's own styling" check (PS-2). Works
 * on RichText formats, where applying the typost format over a range drops
 * whatever the same-type format held on those characters.
 */
import { countInlineParagraphStyleConflicts } from '../utils';

const TYPE = 'typost/features';

// Build a formats array for `length` characters, applying `attributes` to
// the characters in [from, to).
function formats(length, ranges) {
	const out = [];
	for (let i = 0; i < length; i++) {
		const hit = ranges.find((r) => i >= r.from && i < r.to);
		out.push(hit ? [{ type: TYPE, attributes: hit.attributes }] : undefined);
	}
	return out;
}

describe('countInlineParagraphStyleConflicts', () => {
	test('plain text has no conflicts', () => {
		expect(countInlineParagraphStyleConflicts(formats(10, []), 0, 10, TYPE)).toBe(0);
	});

	test('a run with its own size and features inside the selection is a conflict', () => {
		// "Alpha <span data-fontsize=48 data-features=swsh>Beta</span> Gamma", select all
		const f = formats(16, [{ from: 6, to: 10, attributes: { 'data-fontsize': '48', 'data-features': 'swsh' } }]);
		expect(countInlineParagraphStyleConflicts(f, 0, 16, TYPE)).toBe(1);
	});

	test('a selection that stops short of the styled run has no conflict', () => {
		const f = formats(16, [{ from: 6, to: 10, attributes: { 'data-fontsize': '48' } }]);
		expect(countInlineParagraphStyleConflicts(f, 0, 5, TYPE)).toBe(0);
	});

	test('a run that only carries a paragraph style is not a conflict', () => {
		const f = formats(10, [{ from: 0, to: 10, attributes: { 'data-style-id': '5' } }]);
		expect(countInlineParagraphStyleConflicts(f, 0, 10, TYPE)).toBe(0);
	});

	test('glyph-level raw alternates and fit scale are not conflicts', () => {
		const f = formats(10, [
			{ from: 0, to: 3, attributes: { 'data-feature-settings': '"salt" 2' } },
			{ from: 5, to: 8, attributes: { 'data-fitscale': '0.6' } },
		]);
		expect(countInlineParagraphStyleConflicts(f, 0, 10, TYPE)).toBe(0);
	});

	test('counts each distinct styled run once', () => {
		const f = formats(20, [
			{ from: 0, to: 5, attributes: { 'data-font-id': '36' } },
			{ from: 5, to: 10, attributes: { 'data-fontweight': '700' } },
			{ from: 12, to: 18, attributes: { 'data-style-id': '2' } },
		]);
		expect(countInlineParagraphStyleConflicts(f, 0, 20, TYPE)).toBe(2);
	});

	test('a legacy run with only a style attribute counts when it sets a style-owned property', () => {
		const f = formats(10, [{ from: 0, to: 10, attributes: { style: 'font-weight: 700' } }]);
		expect(countInlineParagraphStyleConflicts(f, 0, 10, TYPE)).toBe(1);
		const other = formats(10, [{ from: 0, to: 10, attributes: { style: 'color: red' } }]);
		expect(countInlineParagraphStyleConflicts(other, 0, 10, TYPE)).toBe(0);
	});

	test('the legacy matcher tolerates whitespace and a preceding declaration', () => {
		// These only match when the \s in the pattern is a real whitespace
		// class, not the letter "s" (review of PR #193)
		const spaced = formats(10, [{ from: 0, to: 10, attributes: { style: 'font-weight : 700' } }]);
		expect(countInlineParagraphStyleConflicts(spaced, 0, 10, TYPE)).toBe(1);
		const second = formats(10, [{ from: 0, to: 10, attributes: { style: 'color: red; font-weight: 700' } }]);
		expect(countInlineParagraphStyleConflicts(second, 0, 10, TYPE)).toBe(1);
		const inWord = formats(10, [{ from: 0, to: 10, attributes: { style: 'xfont-weight: 700' } }]);
		expect(countInlineParagraphStyleConflicts(inWord, 0, 10, TYPE)).toBe(0);
	});

	test('is 0 for an empty or inverted range', () => {
		const f = formats(10, [{ from: 0, to: 10, attributes: { 'data-fontsize': '48' } }]);
		expect(countInlineParagraphStyleConflicts(f, 4, 4, TYPE)).toBe(0);
		expect(countInlineParagraphStyleConflicts(f, 6, 2, TYPE)).toBe(0);
	});
});

/**
 * Tests for resolveQftInsertionRange()
 *
 * Resolves the target text range for extension-driven content insertion
 * (typost-insert-content event) in the Typography Stylist block.
 */

import { resolveQftInsertionRange } from '../utils';

describe('resolveQftInsertionRange', () => {
	const CLIENT_ID = 'block-abc';
	const TEXT_LENGTH = 20;

	describe('capturedSelection priority', () => {
		test('uses capturedSelection when present', () => {
			const result = resolveQftInsertionRange(
				{ start: 3, end: 7 },
				{ clientId: CLIENT_ID, offset: 1 },
				{ clientId: CLIENT_ID, offset: 2 },
				CLIENT_ID,
				TEXT_LENGTH
			);
			expect(result).toEqual({ start: 3, end: 7 });
		});

		test('uses collapsed capturedSelection (caret position)', () => {
			const result = resolveQftInsertionRange(
				{ start: 5, end: 5 },
				null,
				null,
				CLIENT_ID,
				TEXT_LENGTH
			);
			expect(result).toEqual({ start: 5, end: 5 });
		});

		test('ignores capturedSelection with non-numeric offsets', () => {
			const result = resolveQftInsertionRange(
				{ start: null, end: undefined },
				{ clientId: CLIENT_ID, offset: 4 },
				{ clientId: CLIENT_ID, offset: 9 },
				CLIENT_ID,
				TEXT_LENGTH
			);
			expect(result).toEqual({ start: 4, end: 9 });
		});
	});

	describe('block editor selection fallback', () => {
		test('uses block selection when capturedSelection is null', () => {
			const result = resolveQftInsertionRange(
				null,
				{ clientId: CLIENT_ID, offset: 2 },
				{ clientId: CLIENT_ID, offset: 8 },
				CLIENT_ID,
				TEXT_LENGTH
			);
			expect(result).toEqual({ start: 2, end: 8 });
		});

		test('ignores selection belonging to a different block', () => {
			const result = resolveQftInsertionRange(
				null,
				{ clientId: 'other-block', offset: 2 },
				{ clientId: 'other-block', offset: 8 },
				CLIENT_ID,
				TEXT_LENGTH
			);
			expect(result).toEqual({ start: TEXT_LENGTH, end: TEXT_LENGTH });
		});

		test('treats missing offset as 0', () => {
			const result = resolveQftInsertionRange(
				null,
				{ clientId: CLIENT_ID },
				{ clientId: CLIENT_ID },
				CLIENT_ID,
				TEXT_LENGTH
			);
			expect(result).toEqual({ start: 0, end: 0 });
		});
	});

	describe('append fallback', () => {
		test('appends at end when no selection information exists', () => {
			const result = resolveQftInsertionRange(null, null, null, CLIENT_ID, TEXT_LENGTH);
			expect(result).toEqual({ start: TEXT_LENGTH, end: TEXT_LENGTH });
		});

		test('appends at 0 for empty content', () => {
			const result = resolveQftInsertionRange(null, null, null, CLIENT_ID, 0);
			expect(result).toEqual({ start: 0, end: 0 });
		});
	});

	describe('clamping and normalization', () => {
		test('clamps offsets exceeding text length (stale captured selection)', () => {
			const result = resolveQftInsertionRange(
				{ start: 15, end: 99 },
				null,
				null,
				CLIENT_ID,
				TEXT_LENGTH
			);
			expect(result).toEqual({ start: 15, end: TEXT_LENGTH });
		});

		test('clamps negative offsets to 0', () => {
			const result = resolveQftInsertionRange(
				{ start: -5, end: 4 },
				null,
				null,
				CLIENT_ID,
				TEXT_LENGTH
			);
			expect(result).toEqual({ start: 0, end: 4 });
		});

		test('swaps reversed offsets so start <= end', () => {
			const result = resolveQftInsertionRange(
				{ start: 9, end: 3 },
				null,
				null,
				CLIENT_ID,
				TEXT_LENGTH
			);
			expect(result).toEqual({ start: 3, end: 9 });
		});

		test('coerces non-finite offsets to 0', () => {
			const result = resolveQftInsertionRange(
				{ start: NaN, end: Infinity },
				null,
				null,
				CLIENT_ID,
				TEXT_LENGTH
			);
			// Non-finite values are coerced to 0 before clamping
			expect(result).toEqual({ start: 0, end: 0 });
		});
	});
});

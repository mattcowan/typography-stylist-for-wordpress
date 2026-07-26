/**
 * Tests for resolveQftApplyRange() — the shared selection resolver for QFT
 * property applies. Live expanded selection wins; the selection captured at
 * popover open covers the focus-loss case; a live caret preserves the
 * in-place-update paths; anything else resolves to null so block-level
 * fallbacks are an explicit decision, never an accident.
 */

import { resolveQftApplyRange } from '../utils';

const BLOCK = 'block-a';
const OTHER = 'block-b';
const sel = (clientId, offset) => ({ clientId, offset });

describe('resolveQftApplyRange', () => {
	test('live expanded selection in this block wins over captured', () => {
		expect(resolveQftApplyRange(sel(BLOCK, 2), sel(BLOCK, 5), BLOCK, { start: 0, end: 7 }))
			.toEqual({ start: 2, end: 5 });
	});

	test('collapsed live selection + expanded captured -> captured (popover focus loss)', () => {
		expect(resolveQftApplyRange(sel(BLOCK, 3), sel(BLOCK, 3), BLOCK, { start: 0, end: 7 }))
			.toEqual({ start: 0, end: 7 });
	});

	test('caret with no captured selection -> collapsed live range', () => {
		expect(resolveQftApplyRange(sel(BLOCK, 3), sel(BLOCK, 3), BLOCK, null))
			.toEqual({ start: 3, end: 3 });
	});

	test('selection in another block + captured -> captured', () => {
		expect(resolveQftApplyRange(sel(OTHER, 1), sel(OTHER, 4), BLOCK, { start: 2, end: 6 }))
			.toEqual({ start: 2, end: 6 });
	});

	test('selection in another block + nothing captured -> null', () => {
		expect(resolveQftApplyRange(sel(OTHER, 1), sel(OTHER, 4), BLOCK, null)).toBeNull();
	});

	test('no selection info at all -> null', () => {
		expect(resolveQftApplyRange(null, null, BLOCK, null)).toBeNull();
	});

	test('collapsed captured selection does not qualify', () => {
		expect(resolveQftApplyRange(null, null, BLOCK, { start: 4, end: 4 })).toBeNull();
	});

	test('reversed ranges normalize (live and captured)', () => {
		expect(resolveQftApplyRange(sel(BLOCK, 5), sel(BLOCK, 2), BLOCK, null))
			.toEqual({ start: 2, end: 5 });
		expect(resolveQftApplyRange(null, null, BLOCK, { start: 6, end: 2 }))
			.toEqual({ start: 2, end: 6 });
	});

	test('missing offsets default to 0 (live caret at block start)', () => {
		expect(resolveQftApplyRange({ clientId: BLOCK }, { clientId: BLOCK }, BLOCK, null))
			.toEqual({ start: 0, end: 0 });
	});
});

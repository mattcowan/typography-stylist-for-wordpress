/**
 * Tests for resolveBlockFontFamilyStyle utility.
 *
 * The editor preview and the fit-measurement node must resolve the block font
 * exactly like save.js does: fontId wins and emits the CSS variable, the
 * fontFamily string is the fallback. Before this helper existed, edit.js gated
 * both paths on the fontFamily STRING attribute, so a block carrying only
 * fontId (e.g. authored programmatically) rendered in the theme's inherited
 * font in the editor while the frontend was correct — and worse, fit
 * measurement in the editor would measure the wrong font's advance widths.
 */
import { resolveBlockFontFamilyStyle } from '../utils';

describe('resolveBlockFontFamilyStyle', () => {
	test('fontId alone resolves to the CSS variable (the bug case)', () => {
		expect(resolveBlockFontFamilyStyle(105, '')).toBe('var(--font-105)');
	});

	test('fontId wins over fontFamily, matching save.js', () => {
		expect(resolveBlockFontFamilyStyle(78, 'trajan-pro-3')).toBe('var(--font-78)');
	});

	test('fontFamily string alone falls back to the literal family', () => {
		expect(resolveBlockFontFamilyStyle(0, 'gratitude-smooth-script-pro')).toBe('gratitude-smooth-script-pro');
	});

	test('neither set resolves to empty string', () => {
		expect(resolveBlockFontFamilyStyle(0, '')).toBe('');
	});

	test('undefined attributes resolve to empty string', () => {
		expect(resolveBlockFontFamilyStyle(undefined, undefined)).toBe('');
	});

	test('numeric-string fontId still emits the variable', () => {
		expect(resolveBlockFontFamilyStyle('42', '')).toBe('var(--font-42)');
	});
});

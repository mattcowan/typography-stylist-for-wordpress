/**
 * Tests for the canonical style-string helpers (parseStyleString /
 * buildStyleString) — the shared parser behind every span styling operation
 * (see todo/refactor-style-string-helpers.md).
 */

import { parseStyleString, buildStyleString } from '../utils';

describe('parseStyleString', () => {
	test('parses single and multiple properties', () => {
		expect(parseStyleString('font-size: 20px')).toEqual({ 'font-size': '20px' });
		expect(parseStyleString('font-size: 20px; font-weight: 700')).toEqual({
			'font-size': '20px',
			'font-weight': '700',
		});
	});

	test('whitespace and trailing-semicolon tolerance', () => {
		expect(parseStyleString('font-size:20px')).toEqual({ 'font-size': '20px' });
		expect(parseStyleString('  font-size :  20px ; ')).toEqual({ 'font-size': '20px' });
	});

	test('font-feature-settings with multiple features and indexed alternates', () => {
		expect(parseStyleString('font-feature-settings: "ss01" 1, "ss02" 1')).toEqual({
			'font-feature-settings': '"ss01" 1, "ss02" 1',
		});
		expect(parseStyleString('font-feature-settings: "salt" 2, "liga" 1')).toEqual({
			'font-feature-settings': '"salt" 2, "liga" 1',
		});
	});

	test('CSS variables and clamp() values survive', () => {
		expect(parseStyleString('font-family: var(--font-12)')).toEqual({
			'font-family': 'var(--font-12)',
		});
		expect(parseStyleString('font-size: clamp(16px, 1.5rem + 2vw, 64px)')).toEqual({
			'font-size': 'clamp(16px, 1.5rem + 2vw, 64px)',
		});
	});

	test('splits on the FIRST colon only (multi-colon values intact)', () => {
		expect(parseStyleString('--x: a:b')).toEqual({ '--x': 'a:b' });
		expect(parseStyleString('background-image: url(data:image/png)')).toEqual({
			'background-image': 'url(data:image/png)',
		});
	});

	test('semicolons INSIDE values truncate (documented limitation)', () => {
		// Declarations split on ';' before colon handling — a semicolon inside
		// a value ends the declaration early. Shared by every prior inline
		// parser; plugin-generated values never contain semicolons.
		expect(parseStyleString('background-image: url(data:image/png;base64x)')['background-image'])
			.toBe('url(data:image/png');
	});

	test('lowercases property names', () => {
		expect(parseStyleString('Font-Size: 20px')).toEqual({ 'font-size': '20px' });
	});

	test('duplicate properties collapse to last value at first position', () => {
		const parsed = parseStyleString('font-size: 20px; color: red; font-size: 30px');
		expect(parsed).toEqual({ 'font-size': '30px', color: 'red' });
		expect(Object.keys(parsed)).toEqual(['font-size', 'color']);
	});

	test('empty, null, and malformed input', () => {
		expect(parseStyleString('')).toEqual({});
		expect(parseStyleString(null)).toEqual({});
		expect(parseStyleString(undefined)).toEqual({});
		expect(parseStyleString('nonsense')).toEqual({});
		expect(parseStyleString(': orphan-value')).toEqual({});
		expect(parseStyleString('prop-no-value:')).toEqual({});
	});

	test('returns all properties without filtering (removal is caller-side)', () => {
		const parsed = parseStyleString('font-size: 20px; font-feature-settings: "liga" 1');
		expect(Object.keys(parsed)).toHaveLength(2);
	});
});

describe('buildStyleString', () => {
	test('builds single and multiple properties', () => {
		expect(buildStyleString({ 'font-size': '20px' })).toBe('font-size: 20px');
		expect(buildStyleString({ 'font-size': '20px', 'font-weight': '700' }))
			.toBe('font-size: 20px; font-weight: 700');
	});

	test('empty object and null', () => {
		expect(buildStyleString({})).toBe('');
		expect(buildStyleString(null)).toBe('');
	});

	test('round-trips a full Typography Stylist style string', () => {
		const style = 'font-feature-settings: "salt" 2, "liga" 1; font-family: var(--font-11); font-size: clamp(35px, 4.9375rem + 6.0625vw, 132px); letter-spacing: 0.002em';
		expect(buildStyleString(parseStyleString(style))).toBe(style);
	});
});

/**
 * Test Suite: Screen Reader Class control
 *
 * The Accessibility panel offers three bundled classes plus "Custom". The
 * custom text field used to render only while the attribute was the literal
 * 'custom' and wrote what was typed into that same attribute, so the field
 * disappeared after the first keystroke. The select state is now derived from
 * the stored class instead.
 */

import { SCREEN_READER_CLASS_PRESETS, resolveScreenReaderClassControl, screenReaderClassForSelect } from '../utils';

describe('resolveScreenReaderClassControl', () => {
	test('a bundled class selects itself and hides the custom field', () => {
		SCREEN_READER_CLASS_PRESETS.forEach((preset) => {
			expect(resolveScreenReaderClassControl(preset)).toEqual({ selectValue: preset, isCustom: false, customValue: '' });
		});
	});

	test('a class the author typed keeps the custom field open', () => {
		expect(resolveScreenReaderClassControl('m')).toEqual({ selectValue: 'custom', isCustom: true, customValue: 'm' });
		expect(resolveScreenReaderClassControl('my-sr-class')).toEqual({ selectValue: 'custom', isCustom: true, customValue: 'my-sr-class' });
	});

	test('an empty value (Custom chosen, nothing typed yet) shows the custom field empty', () => {
		expect(resolveScreenReaderClassControl('')).toEqual({ selectValue: 'custom', isCustom: true, customValue: '' });
	});

	test('a block saved with the old literal "custom" shows the custom field empty', () => {
		expect(resolveScreenReaderClassControl('custom')).toEqual({ selectValue: 'custom', isCustom: true, customValue: '' });
	});

	test('undefined or null falls back to the block default', () => {
		expect(resolveScreenReaderClassControl(undefined)).toEqual({ selectValue: 'visually-hidden', isCustom: false, customValue: '' });
		expect(resolveScreenReaderClassControl(null)).toEqual({ selectValue: 'visually-hidden', isCustom: false, customValue: '' });
	});
});

describe('resolveScreenReaderClassControl in custom mode', () => {
	test('typing a custom class that starts with a bundled name keeps the custom field open', () => {
		// Typing "sr-only-wide" passes through "sr-only" one keystroke before the end.
		expect(resolveScreenReaderClassControl('sr-only', true)).toEqual({ selectValue: 'custom', isCustom: true, customValue: 'sr-only' });
		expect(resolveScreenReaderClassControl('sr-only-wide', true)).toEqual({ selectValue: 'custom', isCustom: true, customValue: 'sr-only-wide' });
	});

	test('custom mode still reads the old literal "custom" as an empty name', () => {
		expect(resolveScreenReaderClassControl('custom', true)).toEqual({ selectValue: 'custom', isCustom: true, customValue: '' });
		expect(resolveScreenReaderClassControl(undefined, true)).toEqual({ selectValue: 'custom', isCustom: true, customValue: '' });
	});
});

describe('screenReaderClassForSelect', () => {
	test('choosing a bundled class stores it', () => {
		expect(screenReaderClassForSelect('sr-only')).toBe('sr-only');
	});

	test('choosing Custom stores an empty class so save() falls back to visually-hidden until a name is typed', () => {
		expect(screenReaderClassForSelect('custom')).toBe('');
	});
});

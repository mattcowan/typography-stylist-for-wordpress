/**
 * Tests for the shared searchable font picker (assets/js/font-picker.js)
 * used by both the inline editor and the Typography Stylist block.
 */

const {
	buildComboboxProps,
	buildSelectProps,
	normalizeFontPickerValue,
} = require('../../../assets/js/font-picker.js');

// Shape produced by buildFontOptions() — note the source prefix emoji, which
// is what made native <select> type-ahead useless and motivated the combobox.
const OPTIONS = [
	{ label: '📁 Fraunces', value: '36', fontFamily: 'Fraunces', fontId: 36 },
	{ label: '🅰️ bookmania', value: '1', fontFamily: 'bookmania', fontId: 1 },
	{ label: '🌐 Inter', value: 'wp:inter', fontFamily: 'Inter', fontId: 0 },
];

describe('normalizeFontPickerValue', () => {
	test('maps the combobox reset (null) to the empty string', () => {
		expect(normalizeFontPickerValue(null)).toBe('');
	});

	test('maps undefined and false to the empty string', () => {
		expect(normalizeFontPickerValue(undefined)).toBe('');
		expect(normalizeFontPickerValue(false)).toBe('');
	});

	test('passes a font ID through as a string', () => {
		expect(normalizeFontPickerValue('36')).toBe('36');
		expect(normalizeFontPickerValue(36)).toBe('36');
	});

	test('passes a WP Font Library value through unchanged', () => {
		expect(normalizeFontPickerValue('wp:inter')).toBe('wp:inter');
	});

	test('does not mangle a font ID of zero', () => {
		// 0 is falsy but is a real value the caller should see, unlike a reset
		expect(normalizeFontPickerValue(0)).toBe('0');
	});
});

describe('buildComboboxProps', () => {
	const base = {
		label: 'Font Family',
		placeholder: '(Default)',
		options: OPTIONS,
		onChange: () => {},
	};

	test('offers the font options without a synthetic empty entry', () => {
		// The placeholder is the input's, not a selectable option — an option
		// with an empty value could never match ComboboxControl's lookup.
		const props = buildComboboxProps({ ...base, value: '36' });
		expect(props.options).toEqual(OPTIONS);
		expect(props.options.some((option) => option.value === '')).toBe(false);
		expect(props.placeholder).toBe('(Default)');
	});

	test('passes the current value through as a string', () => {
		expect(buildComboboxProps({ ...base, value: '36' }).value).toBe('36');
		expect(buildComboboxProps({ ...base, value: 36 }).value).toBe('36');
	});

	test('uses null rather than empty string for "no font selected"', () => {
		// ComboboxControl finds the current option by strict equality, so ''
		// would leave a stale label showing instead of the placeholder.
		expect(buildComboboxProps({ ...base, value: '' }).value).toBeNull();
	});

	test('always supplies an accessible name, visible or not', () => {
		const visible = buildComboboxProps({ ...base, value: '' });
		expect(visible.label).toBe('Font Family');
		expect(visible.hideLabelFromVision).toBe(false);

		const hidden = buildComboboxProps({ ...base, value: '', hideLabelFromVision: true });
		expect(hidden.label).toBe('Font Family');
		expect(hidden.hideLabelFromVision).toBe(true);
	});

	test('keeps the reset affordance, which is how a font is cleared', () => {
		expect(buildComboboxProps({ ...base, value: '36' }).allowReset).toBe(true);
	});

	test('normalizes the reset before handing it to the consumer', () => {
		const seen = [];
		const props = buildComboboxProps({
			...base,
			value: '36',
			onChange: (value) => seen.push(value),
		});

		props.onChange(null);
		props.onChange('1');

		expect(seen).toEqual(['', '1']);
	});
});

describe('buildSelectProps (fallback where ComboboxControl is unavailable)', () => {
	const base = {
		label: 'Font Family',
		placeholder: '(Default)',
		options: OPTIONS,
		onChange: () => {},
	};

	test('restores the placeholder as the empty option', () => {
		const props = buildSelectProps({ ...base, value: '' });
		expect(props.options[0]).toEqual({ label: '(Default)', value: '' });
		expect(props.options.slice(1)).toEqual(OPTIONS);
	});

	test('uses the empty string for "no font", as a native select needs', () => {
		expect(buildSelectProps({ ...base, value: '' }).value).toBe('');
		expect(buildSelectProps({ ...base, value: '36' }).value).toBe('36');
	});

	test('normalizes its value the same way the combobox does', () => {
		const seen = [];
		const props = buildSelectProps({ ...base, value: '', onChange: (v) => seen.push(v) });

		props.onChange(null);
		props.onChange('36');

		expect(seen).toEqual(['', '36']);
	});
});

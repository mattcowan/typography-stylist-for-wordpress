/**
 * The admin Edit form's text color and outline fields (#215): fill from a
 * stored style, read back, validate, build the PATCH body, and the contrast
 * notice (WCAG 1.4.3). The fixture mirrors the color fieldset of the
 * <template> in includes/admin-tab.php (ParagraphStylesAdminEditFormTest
 * checks the template carries the same data-field names).
 *
 * @jest-environment jsdom
 */

const {
	fillEditForm,
	readEditForm,
	validateEditValues,
	buildEditPayload,
	updateColorFields,
	applyColorPicker,
	contrastMessage,
} = require('../assets/js/admin.js');

const PALETTE = [
	{ slug: 'accent-1', name: 'Accent', color: '#cc0000', origin: 'theme' },
	{ slug: 'pale', name: 'Pale', color: '#eeeeee', origin: 'theme' },
	{ slug: 'base', name: 'Base', color: '#ffffff', origin: 'theme' },
];

function paletteOptions() {
	return PALETTE.map((e) => `<option value="preset:${e.slug}">${e.name}</option>`).join('');
}

function buildForm() {
	const form = document.createElement('form');
	form.innerHTML = `
		<input type="text" data-field="name" />
		<select data-field="sizeMode"><option value="inherit">Default</option><option value="fixed">Fixed</option></select>
		<input type="number" data-field="fontSize" />
		<select data-field="fontWeight"><option value="">Default</option><option value="700">700</option></select>
		<span data-swatch-for="textColor"></span>
		<select data-field="textColor" aria-describedby="text-color-help">
			<option value="">Default</option>${paletteOptions()}<option value="custom">Custom</option><option value="transparent">Transparent</option>
		</select>
		<p data-show-for-color="textColor"><input type="text" data-field="textColorCustom" /><input type="color" data-color-picker-for="textColorCustom" /></p>
		<input type="number" data-field="textStrokeWidth" />
		<span data-swatch-for="textStrokeColor"></span>
		<select data-field="textStrokeColor">
			<option value="">Same as the text</option>${paletteOptions()}<option value="custom">Custom</option>
		</select>
		<p data-show-for-color="textStrokeColor"><input type="text" data-field="textStrokeColorCustom" /><input type="color" data-color-picker-for="textStrokeColorCustom" /></p>
		<select data-field="textStrokePosition"><option value="">On top</option><option value="behind">Behind</option></select>
		<p class="typost-ps-edit-contrast" id="contrast" role="status"></p>
	`;
	document.body.appendChild(form);
	return form;
}

const field = (form, name) => form.querySelector(`[data-field="${name}"]`);

beforeEach(() => {
	document.body.innerHTML = '';
	global.typostPSAdmin = { palette: PALETTE, themeColors: { background: '#ffffff', text: '#111111' } };
});

afterAll(() => {
	delete global.typostPSAdmin;
});

describe('fill and read', () => {
	test('a palette color selects its palette entry and saves with the palette\'s color as the fallback', () => {
		const form = buildForm();
		fillEditForm(form, { id: 1, name: 'Kicker', properties: { textColor: 'var:preset|color|accent-1|#990000' } }, '', 'rem', []);
		expect(field(form, 'textColor').value).toBe('preset:accent-1');
		expect(readEditForm(form).textColor).toBe('var:preset|color|accent-1|#cc0000');
	});

	test('a slug the palette no longer has is offered and kept with its own fallback', () => {
		const form = buildForm();
		fillEditForm(form, { id: 1, name: 'Kicker', properties: { textColor: 'var:preset|color|gone|#123456' } }, '', 'rem', []);
		const select = field(form, 'textColor');
		expect(select.value).toBe('preset:gone');
		expect(select.selectedOptions[0].textContent).toBe('gone (not in the theme palette)');
		expect(readEditForm(form).textColor).toBe('var:preset|color|gone|#123456');
	});

	test('a custom color fills the hex field and the picker (without its alpha)', () => {
		const form = buildForm();
		fillEditForm(form, { id: 1, name: 'Tint', properties: { textColor: '#cc000080' } }, '', 'rem', []);
		expect(field(form, 'textColor').value).toBe('custom');
		expect(field(form, 'textColorCustom').value).toBe('#cc000080');
		expect(form.querySelector('[data-color-picker-for="textColorCustom"]').value).toBe('#cc0000');
		expect(form.querySelector('[data-show-for-color="textColor"]').hidden).toBe(false);
		expect(form.querySelector('[data-show-for-color="textStrokeColor"]').hidden).toBe(true);
	});

	test('the picker keeps the hex field\'s alpha digits', () => {
		const form = buildForm();
		field(form, 'textColorCustom').value = '#cc000080';
		const picker = form.querySelector('[data-color-picker-for="textColorCustom"]');
		picker.value = '#336699';
		applyColorPicker(picker);
		expect(field(form, 'textColorCustom').value).toBe('#33669980');
	});

	test('outline-only text round-trips', () => {
		const form = buildForm();
		const props = { textColor: 'transparent', textStrokeWidth: 2, textStrokeColor: 'var:preset|color|accent-1|#cc0000', textStrokePosition: 'behind' };
		fillEditForm(form, { id: 1, name: 'Display outline', properties: props }, '', 'rem', []);
		const values = readEditForm(form);
		expect(values.textColor).toBe('transparent');
		expect(values.textStrokeWidth).toBe(2);
		expect(values.textStrokeColor).toBe('var:preset|color|accent-1|#cc0000');
		expect(values.textStrokePosition).toBe('behind');
	});

	test('swatches show the chosen colors', () => {
		const form = buildForm();
		fillEditForm(form, { id: 1, name: 'Kicker', properties: { textColor: 'var:preset|color|accent-1|#cc0000' } }, '', 'rem', []);
		expect(form.querySelector('[data-swatch-for="textColor"]').style.background).toBe('rgb(204, 0, 0)');
		expect(form.querySelector('[data-swatch-for="textStrokeColor"]').classList.contains('is-empty')).toBe(true);
	});
});

describe('save', () => {
	test('an untouched form sends no properties, also when the palette color changed since', () => {
		const form = buildForm();
		const style = { id: 1, name: 'Kicker', properties: { textColor: 'var:preset|color|accent-1|#990000' } };
		fillEditForm(form, style, '', 'rem', []);
		const baseline = readEditForm(form);
		expect(buildEditPayload(readEditForm(form), baseline, style, 'rem', [])).toEqual({ name: 'Kicker' });
	});

	test('a new color and outline are saved', () => {
		const form = buildForm();
		const style = { id: 1, name: 'Display', properties: { fontWeight: '700' } };
		fillEditForm(form, style, '', 'rem', []);
		const baseline = readEditForm(form);
		field(form, 'textColor').value = 'transparent';
		field(form, 'textStrokeWidth').value = '2';
		field(form, 'textStrokeColor').value = 'custom';
		field(form, 'textStrokeColorCustom').value = '#000';
		field(form, 'textStrokePosition').value = 'behind';
		expect(buildEditPayload(readEditForm(form), baseline, style, 'rem', []).properties).toEqual({
			fontWeight: '700', textColor: 'transparent', textStrokeWidth: 2, textStrokeColor: '#000000', textStrokePosition: 'behind',
		});
	});

	test('Default and 0 remove the color and the outline', () => {
		const form = buildForm();
		const style = { id: 1, name: 'Display', properties: { textColor: '#336699', textStrokeWidth: 1 } };
		fillEditForm(form, style, '', 'rem', []);
		const baseline = readEditForm(form);
		field(form, 'textColor').value = '';
		field(form, 'textStrokeWidth').value = '0';
		expect(buildEditPayload(readEditForm(form), baseline, style, 'rem', []).properties).toEqual({});
	});

	test('a form without the color fields keeps the stored color', () => {
		const form = document.createElement('form');
		form.innerHTML = '<input type="text" data-field="name" /><select data-field="fontWeight"><option value="">Default</option><option value="700">700</option></select>';
		const style = { id: 1, name: 'Kicker', properties: { textColor: '#336699' } };
		fillEditForm(form, style, '', 'rem', []);
		const baseline = readEditForm(form);
		field(form, 'fontWeight').value = '700';
		expect(buildEditPayload(readEditForm(form), baseline, style, 'rem', []).properties).toEqual({ fontWeight: '700', textColor: '#336699' });
	});
});

describe('validation', () => {
	test('an invalid custom color names its field', () => {
		const form = buildForm();
		fillEditForm(form, { id: 1, name: 'X', properties: {} }, '', 'rem', []);
		field(form, 'textColor').value = 'custom';
		field(form, 'textColorCustom').value = 'red';
		expect(validateEditValues(readEditForm(form), {}).field).toBe('textColorCustom');
	});

	test('transparent text needs an outline with its own color', () => {
		const form = buildForm();
		fillEditForm(form, { id: 1, name: 'X', properties: {} }, '', 'rem', []);
		field(form, 'textColor').value = 'transparent';
		expect(validateEditValues(readEditForm(form), {}).field).toBe('textColor');
		field(form, 'textStrokeWidth').value = '2';
		expect(validateEditValues(readEditForm(form), {}).field).toBe('textColor');
		field(form, 'textStrokeColor').value = 'preset:accent-1';
		expect(validateEditValues(readEditForm(form), {})).toBeNull();
	});

	test('the outline width stays within 0–20', () => {
		const form = buildForm();
		fillEditForm(form, { id: 1, name: 'X', properties: {} }, '', 'rem', []);
		field(form, 'textStrokeWidth').value = '25';
		expect(validateEditValues(readEditForm(form), {}).field).toBe('textStrokeWidth');
	});
});

describe('contrast notice', () => {
	test('shows for a pale text color and joins the selects\' descriptions', () => {
		const form = buildForm();
		fillEditForm(form, { id: 1, name: 'X', properties: { textColor: 'var:preset|color|pale|#eeeeee' } }, '', 'rem', []);
		const notice = form.querySelector('.typost-ps-edit-contrast');
		expect(notice.textContent).toMatch(/^Low contrast: the text color has a ratio of 1\.\d+:1 against the theme background \(#ffffff\)\. Text needs at least 4\.5:1/);
		expect(field(form, 'textColor').getAttribute('aria-describedby')).toBe('text-color-help contrast');
		expect(field(form, 'textStrokeColor').getAttribute('aria-describedby')).toBe('contrast');
	});

	test('clears when the color is fixed', () => {
		const form = buildForm();
		fillEditForm(form, { id: 1, name: 'X', properties: { textColor: 'var:preset|color|pale|#eeeeee' } }, '', 'rem', []);
		field(form, 'textColor').value = 'preset:accent-1';
		updateColorFields(form);
		expect(form.querySelector('.typost-ps-edit-contrast').textContent).toBe('');
		expect(field(form, 'textColor').getAttribute('aria-describedby')).toBe('text-color-help');
		expect(field(form, 'textStrokeColor').hasAttribute('aria-describedby')).toBe(false);
	});

	test('uses 3:1 for large text', () => {
		const values = { sizeMode: 'fixed', fontSize: '32', textColor: '#949494' };
		const ctx = { palette: PALETTE, themeColors: { background: '#ffffff' } };
		expect(contrastMessage(values, ctx)).toBe('');
		expect(contrastMessage(Object.assign({}, values, { fontSize: '16' }), ctx)).toMatch(/4\.5:1/);
	});

	test('outline-only text: the outline against the background, against a dark theme too', () => {
		const ctx = { palette: PALETTE, themeColors: { background: '#111111' } };
		const values = { textColor: 'transparent', textStrokeWidth: 2, textStrokeColor: '#333333' };
		expect(contrastMessage(values, ctx)).toMatch(/^Low contrast: the outline has a ratio of 1\.\d+:1 against the theme background \(#111111\)/);
		expect(contrastMessage(Object.assign({}, values, { textStrokeColor: 'var:preset|color|base|#ffffff' }), ctx)).toBe('');
	});

	test('nothing to check without a color or an outline', () => {
		expect(contrastMessage({}, { palette: PALETTE, themeColors: {} })).toBe('');
	});
});

/**
 * Tests for the admin edit form in paragraph-styles/assets/js/admin.js
 * (#221): fill from a stored style, read back, and build the PATCH body
 * with ps-utils' buildPropertiesForStyleSave(). The jQuery wiring is inert
 * here: no jQuery global.
 *
 * The fixture mirrors the <template> in includes/admin-tab.php; the PHP
 * test ParagraphStylesAdminEditFormTest checks the template carries the
 * same data-field names (FORM_FIELDS).
 */

const {
	suffixIds,
	sizeModeOf,
	updateConditionalFields,
	fillEditForm,
	readEditForm,
	validateEditValues,
	buildEditPayload,
	replaceCardParts,
	replaceStyleCss,
} = require('../assets/js/admin.js');

const FEATURES = ['liga', 'dlig', 'ss01', 'swsh', 'smcp'];

function buildTemplate() {
	const template = document.createElement('template');
	template.id = 'typost-ps-edit-form-template';
	template.innerHTML = `
		<form class="typost-ps-edit-form-inner" novalidate>
			<label for="typost-ps-edit-name">Name:</label>
			<input type="text" id="typost-ps-edit-name" class="typost-ps-edit-name" data-field="name" />
			<select id="typost-ps-edit-font" data-field="fontId">
				<option value="0">Default (theme font)</option>
				<option value="12">Bookmania</option>
				<option value="36">Fraunces</option>
			</select>
			<select data-field="fontWeight">
				<option value="">Default</option>
				${['100', '200', '300', '400', '500', '600', '700', '800', '900'].map((w) => `<option value="${w}">${w}</option>`).join('')}
			</select>
			<select data-field="fontStyle">
				<option value="">Default</option><option value="normal">Normal</option>
				<option value="italic">Italic</option><option value="oblique">Oblique</option>
			</select>
			<select data-field="sizeMode">
				<option value="inherit">Default</option><option value="fixed">Fixed</option>
				<option value="responsive">Responsive</option><option value="fit">Fit</option>
			</select>
			<div data-show-for-size="fixed"><input type="number" data-field="fontSize" /></div>
			<div data-show-for-size="responsive fit">
				<input type="number" data-field="fontSizeMin" />
				<input type="number" data-field="fontSizePreferred" />
				<input type="number" data-field="fontSizeMax" />
			</div>
			<div data-show-for-size="fit"><input type="number" data-field="fitMaxSize" /></div>
			<input type="number" data-field="letterSpacing" />
			<input type="number" data-field="lineHeight" />
			<input type="number" data-field="initialHang" />
			<select data-field="textCase">
				<option value="">Default</option>
				${['none', 'uppercase', 'lowercase', 'capitalize', 'small-caps', 'all-small-caps'].map((c) => `<option value="${c}">${c}</option>`).join('')}
			</select>
			<p data-show-for-case="small-caps all-small-caps">
				<input type="checkbox" id="typost-ps-edit-fake" data-field="fakeSmallCaps" />
				<label for="typost-ps-edit-fake">Allow fake small caps</label>
			</p>
			<div role="group" aria-labelledby="typost-ps-edit-features-ligatures">
				<p id="typost-ps-edit-features-ligatures">Ligatures</p>
				${FEATURES.map((f) => `<input type="checkbox" data-feature value="${f}" />`).join('')}
			</div>
			<div data-extra-features hidden></div>
			<input type="text" id="typost-ps-edit-axes" data-field="fontVariationSettings" aria-describedby="typost-ps-edit-axes-help" />
			<span id="typost-ps-edit-axes-help">help</span>
			<p class="typost-ps-edit-error" hidden></p>
		</form>`;
	return template;
}

function openForm(style, fontLabel = '') {
	const fragment = buildTemplate().content.cloneNode(true);
	suffixIds(fragment, style.id);
	const container = document.createElement('div');
	container.appendChild(fragment);
	document.body.appendChild(container);
	const form = container.querySelector('form');
	fillEditForm(form, style, fontLabel);
	return { form, baseline: readEditForm(form) };
}

function setField(form, name, value) {
	const el = form.querySelector(`[data-field="${name}"]`);
	if (el.type === 'checkbox') {
		el.checked = value;
	} else {
		el.value = String(value);
	}
}

function setFeature(form, tag, checked) {
	form.querySelector(`input[data-feature][value="${tag}"]`).checked = checked;
}

const RICH_STYLE = {
	id: 4,
	name: 'Pull quote',
	properties: {
		fontId: 36,
		fontWeight: '600',
		fontStyle: 'italic',
		fontSize: 'responsive',
		fontSizeUnit: 'rem',
		fontSizeMin: 18,
		fontSizePreferred: 24,
		fontSizeMax: 48,
		letterSpacing: 25,
		lineHeight: 1.4,
		features: ['swsh', 'liga'],
		fontVariationSettings: '"wght" 650, "wdth" 80',
		initialHang: 0.5,
		textCase: 'small-caps',
		fakeSmallCaps: false,
	},
};

afterEach(() => {
	document.body.innerHTML = '';
	document.head.innerHTML = '';
});

describe('suffixIds', () => {
	test('suffixes ids and every reference to them', () => {
		const fragment = buildTemplate().content.cloneNode(true);
		suffixIds(fragment, 7);
		expect(fragment.querySelector('#typost-ps-edit-name-7')).not.toBeNull();
		expect(fragment.querySelector('label[for="typost-ps-edit-name-7"]')).not.toBeNull();
		expect(fragment.querySelector('[aria-describedby="typost-ps-edit-axes-help-7"]')).not.toBeNull();
		expect(fragment.querySelector('[aria-labelledby="typost-ps-edit-features-ligatures-7"]')).not.toBeNull();
		expect(fragment.querySelector('#typost-ps-edit-name')).toBeNull();
	});
});

describe('sizeModeOf', () => {
	test.each([
		['responsive', 'responsive'],
		['fit', 'fit'],
		['24', 'fixed'],
		[36.5, 'fixed'],
		['0', 'inherit'],
		['inherit', 'inherit'],
		[undefined, 'inherit'],
		['', 'inherit'],
	])('%p → %s', (fontSize, mode) => {
		expect(sizeModeOf(fontSize)).toBe(mode);
	});
});

describe('fill and read', () => {
	test('the form shows every stored property', () => {
		const { form, baseline } = openForm(RICH_STYLE, 'Fraunces');
		expect(baseline).toMatchObject({
			name: 'Pull quote',
			fontId: 36,
			fontWeight: '600',
			fontStyle: 'italic',
			sizeMode: 'responsive',
			fontSizeMin: 18,
			fontSizePreferred: 24,
			fontSizeMax: 48,
			letterSpacing: 25,
			lineHeight: 1.4,
			initialHang: 0.5,
			textCase: 'small-caps',
			fakeSmallCaps: false,
			features: ['swsh', 'liga'],
			fontVariationSettings: '"wght" 650, "wdth" 80',
		});
		// Small caps shows the fake small caps toggle; responsive hides fixed and fit
		expect(form.querySelector('[data-show-for-case]').hidden).toBe(false);
		expect(form.querySelector('[data-show-for-size="fixed"]').hidden).toBe(true);
		expect(form.querySelector('[data-show-for-size="responsive fit"]').hidden).toBe(false);
		expect(form.querySelector('[data-show-for-size="fit"]').hidden).toBe(true);
	});

	test('a deleted font and an off-list weight are offered, labelled by the card', () => {
		const { form, baseline } = openForm(
			{ id: 2, name: 'Old', properties: { fontId: 99, fontWeight: '350' } },
			'Deleted font, shown in the default font'
		);
		const font = form.querySelector('[data-field="fontId"]');
		expect(font.value).toBe('99');
		expect(font.selectedOptions[0].textContent).toBe('Deleted font, shown in the default font');
		expect(baseline.fontId).toBe(99);
		expect(baseline.fontWeight).toBe('350');
	});

	test('a feature the list does not offer stays checked', () => {
		const { form, baseline } = openForm({ id: 3, name: 'X', properties: { features: ['cv01', 'liga'] } });
		const extra = form.querySelector('[data-extra-features]');
		expect(extra.hidden).toBe(false);
		expect(extra.querySelector('input[value="cv01"]').checked).toBe(true);
		expect(baseline.features).toEqual(['cv01', 'liga']);
	});

	test('a style without a size gets default slider values for a later switch', () => {
		const { form } = openForm({ id: 5, name: 'Plain', properties: {} });
		expect(form.querySelector('[data-field="sizeMode"]').value).toBe('inherit');
		expect(form.querySelector('[data-field="fontSizeMin"]').value).toBe('16');
		expect(form.querySelector('[data-field="fontSizePreferred"]').value).toBe('24');
		expect(form.querySelector('[data-field="fontSizeMax"]').value).toBe('32');
		expect(form.querySelector('[data-show-for-case]').hidden).toBe(true);
	});

	test('changing the size mode shows its fields', () => {
		const { form } = openForm({ id: 5, name: 'Plain', properties: {} });
		setField(form, 'sizeMode', 'fit');
		updateConditionalFields(form);
		expect(form.querySelector('[data-show-for-size="responsive fit"]').hidden).toBe(false);
		expect(form.querySelector('[data-show-for-size="fit"]').hidden).toBe(false);
		expect(form.querySelector('[data-show-for-size="fixed"]').hidden).toBe(true);
	});
});

describe('buildEditPayload', () => {
	test('an untouched form sends only the name (a rename stays a rename)', () => {
		const { form, baseline } = openForm(RICH_STYLE);
		setField(form, 'name', 'Pull quote large');
		const payload = buildEditPayload(readEditForm(form), baseline, RICH_STYLE, 'rem');
		expect(payload).toEqual({ name: 'Pull quote large' });
	});

	test('one change sends the full set, every other property unchanged', () => {
		const { form, baseline } = openForm(RICH_STYLE);
		setField(form, 'lineHeight', '1.8');
		const payload = buildEditPayload(readEditForm(form), baseline, RICH_STYLE, 'px');
		expect(payload.name).toBe('Pull quote');
		expect(payload.properties).toEqual({ ...RICH_STYLE.properties, lineHeight: 1.8 });
	});

	test('a pre-#233 px size keeps px, whatever the site setting', () => {
		const style = { id: 6, name: 'Legacy', properties: { fontSize: '24', lineHeight: 1.2 } };
		const { form, baseline } = openForm(style);
		setField(form, 'lineHeight', '1.5');
		const payload = buildEditPayload(readEditForm(form), baseline, style, 'rem');
		expect(payload.properties).toEqual({ fontSize: '24', fontSizeUnit: 'px', lineHeight: 1.5 });
	});

	test('a rem size keeps rem under the px setting when its size changes', () => {
		const style = { id: 7, name: 'Rem', properties: { fontSize: 'responsive', fontSizeUnit: 'rem', fontSizeMin: 16, fontSizePreferred: 32, fontSizeMax: 64 } };
		const { form, baseline } = openForm(style);
		setField(form, 'fontSizeMax', '72');
		const payload = buildEditPayload(readEditForm(form), baseline, style, 'px');
		expect(payload.properties).toEqual({ fontSize: 'responsive', fontSizeUnit: 'rem', fontSizeMin: 16, fontSizePreferred: 32, fontSizeMax: 72 });
	});

	test.each([['px'], ['rem']])('a size added to a style without one takes the new-content unit (%s)', (unit) => {
		const style = { id: 8, name: 'Plain', properties: { lineHeight: 1.4 } };
		const { form, baseline } = openForm(style);
		setField(form, 'sizeMode', 'responsive');
		const payload = buildEditPayload(readEditForm(form), baseline, style, unit);
		expect(payload.properties).toEqual({
			fontSize: 'responsive',
			fontSizeUnit: unit,
			fontSizeMin: 16,
			fontSizePreferred: 24,
			fontSizeMax: 32,
			lineHeight: 1.4,
		});
	});

	test('a fit style keeps its cap and fallback clamp', () => {
		const style = { id: 9, name: 'Fit', properties: { fontSize: 'fit', fontSizeUnit: 'rem', fitMaxSize: 120, fontSizeMin: 20, fontSizePreferred: 40, fontSizeMax: 80 } };
		const { form, baseline } = openForm(style);
		setFeature(form, 'dlig', true);
		const payload = buildEditPayload(readEditForm(form), baseline, style, 'rem');
		expect(payload.properties).toEqual({ ...style.properties, features: ['dlig'] });
	});

	test('switching to a fixed size drops the trio', () => {
		const { form, baseline } = openForm(RICH_STYLE);
		setField(form, 'sizeMode', 'fixed');
		setField(form, 'fontSize', '36.5');
		const { properties } = buildEditPayload(readEditForm(form), baseline, RICH_STYLE, 'rem');
		expect(properties.fontSize).toBe('36.5');
		expect(properties.fontSizeUnit).toBe('rem');
		expect(properties).not.toHaveProperty('fontSizeMin');
		expect(properties).not.toHaveProperty('fontSizePreferred');
		expect(properties).not.toHaveProperty('fontSizeMax');
	});

	test('clearing values removes them (Default font, weight, style, hang, case, axes)', () => {
		const { form, baseline } = openForm(RICH_STYLE);
		setField(form, 'fontId', '0');
		setField(form, 'fontWeight', '');
		setField(form, 'fontStyle', '');
		setField(form, 'sizeMode', 'inherit');
		setField(form, 'letterSpacing', '0');
		setField(form, 'lineHeight', '');
		setField(form, 'initialHang', '0');
		setField(form, 'textCase', '');
		setField(form, 'fontVariationSettings', '');
		setFeature(form, 'swsh', false);
		setFeature(form, 'liga', false);
		const payload = buildEditPayload(readEditForm(form), baseline, RICH_STYLE, 'rem');
		expect(payload.properties).toEqual({});
	});

	test('features keep their stored order; new ones follow', () => {
		const { form, baseline } = openForm(RICH_STYLE);
		setFeature(form, 'ss01', true);
		const { properties } = buildEditPayload(readEditForm(form), baseline, RICH_STYLE, 'rem');
		expect(properties.features).toEqual(['swsh', 'liga', 'ss01']);
	});

	test('fake small caps is stored only when off with a small caps value', () => {
		const style = { id: 10, name: 'Caps', properties: { textCase: 'uppercase' } };
		const { form, baseline } = openForm(style);
		setField(form, 'textCase', 'all-small-caps');
		setField(form, 'fakeSmallCaps', false);
		let { properties } = buildEditPayload(readEditForm(form), baseline, style, 'rem');
		expect(properties).toEqual({ textCase: 'all-small-caps', fakeSmallCaps: false });

		setField(form, 'fakeSmallCaps', true);
		({ properties } = buildEditPayload(readEditForm(form), baseline, style, 'rem'));
		expect(properties).toEqual({ textCase: 'all-small-caps' });
	});

	test('the hang is normalized like the editors (capped at 1, three decimals)', () => {
		const style = { id: 11, name: 'Hang', properties: {} };
		const { form, baseline } = openForm(style);
		setField(form, 'initialHang', '1.5');
		expect(buildEditPayload(readEditForm(form), baseline, style, 'rem').properties).toEqual({ initialHang: 1 });
		setField(form, 'initialHang', '0.12345');
		expect(buildEditPayload(readEditForm(form), baseline, style, 'rem').properties).toEqual({ initialHang: 0.123 });
	});
});

describe('validateEditValues', () => {
	function valuesFor(style, edits = {}) {
		const { form } = openForm(style);
		Object.keys(edits).forEach((key) => setField(form, key, edits[key]));
		return validateEditValues(readEditForm(form));
	}

	test('a filled form is valid', () => {
		expect(valuesFor(RICH_STYLE)).toBeNull();
	});

	test('the name is required', () => {
		expect(valuesFor(RICH_STYLE, { name: '  ' })).toMatchObject({ field: 'name' });
	});

	test('a fixed size must be above 0', () => {
		expect(valuesFor(RICH_STYLE, { sizeMode: 'fixed', fontSize: '' })).toMatchObject({ field: 'fontSize' });
		expect(valuesFor(RICH_STYLE, { sizeMode: 'fixed', fontSize: '0' })).toMatchObject({ field: 'fontSize' });
		expect(valuesFor(RICH_STYLE, { sizeMode: 'fixed', fontSize: '24' })).toBeNull();
	});

	test('responsive and fit need all three sizes', () => {
		expect(valuesFor(RICH_STYLE, { fontSizePreferred: '' })).toMatchObject({ field: 'fontSizePreferred' });
		expect(valuesFor(RICH_STYLE, { sizeMode: 'fit', fontSizeMax: '0' })).toMatchObject({ field: 'fontSizeMax' });
		// Hidden trio values do not block a style with no size
		expect(valuesFor(RICH_STYLE, { sizeMode: 'inherit', fontSizeMin: '' })).toBeNull();
	});

	test('axis settings must be pairs the CSS generators keep', () => {
		expect(valuesFor(RICH_STYLE, { fontVariationSettings: '"wght" 650,"opsz" 12.5' })).toBeNull();
		expect(valuesFor(RICH_STYLE, { fontVariationSettings: 'wght 650' })).toMatchObject({ field: 'fontVariationSettings' });
		expect(valuesFor(RICH_STYLE, { fontVariationSettings: '"wght" 650, ' })).toMatchObject({ field: 'fontVariationSettings' });
		expect(valuesFor(RICH_STYLE, { fontVariationSettings: '"weight" 650' })).toMatchObject({ field: 'fontVariationSettings' });
	});
});

describe('card refresh', () => {
	test('replaceCardParts swaps the details and the preview', () => {
		const card = document.createElement('div');
		card.innerHTML =
			'<h3>Name</h3>' +
			'<div class="typost-ps-style-card-details" data-font-label="Old"><span>old</span></div>' +
			'<div class="typost-ps-preview"><p>old</p></div>' +
			'<div class="typost-ps-edit-form"></div>';
		replaceCardParts(card, {
			details: '<div class="typost-ps-style-card-details" data-font-label="New"><span>new</span></div>',
			preview: '<div class="typost-ps-preview"><p class="typost-ps-4">new</p></div>',
		});
		expect(card.querySelector('.typost-ps-style-card-details').getAttribute('data-font-label')).toBe('New');
		expect(card.querySelector('.typost-ps-preview p').className).toBe('typost-ps-4');
		expect(card.querySelectorAll('.typost-ps-preview')).toHaveLength(1);
		expect(card.querySelector('.typost-ps-edit-form')).not.toBeNull();
	});

	test('replaceStyleCss replaces the printed rules, not appends to them', () => {
		const printed = document.createElement('style');
		printed.id = 'typost-paragraph-styles-admin-inline-css';
		printed.textContent = '.typost-ps-4 { line-height: 1.4; }';
		document.head.appendChild(printed);

		replaceStyleCss(document, '.typost-ps-4 { font-weight: 700; }');

		expect(document.querySelectorAll('#typost-paragraph-styles-admin-inline-css')).toHaveLength(1);
		expect(printed.textContent).toBe('.typost-ps-4 { font-weight: 700; }');
	});

	test('replaceStyleCss adds the element when the page printed none', () => {
		const el = replaceStyleCss(document, '.typost-ps-1 { font-style: italic; }');
		expect(el.parentNode).toBe(document.head);
		expect(el.textContent).toBe('.typost-ps-1 { font-style: italic; }');
		expect(replaceStyleCss(document, undefined)).toBeNull();
	});
});

describe('Based On (#200)', () => {
	const { resolveStyleList } = require('../assets/js/lib/ps-utils.js');
	const { replaceRelatedCards } = require('../assets/js/admin.js');

	// Client shape, as typostPSAdmin.styles carries it
	const STYLES = resolveStyleList([
		{ id: 1, name: 'Body', properties: { fontId: 36, fontWeight: '400', lineHeight: 1.6, features: ['liga'] } },
		{ id: 2, name: 'Caption', basedOn: 1, properties: { fontSize: '14', fontSizeUnit: 'rem', letterSpacing: 20 } },
		{ id: 3, name: 'Small Caption', basedOn: 2, properties: { fontSize: '12', fontSizeUnit: 'rem' } },
		{ id: 4, name: 'Display', properties: { fontId: 12, fontWeight: '700' } },
	]);

	function openChildForm(style) {
		const template = buildTemplate();
		const name = template.content.querySelector('[data-field="name"]');
		const select = document.createElement('select');
		select.setAttribute('data-field', 'basedOn');
		select.innerHTML = '<option value="0">None</option>';
		name.after(select);
		const reset = document.createElement('button');
		reset.className = 'typost-ps-reset-base-btn';
		reset.hidden = true;
		template.content.querySelector('form').appendChild(reset);

		const container = document.createElement('div');
		container.appendChild(template.content.cloneNode(true));
		document.body.appendChild(container);
		const form = container.querySelector('form');
		fillEditForm(form, style, '', STYLES);
		return { form, baseline: readEditForm(form) };
	}

	const optionValues = (form) => Array.from(form.querySelector('[data-field="basedOn"]').options).map((o) => o.value);

	test('lists every style except the style itself and the styles based on it', () => {
		const { form } = openChildForm(STYLES[0]);
		expect(optionValues(form)).toEqual(['0', '4']);
		const caption = openChildForm(STYLES[1]).form;
		expect(optionValues(caption)).toEqual(['0', '1', '4']);
		expect(caption.querySelector('[data-field="basedOn"]').value).toBe('1');
	});

	test('a child shows its resolved values, and Reset to Base only when it has overrides', () => {
		const { form } = openChildForm(STYLES[1]);
		expect(form.querySelector('[data-field="fontId"]').value).toBe('36');
		expect(form.querySelector('.typost-ps-reset-base-btn').hidden).toBe(false);
		expect(openChildForm(STYLES[0]).form.querySelector('.typost-ps-reset-base-btn').hidden).toBe(true);
		const bare = resolveStyleList([STYLES[0], { id: 5, name: 'Same as Body', basedOn: 1, properties: {} }])[1];
		expect(openChildForm(bare).form.querySelector('.typost-ps-reset-base-btn').hidden).toBe(true);
	});

	test('an untouched child form sends only the name', () => {
		const { form, baseline } = openChildForm(STYLES[1]);
		expect(buildEditPayload(readEditForm(form), baseline, STYLES[1], 'rem', STYLES)).toEqual({ name: 'Caption' });
	});

	test('a change to a child sends only what differs from the parent', () => {
		const { form, baseline } = openChildForm(STYLES[1]);
		setField(form, 'letterSpacing', 40);
		expect(buildEditPayload(readEditForm(form), baseline, STYLES[1], 'rem', STYLES)).toEqual({
			name: 'Caption',
			properties: { fontSize: '14', fontSizeUnit: 'rem', letterSpacing: 40 },
		});
	});

	test('a value set back to the parent\'s becomes inherited', () => {
		const { form, baseline } = openChildForm(STYLES[1]);
		setField(form, 'letterSpacing', 0);
		expect(buildEditPayload(readEditForm(form), baseline, STYLES[1], 'rem', STYLES).properties)
			.toEqual({ fontSize: '14', fontSizeUnit: 'rem' });
	});

	test('a Based On change alone sends basedOn and no properties (the server rebases)', () => {
		const { form, baseline } = openChildForm(STYLES[1]);
		setField(form, 'basedOn', 4);
		expect(buildEditPayload(readEditForm(form), baseline, STYLES[1], 'rem', STYLES)).toEqual({ name: 'Caption', basedOn: 4 });
		setField(form, 'basedOn', 0);
		expect(buildEditPayload(readEditForm(form), baseline, STYLES[1], 'rem', STYLES)).toEqual({ name: 'Caption', basedOn: 0 });
	});

	test('a new parent and a changed value store the look as overrides of the new parent', () => {
		const { form, baseline } = openChildForm(STYLES[1]);
		setField(form, 'basedOn', 4);
		setField(form, 'fontWeight', '700');
		const payload = buildEditPayload(readEditForm(form), baseline, STYLES[1], 'rem', STYLES);
		expect(payload.basedOn).toBe(4);
		// Display's weight is inherited, its font is replaced by the look's
		expect(payload.properties.fontWeight).toBeUndefined();
		expect(payload.properties.fontId).toBe(36);
	});

	test('None with a changed value stores the whole look', () => {
		const { form, baseline } = openChildForm(STYLES[1]);
		setField(form, 'basedOn', 0);
		setField(form, 'letterSpacing', 40);
		const payload = buildEditPayload(readEditForm(form), baseline, STYLES[1], 'rem', STYLES);
		expect(payload.basedOn).toBe(0);
		expect(payload.properties).toEqual({ fontId: 36, fontWeight: '400', fontSize: '14', fontSizeUnit: 'rem', letterSpacing: 40, lineHeight: 1.6, features: ['liga'] });
	});

	test('replaceRelatedCards swaps the saved card and the cards based on it', () => {
		const list = document.createElement('div');
		list.innerHTML = [1, 2, 3].map((id) =>
			`<div class="typost-ps-style-card" data-style-id="${id}"><div class="typost-ps-style-card-details">old ${id}</div><div class="typost-ps-preview">p${id}</div></div>`
		).join('');
		document.body.appendChild(list);
		replaceRelatedCards(list, {
			details: '<div class="typost-ps-style-card-details">new 1</div>',
			preview: '<div class="typost-ps-preview">np1</div>',
			related: [{ id: 3, details: '<div class="typost-ps-style-card-details">new 3</div>', preview: '<div class="typost-ps-preview">np3</div>' }],
		}, 1);
		const texts = Array.from(list.querySelectorAll('.typost-ps-style-card-details')).map((el) => el.textContent);
		expect(texts).toEqual(['new 1', 'old 2', 'new 3']);
	});
});

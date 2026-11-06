/**
 * Tests for the Nested styles list of the admin edit form (#195) in
 * paragraph-styles/assets/js/admin.js: rows built from a style's rules,
 * the fields each unit shows, add / move / remove with the focus target
 * each returns, read back, the checks, and the PATCH body.
 *
 * The fieldset fixture mirrors the nested fieldset in includes/admin-tab.php.
 */

const {
	fillNestedRules,
	addNestedRule,
	moveNestedRule,
	removeNestedRule,
	readNestedRules,
	validateNestedRules,
	validateEditValues,
	buildEditPayload,
	hasUnsavedEditChanges,
	nestedErrorField,
	normalizeNestedRule,
	updateNestedRow,
	fillGrepRules,
	readGrepRules,
} = require('../assets/js/admin.js');

const NESTED = {
	supported: true,
	maxRules: 3,
	maxCount: 100,
	units: [
		{ value: 'words', label: 'Words' },
		{ value: 'characters', label: 'Characters' },
		{ value: 'marker', label: 'A character you type' },
		{ value: 'line', label: 'First line' },
	],
	ends: [
		{ value: 'through', label: 'Through' },
		{ value: 'upto', label: 'Up to' },
	],
};

const STYLES = [
	{
		id: 1,
		name: 'Step',
		properties: {},
		nestedRules: [
			{ styleId: 2, unit: 'marker', count: 1, marker: ':', end: 'through' },
			{ styleId: 3, unit: 'words', count: 3, end: 'upto' },
		],
	},
	{ id: 2, name: 'Bold', properties: { fontWeight: '700' } },
	{ id: 3, name: 'Small caps', properties: { features: ['c2sc'] } },
];

function buildForm() {
	document.body.innerHTML = `
		<form>
			<input data-field="name" value="Step" />
			<fieldset data-grep>
				<ol data-grep-rules></ol>
				<p data-grep-empty>No GREP rules.</p>
				<button type="button" class="typost-ps-grep-add">Add GREP rule</button>
			</fieldset>
			<fieldset data-nested>
				<ol data-nested-rules></ol>
				<p data-nested-empty>No nested rules.</p>
				<button type="button" class="typost-ps-nested-add">Add nested rule</button>
			</fieldset>
			<p class="typost-ps-edit-error" id="err" role="alert" hidden></p>
			<button type="submit" class="typost-ps-save-edit-btn">Save</button>
		</form>`;
	return document.querySelector('form');
}

function rows(form) {
	return Array.from(form.querySelectorAll('[data-nested-rules] > li'));
}

function visible(row) {
	return Array.from(row.querySelectorAll('[data-nested-field]'))
		.filter((p) => !p.hidden)
		.map((p) => p.getAttribute('data-nested-field'));
}

describe('fill and read', () => {
	test('one row per rule, in order, read back as stored', () => {
		const form = buildForm();
		fillNestedRules(form, STYLES[0], STYLES, NESTED);

		expect(rows(form)).toHaveLength(2);
		expect(readNestedRules(form)).toEqual(STYLES[0].nestedRules);
		const styleOptions = Array.from(rows(form)[0].querySelectorAll('[data-nested="styleId"] option')).map((o) => o.value);
		expect(styleOptions).toEqual(['0', '2', '3']);
		expect(form.querySelector('[data-nested-empty]').hidden).toBe(true);
		// The GREP list is separate
		fillGrepRules(form, STYLES[0], STYLES, { patterns: [] });
		expect(readGrepRules(form)).toEqual([]);
	});

	test('rows are named groups, numbered, with labeled controls and error fields', () => {
		const form = buildForm();
		fillNestedRules(form, STYLES[0], STYLES, NESTED);
		const [first, second] = rows(form);

		expect(first.getAttribute('role')).toBeNull();
		expect(first.firstElementChild.getAttribute('role')).toBe('group');
		expect(first.firstElementChild.getAttribute('aria-label')).toBe('Nested rule 1');
		expect(second.querySelector('[data-nested="count"]').getAttribute('data-field')).toBe('nested-1-count');
		expect(first.querySelector('.typost-ps-nested-up').disabled).toBe(true);
		expect(second.querySelector('.typost-ps-nested-down').disabled).toBe(true);
		expect(second.querySelector('.typost-ps-nested-remove').getAttribute('aria-label')).toBe('Remove nested rule 2');
		// Never the GREP classes, whose click handlers would act on this row
		expect(form.querySelector('[data-nested-rules] .typost-ps-grep-remove, [data-nested-rules] .typost-ps-grep-rule')).toBeNull();
		form.querySelectorAll('[data-nested]').forEach((control) => {
			if (control.tagName !== 'FIELDSET') {
				expect(form.querySelector(`label[for="${control.id}"]`)).not.toBeNull();
			}
		});
	});

	test('each unit shows the fields it uses', () => {
		const form = buildForm();
		fillNestedRules(form, STYLES[0], STYLES, NESTED);
		const [first, second] = rows(form);
		expect(visible(first)).toEqual(['styleId', 'end', 'count', 'unit', 'marker']);
		expect(visible(second)).toEqual(['styleId', 'end', 'count', 'unit']);

		second.querySelector('[data-nested="unit"]').value = 'characters';
		updateNestedRow(second);
		expect(visible(second)).toEqual(['styleId', 'count', 'unit']);

		second.querySelector('[data-nested="unit"]').value = 'line';
		updateNestedRow(second);
		expect(visible(second)).toEqual(['styleId', 'unit']);
		// Fields a unit does not use are not read back
		expect(readNestedRules(form)[1]).toEqual({ styleId: 3, unit: 'line' });
	});

	test('no nested fieldset (WordPress before 6.9) reads as null, so a save leaves the rules alone', () => {
		document.body.innerHTML = '<form><input data-field="name" value="x" /></form>';
		const form = document.querySelector('form');
		fillNestedRules(form, STYLES[0], STYLES, NESTED);
		expect(readNestedRules(form)).toBeNull();
		expect(buildEditPayload({ name: 'Step', nestedRules: null }, { name: 'Step', nestedRules: null }, STYLES[0], 'rem', STYLES).nestedRules).toBeUndefined();
	});
});

describe('add, move, remove', () => {
	test('add appends a rule for one word with no style, up to the limit', () => {
		const form = buildForm();
		fillNestedRules(form, STYLES[0], STYLES, NESTED);
		expect(addNestedRule(form, STYLES[0], STYLES, NESTED)).not.toBeNull();
		expect(readNestedRules(form)[2]).toEqual({ styleId: 0, unit: 'words', count: 1, end: 'through' });
		expect(form.querySelector('.typost-ps-nested-add').disabled).toBe(true);
		expect(addNestedRule(form, STYLES[0], STYLES, NESTED)).toBeNull();
	});

	test('moving keeps focus on the used button, or the other one at an end', () => {
		const form = buildForm();
		fillNestedRules(form, STYLES[0], STYLES, NESTED);
		const [, second] = rows(form);
		const target = moveNestedRule(form, second, -1, NESTED);
		expect(readNestedRules(form).map((r) => r.unit)).toEqual(['words', 'marker']);
		expect(target).toBe(second.querySelector('.typost-ps-nested-down'));
	});

	test('removing focuses the next row, else the previous, else Add', () => {
		const form = buildForm();
		fillNestedRules(form, STYLES[0], STYLES, NESTED);
		const [first, second] = rows(form);
		expect(removeNestedRule(form, first, NESTED)).toBe(second.querySelector('[data-nested="styleId"]'));
		expect(removeNestedRule(form, second, NESTED)).toBe(form.querySelector('.typost-ps-nested-add'));
		expect(form.querySelector('[data-nested-empty]').hidden).toBe(false);
	});
});

describe('validation', () => {
	const ok = { styleId: 2, unit: 'words', count: 1, end: 'through' };

	test('the checks match the server', () => {
		expect(validateNestedRules([{ ...ok, styleId: 0 }], NESTED)).toEqual({ field: 'nested-0-styleId', message: 'Choose a style for each nested rule.' });
		expect(validateNestedRules([ok, normalizeNestedRule({ ...ok, count: '1.5' })], NESTED).field).toBe('nested-1-count');
		expect(validateNestedRules([normalizeNestedRule({ ...ok, count: '0' })], NESTED).message).toBe('Enter a whole number from 1 to 100.');
		expect(validateNestedRules([normalizeNestedRule({ ...ok, count: '101' })], NESTED).field).toBe('nested-0-count');
		expect(validateNestedRules([{ styleId: 2, unit: 'marker', count: 1, marker: '', end: 'upto' }], NESTED).field).toBe('nested-0-marker');
		expect(validateNestedRules([{ styleId: 2, unit: 'marker', count: 1, marker: '::', end: 'upto' }], NESTED).message).toBe('Type one character only.');
		expect(validateNestedRules([{ styleId: 2, unit: 'marker', count: 1, marker: '\t', end: 'upto' }], NESTED).field).toBe('nested-0-marker');
		expect(validateNestedRules([{ styleId: 2, unit: 'line' }, ok], NESTED).field).toBe('nested-0-unit');
		// One character, also when it is made of several code points
		['—', 'é', '\u{1F1EB}\u{1F1F7}', '¿'].forEach((marker) => {
			expect(validateNestedRules([{ styleId: 2, unit: 'marker', count: 1, marker, end: 'upto' }], NESTED)).toBeNull();
		});
		expect(validateNestedRules([ok, { styleId: 3, unit: 'line' }], NESTED)).toBeNull();
		expect(validateNestedRules(null, NESTED)).toBeNull();
	});

	test('validateEditValues reports a nested problem after GREP and the other fields', () => {
		const values = { name: 'Step', sizeMode: 'inherit', fontVariationSettings: '', grepRules: [], nestedRules: [{ ...ok, styleId: 0 }] };
		expect(validateEditValues(values, { nested: NESTED }).field).toBe('nested-0-styleId');
		expect(validateEditValues({ ...values, name: '' }, { nested: NESTED }).field).toBe('name');
	});

	test('a server error names the rule field it is about', () => {
		expect(nestedErrorField({ field: 'nestedRules', ruleIndex: 2, ruleField: 'marker' })).toBe('nested-2-marker');
		expect(nestedErrorField({ field: 'nestedRules', ruleIndex: 0, ruleField: 'nonsense' })).toBe('nested-0-styleId');
		expect(nestedErrorField({ field: 'nestedRules', ruleIndex: -1 })).toBeNull();
		expect(nestedErrorField({ field: 'grepRules', ruleIndex: 0 })).toBeNull();
	});
});

describe('PATCH body', () => {
	const baseline = { name: 'Step', sizeMode: 'inherit', features: [], nestedRules: STYLES[0].nestedRules };

	test('rules are sent only when the list changed', () => {
		expect(buildEditPayload({ ...baseline }, baseline, STYLES[0], 'rem', STYLES).nestedRules).toBeUndefined();
		expect(hasUnsavedEditChanges({ ...baseline }, baseline, STYLES[0], 'rem', STYLES)).toBe(false);

		const changed = { ...baseline, nestedRules: [STYLES[0].nestedRules[1], STYLES[0].nestedRules[0]] };
		expect(buildEditPayload(changed, baseline, STYLES[0], 'rem', STYLES).nestedRules).toEqual(changed.nestedRules);
		expect(hasUnsavedEditChanges(changed, baseline, STYLES[0], 'rem', STYLES)).toBe(true);

		expect(buildEditPayload({ ...baseline, nestedRules: [] }, baseline, STYLES[0], 'rem', STYLES).nestedRules).toEqual([]);
	});

	test('a unit never sends the fields it does not use', () => {
		const values = { ...baseline, nestedRules: [{ styleId: '2', unit: 'characters', count: '2', end: 'upto', marker: ':' }] };
		expect(buildEditPayload(values, baseline, STYLES[0], 'rem', STYLES).nestedRules).toEqual([{ styleId: 2, unit: 'characters', count: 2 }]);
	});
});

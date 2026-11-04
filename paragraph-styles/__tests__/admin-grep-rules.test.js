/**
 * Tests for the GREP styles list of the admin edit form (#196) in
 * paragraph-styles/assets/js/admin.js: rows built from a style's rules,
 * add / move / remove with the focus target each returns, read back,
 * the browser-side pattern check, and the PATCH body.
 *
 * The fieldset fixture mirrors the GREP fieldset in includes/admin-tab.php.
 */

const {
	fillGrepRules,
	addGrepRule,
	moveGrepRule,
	removeGrepRule,
	readGrepRules,
	validateGrepRules,
	validateEditValues,
	buildEditPayload,
	hasUnsavedEditChanges,
	grepErrorField,
	updateGrepRow,
} = require('../assets/js/admin.js');

const GREP = {
	supported: true,
	canWriteCustom: true,
	maxRules: 3,
	maxLength: 20,
	patterns: [
		{ value: 'acronyms', label: 'Acronyms (NASA)' },
		{ value: 'fractions', label: 'Fractions (1/2, not dates)' },
		{ value: 'numbers', label: 'Numbers' },
		{ value: 'custom', label: 'Custom pattern' },
	],
};

const STYLES = [
	{ id: 1, name: 'Body', properties: {}, grepRules: [{ pattern: 'fractions', styleId: 3 }, { pattern: 'custom', regex: '[A-Z]{2,}', styleId: 2 }] },
	{ id: 2, name: 'Small caps', properties: { features: ['c2sc'] } },
	{ id: 3, name: 'Fraction', properties: { features: ['frac'] } },
];

function buildForm() {
	document.body.innerHTML = `
		<form>
			<input data-field="name" value="Body" />
			<fieldset data-grep>
				<ol data-grep-rules></ol>
				<p data-grep-empty>No GREP rules.</p>
				<button type="button" class="typost-ps-grep-add">Add GREP rule</button>
			</fieldset>
			<p class="typost-ps-edit-error" id="err" role="alert" hidden></p>
			<button type="submit" class="typost-ps-save-edit-btn">Save</button>
		</form>`;
	return document.querySelector('form');
}

function rows(form) {
	return Array.from(form.querySelectorAll('[data-grep-rules] > li'));
}

describe('fill and read', () => {
	test('one row per rule, in order, with the style selects leaving out the style itself', () => {
		const form = buildForm();
		fillGrepRules(form, STYLES[0], STYLES, GREP);

		expect(rows(form)).toHaveLength(2);
		expect(readGrepRules(form)).toEqual([
			{ pattern: 'fractions', styleId: 3 },
			{ pattern: 'custom', regex: '[A-Z]{2,}', styleId: 2 },
		]);
		const styleOptions = Array.from(rows(form)[0].querySelectorAll('[data-grep="styleId"] option')).map((o) => o.value);
		expect(styleOptions).toEqual(['0', '2', '3']);
		expect(form.querySelector('[data-grep-empty]').hidden).toBe(true);
	});

	test('rows are named, numbered and point errors at their fields', () => {
		const form = buildForm();
		fillGrepRules(form, STYLES[0], STYLES, GREP);
		const [first, second] = rows(form);

		expect(first.getAttribute('role')).toBe('group');
		expect(first.getAttribute('aria-label')).toBe('GREP rule 1');
		expect(second.querySelector('[data-grep="regex"]').getAttribute('data-field')).toBe('grep-1-regex');
		expect(first.querySelector('.typost-ps-grep-up').disabled).toBe(true);
		expect(second.querySelector('.typost-ps-grep-down').disabled).toBe(true);
		expect(second.querySelector('.typost-ps-grep-remove').getAttribute('aria-label')).toBe('Remove rule 2');
		// Every control has a label tied to it
		form.querySelectorAll('select, input[data-grep]').forEach((control) => {
			expect(form.querySelector(`label[for="${control.id}"]`)).not.toBeNull();
		});
	});

	test('the expression field shows only for a custom pattern', () => {
		const form = buildForm();
		fillGrepRules(form, STYLES[0], STYLES, GREP);
		const [first, second] = rows(form);
		expect(first.querySelector('[data-grep-regex-field]').hidden).toBe(true);
		expect(second.querySelector('[data-grep-regex-field]').hidden).toBe(false);

		first.querySelector('[data-grep="pattern"]').value = 'custom';
		updateGrepRow(first);
		expect(first.querySelector('[data-grep-regex-field]').hidden).toBe(false);
	});

	test('a deleted style stays selected under its own label', () => {
		const form = buildForm();
		fillGrepRules(form, { id: 1, grepRules: [{ pattern: 'numbers', styleId: 99 }] }, STYLES, GREP);
		const select = rows(form)[0].querySelector('[data-grep="styleId"]');
		expect(select.value).toBe('99');
		expect(select.selectedOptions[0].textContent).toBe('A deleted style');
	});

	test('an author who cannot write custom patterns keeps a stored one read-only and is not offered new ones', () => {
		const form = buildForm();
		const authorGrep = { ...GREP, canWriteCustom: false };
		fillGrepRules(form, STYLES[0], STYLES, authorGrep);
		const [first, second] = rows(form);

		const values = (row) => Array.from(row.querySelectorAll('[data-grep="pattern"] option')).map((o) => o.value);
		expect(values(first)).not.toContain('custom');
		expect(values(second)).toContain('custom');
		expect(second.querySelector('[data-grep="regex"]').readOnly).toBe(true);
	});

	test('no GREP fieldset (WordPress before 6.9) reads as null, so a save leaves the rules alone', () => {
		document.body.innerHTML = '<form><input data-field="name" value="x" /></form>';
		const form = document.querySelector('form');
		fillGrepRules(form, STYLES[0], STYLES, GREP);
		expect(readGrepRules(form)).toBeNull();
		expect(buildEditPayload({ name: 'Body', grepRules: null }, { name: 'Body', grepRules: null }, STYLES[0], 'rem', STYLES).grepRules).toBeUndefined();
	});
});

describe('add, move, remove', () => {
	test('add appends a row with the first pattern and no style, up to the limit', () => {
		const form = buildForm();
		fillGrepRules(form, STYLES[0], STYLES, GREP);
		const row = addGrepRule(form, STYLES[0], STYLES, GREP);

		expect(row).not.toBeNull();
		expect(readGrepRules(form)[2]).toEqual({ pattern: 'acronyms', styleId: 0 });
		expect(form.querySelector('.typost-ps-grep-add').disabled).toBe(true);
		expect(addGrepRule(form, STYLES[0], STYLES, GREP)).toBeNull();
	});

	test('moving keeps focus on the used button, or the other one at an end', () => {
		const form = buildForm();
		fillGrepRules(form, STYLES[0], STYLES, GREP);
		const [first, second] = rows(form);

		const target = moveGrepRule(form, second, -1, GREP);
		expect(readGrepRules(form).map((r) => r.pattern)).toEqual(['custom', 'fractions']);
		// The row is first now, so Move up is disabled: focus goes to Move down
		expect(target).toBe(second.querySelector('.typost-ps-grep-down'));
		expect(second.getAttribute('aria-label')).toBe('GREP rule 1');
		expect(first.getAttribute('aria-label')).toBe('GREP rule 2');
	});

	test('removing focuses the next row, else the previous, else Add', () => {
		const form = buildForm();
		fillGrepRules(form, STYLES[0], STYLES, GREP);
		const [first, second] = rows(form);

		expect(removeGrepRule(form, first, GREP)).toBe(second.querySelector('[data-grep="pattern"]'));
		expect(removeGrepRule(form, second, GREP)).toBe(form.querySelector('.typost-ps-grep-add'));
		expect(form.querySelector('[data-grep-empty]').hidden).toBe(false);
		expect(readGrepRules(form)).toEqual([]);
	});
});

describe('validation', () => {
	test('a style must be chosen and a custom pattern must compile in a u RegExp', () => {
		expect(validateGrepRules([{ pattern: 'numbers', styleId: 0 }], GREP)).toEqual({ field: 'grep-0-styleId', message: 'Choose a style for each GREP rule.' });
		expect(validateGrepRules([{ pattern: 'custom', regex: '', styleId: 2 }], GREP).field).toBe('grep-0-regex');
		// A lone brace is a literal in PCRE but an error in a u RegExp
		const brace = validateGrepRules([{ pattern: 'numbers', styleId: 2 }, { pattern: 'custom', regex: 'a{', styleId: 2 }], GREP);
		expect(brace.field).toBe('grep-1-regex');
		expect(brace.message).toMatch(/^The pattern is not valid in the browser: /);
		expect(validateGrepRules([{ pattern: 'custom', regex: 'x'.repeat(21), styleId: 2 }], GREP).message).toBe('The pattern is too long. Use 20 characters or fewer.');
		expect(validateGrepRules([{ pattern: 'custom', regex: '\\b[A-Z]{2,}\\b', styleId: 2 }], GREP)).toBeNull();
		expect(validateGrepRules(null, GREP)).toBeNull();
	});

	test('validateEditValues reports a GREP problem after the other fields', () => {
		const values = { name: 'Body', sizeMode: 'inherit', fontVariationSettings: '', grepRules: [{ pattern: 'numbers', styleId: 0 }] };
		expect(validateEditValues(values, { grep: GREP }).field).toBe('grep-0-styleId');
		expect(validateEditValues({ ...values, name: '' }, { grep: GREP }).field).toBe('name');
	});

	test('a server error names the rule field it is about', () => {
		expect(grepErrorField({ field: 'grepRules', ruleIndex: 2, ruleField: 'regex' })).toBe('grep-2-regex');
		expect(grepErrorField({ field: 'grepRules', ruleIndex: 0, ruleField: 'nonsense' })).toBe('grep-0-pattern');
		expect(grepErrorField({ field: 'grepRules', ruleIndex: -1 })).toBeNull();
		expect(grepErrorField({ field: 'basedOn' })).toBeNull();
	});
});

describe('PATCH body', () => {
	const baseline = { name: 'Body', sizeMode: 'inherit', features: [], grepRules: [{ pattern: 'fractions', styleId: 3 }] };

	test('rules are sent only when the list changed', () => {
		expect(buildEditPayload({ ...baseline }, baseline, STYLES[0], 'rem', STYLES).grepRules).toBeUndefined();

		const reordered = { ...baseline, grepRules: [{ pattern: 'fractions', styleId: 3 }, { pattern: 'acronyms', styleId: 2 }] };
		expect(buildEditPayload(reordered, baseline, STYLES[0], 'rem', STYLES).grepRules).toEqual(reordered.grepRules);
		expect(hasUnsavedEditChanges(reordered, baseline, STYLES[0], 'rem', STYLES)).toBe(true);

		const removed = { ...baseline, grepRules: [] };
		expect(buildEditPayload(removed, baseline, STYLES[0], 'rem', STYLES).grepRules).toEqual([]);
	});

	test('a built-in rule never sends an expression typed before switching patterns', () => {
		const values = { ...baseline, grepRules: [{ pattern: 'numbers', regex: 'leftover', styleId: '2' }] };
		expect(buildEditPayload(values, baseline, STYLES[0], 'rem', STYLES).grepRules).toEqual([{ pattern: 'numbers', styleId: 2 }]);
	});
});

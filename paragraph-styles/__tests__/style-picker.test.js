/**
 * Tests for the searchable Paragraph Style picker (#453): the prop builders
 * and the Tab-order fix in paragraph-styles/assets/js/lib/ps-utils.js.
 *
 * The component itself (StylePicker in editor.js) is an IIFE over wp.element
 * and wp.components, neither of which exists under Jest, so everything it
 * decides is decided here. The Tab-order helpers are an ES5 twin of the font
 * picker's (assets/js/font-picker.js); the last block runs both copies on the
 * same DOM.
 */

const {
	normalizeStylePickerValue,
	buildStyleComboboxProps,
	buildStyleSelectProps,
	removeSuggestionsListFromTabOrder,
	watchSuggestionsList,
	isSuggestionsListEmpty,
	guardEnterWithoutMatches,
} = require('../assets/js/lib/ps-utils.js');
const fontPicker = require('../../assets/js/font-picker.js');

// The option list the panel builds: the leading entry is the select's
// "no style" row, then one "Name — Font (weight)" row per style.
const OPTIONS = [
	{ label: 'Select a style…', value: '' },
	{ label: 'Pull quote — Fraunces (600)', value: '12' },
	{ label: 'Body — Inter (400)', value: '7' },
];

const config = (overrides) =>
	Object.assign(
		{
			label: 'Paragraph Style',
			hideLabelFromVision: true,
			placeholder: 'Select a style…',
			value: '',
			options: OPTIONS,
			onChange: () => {},
		},
		overrides
	);

describe('normalizeStylePickerValue', () => {
	test('empty values mean no style', () => {
		expect(normalizeStylePickerValue('')).toBe('');
		expect(normalizeStylePickerValue(null)).toBe('');
		expect(normalizeStylePickerValue(undefined)).toBe('');
		expect(normalizeStylePickerValue(false)).toBe('');
	});

	test('an id comes back as a string', () => {
		expect(normalizeStylePickerValue('12')).toBe('12');
		expect(normalizeStylePickerValue(12)).toBe('12');
	});

	test('a numeric 0 is kept, not swallowed', () => {
		expect(normalizeStylePickerValue(0)).toBe('0');
	});
});

describe('buildStyleComboboxProps', () => {
	test('keeps the accessible name and hides the label from sight (SR-2)', () => {
		const props = buildStyleComboboxProps(config());
		expect(props.label).toBe('Paragraph Style');
		expect(props.hideLabelFromVision).toBe(true);
	});

	test('does not hide the label unless asked', () => {
		expect(buildStyleComboboxProps(config({ hideLabelFromVision: undefined })).hideLabelFromVision).toBe(false);
	});

	test('lists the styles only: the select\'s "no style" row is not a suggestion', () => {
		const props = buildStyleComboboxProps(config());
		expect(props.options.map((o) => o.value)).toEqual(['12', '7']);
		expect(props.options[0].label).toBe('Pull quote — Fraunces (600)');
	});

	test('the labels hold the style name and the font name, which is what the core filter searches', () => {
		const labels = buildStyleComboboxProps(config()).options.map((o) => o.label.toLowerCase());
		expect(labels.filter((l) => l.indexOf('pull') !== -1)).toHaveLength(1);
		expect(labels.filter((l) => l.indexOf('fraunces') !== -1)).toHaveLength(1);
		// the middle of a name, which a native select cannot find
		expect(labels.filter((l) => l.indexOf('quote') !== -1)).toHaveLength(1);
	});

	test('no style selected is null, so the field shows the placeholder', () => {
		expect(buildStyleComboboxProps(config({ value: '' })).value).toBeNull();
		expect(buildStyleComboboxProps(config({ value: null })).value).toBeNull();
		expect(buildStyleComboboxProps(config({ value: undefined })).value).toBeNull();
	});

	test('a selected style is its id as a string', () => {
		expect(buildStyleComboboxProps(config({ value: '12' })).value).toBe('12');
		expect(buildStyleComboboxProps(config({ value: 12 })).value).toBe('12');
	});

	test('passes the placeholder and turns off the reset button core hides while the field is open', () => {
		const props = buildStyleComboboxProps(config());
		expect(props.placeholder).toBe('Select a style…');
		expect(props.allowReset).toBe(false);
	});

	test('onChange receives a normalized string, "" when the control clears itself', () => {
		const seen = [];
		const props = buildStyleComboboxProps(config({ onChange: (v) => seen.push(v) }));
		props.onChange('12');
		props.onChange(null);
		props.onChange(undefined);
		expect(seen).toEqual(['12', '', '']);
	});

	test('does not change the options it was given', () => {
		const given = OPTIONS.slice();
		buildStyleComboboxProps(config({ options: given }));
		expect(given).toEqual(OPTIONS);
	});

	test('survives a missing config and missing options', () => {
		expect(buildStyleComboboxProps().options).toEqual([]);
		expect(buildStyleComboboxProps(config({ options: null })).options).toEqual([]);
	});

	test('a list of several hundred styles is passed whole', () => {
		const many = [{ label: 'Select a style…', value: '' }];
		for (let i = 1; i <= 400; i++) {
			many.push({ label: 'Style ' + i + ' — Font ' + (i % 7) + ' (400)', value: String(i) });
		}
		const props = buildStyleComboboxProps(config({ options: many }));
		expect(props.options).toHaveLength(400);
	});
});

describe('buildStyleSelectProps (the fallback where ComboboxControl is missing)', () => {
	test('is the select the panel showed before #453', () => {
		const props = buildStyleSelectProps(config({ value: '7' }));
		expect(props.label).toBe('Paragraph Style');
		expect(props.hideLabelFromVision).toBe(true);
		expect(props.value).toBe('7');
		expect(props.options).toEqual(OPTIONS);
		expect(props.__nextHasNoMarginBottom).toBe(true);
	});

	test('no style selected is the empty string, which matches the "Select a style…" row', () => {
		expect(buildStyleSelectProps(config({ value: null })).value).toBe('');
		expect(buildStyleSelectProps(config({ value: undefined })).value).toBe('');
	});

	test('onChange receives a normalized string', () => {
		const seen = [];
		const props = buildStyleSelectProps(config({ onChange: (v) => seen.push(v) }));
		props.onChange('12');
		props.onChange('');
		expect(seen).toEqual(['12', '']);
	});
});

describe('suggestions list and the Tab order (SR-5)', () => {
	const wrapper = (html) => {
		const root = document.createElement('div');
		root.innerHTML = html;
		document.body.appendChild(root);
		return root;
	};

	afterEach(() => {
		document.body.innerHTML = '';
	});

	test('a listbox gets tabindex -1', () => {
		const root = wrapper('<ul role="listbox"><li>a</li></ul>');
		expect(removeSuggestionsListFromTabOrder(root)).toBe(1);
		expect(root.querySelector('ul').getAttribute('tabindex')).toBe('-1');
	});

	test('a listbox already at -1 is left alone', () => {
		const root = wrapper('<ul role="listbox" tabindex="-1"></ul>');
		expect(removeSuggestionsListFromTabOrder(root)).toBe(0);
	});

	test('something that is not a listbox is not touched (control)', () => {
		const root = wrapper('<ul><li>a</li></ul><input>');
		expect(removeSuggestionsListFromTabOrder(root)).toBe(0);
		expect(root.querySelector('ul').hasAttribute('tabindex')).toBe(false);
	});

	test('a missing root is a no-op', () => {
		expect(removeSuggestionsListFromTabOrder(null)).toBe(0);
		expect(removeSuggestionsListFromTabOrder({})).toBe(0);
	});

	test('a list added later is adjusted, and stopping the watch stops it', async () => {
		const root = wrapper('<div></div>');
		const stop = watchSuggestionsList(root);
		const list = document.createElement('ul');
		list.setAttribute('role', 'listbox');
		root.appendChild(list);
		await Promise.resolve();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(list.getAttribute('tabindex')).toBe('-1');

		stop();
		const later = document.createElement('ul');
		later.setAttribute('role', 'listbox');
		root.appendChild(later);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(later.hasAttribute('tabindex')).toBe(false);
	});

	test('the watcher without a root returns a cleanup function', () => {
		expect(typeof watchSuggestionsList(null)).toBe('function');
	});
});

describe('Enter with no matching style (core keeps the old highlight)', () => {
	// The picker's markup while the field is open: the input, then core's
	// list. No list means the field is closed.
	const picker = (listHtml) => {
		const root = document.createElement('div');
		root.innerHTML = '<input type="text" />' + (listHtml || '');
		document.body.appendChild(root);
		return root;
	};
	const pressEnter = (target, extra) => {
		const event = new KeyboardEvent('keydown', Object.assign({ key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }, extra));
		target.dispatchEvent(event);
		return event.defaultPrevented;
	};
	afterEach(() => {
		document.body.innerHTML = '';
	});

	test('an open list with no row is empty; a list with rows or no list is not', () => {
		expect(isSuggestionsListEmpty(picker('<ul role="listbox"></ul>'))).toBe(true);
		expect(isSuggestionsListEmpty(picker('<ul role="listbox"><li role="option">Body</li></ul>'))).toBe(false);
		expect(isSuggestionsListEmpty(picker(''))).toBe(false);
		expect(isSuggestionsListEmpty(null)).toBe(false);
	});

	test('Enter in the field is prevented while the open list is empty, so core picks nothing', () => {
		const root = picker('<ul role="listbox"></ul>');
		guardEnterWithoutMatches(root);
		expect(pressEnter(root.querySelector('input'))).toBe(true);
	});

	test('a handler below the wrapper that ignores defaultPrevented (core in WordPress 5.8) never sees the blocked Enter', () => {
		// Core 5.8's onKeyDown picks the highlighted row without checking
		// event.defaultPrevented, so only the stopped propagation keeps it out.
		const seen = (listHtml) => {
			const root = picker(listHtml);
			guardEnterWithoutMatches(root);
			const input = root.querySelector('input');
			let calls = 0;
			input.addEventListener('keydown', () => {
				calls++;
			});
			pressEnter(input);
			return calls;
		};
		expect(seen('<ul role="listbox"></ul>')).toBe(0);
		// control: the same handler sees Enter when the list has a row, and when it is closed
		expect(seen('<ul role="listbox"><li role="option">Body</li></ul>')).toBe(1);
		expect(seen('')).toBe(1);
	});

	test('Enter still reaches core when the list shows a row, or the field is closed', () => {
		const withRow = picker('<ul role="listbox"><li role="option">Body</li></ul>');
		guardEnterWithoutMatches(withRow);
		expect(pressEnter(withRow.querySelector('input'))).toBe(false);

		const closed = picker('');
		guardEnterWithoutMatches(closed);
		expect(pressEnter(closed.querySelector('input'))).toBe(false);
	});

	test('other keys, and Enter that ends an IME composition, are left alone', () => {
		const root = picker('<ul role="listbox"></ul>');
		guardEnterWithoutMatches(root);
		const input = root.querySelector('input');
		expect(pressEnter(input, { key: 'ArrowDown', code: 'ArrowDown' })).toBe(false);
		expect(pressEnter(input, { isComposing: true })).toBe(false);
	});

	test('the guard stops when its cleanup runs, and a missing root is safe', () => {
		const root = picker('<ul role="listbox"></ul>');
		const stop = guardEnterWithoutMatches(root);
		stop();
		expect(pressEnter(root.querySelector('input'))).toBe(false);
		expect(typeof guardEnterWithoutMatches(null)).toBe('function');
	});
});

describe('twin: the font picker\'s Tab-order helpers (assets/js/font-picker.js)', () => {
	const html =
		'<ul role="listbox"></ul><ul role="listbox" tabindex="-1"></ul><ul></ul><div role="listbox"></div><ul role="listbox" tabindex="0"></ul>';
	const run = (fn) => {
		const root = document.createElement('div');
		root.innerHTML = html;
		const changed = fn(root);
		return { changed, html: root.innerHTML };
	};

	test('both copies change the same lists and write the same markup', () => {
		const mine = run(removeSuggestionsListFromTabOrder);
		const theirs = run(fontPicker.removeSuggestionsListFromTabOrder);
		expect(mine.changed).toBeGreaterThan(0);
		expect(mine).toEqual(theirs);
	});

	test('both copies treat a missing root alike', () => {
		[null, undefined, {}].forEach((root) => {
			expect(removeSuggestionsListFromTabOrder(root)).toBe(fontPicker.removeSuggestionsListFromTabOrder(root));
		});
	});

	test('both copies keep a later-added list out of the Tab order alike', async () => {
		const run2 = async (watch) => {
			const root = document.createElement('div');
			document.body.appendChild(root);
			const stop = watch(root);
			root.innerHTML = '<ul role="listbox"></ul><ul></ul>';
			await new Promise((resolve) => setTimeout(resolve, 0));
			const before = root.innerHTML;
			stop();
			root.insertAdjacentHTML('beforeend', '<ul role="listbox"></ul>');
			await new Promise((resolve) => setTimeout(resolve, 0));
			const result = { before, afterStop: root.innerHTML };
			root.remove();
			return result;
		};
		const mine = await run2(watchSuggestionsList);
		const theirs = await run2(fontPicker.watchSuggestionsList);
		expect(mine.before).toContain('tabindex="-1"');
		expect(mine).toEqual(theirs);
	});

	test('both prop builders make the same choices on the shared props', () => {
		const sharedKeys = (props) => ({
			label: props.label,
			hideLabelFromVision: props.hideLabelFromVision,
			value: props.value,
			placeholder: props.placeholder,
			allowReset: props.allowReset,
			expandOnFocus: props.expandOnFocus,
		});
		[
			{ value: '' }, { value: null }, { value: undefined }, { value: '12' }, { value: 12 },
			{ hideLabelFromVision: true }, { hideLabelFromVision: undefined },
		].forEach((extra) => {
			const input = Object.assign({ label: 'L', placeholder: 'P', options: [], onChange: () => {} }, extra);
			const mine = buildStyleComboboxProps(input);
			const theirs = fontPicker.buildComboboxProps(input);
			expect(sharedKeys(mine)).toEqual(sharedKeys(theirs));
		});
		// control: the keys that this test compares are not all undefined
		expect(buildStyleComboboxProps(config({ value: '' })).allowReset).toBe(false);
		expect(buildStyleComboboxProps(config({ value: '' })).value).toBeNull();
	});

	test('neither picker opens its list on focus, so a screen reader reads the field\'s name', () => {
		// With the list open on focus, NVDA in Firefox read "50 results
		// found… list" and the highlighted row, never "Paragraph Style"
		// (SR-2). The list opens on typing or a click.
		const input = { label: 'L', placeholder: 'P', options: [], onChange: () => {} };
		expect(buildStyleComboboxProps(input).expandOnFocus).toBe(false);
		expect(fontPicker.buildComboboxProps(input).expandOnFocus).toBe(false);
	});

	test('differs: the font picker leads its list with a clearing entry, the style picker lists styles only', () => {
		const input = { label: 'L', placeholder: 'P', options: [{ label: 'A', value: '1' }], onChange: () => {} };
		expect(fontPicker.buildComboboxProps(input).options.map((o) => o.value)).toEqual(['', '1']);
		expect(buildStyleComboboxProps(input).options.map((o) => o.value)).toEqual(['1']);
	});

	test('both copies guard Enter alike', () => {
		const lists = ['<ul role="listbox"></ul>', '<ul role="listbox"><li role="option">A</li></ul>', ''];
		const run3 = (guard) =>
			lists.map((listHtml) => {
				const root = document.createElement('div');
				root.innerHTML = '<input type="text" />' + listHtml;
				document.body.appendChild(root);
				const stop = guard(root);
				const input = root.querySelector('input');
				let reached = false;
				input.addEventListener('keydown', () => {
					reached = true;
				});
				const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
				input.dispatchEvent(event);
				stop();
				root.remove();
				return [event.defaultPrevented, reached];
			});
		expect(run3(guardEnterWithoutMatches)).toEqual([[true, false], [false, true], [false, true]]);
		expect(run3(fontPicker.guardEnterWithoutMatches)).toEqual(run3(guardEnterWithoutMatches));
		lists.forEach((listHtml) => {
			const root = document.createElement('div');
			root.innerHTML = listHtml;
			expect(isSuggestionsListEmpty(root)).toBe(fontPicker.isSuggestionsListEmpty(root));
		});
	});

	test('both copies normalize an empty value alike', () => {
		[['', ''], [null, ''], [undefined, ''], [false, ''], ['12', '12'], [12, '12'], [0, '0']].forEach(([input, out]) => {
			expect(normalizeStylePickerValue(input)).toBe(out);
			expect(fontPicker.normalizeFontPickerValue(input)).toBe(out);
		});
	});
});

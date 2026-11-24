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
	TYPING_ANNOUNCE_DELAY,
	readHighlightedOption,
	typingHighlightMessage,
	watchTypingHighlight,
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

/*
 * The combobox as core's ComboboxControl renders it while the list is open:
 * the field names the highlighted row in aria-activedescendant, and the row
 * ids are list positions (#453).
 */
const ROW_LABELS = ['Display Swash — bookmania (700)', 'Body Garamond — EB Garamond (400)', 'Fluid Subhead — Fraunces (600)'];

function comboboxRoot(labels, activeIndex, expanded) {
	const root = document.createElement('div');
	const rows = labels
		.map((label, i) => `<li id="cb-row-${i}" role="option" aria-selected="${i === activeIndex}"><span>${label}</span></li>`)
		.join('');
	root.innerHTML =
		`<input role="combobox" aria-expanded="${expanded === false ? 'false' : 'true'}"` +
		(activeIndex >= 0 ? ` aria-activedescendant="cb-row-${activeIndex}"` : '') +
		`>` +
		(expanded === false ? '' : `<ul role="listbox">${rows}</ul>`);
	document.body.appendChild(root);
	return root;
}

// What core does after typing: new rows, and the highlight on one of them.
function showRows(root, labels, activeIndex) {
	const input = root.querySelector('input');
	let list = root.querySelector('ul');
	if (!list) {
		list = document.createElement('ul');
		list.setAttribute('role', 'listbox');
		root.appendChild(list);
	}
	list.innerHTML = labels.map((label, i) => `<li id="cb-row-${i}" role="option">${label}</li>`).join('');
	input.setAttribute('aria-expanded', 'true');
	if (activeIndex >= 0) {
		input.setAttribute('aria-activedescendant', `cb-row-${activeIndex}`);
	} else {
		input.removeAttribute('aria-activedescendant');
	}
}

function closeList(root) {
	const list = root.querySelector('ul');
	if (list) list.remove();
	root.querySelector('input').setAttribute('aria-expanded', 'false');
	root.querySelector('input').removeAttribute('aria-activedescendant');
}

const typeInto = (root) => root.querySelector('input').dispatchEvent(new Event('input', { bubbles: true }));
const keyDown = (root, key) => root.querySelector('input').dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
const settle = () => new Promise((resolve) => setTimeout(resolve, TYPING_ANNOUNCE_DELAY + 30));

// Runs a watcher with wp.a11y.speak recorded; the callback drives the DOM.
async function withSpeak(watch, drive) {
	const spoken = [];
	const previous = window.wp;
	window.wp = { a11y: { speak: (message, politeness) => spoken.push([message, politeness]) } };
	const root = comboboxRoot([], -1, false);
	const stop = watch(root);
	try {
		await drive(root);
	} finally {
		stop();
		root.remove();
		window.wp = previous;
	}
	return spoken;
}

describe('readHighlightedOption: the row the field names (#453)', () => {
	afterEach(() => {
		document.body.innerHTML = '';
	});

	test('gives the highlighted row\'s label, position and the row count', () => {
		expect(readHighlightedOption(comboboxRoot(ROW_LABELS, 1))).toEqual({ label: ROW_LABELS[1], position: 2, total: 3 });
	});

	test('a closed list has no highlighted row', () => {
		expect(readHighlightedOption(comboboxRoot(ROW_LABELS, 0, false))).toBeNull();
		// a field marked closed whose rows are still in the DOM
		const root = comboboxRoot(ROW_LABELS, 0);
		root.querySelector('input').setAttribute('aria-expanded', 'false');
		expect(readHighlightedOption(root)).toBeNull();
	});

	test('an open list with nothing highlighted (no results) has none', () => {
		expect(readHighlightedOption(comboboxRoot([], -1))).toBeNull();
	});

	test('an id that names no row of this list gives null', () => {
		const root = comboboxRoot(ROW_LABELS, 0);
		root.querySelector('input').setAttribute('aria-activedescendant', 'elsewhere');
		const other = document.createElement('div');
		other.id = 'elsewhere';
		other.textContent = 'Not a row';
		document.body.appendChild(other);
		expect(readHighlightedOption(root)).toBeNull();
	});

	test('a missing root gives null', () => {
		expect(readHighlightedOption(null)).toBeNull();
		expect(readHighlightedOption({})).toBeNull();
	});
});

describe('typingHighlightMessage (#453)', () => {
	test('the label with its position, so the message stands alone', () => {
		expect(typingHighlightMessage({ label: 'Display Swash — bookmania (700)', position: 1, total: 3 }, null)).toBe(
			'Display Swash — bookmania (700), 1 of 3'
		);
	});

	test('nothing for the row last read, or for no row', () => {
		expect(typingHighlightMessage({ label: 'A', position: 1, total: 1 }, 'A')).toBeNull();
		expect(typingHighlightMessage(null, null)).toBeNull();
	});
});

describe('watchTypingHighlight: say the row that typing highlights (#453)', () => {
	test('typing that highlights a row says it, politely, with its position', async () => {
		const spoken = await withSpeak(watchTypingHighlight, async (root) => {
			showRows(root, ROW_LABELS, 0);
			typeInto(root);
			await settle();
		});
		expect(spoken).toEqual([['Display Swash — bookmania (700), 1 of 3', 'polite']]);
	});

	test('a row that an arrow key highlights is not said (the screen reader reads it)', async () => {
		const spoken = await withSpeak(watchTypingHighlight, async (root) => {
			showRows(root, ROW_LABELS, 0);
			keyDown(root, 'ArrowDown');
			await settle();
			showRows(root, ROW_LABELS, 1);
			keyDown(root, 'ArrowDown');
			await settle();
		});
		expect(spoken).toEqual([]);
	});

	test('the same row twice is said once; a new row is said', async () => {
		const spoken = await withSpeak(watchTypingHighlight, async (root) => {
			showRows(root, ROW_LABELS, 0);
			typeInto(root);
			await settle();
			showRows(root, ROW_LABELS.slice(0, 1), 0);
			typeInto(root);
			await settle();
			showRows(root, ROW_LABELS.slice(1), 0);
			typeInto(root);
			await settle();
		});
		expect(spoken.map((s) => s[0])).toEqual(['Display Swash — bookmania (700), 1 of 3', 'Body Garamond — EB Garamond (400), 1 of 2']);
	});

	test('typing that keeps the row an arrow key highlighted says nothing', async () => {
		const spoken = await withSpeak(watchTypingHighlight, async (root) => {
			showRows(root, ROW_LABELS, 0);
			typeInto(root);
			await settle();
			showRows(root, ROW_LABELS, 2);
			keyDown(root, 'ArrowDown');
			await settle();
			showRows(root, ROW_LABELS.slice(1), 1);
			typeInto(root);
			await settle();
		});
		expect(spoken.map((s) => s[0])).toEqual(['Display Swash — bookmania (700), 1 of 3']);
	});

	test('a closed list says nothing', async () => {
		const spoken = await withSpeak(watchTypingHighlight, async (root) => {
			typeInto(root);
			await settle();
		});
		expect(spoken).toEqual([]);
	});

	test('after the list closes, the same row is said again', async () => {
		const spoken = await withSpeak(watchTypingHighlight, async (root) => {
			showRows(root, ROW_LABELS, 0);
			typeInto(root);
			await settle();
			closeList(root);
			await settle();
			showRows(root, ROW_LABELS, 0);
			typeInto(root);
			await settle();
		});
		expect(spoken.map((s) => s[0])).toEqual(['Display Swash — bookmania (700), 1 of 3', 'Display Swash — bookmania (700), 1 of 3']);
	});

	test('a key pressed before the message is due cancels it', async () => {
		const spoken = await withSpeak(watchTypingHighlight, async (root) => {
			showRows(root, ROW_LABELS, 0);
			typeInto(root);
			keyDown(root, 'Enter');
			await settle();
		});
		expect(spoken).toEqual([]);
	});

	test('after the watch stops, typing says nothing', async () => {
		const spoken = [];
		const previous = window.wp;
		window.wp = { a11y: { speak: (message) => spoken.push(message) } };
		const root = comboboxRoot([], -1, false);
		const stop = watchTypingHighlight(root);
		showRows(root, ROW_LABELS, 0);
		typeInto(root);
		stop();
		await settle();
		typeInto(root);
		await settle();
		root.remove();
		window.wp = previous;
		expect(spoken).toEqual([]);
	});

	test('without wp.a11y nothing breaks', async () => {
		const previous = window.wp;
		window.wp = undefined;
		const root = comboboxRoot([], -1, false);
		const stop = watchTypingHighlight(root);
		showRows(root, ROW_LABELS, 0);
		typeInto(root);
		await settle();
		stop();
		root.remove();
		window.wp = previous;
		expect(typeof watchTypingHighlight(null)).toBe('function');
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

	test('both copies read the highlighted row alike', () => {
		const cases = [
			() => comboboxRoot(ROW_LABELS, 0),
			() => comboboxRoot(ROW_LABELS, 2),
			() => comboboxRoot(['  Spaced\n  label  '], 0),
			() => comboboxRoot(ROW_LABELS, 1, false),
			() => comboboxRoot([], -1),
			() => comboboxRoot([''], 0),
		];
		const results = cases.map((make) => {
			const root = make();
			const pair = [readHighlightedOption(root), fontPicker.readHighlightedOption(root)];
			root.remove();
			return pair;
		});
		results.forEach(([mine, theirs]) => expect(mine).toEqual(theirs));
		// control: not every case is null
		expect(results.filter(([mine]) => mine !== null).length).toBe(3);
		expect(results[2][0].label).toBe('Spaced label');
		[null, undefined, {}].forEach((root) => {
			expect(readHighlightedOption(root)).toEqual(fontPicker.readHighlightedOption(root));
		});
	});

	test('both copies word the message alike', () => {
		[
			[{ label: 'A — B (400)', position: 2, total: 5 }, null],
			[{ label: 'A — B (400)', position: 2, total: 5 }, 'A — B (400)'],
			[{ label: '🌐 Inter', position: 1, total: 1 }, 'Other'],
			[null, null],
		].forEach(([row, last]) => {
			expect(typingHighlightMessage(row, last)).toBe(fontPicker.typingHighlightMessage(row, last));
		});
		expect(fontPicker.typingHighlightMessage({ label: 'A', position: 2, total: 5 }, null)).toBe('A, 2 of 5');
		expect(TYPING_ANNOUNCE_DELAY).toBe(fontPicker.TYPING_ANNOUNCE_DELAY);
	});

	test('both watchers say the same things for the same typing and arrow keys', async () => {
		const drive = async (root) => {
			showRows(root, ROW_LABELS, 0);
			typeInto(root);
			await settle();
			showRows(root, ROW_LABELS.slice(0, 2), 0);
			typeInto(root);
			await settle();
			showRows(root, ROW_LABELS.slice(0, 2), 1);
			keyDown(root, 'ArrowDown');
			await settle();
			showRows(root, ROW_LABELS.slice(1), 0);
			typeInto(root);
			await settle();
			showRows(root, ROW_LABELS.slice(2), 0);
			typeInto(root);
			await settle();
			showRows(root, [], -1);
			typeInto(root);
			await settle();
			showRows(root, ROW_LABELS.slice(2), 0);
			typeInto(root);
			await settle();
			closeList(root);
			await settle();
			showRows(root, ROW_LABELS.slice(2), 0);
			typeInto(root);
			await settle();
		};
		const mine = await withSpeak(watchTypingHighlight, drive);
		const theirs = await withSpeak(fontPicker.watchTypingHighlight, drive);
		expect(mine).toEqual([
			['Display Swash — bookmania (700), 1 of 3', 'polite'],
			['Fluid Subhead — Fraunces (600), 1 of 1', 'polite'],
			['Fluid Subhead — Fraunces (600), 1 of 1', 'polite'],
			['Fluid Subhead — Fraunces (600), 1 of 1', 'polite'],
		]);
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

	test('both copies normalize an empty value alike', () => {
		[['', ''], [null, ''], [undefined, ''], [false, ''], ['12', '12'], [12, '12'], [0, '0']].forEach(([input, out]) => {
			expect(normalizeStylePickerValue(input)).toBe(out);
			expect(fontPicker.normalizeFontPickerValue(input)).toBe(out);
		});
	});
});

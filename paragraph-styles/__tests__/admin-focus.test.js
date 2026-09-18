/**
 * Tests for the focus/announcement helpers in paragraph-styles/assets/js/admin.js
 * (QA finding ADM-2). The jQuery wiring is inert here: no jQuery global.
 */

const {
	announce,
	focusEditName,
	focusEditButton,
	focusTargetAfterDelete,
} = require('../assets/js/admin.js');

function buildCard(id, name) {
	const card = document.createElement('div');
	card.className = 'typost-ps-style-card';
	card.setAttribute('data-style-id', String(id));
	card.innerHTML =
		'<div class="typost-ps-style-card-header">' +
		'<h3 class="typost-ps-style-name">' + name + '</h3>' +
		'<div class="typost-ps-style-actions">' +
		'<button type="button" class="button typost-ps-edit-btn">Edit</button>' +
		'<button type="button" class="button typost-ps-delete-btn">Delete</button>' +
		'</div></div>' +
		'<div class="typost-ps-edit-form"><label>Name: <input type="text" class="typost-ps-edit-name" value="' + name + '" /></label></div>';
	return card;
}

function buildList(names) {
	const list = document.createElement('div');
	list.id = 'typost-ps-styles-list';
	names.forEach((name, i) => list.appendChild(buildCard(i + 1, name)));
	document.body.appendChild(list);
	return list;
}

afterEach(() => {
	document.body.innerHTML = '';
	delete window.wp;
});

describe('focusEditName', () => {
	test('moves focus to the name input and selects its text', () => {
		const list = buildList(['Display Swash']);
		const card = list.firstChild;
		const input = focusEditName(card);
		expect(document.activeElement).toBe(input);
		expect(input.selectionStart).toBe(0);
		expect(input.selectionEnd).toBe('Display Swash'.length);
	});

	test('returns null when the card has no input', () => {
		expect(focusEditName(null)).toBeNull();
		expect(focusEditName(document.createElement('div'))).toBeNull();
	});
});

describe('focusEditButton', () => {
	test('returns focus to the Edit button', () => {
		const list = buildList(['A']);
		const button = focusEditButton(list.firstChild);
		expect(document.activeElement).toBe(button);
	});
});

describe('focusTargetAfterDelete', () => {
	test('prefers the next card\'s Edit button', () => {
		const list = buildList(['A', 'B', 'C']);
		const target = focusTargetAfterDelete(list.children[1], list);
		expect(target.closest('.typost-ps-style-card')).toBe(list.children[2]);
		expect(target.classList.contains('typost-ps-edit-btn')).toBe(true);
	});

	test('falls back to the previous card for the last one', () => {
		const list = buildList(['A', 'B']);
		const target = focusTargetAfterDelete(list.children[1], list);
		expect(target.closest('.typost-ps-style-card')).toBe(list.children[0]);
	});

	test('falls back to the list container, made focusable, for the only card', () => {
		const list = buildList(['A']);
		const target = focusTargetAfterDelete(list.children[0], list);
		expect(target).toBe(list);
		expect(list.getAttribute('tabindex')).toBe('-1');
		list.children[0].remove();
		target.focus();
		expect(document.activeElement).toBe(list);
	});

	test('returns null without a list', () => {
		expect(focusTargetAfterDelete(document.createElement('div'), null)).toBeNull();
	});
});

describe('announce', () => {
	test('speaks politely through wp.a11y when present', () => {
		const speak = jest.fn();
		window.wp = { a11y: { speak } };
		announce('Style "A" deleted.');
		expect(speak).toHaveBeenCalledWith('Style "A" deleted.', 'polite');
	});

	test('is a no-op without wp.a11y', () => {
		expect(() => announce('x')).not.toThrow();
	});
});

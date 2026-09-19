/**
 * Tests for the pure helpers in assets/js/admin-page.js.
 *
 * The file's jQuery(document).ready block is inert under test: jQuery is
 * stubbed before require so loading the module only registers the exports.
 */

global.jQuery = jest.fn(() => ({ ready: jest.fn(), on: jest.fn() }));

const {
	formatDetectWeightsSummary,
	mergeAdminRefreshData,
	resolvePreviewSelection,
	attachDismissButtons,
	clearSettingsMessages,
} = require('../admin-page.js');

describe('formatDetectWeightsSummary', () => {
	const template = 'Weights detected for %1$s font(s); %2$s kept all weights; %3$s could not be checked.';

	test('fills all three counts from the response arrays', () => {
		const message = formatDetectWeightsSummary(
			{
				updated: [{ id: 'a' }, { id: 'b' }],
				defaulted: [{ id: 'c' }],
				failed: [],
			},
			template
		);

		expect(message).toBe('Weights detected for 2 font(s); 1 kept all weights; 0 could not be checked.');
	});

	test('treats missing arrays as zero', () => {
		expect(formatDetectWeightsSummary({}, template)).toBe(
			'Weights detected for 0 font(s); 0 kept all weights; 0 could not be checked.'
		);
		expect(formatDetectWeightsSummary(null, template)).toBe(
			'Weights detected for 0 font(s); 0 kept all weights; 0 could not be checked.'
		);
	});

	test('counts failed fonts', () => {
		const message = formatDetectWeightsSummary(
			{ updated: [], defaulted: [], failed: [{ id: 'x' }, { id: 'y' }] },
			template
		);

		expect(message).toBe('Weights detected for 0 font(s); 0 kept all weights; 2 could not be checked.');
	});
});

describe('mergeAdminRefreshData', () => {
	test('copies only the known data keys from the payload', () => {
		const adminData = {
			restUrl: '/wp-json/typost/v1/',
			fonts: [{ id: 'kit-1' }],
			adobeFonts: [],
			strings: { a: 'b' },
		};
		const payload = {
			fonts: [{ id: 'kit-1' }, { id: 'kit-2' }],
			adobeFonts: [{ id: 'adobe-1' }],
			manualFonts: [],
			fontFeatureVisibility: { 3: { disabled_features: ['liga'] } },
			fontOrder: ['font-2', 'font-1'],
			wpFontLibraryFonts: [{ slug: 'inter' }],
			fontListHtml: '<ul></ul>',
			adminFontCss: '@font-face {}',
		};

		mergeAdminRefreshData(adminData, payload);

		expect(adminData.fonts).toHaveLength(2);
		expect(adminData.adobeFonts).toEqual([{ id: 'adobe-1' }]);
		expect(adminData.manualFonts).toEqual([]);
		expect(adminData.fontFeatureVisibility).toEqual({ 3: { disabled_features: ['liga'] } });
		expect(adminData.fontOrder).toEqual(['font-2', 'font-1']);
		expect(adminData.wpFontLibraryFonts).toEqual([{ slug: 'inter' }]);
		// HTML/CSS payload members must not leak into typostAdmin
		expect(adminData.fontListHtml).toBeUndefined();
		expect(adminData.adminFontCss).toBeUndefined();
		// Unrelated existing keys are untouched
		expect(adminData.restUrl).toBe('/wp-json/typost/v1/');
		expect(adminData.strings).toEqual({ a: 'b' });
	});

	test('leaves keys absent from the payload unchanged', () => {
		const adminData = { fonts: [{ id: 'kit-1' }], manualFonts: [{ id: 'manual-9' }] };

		mergeAdminRefreshData(adminData, { fonts: [] });

		expect(adminData.fonts).toEqual([]);
		expect(adminData.manualFonts).toEqual([{ id: 'manual-9' }]);
	});

	test('tolerates null inputs', () => {
		expect(mergeAdminRefreshData(null, { fonts: [] })).toBeNull();
		const adminData = { fonts: [] };
		expect(mergeAdminRefreshData(adminData, null)).toBe(adminData);
	});
});

describe('resolvePreviewSelection', () => {
	const options = ['', 'Alfarn', 'Gopher', 'proxima-nova'];

	test('keeps the current selection when still available', () => {
		expect(resolvePreviewSelection('Gopher', options)).toBe('Gopher');
	});

	test('falls back to the first font when the selection was removed', () => {
		expect(resolvePreviewSelection('DeletedFont', options)).toBe('Alfarn');
	});

	test('auto-selects the first font when nothing was selected (mirrors page load)', () => {
		expect(resolvePreviewSelection('', options)).toBe('Alfarn');
	});

	test('returns the default when no fonts remain', () => {
		expect(resolvePreviewSelection('Gopher', [''])).toBe('');
		expect(resolvePreviewSelection('', [])).toBe('');
	});
});

describe('attachDismissButtons', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	test('adds one button per is-dismissible notice without one, only inside the scope', () => {
		document.body.innerHTML =
			'<div id="scope">' +
			'<div class="notice notice-success is-dismissible" id="a"><p>A</p></div>' +
			'<div class="notice notice-info is-dismissible" id="b"><p>B</p><button type="button" class="notice-dismiss"></button></div>' +
			'<div class="notice notice-warning" id="c"><p>C</p></div>' +
			'</div>' +
			'<div class="notice notice-error is-dismissible" id="outside"><p>D</p></div>';

		const added = attachDismissButtons(document.getElementById('scope'), 'Dismiss this notice.');

		expect(added).toBe(1);
		expect(document.querySelectorAll('#a .notice-dismiss')).toHaveLength(1);
		// Already had a button: not doubled
		expect(document.querySelectorAll('#b .notice-dismiss')).toHaveLength(1);
		// Not dismissible: untouched
		expect(document.querySelectorAll('#c .notice-dismiss')).toHaveLength(0);
		// Outside the scope: untouched
		expect(document.querySelectorAll('#outside .notice-dismiss')).toHaveLength(0);

		const button = document.querySelector('#a .notice-dismiss');
		expect(button.getAttribute('type')).toBe('button');
		expect(button.querySelector('.screen-reader-text').textContent).toBe('Dismiss this notice.');
	});

	test('treats a notice passed as the scope as its own target (the deletion notice case)', () => {
		document.body.innerHTML = '<div class="notice notice-success is-dismissible" id="solo"><p>Font deleted successfully!</p></div>';
		const notice = document.getElementById('solo');

		expect(attachDismissButtons(notice, 'Dismiss this notice.')).toBe(1);
		expect(notice.querySelectorAll('.notice-dismiss')).toHaveLength(1);
		// Idempotent
		expect(attachDismissButtons(notice, 'Dismiss this notice.')).toBe(0);
		expect(notice.querySelectorAll('.notice-dismiss')).toHaveLength(1);
	});

	test('clicking the button removes the notice, or hands it to the dismiss callback', () => {
		document.body.innerHTML =
			'<div class="notice is-dismissible" id="plain"><p>x</p></div>' +
			'<div class="notice is-dismissible" id="custom"><p>y</p></div>';

		attachDismissButtons(document.getElementById('plain'), 'Dismiss');
		document.querySelector('#plain .notice-dismiss').click();
		expect(document.getElementById('plain')).toBeNull();

		const dismiss = jest.fn();
		const custom = document.getElementById('custom');
		attachDismissButtons(custom, 'Dismiss', dismiss);
		document.querySelector('#custom .notice-dismiss').click();
		expect(dismiss).toHaveBeenCalledWith(custom);
		// The callback owns removal
		expect(document.getElementById('custom')).toBe(custom);
	});

	test('falls back to the English label and tolerates a missing scope', () => {
		document.body.innerHTML = '<div class="notice is-dismissible" id="n"><p>x</p></div>';
		attachDismissButtons(document.getElementById('n'), '');
		expect(document.querySelector('#n .screen-reader-text').textContent).toBe('Dismiss this notice.');
		expect(attachDismissButtons(null, 'Dismiss')).toBe(0);
	});
});

describe('clearSettingsMessages', () => {
	beforeEach(() => {
		document.body.innerHTML =
			'<form id="options"><div class="typost-settings-ajax-message" role="status" aria-live="polite"><div class="notice notice-success"><p>Options saved successfully.</p></div></div></form>' +
			'<form id="a11y"><div class="typost-settings-ajax-message" role="status" aria-live="polite"><div class="notice notice-success"><p>Accessibility settings saved successfully.</p></div></div></form>' +
			'<form id="cache"><div class="typost-settings-ajax-message" role="status" aria-live="polite"></div></form>';
	});

	test('empties every other message container but keeps the live-region wrappers', () => {
		const keep = document.querySelector('#cache .typost-settings-ajax-message');

		const cleared = clearSettingsMessages(document, keep);

		expect(cleared).toBe(2);
		expect(document.querySelector('#options .typost-settings-ajax-message').textContent).toBe('');
		expect(document.querySelector('#a11y .typost-settings-ajax-message').textContent).toBe('');
		// Containers stay in the DOM with their role so the next message is still announced
		expect(document.querySelectorAll('.typost-settings-ajax-message[role="status"]')).toHaveLength(3);
	});

	test('leaves the kept container untouched', () => {
		const keep = document.querySelector('#options .typost-settings-ajax-message');
		clearSettingsMessages(document, keep);
		expect(keep.textContent).toBe('Options saved successfully.');
	});

	test('clears all containers when nothing is kept, and tolerates a missing root', () => {
		expect(clearSettingsMessages(document)).toBe(3);
		expect(document.querySelector('#options .typost-settings-ajax-message').textContent).toBe('');
		expect(clearSettingsMessages(null)).toBe(0);
	});
});

describe('beginBusy / endBusy (E-17: busy controls keep focus)', () => {
	const { beginBusy, endBusy } = require('../admin-page.js');

	function button(text) {
		const el = document.createElement('button');
		el.type = 'button';
		el.textContent = text;
		document.body.appendChild(el);
		return el;
	}

	afterEach(() => {
		document.body.innerHTML = '';
	});

	it('marks the control busy without setting the disabled property', () => {
		const el = button('Save');
		el.focus();
		expect(beginBusy(el, 'Saving…')).toBe(true);
		expect(el.disabled).toBe(false);
		expect(el.getAttribute('aria-disabled')).toBe('true');
		expect(el.getAttribute('aria-busy')).toBe('true');
		expect(el.classList.contains('typost-busy')).toBe(true);
		expect(el.textContent).toBe('Saving…');
		expect(document.activeElement).toBe(el);
	});

	it('refuses a second activation while busy', () => {
		const el = button('Save');
		expect(beginBusy(el, 'Saving…')).toBe(true);
		expect(beginBusy(el, 'Saving…')).toBe(false);
	});

	it('restores the saved label and clears the state', () => {
		const el = button('Save');
		beginBusy(el, 'Saving…');
		endBusy(el);
		expect(el.textContent).toBe('Save');
		expect(el.hasAttribute('aria-disabled')).toBe(false);
		expect(el.hasAttribute('aria-busy')).toBe(false);
		expect(el.classList.contains('typost-busy')).toBe(false);
		expect(beginBusy(el, 'Saving…')).toBe(true);
	});

	it('uses an explicit label when given and leaves checkbox text alone', () => {
		const el = button('Save');
		beginBusy(el, 'Saving…');
		endBusy(el, 'Save Changes');
		expect(el.textContent).toBe('Save Changes');
		const box = document.createElement('input');
		box.type = 'checkbox';
		document.body.appendChild(box);
		expect(beginBusy(box)).toBe(true);
		expect(box.disabled).toBe(false);
		expect(box.getAttribute('aria-disabled')).toBe('true');
		endBusy(box);
		expect(box.hasAttribute('aria-disabled')).toBe(false);
	});

	it('accepts a jQuery-like wrapper and tolerates nothing at all', () => {
		const el = button('Go');
		expect(beginBusy({ jquery: '3', 0: el, length: 1 }, 'Working')).toBe(true);
		expect(el.textContent).toBe('Working');
		expect(beginBusy(null)).toBe(true);
		expect(() => endBusy(undefined)).not.toThrow();
	});
});

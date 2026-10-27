/**
 * Tests for the pure helpers in assets/js/admin-page.js.
 *
 * The file's jQuery(document).ready block is inert under test: jQuery is
 * stubbed before require so loading the module only registers the exports.
 */

global.jQuery = jest.fn(() => ({ ready: jest.fn(), on: jest.fn() }));

const {
	formatDetectWeightsSummary,
	withUserLocale,
	mergeAdminRefreshData,
	resolvePreviewSelection,
	attachDismissButtons,
	clearSettingsMessages,
	createRefreshQueue,
} = require('../admin-page.js');

describe('createRefreshQueue (#308)', () => {
	// Records each started refresh; finish(i, failed) completes the i-th one.
	function setup() {
		const runs = [];
		const request = createRefreshQueue((message, done) => {
			runs.push({ message, done });
		});
		return { runs, request, finish: (i, failed) => runs[i].done(failed) };
	}

	test('runs a request at once when nothing is running', () => {
		const { runs, request } = setup();
		request('Font deleted.');
		expect(runs).toHaveLength(1);
		expect(runs[0].message).toBe('Font deleted.');
	});

	test('a request during a refresh runs one more refresh after it', () => {
		const { runs, request, finish } = setup();
		request();
		request();
		expect(runs).toHaveLength(1);
		finish(0);
		expect(runs).toHaveLength(2);
		expect(runs[1].message).toBe('');
	});

	test('three requests during one refresh give exactly one more refresh', () => {
		const { runs, request, finish } = setup();
		request();
		request();
		request();
		request();
		finish(0);
		expect(runs).toHaveLength(2);
		finish(1);
		expect(runs).toHaveLength(2);
	});

	test('keeps the message of a request that arrives during a refresh', () => {
		const { runs, request, finish } = setup();
		request();
		request('Font deleted.');
		request();
		request('Font deleted.');
		request('Other.');
		finish(0);
		expect(runs[1].message).toBe('Font deleted. Other.');
	});

	test('drops the follow-up when the refresh failed (the page reloads)', () => {
		const { runs, request, finish } = setup();
		request();
		request('Font deleted.');
		finish(0, true);
		expect(runs).toHaveLength(1);
		request();
		expect(runs).toHaveLength(2);
		expect(runs[1].message).toBe('');
	});

	test('a request after the follow-up started waits for it', () => {
		const { runs, request, finish } = setup();
		request();
		request();
		finish(0);
		request('Late.');
		expect(runs).toHaveLength(2);
		finish(1);
		expect(runs).toHaveLength(3);
		expect(runs[2].message).toBe('Late.');
	});
});

describe('withUserLocale', () => {
	test.each([
		['http://example.test/wp-json/typost/v1/admin/refresh', 'http://example.test/wp-json/typost/v1/admin/refresh?_locale=user'],
		['http://example.test/?rest_route=/typost/v1/admin/refresh', 'http://example.test/?rest_route=/typost/v1/admin/refresh&_locale=user'],
	])('%s', (url, expected) => {
		expect(withUserLocale(url)).toBe(expected);
	});
});

describe('withUserLocale twins', () => {
	// The Paragraph Styles and Variable Fonts modules keep their own copy.
	// The Variable Fonts script is an IIFE with no exports, so its copy is
	// read from the source and evaluated.
	const path = require('path');
	const psWithUserLocale = require(path.resolve(__dirname, '../../../paragraph-styles/assets/js/admin.js')).withUserLocale;
	const vfSource = require('fs').readFileSync(path.resolve(__dirname, '../../../variable-fonts/assets/js/admin.js'), 'utf8');
	const vfWithUserLocale = new Function(vfSource.match(/function withUserLocale\(url\) \{[\s\S]*?\n {4}\}/)[0] + '\nreturn withUserLocale;')();

	test.each([
		'http://example.test/wp-json/typost/v1/admin/refresh',
		'http://example.test/?rest_route=/typost/v1/admin/refresh',
		'/wp-json/typost/v1/paragraph-styles/4',
	])('%s', (url) => {
		expect(psWithUserLocale(url)).toBe(withUserLocale(url));
		expect(vfWithUserLocale(url)).toBe(withUserLocale(url));
	});
});

describe('REST requests ask for the user\'s language (#296)', () => {
	// determine_locale() reads _locale=user only on a JSON request, so every
	// call needs the URL parameter and dataType: 'json' (the Accept header).
	const source = require('fs').readFileSync(require('path').resolve(__dirname, '../admin-page.js'), 'utf8');
	const calls = source.split('$.ajax({').slice(1).map((rest) => rest.slice(0, rest.indexOf('});')));

	test('the file makes REST calls', () => {
		expect(calls.length).toBeGreaterThan(20);
	});

	test.each(calls.map((call) => [call.match(/url: (.*),/)[1], call]))('%s', (url, call) => {
		expect(url).toMatch(/^typostWithUserLocale\(typostAdmin\.restUrl \+ .*\)$/);
		expect(call).toMatch(/\bdataType: 'json',/);
	});
});

describe('decodeEntities (#307)', () => {
	const { decodeEntities } = require('../admin-page.js');

	test.each([
		// esc_html__() output, as typostAdmin.strings and WP_Error messages arrive.
		['Paramètres d&#039;accessibilité enregistrés avec succès.', 'Paramètres d\'accessibilité enregistrés avec succès.'],
		['Polices &amp; styles', 'Polices & styles'],
		['&quot;Titre&quot;', '"Titre"'],
		// Strings that show correctly now keep showing correctly.
		['Veuillez coller le code d\'intégration Adobe Fonts.', 'Veuillez coller le code d\'intégration Adobe Fonts.'],
		['Saved', 'Saved'],
		['', ''],
	])('%s', (input, expected) => {
		expect(decodeEntities(input)).toBe(expected);
	});

	test('returns non-string values as is', () => {
		expect(decodeEntities(undefined)).toBeUndefined();
		expect(decodeEntities(null)).toBeNull();
	});

	test('adds no markup: encoded tags come back as text, real tags stay literal', () => {
		window.typostXss = false;
		expect(decodeEntities('&lt;b&gt;x&lt;/b&gt;')).toBe('<b>x</b>');
		expect(decodeEntities('<img src=x onerror="window.typostXss=true">&amp;')).toBe('<img src=x onerror="window.typostXss=true">&');
		expect(window.typostXss).toBe(false);
		delete window.typostXss;
	});

	test('decodes the busy label', () => {
		const { beginBusy, endBusy } = require('../admin-page.js');
		const el = document.createElement('button');
		el.textContent = 'Save';
		beginBusy(el, 'Enregistrement d&#039;abord…');
		expect(el.textContent).toBe('Enregistrement d\'abord…');
		endBusy(el);
		expect(el.textContent).toBe('Save');
	});

	test('restores a label read back with .text() without decoding it again', () => {
		const { beginBusy, endBusy } = require('../admin-page.js');
		const el = document.createElement('button');
		// The button shows the literal text "&lt;h2&gt;" (encoded twice in the HTML).
		el.textContent = 'Use &lt;h2&gt;';
		const originalLabel = el.textContent;
		beginBusy(el, 'Saving…');
		endBusy(el, originalLabel);
		expect(el.textContent).toBe('Use &lt;h2&gt;');
	});

	describe('every text sink decodes first (source scan)', () => {
		const source = require('fs').readFileSync(require('path').resolve(__dirname, '../admin-page.js'), 'utf8');
		const lines = source.split('\n').filter((line) => !/^\s*(\*|\/\/)/.test(line));

		test('every alert() and confirm() decodes its message', () => {
			const dialogs = lines.filter((line) => /\b(alert|confirm)\(/.test(line));
			expect(dialogs.length).toBeGreaterThan(10);
			dialogs.forEach((line) => {
				expect(line).toMatch(/\b(alert|confirm)\(typostDecodeEntities\(/);
			});
		});

		// Values that are not esc_html__() output: text read back from the DOM
		// (already decoded), numbers, file names, __() category titles, and
		// values the function has already decoded.
		const allowedSinkValues = [
			/^text;/, // typostEndBusy(): callers decode (see its docblock)
			/^saved;/, // typostEndBusy(): data-typost-label, read from the DOM
			/^''[);]/,
			/^titles\[cat\] \|\|/, // __() category titles: not entity-encoded
			/^feature\.id;/,
			/^message\)/, // announce(): decoded on entry
			/^css \|\| '';/,
			/^file\.name\)/,
			/^'\(' \+ formatFileSize\(/,
			/^(size|saved|width) \+ 'px'\)/,
			/^(customText|defaultText|baselineDefault)\)/, // the author's preview text
			/^deleteModalDefaults\.title\)/, // read with .text() at load
		];

		// The start of every value passed to .text() or assigned to textContent,
		// whitespace collapsed, so a call split over lines is seen too.
		function findTextSinks(code) {
			const sinkPattern = /\.text\(\s*(?!\))|\.textContent\s*=(?!=)\s*/g;
			const sinks = [];
			while (sinkPattern.exec(code) !== null) {
				sinks.push(code.slice(sinkPattern.lastIndex, sinkPattern.lastIndex + 80).replace(/\s+/g, ' '));
			}
			return sinks;
		}

		function findUncheckedSinks(code) {
			return findTextSinks(code).filter((arg) => !/^typostDecodeEntities\(/.test(arg) && !allowedSinkValues.some((re) => re.test(arg)));
		}

		test('every .text() and textContent sink decodes its value or is a known non-localized value', () => {
			const code = lines.join('\n');
			expect(findTextSinks(code).length).toBeGreaterThan(30);
			expect(findUncheckedSinks(code)).toEqual([]);
		});

		test('the sink scan catches a sink that skips the decoder (control)', () => {
			const planted = [
				"$el.text(successMsg);",
				"$el.text(\n    typostAdmin.strings.saved\n);",
				"el.textContent = typostAdmin.strings.saved;",
				"$el.text(typostDecodeEntities(successMsg));",
			].join('\n');
			expect(findUncheckedSinks(planted)).toEqual([
				expect.stringMatching(/^successMsg\);/),
				expect.stringMatching(/^typostAdmin\.strings\.saved \);/),
				expect.stringMatching(/^typostAdmin\.strings\.saved;/),
			]);
		});

		test('every typostEndBusy() label is decoded or read back from the DOM', () => {
			const calls = lines.filter((line) => /typostEndBusy\(\$\w+(\.find\([^)]*\))?, /.test(line));
			expect(calls.length).toBeGreaterThan(15);
			calls.forEach((line) => {
				expect(line).toMatch(/typostEndBusy\([^,]+, (typostDecodeEntities\(|originalLabel\)|originalText\)|deleteModalDefaults\.confirmLabel\))/);
			});
		});
	});
});

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

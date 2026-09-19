/**
 * Behavior tests for handlers registered inside the jQuery(document).ready
 * block of assets/js/admin-page.js.
 *
 * jQuery is not installed in node_modules, so a minimal chainable stand-in
 * is installed before require: every jQuery call returns a Proxy whose
 * methods are no-ops returning itself, `.ready()` runs the block right away,
 * `.on()` records the registered handlers, and `$.ajax` is a mock. Elements
 * registered through `$.wrap(element, wrapper)` come back as that wrapper so
 * a test can observe the calls a handler makes on them.
 */

function createFakeJQuery() {
	const handlers = [];
	const wrappers = new Map();

	function makeChain() {
		const proxy = new Proxy(function () {}, {
			get(target, prop) {
				if (typeof prop === 'symbol' || prop === 'then') {
					return undefined;
				}
				if (prop === 'length') {
					return 0;
				}
				if (prop === 'toString' || prop === 'valueOf') {
					return () => '';
				}
				if (prop === 'ready') {
					return (fn) => {
						fn($);
						return proxy;
					};
				}
				if (prop === 'on') {
					return function (event, selector, handler) {
						if (typeof selector === 'function') {
							handlers.push({ event, selector: null, handler: selector });
						} else {
							handlers.push({ event, selector, handler });
						}
						return proxy;
					};
				}
				return () => proxy;
			},
			apply() {
				return proxy;
			},
		});
		return proxy;
	}

	const $ = function (arg) {
		if (wrappers.has(arg)) {
			return wrappers.get(arg);
		}
		return makeChain();
	};
	$.ajax = jest.fn();
	$.each = (obj, cb) => {
		Object.keys(obj).forEach((key) => cb(key, obj[key]));
	};
	$.contains = () => false;
	$.when = () => makeChain();
	$.fn = {};
	$.handlers = handlers;
	$.wrap = (element, wrapper) => wrappers.set(element, wrapper);
	return $;
}

function findHandler($, event, selector) {
	const match = $.handlers.find((h) => h.event === event && h.selector === selector);
	if (!match) {
		throw new Error('No handler registered for ' + event + ' ' + selector);
	}
	return match.handler;
}

let $;

beforeEach(() => {
	jest.resetModules();
	$ = createFakeJQuery();
	global.jQuery = $;
	global.alert = jest.fn();
	global.confirm = jest.fn(() => true);
	global.typostAdmin = {
		restUrl: '/wp-json/typost/v1/',
		nonce: 'nonce',
		strings: {},
		fonts: [],
		adobeFonts: [],
		manualFonts: [],
	};
	require('../admin-page.js');
	$.ajax.mockClear();
});

describe('Replacements tab: toggle global load (E-15)', () => {
	test('reverts the checkbox when the PATCH fails, even though jQuery calls error() with the settings object as `this`', () => {
		const handler = findHandler($, 'change', '.typost-toggle-global-load');
		const checkbox = {};
		const wrapper = {
			data: jest.fn(() => 42),
			is: jest.fn(() => true),
			prop: jest.fn(),
		};
		$.wrap(checkbox, wrapper);

		handler.call(checkbox);

		expect($.ajax).toHaveBeenCalledTimes(1);
		const settings = $.ajax.mock.calls[0][0];
		expect(settings.method).toBe('PATCH');
		expect(settings.url).toBe('/wp-json/typost/v1/font-replacements/42');
		expect(JSON.parse(settings.data)).toEqual({ global_load: true });

		// jQuery invokes ajax callbacks with the settings object as `this`
		settings.error.call(settings, { status: 500 });

		expect(wrapper.prop).toHaveBeenCalledWith('checked', false);
		expect(global.alert).toHaveBeenCalledWith('Failed to update global load setting.');
	});

	test('reverts to checked when unchecking failed, and uses the localized error when present', () => {
		global.typostAdmin.strings.globalLoadUpdateError = 'Localized failure.';
		const handler = findHandler($, 'change', '.typost-toggle-global-load');
		const checkbox = {};
		const wrapper = {
			data: jest.fn(() => 7),
			is: jest.fn(() => false),
			prop: jest.fn(),
		};
		$.wrap(checkbox, wrapper);

		handler.call(checkbox);
		const settings = $.ajax.mock.calls[0][0];
		settings.error.call(settings, {});

		expect(wrapper.prop).toHaveBeenCalledWith('checked', true);
		expect(global.alert).toHaveBeenCalledWith('Localized failure.');
	});
});

describe('Replacements tab: localized strings with English fallbacks (E-15)', () => {
	test('remove-replacement confirm and error use typostAdmin.strings when set, English otherwise', () => {
		const handler = findHandler($, 'click', '.typost-delete-replacement');
		const button = {};
		$.wrap(button, { data: jest.fn(() => 3) });

		handler.call(button);
		expect(global.confirm).toHaveBeenCalledWith('Remove this font replacement mapping?');
		let settings = $.ajax.mock.calls[0][0];
		expect(settings.method).toBe('DELETE');
		settings.error.call(settings, {});
		expect(global.alert).toHaveBeenCalledWith('Failed to remove replacement.');

		global.typostAdmin.strings.confirmRemoveReplacement = 'Confirmar?';
		global.typostAdmin.strings.removeReplacementError = 'Fallo.';
		handler.call(button);
		expect(global.confirm).toHaveBeenLastCalledWith('Confirmar?');
		settings = $.ajax.mock.calls[1][0];
		settings.error.call(settings, {});
		expect(global.alert).toHaveBeenLastCalledWith('Fallo.');
	});

	test('rejects a zero font ID with the localized message and sends no request', () => {
		global.typostAdmin.strings.invalidFontId = 'ID no valido.';
		const handler = findHandler($, 'click', '.typost-delete-replacement');
		const button = {};
		$.wrap(button, { data: jest.fn(() => 0) });

		handler.call(button);

		expect(global.alert).toHaveBeenCalledWith('ID no valido.');
		expect($.ajax).not.toHaveBeenCalled();
	});
});

/**
 * The inline editor registers its extension listeners while it is mounted
 * (#386): the typost_current_editor_state filter, the
 * typost-apply-block-properties, typost-insert-content and
 * typost-convert-to-block events, and the typost_glyphs_panel_closed,
 * typost_extension_panel_closed and typost_editor_toolbar_buttons_changed
 * actions.
 *
 * With SCRIPT_DEBUG on, WordPress loads the development build of React, and
 * StrictMode constructs the component twice and runs mount, unmount, mount
 * on the instance it keeps. The constructor used to register the listeners,
 * so they stayed on the instance that was thrown away and the mounted one
 * had none. Jest runs the development build of React too, so the second
 * part of this file renders the real component in StrictMode.
 */

const React = require('react');
const { createRoot } = require('react-dom/client');
const { act } = require('react');
const { createHookRegistry } = require('../inline-editor/hook-registry.js');
const { createExtensionListeners, attachExtensionListeners, detachExtensionListeners } = require('../inline-editor/extension-listeners.js');

const HOOK_NAMES = {
	filter: [ 'typost_current_editor_state' ],
	action: [ 'typost_glyphs_panel_closed', 'typost_extension_panel_closed', 'typost_editor_toolbar_buttons_changed' ],
};
const EVENT_NAMES = [ 'typost-apply-block-properties', 'typost-insert-content', 'typost-convert-to-block' ];

// What each name holds in the registry, as instance field names
const FIELD_FOR = {
	'typost_current_editor_state': '_stateProviderFilter',
	'typost_glyphs_panel_closed': '_handleGlyphsClosed',
	'typost_extension_panel_closed': '_handleGlyphsClosed',
	'typost_editor_toolbar_buttons_changed': '_handleToolbarButtonsChanged',
	'typost-apply-block-properties': '_handleApplyBlockProperties',
	'typost-insert-content': '_handleInsertContent',
	'typost-convert-to-block': '_handleConvertRequest',
};

// The callbacks registered for each name: the registry's own lists, and the
// document listeners as the add and remove calls leave them
function registrations(hooks, docCalls) {
	const out = {};
	HOOK_NAMES.filter.forEach((name) => { out[name] = (hooks._filters[name] || []).map((h) => h.callback); });
	HOOK_NAMES.action.forEach((name) => { out[name] = (hooks._actions[name] || []).map((h) => h.callback); });
	EVENT_NAMES.forEach((name) => {
		const live = [];
		docCalls.forEach(([ op, type, fn ]) => {
			if (type !== name) {
				return;
			}
			if (op === 'add' && !live.includes(fn)) {
				live.push(fn);
			} else if (op === 'remove' && live.includes(fn)) {
				live.splice(live.indexOf(fn), 1);
			}
		});
		out[name] = live;
	});
	return out;
}

// The registrations of each name, as the names of the instances that own
// them ('other' for a callback of none of them)
function owners(current, instances) {
	const out = {};
	Object.keys(FIELD_FOR).forEach((name) => {
		out[name] = current[name].map((fn) => {
			const owner = Object.keys(instances).find((label) => instances[label][FIELD_FOR[name]] === fn);
			return owner || 'other';
		});
	});
	return out;
}

// Each name holds exactly the one callback of `instance`
function expectRegisteredOnce(current, instance, others = {}) {
	const expected = {};
	Object.keys(FIELD_FOR).forEach((name) => { expected[name] = [ 'mounted' ]; });
	expect(owners(current, Object.assign({ mounted: instance }, others))).toEqual(expected);
}

function expectNothingRegistered(current) {
	const expected = {};
	Object.keys(FIELD_FOR).forEach((name) => { expected[name] = []; });
	expect(owners(current, {})).toEqual(expected);
}

// Record document.addEventListener / removeEventListener for the three events
function recordDocumentListeners() {
	const calls = [];
	const add = jest.spyOn(document, 'addEventListener');
	const remove = jest.spyOn(document, 'removeEventListener');
	add.mockImplementation(function(type, fn, options) {
		if (EVENT_NAMES.includes(type)) {
			calls.push([ 'add', type, fn ]);
		}
		return EventTarget.prototype.addEventListener.call(this, type, fn, options);
	});
	remove.mockImplementation(function(type, fn, options) {
		if (EVENT_NAMES.includes(type)) {
			calls.push([ 'remove', type, fn ]);
		}
		return EventTarget.prototype.removeEventListener.call(this, type, fn, options);
	});
	return {
		calls,
		restore() {
			add.mockRestore();
			remove.mockRestore();
		},
	};
}

describe('extension-listeners.js', () => {
	let hooks;
	let doc;

	beforeEach(() => {
		window.typostHooks = createHookRegistry();
		hooks = window.typostHooks;
		doc = recordDocumentListeners();
	});

	afterEach(() => {
		doc.restore();
	});

	function fakeInstance() {
		return {
			_isMounted: false,
			state: { selectedFeatures: [] },
			convertToBlock: jest.fn(),
			forceUpdate: jest.fn(),
		};
	}

	test('creating the callbacks registers nothing', () => {
		const instance = fakeInstance();
		createExtensionListeners(instance, 'typost/features');
		Object.keys(FIELD_FOR).forEach((name) => {
			expect(typeof instance[FIELD_FOR[name]]).toBe('function');
		});
		expectNothingRegistered(registrations(hooks, doc.calls));
	});

	test('mount, unmount, mount registers each callback once; the last unmount removes all; a second instance that is never mounted registers nothing', () => {
		// StrictMode with the development build: two constructions, then
		// mount, unmount, mount on the second instance
		const thrownAway = fakeInstance();
		const kept = fakeInstance();
		createExtensionListeners(thrownAway, 'typost/features');
		createExtensionListeners(kept, 'typost/features');
		attachExtensionListeners(kept, hooks, document);
		detachExtensionListeners(kept);
		attachExtensionListeners(kept, hooks, document);

		expectRegisteredOnce(registrations(hooks, doc.calls), kept, { 'thrown away': thrownAway });

		detachExtensionListeners(kept);
		expectNothingRegistered(registrations(hooks, doc.calls));
	});

	test('a second attach without a detach registers nothing more; a detach without an attach removes nothing', () => {
		const other = fakeInstance();
		createExtensionListeners(other, 'typost/features');
		attachExtensionListeners(other, hooks, document);
		const instance = fakeInstance();
		createExtensionListeners(instance, 'typost/features');
		detachExtensionListeners(instance);
		attachExtensionListeners(instance, hooks, document);
		attachExtensionListeners(instance, hooks, document);
		const expected = {};
		Object.keys(FIELD_FOR).forEach((name) => { expected[name] = [ 'other instance', 'instance' ]; });
		expect(owners(registrations(hooks, doc.calls), { 'other instance': other, instance })).toEqual(expected);
		detachExtensionListeners(instance);
		detachExtensionListeners(instance);
		expectRegisteredOnce(registrations(hooks, doc.calls), other, { instance });
	});

	test('the callbacks are registered and removed in the order the component used before #386', () => {
		const instance = fakeInstance();
		createExtensionListeners(instance, 'typost/features');
		// One log in call order: the registry's calls go into the same
		// list as the document's
		[ 'addFilter', 'addAction', 'removeFilter', 'removeAction' ].forEach((method) => {
			const original = hooks[method];
			hooks[method] = function(name, fn, priority) {
				doc.calls.push([ method, name, priority ]);
				return original.apply(this, arguments);
			};
		});
		attachExtensionListeners(instance, hooks, document);
		detachExtensionListeners(instance);
		expect(doc.calls.map(([ op, name, priority ]) => `${op} ${name}${typeof priority === 'number' ? ` ${priority}` : ''}`)).toEqual([
			'addFilter typost_current_editor_state 10',
			'add typost-apply-block-properties',
			'add typost-insert-content',
			'addAction typost_glyphs_panel_closed 10',
			'addAction typost_extension_panel_closed 10',
			'add typost-convert-to-block',
			'addAction typost_editor_toolbar_buttons_changed 10',
			'remove typost-apply-block-properties',
			'remove typost-insert-content',
			'removeFilter typost_current_editor_state',
			'removeAction typost_glyphs_panel_closed',
			'removeAction typost_extension_panel_closed',
			'removeAction typost_editor_toolbar_buttons_changed',
			'remove typost-convert-to-block',
		]);
	});

	test('detach removes from the registry it attached to, also after window.typostHooks was replaced', () => {
		const instance = fakeInstance();
		createExtensionListeners(instance, 'typost/features');
		attachExtensionListeners(instance, hooks, document);
		window.typostHooks = createHookRegistry();
		detachExtensionListeners(instance);
		expectNothingRegistered(registrations(hooks, doc.calls));
	});

	test('the handlers act only while the instance is mounted', () => {
		const instance = fakeInstance();
		createExtensionListeners(instance, 'typost/features');
		attachExtensionListeners(instance, hooks, document);
		document.dispatchEvent(new CustomEvent('typost-convert-to-block'));
		hooks.doAction('typost_editor_toolbar_buttons_changed');
		expect(instance.convertToBlock).not.toHaveBeenCalled();
		expect(instance.forceUpdate).not.toHaveBeenCalled();
		instance._isMounted = true;
		document.dispatchEvent(new CustomEvent('typost-convert-to-block'));
		hooks.doAction('typost_editor_toolbar_buttons_changed');
		expect(instance.convertToBlock).toHaveBeenCalledTimes(1);
		expect(instance.forceUpdate).toHaveBeenCalledTimes(1);
		detachExtensionListeners(instance);
	});
});

describe('the inline editor component in React StrictMode', () => {
	let Control;
	let hooks;
	let doc;
	let container;
	let root;

	beforeAll(() => {
		global.IS_REACT_ACT_ENVIRONMENT = true;
		global.typostData = { features: [], presets: [], customFonts: [], paragraphStyles: [] };
		let edit = null;
		const debounce = (fn) => {
			const debounced = (...args) => fn(...args);
			debounced.cancel = () => {};
			return debounced;
		};
		global.wp = {
			richText: {
				registerFormatType: (name, settings) => { edit = settings.edit; },
				applyFormat: (value) => value,
				removeFormat: (value) => value,
				getActiveFormat: () => undefined,
				slice: (value) => value,
				getTextContent: (value) => (value && value.text) || '',
			},
			blockEditor: {},
			element: { Component: React.Component, Fragment: React.Fragment, createElement: React.createElement },
			components: { Modal: () => null },
			i18n: { __: (text) => text, sprintf: (text) => text, isRTL: () => false },
			compose: { compose: () => (component) => component, debounce },
			data: {
				withSelect: () => (component) => component,
				select: () => ({
					getSelectedBlock: () => null,
					getSelectedBlockClientId: () => null,
					getBlock: () => null,
					getSelectionStart: () => ({}),
					getSelectionEnd: () => ({}),
				}),
				dispatch: () => ({}),
			},
			blocks: { createBlock: () => ({}) },
		};
		jest.isolateModules(() => {
			require('../block-editor.js');
		});
		// The format's edit function returns the component as an element
		Control = edit({}).type;
	});

	beforeEach(() => {
		window.typostHooks = createHookRegistry();
		hooks = window.typostHooks;
		doc = recordDocumentListeners();
		container = document.createElement('div');
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		doc.restore();
		container.remove();
	});

	test('the instance React keeps holds each listener once; the thrown-away instance holds none; unmount removes all', () => {
		const constructed = jest.spyOn(Control.prototype, '_buildInitialState');
		let mounted = null;
		const props = {
			value: { text: '', formats: [], replacements: [], start: 0, end: 0 },
			onChange: () => {},
			isActive: false,
			activeAttributes: {},
			// The toolbar button needs the block editor's slots; the
			// listeners do not depend on it
			isInTypostBlock: true,
		};
		act(() => {
			root.render(
				React.createElement(React.StrictMode, null,
					React.createElement(Control, Object.assign({ ref: (instance) => { if (instance) { mounted = instance; } } }, props))
				)
			);
		});

		// StrictMode constructed two instances and kept one
		const instances = constructed.mock.instances;
		expect(instances).toHaveLength(2);
		expect(instances).toContain(mounted);
		const thrownAway = instances.find((instance) => instance !== mounted);
		expect(mounted._isMounted).toBe(true);
		expect(thrownAway._isMounted).toBeUndefined();

		// StrictMode ran mount, unmount, mount on the kept instance
		expectRegisteredOnce(registrations(hooks, doc.calls), mounted, { 'thrown away': thrownAway });

		// The state filter answers with the mounted instance's state
		const state = hooks.applyFilters('typost_current_editor_state', {}, 'inline');
		expect(state.editorType).toBe('inline');
		expect(state.features).toBe(mounted.state.selectedFeatures);

		act(() => {
			root.unmount();
		});
		expectNothingRegistered(registrations(hooks, doc.calls));
		expect(hooks.applyFilters('typost_current_editor_state', { untouched: true }, 'inline')).toEqual({ untouched: true });
		constructed.mockRestore();
	});
});

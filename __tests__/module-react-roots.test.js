/**
 * The bundled modules render with wp.element.createRoot() where WordPress
 * has it, and with wp.element.render() where it does not (#456).
 *
 * React 19 removes ReactDOM.render() and unmountComponentAtNode(). Each
 * module (Paragraph Styles, Variable Fonts, the Glyphs panel and its admin
 * tab) keeps the same small set of root helpers in its own script, because
 * a module uses only core's public extension API:
 * - renderIntoRoot() and unmountRoot(): one createRoot() root for each
 *   container, else render() and unmountComponentAtNode();
 * - watchRootContainer(), observeContainerDocument() and
 *   releaseDetachedRoots(): core unmounts only a render() root in a hook
 *   container itself (#419), so a module unmounts its createRoot() roots
 *   when their container leaves the page;
 * - renderIntoHookContainer() (Paragraph Styles and Variable Fonts): the
 *   root goes in an element of the module's own in the hook container,
 *   never on the container, which other extensions render into too.
 *
 * "The copies" checks that every copy does the same (docs/twins.md). The
 * other tests load each module's whole script with the real React, in two
 * shapes of wp.element: React 19's (createRoot(), no render() and no
 * unmountComponentAtNode()) and React 17's (render(), no createRoot()). In
 * each, the panels and the Glyphs button show, and unmount when their
 * container leaves the page or their dialog closes. The last tests use
 * React 18's shape (all three) with an extension that renders into the
 * same hook container: with render(), and as the React example in HOOKS.md
 * does.
 */

const fs = require('fs');
const path = require('path');
const React = require('react');
const ReactDOM = require('react-dom');
const ReactDOMClient = require('react-dom/client');
const { act } = React;
const { extractFunction } = require('../tests/js/twin-source.js');

const MODULE_SCRIPTS = {
	'paragraph-styles': 'paragraph-styles/assets/js/editor.js',
	'variable-fonts': 'variable-fonts/assets/js/editor.js',
	'glyphs-panel': 'glyphs-panel/assets/js/editor.js',
	'glyphs-panel admin': 'glyphs-panel/assets/js/admin-glyphs.js',
};
// The scripts that render into hook containers, and so watch them
const WATCHING = [ 'paragraph-styles', 'variable-fonts', 'glyphs-panel' ];
// The scripts that render into their own element in a hook container with
// renderIntoHookContainer() (the Glyphs button appends its own)
const HOOK_RENDERING = [ 'paragraph-styles', 'variable-fonts' ];

// Mutation records reach an observer in a microtask
const afterMutations = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
	document.body.innerHTML = '';
	delete window.wp;
	delete window.typostHooks;
	delete window.typostData;
	delete window.typostGlyphs;
	delete window.typostPSUtils;
	delete window.typostVFUtils;
});

// ---------------------------------------------------------------------------
// The copies
// ---------------------------------------------------------------------------

describe('the copies', () => {
	// One copy's helpers, with their module scope, over a stub wp.element
	function loadCopy(file, element) {
		const names = [ 'renderIntoRoot', 'unmountRoot' ];
		const watching = WATCHING.some((key) => MODULE_SCRIPTS[key] === file);
		const hookRendering = HOOK_RENDERING.some((key) => MODULE_SCRIPTS[key] === file);
		if (watching) {
			names.push('releaseDetachedRoots', 'watchRootContainer', 'observeContainerDocument');
		}
		if (hookRendering) {
			names.push('renderIntoHookContainer');
		}
		const code = names.map((name) => extractFunction(file, name)).join('\n');
		return new Function('window', 'wp',
			'var elementRoots = new WeakMap(); var watchedContainers = []; var containerObserver = null; var observedDocuments = [];' +
			' var hookContainerMounts = new WeakMap();\n' + code +
			'\nreturn { renderIntoRoot: renderIntoRoot, unmountRoot: unmountRoot,' +
			(watching ? ' watchRootContainer: watchRootContainer, watched: function() { return watchedContainers.length; },' +
				' observing: function() { return containerObserver !== null; },' : '') +
			(hookRendering ? ' renderIntoHookContainer: renderIntoHookContainer,' : '') +
			' };')(window, { element });
	}

	// What each wp.element call received, by container name (a module's
	// own element in a hook container: its class)
	function recordingElement(shape, log) {
		const name = (container) => container.getAttribute('data-name') || container.className;
		const element = {};
		if (shape.createRoot) {
			element.createRoot = (container) => {
				log.push([ 'createRoot', name(container) ]);
				return {
					render: (el) => log.push([ 'root.render', name(container), el ]),
					unmount: () => log.push([ 'root.unmount', name(container) ]),
				};
			};
		}
		if (shape.render) {
			element.render = (el, container) => log.push([ 'render', name(container), el ]);
		}
		if (shape.unmount) {
			element.unmountComponentAtNode = (container) => {
				log.push([ 'unmountComponentAtNode', name(container) ]);
				return true;
			};
		}
		return element;
	}

	function named(name) {
		const container = document.createElement('div');
		container.setAttribute('data-name', name);
		return container;
	}

	// Render, render again, unmount twice and render after the unmount
	function renderTrace(file, shape) {
		const log = [];
		const copy = loadCopy(file, recordingElement(shape, log));
		const a = named('a');
		const b = named('b');
		copy.renderIntoRoot('first', a);
		copy.renderIntoRoot('second', a);
		copy.renderIntoRoot('other', b);
		log.push([ 'unmounted', copy.unmountRoot(a) ]);
		log.push([ 'unmounted', copy.unmountRoot(a) ]);
		copy.renderIntoRoot('again', a);
		return log;
	}

	const SHAPES = {
		'React 18 (createRoot, render, unmountComponentAtNode)': { createRoot: true, render: true, unmount: true },
		'React 19 (createRoot only)': { createRoot: true },
		'React 17 (render, unmountComponentAtNode)': { render: true, unmount: true },
		'none': {},
	};

	const EXPECTED = {
		'React 18 (createRoot, render, unmountComponentAtNode)': [
			[ 'createRoot', 'a' ], [ 'root.render', 'a', 'first' ], [ 'root.render', 'a', 'second' ],
			[ 'createRoot', 'b' ], [ 'root.render', 'b', 'other' ],
			[ 'root.unmount', 'a' ], [ 'unmounted', true ],
			// No root left in a: the legacy call, which finds none in a real React
			[ 'unmountComponentAtNode', 'a' ], [ 'unmounted', true ],
			[ 'createRoot', 'a' ], [ 'root.render', 'a', 'again' ],
		],
		'React 19 (createRoot only)': [
			[ 'createRoot', 'a' ], [ 'root.render', 'a', 'first' ], [ 'root.render', 'a', 'second' ],
			[ 'createRoot', 'b' ], [ 'root.render', 'b', 'other' ],
			[ 'root.unmount', 'a' ], [ 'unmounted', true ],
			[ 'unmounted', false ],
			[ 'createRoot', 'a' ], [ 'root.render', 'a', 'again' ],
		],
		'React 17 (render, unmountComponentAtNode)': [
			[ 'render', 'a', 'first' ], [ 'render', 'a', 'second' ], [ 'render', 'b', 'other' ],
			[ 'unmountComponentAtNode', 'a' ], [ 'unmounted', true ],
			[ 'unmountComponentAtNode', 'a' ], [ 'unmounted', true ],
			[ 'render', 'a', 'again' ],
		],
		'none': [ [ 'unmounted', false ], [ 'unmounted', false ] ],
	};

	describe.each(Object.keys(SHAPES))('%s', (shapeName) => {
		test.each(Object.values(MODULE_SCRIPTS))('%s renders and unmounts like every other copy', (file) => {
			expect(renderTrace(file, SHAPES[shapeName])).toEqual(EXPECTED[shapeName]);
		});
	});

	test.each(WATCHING.map((key) => MODULE_SCRIPTS[key]))('%s unmounts a watched root when its container leaves the page or was never on it, and only then', async (file) => {
		const log = [];
		const copy = loadCopy(file, recordingElement({ createRoot: true }, log));
		const dialog = document.createElement('div');
		const stays = named('stays');
		const leaves = named('leaves');
		document.body.append(stays, dialog);
		dialog.appendChild(leaves);
		copy.renderIntoRoot('panel', stays);
		copy.renderIntoRoot('panel', leaves);
		copy.watchRootContainer(stays);
		copy.watchRootContainer(leaves);
		// A container off the page when its hook fires (the block sidebar
		// mounts the last block's controls in a detached panel) is unmounted
		// once the commit is over
		const off = named('off');
		copy.renderIntoRoot('panel', off);
		copy.watchRootContainer(off);
		expect(copy.watched()).toBe(3);
		await Promise.resolve();
		const unmounts = () => log.filter((entry) => entry[0] === 'root.unmount');
		expect(unmounts()).toEqual([ [ 'root.unmount', 'off' ] ]);
		expect(copy.watched()).toBe(2);

		dialog.remove();
		await afterMutations();
		expect(unmounts()).toEqual([ [ 'root.unmount', 'off' ], [ 'root.unmount', 'leaves' ] ]);
		expect(copy.watched()).toBe(1);

		stays.remove();
		await afterMutations();
		expect(unmounts()).toEqual([ [ 'root.unmount', 'off' ], [ 'root.unmount', 'leaves' ], [ 'root.unmount', 'stays' ] ]);
		expect(copy.watched()).toBe(0);
	});

	test.each(WATCHING.map((key) => MODULE_SCRIPTS[key]))('%s watches a container that is off the page when its hook fires but on it once the commit is over, and unmounts it when it leaves', async (file) => {
		const log = [];
		const copy = loadCopy(file, recordingElement({ createRoot: true }, log));
		const late = named('late');
		copy.renderIntoRoot('panel', late);
		copy.watchRootContainer(late);
		document.body.appendChild(late);
		await Promise.resolve();
		const unmounts = () => log.filter((entry) => entry[0] === 'root.unmount');
		expect(unmounts()).toEqual([]);
		expect(copy.watched()).toBe(1);
		expect(copy.observing()).toBe(true);

		late.remove();
		await afterMutations();
		expect(unmounts()).toEqual([ [ 'root.unmount', 'late' ] ]);
		expect(copy.watched()).toBe(0);
		expect(copy.observing()).toBe(false);
	});

	// Render into a hook container twice, have an extension empty it, render
	// again, and close its dialog
	async function hookContainerTrace(file) {
		const log = [];
		const copy = loadCopy(file, recordingElement({ createRoot: true, render: true, unmount: true }, log));
		const dialog = document.createElement('div');
		const container = named('hook');
		dialog.appendChild(container);
		document.body.appendChild(dialog);
		const children = () => Array.from(container.children).map((child) => child.className);

		copy.renderIntoHookContainer('first', container, 'zz-mine');
		copy.renderIntoHookContainer('second', container, 'zz-mine');
		// The element goes in once the hook's other actions have run
		log.push([ 'children', children() ]);
		await Promise.resolve();
		log.push([ 'children', children() ]);
		copy.renderIntoHookContainer('third', container, 'zz-mine');

		// An extension's first render() empties the container
		container.textContent = '';
		await afterMutations();
		copy.renderIntoHookContainer('fourth', container, 'zz-mine');
		await Promise.resolve();
		log.push([ 'children', children() ]);

		dialog.remove();
		await afterMutations();
		return log;
	}

	test.each(HOOK_RENDERING.map((key) => MODULE_SCRIPTS[key]))('%s renders into one element of its own in a hook container, never into the container', async (file) => {
		expect(await hookContainerTrace(file)).toEqual([
			[ 'createRoot', 'zz-mine' ], [ 'root.render', 'zz-mine', 'first' ], [ 'root.render', 'zz-mine', 'second' ],
			[ 'children', [] ],
			[ 'children', [ 'zz-mine' ] ],
			[ 'root.render', 'zz-mine', 'third' ],
			// Its element left the page: its root is unmounted, and the next
			// render gets a new element
			[ 'root.unmount', 'zz-mine' ],
			[ 'createRoot', 'zz-mine' ], [ 'root.render', 'zz-mine', 'fourth' ],
			[ 'children', [ 'zz-mine' ] ],
			[ 'root.unmount', 'zz-mine' ],
		]);
	});
});

// ---------------------------------------------------------------------------
// The whole scripts, with the real React
// ---------------------------------------------------------------------------

// wp.element as WordPress has it with React 19 (no render() and no
// unmountComponentAtNode()), React 18 (all three) or React 17 (no
// createRoot()). Every createRoot() root is recorded.
function wpElement(shape, roots) {
	const element = {
		createElement: React.createElement,
		Fragment: React.Fragment,
		useState: React.useState,
		useEffect: React.useEffect,
		useLayoutEffect: React.useLayoutEffect,
		useRef: React.useRef,
		useCallback: React.useCallback,
		useMemo: React.useMemo,
		createPortal: ReactDOM.createPortal,
	};
	if (shape === 'React 19' || shape === 'React 18') {
		element.createRoot = (container) => {
			const root = ReactDOMClient.createRoot(container);
			const entry = { container, unmounted: false };
			roots.push(entry);
			return {
				render: (el) => root.render(el),
				unmount: () => {
					entry.unmounted = true;
					root.unmount();
				},
			};
		};
	}
	if (shape === 'React 19') {
		element.render = undefined;
		element.unmountComponentAtNode = undefined;
	} else {
		element.render = ReactDOM.render;
		element.unmountComponentAtNode = ReactDOM.unmountComponentAtNode;
	}
	return element;
}

// Stub components: each counts its mounts and unmounts by name
function wpComponents(lifecycle) {
	function counted(name) {
		lifecycle[name] = lifecycle[name] || { mounted: 0, unmounted: 0 };
		React.useEffect(() => {
			lifecycle[name].mounted++;
			return () => {
				lifecycle[name].unmounted++;
			};
		}, []);
	}
	const Button = function Button(props) {
		counted('Button');
		return React.createElement('button', { type: 'button', className: props.className, onClick: props.onClick }, props.children);
	};
	const cache = { Button };
	return new Proxy(cache, {
		get(target, name) {
			if (typeof name !== 'string') {
				return undefined;
			}
			if (!target[name]) {
				target[name] = function Stub(props) {
					counted(name);
					return React.createElement('div', { className: 'stub-' + name }, typeof props.children === 'function' ? null : props.children);
				};
			}
			return target[name];
		},
	});
}

// A typostHooks registry like core's
function hookRegistry() {
	const actions = {};
	const filters = {};
	return {
		actions,
		addAction(name, callback) {
			(actions[name] = actions[name] || []).push(callback);
		},
		doAction(name, ...args) {
			(actions[name] || []).slice().forEach((callback) => callback(...args));
		},
		addFilter(name, callback) {
			(filters[name] = filters[name] || []).push(callback);
		},
		removeFilter(name, callback) {
			filters[name] = (filters[name] || []).filter((entry) => entry !== callback);
		},
		applyFilters(name, value, ...args) {
			return (filters[name] || []).reduce((current, callback) => callback(current, ...args), value);
		},
	};
}

// A wp.data with one store-change channel
function wpData() {
	const subscribers = new Set();
	const anyFunction = () => new Proxy({}, { get: () => () => null });
	return {
		subscribers,
		select: anyFunction,
		dispatch: anyFunction,
		subscribe(callback) {
			subscribers.add(callback);
			return () => subscribers.delete(callback);
		},
		change() {
			Array.from(subscribers).forEach((callback) => callback());
		},
	};
}

// Load one module's whole script into a fresh module scope
function loadScript(file) {
	jest.isolateModules(() => {
		require('../' + file);
	});
}

// A hook container in a dialog or the block sidebar, on the page
function hookContainer(hook, surfaceClass) {
	const surface = document.createElement('div');
	surface.className = surfaceClass || 'components-modal__frame';
	const container = document.createElement('div');
	container.className = 'typost-hook-point';
	container.setAttribute('data-hook', hook);
	surface.appendChild(container);
	document.body.appendChild(surface);
	return container;
}

function setUp(shape) {
	const roots = [];
	const lifecycle = {};
	const data = wpData();
	window.wp = {
		element: wpElement(shape, roots),
		components: wpComponents(lifecycle),
		i18n: {
			__: (text) => text,
			_n: (single, plural, count) => (count === 1 ? single : plural),
			sprintf: (format, ...args) => args.reduce((out, arg) => out.replace(/%[sd]/, String(arg)), format),
		},
		data,
		apiFetch: () => new Promise(() => {}),
		a11y: { speak: () => {} },
		domReady: () => {},
	};
	window.typostHooks = hookRegistry();
	return { roots, lifecycle, data };
}

beforeAll(() => {
	global.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
	delete global.IS_REACT_ACT_ENVIRONMENT;
});

// ReactDOM.render() and unmountComponentAtNode() log their React 18
// deprecation: expected in the React 17 shape only
let consoleError;
beforeEach(() => {
	consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
	consoleError.mockRestore();
});

// What React logged: in the React 19 shape, nothing (no deprecation, and no
// "Attempted to synchronously unmount a root while React was already
// rendering" from an unmount in a commit)
function reactErrors() {
	return consoleError.mock.calls.map((call) => String(call[0]));
}

describe.each([ 'React 19', 'React 17' ])('with the wp.element of %s', (shape) => {
	test('Paragraph Styles: the panel shows in each editor, follows the store while its dialog is open, and stops when it closes', async () => {
		const { roots, data } = setUp(shape);
		window.typostData = { paragraphStyles: [ { id: 3, name: 'Display', properties: { fontWeight: '700' } } ] };
		window.typostPSUtils = require('../paragraph-styles/assets/js/lib/ps-utils.js');
		let stateCalls = 0;
		window.typostHooks.addFilter('typost_current_editor_state', (state) => {
			stateCalls++;
			return { ...state, paragraphStyleId: 3, fontWeight: '700' };
		});
		loadScript(MODULE_SCRIPTS['paragraph-styles']);

		const inline = hookContainer('typost_inline_modal_top');
		const qft = hookContainer('typost_qft_modal_top');
		const inspector = hookContainer('typost_inspector_top', 'block-editor-block-inspector');
		await act(async () => {
			window.typostHooks.doAction('typost_inline_modal_top', inline, { paragraphStyleId: 3 });
			window.typostHooks.doAction('typost_qft_modal_top', qft, {});
			window.typostHooks.doAction('typost_inspector_top', inspector, {});
		});
		// In an element of its own in each container, not in the container
		[ inline, qft, inspector ].forEach((container) => {
			expect(Array.from(container.children).map((child) => child.className)).toEqual([ 'typost-ps-root' ]);
			expect(container.querySelector('.typost-ps-root > .typost-ps-panel')).not.toBeNull();
		});

		// The dialog opened: the panel renders into the root it has, and does
		// not look its container up in the document
		const querySelector = jest.spyOn(document, 'querySelector');
		await act(async () => {
			window.typostHooks.doAction('typost_inline_modal_opened', { paragraphStyleId: 3 });
		});
		expect(querySelector.mock.calls.filter((call) => /typost_inline_modal_top/.test(call[0]))).toEqual([]);
		querySelector.mockRestore();
		expect(inline.querySelectorAll('.typost-ps-panel')).toHaveLength(1);
		expect(inline.children).toHaveLength(1);
		if (shape === 'React 19') {
			expect(roots.map((root) => root.container.parentNode)).toEqual([ inline, qft, inspector ]);
		}

		stateCalls = 0;
		act(() => {
			data.change();
		});
		expect(stateCalls).toBe(3);

		// The dialogs close; the sidebar stays
		inline.parentNode.remove();
		qft.parentNode.remove();
		await act(async () => {
			await afterMutations();
		});
		if (shape === 'React 19') {
			expect(roots.map((root) => root.unmounted)).toEqual([ true, true, false ]);
		}
		stateCalls = 0;
		act(() => {
			data.change();
		});
		expect(stateCalls).toBe(1);

		inspector.parentNode.remove();
		await act(async () => {
			await afterMutations();
		});
		stateCalls = 0;
		act(() => {
			data.change();
		});
		expect(stateCalls).toBe(0);
		expect(data.subscribers.size).toBe(0);
		if (shape === 'React 19') {
			expect(reactErrors()).toEqual([]);
		}
	});

	test('Variable Fonts: the axes panels show, share one session, and unmount when the sidebar shows another block', async () => {
		const { roots, lifecycle } = setUp(shape);
		window.typostData = {
			variableFontAxes: { 7: [ { tag: 'wght', name: 'Weight', min: 100, max: 900, default: 400 }, { tag: 'wdth', name: 'Width', min: 75, max: 125, default: 100 } ] },
			variableFontFlags: { 7: { isVariable: true, hideWeights: true } },
		};
		window.typostVFUtils = require('../variable-fonts/assets/js/lib/variation-utils.js');
		loadScript(MODULE_SCRIPTS['variable-fonts']);

		const sidebar = document.createElement('div');
		sidebar.className = 'block-editor-block-inspector';
		document.body.appendChild(sidebar);
		const weightPanel = document.createElement('div');
		weightPanel.className = 'components-panel__body';
		sidebar.appendChild(weightPanel);
		const weight = document.createElement('div');
		weight.setAttribute('data-hook', 'typost_weight_control');
		weightPanel.appendChild(weight);
		const axes = document.createElement('div');
		axes.setAttribute('data-hook', 'typost_inspector_after_font_weight');
		sidebar.appendChild(axes);

		await act(async () => {
			window.typostHooks.doAction('typost_weight_control', weight, { fontId: 7, fontVariationSettings: '"wdth" 87.5' });
			window.typostHooks.doAction('typost_inspector_after_font_weight', axes, { fontId: 7, fontVariationSettings: '"wdth" 87.5' });
		});
		expect(weight.querySelector('.typost-vf-axes-panel')).not.toBeNull();
		expect(axes.querySelector('.typost-vf-other-axes .typost-vf-axes-panel')).not.toBeNull();
		expect(lifecycle.RangeControl).toEqual({ mounted: 2, unmounted: 0 });
		// In an element of its own in each container, not in the container
		[ weight, axes ].forEach((container) => {
			expect(Array.from(container.children).map((child) => child.className)).toEqual([ 'typost-vf-root' ]);
		});
		if (shape === 'React 19') {
			expect(roots.map((root) => root.container.parentNode)).toEqual([ weight, axes ]);
		}

		// Core removes the containers; the module unmounts its roots (in the
		// React 17 shape core would too: here nothing else does)
		sidebar.remove();
		await act(async () => {
			await afterMutations();
		});
		expect(lifecycle.RangeControl).toEqual({ mounted: 2, unmounted: 2 });
		if (shape === 'React 19') {
			expect(roots.map((root) => root.unmounted)).toEqual([ true, true ]);
		}

		// The sidebar mounts the last block's controls once more in a panel
		// that is not in the document: that root is unmounted right after
		// (a createRoot() root can go before its first render is done)
		const detached = document.createElement('div');
		detached.setAttribute('data-hook', 'typost_inspector_after_font_weight');
		document.createElement('div').appendChild(detached);
		await act(async () => {
			window.typostHooks.doAction('typost_inspector_after_font_weight', detached, { fontId: 7 });
		});
		await act(async () => {
			await afterMutations();
		});
		expect(lifecycle.RangeControl.mounted).toBe(lifecycle.RangeControl.unmounted);
		expect(detached.querySelector('.typost-vf-root').childNodes).toHaveLength(0);
		if (shape === 'React 19') {
			expect(roots.map((root) => root.unmounted)).toEqual([ true, true, true ]);
			expect(reactErrors()).toEqual([]);
		}
	});

	test('Glyphs panel: the button shows, opens and closes the modal, and unmounts when its dialog closes', async () => {
		const { roots, lifecycle } = setUp(shape);
		window.typostData = {};
		let modalProps = null;
		window.typostGlyphs = {
			GlyphsModal: function GlyphsModal(props) {
				modalProps = props;
				React.useEffect(() => {
					lifecycle.modal = lifecycle.modal || { mounted: 0, unmounted: 0 };
					lifecycle.modal.mounted++;
					return () => {
						lifecycle.modal.unmounted++;
					};
				}, []);
				return React.createElement('div', { className: 'zz-glyphs-modal' });
			},
		};
		loadScript(MODULE_SCRIPTS['glyphs-panel']);

		const container = hookContainer('typost_inline_before_features');
		await act(async () => {
			window.typostHooks.doAction('typost_inline_before_features', container, { savedSelectionStart: null, savedSelectionEnd: null });
		});
		const button = container.querySelector('.typost-glyphs-open-button');
		expect(button).not.toBeNull();

		await act(async () => {
			button.click();
		});
		expect(document.querySelector('.typost-glyphs-modal-root .zz-glyphs-modal')).not.toBeNull();
		await act(async () => {
			modalProps.onClose();
		});
		expect(document.querySelector('.typost-glyphs-modal-root')).toBeNull();
		expect(lifecycle.modal).toEqual({ mounted: 1, unmounted: 1 });

		container.parentNode.remove();
		await act(async () => {
			await afterMutations();
		});
		expect(lifecycle.Button).toEqual({ mounted: 1, unmounted: 1 });
		if (shape === 'React 19') {
			// The button's root, then the modal's
			expect(roots.map((root) => root.unmounted)).toEqual([ true, true ]);
			expect(reactErrors()).toEqual([]);
		}
	});

	test('Glyphs panel admin tab: the browser opens and closes', async () => {
		const { roots } = setUp(shape);
		let modalProps = null;
		let unmounted = 0;
		window.typostGlyphs = {
			GlyphsModal: function GlyphsModal(props) {
				modalProps = props;
				React.useEffect(() => () => {
					unmounted++;
				}, []);
				return React.createElement('div', { className: 'zz-glyphs-modal' });
			},
		};
		const open = document.createElement('button');
		open.id = 'typost-glyphs-admin-open';
		document.body.appendChild(open);
		// The script's DOMContentLoaded listener, called here and removed, so
		// no other test's load answers the click
		const addListener = jest.spyOn(document, 'addEventListener');
		loadScript(MODULE_SCRIPTS['glyphs-panel admin']);
		const ready = addListener.mock.calls.find((call) => call[0] === 'DOMContentLoaded')[1];
		addListener.mockRestore();
		document.removeEventListener('DOMContentLoaded', ready);
		ready();

		await act(async () => {
			open.click();
		});
		expect(document.querySelector('.typost-glyphs-modal-root .zz-glyphs-modal')).not.toBeNull();
		await act(async () => {
			modalProps.onClose();
		});
		expect(document.querySelector('.typost-glyphs-modal-root')).toBeNull();
		expect(unmounted).toBe(1);
		if (shape === 'React 19') {
			expect(roots).toHaveLength(1);
			expect(roots[0].unmounted).toBe(true);
			expect(reactErrors()).toEqual([]);
		}
	});
});

// ---------------------------------------------------------------------------
// Another extension in the same hook container
// ---------------------------------------------------------------------------

describe('with the wp.element of React 18 and an extension that renders into the same hook container', () => {
	const { unmountHookContainer } = require('../assets/js/hook-container.js');
	// What React logs when two roots share an element, and the error core's
	// unmount then threw (#456 review)
	const MIXING = /Replacing React-rendered children|previously passed to ReactDOM\.render|already been passed to createRoot|removed without using React|another copy of React|not a child/;

	// The React example in HOOKS.md, as an extension author copies it
	function hooksExample() {
		const source = fs.readFileSync(path.join(__dirname, '..', 'HOOKS.md'), 'utf8');
		const blocks = source.split('```javascript\n').slice(1).map((block) => block.split('```')[0]);
		const example = blocks.filter((block) => /^\/\/ editor\.js\n/.test(block) && /function renderPanel\(containerEl\)/.test(block));
		expect(example).toHaveLength(1);
		return example[0];
	}

	const CASES = [
		[ 'render() into the container', 'before' ],
		[ 'render() into the container', 'after' ],
		[ 'the HOOKS.md example', 'before' ],
		[ 'the HOOKS.md example', 'after' ],
	];

	test.each(CASES)('%s, its action %s the Paragraph Styles panel\'s: both show, nothing conflicts, and both unmount when the dialog closes', async (extension, order) => {
		const { roots, data } = setUp('React 18');
		window.typostData = { paragraphStyles: [ { id: 3, name: 'Display', properties: { fontWeight: '700' } } ] };
		window.typostPSUtils = require('../paragraph-styles/assets/js/lib/ps-utils.js');
		window.typostHooks.addFilter('typost_current_editor_state', (state) => ({ ...state, paragraphStyleId: 3 }));
		const ext = { mounted: 0, unmounted: 0 };
		function Ext() {
			React.useEffect(() => {
				ext.mounted++;
				return () => {
					ext.unmounted++;
				};
			}, []);
			return React.createElement('p', { className: 'zz-ext-panel' }, 'EXT');
		}
		function addExtension() {
			if (extension === 'the HOOKS.md example') {
				// eslint-disable-next-line no-new-func
				new Function(hooksExample())();
				return;
			}
			window.typostHooks.addAction('typost_qft_modal_top', (container) => {
				window.wp.element.render(React.createElement(Ext), container);
			});
		}
		// The registry runs actions in the order they were added
		if (order === 'before') {
			addExtension();
		}
		loadScript(MODULE_SCRIPTS['paragraph-styles']);
		if (order === 'after') {
			addExtension();
		}

		const container = hookContainer('typost_qft_modal_top');
		await act(async () => {
			window.typostHooks.doAction('typost_qft_modal_top', container, {});
		});
		expect(container.querySelectorAll('.typost-ps-panel')).toHaveLength(1);
		if (extension === 'the HOOKS.md example') {
			expect(container.textContent).toContain('My Extension is active!');
			expect(roots).toHaveLength(2);
			expect(roots.map((root) => root.container.parentNode)).toEqual([ container, container ]);
		} else {
			expect(container.querySelectorAll('.zz-ext-panel')).toHaveLength(1);
			expect(ext).toEqual({ mounted: 1, unmounted: 0 });
			expect(roots).toHaveLength(1);
		}
		expect(roots.every((root) => root.container !== container)).toBe(true);
		expect(data.subscribers.size).toBeGreaterThan(0);

		// The dialog closes: core unmounts a render() root in the container
		// after the commit (#419), each module and the example their own
		const thrown = [];
		await act(async () => {
			container.parentNode.remove();
			queueMicrotask(() => {
				try {
					unmountHookContainer(container);
				} catch (error) {
					thrown.push(error.message);
				}
			});
			await afterMutations();
		});
		expect(thrown).toEqual([]);
		expect(roots.map((root) => root.unmounted)).toEqual(roots.map(() => true));
		if (extension !== 'the HOOKS.md example') {
			expect(ext).toEqual({ mounted: 1, unmounted: 1 });
		}
		expect(data.subscribers.size).toBe(0);
		expect(reactErrors().filter((message) => MIXING.test(message))).toEqual([]);
	});
});

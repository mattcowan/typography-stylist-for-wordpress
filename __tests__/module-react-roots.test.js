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
 * - watchRootContainer() and releaseDetachedRoots(): core unmounts only a
 *   render() root in a hook container itself (#419), so a module unmounts
 *   its createRoot() roots when their container leaves the page.
 *
 * "The copies" checks that every copy does the same (docs/twins.md). The
 * other tests load each module's whole script with the real React, in two
 * shapes of wp.element: React 19's (createRoot(), no render() and no
 * unmountComponentAtNode()) and React 17's (render(), no createRoot()). In
 * each, the panels and the Glyphs button show, and unmount when their
 * container leaves the page or their dialog closes.
 */

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
		if (watching) {
			names.push('releaseDetachedRoots', 'watchRootContainer');
		}
		const code = names.map((name) => extractFunction(file, name)).join('\n');
		return new Function('window', 'wp',
			'var elementRoots = new WeakMap(); var watchedContainers = []; var containerObserver = null; var observedDocuments = [];\n' + code +
			'\nreturn { renderIntoRoot: renderIntoRoot, unmountRoot: unmountRoot,' +
			(watching ? ' watchRootContainer: watchRootContainer, watched: function() { return watchedContainers.length; },' : '') +
			' };')(window, { element });
	}

	// What each wp.element call received, by container name
	function recordingElement(shape, log) {
		const name = (container) => container.getAttribute('data-name');
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
});

// ---------------------------------------------------------------------------
// The whole scripts, with the real React
// ---------------------------------------------------------------------------

// wp.element as WordPress has it with React 19 (no render() and no
// unmountComponentAtNode()) or React 17 (no createRoot()). Every createRoot()
// root is recorded.
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
	if (shape === 'React 19') {
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
		[ inline, qft, inspector ].forEach((container) => {
			expect(container.querySelector('.typost-ps-panel')).not.toBeNull();
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
		if (shape === 'React 19') {
			expect(roots.map((root) => root.container)).toEqual([ inline, qft, inspector ]);
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
		if (shape === 'React 19') {
			expect(roots.map((root) => root.container)).toEqual([ weight, axes ]);
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
		expect(detached.childNodes).toHaveLength(0);
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

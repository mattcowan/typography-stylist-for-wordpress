/**
 * AxesPanel joins its axis session in an effect and leaves it in the
 * effect's cleanup, never in render (#456).
 *
 * A join in the component body counts once for each render. React's
 * development build renders a component twice in StrictMode, and a
 * concurrent root throws away a render that suspends; neither runs an
 * effect cleanup for the render it did not keep, so the session kept one
 * panel more than the page had and was never released.
 *
 * editor.js is a hand-written ES5 script with no exports: the component and
 * its helpers are cut out with tests/js/twin-source.js and run with stubbed
 * module scope. The real React renders them.
 */

const React = require('react');
const ReactDOM = require('react-dom');
const { createRoot } = require('react-dom/client');
const { act } = React;
const { extractFunction } = require('../../tests/js/twin-source.js');
const vfUtils = require('../assets/js/lib/variation-utils.js');

const FILE = 'variable-fonts/assets/js/editor.js';
const NAMES = [
	'AxisSlider', 'AxesPanel', 'axisSessionKey', 'hasPanelOnPage', 'acquireAxisSession', 'releaseAxisSession',
	'selectedBlockClientId', 'createDebouncedDispatch', 'findAxesSurface', 'isSurfaceStillOpen',
];

const AXES = [
	{ tag: 'wght', name: 'Weight', min: 100, max: 900, default: 400 },
	{ tag: 'wdth', name: 'Width', min: 75, max: 125, default: 100 },
];

// The component with its module scope; joins and releases are counted
function load() {
	const counts = { join: 0, release: 0 };
	const code = NAMES.map((name) => extractFunction(FILE, name)).join('\n');
	const factory = new Function('React', 'window', 'wp', 'counts', 'dispatchVariationSettings',
		'var el = React.createElement; var useState = React.useState; var useCallback = React.useCallback;' +
		' var useEffect = React.useEffect; var useLayoutEffect = React.useLayoutEffect; var useRef = React.useRef;' +
		' var RangeControl = function(p) { return el("output", { "data-label": p.label }, String(p.value)); };' +
		' var Button = function(p) { return el("button", { type: "button", onClick: p.onClick }, p.children); };' +
		' var __ = function(s) { return s; };' +
		' var getQuickButtons = function() { return []; };' +
		' var axisSessions = {}; var debounceTimers = {}; var debounceCounter = 0;\n' + code +
		'\nvar join = acquireAxisSession; var leave = releaseAxisSession;' +
		' acquireAxisSession = function() { counts.join++; return join.apply(null, arguments); };' +
		' releaseAxisSession = function() { counts.release++; return leave.apply(null, arguments); };' +
		' return { AxesPanel: AxesPanel, sessions: function() { return axisSessions; } };');
	const window = { typostVFUtils: vfUtils };
	const vf = factory(React, window, {}, counts, jest.fn());
	return { ...vf, counts };
}

// A hook container in the block sidebar
function hookContainer() {
	const sidebar = document.createElement('div');
	sidebar.className = 'block-editor-block-inspector';
	const container = document.createElement('div');
	sidebar.appendChild(container);
	document.body.appendChild(sidebar);
	return container;
}

function panel(vf, container, extra) {
	return React.createElement(vf.AxesPanel, {
		axes: AXES,
		editorType: 'inspector',
		fontId: 7,
		filterAxes: 'non-wght',
		initialSettings: { wdth: 87.5 },
		containerEl: container,
		...extra,
	});
}

function strict(element) {
	return React.createElement(React.StrictMode, null, element);
}

function shownWidth(container) {
	const output = container.querySelector('output[data-label="Width"]');
	return output && output.textContent;
}

beforeAll(() => {
	global.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
	delete global.IS_REACT_ACT_ENVIRONMENT;
});

afterEach(() => {
	document.body.innerHTML = '';
});

test('a legacy root in StrictMode: two renders, one join, and one release at unmount', () => {
	const vf = load();
	const container = hookContainer();
	const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
	try {
		act(() => {
			ReactDOM.render(strict(panel(vf, container)), container);
		});
		expect(vf.counts).toEqual({ join: 1, release: 0 });
		expect(vf.sessions()['inspector:7'].refs).toBe(1);
		// The panel shows the session's values
		expect(shownWidth(container)).toBe('87.5');

		act(() => {
			ReactDOM.unmountComponentAtNode(container);
		});
		expect(vf.counts).toEqual({ join: 1, release: 1 });
		expect(vf.sessions()['inspector:7']).toBeUndefined();
	} finally {
		// ReactDOM.render logs its React 18 deprecation
		errors.mockRestore();
	}
});

test('a createRoot() root in StrictMode: the session holds one panel while it is mounted, and none after', () => {
	const vf = load();
	const container = hookContainer();
	const root = createRoot(container);
	act(() => {
		root.render(strict(panel(vf, container)));
	});
	// StrictMode runs each effect, its cleanup and the effect again
	expect(vf.counts.join - vf.counts.release).toBe(1);
	expect(vf.sessions()['inspector:7'].refs).toBe(1);
	expect(shownWidth(container)).toBe('87.5');

	act(() => {
		root.unmount();
	});
	expect(vf.counts.join).toBe(vf.counts.release);
	expect(vf.sessions()['inspector:7']).toBeUndefined();
});

test('a render that React throws away (a sibling suspends) joins nothing', async () => {
	const vf = load();
	const container = hookContainer();
	let resolve;
	const pending = new Promise((done) => {
		resolve = done;
	});
	let ready = false;
	function Suspender() {
		if (!ready) {
			throw pending;
		}
		return null;
	}
	const root = createRoot(container);
	act(() => {
		root.render(React.createElement(React.Suspense, { fallback: null }, panel(vf, container), React.createElement(Suspender)));
	});
	expect(vf.sessions()['inspector:7']).toBeUndefined();

	await act(async () => {
		ready = true;
		resolve();
		await pending;
	});
	expect(vf.counts).toEqual({ join: 1, release: 0 });
	expect(vf.sessions()['inspector:7'].refs).toBe(1);

	act(() => {
		root.unmount();
	});
	expect(vf.sessions()['inspector:7']).toBeUndefined();
});

test('the weight panel and the axes panel of one surface share one session', () => {
	const vf = load();
	const weight = hookContainer();
	const axes = hookContainer();
	const weightRoot = createRoot(weight);
	const axesRoot = createRoot(axes);
	act(() => {
		weightRoot.render(panel(vf, weight, { filterAxes: 'wght' }));
		axesRoot.render(panel(vf, axes));
	});
	expect(vf.counts).toEqual({ join: 2, release: 0 });
	expect(vf.sessions()['inspector:7'].refs).toBe(2);

	act(() => {
		weightRoot.unmount();
		axesRoot.unmount();
	});
	expect(vf.sessions()['inspector:7']).toBeUndefined();
});

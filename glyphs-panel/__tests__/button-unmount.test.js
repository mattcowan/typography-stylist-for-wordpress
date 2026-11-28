/**
 * The "Glyphs…" button renders into an element it appends to the hook
 * container, which core cannot unmount (#419). watchRootContainer() and
 * releaseDetachedRoots() unmount it when it leaves the page, leave a
 * button on the page alone, and stop observing when none is left. The
 * root is a createRoot() root where WordPress has createRoot(), else a
 * render() root (#456); each is unmounted with its own call.
 *
 * editor.js is a hand-written ES5 script with no exports: the functions are
 * cut out with tests/js/twin-source.js and run with stubbed module scope.
 * The same helpers are in the other bundled modules' scripts:
 * __tests__/module-react-roots.test.js holds them to the same behavior.
 */

const { extractFunction } = require('../../tests/js/twin-source.js');

const FILE = 'glyphs-panel/assets/js/editor.js';

function load(wp) {
	const code = [ 'renderIntoRoot', 'unmountRoot', 'releaseDetachedRoots', 'watchRootContainer', 'observeContainerDocument' ].map((name) => extractFunction(FILE, name)).join('\n');
	return new Function('window', 'wp',
		'var elementRoots = new WeakMap(); var watchedContainers = []; var containerObserver = null; var observedDocuments = [];\n' + code +
		'\nreturn { renderIntoRoot: renderIntoRoot, watchRootContainer: watchRootContainer, mounts: function() { return watchedContainers; },' +
		' observing: function() { return containerObserver !== null; } };')(window, wp);
}

// A wp.element with createRoot() (React 18): each root records its calls
function createRootElement() {
	const roots = [];
	return {
		roots,
		element: {
			createRoot: jest.fn((container) => {
				const root = { container, render: jest.fn(), unmount: jest.fn() };
				roots.push(root);
				return root;
			}),
		},
	};
}

// Mutation records reach the observer in a microtask
const afterMutations = () => new Promise((resolve) => setTimeout(resolve, 0));

function buttonIn(container) {
	const mount = document.createElement('div');
	container.appendChild(mount);
	return mount;
}

afterEach(() => {
	document.body.innerHTML = '';
});

test('a button whose container left the page is unmounted; one still on the page is not; the observer stops when none is left', async () => {
	const wp = { element: { unmountComponentAtNode: jest.fn(() => true) } };
	const glyphs = load(wp);
	const inline = document.createElement('div');
	const qft = document.createElement('div');
	document.body.append(inline, qft);
	const inlineButton = buttonIn(inline);
	const qftButton = buttonIn(qft);
	glyphs.watchRootContainer(inlineButton);
	glyphs.watchRootContainer(qftButton);
	expect(glyphs.observing()).toBe(true);

	inline.remove();
	await afterMutations();
	expect(wp.element.unmountComponentAtNode.mock.calls).toEqual([ [ inlineButton ] ]);
	expect(glyphs.mounts()).toEqual([ qftButton ]);
	expect(glyphs.observing()).toBe(true);

	qft.remove();
	await afterMutations();
	expect(wp.element.unmountComponentAtNode.mock.calls).toEqual([ [ inlineButton ], [ qftButton ] ]);
	expect(glyphs.mounts()).toEqual([]);
	expect(glyphs.observing()).toBe(false);
});

test('with createRoot() (and no render() or unmountComponentAtNode(), as in React 19), the button root is unmounted with root.unmount()', async () => {
	const { element, roots } = createRootElement();
	const glyphs = load({ element });
	const container = document.createElement('div');
	document.body.append(container);
	const mount = buttonIn(container);
	glyphs.renderIntoRoot('button', mount);
	glyphs.watchRootContainer(mount);
	expect(roots).toHaveLength(1);
	expect(roots[0].render.mock.calls).toEqual([ [ 'button' ] ]);

	container.remove();
	await afterMutations();
	expect(roots[0].unmount).toHaveBeenCalledTimes(1);
	expect(glyphs.mounts()).toEqual([]);
	expect(glyphs.observing()).toBe(false);
});

test('a button that is not on the page when it renders (a render the editor never shows) is unmounted once the commit is over', async () => {
	const wp = { element: { unmountComponentAtNode: jest.fn(() => true) } };
	const glyphs = load(wp);
	const detached = buttonIn(document.createElement('div'));
	glyphs.watchRootContainer(detached);
	expect(wp.element.unmountComponentAtNode).not.toHaveBeenCalled();
	await Promise.resolve();
	expect(wp.element.unmountComponentAtNode.mock.calls).toEqual([ [ detached ] ]);
	expect(glyphs.mounts()).toEqual([]);
	expect(glyphs.observing()).toBe(false);
});

test('a button that is off the page when it renders but on it once the commit is over is watched, and unmounted when it leaves', async () => {
	const wp = { element: { unmountComponentAtNode: jest.fn(() => true) } };
	const glyphs = load(wp);
	const container = document.createElement('div');
	const mount = buttonIn(container);
	glyphs.watchRootContainer(mount);
	// On the page before the check
	document.body.append(container);
	await Promise.resolve();
	expect(wp.element.unmountComponentAtNode).not.toHaveBeenCalled();
	expect(glyphs.mounts()).toEqual([ mount ]);
	expect(glyphs.observing()).toBe(true);

	container.remove();
	await afterMutations();
	expect(wp.element.unmountComponentAtNode.mock.calls).toEqual([ [ mount ] ]);
	expect(glyphs.mounts()).toEqual([]);
	expect(glyphs.observing()).toBe(false);
});

test('a root that no call can unmount is not watched', () => {
	// No unmountComponentAtNode(), and the element has no createRoot() root
	const noUnmount = load({ element: {} });
	noUnmount.watchRootContainer(buttonIn(document.body));
	expect(noUnmount.mounts()).toEqual([]);
	expect(noUnmount.observing()).toBe(false);
});

test('an error in one unmount does not stop the others or the disconnect, and is thrown again later', async () => {
	const error = new Error('cleanup');
	const wp = { element: { unmountComponentAtNode: jest.fn().mockImplementationOnce(() => { throw error; }) } };
	const glyphs = load(wp);
	const container = document.createElement('div');
	document.body.append(container);
	const first = buttonIn(container);
	const second = buttonIn(container);
	glyphs.watchRootContainer(first);
	glyphs.watchRootContainer(second);

	jest.useFakeTimers({ doNotFake: [ 'queueMicrotask', 'nextTick', 'setImmediate' ] });
	try {
		container.remove();
		await Promise.resolve();
		await Promise.resolve();
		expect(wp.element.unmountComponentAtNode.mock.calls).toEqual([ [ first ], [ second ] ]);
		expect(glyphs.mounts()).toEqual([]);
		expect(glyphs.observing()).toBe(false);
		expect(() => jest.runOnlyPendingTimers()).toThrow('cleanup');
	} finally {
		jest.useRealTimers();
	}
});

test('each document is observed once, and each element watched once', () => {
	const observe = jest.spyOn(window.MutationObserver.prototype, 'observe');
	try {
		const glyphs = load({ element: { unmountComponentAtNode: jest.fn() } });
		const mount = buttonIn(document.body);
		glyphs.watchRootContainer(mount);
		glyphs.watchRootContainer(mount);
		glyphs.watchRootContainer(buttonIn(document.body));
		glyphs.watchRootContainer(buttonIn(document.body));
		expect(observe).toHaveBeenCalledTimes(1);
		expect(glyphs.mounts()).toHaveLength(3);
	} finally {
		observe.mockRestore();
	}
});

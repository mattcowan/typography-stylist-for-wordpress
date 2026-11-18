/**
 * hookContainerRef() (#419): the root an extension rendered into a hook
 * container is unmounted after the container leaves the page, and never
 * while the container is on the page.
 *
 * The ref callbacks are inline functions, so React calls the old one with
 * null and the new one with the element at every re-render; StrictMode (the
 * development build, SCRIPT_DEBUG) replays effects on elements that stay.
 * The second part renders a real container in React StrictMode, with
 * wp.element.unmountComponentAtNode() as a mock: the browser e2e spec
 * tests/e2e/hook-container-unmount.spec.js covers real legacy roots.
 */

const React = require('react');
const { createRoot } = require('react-dom/client');
const { act } = require('react');
const { hookContainerRef, unmountHookContainer } = require('../hook-container.js');

// Let the microtask that checks the queued containers run
const afterMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

// A container with the mark that wp.element.render() leaves (React 16-18)
function legacyRoot() {
	const el = document.createElement('div');
	el._reactRootContainer = {};
	return el;
}

describe('hookContainerRef()', () => {
	let unmount;

	beforeEach(() => {
		unmount = jest.fn((el) => {
			el._reactRootContainer = null;
			return true;
		});
		window.wp = { element: { unmountComponentAtNode: unmount } };
	});

	afterEach(() => {
		delete window.wp;
		document.body.innerHTML = '';
	});

	test('fire receives the element, and is never called with null', () => {
		const fire = jest.fn();
		const ref = hookContainerRef(fire);
		const el = legacyRoot();
		document.body.appendChild(el);
		ref(el);
		ref(null);
		expect(fire.mock.calls).toEqual([ [ el ] ]);
	});

	test('a container that left the page is unmounted after the commit, not during it', async () => {
		const ref = hookContainerRef(() => {});
		const el = legacyRoot();
		document.body.appendChild(el);
		ref(el);
		el.remove();
		ref(null);
		expect(unmount).not.toHaveBeenCalled();
		await afterMicrotasks();
		expect(unmount.mock.calls).toEqual([ [ el ] ]);
	});

	test('a container still on the page is not unmounted (a re-render)', async () => {
		const el = legacyRoot();
		document.body.appendChild(el);
		// The old ref gets null, the new one the same element
		const before = hookContainerRef(() => {});
		before(el);
		before(null);
		hookContainerRef(() => {})(el);
		await afterMicrotasks();
		expect(unmount).not.toHaveBeenCalled();
	});

	test('a container that is not a root is left alone (an extension rendered into an element it appended)', async () => {
		const ref = hookContainerRef(() => {});
		const el = document.createElement('div');
		el.appendChild(legacyRoot());
		document.body.appendChild(el);
		ref(el);
		el.remove();
		ref(null);
		await afterMicrotasks();
		expect(unmount).not.toHaveBeenCalled();
	});

	test('several containers that leave in one commit are all unmounted, once each', async () => {
		const els = [ legacyRoot(), legacyRoot(), legacyRoot() ];
		const refs = els.map((el) => {
			document.body.appendChild(el);
			const ref = hookContainerRef(() => {});
			ref(el);
			return ref;
		});
		els.forEach((el) => el.remove());
		refs.forEach((ref) => {
			ref(null);
			ref(null);
		});
		await afterMicrotasks();
		expect(unmount.mock.calls).toEqual(els.map((el) => [ el ]));
	});

	test('an error in one extension\'s cleanup does not stop the others, and is thrown again later', async () => {
		// Fake setTimeout only: the error waits there, so the test catches it
		jest.useFakeTimers({ doNotFake: [ 'queueMicrotask', 'nextTick' ] });
		try {
			const els = [ legacyRoot(), legacyRoot() ];
			unmount.mockImplementationOnce(() => {
				throw new Error('extension cleanup');
			});
			els.forEach((el) => {
				document.body.appendChild(el);
				const ref = hookContainerRef(() => {});
				ref(el);
				el.remove();
				ref(null);
			});
			await Promise.resolve();
			await Promise.resolve();
			expect(unmount.mock.calls).toEqual(els.map((el) => [ el ]));
			expect(() => jest.runOnlyPendingTimers()).toThrow('extension cleanup');
		} finally {
			jest.useRealTimers();
		}
	});
});

describe('unmountHookContainer()', () => {
	afterEach(() => {
		delete window.wp;
	});

	test('does nothing without unmountComponentAtNode() (React 19), or with no container', () => {
		window.wp = { element: {} };
		expect(unmountHookContainer(legacyRoot())).toBe(false);
		delete window.wp;
		expect(unmountHookContainer(legacyRoot())).toBe(false);
		window.wp = { element: { unmountComponentAtNode: jest.fn(() => true) } };
		expect(unmountHookContainer(null)).toBe(false);
		expect(unmountHookContainer(undefined)).toBe(false);
		expect(window.wp.element.unmountComponentAtNode).not.toHaveBeenCalled();
	});

	test('unmounts a legacy root, and reports it', () => {
		window.wp = { element: { unmountComponentAtNode: jest.fn(() => true) } };
		const el = legacyRoot();
		expect(unmountHookContainer(el)).toBe(true);
		expect(window.wp.element.unmountComponentAtNode).toHaveBeenCalledWith(el);
	});
});

describe('a hook container in React StrictMode', () => {
	let unmount;
	let container;
	let root;

	beforeAll(() => {
		global.IS_REACT_ACT_ENVIRONMENT = true;
	});

	beforeEach(() => {
		unmount = jest.fn(() => true);
		window.wp = { element: { unmountComponentAtNode: unmount } };
		container = document.createElement('div');
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		delete window.wp;
		container.remove();
	});

	// A host component with a hook container, as HookPoint and the Quick
	// Feature Toggles write it: an inline ref, fired once per element
	function Host({ fired, label, keyName }) {
		return React.createElement('section', null,
			React.createElement('span', null, label),
			React.createElement('div', {
				key: keyName,
				className: 'typost-hook-point',
				ref: hookContainerRef((el) => {
					if (el && ! el._hooked) {
						el._hooked = true;
						el._reactRootContainer = {};
						fired.push(el);
					}
				}),
			})
		);
	}

	function render(props) {
		act(() => {
			root.render(React.createElement(React.StrictMode, null, React.createElement(Host, props)));
		});
	}

	test('mounting and re-rendering unmount nothing; a new key unmounts the old container; unmounting the host unmounts the last', async () => {
		const fired = [];
		render({ fired, label: 'one', keyName: 'a' });
		render({ fired, label: 'two', keyName: 'a' });
		await afterMicrotasks();
		expect(fired).toHaveLength(1);
		expect(unmount).not.toHaveBeenCalled();

		// A new key (the font changed): a new container, the old one goes
		render({ fired, label: 'two', keyName: 'b' });
		await afterMicrotasks();
		expect(fired).toHaveLength(2);
		expect(unmount.mock.calls).toEqual([ [ fired[0] ] ]);

		act(() => {
			root.unmount();
		});
		await afterMicrotasks();
		expect(unmount.mock.calls).toEqual([ [ fired[0] ], [ fired[1] ] ]);
	});
});

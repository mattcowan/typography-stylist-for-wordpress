/**
 * The Variable Fonts axis session and debounced dispatch after #419, when
 * core unmounts a panel as its hook container leaves the page:
 * - a panel does not join a session whose panels have all left the page
 *   (the sidebar goes from one block to another in the same font, and the
 *   new panel mounts before the old one unmounts);
 * - a session is released by object, so an old panel cannot release the
 *   newer session that holds the same key;
 * - a waiting dispatch is sent on unmount, but only while the block it was
 *   made for is still selected (an 'inspector' event goes to the block
 *   selected when it arrives).
 *
 * editor.js is a hand-written ES5 script with no exports: the functions are
 * cut out with tests/js/twin-source.js and run with stubbed module scope.
 */

const { extractFunction } = require('../../tests/js/twin-source.js');

const FILE = 'variable-fonts/assets/js/editor.js';
const NAMES = [ 'hasPanelOnPage', 'acquireAxisSession', 'releaseAxisSession', 'selectedBlockClientId', 'createDebouncedDispatch' ];

// The functions with their module-scope variables, around stubs
function load(stubs) {
	const code = NAMES.map((name) => extractFunction(FILE, name)).join('\n');
	const factory = new Function('window', 'wp', 'dispatchVariationSettings',
		'var axisSessions = {}; var debounceTimers = {}; var debounceCounter = 0;\n' + code +
		'\nreturn { sessions: function() { return axisSessions; }, acquireAxisSession: acquireAxisSession,' +
		' releaseAxisSession: releaseAxisSession, createDebouncedDispatch: createDebouncedDispatch };');
	return factory(stubs.window, stubs.window.wp, stubs.dispatch);
}

function stubs() {
	const state = { selected: null };
	const window = {
		typostVFUtils: { mergeAxisSession: jest.fn((session) => session) },
		wp: { data: { select: () => ({ getSelectedBlockClientId: () => state.selected }) } },
	};
	return { window, state, dispatch: jest.fn() };
}

function container() {
	const el = document.createElement('div');
	document.body.appendChild(el);
	return el;
}

afterEach(() => {
	document.body.innerHTML = '';
});

describe('axis sessions', () => {
	test('panels on the page share a session; a panel whose session has only panels that left starts a new one', () => {
		const s = stubs();
		const vf = load(s);
		const weight = container();
		const axes = container();
		const first = vf.acquireAxisSession('inspector:4', [], {}, weight);
		expect(vf.acquireAxisSession('inspector:4', [], {}, axes)).toBe(first);
		first.values.CONY = 1000;

		// The sidebar shows another block: the old containers leave first
		weight.remove();
		axes.remove();
		const next = vf.acquireAxisSession('inspector:4', [], {}, container());
		expect(next).not.toBe(first);
		expect(next.values).toEqual({});
		expect(vf.sessions()['inspector:4']).toBe(next);
		expect(s.window.typostVFUtils.mergeAxisSession).toHaveBeenCalledTimes(3);
	});

	test('a panel with no known container counts as on the page', () => {
		const vf = load(stubs());
		const first = vf.acquireAxisSession('qft:4', [], {}, null);
		expect(vf.acquireAxisSession('qft:4', [], {}, container())).toBe(first);
	});

	test('the old panels release their own session, not the newer one with the same key', () => {
		const vf = load(stubs());
		const oldWeight = container();
		const oldAxes = container();
		const first = vf.acquireAxisSession('inspector:4', [], {}, oldWeight);
		vf.acquireAxisSession('inspector:4', [], {}, oldAxes);
		oldWeight.remove();
		oldAxes.remove();
		const newEl = container();
		const next = vf.acquireAxisSession('inspector:4', [], {}, newEl);

		// Core unmounts the old panels after the new one mounted
		vf.releaseAxisSession('inspector:4', first, oldWeight);
		vf.releaseAxisSession('inspector:4', first, oldAxes);
		expect(first.refs).toBe(0);
		expect(vf.sessions()['inspector:4']).toBe(next);
		expect(next.refs).toBe(1);

		vf.releaseAxisSession('inspector:4', next, newEl);
		expect(vf.sessions()['inspector:4']).toBeUndefined();
	});
});

describe('the debounced dispatch', () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});
	afterEach(() => {
		jest.useRealTimers();
	});

	test('the timer sends to the block that is still selected', () => {
		const s = stubs();
		const send = load(s).createDebouncedDispatch(400);
		s.state.selected = 'A';
		send({ CONY: 501 }, 'inspector');
		jest.advanceTimersByTime(400);
		expect(s.dispatch.mock.calls).toEqual([ [ { CONY: 501 }, 'inspector' ] ]);
	});

	test('flush on unmount sends now, once (the dialog closed, the block is still selected)', () => {
		const s = stubs();
		const send = load(s).createDebouncedDispatch(400);
		s.state.selected = 'A';
		send({ CONY: 700 }, 'inline');
		send.flush();
		jest.advanceTimersByTime(1000);
		send.flush();
		expect(s.dispatch.mock.calls).toEqual([ [ { CONY: 700 }, 'inline' ] ]);
	});

	test('nothing is sent after another block was selected, by flush or by the timer', () => {
		const s = stubs();
		const vf = load(s);
		const flushed = vf.createDebouncedDispatch(400);
		const timed = vf.createDebouncedDispatch(400);
		s.state.selected = 'A';
		flushed({ CONY: 501 }, 'inspector');
		timed({ CONY: 502 }, 'inspector');
		s.state.selected = 'B';
		flushed.flush();
		jest.advanceTimersByTime(1000);
		expect(s.dispatch).not.toHaveBeenCalled();
	});

	test('nothing is sent after the selected block was removed', () => {
		const s = stubs();
		const send = load(s).createDebouncedDispatch(400);
		s.state.selected = 'B';
		send({ CONY: 1 }, 'inspector');
		s.state.selected = 'A';
		send.flush();
		expect(s.dispatch).not.toHaveBeenCalled();
	});
});

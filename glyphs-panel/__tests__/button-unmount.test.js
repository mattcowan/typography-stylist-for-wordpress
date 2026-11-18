/**
 * The "Glyphs…" button renders into an element it appends to the hook
 * container, which core cannot unmount (#419). watchButtonMount() and
 * releaseDetachedButtons() unmount it when it leaves the page, leave a
 * button on the page alone, and stop observing when none is left.
 *
 * editor.js is a hand-written ES5 script with no exports: the functions are
 * cut out with tests/js/twin-source.js and run with stubbed module scope.
 */

const { extractFunction } = require('../../tests/js/twin-source.js');

const FILE = 'glyphs-panel/assets/js/editor.js';

function load(wp) {
	const code = [ 'releaseDetachedButtons', 'watchButtonMount' ].map((name) => extractFunction(FILE, name)).join('\n');
	return new Function('window', 'wp',
		'var buttonMounts = []; var buttonMountObserver = null;\n' + code +
		'\nreturn { watchButtonMount: watchButtonMount, mounts: function() { return buttonMounts; },' +
		' observing: function() { return buttonMountObserver !== null; } };')(window, wp);
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
	glyphs.watchButtonMount(inlineButton);
	glyphs.watchButtonMount(qftButton);
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

test('a button that is not on the page, or no unmountComponentAtNode() (React 19), is not watched', () => {
	const glyphs = load({ element: { unmountComponentAtNode: jest.fn() } });
	glyphs.watchButtonMount(document.createElement('div'));
	expect(glyphs.mounts()).toEqual([]);
	expect(glyphs.observing()).toBe(false);

	const noUnmount = load({ element: {} });
	noUnmount.watchButtonMount(buttonIn(document.body));
	expect(noUnmount.mounts()).toEqual([]);
});

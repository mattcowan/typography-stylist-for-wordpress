/**
 * Parity tests for JavaScript twins that had none (#358).
 *
 * Each describe block runs every copy of one twin on the same inputs. Where
 * the copies differ on purpose or have drifted, the difference is a named
 * case, so a change to either copy is deliberate. docs/twins.md lists every
 * twin and the test that holds it.
 *
 * A copy that cannot be imported (an ES5 script with no export, a class
 * method, an object literal assigned at load time) is cut out of its source
 * by tests/js/twin-source.js and run, not compared as text.
 */

import { render, renderHook, act } from '@testing-library/react';
import { createElement } from '@wordpress/element';
import useQftModalFrame from '../../../blocks/typography-stylist/hooks/use-qft-modal-frame';

// The build loads these from WordPress; they are not installed for Jest.
// The Notice stand-in renders its text so both ZoomNotice copies can be read.
jest.mock('@wordpress/components', () => {
	const { createElement: h } = require('@wordpress/element');
	return { Notice: ({ children, className }) => h('div', { className }, children) };
}, { virtual: true });
jest.mock('@wordpress/a11y', () => ({ speak: jest.fn() }), { virtual: true });

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');

const { extractFunction, extractBlock, loadFunction, matchingBrace } = require('../../../tests/js/twin-source.js');

beforeAll(() => {
	global.wp = Object.assign({}, global.wp, {
		i18n: require('@wordpress/i18n'),
		element: require('@wordpress/element'),
		components: require('@wordpress/components'),
		a11y: { speak: jest.fn() },
	});
});

describe('tests/js/twin-source.js (the reader the cases below use)', () => {
	test('finds a function and its whole body', () => {
		const body = extractFunction('paragraph-styles/assets/js/editor.js', 'getNewFontSizeUnit');
		expect(body).toMatch(/^function getNewFontSizeUnit\(\) \{/);
		expect(body).toMatch(/\}$/);
	});

	test('a name that is not there fails with a message that says what to do (control)', () => {
		expect(() => extractFunction('paragraph-styles/assets/js/editor.js', 'noSuchFunctionInThisFile'))
			.toThrow('function noSuchFunctionInThisFile() not found in paragraph-styles/assets/js/editor.js: it was renamed or moved; update the test and its row in docs/twins.md.');
		expect(() => extractBlock('blocks/typography-stylist/edit.js', 'noSuchMarker = {')).toThrow(/not found in blocks\/typography-stylist\/edit\.js/);
	});

	test('braces inside strings, comments and regular expressions do not count', () => {
		const source = "{ var a = '}'; /* } */ // }\n var b = /[}]\\}/g; var c = `}`; if (a) { b(); } }";
		expect(matchingBrace(source, 0)).toBe(source.length - 1);
	});
});

describe('getNewFontSizeUnit (font-size-units.js and the Paragraph Styles editor script)', () => {
	const { getNewFontSizeUnit } = require('../font-size-units.js');
	const psCopy = new Function('window', extractFunction('paragraph-styles/assets/js/editor.js', 'getNewFontSizeUnit') + '\nreturn getNewFontSizeUnit;');

	test.each([
		['no typostData', undefined],
		['the px setting', { newFontSizeUnit: 'px' }],
		['the rem setting', { newFontSizeUnit: 'rem' }],
		['no key', {}],
		['another case', { newFontSizeUnit: 'PX' }],
		['a flag-like value', { newFontSizeUnit: '1' }],
		['a boolean', { newFontSizeUnit: true }],
	])('%s', (label, typostData) => {
		const fromModule = getNewFontSizeUnit(typostData === undefined ? null : typostData);
		expect(psCopy({ typostData })()).toBe(fromModule);
	});
});

describe('normalizeHang and its cap (the block utils.js and ps-utils.js)', () => {
	const block = require('../../../blocks/typography-stylist/utils.js');
	const ps = require('../../../paragraph-styles/assets/js/lib/ps-utils.js');

	test.each([
		[0.1], [0.25], ['0.15'], [' 0.2 '], [0.00049], [0.0005], [0.12345], [1], [1.5], [5], ['1e3'], ['1e999'], [-0.2], ['abc'], [''], [null], [true],
	])('%p', (value) => {
		expect(block.normalizeHang(value)).toBe(ps.normalizeHang(value));
	});

	test('the caps are the same value', () => {
		expect(block.INITIAL_HANG_MAX).toBe(1);
		expect(block.normalizeHang(5)).toBe(1);
	});
});

describe('getCategoryTitle (the block and the inline editor)', () => {
	const inline = require('../inline-editor/feature-options.js').getCategoryTitle;
	const block = require('../../../blocks/typography-stylist/feature-categories.js').default;

	test.each(['ligatures', 'stylistic-sets', 'alternates', 'decorative', 'numerals', 'capitals', 'positional', 'super-sub', 'other', 'unknown-category', ''])('%s', (category) => {
		expect(block(category)).toBe(inline(category));
	});

	test('every category the server sends has a title in both copies', () => {
		// tests/Unit/FeatureCategoriesFixtureTest.php holds the PHP list to this fixture
		const { categories } = require('../../../tests/fixtures/feature-categories.json');
		expect(categories.length).toBeGreaterThan(5);
		categories.forEach((category) => {
			expect(inline(category)).not.toBe(category);
			expect(block(category)).not.toBe(category);
		});
	});
});

describe('font weight options (the block and the inline editor)', () => {
	const inline = require('../inline-editor/feature-options.js').getFilteredWeightOptions;
	const { getFilteredWeightOptions: block, ALL_WEIGHT_OPTIONS } = require('../../../blocks/typography-stylist/utils.js');

	test.each([
		['no font', 0, {}],
		['a font not in the map', 9, {}],
		['a font with no weights listed', 4, { 4: { availableWeights: [] } }],
		['a font with some weights', 4, { 4: { availableWeights: ['300', '700', '950'] } }],
		['a font with every weight', 4, { 4: { availableWeights: ['100', '200', '300', '400', '500', '600', '700', '800', '900'] } }],
	])('%s: same values and (untranslated) labels', (label, fontId, map) => {
		expect(block(fontId, map, false)).toEqual(inline(fontId, map));
	});

	test('differs: only the block offers "Inherit from block", and only when asked', () => {
		expect(block(0, {}, true)[0]).toEqual({ label: 'Inherit from block', value: 'inherit' });
		expect(inline(0, {}).some((o) => o.value === 'inherit')).toBe(false);
	});

	// ALL_WEIGHT_OPTIONS stays English data; Edit wraps the helper and
	// replaces each label with a translated string of the same text
	// (weightOptionLabels in edit.js). Rendering Edit is out of reach here, so
	// this checks the next best thing: every label is a string the block's
	// own source passes to __() in the plugin's text domain, which is what
	// puts it in the block script's translation file. It does not prove the
	// map is applied; the wrapper's use is checked only by reading edit.js.
	const blockTranslatedStrings = () => {
		const dir = path.join(ROOT, 'blocks/typography-stylist');
		const found = new Set();
		const walk = (folder) => fs.readdirSync(folder, { withFileTypes: true }).forEach((entry) => {
			const full = path.join(folder, entry.name);
			if (entry.isDirectory()) {
				if (entry.name !== 'build' && entry.name !== '__tests__') {
					walk(full);
				}
			} else if (/\.js$/.test(entry.name) && entry.name !== 'deprecated.js') {
				for (const m of fs.readFileSync(full, 'utf8').matchAll(/__\(\s*'((?:[^'\\]|\\.)*)',\s*'typography-stylist'\s*\)/g)) {
					found.add(m[1]);
				}
			}
		});
		walk(dir);
		return found;
	};

	test('every label the block shows is translated in the block\'s own source', () => {
		const strings = blockTranslatedStrings();
		ALL_WEIGHT_OPTIONS.concat([{ label: 'Inherit from block' }]).forEach((option) => {
			expect(strings.has(option.label)).toBe(true);
		});
	});

	test('the scan finds translated strings and not invented ones (control)', () => {
		const strings = blockTranslatedStrings();
		expect(strings.size).toBeGreaterThan(50);
		expect(strings.has('999 (Not a weight)')).toBe(false);
	});
});

describe('isValidFontSizeRange (inline-apply-rules.js and the block utils.js): drifted', () => {
	const inline = require('../inline-apply-rules.js').isValidFontSizeRange;
	const { isValidFontSizeRange: block } = require('../../../blocks/typography-stylist/utils.js');

	test.each([
		[16, 24, 32],
		[16, 16, 16],
		[32, 24, 16],
		[16, 40, 32],
		[0, 0, 0],
	])('numbers agree: %s / %s / %s', (min, pref, max) => {
		expect(block(min, pref, max)).toBe(inline(min, pref, max));
	});

	test('differs: a value that is not a number (inline: valid; block: compared as is)', () => {
		expect(inline('', 24, 32)).toBe(true);
		expect(block('', 24, 32)).toBe(true);
		expect(inline('abc', 24, 32)).toBe(true);
		expect(block('abc', 24, 32)).toBe(false);
	});

	test('differs: numeric strings (inline: compared as numbers; block: compared as text)', () => {
		expect(inline('9', '16', '24')).toBe(true);
		expect(block('9', '16', '24')).toBe(false);
	});
});

describe('ZoomNotice (one component per build): drifted wording', () => {
	const BlockZoomNotice = require('../../../blocks/typography-stylist/components/zoom-notice.js').default;
	const InlineZoomNotice = require('../inline-editor/zoom-notice.js').ZoomNotice;

	const text = (Component, props) => {
		const { container, unmount } = render(createElement(Component, props));
		const out = container.textContent;
		unmount();
		return out;
	};

	test('no notice when the size doubles, in both', () => {
		expect(text(BlockZoomNotice, { min: 16, preferred: 32, max: 64, unit: 'rem' })).toBe('');
		expect(text(InlineZoomNotice, { min: 16, preferred: 32, max: 64, unit: 'rem' })).toBe('');
	});

	test('differs: the slower notice names each editor\'s own slider labels', () => {
		const props = { min: 16, preferred: 16, max: 120, unit: 'rem' };
		expect(text(BlockZoomNotice, props)).toBe('To stay readable when a reader zooms in, this size grows more slowly than set: 64px in a 1920px window instead of 120px. To reach 120px, set Intermediate to at least 30px.');
		expect(text(InlineZoomNotice, props)).toBe('To stay readable when a reader zooms in, this size grows more slowly than set: 64px in a 1920px window instead of 120px. To reach 120px, set Preferred to at least 30px.');
	});

	test('differs: the fails notice names each editor\'s own slider labels', () => {
		const props = { min: 16, preferred: 16, max: 120, unit: 'px' };
		expect(text(BlockZoomNotice, props)).toBe('This size does not double when a reader zooms to 500%. Set Large to 64px or less, or Intermediate to at least 30px.');
		expect(text(InlineZoomNotice, props)).toBe('This size does not double when a reader zooms to 500%. Set Maximum to 64px or less, or Preferred to at least 30px.');
	});
});

describe('inherited font and weight readers (block-dom.js and the block utils.js)', () => {
	const { getBlockInheritedFont, getBlockInheritedWeight } = require('../inline-editor/block-dom.js');
	const { detectBlockComputedFont, detectBlockComputedWeight } = require('../../../blocks/typography-stylist/utils.js');

	const mount = (style, wrapperIsText) => {
		document.body.innerHTML = wrapperIsText
			? '<div data-block="b1" class="typost-block-content" style="' + style + '">Text</div>'
			: '<div data-block="b1"><div class="typost-block-content" style="' + style + '">Text</div></div>';
	};

	afterEach(() => {
		document.body.innerHTML = '';
	});

	test.each(['normal', 'bold', 'bolder', 'lighter', '700', '350', 'inherit'])('weight %s reads the same', (weight) => {
		mount('font-weight: ' + weight);
		expect(detectBlockComputedWeight('b1')).toBe(getBlockInheritedWeight('b1', 'typost/block', document, window));
	});

	test.each(['"Playfair Display", serif', 'Georgia', "'A B', 'C D', sans-serif"])('family %s reads the same, without quotes', (family) => {
		mount('font-family: ' + family.replace(/"/g, '&quot;'));
		const fromBlock = detectBlockComputedFont('b1');
		expect(fromBlock).not.toMatch(/["']/);
		expect(fromBlock).toBe(getBlockInheritedFont('b1', 'typost/block', document, window));
	});

	test('differs: the block reader also takes the wrapper itself; the inline reader looks only inside it', () => {
		mount('font-weight: 700', true);
		expect(detectBlockComputedWeight('b1')).toBe('700');
		expect(getBlockInheritedWeight('b1', 'typost/block', document, window)).toBe('');
	});
});

describe('hook registry (the block edit.js and the inline editor hook-registry.js)', () => {
	// Whichever editor script loads first installs window.typostHooks, so
	// the two must behave the same or behavior depends on load order.
	const { createHookRegistry } = require('../inline-editor/hook-registry.js');
	const blockRegistry = () => new Function('return ' + extractBlock('blocks/typography-stylist/edit.js', 'window.typostHooks = window.typostHooks || {') + ';')();

	// One script of calls, run on a registry; returns everything it observed.
	const drive = (registry) => {
		const log = [];
		const a = (tag) => (...args) => log.push(tag + ':' + JSON.stringify(args));
		const late = a('late');
		const early = a('early');
		const same1 = a('same1');
		const same2 = a('same2');
		registry.addAction('act', late, 20);
		registry.addAction('act', early, 5);
		registry.addAction('act', same1);
		registry.addAction('act', same2, 10);
		registry.doAction('act', 1, 'two', { three: 3 });
		registry.removeAction('act', same1);
		registry.doAction('act');
		registry.doAction('no-such-action', 1);
		registry.removeAction('no-such-action', late);

		const append = (s) => (v, extra) => v + s + (extra === undefined ? '' : extra);
		const b = append('B');
		registry.addFilter('f', append('C'), 30);
		registry.addFilter('f', append('A'), 1);
		registry.addFilter('f', b);
		registry.addFilter('f', append('B2'), 10);
		log.push('filter:' + registry.applyFilters('f', 'x', '!'));
		registry.removeFilter('f', b);
		log.push('filter:' + registry.applyFilters('f', 'x'));
		log.push('unknown:' + registry.applyFilters('nothing', 'kept', 1));
		registry.removeFilter('nothing', b);
		// Priority 0 is falsy, so both copies treat it as the default 10:
		// it runs after priority 5 and in added order with another 10
		registry.addFilter('z', append('0'), 0);
		registry.addFilter('z', append('5'), 5);
		registry.addFilter('z', append('10'));
		log.push('priority 0:' + registry.applyFilters('z', 'x'));
		return log;
	};

	test('both copies are found (control)', () => {
		expect(typeof blockRegistry().applyFilters).toBe('function');
		expect(typeof createHookRegistry().applyFilters).toBe('function');
	});

	test('the same calls give the same results in both', () => {
		const fromBlock = drive(blockRegistry());
		expect(fromBlock).toEqual(drive(createHookRegistry()));
		expect(fromBlock).toContain('filter:xA!B!B2!C!');
		expect(fromBlock).toContain('priority 0:x5010');
	});
});

describe('modal drag clamp (the inline constrainToViewport and the block QFT modal)', () => {
	const { constrainToViewport } = require('../modal-drag-resize.js');

	const setViewport = (width, height) => {
		Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
		Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
	};
	const header = { closest: (selector) => (selector === '.typost-modal-header' ? {} : null) };
	const key = (k) => ({ key: k, preventDefault() {}, stopPropagation() {} });

	// Drag the block's real modal hook by (dx, dy) from where it starts
	const blockDrag = (dx, dy) => {
		const { result } = renderHook(() => useQftModalFrame());
		const start = { x: result.current.modalX, y: result.current.modalY };
		act(() => {
			result.current.handleDragStart({ target: header, clientX: 100, clientY: 100, preventDefault() {}, stopPropagation() {} });
		});
		act(() => {
			result.current.handleDragMove({ clientX: 100 + dx, clientY: 100 + dy });
		});
		return { start, end: { x: result.current.modalX, y: result.current.modalY } };
	};

	afterEach(() => setViewport(1024, 768));

	test.each([
		['inside the window', 1280, 800, 40, -30],
		['past the right and bottom edges', 1280, 800, 5000, 5000],
		['past the left and top edges', 1280, 800, -5000, -5000],
		['a window narrower than the kept 50px', 30, 20, 25, 25],
	])('%s', (label, width, height, dx, dy) => {
		setViewport(width, height);
		const { start, end } = blockDrag(dx, dy);
		const expected = constrainToViewport(start.x + dx, start.y + dy, 500, 600);
		expect(end).toEqual({ x: expected.x, y: expected.y });
	});

	test('differs: the arrow keys stop 50px from the edge in the block and 100px in the inline editor', () => {
		setViewport(1000, 700);
		const { result } = renderHook(() => useQftModalFrame());
		for (let i = 0; i < 120; i++) {
			act(() => result.current.handleHeaderKeyDown(key('ArrowRight')));
			act(() => result.current.handleHeaderKeyDown(key('ArrowDown')));
		}
		expect({ x: result.current.modalX, y: result.current.modalY }).toEqual({ x: 950, y: 650 });

		const inlineKeyDown = new Function('e', extractBlock('assets/js/block-editor.js', 'handleHeaderKeyDown(e) {'));
		const component = { state: { modalX: 0, modalY: 0 }, setState(next) { Object.assign(this.state, next); } };
		for (let i = 0; i < 120; i++) {
			inlineKeyDown.call(component, key('ArrowRight'));
			inlineKeyDown.call(component, key('ArrowDown'));
		}
		expect(component.state).toEqual({ modalX: 900, modalY: 600 });
	});
});

describe('waitForHooks (Glyphs, Paragraph Styles and Variable Fonts editor scripts): drifted', () => {
	const copies = {
		glyphs: 'glyphs-panel/assets/js/editor.js',
		paragraphStyles: 'paragraph-styles/assets/js/editor.js',
		variableFonts: 'variable-fonts/assets/js/editor.js',
	};

	beforeEach(() => {
		jest.useFakeTimers();
		delete window.typostHooks;
	});
	afterEach(() => {
		jest.useRealTimers();
		delete window.typostHooks;
	});

	// The hooks appear after this many 100 ms ticks; how often did the callback run?
	const run = (file, appearAfterTicks) => {
		delete window.typostHooks;
		const waitForHooks = loadFunction(file, 'waitForHooks');
		const callback = jest.fn();
		waitForHooks(callback);
		jest.advanceTimersByTime(appearAfterTicks * 100);
		window.typostHooks = {};
		jest.advanceTimersByTime(1000);
		return callback.mock.calls.length;
	};

	test.each(Object.entries(copies))('%s runs the callback at once when the hooks exist', (name, file) => {
		window.typostHooks = {};
		const callback = jest.fn();
		loadFunction(file, 'waitForHooks')(callback);
		expect(callback).toHaveBeenCalledTimes(1);
	});

	test.each(Object.entries(copies))('%s runs the callback once when the hooks appear soon', (name, file) => {
		expect(run(file, 3)).toBe(1);
	});

	test('differs: after 50 tries only the Glyphs copy is still waiting', () => {
		expect(run(copies.glyphs, 60)).toBe(1);
		expect(run(copies.paragraphStyles, 60)).toBe(0);
		expect(run(copies.variableFonts, 60)).toBe(0);
	});
});

describe('paragraph style weight rule (the CSS generators and resolveParagraphStyleFontWeight)', () => {
	// inline-apply-rules.js reads a style's weight the way the generators
	// write it, as a value (normal and bold as 400 and 700). The generators
	// are held to the shared fixture (PHP by ParagraphStylesStyleCssTest),
	// so every fixture case with a weight is a case for the inline reader.
	const { resolveParagraphStyleFontWeight } = require('../inline-apply-rules.js');
	const fixture = require('../../../paragraph-styles/__tests__/fixtures/style-css.json');
	const canonical = { normal: '400', bold: '700' };

	// What PHP writes for the case, as the inline reader reports it
	const phpWeight = (c) => {
		const m = /\n {4}font-weight: ([^;]+);/.exec(c.php !== undefined ? c.php : c.css);
		return m ? (canonical[m[1]] || m[1]) : '';
	};
	const inline = (c) => resolveParagraphStyleFontWeight([{ id: 8, properties: c.style.properties }], 8);

	// Inputs where the inline reader and PHP disagree today: [inline, PHP]
	const DIFFERS = {
		'1e3': ['1', '1000'],
		'0x1A': ['0', ''],
		BOLD: ['700', ''],
	};

	const cases = fixture.cases.filter((c) => 'fontWeight' in c.style.properties);

	test('the fixture has weight cases (control)', () => {
		expect(cases.length).toBeGreaterThan(10);
	});

	test.each(cases.filter((c) => !(String(c.style.properties.fontWeight) in DIFFERS)).map((c) => [c.label, c]))('%s', (label, c) => {
		expect(inline(c)).toBe(phpWeight(c));
	});

	test.each(Object.entries(DIFFERS))('differs: %s', (value, [fromInline, fromPhp]) => {
		const c = cases.find((x) => String(x.style.properties.fontWeight) === value);
		expect(c).toBeDefined();
		expect(phpWeight(c)).toBe(fromPhp);
		expect(inline(c)).toBe(fromInline);
	});
});

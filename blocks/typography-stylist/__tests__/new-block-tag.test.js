/**
 * Test Suite: the tag a new block starts with (#410)
 *
 * The author's last pick in "Change heading level" is remembered in
 * localStorage (never h1), and the inserter's default variation gives a new
 * block that tag, together with #248's fontSizeUnit on a px site. The
 * variation is always registered under one name and is active for every
 * block, so the inserter's "Most used" count has one key.
 */

const tagModule = require('../../../assets/js/new-block-tag.js');
const units = require('../../../assets/js/font-size-units.js');

const {
	HEADING_LEVEL_TAGS,
	REMEMBERED_TAG_STORAGE_KEY,
	NEW_BLOCK_VARIATION_NAME,
	isNewBlockVariationActive,
	isRememberableTag,
	readRememberedTag,
	rememberTag,
	buildNewBlockVariation,
	syncNewBlockVariation,
	rememberNewBlockTag,
	installNewBlockVariation
} = tagModule;

const UNIT_VARIATION_NAME = units.buildNewBlockUnitVariation('px').name;

// What a registered variation does, without its isActive function
const shape = (variation) => ({
	name: variation.name,
	isDefault: variation.isDefault,
	scope: variation.scope,
	isActive: typeof variation.isActive,
	attributes: variation.attributes
});
const expected = (attributes) => ({
	name: NEW_BLOCK_VARIATION_NAME,
	isDefault: true,
	scope: ['inserter'],
	isActive: 'function',
	attributes
});
const registeredAttributes = (blocks) => blocks.variations.map((v) => [v.name, v.attributes]);

/** A Storage double backed by a plain object. */
function memoryStorage(initial) {
	const data = Object.assign({}, initial);
	return {
		data,
		getItem: (key) => (Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null),
		setItem: (key, value) => {
			data[key] = String(value);
		}
	};
}

/** Storage that throws on every call (privacy mode, sandboxed frame). */
const throwingStorage = {
	getItem() {
		throw new Error('SecurityError');
	},
	setItem() {
		throw new Error('QuotaExceededError');
	}
};

/**
 * A wp.blocks double with core's variation semantics: registering a name
 * that exists keeps the first one (getUniqueItemsByName in
 * @wordpress/blocks), unregistering filters by name.
 */
function fakeBlocks(initial) {
	const api = {
		variations: (initial || []).slice(),
		dispatches: 0,
		getBlockVariations: (blockName) => (blockName === 'typost/block' ? api.variations : []),
		registerBlockVariation: (blockName, variation) => {
			api.dispatches++;
			if (!api.variations.some((v) => v.name === variation.name)) {
				api.variations = api.variations.concat([variation]);
			}
		},
		unregisterBlockVariation: (blockName, name) => {
			api.dispatches++;
			api.variations = api.variations.filter((v) => v.name !== name);
		}
	};
	return api;
}

const pxData = { newFontSizeUnit: 'px' };
const remData = { newFontSizeUnit: 'rem' };

afterEach(() => {
	try {
		window.localStorage.clear();
	} catch (e) {
		// jsdom always has it
	}
	delete window.typostData;
});

describe('HEADING_LEVEL_TAGS', () => {
	test('the eight tags of the menu, in menu order', () => {
		expect(HEADING_LEVEL_TAGS).toEqual(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div']);
	});
});

describe('isRememberableTag', () => {
	test.each(['h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div'])('%s counts', (tag) => {
		expect(isRememberableTag(tag)).toBe(true);
	});

	test('h1 never counts', () => {
		expect(isRememberableTag('h1')).toBe(false);
	});

	test.each([['H3'], [' h3'], ['h3 '], ['section'], ['h7'], [''], [null], [undefined], [3], [{}], [['h3']], [true]])(
		'%p does not count',
		(value) => {
			expect(isRememberableTag(value)).toBe(false);
		}
	);
});

describe('readRememberedTag', () => {
	test('returns a stored tag', () => {
		expect(readRememberedTag(memoryStorage({ [REMEMBERED_TAG_STORAGE_KEY]: 'h4' }))).toBe('h4');
	});

	test('nothing stored gives ""', () => {
		expect(readRememberedTag(memoryStorage())).toBe('');
	});

	test.each([['h1'], ['junk'], ['"h4"'], ['H4'], ['null'], ['']])('stored %p gives ""', (value) => {
		expect(readRememberedTag(memoryStorage({ [REMEMBERED_TAG_STORAGE_KEY]: value }))).toBe('');
	});

	test('storage that throws gives ""', () => {
		expect(readRememberedTag(throwingStorage)).toBe('');
	});

	test('no storage gives ""', () => {
		expect(readRememberedTag(null)).toBe('');
	});

	test('reads localStorage by default', () => {
		window.localStorage.setItem(REMEMBERED_TAG_STORAGE_KEY, 'p');
		expect(readRememberedTag()).toBe('p');
	});

	test('a window.localStorage getter that throws gives ""', () => {
		const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
		Object.defineProperty(window, 'localStorage', {
			configurable: true,
			get() {
				throw new Error('SecurityError');
			}
		});
		try {
			expect(readRememberedTag()).toBe('');
			expect(rememberTag('h3')).toBe(false);
		} finally {
			if (descriptor) {
				Object.defineProperty(window, 'localStorage', descriptor);
			} else {
				delete window.localStorage;
			}
		}
		expect(() => window.localStorage.getItem('x')).not.toThrow();
	});
});

describe('rememberTag', () => {
	test('writes the tag', () => {
		const storage = memoryStorage();
		expect(rememberTag('h4', storage)).toBe(true);
		expect(storage.data[REMEMBERED_TAG_STORAGE_KEY]).toBe('h4');
	});

	test('h1 is not written: the remembered tag stays what it was', () => {
		const storage = memoryStorage({ [REMEMBERED_TAG_STORAGE_KEY]: 'h4' });
		expect(rememberTag('h1', storage)).toBe(false);
		expect(storage.data[REMEMBERED_TAG_STORAGE_KEY]).toBe('h4');
	});

	test('h1 with nothing remembered leaves nothing remembered', () => {
		const storage = memoryStorage();
		rememberTag('h1', storage);
		expect(readRememberedTag(storage)).toBe('');
	});

	test('a tag outside the menu is not written', () => {
		const storage = memoryStorage({ [REMEMBERED_TAG_STORAGE_KEY]: 'h3' });
		expect(rememberTag('section', storage)).toBe(false);
		expect(storage.data[REMEMBERED_TAG_STORAGE_KEY]).toBe('h3');
	});

	test('storage that throws returns false and does not throw', () => {
		expect(() => rememberTag('h3', throwingStorage)).not.toThrow();
		expect(rememberTag('h3', throwingStorage)).toBe(false);
	});

	test('writes localStorage by default', () => {
		rememberTag('div');
		expect(window.localStorage.getItem(REMEMBERED_TAG_STORAGE_KEY)).toBe('div');
	});
});

describe('buildNewBlockVariation', () => {
	test('rem site, nothing remembered: the variation, with no attribute (block.json defaults apply)', () => {
		expect(shape(buildNewBlockVariation('rem', ''))).toEqual(expected({}));
	});

	test('rem site, tag remembered: the tag', () => {
		expect(shape(buildNewBlockVariation('rem', 'h4'))).toEqual(expected({ tagName: 'h4' }));
	});

	test('px site, nothing remembered: #248\'s unit', () => {
		expect(shape(buildNewBlockVariation('px', ''))).toEqual(expected(units.buildNewBlockUnitVariation('px').attributes));
	});

	test('px site, tag remembered: the unit and the tag', () => {
		expect(shape(buildNewBlockVariation('px', 'p'))).toEqual(expected({ fontSizeUnit: 'px', tagName: 'p' }));
	});

	test('one name on every site and with any tag, so the inserter count has one key', () => {
		const names = new Set(['rem', 'px'].flatMap((unit) => ['', 'h2', 'h4', 'div'].map((tag) => buildNewBlockVariation(unit, tag).name)));
		expect([...names]).toEqual([NEW_BLOCK_VARIATION_NAME]);
		expect(NEW_BLOCK_VARIATION_NAME).not.toBe(UNIT_VARIATION_NAME);
	});

	test('isActive is a function that matches every Typography Stylist block when it is alone', () => {
		const variation = buildNewBlockVariation('rem', '');
		expect(variation.isActive).toBe(isNewBlockVariationActive);
		expect(variation.isActive({ tagName: 'h1', fontSizeUnit: 'px' }, variation.attributes)).toBe(true);
		expect(variation.isActive({}, {})).toBe(true);
	});

	test('a remembered h2 adds nothing (it is the default)', () => {
		expect(buildNewBlockVariation('rem', 'h2').attributes).toEqual({});
		expect(buildNewBlockVariation('px', 'h2').attributes).toEqual({ fontSizeUnit: 'px' });
	});

	test('h1 or junk as the remembered tag adds nothing', () => {
		expect(buildNewBlockVariation('rem', 'h1').attributes).toEqual({});
		expect(buildNewBlockVariation('rem', 'section').attributes).toEqual({});
		expect(buildNewBlockVariation('rem', undefined).attributes).toEqual({});
		expect(buildNewBlockVariation('px', 'h1').attributes).toEqual({ fontSizeUnit: 'px' });
	});

	test('the variation keeps the block title, icon and description', () => {
		const variation = buildNewBlockVariation('rem', 'h5');
		expect(variation).not.toHaveProperty('title');
		expect(variation).not.toHaveProperty('icon');
		expect(variation).not.toHaveProperty('description');
	});

	test('does not change the object #248 builds', () => {
		buildNewBlockVariation('px', 'h3');
		expect(units.buildNewBlockUnitVariation('px').attributes).toEqual({ fontSizeUnit: 'px' });
	});
});

describe('isNewBlockVariationActive yields to another variation of the block', () => {
	const ATTRIBUTE_KEYS = ['content', 'tagName', 'fontSizeUnit', 'className', 'style', 'layout'];
	// A wp.blocks double holding ours and the given other variations
	function api(others) {
		return {
			getBlockVariations: () => [buildNewBlockVariation('rem', '')].concat(others),
			getBlockType: () => ({ attributes: Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, {}])) })
		};
	}
	const active = (attributes, others) => isNewBlockVariationActive(attributes, {}, api(others));
	const pull = { name: 'ext-pull', attributes: { className: 'is-pull' }, isActive: ['className'] };

	test('ours alone: active', () => {
		expect(active({ tagName: 'h1' }, [])).toBe(true);
	});

	test('no wp.blocks (the unit tests, an early call): active', () => {
		expect(isNewBlockVariationActive({}, {})).toBe(true);
	});

	test('an array isActive that matches claims the block', () => {
		expect(active({ className: 'is-pull' }, [pull])).toBe(false);
	});

	test('an array isActive that does not match claims nothing', () => {
		expect(active({ className: 'other' }, [pull])).toBe(true);
		expect(active({}, [pull])).toBe(true);
	});

	test('a function isActive is called with the block attributes and its own attributes', () => {
		const fn = jest.fn((block, own) => block.tagName === own.tagName);
		const others = [{ name: 'ext-fn', attributes: { tagName: 'h5' }, isActive: fn }];
		expect(active({ tagName: 'h5' }, others)).toBe(false);
		expect(fn).toHaveBeenCalledWith({ tagName: 'h5' }, { tagName: 'h5' });
		expect(active({ tagName: 'h2' }, others)).toBe(true);
	});

	test('a variation with no isActive claims nothing (core never finds it active)', () => {
		expect(active({ className: 'is-pull' }, [{ name: 'ext-plain', attributes: { className: 'is-pull' } }])).toBe(true);
	});

	test('an isActive that throws claims nothing and does not throw', () => {
		const others = [{ name: 'ext-broken', attributes: {}, isActive: () => { throw new Error('extension bug'); } }];
		expect(() => active({}, others)).not.toThrow();
		expect(active({}, others)).toBe(true);
		// and it does not hide a later variation that claims the block
		expect(active({ className: 'is-pull' }, others.concat([pull]))).toBe(false);
	});

	test('#248\'s old variation and our own name are not "another variation"', () => {
		const old248 = Object.assign({}, units.buildNewBlockUnitVariation('px'), { isActive: () => true });
		const ownCopy = Object.assign({}, buildNewBlockVariation('px', 'h4'), { isActive: () => true });
		expect(active({}, [old248, ownCopy])).toBe(true);
	});

	test('an empty array, or one naming no attribute of the block, claims nothing (all versions)', () => {
		expect(active({}, [{ name: 'e', attributes: {}, isActive: [] }])).toBe(true);
		expect(active({ x: 1 }, [{ name: 'e', attributes: { x: 1 }, isActive: ['x'] }])).toBe(true);
	});

	test('6.6+ rules: a dotted path and an object value', () => {
		const layout = { name: 'ext-layout', attributes: { layout: { type: 'flex' } }, isActive: ['layout.type'] };
		expect(active({ layout: { type: 'flex', wrap: 1 } }, [layout])).toBe(false);
		expect(active({ layout: { type: 'grid' } }, [layout])).toBe(true);
		const style = { name: 'ext-style', attributes: { style: { color: { text: 'red' } } }, isActive: ['style'] };
		expect(active({ style: { color: { text: 'red' }, spacing: {} } }, [style])).toBe(false);
	});

	test('5.8 to 6.5 rule: undefined on both sides is a match', () => {
		const loose = { name: 'ext-loose', attributes: {}, isActive: ['className'] };
		expect(active({}, [loose])).toBe(false);
	});

	test('rich text is compared as its HTML', () => {
		const rich = { name: 'ext-rich', attributes: { content: '<b>x</b>' }, isActive: ['content'] };
		expect(active({ content: { toHTMLString: () => '<b>x</b>' } }, [rich])).toBe(false);
	});

	test('a nested call from another isActive gets false, and nothing loops', () => {
		let nested;
		const asking = {
			name: 'ext-asks',
			attributes: {},
			isActive: (block) => {
				nested = isNewBlockVariationActive(block, {}, api([asking]));
				return false;
			}
		};
		expect(active({}, [asking])).toBe(true);
		expect(nested).toBe(false);
		// The guard is released afterwards
		expect(active({}, [])).toBe(true);
	});

	test('a claim holds whatever the registration order', () => {
		const before = { getBlockVariations: () => [pull, buildNewBlockVariation('rem', '')], getBlockType: () => ({ attributes: { className: {} } }) };
		expect(isNewBlockVariationActive({ className: 'is-pull' }, {}, before)).toBe(false);
	});
});

describe('syncNewBlockVariation', () => {
	test('rem site, nothing remembered: registers the variation with no attribute', () => {
		const blocks = fakeBlocks();
		expect(syncNewBlockVariation({ blocks, data: remData, storage: memoryStorage() })).not.toBeNull();
		expect(blocks.variations.map(shape)).toEqual([expected({})]);
	});

	test('px site, nothing remembered: registers #248\'s unit', () => {
		const blocks = fakeBlocks();
		syncNewBlockVariation({ blocks, data: pxData, storage: memoryStorage() });
		expect(blocks.variations.map(shape)).toEqual([expected({ fontSizeUnit: 'px' })]);
	});

	test('replaces #248\'s variation of an older registration (one default variation)', () => {
		const blocks = fakeBlocks([units.buildNewBlockUnitVariation('px')]);
		syncNewBlockVariation({ blocks, data: pxData, storage: memoryStorage() });
		expect(registeredAttributes(blocks)).toEqual([[NEW_BLOCK_VARIATION_NAME, { fontSizeUnit: 'px' }]]);
	});

	test('a changed tag replaces the registered variation (core keeps the first of a name)', () => {
		const blocks = fakeBlocks();
		const storage = memoryStorage({ [REMEMBERED_TAG_STORAGE_KEY]: 'h3' });
		syncNewBlockVariation({ blocks, data: remData, storage });
		expect(registeredAttributes(blocks)).toEqual([[NEW_BLOCK_VARIATION_NAME, { tagName: 'h3' }]]);

		storage.setItem(REMEMBERED_TAG_STORAGE_KEY, 'h5');
		syncNewBlockVariation({ blocks, data: remData, storage });
		expect(registeredAttributes(blocks)).toEqual([[NEW_BLOCK_VARIATION_NAME, { tagName: 'h5' }]]);
	});

	test('px site: the tag joins and leaves the unit, always one variation under one name', () => {
		const blocks = fakeBlocks();
		const storage = memoryStorage();
		syncNewBlockVariation({ blocks, data: pxData, storage });
		storage.setItem(REMEMBERED_TAG_STORAGE_KEY, 'div');
		syncNewBlockVariation({ blocks, data: pxData, storage });
		expect(blocks.variations.map(shape)).toEqual([expected({ fontSizeUnit: 'px', tagName: 'div' })]);
		storage.setItem(REMEMBERED_TAG_STORAGE_KEY, 'h2');
		syncNewBlockVariation({ blocks, data: pxData, storage });
		expect(blocks.variations.map(shape)).toEqual([expected({ fontSizeUnit: 'px' })]);
	});

	test('rem site: back to h2 keeps the variation, with no attribute', () => {
		const blocks = fakeBlocks();
		const storage = memoryStorage({ [REMEMBERED_TAG_STORAGE_KEY]: 'h4' });
		syncNewBlockVariation({ blocks, data: remData, storage });
		storage.setItem(REMEMBERED_TAG_STORAGE_KEY, 'h2');
		syncNewBlockVariation({ blocks, data: remData, storage });
		expect(blocks.variations.map(shape)).toEqual([expected({})]);
	});

	test('a registration from the other build counts as the same (isActive is compared by form)', () => {
		const blocks = fakeBlocks([Object.assign({}, buildNewBlockVariation('rem', 'h4'), { isActive: () => true })]);
		const before = blocks.dispatches;
		syncNewBlockVariation({ blocks, data: remData, storage: memoryStorage({ [REMEMBERED_TAG_STORAGE_KEY]: 'h4' }) });
		expect(blocks.dispatches).toBe(before);
	});

	test('a registration with no isActive is replaced', () => {
		const old = buildNewBlockVariation('rem', 'h4');
		delete old.isActive;
		const blocks = fakeBlocks([old]);
		syncNewBlockVariation({ blocks, data: remData, storage: memoryStorage({ [REMEMBERED_TAG_STORAGE_KEY]: 'h4' }) });
		expect(blocks.variations.map(shape)).toEqual([expected({ tagName: 'h4' })]);
	});

	test('nothing changed: no store update', () => {
		const blocks = fakeBlocks();
		const storage = memoryStorage({ [REMEMBERED_TAG_STORAGE_KEY]: 'h4' });
		syncNewBlockVariation({ blocks, data: pxData, storage });
		const before = blocks.dispatches;
		syncNewBlockVariation({ blocks, data: pxData, storage });
		expect(blocks.dispatches).toBe(before);
	});

	test('leaves variations of other code alone', () => {
		const other = { name: 'someone-else', scope: ['block'], attributes: { tagName: 'h6' } };
		const blocks = fakeBlocks([other]);
		const storage = memoryStorage({ [REMEMBERED_TAG_STORAGE_KEY]: 'h4' });
		syncNewBlockVariation({ blocks, data: remData, storage });
		storage.setItem(REMEMBERED_TAG_STORAGE_KEY, 'h2');
		syncNewBlockVariation({ blocks, data: remData, storage });
		expect(blocks.variations[0]).toBe(other);
		expect(registeredAttributes(blocks)).toEqual([['someone-else', { tagName: 'h6' }], [NEW_BLOCK_VARIATION_NAME, {}]]);
	});

	test('storage that throws: as if nothing were remembered', () => {
		const blocks = fakeBlocks();
		expect(() => syncNewBlockVariation({ blocks, data: pxData, storage: throwingStorage })).not.toThrow();
		expect(blocks.variations.map(shape)).toEqual([expected({ fontSizeUnit: 'px' })]);
	});

	test('no variation API, or one that throws: returns null and does not throw', () => {
		expect(syncNewBlockVariation({ blocks: {}, data: pxData })).toBeNull();
		expect(syncNewBlockVariation({ blocks: null, data: pxData })).toBeNull();
		const broken = fakeBlocks();
		broken.registerBlockVariation = () => {
			throw new Error('store refused');
		};
		expect(() => syncNewBlockVariation({ blocks: broken, data: pxData, storage: memoryStorage() })).not.toThrow();
	});

	test('reads window.wp.blocks, window.typostData and localStorage by default', () => {
		const blocks = fakeBlocks();
		window.wp = { blocks };
		window.typostData = pxData;
		window.localStorage.setItem(REMEMBERED_TAG_STORAGE_KEY, 'h6');
		try {
			syncNewBlockVariation();
			expect(blocks.variations.map((v) => v.attributes)).toEqual([{ fontSizeUnit: 'px', tagName: 'h6' }]);
		} finally {
			delete window.wp;
		}
	});
});

describe('rememberNewBlockTag', () => {
	test('remembers the pick and updates the variation without a reload', () => {
		const blocks = fakeBlocks();
		const storage = memoryStorage();
		expect(rememberNewBlockTag('h4', { blocks, data: remData, storage })).toBe(true);
		expect(storage.data[REMEMBERED_TAG_STORAGE_KEY]).toBe('h4');
		expect(blocks.variations.map((v) => v.attributes)).toEqual([{ tagName: 'h4' }]);
	});

	test('h1 keeps the remembered tag and the variation', () => {
		const blocks = fakeBlocks();
		const storage = memoryStorage();
		rememberNewBlockTag('h4', { blocks, data: remData, storage });
		const before = blocks.dispatches;
		expect(rememberNewBlockTag('h1', { blocks, data: remData, storage })).toBe(false);
		expect(storage.data[REMEMBERED_TAG_STORAGE_KEY]).toBe('h4');
		expect(blocks.variations.map((v) => v.attributes)).toEqual([{ tagName: 'h4' }]);
		expect(blocks.dispatches).toBe(before);
	});
});

describe('installNewBlockVariation', () => {
	function fakeWindow() {
		const listeners = {};
		return {
			listeners,
			addEventListener: (type, fn) => {
				(listeners[type] = listeners[type] || []).push(fn);
			},
			fire: (type, event) => (listeners[type] || []).forEach((fn) => fn(event))
		};
	}

	test('registers at load', () => {
		const blocks = fakeBlocks();
		const storage = memoryStorage({ [REMEMBERED_TAG_STORAGE_KEY]: 'p' });
		installNewBlockVariation({ blocks, data: remData, storage, win: fakeWindow() });
		expect(blocks.variations.map((v) => v.attributes)).toEqual([{ tagName: 'p' }]);
	});

	test('follows a pick made in another tab (storage event)', () => {
		const blocks = fakeBlocks();
		const storage = memoryStorage();
		const win = fakeWindow();
		installNewBlockVariation({ blocks, data: remData, storage, win });
		expect(registeredAttributes(blocks)).toEqual([[NEW_BLOCK_VARIATION_NAME, {}]]);

		storage.setItem(REMEMBERED_TAG_STORAGE_KEY, 'h3');
		win.fire('storage', { key: REMEMBERED_TAG_STORAGE_KEY });
		expect(registeredAttributes(blocks)).toEqual([[NEW_BLOCK_VARIATION_NAME, { tagName: 'h3' }]]);

		// storage.clear() in another tab: key null
		delete storage.data[REMEMBERED_TAG_STORAGE_KEY];
		win.fire('storage', { key: null });
		expect(registeredAttributes(blocks)).toEqual([[NEW_BLOCK_VARIATION_NAME, {}]]);
	});

	test('ignores other keys', () => {
		const blocks = fakeBlocks();
		const storage = memoryStorage();
		const win = fakeWindow();
		installNewBlockVariation({ blocks, data: remData, storage, win });
		storage.setItem(REMEMBERED_TAG_STORAGE_KEY, 'h3');
		win.fire('storage', { key: 'typography_stylist_hide_modal_tips' });
		expect(registeredAttributes(blocks)).toEqual([[NEW_BLOCK_VARIATION_NAME, {}]]);
	});

	test('a storage event while storage throws does not throw', () => {
		const blocks = fakeBlocks();
		const win = fakeWindow();
		installNewBlockVariation({ blocks, data: remData, storage: throwingStorage, win });
		expect(() => win.fire('storage', { key: REMEMBERED_TAG_STORAGE_KEY })).not.toThrow();
	});
});

describe('block-editor.js installs it once, at its end', () => {
	test('the #248 registration now goes through installNewBlockVariation()', () => {
		const fs = require('fs');
		const path = require('path');
		const source = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'assets', 'js', 'block-editor.js'), 'utf8');
		expect(source.match(/installNewBlockVariation\(\);/g)).toHaveLength(1);
		expect(source).not.toMatch(/registerBlockVariation\(/);
	});
});

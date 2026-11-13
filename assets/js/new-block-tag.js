/**
 * The tag a new Typography Stylist block starts with (#410)
 *
 * When the author picks a tag in the block's "Change heading level" menu,
 * the editor remembers it in this browser (localStorage, like the dismissed
 * usage tips). A block added from the inserter then starts with that tag
 * and stores it. Until a tag is remembered, a new block is Heading 2 (the
 * block.json default). Heading 1 is never remembered: a page usually has
 * one, so picking it leaves the remembered tag as it was.
 *
 * Only blocks from the inserter follow it (the main and quick inserters, the
 * slash command and drag from the inserter). Blocks that code creates keep
 * their own tag: a transform and "Convert to block" take the tag of their
 * source, and createBlock() with no tagName gives the block.json default.
 * Duplicate, copy and paste, and patterns carry the stored tag.
 *
 * How: block.json's tagName default ('h2') also decides how a saved block
 * with no stored tag parses, so it cannot follow the author. Core's inserter
 * replaces a block's own item with its isDefault variation and inserts the
 * block with the variation's attributes (getInserterItems and
 * getItemFromVariation in @wordpress/block-editor). #248 uses that route for
 * the font size unit, and only one default variation can exist, so this
 * module builds the one variation that carries both: fontSizeUnit 'px' when
 * the site writes new sizes in px, and the remembered tag. Core keeps the
 * first variation of a name (getUniqueItemsByName), so a changed variation
 * is unregistered and registered again, which updates the inserter at once.
 *
 * The inserter's "Most used" count: core counts an inserted block under
 * `typost/block/<name>` of the variation getActiveBlockVariation() finds for
 * its attributes, else under `typost/block`; the item of a default variation
 * reads `typost/block/<name>`. A variation with no isActive is never found,
 * so with #248's variation the count never rose. Here the variation is
 * registered on every site, always under one name, even with no attribute,
 * and its isActive matches every Typography Stylist block that no other
 * variation claims: each insert, transform and Convert to block counts
 * under the one key the inserter reads, whatever tag is remembered. An
 * extension's own variation of the block always wins (see
 * isNewBlockVariationActive), so its blocks show and count as before. The
 * variation has no title, icon or description, so the places that show the
 * active variation (block card, List View, breadcrumb, toolbar icon, drag
 * chip, "block added" message) show the block's own. The function form of
 * isActive is read the same way from WordPress 5.8 on; the array form
 * cannot match every block.
 * Trade-off: core reads the count of a block in the "Transform to" menu
 * under `typost/block`, which no longer rises.
 *
 * Shared by the inline editor build (assets/js/block-editor.js, browserify),
 * which installs the variation at load, and the block build
 * (blocks/typography-stylist/, wp-scripts), whose menu remembers the pick.
 * Each build has its own copy of this module; the state is in localStorage
 * and in the blocks store, so the copies agree. Uses the wp.blocks global,
 * not an import, so both builds can load it.
 *
 * @since 2.4.0
 */

var fontSizeUnits = require('./font-size-units.js');

/**
 * The tags of the "Change heading level" menu, in menu order. The block
 * module (blocks/typography-stylist/heading-levels.js) adds each tag's name
 * and icon; a test holds the two lists together.
 */
var HEADING_LEVEL_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div'];

// block.json's tagName default
var DEFAULT_TAG = 'h2';

// Never remembered (see the file comment)
var NEVER_REMEMBERED_TAG = 'h1';

var REMEMBERED_TAG_STORAGE_KEY = 'typography_stylist_new_block_tag';

// The one name of the variation, on every site and with any attributes, so
// the inserter count has one key (see the file comment)
var NEW_BLOCK_VARIATION_NAME = 'typost-new-block';

var BLOCK_NAME = 'typost/block';

/**
 * Whether a tag can be remembered: one of the menu's tags other than h1.
 *
 * @param {*} tag Candidate tag
 * @return {boolean} True for h2 to h6, p and div
 */
function isRememberableTag(tag) {
	return typeof tag === 'string' && tag !== NEVER_REMEMBERED_TAG && HEADING_LEVEL_TAGS.indexOf(tag) !== -1;
}

/**
 * localStorage, or null when the browser refuses it (a privacy mode or a
 * sandboxed frame can throw on the property itself).
 *
 * @return {Storage|null} The storage
 */
function getDefaultStorage() {
	try {
		return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
	} catch (e) {
		return null;
	}
}

/**
 * The remembered tag, or '' when none counts.
 *
 * Storage can be unavailable, throw, or hold anything (another version,
 * another script, a hand edit): only a tag that isRememberableTag() accepts
 * counts.
 *
 * @param {Storage} [storage] Storage to read; defaults to localStorage
 * @return {string} The tag, or ''
 */
function readRememberedTag(storage) {
	var store = storage === undefined ? getDefaultStorage() : storage;
	if (!store) {
		return '';
	}
	try {
		var value = store.getItem(REMEMBERED_TAG_STORAGE_KEY);
		return isRememberableTag(value) ? value : '';
	} catch (e) {
		return '';
	}
}

/**
 * Remember the tag the author picked.
 *
 * h1 and tags outside the menu are not written, so the remembered tag stays
 * what it was.
 *
 * @param {string}  tag       The tag the author picked
 * @param {Storage} [storage] Storage to write; defaults to localStorage
 * @return {boolean} True when the stored value now is this tag
 */
function rememberTag(tag, storage) {
	if (!isRememberableTag(tag)) {
		return false;
	}
	var store = storage === undefined ? getDefaultStorage() : storage;
	if (!store) {
		return false;
	}
	try {
		store.setItem(REMEMBERED_TAG_STORAGE_KEY, tag);
		return true;
	} catch (e) {
		// Storage full or refused: the pick applies to this block only
		return false;
	}
}

// True while isNewBlockVariationActive() asks the other variations, so a
// variation whose own isActive asks for the active variation cannot loop
var checkingOtherVariations = false;

/**
 * A value as core compares it: rich text as its HTML (RichTextData).
 *
 * @param {*} value Attribute value
 * @return {*} The value to compare
 */
function comparableValue(value) {
	return value && typeof value.toHTMLString === 'function' ? value.toHTMLString() : value;
}

/**
 * A plain object, as core's matchesAttributes() reads it.
 *
 * @param {*} value Candidate
 * @return {boolean} True for a plain object
 */
function isPlainObject(value) {
	return typeof value === 'object' && value !== null && value.constructor === Object;
}

/**
 * Core's comparison of an attribute value since WordPress 6.6
 * (matchesAttributes in @wordpress/blocks): objects key by key, else ===.
 *
 * @param {*} blockValue     The block's value
 * @param {*} variationValue The variation's value
 * @return {boolean} True when they match
 */
function matchesAttributeValue(blockValue, variationValue) {
	if (isPlainObject(blockValue) && isPlainObject(variationValue)) {
		return Object.keys(variationValue).every(function (key) {
			return matchesAttributeValue(blockValue[key], variationValue[key]);
		});
	}
	return blockValue === variationValue;
}

/**
 * A dotted path in an object ('layout.type'), as core's
 * getValueFromObjectPath() reads it.
 *
 * @param {Object} object Attributes
 * @param {string} path   Path
 * @return {*} The value, or undefined
 */
function valueAtPath(object, path) {
	return String(path).split('.').reduce(function (value, key) {
		return value === undefined || value === null ? undefined : value[key];
	}, object);
}

/**
 * Whether an array isActive matches a block, by the rule of any supported
 * WordPress version. Only entries whose first part names an attribute of
 * the block type count, and no counted entry means no match (all versions).
 * 5.8 to 6.5 compare each top-level attribute with ===. 6.6 and later also
 * read dotted paths, need the variation to define the value, read rich text
 * as HTML and compare objects key by key. Either rule is enough here: on a
 * version where the other rule decides, yielding gives what core gives with
 * no variation of ours (see isNewBlockVariationActive).
 *
 * @param {string[]} isActive        The variation's attribute names
 * @param {Object}   blockAttributes The block's attributes
 * @param {Object}   variationAttrs  The variation's attributes
 * @param {string[]} attributeKeys   The block type's attribute names
 * @return {boolean} True when it matches
 */
function arrayIsActiveMatches(isActive, blockAttributes, variationAttrs, attributeKeys) {
	var block = blockAttributes || {};
	var variation = variationAttrs || {};
	var defined = isActive.filter(function (path) {
		return typeof path === 'string' && attributeKeys.indexOf(path.split('.')[0]) !== -1;
	});
	if (defined.length === 0) {
		return false;
	}
	// 5.8 to 6.5 drop an entry that is not a whole attribute name
	var topLevel = defined.filter(function (path) {
		return attributeKeys.indexOf(path) !== -1;
	});
	var before66 = topLevel.length > 0 && topLevel.every(function (path) {
		return block[path] === variation[path];
	});
	var since66 = defined.every(function (path) {
		var wanted = valueAtPath(variation, path);
		return wanted !== undefined && matchesAttributeValue(comparableValue(valueAtPath(block, path)), wanted);
	});
	return before66 || since66;
}

/**
 * isActive of the variation: true for every Typography Stylist block that
 * no other variation of the block claims, so core counts each use under the
 * key the inserter item reads (see the file comment).
 *
 * An extension's variation always wins, whatever the registration order:
 * when another registered variation of typost/block (any name but ours and
 * #248's old one) matches the block, by its function or its attribute list,
 * this returns false, so core reports that variation as it does with no
 * variation of ours. A variation with no isActive is never active in core,
 * so it claims nothing. An extension's isActive that throws claims nothing
 * here (core still calls it itself). A nested call (another isActive that
 * asks for the active variation) gets false, so it sees what it would see
 * with no variation of ours, and nothing loops.
 *
 * Core calls it with two arguments; the third is for the unit tests, which
 * have no wp global.
 *
 * @param {Object} blockAttributes The block's attributes
 * @param {Object} variationAttrs  This variation's attributes (unused)
 * @param {Object} [blocksApi]     The wp.blocks API; defaults to window.wp.blocks
 * @return {boolean} True when no other variation claims the block
 */
function isNewBlockVariationActive(blockAttributes, variationAttrs, blocksApi) {
	if (checkingOtherVariations) {
		return false;
	}
	var blocks = blocksApi;
	if (blocks === undefined && typeof window !== 'undefined' && window.wp) {
		blocks = window.wp.blocks;
	}
	if (!blocks || typeof blocks.getBlockVariations !== 'function') {
		return true;
	}
	checkingOtherVariations = true;
	try {
		var own = getNewBlockVariationNames();
		var others = (blocks.getBlockVariations(BLOCK_NAME) || []).filter(function (variation) {
			return variation && own.indexOf(variation.name) === -1 && variation.isActive;
		});
		if (others.length === 0) {
			return true;
		}
		var attributeKeys = null;
		return !others.some(function (variation) {
			try {
				if (Array.isArray(variation.isActive)) {
					if (attributeKeys === null) {
						var type = typeof blocks.getBlockType === 'function' ? blocks.getBlockType(BLOCK_NAME) : null;
						attributeKeys = Object.keys((type && type.attributes) || {});
					}
					return arrayIsActiveMatches(variation.isActive, blockAttributes, variation.attributes, attributeKeys);
				}
				return typeof variation.isActive === 'function' && !!variation.isActive(blockAttributes, variation.attributes);
			} catch (e) {
				return false;
			}
		});
	} catch (e) {
		return true;
	} finally {
		checkingOtherVariations = false;
	}
}

/**
 * The inserter variation for new blocks. Always one, under one name.
 *
 * Its attributes: fontSizeUnit 'px' when the site writes new sizes in px
 * (#248, buildNewBlockUnitVariation), and tagName when a tag other than h2
 * is remembered. With neither, it has no attribute and the new block gets
 * block.json's defaults (rem, h2), as without a variation.
 *
 * A remembered h2 adds nothing: it is the default, and the serializer does
 * not store an attribute that equals its default, so the block is the same.
 * Title, icon and description are left out, so the inserter item and every
 * place that shows the active variation keep the block's own.
 *
 * @param {string} unit          The new-content unit (getNewFontSizeUnit)
 * @param {string} rememberedTag The remembered tag (readRememberedTag)
 * @return {Object} Variation for registerBlockVariation()
 */
function buildNewBlockVariation(unit, rememberedTag) {
	var unitVariation = fontSizeUnits.buildNewBlockUnitVariation(unit);
	var tag = isRememberableTag(rememberedTag) && rememberedTag !== DEFAULT_TAG ? rememberedTag : '';
	var attributes = {};
	if (unitVariation) {
		Object.keys(unitVariation.attributes).forEach(function (key) {
			attributes[key] = unitVariation.attributes[key];
		});
	}
	if (tag) {
		attributes.tagName = tag;
	}
	return {
		name: NEW_BLOCK_VARIATION_NAME,
		isDefault: true,
		scope: ['inserter'],
		isActive: isNewBlockVariationActive,
		attributes: attributes
	};
}

/**
 * The variation names this module removes before it registers its own: its
 * own, and #248's, which assets/js/block-editor.js registered before 2.4.0
 * (only one default variation may exist).
 *
 * @return {string[]} Names
 */
function getNewBlockVariationNames() {
	return [NEW_BLOCK_VARIATION_NAME, fontSizeUnits.buildNewBlockUnitVariation(fontSizeUnits.FONT_SIZE_UNIT_PX).name];
}

/**
 * Same attributes in both objects (flat, string values).
 *
 * @param {Object} a First
 * @param {Object} b Second
 * @return {boolean} True when equal
 */
function sameAttributes(a, b) {
	var aKeys = Object.keys(a || {});
	var bKeys = Object.keys(b || {});
	if (aKeys.length !== bKeys.length) {
		return false;
	}
	return aKeys.every(function (key) {
		return (b || {})[key] === a[key];
	});
}

/**
 * Register the variation that buildNewBlockVariation() gives now, in place
 * of the one registered before.
 *
 * Does nothing when the registered variation already matches, so calling it
 * on every pick costs no store update. Never throws: the editor must keep
 * working when wp.blocks lacks the variation API or the store refuses.
 *
 * @param {Object} [options]
 * @param {Object} [options.blocks]  The wp.blocks API; defaults to window.wp.blocks
 * @param {Object} [options.data]    Editor data; defaults to window.typostData
 * @param {Storage} [options.storage] Storage; defaults to localStorage
 * @return {Object|null} The variation now registered, or null when it could
 *   not be registered
 */
function syncNewBlockVariation(options) {
	var opts = options || {};
	var blocks = opts.blocks;
	if (blocks === undefined && typeof window !== 'undefined' && window.wp) {
		blocks = window.wp.blocks;
	}
	if (!blocks || typeof blocks.registerBlockVariation !== 'function') {
		return null;
	}
	var wanted = buildNewBlockVariation(
		fontSizeUnits.getNewFontSizeUnit(opts.data),
		readRememberedTag(opts.storage)
	);
	try {
		var names = getNewBlockVariationNames();
		var registered = typeof blocks.getBlockVariations === 'function'
			? (blocks.getBlockVariations(BLOCK_NAME) || []).filter(function (variation) {
				return variation && names.indexOf(variation.name) !== -1;
			})
			: null;
		if (registered && registered.length === 1 && registered[0].name === wanted.name &&
			// Each build has its own copy of this module, so compare the
			// form, not the function object
			typeof registered[0].isActive === 'function' &&
			sameAttributes(registered[0].attributes, wanted.attributes)) {
			return wanted;
		}
		if (typeof blocks.unregisterBlockVariation === 'function') {
			names.forEach(function (name) {
				if (!registered || registered.some(function (variation) {
					return variation.name === name;
				})) {
					blocks.unregisterBlockVariation(BLOCK_NAME, name);
				}
			});
		}
		blocks.registerBlockVariation(BLOCK_NAME, wanted);
	} catch (e) {
		return null;
	}
	return wanted;
}

/**
 * Remember the tag the author picked in the menu and update the inserter
 * variation, so the next block from the inserter starts with it without a
 * reload.
 *
 * @param {string} tag       The tag the author picked
 * @param {Object} [options] As for syncNewBlockVariation()
 * @return {boolean} True when the tag was remembered
 */
function rememberNewBlockTag(tag, options) {
	var opts = options || {};
	if (!rememberTag(tag, opts.storage)) {
		return false;
	}
	syncNewBlockVariation(opts);
	return true;
}

/**
 * Register the variation at load, and follow a pick made in another tab of
 * this browser: the storage event fires in every other document of the
 * origin when the remembered tag changes (or when the storage is cleared,
 * key null). Called once, from assets/js/block-editor.js.
 *
 * @param {Object} [options] As for syncNewBlockVariation(), plus `win` (the
 *   window to listen on; defaults to window)
 * @return {Object|null} The variation registered at load, or null
 */
function installNewBlockVariation(options) {
	var opts = options || {};
	var win = opts.win;
	if (win === undefined && typeof window !== 'undefined') {
		win = window;
	}
	var registered = syncNewBlockVariation(opts);
	if (win && typeof win.addEventListener === 'function') {
		win.addEventListener('storage', function (event) {
			if (!event || event.key === null || event.key === REMEMBERED_TAG_STORAGE_KEY) {
				syncNewBlockVariation(opts);
			}
		});
	}
	return registered;
}

module.exports = {
	HEADING_LEVEL_TAGS: HEADING_LEVEL_TAGS,
	DEFAULT_TAG: DEFAULT_TAG,
	REMEMBERED_TAG_STORAGE_KEY: REMEMBERED_TAG_STORAGE_KEY,
	NEW_BLOCK_VARIATION_NAME: NEW_BLOCK_VARIATION_NAME,
	isNewBlockVariationActive: isNewBlockVariationActive,
	isRememberableTag: isRememberableTag,
	readRememberedTag: readRememberedTag,
	rememberTag: rememberTag,
	buildNewBlockVariation: buildNewBlockVariation,
	syncNewBlockVariation: syncNewBlockVariation,
	rememberNewBlockTag: rememberNewBlockTag,
	installNewBlockVariation: installNewBlockVariation
};

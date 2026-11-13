/**
 * The theme's look for a Typography Stylist block (#411, #412)
 *
 * One definition of "a block with no styling of its own", used by every path
 * that takes a block back to how the theme shows its tag:
 *
 * - "Remove all styling" in the block toolbar and "Reset Entire Block" in the
 *   sidebar (blocks/typography-stylist/strip-styles/), which also strip the
 *   content's inline formats;
 * - the block transforms from an empty Paragraph or Heading and the filter
 *   that undoes what WordPress copies from the source block after a
 *   transform (blocks/typography-stylist/index.js, strip-styles/empty-source.js);
 * - "Convert to Typography Stylist Block" in the inline dialog on an empty
 *   block (buildConvertBlockAttributes() in inline-apply-rules.js).
 *
 * Shared by the inline editor (assets/js/block-editor.js, bundled with
 * browserify) and the Typography Stylist block (bundled with wp-scripts), so
 * it is CommonJS with no wp.* globals. Jest tests import it directly.
 *
 * Every attribute of the block (block.json, plus the attributes its block
 * supports add) is in exactly one of four lists: reset to a plugin value,
 * reset to "not set" (a WordPress block setting), kept, or not decided yet.
 * __tests__/theme-look.test.js fails when an attribute is added to block.json
 * and nobody puts it in a list.
 *
 * @since 2.4.0
 */

/**
 * The plugin's own block settings with no styling: the block.json defaults,
 * except the weight.
 *
 * fontWeight is '' (no weight), not the block.json default '400': save.js and
 * the editor write `font-weight` for any non-empty value, so '400' renders a
 * heading at 400 in a theme that makes headings bold. '' writes nothing, so
 * the tag renders at the theme's weight. save.js already handles '' (it is
 * what "Reset Entire Block" wrote before #411), so this is no new markup form.
 *
 * fontSize 'inherit' with the three slider values at their defaults writes
 * no size, so the tag renders at the theme's size.
 */
var THEME_LOOK_PLUGIN_ATTRIBUTES = {
	features: [],
	fontFamily: '',
	fontId: 0,
	fontWeight: '',
	fontStyle: '',
	fontSize: 'inherit',
	fontSizeMin: 16,
	fontSizePreferred: 32,
	fontSizeMax: 64,
	fitLineSizes: [],
	fitMaxSize: 0,
	fitWordSizes: [],
	fitLineHangs: [],
	initialHang: 0,
	letterSpacing: 0,
	lineHeight: 0,
	textCase: '',
	fakeSmallCaps: true,
	fontVariationSettings: '',
	styleClass: ''
};

/**
 * WordPress block settings the block can store, removed (set to undefined):
 * color and background (textColor, backgroundColor, style.color), padding and
 * margin (style.spacing), line height and Line indent (style.typography), the
 * extra CSS class (className) and the text alignment (textAlign).
 */
var THEME_LOOK_WORDPRESS_ATTRIBUTES = ['style', 'textColor', 'backgroundColor', 'className', 'textAlign'];

/**
 * Kept: the text (the content is stripped separately), the tag, the wide or
 * full width setting, the anchor, the size unit the block writes in (#233),
 * the screen reader class (an accessibility setting, not a style), and
 * WordPress's lock and metadata (block name, notes, visibility).
 */
var THEME_LOOK_KEPT_ATTRIBUTES = ['content', 'tagName', 'align', 'anchor', 'fontSizeUnit', 'screenReaderClass', 'lock', 'metadata'];

/**
 * Not decided (#411): these belong to extension plugins, which give them
 * meaning. They are left as they are.
 */
var THEME_LOOK_UNDECIDED_ATTRIBUTES = ['layeredConfigId', 'animationConfigId'];

/**
 * The attribute changes that take a block to the theme's look.
 *
 * Arrays are new on every call, so a caller can never share them with a
 * block. The WordPress settings are present with the value undefined, which
 * removes them (setAttributes, createBlock and the serializer skip undefined).
 * The content is not included: see stripBlockContent() for an existing block,
 * and buildEmptySourceBlockAttributes() for a block made from an empty one.
 *
 * @return {Object} Attributes for setAttributes() or createBlock()
 */
function buildThemeLookAttributes() {
	var attrs = {};
	Object.keys(THEME_LOOK_PLUGIN_ATTRIBUTES).forEach(function(key) {
		var value = THEME_LOOK_PLUGIN_ATTRIBUTES[key];
		attrs[key] = Array.isArray(value) ? value.slice() : value;
	});
	THEME_LOOK_WORDPRESS_ATTRIBUTES.forEach(function(key) {
		attrs[key] = undefined;
	});
	return attrs;
}

// Whitespace a reader cannot see: \s covers spaces, tabs, line breaks,
// non-breaking spaces and the byte order mark; the others are zero-width
// characters (zero width space, non-joiner, joiner, word joiner: U+200B,
// U+200C, U+200D, U+2060). Built from char codes so the source holds no
// invisible characters.
var EMPTY_TEXT = new RegExp('^[\\s' + String.fromCharCode(0x200B, 0x200C, 0x200D, 0x2060) + ']*$');

// Elements that are content without any text (an inline image, a formula)
var CONTENT_WITHOUT_TEXT = 'img, picture, svg, math, video, audio, iframe, object, embed, canvas';

/**
 * Whether a block's content has no text (#412).
 *
 * Empty means only spaces (including non-breaking and zero-width ones), line
 * breaks and empty elements, for example `<br>` or an empty
 * `<span class="typost-styled">`. An inline image or a formula is content.
 * Accepts a RichTextData object (WordPress 6.5+) as well as a string.
 *
 * Needs a DOM (the editor, or jsdom in the tests): the HTML is parsed with
 * DOMParser, which runs no script and loads nothing.
 *
 * @param {*} html Block content
 * @return {boolean} True when there is no text
 */
function isEmptyBlockContent(html) {
	var source = (html === null || html === undefined) ? '' : String(html);
	if (EMPTY_TEXT.test(source)) {
		return true;
	}
	var body = new DOMParser().parseFromString('<!DOCTYPE html><html><body>' + source + '</body></html>', 'text/html').body;
	if (!body) {
		return false;
	}
	if (body.querySelector(CONTENT_WITHOUT_TEXT)) {
		return false;
	}
	return EMPTY_TEXT.test(body.textContent || '');
}

/**
 * Attributes of a Typography Stylist block made from an empty block (#412):
 * the tag of the source, the site's new-content size unit (#248) and the
 * theme's look. Nothing of the source travels: no weight, no class, no block
 * settings, and no state of the inline dialog. The content is '' (the
 * source had no text).
 *
 * @param {string} tagName  Tag of the source ('p', 'h1' … 'h6')
 * @param {string} [unit]   'px' or 'rem'; anything else leaves the block.json default
 * @return {Object} Attributes for createBlock()
 */
function buildEmptySourceBlockAttributes(tagName, unit) {
	var attrs = buildThemeLookAttributes();
	attrs.content = '';
	attrs.tagName = tagName;
	if (unit === 'px' || unit === 'rem') {
		attrs.fontSizeUnit = unit;
	}
	return attrs;
}

module.exports = {
	THEME_LOOK_PLUGIN_ATTRIBUTES: THEME_LOOK_PLUGIN_ATTRIBUTES,
	THEME_LOOK_WORDPRESS_ATTRIBUTES: THEME_LOOK_WORDPRESS_ATTRIBUTES,
	THEME_LOOK_KEPT_ATTRIBUTES: THEME_LOOK_KEPT_ATTRIBUTES,
	THEME_LOOK_UNDECIDED_ATTRIBUTES: THEME_LOOK_UNDECIDED_ATTRIBUTES,
	buildThemeLookAttributes: buildThemeLookAttributes,
	isEmptyBlockContent: isEmptyBlockContent,
	buildEmptySourceBlockAttributes: buildEmptySourceBlockAttributes
};

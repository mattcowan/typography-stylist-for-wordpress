/**
 * Case (#214)
 *
 * Pure helpers for the Case setting: All Caps, Lowercase, Title Case, Small
 * Caps and All Small Caps, plus Normal (an explicit reset of a theme's case)
 * and Default ('', the theme's case, which writes nothing).
 *
 * Shared by the inline editor (assets/js/block-editor.js, bundled with
 * browserify) and the Typography Stylist block (blocks/typography-stylist/,
 * bundled with wp-scripts; utils.js re-exports these). Jest tests import
 * this module directly.
 *
 * The Paragraph Styles module keeps twins of TEXT_CASE_VALUES,
 * normalizeTextCase(), isSmallCapsCase() and caseDeclarations() in
 * ps-utils.js (no build step) and in paragraph-styles.php; a Jest parity
 * test holds them to these.
 *
 * @since 2.3.3
 */

/**
 * Case values a block, a paragraph style or an inline span can store. ''
 * (absent) is Default: the text keeps whatever case the theme gives it, so
 * content saved before this setting existed renders as before. 'none' is
 * Normal, an explicit reset of a theme's transform or small caps.
 */
var TEXT_CASE_VALUES = ['none', 'uppercase', 'lowercase', 'capitalize', 'small-caps', 'all-small-caps'];

/**
 * Normalize a stored case value: '' for Default or anything unknown.
 *
 * @param {*} value Raw value.
 * @return {string} One of TEXT_CASE_VALUES, or ''.
 */
function normalizeTextCase(value) {
	return typeof value === 'string' && TEXT_CASE_VALUES.indexOf(value) !== -1 ? value : '';
}

/**
 * Whether a case value uses font-variant-caps (and so the fake small caps
 * choice applies to it).
 *
 * @param {*} value Case value.
 * @return {boolean} True for Small Caps and All Small Caps.
 */
function isSmallCapsCase(value) {
	var c = normalizeTextCase(value);
	return c === 'small-caps' || c === 'all-small-caps';
}

/**
 * CSS declarations for a case setting, as [property, value] pairs.
 *
 * Case is one exclusive choice, so every value sets both mechanisms: a
 * transform resets font-variant-caps and small caps reset text-transform.
 * Otherwise a theme that uppercases headings would turn a Small Caps style
 * into full capitals (smcp leaves capitals alone). font-variant-caps maps
 * to smcp/c2sc and, unlike font-feature-settings, lets the browser fake
 * small caps when the font has none; font-synthesis-small-caps: none turns
 * that off. Feature toggles use font-feature-settings, which is applied
 * after font-variant-caps, so they keep working.
 * Mirrors caseDeclarations() in ps-utils.js and
 * Typost_Paragraph_Styles::case_declarations() in PHP; the order of the
 * pairs is part of the byte-identical style CSS.
 *
 * @param {*}       textCase      Case value.
 * @param {boolean} fakeSmallCaps Allow fake small caps (false = off).
 * @return {Array<Array<string>>} Declarations, empty for Default.
 */
function caseDeclarations(textCase, fakeSmallCaps) {
	var c = normalizeTextCase(textCase);
	if (!c) {
		return [];
	}
	if (isSmallCapsCase(c)) {
		return [
			['text-transform', 'none'],
			['font-variant-caps', c],
			['font-synthesis-small-caps', fakeSmallCaps === false ? 'none' : 'auto']
		];
	}
	return [
		['text-transform', c],
		['font-variant-caps', 'normal']
	];
}

/**
 * The case declarations as a React style object (camelCase keys), for
 * editor previews.
 *
 * @param {*}       textCase      Case value.
 * @param {boolean} fakeSmallCaps Allow fake small caps (false = off).
 * @return {Object} Style object, empty for Default.
 */
function caseStyleObject(textCase, fakeSmallCaps) {
	var style = {};
	caseDeclarations(textCase, fakeSmallCaps).forEach(function (pair) {
		style[pair[0].replace(/-([a-z])/g, function (match, letter) { return letter.toUpperCase(); })] = pair[1];
	});
	return style;
}

/**
 * The CSS properties a case setting can write. A span patch removes all of
 * them when its case goes back to Default, and a paragraph style replaces
 * them like every other property it owns.
 */
var CASE_CSS_PROPERTIES = ['text-transform', 'font-variant-caps', 'font-synthesis-small-caps'];

/**
 * The data attributes an inline span stores its case in. Registered on the
 * typost/features format type, so RichText keeps them in format.attributes
 * when a post loads (unregistered attributes are not readable there).
 */
var CASE_DATA_ATTRIBUTES = ['data-textcase', 'data-fakesmallcaps'];

/**
 * Data attributes for an inline span's case. Default writes none.
 * data-fakesmallcaps is written only as "false", and only with a small
 * caps value (absent = allowed), as paragraph styles store it.
 *
 * @param {*}       textCase      Case value.
 * @param {boolean} fakeSmallCaps Allow fake small caps (false = off).
 * @return {Object} Attributes to add to the span.
 */
function buildInlineCaseAttributes(textCase, fakeSmallCaps) {
	var c = normalizeTextCase(textCase);
	var attrs = {};
	if (!c) {
		return attrs;
	}
	attrs['data-textcase'] = c;
	if (isSmallCapsCase(c) && fakeSmallCaps === false) {
		attrs['data-fakesmallcaps'] = 'false';
	}
	return attrs;
}

/**
 * Read an inline span's case from its format attributes.
 *
 * @param {Object} [attrs] Format attributes (data-textcase, data-fakesmallcaps).
 * @return {{textCase: string, fakeSmallCaps: boolean}} '' and true when unset.
 */
function readInlineCase(attrs) {
	var a = attrs || {};
	return {
		textCase: normalizeTextCase(a['data-textcase']),
		fakeSmallCaps: a['data-fakesmallcaps'] !== 'false'
	};
}

/**
 * A per-run patch for a case change on a mixed selection: every case
 * attribute and declaration is set or removed (null), so a run that had
 * another case loses all of it.
 *
 * @param {*}       textCase      Case value.
 * @param {boolean} fakeSmallCaps Allow fake small caps (false = off).
 * @return {{dataAttrs: Object, styleDecls: Object}} Values, or null to remove.
 */
function buildInlineCasePatch(textCase, fakeSmallCaps) {
	var attrs = buildInlineCaseAttributes(textCase, fakeSmallCaps);
	var dataAttrs = {};
	CASE_DATA_ATTRIBUTES.forEach(function (name) {
		dataAttrs[name] = attrs[name] || null;
	});
	var styleDecls = {};
	CASE_CSS_PROPERTIES.forEach(function (property) {
		styleDecls[property] = null;
	});
	caseDeclarations(textCase, fakeSmallCaps).forEach(function (pair) {
		styleDecls[pair[0]] = pair[1];
	});
	return { dataAttrs: dataAttrs, styleDecls: styleDecls };
}

module.exports = {
	TEXT_CASE_VALUES: TEXT_CASE_VALUES,
	CASE_CSS_PROPERTIES: CASE_CSS_PROPERTIES,
	CASE_DATA_ATTRIBUTES: CASE_DATA_ATTRIBUTES,
	normalizeTextCase: normalizeTextCase,
	isSmallCapsCase: isSmallCapsCase,
	caseDeclarations: caseDeclarations,
	caseStyleObject: caseStyleObject,
	buildInlineCaseAttributes: buildInlineCaseAttributes,
	readInlineCase: readInlineCase,
	buildInlineCasePatch: buildInlineCasePatch
};

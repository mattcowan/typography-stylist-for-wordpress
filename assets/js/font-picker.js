/**
 * Shared searchable font picker
 *
 * Renders the font family control used by both editors — the inline editor
 * (assets/js/block-editor.js, bundled with browserify) and the Typography
 * Stylist block (blocks/typography-stylist/edit.js, bundled with wp-scripts).
 * Jest tests import the prop builders directly.
 *
 * Why a combobox and not the SelectControl this replaced: every option label
 * carries a source prefix emoji (see buildFontOptions() in font-options.js),
 * and a native <select> matches type-ahead from the *start* of the label — so
 * on a site with a hundred Adobe families, typing "b" for Bookmania selected
 * nothing at all and the only way to reach a font was arrowing through the
 * whole list. ComboboxControl matches the typed text anywhere in the label,
 * so the prefix stops mattering and the list stays reachable at any size.
 * (Core ranks labels that *begin* with the query above the rest; that
 * ordering never applies here, because the emoji means a font-name query is
 * never at index 0.)
 *
 * The control is used unconditionally rather than swapping in above some
 * font-count threshold: a control that changes shape as fonts are added means
 * a different keyboard and mobile model on either side of the boundary, and
 * the searchable version is no worse for a short list.
 *
 * @since 2.4.0
 */

/**
 * Value of the entry that clears the font, and what every consumer here
 * already treats as "no font".
 */
var CLEAR_VALUE = '';

/**
 * Whether a value means "nothing selected".
 *
 * Only empty string, null and undefined qualify. A numeric 0 is a real value
 * as far as this control is concerned — no font source emits ID 0 today, but
 * silently swallowing it here would be a trap for whichever one first does.
 *
 * @param {*} value
 * @return {boolean}
 */
function isEmptyValue(value) {
	return value === '' || value === null || value === undefined;
}

/**
 * Normalize a value coming back from the picker.
 *
 * ComboboxControl hands back null when it clears itself; every consumer here
 * expects the empty string for "no font", and would otherwise fall through
 * its numeric/legacy-family branches with a null.
 *
 * @param {*} value Raw value from the control.
 * @return {string} Value, or '' when nothing is selected.
 */
function normalizeFontPickerValue(value) {
	if (value === null || value === undefined || value === false) {
		return '';
	}
	return String(value);
}

/**
 * Build the props for the ComboboxControl form of the picker.
 *
 * @param {Object}   config                       Picker configuration.
 * @param {string}   config.label                 Accessible label (always required).
 * @param {boolean}  [config.hideLabelFromVision] Hide the label when surrounding markup already shows it.
 * @param {string}   config.value                 Current value ('' for none).
 * @param {Array}    config.options               Options from buildFontOptions().
 * @param {string}   config.placeholder           Label of the clearing entry, and the empty-field text.
 * @param {string}   [config.help]                Help text.
 * @param {Function} config.onChange              Receives a normalized string value.
 * @return {Object} Props for ComboboxControl.
 */
function buildComboboxProps(config) {
	config = config || {};

	return {
		label: config.label,
		hideLabelFromVision: !!config.hideLabelFromVision,
		help: config.help,
		// ComboboxControl looks the current option up by strict equality and
		// treats null as "nothing selected", which is what shows the
		// placeholder; '' would match the clearing entry and display it as if
		// a font had been chosen.
		value: isEmptyValue(config.value) ? null : String(config.value),
		// Clearing is an entry in the list, not ComboboxControl's own reset
		// button. Core renders that button only while the field is NOT
		// expanded (`allowReset && Boolean(value) && !isExpanded`) and
		// focusing the field expands it, so the button disappears exactly
		// when someone reaches for it — leaving no way back to "no font".
		// An entry is always visible, keyboard-reachable, and reads the same
		// as the option this control replaced.
		options: [{ label: config.placeholder, value: CLEAR_VALUE }].concat(config.options || []),
		placeholder: config.placeholder,
		allowReset: false,
		onChange: function (value) {
			config.onChange(normalizeFontPickerValue(value));
		}
	};
}

/**
 * Build the props for the SelectControl fallback.
 *
 * Only used where ComboboxControl is unavailable (the plugin supports
 * WordPress 5.8+, and this keeps the picker working rather than rendering
 * nothing if it is ever absent). The same clearing entry leads the list,
 * which is how this control read before 2.4.0.
 *
 * @param {Object} config Same shape as buildComboboxProps().
 * @return {Object} Props for SelectControl.
 */
function buildSelectProps(config) {
	config = config || {};

	return {
		label: config.label,
		hideLabelFromVision: !!config.hideLabelFromVision,
		help: config.help,
		value: isEmptyValue(config.value) ? CLEAR_VALUE : String(config.value),
		options: [{ label: config.placeholder, value: CLEAR_VALUE }].concat(config.options || []),
		onChange: function (value) {
			config.onChange(normalizeFontPickerValue(value));
		}
	};
}

/**
 * The font family picker.
 *
 * @param {Object} props See buildComboboxProps().
 * @return {Object} Element.
 */
function FontPicker(props) {
	var components = window.wp.components;
	var createElement = window.wp.element.createElement;

	if (components.ComboboxControl) {
		return createElement(components.ComboboxControl, buildComboboxProps(props));
	}

	return createElement(components.SelectControl, buildSelectProps(props));
}

module.exports = {
	FontPicker: FontPicker,
	buildComboboxProps: buildComboboxProps,
	buildSelectProps: buildSelectProps,
	normalizeFontPickerValue: normalizeFontPickerValue
};

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
 * whole list. ComboboxControl matches anywhere in the label (ranking
 * starts-with hits first), so the prefix stops mattering and the list stays
 * reachable at any size.
 *
 * The control is used unconditionally rather than swapping in above some
 * font-count threshold: a control that changes shape as fonts are added means
 * a different keyboard and mobile model on either side of the boundary, and
 * the searchable version is no worse for a short list.
 *
 * @since 2.4.0
 */

/**
 * Normalize a value coming back from the picker.
 *
 * ComboboxControl's reset button calls onChange(null); every consumer here
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
 * @param {Object}   config                      Picker configuration.
 * @param {string}   config.label                Accessible label (always required).
 * @param {boolean}  [config.hideLabelFromVision] Hide the label when surrounding markup already shows it.
 * @param {string}   config.value                Current value ('' for none).
 * @param {Array}    config.options              Options from buildFontOptions().
 * @param {string}   config.placeholder          Text shown when nothing is selected.
 * @param {string}   [config.help]               Help text.
 * @param {Function} config.onChange             Receives a normalized string value.
 * @return {Object} Props for ComboboxControl.
 */
function buildComboboxProps(config) {
	config = config || {};

	return {
		label: config.label,
		hideLabelFromVision: !!config.hideLabelFromVision,
		help: config.help,
		// ComboboxControl looks the current option up by strict equality, and
		// treats null as "nothing selected" — '' would never match an option.
		value: config.value ? String(config.value) : null,
		options: config.options || [],
		placeholder: config.placeholder,
		allowReset: true,
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
 * nothing if it is ever absent). The placeholder becomes the empty option,
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
		value: config.value || '',
		options: [{ label: config.placeholder, value: '' }].concat(config.options || []),
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
	var components = (window.wp && window.wp.components) || {};
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

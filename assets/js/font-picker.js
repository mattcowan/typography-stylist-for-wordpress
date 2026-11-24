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
 * The single definition of emptiness in this file — what goes in through
 * `value` and what comes back out through `onChange` have to agree, or a
 * value could be "no font" on the way out and a selection on the way back in.
 *
 * Empty string, null, undefined and false qualify; `false` because boolean
 * state is an easy thing for a consumer to pass. A numeric 0 does NOT: no
 * font source emits ID 0 today, but silently swallowing it would be a trap
 * for whichever one first does.
 *
 * @param {*} value
 * @return {boolean}
 */
function isEmptyValue(value) {
	return value === '' || value === null || value === undefined || value === false;
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
	return isEmptyValue(value) ? '' : String(value);
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
		// expanded (`allowReset && Boolean(value) && !isExpanded`), and typing
		// or a click expands it, so the button disappears exactly when
		// someone reaches for it — leaving no way back to "no font". An entry
		// is always visible, keyboard-reachable, and reads the same as the
		// option this control replaced.
		options: [{ label: config.placeholder, value: CLEAR_VALUE }].concat(config.options || []),
		placeholder: config.placeholder,
		allowReset: false,
		// The list opens on typing or a click, not on focus. Open on focus,
		// NVDA in Firefox read the result count and the highlighted row and
		// never the field's name (#453, SR-2). The prop is in WordPress 6.6+
		// (Gutenberg 18.5, WordPress/gutenberg#61705); an older core ignores
		// it and opens the list on focus, as before.
		expandOnFocus: false,
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
 * Selector of ComboboxControl's suggestions list.
 */
var SUGGESTIONS_LIST_SELECTOR = 'ul[role="listbox"]';

/**
 * Take the combobox's suggestions list out of the Tab order.
 *
 * The list is a scroll container (it holds every font), and browsers put
 * scrollable elements in the Tab order, so on a site with many fonts the
 * next Tab after the field landed on the bare list — NVDA announced it as
 * "list" and nothing else (QA finding SR-5). The list is operated with the
 * arrow keys from the field, which is what the combobox pattern promises;
 * an explicit tabindex -1 keeps it reachable that way and removes the stop.
 *
 * Core renders the list without a tabindex and only while the field is
 * expanded, so this is applied to whatever list exists now and again to
 * each one added later, from a MutationObserver on the picker's wrapper.
 *
 * @param {Element|null} root Wrapper element around the control.
 * @return {number} How many lists were adjusted.
 */
function removeSuggestionsListFromTabOrder(root) {
	if (!root || !root.querySelectorAll) {
		return 0;
	}
	var lists = root.querySelectorAll(SUGGESTIONS_LIST_SELECTOR);
	var changed = 0;
	for (var i = 0; i < lists.length; i++) {
		if (lists[i].getAttribute('tabindex') !== '-1') {
			lists[i].setAttribute('tabindex', '-1');
			changed++;
		}
	}
	return changed;
}

/**
 * Watch a picker wrapper for suggestions lists and keep them out of the
 * Tab order. Returns a function that stops watching.
 *
 * @param {Element|null} root Wrapper element around the control.
 * @return {Function} Cleanup.
 */
function watchSuggestionsList(root) {
	removeSuggestionsListFromTabOrder(root);
	if (!root || typeof MutationObserver === 'undefined') {
		return function () {};
	}
	var observer = new MutationObserver(function () {
		removeSuggestionsListFromTabOrder(root);
	});
	observer.observe(root, { childList: true, subtree: true });
	return function () {
		observer.disconnect();
	};
}

/**
 * How long after an input event the highlighted row is read, in ms.
 *
 * Core's ComboboxControl moves its highlight in an effect that runs after it
 * re-renders for the new text; in Chromium and Firefox the highlight was
 * final by a 0 ms timer (#453). The extra time lets a fast typist finish a
 * word first, so the row is said once, for the last letter.
 */
var TYPING_ANNOUNCE_DELAY = 100;

/**
 * The row ComboboxControl highlights, as a screen reader reads it.
 *
 * Read from the DOM: the field's aria-activedescendant names the row. Core's
 * row ids are positions in the list (`…-0`, `…-1`), not options, so the
 * row is identified by its label.
 *
 * @param {Element|null} root Wrapper element around the control.
 * @return {Object|null} { label, position, total } (position counts from 1),
 *                       or null when the list is closed or nothing is
 *                       highlighted.
 */
function readHighlightedOption(root) {
	if (!root || !root.querySelector) {
		return null;
	}
	var input = root.querySelector('input[role="combobox"]');
	if (!input || input.getAttribute('aria-expanded') !== 'true') {
		return null;
	}
	var activeId = input.getAttribute('aria-activedescendant');
	var doc = root.ownerDocument;
	var active = activeId && doc ? doc.getElementById(activeId) : null;
	if (!active) {
		return null;
	}
	var lists = root.querySelectorAll(SUGGESTIONS_LIST_SELECTOR);
	for (var i = 0; i < lists.length; i++) {
		if (!lists[i].contains(active)) {
			continue;
		}
		var options = lists[i].querySelectorAll('[role="option"]');
		for (var j = 0; j < options.length; j++) {
			if (options[j] === active) {
				var label = (active.textContent || '').replace(/\s+/g, ' ').trim();
				return label ? { label: label, position: j + 1, total: options.length } : null;
			}
		}
	}
	return null;
}

/**
 * What to say about the highlighted row after the author typed.
 *
 * Core's own message after typing gives only the number of results (#453),
 * and a screen reader reads aria-activedescendant only when an arrow key
 * moves it. So nobody says which row typing highlighted, and Enter picks it
 * unheard. wp.a11y.speak() replaces core's message in the polite region, so
 * this one stands alone: the label and its position, as NVDA reads a row.
 *
 * @param {Object|null} row       From readHighlightedOption().
 * @param {string|null} lastLabel Label of the row last read for this field.
 * @return {string|null} The message, or null when there is nothing new.
 */
function typingHighlightMessage(row, lastLabel) {
	if (!row || row.label === lastLabel) {
		return null;
	}
	var i18n = typeof window !== 'undefined' && window.wp && window.wp.i18n;
	var __ = i18n && i18n.__ ? i18n.__ : function (text) {
		return text;
	};
	/* translators: 1: label of the highlighted option, 2: its position in the list, 3: number of options in the list. */
	var template = __('%1$s, %2$s of %3$s', 'typography-stylist');
	var args = [row.label, String(row.position), String(row.total)];
	if (i18n && i18n.sprintf) {
		return i18n.sprintf.apply(null, [template].concat(args));
	}
	var index = 0;
	return template.replace(/%(\d+\$)?s/g, function (match, position) {
		return position ? args[parseInt(position, 10) - 1] : args[index++];
	});
}

/**
 * Say the highlighted row when typing moves it. Returns a function that
 * stops watching.
 *
 * Only an input event (typing, deleting, pasting) leads to a message. A
 * screen reader already reads the row that an arrow key highlights, so after
 * ArrowUp or ArrowDown the row is only remembered, and a keydown cancels a
 * message not yet said. The same row is not said twice in a row; the memory
 * clears when the list closes (core removes the list) and when no row is
 * highlighted (no results).
 *
 * Twin of watchTypingHighlight() in paragraph-styles/assets/js/lib/ps-utils.js
 * (docs/twins.md).
 *
 * @param {Element|null} root Wrapper element around the control.
 * @return {Function} Cleanup.
 */
function watchTypingHighlight(root) {
	if (!root || !root.addEventListener) {
		return function () {};
	}
	var lastLabel = null;
	var timer = null;
	var schedule = function (announce) {
		clearTimeout(timer);
		timer = setTimeout(function () {
			timer = null;
			var row = readHighlightedOption(root);
			var message = announce ? typingHighlightMessage(row, lastLabel) : null;
			// Nothing highlighted (no results): the row that comes back
			// when the text changes again is news.
			lastLabel = row ? row.label : null;
			var a11y = typeof window !== 'undefined' && window.wp && window.wp.a11y;
			if (message && a11y && typeof a11y.speak === 'function') {
				a11y.speak(message, 'polite');
			}
		}, TYPING_ANNOUNCE_DELAY);
	};
	var onInput = function (event) {
		if (event.target && event.target.getAttribute && event.target.getAttribute('role') === 'combobox') {
			schedule(true);
		}
	};
	var onKeyDown = function (event) {
		clearTimeout(timer);
		timer = null;
		if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
			schedule(false);
		}
	};
	root.addEventListener('input', onInput);
	root.addEventListener('keydown', onKeyDown);
	var observer = null;
	if (typeof MutationObserver !== 'undefined') {
		observer = new MutationObserver(function () {
			if (!root.querySelector(SUGGESTIONS_LIST_SELECTOR)) {
				lastLabel = null;
			}
		});
		observer.observe(root, { childList: true, subtree: true });
	}
	return function () {
		clearTimeout(timer);
		root.removeEventListener('input', onInput);
		root.removeEventListener('keydown', onKeyDown);
		if (observer) {
			observer.disconnect();
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
	var element = window.wp.element;
	var createElement = element.createElement;

	// Hooks run unconditionally, before the control branch, so the hook
	// order is the same on every render (rules of hooks). The SelectControl
	// fallback simply never attaches the ref. wp.element has shipped both
	// hooks since WordPress 5.2, below this plugin's floor.
	var ref = element.useRef(null);
	element.useEffect(function () {
		var stopList = watchSuggestionsList(ref.current);
		var stopSpeech = watchTypingHighlight(ref.current);
		return function () {
			stopList();
			stopSpeech();
		};
	}, []);

	if (components.ComboboxControl) {
		// The wrapper exists for the suggestions-list fix and the typing
		// message above.
		return createElement(
			'div',
			{ className: 'typost-font-picker', ref: ref },
			createElement(components.ComboboxControl, buildComboboxProps(props))
		);
	}

	return createElement(components.SelectControl, buildSelectProps(props));
}

module.exports = {
	FontPicker: FontPicker,
	buildComboboxProps: buildComboboxProps,
	buildSelectProps: buildSelectProps,
	normalizeFontPickerValue: normalizeFontPickerValue,
	removeSuggestionsListFromTabOrder: removeSuggestionsListFromTabOrder,
	watchSuggestionsList: watchSuggestionsList,
	TYPING_ANNOUNCE_DELAY: TYPING_ANNOUNCE_DELAY,
	readHighlightedOption: readHighlightedOption,
	typingHighlightMessage: typingHighlightMessage,
	watchTypingHighlight: watchTypingHighlight
};

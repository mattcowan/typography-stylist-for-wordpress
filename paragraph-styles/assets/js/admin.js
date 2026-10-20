/**
 * Typography Stylist - Paragraph Styles: Admin Tab JavaScript
 *
 * Handles editing and deletion of paragraph styles in the Typography
 * Stylist settings page.
 *
 * Edit form (#221): every stored property, not just the name. The form is
 * cloned from one <template> in the tab, filled from the style as stored
 * now, and saved through the existing PATCH route. Edit fetches the style
 * from the admin-card route first: the copy localized at page load
 * (typostPSAdmin.styles) can be older than an Update Style made in the
 * editor since, and the form sends every property, so filling from it
 * would put the old values back. The payload comes from ps-utils'
 * buildPropertiesForStyleSave() — the rule Update Style uses in the
 * editor — so fontSizeUnit is kept the
 * same way: a style with a size keeps its unit, a size added to a style
 * without one takes the site's new-content unit. PATCH replaces the whole
 * properties object, so the form always sends the complete set, and sends
 * none at all when no property changed (a rename stays a rename). After a
 * save the card's details and preview come back from the admin-card route,
 * rendered by the same PHP as the page, with the regenerated style CSS.
 *
 * Focus and announcements (QA finding ADM-2): opening the edit form moves
 * focus to the name field, saving or cancelling returns it to the card's
 * Edit button, deleting moves it to the next card (or the list itself when
 * none is left), and every rename/delete is announced through wp.a11y —
 * jQuery's slide/remove left focus on <body> and said nothing.
 *
 * The DOM helpers below take plain elements and are exported for Jest; the
 * jQuery wiring at the bottom only runs in the browser.
 */
(function($) {
	'use strict';

	/**
	 * Announce a message to assistive technology (polite).
	 *
	 * @param {string} message
	 */
	function announce(message) {
		if (window.wp && window.wp.a11y && typeof window.wp.a11y.speak === 'function') {
			window.wp.a11y.speak(message, 'polite');
		}
	}

	/**
	 * Move focus to a card's name input and select its text.
	 *
	 * @param {Element|null} card .typost-ps-style-card element
	 * @return {Element|null} The focused input
	 */
	function focusEditName(card) {
		var input = card ? card.querySelector('.typost-ps-edit-name') : null;
		if (!input) {
			return null;
		}
		input.focus();
		if (typeof input.select === 'function') {
			input.select();
		}
		return input;
	}

	/**
	 * Move focus back to a card's Edit button.
	 *
	 * @param {Element|null} card
	 * @return {Element|null} The focused button
	 */
	function focusEditButton(card) {
		var button = card ? card.querySelector('.typost-ps-edit-btn') : null;
		if (!button) {
			return null;
		}
		button.focus();
		return button;
	}

	/**
	 * Decide where focus goes once a card is removed: the next card's Edit
	 * button, else the previous card's, else the list container itself
	 * (given tabindex -1 so it can take focus and read its empty state).
	 *
	 * Pure: takes the card that is about to go and returns the target
	 * without focusing it, so the caller can remove the card first.
	 *
	 * @param {Element} card The card being deleted (still in the DOM)
	 * @param {Element} list #typost-ps-styles-list
	 * @return {Element|null}
	 */
	function focusTargetAfterDelete(card, list) {
		var cards = list ? Array.prototype.slice.call(list.querySelectorAll('.typost-ps-style-card')) : [];
		var index = cards.indexOf(card);
		var neighbour = null;
		if (index !== -1) {
			neighbour = cards[index + 1] || cards[index - 1] || null;
		}
		if (neighbour) {
			return neighbour.querySelector('.typost-ps-edit-btn') || neighbour;
		}
		if (list) {
			list.setAttribute('tabindex', '-1');
			return list;
		}
		return null;
	}

	// -------------------------------------------------------------------------
	// Edit form (#221)
	// -------------------------------------------------------------------------

	/**
	 * ps-utils: window.typostPSUtils in the browser (an enqueued dependency),
	 * required directly under Jest.
	 */
	function getUtils() {
		if (typeof window !== 'undefined' && window.typostPSUtils) {
			return window.typostPSUtils;
		}
		if (typeof require === 'function') {
			return require('./lib/ps-utils.js');
		}
		return null;
	}

	/**
	 * Named __ so WP-CLI make-pot extracts the literals passed to it (the
	 * domain argument at each call site is read only by make-pot); falls
	 * back to the source string under Jest, where no wp global exists.
	 *
	 * @param {string} text
	 * @return {string}
	 */
	function __(text) {
		if (typeof wp !== 'undefined' && wp.i18n && typeof wp.i18n.__ === 'function') {
			return wp.i18n.__(text, 'typost-paragraph-styles');
		}
		return text;
	}

	// Slider defaults for a size mode the style did not have, the same
	// fallbacks isStyleModified() uses
	var SIZE_TRIO_DEFAULTS = { fontSizeMin: 16, fontSizePreferred: 24, fontSizeMax: 32 };

	// Same check as the CSS generators: an axis pair they would drop
	var AXIS_PAIR = /^"([a-zA-Z]{4})"\s+(-?\d+(?:\.\d+)?)$/;

	/**
	 * Append a suffix to every id in a cloned form and to the attributes
	 * that point at ids, so each card's labels stay tied to its own fields.
	 *
	 * @param {Element|DocumentFragment} root
	 * @param {string|number} suffix
	 */
	function suffixIds(root, suffix) {
		var tail = '-' + suffix;
		Array.prototype.forEach.call(root.querySelectorAll('[id]'), function(el) {
			el.id = el.id + tail;
		});
		['for', 'aria-describedby', 'aria-labelledby'].forEach(function(attr) {
			Array.prototype.forEach.call(root.querySelectorAll('[' + attr + ']'), function(el) {
				var refs = el.getAttribute(attr).split(/\s+/).filter(Boolean).map(function(ref) {
					return ref + tail;
				});
				el.setAttribute(attr, refs.join(' '));
			});
		});
	}

	/**
	 * The size mode a stored fontSize stands for.
	 *
	 * @param {*} fontSize
	 * @return {string} 'inherit', 'fixed', 'responsive' or 'fit'
	 */
	function sizeModeOf(fontSize) {
		if (fontSize === 'responsive' || fontSize === 'fit') {
			return fontSize;
		}
		if (fontSize !== undefined && fontSize !== null && fontSize !== '' && isFinite(fontSize) && Number(fontSize) > 0) {
			return 'fixed';
		}
		return 'inherit';
	}

	/**
	 * The unit a save writes the style's size in: the rule
	 * buildPropertiesForStyleSave() applies on an update. A style that has a
	 * size keeps its unit (no stored unit is px, pre-#233); a size added to
	 * a style without one takes the new-content unit.
	 *
	 * @param {Object} properties The stored properties.
	 * @param {string} newUnit    typostPSAdmin.newFontSizeUnit.
	 * @return {string} 'px' or 'rem'
	 */
	function resolveEditFontSizeUnit(properties, newUnit) {
		var props = properties || {};
		if (sizeModeOf(props.fontSize) !== 'inherit') {
			return props.fontSizeUnit === 'rem' ? 'rem' : 'px';
		}
		return newUnit === 'px' ? 'px' : 'rem';
	}

	/**
	 * Ask a REST route to answer in the user's language, not the site's
	 * (determine_locale() reads _locale=user on REST requests).
	 *
	 * @param {string} url
	 * @return {string}
	 */
	function withUserLocale(url) {
		return url + (url.indexOf('?') === -1 ? '?' : '&') + '_locale=user';
	}

	function field(form, name) {
		return form.querySelector('[data-field="' + name + '"]');
	}

	/**
	 * Select a value, adding it as an option first when the list lacks it
	 * (a deleted font, a weight such as 350), so an untouched value saves
	 * unchanged.
	 */
	function selectValue(select, value, label) {
		if (!select) {
			return;
		}
		var str = String(value);
		var exists = Array.prototype.some.call(select.options, function(option) {
			return option.value === str;
		});
		if (!exists) {
			var option = select.ownerDocument.createElement('option');
			option.value = str;
			option.textContent = label || str;
			select.appendChild(option);
		}
		select.value = str;
	}

	function setInput(form, name, value) {
		var input = field(form, name);
		if (input) {
			input.value = value === undefined || value === null ? '' : String(value);
		}
	}

	/**
	 * Show the fields that belong to the chosen size mode and case.
	 *
	 * @param {Element} form
	 */
	function updateConditionalFields(form) {
		var mode = field(form, 'sizeMode') ? field(form, 'sizeMode').value : 'inherit';
		var textCase = field(form, 'textCase') ? field(form, 'textCase').value : '';
		Array.prototype.forEach.call(form.querySelectorAll('[data-show-for-size]'), function(el) {
			el.hidden = el.getAttribute('data-show-for-size').split(/\s+/).indexOf(mode) === -1;
		});
		Array.prototype.forEach.call(form.querySelectorAll('[data-show-for-case]'), function(el) {
			el.hidden = el.getAttribute('data-show-for-case').split(/\s+/).indexOf(textCase) === -1;
		});
	}

	/**
	 * Fill a cloned edit form from a stored style.
	 *
	 * @param {Element} form      The form element.
	 * @param {Object}  style     {id, name, properties}.
	 * @param {string}  fontLabel The card's text for the style's font, used
	 *                            when the font is not in the list.
	 * @param {string}  unit      resolveEditFontSizeUnit() for the style: a
	 *                            px size takes whole steps, as px CSS is
	 *                            written with whole numbers.
	 */
	function fillEditForm(form, style, fontLabel, unit) {
		var utils = getUtils();
		var props = (style && style.properties) || {};
		var mode = sizeModeOf(props.fontSize);

		var sizeInput = field(form, 'fontSize');
		if (sizeInput) {
			sizeInput.setAttribute('step', unit === 'px' ? '1' : 'any');
		}

		setInput(form, 'name', style && style.name);
		selectValue(field(form, 'fontId'), parseInt(props.fontId, 10) || 0, fontLabel);
		selectValue(field(form, 'fontWeight'), props.fontWeight ? String(props.fontWeight) : '');
		var fontStyle = ['normal', 'italic', 'oblique'].indexOf(props.fontStyle) !== -1 ? props.fontStyle : '';
		selectValue(field(form, 'fontStyle'), fontStyle);

		selectValue(field(form, 'sizeMode'), mode);
		setInput(form, 'fontSize', mode === 'fixed' ? props.fontSize : '');
		Object.keys(SIZE_TRIO_DEFAULTS).forEach(function(key) {
			var stored = mode === 'responsive' || mode === 'fit' ? parseInt(props[key], 10) : 0;
			setInput(form, key, stored > 0 ? stored : SIZE_TRIO_DEFAULTS[key]);
		});
		setInput(form, 'fitMaxSize', mode === 'fit' ? (parseInt(props.fitMaxSize, 10) || 0) : 0);

		setInput(form, 'letterSpacing', parseInt(props.letterSpacing, 10) || 0);
		setInput(form, 'lineHeight', utils ? utils.roundLineHeight(props.lineHeight || 0) : (props.lineHeight || 0));
		setInput(form, 'initialHang', utils ? utils.normalizeHang(props.initialHang) : 0);

		var textCase = utils ? utils.normalizeTextCase(props.textCase) : (props.textCase || '');
		selectValue(field(form, 'textCase'), textCase);
		var fake = field(form, 'fakeSmallCaps');
		if (fake) {
			fake.checked = props.fakeSmallCaps !== false;
		}

		var features = Array.isArray(props.features) ? props.features.map(String) : [];
		var boxes = Array.prototype.slice.call(form.querySelectorAll('input[data-feature]'));
		var known = {};
		boxes.forEach(function(box) {
			known[box.value] = true;
			box.checked = features.indexOf(box.value) !== -1;
		});
		// A stored feature the list does not offer (an extension's) stays
		// checked in its own group, so saving does not drop it.
		var extra = form.querySelector('[data-extra-features]');
		features.forEach(function(tag) {
			if (known[tag] || !extra) {
				return;
			}
			known[tag] = true;
			var doc = form.ownerDocument;
			var row = doc.createElement('p');
			row.className = 'typost-ps-edit-checkbox';
			var box = doc.createElement('input');
			box.type = 'checkbox';
			box.setAttribute('data-feature', '');
			box.value = tag;
			box.checked = true;
			var label = doc.createElement('label');
			var code = doc.createElement('code');
			code.textContent = tag;
			label.appendChild(code);
			// Wrap rather than for/id: these tags come from stored data
			label.insertBefore(box, code);
			label.insertBefore(doc.createTextNode(' '), code);
			row.appendChild(label);
			extra.appendChild(row);
			extra.hidden = false;
		});
		// Saving keeps the stored order (it is the CSS order), new picks after
		form.setAttribute('data-feature-order', JSON.stringify(features));

		setInput(form, 'fontVariationSettings', props.fontVariationSettings || '');

		updateConditionalFields(form);
	}

	function numberOf(form, name) {
		var input = field(form, name);
		var n = input ? parseFloat(input.value) : NaN;
		return isFinite(n) ? n : 0;
	}

	/**
	 * Read the edit form's values.
	 *
	 * @param {Element} form
	 * @return {Object}
	 */
	function readEditForm(form) {
		var order = [];
		try {
			order = JSON.parse(form.getAttribute('data-feature-order') || '[]') || [];
		} catch (e) {
			order = [];
		}
		var checked = Array.prototype.filter.call(form.querySelectorAll('input[data-feature]'), function(box) {
			return box.checked;
		}).map(function(box) {
			return box.value;
		});
		var features = order.filter(function(tag) {
			return checked.indexOf(tag) !== -1;
		}).concat(checked.filter(function(tag) {
			return order.indexOf(tag) === -1;
		}));
		var fake = field(form, 'fakeSmallCaps');
		var sizeInput = field(form, 'fontSize');

		return {
			name: field(form, 'name') ? field(form, 'name').value.trim() : '',
			fontId: parseInt(field(form, 'fontId') ? field(form, 'fontId').value : 0, 10) || 0,
			fontWeight: field(form, 'fontWeight') ? field(form, 'fontWeight').value : '',
			fontStyle: field(form, 'fontStyle') ? field(form, 'fontStyle').value : '',
			sizeMode: field(form, 'sizeMode') ? field(form, 'sizeMode').value : 'inherit',
			fontSize: sizeInput ? sizeInput.value.trim() : '',
			fontSizeMin: numberOf(form, 'fontSizeMin'),
			fontSizePreferred: numberOf(form, 'fontSizePreferred'),
			fontSizeMax: numberOf(form, 'fontSizeMax'),
			fitMaxSize: numberOf(form, 'fitMaxSize'),
			letterSpacing: numberOf(form, 'letterSpacing'),
			lineHeight: numberOf(form, 'lineHeight'),
			initialHang: numberOf(form, 'initialHang'),
			textCase: field(form, 'textCase') ? field(form, 'textCase').value : '',
			fakeSmallCaps: fake ? !!fake.checked : true,
			features: features,
			fontVariationSettings: field(form, 'fontVariationSettings') ? field(form, 'fontVariationSettings').value.trim() : ''
		};
	}

	/**
	 * A fixed size as a save stores it. px CSS is written with intval()
	 * (PHP) and phpInt() (JS), so a px size is stored as that whole number:
	 * the card then shows what renders, and a stored decimal keeps its
	 * rendered size when another value changes. rem keeps decimals.
	 *
	 * @param {string} value The size field's text.
	 * @param {string} unit  'px' or 'rem'.
	 * @return {number} NaN when the text is not a number.
	 */
	function fixedSizeFor(value, unit) {
		var size = parseFloat(value);
		return unit === 'px' ? Math.floor(size) : size;
	}

	/**
	 * Check the values before saving.
	 *
	 * @param {Object} values  readEditForm() result.
	 * @param {Object} options {baseline: readEditForm() right after filling,
	 *                         unit: resolveEditFontSizeUnit()}. A field the
	 *                         author did not change is not checked against
	 *                         the axis format: a stored value the check
	 *                         rejects (the editor writes single quotes and
	 *                         exponents) must not block a rename.
	 * @return {{field: string, message: string}|null}
	 */
	function validateEditValues(values, options) {
		var opts = options || {};
		if (!values.name) {
			return { field: 'name', message: __('Enter a name for the style.', 'typost-paragraph-styles') };
		}
		if (values.sizeMode === 'fixed' && !(fixedSizeFor(values.fontSize, opts.unit) > 0)) {
			return { field: 'fontSize', message: __('Enter a size greater than 0.', 'typost-paragraph-styles') };
		}
		if (values.sizeMode === 'responsive' || values.sizeMode === 'fit') {
			var missing = ['fontSizeMin', 'fontSizePreferred', 'fontSizeMax'].filter(function(key) {
				return !(Math.round(values[key]) >= 1);
			});
			if (missing.length) {
				return { field: missing[0], message: __('Enter all three sizes, each greater than 0.', 'typost-paragraph-styles') };
			}
		}
		var axesUnchanged = opts.baseline && opts.baseline.fontVariationSettings === values.fontVariationSettings;
		if (values.fontVariationSettings && !axesUnchanged) {
			var bad = values.fontVariationSettings.split(',').some(function(pair) {
				return !AXIS_PAIR.test(pair.trim());
			});
			if (bad) {
				return { field: 'fontVariationSettings', message: __('Each axis setting needs a four-letter tag in quotes and a number, such as "wght" 650.', 'typost-paragraph-styles') };
			}
		}
		return null;
	}

	/**
	 * Turn form values into the editor state that buildPropertiesFromState()
	 * reads. The form reports initialHang and textCase, so its values win
	 * over the stored ones (0 and Default included).
	 *
	 * @param {Object} values readEditForm() result.
	 * @param {string} unit   resolveEditFontSizeUnit(); px makes a fixed
	 *                        size whole (fixedSizeFor()).
	 * @return {Object}
	 */
	function stateFromEditValues(values, unit) {
		var mode = values.sizeMode;
		var fontSize = 'inherit';
		if (mode === 'fixed') {
			fontSize = String(fixedSizeFor(values.fontSize, unit));
		} else if (mode === 'responsive' || mode === 'fit') {
			fontSize = mode;
		}
		return {
			explicitFontId: values.fontId || 0,
			explicitFontWeight: values.fontWeight || '',
			explicitFontStyle: values.fontStyle || '',
			fontSize: fontSize,
			fontSizeMin: Math.round(values.fontSizeMin) || 0,
			fontSizePreferred: Math.round(values.fontSizePreferred) || 0,
			fontSizeMax: Math.round(values.fontSizeMax) || 0,
			fitMaxSize: Math.max(0, Math.round(values.fitMaxSize) || 0),
			letterSpacing: Math.round(values.letterSpacing) || 0,
			lineHeight: values.lineHeight > 0 ? values.lineHeight : 0,
			features: values.features || [],
			fontVariationSettings: values.fontVariationSettings || '',
			initialHang: values.initialHang,
			textCase: values.textCase || '',
			fakeSmallCaps: values.fakeSmallCaps !== false
		};
	}

	function stableStringify(value) {
		if (Array.isArray(value)) {
			return '[' + value.map(stableStringify).join(',') + ']';
		}
		if (value && typeof value === 'object') {
			return '{' + Object.keys(value).sort().map(function(key) {
				return JSON.stringify(key) + ':' + stableStringify(value[key]);
			}).join(',') + '}';
		}
		return JSON.stringify(value);
	}

	/**
	 * The PATCH body for a save.
	 *
	 * Properties are built like Update Style in the editor
	 * (buildPropertiesForStyleSave with isUpdate), so fontSizeUnit is kept
	 * or taken from the site setting by the same rule. They are sent only
	 * when they differ from what the untouched form builds: PATCH replaces
	 * the whole set, and a rename must not rewrite properties the form
	 * cannot represent.
	 *
	 * @param {Object} values         readEditForm() now.
	 * @param {Object} baselineValues readEditForm() right after filling.
	 * @param {Object} style          The stored style.
	 * @param {string} newUnit        typostPSAdmin.newFontSizeUnit.
	 * @return {{name: string, properties?: Object}}
	 */
	function buildEditPayload(values, baselineValues, style, newUnit) {
		var utils = getUtils();
		var base = (style && style.properties) || {};
		var unit = resolveEditFontSizeUnit(base, newUnit);
		var payload = { name: values.name };
		var properties = utils.buildPropertiesForStyleSave(stateFromEditValues(values, unit), base, true, newUnit);
		var baseline = baselineValues
			? utils.buildPropertiesForStyleSave(stateFromEditValues(baselineValues, unit), base, true, newUnit)
			: null;
		if (!baseline || stableStringify(properties) !== stableStringify(baseline)) {
			payload.properties = properties;
		}
		return payload;
	}

	/**
	 * Hide the form's error and remove the marks showFormError() added.
	 *
	 * @param {Element} form
	 */
	function clearFormError(form) {
		var box = form.querySelector('.typost-ps-edit-error');
		var boxId = box ? box.id : '';
		Array.prototype.forEach.call(form.querySelectorAll('[aria-invalid]'), function(input) {
			input.removeAttribute('aria-invalid');
			var refs = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(function(ref) {
				return ref && ref !== boxId;
			});
			if (refs.length) {
				input.setAttribute('aria-describedby', refs.join(' '));
			} else {
				input.removeAttribute('aria-describedby');
			}
		});
		if (box) {
			box.hidden = true;
			box.textContent = '';
		}
	}

	/**
	 * Show an error in the form. A field error marks the field invalid, adds
	 * the message to its description (so it is read with the field when
	 * focus lands there) and focuses it. An error with no field (the server
	 * refused the save) focuses Save, not a field that is not the cause.
	 *
	 * @param {Element} form
	 * @param {{field: ?string, message: string}} error
	 */
	function showFormError(form, error) {
		clearFormError(form);
		var box = form.querySelector('.typost-ps-edit-error');
		if (box) {
			// Shown before it is filled, so the alert's text change is announced
			box.hidden = false;
			box.textContent = error.message;
		}
		var input = error.field ? field(form, error.field) : null;
		if (input) {
			input.setAttribute('aria-invalid', 'true');
			if (box && box.id) {
				var refs = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
				refs.push(box.id);
				input.setAttribute('aria-describedby', refs.join(' '));
			}
			input.focus();
			return;
		}
		var save = form.querySelector('.typost-ps-save-edit-btn');
		if (save) {
			save.focus();
		}
	}

	/**
	 * Swap a card's details and preview for freshly rendered ones.
	 *
	 * @param {Element} card
	 * @param {Object}  data admin-card response ({details, preview}).
	 */
	function replaceCardParts(card, data) {
		if (!card || !data) {
			return;
		}
		var details = card.querySelector('.typost-ps-style-card-details');
		if (details && typeof data.details === 'string' && data.details) {
			details.outerHTML = data.details;
		}
		var preview = card.querySelector('.typost-ps-preview');
		if (preview && typeof data.preview === 'string' && data.preview) {
			preview.outerHTML = data.preview;
		}
	}

	/**
	 * Replace the style CSS the page printed for the previews. WordPress
	 * prints wp_add_inline_style() text as <style id="{handle}-inline-css">;
	 * replacing it (not appending a rule) drops a property the save removed.
	 *
	 * @param {Document} doc
	 * @param {string}   css
	 * @return {Element|null}
	 */
	function replaceStyleCss(doc, css) {
		if (typeof css !== 'string') {
			return null;
		}
		var id = 'typost-paragraph-styles-admin-inline-css';
		var el = doc.getElementById(id);
		if (!el) {
			el = doc.createElement('style');
			el.id = id;
			doc.head.appendChild(el);
		}
		el.textContent = css;
		return el;
	}

	var helpers = {
		announce: announce,
		focusEditName: focusEditName,
		focusEditButton: focusEditButton,
		focusTargetAfterDelete: focusTargetAfterDelete,
		suffixIds: suffixIds,
		sizeModeOf: sizeModeOf,
		updateConditionalFields: updateConditionalFields,
		fillEditForm: fillEditForm,
		readEditForm: readEditForm,
		validateEditValues: validateEditValues,
		stateFromEditValues: stateFromEditValues,
		buildEditPayload: buildEditPayload,
		resolveEditFontSizeUnit: resolveEditFontSizeUnit,
		withUserLocale: withUserLocale,
		showFormError: showFormError,
		clearFormError: clearFormError,
		replaceCardParts: replaceCardParts,
		replaceStyleCss: replaceStyleCss
	};

	if (typeof module !== 'undefined' && module.exports) {
		module.exports = helpers;
	}

	if (!$ || typeof typostPSAdmin === 'undefined') {
		return;
	}

	var restUrl = typostPSAdmin.restUrl;
	var nonce   = typostPSAdmin.nonce;

	// -------------------------------------------------------------------------
	// Edit Style
	// -------------------------------------------------------------------------

	var styles  = Array.isArray(typostPSAdmin.styles) ? typostPSAdmin.styles : [];
	var newUnit = typostPSAdmin.newFontSizeUnit === 'px' ? 'px' : 'rem';

	function findStyle(styleId) {
		for (var i = 0; i < styles.length; i++) {
			if (String(styles[i].id) === String(styleId)) {
				return styles[i];
			}
		}
		return null;
	}

	function storeStyle(style) {
		for (var i = 0; i < styles.length; i++) {
			if (String(styles[i].id) === String(style.id)) {
				styles[i] = style;
				return;
			}
		}
		styles.push(style);
	}

	function closeEditForm($card) {
		var $container = $card.find('.typost-ps-edit-form');
		$container.slideUp(200, function() {
			$container.empty();
		});
		$card.find('.typost-ps-style-actions').show();
		focusEditButton($card[0]);
	}

	/**
	 * Apply an admin-card response: the stored style, the card's details
	 * and preview, and the regenerated preview CSS.
	 */
	function applyCardResponse($card, card) {
		if (card && card.style) {
			storeStyle(card.style);
		}
		replaceCardParts($card[0], card);
		replaceStyleCss(document, card && card.css);
		if (window.typostAdminFonts) {
			window.typostAdminFonts.scan($card[0]);
		}
	}

	function openEditForm($card, styleId) {
		var template = document.getElementById('typost-ps-edit-form-template');
		var style    = findStyle(styleId);
		if (!template || !template.content || !style) {
			return;
		}

		var fragment = template.content.cloneNode(true);
		suffixIds(fragment, styleId);
		var $container = $card.find('.typost-ps-edit-form');
		// Finish a close still running first: its callback empties the
		// container, and would empty this form (Escape, then Enter at once)
		$container.stop(true, true).empty().append(fragment);

		var form    = $container.find('form')[0];
		var details = $card[0].querySelector('.typost-ps-style-card-details');
		var unit    = resolveEditFontSizeUnit(style.properties, newUnit);
		fillEditForm(form, style, details ? details.getAttribute('data-font-label') : '', unit);
		$(form).data('baseline', readEditForm(form));

		$card.find('.typost-ps-style-actions').hide();
		$container.slideDown(200, function() {
			focusEditName($card[0]);
		});
	}

	$(document).on('click', '.typost-ps-edit-btn', function() {
		var $button = $(this);
		var $card   = $button.closest('.typost-ps-style-card');
		var styleId = $card.data('style-id');
		if ($card.hasClass('typost-ps-loading')) {
			return;
		}

		// Fill from the style as stored now, not the page-load copy: the
		// form sends every property, so an old copy would undo an Update
		// Style made in the editor since. If the request fails, open with
		// the copy the page has; the save reports its own error.
		$card.addClass('typost-ps-loading');
		$button.attr('aria-busy', 'true');
		$.ajax({
			url: withUserLocale(restUrl + '/' + encodeURIComponent(styleId) + '/admin-card'),
			method: 'GET',
			beforeSend: function(xhr) {
				xhr.setRequestHeader('X-WP-Nonce', nonce);
			},
			success: function(card) {
				applyCardResponse($card, card);
			},
			complete: function() {
				$card.removeClass('typost-ps-loading');
				$button.removeAttr('aria-busy');
				openEditForm($card, styleId);
			}
		});
	});

	$(document).on('change', '.typost-ps-edit-form [data-field="sizeMode"], .typost-ps-edit-form [data-field="textCase"]', function() {
		updateConditionalFields($(this).closest('form')[0]);
	});

	$(document).on('click', '.typost-ps-cancel-edit-btn', function() {
		closeEditForm($(this).closest('.typost-ps-style-card'));
	});

	$(document).on('keydown', '.typost-ps-edit-form form', function(event) {
		if (event.key === 'Escape') {
			event.preventDefault();
			closeEditForm($(this).closest('.typost-ps-style-card'));
		}
	});

	$(document).on('submit', '.typost-ps-edit-form form', function(event) {
		event.preventDefault();
		var form    = this;
		var $card   = $(form).closest('.typost-ps-style-card');
		var styleId = $card.data('style-id');
		var style   = findStyle(styleId);
		var values  = readEditForm(form);
		var error   = validateEditValues(values, {
			baseline: $(form).data('baseline'),
			unit: resolveEditFontSizeUnit(style && style.properties, newUnit)
		});
		var $save   = $(form).find('.typost-ps-save-edit-btn');

		if (error) {
			showFormError(form, error);
			return;
		}
		clearFormError(form);

		var payload = buildEditPayload(values, $(form).data('baseline'), style, newUnit);
		var renamed = !!style && payload.name !== style.name;

		$card.addClass('typost-ps-saving');
		$save.prop('disabled', true);

		function done() {
			$card.removeClass('typost-ps-saving');
			$save.prop('disabled', false);
		}

		$.ajax({
			url: restUrl + '/' + encodeURIComponent(styleId),
			method: 'PATCH',
			beforeSend: function(xhr) {
				xhr.setRequestHeader('X-WP-Nonce', nonce);
			},
			contentType: 'application/json',
			data: JSON.stringify(payload),
			success: function(response) {
				storeStyle(response);
				$card.find('.typost-ps-style-name').text(response.name);
				var message = payload.properties || !renamed
					/* translators: %s: style name */
					? wp.i18n.sprintf(wp.i18n.__('Style “%s” saved.', 'typost-paragraph-styles'), response.name)
					/* translators: %s: style name */
					: wp.i18n.sprintf(wp.i18n.__('Style renamed to “%s”.', 'typost-paragraph-styles'), response.name);

				if (!payload.properties) {
					done();
					closeEditForm($card);
					announce(message);
					return;
				}

				// The card's details and preview, rendered by the same PHP
				// as the page, and the regenerated CSS for the previews
				$.ajax({
					url: withUserLocale(restUrl + '/' + encodeURIComponent(styleId) + '/admin-card'),
					method: 'GET',
					beforeSend: function(xhr) {
						xhr.setRequestHeader('X-WP-Nonce', nonce);
					},
					success: function(card) {
						applyCardResponse($card, card);
						done();
						closeEditForm($card);
						announce(message);
					},
					error: function() {
						// The save went through; reload rather than show a stale card
						window.location.reload();
					}
				});
			},
			error: function(xhr) {
				done();
				var serverMessage = xhr && xhr.responseJSON && xhr.responseJSON.message;
				// The route's only 400 is about the name (empty after
				// sanitizing); a 404, a 429 or a lost connection is not
				// any field's fault
				showFormError(form, {
					field: xhr && xhr.status === 400 ? 'name' : null,
					message: serverMessage || wp.i18n.__('Failed to update style. Please try again.', 'typost-paragraph-styles')
				});
			}
		});
	});

	// -------------------------------------------------------------------------
	// Delete Style
	// -------------------------------------------------------------------------

	$(document).on('click', '.typost-ps-delete-btn', function() {
		var $card   = $(this).closest('.typost-ps-style-card');
		var styleId = $card.data('style-id');
		var name    = $card.find('.typost-ps-style-name').text();

		/* translators: %s: style name */
		if (!confirm(wp.i18n.sprintf(
			wp.i18n.__('Are you sure you want to delete “%s”? This cannot be undone.', 'typost-paragraph-styles'),
			name
		))) {
			return;
		}

		$card.addClass('typost-ps-deleting');

		$.ajax({
			url: restUrl + '/' + encodeURIComponent(styleId),
			method: 'DELETE',
			beforeSend: function(xhr) {
				xhr.setRequestHeader('X-WP-Nonce', nonce);
			},
			success: function() {
				var list   = document.getElementById('typost-ps-styles-list');
				var target = focusTargetAfterDelete($card[0], list);
				$card.slideUp(300, function() {
					$card.remove();
					// Show empty state if no cards remain
					if ($('#typost-ps-styles-list .typost-ps-style-card').length === 0) {
						$('#typost-ps-styles-list').html(
							'<div class="typost-ps-empty-state"><p>' +
							wp.i18n.__('No paragraph styles saved yet. Create styles from the Typography Stylist editor when editing a post.', 'typost-paragraph-styles') +
							'</p></div>'
						);
					}
					if (target && typeof target.focus === 'function') {
						target.focus();
					}
					/* translators: %s: style name */
					announce(wp.i18n.sprintf(wp.i18n.__('Style “%s” deleted.', 'typost-paragraph-styles'), name));
				});
			},
			error: function() {
				$card.removeClass('typost-ps-deleting');
				alert(wp.i18n.__('Failed to delete style. Please try again.', 'typost-paragraph-styles'));
				$card.find('.typost-ps-delete-btn').trigger('focus');
			}
		});
	});

})(typeof jQuery !== 'undefined' ? jQuery : null);

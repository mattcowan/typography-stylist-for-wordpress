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
 * Based On (#200): typostPSAdmin.styles comes in the client shape, so a
 * style based on another fills the form with its resolved values (what it
 * renders) and carries ownProperties + basedOn. The form's "Based on"
 * select lists every style except the edited one and the styles based on
 * it. A save of a child sends only what differs from its current parent
 * (computeStyleOverrides); a Based On change is applied by the server's
 * rebase, with or without edits (a first parent keeps the look). The
 * admin-card response also carries the cards of the styles based on the
 * saved one and every style in the client shape, because their resolved
 * values change with it. Reset to Base (in the form, shown only while the
 * select names the saved parent) sends empty properties.
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

	/**
	 * Put the style name in the accessible names of a card's Edit and Delete
	 * buttons (#295), so a screen reader's list of buttons tells the cards
	 * apart. The visible text stays "Edit" and "Delete", which the names
	 * start with. admin-tab.php writes the same names at page load; this
	 * runs after a rename.
	 *
	 * @param {Element|null} card .typost-ps-style-card element
	 * @param {string}       name The style name
	 */
	function setCardButtonNames(card, name) {
		if (!card) {
			return;
		}
		var labels = {
			/* translators: %s: style name */
			'.typost-ps-edit-btn': __('Edit “%s”', 'typost-paragraph-styles'),
			/* translators: %s: style name */
			'.typost-ps-delete-btn': __('Delete “%s”', 'typost-paragraph-styles')
		};
		Object.keys(labels).forEach(function(selector) {
			var button = card.querySelector(selector);
			if (!button) {
				return;
			}
			// wp.i18n.sprintf also reads a translator's %1$s, as PHP's
			// sprintf() does on page load. Without it (Jest), a function
			// replacement keeps a "$" in the name literal.
			var label = (typeof wp !== 'undefined' && wp.i18n && typeof wp.i18n.sprintf === 'function')
				? wp.i18n.sprintf(labels[selector], String(name))
				: labels[selector].replace('%s', function() { return String(name); });
			button.setAttribute('aria-label', label);
		});
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
	 * Ask a REST route to answer in the user's language, not the site's.
	 * determine_locale() reads _locale=user only on a JSON request
	 * (wp_is_json_request(): a JSON Accept or Content-Type header), so the
	 * request must also send one — dataType: 'json' sets the Accept header.
	 * Twin of core's typostWithUserLocale(); a parity test keeps them equal.
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
	 * Show the fields that belong to the chosen size mode, case and
	 * alignment. The justify note (#207) also joins the alignment select's
	 * description while it shows, and leaves it when hidden: a hidden
	 * element named by aria-describedby is still read.
	 *
	 * @param {Element} form
	 */
	function updateConditionalFields(form) {
		var mode = field(form, 'sizeMode') ? field(form, 'sizeMode').value : 'inherit';
		var textCase = field(form, 'textCase') ? field(form, 'textCase').value : '';
		// A fit style uses no alignment (its fields are hidden)
		var alignment = mode === 'fit' ? '' : (field(form, 'alignment') ? field(form, 'alignment').value : '');
		Array.prototype.forEach.call(form.querySelectorAll('[data-show-for-align]'), function(el) {
			el.hidden = el.getAttribute('data-show-for-align').split(/\s+/).indexOf(alignment) === -1;
		});
		var alignSelect = field(form, 'alignment');
		var note = form.querySelector('.typost-ps-edit-justify-note');
		if (alignSelect && note && note.id) {
			var ids = (alignSelect.getAttribute('aria-describedby') || '').split(/\s+/).filter(function(id) {
				return id && id !== note.id;
			});
			if (!note.hidden) {
				ids.push(note.id);
			}
			alignSelect.setAttribute('aria-describedby', ids.join(' '));
		}
		Array.prototype.forEach.call(form.querySelectorAll('[data-show-for-size]'), function(el) {
			el.hidden = el.getAttribute('data-show-for-size').split(/\s+/).indexOf(mode) === -1;
		});
		Array.prototype.forEach.call(form.querySelectorAll('[data-show-for-case]'), function(el) {
			el.hidden = el.getAttribute('data-show-for-case').split(/\s+/).indexOf(textCase) === -1;
		});
	}

	/**
	 * Fill the Based On select (#200): None, then every style except the
	 * edited one and the styles based on it, in stored order. A parent that
	 * no longer exists is added so an untouched form keeps the link.
	 *
	 * @param {Element} form
	 * @param {Object}  style
	 * @param {Array}   styles Every style.
	 */
	function fillBasedOn(form, style, styles) {
		var select = field(form, 'basedOn');
		if (!select) {
			return;
		}
		var utils = getUtils();
		var list = Array.isArray(styles) ? styles : [];
		var excluded = {};
		if (style && style.id !== undefined) {
			excluded[parseInt(style.id, 10)] = true;
			(utils ? utils.getStyleDescendantIds(list, style.id) : []).forEach(function(id) {
				excluded[id] = true;
			});
		}
		list.forEach(function(candidate) {
			var id = candidate ? parseInt(candidate.id, 10) : 0;
			if (!id || excluded[id] || !candidate.name) {
				return;
			}
			var option = select.ownerDocument.createElement('option');
			option.value = String(id);
			option.textContent = candidate.name;
			select.appendChild(option);
		});
		var parentId = style && style.basedOn ? parseInt(style.basedOn, 10) || 0 : 0;
		selectValue(select, parentId, __('A deleted style', 'typost-paragraph-styles'));
		updateResetToBase(form, style);
	}

	/**
	 * Show Reset to Base only when it does what it says: the style has a
	 * saved parent, overrides it, and the select still names that parent.
	 * The button resets against the saved parent, so after another choice
	 * in the select it would drop that choice (#200 review).
	 *
	 * @param {Element} form
	 * @param {Object}  style The style (client shape).
	 */
	function updateResetToBase(form, style) {
		var reset = form.querySelector('.typost-ps-reset-base-btn');
		if (!reset) {
			return;
		}
		var select = field(form, 'basedOn');
		var parentId = style && style.basedOn ? parseInt(style.basedOn, 10) || 0 : 0;
		var own = style && style.ownProperties;
		var chosen = select ? parseInt(select.value, 10) || 0 : parentId;
		reset.hidden = !(parentId && own && Object.keys(own).length && chosen === parentId);
	}

	/**
	 * Fill a cloned edit form from a stored style.
	 *
	 * @param {Element} form      The form element.
	 * @param {Object}  style     {id, name, properties} — properties resolved
	 *                            for a style based on another (#200).
	 * @param {string}  fontLabel The card's text for the style's font, used
	 *                            when the font is not in the list.
	 * @param {string}  unit      resolveEditFontSizeUnit() for the style: a
	 *                            px size takes whole steps, as px CSS is
	 *                            written with whole numbers.
	 * @param {Array}   [styles]  Every style, for the Based On choices (#200).
	 */
	function fillEditForm(form, style, fontLabel, unit, styles) {
		var utils = getUtils();
		var props = (style && style.properties) || {};
		var mode = sizeModeOf(props.fontSize);

		var sizeInput = field(form, 'fontSize');
		if (sizeInput) {
			sizeInput.setAttribute('step', unit === 'px' ? '1' : 'any');
		}

		setInput(form, 'name', style && style.name);
		fillBasedOn(form, style, styles);
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

		var alignment = utils ? utils.normalizeAlignment(props.alignment) : (props.alignment || '');
		selectValue(field(form, 'alignment'), alignment);
		selectValue(field(form, 'alignLast'), utils ? utils.normalizeAlignLast(alignment, props.alignLast) : (props.alignLast || ''));
		setInput(form, 'wordSpacing', parseInt(props.wordSpacing, 10) || 0);
		selectValue(field(form, 'textWrap'), utils ? utils.normalizeTextWrap(props.textWrap) : (props.textWrap || ''));

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
			basedOn: parseInt(field(form, 'basedOn') ? field(form, 'basedOn').value : 0, 10) || 0,
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
			alignment: field(form, 'alignment') ? field(form, 'alignment').value : '',
			alignLast: field(form, 'alignLast') ? field(form, 'alignLast').value : '',
			wordSpacing: numberOf(form, 'wordSpacing'),
			textWrap: field(form, 'textWrap') ? field(form, 'textWrap').value : '',
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
	 * reads. The form reports initialHang, textCase, alignment, wordSpacing
	 * and textWrap, so its values win over the stored ones (0, Default and
	 * Normal included).
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
			fakeSmallCaps: values.fakeSmallCaps !== false,
			alignment: values.alignment || '',
			alignLast: values.alignLast || '',
			wordSpacing: Math.round(values.wordSpacing) || 0,
			textWrap: values.textWrap || ''
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
	 * Based On (#200): basedOn is sent when the select changed, and the
	 * server rebases the style (a first parent and None keep the look; a
	 * move to another parent keeps the style's own overrides). Changed
	 * properties are sent relative to the style's current parent, as
	 * overrides of it (computeStyleOverrides) or the whole look when it has
	 * none, so the rebase treats a save with edits like one without. The
	 * compare with the untouched form runs on the whole look, before the
	 * overrides are taken.
	 *
	 * @param {Object} values         readEditForm() now.
	 * @param {Object} baselineValues readEditForm() right after filling.
	 * @param {Object} style          The style (client shape).
	 * @param {string} newUnit        typostPSAdmin.newFontSizeUnit.
	 * @param {Array}  [styles]       Every style (client shape), to find the parent.
	 * @return {{name: string, basedOn?: number, properties?: Object}}
	 */
	function buildEditPayload(values, baselineValues, style, newUnit, styles) {
		var utils = getUtils();
		var base = (style && style.properties) || {};
		var unit = resolveEditFontSizeUnit(base, newUnit);
		var payload = { name: values.name };
		var properties = utils.buildPropertiesForStyleSave(stateFromEditValues(values, unit), base, true, newUnit);
		var baseline = baselineValues
			? utils.buildPropertiesForStyleSave(stateFromEditValues(baselineValues, unit), base, true, newUnit)
			: null;

		var currentParent = style && style.basedOn ? parseInt(style.basedOn, 10) || 0 : 0;
		var parentId = values.basedOn !== undefined ? (parseInt(values.basedOn, 10) || 0) : currentParent;
		if (parentId !== currentParent) {
			payload.basedOn = parentId;
		}

		if (!baseline || stableStringify(properties) !== stableStringify(baseline)) {
			// Relative to the current parent: the server applies a Based On
			// change itself (rebase_properties()), so a save with edits and a
			// save without them follow the same rule
			var parent = null;
			(Array.isArray(styles) ? styles : []).forEach(function(candidate) {
				if (currentParent && candidate && parseInt(candidate.id, 10) === currentParent) {
					parent = candidate;
				}
			});
			payload.properties = parent
				? utils.computeStyleOverrides(properties, utils.resolveStyleProperties(parent, styles))
				: properties;
		}
		return payload;
	}

	/**
	 * Whether the edit form holds a change that a save would store (#300).
	 * Reset to Base saves no overrides and closes the form, so it asks a
	 * different question when this is true. Properties are compared the way
	 * buildEditPayload() compares them (built, against the untouched form),
	 * so a change typed and then undone counts as none; the name counts too,
	 * because the reset drops a typed name with the form.
	 *
	 * @param {Object}  values         readEditForm() now.
	 * @param {?Object} baselineValues readEditForm() when the form opened;
	 *                                 none counts as a change.
	 * @param {Object}  style          The style (client shape).
	 * @param {string}  newUnit        Site setting for new content.
	 * @param {Array}   [styles]       All styles (client shape).
	 * @return {boolean}
	 */
	function hasUnsavedEditChanges(values, baselineValues, style, newUnit, styles) {
		if (!baselineValues) {
			return true;
		}
		var payload = buildEditPayload(values, baselineValues, style, newUnit, styles);
		return payload.properties !== undefined
			|| payload.basedOn !== undefined
			|| values.name !== baselineValues.name;
	}

	/**
	 * Swap the cards that an admin-card response renders: the saved
	 * style's and those of the styles based on it (#200).
	 *
	 * @param {Element} list #typost-ps-styles-list
	 * @param {Object}  data admin-card response.
	 * @param {number|string} styleId The saved style.
	 */
	function replaceRelatedCards(list, data, styleId) {
		if (!list || !data) {
			return;
		}
		var cardFor = function(id) {
			var cards = list.querySelectorAll('.typost-ps-style-card');
			for (var i = 0; i < cards.length; i++) {
				if (String(cards[i].getAttribute('data-style-id')) === String(id)) {
					return cards[i];
				}
			}
			return null;
		};
		replaceCardParts(cardFor(styleId), data);
		(Array.isArray(data.related) ? data.related : []).forEach(function(related) {
			replaceCardParts(cardFor(related.id), related);
		});
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
		setCardButtonNames: setCardButtonNames,
		suffixIds: suffixIds,
		sizeModeOf: sizeModeOf,
		updateConditionalFields: updateConditionalFields,
		fillEditForm: fillEditForm,
		updateResetToBase: updateResetToBase,
		readEditForm: readEditForm,
		validateEditValues: validateEditValues,
		stateFromEditValues: stateFromEditValues,
		buildEditPayload: buildEditPayload,
		hasUnsavedEditChanges: hasUnsavedEditChanges,
		resolveEditFontSizeUnit: resolveEditFontSizeUnit,
		withUserLocale: withUserLocale,
		showFormError: showFormError,
		clearFormError: clearFormError,
		replaceCardParts: replaceCardParts,
		replaceRelatedCards: replaceRelatedCards,
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

	// Every style in the client shape, from the admin-card response: the
	// styles based on a saved one have new resolved values (#200)
	function storeAllStyles(list) {
		if (Array.isArray(list)) {
			styles.splice.apply(styles, [0, styles.length].concat(list));
		}
	}

	function removeStyle(styleId) {
		for (var i = styles.length - 1; i >= 0; i--) {
			if (String(styles[i].id) === String(styleId)) {
				styles.splice(i, 1);
			}
		}
	}

	/**
	 * Render a style's card and the cards of the styles based on it again
	 * from the admin-card route, with the regenerated CSS; then call done.
	 * A failed refresh after a successful write reloads the page, so a card
	 * is never stale.
	 */
	function refreshCards(styleId, done) {
		$.ajax({
			url: withUserLocale(restUrl + '/' + encodeURIComponent(styleId) + '/admin-card'),
			dataType: 'json',
			method: 'GET',
			beforeSend: function(xhr) {
				xhr.setRequestHeader('X-WP-Nonce', nonce);
			},
			success: function(card) {
				applyCardResponse(styleId, card);
				done();
			},
			error: function() {
				window.location.reload();
			}
		});
	}

	function hasDescendants(styleId) {
		var utils = getUtils();
		return !!utils && utils.getStyleDescendantIds(styles, styleId).length > 0;
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
	 * and preview, and the regenerated preview CSS. Based On (#200): also
	 * every style in the client shape (the styles based on this one have
	 * new resolved values) and the cards of the styles based on it.
	 *
	 * @param {number|string} styleId
	 * @param {Object}        card    admin-card response.
	 */
	function applyCardResponse(styleId, card) {
		if (card && Array.isArray(card.styles)) {
			storeAllStyles(card.styles);
		} else if (card && card.style) {
			storeStyle(card.style);
		}
		var list = document.getElementById('typost-ps-styles-list');
		replaceRelatedCards(list, card, styleId);
		replaceStyleCss(document, card && card.css);
		if (window.typostAdminFonts && list) {
			window.typostAdminFonts.scan(list);
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
		fillEditForm(form, style, details ? details.getAttribute('data-font-label') : '', unit, styles);
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
			dataType: 'json',
			method: 'GET',
			beforeSend: function(xhr) {
				xhr.setRequestHeader('X-WP-Nonce', nonce);
			},
			success: function(card) {
				applyCardResponse(styleId, card);
			},
			complete: function() {
				$card.removeClass('typost-ps-loading');
				$button.removeAttr('aria-busy');
				openEditForm($card, styleId);
			}
		});
	});

	$(document).on('change', '.typost-ps-edit-form [data-field="sizeMode"], .typost-ps-edit-form [data-field="textCase"], .typost-ps-edit-form [data-field="alignment"]', function() {
		updateConditionalFields($(this).closest('form')[0]);
	});

	$(document).on('change', '.typost-ps-edit-form [data-field="basedOn"]', function() {
		updateResetToBase($(this).closest('form')[0], findStyle($(this).closest('.typost-ps-style-card').data('style-id')));
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

		var payload = buildEditPayload(values, $(form).data('baseline'), style, newUnit, styles);
		var renamed = !!style && payload.name !== style.name;

		$card.addClass('typost-ps-saving');
		$save.prop('disabled', true);

		function done() {
			$card.removeClass('typost-ps-saving');
			$save.prop('disabled', false);
		}

		$.ajax({
			url: withUserLocale(restUrl + '/' + encodeURIComponent(styleId)),
			dataType: 'json',
			method: 'PATCH',
			beforeSend: function(xhr) {
				xhr.setRequestHeader('X-WP-Nonce', nonce);
			},
			contentType: 'application/json',
			data: JSON.stringify(payload),
			success: function(response) {
				storeStyle(response);
				$card.find('.typost-ps-style-name').text(response.name);
				setCardButtonNames($card[0], response.name);
				var message;
				if (payload.basedOn) {
					/* translators: %s: style name */
					message = wp.i18n.sprintf(wp.i18n.__('Style “%s” saved. It now inherits from the style it is based on.', 'typost-paragraph-styles'), response.name);
				} else if (payload.basedOn === 0) {
					/* translators: %s: style name */
					message = wp.i18n.sprintf(wp.i18n.__('Style “%s” saved. It is no longer based on another style.', 'typost-paragraph-styles'), response.name);
				} else if (payload.properties || !renamed) {
					/* translators: %s: style name */
					message = wp.i18n.sprintf(wp.i18n.__('Style “%s” saved.', 'typost-paragraph-styles'), response.name);
				} else {
					/* translators: %s: style name */
					message = wp.i18n.sprintf(wp.i18n.__('Style renamed to “%s”.', 'typost-paragraph-styles'), response.name);
				}

				// A rename alone changes no card but the styles based on this
				// one, whose details name it (#200)
				if (!payload.properties && payload.basedOn === undefined && !hasDescendants(styleId)) {
					done();
					closeEditForm($card);
					announce(message);
					return;
				}

				// The cards' details and previews, rendered by the same PHP
				// as the page, and the regenerated CSS for the previews
				refreshCards(styleId, function() {
					done();
					closeEditForm($card);
					announce(message);
				});
			},
			error: function(xhr) {
				done();
				var serverMessage = xhr && xhr.responseJSON && xhr.responseJSON.message;
				var serverField = xhr && xhr.responseJSON && xhr.responseJSON.field;
				// A 400 names its field (Based on, #200) or is about the name
				// (empty after sanitizing); a 404, a 429 or a lost connection
				// is not any field's fault
				showFormError(form, {
					field: xhr && xhr.status === 400 ? (serverField === 'basedOn' ? 'basedOn' : 'name') : null,
					message: serverMessage || wp.i18n.__('Failed to update style. Please try again.', 'typost-paragraph-styles')
				});
			}
		});
	});

	// -------------------------------------------------------------------------
	// Reset to Base (#200)
	// -------------------------------------------------------------------------

	$(document).on('click', '.typost-ps-reset-base-btn', function() {
		var form    = $(this).closest('form')[0];
		var $card   = $(form).closest('.typost-ps-style-card');
		var styleId = $card.data('style-id');
		var name    = $card.find('.typost-ps-style-name').text();
		var $button = $(this);

		// Cancel keeps the form open with its changes (#300). An if, not a
		// ternary: make-pot reads a translators comment only right above
		// the call.
		var question;
		if (hasUnsavedEditChanges(readEditForm(form), $(form).data('baseline'), findStyle(styleId), newUnit, styles)) {
			/* translators: %s: style name */
			question = wp.i18n.__('The changes in this form are not saved, and Reset to Base discards them. Remove every setting “%s” sets itself, so it uses all values of the style it is based on?', 'typost-paragraph-styles');
		} else {
			/* translators: %s: style name */
			question = wp.i18n.__('Remove every setting “%s” sets itself, so it uses all values of the style it is based on?', 'typost-paragraph-styles');
		}
		if (!confirm(wp.i18n.sprintf(question, name))) {
			return;
		}

		$card.addClass('typost-ps-saving');
		$button.prop('disabled', true);

		$.ajax({
			url: withUserLocale(restUrl + '/' + encodeURIComponent(styleId)),
			dataType: 'json',
			method: 'PATCH',
			beforeSend: function(xhr) {
				xhr.setRequestHeader('X-WP-Nonce', nonce);
			},
			contentType: 'application/json',
			data: JSON.stringify({ properties: {} }),
			success: function(response) {
				storeStyle(response);
				refreshCards(styleId, function() {
					$card.removeClass('typost-ps-saving');
					closeEditForm($card);
					/* translators: %s: style name */
					announce(wp.i18n.sprintf(wp.i18n.__('Style “%s” reset to the style it is based on.', 'typost-paragraph-styles'), name));
				});
			},
			error: function(xhr) {
				$card.removeClass('typost-ps-saving');
				$button.prop('disabled', false);
				var serverMessage = xhr && xhr.responseJSON && xhr.responseJSON.message;
				showFormError(form, {
					field: '',
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
			url: withUserLocale(restUrl + '/' + encodeURIComponent(styleId)),
			dataType: 'json',
			method: 'DELETE',
			beforeSend: function(xhr) {
				xhr.setRequestHeader('X-WP-Nonce', nonce);
			},
			success: function(response) {
				var list   = document.getElementById('typost-ps-styles-list');
				var target = focusTargetAfterDelete($card[0], list);
				removeStyle(styleId);
				// The styles based on the deleted one took its values and lost
				// the link (#200): their cards drop "Based on" and the labels
				var detached = response && Array.isArray(response.detached) ? response.detached : [];
				detached.forEach(function(childId) {
					refreshCards(childId, function() {});
				});
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

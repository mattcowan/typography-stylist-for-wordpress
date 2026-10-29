/**
 * Export & Import tab (#205)
 *
 * Hand-written ES5 with no build step. The pure helpers at the top are
 * exported for Jest; the DOM part runs on the settings page only, where
 * typostExportData (REST URL, nonce) and typostExportL10n (strings) are
 * localized. Every string reaches the page through textContent, never as
 * markup: typostExportL10n is a flat object, so WordPress decodes its
 * entities, and server messages go through typostDecodeEntities() first.
 */
(function () {
	'use strict';

	// ---------------------------------------------------------------------
	// Pure helpers
	// ---------------------------------------------------------------------

	/**
	 * Fill a translated template: %1$s / %2$s by position, and each %s
	 * and %d in order. One pass, so a value that holds "%s" (a style name
	 * from the file) is never filled in again.
	 *
	 * @param {string} template
	 * @param {Array}  args
	 * @return {string}
	 */
	function formatString(template, args) {
		var next = 0;
		args = args || [];
		return String(template).replace(/%(?:(\d+)\$)?[sd]/g, function (match, n) {
			var value = n ? args[parseInt(n, 10) - 1] : args[next++];
			return value === undefined ? match : String(value);
		});
	}

	/**
	 * The items an export adds because a chosen item needs them (a style's
	 * Based On chain). Mirrors the server, which adds the same parents.
	 *
	 * @param {Array}  items     [{id, name, parent}]
	 * @param {Array}  chosenIds Chosen item ids.
	 * @return {Array} [{name, because}] in the order they are found.
	 */
	function addedParents(items, chosenIds) {
		var byId = {};
		var chosen = {};
		var added = {};
		var out = [];
		(items || []).forEach(function (item) {
			byId[item.id] = item;
		});
		(chosenIds || []).forEach(function (id) {
			chosen[id] = true;
		});
		(chosenIds || []).forEach(function (id) {
			var current = byId[id];
			var seen = {};
			seen[id] = true;
			while (current && current.parent && byId[current.parent] && !seen[current.parent]) {
				var parent = byId[current.parent];
				seen[parent.id] = true;
				if (!chosen[parent.id] && !added[parent.id]) {
					added[parent.id] = true;
					out.push({ name: parent.name, because: current.name });
				}
				current = parent;
			}
		});
		return out;
	}

	/**
	 * The select value for a font choice from the preview.
	 *
	 * @param {Object} choice {action, target}
	 * @return {string}
	 */
	function fontChoiceValue(choice) {
		if (!choice) {
			return '';
		}
		if (choice.action === 'map') {
			return choice.target ? 'map:' + choice.target : '';
		}
		return choice.action === 'add' ? 'add' : 'none';
	}

	/**
	 * The font choice a select value stands for, null for "choose".
	 *
	 * @param {string} value
	 * @return {Object|null}
	 */
	function fontChoiceFromValue(value) {
		if (value === 'add' || value === 'none') {
			return { action: value };
		}
		if (typeof value === 'string' && value.indexOf('map:') === 0 && value.length > 4) {
			return { action: 'map', target: value.slice(4) };
		}
		return null;
	}

	/**
	 * The options of a font's select: the matching fonts first, then "add"
	 * when the file can add the font, "none", and every other font on this
	 * site, so the author can correct a match.
	 *
	 * @param {Object} row       Preview font row.
	 * @param {Array}  siteFonts [{value, label}]
	 * @param {Object} l10n      Strings.
	 * @return {Array} Options {value, label} and groups {group, options}.
	 */
	function fontSelectOptions(row, siteFonts, l10n) {
		var out = [];
		var listed = {};
		if (row.status === 'ambiguous') {
			out.push({ value: '', label: l10n.chooseFont });
		}
		if (row.candidates && row.candidates.length) {
			out.push({
				group: l10n.groupMatches,
				options: row.candidates.map(function (candidate) {
					listed[candidate.value] = true;
					return { value: 'map:' + candidate.value, label: candidate.label };
				}),
			});
		}
		if (row.status === 'addable') {
			out.push({ value: 'add', label: l10n.addFont });
		}
		out.push({ value: 'none', label: l10n.noFont });
		var others = (siteFonts || []).filter(function (font) {
			return !listed[font.value];
		});
		if (others.length) {
			out.push({
				group: l10n.groupAllFonts,
				options: others.map(function (font) {
					return { value: 'map:' + font.value, label: font.label };
				}),
			});
		}
		return out;
	}

	/**
	 * The actions a style's select offers.
	 *
	 * @param {Object} item Preview style row.
	 * @return {string[]}
	 */
	function styleActions(item) {
		if (item.exists) {
			return ['skip', 'rename', 'overwrite'];
		}
		if (item.action === 'rename') {
			return ['rename', 'skip'];
		}
		return ['add', 'skip'];
	}

	/**
	 * Lowercased, trimmed name for comparisons.
	 *
	 * @param {string} name
	 * @return {string}
	 */
	function nameKey(name) {
		return String(name || '').trim().toLowerCase();
	}

	/**
	 * Whether a font is used only by sections the author left out. Such a
	 * font is not imported, so it needs no choice. A font no section uses
	 * (one "All fonts" carried) still imports as chosen.
	 *
	 * @param {Object} row   Preview font row.
	 * @param {Object} state See collectErrors().
	 * @return {boolean}
	 */
	function fontLeftOut(row, state) {
		var ids = row.sections || [];
		return ids.length > 0 && ids.every(function (id) {
			return state.include[id] === false;
		});
	}

	/**
	 * The id of a generic row's select. Option names and font keys are
	 * safe already; anything else is reduced to id characters.
	 *
	 * @param {string} sectionId
	 * @param {string} rowKey
	 * @return {string}
	 */
	function rowFieldId(sectionId, rowKey) {
		return ('typost-import-row-' + sectionId + '-' + rowKey).replace(/[^A-Za-z0-9_-]/g, '_');
	}

	/**
	 * The sections whose preview uses the generic row form.
	 *
	 * @param {Object} preview The preview response.
	 * @return {string[]}
	 */
	function rowSectionIds(preview) {
		return Object.keys(preview.sections || {}).filter(function (id) {
			var p = preview.sections[id].preview;
			return !!(p && Array.isArray(p.rows));
		});
	}

	/**
	 * Problems to fix before importing. The server checks again; this only
	 * catches what the preview already knows.
	 *
	 * @param {Object} preview The preview response.
	 * @param {Object} state   {fonts: {key: value}, styles: {key: {action, name}},
	 *                         rows: {sectionId: {rowKey: value}}, include: {id: bool}}
	 * @param {Object} l10n    Strings.
	 * @return {Array} [{message, kind: 'font'|'style'|'row', key, field}]
	 */
	function collectErrors(preview, state, l10n) {
		var errors = [];
		(preview.fonts || []).forEach(function (row) {
			if (!fontLeftOut(row, state) && !fontChoiceFromValue(state.fonts[row.key])) {
				errors.push({ message: formatString(l10n.errorChooseFont, [row.name]), kind: 'font', key: row.key, field: 'typost-import-font-' + row.key });
			}
		});
		// A row with no pre-set choice (an option that differs here) must be
		// answered.
		rowSectionIds(preview).forEach(function (id) {
			if (state.include[id] === false) {
				return;
			}
			var answers = (state.rows && state.rows[id]) || {};
			preview.sections[id].preview.rows.forEach(function (row) {
				if (!answers[row.key]) {
					errors.push({ message: formatString(l10n.errorChooseRow, [row.name]), kind: 'row', key: row.key, field: rowFieldId(id, row.key) });
				}
			});
		});

		var section = preview.sections && preview.sections.paragraphStyles;
		if (section && state.include.paragraphStyles !== false) {
			var items = section.preview.items || [];
			var taken = {};
			items.forEach(function (item) {
				if (item.exists) {
					taken[nameKey(item.existingName)] = true;
				}
			});
			items.forEach(function (item) {
				var choice = state.styles[item.key] || {};
				if (choice.action === 'add') {
					taken[nameKey(item.name)] = true;
				}
			});
			items.forEach(function (item) {
				var choice = state.styles[item.key] || {};
				if (choice.action !== 'rename') {
					return;
				}
				var name = String(choice.name || '').trim();
				if (!name) {
					errors.push({ message: formatString(l10n.errorRenameEmpty, [item.name]), kind: 'style', key: item.key, field: 'typost-import-rename-' + item.key });
				} else if (taken[nameKey(name)]) {
					errors.push({ message: formatString(l10n.errorRenameTaken, [item.name, name]), kind: 'style', key: item.key, field: 'typost-import-rename-' + item.key });
				} else {
					taken[nameKey(name)] = true;
				}
			});
		}
		return errors;
	}

	/**
	 * The import request's choices.
	 *
	 * @param {Object} preview The preview response.
	 * @param {Object} state   See collectErrors().
	 * @return {Object} {fonts, sections, include}
	 */
	function buildImportChoices(preview, state) {
		var fonts = {};
		(preview.fonts || []).forEach(function (row) {
			var choice = fontLeftOut(row, state) ? null : fontChoiceFromValue(state.fonts[row.key]);
			if (choice) {
				fonts[row.key] = choice;
			}
		});
		var include = [];
		var sections = {};
		Object.keys(preview.sections || {}).forEach(function (id) {
			if (state.include[id] !== false) {
				include.push(id);
			}
		});
		if (preview.sections && preview.sections.paragraphStyles) {
			var styles = {};
			(preview.sections.paragraphStyles.preview.items || []).forEach(function (item) {
				var choice = state.styles[item.key];
				if (!choice) {
					return;
				}
				styles[item.key] = choice.action === 'rename'
					? { action: 'rename', name: String(choice.name || '').trim() }
					: { action: choice.action };
			});
			sections.paragraphStyles = styles;
		}
		rowSectionIds(preview).forEach(function (id) {
			var answers = (state.rows && state.rows[id]) || {};
			var out = {};
			preview.sections[id].preview.rows.forEach(function (row) {
				if (answers[row.key]) {
					out[row.key] = answers[row.key];
				}
			});
			sections[id] = out;
		});
		return { fonts: fonts, sections: sections, include: include };
	}

	/**
	 * The result as headed lists, leaving out empty ones.
	 *
	 * @param {Object} result The import response.
	 * @param {Object} l10n   Strings.
	 * @return {Array} [{heading, items: string[]}]
	 */
	function resultGroups(result, l10n) {
		var groups = [];
		var push = function (heading, items) {
			if (items && items.length) {
				groups.push({ heading: heading, items: items });
			}
		};
		var sections = result.sections || {};
		Object.keys(sections).forEach(function (id) {
			var r = sections[id] || {};
			push(l10n.resultAdded, r.added);
			push(l10n.resultRenamed, (r.renamed || []).map(function (pair) {
				return formatString(l10n.resultRenamedItem, [pair.from, pair.to]);
			}));
			push(l10n.resultOverwritten, r.overwritten);
			push(l10n.resultSkipped, r.skipped);
			// Sections in the generic form name their own groups.
			(r.groups || []).forEach(function (group) {
				push(String(group.heading || ''), group.items);
			});
		});
		if (result.fonts) {
			push(l10n.resultFontsAdded, result.fonts.added);
			push(l10n.resultFontsMissing, result.fonts.notFound);
		}
		push(l10n.resultNotImported, result.notImported);
		var warnings = [];
		Object.keys(sections).forEach(function (id) {
			warnings = warnings.concat((sections[id] || {}).warnings || []);
		});
		push(l10n.resultWarnings, warnings);
		return groups;
	}

	/**
	 * The message of a failed REST request.
	 *
	 * @param {Object} xhr  jqXHR.
	 * @param {string} fallback
	 * @return {string}
	 */
	function errorMessage(xhr, fallback) {
		var message = xhr && xhr.responseJSON && xhr.responseJSON.message;
		if (typeof message !== 'string' || !message) {
			return fallback;
		}
		return typeof typostDecodeEntities === 'function' ? typostDecodeEntities(message) : message;
	}

	/**
	 * The settings page URL with this tab open.
	 *
	 * @param {string} href Current URL.
	 * @return {string}
	 */
	function exportTabUrl(href) {
		var url = new URL(href);
		url.searchParams.set('tab', 'export');
		url.hash = '';
		return url.toString();
	}

	var helpers = {
		formatString: formatString,
		addedParents: addedParents,
		fontChoiceValue: fontChoiceValue,
		fontChoiceFromValue: fontChoiceFromValue,
		fontSelectOptions: fontSelectOptions,
		styleActions: styleActions,
		fontLeftOut: fontLeftOut,
		rowFieldId: rowFieldId,
		rowSectionIds: rowSectionIds,
		collectErrors: collectErrors,
		buildImportChoices: buildImportChoices,
		resultGroups: resultGroups,
		errorMessage: errorMessage,
		exportTabUrl: exportTabUrl,
	};

	if (typeof module !== 'undefined' && module.exports) {
		module.exports = helpers;
	}
	if (typeof window === 'undefined' || typeof document === 'undefined' || typeof window.typostExportData === 'undefined') {
		return;
	}
	window.typostExportUtils = helpers;

	// ---------------------------------------------------------------------
	// DOM
	// ---------------------------------------------------------------------

	var $ = window.jQuery;
	var data = window.typostExportData;
	var l10n = window.typostExportL10n || {};

	function el(tag, attrs, text) {
		var node = document.createElement(tag);
		Object.keys(attrs || {}).forEach(function (name) {
			if (attrs[name] === false || attrs[name] === null || attrs[name] === undefined) {
				return;
			}
			node.setAttribute(name, attrs[name] === true ? '' : attrs[name]);
		});
		if (text !== undefined && text !== null) {
			node.textContent = text;
		}
		return node;
	}

	function request(path, body) {
		return $.ajax({
			url: typostWithUserLocale(data.restUrl + path),
			method: 'POST',
			contentType: 'application/json',
			dataType: 'json',
			data: JSON.stringify(body),
			beforeSend: function (xhr) {
				xhr.setRequestHeader('X-WP-Nonce', data.nonce);
			},
		});
	}

	function showError(box, message) {
		box.textContent = '';
		if (message) {
			box.appendChild(el('p', {}, message));
		}
	}

	function announce(message) {
		var region = document.getElementById('typost-live-region');
		if (!region) {
			return;
		}
		region.textContent = '';
		setTimeout(function () {
			region.textContent = message;
		}, 100);
	}

	// --- Export ----------------------------------------------------------

	function sectionItems(sectionNode) {
		return Array.prototype.map.call(sectionNode.querySelectorAll('.typost-export-item'), function (box) {
			return {
				id: parseInt(box.value, 10),
				name: box.getAttribute('data-name'),
				parent: parseInt(box.getAttribute('data-parent'), 10) || 0,
				checked: box.checked,
			};
		});
	}

	function sectionScope(sectionNode) {
		var some = sectionNode.querySelector('.typost-export-scope input[value="some"]');
		return some && some.checked ? 'some' : 'all';
	}

	function updateExportNotes(form) {
		var notes = document.getElementById('typost-export-notes');
		var lines = [];
		Array.prototype.forEach.call(form.querySelectorAll('.typost-export-section'), function (sectionNode) {
			var list = sectionNode.querySelector('.typost-export-item-list');
			var toggle = sectionNode.querySelector('.typost-export-section-toggle');
			var some = sectionScope(sectionNode) === 'some';
			if (list) {
				list.hidden = !some;
			}
			if (!some || !toggle.checked) {
				return;
			}
			var items = sectionItems(sectionNode);
			var chosen = items.filter(function (item) {
				return item.checked;
			}).map(function (item) {
				return item.id;
			});
			addedParents(items, chosen).forEach(function (added) {
				lines.push(formatString(l10n.parentAdded, [added.name, added.because]));
			});
		});
		notes.textContent = '';
		if (lines.length) {
			var ul = el('ul');
			lines.forEach(function (line) {
				ul.appendChild(el('li', {}, line));
			});
			notes.appendChild(ul);
		}
	}

	function download(file, filename) {
		var blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
		var url = URL.createObjectURL(blob);
		var link = el('a', { href: url, download: filename });
		link.hidden = true;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		setTimeout(function () {
			URL.revokeObjectURL(url);
		}, 1000);
	}

	function initExport() {
		var form = document.getElementById('typost-export-form');
		if (!form) {
			return;
		}
		var errorBox = document.getElementById('typost-export-error');
		var submit = document.getElementById('typost-export-submit');

		form.addEventListener('change', function () {
			updateExportNotes(form);
		});

		form.addEventListener('submit', function (event) {
			event.preventDefault();
			showError(errorBox, '');
			var sections = [];
			var sectionArgs = {};
			var problem = '';
			Array.prototype.forEach.call(form.querySelectorAll('.typost-export-section'), function (sectionNode) {
				var toggle = sectionNode.querySelector('.typost-export-section-toggle');
				if (!toggle.checked) {
					return;
				}
				var id = sectionNode.getAttribute('data-section');
				sections.push(id);
				if (sectionScope(sectionNode) === 'some') {
					var chosen = sectionItems(sectionNode).filter(function (item) {
						return item.checked;
					}).map(function (item) {
						return item.id;
					});
					if (!chosen.length) {
						problem = l10n.noItemsChosen;
					}
					sectionArgs[id] = { items: chosen };
				}
			});
			var allFonts = document.getElementById('typost-export-all-fonts');
			allFonts = !!(allFonts && allFonts.checked);
			if (!sections.length && !allFonts) {
				problem = l10n.nothingChosen;
			}
			if (problem) {
				showError(errorBox, problem);
				return;
			}
			if (!typostBeginBusy(submit, l10n.exporting)) {
				return;
			}
			request('export', { sections: sections, allFonts: allFonts, sectionArgs: sectionArgs })
				.done(function (response) {
					download(response.file, response.filename);
					announce(l10n.exported);
				})
				.fail(function (xhr) {
					showError(errorBox, errorMessage(xhr, l10n.requestFailed));
				})
				.always(function () {
					typostEndBusy(submit);
				});
		});
		updateExportNotes(form);
	}

	// --- Import: preview -------------------------------------------------

	var importState = null;

	function fontStatusText(row) {
		switch (row.status) {
			case 'found':
				return l10n.statusFound;
			case 'ambiguous':
				return l10n.statusAmbiguous;
			case 'addable':
				return l10n.statusAddable;
			default:
				return l10n.statusNotFound;
		}
	}

	function buildSelect(id, options, value, label) {
		var select = el('select', { id: id, 'aria-label': label });
		options.forEach(function (option) {
			if (option.group) {
				var group = el('optgroup', { label: option.group });
				option.options.forEach(function (inner) {
					group.appendChild(el('option', { value: inner.value }, inner.label));
				});
				select.appendChild(group);
			} else {
				select.appendChild(el('option', { value: option.value }, option.label));
			}
		});
		select.value = value;
		return select;
	}

	function renderFonts(container, preview) {
		if (!preview.fonts.length) {
			return;
		}
		container.appendChild(el('h4', { id: 'typost-import-fonts-heading' }, l10n.fontsHeading));
		container.appendChild(el('p', {}, l10n.fontsIntro));
		var table = el('table', { class: 'widefat striped typost-import-table', 'aria-labelledby': 'typost-import-fonts-heading' });
		var head = el('tr');
		[l10n.colFont, l10n.colUsedBy, l10n.colOnSite].forEach(function (text) {
			head.appendChild(el('th', { scope: 'col' }, text));
		});
		table.appendChild(el('thead')).appendChild(head);
		var body = table.appendChild(el('tbody'));
		preview.fonts.forEach(function (row) {
			var tr = body.appendChild(el('tr'));
			tr.appendChild(el('th', { scope: 'row' }, row.name));
			tr.appendChild(el('td', {}, row.usedBy.length ? row.usedBy.join(', ') : l10n.notUsed));
			var cell = tr.appendChild(el('td'));
			var statusId = 'typost-import-font-status-' + row.key;
			cell.appendChild(el('p', { id: statusId, class: 'typost-import-status is-' + row.status }, fontStatusText(row)));
			var select = buildSelect(
				'typost-import-font-' + row.key,
				fontSelectOptions(row, preview.siteFonts, l10n),
				fontChoiceValue(row.choice),
				formatString(l10n.fontSelectLabel, [row.name])
			);
			select.setAttribute('aria-describedby', statusId);
			select.setAttribute('data-font-key', row.key);
			cell.appendChild(select);
		});
		container.appendChild(table);
	}

	function actionLabel(action) {
		return {
			add: l10n.actionAdd,
			skip: l10n.actionSkip,
			rename: l10n.actionRename,
			overwrite: l10n.actionOverwrite,
		}[action];
	}

	function renderStyles(container, id, section) {
		var headingId = 'typost-import-section-' + id;
		container.appendChild(el('h4', { id: headingId }, section.label));
		var includeId = 'typost-import-include-' + id;
		var includeRow = container.appendChild(el('p'));
		var include = includeRow.appendChild(el('input', { type: 'checkbox', id: includeId, 'data-section': id, class: 'typost-import-include' }));
		include.checked = true;
		includeRow.appendChild(el('label', { for: includeId }, l10n.includeSection));

		((section.preview && section.preview.notes) || []).forEach(function (note) {
			container.appendChild(el('p', { class: 'typost-import-section-note' }, String(note)));
		});
		if (section.preview && Array.isArray(section.preview.rows)) {
			if (!section.preview.rows.length && !(section.preview.notes || []).length) {
				container.appendChild(el('p', { class: 'typost-import-section-note' }, l10n.sectionEmpty));
			}
			renderRows(container, id, section.preview.rows, headingId);
			return;
		}

		var items = (section.preview && section.preview.items) || [];
		if (id !== 'paragraphStyles') {
			// A section an extension added: list what it holds.
			var list = el('ul');
			items.forEach(function (item) {
				list.appendChild(el('li', {}, String(item.name || item.key || '')));
			});
			container.appendChild(list);
			return;
		}

		var table = el('table', { class: 'widefat striped typost-import-table', 'aria-labelledby': headingId });
		var head = el('tr');
		[l10n.colName, l10n.colBasedOn, l10n.colAction].forEach(function (text) {
			head.appendChild(el('th', { scope: 'col' }, text));
		});
		table.appendChild(el('thead')).appendChild(head);
		var body = table.appendChild(el('tbody'));
		items.forEach(function (item) {
			var tr = body.appendChild(el('tr'));
			var nameCell = tr.appendChild(el('th', { scope: 'row' }, item.name));
			var noteId = 'typost-import-style-note-' + item.key;
			var notes = [];
			if (item.exists) {
				notes.push(l10n.existsAs);
				if (item.affected && item.affected.length) {
					notes.push(formatString(l10n.overwriteAffects, [item.affected.join(', ')]));
				}
			}
			if (notes.length) {
				nameCell.appendChild(el('span', { id: noteId, class: 'typost-import-note' }, notes.join(' ')));
			}
			tr.appendChild(el('td', {}, item.basedOn || '—'));
			var cell = tr.appendChild(el('td'));
			var options = styleActions(item).map(function (action) {
				return { value: action, label: actionLabel(action) };
			});
			var select = buildSelect('typost-import-style-' + item.key, options, item.action, formatString(l10n.actionLabel, [item.name]));
			select.setAttribute('data-style-key', item.key);
			if (notes.length) {
				select.setAttribute('aria-describedby', noteId);
			}
			cell.appendChild(select);
			var renameId = 'typost-import-rename-' + item.key;
			var rename = el('input', { type: 'text', id: renameId, class: 'typost-import-rename', 'aria-label': formatString(l10n.renameLabel, [item.name]) });
			rename.value = item.suggestedName || item.name;
			rename.hidden = item.action !== 'rename';
			cell.appendChild(rename);
			select.addEventListener('change', function () {
				rename.hidden = select.value !== 'rename';
			});
		});
		container.appendChild(table);
	}

	/**
	 * A section in the generic row form: each row offers the choices the
	 * server sent. A row with no pre-set choice starts on "Choose…".
	 */
	function renderRows(container, id, rows, headingId) {
		if (!rows.length) {
			return;
		}
		var compare = rows.some(function (row) {
			return row.current !== undefined || row.incoming !== undefined;
		});
		var table = el('table', { class: 'widefat striped typost-import-table', 'aria-labelledby': headingId });
		var head = el('tr');
		var columns = compare ? [l10n.colName, l10n.colOnSite, l10n.colInFile, l10n.colAction] : [l10n.colName, l10n.colAction];
		columns.forEach(function (text) {
			head.appendChild(el('th', { scope: 'col' }, text));
		});
		table.appendChild(el('thead')).appendChild(head);
		var body = table.appendChild(el('tbody'));
		rows.forEach(function (row) {
			var tr = body.appendChild(el('tr'));
			var nameCell = tr.appendChild(el('th', { scope: 'row' }, String(row.name)));
			var fieldId = rowFieldId(id, row.key);
			var described = [];
			if (row.detail) {
				var detailId = fieldId + '-detail';
				nameCell.appendChild(el('span', { id: detailId, class: 'typost-import-detail' }, String(row.detail)));
				described.push(detailId);
			}
			if (row.note) {
				var noteId = fieldId + '-note';
				nameCell.appendChild(el('span', { id: noteId, class: 'typost-import-note' }, String(row.note)));
				described.push(noteId);
			}
			if (compare) {
				tr.appendChild(el('td', {}, row.current !== undefined ? String(row.current) : '—'));
				tr.appendChild(el('td', {}, row.incoming !== undefined ? String(row.incoming) : '—'));
			}
			var options = (row.choices || []).map(function (choice) {
				return { value: String(choice.value), label: String(choice.label) };
			});
			if (!row.choice) {
				options.unshift({ value: '', label: l10n.chooseAction });
			}
			var select = buildSelect(fieldId, options, row.choice || '', formatString(l10n.rowSelectLabel, [row.name]));
			select.setAttribute('data-row-section', id);
			select.setAttribute('data-row-key', row.key);
			if (described.length) {
				select.setAttribute('aria-describedby', described.join(' '));
			}
			tr.appendChild(el('td')).appendChild(select);
		});
		container.appendChild(table);
	}

	function readState(container, preview) {
		var state = { fonts: {}, styles: {}, rows: {}, include: {} };
		Array.prototype.forEach.call(container.querySelectorAll('select[data-row-key]'), function (select) {
			var id = select.getAttribute('data-row-section');
			state.rows[id] = state.rows[id] || {};
			state.rows[id][select.getAttribute('data-row-key')] = select.value;
		});
		Array.prototype.forEach.call(container.querySelectorAll('select[data-font-key]'), function (select) {
			state.fonts[select.getAttribute('data-font-key')] = select.value;
		});
		Array.prototype.forEach.call(container.querySelectorAll('select[data-style-key]'), function (select) {
			var key = select.getAttribute('data-style-key');
			var rename = document.getElementById('typost-import-rename-' + key);
			state.styles[key] = { action: select.value, name: rename ? rename.value : '' };
		});
		Array.prototype.forEach.call(container.querySelectorAll('.typost-import-include'), function (box) {
			state.include[box.getAttribute('data-section')] = box.checked;
		});
		return state;
	}

	function renderPreview(preview, fileText) {
		var container = document.getElementById('typost-import-preview');
		var result = document.getElementById('typost-import-result');
		result.hidden = true;
		result.textContent = '';
		container.textContent = '';
		importState = { preview: preview, fileText: fileText };

		var heading = container.appendChild(el('h3', { tabindex: '-1' }, l10n.previewHeading));
		container.appendChild(el('p', {}, formatString(l10n.fileInfo, [preview.exported || '—', preview.plugin || '—'])));
		if (preview.unknownSections && preview.unknownSections.length) {
			var notice = container.appendChild(el('div', { class: 'notice notice-warning inline' }));
			notice.appendChild(el('p', {}, formatString(l10n.unknownSections, [preview.unknownSections.join(', ')])));
		}

		renderFonts(container, preview);
		Object.keys(preview.sections || {}).forEach(function (id) {
			renderStyles(container, id, preview.sections[id]);
		});

		var warnings = [];
		Object.keys(preview.sections || {}).forEach(function (id) {
			var p = preview.sections[id].preview || {};
			warnings = warnings.concat(p.warnings || []);
		});
		if (warnings.length) {
			container.appendChild(el('h4', {}, l10n.warningsHeading));
			var list = container.appendChild(el('ul', { class: 'typost-import-warnings' }));
			warnings.forEach(function (warning) {
				list.appendChild(el('li', {}, warning));
			});
		}

		var errorBox = container.appendChild(el('div', { id: 'typost-import-run-error', class: 'typost-export-error', role: 'alert' }));
		var actions = container.appendChild(el('p', { class: 'typost-import-actions' }));
		var importButton = actions.appendChild(el('button', { type: 'button', class: 'button button-primary' }, l10n.import));
		var cancel = actions.appendChild(el('button', { type: 'button', class: 'button' }, l10n.cancel));

		// A font that only left-out sections use is not imported.
		container.addEventListener('change', function (event) {
			if (!event.target.classList.contains('typost-import-include')) {
				return;
			}
			var state = readState(container, preview);
			preview.fonts.forEach(function (row) {
				var select = document.getElementById('typost-import-font-' + row.key);
				if (select) {
					select.disabled = fontLeftOut(row, state);
				}
			});
		});
		cancel.addEventListener('click', function () {
			clearPreview();
			document.getElementById('typost-import-file').focus();
		});
		importButton.addEventListener('click', function () {
			runImport(container, errorBox, importButton, cancel);
		});

		container.hidden = false;
		heading.focus();
	}

	function markInvalid(container, errors) {
		Array.prototype.forEach.call(container.querySelectorAll('[aria-invalid]'), function (node) {
			node.removeAttribute('aria-invalid');
		});
		errors.forEach(function (error) {
			var field = document.getElementById(error.field);
			if (field) {
				field.setAttribute('aria-invalid', 'true');
			}
		});
		if (errors.length) {
			var first = document.getElementById(errors[0].field);
			if (first) {
				first.focus();
			}
		}
	}

	function clearPreview() {
		var container = document.getElementById('typost-import-preview');
		container.hidden = true;
		container.textContent = '';
		importState = null;
	}

	function runImport(container, errorBox, button, cancel) {
		var preview = importState.preview;
		var state = readState(container, preview);
		var errors = collectErrors(preview, state, l10n);
		markInvalid(container, errors);
		if (errors.length) {
			errorBox.textContent = '';
			var list = el('ul');
			errors.forEach(function (error) {
				list.appendChild(el('li', {}, error.message));
			});
			errorBox.appendChild(list);
			return;
		}
		showError(errorBox, '');
		if (!typostBeginBusy(button, l10n.importing)) {
			return;
		}
		// The server writes whatever happens on the page, so Cancel waits too.
		cancel.disabled = true;
		request('import', { fileText: importState.fileText, choices: buildImportChoices(preview, state) })
			.done(function (response) {
				renderResult(response);
			})
			.fail(function (xhr) {
				typostEndBusy(button);
				cancel.disabled = false;
				showError(errorBox, errorMessage(xhr, l10n.requestFailed));
				button.focus();
			});
	}

	// --- Import: result --------------------------------------------------

	function renderResult(response) {
		var preview = document.getElementById('typost-import-preview');
		var container = document.getElementById('typost-import-result');
		preview.hidden = true;
		preview.textContent = '';
		importState = null;
		container.textContent = '';

		var heading = container.appendChild(el('h3', { tabindex: '-1' }, l10n.resultHeading));
		var groups = resultGroups(response, l10n);
		if (!groups.length) {
			container.appendChild(el('p', {}, l10n.resultNothing));
		}
		groups.forEach(function (group) {
			container.appendChild(el('h4', {}, group.heading));
			var list = container.appendChild(el('ul'));
			group.items.forEach(function (item) {
				list.appendChild(el('li', {}, item));
			});
		});
		var again = container.appendChild(el('p')).appendChild(el('button', { type: 'button', class: 'button' }, l10n.importAnother));
		again.addEventListener('click', function () {
			// Reload, so the other tabs list what was imported. Tab clicks do
			// not change the URL, so name this tab or the page opens the first.
			window.location.assign(exportTabUrl(window.location.href));
		});
		container.hidden = false;
		heading.focus();
	}

	function initImport() {
		var form = document.getElementById('typost-import-form');
		if (!form) {
			return;
		}
		var input = document.getElementById('typost-import-file');
		var errorBox = document.getElementById('typost-import-error');
		var submit = document.getElementById('typost-import-preview-submit');

		form.addEventListener('submit', function (event) {
			event.preventDefault();
			showError(errorBox, '');
			input.removeAttribute('aria-invalid');
			var file = input.files && input.files[0];
			if (!file) {
				input.setAttribute('aria-invalid', 'true');
				showError(errorBox, l10n.noFile);
				input.focus();
				return;
			}
			if (!typostBeginBusy(submit, l10n.previewing)) {
				return;
			}
			var reader = new FileReader();
			reader.onerror = function () {
				clearPreview();
				typostEndBusy(submit);
				showError(errorBox, l10n.fileUnreadable);
			};
			reader.onload = function () {
				var text = String(reader.result || '');
				request('import/preview', { fileText: text })
					.done(function (preview) {
						renderPreview(preview, text);
					})
					.fail(function (xhr) {
						// The last file's preview must not stay importable.
						clearPreview();
						showError(errorBox, errorMessage(xhr, l10n.requestFailed));
						input.focus();
					})
					.always(function () {
						typostEndBusy(submit);
					});
			};
			reader.readAsText(file);
		});
	}

	$(function () {
		initExport();
		initImport();
	});
})();

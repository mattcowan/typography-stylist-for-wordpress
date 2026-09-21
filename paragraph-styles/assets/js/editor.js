/**
 * Typography Stylist - Paragraph Styles: Editor Script
 *
 * Hooks into both the inline editor (block-editor.js) and the Typography
 * Stylist block editor (edit.js) via window.typostHooks to render a
 * paragraph styles panel at the top of each modal.
 *
 * Features:
 * - Dropdown to apply a saved paragraph style
 * - "Save Current Settings as Style" for new styles
 * - Style badge when a style is active (shows name + modified indicator)
 * - "Update Style" to overwrite the active style with current settings
 * - "Save as New" to create a new style from current settings
 * - "Detach Style" to remove class association and convert to inline styles
 *
 * Applies styles by dispatching the typost-apply-block-properties
 * CustomEvent (core's generic write bridge). Pure logic lives in
 * lib/ps-utils.js (window.typostPSUtils), shared with the Jest tests.
 */
(function() {
	'use strict';

	var el             = wp.element.createElement;
	var useState       = wp.element.useState;
	var useEffect      = wp.element.useEffect;
	var useRef         = wp.element.useRef;
	var useCallback    = wp.element.useCallback;
	var useMemo        = wp.element.useMemo;
	var SelectControl  = wp.components.SelectControl;
	var Button         = wp.components.Button;
	var TextControl    = wp.components.TextControl;
	var Modal          = wp.components.Modal;
	var __             = wp.i18n.__;
	var _n             = wp.i18n._n;
	var sprintf        = wp.i18n.sprintf;

	var utils                    = window.typostPSUtils;
	var findFontName             = utils.findFontName;
	var isStyleModified          = utils.isStyleModified;
	var resolveBrowserActiveStyleId = utils.resolveBrowserActiveStyleId;
	var filterParagraphStyles    = utils.filterParagraphStyles;
	var BROWSER_PAGE_SIZE        = utils.BROWSER_PAGE_SIZE;
	var buildBrowserSampleText   = utils.buildBrowserSampleText;
	var readRecentStyleIds       = utils.readRecentStyleIds;
	var recordRecentStyleId      = utils.recordRecentStyleId;
	var groupParagraphStyles     = utils.groupParagraphStyles;
	var paginateGroups           = utils.paginateGroups;
	var flattenGroups            = utils.flattenGroups;
	var resolveBrowserCursorIndex = utils.resolveBrowserCursorIndex;
	var resolveBrowserCursorKey  = utils.resolveBrowserCursorKey;
	var findTypeAheadMatch       = utils.findTypeAheadMatch;
	var buildPropertiesFromState = utils.buildPropertiesFromState;
	var buildApplyEventDetail    = utils.buildApplyEventDetail;
	var buildStylePreviewStyle   = utils.buildStylePreviewStyle;

	/**
	 * Toolbar icon: a swash "P". Drawn as one of a set with core's swash "T"
	 * (the two popover editors) and the Glyphs Panel swash "G", on a shared
	 * 256×256 grid and a common cap height, so the toolbar group reads as one
	 * family. Source: the core plugin's assets/images/icons/toolbar-p.svg.
	 *
	 * Square, unlike the "Ps" ligature this replaced — that mark needed a
	 * viewBox wider than tall to hold its cap height, and it no longer exists.
	 */
	var PS_ICON_PATH = 'M112.53,47.29c0-8.78-6.7-11.78-16.86-11.78h-13.4c-32.8,0-50.82,17.56-51.74,40.89,0,18.71,11.55,29.1,22.17,29.1,6.24,0,9.01-3,9.01-7.85,0-6.01-4.39-8.55-4.39-16.4,0-11.55,8.55-18.48,18.48-18.48,14.09,0,20.56,12.24,20.56,23.56,0,20.56-16.63,35.8-40.19,35.8S13.67,105.73,13.67,76.39c0-35.8,29.8-56.59,68.6-56.59h91.7c48.04,0,75.99,9.47,75.99,42.73s-27.95,43.89-76.69,43.89h-19.87v64.91c0,42.27-27.72,59.83-58.9,59.83-26.56,0-37.19-11.55-37.19-24.48,0-10.16,7.62-17.32,17.09-17.32,21.02,0,16.4,22.64,26.56,22.64,8.78,0,11.55-9.93,11.55-32.11V47.29ZM173.97,35.51h-13.63c-4.16,0-6.93,2.77-6.93,6.93v48.28h19.87c20.56,0,32.8-6.93,32.8-28.18s-12.24-27.03-32.11-27.03Z';

	function PSIcon() {
		return el('svg', {
			height: 24,
			width: 24,
			viewBox: '0 0 256 256',
			xmlns: 'http://www.w3.org/2000/svg',
			'aria-hidden': 'true',
			focusable: 'false'
		}, el('path', { d: PS_ICON_PATH, fill: 'currentColor' }));
	}

	// Get paragraph styles from localized data
	function getStyles() {
		return (window.typostData && window.typostData.paragraphStyles) || [];
	}

	// DOM ids for the browser's listbox rows and group headings. One browser
	// is mounted at a time (openBrowser closes any previous one), so the
	// style id / group index alone keeps them unique.
	function rowDomId(styleId) {
		return 'typost-ps-browser-row-' + String(styleId).replace(/[^A-Za-z0-9_-]/g, '');
	}
	/** window.localStorage when the browser allows it, else null. */
	function storageOrNull() {
		try {
			return window.localStorage || null;
		} catch (e) {
			return null;
		}
	}

	function groupDomId(index) {
		return 'typost-ps-browser-group-' + index;
	}

	// Whether the site has opted into the direct block toolbar button
	function toolbarButtonEnabled() {
		return !!(window.typostData &&
			window.typostData.paragraphStylesOptions &&
			window.typostData.paragraphStylesOptions.toolbarButton);
	}

	// Resolve a font name from a numeric font ID. A style may reference any font
	// source, so search all of them — uploaded kits alone would report "Default"
	// for every Adobe, manual, or adopted Font Library face.
	function getFontName(fontId) {
		var data = window.typostData || {};
		var fonts = [].concat(
			data.fonts || [],
			data.adobeFonts || [],
			data.manualFonts || [],
			data.adoptedWpFonts || []
		);
		return findFontName(fontId, fonts) || __('Default', 'typost-paragraph-styles');
	}

	// Dispatch the apply event for a style (or a detach when style is null).
	// applyTo 'selection' scopes it to the selected text; omitted means
	// block-level, which is what a paragraph style normally describes.
	function dispatchApply(style, editorSource, detachProperties, applyTo) {
		document.dispatchEvent(new CustomEvent('typost-apply-block-properties', {
			detail: buildApplyEventDetail(style, editorSource, detachProperties, applyTo),
		}));
	}

	/**
	 * ParagraphStylesPanel component.
	 *
	 * Props:
	 *   editorSource: 'inline' | 'qft' | 'inspector' — which editor this panel is in
	 */
	function ParagraphStylesPanel(props) {
		var editorSource = props.editorSource;

		var styles          = getStyles();
		var selectedStyle   = useState('');
		var selectedStyleId = selectedStyle[0];
		var setSelectedStyleId = selectedStyle[1];

		var savingState = useState(false);
		var isSaving    = savingState[0];
		var setIsSaving = savingState[1];

		var showSave    = useState(false);
		var isShowSave  = showSave[0];
		var setShowSave = showSave[1];

		var nameState   = useState('');
		var styleName   = nameState[0];
		var setStyleName = nameState[1];

		var stylesState     = useState(styles);
		var currentStyles   = stylesState[0];
		var setCurrentStyles = stylesState[1];

		// Active style ID detected from the editor (read from format attributes)
		var activeStyleState = useState(0);
		var activeStyleId    = activeStyleState[0];
		var setActiveStyleId = activeStyleState[1];

		// "Save as New" mode
		var saveAsNewState   = useState(false);
		var isSaveAsNew      = saveAsNewState[0];
		var setIsSaveAsNew   = saveAsNewState[1];

		var saveAsNewNameState = useState('');
		var saveAsNewName      = saveAsNewNameState[0];
		var setSaveAsNewName   = saveAsNewNameState[1];

		// Sync styles from typostData on mount and when notified of external changes.
		useEffect(function() {
			setCurrentStyles(getStyles());
			function onStylesUpdated() {
				setCurrentStyles(getStyles());
			}
			document.addEventListener('typost-paragraph-styles-updated', onStylesUpdated);
			return function() {
				document.removeEventListener('typost-paragraph-styles-updated', onStylesUpdated);
			};
		}, []);

		// Detect active style from editor state
		useEffect(function() {
			if (!window.typostHooks) return;
			var editorType = editorSource === 'inspector' ? 'qft' : editorSource;
			var state = window.typostHooks.applyFilters('typost_current_editor_state', {}, editorType);
			if (state && state.paragraphStyleId) {
				setActiveStyleId(state.paragraphStyleId);
				setSelectedStyleId(String(state.paragraphStyleId));
			}
		}, [editorSource]);

		// The style shown before the last pick, so a cancelled apply (the
		// host asked before replacing the selection's own styling and the
		// author said no) can put the badge back. The host reports the cancel
		// through typost-paragraph-style-apply-cancelled; without this the
		// panel kept showing a style that was never applied.
		var lastActiveRef = useRef({ id: 0, selected: '' });
		function rememberActive() {
			lastActiveRef.current = { id: activeStyleId, selected: selectedStyleId };
		}
		useEffect(function() {
			var editorType = editorSource === 'inspector' ? 'qft' : editorSource;
			function onCancelled(e) {
				if (!e.detail || e.detail.source !== editorType) return;
				setActiveStyleId(lastActiveRef.current.id);
				setSelectedStyleId(lastActiveRef.current.selected);
			}
			document.addEventListener('typost-paragraph-style-apply-cancelled', onCancelled);
			return function() {
				document.removeEventListener('typost-paragraph-style-apply-cancelled', onCancelled);
			};
		}, [editorSource]);

		// "Browse styles…" (inline editor): the visual browser replaces the
		// native select there — a select with no preview was unusable at a
		// few hundred styles (QA §4, decision 3). The browser applies through
		// the inline route and reports back so the badge follows.
		// Opening a second Modal makes WordPress close this one (the Glyphs
		// panel documents the same), so the host's saved selection range goes
		// with the browser and comes back through typost_extension_panel_closed,
		// which reopens the inline modal where the author left it.
		// The host's selectedText (the selection sliced when the modal opened,
		// or the whole text with a caret only) is read here, before the
		// forced close resets it, so the browser rows can sample it.
		function openBrowserFromPanel() {
			var host = props.hostState || {};
			var range = (typeof host.savedSelectionStart === 'number' && typeof host.savedSelectionEnd === 'number')
				? { start: host.savedSelectionStart, end: host.savedSelectionEnd }
				: null;
			openBrowser({
				editorSource: 'inline',
				hasSelection: true,
				selectedText: host.selectedText || '',
				state: getCurrentState(),
				onClosed: function() {
					if (window.typostHooks) {
						window.typostHooks.doAction('typost_extension_panel_closed', 'inline', { range: range, reopenHost: true });
					}
				},
				onApplied: function(style) {
					rememberActive();
					setActiveStyleId(style ? style.id : 0);
					setSelectedStyleId(style ? String(style.id) : '');
				},
			});
		}

		// Look up the active style object
		var activeStyle = useMemo(function() {
			if (!activeStyleId) return null;
			for (var i = 0; i < currentStyles.length; i++) {
				if (String(currentStyles[i].id) === String(activeStyleId)) {
					return currentStyles[i];
				}
			}
			return null;
		}, [activeStyleId, currentStyles]);

		// Is the editor state modified from the active style?
		//
		// Computed live, not memoized on [activeStyle, editorSource]: that memo
		// ran once in the render right after a style was picked — before core
		// had applied it, so it said "(modified)" for an unmodified style — and
		// never re-ran after a real edit, so it stayed blank until the panel
		// remounted (QA findings PS-1/PS-1b). The block-editor store changes on
		// every apply and every Inspector edit, so a store subscription is the
		// signal; the value is only committed to state when it actually flips.
		var modifiedState = useState(false);
		var modified       = modifiedState[0];
		var setModified    = modifiedState[1];

		useEffect(function() {
			if (!activeStyle || !window.typostHooks) {
				setModified(false);
				return undefined;
			}
			var editorType = editorSource === 'inspector' ? 'qft' : editorSource;
			var cancelled = false;
			var compute = function() {
				if (cancelled) return;
				var state = window.typostHooks.applyFilters('typost_current_editor_state', {}, editorType);
				var next = isStyleModified(state, activeStyle.properties);
				setModified(function(prev) { return prev === next ? prev : next; });
			};
			// The apply that made this style active is dispatched as an event and
			// lands in the store a tick later; check now and again after it.
			compute();
			var timer = setTimeout(compute, 150);
			var unsubscribe = (window.wp && wp.data && wp.data.subscribe) ? wp.data.subscribe(compute) : function() {};
			return function() {
				cancelled = true;
				clearTimeout(timer);
				unsubscribe();
			};
		}, [activeStyle, editorSource]);

		// Get current editor state for saving
		function getCurrentState() {
			if (window.typostHooks) {
				var editorType = editorSource === 'inspector' ? 'qft' : editorSource;
				return window.typostHooks.applyFilters('typost_current_editor_state', {}, editorType);
			}
			return {};
		}

		// Build dropdown options
		var options = [{ label: __('— Select a style —', 'typost-paragraph-styles'), value: '' }];
		currentStyles.forEach(function(style) {
			var detail = getFontName(style.properties && style.properties.fontId);
			if (style.properties && style.properties.fontWeight) {
				detail += ' (' + style.properties.fontWeight + ')';
			}
			options.push({
				label: style.name + ' — ' + detail,
				value: String(style.id),
			});
		});

		// Handle style selection — dispatch event to editor
		var onSelectStyle = useCallback(function(styleId) {
			setSelectedStyleId(styleId);
			if (!styleId) return;

			var style = null;
			for (var i = 0; i < currentStyles.length; i++) {
				if (String(currentStyles[i].id) === String(styleId)) {
					style = currentStyles[i];
					break;
				}
			}
			if (!style || !style.properties) return;

			rememberActive();
			setActiveStyleId(style.id);
			dispatchApply(style, editorSource);
		}, [currentStyles, editorSource, activeStyleId, selectedStyleId]);

		// Handle save new style
		var onSave = useCallback(function() {
			if (!styleName.trim()) return;
			setIsSaving(true);

			var state = getCurrentState();
			var properties = buildPropertiesFromState(state);

			wp.apiFetch({
				path: '/typost/v1/paragraph-styles',
				method: 'POST',
				data: {
					name: styleName.trim(),
					properties: properties,
				},
			}).then(function(newStyle) {
				var updated = currentStyles.concat([newStyle]);
				setCurrentStyles(updated);
				if (window.typostData) {
					window.typostData.paragraphStyles = updated;
					document.dispatchEvent(new CustomEvent('typost-paragraph-styles-updated'));
				}
				setStyleName('');
				setShowSave(false);
				setIsSaving(false);

				// Apply the new style
				setActiveStyleId(newStyle.id);
				setSelectedStyleId(String(newStyle.id));
				dispatchApply(newStyle, editorSource);
			}).catch(function() {
				setIsSaving(false);
			});
		}, [styleName, currentStyles, editorSource]);

		// Handle "Update Style" — PATCH existing style with current settings
		var onUpdateStyle = useCallback(function() {
			if (!activeStyle) return;
			setIsSaving(true);

			var state = getCurrentState();
			var properties = buildPropertiesFromState(state);

			wp.apiFetch({
				path: '/typost/v1/paragraph-styles/' + activeStyle.id,
				method: 'PATCH',
				data: { properties: properties },
			}).then(function(updatedStyle) {
				var updated = currentStyles.map(function(s) {
					return String(s.id) === String(updatedStyle.id) ? updatedStyle : s;
				});
				setCurrentStyles(updated);
				if (window.typostData) {
					window.typostData.paragraphStyles = updated;
					document.dispatchEvent(new CustomEvent('typost-paragraph-styles-updated'));
				}
				setIsSaving(false);
			}).catch(function() {
				setIsSaving(false);
			});
		}, [activeStyle, currentStyles, editorSource]);

		// Handle "Save as New"
		var onSaveAsNew = useCallback(function() {
			if (!saveAsNewName.trim()) return;
			setIsSaving(true);

			var state = getCurrentState();
			var properties = buildPropertiesFromState(state);

			wp.apiFetch({
				path: '/typost/v1/paragraph-styles',
				method: 'POST',
				data: {
					name: saveAsNewName.trim(),
					properties: properties,
				},
			}).then(function(newStyle) {
				var updated = currentStyles.concat([newStyle]);
				setCurrentStyles(updated);
				if (window.typostData) {
					window.typostData.paragraphStyles = updated;
					document.dispatchEvent(new CustomEvent('typost-paragraph-styles-updated'));
				}
				setSaveAsNewName('');
				setIsSaveAsNew(false);
				setIsSaving(false);

				// Switch to the new style
				setActiveStyleId(newStyle.id);
				setSelectedStyleId(String(newStyle.id));
				dispatchApply(newStyle, editorSource);
			}).catch(function() {
				setIsSaving(false);
			});
		}, [saveAsNewName, currentStyles, editorSource]);

		// Handle "Detach Style" — remove class association, keep inline styles
		var onDetachStyle = useCallback(function() {
			setActiveStyleId(0);
			setSelectedStyleId('');

			// Re-apply current settings as inline styles (no paragraph style)
			var state = getCurrentState();
			dispatchApply(null, editorSource, buildPropertiesFromState(state));
		}, [editorSource]);

		// ---- Render ----

		// Active style badge + actions
		if (activeStyle) {
			var badgeLabel = activeStyle.name;
			if (modified) {
				badgeLabel += ' ' + __('(modified)', 'typost-paragraph-styles');
			}

			return el('div', { className: 'typost-ps-panel' },
				el('div', { className: 'typost-ps-panel-inner' },
					el('div', { className: 'typost-ps-panel-label' },
						__('Paragraph Style', 'typost-paragraph-styles')
					),
					// Style badge
					el('div', { className: 'typost-ps-badge' + (modified ? ' typost-ps-badge--modified' : '') },
						el('span', { className: 'typost-ps-badge-name' }, badgeLabel),
						el('span', { className: 'typost-ps-badge-class' }, '.typost-ps-' + activeStyle.id)
					),
					// Actions
					el('div', { className: 'typost-ps-style-actions' },
						editorSource === 'inline' && el(Button, {
							variant: 'secondary',
							onClick: openBrowserFromPanel,
							size: 'small',
						}, __('Browse styles…', 'typost-paragraph-styles')),
						modified && el(Button, {
							variant: 'primary',
							onClick: onUpdateStyle,
							disabled: isSaving,
							isBusy: isSaving,
							size: 'small',
						}, __('Update Style', 'typost-paragraph-styles')),
						modified && el(Button, {
							variant: 'secondary',
							onClick: function() { setIsSaveAsNew(true); },
							size: 'small',
						}, __('Save as New', 'typost-paragraph-styles')),
						el(Button, {
							variant: 'link',
							onClick: onDetachStyle,
							size: 'small',
							isDestructive: true,
						}, __('Detach Style', 'typost-paragraph-styles'))
					),
					// "Save as New" name input
					isSaveAsNew && el('div', { className: 'typost-ps-save-form' },
						el(TextControl, {
							placeholder: __('New style name...', 'typost-paragraph-styles'),
							value: saveAsNewName,
							onChange: setSaveAsNewName,
							__nextHasNoMarginBottom: true,
						}),
						el('div', { className: 'typost-ps-save-actions' },
							el(Button, {
								variant: 'primary',
								onClick: onSaveAsNew,
								disabled: !saveAsNewName.trim() || isSaving,
								isBusy: isSaving,
								size: 'small',
							}, __('Save', 'typost-paragraph-styles')),
							el(Button, {
								variant: 'link',
								onClick: function() {
									setIsSaveAsNew(false);
									setSaveAsNewName('');
								},
								size: 'small',
							}, __('Cancel', 'typost-paragraph-styles'))
						)
					)
				)
			);
		}

		// No active style — show dropdown + save option
		return el('div', { className: 'typost-ps-panel' },
			el('div', { className: 'typost-ps-panel-inner' },
				el('div', { className: 'typost-ps-panel-label' },
					__('Paragraph Style', 'typost-paragraph-styles')
				),
				editorSource === 'inline'
					? el(Button, {
						variant: 'secondary',
						className: 'typost-ps-browse-btn',
						onClick: openBrowserFromPanel,
						// Names what opens; the panel heading above is a plain div
						'aria-haspopup': 'dialog',
					}, __('Browse styles…', 'typost-paragraph-styles'))
					: el(SelectControl, {
						// The visible "Paragraph Style" heading above is a plain div, so
						// without this the select had no accessible name — NVDA read it
						// as "combo box, — Select a style —, collapsed" (QA finding SR-2).
						label: __('Paragraph Style', 'typost-paragraph-styles'),
						hideLabelFromVision: true,
						value: selectedStyleId,
						options: options,
						onChange: onSelectStyle,
						__nextHasNoMarginBottom: true,
					}),
				!isShowSave && el(Button, {
					variant: 'secondary',
					className: 'typost-ps-save-btn',
					onClick: function() { setShowSave(true); },
					size: 'small',
				}, __('Save Current Settings as Style', 'typost-paragraph-styles')),
				isShowSave && el('div', { className: 'typost-ps-save-form' },
					el(TextControl, {
						placeholder: __('Style name...', 'typost-paragraph-styles'),
						value: styleName,
						onChange: setStyleName,
						__nextHasNoMarginBottom: true,
					}),
					el('div', { className: 'typost-ps-save-actions' },
						el(Button, {
							variant: 'primary',
							onClick: onSave,
							disabled: !styleName.trim() || isSaving,
							isBusy: isSaving,
							size: 'small',
						}, isSaving ? __('Saving...', 'typost-paragraph-styles') : __('Save', 'typost-paragraph-styles')),
						el(Button, {
							variant: 'link',
							onClick: function() {
								setShowSave(false);
								setStyleName('');
							},
							size: 'small',
						}, __('Cancel', 'typost-paragraph-styles'))
					)
				)
			)
		);
	}

	/**
	 * ParagraphStylesBrowser — the toolbar-launched style browser.
	 *
	 * Shows every saved style rendered in its own typeface rather than as a
	 * dropdown label, so the author can see a style before applying it. Each
	 * row carries the style's real CSS class (family, weight, letter-spacing,
	 * OpenType features) with only the size overridden; see
	 * buildStylePreviewStyle.
	 *
	 * Applies through the same event as the panel, with source 'inspector' —
	 * core routes an 'inspector' apply to the selected block, which is exactly
	 * the block whose toolbar was clicked. ('qft' would be dropped: core only
	 * accepts that source while the Quick Feature Toggle modal is open.)
	 *
	 * The list is a single-select listbox (roving aria-activedescendant, not
	 * a button per row): one Tab stop, arrows move a cursor across every
	 * visible row, Enter/Space apply the cursor row, printable characters do
	 * first-letter type-ahead. Rows can be grouped by font family or size
	 * mode; each group is an ARIA group with a visible heading so a screen
	 * reader names the group when arrowing into it. Every decision the
	 * keyboard layer makes lives in ps-utils (resolveBrowserCursorIndex,
	 * resolveBrowserCursorKey, findTypeAheadMatch, groupParagraphStyles,
	 * paginateGroups), where it is tested.
	 *
	 * Props:
	 *   activeStyleId: number — style currently applied (0 for none); its row
	 *     is aria-selected and the cursor starts on it
	 *   hasSelection: boolean — apply to the selected text, not the block
	 *   sampleText: string — the selected text; each row renders it in the
	 *     style instead of the style name (buildBrowserSampleText falls back
	 *     to the name when empty)
	 *   editorSource: 'inspector' | 'inline'
	 *   onApplied: function(style|null) — optional, called before the apply
	 *   onClose: function
	 */
	function ParagraphStylesBrowser(props) {
		var editorSource = props.editorSource || 'inspector';
		var editorType   = editorSource === 'inspector' ? 'qft' : editorSource;

		var stylesState      = useState(getStyles());
		var currentStyles    = stylesState[0];
		var setCurrentStyles = stylesState[1];

		var activeState    = useState(props.activeStyleId || 0);
		var activeStyleId  = activeState[0];
		var setActiveStyleId = activeState[1];

		// Search + "first 24, show more" paging (QA §4 option 2, decision 3).
		// At 300 styles the full list was 30,000 px tall; a search box and a
		// short first page make it usable without changing what a row is.
		var queryState   = useState('');
		var query        = queryState[0];
		var setQuery     = queryState[1];
		var visibleState = useState(BROWSER_PAGE_SIZE);
		var visibleCount = visibleState[0];
		var setVisibleCount = visibleState[1];
		// Index of the first row revealed by the last "Show more", so the
		// cursor can land on it once it exists (-1: nothing pending)
		var revealFromRef = useRef(-1);

		// Recently used style ids (per browser, localStorage), read once per
		// open; onApply records the pick so the next open lists it first.
		var recentState = useState(function() { return readRecentStyleIds(storageOrNull()); });
		var recentIds = recentState[0];
		var setRecentIds = recentState[1];
		// Group by: none / font family / size mode / recently used. Session-only.
		var groupState = useState('none');
		var groupBy    = groupState[0];
		var setGroupBy = groupState[1];

		// The listbox cursor, keyed by style id so it survives search,
		// grouping and paging re-renders (resolveBrowserCursorIndex falls
		// back when the row is gone). 0 = not moved yet.
		var cursorState      = useState(0);
		var cursorStyleId    = cursorState[0];
		var setCursorStyleId = cursorState[1];

		useEffect(function() {
			function onStylesUpdated() {
				setCurrentStyles(getStyles());
			}
			document.addEventListener('typost-paragraph-styles-updated', onStylesUpdated);
			return function() {
				document.removeEventListener('typost-paragraph-styles-updated', onStylesUpdated);
			};
		}, []);

		// Open with focus on the listbox, cursor on the applied style's row
		// (else the first), rather than on the dialog frame. From the frame,
		// a keyboard user reached Modal's scroll wrapper (a silent stop) and
		// then Close before any style (QA finding SR-6). Runs after Modal's
		// own focus-on-mount, which fires from a child ref effect; the frame
		// keeps focus when there is no list.
		var listRef = useRef(null);
		useEffect(function() {
			var list = listRef.current;
			if (list && typeof list.focus === 'function') {
				list.focus();
			}
		}, []);

		// Font name for grouping: '' when the style's font cannot be resolved,
		// so those styles land in the "No font set" group instead of one
		// labelled with the "Default" placeholder.
		function groupFontNameOf(style) {
			var data = window.typostData || {};
			var fonts = [].concat(
				data.fonts || [],
				data.adobeFonts || [],
				data.manualFonts || [],
				data.adoptedWpFonts || []
			);
			return findFontName(style.properties && style.properties.fontId, fonts) || '';
		}

		var filtered = useMemo(function() {
			return filterParagraphStyles(currentStyles, query, function(style) {
				return getFontName(style.properties && style.properties.fontId);
			});
		}, [currentStyles, query]);
		// Search → group → page: headings describe exactly the rows under them
		// and are recomputed from whatever the page shows.
		var groups = useMemo(function() {
			return groupParagraphStyles(filtered, groupBy, groupFontNameOf, recentIds);
		}, [filtered, groupBy, recentIds]);
		var page = paginateGroups(groups, visibleCount);
		var visibleGroups = page.groups;
		var hiddenCount = page.hiddenCount;
		var rows = flattenGroups(visibleGroups);
		// The button promises what one activation reveals: one page, or
		// the remainder when fewer are left
		var nextPageCount = Math.min(hiddenCount, BROWSER_PAGE_SIZE);

		var cursorIndex = resolveBrowserCursorIndex(rows, cursorStyleId, activeStyleId);
		var cursorStyle = cursorIndex >= 0 ? rows[cursorIndex] : null;
		var cursorRowId = cursorStyle ? rowDomId(cursorStyle.id) : undefined;

		function moveCursor(index) {
			if (index >= 0 && index < rows.length) {
				setCursorStyleId(rows[index].id);
			}
		}

		// Keep the cursor row in view as it moves (arrows, type-ahead, Show more).
		useEffect(function() {
			if (!cursorRowId) return;
			var row = document.getElementById(cursorRowId);
			if (row && typeof row.scrollIntoView === 'function') {
				row.scrollIntoView({ block: 'nearest' });
			}
		}, [cursorRowId]);

		// After "Show more", keep focus on the listbox and move the cursor to
		// the first newly revealed row, so a keyboard user continues where the
		// list grew instead of from the button. Rows are appended in flat
		// order, so the index recorded before the reveal is that row.
		useEffect(function() {
			var index = revealFromRef.current;
			if (index < 0) return;
			revealFromRef.current = -1;
			moveCursor(Math.min(index, rows.length - 1));
			if (listRef.current && typeof listRef.current.focus === 'function') {
				listRef.current.focus();
			}
		}, [visibleCount]); // eslint-disable-line react-hooks/exhaustive-deps -- runs once per reveal, with that render's rows

		// First-letter type-ahead: characters typed within 500 ms of each
		// other form one buffer (a repeated letter cycles, a prefix matches).
		var typeAheadRef = useRef({ buffer: '', timer: null });
		useEffect(function() {
			return function() {
				if (typeAheadRef.current.timer) {
					clearTimeout(typeAheadRef.current.timer);
				}
			};
		}, []);

		function onListKeyDown(e) {
			if (!rows.length) return;
			var key = e.key;
			var next = resolveBrowserCursorKey(key, cursorIndex, rows.length);
			if (next !== -1) {
				e.preventDefault();
				moveCursor(next);
				return;
			}
			if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
				// Space would otherwise scroll the modal
				e.preventDefault();
				if (cursorStyle) onApply(cursorStyle);
				return;
			}
			// Escape stays with the Modal; modified keys stay with the browser
			if (key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
			e.preventDefault();
			var ta = typeAheadRef.current;
			if (ta.timer) clearTimeout(ta.timer);
			ta.buffer += key;
			ta.timer = setTimeout(function() {
				ta.buffer = '';
				ta.timer = null;
			}, 500);
			var labels = rows.map(function(style) {
				return String(style.name || '').toLowerCase();
			});
			var match = findTypeAheadMatch(labels, ta.buffer, cursorIndex);
			if (match !== -1) moveCursor(match);
		}

		// Announce the match count as the author types: the list changes
		// under a screen-reader user with no other signal.
		useEffect(function() {
			if (!query || !window.wp || !window.wp.a11y || typeof window.wp.a11y.speak !== 'function') return;
			window.wp.a11y.speak(sprintf(
				/* translators: %d: number of matching styles */
				_n('%d style matches.', '%d styles match.', filtered.length, 'typost-paragraph-styles'),
				filtered.length
			), 'polite');
		}, [query, filtered.length]);

		function onQueryChange(value) {
			setQuery(value);
			setVisibleCount(BROWSER_PAGE_SIZE);
		}

		function onShowMore() {
			revealFromRef.current = rows.length;
			setVisibleCount(visibleCount + BROWSER_PAGE_SIZE);
		}

		function onGroupByChange(value) {
			setGroupBy(utils.BROWSER_GROUP_MODES.indexOf(value) === -1 ? 'none' : value);
		}

		// Applying and detaching are both terminal: close afterwards so the
		// author sees the result on the block instead of through a modal, and
		// so focus returns to the launching button. Closing also avoids
		// stranding keyboard focus — detaching unmounts the very button that
		// was clicked, which would otherwise drop focus to the document root.
		// With text selected, the style wraps that text; with only a caret it
		// applies to the whole block. Styling one word must not restyle its
		// neighbours just because they carry no explicit styling of their own.
		// The inline editor is selection-scoped by nature, so it needs no
		// applyTo flag; its host applies to the saved selection.
		var applyTo = props.hasSelection && editorSource !== 'inline' ? 'selection' : undefined;

		var onApply = useCallback(function(style) {
			setRecentIds(recordRecentStyleId(storageOrNull(), style.id));
			setActiveStyleId(style.id);
			// The launching panel first, so a cancel reported during the
			// apply (typost-paragraph-style-apply-cancelled) lands after it
			if (props.onApplied) props.onApplied(style);
			dispatchApply(style, editorSource, undefined, applyTo);
			props.onClose();
		}, [props.onClose, props.onApplied, applyTo, editorSource]);

		var onDetach = useCallback(function() {
			setActiveStyleId(0);
			if (props.onApplied) props.onApplied(null);
			if (applyTo === 'selection') {
				// Strip the style from the selected text only
				dispatchApply(null, editorSource, {}, applyTo);
				props.onClose();
				return;
			}
			var state = window.typostHooks
				? window.typostHooks.applyFilters('typost_current_editor_state', {}, editorType)
				: {};
			dispatchApply(null, editorSource, buildPropertiesFromState(state));
			props.onClose();
		}, [props.onClose, props.onApplied, applyTo, editorSource, editorType]);

		// One listbox option per style. The row itself is the option (no
		// inner button): the listbox owns focus and points at the cursor row
		// through aria-activedescendant. aria-selected marks the applied
		// style only; the cursor is a separate, visible class.
		function renderRow(style) {
			var preview = buildStylePreviewStyle(style.properties);
			var isActive = String(style.id) === String(activeStyleId);
			var isCursor = !!cursorStyle && String(style.id) === String(cursorStyle.id);
			var fontName = getFontName(style.properties && style.properties.fontId);
			var meta = [fontName];
			if (style.properties && style.properties.fontWeight) {
				meta.push(style.properties.fontWeight);
			}
			if (preview.sizeLabel) {
				meta.push(preview.sizeLabel);
			}

			return el('li', {
				key: style.id,
				id: rowDomId(style.id),
				role: 'option',
				'aria-selected': isActive,
				tabIndex: -1,
				className: 'typost-ps-browser-row' + (isActive ? ' is-active' : '') + (isCursor ? ' is-cursor' : ''),
				onClick: function() { onApply(style); },
			},
				el('span', {
					className: 'typost-ps-browser-sample typost-ps-' + style.id,
					style: preview.style,
					// Purely visual: the selected text (or the style name)
					// rendered in the style. The meta line below carries the
					// name, font, weight and size, so this is not read as well.
					'aria-hidden': 'true',
				}, buildBrowserSampleText(props.sampleText, style.name)),
				el('span', { className: 'typost-ps-browser-meta' },
					el('span', { className: 'typost-ps-browser-name' }, style.name),
					el('span', { className: 'typost-ps-browser-detail' }, meta.join(' · '))
				)
			);
		}

		// Ungrouped: options straight under the listbox. Grouped: each group
		// is a role="group" item named by its visible heading (a div, not an
		// h-tag — the modal already has its heading); see renderGroup below.
		var listChildren;
		if (visibleGroups.length === 1 && visibleGroups[0].key === 'all') {
			listChildren = rows.map(renderRow);
		} else {
			listChildren = visibleGroups.map(function(group, index) {
				var headingId = groupDomId(index);
				// The listbox may only own option and group children, so the
				// group is the <li> itself (named by its heading); the inner
				// <ul> is presentational so the options belong to the group.
				return el('li', { key: group.key, role: 'group', 'aria-labelledby': headingId, className: 'typost-ps-browser-group' },
					el('div', { id: headingId, className: 'typost-ps-browser-group-heading' }, group.label),
					el('ul', { role: 'presentation', className: 'typost-ps-browser-group-list' },
						group.styles.map(renderRow))
				);
			});
		}

		var body;
		if (currentStyles.length === 0) {
			body = el('p', { className: 'typost-ps-browser-empty' },
				__('No paragraph styles saved yet. Set up the typography you want, then use "Save Current Settings as Style" in the sidebar.', 'typost-paragraph-styles'));
		} else if (filtered.length === 0) {
			body = el('p', { className: 'typost-ps-browser-empty', role: 'status' },
				sprintf(/* translators: %s: search text */ __('No styles match "%s".', 'typost-paragraph-styles'), query));
		} else {
			body = el('ul', {
				className: 'typost-ps-browser-list' + (cursorRowId ? ' has-cursor' : ''),
				ref: listRef,
				role: 'listbox',
				tabIndex: 0,
				'aria-label': __('Paragraph styles', 'typost-paragraph-styles'),
				'aria-activedescendant': cursorRowId,
				onKeyDown: onListKeyDown,
			}, listChildren);
		}

		return el(Modal, {
			title: __('Paragraph Styles', 'typost-paragraph-styles'),
			onRequestClose: props.onClose,
			className: 'typost-ps-browser-modal',
		},
			currentStyles.length > 0 && el('p', { className: 'typost-ps-browser-scope' },
				props.hasSelection
					? __('Applies to the selected text.', 'typost-paragraph-styles')
					: __('Applies to the whole block.', 'typost-paragraph-styles')
			),
			currentStyles.length > 0 && el('div', { className: 'typost-ps-browser-search' },
				el(TextControl, {
					label: __('Search styles', 'typost-paragraph-styles'),
					type: 'search',
					value: query,
					onChange: onQueryChange,
					placeholder: __('Style or font name', 'typost-paragraph-styles'),
					__nextHasNoMarginBottom: true,
				}),
				el(SelectControl, {
					label: __('Group by', 'typost-paragraph-styles'),
					value: groupBy,
					options: [
						{ label: __('None', 'typost-paragraph-styles'), value: 'none' },
						{ label: __('Font family', 'typost-paragraph-styles'), value: 'font' },
						{ label: __('Size mode', 'typost-paragraph-styles'), value: 'size' },
						// Offered only where the browser can remember picks; a blocked
						// store would otherwise show a flat list that looks like
						// "nothing used yet" (review F9)
					].concat(storageOrNull() ? [
						{ label: __('Recently used', 'typost-paragraph-styles'), value: 'recent' },
					] : []),
					onChange: onGroupByChange,
					__nextHasNoMarginBottom: true,
				})
			),
			body,
			hiddenCount > 0 && el('div', { className: 'typost-ps-browser-more' },
				el(Button, {
					variant: 'secondary',
					onClick: onShowMore,
				}, sprintf(
					/* translators: %d: number of styles the button reveals */
					_n('Show %d more style', 'Show %d more styles', nextPageCount, 'typost-paragraph-styles'),
					nextPageCount
				))
			),
			activeStyleId ? el('div', { className: 'typost-ps-browser-footer' },
				el(Button, {
					variant: 'link',
					isDestructive: true,
					onClick: function() { onDetach(); },
				}, __('Detach Style', 'typost-paragraph-styles'))
			) : null
		);
	}

	// -------------------------------------------------------------------------
	// Browser mounting (a Modal outside the editor's React tree)
	// -------------------------------------------------------------------------

	var browserRoot = null;
	var browserOnClosed = null;

	function closeBrowser() {
		if (browserRoot) {
			wp.element.unmountComponentAtNode(browserRoot);
			if (browserRoot.parentNode) {
				browserRoot.parentNode.removeChild(browserRoot);
			}
			browserRoot = null;
		}
		var onClosed = browserOnClosed;
		browserOnClosed = null;
		if (typeof onClosed === 'function') {
			onClosed();
		}
	}

	function openBrowser(context) {
		injectStyles();
		closeBrowser();
		browserOnClosed = (context && typeof context.onClosed === 'function') ? context.onClosed : null;
		browserRoot = document.createElement('div');
		browserRoot.className = 'typost-ps-browser-root';
		document.body.appendChild(browserRoot);

		// The toolbar hands over resolved state; fall back to the shared filter
		// for any caller that does not.
		var state = (context && context.state) ||
			(window.typostHooks ? window.typostHooks.applyFilters('typost_current_editor_state', {}, 'qft') : {}) ||
			{};

		// A captured selection means the author highlighted text before opening
		// the browser, so the style should wrap that text rather than the block.
		var captured = context && context.capturedSelection;
		var hasSelection = context && context.hasSelection !== undefined
			? !!context.hasSelection
			: !!(captured && captured.start !== captured.end);

		// The text the rows render in each style. Both launchers hand it
		// over: the block toolbar's click context carries selectedText (the
		// text of capturedSelection, '' with a caret) and the inline panel
		// passes its host's selectedText. capturedSelection.text is the
		// fallback for a caller that sends only the snapshot.
		var sampleText = (context && typeof context.selectedText === 'string')
			? context.selectedText
			: ((captured && captured.text) || '');

		wp.element.render(
			el(ParagraphStylesBrowser, {
				// In selection scope the pressed row and Detach must describe
				// the selection's own style, not the block's (see the helper).
				activeStyleId: resolveBrowserActiveStyleId(state, hasSelection),
				hasSelection: hasSelection,
				sampleText: sampleText,
				// 'inline' when launched from the inline modal's panel; the
				// toolbar button (block) keeps the 'inspector' route
				editorSource: (context && context.editorSource) || 'inspector',
				onApplied: context && context.onApplied,
				onClose: closeBrowser,
			}),
			browserRoot
		);
	}

	// -------------------------------------------------------------------------
	// Dynamic style CSS (freshly saved/updated styles)
	// -------------------------------------------------------------------------

	/**
	 * Rebuild the CSS for every stored style and inject it into the editor
	 * documents (top document + canvas iframe).
	 *
	 * The server prints style CSS only at page load, so a style created or
	 * updated in-session has no rules where the styled text lives — and
	 * because applying a style strips inline styles from spans/blocks
	 * (rendering is delegated to the style's CSS class), the text would fall
	 * back to theme defaults until the editor is reloaded. This listener
	 * closes that gap; buildStyleCssBlock (ps-utils) mirrors the PHP
	 * generate_style_css() so the injected rules match what the server will
	 * print on the next load.
	 */
	var dynamicCssInjected = false;

	function refreshDynamicStyleCss() {
		dynamicCssInjected = true;
		var styles = getStyles();
		var blocks = [];
		for (var i = 0; i < styles.length; i++) {
			var block = utils.buildStyleCssBlock(styles[i]);
			if (block) {
				blocks.push(block);
			}
		}
		var css = blocks.join('\n\n');

		var docs = [document];
		var frames = document.querySelectorAll('iframe[name="editor-canvas"]');
		for (var f = 0; f < frames.length; f++) {
			var frame = frames[f];
			try {
				if (frame.contentDocument) {
					docs.push(frame.contentDocument);
				}
			} catch (e) {
				// Inaccessible frame — skip
			}
			// A (re)created iframe replaces its document when the srcdoc
			// loads, dropping anything injected before that — re-inject then
			if (!frame._typostPsWatched) {
				frame._typostPsWatched = true;
				frame.addEventListener('load', refreshDynamicStyleCss);
			}
		}

		for (var d = 0; d < docs.length; d++) {
			var doc = docs[d];
			var styleEl = doc.getElementById('typost-ps-dynamic-css');
			if (!styleEl) {
				styleEl = doc.createElement('style');
				styleEl.id = 'typost-ps-dynamic-css';
				(doc.head || doc.documentElement).appendChild(styleEl);
			}
			styleEl.textContent = css;
		}

		watchForCanvasRemount();
	}

	// The canvas iframe is unmounted and recreated by editor mode switches
	// (Visual ⇄ Code Editor) and similar remounts — the injected <style> dies
	// with the old document, silently reverting to the stale-editor bug the
	// injection exists to fix. Once dynamic CSS is in play, watch the DOM for
	// a new canvas iframe and re-inject. Server CSS makes this unnecessary
	// after a full page load, so the observer only starts after a first
	// in-session save.
	var canvasObserver = null;
	function watchForCanvasRemount() {
		if (canvasObserver || typeof MutationObserver === 'undefined') return;
		canvasObserver = new MutationObserver(function (mutations) {
			if (!dynamicCssInjected) return;
			for (var i = 0; i < mutations.length; i++) {
				var added = mutations[i].addedNodes;
				for (var j = 0; j < added.length; j++) {
					var node = added[j];
					if (node.nodeType !== 1) continue;
					if ((node.matches && node.matches('iframe[name="editor-canvas"]')) ||
						(node.querySelector && node.querySelector('iframe[name="editor-canvas"]'))) {
						// The new frame's document may not exist yet;
						// refresh now (harmless if not) and again on its load
						// via the listener refresh attaches.
						refreshDynamicStyleCss();
						return;
					}
				}
			}
		});
		canvasObserver.observe(document.body, { childList: true, subtree: true });
	}

	// The panel dispatches this after every save/update (before it applies the
	// style), so the rules exist by the time the span/block starts relying on them.
	document.addEventListener('typost-paragraph-styles-updated', refreshDynamicStyleCss);

	// -------------------------------------------------------------------------
	// Inline styles for the panel (injected once)
	// -------------------------------------------------------------------------

	var styleInjected = false;
	function injectStyles() {
		if (styleInjected) return;
		styleInjected = true;

		var css = [
			// Base styles (inline editor — matches .typost-font-section spacing)
			'.typost-ps-panel { margin: 0 1rem; padding: 16px 20px; border-bottom: 1px solid #ddd; }',
			'.typost-ps-panel-inner { padding: 0; }',
			'.typost-ps-panel-label { font-size: 11px; font-weight: 600; text-transform: uppercase; color: #757575; margin-bottom: 12px; letter-spacing: 0.5px; }',
			'.typost-ps-panel .components-select-control__input { margin-bottom: 0; }',
			'.typost-ps-save-btn { width: 100%; justify-content: center; margin-top: 10px; }',
			'.typost-ps-save-form { margin-top: 10px; }',
			'.typost-ps-save-form .components-text-control__input { margin-bottom: 8px; }',
			'.typost-ps-save-actions { display: flex; gap: 8px; align-items: center; }',
			'.typost-ps-panel .components-base-control { margin-bottom: 0; }',
			// Style badge
			'.typost-ps-badge { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #f0f6fc; border: 1px solid #c8d8e8; border-radius: 4px; margin-bottom: 10px; }',
			'.typost-ps-badge--modified { background: #fef8ee; border-color: #e0c8a0; }',
			'.typost-ps-badge-name { font-size: 13px; font-weight: 600; color: #1e1e1e; }',
			'.typost-ps-badge-class { font-size: 11px; font-family: monospace; color: #757575; }',
			// Style actions row
			'.typost-ps-style-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }',
			// QFT override — no horizontal margin (parent wrapper handles padding)
			'[data-hook="typost_qft_modal_top"] .typost-ps-panel { margin: 0; padding: 0 0 16px 0; border-bottom: 2px solid #ddd; margin-bottom: 16px; }',
			// Inspector sidebar override — compact spacing
			'[data-hook="typost_inspector_top"] .typost-ps-panel { margin: 0; padding: 12px 16px; border-bottom: 1px solid #e0e0e0; }',
			'[data-hook="typost_inspector_top"] .typost-ps-panel-label { margin-bottom: 8px; }',
			// Style browser (toolbar button)
			'.typost-ps-browser-modal { max-width: 720px; width: 90vw; }',
			'.typost-ps-browser-list, .typost-ps-browser-group-list { list-style: none; margin: 0; padding: 0; }',
			// The listbox is the Tab stop; the cursor row carries the ring while
			// a row exists, so the list itself shows one only when it has none
			'.typost-ps-browser-list:focus-visible { outline: 2px solid #007cba; outline-offset: -2px; }',
			'.typost-ps-browser-list.has-cursor:focus, .typost-ps-browser-list.has-cursor:focus-visible { outline: none; }',
			'.typost-ps-browser-row + .typost-ps-browser-row { border-top: 1px solid #e0e0e0; }',
			'.typost-ps-browser-row { display: flex; flex-direction: column; gap: 6px; width: 100%; box-sizing: border-box; padding: 14px 12px; background: none; border: 0; border-radius: 4px; cursor: pointer; text-align: left; }',
			'.typost-ps-browser-row:hover { background: #f0f0f0; }',
			'.typost-ps-browser-list:focus .typost-ps-browser-row.is-cursor { outline: 2px solid #007cba; outline-offset: -2px; }',
			'.typost-ps-browser-row.is-active { background: #f0f6fc; box-shadow: inset 3px 0 0 #007cba; }',
			// Group headings (Group by: font family / size mode)
			'.typost-ps-browser-group + .typost-ps-browser-group { margin-top: 8px; }',
			'.typost-ps-browser-group-heading { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #50575e; margin: 12px 0 4px; padding: 0 12px; }',
			'.typost-ps-browser-group:first-child .typost-ps-browser-group-heading { margin-top: 0; }',
			// Long sample text must not push the modal wide
			'.typost-ps-browser-sample { display: block; color: #1e1e1e; overflow-wrap: anywhere; }',
			'.typost-ps-browser-meta { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; }',
			'.typost-ps-browser-name { font-size: 13px; font-weight: 600; color: #1e1e1e; }',
			// #50575e is 6.4:1 on the #f0f0f0 hover background; #757575 at 11px was 4.0:1 (QA finding A11Y-3)
			'.typost-ps-browser-detail { font-size: 12px; color: #50575e; }',
			'.typost-ps-browser-search { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; margin: 0 0 12px 0; }',
			'.typost-ps-browser-search > .components-base-control:first-child { flex: 1 1 200px; }',
			'.typost-ps-browser-more { margin-top: 12px; text-align: center; }',
			'.typost-ps-browse-btn { width: 100%; justify-content: center; }',
			'.typost-ps-browser-empty { color: #757575; margin: 0; }',
			'.typost-ps-browser-scope { margin: 0 0 12px 0; font-size: 12px; color: #757575; }',
			'.typost-ps-browser-footer { margin-top: 16px; padding-top: 12px; border-top: 1px solid #e0e0e0; }',
		].join('\n');

		var styleEl = document.createElement('style');
		styleEl.textContent = css;
		document.head.appendChild(styleEl);
	}

	// -------------------------------------------------------------------------
	// Hook into both editors
	// -------------------------------------------------------------------------

	function renderPanel(containerEl, editorSource, hostState) {
		injectStyles();
		wp.element.render(
			el(ParagraphStylesPanel, { editorSource: editorSource, hostState: hostState || null }),
			containerEl
		);
	}

	// Wait for typostHooks to be available
	function waitForHooks(callback) {
		if (window.typostHooks) {
			callback();
			return;
		}
		// Poll briefly — hooks initialize before extensions load
		var attempts = 0;
		var interval = setInterval(function() {
			attempts++;
			if (window.typostHooks) {
				clearInterval(interval);
				callback();
			} else if (attempts > 50) {
				clearInterval(interval);
			}
		}, 100);
	}

	waitForHooks(function() {
		// Inline editor — top of modal
		// The host's state rides along: its saved selection range is what the
		// style browser hands back so the modal can reopen where it was.
		window.typostHooks.addAction('typost_inline_modal_top', function(el, state) {
			renderPanel(el, 'inline', state);
		}, 10);

		// Typography Stylist block — Quick Feature Toggle top
		window.typostHooks.addAction('typost_qft_modal_top', function(el) {
			renderPanel(el, 'qft');
		}, 10);

		// Typography Stylist block — Inspector Controls sidebar top
		window.typostHooks.addAction('typost_inspector_top', function(el) {
			renderPanel(el, 'inspector');
		}, 10);

		// Re-render on modal open to refresh styles list and detect active style
		window.typostHooks.addAction('typost_inline_modal_opened', function(state) {
			var hookEl = document.querySelector('[data-hook="typost_inline_modal_top"]');
			if (hookEl) {
				renderPanel(hookEl, 'inline', state);
			}
		}, 10);

		// Optional direct-access button in the Typography Stylist block toolbar.
		// Block-level only: a paragraph style describes a whole block, and the
		// 'inspector' apply route it uses targets the selected block.
		if (toolbarButtonEnabled()) {
			window.typostHooks.addFilter('typost_editor_toolbar_buttons', function(buttons) {
				return buttons.concat([{
					id: 'paragraph-styles',
					icon: PSIcon,
					label: __('Paragraph Styles', 'typost-paragraph-styles'),
					editors: ['qft'],
					onClick: openBrowser,
				}]);
			}, 10);
			window.typostHooks.doAction('typost_editor_toolbar_buttons_changed');
		}
	});

})();

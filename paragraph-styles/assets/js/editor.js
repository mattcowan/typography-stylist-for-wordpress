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
	var useCallback    = wp.element.useCallback;
	var useMemo        = wp.element.useMemo;
	var SelectControl  = wp.components.SelectControl;
	var Button         = wp.components.Button;
	var TextControl    = wp.components.TextControl;
	var Modal          = wp.components.Modal;
	var __             = wp.i18n.__;

	var utils                    = window.typostPSUtils;
	var findFontName             = utils.findFontName;
	var isStyleModified          = utils.isStyleModified;
	var buildPropertiesFromState = utils.buildPropertiesFromState;
	var buildApplyEventDetail    = utils.buildApplyEventDetail;
	var buildStylePreviewStyle   = utils.buildStylePreviewStyle;

	/**
	 * Toolbar icon: "Ps" — Bookmania Regular, P from `salt` alternate #2 with a
	 * roman s, outlined and scaled to the same cap height as core's swash "T"
	 * icon. The viewBox is wider than tall so the cap height matches its
	 * neighbours instead of shrinking to fit a square.
	 */
	var PS_ICON_PATH = 'M533.134 422.428L533.134 805.596C533.134 959.568 507.276 1004.232 436.754 1004.232C372.109 1004.232 394.441 897.274 314.517 897.274C282.782 897.274 255.749 923.132 255.749 960.744C255.749 1003.057 298.062 1063 414.422 1063C554.290 1063 649.494 981.900 649.494 806.771L649.494 422.428L825.799 422.428C1022.084 422.428 1159.601 366.011 1159.601 213.214C1159.601 60.417 1022.084 4 826.974 4L355.654 4C142.914 4 23.027 127.413 23.027 277.859C23.027 408.324 108.829 497.651 231.066 497.651C332.147 497.651 407.370 434.182 407.370 338.978C407.370 293.139 381.512 252.001 333.322 252.001C294.536 252.001 263.976 279.034 263.976 323.698C263.976 357.784 287.483 375.414 287.483 400.097C287.483 428.305 263.976 443.585 222.839 443.585C147.615 443.585 81.795 373.063 81.795 277.859C82.971 141.517 185.227 56.891 355.654 56.891L439.105 56.891C514.328 56.891 533.134 75.697 533.134 137.991ZM1030.311 213.214C1030.311 321.347 957.439 370.713 825.799 370.713L649.494 370.713L649.494 92.152C649.494 69.820 662.423 56.891 684.755 56.891L826.974 56.891C957.439 56.891 1030.311 106.256 1030.311 213.214ZM1264.208 400.097C1264.208 356.608 1299.469 323.698 1371.166 323.698C1451.090 323.698 1520.437 360.134 1575.679 457.689L1601.537 448.286L1567.451 296.665L1538.067 296.665L1526.314 326.049C1491.053 299.016 1438.161 279.034 1364.114 279.034C1250.104 279.034 1172.530 348.381 1172.530 433.007C1172.530 642.221 1550.996 552.893 1550.996 703.340C1550.996 770.335 1488.702 798.544 1426.408 798.544C1326.502 798.544 1250.104 752.705 1179.582 641.046L1153.724 649.273L1196.037 826.752L1226.597 826.752L1240.701 787.966C1281.839 819.700 1352.360 844.383 1427.583 844.383C1547.470 844.383 1637.973 776.212 1637.973 670.430C1637.973 451.812 1264.208 535.263 1264.208 400.097Z';

	function PSIcon() {
		return el('svg', {
			height: 24,
			width: 37,
			viewBox: '0 0 1661 1067',
			xmlns: 'http://www.w3.org/2000/svg',
			'aria-hidden': 'true',
			focusable: 'false'
		}, el('path', { d: PS_ICON_PATH, fill: 'currentColor' }));
	}

	// Get paragraph styles from localized data
	function getStyles() {
		return (window.typostData && window.typostData.paragraphStyles) || [];
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

		// Check if current state is modified from the active style
		var modified = useMemo(function() {
			if (!activeStyle) return false;
			if (!window.typostHooks) return false;
			var editorType = editorSource === 'inspector' ? 'qft' : editorSource;
			var state = window.typostHooks.applyFilters('typost_current_editor_state', {}, editorType);
			return isStyleModified(state, activeStyle.properties);
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

			setActiveStyleId(style.id);
			dispatchApply(style, editorSource);
		}, [currentStyles, editorSource]);

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
				el(SelectControl, {
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
	 * Props:
	 *   activeStyleId: number — style currently on the block (0 for none)
	 *   onClose: function
	 */
	function ParagraphStylesBrowser(props) {
		var stylesState      = useState(getStyles());
		var currentStyles    = stylesState[0];
		var setCurrentStyles = stylesState[1];

		var activeState    = useState(props.activeStyleId || 0);
		var activeStyleId  = activeState[0];
		var setActiveStyleId = activeState[1];

		useEffect(function() {
			function onStylesUpdated() {
				setCurrentStyles(getStyles());
			}
			document.addEventListener('typost-paragraph-styles-updated', onStylesUpdated);
			return function() {
				document.removeEventListener('typost-paragraph-styles-updated', onStylesUpdated);
			};
		}, []);

		// Applying and detaching are both terminal: close afterwards so the
		// author sees the result on the block instead of through a modal, and
		// so focus returns to the toolbar button. Closing also avoids stranding
		// keyboard focus — detaching unmounts the very button that was clicked,
		// which would otherwise drop focus to the document root.
		// With text selected, the style wraps that text; with only a caret it
		// applies to the whole block. Styling one word must not restyle its
		// neighbours just because they carry no explicit styling of their own.
		var applyTo = props.hasSelection ? 'selection' : undefined;

		var onApply = useCallback(function(style) {
			setActiveStyleId(style.id);
			dispatchApply(style, 'inspector', undefined, applyTo);
			props.onClose();
		}, [props.onClose, applyTo]);

		var onDetach = useCallback(function() {
			setActiveStyleId(0);
			if (applyTo === 'selection') {
				// Strip the style from the selected text only
				dispatchApply(null, 'inspector', {}, applyTo);
				props.onClose();
				return;
			}
			var state = window.typostHooks
				? window.typostHooks.applyFilters('typost_current_editor_state', {}, 'qft')
				: {};
			dispatchApply(null, 'inspector', buildPropertiesFromState(state));
			props.onClose();
		}, [props.onClose, applyTo]);

		var rows = currentStyles.map(function(style) {
			var preview = buildStylePreviewStyle(style.properties);
			var isActive = String(style.id) === String(activeStyleId);
			var fontName = getFontName(style.properties && style.properties.fontId);
			var meta = [fontName];
			if (style.properties && style.properties.fontWeight) {
				meta.push(style.properties.fontWeight);
			}
			if (preview.sizeLabel) {
				meta.push(preview.sizeLabel);
			}

			return el('li', { key: style.id, className: 'typost-ps-browser-item' },
				el('button', {
					type: 'button',
					className: 'typost-ps-browser-row' + (isActive ? ' is-active' : ''),
					'aria-pressed': isActive,
					onClick: function() { onApply(style); },
				},
					el('span', {
						className: 'typost-ps-browser-sample typost-ps-' + style.id,
						style: preview.style,
						// Purely visual: the sample text is the style name, which
						// the meta line below already announces along with the
						// font, weight and size. Without this the name is read twice.
						'aria-hidden': 'true',
					}, style.name),
					el('span', { className: 'typost-ps-browser-meta' },
						el('span', { className: 'typost-ps-browser-name' }, style.name),
						el('span', { className: 'typost-ps-browser-detail' }, meta.join(' · '))
					)
				)
			);
		});

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
			currentStyles.length === 0
				? el('p', { className: 'typost-ps-browser-empty' },
					__('No paragraph styles saved yet. Set up the typography you want, then use "Save Current Settings as Style" in the sidebar.', 'typost-paragraph-styles'))
				: el('ul', { className: 'typost-ps-browser-list' }, rows),
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

	function closeBrowser() {
		if (browserRoot) {
			wp.element.unmountComponentAtNode(browserRoot);
			if (browserRoot.parentNode) {
				browserRoot.parentNode.removeChild(browserRoot);
			}
			browserRoot = null;
		}
	}

	function openBrowser(context) {
		injectStyles();
		closeBrowser();
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
		var hasSelection = !!(captured && captured.start !== captured.end);

		wp.element.render(
			el(ParagraphStylesBrowser, {
				activeStyleId: state.paragraphStyleId || 0,
				hasSelection: hasSelection,
				onClose: closeBrowser,
			}),
			browserRoot
		);
	}

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
			'.typost-ps-browser-list { list-style: none; margin: 0; padding: 0; }',
			'.typost-ps-browser-item + .typost-ps-browser-item { border-top: 1px solid #e0e0e0; }',
			'.typost-ps-browser-row { display: flex; flex-direction: column; gap: 6px; width: 100%; padding: 14px 12px; background: none; border: 0; border-radius: 4px; cursor: pointer; text-align: left; }',
			'.typost-ps-browser-row:hover { background: #f0f0f0; }',
			'.typost-ps-browser-row:focus-visible { outline: 2px solid #007cba; outline-offset: -2px; }',
			'.typost-ps-browser-row.is-active { background: #f0f6fc; box-shadow: inset 3px 0 0 #007cba; }',
			// Long sample text must not push the modal wide
			'.typost-ps-browser-sample { display: block; color: #1e1e1e; overflow-wrap: anywhere; }',
			'.typost-ps-browser-meta { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; }',
			'.typost-ps-browser-name { font-size: 13px; font-weight: 600; color: #1e1e1e; }',
			'.typost-ps-browser-detail { font-size: 11px; color: #757575; }',
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

	function renderPanel(containerEl, editorSource) {
		injectStyles();
		wp.element.render(
			el(ParagraphStylesPanel, { editorSource: editorSource }),
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
		window.typostHooks.addAction('typost_inline_modal_top', function(el) {
			renderPanel(el, 'inline');
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
		window.typostHooks.addAction('typost_inline_modal_opened', function() {
			var hookEl = document.querySelector('[data-hook="typost_inline_modal_top"]');
			if (hookEl) {
				renderPanel(hookEl, 'inline');
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

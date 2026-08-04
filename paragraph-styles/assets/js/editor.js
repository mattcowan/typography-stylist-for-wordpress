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
	var __             = wp.i18n.__;

	var utils                    = window.typostPSUtils;
	var findFontName             = utils.findFontName;
	var isStyleModified          = utils.isStyleModified;
	var buildPropertiesFromState = utils.buildPropertiesFromState;
	var buildApplyEventDetail    = utils.buildApplyEventDetail;

	// Get paragraph styles from localized data
	function getStyles() {
		return (window.typostData && window.typostData.paragraphStyles) || [];
	}

	// Resolve font name from font ID using typostData.fonts
	function getFontName(fontId) {
		var fonts = (window.typostData && window.typostData.fonts) || [];
		return findFontName(fontId, fonts) || __('Default', 'typost-paragraph-styles');
	}

	// Dispatch the apply event for a style (or a detach when style is null)
	function dispatchApply(style, editorSource, detachProperties) {
		document.dispatchEvent(new CustomEvent('typost-apply-block-properties', {
			detail: buildApplyEventDetail(style, editorSource, detachProperties),
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
	});

})();

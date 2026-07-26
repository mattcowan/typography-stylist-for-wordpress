/**
 * Typography Stylist - Variable Fonts: Editor Script
 *
 * Hooks into both the inline editor (block-editor.js) and the Typography
 * Stylist block editor (edit.js) via window.typostHooks to render variable
 * font axis sliders that replace the standard weight dropdown and add
 * controls for non-weight axes (width, slant, optical size, custom).
 *
 * Uses wp.element.render() with WordPress components (no build step).
 */
(function() {
	'use strict';

	var el            = wp.element.createElement;
	var useState      = wp.element.useState;
	var useCallback   = wp.element.useCallback;
	var useEffect     = wp.element.useEffect;
	var useRef        = wp.element.useRef;
	var Fragment      = wp.element.Fragment;
	var RangeControl  = wp.components.RangeControl;
	var Button        = wp.components.Button;
	var __            = wp.i18n.__;

	// -------------------------------------------------------------------------
	// Data access
	// -------------------------------------------------------------------------

	/**
	 * Get axes array for a given numeric font ID.
	 * Returns null if font has no variable axes configured.
	 */
	function getAxesForFont(fontId) {
		if (!fontId) return null;
		var data = window.typostData && window.typostData.variableFontAxes;
		if (!data) return null;
		var axes = data[String(fontId)];
		return (axes && axes.length > 0) ? axes : null;
	}

	/**
	 * Get {isVariable, hideWeights} flags for a given numeric font ID.
	 * Returns null when the font is not flagged variable.
	 */
	function getFlagsForFont(fontId) {
		if (!fontId) return null;
		var data = window.typostData && window.typostData.variableFontFlags;
		if (!data) return null;
		return data[String(fontId)] || null;
	}

	// Pure parsing/building utilities live in lib/variation-utils.js
	// (enqueued as a dependency; shared with Jest tests).
	var parseVariationSettings = window.typostVFUtils.parseVariationSettings;
	var buildVariationSettings = window.typostVFUtils.buildVariationSettings;

	/**
	 * Read the current font-variation-settings from the selected text in the editor.
	 * Checks for data-font-variation-settings attribute on typost-styled spans.
	 */
	function getCurrentVariationSettings() {
		var sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) return {};
		var node = sel.focusNode;
		if (!node) return {};
		var el = node.nodeType === 3 ? node.parentElement : node;
		while (el) {
			if (el.classList && el.classList.contains('typost-styled')) {
				var attr = el.getAttribute('data-font-variation-settings');
				if (attr) return parseVariationSettings(attr);
			}
			el = el.parentElement;
		}
		return {};
	}

	// -------------------------------------------------------------------------
	// Quick buttons computation
	// -------------------------------------------------------------------------

	var getQuickButtons = window.typostVFUtils.getQuickButtons;

	// -------------------------------------------------------------------------
	// Debounce utility
	// -------------------------------------------------------------------------

	var debounceTimers = {};
	var debounceCounter = 0;

	function createDebouncedDispatch(delay) {
		var timerId = 'vf_' + (++debounceCounter);
		var dispatch = function(variationSettingsObj, editorType) {
			clearTimeout(debounceTimers[timerId]);
			debounceTimers[timerId] = setTimeout(function() {
				dispatchVariationSettings(variationSettingsObj, editorType);
			}, delay);
		};
		dispatch.timerId = timerId;
		return dispatch;
	}

	function dispatchVariationSettings(variationSettingsObj, editorType) {
		var settingsStr = buildVariationSettings(variationSettingsObj);
		document.dispatchEvent(new CustomEvent('typost-apply-block-properties', {
			detail: {
				properties: {
					fontVariationSettings: settingsStr
				},
				source: editorType
			}
		}));
	}

	// -------------------------------------------------------------------------
	// Axis Slider Component
	// -------------------------------------------------------------------------

	function AxisSlider(props) {
		var axis = props.axis;
		var currentValue = props.value;
		var onChange = props.onChange;
		var onQuickButton = props.onQuickButton;

		var quickButtons = getQuickButtons(axis);

		// Determine step size
		var step = 1;
		if (axis.tag === 'wdth' || axis.tag === 'opsz') {
			step = 0.5;
		} else if (axis.tag === 'slnt') {
			step = 1;
		} else if (axis.tag === 'ital') {
			step = 0.01;
		}

		// Format suffix for display
		var suffix = '';
		if (axis.tag === 'wdth') suffix = '%';

		return el('div', { className: 'typost-vf-axis' },
			el(RangeControl, {
				label: axis.name || axis.tag,
				value: currentValue,
				onChange: onChange,
				min: axis.min,
				max: axis.max,
				step: step,
				withInputField: true,
				__nextHasNoMarginBottom: true
			}),
			quickButtons.length > 0 && el('div', { className: 'typost-vf-quick-buttons' },
				quickButtons.map(function(val) {
					var isActive = Math.abs(currentValue - val) < 0.01;
					return el(Button, {
						key: val,
						isSmall: true,
						variant: isActive ? 'primary' : 'secondary',
						className: 'typost-vf-quick-btn' + (isActive ? ' is-active' : ''),
						onClick: function() { onQuickButton(val); }
					}, val + suffix);
				})
			)
		);
	}

	// -------------------------------------------------------------------------
	// Axes Panel Component
	// -------------------------------------------------------------------------

	// Shared axis-adjustment sessions, one per editor surface. The weight
	// panel and the custom-axes panel are separate mounts but must compose a
	// single font-variation-settings value; the session also tracks which
	// axes were actually touched, because ONLY touched axes may be emitted —
	// emitting untouched axes pins them to the font file's defaults (for
	// Fraunces that meant "wght" 900: moving the WONK slider turned the text
	// Black). Refcounted so the session dies when the popover closes.
	var axisSessions = {};

	function acquireAxisSession(editorType, axes, initialSettings) {
		var session = axisSessions[editorType];
		if (!session) {
			session = { values: {}, touched: {}, refs: 0 };
			axisSessions[editorType] = session;
		}
		window.typostVFUtils.mergeAxisSession(session, axes, initialSettings);
		session.refs++;
		return session;
	}

	function releaseAxisSession(editorType) {
		var session = axisSessions[editorType];
		if (!session) return;
		session.refs--;
		if (session.refs <= 0) {
			delete axisSessions[editorType];
		}
	}

	function AxesPanel(props) {
		var axes = props.axes;
		var editorType = props.editorType;
		var filterAxes = props.filterAxes; // optional: 'wght' for weight control, 'non-wght' for others
		var initialSettings = props.initialSettings || {};

		// Join (or start) the shared session for this editor surface
		var sessionRef = useRef(null);
		if (sessionRef.current === null) {
			sessionRef.current = acquireAxisSession(editorType, axes, initialSettings);
		}
		useEffect(function() {
			return function() {
				releaseAxisSession(editorType);
			};
		}, []); // eslint-disable-line react-hooks/exhaustive-deps

		var forceUpdateRef = useRef(0);
		var forceUpdate = useState(0);
		var setForceUpdate = forceUpdate[1];

		// Create debounced dispatch once
		var debouncedRef = useRef(null);
		if (debouncedRef.current === null) {
			debouncedRef.current = createDebouncedDispatch(400);
		}

		// Cleanup only this instance's debounce timer on unmount
		useEffect(function() {
			var id = debouncedRef.current.timerId;
			return function() {
				clearTimeout(debounceTimers[id]);
				delete debounceTimers[id];
			};
		}, []);

		// Filter axes based on type
		var displayAxes = axes;
		if (filterAxes === 'wght') {
			displayAxes = axes.filter(function(a) { return a.tag === 'wght'; });
		} else if (filterAxes === 'non-wght') {
			displayAxes = axes.filter(function(a) { return a.tag !== 'wght'; });
		}

		if (displayAxes.length === 0) return null;

		function handleSliderChange(tag, newValue) {
			sessionRef.current.values[tag] = newValue;
			sessionRef.current.touched[tag] = true;
			forceUpdateRef.current++;
			setForceUpdate(forceUpdateRef.current);
			// Debounced dispatch for slider drags — touched axes only
			debouncedRef.current(window.typostVFUtils.pickTouchedSettings(sessionRef.current), editorType);
		}

		function handleQuickButton(tag, newValue) {
			sessionRef.current.values[tag] = newValue;
			sessionRef.current.touched[tag] = true;
			forceUpdateRef.current++;
			setForceUpdate(forceUpdateRef.current);
			// Instant dispatch for button clicks — touched axes only
			dispatchVariationSettings(window.typostVFUtils.pickTouchedSettings(sessionRef.current), editorType);
		}

		function handleReset() {
			// Reset means "back to natural rendering": stop emitting these axes
			// entirely rather than pinning them to the font file's defaults
			for (var i = 0; i < displayAxes.length; i++) {
				sessionRef.current.values[displayAxes[i].tag] = displayAxes[i]['default'];
				delete sessionRef.current.touched[displayAxes[i].tag];
			}
			forceUpdateRef.current++;
			setForceUpdate(forceUpdateRef.current);
			dispatchVariationSettings(window.typostVFUtils.pickTouchedSettings(sessionRef.current), editorType);
		}

		return el('div', { className: 'typost-vf-axes-panel' },
			displayAxes.map(function(axis) {
				return el(AxisSlider, {
					key: axis.tag,
					axis: axis,
					value: sessionRef.current.values[axis.tag] !== undefined
						? sessionRef.current.values[axis.tag]
						: axis['default'],
					onChange: function(v) { handleSliderChange(axis.tag, v); },
					onQuickButton: function(v) { handleQuickButton(axis.tag, v); }
				});
			}),
			el('div', { className: 'typost-vf-reset-row' },
				el(Button, {
					isSmall: true,
					variant: 'tertiary',
					onClick: handleReset
				}, __('Reset to defaults', 'typost-variable-fonts'))
			)
		);
	}

	// -------------------------------------------------------------------------
	// CSS injection
	// -------------------------------------------------------------------------

	var stylesInjected = false;

	function injectStyles() {
		if (stylesInjected) return;
		stylesInjected = true;

		var css = [
			'.typost-vf-axes-panel { margin: 8px 0; }',
			'.typost-vf-axis { margin-bottom: 12px; }',
			'.typost-vf-axis .components-range-control__root { margin-bottom: 4px; }',
			'.typost-vf-quick-buttons { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }',
			'.typost-vf-quick-btn.components-button { min-width: 36px; padding: 2px 6px; font-size: 11px; height: 24px; }',
			'.typost-vf-reset-row { margin-top: 8px; text-align: right; }',
			// Non-wght axes section styling
			'.typost-vf-other-axes { border-top: 1px solid #e0e0e0; padding-top: 12px; margin-top: 4px; }',
			'.typost-vf-other-axes-label { font-size: 11px; font-weight: 600; text-transform: uppercase; color: #757575; margin-bottom: 8px; }',
			// Hook container overrides
			'[data-hook="typost_weight_control"] .typost-vf-axes-panel { margin: 0; }',
			'[data-hook="typost_inspector_after_font_weight"] .typost-vf-other-axes { border-top: none; padding-top: 0; }',
			// Inline format modal: bare hook container — match native section metrics
			'[data-hook="typost_inline_after_font_controls"] .typost-vf-other-axes { margin: 0 1rem; padding: 16px 20px; border-top: none; border-bottom: 1px solid #ddd; }',
		].join('\n');

		var styleEl = document.createElement('style');
		styleEl.textContent = css;
		document.head.appendChild(styleEl);
	}

	// -------------------------------------------------------------------------
	// Render helpers
	// -------------------------------------------------------------------------

	function renderWeightControl(containerEl, state) {
		var fontId = window.typostVFUtils.resolveWeightControlFontId(state);
		var axes = getAxesForFont(fontId);
		if (!axes) return;

		var wghtAxis = null;
		for (var i = 0; i < axes.length; i++) {
			if (axes[i].tag === 'wght') {
				wghtAxis = axes[i];
				break;
			}
		}
		if (!wghtAxis) return;

		injectStyles();

		// Determine editor type from the container context
		var editorType = 'inline';
		var hookEl = containerEl.closest('[data-hook]');
		if (hookEl) {
			var hookName = hookEl.getAttribute('data-hook');
			if (hookName === 'typost_weight_control') {
				// Check parent context. The QFT check must come first: the QFT
				// modal contains .components-panel__body sections too, and its
				// container class is .typost-block-modal (the old
				// .typost-qft-popover selector matched nothing — the QFT weight
				// slider silently dispatched as 'inline' and was dropped).
				if (containerEl.closest('.typost-block-modal') ||
					containerEl.closest('[data-hook="typost_qft_modal_top"]') ||
					containerEl.closest('.typost-qft-popover')) {
					editorType = 'qft';
				} else if (containerEl.closest('.components-panel__body')) {
					editorType = 'inspector';
				}
			}
		}

		// Get current variation settings from selection
		var currentSettings = getCurrentVariationSettings();

		wp.element.render(
			el(AxesPanel, {
				axes: axes,
				editorType: editorType,
				filterAxes: 'wght',
				initialSettings: currentSettings
			}),
			containerEl
		);
	}

	function renderOtherAxes(containerEl, state, editorType) {
		var fontId = window.typostVFUtils.resolveAxesFontId(state);
		var axes = getAxesForFont(fontId);
		if (!axes) return;

		// Check if there are non-wght axes
		var nonWghtAxes = axes.filter(function(a) { return a.tag !== 'wght'; });
		if (nonWghtAxes.length === 0) return;

		injectStyles();

		// Get current variation settings from selection
		var currentSettings = getCurrentVariationSettings();

		wp.element.render(
			el('div', { className: 'typost-vf-other-axes' },
				el('div', { className: 'typost-vf-other-axes-label' },
					__('Variable Font Axes', 'typost-variable-fonts')
				),
				el(AxesPanel, {
					axes: axes,
					editorType: editorType,
					filterAxes: 'non-wght',
					initialSettings: currentSettings
				})
			),
			containerEl
		);
	}

	// -------------------------------------------------------------------------
	// Hook registration
	// -------------------------------------------------------------------------

	function waitForHooks(callback) {
		if (window.typostHooks) {
			callback();
			return;
		}
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
		// Filter: hideWeights gates everything — when set, a wght axis renders
		// the slider (no wght axis hides the weight control entirely); when
		// unchecked in admin, the standard dropdown is kept even for wght
		// fonts (non-wght axes still render in their own panel).
		window.typostHooks.addFilter('typost_weight_control', function(type, fontId) {
			return window.typostVFUtils.resolveWeightControlType(
				type,
				getAxesForFont(fontId),
				getFlagsForFont(fontId)
			);
		}, 10);

		// Action: Render wght slider into weight control hook container
		window.typostHooks.addAction('typost_weight_control', function(containerEl, state) {
			renderWeightControl(containerEl, state);
		}, 10);

		// Inline editor: non-wght axes below font controls
		window.typostHooks.addAction('typost_inline_after_font_controls', function(containerEl, state) {
			renderOtherAxes(containerEl, state, 'inline');
		}, 10);

		// QFT: non-wght axes below font controls
		window.typostHooks.addAction('typost_qft_after_font_controls', function(containerEl, state) {
			renderOtherAxes(containerEl, state, 'qft');
		}, 10);

		// Inspector: non-wght axes below font weight
		window.typostHooks.addAction('typost_inspector_after_font_weight', function(containerEl, state) {
			renderOtherAxes(containerEl, state, 'inspector');
		}, 10);
	});

})();

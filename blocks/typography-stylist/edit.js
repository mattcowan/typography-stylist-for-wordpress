/**
 * Typography Stylist Block - Editor Component
 */

import { __, sprintf } from '@wordpress/i18n';
import {
	useBlockProps,
	InspectorControls,
	BlockControls,
	AlignmentToolbar,
	RichText,
	RichTextToolbarButton,
	store as blockEditorStore
} from '@wordpress/block-editor';
import {
	
	
	
	
	
	ToolbarGroup,
	ToolbarDropdownMenu,
	ToolbarButton,
	Popover
} from '@wordpress/components';
import { useState, useRef, useEffect, useMemo } from '@wordpress/element';
import { hasBlockSupport } from '@wordpress/blocks';
import { useSelect } from '@wordpress/data';
import {  } from '@wordpress/rich-text';
import { parseInlineStylesAtCursor, getFilteredWeightOptions as getFilteredWeightOptionsUtil, getClosestWeight as getClosestWeightUtil, ALL_WEIGHT_OPTIONS, filterFeaturesByVisibility, wrapFitLines, unwrapFitLines, installModalFocusGuard, resolveScreenReaderClassControl, normalizeHang, buildFitLinePreviews, parseFixedFontSize, resolveFontSizeUnit, pxToRem, resolveStyleFontSizeUnit, getNewFontSizeUnit } from './utils';
import { buildFontOptions, resolveFontIdFromFamily } from '../../assets/js/font-options.js';
import renderQuickFeatureToggles from './components/quick-feature-toggles';
import renderHelpPanel from './components/inspector/help-panel';
import renderFontFamilyPanel from './components/inspector/font-family-panel';
import renderFontWeightPanel from './components/inspector/font-weight-panel';
import renderResetPanel from './components/inspector/reset-panel';
import getCategoryTitle from './feature-categories';
import buildEditorStyle from './editor-style';
import renderFontStylePanel from './components/inspector/font-style-panel';
import renderCasePanel from './components/inspector/case-panel';
import renderFontSizePanel from './components/inspector/font-size-panel';
import renderLineHeightPanel from './components/inspector/line-height-panel';
import renderLetterSpacingPanel from './components/inspector/letter-spacing-panel';
import renderFirstLetterHangPanel from './components/inspector/first-letter-hang-panel';
import renderFeaturesPanel from './components/inspector/features-panel';
import renderAccessibilityPanel from './components/inspector/accessibility-panel';
import useDebouncedAppliers from './hooks/use-debounced-appliers';
import useApplyBlockProperties from './hooks/use-apply-block-properties';
import { removePreviewSpans } from './qft-preview';
import useInsertContent from './hooks/use-insert-content';
import useQftEditorState from './hooks/use-qft-editor-state';
import useGlyphsPanelReopen from './hooks/use-glyphs-panel-reopen';
import useExtensionToolbarButtons from './hooks/use-extension-toolbar-buttons';
import useComputedFont from './hooks/use-computed-font';
import useFitMeasurement from './hooks/use-fit-measurement';
import useQftSelectionStyles from './hooks/use-qft-selection-styles';
import useQftModalFrame from './hooks/use-qft-modal-frame';
import useQftModalDragListeners from './hooks/use-qft-modal-drag-listeners';
import useParagraphStyleSync from './hooks/use-paragraph-style-sync';
import createControlActions from './qft/control-actions';
import createModalActions from './qft/modal-actions';
import createSpacingActions from './qft/spacing-actions';
import createFitSpanActions from './qft/fit-span-actions';
import createFontActions from './qft/font-actions';
import createFeatureActions from './qft/feature-actions';
import createParagraphStyleActions from './qft/paragraph-style-actions';
import createResetActions from './qft/reset-actions';

// Keep keyboard focus inside the plugin's modals (inline modal, QFT modal,
// Glyphs panel, Paragraph Styles browser) when RichText re-applies a
// selection after an apply/insert. Firefox moves focus into the canvas
// iframe on that write, stranding keyboard users outside an open dialog.
// The guard lives on the editor document, so one install covers every editor.
installModalFocusGuard();

/**
 * Typography Stylist Hook System
 *
 * Lightweight action/filter system for extension plugins.
 * Duplicated from block-editor.js due to separate build pipelines.
 *
 * @since 2.0.0
 */
window.typostHooks = window.typostHooks || {
	_actions: {},
	_filters: {},
	addAction: function(name, callback, priority) {
		priority = priority || 10;
		this._actions[name] = this._actions[name] || [];
		this._actions[name].push({ callback: callback, priority: priority });
		this._actions[name].sort(function(a, b) { return a.priority - b.priority; });
	},
	doAction: function(name) {
		var args = Array.prototype.slice.call(arguments, 1);
		(this._actions[name] || []).forEach(function(h) { h.callback.apply(null, args); });
	},
	addFilter: function(name, callback, priority) {
		priority = priority || 10;
		this._filters[name] = this._filters[name] || [];
		this._filters[name].push({ callback: callback, priority: priority });
		this._filters[name].sort(function(a, b) { return a.priority - b.priority; });
	},
	applyFilters: function(name, value) {
		var args = Array.prototype.slice.call(arguments, 1);
		(this._filters[name] || []).forEach(function(h) {
			args[0] = h.callback.apply(null, args);
		});
		return args[0];
	},
	removeAction: function(name, callback) {
		if (!this._actions[name]) return;
		this._actions[name] = this._actions[name].filter(function(h) {
			return h.callback !== callback;
		});
	},
	removeFilter: function(name, callback) {
		if (!this._filters[name]) return;
		this._filters[name] = this._filters[name].filter(function(h) {
			return h.callback !== callback;
		});
	}
};

/**
 * Toolbar icon: a swash "T" — the launcher for this block's Quick Feature
 * Toggle popover. Source: assets/images/icons/toolbar-t.svg.
 *
 * Deliberately NOT the same mark as the `TSIcon` in index.js, which is the
 * "TS" monogram used to identify the block itself in the inserter. Same name,
 * two different jobs — do not "unify" them.
 *
 * 24×24 matches the swash G and P supplied by the Glyphs Panel and Paragraph
 * Styles modules, so the toolbar group sits on one cap height.
 */
const TSIcon = () => (
	<svg width={24} height={24} viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
		<path d="M86.93,19.59c51.57,0,99.2,30.44,125.69,30.44,12.4,0,13.25-12.96,22.26-12.96,5.92,0,8.74,3.95,8.74,7.89,0,10.43-16.06,26.21-48.19,26.21-10.71-.28-21.42-1.41-32.13-2.82v136.4c0,16.06,4.23,18.32,22.26,19.73v11.84h-94.41v-11.84c18.04-1.41,22.26-3.66,22.26-19.73V58.76c-18.6-3.95-34.94-7.61-48.47-7.61-20.01,0-35.23,10.71-35.23,30.15,0,9.58,4.79,18.04,12.68,18.04,10.15,0,12.4-16.63,30.44-16.63,12.68,0,22.54,10.15,22.54,22.83,0,16.63-13.25,28.75-34.94,28.75-26.21,0-50.16-18.6-50.16-52.98,0-37.76,35.79-61.72,76.65-61.72Z" fill="currentColor"/>
	</svg>
);

export default function Edit({ attributes, setAttributes, clientId, isSelected }) {
	/**
	 * Id of the Quick Feature Toggles heading, used to name its dialog.
	 *
	 * Derived from clientId because that is already unique per block instance,
	 * so two Typography Stylist blocks open on the same page cannot end up
	 * pointing their dialogs at the same heading.
	 */
	const qftTitleId = `typost-qft-title-${clientId}`;

	const {
		content,
		tagName,
		features,
		fontFamily,
		fontId,
		fontSize,
		fontSizeMin,
		fontSizePreferred,
		fontSizeMax,
		fontSizeUnit,
		fitLineSizes,
		fitMaxSize,
		fitWordSizes,
		initialHang,
		fitLineHangs,
		textCase,
		fakeSmallCaps,
		fontWeight,
		fontStyle,
		letterSpacing,
		lineHeight,
		screenReaderClass,
		textAlign,
		styleClass,
		fontVariationSettings
	} = attributes;

	// Unit the block writes its sizes in (#233): rem for new blocks, px for
	// blocks saved before rem existed (set by the deprecations' migrate()).
	// The editor preview uses the same unit as save.js, so both render the
	// same size. A span size set in the Quick Feature Toggles is written in
	// the site's new-content unit (getNewFontSizeUnit: rem, or px when the
	// Options setting asks for it, #248; buildInlineFontSizeSpan); other
	// span edits keep the size as stored.
	const blockFontSizeUnit = resolveFontSizeUnit(fontSizeUnit);

	// Slider readout. Sizes are always entered in px; in rem the readout also
	// shows the rem value written ("24px (1.5rem)"), in px it shows px only,
	// so it matches the markup. Called at render time, after
	// sizePreviewUnit (the size unit, which follows an active style) exists.
	const formatSizeReadout = (px, unit) => (unit === 'rem'
		? sprintf(
			/* translators: 1: font size in pixels, 2: the same size in rem (pixels divided by 16) */
			__('%1$spx (%2$srem)', 'typography-stylist'),
			px,
			pxToRem(px)
		)
		: `${px}px`);

	const [isPopoverOpen, setIsPopoverOpen] = useState(false);
	// Usage tips notice dismissal — shares the same localStorage key as the
	// inline format modal, so dismissing either hides both.
	const [tipsDismissed, setTipsDismissed] = useState(() => {
		try {
			return localStorage.getItem('typography_stylist_hide_modal_tips') === 'true';
		} catch (e) {
			return false;
		}
	});
	const dismissTips = () => {
		setTipsDismissed(true);
		try {
			localStorage.setItem('typography_stylist_hide_modal_tips', 'true');
		} catch (e) {
			// Local storage might not be available
		}
	};
	// Whether Enter starts a new block. Registered server-side from the
	// typost_block_enter_line_break option (see filter_block_splitting_support),
	// so the flag is fixed for the page and safe to read outside an effect.
	const splitOnEnter = hasBlockSupport('typost/block', 'splitting', false);
	const [previewText, setPreviewText] = useState('');
	const [inlineLetterSpacing, setInlineLetterSpacing] = useState(0);
	const [previewLetterSpacing, setPreviewLetterSpacing] = useState(0);
	const [inlineLineHeight, setInlineLineHeight] = useState(0);
	const [previewLineHeight, setPreviewLineHeight] = useState(0);
	// Fit-relative per-selection controls (fontSize: "fit" only):
	// scale is held as a percent (100 = no attribute), shift in em (0 = none)
	const [inlineFitScale, setInlineFitScale] = useState(100);
	const [inlineFitShift, setInlineFitShift] = useState(0);
	const [computedFont, setComputedFont] = useState('');
	const [inlineFontSize, setInlineFontSize] = useState('inherit');
	// A fixed size on the selection (64, from a paragraph style) has no
	// control in the QFT size menu; it is shown as a disabled option (#255)
	const inlineFixedSizePx = parseFixedFontSize(inlineFontSize);
	// Unit of the selection's size as it is written now (#233). A size the
	// author sets here is written in the site's new-content unit (rem, or px
	// with the #248 setting), and the re-detection that follows the apply
	// reports that; until then an older span keeps its own unit and slope,
	// which the zoom notice describes differently (#234).
	const [inlineFontSizeUnit, setInlineFontSizeUnit] = useState(() => getNewFontSizeUnit());
	const [inlineFontSizeMin, setInlineFontSizeMin] = useState(16);
	const [inlineFontSizePreferred, setInlineFontSizePreferred] = useState(32);
	const [inlineFontSizeMax, setInlineFontSizeMax] = useState(64);
	const [previewFontSize, setPreviewFontSize] = useState('inherit');
	const [previewFontSizeMin, setPreviewFontSizeMin] = useState(16);
	const [previewFontSizePreferred, setPreviewFontSizePreferred] = useState(32);
	const [previewFontSizeMax, setPreviewFontSizeMax] = useState(64);
	const [inlineFontWeight, setInlineFontWeight] = useState('inherit');
	const [inlineFontStyle, setInlineFontStyle] = useState('');
	// Case of the selected text (#309): '' = Default (none on the text)
	const [inlineTextCase, setInlineTextCase] = useState('');
	const [inlineFakeSmallCaps, setInlineFakeSmallCaps] = useState(true);
	// The shown case only comes from a paragraph style's class: nothing on
	// the text itself to reset (#309 review)
	const [inlineCaseFromStyle, setInlineCaseFromStyle] = useState(false);
	const [inlineFontFamily, setInlineFontFamily] = useState('');
	const [showInlineResetConfirm, setShowInlineResetConfirm] = useState(false);
	const [showFullResetConfirm, setShowFullResetConfirm] = useState(false);
	const [capturedSelection, setCapturedSelection] = useState(null);
	// Warning shown in the QFT modal after an inline apply both strategies
	// refused (null = none). See reportInlineApplyFailure().
	const [inlineApplyNotice, setInlineApplyNotice] = useState(null);

	// QFT modal position, size, drag and resize (hooks/use-qft-modal-frame.js)
	const modalFrame = useQftModalFrame();
	const {
		modalX, modalY, modalWidth, modalHeight, isDragging, isResizing,
		handleHeaderKeyDown, handleDragStart, handleResizeStart
	} = modalFrame;

	// Get selection from block editor store
	const { selectionStart, selectionEnd, selectedBlockClientId } = useSelect(
		(select) => {
			const {
				getSelectionStart,
				getSelectionEnd,
				getSelectedBlockClientId,
			} = select(blockEditorStore);

			return {
				selectionStart: getSelectionStart(),
				selectionEnd: getSelectionEnd(),
				selectedBlockClientId: getSelectedBlockClientId(),
			};
		},
		[]
	);

	// Store original letter spacing when opening popover
	const originalLetterSpacingRef = useRef(letterSpacing);

	// Store the original content before preview
	const originalContentRef = useRef(null);

	// The latest apply functions and the debounced auto-apply functions that
	// call them (hooks/use-debounced-appliers.js)
	const {
		applyLetterSpacingRef, applyLineHeightRef, applyFontFamilyRef, applyFontWeightRef, applyFontSizeRef,
		applyFontVariationSettingsRef, applyParagraphStyleRef, applyFitScaleRef, applyFitShiftRef,
		debouncedApplyLetterSpacing, debouncedApplyLineHeight, debouncedApplyFitScale, debouncedApplyFitShift,
		debouncedApplyFontFamily, debouncedApplyFontWeight, debouncedApplyFontSize
	} = useDebouncedAppliers();

	// The typost-apply-block-properties bridge (hooks/use-apply-block-properties.js).
	// blockPropsRef.current is assigned later, once fontIdMap and
	// getClosestWeight are declared.
	const blockPropsRef = useApplyBlockProperties({
		setAttributes, setInlineFontFamily, setInlineFontWeight, setInlineLetterSpacing, setInlineLineHeight,
		setInlineFontSize, setInlineFontSizeMin, setInlineFontSizePreferred, setInlineFontSizeMax,
		applyParagraphStyleRef, applyFontVariationSettingsRef
	});

	// typost-insert-content from extensions (hooks/use-insert-content.js)
	useInsertContent({ content, capturedSelection, selectionStart, selectionEnd, clientId, isPopoverOpen, setAttributes, setCapturedSelection, originalContentRef });

	// The shared typost_current_editor_state filter for the QFT editor
	// (hooks/use-qft-editor-state.js). The ref is filled in further below too.
	const qftStateRef = useQftEditorState(clientId, {
		fontId, fontWeight, fontStyle, fontSize, fontSizeMin, fontSizePreferred,
		fontSizeMax, fitMaxSize, letterSpacing, lineHeight, features, styleClass,
		fontVariationSettings, initialHang, textCase, fakeSmallCaps, layeredConfigId: attributes.layeredConfigId || 0,
		animationConfigId: attributes.animationConfigId || 0,
		content: attributes.content || '', tagName: attributes.tagName || 'h2',
		// inheritedFontId is filled in below, once fontIdMap exists
		// clientId of the block holding the active selection — used so only the
		// selected block answers the shared typost_current_editor_state filter.
		selectionClientId: selectionStart?.clientId || null
	});

	// Reopen the QFT modal when the Glyphs panel closes (hooks/use-glyphs-panel-reopen.js)
	useGlyphsPanelReopen(clientId, setIsPopoverOpen);

	// Extension toolbar buttons (hooks/use-extension-toolbar-buttons.js)
	const extensionToolbarButtons = useExtensionToolbarButtons();

	// The theme font the block inherits (hooks/use-computed-font.js)
	useComputedFont(fontFamily, clientId, setComputedFont);

	// Fit-to-width measurement and its re-measure triggers (hooks/use-fit-measurement.js)
	useFitMeasurement({
		fontSize, content, fontId, fontFamily, fontWeight, fontStyle, letterSpacing, features,
		fontVariationSettings, fitLineSizes, fitWordSizes, setAttributes, initialHang, fitLineHangs,
		textAlign, blockFontSizeUnit, clientId, textCase, fakeSmallCaps
	});

	// Fit-to-width editing value: the flat content attribute wrapped into
	// per-line typost-line spans (with <br> separators kept) for the
	// RichText. unwrapFitLines in onChange is the inverse; nothing outside
	// the render branch ever sees the wrapped form.
	const wrappedFitValue = useMemo(
		() => (fontSize === 'fit' && content ? wrapFitLines(content, fitLineSizes, fitMaxSize, fitLineHangs, blockFontSizeUnit, fitWordSizes) : ''),
		[fontSize, content, fitLineSizes, fitMaxSize, fitLineHangs, blockFontSizeUnit, fitWordSizes]
	);

	// Labels for the per-line hang controls (fit-to-width only)
	const hangLinePreviews = useMemo(
		() => (fontSize === 'fit' ? buildFitLinePreviews(content) : []),
		[fontSize, content]
	);

	// The QFT range and the inline styles at it, also published on qftStateRef
	// (hooks/use-qft-selection-styles.js)
	const {
		resolvedApplyRange,
		inlineStylesAtSelection,
		inlineFeaturesAtSelection,
		inlineDisabledFeaturesAtSelection,
		inlineFontFamilyAtSelection
	} = useQftSelectionStyles({ content, selectionStart, selectionEnd, clientId, capturedSelection, qftStateRef });

	// Document listeners while the QFT modal is dragged or resized
	// (hooks/use-qft-modal-drag-listeners.js)
	useQftModalDragListeners(modalFrame);

	// A refused inline apply leaves a warning in the modal (see
	// reportInlineApplyFailure). A refused apply never changes the content,
	// so any content change while the warning shows means a later apply,
	// insert or reset went through and the warning has served its purpose.
	useEffect(() => {
		setInlineApplyNotice(null);
	}, [content]);

	// Re-detect inline styles when selection changes while popover is open
	useEffect(() => {
		if (!isPopoverOpen) return; // Only when popover is open
		if (!selectionStart || !selectionEnd || selectionStart.clientId !== clientId) return;
		if (originalContentRef.current) return; // Preview active, don't re-detect

		const start = selectionStart.offset || 0;
		const end = selectionEnd.offset || 0;
		const detected = parseInlineStylesAtCursor(content, start, end);
		populateControlsFromDetectedStyles(detected);
	}, [isPopoverOpen, selectionStart?.offset, selectionEnd?.offset, content, clientId]);

	// Clean preview spans from content (prevents saving temporary preview state)
	useEffect(() => {
		// Only clean if content has preview spans AND preview is not currently active
		if (!content || !content.includes('typost-preview-temp')) return;
		if (originalContentRef.current) return; // Preview active, don't clean yet

		// Content has preview spans but no active preview - clean them
		const cleanedContent = removePreviewSpans(content);
		if (cleanedContent !== content) {
			setAttributes({ content: cleanedContent });
		}
	}, [content, setAttributes]);

	const blockProps = useBlockProps({
		className: 'wp-block-typost'
	});

	// Get available features from localized data, filtered by per-font visibility
	const allFeatures = window.typostData?.features || [];
	const visibilityMap = window.typostData?.fontFeatureVisibility || {};
	const availableFeatures = filterFeaturesByVisibility(allFeatures, fontId, visibilityMap);
	const groupedFeatures = {};
	availableFeatures.forEach(feature => {
		const category = feature.category || 'other';
		if (!groupedFeatures[category]) {
			groupedFeatures[category] = [];
		}
		groupedFeatures[category].push(feature);
	});

	// Get font options via the shared builder (assets/js/font-options.js) —
	// includes the WP Font Library group with wp:{slug} values for
	// unadopted fonts
	const { options: fontOptions, fontIdMap } = buildFontOptions(window.typostData || {});

	// Wrappers around utils.js helpers, binding to local fontIdMap
	// ALL_WEIGHT_OPTIONS is plain data that the unit tests compare as
	// English, so its labels are translated here at render time, by value.
	const weightOptionLabels = {
		inherit: __('Inherit from block', 'typography-stylist'),
		100: __('100 (Thin)', 'typography-stylist'),
		200: __('200 (Extra Light)', 'typography-stylist'),
		300: __('300 (Light)', 'typography-stylist'),
		400: __('400 (Normal)', 'typography-stylist'),
		500: __('500 (Medium)', 'typography-stylist'),
		600: __('600 (Semi Bold)', 'typography-stylist'),
		700: __('700 (Bold)', 'typography-stylist'),
		800: __('800 (Extra Bold)', 'typography-stylist'),
		900: __('900 (Black)', 'typography-stylist'),
	};
	const getFilteredWeightOptions = (targetFontId, includeInherit = false) =>
		getFilteredWeightOptionsUtil(targetFontId, fontIdMap, includeInherit).map((option) => ({
			...option,
			label: weightOptionLabels[option.value] || option.label,
		}));

	// True while "Custom" is chosen, so a typed class that starts with a
	// bundled name (sr-only-wide) does not switch the select back mid-word.
	const [screenReaderCustomMode, setScreenReaderCustomMode] = useState(() => resolveScreenReaderClassControl(screenReaderClass).isCustom);
	const screenReaderClassControl = resolveScreenReaderClassControl(screenReaderClass, screenReaderCustomMode);

	const getClosestWeight = (currentWeight, availableWeights) =>
		getClosestWeightUtil(currentWeight, availableWeights);

	// Update paragraph style ref now that fontIdMap/getClosestWeight are available
	blockPropsRef.current = { fontIdMap, fontWeight, getClosestWeight, clientId, isPopoverOpen, selectedBlockClientId, styleClass, textAlign, fontSize, blockTextColor: attributes.textColor, blockStyle: attributes.style, blockSizeAttrs: { fontSizeMin: attributes.fontSizeMin, fontSizePreferred: attributes.fontSizePreferred, fontSizeMax: attributes.fontSizeMax, fontSizeUnit: attributes.fontSizeUnit } };

	// Same reason: the shared editor state advertises the font the block
	// inherits from the theme when it has none of its own, so consumers that
	// need a real font file (the Glyphs panel) browse what the author can
	// actually see instead of falling back to the first font in the list.
	// computedFont is only detected while fontFamily is unset; a legacy block
	// storing a literal family name resolves from that instead.
	qftStateRef.current.inheritedFontId = fontId
		? 0
		: resolveFontIdFromFamily(computedFont || fontFamily, fontIdMap);

	// The paragraph style behind styleClass: re-sync on style updates, drop an
	// orphaned class, and the attributes that differ from the style
	// (hooks/use-paragraph-style-sync.js)
	const { activeParagraphStyle, styleOverrides } = useParagraphStyleSync({
		styleClass, setAttributes, qftStateRef, blockPropsRef,
		fontId, fontWeight, fontStyle, fontSize, fontSizeMin, fontSizePreferred, fontSizeMax, fitMaxSize,
		letterSpacing, lineHeight, features, fontVariationSettings, initialHang, textCase, fakeSmallCaps
	});
	// Under a paragraph style an edited size previews in the style's unit:
	// Update Style writes it there, and Detach gives the block that unit
	// (resolveDetachFontSizeUnit). The block's own unit says nothing while it
	// has a styleClass (#233).
	const sizePreviewUnit = activeParagraphStyle ? resolveStyleFontSizeUnit(activeParagraphStyle) : blockFontSizeUnit;
	// typost-hang gates the editor-only hang rules in editor.css (#242). The
	// attribute is the working copy, equal to the style's value unless edited.
	const hangClass = normalizeHang(initialHang) > 0 ? ' typost-hang' : '';
	const contentClassName = 'typost-block-content' + (activeParagraphStyle ? ` typost-styled ${styleClass}` : '') + hangClass;

	// Build inline style for preview
	const buildStyle = () => {
		return buildEditorStyle({
			features, fontId, fontFamily, fontWeight, fontStyle, letterSpacing, lineHeight, fontSize, fontSizeMin,
			fontSizePreferred, fontSizeMax, sizePreviewUnit, styleOverrides, fontVariationSettings, textAlign,
			initialHang, textCase, fakeSmallCaps
		});
	};

	// The Quick Feature Toggles and Inspector handlers (qft/*-actions.js).
	// They used to be closures declared one by one in this function; the
	// factories rebuild them on every render from these values, so each one
	// sees what it saw before. A factory also reads the functions that the
	// factories before it added to `qft`. No handler runs during render, so
	// building them here, after every value exists, changes nothing.
	const qft = {
		// Block
		clientId, content, features, letterSpacing, setAttributes, fontIdMap,
		// Selection
		selectionStart, selectionEnd, capturedSelection, setCapturedSelection, resolvedApplyRange,
		inlineStylesAtSelection, inlineFeaturesAtSelection,
		// Modal, preview and reset confirmations
		isPopoverOpen, setIsPopoverOpen, setPreviewText, originalContentRef, originalLetterSpacingRef, qftStateRef,
		setInlineApplyNotice, setShowInlineResetConfirm, setShowFullResetConfirm,
		previewLetterSpacing, setPreviewLetterSpacing, previewLineHeight, setPreviewLineHeight,
		previewFontSize, setPreviewFontSize, previewFontSizeMin, setPreviewFontSizeMin,
		previewFontSizePreferred, setPreviewFontSizePreferred, previewFontSizeMax, setPreviewFontSizeMax,
		// Control values for the selection
		inlineLetterSpacing, setInlineLetterSpacing, inlineLineHeight, setInlineLineHeight,
		inlineFitScale, setInlineFitScale, inlineFitShift, setInlineFitShift,
		inlineFontFamily, setInlineFontFamily, inlineFontWeight, setInlineFontWeight,
		inlineFontStyle, setInlineFontStyle, inlineTextCase, setInlineTextCase,
		setInlineFakeSmallCaps, inlineCaseFromStyle, setInlineCaseFromStyle,
		inlineFontSize, setInlineFontSize, setInlineFontSizeUnit, inlineFontSizeMin, setInlineFontSizeMin,
		inlineFontSizePreferred, setInlineFontSizePreferred, inlineFontSizeMax, setInlineFontSizeMax
	};
	Object.assign(qft, createControlActions(qft));
	const { populateControlsFromDetectedStyles, revertInlineControl } = qft;
	Object.assign(qft, createModalActions(qft));
	const { handleToolbarClick, handlePopoverClose, handleExtensionToolbarClick } = qft;
	Object.assign(qft, createSpacingActions(qft));
	const { clearLetterSpacing, clearLineHeight, applyLineHeightOnly, applyLetterSpacingOnly } = qft;
	Object.assign(qft, createFitSpanActions(qft));
	const { applyFitScaleOnly, applyFitShiftOnly, clearFitScale, clearFitShift } = qft;
	Object.assign(qft, createFontActions(qft));
	const {
		resetFontFamily, resetFontWeight, resetFontSize, applyInlineFontSize, applyInlineFontWeight,
		applyInlineFontVariationSettings, applyInlineFontStyle, resetFontStyle, applyInlineCase,
		resetInlineCase, applyInlineFontFamily
	} = qft;
	Object.assign(qft, createFeatureActions(qft));
	const { toggleFeature, toggleBlockFeature, applyFeatureToSelection } = qft;
	Object.assign(qft, createParagraphStyleActions(qft));
	const { applyInlineParagraphStyle } = qft;
	Object.assign(qft, createResetActions(qft));
	const { clearInlineFormatting, clearAllInlineFeatures, resetEntireBlock } = qft;

	// Store latest apply functions in refs for debounced auto-apply (avoids stale closures)
	applyLineHeightRef.current = applyLineHeightOnly;
	applyLetterSpacingRef.current = applyLetterSpacingOnly;
	applyFitScaleRef.current = applyFitScaleOnly;
	applyFitShiftRef.current = applyFitShiftOnly;
	applyFontSizeRef.current = applyInlineFontSize;
	applyFontWeightRef.current = applyInlineFontWeight;
	applyFontFamilyRef.current = applyInlineFontFamily;
	applyFontVariationSettingsRef.current = applyInlineFontVariationSettings;
	applyParagraphStyleRef.current = applyInlineParagraphStyle;

	return (
		<>
			<BlockControls>
				<ToolbarGroup>
					<ToolbarButton
						icon={TSIcon}
						label={__('Typography Stylist Features', 'typography-stylist')}
						onClick={handleToolbarClick}
						isActive={features.length > 0}
					/>
					{extensionToolbarButtons.map((button) => (
						<ToolbarButton
							key={button.id}
							icon={button.icon}
							label={button.label}
							isActive={!!button.isActive}
							onClick={() => handleExtensionToolbarClick(button)}
							className={`typost-ext-toolbar-button typost-ext-toolbar-button--${button.id}`}
						/>
					))}
					{/* The QFT modal and the sidebar panels below are render
					    functions (renderX), called here, not rendered as
					    components: their markup, filter calls
					    (typost_weight_control) and translations run during this
					    render, as when the markup was inline. They run inside
					    Edit, some only on a condition, so they must not call
					    hooks (__tests__/render-functions-no-hooks.test.js). */}
					{isPopoverOpen && (
						renderQuickFeatureToggles({
							applyFeatureToSelection, applyInlineCase, applyInlineFontSize, applyInlineFontStyle,
							availableFeatures, capturedSelection, clearFitScale, clearFitShift, clearInlineFormatting,
							clearLetterSpacing, clearLineHeight, clientId, computedFont, content, debouncedApplyFitScale,
							debouncedApplyFitShift, debouncedApplyFontFamily, debouncedApplyFontSize,
							debouncedApplyFontWeight, debouncedApplyLetterSpacing, debouncedApplyLineHeight, dismissTips,
							fakeSmallCaps, features, fontFamily, fontId, fontIdMap, fontOptions, fontSize, fontSizeMax,
							fontSizeMin, fontSizePreferred, fontStyle, fontVariationSettings, fontWeight,
							getCategoryTitle, getClosestWeight, getFilteredWeightOptions, groupedFeatures,
							handleDragStart, handleHeaderKeyDown, handlePopoverClose, handleResizeStart,
							inlineApplyNotice, inlineCaseFromStyle, inlineDisabledFeaturesAtSelection,
							inlineFakeSmallCaps, inlineFeaturesAtSelection, inlineFitScale, inlineFitShift,
							inlineFixedSizePx, inlineFontFamily, inlineFontFamilyAtSelection, inlineFontSize,
							inlineFontSizeMax, inlineFontSizeMin, inlineFontSizePreferred, inlineFontSizeUnit,
							inlineFontStyle, inlineFontWeight, inlineLetterSpacing, inlineLineHeight,
							inlineStylesAtSelection, inlineTextCase, isDragging, isResizing, letterSpacing, lineHeight,
							modalHeight, modalWidth, modalX, modalY, previewText, qftTitleId, resetFontFamily,
							resetFontSize, resetFontStyle, resetFontWeight, resetInlineCase, resolvedApplyRange,
							revertInlineControl, setInlineApplyNotice, setInlineFakeSmallCaps, setInlineFitScale,
							setInlineFitShift, setInlineFontFamily, setInlineFontSize, setInlineFontSizeMax,
							setInlineFontSizeMin, setInlineFontSizePreferred, setInlineFontStyle, setInlineFontWeight,
							setInlineLetterSpacing, setInlineLineHeight, setInlineTextCase, textCase, tipsDismissed,
							toggleFeature
						})
					)}
				</ToolbarGroup>
				<ToolbarGroup>
					<ToolbarDropdownMenu
						icon="heading"
						label={__('Change heading level', 'typography-stylist')}
						controls={[
							{
								title: __('Heading 1', 'typography-stylist'),
								isActive: tagName === 'h1',
								onClick: () => setAttributes({ tagName: 'h1' })
							},
							{
								title: __('Heading 2', 'typography-stylist'),
								isActive: tagName === 'h2',
								onClick: () => setAttributes({ tagName: 'h2' })
							},
							{
								title: __('Heading 3', 'typography-stylist'),
								isActive: tagName === 'h3',
								onClick: () => setAttributes({ tagName: 'h3' })
							},
							{
								title: __('Heading 4', 'typography-stylist'),
								isActive: tagName === 'h4',
								onClick: () => setAttributes({ tagName: 'h4' })
							},
							{
								title: __('Heading 5', 'typography-stylist'),
								isActive: tagName === 'h5',
								onClick: () => setAttributes({ tagName: 'h5' })
							},
							{
								title: __('Heading 6', 'typography-stylist'),
								isActive: tagName === 'h6',
								onClick: () => setAttributes({ tagName: 'h6' })
							},
							{
								title: __('Paragraph', 'typography-stylist'),
								isActive: tagName === 'p',
								onClick: () => setAttributes({ tagName: 'p' })
							},
							{
								title: __('Div', 'typography-stylist'),
								isActive: tagName === 'div',
								onClick: () => setAttributes({ tagName: 'div' })
							}
						]}
					/>
				</ToolbarGroup>
				<AlignmentToolbar
					value={textAlign}
					onChange={(newAlign) => setAttributes({ textAlign: newAlign })}
				/>
			</BlockControls>

			<InspectorControls>
				{renderHelpPanel()}

				<div className="typost-hook-point" data-hook="typost_inspector_top" ref={(el) => {
					if (el && !el._hooked) {
						el._hooked = true;
						window.typostHooks.doAction('typost_inspector_top', el, { fontId, fontWeight, features, fontSize, letterSpacing, lineHeight });
					}
				}} />

				{fontOptions.length > 0 && (
					renderFontFamilyPanel({
						fontFamily, fontId, fontIdMap, fontOptions, fontWeight, getClosestWeight, setAttributes
					})
				)}

				{/* Font Weight - replaceable via typost_weight_control filter */}
				{renderFontWeightPanel({
					fontId, fontVariationSettings, fontWeight, getFilteredWeightOptions, setAttributes
				})}

				{/* Extension hook point: after font weight (e.g., Variable Font axes).
				    key: remount (and re-fire the action) when the font changes */}
				<div key={`typost-afw-${fontId || 'none'}`} className="typost-hook-point" data-hook="typost_inspector_after_font_weight" ref={(el) => {
					if (el && !el._hooked) {
						el._hooked = true;
						window.typostHooks.doAction('typost_inspector_after_font_weight', el, { fontId, fontWeight, fontVariationSettings: fontVariationSettings || '' });
					}
				}} />

				{renderFontStylePanel({
					fontStyle, setAttributes
				})}

				{renderCasePanel({
					fakeSmallCaps, setAttributes, textCase
				})}

				{renderFontSizePanel({
					attributes, blockFontSizeUnit, fitMaxSize, fontSize, fontSizeMax, fontSizeMin,
					fontSizePreferred, formatSizeReadout, setAttributes, sizePreviewUnit
				})}

				{renderLineHeightPanel({
					lineHeight, setAttributes
				})}

				{renderLetterSpacingPanel({
					letterSpacing, setAttributes
				})}

				{renderFirstLetterHangPanel({
					activeParagraphStyle, attributes, fitLineHangs, fontSize, hangLinePreviews, initialHang,
					setAttributes, textAlign
				})}

				{/* Extension hook point: before features (e.g., Glyphs panel) */}
				<div className="typost-hook-point" data-hook="typost_inspector_before_features" ref={(el) => {
					if (el && !el._hooked) {
						el._hooked = true;
						window.typostHooks.doAction('typost_inspector_before_features', el, { fontId, features });
					}
				}} />

				{renderFeaturesPanel({
					features, getCategoryTitle, groupedFeatures, toggleBlockFeature
				})}

				{renderAccessibilityPanel({
					screenReaderClassControl, setAttributes, setScreenReaderCustomMode
				})}

				<div className="typost-hook-point" data-hook="typost_inspector_after_features" ref={(el) => {
					if (el && !el._hooked) {
						el._hooked = true;
						window.typostHooks.doAction('typost_inspector_after_features', el, { fontId, features });
					}
				}} />

				{renderResetPanel({
					showInlineResetConfirm, setShowInlineResetConfirm, showFullResetConfirm, setShowFullResetConfirm,
					clearAllInlineFeatures, resetEntireBlock
				})}
			</InspectorControls>

			<div {...blockProps}>
				{/* `identifier` tells the store which attribute the caret sits in.
				    Core's splitSelection() needs that attributeKey: our `content`
				    attribute has no `source`, so its findRichTextAttributeKey()
				    fallback finds nothing and the split silently no-ops (after
				    writing-flow has already preventDefault()ed the key, which
				    swallows the line break too — Enter would do nothing at all).

				    Read from the block support rather than the option so there is
				    one source of truth, and only set when splitting is enabled:
				    a live attributeKey also arms core's "enter transforms", which
				    would turn a URL-only block into an embed on Enter. That is a
				    change the default line-break mode should not inherit. */}
				{fontSize === 'fit' && content ? (
					/* Fit-to-width WYSIWYG editing (single view): the RichText
					   is fed a WRAPPED value — per-line typost-line spans, each
					   with its own calc(R * 100cqi) font-size, joined with <br>
					   — while the stored content attribute stays flat.
					   wrapFitLines/unwrapFitLines are the entire boundary. The
					   kept <br> separators make the rich-text record's text
					   byte-identical to the flat model, so store selection
					   offsets and the whole QFT machinery are untouched.
					   typost-fit brings the inline-size container + line rules
					   from style.css (loaded in the editor canvas);
					   typost-fit-editing re-inlines the wrappers (editor.css)
					   so the real <br>s do the line breaking while editing. */
					<RichText
						tagName={tagName}
						identifier={splitOnEnter ? 'content' : undefined}
						value={wrappedFitValue}
						onChange={(value) => setAttributes({ content: unwrapFitLines(value) })}
						placeholder={__('Add text with advanced typography…', 'typography-stylist')}
						style={buildStyle()}
						className={`typost-block-content typost-styled typost-fit typost-fit-editing${activeParagraphStyle ? ` ${styleClass}` : ''}${hangClass}`}
					/>
				) : (
					<RichText
						tagName={tagName}
						identifier={splitOnEnter ? 'content' : undefined}
						value={content}
						onChange={(value) => setAttributes({ content: value })}
						placeholder={__('Add text with advanced typography…', 'typography-stylist')}
						style={buildStyle()}
						className={contentClassName}
					/>
				)}
			</div>
		</>
	);
}

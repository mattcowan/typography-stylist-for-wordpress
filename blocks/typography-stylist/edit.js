/**
 * Typography Stylist Block - Editor Component
 */

import { __ } from '@wordpress/i18n';
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
	PanelBody,
	ToggleControl,
	SelectControl,
	RangeControl,
	TextControl,
	ToolbarGroup,
	ToolbarDropdownMenu,
	ToolbarButton,
	Popover,
	Modal,
	Button,
	Notice,
	Tooltip
} from '@wordpress/components';
import { useState, useRef, useEffect, useMemo } from '@wordpress/element';
import { useSelect } from '@wordpress/data';
import { create, slice as sliceRichText, getTextContent, insert as insertRichText, applyFormat, toHTMLString } from '@wordpress/rich-text';
import { buildTextOffsetMap, parseInlineStylesAtCursor, updateSpanPropertyInPlace, splitSpanAndApply, detectBlockComputedFont, applyOrMergeStyling, validateRangeMatchesSelection, applyStylingSafeStringMethod, isValidFontSizeRange, debounce, removePropertyFromSelection, getFilteredWeightOptions as getFilteredWeightOptionsUtil, getClosestWeight as getClosestWeightUtil, ALL_WEIGHT_OPTIONS, filterFeaturesByVisibility, resolveQftInsertionRange } from './utils';
import { buildFontOptions, isWpLibraryValue, wpSlugFromValue, adoptWpFont } from '../../assets/js/font-options.js';
import { calculateResize } from '../../assets/js/modal-drag-resize';

// Viewport breakpoints for responsive font sizing
const RESPONSIVE_FONT_MIN_VIEWPORT = 320;  // Mobile baseline
const RESPONSIVE_FONT_MAX_VIEWPORT = 1920; // Desktop baseline

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

// Utility: Remove preview spans from content (prevents saving temporary preview state)
const removePreviewSpans = (htmlContent) => {
	if (!htmlContent) return htmlContent;

	const parser = new DOMParser();
	const doc = parser.parseFromString(`<div>${htmlContent}</div>`, 'text/html');
	const container = doc.body.firstChild;

	// Find all preview spans and unwrap them (preserving child nodes)
	const previewSpans = container.querySelectorAll('span.typost-preview-temp');
	previewSpans.forEach(span => {
		const parent = span.parentNode;
		if (!parent) return;

		// Move all child nodes out of the span (preserves nested elements)
		while (span.firstChild) {
			parent.insertBefore(span.firstChild, span);
		}

		// Remove the now-empty span
		parent.removeChild(span);
	});

	return container.innerHTML;
};

// Custom "T" icon for Typography Stylist
const TSIcon = () => (
	<svg width={20} height={20} viewBox="0 0 1067 1067" xmlns="http://www.w3.org/2000/svg">
		<path d="M22.621,323.219c0,116.595 86.232,204.042 200.398,204.042c81.374,0 134.814,-41.294 134.814,-100.806c0,-36.436 -26.72,-68.014 -66.799,-68.014c-71.658,0 -75.301,80.159 -122.668,80.159c-54.654,0 -87.447,-58.298 -87.447,-115.381c0,-78.945 52.225,-137.243 156.675,-137.243c78.945,0 162.748,29.149 250.194,59.512l0,647.348c0,92.305 -20.647,99.592 -117.81,105.665l0,30.363l355.859,0l0,-30.363c-97.163,-6.073 -117.81,-13.36 -117.81,-105.665l0,-609.697c65.585,20.647 133.599,36.436 206.471,36.436c144.53,0 229.547,-83.803 229.547,-184.609c0,-57.083 -32.792,-97.163 -80.159,-97.163c-40.08,0 -72.872,27.934 -72.872,69.229c0,49.796 42.509,65.585 42.509,100.806c0,36.436 -38.865,58.298 -106.879,58.298c-136.028,0 -329.139,-171.25 -534.396,-171.25c-173.679,0 -269.627,109.308 -269.627,228.333Z" fill="currentColor"/>
	</svg>
);

/**
 * Inline info tooltip — WCAG 2.1 compliant.
 * Renders as a focusable Button with Tooltip on hover/focus.
 * Tooltip content is plain text only (no interactive elements).
 */
function InfoTip({ text }) {
	return (
		<Tooltip text={text}>
			<Button
				icon="info-outline"
				label={text}
				className="typost-info-tooltip-trigger"
				isSmall
				style={{
					minWidth: '20px',
					height: '20px',
					padding: 0,
					opacity: 0.5,
					marginLeft: '4px',
					verticalAlign: 'middle',
				}}
			/>
		</Tooltip>
	);
}

export default function Edit({ attributes, setAttributes, clientId }) {
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
		fontWeight,
		letterSpacing,
		lineHeight,
		screenReaderClass,
		textAlign,
		styleClass,
		fontVariationSettings
	} = attributes;

	const [isPopoverOpen, setIsPopoverOpen] = useState(false);
	const [previewText, setPreviewText] = useState('');
	const [inlineLetterSpacing, setInlineLetterSpacing] = useState(0);
	const [previewLetterSpacing, setPreviewLetterSpacing] = useState(0);
	const [inlineLineHeight, setInlineLineHeight] = useState(0);
	const [previewLineHeight, setPreviewLineHeight] = useState(0);
	const [computedFont, setComputedFont] = useState('');
	const [inlineFontSize, setInlineFontSize] = useState('inherit');
	const [inlineFontSizeMin, setInlineFontSizeMin] = useState(16);
	const [inlineFontSizePreferred, setInlineFontSizePreferred] = useState(32);
	const [inlineFontSizeMax, setInlineFontSizeMax] = useState(64);
	const [previewFontSize, setPreviewFontSize] = useState('inherit');
	const [previewFontSizeMin, setPreviewFontSizeMin] = useState(16);
	const [previewFontSizePreferred, setPreviewFontSizePreferred] = useState(32);
	const [previewFontSizeMax, setPreviewFontSizeMax] = useState(64);
	const [inlineFontWeight, setInlineFontWeight] = useState('inherit');
	const [inlineFontFamily, setInlineFontFamily] = useState('');
	const [showInlineResetConfirm, setShowInlineResetConfirm] = useState(false);
	const [showFullResetConfirm, setShowFullResetConfirm] = useState(false);
	const [capturedSelection, setCapturedSelection] = useState(null);

	// Modal position and size state
	const [modalX, setModalX] = useState(() => {
		const viewportWidth = window.innerWidth;
		const modalWidth = 500;
		return Math.max(0, (viewportWidth - modalWidth) / 2);
	});
	const [modalY, setModalY] = useState(() => {
		const viewportHeight = window.innerHeight;
		const modalHeight = 600;
		return Math.max(0, (viewportHeight - modalHeight) / 2);
	});
	const [modalWidth, setModalWidth] = useState(500);
	const [modalHeight, setModalHeight] = useState(600);

	// Drag state
	const [isDragging, setIsDragging] = useState(false);
	const [dragStartX, setDragStartX] = useState(0);
	const [dragStartY, setDragStartY] = useState(0);

	// Resize state
	const [isResizing, setIsResizing] = useState(false);
	const [resizeStartX, setResizeStartX] = useState(0);
	const [resizeStartY, setResizeStartY] = useState(0);
	const [resizeStartWidth, setResizeStartWidth] = useState(0);
	const [resizeStartHeight, setResizeStartHeight] = useState(0);
	const [resizeStartModalX, setResizeStartModalX] = useState(0);
	const [resizeStartModalY, setResizeStartModalY] = useState(0);
	const [resizeDirection, setResizeDirection] = useState(null);

	// Get selection from block editor store
	const { selectionStart, selectionEnd } = useSelect(
		(select) => {
			const {
				getSelectionStart,
				getSelectionEnd,
			} = select(blockEditorStore);

			return {
				selectionStart: getSelectionStart(),
				selectionEnd: getSelectionEnd(),
			};
		},
		[]
	);

	// Store original letter spacing when opening popover
	const originalLetterSpacingRef = useRef(letterSpacing);

	// Store the original content before preview
	const originalContentRef = useRef(null);

	// Refs to store the latest apply functions (to avoid stale closures in debounced functions)
	const applyLetterSpacingRef = useRef(null);
	const applyLineHeightRef = useRef(null);
	const applyFontFamilyRef = useRef(null);
	const applyFontWeightRef = useRef(null);
	const applyFontSizeRef = useRef(null);

	// Debounced auto-apply functions for responsive controls
	// These are created once and reused across renders to maintain debounce state
	// They use refs to call the latest version of apply functions (avoiding stale closures)
	const debouncedApplyLetterSpacing = useRef(
		debounce(() => {
			if (applyLetterSpacingRef.current) {
				applyLetterSpacingRef.current();
			}
		}, 400)
	).current;

	const debouncedApplyLineHeight = useRef(
		debounce(() => {
			if (applyLineHeightRef.current) {
				applyLineHeightRef.current();
			}
		}, 400)
	).current;

	const debouncedApplyFontFamily = useRef(
		debounce(() => {
			if (applyFontFamilyRef.current) {
				applyFontFamilyRef.current();
			}
		}, 300)
	).current;

	const debouncedApplyFontWeight = useRef(
		debounce(() => {
			if (applyFontWeightRef.current) {
				applyFontWeightRef.current();
			}
		}, 300)
	).current;

	const debouncedApplyFontSize = useRef(
		debounce(() => {
			if (applyFontSizeRef.current) {
				applyFontSizeRef.current();
			}
		}, 600) // Longer delay for responsive font-size (3 sliders)
	).current;

	// Cleanup debounced functions on unmount (prevent memory leaks)
	useEffect(() => {
		return () => {
			if (debouncedApplyLetterSpacing && typeof debouncedApplyLetterSpacing.cancel === 'function') {
				debouncedApplyLetterSpacing.cancel();
			}
			if (debouncedApplyLineHeight && typeof debouncedApplyLineHeight.cancel === 'function') {
				debouncedApplyLineHeight.cancel();
			}
			if (debouncedApplyFontFamily && typeof debouncedApplyFontFamily.cancel === 'function') {
				debouncedApplyFontFamily.cancel();
			}
			if (debouncedApplyFontWeight && typeof debouncedApplyFontWeight.cancel === 'function') {
				debouncedApplyFontWeight.cancel();
			}
			if (debouncedApplyFontSize && typeof debouncedApplyFontSize.cancel === 'function') {
				debouncedApplyFontSize.cancel();
			}
		};
	}, []); // Empty deps - only run on unmount

	// Extension hook: Listen for block property application from extensions (v2.0.0)
	// Uses ref pattern to avoid stale closures — handler registered once,
	// reads current fontIdMap/fontWeight from ref.
	// Note: ref.current is assigned later (after fontIdMap/getClosestWeight are declared)
	const blockPropsRef = useRef({});

	useEffect(() => {
		const handleApplyBlockProperties = (e) => {
			if (e.detail && (e.detail.source === 'qft' || e.detail.source === 'inspector') && e.detail.properties) {
				const props = e.detail.properties;
				const { fontIdMap: idMap, fontWeight: curWeight, getClosestWeight: closestWeight } = blockPropsRef.current;
				// Apply to block-level attributes
				const newAttrs = {};
				if (props.fontId !== undefined) {
					newAttrs.fontId = props.fontId;
					// Resolve fontFamily from fontIdMap (same pattern as Inspector Controls onChange)
					if (idMap[props.fontId]) {
						const fontData = idMap[props.fontId];
						newAttrs.fontFamily = fontData.family;
						// Validate weight against new font's available weights
						const weight = props.fontWeight || curWeight;
						const available = fontData.availableWeights;
						if (available && available.length > 0 && !available.includes(weight)) {
							newAttrs.fontWeight = closestWeight(weight, available);
						}
					}
				}
				if (props.fontWeight !== undefined) newAttrs.fontWeight = props.fontWeight;
				if (props.fontSize !== undefined) newAttrs.fontSize = props.fontSize;
				if (props.fontSizeMin !== undefined) newAttrs.fontSizeMin = props.fontSizeMin;
				if (props.fontSizePreferred !== undefined) newAttrs.fontSizePreferred = props.fontSizePreferred;
				if (props.fontSizeMax !== undefined) newAttrs.fontSizeMax = props.fontSizeMax;
				if (props.letterSpacing !== undefined) newAttrs.letterSpacing = props.letterSpacing;
				if (props.lineHeight !== undefined) newAttrs.lineHeight = props.lineHeight;
				if (props.features !== undefined) newAttrs.features = props.features;
				if (props.fontVariationSettings !== undefined) newAttrs.fontVariationSettings = props.fontVariationSettings;
				// Generic styleClass support: extensions can pass a CSS class to apply
				if (e.detail.styleClass !== undefined) {
					newAttrs.styleClass = e.detail.styleClass;
				}
				// Layered font configuration ID support
				if (props.layeredConfigId !== undefined) {
					newAttrs.layeredConfigId = props.layeredConfigId;
				}
				// Animation configuration ID support (animations extension)
				if (props.animationConfigId !== undefined) {
					newAttrs.animationConfigId = props.animationConfigId;
				}
				setAttributes(newAttrs);

				// Sync QFT inline state so controls reflect the applied style
				if (props.fontId !== undefined) {
					setInlineFontFamily(String(props.fontId));
				}
				if (newAttrs.fontWeight !== undefined) {
					setInlineFontWeight(newAttrs.fontWeight);
				} else if (props.fontWeight !== undefined) {
					setInlineFontWeight(props.fontWeight);
				}
				if (props.letterSpacing !== undefined) {
					setInlineLetterSpacing(props.letterSpacing);
				}
				if (props.lineHeight !== undefined) {
					setInlineLineHeight(props.lineHeight);
				}
				if (props.fontSize !== undefined) {
					setInlineFontSize(props.fontSize);
				}
				if (props.fontSizeMin !== undefined) {
					setInlineFontSizeMin(props.fontSizeMin);
				}
				if (props.fontSizePreferred !== undefined) {
					setInlineFontSizePreferred(props.fontSizePreferred);
				}
				if (props.fontSizeMax !== undefined) {
					setInlineFontSizeMax(props.fontSizeMax);
				}
			}
		};
		document.addEventListener('typost-apply-block-properties', handleApplyBlockProperties);
		return () => {
			document.removeEventListener('typost-apply-block-properties', handleApplyBlockProperties);
		};
	}, [setAttributes, setInlineFontFamily, setInlineFontWeight, setInlineLetterSpacing, setInlineLineHeight, setInlineFontSize, setInlineFontSizeMin, setInlineFontSizePreferred, setInlineFontSizeMax]); // eslint-disable-line react-hooks/exhaustive-deps -- fontIdMap/fontWeight/getClosestWeight read from ref

	// Extension hook: Listen for content insertion from extensions (e.g., Glyphs Panel)
	// Inserts text at the captured/current selection, optionally wrapping it in a
	// typost-styled span via format attributes. Uses ref pattern to avoid stale closures.
	const insertContentRef = useRef({});
	insertContentRef.current = { content, capturedSelection, selectionStart, selectionEnd, clientId, isPopoverOpen };

	useEffect(() => {
		const handleInsertContent = (e) => {
			if (!e.detail || e.detail.source !== 'qft' || !e.detail.text) {
				return;
			}
			// Every Typography Stylist block registers this listener — only the
			// targeted block (detail.clientId, captured by the extension when
			// its UI launched) handles the insertion. Fallback for events
			// without clientId: the block whose QFT popover is open.
			const { content: curContent, capturedSelection: captured, selectionStart: selStart, selectionEnd: selEnd, clientId: curClientId, isPopoverOpen: popoverOpen } = insertContentRef.current;
			if (e.detail.clientId ? e.detail.clientId !== curClientId : !popoverOpen) {
				return;
			}

			// Drop temporary preview spans (text-preserving, so offsets stay valid)
			const cleanContent = removePreviewSpans(curContent || '');
			const value = create({ html: cleanContent });
			// Selection priority: own captured selection → range captured by the
			// extension at launch (detail.range) → live block selection → append
			const range = resolveQftInsertionRange(
				captured || e.detail.range || null,
				selStart, selEnd, curClientId, value.text.length
			);

			const text = String(e.detail.text).slice(0, 50);
			let newValue = insertRichText(value, text, range.start, range.end);
			const insertEnd = range.start + text.length;

			// Copy formats from the preceding character so insertion inside
			// formatted text behaves like typing (continuity)
			const inherited = (range.start > 0 && value.formats[range.start - 1]) ? value.formats[range.start - 1] : [];
			inherited.forEach((format) => {
				newValue = applyFormat(newValue, format, range.start, insertEnd);
			});

			// Wrap inserted text in a typost-styled span when attributes provided
			// (replaces any inherited typost format on just the inserted range)
			if (e.detail.attributes && typeof e.detail.attributes === 'object') {
				newValue = applyFormat(newValue, {
					type: 'typost/features',
					attributes: e.detail.attributes
				}, range.start, insertEnd);
			}

			// Commit: clear preview-restore so popover close doesn't revert the insertion
			originalContentRef.current = null;
			setAttributes({ content: toHTMLString({ value: newValue }) });
			setCapturedSelection({ start: insertEnd, end: insertEnd, text: '', length: 0 });
		};
		document.addEventListener('typost-insert-content', handleInsertContent);
		return () => {
			document.removeEventListener('typost-insert-content', handleInsertContent);
		};
	}, [setAttributes]); // eslint-disable-line react-hooks/exhaustive-deps -- content/selection read from insertContentRef

	// Extension hook: Register state provider for QFT editor (v2.0.0)
	// Uses ref pattern to avoid filter accumulation — filter registered once,
	// reads current values from ref on each call
	const qftStateRef = useRef({});
	qftStateRef.current = {
		fontId, fontWeight, fontSize, fontSizeMin, fontSizePreferred,
		fontSizeMax, letterSpacing, lineHeight, features, styleClass,
		fontVariationSettings, layeredConfigId: attributes.layeredConfigId || 0,
		animationConfigId: attributes.animationConfigId || 0,
		content: attributes.content || '', tagName: attributes.tagName || 'h2',
		// clientId of the block holding the active selection — used so only the
		// selected block answers the shared typost_current_editor_state filter.
		selectionClientId: selectionStart?.clientId || null
	};

	useEffect(() => {
		const stateProvider = (state, editorType) => {
			if (editorType === 'qft') {
				const s = qftStateRef.current;
				// Every typost/block instance registers this shared filter. Only the
				// block that holds the active selection should answer; the rest pass
				// the value through so the selected block's state isn't clobbered by
				// later-registered instances.
				if (s.selectionClientId !== clientId) {
					return state;
				}
				const styleIdMatch = s.styleClass ? s.styleClass.match(/typost-ps-(\d+)/) : null;
				// Prefer the font of the inline span at the cursor (stored as a
				// string data-font-id) over the block-level font, so consumers
				// like the Glyphs panel reflect the actually-selected font.
				const activeFontId = s.inlineFontId
					? parseInt(s.inlineFontId, 10)
					: s.fontId;
				return {
					editorType: 'qft',
					fontId: activeFontId,
					fontWeight: s.fontWeight,
					fontSize: s.fontSize,
					fontSizeMin: s.fontSizeMin,
					fontSizePreferred: s.fontSizePreferred,
					fontSizeMax: s.fontSizeMax,
					letterSpacing: s.letterSpacing,
					lineHeight: s.lineHeight,
					features: s.features,
					paragraphStyleId: styleIdMatch ? parseInt(styleIdMatch[1], 10) : 0,
					fontVariationSettings: s.fontVariationSettings || '',
					layeredConfigId: s.layeredConfigId || 0,
					animationConfigId: s.animationConfigId || 0,
					content: s.content || '',
					tagName: s.tagName || 'h2'
				};
			}
			return state;
		};
		window.typostHooks.addFilter('typost_current_editor_state', stateProvider, 10);
		return () => {
			window.typostHooks.removeFilter('typost_current_editor_state', stateProvider);
		};
	}, []); // eslint-disable-line react-hooks/exhaustive-deps -- reads from ref

	// Extension hook: when the Glyphs panel (a separate Modal that forced this
	// block's Quick Feature Toggle Modal closed) is dismissed, reopen the QFT
	// popover so the author returns to where they launched from. Scoped by
	// clientId so only the block that opened it reopens (every block registers
	// this shared action).
	useEffect(() => {
		const handler = (src, info) => {
			if (src === 'qft' && info && info.clientId === clientId) {
				setIsPopoverOpen(true);
			}
		};
		window.typostHooks.addAction('typost_glyphs_panel_closed', handler, 10);
		return () => {
			window.typostHooks.removeAction('typost_glyphs_panel_closed', handler);
		};
	}, []); // eslint-disable-line react-hooks/exhaustive-deps -- clientId stable per instance

	// Detect block's computed font-family after component mounts
	// This runs after the DOM is ready and styles are applied
	useEffect(() => {
		// Only detect if fontFamily attribute is not set (using default/inherited font)
		if (!fontFamily) {
			// Use the utility function from utils.js for testability
			const detectedFont = detectBlockComputedFont(clientId);
			setComputedFont(detectedFont);
		} else {
			// If fontFamily is set, use it directly
			setComputedFont('');
		}
	}, [fontFamily, clientId]); // Re-run when fontFamily or clientId changes

	// Unified inline styles detection at current cursor/selection position
	// Detects ALL properties: features, fontId, fontWeight, fontSize, letterSpacing, lineHeight
	// Memoized to run once per render instead of once per feature (15-20x performance improvement)
	// Uses selectionStart/End offset only (not full object) to avoid re-computation on every selection change
	const inlineStylesAtSelection = useMemo(() => {
		if (!content) return null;
		if (!selectionStart || !selectionEnd || selectionStart.clientId !== clientId) {
			return null;
		}

		const start = selectionStart.offset || 0;
		const end = selectionEnd.offset || 0;

		return parseInlineStylesAtCursor(content, start, end);
	}, [content, selectionStart?.offset, selectionEnd?.offset, selectionStart?.clientId, clientId]);

	// Derive individual properties from unified detection for backward compatibility
	const inlineFeaturesAtSelection = inlineStylesAtSelection?.features || [];
	const inlineFontFamilyAtSelection = inlineStylesAtSelection?.fontId || null;

	// Surface the inline font-id at the cursor to QFT-state consumers (e.g. the
	// Glyphs panel) so they pre-select the span's font rather than only the
	// block-level font. data-font-id is stored as a string; the consumer side
	// normalizes type, but qftStateRef carries the raw value.
	qftStateRef.current.inlineFontId = inlineFontFamilyAtSelection;

	// Helper to create a Range for the given linear text offsets within a container
	// Uses buildTextOffsetMap to account for <br> line breaks in offset calculations
	const getRangeForOffsets = (rootNode, startOffset, endOffset, docContext) => {
		const textMap = buildTextOffsetMap(rootNode, document);
		let rangeStartNode = null;
		let rangeStartOffset = 0;
		let rangeEndNode = null;
		let rangeEndOffset = 0;

		for (const entry of textMap) {
			if (entry.end > startOffset && !rangeStartNode) {
				rangeStartNode = entry.node;
				rangeStartOffset = startOffset - entry.start;
			}

			if (entry.end >= endOffset && !rangeEndNode) {
				rangeEndNode = entry.node;
				rangeEndOffset = endOffset - entry.start;
				break;
			}
		}

		if (!rangeStartNode || !rangeEndNode) {
			return null;
		}

		const range = docContext.createRange();
		range.setStart(rangeStartNode, rangeStartOffset);
		range.setEnd(rangeEndNode, rangeEndOffset);

		return range;
	};

	/**
	 * Apply preview styling to selected text by wrapping with temporary span
	 * Handles multiple concurrent preview properties (letter-spacing, line-height, font-size)
	 *
	 * @param {Object} params
	 * @param {string} params.content - Current block content
	 * @param {Object} params.selectionStart - Selection start position
	 * @param {Object} params.selectionEnd - Selection end position
	 * @param {string} params.clientId - Block client ID
	 * @param {Object} params.styles - CSS styles to apply { 'letter-spacing': '0.05em', 'line-height': 2.0, ... }
	 * @param {Function} params.setAttributes - Block setAttributes function
	 * @param {Object} params.originalContentRef - Reference to original content before preview
	 * @returns {boolean} - True if preview was applied successfully
	 */
	const applyPreviewStyles = ({
		content,
		selectionStart,
		selectionEnd,
		clientId,
		styles,
		setAttributes,
		originalContentRef
	}) => {
		// Validation checks
		if (!content || !selectionStart || !selectionEnd || !clientId) {
			return false;
		}

		if (selectionStart.clientId !== clientId || selectionEnd.clientId !== clientId) {
			return false;
		}

		const start = selectionStart.offset || 0;
		const end = selectionEnd.offset || 0;

		if (start === end) {
			return false;
		}

		// Store original content if not already stored
		if (!originalContentRef.current) {
			originalContentRef.current = content;
		}

		// Parse ORIGINAL content (prevents nested preview spans)
		const parser = new DOMParser();
		const doc = parser.parseFromString(`<div>${originalContentRef.current}</div>`, 'text/html');
		const container = doc.body.firstChild;

		const range = getRangeForOffsets(container, start, end, doc);

		if (!range) {
			return false;
		}

		try {
			const span = doc.createElement('span');
			span.className = 'typost-preview-temp';

			// Build style string from ALL active preview values
			const styleString = Object.entries(styles)
				.filter(([_, value]) => value !== null && value !== undefined && value !== '')
				.map(([prop, value]) => `${prop}: ${value}`)
				.join('; ');

			if (styleString) {
				span.style.cssText = styleString;
			}

			range.surroundContents(span);
			const previewContent = container.innerHTML;
			setAttributes({ content: previewContent });

			return true;
		} catch (e) {
			// Range cannot be wrapped (e.g., intersects element boundaries)
			// Silently fail for preview - user can still apply manually
			return false;
		}
	};

	// Drag handlers
	const handleDragStart = (e) => {
		// Don't drag if clicking close button
		if (e.target.closest('.typost-modal-close-button')) {
			return;
		}

		// Only drag from header
		if (!e.target.closest('.typost-modal-header')) {
			return;
		}

		e.preventDefault();
		e.stopPropagation();

		setIsDragging(true);
		setDragStartX(e.clientX);
		setDragStartY(e.clientY);
	};

	const handleDragMove = (e) => {
		if (!isDragging) return;

		const deltaX = e.clientX - dragStartX;
		const deltaY = e.clientY - dragStartY;

		const newX = modalX + deltaX;
		const newY = modalY + deltaY;

		// Constrain to viewport
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;
		const MIN_VISIBLE = 50;

		const constrainedX = Math.max(0, Math.min(newX, viewportWidth - MIN_VISIBLE));
		const constrainedY = Math.max(0, Math.min(newY, viewportHeight - MIN_VISIBLE));

		setModalX(constrainedX);
		setModalY(constrainedY);
		setDragStartX(e.clientX);
		setDragStartY(e.clientY);
	};

	const handleDragEnd = () => {
		setIsDragging(false);
	};

	// Resize handlers
	const handleResizeStart = (e, direction) => {
		e.preventDefault();
		e.stopPropagation();

		setIsResizing(true);
		setResizeDirection(direction);
		setResizeStartX(e.clientX);
		setResizeStartY(e.clientY);
		setResizeStartWidth(modalWidth);
		setResizeStartHeight(modalHeight);
		setResizeStartModalX(modalX);
		setResizeStartModalY(modalY);
	};

	const handleResizeMove = (e) => {
		if (!isResizing) return;

		const newDimensions = calculateResize(e, resizeDirection, {
			startX: resizeStartX,
			startY: resizeStartY,
			startWidth: resizeStartWidth,
			startHeight: resizeStartHeight,
			startModalX: resizeStartModalX,
			startModalY: resizeStartModalY
		});

		setModalWidth(newDimensions.width);
		setModalHeight(newDimensions.height);
		setModalX(newDimensions.x);
		setModalY(newDimensions.y);
	};

	const handleResizeEnd = () => {
		setIsResizing(false);
		setResizeDirection(null);
	};

	// Add/remove drag and resize event listeners
	useEffect(() => {
		if (isDragging) {
			document.addEventListener('mousemove', handleDragMove);
			document.addEventListener('mouseup', handleDragEnd);
			return () => {
				document.removeEventListener('mousemove', handleDragMove);
				document.removeEventListener('mouseup', handleDragEnd);
			};
		}
	}, [isDragging, dragStartX, dragStartY, modalX, modalY]);

	useEffect(() => {
		if (isResizing) {
			document.addEventListener('mousemove', handleResizeMove);
			document.addEventListener('mouseup', handleResizeEnd);
			return () => {
				document.removeEventListener('mousemove', handleResizeMove);
				document.removeEventListener('mouseup', handleResizeEnd);
			};
		}
	}, [isResizing, resizeStartX, resizeStartY, resizeStartWidth, resizeStartHeight, resizeStartModalX, resizeStartModalY, resizeDirection, modalWidth, modalHeight, modalX, modalY]);

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

	// Helper: Populate control state from detected inline styles
	const populateControlsFromDetectedStyles = (detected) => {
		if (!detected) {
			// No styled span at cursor - reset to defaults
			setInlineLetterSpacing(0);
			setInlineLineHeight(0);
			setInlineFontWeight('inherit');
			setInlineFontFamily('');
			setInlineFontSize('inherit');
			setInlineFontSizeMin(16);
			setInlineFontSizePreferred(32);
			setInlineFontSizeMax(64);
			return;
		}

		// Populate from detected values (null/undefined means no value, keep default)
		if (detected.letterSpacing !== null && detected.letterSpacing !== undefined) {
			setInlineLetterSpacing(detected.letterSpacing);
		}
		if (detected.lineHeight !== null && detected.lineHeight !== undefined) {
			setInlineLineHeight(detected.lineHeight);
		}
		if (detected.fontWeight) {
			setInlineFontWeight(detected.fontWeight);
		}
		if (detected.fontId) {
			setInlineFontFamily(detected.fontId);
		}
		if (detected.fontSize) {
			setInlineFontSize(detected.fontSize);
			if (detected.fontSizeMin !== null) setInlineFontSizeMin(detected.fontSizeMin);
			if (detected.fontSizePreferred !== null) setInlineFontSizePreferred(detected.fontSizePreferred);
			if (detected.fontSizeMax !== null) setInlineFontSizeMax(detected.fontSizeMax);
		}
	};

	// Handle toolbar button click
	const handleToolbarClick = () => {
		// Extract selected text using RichText API
		let extractedText = '';

		if (content) {
			// Create a rich text value from the HTML content
			const richTextValue = create({ html: content });

			// Check if we have a selection within this block
			if (selectionStart && selectionEnd &&
			    selectionStart.clientId === clientId &&
			    selectionEnd.clientId === clientId) {

				const start = selectionStart.offset || 0;
				const end = selectionEnd.offset || 0;

				if (start !== end) {
					// There's a selection - extract it
					const slicedValue = sliceRichText(richTextValue, start, end);
					extractedText = getTextContent(slicedValue);

					// Capture selection offsets and text before Modal opens (Modal clears selection)
					setCapturedSelection({
						start: start,
						end: end,
						text: extractedText,
						length: extractedText.length
					});
				} else {
					// No selection - clear captured selection
					setCapturedSelection(null);
					extractedText = getTextContent(richTextValue);
				}
			} else {
				// No valid selection in this block - clear captured selection
				setCapturedSelection(null);
				extractedText = getTextContent(richTextValue);
			}
		}

		// Detect and populate inline styles when opening popover
		if (!isPopoverOpen && selectionStart && selectionEnd && selectionStart.clientId === clientId) {
			const start = selectionStart.offset || 0;
			const end = selectionEnd.offset || 0;
			const detected = parseInlineStylesAtCursor(content, start, end);
			populateControlsFromDetectedStyles(detected);
		}

		// Store original letter spacing when opening
		if (!isPopoverOpen) {
			originalLetterSpacingRef.current = letterSpacing;
		}

		setPreviewText(extractedText);
		setIsPopoverOpen(!isPopoverOpen);
	};

	// Handle popover close - reset to original if not applied
	const handlePopoverClose = () => {
		// Restore original content if we were previewing
		if (originalContentRef.current) {
			setAttributes({ content: originalContentRef.current });
			originalContentRef.current = null;
		}
		// Reset letter-spacing preview state
		setInlineLetterSpacing(0);
		setPreviewLetterSpacing(0);
		// Reset line-height preview state
		setInlineLineHeight(0);
		setPreviewLineHeight(0);
		// Reset responsive font-size preview state
		setPreviewFontSize('inherit');
		setPreviewFontSizeMin(16);
		setPreviewFontSizePreferred(32);
		setPreviewFontSizeMax(64);
		// Reset font property inline state
		setInlineFontWeight('inherit');
		setInlineFontFamily('');
		setInlineFontSize('inherit');
		setInlineFontSizeMin(16);
		setInlineFontSizePreferred(32);
		setInlineFontSizeMax(64);
		// Clear captured selection and close popover
		setCapturedSelection(null);
		setIsPopoverOpen(false);
	};

	// Handle letter spacing change with live preview
	const handleLetterSpacingChange = (value) => {
		setInlineLetterSpacing(value);
		setPreviewLetterSpacing(value);

		// Build styles object with ALL active preview values
		const styles = {};

		if (value !== 0) {
			styles['letter-spacing'] = `${value / 1000}em`;
		}

		if (previewLineHeight !== 0) {
			styles['line-height'] = previewLineHeight;
		}

		if (previewFontSize === 'responsive') {
			const clampValue = `clamp(${previewFontSizeMin}px, ${previewFontSizePreferred / 16}rem + ${((previewFontSizeMax - previewFontSizeMin) / (RESPONSIVE_FONT_MAX_VIEWPORT - RESPONSIVE_FONT_MIN_VIEWPORT)) * 100}vw, ${previewFontSizeMax}px)`;
			styles['font-size'] = clampValue;
		}

		applyPreviewStyles({
			content,
			selectionStart,
			selectionEnd,
			clientId,
			styles,
			setAttributes,
			originalContentRef
		});
	};

	// Clear letter spacing (reset to 0 and remove from content)
	const clearLetterSpacing = () => {
		if (!content || inlineLetterSpacing === 0) return;

		setInlineLetterSpacing(0);
		setPreviewLetterSpacing(0);

		if (selectionStart && selectionEnd && selectionStart.clientId === clientId) {
			const result = removePropertyFromSelection(
				content,
				selectionStart.offset || 0,
				selectionEnd.offset || 0,
				'data-letterspacing',
				'letter-spacing'
			);
			if (result.success) {
				setAttributes({ content: result.content });
			}
		}
	};

	// Handle line height change with live preview
	const handleLineHeightChange = (value) => {
		setInlineLineHeight(value);
		setPreviewLineHeight(value);

		// Build styles object with ALL active preview values
		const styles = {};

		if (previewLetterSpacing !== 0) {
			styles['letter-spacing'] = `${previewLetterSpacing / 1000}em`;
		}

		if (value !== 0) {
			styles['line-height'] = value;
		}

		if (previewFontSize === 'responsive') {
			const clampValue = `clamp(${previewFontSizeMin}px, ${previewFontSizePreferred / 16}rem + ${((previewFontSizeMax - previewFontSizeMin) / (RESPONSIVE_FONT_MAX_VIEWPORT - RESPONSIVE_FONT_MIN_VIEWPORT)) * 100}vw, ${previewFontSizeMax}px)`;
			styles['font-size'] = clampValue;
		}

		applyPreviewStyles({
			content,
			selectionStart,
			selectionEnd,
			clientId,
			styles,
			setAttributes,
			originalContentRef
		});
	};

	// Clear line height (reset to 0 and remove from content)
	const clearLineHeight = () => {
		if (!content || inlineLineHeight === 0) return;

		setInlineLineHeight(0);
		setPreviewLineHeight(0);

		if (selectionStart && selectionEnd && selectionStart.clientId === clientId) {
			const result = removePropertyFromSelection(
				content,
				selectionStart.offset || 0,
				selectionEnd.offset || 0,
				'data-lineheight',
				'line-height'
			);
			if (result.success) {
				setAttributes({ content: result.content });
			}
		}
	};

	// Reset font family (remove from content)
	const resetFontFamily = () => {
		if (!content || !inlineFontFamily) return;

		setInlineFontFamily('');

		if (selectionStart && selectionEnd && selectionStart.clientId === clientId) {
			const result = removePropertyFromSelection(
				content,
				selectionStart.offset || 0,
				selectionEnd.offset || 0,
				'data-font-id',
				'font-family'
			);
			if (result.success) {
				setAttributes({ content: result.content });
			}
		}
	};

	// Reset font weight (remove from content)
	const resetFontWeight = () => {
		if (!content || inlineFontWeight === 'inherit') return;

		setInlineFontWeight('inherit');

		if (selectionStart && selectionEnd && selectionStart.clientId === clientId) {
			const result = removePropertyFromSelection(
				content,
				selectionStart.offset || 0,
				selectionEnd.offset || 0,
				'data-fontweight',
				'font-weight'
			);
			if (result.success) {
				setAttributes({ content: result.content });
			}
		}
	};

	// Reset font size (remove from content)
	const resetFontSize = () => {
		if (!content || inlineFontSize === 'inherit') return;

		setInlineFontSize('inherit');
		setInlineFontSizeMin(16);
		setInlineFontSizePreferred(32);
		setInlineFontSizeMax(64);

		if (selectionStart && selectionEnd && selectionStart.clientId === clientId) {
			const result = removePropertyFromSelection(
				content,
				selectionStart.offset || 0,
				selectionEnd.offset || 0,
				'data-fontsize',
				'font-size'
			);
			if (result.success) {
				setAttributes({ content: result.content });
			}
		}
	};

	// Apply line height only (no feature)
	const applyLineHeightOnly = () => {
		if (!content || inlineLineHeight === 0) return;

		// Check if we have a valid selection
		if (selectionStart && selectionEnd &&
		    selectionStart.clientId === clientId &&
		    selectionEnd.clientId === clientId) {

			const start = selectionStart.offset || 0;
			const end = selectionEnd.offset || 0;

			// COLLAPSED CURSOR: Update parent span in-place
			if (start === end) {
				const result = updateSpanPropertyInPlace(
					content,
					start,
					'data-lineheight',
					inlineLineHeight.toString(),
					'line-height',
					inlineLineHeight.toString()
				);

				if (result.success) {
					setAttributes({ content: result.content });
					originalContentRef.current = null;
					return;
				}
				return;
			}

			// SELECTION: Check if we should split parent span
			if (inlineStylesAtSelection && inlineStylesAtSelection.lineHeight !== null) {
				const result = splitSpanAndApply(
					content,
					start,
					end,
					'data-lineheight',
					{ 'data-lineheight': inlineLineHeight.toString() },
					`line-height: ${inlineLineHeight}`
				);

				if (result.success) {
					setAttributes({ content: result.content });
					originalContentRef.current = null;
					return;
				}
			}

			if (start !== end) {
				// Build the styled span with ONLY line height
				const styleArray = [];

				styleArray.push(`line-height: ${inlineLineHeight}`);

				const styleString = styleArray.join('; ');

				// Parse the current content as HTML
				const parser = new DOMParser();
				const doc = parser.parseFromString(`<div>${content}</div>`, 'text/html');
				const container = doc.body.firstChild;

				// STRATEGY: Try Range method first, fallback to string manipulation

				// 1. TRY RANGE METHOD
				const range = getRangeForOffsets(container, start, end, doc);

				const validation = validateRangeMatchesSelection(
					range,
					capturedSelection?.text || '',
					capturedSelection?.length || 0
				);

				let success = false;
				let newContent = content;

				if (validation.valid) {
					// Range is valid - try applying with it
					const attributes = { 'data-lineheight': inlineLineHeight.toString() };
					success = applyOrMergeStyling(range, attributes, styleString, doc);

					if (success) {
						newContent = container.innerHTML;

						// POST-VALIDATION: Verify the result doesn't wrap entire content
						const parser2 = new DOMParser();
						const doc2 = parser2.parseFromString(`<div>${newContent}</div>`, 'text/html');
						const container2 = doc2.body.firstChild;
						const typostSpans = container2.querySelectorAll('span.typost-styled');

						// Check if we accidentally wrapped everything
						let wrappedEverything = false;
						typostSpans.forEach(span => {
							const spanText = span.textContent || '';
							const containerText = container2.textContent || '';

							if (spanText.length >= containerText.length - 1) {
								const isIntendedSelection = capturedSelection &&
								                            Math.abs(spanText.length - capturedSelection.length) <= 1;

								if (!isIntendedSelection) {
									wrappedEverything = true;
								}
							}
						});

						if (wrappedEverything) {
							success = false; // Force fallback
						}
					}
				}

				// 2. FALLBACK: String manipulation if range failed
				if (!success) {
					const attributes = { 'data-lineheight': inlineLineHeight.toString() };

					const fallbackResult = applyStylingSafeStringMethod(
						content,
						start,
						end,
						attributes,
						styleString
					);

					if (fallbackResult.success) {
						newContent = fallbackResult.content;
					} else {
						// Both methods failed - give up and don't update content
						return;
					}
				}

				// 3. Update content (success is guaranteed: either step 1 succeeded, or step 2 succeeded, or we returned above)
				setAttributes({ content: newContent });
				// CRITICAL: Clear originalContentRef so popover close doesn't restore old content
				originalContentRef.current = null;

				// Note: Re-detection handled by useEffect, no manual reset needed
			}
		}
	};

	// Handle font size preview change
	const handleFontSizePreviewChange = (min, preferred, max) => {
		const styles = {};

		// Include letter-spacing if active
		if (previewLetterSpacing !== 0) {
			styles['letter-spacing'] = `${previewLetterSpacing / 1000}em`;
		}

		// Include line-height if active
		if (previewLineHeight !== 0) {
			styles['line-height'] = previewLineHeight;
		}

		// Calculate clamp() for font-size
		const clampValue = `clamp(${min}px, ${preferred / 16}rem + ${((max - min) / (RESPONSIVE_FONT_MAX_VIEWPORT - RESPONSIVE_FONT_MIN_VIEWPORT)) * 100}vw, ${max}px)`;
		styles['font-size'] = clampValue;

		applyPreviewStyles({
			content,
			selectionStart,
			selectionEnd,
			clientId,
			styles,
			setAttributes,
			originalContentRef
		});
	};

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
	const getFilteredWeightOptions = (targetFontId, includeInherit = false) =>
		getFilteredWeightOptionsUtil(targetFontId, fontIdMap, includeInherit);

	const getClosestWeight = (currentWeight, availableWeights) =>
		getClosestWeightUtil(currentWeight, availableWeights);

	// Update paragraph style ref now that fontIdMap/getClosestWeight are available
	blockPropsRef.current = { fontIdMap, fontWeight, getClosestWeight };

	const toggleFeature = (featureId) => {
		// Check if we have a valid selection - if so, toggle inline instead
		if (selectionStart && selectionEnd &&
		    selectionStart.clientId === clientId &&
		    selectionEnd.clientId === clientId) {

			const start = selectionStart.offset || 0;
			const end = selectionEnd.offset || 0;

			// If there's a selection, toggle inline feature
			if (start !== end) {
				// Check if feature is already applied to this selection
				if (inlineFeaturesAtSelection.includes(featureId)) {
					// Feature is active - remove it
					removeFeatureFromSelection(featureId);
				} else {
					// Feature is not active - apply it
					applyFeatureToSelection(featureId);
				}
				return;
			}
		}

		// No selection - toggle block-level feature
		const newFeatures = [...features];
		const index = newFeatures.indexOf(featureId);
		if (index > -1) {
			newFeatures.splice(index, 1);
		} else {
			newFeatures.push(featureId);
		}
		setAttributes({ features: newFeatures });
	};

	// Toggle block-level feature (always applies to entire block, ignores selection)
	// Used by sidebar controls - for inline/selection control, use Quick Features Toggle
	const toggleBlockFeature = (featureId) => {
		const newFeatures = [...features];
		const index = newFeatures.indexOf(featureId);
		if (index > -1) {
			newFeatures.splice(index, 1);
		} else {
			newFeatures.push(featureId);
		}
		setAttributes({ features: newFeatures });
	};

	// Apply letter spacing only (no feature)
	const applyLetterSpacingOnly = () => {
		if (!content || inlineLetterSpacing === 0) return;

		// Check if we have a valid selection
		if (selectionStart && selectionEnd &&
		    selectionStart.clientId === clientId &&
		    selectionEnd.clientId === clientId) {

			const start = selectionStart.offset || 0;
			const end = selectionEnd.offset || 0;

			// COLLAPSED CURSOR: Update parent span in-place
			if (start === end) {
				const styleValue = `${inlineLetterSpacing / 1000}em`;
				const result = updateSpanPropertyInPlace(
					content,
					start,
					'data-letterspacing',
					inlineLetterSpacing.toString(),
					'letter-spacing',
					styleValue
				);

				if (result.success) {
					setAttributes({ content: result.content });
					originalContentRef.current = null;
					return;
				}
				// If failed, do nothing (no span at cursor with this property)
				return;
			}

			// SELECTION: Check if we should split parent span
			if (inlineStylesAtSelection && inlineStylesAtSelection.letterSpacing !== null) {
				// Parent span has letter-spacing, try splitting
				const styleValue = `${inlineLetterSpacing / 1000}em`;
				const result = splitSpanAndApply(
					content,
					start,
					end,
					'data-letterspacing',
					{ 'data-letterspacing': inlineLetterSpacing.toString() },
					`letter-spacing: ${styleValue}`
				);

				if (result.success) {
					setAttributes({ content: result.content });
					originalContentRef.current = null;
					return;
				}
				// If split failed, fall through to merge/nest logic below
			}

			if (start !== end) {
				// Build the styled span with ONLY letter spacing
				const styleArray = [];

				styleArray.push(`letter-spacing: ${inlineLetterSpacing / 1000}em`);

				const styleString = styleArray.join('; ');

				// Parse the current content as HTML
				const parser = new DOMParser();
				const doc = parser.parseFromString(`<div>${content}</div>`, 'text/html');
				const container = doc.body.firstChild;

				// STRATEGY: Try Range method first, fallback to string manipulation

				// 1. TRY RANGE METHOD
				const range = getRangeForOffsets(container, start, end, doc);

				const validation = validateRangeMatchesSelection(
					range,
					capturedSelection?.text || '',
					capturedSelection?.length || 0
				);

				let success = false;
				let newContent = content;

				if (validation.valid) {
					// Range is valid - try applying with it
					const attributes = { 'data-letterspacing': inlineLetterSpacing.toString() };
					success = applyOrMergeStyling(range, attributes, styleString, doc);

					if (success) {
						newContent = container.innerHTML;

						// POST-VALIDATION: Verify the result doesn't wrap entire content
						const parser2 = new DOMParser();
						const doc2 = parser2.parseFromString(`<div>${newContent}</div>`, 'text/html');
						const container2 = doc2.body.firstChild;
						const typostSpans = container2.querySelectorAll('span.typost-styled');

						// Check if we accidentally wrapped everything
						let wrappedEverything = false;
						typostSpans.forEach(span => {
							const spanText = span.textContent || '';
							const containerText = container2.textContent || '';

							if (spanText.length >= containerText.length - 1) {
								const isIntendedSelection = capturedSelection &&
								                            Math.abs(spanText.length - capturedSelection.length) <= 1;

								if (!isIntendedSelection) {
									wrappedEverything = true;
								}
							}
						});

						if (wrappedEverything) {
							success = false; // Force fallback
						}
					}
				}

				// 2. FALLBACK: String manipulation if range failed
				if (!success) {
					const attributes = { 'data-letterspacing': inlineLetterSpacing.toString() };

					const fallbackResult = applyStylingSafeStringMethod(
						content,
						start,
						end,
						attributes,
						styleString
					);

					if (fallbackResult.success) {
						newContent = fallbackResult.content;
					} else {
						// Both methods failed - give up and don't update content
						return;
					}
				}

				// 3. Update content (success is guaranteed: either step 1 succeeded, or step 2 succeeded, or we returned above)
				setAttributes({ content: newContent });
				// CRITICAL: Clear originalContentRef so popover close doesn't restore old content
				originalContentRef.current = null;

				// Note: Re-detection handled by useEffect, no manual reset needed
			}
		}
	};

	// Clear all inline formatting from selected text (removes typost-styled spans)
	// This does NOT remove block-level features/styles
	const clearInlineFormatting = () => {
		if (!content) return;

		// Check if we have a valid selection
		if (selectionStart && selectionEnd &&
		    selectionStart.clientId === clientId &&
		    selectionEnd.clientId === clientId) {

			const start = selectionStart.offset || 0;
			const end = selectionEnd.offset || 0;

			if (start !== end) {
				// Parse the current content as HTML
				const parser = new DOMParser();
				const doc = parser.parseFromString(`<div>${content}</div>`, 'text/html');
				const container = doc.body.firstChild;

				const range = getRangeForOffsets(container, start, end, doc);

				if (range) {
					// Find all typost-styled spans within the range
					const commonAncestor = range.commonAncestorContainer;
					let searchRoot = commonAncestor.nodeType === Node.TEXT_NODE
						? commonAncestor.parentElement
						: commonAncestor;

					// Check if the selection itself is inside an typost-styled span
					const parentSpan = searchRoot.closest('span.typost-styled');
					if (parentSpan) {
						searchRoot = parentSpan;
					}

					const styledSpans = searchRoot.querySelectorAll('span.typost-styled');

					// Also check if searchRoot itself is an typost-styled span
					const spansToUnwrap = [];
					if (searchRoot.classList && searchRoot.classList.contains('typost-styled')) {
						spansToUnwrap.push(searchRoot);
					}
					styledSpans.forEach(span => spansToUnwrap.push(span));

					// Unwrap each span (replace it with its contents)
					spansToUnwrap.forEach(span => {
						if (span.parentNode) {
							while (span.firstChild) {
								span.parentNode.insertBefore(span.firstChild, span);
							}
							span.parentNode.removeChild(span);
						}
					});

					// Get the updated HTML
					const newContent = container.innerHTML;
					setAttributes({ content: newContent });

				}
			}
		}
	};

	// Apply font size to selected text only (inline)
	const applyInlineFontSize = () => {
		if (!content || inlineFontSize === 'inherit') return;

		if (selectionStart && selectionEnd &&
		    selectionStart.clientId === clientId &&
		    selectionEnd.clientId === clientId) {

			const start = selectionStart.offset || 0;
			const end = selectionEnd.offset || 0;

			// Prepare attributes and style for both collapsed and selection cases
			const attributes = {
				'data-fontsize': inlineFontSize
			};

			let styleString = '';
			if (inlineFontSize === 'responsive') {
				attributes['data-fontsize-min'] = inlineFontSizeMin.toString();
				attributes['data-fontsize-preferred'] = inlineFontSizePreferred.toString();
				attributes['data-fontsize-max'] = inlineFontSizeMax.toString();
				styleString = `font-size: clamp(${inlineFontSizeMin}px, ${inlineFontSizePreferred / 16}rem + ${((inlineFontSizeMax - inlineFontSizeMin) / (RESPONSIVE_FONT_MAX_VIEWPORT - RESPONSIVE_FONT_MIN_VIEWPORT)) * 100}vw, ${inlineFontSizeMax}px)`;
			}

			// COLLAPSED CURSOR: Update parent span in-place
			if (start === end) {
				// Note: For collapsed cursor, updateSpanPropertyInPlace only handles the primary property
				// For font-size, we just update data-fontsize and style, but not the min/max attributes
				// This is acceptable since collapsed cursor updates are less common than selection-based styling
				const result = updateSpanPropertyInPlace(
					content,
					start,
					'data-fontsize',
					inlineFontSize,
					'font-size',
					styleString || inlineFontSize
				);

				if (result.success) {
					setAttributes({ content: result.content });
					originalContentRef.current = null;
					return;
				}
				return;
			}

			// SELECTION: Check if we should split parent span
			if (inlineStylesAtSelection && inlineStylesAtSelection.fontSize) {
				const result = splitSpanAndApply(
					content,
					start,
					end,
					'data-fontsize',
					attributes,
					styleString || `font-size: ${inlineFontSize}`
				);

				if (result.success) {
					setAttributes({ content: result.content });
					originalContentRef.current = null;
					return;
				}
			}

			if (start !== end) {

				// Parse the current content as HTML
				const parser = new DOMParser();
				const doc = parser.parseFromString(`<div>${content}</div>`, 'text/html');
				const container = doc.body.firstChild;

				// STRATEGY: Try Range method first, fallback to string manipulation

				// 1. TRY RANGE METHOD
				const range = getRangeForOffsets(container, start, end, doc);

				const validation = validateRangeMatchesSelection(
					range,
					capturedSelection?.text || '',
					capturedSelection?.length || 0
				);

				let success = false;
				let newContent = content;

				if (validation.valid) {
					// Range is valid - try applying with it
					success = applyOrMergeStyling(range, attributes, styleString, doc);

					if (success) {
						newContent = container.innerHTML;

						// POST-VALIDATION: Verify the result doesn't wrap entire content
						// This catches cases where surroundContents() silently fails
						const parser2 = new DOMParser();
						const doc2 = parser2.parseFromString(`<div>${newContent}</div>`, 'text/html');
						const container2 = doc2.body.firstChild;
						const typostSpans = container2.querySelectorAll('span.typost-styled');

						// Check if we accidentally wrapped everything
						let wrappedEverything = false;
						typostSpans.forEach(span => {
							const spanText = span.textContent || '';
							const containerText = container2.textContent || '';

							// If this span's text matches the entire container text, it wrapped everything
							if (spanText.length >= containerText.length - 1) {
								// EXCEPTION: If this span is our INTENDED selection, it's valid
								// Check if span text matches what we captured
								const isIntendedSelection = capturedSelection &&
								                            Math.abs(spanText.length - capturedSelection.length) <= 1;

								if (!isIntendedSelection) {
									wrappedEverything = true;
								}
							}
						});

						if (wrappedEverything) {
							success = false; // Force fallback
						}
					}
				}

				// 2. FALLBACK: String manipulation if range failed
				if (!success) {
					const fallbackResult = applyStylingSafeStringMethod(
						content,
						start,
						end,
						attributes,
						styleString
					);

					if (fallbackResult.success) {
						newContent = fallbackResult.content;
					} else {
						// Both methods failed - give up and don't update content
						return;
					}
				}

				// 3. Update content (success is guaranteed: either step 1 succeeded, or step 2 succeeded, or we returned above)
				setAttributes({ content: newContent });
				// CRITICAL: Clear originalContentRef so popover close doesn't restore old content
				originalContentRef.current = null;

				// Clear preview state after applying
				setPreviewFontSize('inherit');
				setPreviewFontSizeMin(inlineFontSizeMin);
				setPreviewFontSizePreferred(inlineFontSizePreferred);
				setPreviewFontSizeMax(inlineFontSizeMax);

				// Note: Re-detection handled by useEffect, no manual reset needed
			}
		}
	};

	// Apply font weight to selected text only (inline)
	const applyInlineFontWeight = () => {
		if (!content || inlineFontWeight === 'inherit') return;

		if (selectionStart && selectionEnd &&
		    selectionStart.clientId === clientId &&
		    selectionEnd.clientId === clientId) {

			const start = selectionStart.offset || 0;
			const end = selectionEnd.offset || 0;

			// COLLAPSED CURSOR: Update parent span in-place
			if (start === end) {
				const result = updateSpanPropertyInPlace(
					content,
					start,
					'data-fontweight',
					inlineFontWeight,
					'font-weight',
					inlineFontWeight
				);

				if (result.success) {
					setAttributes({ content: result.content });
					originalContentRef.current = null;
					return;
				}
				return;
			}

			// SELECTION: Check if we should split parent span
			if (inlineStylesAtSelection && inlineStylesAtSelection.fontWeight) {
				const result = splitSpanAndApply(
					content,
					start,
					end,
					'data-fontweight',
					{ 'data-fontweight': inlineFontWeight },
					`font-weight: ${inlineFontWeight}`
				);

				if (result.success) {
					setAttributes({ content: result.content });
					originalContentRef.current = null;
					return;
				}
			}

			if (start !== end) {
				// Parse the current content as HTML
				const parser = new DOMParser();
				const doc = parser.parseFromString(`<div>${content}</div>`, 'text/html');
				const container = doc.body.firstChild;

				// STRATEGY: Try Range method first, fallback to string manipulation

				// 1. TRY RANGE METHOD
				const range = getRangeForOffsets(container, start, end, doc);

				const validation = validateRangeMatchesSelection(
					range,
					capturedSelection?.text || '',
					capturedSelection?.length || 0
				);

				let success = false;
				let newContent = content;

				if (validation.valid) {
					// Range is valid - try applying with it
					const attributes = { 'data-fontweight': inlineFontWeight };
					const styleString = `font-weight: ${inlineFontWeight}`;
					success = applyOrMergeStyling(range, attributes, styleString, doc);

					if (success) {
						newContent = container.innerHTML;

						// POST-VALIDATION: Verify the result doesn't wrap entire content
						// This catches cases where surroundContents() silently fails
						const parser2 = new DOMParser();
						const doc2 = parser2.parseFromString(`<div>${newContent}</div>`, 'text/html');
						const container2 = doc2.body.firstChild;
						const typostSpans = container2.querySelectorAll('span.typost-styled');

						// Check if we accidentally wrapped everything
						let wrappedEverything = false;
						typostSpans.forEach(span => {
							const spanText = span.textContent || '';
							const containerText = container2.textContent || '';

							// If this span's text matches the entire container text, it wrapped everything
							if (spanText.length >= containerText.length - 1) {
								// EXCEPTION: If this span is our INTENDED selection, it's valid
								// Check if span text matches what we captured
								const isIntendedSelection = capturedSelection &&
								                            Math.abs(spanText.length - capturedSelection.length) <= 1;

								if (!isIntendedSelection) {
									wrappedEverything = true;
								}
							}
						});

						if (wrappedEverything) {
							success = false; // Force fallback
						}
					}
				}

				// 2. FALLBACK: String manipulation if range failed
				if (!success) {
					const attributes = { 'data-fontweight': inlineFontWeight };
					const styleString = `font-weight: ${inlineFontWeight}`;

					const fallbackResult = applyStylingSafeStringMethod(
						content,
						start,
						end,
						attributes,
						styleString
					);

					if (fallbackResult.success) {
						newContent = fallbackResult.content;
					} else {
						// Both methods failed - give up and don't update content
						return;
					}
				}

				// 3. Update content (success is guaranteed: either step 1 succeeded, or step 2 succeeded, or we returned above)
				setAttributes({ content: newContent });
				// CRITICAL: Clear originalContentRef so popover close doesn't restore old content
				originalContentRef.current = null;

				// Note: Re-detection handled by useEffect, no manual reset needed
			}
		}
	};

	// Apply font family to selected text only (inline)
	const applyInlineFontFamily = () => {
		if (!content || !inlineFontFamily) return;

		if (selectionStart && selectionEnd &&
		    selectionStart.clientId === clientId &&
		    selectionEnd.clientId === clientId) {

			const start = selectionStart.offset || 0;
			const end = selectionEnd.offset || 0;

			// COLLAPSED CURSOR: Update parent span in-place
			if (start === end) {
				const result = updateSpanPropertyInPlace(
					content,
					start,
					'data-font-id',
					inlineFontFamily,
					'font-family',
					`var(--font-${inlineFontFamily})`
				);

				if (result.success) {
					setAttributes({ content: result.content });
					originalContentRef.current = null;
					return;
				}
				return;
			}

			// SELECTION: Check if we should split parent span
			if (inlineStylesAtSelection && inlineStylesAtSelection.fontId) {
				const result = splitSpanAndApply(
					content,
					start,
					end,
					'data-font-id',
					{ 'data-font-id': inlineFontFamily },
					`font-family: var(--font-${inlineFontFamily})`
				);

				if (result.success) {
					setAttributes({ content: result.content });
					originalContentRef.current = null;
					return;
				}
			}

			if (start !== end) {
				// Get font details from fontIdMap
				const fontData = fontIdMap[inlineFontFamily];

				// Validate that font exists in the map
				if (!fontData) {
					return;
				}

				// Parse the current content as HTML
				const parser = new DOMParser();
				const doc = parser.parseFromString(`<div>${content}</div>`, 'text/html');
				const container = doc.body.firstChild;

				// STRATEGY: Try Range method first, fallback to string manipulation

				// 1. TRY RANGE METHOD
				const range = getRangeForOffsets(container, start, end, doc);

				const validation = validateRangeMatchesSelection(
					range,
					capturedSelection?.text || '',
					capturedSelection?.length || 0
				);

				let success = false;
				let newContent = content;

				if (validation.valid) {
					// Range is valid - try applying with it
					const attributes = { 'data-font-id': inlineFontFamily };
					const styleString = `font-family: var(--font-${inlineFontFamily})`;
					success = applyOrMergeStyling(range, attributes, styleString, doc);

					if (success) {
						newContent = container.innerHTML;

						// POST-VALIDATION: Verify the result doesn't wrap entire content
						// This catches cases where surroundContents() silently fails
						const parser2 = new DOMParser();
						const doc2 = parser2.parseFromString(`<div>${newContent}</div>`, 'text/html');
						const container2 = doc2.body.firstChild;
						const typostSpans = container2.querySelectorAll('span.typost-styled');

						// Check if we accidentally wrapped everything
						let wrappedEverything = false;
						typostSpans.forEach(span => {
							const spanText = span.textContent || '';
							const containerText = container2.textContent || '';

							// If this span's text matches the entire container text, it wrapped everything
							if (spanText.length >= containerText.length - 1) {
								// EXCEPTION: If this span is our INTENDED selection, it's valid
								// Check if span text matches what we captured
								const isIntendedSelection = capturedSelection &&
								                            Math.abs(spanText.length - capturedSelection.length) <= 1;

								if (!isIntendedSelection) {
									wrappedEverything = true;
								}
							}
						});

						if (wrappedEverything) {
							success = false; // Force fallback
						}
					}
				}

				// 2. FALLBACK: String manipulation if range failed
				if (!success) {
					const attributes = { 'data-font-id': inlineFontFamily };
					const styleString = `font-family: var(--font-${inlineFontFamily})`;

					const fallbackResult = applyStylingSafeStringMethod(
						content,
						start,
						end,
						attributes,
						styleString
					);

					if (fallbackResult.success) {
						newContent = fallbackResult.content;
					} else {
						// Both methods failed - give up and don't update content
						return;
					}
				}

				// 3. Update content (success is guaranteed: either step 1 succeeded, or step 2 succeeded, or we returned above)
				setAttributes({ content: newContent });
				// CRITICAL: Clear originalContentRef so popover close doesn't restore old content
				originalContentRef.current = null;

				// Note: Re-detection handled by useEffect, no manual reset needed
			}
		}
	};

	// Apply feature to selected text only (inline) - never applies to whole block
	const applyFeatureToSelection = (featureId) => {
		if (!content) return;

		// Check if we have a valid selection
		if (selectionStart && selectionEnd &&
		    selectionStart.clientId === clientId &&
		    selectionEnd.clientId === clientId) {

			const start = selectionStart.offset || 0;
			const end = selectionEnd.offset || 0;

			if (start !== end) {
				// Build the styled span with feature and letter spacing
				const styleArray = [];
				styleArray.push(`font-feature-settings: "${featureId}" 1`);

				// Always include letter-spacing, even if 0
				if (inlineLetterSpacing !== 0) {
					styleArray.push(`letter-spacing: ${inlineLetterSpacing / 1000}em`);
				}

				const styleString = styleArray.join('; ');

				// Parse the current content as HTML, find the text node at the selection, and wrap it
				// This is a workaround since we need to work with HTML directly
				const parser = new DOMParser();
				const doc = parser.parseFromString(`<div>${content}</div>`, 'text/html');
				const container = doc.body.firstChild;

				// STRATEGY: Try Range method first, fallback to string manipulation

				// 1. TRY RANGE METHOD
				const range = getRangeForOffsets(container, start, end, doc);

				const validation = validateRangeMatchesSelection(
					range,
					capturedSelection?.text || '',
					capturedSelection?.length || 0
				);

				let success = false;
				let newContent = content;

				if (validation.valid) {
					// Range is valid - try applying with it
					const attributes = { 'data-features': featureId };
					if (inlineLetterSpacing !== 0) {
						attributes['data-letterspacing'] = inlineLetterSpacing.toString();
					}
					success = applyOrMergeStyling(range, attributes, styleString, doc);

					if (success) {
						newContent = container.innerHTML;

						// POST-VALIDATION: Verify the result doesn't wrap entire content
						// This catches cases where surroundContents() silently fails
						const parser2 = new DOMParser();
						const doc2 = parser2.parseFromString(`<div>${newContent}</div>`, 'text/html');
						const container2 = doc2.body.firstChild;
						const typostSpans = container2.querySelectorAll('span.typost-styled');

						// Check if we accidentally wrapped everything
						let wrappedEverything = false;
						// Check ALL spans, not just single-span case
						typostSpans.forEach(span => {
							const spanText = span.textContent || '';
							const containerText = container2.textContent || '';

							// If this span's text matches the entire container text, it wrapped everything
							if (spanText.length >= containerText.length - 1) {
								// EXCEPTION: If this span is our INTENDED selection, it's valid
								// Check if span text matches what we captured
								const isIntendedSelection = capturedSelection &&
								                            Math.abs(spanText.length - capturedSelection.length) <= 1;

								if (!isIntendedSelection) {
									wrappedEverything = true;

								}
							}
						});

						if (wrappedEverything) {
							success = false; // Force fallback
						}
					}
				}

				// 2. FALLBACK: String manipulation if range failed
				if (!success) {

					const attributes = { 'data-features': featureId };
					if (inlineLetterSpacing !== 0) {
						attributes['data-letterspacing'] = inlineLetterSpacing.toString();
					}
					const fallbackResult = applyStylingSafeStringMethod(
						content,
						start,
						end,
						attributes,
						styleString
					);

					if (fallbackResult.success) {
						newContent = fallbackResult.content;
					} else {
						// Both methods failed - give up and don't update content
						return;
					}
				}

				// 3. Update content (success is guaranteed: either step 1 succeeded, or step 2 succeeded, or we returned above)
				setAttributes({ content: newContent });
			}
		}
	};

	// Remove a specific feature from the selected text
	const removeFeatureFromSelection = (featureId) => {
		if (!content) return;

		// Check if we have a valid selection
		if (selectionStart && selectionEnd &&
		    selectionStart.clientId === clientId &&
		    selectionEnd.clientId === clientId) {

			const start = selectionStart.offset || 0;
			const end = selectionEnd.offset || 0;

			if (start !== end) {
				// Parse the current content as HTML
				const parser = new DOMParser();
				const doc = parser.parseFromString(`<div>${content}</div>`, 'text/html');
				const container = doc.body.firstChild;

				const range = getRangeForOffsets(container, start, end, doc);

				if (range) {
					// Find all typost-styled spans within the range that have this feature
					const commonAncestor = range.commonAncestorContainer;
					let searchRoot = commonAncestor.nodeType === Node.TEXT_NODE
						? commonAncestor.parentElement
						: commonAncestor;

					// Check if the selection itself is inside a typost-styled span
					const parentSpan = searchRoot.closest('span.typost-styled');
					if (parentSpan) {
						searchRoot = parentSpan;
					}

					const styledSpans = searchRoot.querySelectorAll('span.typost-styled');

					// Collect spans that have this specific feature
					const spansToProcess = [];
					if (searchRoot.classList && searchRoot.classList.contains('typost-styled')) {
						const dataFeatures = searchRoot.getAttribute('data-features');
						if (dataFeatures && dataFeatures.includes(featureId)) {
							spansToProcess.push(searchRoot);
						}
					}
					styledSpans.forEach(span => {
						const dataFeatures = span.getAttribute('data-features');
						if (dataFeatures && dataFeatures.includes(featureId)) {
							spansToProcess.push(span);
						}
					});

					// Remove the feature from each span
					spansToProcess.forEach(span => {
						const dataFeatures = span.getAttribute('data-features');
						if (dataFeatures) {
							// Split features (comma-separated) and remove the target feature
							const featureList = dataFeatures.split(',').map(f => f.trim()).filter(f => f && f !== featureId);

							if (featureList.length === 0) {
								// No features left - remove data-features attribute
								span.removeAttribute('data-features');

								// Remove font-feature-settings from style, keep other styles
								const currentStyleForRemoval = span.getAttribute('style') || '';
								const remainingStyleObj = {};
								currentStyleForRemoval.split(';').forEach(rule => {
									const [prop, value] = rule.split(':').map(s => s.trim());
									if (prop && value && prop !== 'font-feature-settings') {
										remainingStyleObj[prop] = value;
									}
								});

								// Rebuild style or remove it entirely
								if (Object.keys(remainingStyleObj).length > 0) {
									const newStyle = Object.entries(remainingStyleObj)
										.map(([prop, value]) => `${prop}: ${value}`)
										.join('; ');
									span.setAttribute('style', newStyle);
								} else {
									span.removeAttribute('style');
								}

								// Check if any other typost attributes remain before unwrapping
								const hasFontId = span.getAttribute('data-font-id');
								const hasFontSize = span.getAttribute('data-fontsize');
								const hasFontWeight = span.getAttribute('data-fontweight');
								const hasLetterSpacing = span.getAttribute('data-letterspacing');
								const hasLineHeight = span.getAttribute('data-lineheight');

								const hasAnyAttributes = hasFontId || hasFontSize ||
								                         hasFontWeight || hasLetterSpacing || hasLineHeight;

								if (!hasAnyAttributes && Object.keys(remainingStyleObj).length === 0) {
									// No attributes or styles remain - safe to unwrap the span
									if (span.parentNode) {
										while (span.firstChild) {
											span.parentNode.insertBefore(span.firstChild, span);
										}
										span.parentNode.removeChild(span);
									}
								}
							} else {
								// Update the span with remaining features (comma-separated)
								span.setAttribute('data-features', featureList.join(','));

								// Rebuild font-feature-settings CSS with all remaining features
								const featureSettings = featureList.map(f => `"${f}" 1`).join(', ');
								const currentStyle = span.getAttribute('style') || '';

								// Parse existing styles
								const styleObj = {};
								currentStyle.split(';').forEach(rule => {
									const [prop, value] = rule.split(':').map(s => s.trim());
									if (prop && value) {
										styleObj[prop] = value;
									}
								});

								// Update font-feature-settings
								styleObj['font-feature-settings'] = featureSettings;

								// Rebuild style string
								const newStyle = Object.entries(styleObj)
									.filter(([prop, value]) => prop && value)
									.map(([prop, value]) => `${prop}: ${value}`)
									.join('; ');

								span.setAttribute('style', newStyle);
							}
						}
					});

					// Get the updated HTML
					const newContent = container.innerHTML;
					setAttributes({ content: newContent });
				}
			}
		}
	};

	// Clear all inline typost-styled spans from content (doesn't affect block-level settings)
	const clearAllInlineFeatures = () => {
		if (!content) return;

		// Parse the content and remove all typost-styled spans
		const parser = new DOMParser();
		const doc = parser.parseFromString(`<div>${content}</div>`, 'text/html');
		const container = doc.body.firstChild;

		// Find all typost-styled spans
		const styledSpans = container.querySelectorAll('span.typost-styled');

		// Unwrap each span (replace it with its contents)
		styledSpans.forEach(span => {
			if (span.parentNode) {
				while (span.firstChild) {
					span.parentNode.insertBefore(span.firstChild, span);
				}
				span.parentNode.removeChild(span);
			}
		});

		// Get the updated HTML
		const newContent = container.innerHTML;
		setAttributes({ content: newContent });
		setShowInlineResetConfirm(false);
	};

	// Reset entire block (both inline and block-level features/styles)
	const resetEntireBlock = () => {
		// Clear inline features and reset block-level attributes in a single setAttributes call
		let newContent = content;

		if (content) {
			const parser = new DOMParser();
			const doc = parser.parseFromString(`<div>${content}</div>`, 'text/html');
			const container = doc.body.firstChild;
			const styledSpans = container.querySelectorAll('span.typost-styled');
			styledSpans.forEach(span => {
				if (span.parentNode) {
					while (span.firstChild) {
						span.parentNode.insertBefore(span.firstChild, span);
					}
					span.parentNode.removeChild(span);
				}
			});
			newContent = container.innerHTML;
		}

		// Single setAttributes call for both content and block-level attributes
		setAttributes({
			content: newContent,
			features: [],
			fontFamily: '',
			fontWeight: '',
			letterSpacing: 0,
			lineHeight: 0,
			fontSize: 'responsive',
			fontSizeMin: 16,
			fontSizePreferred: 32,
			fontSizeMax: 64
		});

		setShowInlineResetConfirm(false);
		setShowFullResetConfirm(false);
	};

	// Build inline style for preview
	const buildStyle = () => {
		const styles = {};

		// Note: styleClass is used by save.js to skip inline styles on the frontend
		// (CSS class provides styling there). In the editor, we always need inline
		// styles for visual preview since the block element doesn't carry the class.

		if (features.length > 0) {
			styles.fontFeatureSettings = features.map(f => `"${f}" 1`).join(', ');
		}

		if (fontFamily) {
			// Use CSS variable if fontId is set (for font replacements)
			// Otherwise use literal font name for legacy/custom fonts
			styles.fontFamily = fontId ? `var(--font-${fontId})` : fontFamily;
		}

		if (fontWeight) {
			styles.fontWeight = fontWeight;
		}

		if (letterSpacing !== 0) {
			styles.letterSpacing = `${letterSpacing / 1000}em`;
		}

		if (lineHeight !== 0) {
			styles.lineHeight = lineHeight;
		}

		if (fontSize === 'responsive') {
			styles.fontSize = `clamp(${fontSizeMin}px, ${fontSizePreferred / 16}rem + ${((fontSizeMax - fontSizeMin) / (RESPONSIVE_FONT_MAX_VIEWPORT - RESPONSIVE_FONT_MIN_VIEWPORT)) * 100}vw, ${fontSizeMax}px)`;
		}

		if (fontVariationSettings) {
			styles.fontVariationSettings = fontVariationSettings;
		}

		if (textAlign) {
			styles.textAlign = textAlign;
		}

		return styles;
	};

	// Category titles
	const getCategoryTitle = (category) => {
		const titles = {
			'ligatures': __('Ligatures', 'typography-stylist'),
			'stylistic-sets': __('Stylistic Sets', 'typography-stylist'),
			'alternates': __('Swashes & Alternates', 'typography-stylist'),
			'decorative': __('Decorative', 'typography-stylist'),
			'numerals': __('Numerals & Figures', 'typography-stylist'),
			'capitals': __('Capitals & Case', 'typography-stylist'),
			'positional': __('Positional Forms', 'typography-stylist'),
			'super-sub': __('Superscript & Ordinals', 'typography-stylist'),
			'other': __('Other Features', 'typography-stylist')
		};
		return titles[category] || category;
	};

	// Render reset panel content based on confirmation state
	const renderResetPanelContent = () => {
		// Show confirmation for clearing inline features
		if (showInlineResetConfirm) {
			return (
				<div style={{ padding: '16px', backgroundColor: '#fff3cd', border: '1px solid #ffc107', borderRadius: '4px' }}>
					<p style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 600, color: '#856404' }}>
						⚠️ {__('Are you sure?', 'typography-stylist')}
					</p>
					<p style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#856404' }}>
						{__('This will remove all inline features (typost-styled spans) from this block. Block-level settings will remain.', 'typography-stylist')}
					</p>
					<div style={{ display: 'flex', gap: '8px' }}>
						<Button
							variant="primary"
							isDestructive
							onClick={clearAllInlineFeatures}
							style={{ flex: 1 }}
						>
							{__('Yes, Clear', 'typography-stylist')}
						</Button>
						<Button
							variant="secondary"
							onClick={() => setShowInlineResetConfirm(false)}
							style={{ flex: 1 }}
						>
							{__('Cancel', 'typography-stylist')}
						</Button>
					</div>
				</div>
			);
		}

		// Show confirmation for full reset
		if (showFullResetConfirm) {
			return (
				<div style={{ padding: '16px', backgroundColor: '#ffe5e5', border: '1px solid #dc3232', borderRadius: '4px' }}>
					<p style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 600, color: '#a00' }}>
						🚨 {__('Reset Entire Block?', 'typography-stylist')}
					</p>
					<p style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#a00' }}>
						{__('This will completely reset this block, removing both inline features AND all block-level settings (font, features, spacing, etc.). This cannot be undone.', 'typography-stylist')}
					</p>
					<div style={{ display: 'flex', gap: '8px' }}>
						<Button
							variant="primary"
							isDestructive
							onClick={resetEntireBlock}
							style={{ flex: 1 }}
						>
							{__('Yes, Reset All', 'typography-stylist')}
						</Button>
						<Button
							variant="secondary"
							onClick={() => setShowFullResetConfirm(false)}
							style={{ flex: 1 }}
						>
							{__('Cancel', 'typography-stylist')}
						</Button>
					</div>
				</div>
			);
		}

		// Default: show both reset buttons
		return (
			<>
				<Button
					variant="secondary"
					isDestructive
					onClick={() => setShowInlineResetConfirm(true)}
					style={{ marginBottom: '12px', width: '100%', justifyContent: 'center' }}
				>
					{__('Clear Individual Features', 'typography-stylist')}
				</Button>
				<p style={{ fontSize: '11px', color: '#666', margin: '0 0 16px 0' }}>
					{__('Removes all inline features (typost-styled spans) but keeps block-level settings.', 'typography-stylist')}
				</p>

				<Button
					variant="secondary"
					isDestructive
					onClick={() => setShowFullResetConfirm(true)}
					style={{ width: '100%', justifyContent: 'center' }}
				>
					{__('Reset Entire Block', 'typography-stylist')}
				</Button>
				<p style={{ fontSize: '11px', color: '#666', margin: '8px 0 0 0' }}>
					{__('Clears both individual features AND block-level settings (font, features, spacing, etc.).', 'typography-stylist')}
				</p>
			</>
		);
	};

	// Store latest apply functions in refs for debounced auto-apply (avoids stale closures)
	applyLineHeightRef.current = applyLineHeightOnly;
	applyLetterSpacingRef.current = applyLetterSpacingOnly;
	applyFontSizeRef.current = applyInlineFontSize;
	applyFontWeightRef.current = applyInlineFontWeight;
	applyFontFamilyRef.current = applyInlineFontFamily;

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
					{isPopoverOpen && (
						<Modal
							title=""
							onRequestClose={handlePopoverClose}
							className={`typost-modal typost-block-modal ${isDragging ? 'is-dragging' : ''} ${isResizing ? 'is-resizing' : ''}`}
							isDismissible={true}
							shouldCloseOnClickOutside={false}
							shouldCloseOnEsc={true}
							__experimentalHideHeader={true}
							onMouseDown={(e) => {
								// Only trigger drag if clicking on header, not content
								if (e.target.classList.contains('typost-modal-header') ||
									e.target.closest('.typost-modal-header')) {
									handleDragStart(e);
								}
							}}
							style={{
								position: 'fixed',
								top: `${modalY}px`,
								left: `${modalX}px`,
								width: `${modalWidth}px`,
								height: `${modalHeight}px`,
								maxWidth: 'none',
								maxHeight: 'none',
								transform: 'none'
							}}
						>
							{/* Custom draggable header */}
							<div
								className="typost-modal-header"
								onMouseDown={handleDragStart}
								role="toolbar"
								aria-label={__('Drag to reposition modal', 'typography-stylist')}
								tabIndex={0}
								style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
							>
								<h3>{__('Quick Feature Toggles', 'typography-stylist')}</h3>
								<Button
									icon="no-alt"
									label={__('Close', 'typography-stylist')}
									onClick={handlePopoverClose}
									className="typost-modal-close-button"
								/>
							</div>

							{/* Modal content wrapper with scroll */}
							<div className="typost-modal-content" style={{
								height: `calc(${modalHeight}px - 60px)`,
								overflowY: 'auto'
							}}>
								{/* Drag instruction notice */}
								<Notice
									status="info"
									isDismissible={false}
									className="typost-drag-notice"
									style={{ margin: '0 0 16px 0' }}
								>
									<p style={{ margin: 0 }}>
										{'💡 ' + __('Tip: Drag the title bar to reposition this panel', 'typography-stylist')}
									</p>
								</Notice>

								<div style={{ padding: '0 16px 16px 16px' }}>

								{/* Extension hook point: top of QFT modal (e.g., Paragraph Styles dropdown) */}
								<div className="typost-hook-point" data-hook="typost_qft_modal_top" ref={(el) => {
									if (el && !el._hooked) {
										el._hooked = true;
										window.typostHooks.doAction('typost_qft_modal_top', el, {
											fontId, fontWeight, fontSize, fontSizeMin, fontSizePreferred, fontSizeMax,
											letterSpacing, lineHeight, features, content, capturedSelection,
											inlineFontFamily, inlineFontWeight
										});
									}
								}} />

								{/* Font Family Control */}
								<div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '2px solid #ddd' }}>
									<SelectControl
										label={__('Font Family (for selected text)', 'typography-stylist')}
										value={inlineFontFamily}
										onChange={(value) => {
											if (isWpLibraryValue(value)) {
												// Unadopted WP Font Library font — adopt first
												// (idempotently allocates a font_id), then apply
												adoptWpFont(wpSlugFromValue(value)).then((font) => {
													fontIdMap[font.font_id] = {
														family: font.font_family,
														fallbacks: font.fallbacks || '',
														availableWeights: []
													};
													setInlineFontFamily(String(font.font_id));
													debouncedApplyFontFamily();
												}).catch(() => {});
												return;
											}
											setInlineFontFamily(value);
											if (value) {
												debouncedApplyFontFamily();
												// Validate inline weight against new font
												const newFontId = parseInt(value, 10);
												if (!isNaN(newFontId) && fontIdMap[newFontId]) {
													const available = fontIdMap[newFontId].availableWeights;
													if (available && available.length > 0 && inlineFontWeight !== 'inherit') {
														if (!available.includes(inlineFontWeight)) {
															setInlineFontWeight(getClosestWeight(inlineFontWeight, available));
														}
														if (available.length === 1) {
															setInlineFontWeight(available[0]);
															debouncedApplyFontWeight();
														}
													}
												}
											}
										}}
										options={[
											{ label: __('Select a font...', 'typography-stylist'), value: '' },
											...fontOptions
										]}
									/>
									{inlineFontFamily && (
										<Button
											variant="secondary"
											onClick={resetFontFamily}
											isDestructive
											style={{ marginTop: '8px', fontSize: '11px', padding: '2px 8px', height: 'auto' }}
											icon="undo"
										>
											{__('Reset Font Family', 'typography-stylist')}
										</Button>
									)}
								</div>

								{/* Font Weight Control - replaceable via typost_weight_control filter */}
								{(() => {
									const activeFontId = inlineFontFamilyAtSelection || fontId;
									const weightControlType = window.typostHooks
										? window.typostHooks.applyFilters('typost_weight_control', 'default', activeFontId)
										: 'default';

									// 'hidden': suppress the weight control entirely (no wrapper, no hook)
									if (weightControlType === 'hidden') return null;

									if (weightControlType !== 'default') {
										return (
											<div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '2px solid #ddd' }}>
												{/* key: remount (and re-fire the action) when the active font changes */}
												<div key={`typost-weight-${activeFontId || 'none'}`} className="typost-hook-point" data-hook="typost_weight_control" ref={(el) => {
													if (el && !el._hooked) {
														el._hooked = true;
														window.typostHooks.doAction('typost_weight_control', el, {
															fontId, fontWeight, inlineFontFamily, inlineFontWeight, inlineFontFamilyAtSelection
														});
													}
												}} />
											</div>
										);
									}

									const inlineWeightOptions = getFilteredWeightOptions(activeFontId, true);
									// Hide if only "Inherit" + 1 weight (or fewer) — means the font has a single weight
									const weightOnlyOptions = inlineWeightOptions.filter(o => o.value !== 'inherit');
									if (weightOnlyOptions.length <= 1) return null;
									return (
										<div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '2px solid #ddd' }}>
											<SelectControl
												label={__('Font Weight (for selected text)', 'typography-stylist')}
												value={inlineFontWeight}
												onChange={(value) => {
													setInlineFontWeight(value);
													if (value !== 'inherit') {
														debouncedApplyFontWeight();
													}
												}}
												options={inlineWeightOptions}
											/>
											{inlineFontWeight !== 'inherit' && (
												<Button
													variant="secondary"
													onClick={resetFontWeight}
													isDestructive
													style={{ marginTop: '8px', fontSize: '11px', padding: '2px 8px', height: 'auto' }}
													icon="undo"
												>
													{__('Reset Font Weight', 'typography-stylist')}
												</Button>
											)}
										</div>
									);
								})()}

								{/* Extension hook point: after font controls (e.g., Variable Font axes).
								    key: remount (and re-fire the action) when any active font changes */}
								<div key={`typost-afc-${fontId || 'none'}-${inlineFontFamily || 'none'}-${inlineFontFamilyAtSelection || 'none'}`} className="typost-hook-point" data-hook="typost_qft_after_font_controls" ref={(el) => {
									if (el && !el._hooked) {
										el._hooked = true;
										window.typostHooks.doAction('typost_qft_after_font_controls', el, {
											fontId, fontWeight, inlineFontFamily, inlineFontWeight, inlineFontFamilyAtSelection
										});
									}
								}} />

								{/* Font Size Control */}
								<div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '2px solid #ddd' }}>
									<SelectControl
										label={__('Font Size (for selected text)', 'typography-stylist')}
										value={inlineFontSize}
										onChange={(value) => {
											setInlineFontSize(value);
										}}
										options={[
											{ label: __('Inherit from block', 'typography-stylist'), value: 'inherit' },
											{ label: __('Responsive (fluid)', 'typography-stylist'), value: 'responsive' }
										]}
									/>
									{inlineFontSize === 'responsive' && (
										<>
											<RangeControl
												label={__('Mobile (320px+)', 'typography-stylist')}
												value={inlineFontSizeMin}
												onChange={(value) => {
													setInlineFontSizeMin(value);
													debouncedApplyFontSize();
												}}
												min={8}
												max={200}
												step={1}
											/>
											<RangeControl
												label={__('Intermediate', 'typography-stylist')}
												value={inlineFontSizePreferred}
												onChange={(value) => {
													setInlineFontSizePreferred(value);
													debouncedApplyFontSize();
												}}
												min={8}
												max={400}
												step={1}
											/>
											<RangeControl
												label={__('Large (1920px)', 'typography-stylist')}
												value={inlineFontSizeMax}
												onChange={(value) => {
													setInlineFontSizeMax(value);
													debouncedApplyFontSize();
												}}
												min={8}
												max={400}
												step={1}
											/>
											{!isValidFontSizeRange(inlineFontSizeMin, inlineFontSizePreferred, inlineFontSizeMax) && (
												<Notice status="warning" isDismissible={false}>
													{__('Note: Font sizes are out of order. Mobile should be ≤ Intermediate ≤ Large for expected behavior.', 'typography-stylist')}
												</Notice>
											)}
											<Button
												variant="secondary"
												onClick={resetFontSize}
												isDestructive
												style={{ marginTop: '8px', fontSize: '11px', padding: '2px 8px', height: 'auto' }}
												icon="undo"
											>
												{__('Reset Font Size', 'typography-stylist')}
											</Button>
										</>
									)}
								</div>

								{/* Line Height Control */}
								<div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '2px solid #ddd' }}>
									<RangeControl
										label={__('Line Height (for selected text)', 'typography-stylist')}
										value={inlineLineHeight === 0 ? 1.5 : inlineLineHeight}
										onChange={(value) => {
											setInlineLineHeight(value);
											if (value !== 0) {
												debouncedApplyLineHeight();
											}
										}}
										min={0.5}
										max={3}
										step={0.1}
										help={inlineLineHeight === 0 ? __('Currently using browser default', 'typography-stylist') : inlineLineHeight}
										allowReset
										resetFallbackValue={0}
										marks={[
											{ value: 1.5, label: '1.5' }
										]}
										renderTooltipContent={(value) => inlineLineHeight === 0 ? __('Browser default', 'typography-stylist') : value}
									/>
									{inlineLineHeight !== 0 && (
										<Button
											variant="secondary"
											onClick={clearLineHeight}
											isDestructive
											style={{ marginTop: '8px', fontSize: '11px', padding: '2px 8px', height: 'auto' }}
											icon="undo"
										>
											{__('Clear', 'typography-stylist')}
										</Button>
									)}
								</div>

								{/* Letter Spacing Control */}
								<div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '2px solid #ddd' }}>
									<RangeControl
										label={__('Letter Spacing (for selected text)', 'typography-stylist')}
										value={inlineLetterSpacing}
										onChange={(value) => {
											setInlineLetterSpacing(value);
											if (value !== 0) {
												debouncedApplyLetterSpacing();
											}
										}}
										min={-200}
										max={200}
										step={1}
										help={inlineLetterSpacing === 0 ? __('Normal', 'typography-stylist') : `${inlineLetterSpacing / 1000}em`}
										allowReset
										resetFallbackValue={0}
									/>
									{inlineLetterSpacing !== 0 && (
										<Button
											variant="secondary"
											onClick={clearLetterSpacing}
											isDestructive
											style={{ marginTop: '8px', fontSize: '11px', padding: '2px 8px', height: 'auto' }}
											icon="undo"
											isSmall
										>
											{__('Clear', 'typography-stylist')}
										</Button>
									)}
								</div>

								{/* Extension hook point: before features (e.g., Glyphs panel) */}
								<div className="typost-hook-point" data-hook="typost_qft_before_features" ref={(el) => {
									if (el && !el._hooked) {
										el._hooked = true;
										window.typostHooks.doAction('typost_qft_before_features', el, {
											fontId, features, inlineFontFamily, capturedSelection, content, clientId
										});
									}
								}} />

								{/* Active Features Summary */}
								{inlineFeaturesAtSelection.length > 0 && (
									<div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f0f6fc', borderRadius: '4px', border: '1px solid #0783be' }}>
										<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
											<h5 style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#0783be' }}>
												{__('Active Features:', 'typography-stylist')}
											</h5>
											<Button
												variant="secondary"
												isDestructive
												onClick={clearInlineFormatting}
												style={{ fontSize: '11px', padding: '2px 8px', height: 'auto' }}
											>
												{__('Clear All', 'typography-stylist')}
											</Button>
										</div>
										<div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
											{inlineFeaturesAtSelection.map(featureId => {
												const featureName = availableFeatures.find(f => f.id === featureId)?.name || featureId;
												return (
													<code key={featureId} style={{
														fontSize: '11px',
														padding: '4px 8px',
														backgroundColor: '#fff',
														border: '1px solid #0783be',
														borderRadius: '3px',
														color: '#0783be',
														fontWeight: 500
													}}>
														{featureName} ({featureId})
													</code>
												);
											})}
										</div>
									</div>
								)}

								{Object.entries(groupedFeatures).map(([category, categoryFeatures]) => {
									// Check if any features in this category are active
									const hasActiveFeatures = categoryFeatures.some(feature =>
										features.includes(feature.id) || inlineFeaturesAtSelection.includes(feature.id)
									);

									return (
										<PanelBody
											key={category}
											title={getCategoryTitle(category)}
											initialOpen={hasActiveFeatures}
											className={`typost-feature-category-panel ${hasActiveFeatures ? 'has-active-features' : ''}`}
										>
										{categoryFeatures.map(feature => {
											const sampleText = previewText || 'ffi ffl Th AE';
											// Check both block-level features and inline features at cursor
											const isActive = features.includes(feature.id) || inlineFeaturesAtSelection.includes(feature.id);
											return (
												<div key={feature.id} style={{ marginBottom: '12px', borderBottom: '1px solid #ddd', paddingBottom: '8px' }}>
													<div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
														<label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', flex: 1 }}>
															<input
																type="checkbox"
																checked={isActive}
																onChange={() => toggleFeature(feature.id)}
																style={{ marginRight: '8px' }}
															/>
															<span style={{ fontSize: '13px', fontWeight: 500 }}>{feature.name}</span>
															<code style={{ fontSize: '11px', marginLeft: '8px', color: '#666' }}>{feature.id}</code>
														</label>
													</div>
													<div style={{ fontSize: '12px', color: '#666', marginBottom: '6px', marginLeft: '24px' }}>
														{feature.description}
													</div>
													<div className="typost-feature-preview" style={{ marginLeft: '24px' }}>
														<Button
															className="typost-feature-preview-on typost-feature-apply-btn"
															onClick={() => applyFeatureToSelection(feature.id)}
															style={{
																fontFeatureSettings: [...new Set([feature.id, ...features, ...inlineFeaturesAtSelection])].map(f => `"${f}" 1`).join(', '),
																fontFamily: inlineFontFamilyAtSelection
																	? `var(--font-${inlineFontFamilyAtSelection})`
																	: (fontFamily || computedFont || 'inherit')
															}}
														>
															{sampleText}
														</Button>
													</div>
												</div>
											);
										})}
									</PanelBody>
									);
								})}
								</div>

								{/* Extension hook point: after features */}
								<div className="typost-hook-point" data-hook="typost_qft_after_features" ref={(el) => {
									if (el && !el._hooked) {
										el._hooked = true;
										window.typostHooks.doAction('typost_qft_after_features', el, {
											fontId, features, content
										});
									}
								}} />
							</div>

							{/* Resize handles */}
							<div className="typost-resize-handles">
								<div className="typost-resize-handle typost-resize-handle-n" onMouseDown={(e) => handleResizeStart(e, 'n')} />
								<div className="typost-resize-handle typost-resize-handle-ne" onMouseDown={(e) => handleResizeStart(e, 'ne')} />
								<div className="typost-resize-handle typost-resize-handle-e" onMouseDown={(e) => handleResizeStart(e, 'e')} />
								<div className="typost-resize-handle typost-resize-handle-se" onMouseDown={(e) => handleResizeStart(e, 'se')} />
								<div className="typost-resize-handle typost-resize-handle-s" onMouseDown={(e) => handleResizeStart(e, 's')} />
								<div className="typost-resize-handle typost-resize-handle-sw" onMouseDown={(e) => handleResizeStart(e, 'sw')} />
								<div className="typost-resize-handle typost-resize-handle-w" onMouseDown={(e) => handleResizeStart(e, 'w')} />
								<div className="typost-resize-handle typost-resize-handle-nw" onMouseDown={(e) => handleResizeStart(e, 'nw')} />
							</div>
						</Modal>
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
				<PanelBody title={__('Help & Tips', 'typography-stylist')} initialOpen={false}>
					<p style={{ fontSize: '13px', lineHeight: '1.6', marginTop: 0 }}>
						{__('The Typography Stylist block provides two levels of control:', 'typography-stylist')}
					</p>
					<ul style={{ fontSize: '13px', lineHeight: '1.6', marginLeft: '16px', listStyleType: 'disc' }}>
						<li><strong>{__('Sidebar controls', 'typography-stylist')}</strong> — {__('Apply settings to the entire block (font, size, weight, features).', 'typography-stylist')}</li>
						<li><strong>{__('Quick Features Toggle', 'typography-stylist')}</strong> — {__('Select text and use the toolbar popover to style individual words or phrases.', 'typography-stylist')}</li>
					</ul>
					<p style={{ fontSize: '13px', lineHeight: '1.6' }}>
						{__('A clean semantic heading is automatically generated for screen readers — no extra configuration needed.', 'typography-stylist')}
					</p>
					<p style={{ fontSize: '12px', lineHeight: '1.5', color: '#757575' }}>
						{__('Tip: Fonts added in Settings → Typography Stylist only load on pages where they are used, keeping your site fast.', 'typography-stylist')}
					</p>
				</PanelBody>

				<div className="typost-hook-point" data-hook="typost_inspector_top" ref={(el) => {
					if (el && !el._hooked) {
						el._hooked = true;
						window.typostHooks.doAction('typost_inspector_top', el, { fontId, fontWeight, features, fontSize, letterSpacing, lineHeight });
					}
				}} />

				{fontOptions.length > 0 && (
					<PanelBody title={__('Font Family', 'typography-stylist')} initialOpen={false}>
						<InfoTip text={__('Choose a custom font. Fonts only load on pages where they are used, keeping your site fast.', 'typography-stylist')} />
						<SelectControl
							value={fontId ? String(fontId) : (fontFamily || '')}
							options={[
								{ label: __('(Default)', 'typography-stylist'), value: '' },
								...fontOptions
							]}
							onChange={(value) => {
								if (value === '') {
									setAttributes({ fontFamily: '', fontId: 0 });
								} else if (isWpLibraryValue(value)) {
									// Unadopted WP Font Library font — adopt first
									// (idempotently allocates a font_id), then store
									// fontId exactly like any other source
									adoptWpFont(wpSlugFromValue(value)).then((font) => {
										fontIdMap[font.font_id] = {
											family: font.font_family,
											fallbacks: font.fallbacks || '',
											availableWeights: []
										};
										setAttributes({
											fontFamily: font.font_family,
											fontId: font.font_id
										});
									}).catch(() => {});
								} else {
									// Try to parse as ID (new system)
									const selectedFontId = parseInt(value, 10);
									if (!isNaN(selectedFontId) && fontIdMap[selectedFontId]) {
										// New ID-based system
										const fontData = fontIdMap[selectedFontId];
										const newAttrs = {
											fontFamily: fontData.family,
											fontId: selectedFontId
										};

										// Validate weight against new font's available weights
										const available = fontData.availableWeights;
										if (available && available.length > 0) {
											if (!available.includes(fontWeight)) {
												newAttrs.fontWeight = getClosestWeight(fontWeight, available);
											}
											if (available.length === 1 && fontWeight !== available[0]) {
												newAttrs.fontWeight = available[0];
											}
										}

										setAttributes(newAttrs);
									} else {
										// Old string-based system (backward compatibility)
										setAttributes({
											fontFamily: value,
											fontId: 0
										});
									}
								}
							}}
						/>
					</PanelBody>
				)}

				{/* Font Weight - replaceable via typost_weight_control filter */}
				{(() => {
					const weightControlType = window.typostHooks
						? window.typostHooks.applyFilters('typost_weight_control', 'default', fontId)
						: 'default';

					// 'hidden': suppress the weight control entirely (no wrapper, no hook)
					if (weightControlType === 'hidden') return null;

					if (weightControlType !== 'default') {
						return (
							<PanelBody title={__('Font Weight', 'typography-stylist')} initialOpen={false}>
								{/* key: remount (and re-fire the action) when the font changes */}
								<div key={`typost-weight-${fontId || 'none'}`} className="typost-hook-point" data-hook="typost_weight_control" ref={(el) => {
									if (el && !el._hooked) {
										el._hooked = true;
										window.typostHooks.doAction('typost_weight_control', el, { fontId, fontWeight });
									}
								}} />
							</PanelBody>
						);
					}

					const sidebarWeightOptions = getFilteredWeightOptions(fontId, false);
					if (sidebarWeightOptions.length <= 1) return null;
					return (
						<PanelBody title={__('Font Weight', 'typography-stylist')} initialOpen={false}>
							<SelectControl
								value={fontWeight}
								options={sidebarWeightOptions}
								onChange={(value) => setAttributes({ fontWeight: value })}
							/>
						</PanelBody>
					);
				})()}

				{/* Extension hook point: after font weight (e.g., Variable Font axes).
				    key: remount (and re-fire the action) when the font changes */}
				<div key={`typost-afw-${fontId || 'none'}`} className="typost-hook-point" data-hook="typost_inspector_after_font_weight" ref={(el) => {
					if (el && !el._hooked) {
						el._hooked = true;
						window.typostHooks.doAction('typost_inspector_after_font_weight', el, { fontId, fontWeight });
					}
				}} />

				<PanelBody title={__('Font Size', 'typography-stylist')} initialOpen={false}>
					<InfoTip text={__('Responsive mode uses CSS clamp() with separate sizes for mobile, tablet, and desktop viewports.', 'typography-stylist')} />
					<SelectControl
						value={fontSize}
						options={[
							{ label: __('Inherit', 'typography-stylist'), value: 'inherit' },
							{ label: __('Responsive (Fluid)', 'typography-stylist'), value: 'responsive' }
						]}
						onChange={(value) => setAttributes({ fontSize: value })}
					/>

					{fontSize === 'responsive' && (
						<>
							<RangeControl
								label={__('Mobile (320px and up)', 'typography-stylist')}
								value={fontSizeMin}
								onChange={(value) => setAttributes({ fontSizeMin: value })}
								min={8}
								max={120}
								step={1}
								help={`${fontSizeMin}px`}
							/>
							<RangeControl
								label={__('Intermediate', 'typography-stylist')}
								value={fontSizePreferred}
								onChange={(value) => setAttributes({ fontSizePreferred: value })}
								min={8}
								max={120}
								step={1}
								help={`${fontSizePreferred}px`}
							/>
							<RangeControl
								label={__('Large (up to 1920px)', 'typography-stylist')}
								value={fontSizeMax}
								onChange={(value) => setAttributes({ fontSizeMax: value })}
								min={8}
								max={120}
								step={1}
								help={`${fontSizeMax}px`}
							/>
							{!isValidFontSizeRange(fontSizeMin, fontSizePreferred, fontSizeMax) && (
								<Notice status="warning" isDismissible={false}>
									{__('Note: Font sizes are out of order. Mobile should be ≤ Intermediate ≤ Large for expected behavior.', 'typography-stylist')}
								</Notice>
							)}
						</>
					)}
				</PanelBody>

				<PanelBody title={__('Line Height', 'typography-stylist')} initialOpen={false}>
					<p style={{ fontSize: '12px', color: '#757575', marginTop: 0, marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #ddd' }}>
						{__('This control applies line height to the entire block. To apply line height to individual text selections, use the Quick Features Toggle from the toolbar.', 'typography-stylist')}
					</p>
					<RangeControl
						value={lineHeight === 0 ? 1.5 : lineHeight}
						onChange={(value) => setAttributes({ lineHeight: value })}
						min={0.5}
						max={3}
						step={0.1}
						help={lineHeight === 0 ? __('Currently using browser default', 'typography-stylist') : lineHeight}
						allowReset
						resetFallbackValue={0}
						marks={[
							{ value: 1.5, label: '1.5' }
						]}
						renderTooltipContent={(value) => lineHeight === 0 ? __('Browser default', 'typography-stylist') : value}
					/>
				</PanelBody>

				<PanelBody title={__('Letter Spacing', 'typography-stylist')} initialOpen={false}>
					<p style={{ fontSize: '12px', color: '#757575', marginTop: 0, marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #ddd' }}>
						{__('This control applies letter spacing to the entire block. To apply letter spacing to individual text selections, use the Quick Features Toggle from the toolbar.', 'typography-stylist')}
					</p>
					<RangeControl
						value={letterSpacing}
						onChange={(value) => setAttributes({ letterSpacing: value })}
						min={-200}
						max={200}
						step={1}
						help={letterSpacing === 0 ? __('Normal', 'typography-stylist') : `${letterSpacing / 1000}em`}
						allowReset
						resetFallbackValue={0}
					/>
				</PanelBody>

				{/* Extension hook point: before features (e.g., Glyphs panel) */}
				<div className="typost-hook-point" data-hook="typost_inspector_before_features" ref={(el) => {
					if (el && !el._hooked) {
						el._hooked = true;
						window.typostHooks.doAction('typost_inspector_before_features', el, { fontId, features });
					}
				}} />

				<PanelBody title={__('OpenType Features', 'typography-stylist')} initialOpen={true}>
					<InfoTip text={__('OpenType features are advanced typographic capabilities built into font files, like ligatures and stylistic alternates. Not all fonts support all features.', 'typography-stylist')} />
					<p style={{ fontSize: '12px', color: '#757575', marginTop: 0, marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #ddd' }}>
						{__('These controls apply features to the entire block. To apply features to individual text selections, use the Quick Features Toggle from the toolbar.', 'typography-stylist')}
					</p>
					{Object.entries(groupedFeatures).map(([category, categoryFeatures]) => (
						<div key={category} className="typost-feature-category">
							<h4>{getCategoryTitle(category)}</h4>
							{categoryFeatures.map(feature => (
								<ToggleControl
									key={feature.id}
									label={feature.name}
									help={feature.description}
									checked={features.includes(feature.id)}
									onChange={() => toggleBlockFeature(feature.id)}
								/>
							))}
						</div>
					))}
				</PanelBody>

				<PanelBody title={__('Accessibility', 'typography-stylist')} initialOpen={false}>
					<SelectControl
						label={__('Screen Reader Class', 'typography-stylist')}
						value={screenReaderClass}
						options={[
							{ label: 'visually-hidden', value: 'visually-hidden' },
							{ label: 'sr-only', value: 'sr-only' },
							{ label: 'screen-reader-text', value: 'screen-reader-text' },
							{ label: __('Custom', 'typography-stylist'), value: 'custom' }
						]}
						onChange={(value) => setAttributes({ screenReaderClass: value })}
					/>
					{screenReaderClass === 'custom' && (
						<TextControl
							label={__('Custom Class Name', 'typography-stylist')}
							value={screenReaderClass}
							onChange={(value) => setAttributes({ screenReaderClass: value })}
							help={__('Enter your theme\'s screen reader class', 'typography-stylist')}
						/>
					)}
					<p className="description">
						{__('The selected class will be used to hide duplicate text for screen readers. Make sure this class is defined in your theme.', 'typography-stylist')}
					</p>
				</PanelBody>

				<div className="typost-hook-point" data-hook="typost_inspector_after_features" ref={(el) => {
					if (el && !el._hooked) {
						el._hooked = true;
						window.typostHooks.doAction('typost_inspector_after_features', el, { fontId, features });
					}
				}} />

				<PanelBody title={__('Reset Features', 'typography-stylist')} initialOpen={false}>
					<p style={{ fontSize: '12px', color: '#757575', marginTop: 0, marginBottom: '16px' }}>
						{__('Clear features and styling applied to this block.', 'typography-stylist')}
					</p>

					{renderResetPanelContent()}
				</PanelBody>
			</InspectorControls>

			<div {...blockProps}>
				<RichText
					tagName={tagName}
					value={content}
					onChange={(value) => setAttributes({ content: value })}
					placeholder={__('Add text with advanced typography...', 'typography-stylist')}
					style={buildStyle()}
					className="typost-block-content"
				/>
			</div>
		</>
	);
}

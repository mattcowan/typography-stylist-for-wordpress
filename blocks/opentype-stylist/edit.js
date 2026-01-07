/**
 * OpenType Stylist Block - Editor Component
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
	Button
} from '@wordpress/components';
import { useState, useRef, useEffect, useMemo } from '@wordpress/element';
import { useSelect } from '@wordpress/data';
import { create, slice as sliceRichText, getTextContent } from '@wordpress/rich-text';
import { parseInlineFeaturesAtCursor, detectBlockComputedFont, applyOrMergeStyling } from './utils';

// Custom "O" icon for OpenType Stylist
const OTSIcon = () => (
	<svg width={20} height={20} viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
		<circle cx={10} cy={10} r={7} fill="none" stroke="currentColor" strokeWidth={2} />
	</svg>
);

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
		screenReaderClass,
		textAlign
	} = attributes;

	const [isPopoverOpen, setIsPopoverOpen] = useState(false);
	const [previewText, setPreviewText] = useState('');
	const [inlineLetterSpacing, setInlineLetterSpacing] = useState(0);
	const [previewLetterSpacing, setPreviewLetterSpacing] = useState(0);
	const [computedFont, setComputedFont] = useState('');
	const [inlineFontSize, setInlineFontSize] = useState('inherit');
	const [inlineFontSizeMin, setInlineFontSizeMin] = useState(16);
	const [inlineFontSizePreferred, setInlineFontSizePreferred] = useState(32);
	const [inlineFontSizeMax, setInlineFontSizeMax] = useState(64);
	const [inlineFontWeight, setInlineFontWeight] = useState('400');
	const [showInlineResetConfirm, setShowInlineResetConfirm] = useState(false);
	const [showFullResetConfirm, setShowFullResetConfirm] = useState(false);

	/**
	 * Ensure font size values maintain valid range: min <= preferred <= max
	 * @param {number} min - Minimum font size
	 * @param {number} preferred - Preferred font size
	 * @param {number} max - Maximum font size
	 * @return {Object} Validated and adjusted values
	 */
	const ensureValidFontSizeRange = (min, preferred, max) => {
		// Ensure min doesn't exceed preferred or max
		const validMin = Math.min(min, preferred, max);
		// Ensure max isn't less than preferred or min
		const validMax = Math.max(min, preferred, max);
		// Ensure preferred is between min and max
		const validPreferred = Math.max(validMin, Math.min(preferred, validMax));

		return {
			min: validMin,
			preferred: validPreferred,
			max: validMax
		};
	};

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

	// Sanitize font family value to prevent injection
	const sanitizeFontFamily = (font) => {
		if (!font) return '';
		// Remove quotes and semicolons that could break style string
		return font.replace(/["';]/g, '');
	};

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

	// Get inline features at current cursor/selection position (for OTS block sidebar)
	// Memoized to run once per render instead of once per feature (15-20x performance improvement)
	// Uses selectionStart/End offset only (not full object) to avoid re-computation on every selection change
	// Note: Inline editor toolbar (block-editor.js) uses component state for similar optimization
	const inlineFeaturesAtSelection = useMemo(() => {
		if (!content) return [];
		if (!selectionStart || !selectionEnd || selectionStart.clientId !== clientId) {
			return [];
		}

		const start = selectionStart.offset || 0;
		const end = selectionEnd.offset || 0;

		return parseInlineFeaturesAtCursor(content, start, end);
	}, [content, selectionStart?.offset, selectionEnd?.offset, selectionStart?.clientId, clientId]);

	// Helper to create a Range for the given linear text offsets within a container
	const getRangeForOffsets = (rootNode, startOffset, endOffset, docContext) => {
		let currentOffset = 0;
		const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT);
		let textNode;
		let rangeStartNode = null;
		let rangeStartOffset = 0;
		let rangeEndNode = null;
		let rangeEndOffset = 0;

		while ((textNode = walker.nextNode())) {
			const nodeLength = textNode.nodeValue.length;

			if (currentOffset + nodeLength > startOffset && !rangeStartNode) {
				rangeStartNode = textNode;
				rangeStartOffset = startOffset - currentOffset;
			}

			if (currentOffset + nodeLength >= endOffset && !rangeEndNode) {
				rangeEndNode = textNode;
				rangeEndOffset = endOffset - currentOffset;
				break;
			}

			currentOffset += nodeLength;
		}

		if (!rangeStartNode || !rangeEndNode) {
			return null;
		}

		const range = docContext.createRange();
		range.setStart(rangeStartNode, rangeStartOffset);
		range.setEnd(rangeEndNode, rangeEndOffset);

		return range;
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
				} else {
					// No selection - use entire text
					extractedText = getTextContent(richTextValue);
				}
			} else {
				// No valid selection in this block - use entire text
				extractedText = getTextContent(richTextValue);
			}
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
		setInlineLetterSpacing(0);
		setPreviewLetterSpacing(0);
		setIsPopoverOpen(false);
	};

	// Handle letter spacing change with live preview
	const handleLetterSpacingChange = (value) => {
		setInlineLetterSpacing(value);
		setPreviewLetterSpacing(value);

		// Apply preview by temporarily wrapping the selected text
		if (selectionStart && selectionEnd &&
		    selectionStart.clientId === clientId &&
		    selectionEnd.clientId === clientId) {

			const start = selectionStart.offset || 0;
			const end = selectionEnd.offset || 0;

			if (start !== end && content) {
				// Store original content if not already stored
				if (!originalContentRef.current) {
					originalContentRef.current = content;
				}

				// Parse the current content as HTML and wrap the selection for preview
				const parser = new DOMParser();
				const doc = parser.parseFromString(`<div>${originalContentRef.current}</div>`, 'text/html');
				const container = doc.body.firstChild;

				const range = getRangeForOffsets(container, start, end, doc);

				if (range) {

					// Create the preview span wrapper
					const span = doc.createElement('span');
					span.className = 'ots-preview-temp';
					span.style.letterSpacing = `${value / 1000}em`;

					// Wrap the range content
					try {
						range.surroundContents(span);

						// Get the updated HTML and set it temporarily
						const previewContent = container.innerHTML;
						setAttributes({ content: previewContent });
					} catch (e) {
						// Range cannot be wrapped (e.g., intersects element boundaries)
						// Silently fail for preview - user can still apply manually
					}
				}
			}
		}
	};

	// Clear letter spacing (reset to 0)
	const clearLetterSpacing = () => {
		setInlineLetterSpacing(0);
		setPreviewLetterSpacing(0);
		// Restore original content
		if (originalContentRef.current) {
			setAttributes({ content: originalContentRef.current });
			originalContentRef.current = null;
		}
	};

	// Apply live preview letter spacing by wrapping selected text temporarily
	useEffect(() => {
		if (!isPopoverOpen) return;

		// Only apply preview if we have a selection
		if (selectionStart && selectionEnd &&
		    selectionStart.clientId === clientId &&
		    selectionEnd.clientId === clientId) {

			const start = selectionStart.offset || 0;
			const end = selectionEnd.offset || 0;

			if (start !== end && content) {
				// Find the block wrapper first
				const blockWrapper = document.querySelector(`[data-block="${clientId}"]`);

				// Find the RichText element within the block
				let blockElement = blockWrapper?.querySelector('.ots-block-content');

				if (!blockElement) {
					// Try finding by the actual tag name (h1, h2, p, etc.)
					blockElement = blockWrapper?.querySelector(tagName);
				}

				if (!blockElement) {
					// Last resort: try the rich-text role
					blockElement = blockWrapper?.querySelector('[role="textbox"]');
				}

				if (blockElement && previewLetterSpacing !== 0) {
					// Apply letter-spacing style directly to the RichText element
					const spacingValue = `${previewLetterSpacing / 1000}em`;
					blockElement.style.letterSpacing = spacingValue;
				} else if (blockElement) {
					// Remove preview styling
					blockElement.style.letterSpacing = '';
				}
			}
		}

		// Cleanup when popover closes
		return () => {
			// Use the same robust lookup as above to find the content element
			const blockWrapper = document.querySelector(`[data-block="${clientId}"]`);
			if (blockWrapper) {
				let blockElement = blockWrapper.querySelector('.ots-block-content');

				if (!blockElement && tagName) {
					blockElement = blockWrapper.querySelector(tagName);
				}

				if (!blockElement) {
					blockElement = blockWrapper.querySelector('[role="textbox"]');
				}

				if (blockElement) {
					blockElement.style.letterSpacing = '';
				}

				// Remove any temporary preview wrapper spans
				const tempSpans = blockWrapper.querySelectorAll('.ots-preview-temp');
				tempSpans.forEach((span) => {
					const parent = span.parentNode;
					if (!parent) {
						return;
					}
					while (span.firstChild) {
						parent.insertBefore(span.firstChild, span);
					}
					parent.removeChild(span);
				});
			}
		};
	}, [previewLetterSpacing, clientId, selectionStart, selectionEnd, isPopoverOpen, content]);

	const blockProps = useBlockProps({
		className: 'wp-block-opentype-stylist'
	});

	// Get available features from localized data
	const availableFeatures = window.otsData?.features || [];
	const groupedFeatures = {};
	availableFeatures.forEach(feature => {
		const category = feature.category || 'other';
		if (!groupedFeatures[category]) {
			groupedFeatures[category] = [];
		}
		groupedFeatures[category].push(feature);
	});

	// Get font options
	const fontOptions = [];
	const fontIdMap = {}; // Map font ID to font object
	const fonts = window.otsData?.fonts || [];
	const adobeFonts = window.otsData?.adobeFonts || [];
	const manualFonts = window.otsData?.manualFonts || [];

	// Add uploaded fonts
	fonts.forEach(font => {
		if (font.font_faces && font.font_faces.length > 0 && font.font_id) {
			const families = [...new Set(font.font_faces.map(face => face.family))];
			families.forEach(family => {
				fontOptions.push({
					label: `📁 ${family}`,
					value: String(font.font_id),
					fontFamily: family,
					fontId: font.font_id
				});
				fontIdMap[font.font_id] = { family, fallbacks: font.fallbacks };
			});
		}
	});

	// Add Adobe fonts
	adobeFonts.forEach(font => {
		// Handle new structure: font_family (singular string - one entry per family)
		if (font.font_family && font.font_id) {
			fontOptions.push({
				label: `🅰️ ${font.font_family}`,
				value: String(font.font_id),
				fontFamily: font.font_family,
				fontId: font.font_id
			});
			fontIdMap[font.font_id] = { family: font.font_family, fallbacks: font.fallbacks };
		}
		// Handle legacy structure: font_families (plural array - multiple families per entry)
		else if (font.font_families && font.font_families.length > 0 && font.font_id) {
			font.font_families.forEach(family => {
				fontOptions.push({
					label: `🅰️ ${family}`,
					value: String(font.font_id),
					fontFamily: family,
					fontId: font.font_id
				});
				fontIdMap[font.font_id] = { family, fallbacks: font.fallbacks };
			});
		}
	});

	// Add manual fonts
	manualFonts.forEach(font => {
		if (font.font_family && font.font_id) {
			fontOptions.push({
				label: `⚙️ ${font.name}`,
				value: String(font.font_id),
				fontFamily: font.font_family,
				fontId: font.font_id
			});
			fontIdMap[font.font_id] = { family: font.font_family, fallbacks: font.fallbacks };
		}
	});

	const toggleFeature = (featureId) => {
		// Check if we have a valid selection - if so, apply inline instead
		if (selectionStart && selectionEnd &&
		    selectionStart.clientId === clientId &&
		    selectionEnd.clientId === clientId) {

			const start = selectionStart.offset || 0;
			const end = selectionEnd.offset || 0;

			// If there's a selection, apply inline instead of toggling block-level
			if (start !== end) {
				applyFeatureToSelection(featureId);
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

			if (start !== end) {
				// Build the styled span with ONLY letter spacing
				const styleArray = [];

				if (fontFamily) {
					const sanitizedFont = sanitizeFontFamily(fontFamily);
					styleArray.push(`font-family: ${sanitizedFont}`);
				}

				styleArray.push(`letter-spacing: ${inlineLetterSpacing / 1000}em`);

				const styleString = styleArray.join('; ');

				// Parse the current content as HTML and wrap the selection
				const parser = new DOMParser();
				const doc = parser.parseFromString(`<div>${content}</div>`, 'text/html');
				const container = doc.body.firstChild;

				const range = getRangeForOffsets(container, start, end, doc);

				if (range) {
					// Use the new helper to apply or merge styling (avoids nested ots-styled spans)
					const attributes = {
						'data-features': ''
					};

					const success = applyOrMergeStyling(range, attributes, styleString, doc);

					if (success) {
						// Get the updated HTML
						const newContent = container.innerHTML;
						setAttributes({ content: newContent });
					}
				}

				// Clear the original content ref since we're committing the change
				originalContentRef.current = null;

				// Close the popover after applying
				setIsPopoverOpen(false);
			}
		}
	};

	// Clear all inline formatting from selected text (removes ots-styled spans)
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
					// Find all ots-styled spans within the range
					const commonAncestor = range.commonAncestorContainer;
					let searchRoot = commonAncestor.nodeType === Node.TEXT_NODE
						? commonAncestor.parentElement
						: commonAncestor;

					// Check if the selection itself is inside an ots-styled span
					const parentSpan = searchRoot.closest('span.ots-styled');
					if (parentSpan) {
						searchRoot = parentSpan;
					}

					const styledSpans = searchRoot.querySelectorAll('span.ots-styled');

					// Also check if searchRoot itself is an ots-styled span
					const spansToUnwrap = [];
					if (searchRoot.classList && searchRoot.classList.contains('ots-styled')) {
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

					// Close the popover
					setIsPopoverOpen(false);
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

			if (start !== end) {
				const parser = new DOMParser();
				const doc = parser.parseFromString(`<div>${content}</div>`, 'text/html');
				const container = doc.body.firstChild;
				const range = getRangeForOffsets(container, start, end, doc);

				if (range) {
					const attributes = {
						'data-fontsize': inlineFontSize
					};

					let styleString = '';
					if (inlineFontSize === 'responsive') {
						attributes['data-fontsize-min'] = inlineFontSizeMin.toString();
						attributes['data-fontsize-preferred'] = inlineFontSizePreferred.toString();
						attributes['data-fontsize-max'] = inlineFontSizeMax.toString();
						styleString = `font-size: clamp(${inlineFontSizeMin}px, ${inlineFontSizePreferred / 16}rem + ${((inlineFontSizeMax - inlineFontSizeMin) / (1920 - 320)) * 100}vw, ${inlineFontSizeMax}px)`;
					}

					const success = applyOrMergeStyling(range, attributes, styleString, doc);
					if (success) {
						setAttributes({ content: container.innerHTML });
					}
				}

				setIsPopoverOpen(false);
			}
		}
	};

	// Apply font weight to selected text only (inline)
	const applyInlineFontWeight = () => {
		if (!content) return;

		if (selectionStart && selectionEnd &&
		    selectionStart.clientId === clientId &&
		    selectionEnd.clientId === clientId) {

			const start = selectionStart.offset || 0;
			const end = selectionEnd.offset || 0;

			if (start !== end) {
				const parser = new DOMParser();
				const doc = parser.parseFromString(`<div>${content}</div>`, 'text/html');
				const container = doc.body.firstChild;
				const range = getRangeForOffsets(container, start, end, doc);

				if (range) {
					const attributes = {
						'data-fontweight': inlineFontWeight
					};
					const styleString = `font-weight: ${inlineFontWeight}`;

					const success = applyOrMergeStyling(range, attributes, styleString, doc);
					if (success) {
						setAttributes({ content: container.innerHTML });
					}
				}

				setIsPopoverOpen(false);
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

				if (fontFamily) {
					const sanitizedFont = sanitizeFontFamily(fontFamily);
					styleArray.push(`font-family: ${sanitizedFont}`);
				}

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

				const range = getRangeForOffsets(container, start, end, doc);

				if (range) {
					// Use the new helper to apply or merge styling (avoids nested ots-styled spans)
					const attributes = {
						'data-features': featureId
					};

					const success = applyOrMergeStyling(range, attributes, styleString, doc);

					if (success) {
						// Get the updated HTML
						const newContent = container.innerHTML;
						setAttributes({ content: newContent });
					}
				}

				// Close the popover after applying
				setIsPopoverOpen(false);
			}
		}
	};

	// Clear all inline ots-styled spans from content (doesn't affect block-level settings)
	const clearAllInlineFeatures = () => {
		if (!content) return;

		// Parse the content and remove all ots-styled spans
		const parser = new DOMParser();
		const doc = parser.parseFromString(`<div>${content}</div>`, 'text/html');
		const container = doc.body.firstChild;

		// Find all ots-styled spans
		const styledSpans = container.querySelectorAll('span.ots-styled');

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
			const styledSpans = container.querySelectorAll('span.ots-styled');
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

		if (features.length > 0) {
			styles.fontFeatureSettings = features.map(f => `"${f}" 1`).join(', ');
		}

		if (fontFamily) {
			styles.fontFamily = fontFamily;
		}

		if (fontWeight) {
			styles.fontWeight = fontWeight;
		}

		if (letterSpacing !== 0) {
			styles.letterSpacing = `${letterSpacing / 1000}em`;
		}

		if (fontSize === 'responsive') {
			styles.fontSize = `clamp(${fontSizeMin}px, ${fontSizePreferred / 16}rem + ${((fontSizeMax - fontSizeMin) / (1920 - 320)) * 100}vw, ${fontSizeMax}px)`;
		}

		if (textAlign) {
			styles.textAlign = textAlign;
		}

		return styles;
	};

	// Category titles
	const getCategoryTitle = (category) => {
		const titles = {
			'ligatures': __('Ligatures', 'opentype-stylist'),
			'stylistic-sets': __('Stylistic Sets', 'opentype-stylist'),
			'alternates': __('Swashes & Alternates', 'opentype-stylist'),
			'decorative': __('Decorative', 'opentype-stylist'),
			'other': __('Other Features', 'opentype-stylist')
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
						⚠️ {__('Are you sure?', 'opentype-stylist')}
					</p>
					<p style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#856404' }}>
						{__('This will remove all inline features (ots-styled spans) from this block. Block-level settings will remain.', 'opentype-stylist')}
					</p>
					<div style={{ display: 'flex', gap: '8px' }}>
						<Button
							variant="primary"
							isDestructive
							onClick={clearAllInlineFeatures}
							style={{ flex: 1 }}
						>
							{__('Yes, Clear', 'opentype-stylist')}
						</Button>
						<Button
							variant="secondary"
							onClick={() => setShowInlineResetConfirm(false)}
							style={{ flex: 1 }}
						>
							{__('Cancel', 'opentype-stylist')}
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
						🚨 {__('Reset Entire Block?', 'opentype-stylist')}
					</p>
					<p style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#a00' }}>
						{__('This will completely reset this block, removing both inline features AND all block-level settings (font, features, spacing, etc.). This cannot be undone.', 'opentype-stylist')}
					</p>
					<div style={{ display: 'flex', gap: '8px' }}>
						<Button
							variant="primary"
							isDestructive
							onClick={resetEntireBlock}
							style={{ flex: 1 }}
						>
							{__('Yes, Reset All', 'opentype-stylist')}
						</Button>
						<Button
							variant="secondary"
							onClick={() => setShowFullResetConfirm(false)}
							style={{ flex: 1 }}
						>
							{__('Cancel', 'opentype-stylist')}
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
					{__('Clear Individual Features', 'opentype-stylist')}
				</Button>
				<p style={{ fontSize: '11px', color: '#666', margin: '0 0 16px 0' }}>
					{__('Removes all inline features (ots-styled spans) but keeps block-level settings.', 'opentype-stylist')}
				</p>

				<Button
					variant="secondary"
					isDestructive
					onClick={() => setShowFullResetConfirm(true)}
					style={{ width: '100%', justifyContent: 'center' }}
				>
					{__('Reset Entire Block', 'opentype-stylist')}
				</Button>
				<p style={{ fontSize: '11px', color: '#666', margin: '8px 0 0 0' }}>
					{__('Clears both individual features AND block-level settings (font, features, spacing, etc.).', 'opentype-stylist')}
				</p>
			</>
		);
	};

	return (
		<>
			<BlockControls>
				<ToolbarGroup>
					<ToolbarButton
						icon={OTSIcon}
						label={__('OpenType Features', 'opentype-stylist')}
						onClick={handleToolbarClick}
						isActive={features.length > 0}
					/>
					{isPopoverOpen && (
						<Popover
							position="middle right"
							onClose={handlePopoverClose}
							className="ots-block-popover"
							noArrow={false}
						>
							<div style={{ padding: '16px', minWidth: '400px', maxWidth: '500px', maxHeight: '500px', overflowY: 'auto' }}>
								<h4 style={{ marginTop: 0 }}>{__('Quick Feature Toggles', 'opentype-stylist')}</h4>

								{/* Letter Spacing Control */}
								<div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '2px solid #ddd' }}>
									<RangeControl
										label={__('Letter Spacing (for selected text)', 'opentype-stylist')}
										value={inlineLetterSpacing}
										onChange={handleLetterSpacingChange}
										min={-200}
										max={200}
										step={1}
										help={inlineLetterSpacing === 0 ? __('Normal', 'opentype-stylist') : `${inlineLetterSpacing / 1000}em`}
										allowReset
										resetFallbackValue={0}
									/>
									{inlineLetterSpacing !== 0 && (
										<div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
											<Button
												variant="primary"
												onClick={applyLetterSpacingOnly}
												style={{ flex: 1 }}
											>
												{__('Apply Letter Spacing', 'opentype-stylist')}
											</Button>
											<Button
												variant="secondary"
												onClick={clearLetterSpacing}
												isDestructive
											>
												{__('Clear', 'opentype-stylist')}
											</Button>
										</div>
									)}
									{inlineLetterSpacing !== 0 && (
										<p style={{ fontSize: '11px', color: '#666', marginTop: '8px', marginBottom: 0 }}>
											💡 {__('Adjust slider to preview, then click Apply. Or click a feature button below to apply both.', 'opentype-stylist')}
										</p>
									)}
								</div>

								{/* Font Size Control */}
								<div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '2px solid #ddd' }}>
									<SelectControl
										label={__('Font Size (for selected text)', 'opentype-stylist')}
										value={inlineFontSize}
										onChange={(value) => setInlineFontSize(value)}
										options={[
											{ label: __('Inherit from block', 'opentype-stylist'), value: 'inherit' },
											{ label: __('Responsive (fluid)', 'opentype-stylist'), value: 'responsive' }
										]}
									/>
									{inlineFontSize === 'responsive' && (
										<>
											<RangeControl
												label={__('Min Size (px)', 'opentype-stylist')}
												value={inlineFontSizeMin}
												onChange={(value) => {
													const validated = ensureValidFontSizeRange(value, inlineFontSizePreferred, inlineFontSizeMax);
													setInlineFontSizeMin(validated.min);
													setInlineFontSizePreferred(validated.preferred);
													setInlineFontSizeMax(validated.max);
												}}
												min={8}
												max={200}
												step={1}
											/>
											<RangeControl
												label={__('Preferred Size (px)', 'opentype-stylist')}
												value={inlineFontSizePreferred}
												onChange={(value) => {
													const validated = ensureValidFontSizeRange(inlineFontSizeMin, value, inlineFontSizeMax);
													setInlineFontSizeMin(validated.min);
													setInlineFontSizePreferred(validated.preferred);
													setInlineFontSizeMax(validated.max);
												}}
												min={inlineFontSizeMin}
												max={inlineFontSizeMax}
												step={1}
											/>
											<RangeControl
												label={__('Max Size (px)', 'opentype-stylist')}
												value={inlineFontSizeMax}
												onChange={(value) => {
													const validated = ensureValidFontSizeRange(inlineFontSizeMin, inlineFontSizePreferred, value);
													setInlineFontSizeMin(validated.min);
													setInlineFontSizePreferred(validated.preferred);
													setInlineFontSizeMax(validated.max);
												}}
												min={8}
												max={400}
												step={1}
											/>
											<Button
												variant="primary"
												onClick={applyInlineFontSize}
												style={{ marginTop: '8px', width: '100%' }}
											>
												{__('Apply Font Size', 'opentype-stylist')}
											</Button>
										</>
									)}
								</div>

								{/* Font Weight Control */}
								<div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '2px solid #ddd' }}>
									<SelectControl
										label={__('Font Weight (for selected text)', 'opentype-stylist')}
										value={inlineFontWeight}
										onChange={(value) => setInlineFontWeight(value)}
										options={[
											{ label: '100 - Thin', value: '100' },
											{ label: '200 - Extra Light', value: '200' },
											{ label: '300 - Light', value: '300' },
											{ label: '400 - Normal', value: '400' },
											{ label: '500 - Medium', value: '500' },
											{ label: '600 - Semi Bold', value: '600' },
											{ label: '700 - Bold', value: '700' },
											{ label: '800 - Extra Bold', value: '800' },
											{ label: '900 - Black', value: '900' }
										]}
									/>
									<Button
										variant="primary"
										onClick={applyInlineFontWeight}
										style={{ marginTop: '8px', width: '100%' }}
									>
										{__('Apply Font Weight', 'opentype-stylist')}
									</Button>
								</div>

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
											className={`ots-feature-category-panel ${hasActiveFeatures ? 'has-active-features' : ''}`}
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
													<div className="ots-feature-preview" style={{ marginLeft: '24px' }}>
														<Button
															className="ots-feature-preview-on ots-feature-apply-btn"
															onClick={() => applyFeatureToSelection(feature.id)}
															style={{
																fontFeatureSettings: `"${feature.id}" 1`,
																fontFamily: fontFamily || computedFont || 'inherit'
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

								{/* Active Features Summary */}
								{inlineFeaturesAtSelection.length > 0 && (
									<div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#f0f6fc', borderRadius: '4px', border: '1px solid #0783be' }}>
										<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
											<h5 style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#0783be' }}>
												{__('Active Features:', 'opentype-stylist')}
											</h5>
											<Button
												variant="secondary"
												isDestructive
												isSmall
												onClick={clearInlineFormatting}
												style={{ fontSize: '11px', padding: '2px 8px', height: 'auto' }}
											>
												{__('Clear All', 'opentype-stylist')}
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

								<p style={{ fontSize: '12px', color: '#757575', marginBottom: 0, marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #ddd' }}>
									💡 {__('For inline text selection and more options, use the sidebar settings or select text and use the RichText toolbar.', 'opentype-stylist')}
								</p>
							</div>
						</Popover>
					)}
				</ToolbarGroup>
				<ToolbarGroup>
					<ToolbarDropdownMenu
						icon="heading"
						label={__('Change heading level', 'opentype-stylist')}
						controls={[
							{
								title: __('Heading 1', 'opentype-stylist'),
								isActive: tagName === 'h1',
								onClick: () => setAttributes({ tagName: 'h1' })
							},
							{
								title: __('Heading 2', 'opentype-stylist'),
								isActive: tagName === 'h2',
								onClick: () => setAttributes({ tagName: 'h2' })
							},
							{
								title: __('Heading 3', 'opentype-stylist'),
								isActive: tagName === 'h3',
								onClick: () => setAttributes({ tagName: 'h3' })
							},
							{
								title: __('Heading 4', 'opentype-stylist'),
								isActive: tagName === 'h4',
								onClick: () => setAttributes({ tagName: 'h4' })
							},
							{
								title: __('Heading 5', 'opentype-stylist'),
								isActive: tagName === 'h5',
								onClick: () => setAttributes({ tagName: 'h5' })
							},
							{
								title: __('Heading 6', 'opentype-stylist'),
								isActive: tagName === 'h6',
								onClick: () => setAttributes({ tagName: 'h6' })
							},
							{
								title: __('Paragraph', 'opentype-stylist'),
								isActive: tagName === 'p',
								onClick: () => setAttributes({ tagName: 'p' })
							},
							{
								title: __('Div', 'opentype-stylist'),
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
				{fontOptions.length > 0 && (
					<PanelBody title={__('Font Family', 'opentype-stylist')} initialOpen={false}>
						<SelectControl
							value={fontId ? String(fontId) : (fontFamily || '')}
							options={[
								{ label: __('(Default)', 'opentype-stylist'), value: '' },
								...fontOptions
							]}
							onChange={(value) => {
								if (value === '') {
									setAttributes({ fontFamily: '', fontId: 0 });
								} else {
									// Try to parse as ID (new system)
									const selectedFontId = parseInt(value, 10);
									if (!isNaN(selectedFontId) && fontIdMap[selectedFontId]) {
										// New ID-based system
										const fontData = fontIdMap[selectedFontId];
										setAttributes({
											fontFamily: fontData.family,
											fontId: selectedFontId
										});
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

				<PanelBody title={__('Font Weight', 'opentype-stylist')} initialOpen={false}>
					<SelectControl
						value={fontWeight}
						options={[
							{ label: __('100 - Thin', 'opentype-stylist'), value: '100' },
							{ label: __('200 - Extra Light', 'opentype-stylist'), value: '200' },
							{ label: __('300 - Light', 'opentype-stylist'), value: '300' },
							{ label: __('400 - Normal', 'opentype-stylist'), value: '400' },
							{ label: __('500 - Medium', 'opentype-stylist'), value: '500' },
							{ label: __('600 - Semi Bold', 'opentype-stylist'), value: '600' },
							{ label: __('700 - Bold', 'opentype-stylist'), value: '700' },
							{ label: __('800 - Extra Bold', 'opentype-stylist'), value: '800' },
							{ label: __('900 - Black', 'opentype-stylist'), value: '900' }
						]}
						onChange={(value) => setAttributes({ fontWeight: value })}
					/>
				</PanelBody>

				<PanelBody title={__('Letter Spacing', 'opentype-stylist')} initialOpen={false}>
					<p style={{ fontSize: '12px', color: '#757575', marginTop: 0, marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #ddd' }}>
						{__('This control applies letter spacing to the entire block. To apply letter spacing to individual text selections, use the Quick Features Toggle from the toolbar.', 'opentype-stylist')}
					</p>
					<RangeControl
						value={letterSpacing}
						onChange={(value) => setAttributes({ letterSpacing: value })}
						min={-200}
						max={200}
						step={1}
						help={letterSpacing === 0 ? __('Normal', 'opentype-stylist') : `${letterSpacing / 1000}em`}
						allowReset
						resetFallbackValue={0}
					/>
				</PanelBody>

				<PanelBody title={__('Font Size', 'opentype-stylist')} initialOpen={false}>
					<SelectControl
						value={fontSize}
						options={[
							{ label: __('Inherit', 'opentype-stylist'), value: 'inherit' },
							{ label: __('Responsive (Fluid)', 'opentype-stylist'), value: 'responsive' }
						]}
						onChange={(value) => setAttributes({ fontSize: value })}
					/>

					{fontSize === 'responsive' && (
						<>
							<RangeControl
								label={__('Minimum Size (mobile)', 'opentype-stylist')}
								value={fontSizeMin}
								onChange={(value) => setAttributes({ fontSizeMin: value })}
								min={8}
								max={120}
								step={1}
								help={`${fontSizeMin}px`}
							/>
							<RangeControl
								label={__('Preferred Size (tablet)', 'opentype-stylist')}
								value={fontSizePreferred}
								onChange={(value) => setAttributes({ fontSizePreferred: value })}
								min={8}
								max={120}
								step={1}
								help={`${fontSizePreferred}px`}
							/>
							<RangeControl
								label={__('Maximum Size (desktop)', 'opentype-stylist')}
								value={fontSizeMax}
								onChange={(value) => setAttributes({ fontSizeMax: value })}
								min={8}
								max={120}
								step={1}
								help={`${fontSizeMax}px`}
							/>
						</>
					)}
				</PanelBody>

				<PanelBody title={__('OpenType Features', 'opentype-stylist')} initialOpen={true}>
					<p style={{ fontSize: '12px', color: '#757575', marginTop: 0, marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #ddd' }}>
						{__('These controls apply features to the entire block. To apply features to individual text selections, use the Quick Features Toggle from the toolbar.', 'opentype-stylist')}
					</p>
					{Object.entries(groupedFeatures).map(([category, categoryFeatures]) => (
						<div key={category} className="ots-feature-category">
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

				<PanelBody title={__('Accessibility', 'opentype-stylist')} initialOpen={false}>
					<SelectControl
						label={__('Screen Reader Class', 'opentype-stylist')}
						value={screenReaderClass}
						options={[
							{ label: 'visually-hidden', value: 'visually-hidden' },
							{ label: 'sr-only', value: 'sr-only' },
							{ label: 'screen-reader-text', value: 'screen-reader-text' },
							{ label: __('Custom', 'opentype-stylist'), value: 'custom' }
						]}
						onChange={(value) => setAttributes({ screenReaderClass: value })}
					/>
					{screenReaderClass === 'custom' && (
						<TextControl
							label={__('Custom Class Name', 'opentype-stylist')}
							value={screenReaderClass}
							onChange={(value) => setAttributes({ screenReaderClass: value })}
							help={__('Enter your theme\'s screen reader class', 'opentype-stylist')}
						/>
					)}
					<p className="description">
						{__('The selected class will be used to hide duplicate text for screen readers. Make sure this class is defined in your theme.', 'opentype-stylist')}
					</p>
				</PanelBody>

				<PanelBody title={__('Reset Features', 'opentype-stylist')} initialOpen={false}>
					<p style={{ fontSize: '12px', color: '#757575', marginTop: 0, marginBottom: '16px' }}>
						{__('Clear features and styling applied to this block.', 'opentype-stylist')}
					</p>

					{renderResetPanelContent()}
				</PanelBody>
			</InspectorControls>

			<div {...blockProps}>
				<RichText
					tagName={tagName}
					value={content}
					onChange={(value) => setAttributes({ content: value })}
					placeholder={__('Add text with advanced typography...', 'opentype-stylist')}
					style={buildStyle()}
					className="ots-block-content"
				/>
			</div>
		</>
	);
}

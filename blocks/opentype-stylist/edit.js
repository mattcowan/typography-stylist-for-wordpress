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
import { useState, useRef, useEffect } from '@wordpress/element';
import { useSelect } from '@wordpress/data';
import { create, slice as sliceRichText, getTextContent } from '@wordpress/rich-text';

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

	// Get features from inline styled span at cursor/selection position
	const getInlineFeatures = () => {
		if (!content) return [];
		if (!selectionStart || !selectionEnd || selectionStart.clientId !== clientId) {
			return [];
		}

		const start = selectionStart.offset || 0;
		const end = selectionEnd.offset || 0;

		// Parse HTML to find styled spans
		const parser = new DOMParser();
		const doc = parser.parseFromString(`<div>${content}</div>`, 'text/html');
		const container = doc.body.firstChild;
		const styledSpans = container.querySelectorAll('span.ots-styled');

		// Find the smallest (innermost) span that matches the cursor/selection
		let smallestMatchingSpan = null;
		let smallestSpanSize = Infinity;

		for (const span of styledSpans) {
			// Find this span's position in the text
			const walker = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT);
			let spanStart = 0;
			let spanEnd = 0;
			let found = false;
			let offset = 0;

			let node;
			while ((node = walker.nextNode())) {
				const nodeLength = node.nodeValue.length;

				// Check if this text node is inside our span
				if (span.contains(node)) {
					if (!found) {
						spanStart = offset;
						found = true;
					}
					spanEnd = offset + nodeLength;
				}

				offset += nodeLength;
			}

			// Check if the cursor/selection overlaps with this span
			const isCursor = start === end;
			const isInside = isCursor && found && start >= spanStart && start <= spanEnd;
			const overlaps = !isCursor && found && start < spanEnd && end > spanStart;

			if (found && (isInside || overlaps)) {
				const spanSize = spanEnd - spanStart;

				// Keep track of the smallest matching span
				if (spanSize < smallestSpanSize) {
					smallestMatchingSpan = span;
					smallestSpanSize = spanSize;
				}
			}
		}

		if (smallestMatchingSpan) {
			// Extract features from data attribute
			const dataFeatures = smallestMatchingSpan.getAttribute('data-features');
			if (dataFeatures) {
				return dataFeatures.split(',');
			}

			// Fallback: parse from style attribute
			const style = smallestMatchingSpan.getAttribute('style') || '';
			const featureMatch = style.match(/font-feature-settings:\s*([^;]+)/);

			if (featureMatch) {
				// Parse feature codes from CSS
				const featuresParsed = featureMatch[1]
					.split(',')
					.map(f => {
						const match = f.trim().match(/["']([^"']+)["']|&quot;([^&]+)&quot;/);
						return match;
					})
					.filter(m => m)
					.map(m => m[1] || m[2]);

				return featuresParsed;
			}
		}

		return [];
	};

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
					span.style.backgroundColor = 'rgba(34, 113, 177, 0.1)'; // Light blue highlight

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
	const fonts = window.otsData?.fonts || [];
	const adobeFonts = window.otsData?.adobeFonts || [];
	const manualFonts = window.otsData?.manualFonts || [];

	// Add uploaded fonts
	fonts.forEach(font => {
		if (font.font_faces && font.font_faces.length > 0) {
			const families = [...new Set(font.font_faces.map(face => face.family))];
			families.forEach(family => {
				const fontValue = font.fallbacks ? `${family}, ${font.fallbacks}` : family;
				fontOptions.push({
					label: `📁 ${family}`,
					value: fontValue
				});
			});
		}
	});

	// Add Adobe fonts
	adobeFonts.forEach(font => {
		if (font.font_families && font.font_families.length > 0) {
			font.font_families.forEach(family => {
				const fontValue = font.fallbacks ? `${family}, ${font.fallbacks}` : family;
				fontOptions.push({
					label: `🅰️ ${family}`,
					value: fontValue
				});
			});
		}
	});

	// Add manual fonts
	manualFonts.forEach(font => {
		if (font.font_family) {
			const fontValue = font.fallbacks ? `${font.font_family}, ${font.fallbacks}` : font.font_family;
			fontOptions.push({
				label: `⚙️ ${font.name}`,
				value: fontValue
			});
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

					// Create the span wrapper
					const span = doc.createElement('span');
					span.className = 'ots-styled';
					span.setAttribute('style', styleString);

					// Wrap the range content
					try {
						range.surroundContents(span);

						// Get the updated HTML
						const newContent = container.innerHTML;
						setAttributes({ content: newContent });
					} catch (error) {
						// Avoid breaking the editor if the range cannot be wrapped
						// (e.g., when it intersects element boundaries)
						// eslint-disable-next-line no-console
						console.error('OTS Block - Failed to apply letter spacing to selection:', error);
					}
				}

				// Clear the original content ref since we're committing the change
				originalContentRef.current = null;

				// Close the popover after applying
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
				styleArray.push(`font-feature-settings: '${featureId}' 1`);

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

					// Create the span wrapper
					const span = doc.createElement('span');
					span.className = 'ots-styled';
					span.setAttribute('style', styleString);

					// Wrap the range content
					try {
						range.surroundContents(span);

						// Get the updated HTML
						const newContent = container.innerHTML;
						setAttributes({ content: newContent });
					} catch (error) {
						// Avoid breaking the editor if the range cannot be wrapped
						// (e.g., when it intersects element boundaries)
						// eslint-disable-next-line no-console
						console.error('OTS Block - Failed to apply feature to selection:', error);
					}
				}

				// Close the popover after applying
				setIsPopoverOpen(false);
			}
		}
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

								{Object.entries(groupedFeatures).map(([category, categoryFeatures]) => (
									<PanelBody
										key={category}
										title={getCategoryTitle(category)}
										initialOpen={category === 'ligatures'}
										className="ots-feature-category-panel"
									>
										{categoryFeatures.map(feature => {
											const sampleText = previewText || 'ffi ffl Th AE';
											// Check both block-level features and inline features at cursor
											const inlineFeatures = getInlineFeatures();
											const isActive = features.includes(feature.id) || inlineFeatures.includes(feature.id);
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
																fontFamily: fontFamily || 'inherit'
															}}
														>
															{sampleText}
														</Button>
													</div>
												</div>
											);
										})}
									</PanelBody>
								))}
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
							value={fontFamily}
							options={[
								{ label: __('(Default)', 'opentype-stylist'), value: '' },
								...fontOptions
							]}
							onChange={(value) => setAttributes({ fontFamily: value })}
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
					{Object.entries(groupedFeatures).map(([category, categoryFeatures]) => (
						<div key={category} className="ots-feature-category">
							<h4>{getCategoryTitle(category)}</h4>
							{categoryFeatures.map(feature => (
								<ToggleControl
									key={feature.id}
									label={feature.name}
									help={feature.description}
									checked={features.includes(feature.id)}
									onChange={() => toggleFeature(feature.id)}
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

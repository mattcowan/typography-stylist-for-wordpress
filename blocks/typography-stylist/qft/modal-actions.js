/**
 * Typography Stylist Block - opening and closing the Quick Feature Toggles.
 *
 * Moved out of edit.js unchanged (#356). The functions were closures inside
 * Edit and are still rebuilt on every render: Edit calls this factory once
 * per render with the current values, so every function sees the same
 * values it saw before.
 */

import { create, getTextContent, slice as sliceRichText } from '@wordpress/rich-text';
import { resolveBlockSelectionRange, parseInlineStylesAtCursor, findCoveringParagraphStyleId, buildQftEditorState } from '../utils';

/**
 * Open and close the QFT modal (snapshotting the selection first), and
 * launch extension toolbar buttons.
 *
 * @param {Object} ctx Edit's current values, state setters, refs and the
 *                     functions earlier factories returned (see edit.js).
 * @return {Object} snapshotSelection, handleToolbarClick, handlePopoverClose, handleExtensionToolbarClick
 */
export default function createModalActions(ctx) {
	const {
		populateControlsFromDetectedStyles, clientId, content, isPopoverOpen, letterSpacing,
		originalContentRef, originalLetterSpacingRef, qftStateRef, selectionEnd, selectionStart,
		setAttributes, setCapturedSelection, setInlineApplyNotice, setInlineFitScale, setInlineFitShift,
		setInlineFontFamily, setInlineFontSize, setInlineFontSizeMax, setInlineFontSizeMin,
		setInlineFontSizePreferred, setInlineFontWeight, setInlineLetterSpacing, setInlineLineHeight,
		setIsPopoverOpen, setPreviewFontSize, setPreviewFontSizeMax, setPreviewFontSizeMin,
		setPreviewFontSizePreferred, setPreviewLetterSpacing, setPreviewLineHeight, setPreviewText
	} = ctx;

	/**
	 * Snapshot the current selection before a modal steals focus.
	 *
	 * Returns the capturedSelection payload (null when there is no expanded
	 * selection in this block) plus the text to preview: the selected text when
	 * there is a selection, otherwise the whole block. Shared by the Quick
	 * Feature Toggle button and the extension toolbar buttons so both hand
	 * downstream UI the same selection information.
	 */
	const snapshotSelection = () => {
		if (!content) {
			return { capturedSelection: null, text: '' };
		}
		const richTextValue = create({ html: content });
		const range = resolveBlockSelectionRange(selectionStart, selectionEnd, clientId);
		if (!range) {
			return { capturedSelection: null, text: getTextContent(richTextValue) };
		}
		const text = getTextContent(sliceRichText(richTextValue, range.start, range.end));
		return {
			capturedSelection: { start: range.start, end: range.end, text: text, length: text.length },
			text: text
		};
	};

	// Handle toolbar button click
	const handleToolbarClick = () => {
		// Capture selection offsets and text before the Modal opens (the Modal
		// takes focus, which collapses the live selection)
		const snapshot = snapshotSelection();
		const extractedText = snapshot.text;
		setCapturedSelection(snapshot.capturedSelection);

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
		// Reset fit-relative scale/shift state
		setInlineFitScale(100);
		setInlineFitShift(0);
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
		// Drop any refused-apply warning with the modal
		setInlineApplyNotice(null);
		// Clear captured selection and close popover
		setCapturedSelection(null);
		setIsPopoverOpen(false);
	};

	/**
	 * Launch an extension's toolbar button (Glyphs, Paragraph Styles, ...).
	 *
	 * The extension's UI opens without the Quick Feature Toggle modal ever
	 * being open, so this handler has to do what opening that modal normally
	 * does for it:
	 *
	 * - snapshot the selection into state, because handleInsertContent reads
	 *   capturedSelection to place inserted text and to advance the caret
	 *   between successive insertions;
	 * - hand over a resolved editor state, because the shared
	 *   typost_current_editor_state filter only answers for the block holding
	 *   the caret — a block selected from List View would otherwise report the
	 *   default font rather than its own.
	 *
	 * @since 2.3.0
	 */
	const handleExtensionToolbarClick = (button) => {
		const snapshot = snapshotSelection();
		setCapturedSelection(snapshot.capturedSelection);
		// The style covering the selected text (not the block's): the style
		// browser marks this one as active when it is applying to a selection.
		// Containment, so a style over part of the selection does not count.
		const captured = snapshot.capturedSelection;
		const selectionStyleId = captured && captured.start !== captured.end
			? findCoveringParagraphStyleId(content, captured.start, captured.end)
			: 0;
		button.onClick({
			source: 'qft',
			clientId,
			capturedSelection: snapshot.capturedSelection,
			selectedText: snapshot.capturedSelection ? snapshot.capturedSelection.text : '',
			state: buildQftEditorState({ ...qftStateRef.current, selectionStyleId }),
			// No host modal was open, so nothing should reopen on close
			reopenHost: false
		});
	};

	return {
		snapshotSelection,
		handleToolbarClick,
		handlePopoverClose,
		handleExtensionToolbarClick
	};
}

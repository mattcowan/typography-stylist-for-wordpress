/**
 * Typography Stylist Block - the typost-insert-content listener.
 *
 * Moved out of edit.js unchanged (#356). See HOOKS.md for the event.
 */

import { useRef, useEffect } from '@wordpress/element';
import { create, insert as insertRichText, applyFormat, toHTMLString } from '@wordpress/rich-text';
import { resolveQftInsertionRange, adjustInsertionRangeForSwap, mergeInsertionFormatAttributes } from '../utils';
import { removePreviewSpans } from '../qft-preview';

/**
 * Insert text from an extension (the Glyphs panel) into this block when it is
 * the one the event targets.
 *
 * The listener is registered once per block instance and reads the current
 * content and selection from a ref that is updated on every render.
 *
 * @param {Object}   args
 * @param {string}   args.content              Block content
 * @param {?Object}  args.capturedSelection    Selection captured when the QFT modal or an extension opened
 * @param {?Object}  args.selectionStart       Store selection start
 * @param {?Object}  args.selectionEnd         Store selection end
 * @param {string}   args.clientId             Block client ID
 * @param {boolean}  args.isPopoverOpen        Whether the QFT modal is open
 * @param {Function} args.setAttributes        Block setAttributes
 * @param {Function} args.setCapturedSelection Sets the captured selection
 * @param {Object}   args.originalContentRef   Content saved before a live preview
 */
export default function useInsertContent({ content, capturedSelection, selectionStart, selectionEnd, clientId, isPopoverOpen, setAttributes, setCapturedSelection, originalContentRef }) {
	// Extension hook: Listen for content insertion from extensions (e.g., Glyphs Panel)
	// Inserts text at the captured/current selection, optionally wrapping it in a
	// typost-styled span via format attributes. Uses ref pattern to avoid stale closures.
	const insertContentRef = useRef({});
	insertContentRef.current = { content, capturedSelection, selectionStart, selectionEnd, clientId, isPopoverOpen };
	// What the last extension insertion put where (see adjustInsertionRangeForSwap)
	const lastInsertRef = useRef(null);

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
			const resolved = resolveQftInsertionRange(
				captured || e.detail.range || null,
				selStart, selEnd, curClientId, value.text.length
			);
			// Keep a glyph that stayed selected only for alternate swapping from
			// being overwritten by a different character, and let an alternate
			// picked right after a caret insertion replace that glyph (GP-1).
			const range = adjustInsertionRangeForSwap(resolved, lastInsertRef.current, !!e.detail.swap, value.text);

			const text = String(e.detail.text).slice(0, 50);
			let newValue = insertRichText(value, text, range.start, range.end);
			const insertEnd = range.start + text.length;
			lastInsertRef.current = { start: range.start, end: insertEnd, text, swap: !!e.detail.swap };

			// Copy formats so insertion behaves like typing (continuity). When
			// replacing a selection, inherit from the replaced range's first
			// character (the glyph being swapped) — the preceding character may
			// sit outside the styled span when the selection starts a span.
			const inherited = (range.end > range.start && value.formats[range.start])
				? value.formats[range.start]
				: ((range.start > 0 && value.formats[range.start - 1]) ? value.formats[range.start - 1] : []);
			inherited.forEach((format) => {
				newValue = applyFormat(newValue, format, range.start, insertEnd);
			});

			// Wrap inserted text in a typost-styled span when attributes provided.
			// applyFormat replaces the inherited typost format on the inserted
			// range, so merge the replaced format's sizing/spacing into the new
			// attributes first — a swapped glyph must keep its span's styling.
			if (e.detail.attributes && typeof e.detail.attributes === 'object') {
				const inheritedTypost = inherited.find((f) => f && f.type === 'typost/features');
				newValue = applyFormat(newValue, {
					type: 'typost/features',
					attributes: mergeInsertionFormatAttributes(
						e.detail.attributes,
						inheritedTypost ? inheritedTypost.attributes : null
					)
				}, range.start, insertEnd);
			}

			// Commit: clear preview-restore so popover close doesn't revert the insertion
			originalContentRef.current = null;
			setAttributes({ content: toHTMLString({ value: newValue }) });
			// swap (alternates-view) insertions keep the inserted text SELECTED
			// so the next alternate/base click replaces the same glyph;
			// sequence insertions collapse the caret after the text so the
			// next glyph appends.
			setCapturedSelection(e.detail.swap
				? { start: range.start, end: insertEnd, text: text, length: text.length }
				: { start: insertEnd, end: insertEnd, text: '', length: 0 });
		};
		document.addEventListener('typost-insert-content', handleInsertContent);
		return () => {
			document.removeEventListener('typost-insert-content', handleInsertContent);
		};
	}, [setAttributes]); // eslint-disable-line react-hooks/exhaustive-deps -- content/selection read from insertContentRef
}

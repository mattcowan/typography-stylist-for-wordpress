/**
 * Typography Stylist Block - paragraph style on selected text.
 *
 * Moved out of edit.js unchanged (#356). The functions were closures inside
 * Edit and are still rebuilt on every render: Edit calls this factory once
 * per render with the current values, so every function sees the same
 * values it saw before.
 */

import { __ } from '@wordpress/i18n';
import { detachParagraphStyleFromSelection, countParagraphStyleConflicts, findCoveringParagraphStyleId, selectionHasOneStyleSet, applyParagraphStyleBySplit, validateRangeMatchesSelection, applyOrMergeStyling, applyStylingSafeStringMethod, stripParagraphStyleOverrides } from '../utils';
import { getRangeForOffsets } from '../qft-preview';

/**
 * Apply a paragraph style to the selected text (applyTo: 'selection',
 * #303).
 *
 * @param {Object} ctx Edit's current values, state setters, refs and the
 *                     functions earlier factories returned (see edit.js).
 * @return {Object} applyInlineParagraphStyle
 */
export default function createParagraphStyleActions(ctx) {
	const {
		capturedSelection, content, originalContentRef, resolvedApplyRange, setAttributes
	} = ctx;

	/**
	 * Apply a paragraph style to the selected text only (inline).
	 *
	 * Paragraph styles are normally block-level — they describe a whole
	 * paragraph — but applying one to a selection has to stay inside that
	 * selection: styling a word must not restyle the words around it just
	 * because those carry no explicit styling of their own.
	 *
	 * The span carries only `data-style-id`; the module's stylesheet renders
	 * it through `.typost-styled[data-style-id="N"]`, so no inline style
	 * string is written (that is what keeps "Update Style" able to restyle
	 * every use at once).
	 *
	 * Detaching writes the style's values onto the text in place of its
	 * data-style-id (detachParagraphStyleFromSelection), so the text keeps
	 * its look, as Detach does on the whole block. A selection with no
	 * style on it detaches nothing, and the block keeps its style.
	 *
	 * @since 2.3.0
	 * @param {number}  styleId            Paragraph style ID (0 detaches)
	 * @param {boolean} savedFromSelection The style was just saved from this selection (#303)
	 * @return {boolean} Whether the style was applied inline
	 */
	const applyInlineParagraphStyle = (styleId, savedFromSelection = false) => {
		if (!content || !resolvedApplyRange) return false;

		const start = resolvedApplyRange.start;
		const end = resolvedApplyRange.end;
		if (start === end) return false;

		const id = parseInt(styleId, 10);

		// Detaching: replace the style with its values on the selection
		if (!id) {
			const detached = detachParagraphStyleFromSelection(content, start, end, window.typostData && window.typostData.paragraphStyles);
			if (detached.success) {
				setAttributes({ content: detached.content });
				originalContentRef.current = null;
			}
			// No style on the selected text means nothing to detach. Still
			// handled: falling through would detach the block's style
			// instead (#303 review)
			return true;
		}

		// Text inside the selection that carries styling of its own (a first
		// letter given a font and a swash, say) would keep that look: its
		// inline declarations beat the style's CSS class in the cascade, so
		// the style visibly skipped it. Ask before replacing that styling;
		// a cancel counts as handled so the style is NOT applied block-level.
		// A style just saved from a selection with one set of values was
		// built from that styling, so it replaces nothing visible and the
		// question is skipped (#303); the strip below still runs.
		const conflicts = countParagraphStyleConflicts(content, start, end);
		// The selection already carries this style and nothing overrides it
		// (Update Style re-applies the style it just saved): nothing to do,
		// and re-wrapping would only split the style's span (#303 review)
		if (conflicts === 0 && findCoveringParagraphStyleId(content, start, end) === id) {
			return true;
		}
		if (conflicts > 0 && !(savedFromSelection && selectionHasOneStyleSet(content, start, end))) {
			const proceed = window.confirm(__('Some of the selected text has styling of its own (font, weight, size, spacing, or features). Applying the paragraph style replaces that styling so the whole selection matches the style. Continue?', 'typography-stylist'));
			if (!proceed) {
				// Tell the panel that dispatched the apply, so its badge does
				// not keep showing a style that was never applied.
				document.dispatchEvent(new CustomEvent('typost-paragraph-style-apply-cancelled', {
					detail: { source: 'qft', paragraphStyleId: id }
				}));
				return true;
			}
		}

		// Swapping the style on an existing span is handled by the applier
		// below: a selection covering the whole span merges the new
		// data-style-id into it instead of nesting a second span.
		const attrs = { 'data-style-id': String(id) };
		let success = false;
		let newContent = content;

		// A selection strictly inside a styled run is split out of it first:
		// nested inside, the style's wrapper would inherit every property the
		// style leaves unset (the run's size, spacing, features), and the
		// strip below must not touch the run's text outside the selection.
		const split = applyParagraphStyleBySplit(content, start, end, id);
		if (split.success) {
			success = true;
			newContent = split.content;
		}

		if (!success) {
			const parser = new DOMParser();
			const doc = parser.parseFromString(`<div>${content}</div>`, 'text/html');
			const container = doc.body.firstChild;

			const range = getRangeForOffsets(container, start, end, doc);
			const validation = validateRangeMatchesSelection(
				range,
				capturedSelection?.text || '',
				capturedSelection?.length || 0
			);

			if (validation.valid) {
				success = applyOrMergeStyling(range, attrs, '', doc);
				if (success) {
					newContent = container.innerHTML;
				}
			}
		}

		if (!success) {
			const fallbackResult = applyStylingSafeStringMethod(content, start, end, attrs, '');
			if (!fallbackResult.success) {
				return false;
			}
			newContent = fallbackResult.content;
		}

		// The author agreed above: strip the styling the style owns from the
		// styled span and everything inside it, so the class renders.
		if (conflicts > 0) {
			newContent = stripParagraphStyleOverrides(newContent, start, end, id).content;
		}

		setAttributes({ content: newContent });
		originalContentRef.current = null;
		return true;
	};

	return {
		applyInlineParagraphStyle
	};
}

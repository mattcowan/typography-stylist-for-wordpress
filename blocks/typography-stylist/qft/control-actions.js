/**
 * Typography Stylist Block - Quick Feature Toggles control state helpers.
 *
 * Moved out of edit.js unchanged (#356). The functions were closures inside
 * Edit and are still rebuilt on every render: Edit calls this factory once
 * per render with the current values, so every function sees the same
 * values it saw before.
 */

import { speak } from '@wordpress/a11y';
import { getNewFontSizeUnit, describeInlineApplyFailure } from '../utils';

/**
 * Fill the QFT controls from detected inline styles, put one control back
 * after a refused apply, and report that refusal.
 *
 * @param {Object} ctx Edit's current values, state setters, refs and the
 *                     functions earlier factories returned (see edit.js).
 * @return {Object} populateControlsFromDetectedStyles, revertInlineControl, reportInlineApplyFailure
 */
export default function createControlActions(ctx) {
	const {
		inlineStylesAtSelection, setInlineApplyNotice, setInlineCaseFromStyle, setInlineFakeSmallCaps,
		setInlineFitScale, setInlineFitShift, setInlineFontFamily, setInlineFontSize,
		setInlineFontSizeMax, setInlineFontSizeMin, setInlineFontSizePreferred, setInlineFontSizeUnit,
		setInlineFontStyle, setInlineFontWeight, setInlineLetterSpacing, setInlineLineHeight,
		setInlineTextCase
	} = ctx;

	// Helper: Populate control state from detected inline styles
	const populateControlsFromDetectedStyles = (detected) => {
		if (!detected) {
			// No styled span at cursor - reset to defaults
			setInlineLetterSpacing(0);
			setInlineLineHeight(0);
			setInlineFitScale(100);
			setInlineFitShift(0);
			setInlineFontWeight('inherit');
			setInlineFontStyle('');
			setInlineTextCase('');
			setInlineFakeSmallCaps(true);
			setInlineCaseFromStyle(false);
			setInlineFontFamily('');
			setInlineFontSize('inherit');
			setInlineFontSizeUnit(getNewFontSizeUnit());
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
		if (detected.fitScale !== null && detected.fitScale !== undefined) {
			setInlineFitScale(Math.round(detected.fitScale * 100));
		} else {
			setInlineFitScale(100);
		}
		if (detected.fitShift !== null && detected.fitShift !== undefined) {
			setInlineFitShift(detected.fitShift);
		} else {
			setInlineFitShift(0);
		}
		if (detected.fontWeight) {
			setInlineFontWeight(detected.fontWeight);
		}
		if (detected.fontStyle) {
			setInlineFontStyle(detected.fontStyle);
		}
		// Always set: a case shown for the last selection must not stay on
		// text without one (#309)
		setInlineTextCase(detected.textCase || '');
		setInlineFakeSmallCaps(detected.fakeSmallCaps !== false);
		setInlineCaseFromStyle(!!detected.textCaseFromStyle);
		if (detected.fontId) {
			setInlineFontFamily(detected.fontId);
		}
		setInlineFontSizeUnit(detected.fontSizeUnit || getNewFontSizeUnit());
		if (detected.fontSize) {
			setInlineFontSize(detected.fontSize);
			if (detected.fontSizeMin !== null) setInlineFontSizeMin(detected.fontSizeMin);
			if (detected.fontSizePreferred !== null) setInlineFontSizePreferred(detected.fontSizePreferred);
			if (detected.fontSizeMax !== null) setInlineFontSizeMax(detected.fontSizeMax);
		}
	};

	/**
	 * Put one QFT control back to the value the selection actually carries.
	 *
	 * Called after an apply that both strategies refused: the content did
	 * not change, so the control must not keep showing the value it never
	 * applied. Mirrors populateControlsFromDetectedStyles() for that one
	 * property (the detection is what filled the control in the first
	 * place), which is why the fallbacks are the same defaults.
	 *
	 * @since 2.3.0
	 * @param {string} property One of lineHeight, letterSpacing, fitScale,
	 *   fitShift, fontWeight, fontStyle, textCase, fontFamily, fontSize
	 */
	const revertInlineControl = (property) => {
		const detected = inlineStylesAtSelection || {};
		const has = (key) => detected[key] !== null && detected[key] !== undefined;
		switch (property) {
			case 'lineHeight':
				setInlineLineHeight(has('lineHeight') ? detected.lineHeight : 0);
				break;
			case 'letterSpacing':
				setInlineLetterSpacing(has('letterSpacing') ? detected.letterSpacing : 0);
				break;
			case 'fitScale':
				setInlineFitScale(has('fitScale') ? Math.round(detected.fitScale * 100) : 100);
				break;
			case 'fitShift':
				setInlineFitShift(has('fitShift') ? detected.fitShift : 0);
				break;
			case 'fontWeight':
				setInlineFontWeight(detected.fontWeight || 'inherit');
				break;
			case 'fontStyle':
				setInlineFontStyle(detected.fontStyle || '');
				break;
			case 'textCase':
				setInlineTextCase(detected.textCase || '');
				setInlineFakeSmallCaps(detected.fakeSmallCaps !== false);
				setInlineCaseFromStyle(!!detected.textCaseFromStyle);
				break;
			case 'fontFamily':
				setInlineFontFamily(detected.fontId || '');
				break;
			case 'fontSize':
				setInlineFontSize(detected.fontSize || 'inherit');
				setInlineFontSizeUnit(detected.fontSizeUnit || getNewFontSizeUnit());
				setInlineFontSizeMin(has('fontSizeMin') ? detected.fontSizeMin : 16);
				setInlineFontSizePreferred(has('fontSizePreferred') ? detected.fontSizePreferred : 32);
				setInlineFontSizeMax(has('fontSizeMax') ? detected.fontSizeMax : 64);
				break;
			default:
				break;
		}
	};

	/**
	 * Report an inline apply that both strategies refused.
	 *
	 * Every apply path tries the Range method, then
	 * applyStylingSafeStringMethod(); when that also fails (in practice the
	 * nesting limit, see MAX_NESTING_DEPTH in utils.js) the content stays as
	 * it was. That used to be a bare return: no message, no announcement,
	 * and a control still showing the value it did not apply (QA finding
	 * E-5). Now the modal shows a dismissible warning, a screen reader hears
	 * it assertively (the author just acted, so it must not queue behind
	 * other announcements), and the caller's revert puts its control back.
	 *
	 * The warning clears on the next content change (a later apply went
	 * through) and when the modal closes.
	 *
	 * @since 2.3.0
	 * @param {string|null|undefined} error Error from the apply helpers
	 * @param {Function} [revert] Puts the control that triggered the apply back
	 */
	const reportInlineApplyFailure = (error, revert) => {
		const { message } = describeInlineApplyFailure(error);
		if (typeof revert === 'function') {
			revert();
		}
		setInlineApplyNotice(message);
		speak(message, 'assertive');
	};

	return {
		populateControlsFromDetectedStyles,
		revertInlineControl,
		reportInlineApplyFailure
	};
}

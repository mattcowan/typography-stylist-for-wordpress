/**
 * Typography Stylist Block - debounced Quick Feature Toggles appliers.
 *
 * Moved out of edit.js unchanged (#356).
 */

import { useRef, useEffect } from '@wordpress/element';
import { debounce } from '../utils';

/**
 * Refs to the latest apply functions, and the debounced functions that call
 * them when a responsive control (slider, select) changes.
 *
 * Edit assigns each ref's `current` on every render, just before it returns,
 * so a debounced call always runs the apply function of the latest render.
 * The debounced functions are created once per block instance and cancelled
 * on unmount.
 *
 * @return {Object} The nine apply refs and the seven debounced functions.
 */
export default function useDebouncedAppliers() {
	// Refs to store the latest apply functions (to avoid stale closures in debounced functions)
	const applyLetterSpacingRef = useRef(null);
	const applyLineHeightRef = useRef(null);
	const applyFontFamilyRef = useRef(null);
	const applyFontWeightRef = useRef(null);
	const applyFontSizeRef = useRef(null);
	const applyFontVariationSettingsRef = useRef(null);
	const applyParagraphStyleRef = useRef(null);
	const applyFitScaleRef = useRef(null);
	const applyFitShiftRef = useRef(null);

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

	const debouncedApplyFitScale = useRef(
		debounce(() => {
			if (applyFitScaleRef.current) {
				applyFitScaleRef.current();
			}
		}, 400)
	).current;

	const debouncedApplyFitShift = useRef(
		debounce(() => {
			if (applyFitShiftRef.current) {
				applyFitShiftRef.current();
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
			if (debouncedApplyFitScale && typeof debouncedApplyFitScale.cancel === 'function') {
				debouncedApplyFitScale.cancel();
			}
			if (debouncedApplyFitShift && typeof debouncedApplyFitShift.cancel === 'function') {
				debouncedApplyFitShift.cancel();
			}
		};
	}, []); // Empty deps - only run on unmount

	return {
		applyLetterSpacingRef,
		applyLineHeightRef,
		applyFontFamilyRef,
		applyFontWeightRef,
		applyFontSizeRef,
		applyFontVariationSettingsRef,
		applyParagraphStyleRef,
		applyFitScaleRef,
		applyFitShiftRef,
		debouncedApplyLetterSpacing,
		debouncedApplyLineHeight,
		debouncedApplyFitScale,
		debouncedApplyFitShift,
		debouncedApplyFontFamily,
		debouncedApplyFontWeight,
		debouncedApplyFontSize
	};
}

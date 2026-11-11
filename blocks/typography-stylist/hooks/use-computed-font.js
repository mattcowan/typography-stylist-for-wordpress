/**
 * Typography Stylist Block - detect the font the block inherits.
 *
 * Moved out of edit.js unchanged (#356).
 */

import { useEffect } from '@wordpress/element';
import { detectBlockComputedFont } from '../utils';

/**
 * Store the computed font family of a block that has no font of its own, or
 * '' when it has one. Runs after render, when the canvas styles apply.
 *
 * @param {string}   fontFamily      The block's fontFamily attribute
 * @param {string}   clientId        Block client ID
 * @param {Function} setComputedFont Sets Edit's computedFont state
 */
export default function useComputedFont(fontFamily, clientId, setComputedFont) {
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
}

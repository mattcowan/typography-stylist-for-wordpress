/**
 * Typography Stylist Block - reopen the Quick Feature Toggles after the
 * Glyphs panel closes.
 *
 * Moved out of edit.js unchanged (#356). See HOOKS.md for the
 * typost_glyphs_panel_closed action.
 */

import { useEffect } from '@wordpress/element';

/**
 * Reopen this block's QFT modal when the Glyphs panel it launched closes.
 *
 * @param {string}   clientId          Block client ID
 * @param {Function} setIsPopoverOpen  Opens or closes the QFT modal
 */
export default function useGlyphsPanelReopen(clientId, setIsPopoverOpen) {
	// Extension hook: when the Glyphs panel (a separate Modal that forced this
	// block's Quick Feature Toggle Modal closed) is dismissed, reopen the QFT
	// popover so the author returns to where they launched from. Scoped by
	// clientId so only the block that opened it reopens (every block registers
	// this shared action).
	//
	// info.reopenHost === false means the panel was launched straight from the
	// block toolbar and no host modal was ever open — reopening one the author
	// never asked for would be a surprise. Anything else (including an absent
	// flag, as older extensions send) keeps the reopen behaviour.
	useEffect(() => {
		const handler = (src, info) => {
			if (info && info.reopenHost === false) {
				return;
			}
			if (src === 'qft' && info && info.clientId === clientId) {
				setIsPopoverOpen(true);
			}
		};
		window.typostHooks.addAction('typost_glyphs_panel_closed', handler, 10);
		return () => {
			window.typostHooks.removeAction('typost_glyphs_panel_closed', handler);
		};
	}, []); // eslint-disable-line react-hooks/exhaustive-deps -- clientId stable per instance
}

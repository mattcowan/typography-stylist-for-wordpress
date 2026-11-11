/**
 * Typography Stylist Block - the QFT editor state provider.
 *
 * Moved out of edit.js unchanged (#356). See HOOKS.md for the
 * typost_current_editor_state filter.
 */

import { useRef, useEffect } from '@wordpress/element';
import { buildQftEditorState } from '../utils';

/**
 * Answer the shared typost_current_editor_state filter for the 'qft' editor
 * with this block's state, when this block holds the active selection.
 *
 * The filter is registered once per block instance and reads the state from
 * the returned ref. The ref's `current` is the `blockState` passed on this render;
 * Edit adds the selection and font fields to it later in the same render.
 *
 * @param {string} clientId Block client ID
 * @param {Object} blockState Raw block state (see buildQftEditorState)
 * @return {Object} qftStateRef
 */
export default function useQftEditorState(clientId, blockState) {
	// Extension hook: Register state provider for QFT editor (v2.0.0)
	// Uses ref pattern to avoid filter accumulation — filter registered once,
	// reads current values from ref on each call
	const qftStateRef = useRef({});
	qftStateRef.current = blockState;

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
				return buildQftEditorState(s);
			}
			return state;
		};
		window.typostHooks.addFilter('typost_current_editor_state', stateProvider, 10);
		return () => {
			window.typostHooks.removeFilter('typost_current_editor_state', stateProvider);
		};
	}, []); // eslint-disable-line react-hooks/exhaustive-deps -- reads from ref

	return qftStateRef;
}

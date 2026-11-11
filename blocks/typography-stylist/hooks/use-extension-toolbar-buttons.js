/**
 * Typography Stylist Block - extension toolbar buttons.
 *
 * Moved out of edit.js unchanged (#356). See HOOKS.md for the
 * typost_editor_toolbar_buttons filter.
 */

import { useState, useEffect, useMemo } from '@wordpress/element';
import { filterToolbarButtons } from '../utils';

/**
 * The toolbar buttons extensions add to this block, re-read when an extension
 * fires typost_editor_toolbar_buttons_changed.
 *
 * @return {Array} Button descriptors, filtered by filterToolbarButtons().
 */
export default function useExtensionToolbarButtons() {
	// Extension hook: additional block toolbar buttons (v2.3.0).
	// Extensions return descriptors; core renders them as real ToolbarButtons so
	// they take part in the toolbar's roving tabindex, which a foreign React
	// root mounted into a hook container could not.
	//
	// Extension scripts register during their own load, which normally precedes
	// the first block render — the changed action covers the case where it
	// doesn't (async or conditionally loaded extensions).
	const [toolbarButtonsVersion, setToolbarButtonsVersion] = useState(0);
	useEffect(() => {
		const bump = () => setToolbarButtonsVersion((version) => version + 1);
		window.typostHooks.addAction('typost_editor_toolbar_buttons_changed', bump, 10);
		return () => {
			window.typostHooks.removeAction('typost_editor_toolbar_buttons_changed', bump);
		};
	}, []);

	const extensionToolbarButtons = useMemo(
		() => filterToolbarButtons(
			window.typostHooks.applyFilters('typost_editor_toolbar_buttons', [], 'qft'),
			'qft'
		),
		[toolbarButtonsVersion]
	);

	return extensionToolbarButtons;
}

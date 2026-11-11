/**
 * Extension toolbar buttons (typost_editor_toolbar_buttons, HOOKS.md)
 *
 * Shared by the inline editor (assets/js/block-editor.js, bundled with
 * browserify) and the Typography Stylist block (blocks/typography-stylist/,
 * bundled with wp-scripts; utils.js re-exports it). Until #357 the inline
 * editor kept its own copy, because the two builds were thought not to share
 * code.
 *
 * @since 2.4.0
 */

/**
 * Filter extension-registered toolbar button descriptors down to the ones a
 * given editor should render, dropping malformed entries.
 *
 * A descriptor without an `editors` array is offered in every editor.
 *
 * @since 2.3.0
 * @param {Array} buttons - Descriptors returned by the typost_editor_toolbar_buttons filter
 * @param {string} editor - Editor key ('qft' or 'inline')
 * @return {Array} Valid descriptors for this editor
 */
function filterToolbarButtons(buttons, editor) {
	if (!Array.isArray(buttons)) {
		return [];
	}
	return buttons.filter((button) => {
		if (!button || !button.id || typeof button.onClick !== 'function') {
			return false;
		}
		if (Array.isArray(button.editors)) {
			return button.editors.indexOf(editor) !== -1;
		}
		return true;
	});
}

module.exports = {
	filterToolbarButtons: filterToolbarButtons
};

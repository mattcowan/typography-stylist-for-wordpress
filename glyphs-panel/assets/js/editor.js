/**
 * Glyphs Panel — Editor Entry
 *
 * Injects a "Glyphs…" button into the Typography Stylist inline editor and
 * the Typography Stylist block's Quick Feature Toggles popover, and mounts
 * the glyph browser modal on demand.
 */
(function(wp) {
	'use strict';

	if (!wp || !wp.element) {
		return;
	}

	var el = wp.element.createElement;
	var Button = wp.components.Button;
	var __ = wp.i18n.__;

	var modalRoot = null;

	/**
	 * Wait for the core plugin's hook system to be available.
	 */
	function waitForHooks(callback) {
		if (window.typostHooks) {
			callback();
			return;
		}
		var interval = setInterval(function() {
			if (window.typostHooks) {
				clearInterval(interval);
				callback();
			}
		}, 100);
	}

	/**
	 * Close and unmount the glyphs modal.
	 */
	function closeModal() {
		if (modalRoot) {
			wp.element.unmountComponentAtNode(modalRoot);
			if (modalRoot.parentNode) {
				modalRoot.parentNode.removeChild(modalRoot);
			}
			modalRoot = null;
		}
	}

	/**
	 * Open the glyphs modal for an editor context.
	 *
	 * @param {string} source   'inline' or 'qft'
	 * @param {Object} snapshot Hook state snapshot (selection info captured at popover open)
	 */
	function openModal(source, snapshot) {
		var GlyphsModal = window.typostGlyphs && window.typostGlyphs.GlyphsModal;
		if (!GlyphsModal) {
			return;
		}

		// Fresh editor state (font, weight, features at this moment)
		var state = window.typostHooks.applyFilters('typost_current_editor_state', {}, source) || {};

		// Selection text and target range come from the snapshot captured
		// before the editor modal stole focus. The range and clientId travel
		// with each insert event so insertion still works after the host
		// editor popover closes.
		var selectionText = '';
		var range = null;
		var clientId = null;
		if (source === 'inline' && snapshot) {
			var hasRange = snapshot.savedSelectionStart !== null &&
				snapshot.savedSelectionEnd !== null &&
				snapshot.savedSelectionStart !== snapshot.savedSelectionEnd;
			selectionText = hasRange ? (snapshot.selectedText || '') : '';
			if (hasRange) {
				range = { start: snapshot.savedSelectionStart, end: snapshot.savedSelectionEnd };
			}
		} else if (source === 'qft' && snapshot) {
			clientId = snapshot.clientId || null;
			if (snapshot.capturedSelection) {
				selectionText = snapshot.capturedSelection.text || '';
				range = { start: snapshot.capturedSelection.start, end: snapshot.capturedSelection.end };
			}
		}

		var context = {
			fontId: state.fontId || 0,
			fontWeight: state.fontWeight || '',
			// The face variant rendering at the selection — the panel loads and
			// displays this variant (no toggle; context decides)
			fontStyle: state.fontStyle || '',
			features: state.features || [],
			selectionText: selectionText,
			range: range,
			clientId: clientId
		};

		closeModal();
		modalRoot = document.createElement('div');
		modalRoot.className = 'typost-glyphs-modal-root';
		document.body.appendChild(modalRoot);

		wp.element.render(
			el(GlyphsModal, {
				source: source,
				context: context,
				// On close, unmount the panel and ask the host editor to reopen
				// its popover so the author returns to where they launched from
				// (the host modal was forced closed when this one opened).
				onClose: function() {
					closeModal();
					if (window.typostHooks && window.typostHooks.doAction) {
						window.typostHooks.doAction('typost_glyphs_panel_closed', source, {
							clientId: context.clientId || null,
							range: context.range || null
						});
					}
				}
			}),
			modalRoot
		);
	}

	/**
	 * Render the "Glyphs…" button into a hook container.
	 *
	 * @param {Element} container Hook container element
	 * @param {string} source    'inline' or 'qft'
	 * @param {Object} snapshot  Editor state snapshot passed by the hook
	 */
	function renderGlyphsButton(container, source, snapshot) {
		if (!container) {
			return;
		}
		var mount = document.createElement('div');
		mount.className = 'typost-glyphs-button-wrap';
		container.appendChild(mount);

		wp.element.render(
			el(Button, {
				variant: 'secondary',
				icon: 'editor-customchar',
				className: 'typost-glyphs-open-button',
				onClick: function() {
					openModal(source, snapshot);
				}
			}, __('Glyphs…', 'typost-glyphs-panel')),
			mount
		);
	}

	waitForHooks(function() {
		window.typostHooks.addAction('typost_inline_before_features', function(container, state) {
			renderGlyphsButton(container, 'inline', state);
		}, 10);

		window.typostHooks.addAction('typost_qft_before_features', function(container, state) {
			renderGlyphsButton(container, 'qft', state);
		}, 10);
	});

})(window.wp);

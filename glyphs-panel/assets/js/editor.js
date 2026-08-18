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
	 * Toolbar icon: a swash "G". Drawn as one of a set with core's swash "T"
	 * (the two popover editors) and the Paragraph Styles swash "P", on a
	 * shared 256×256 grid and a common cap height, so the toolbar group reads
	 * as one family. Source: the core plugin's assets/images/icons/toolbar-g.svg.
	 */
	var GLYPHS_ICON_PATH = 'M200.77,177.64c-6.76,3.83-14.88,5.86-25.25,5.86-47.56,0-79.12-32.46-79.12-82.28,0-18.48,4.28-34.49,12.17-47.34-16.23-8.34-32.68-14.88-48.91-14.88-26.15,0-41.48,13.3-41.48,33.14,0,11.72,7.89,18.03,14.65,18.03,4.51,0,7.21-2.25,8.57-9.02,1.8-6.99,6.76-13.98,17.58-13.98s18.94,8.79,18.94,19.61c0,14.65-12.62,28.63-34.04,28.63S.83,98.52.83,72.15,23.37,23.68,59.66,23.68c20.29,0,39.9,8.11,58.38,18.03,13.98-14.43,34.26-22.77,59.28-22.77,39,0,60.41,18.71,60.41,39.67s-15.78,33.59-38.1,33.59c-19.16,0-38.55-9.24-58.16-20.06-1.58,8.57-2.25,18.48-2.25,29.08,0,39.22,9.69,67.62,37.19,67.62,11.72,0,20.96-5.18,24.34-9.47v-28.18c0-12.85-3.38-14.43-17.81-15.55v-9.69h73.03v9.69c-11.95,1.13-15.33,2.7-15.33,15.55v39.67c0,45.31-39,63.79-71.68,63.79-39.45,0-63.79-14.2-63.79-32.46,0-9.92,7.21-17.13,17.13-17.13,11.05,0,17.36,6.76,20.06,17.81,2.71,11.95,10.37,17.81,26.6,17.81,21.41,0,31.78-10.59,31.78-30.43v-12.62ZM145.77,57.5c18.71,10.82,36.74,20.06,53.87,20.06,13.98,0,20.74-8.57,20.74-18.94,0-11.95-13.75-25.25-38.32-25.25-18.94,0-30.21,9.24-36.29,24.12Z';

	function GlyphsIcon() {
		return el('svg', {
			width: 24,
			height: 24,
			viewBox: '0 0 256 256',
			xmlns: 'http://www.w3.org/2000/svg',
			'aria-hidden': 'true',
			focusable: 'false'
		}, el('path', { d: GLYPHS_ICON_PATH, fill: 'currentColor' }));
	}

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

		// Fresh editor state (font, weight, features at this moment). A toolbar
		// launch supplies the state directly: the shared filter only answers for
		// the block holding the caret, so a block selected from List View would
		// otherwise report the default font instead of its own.
		var state = (snapshot && snapshot.state) ||
			window.typostHooks.applyFilters('typost_current_editor_state', {}, source) || {};

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
			// Word-boundary state, resolved by the host editor at launch. Only
			// a toolbar launch supplies it — opened from inside an editor
			// modal, that modal shows the notice itself.
			accessibility: (snapshot && snapshot.accessibility) || null,
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
							range: context.range || null,
							// false when launched from the block toolbar: there is
							// no host modal to return to, so the editor must not
							// open one the author never asked for.
							reopenHost: !(snapshot && snapshot.reopenHost === false)
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
				// The same swash G as the block-toolbar button below, not a
				// dashicon: both open this panel, so they read as one control.
				icon: GlyphsIcon,
				className: 'typost-glyphs-open-button',
				onClick: function() {
					openModal(source, snapshot);
				}
			}, __('Glyphs…', 'typost-glyphs-panel')),
			mount
		);
	}

	/**
	 * Whether the site has opted into the direct block toolbar button.
	 */
	function toolbarButtonEnabled() {
		return !!(window.typostData &&
			window.typostData.glyphsPanel &&
			window.typostData.glyphsPanel.toolbarButton);
	}

	waitForHooks(function() {
		window.typostHooks.addAction('typost_inline_before_features', function(container, state) {
			renderGlyphsButton(container, 'inline', state);
		}, 10);

		window.typostHooks.addAction('typost_qft_before_features', function(container, state) {
			renderGlyphsButton(container, 'qft', state);
		}, 10);

		// Optional direct-access button in the block toolbar. The context the
		// editors hand to onClick already carries the fields openModal reads
		// (clientId/capturedSelection for the block, savedSelection* for the
		// inline editor), plus `state` and `reopenHost`.
		if (toolbarButtonEnabled()) {
			window.typostHooks.addFilter('typost_editor_toolbar_buttons', function(buttons) {
				return buttons.concat([{
					id: 'glyphs',
					icon: GlyphsIcon,
					label: __('Glyphs', 'typost-glyphs-panel'),
					onClick: function(context) {
						openModal(context.source, context);
					}
				}]);
			}, 10);
			window.typostHooks.doAction('typost_editor_toolbar_buttons_changed');
		}
	});

})(window.wp);

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
	 * Toolbar icon: a swash "G" — Bookmania Regular, `salt` alternate #2,
	 * outlined and scaled to the same cap height as core's swash "T" icon so
	 * the two sit together as a set.
	 */
	var GLYPHS_ICON_PATH = 'M947.303 860.064L975.294 860.064L975.294 665.992C975.294 595.081 992.089 589.482 1063 584.817L1063 561.491L793.352 561.491L793.352 584.817C867.995 589.482 882.923 595.081 882.923 665.992L882.923 766.760C864.263 792.885 802.682 833.006 718.708 833.006C574.087 833.006 507.841 707.978 507.841 533.500C507.841 483.116 513.440 437.397 524.636 396.343C617.007 451.393 712.177 502.710 818.544 502.710C914.647 502.710 977.160 452.326 977.160 365.553C977.160 272.249 878.258 192.941 720.574 192.941C614.208 192.941 526.502 240.526 470.520 317.035C388.412 269.450 302.573 228.396 209.269 228.396C98.237 228.396 4 296.508 4 403.807C4 519.504 98.237 573.621 173.813 573.621C266.184 573.621 313.769 518.571 313.769 469.120C313.769 433.665 290.443 410.339 260.586 410.339C222.331 410.339 206.470 436.464 202.737 466.321C198.072 503.643 178.478 514.839 156.085 514.839C105.701 514.839 51.585 477.518 51.585 402.874C51.585 331.963 104.768 269.450 209.269 269.450C293.242 269.450 370.685 306.771 449.060 351.557C420.136 402.874 405.207 465.388 405.207 533.500C405.207 730.371 534.900 874.059 717.775 874.059C813.878 874.059 877.325 839.537 912.781 806.881ZM727.106 233.061C846.535 233.061 929.575 293.709 929.575 365.553C929.575 416.870 895.053 462.589 818.544 462.589C720.574 462.589 630.070 412.205 538.632 357.156C571.288 280.646 632.869 233.061 727.106 233.061Z';

	function GlyphsIcon() {
		return el('svg', {
			width: 24,
			height: 24,
			viewBox: '0 0 1067 1067',
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
				icon: 'editor-customchar',
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

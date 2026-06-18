/**
 * Glyphs Panel — Admin Browse Tab
 *
 * Bootstraps the glyph browser on the Typography Stylist settings page
 * (Settings → Typography Stylist → Glyphs). Reuses the same GlyphsModal
 * component in browse mode (source: 'admin' — clicking a glyph copies it
 * to the clipboard instead of inserting).
 *
 * The lib modules read font data from window.typostData (editor convention);
 * on the admin page the equivalent data lives in typostAdmin, so it is
 * aliased here before the modal opens.
 */
(function(wp) {
	'use strict';

	if (!wp || !wp.element) {
		return;
	}

	var el = wp.element.createElement;
	var modalRoot = null;

	/**
	 * Alias admin-localized data into the window.typostData shape the shared
	 * lib modules and modal expect.
	 */
	function bootstrapData() {
		var admin = window.typostAdmin || {};
		var glyphsAdmin = window.typostGlyphsAdmin || {};
		window.typostData = window.typostData || {};
		var data = window.typostData;
		data.fonts = data.fonts || admin.fonts || [];
		data.adobeFonts = data.adobeFonts || admin.adobeFonts || [];
		data.manualFonts = data.manualFonts || admin.manualFonts || [];
		data.wpFontLibraryFonts = data.wpFontLibraryFonts || admin.wpFontLibraryFonts || [];
		data.features = data.features || admin.features || [];
		data.glyphsPanel = data.glyphsPanel || glyphsAdmin.glyphsPanel || {};
	}

	function closeModal() {
		if (modalRoot) {
			wp.element.unmountComponentAtNode(modalRoot);
			if (modalRoot.parentNode) {
				modalRoot.parentNode.removeChild(modalRoot);
			}
			modalRoot = null;
		}
	}

	function openBrowser() {
		var GlyphsModal = window.typostGlyphs && window.typostGlyphs.GlyphsModal;
		if (!GlyphsModal) {
			return;
		}
		bootstrapData();
		closeModal();
		modalRoot = document.createElement('div');
		modalRoot.className = 'typost-glyphs-modal-root';
		document.body.appendChild(modalRoot);
		wp.element.render(
			el(GlyphsModal, {
				source: 'admin',
				context: {},
				onClose: closeModal
			}),
			modalRoot
		);
	}

	document.addEventListener('DOMContentLoaded', function() {
		var button = document.getElementById('typost-glyphs-admin-open');
		if (button) {
			button.addEventListener('click', openBrowser);
		}
	});

})(window.wp);

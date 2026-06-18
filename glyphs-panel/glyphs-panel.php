<?php
/**
 * Glyphs Panel — bundled core module for Typography Stylist.
 *
 * Originally shipped as the separate "Typography Stylist - Glyphs Panel"
 * plugin (v1.1.0); integrated into core for the 2.0 release. This file is
 * loaded by the core plugin (see typography-stylist.php) and is NOT a
 * standalone plugin — it has no plugin header and registers itself directly
 * rather than bootstrapping on plugins_loaded.
 *
 * It still integrates only through Typography Stylist's public extension API
 * (filters, actions, and the window.typostHooks / typost-insert-content
 * bridges) — it never calls core internals directly.
 *
 * @package TypographyStylist\GlyphsPanel
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// Guard the constants so a still-active standalone copy (deactivated but left
// on disk) cannot trigger a duplicate define() or a fatal class redeclare.
if ( ! defined( 'TYPOST_GP_VERSION' ) ) {
	define( 'TYPOST_GP_VERSION', '1.1.0' );
	define( 'TYPOST_GP_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
	define( 'TYPOST_GP_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
}

require_once TYPOST_GP_PLUGIN_DIR . 'includes/font-files.php';

/**
 * Typography Stylist - Glyphs Panel
 *
 * Singleton class that hooks into Typography Stylist's extensibility system
 * to provide a full-font glyph browser with insertion into both editors.
 *
 * EULA note: this extension never extracts or stores glyph outline data.
 * Font binaries are parsed client-side, on demand, for metadata only
 * (character coverage and OpenType feature maps). Glyphs are rendered as
 * plain text styled with the already-loaded webfont.
 */
final class Typost_Glyphs_Panel {

	/** @var self|null */
	private static $instance = null;

	/**
	 * Get singleton instance.
	 *
	 * @return self
	 */
	public static function get_instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * Private constructor — use get_instance().
	 */
	private function __construct() {
		$this->register_hooks();
	}

	/**
	 * Register all hook callbacks.
	 */
	private function register_hooks() {
		// Translations
		add_action( 'init', array( $this, 'load_textdomain' ) );

		// Editor data (vendor library URLs for lazy loading, WP Font Library files)
		add_filter( 'typost_editor_data', array( $this, 'add_editor_data' ) );

		// Editor assets
		add_action( 'typost_editor_assets', array( $this, 'enqueue_editor_assets' ) );

		// Admin "Glyphs" browse tab
		add_filter( 'typost_admin_tabs', array( $this, 'register_admin_tab' ) );
		add_action( 'typost_admin_tab_content_glyphs', array( $this, 'render_admin_tab' ) );
		add_action( 'typost_admin_assets', array( $this, 'enqueue_admin_assets' ) );
	}

	/**
	 * Load the plugin text domain.
	 */
	public function load_textdomain() {
		load_plugin_textdomain(
			'typost-glyphs-panel',
			false,
			dirname( plugin_basename( __FILE__ ) ) . '/languages'
		);
	}

	// -------------------------------------------------------------------------
	// Shared data
	// -------------------------------------------------------------------------

	/**
	 * Build the glyphsPanel data block shared by the editor and admin contexts.
	 *
	 * @return array
	 */
	private function get_glyphs_panel_data() {
		return array(
			'vendorUrls'  => array(
				'opentype' => TYPOST_GP_PLUGIN_URL . 'assets/js/vendor/opentype.min.js',
				'wawoff2'  => TYPOST_GP_PLUGIN_URL . 'assets/js/vendor/wawoff2/decompress_binding.js',
			),
			'workerUrl'   => TYPOST_GP_PLUGIN_URL . 'assets/js/lib/parse-worker.js',
			'metadataUrl' => TYPOST_GP_PLUGIN_URL . 'assets/js/lib/metadata.js',
			'wpFontFiles' => typost_gp_get_wp_font_files(),
			'version'     => TYPOST_GP_VERSION,
		);
	}

	/**
	 * Add Glyphs Panel data to the typostData localized object.
	 *
	 * Vendor libraries (opentype.js, wawoff2) are NOT enqueued — they are
	 * lazy-loaded by the panel the first time it opens, using these URLs.
	 *
	 * @param array $data Editor data.
	 * @return array
	 */
	public function add_editor_data( $data ) {
		$data['glyphsPanel'] = $this->get_glyphs_panel_data();
		return $data;
	}

	// -------------------------------------------------------------------------
	// Assets
	// -------------------------------------------------------------------------

	/**
	 * Library script handles in dependency order.
	 *
	 * @return array handle => path
	 */
	private function get_lib_scripts() {
		return array(
			'typost-glyphs-window-grid' => 'assets/js/lib/window-grid.js',
			'typost-glyphs-search'      => 'assets/js/lib/search.js',
			'typost-glyphs-metadata'    => 'assets/js/lib/metadata.js',
			'typost-glyphs-insertion'   => 'assets/js/lib/insertion.js',
			'typost-glyphs-idb'         => 'assets/js/lib/idb-cache.js',
			'typost-glyphs-font-loader' => 'assets/js/lib/font-loader.js',
		);
	}

	/**
	 * Enqueue the shared lib chain + modal component.
	 *
	 * @return string[] Handles the entry script must depend on.
	 */
	private function enqueue_shared_scripts() {
		$libs = $this->get_lib_scripts();

		foreach ( $libs as $handle => $path ) {
			wp_enqueue_script(
				$handle,
				TYPOST_GP_PLUGIN_URL . $path,
				array(),
				TYPOST_GP_VERSION,
				true
			);
		}

		wp_enqueue_script(
			'typost-glyphs-modal',
			TYPOST_GP_PLUGIN_URL . 'assets/js/glyphs-modal.js',
			array_merge( array_keys( $libs ), array( 'wp-element', 'wp-components', 'wp-i18n', 'wp-a11y' ) ),
			TYPOST_GP_VERSION,
			true
		);
		wp_set_script_translations( 'typost-glyphs-modal', 'typost-glyphs-panel', TYPOST_GP_PLUGIN_DIR . 'languages' );

		wp_enqueue_style(
			'typost-glyphs-panel',
			TYPOST_GP_PLUGIN_URL . 'assets/css/glyphs-panel.css',
			array(),
			TYPOST_GP_VERSION
		);

		// @font-face for WP Font Library fonts (WordPress only loads them where
		// the theme uses them — glyph cells need them in this document too)
		$wp_font_css = typost_gp_wp_font_face_css();
		if ( $wp_font_css ) {
			wp_add_inline_style( 'typost-glyphs-panel', $wp_font_css );
		}

		return array( 'typost-glyphs-modal' );
	}

	/**
	 * Enqueue editor JavaScript and CSS for both inline and block editors.
	 */
	public function enqueue_editor_assets() {
		$deps   = $this->enqueue_shared_scripts();
		$deps[] = 'typost-block-editor';

		wp_enqueue_script(
			'typost-glyphs-editor',
			TYPOST_GP_PLUGIN_URL . 'assets/js/editor.js',
			array_merge( $deps, array( 'wp-element', 'wp-components', 'wp-i18n' ) ),
			TYPOST_GP_VERSION,
			true
		);
		wp_set_script_translations( 'typost-glyphs-editor', 'typost-glyphs-panel', TYPOST_GP_PLUGIN_DIR . 'languages' );
	}

	// -------------------------------------------------------------------------
	// Admin "Glyphs" tab
	// -------------------------------------------------------------------------

	/**
	 * Register the Glyphs tab on the Typography Stylist settings page.
	 *
	 * @param array $tabs Registered tabs.
	 * @return array
	 */
	public function register_admin_tab( $tabs ) {
		$tabs[] = array(
			'id'       => 'glyphs',
			'label'    => __( 'Glyphs', 'typost-glyphs-panel' ),
			'priority' => 25,
		);
		return $tabs;
	}

	/**
	 * Render the Glyphs tab content. The browse UI itself is mounted by
	 * admin-glyphs.js into the container below.
	 */
	public function render_admin_tab() {
		?>
		<div class="typost-glyphs-admin-tab">
			<h2><?php esc_html_e( 'Glyph Browser', 'typost-glyphs-panel' ); ?></h2>
			<p><?php esc_html_e( 'Explore every character and OpenType feature in your fonts. Click a glyph to copy it to the clipboard. To insert glyphs into content, use the Glyphs button inside the editor.', 'typost-glyphs-panel' ); ?></p>
			<p>
				<button type="button" class="button button-primary" id="typost-glyphs-admin-open">
					<?php esc_html_e( 'Open Glyph Browser', 'typost-glyphs-panel' ); ?>
				</button>
			</p>
			<p class="description"><?php esc_html_e( 'Font data is read in your browser, on demand, for metadata only — no glyph outlines are ever extracted or stored.', 'typost-glyphs-panel' ); ?></p>
		</div>
		<?php
	}

	/**
	 * Enqueue the admin browse script on the settings page.
	 */
	public function enqueue_admin_assets() {
		$deps   = $this->enqueue_shared_scripts();
		$deps[] = 'typost-admin'; // typostAdmin localized data (fonts, features)

		wp_enqueue_script(
			'typost-glyphs-admin',
			TYPOST_GP_PLUGIN_URL . 'assets/js/admin-glyphs.js',
			array_merge( $deps, array( 'wp-element', 'wp-components', 'wp-i18n' ) ),
			TYPOST_GP_VERSION,
			true
		);
		wp_set_script_translations( 'typost-glyphs-admin', 'typost-glyphs-panel', TYPOST_GP_PLUGIN_DIR . 'languages' );

		wp_localize_script( 'typost-glyphs-admin', 'typostGlyphsAdmin', array(
			'glyphsPanel' => $this->get_glyphs_panel_data(),
		) );
	}
}

// Initialization is handled by the core plugin, which requires this file and
// calls Typost_Glyphs_Panel::get_instance() once the Typost class is defined.
// See typography-stylist.php.

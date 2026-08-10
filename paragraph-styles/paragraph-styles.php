<?php
/**
 * Typography Stylist - Paragraph Styles module
 *
 * Save and load paragraph style presets for Typography Stylist. Named
 * typography configurations (font, weight, size, spacing, OpenType features,
 * variable font axes) applied from a dropdown in both editors, rendered via
 * CSS class on the frontend.
 *
 * Structured like the Glyphs Panel and Variable Fonts modules. This file
 * intentionally has NO plugin header and no plugins_loaded bootstrap — it is
 * required from typost_init() in typography-stylist.php, guarded by
 * class_exists() so the final class below can never fatally redeclare. The
 * module keeps its own text domain and consumes only core's public
 * extension API.
 *
 * @since 2.3.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// Guarded like the other bundled modules, so re-entry can never redefine these.
if ( ! defined( 'TYPOST_PS_VERSION' ) ) {
	define( 'TYPOST_PS_VERSION', '1.2.0' );
	define( 'TYPOST_PS_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
	define( 'TYPOST_PS_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
}

/**
 * Typography Stylist - Paragraph Styles
 *
 * Singleton class that hooks into Typography Stylist's extensibility system
 * to provide paragraph style presets with CSS class-based rendering.
 */
final class Typost_Paragraph_Styles {

	/** @var self|null */
	private static $instance = null;

	/** @var string Option key for storing paragraph styles */
	const OPTION_KEY = 'typost_paragraph_styles';

	/** @var string Option key for the next sequential ID counter */
	const COUNTER_KEY = 'typost_paragraph_styles_next_id';

	/** @var string Transient key for caching styles data */
	const CACHE_KEY = 'typost_paragraph_styles_cache';

	/** @var string Transient key for caching generated CSS */
	const CSS_CACHE_KEY = 'typost_paragraph_styles_css';

	/** @var string Option storing whether the block toolbar gets a direct styles button */
	const TOOLBAR_OPTION = 'typost_ps_toolbar_button';

	/** @var string REST namespace (shared with core plugin) */
	const REST_NAMESPACE = 'typost/v1';

	/** @var int Viewport breakpoints matching core plugin */
	const RESPONSIVE_FONT_MIN_VIEWPORT = 320;
	const RESPONSIVE_FONT_MAX_VIEWPORT = 1920;

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
		$this->maybe_migrate_ids();
		$this->register_hooks();
	}

	/**
	 * Register all hook callbacks.
	 */
	private function register_hooks() {
		// Translations
		add_action( 'init', array( $this, 'load_textdomain' ) );

		// Admin tab
		add_filter( 'typost_admin_tabs', array( $this, 'register_admin_tab' ) );
		add_action( 'typost_admin_tab_content_paragraph-styles', array( $this, 'render_admin_tab' ) );

		// Optional toolbar button setting (Options tab)
		add_action( 'typost_admin_options_rows', array( $this, 'render_options_row' ) );
		add_filter( 'typost_admin_options_checkboxes', array( $this, 'register_option_key' ) );

		// Editor data
		add_filter( 'typost_editor_data', array( $this, 'add_editor_data' ) );

		// REST routes
		add_action( 'typost_register_rest_routes', array( $this, 'register_rest_routes' ) );

		// Assets
		add_action( 'typost_editor_assets', array( $this, 'enqueue_editor_assets' ) );
		add_action( 'typost_admin_assets', array( $this, 'enqueue_admin_assets' ) );

		// Cache clear
		add_action( 'typost_cache_clear', array( $this, 'clear_cache' ) );

		// CSS output — frontend
		add_action( 'wp_head', array( $this, 'output_style_css' ), 6 );

		// CSS output — block editor (including iframed editors in WP 6.x+)
		add_action( 'enqueue_block_assets', array( $this, 'enqueue_editor_style_css' ) );
	}

	/**
	 * Load the module text domain.
	 */
	public function load_textdomain() {
		load_plugin_textdomain(
			'typost-paragraph-styles',
			false,
			dirname( plugin_basename( __FILE__ ) ) . '/languages'
		);
	}

	// -------------------------------------------------------------------------
	// ID Migration (old timestamp format → sequential integers)
	// -------------------------------------------------------------------------

	/**
	 * Migrate old timestamp-based IDs to sequential integers.
	 *
	 * Old format: 'ps_1709312345_123'
	 * New format: 1, 2, 3, ...
	 */
	private function maybe_migrate_ids() {
		$styles = get_option( self::OPTION_KEY, array() );
		if ( ! is_array( $styles ) || empty( $styles ) ) {
			return;
		}

		// Check if any style has the old format
		$needs_migration = false;
		foreach ( $styles as $style ) {
			if ( isset( $style['id'] ) && is_string( $style['id'] ) && strpos( $style['id'], 'ps_' ) === 0 ) {
				$needs_migration = true;
				break;
			}
		}

		if ( ! $needs_migration ) {
			return;
		}

		// Assign new sequential IDs, preserving old ID for backward-compatible CSS selectors
		$next_id = 1;
		foreach ( $styles as &$style ) {
			if ( isset( $style['id'] ) ) {
				$style['legacyId'] = $style['id'];
			}
			$style['id'] = $next_id;
			$next_id++;
		}
		unset( $style );

		update_option( self::OPTION_KEY, $styles );
		update_option( self::COUNTER_KEY, $next_id );
		$this->clear_cache();
	}

	/**
	 * Get the next sequential ID and increment the counter.
	 *
	 * @return int The next available ID.
	 */
	private function get_next_id() {
		$next_id = get_option( self::COUNTER_KEY, 1 );

		// Ensure we don't collide with existing IDs
		$styles = $this->get_styles();
		$max_id = 0;
		foreach ( $styles as $style ) {
			if ( isset( $style['id'] ) && is_numeric( $style['id'] ) ) {
				$max_id = max( $max_id, intval( $style['id'] ) );
			}
		}
		if ( $next_id <= $max_id ) {
			$next_id = $max_id + 1;
		}

		update_option( self::COUNTER_KEY, $next_id + 1 );
		return $next_id;
	}

	// -------------------------------------------------------------------------
	// CSS Generation
	// -------------------------------------------------------------------------

	/**
	 * Generate CSS for a single paragraph style.
	 *
	 * @param array $style The style data.
	 * @return string CSS rule block.
	 */
	public function generate_style_css( $style ) {
		$id    = intval( $style['id'] );
		$props = isset( $style['properties'] ) ? $style['properties'] : array();

		$css_rules = array();

		// Font family via CSS variable
		if ( ! empty( $props['fontId'] ) ) {
			$css_rules[] = 'font-family: var(--font-' . absint( $props['fontId'] ) . ')';
		}

		// Font weight (validated to numeric 1-1000 or keyword)
		if ( ! empty( $props['fontWeight'] ) ) {
			$weight = $props['fontWeight'];
			if ( is_numeric( $weight ) && $weight >= 1 && $weight <= 1000 ) {
				$css_rules[] = 'font-weight: ' . intval( $weight );
			} elseif ( in_array( $weight, array( 'normal', 'bold', 'lighter', 'bolder' ), true ) ) {
				$css_rules[] = 'font-weight: ' . esc_attr( $weight );
			}
		}

		// OpenType features
		if ( ! empty( $props['features'] ) && is_array( $props['features'] ) ) {
			$features    = array_map( function( $f ) {
				return '"' . esc_attr( $f ) . '" 1';
			}, $props['features'] );
			$css_rules[] = 'font-feature-settings: ' . implode( ', ', $features );
		}

		// Letter spacing
		if ( ! empty( $props['letterSpacing'] ) ) {
			$css_rules[] = 'letter-spacing: ' . ( intval( $props['letterSpacing'] ) / 1000 ) . 'em';
		}

		// Line height
		if ( ! empty( $props['lineHeight'] ) ) {
			$css_rules[] = 'line-height: ' . floatval( $props['lineHeight'] );
		}

		// Font variation settings (variable font axes)
		// Parse and rebuild to ensure safe output. Valid format: "axis" value pairs.
		if ( ! empty( $props['fontVariationSettings'] ) ) {
			$pairs       = explode( ',', $props['fontVariationSettings'] );
			$clean_pairs = array();
			foreach ( $pairs as $pair ) {
				$pair = trim( $pair );
				// Match a 4-char axis tag in quotes and a numeric value
				if ( preg_match( '/^"([a-zA-Z]{4})"\s+(-?[\d]+(?:\.[\d]+)?)$/', $pair, $m ) ) {
					$clean_pairs[] = '"' . $m[1] . '" ' . floatval( $m[2] );
				}
			}
			if ( ! empty( $clean_pairs ) ) {
				// No esc_attr() here: the pairs are rebuilt above from a strict
				// regex ([a-zA-Z]{4} tag + floatval), and HTML-escaping would
				// turn the required quotes into &quot; inside the <style> block,
				// invalidating the declaration.
				$css_rules[] = 'font-variation-settings: ' . implode( ', ', $clean_pairs );
			}
		}

		// Font size — fixed numeric px value. The current editors only produce
		// 'inherit' / 'responsive' / 'fit' states, but the REST API accepts any
		// value and legacy/external data may store plain px numbers.
		if ( isset( $props['fontSize'] ) && is_numeric( $props['fontSize'] ) && $props['fontSize'] > 0 ) {
			$css_rules[] = 'font-size: ' . intval( $props['fontSize'] ) . 'px';
		}

		// Font size (responsive clamp). Fit-to-width styles emit the same
		// clamp: it mirrors the fallback save.js writes for non-styleClass fit
		// blocks — per-line calc(...cqi) sizes on span.typost-line override it
		// in container-query-capable browsers, others get fluid sizing instead
		// of inheriting the theme size. For inline spans rendered by the
		// [data-style-id] selector, fit degrades to this clamp by design.
		if ( isset( $props['fontSize'] ) && in_array( $props['fontSize'], array( 'responsive', 'fit' ), true )
			&& isset( $props['fontSizeMin'], $props['fontSizePreferred'], $props['fontSizeMax'] ) ) {
			$min  = intval( $props['fontSizeMin'] );
			$pref = intval( $props['fontSizePreferred'] );
			$max  = intval( $props['fontSizeMax'] );
			$vw   = ( ( $max - $min ) / ( self::RESPONSIVE_FONT_MAX_VIEWPORT - self::RESPONSIVE_FONT_MIN_VIEWPORT ) ) * 100;

			$css_rules[] = sprintf(
				'font-size: clamp(%dpx, %srem + %svw, %dpx)',
				$min,
				round( $pref / 16, 4 ),
				round( $vw, 4 ),
				$max
			);
		}

		if ( empty( $css_rules ) ) {
			return '';
		}

		// Dual selector: block class + inline data attribute
		$selector = sprintf(
			".typost-ps-%d,\n.typost-styled[data-style-id=\"%d\"]",
			$id,
			$id
		);

		// Backward-compatible selectors for migrated legacy IDs
		if ( ! empty( $style['legacyId'] ) ) {
			$legacy    = esc_attr( $style['legacyId'] );
			$selector .= sprintf(
				",\n.typost-ps-%s,\n.typost-styled[data-style-id=\"%s\"]",
				$legacy,
				$legacy
			);
		}

		return sprintf(
			"%s {\n    %s;\n}",
			$selector,
			implode( ";\n    ", $css_rules )
		);
	}

	/**
	 * Generate all paragraph style CSS (cached).
	 *
	 * @return string Full CSS string for all styles.
	 */
	public function get_all_css() {
		$cached = get_transient( self::CSS_CACHE_KEY );
		if ( false !== $cached ) {
			return $cached;
		}

		$styles = $this->get_styles();
		if ( empty( $styles ) ) {
			return '';
		}

		$css_blocks = array();
		foreach ( $styles as $style ) {
			$block = $this->generate_style_css( $style );
			if ( $block ) {
				$css_blocks[] = $block;
			}
		}

		$css = implode( "\n\n", $css_blocks );
		set_transient( self::CSS_CACHE_KEY, $css, 12 * HOUR_IN_SECONDS );
		return $css;
	}

	/**
	 * Output paragraph style CSS in <style> block.
	 *
	 * Hooked to wp_head (priority 6, after font variables at 5).
	 */
	public function output_style_css() {
		$css = $this->get_all_css();
		if ( empty( $css ) ) {
			return;
		}

		echo "\n<style id=\"typost-paragraph-styles-css\">\n" . $css . "\n</style>\n"; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- CSS is generated exclusively from sanitized numeric/whitelisted values in generate_style_css().
	}

	/**
	 * Enqueue paragraph style CSS as inline style in the block editor.
	 *
	 * Uses enqueue_block_assets which works inside iframed editors (WP 6.x+).
	 * Only loads in admin/editor context to avoid double-loading on frontend.
	 */
	public function enqueue_editor_style_css() {
		if ( ! is_admin() ) {
			return;
		}

		$css = $this->get_all_css();
		if ( empty( $css ) ) {
			return;
		}

		// Register a dummy handle and attach inline CSS to it
		wp_register_style( 'typost-paragraph-styles-inline', false );
		wp_enqueue_style( 'typost-paragraph-styles-inline' );
		wp_add_inline_style( 'typost-paragraph-styles-inline', $css );
	}

	// -------------------------------------------------------------------------
	// Admin Tab
	// -------------------------------------------------------------------------

	/**
	 * Register the Paragraph Styles tab in admin settings.
	 *
	 * @param array $tabs Existing tabs.
	 * @return array Modified tabs.
	 */
	public function register_admin_tab( $tabs ) {
		$tabs[] = array(
			'id'       => 'paragraph-styles',
			'label'    => __( 'Paragraph Styles', 'typost-paragraph-styles' ),
			'priority' => 15,
		);
		return $tabs;
	}

	/**
	 * Render the Paragraph Styles admin tab content.
	 *
	 * @param object $instance The Typost instance.
	 */
	public function render_admin_tab( $instance ) {
		include TYPOST_PS_PLUGIN_DIR . 'includes/admin-tab.php';
	}

	// -------------------------------------------------------------------------
	// Editor Data
	// -------------------------------------------------------------------------

	/**
	 * Add paragraph styles to the editor localized data.
	 *
	 * @param array $data Existing editor data.
	 * @return array Modified editor data.
	 */
	public function add_editor_data( $data ) {
		$data['paragraphStyles']        = $this->get_styles();
		$data['paragraphStylesOptions'] = array(
			'toolbarButton' => $this->toolbar_button_enabled(),
		);
		return $data;
	}

	// -------------------------------------------------------------------------
	// Options tab setting
	// -------------------------------------------------------------------------

	/**
	 * Whether the direct-access toolbar button is enabled.
	 *
	 * Off by default: the styles dropdown already sits in the Inspector sidebar
	 * and both editor panels, so an extra toolbar button on upgrade would be
	 * unrequested.
	 *
	 * @since 1.2.0
	 * @return bool
	 */
	private function toolbar_button_enabled() {
		return (bool) get_option( self::TOOLBAR_OPTION, false );
	}

	/**
	 * Render the toolbar button setting into the core Options tab.
	 *
	 * @since 1.2.0
	 */
	public function render_options_row() {
		?>
		<tr>
			<th scope="row">
				<?php esc_html_e( 'Paragraph Styles Toolbar Button', 'typost-paragraph-styles' ); ?>
			</th>
			<td>
				<input
					type="checkbox"
					id="<?php echo esc_attr( self::TOOLBAR_OPTION ); ?>"
					name="<?php echo esc_attr( self::TOOLBAR_OPTION ); ?>"
					value="1"
					data-typost-option="1"
					<?php checked( $this->toolbar_button_enabled() ); ?>
				/>
				<label for="<?php echo esc_attr( self::TOOLBAR_OPTION ); ?>">
					<?php esc_html_e( 'Add a Paragraph Styles button to the Typography Stylist block toolbar', 'typost-paragraph-styles' ); ?>
				</label>
				<p class="description">
					<?php esc_html_e( 'Opens a browser showing every saved paragraph style rendered in its own typeface, so you can see a style before applying it. The styles dropdown in the sidebar and editor panels is unchanged.', 'typost-paragraph-styles' ); ?>
				</p>
			</td>
		</tr>
		<?php
	}

	/**
	 * Register the toolbar option so core's Options save persists it.
	 *
	 * @since 1.2.0
	 * @param array $options Registered option keys.
	 * @return array
	 */
	public function register_option_key( $options ) {
		$options[] = self::TOOLBAR_OPTION;
		return $options;
	}

	// -------------------------------------------------------------------------
	// REST API
	// -------------------------------------------------------------------------

	/**
	 * Register REST API routes for paragraph styles CRUD.
	 */
	public function register_rest_routes() {
		register_rest_route( self::REST_NAMESPACE, '/paragraph-styles', array(
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'rest_get_styles' ),
				'permission_callback' => array( $this, 'check_permissions' ),
			),
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( $this, 'rest_create_style' ),
				'permission_callback' => array( $this, 'check_permissions' ),
			),
		) );

		register_rest_route( self::REST_NAMESPACE, '/paragraph-styles/(?P<id>[\d]+)', array(
			array(
				'methods'             => 'PATCH',
				'callback'            => array( $this, 'rest_update_style' ),
				'permission_callback' => array( $this, 'check_permissions' ),
			),
			array(
				'methods'             => WP_REST_Server::DELETABLE,
				'callback'            => array( $this, 'rest_delete_style' ),
				'permission_callback' => array( $this, 'check_permissions' ),
			),
		) );
	}

	/**
	 * Permission check — matches core plugin's capability requirement.
	 *
	 * @return bool
	 */
	public function check_permissions() {
		return current_user_can( 'edit_posts' );
	}

	/**
	 * GET /paragraph-styles
	 *
	 * @return WP_REST_Response
	 */
	public function rest_get_styles() {
		return new WP_REST_Response( $this->get_styles(), 200 );
	}

	/**
	 * POST /paragraph-styles
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response
	 */
	public function rest_create_style( $request ) {
		$name       = trim( sanitize_text_field( $request->get_param( 'name' ) ) );
		$properties = $this->sanitize_properties( $request->get_param( 'properties' ) );

		if ( empty( $name ) ) {
			return new WP_REST_Response( array( 'message' => __( 'Style name is required.', 'typost-paragraph-styles' ) ), 400 );
		}

		$styles = $this->get_styles();

		$new_id = $this->get_next_id();

		$new_style = array(
			'id'         => $new_id,
			'name'       => $name,
			'created'    => current_time( 'Y-m-d' ),
			'modified'   => current_time( 'Y-m-d' ),
			'properties' => $properties,
		);

		$styles[] = $new_style;
		$this->save_styles( $styles );

		return new WP_REST_Response( $new_style, 201 );
	}

	/**
	 * PATCH /paragraph-styles/{id}
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response
	 */
	public function rest_update_style( $request ) {
		$id     = intval( $request['id'] );
		$styles = $this->get_styles();
		$index  = $this->find_style_index( $styles, $id );

		if ( false === $index ) {
			return new WP_REST_Response( array( 'message' => __( 'Style not found.', 'typost-paragraph-styles' ) ), 404 );
		}

		$name = $request->get_param( 'name' );
		if ( null !== $name ) {
			$name = trim( sanitize_text_field( $name ) );
			if ( empty( $name ) ) {
				return new WP_REST_Response( array( 'message' => __( 'Style name cannot be empty.', 'typost-paragraph-styles' ) ), 400 );
			}
			$styles[ $index ]['name'] = $name;
		}

		$properties = $request->get_param( 'properties' );
		if ( null !== $properties ) {
			$styles[ $index ]['properties'] = $this->sanitize_properties( $properties );
		}

		$styles[ $index ]['modified'] = current_time( 'Y-m-d' );
		$this->save_styles( $styles );

		return new WP_REST_Response( $styles[ $index ], 200 );
	}

	/**
	 * DELETE /paragraph-styles/{id}
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response
	 */
	public function rest_delete_style( $request ) {
		$id     = intval( $request['id'] );
		$styles = $this->get_styles();
		$index  = $this->find_style_index( $styles, $id );

		if ( false === $index ) {
			return new WP_REST_Response( array( 'message' => __( 'Style not found.', 'typost-paragraph-styles' ) ), 404 );
		}

		array_splice( $styles, $index, 1 );
		$this->save_styles( $styles );

		return new WP_REST_Response( array( 'deleted' => true ), 200 );
	}

	// -------------------------------------------------------------------------
	// Assets
	// -------------------------------------------------------------------------

	/**
	 * Enqueue editor JavaScript for both inline and block editors.
	 */
	public function enqueue_editor_assets() {
		// Pure logic shared with Jest tests (UMD-lite, exposed as window.typostPSUtils)
		wp_enqueue_script(
			'typost-paragraph-styles-utils',
			TYPOST_PS_PLUGIN_URL . 'assets/js/lib/ps-utils.js',
			array(),
			TYPOST_PS_VERSION,
			true
		);

		wp_enqueue_script(
			'typost-paragraph-styles-editor',
			TYPOST_PS_PLUGIN_URL . 'assets/js/editor.js',
			array( 'typost-block-editor', 'typost-paragraph-styles-utils', 'wp-element', 'wp-components', 'wp-i18n', 'wp-api-fetch' ),
			TYPOST_PS_VERSION,
			true
		);

		wp_set_script_translations( 'typost-paragraph-styles-editor', 'typost-paragraph-styles', TYPOST_PS_PLUGIN_DIR . 'languages' );
	}

	/**
	 * Enqueue admin JavaScript and CSS for the Paragraph Styles tab.
	 */
	public function enqueue_admin_assets() {
		wp_enqueue_script(
			'typost-paragraph-styles-admin',
			TYPOST_PS_PLUGIN_URL . 'assets/js/admin.js',
			array( 'jquery', 'wp-i18n' ),
			TYPOST_PS_VERSION,
			true
		);

		wp_set_script_translations( 'typost-paragraph-styles-admin', 'typost-paragraph-styles', TYPOST_PS_PLUGIN_DIR . 'languages' );

		wp_enqueue_style(
			'typost-paragraph-styles-admin',
			TYPOST_PS_PLUGIN_URL . 'assets/css/admin.css',
			array(),
			TYPOST_PS_VERSION
		);

		wp_localize_script( 'typost-paragraph-styles-admin', 'typostPSAdmin', array(
			'restUrl' => rest_url( self::REST_NAMESPACE . '/paragraph-styles' ),
			'nonce'   => wp_create_nonce( 'wp_rest' ),
		) );
	}

	// -------------------------------------------------------------------------
	// Cache
	// -------------------------------------------------------------------------

	/**
	 * Clear the paragraph styles data and CSS transient caches.
	 */
	public function clear_cache() {
		delete_transient( self::CACHE_KEY );
		delete_transient( self::CSS_CACHE_KEY );
	}

	// -------------------------------------------------------------------------
	// Data Access
	// -------------------------------------------------------------------------

	/**
	 * Get all paragraph styles (cached).
	 *
	 * @return array
	 */
	public function get_styles() {
		$cached = get_transient( self::CACHE_KEY );
		if ( false !== $cached ) {
			return $cached;
		}

		$styles = get_option( self::OPTION_KEY, array() );
		if ( ! is_array( $styles ) ) {
			$styles = array();
		}

		set_transient( self::CACHE_KEY, $styles, 12 * HOUR_IN_SECONDS );
		return $styles;
	}

	/**
	 * Save styles and refresh both data and CSS caches.
	 *
	 * @param array $styles The styles array to save.
	 */
	private function save_styles( $styles ) {
		// Re-index array to ensure sequential numeric keys
		$styles = array_values( $styles );
		update_option( self::OPTION_KEY, $styles );
		set_transient( self::CACHE_KEY, $styles, 12 * HOUR_IN_SECONDS );
		// Regenerate CSS cache
		delete_transient( self::CSS_CACHE_KEY );
	}

	/**
	 * Find the index of a style by ID.
	 *
	 * @param array $styles Styles array.
	 * @param int   $id     Style ID to find.
	 * @return int|false Index or false if not found.
	 */
	private function find_style_index( $styles, $id ) {
		foreach ( $styles as $i => $style ) {
			if ( isset( $style['id'] ) && intval( $style['id'] ) === intval( $id ) ) {
				return $i;
			}
		}
		return false;
	}

	/**
	 * Sanitize a properties array from user input.
	 *
	 * @param array|null $raw Raw properties from request.
	 * @return array Sanitized properties.
	 */
	private function sanitize_properties( $raw ) {
		if ( ! is_array( $raw ) ) {
			return array();
		}

		$clean = array();

		if ( isset( $raw['fontId'] ) ) {
			$clean['fontId'] = absint( $raw['fontId'] );
		}

		if ( isset( $raw['fontWeight'] ) ) {
			$clean['fontWeight'] = sanitize_text_field( $raw['fontWeight'] );
		}

		if ( isset( $raw['fontSize'] ) ) {
			$clean['fontSize'] = sanitize_text_field( $raw['fontSize'] );
		}

		if ( isset( $raw['fontSizeMin'] ) ) {
			$clean['fontSizeMin'] = absint( $raw['fontSizeMin'] );
		}

		if ( isset( $raw['fontSizePreferred'] ) ) {
			$clean['fontSizePreferred'] = absint( $raw['fontSizePreferred'] );
		}

		if ( isset( $raw['fontSizeMax'] ) ) {
			$clean['fontSizeMax'] = absint( $raw['fontSizeMax'] );
		}

		if ( isset( $raw['fitMaxSize'] ) ) {
			$clean['fitMaxSize'] = absint( $raw['fitMaxSize'] );
		}

		if ( isset( $raw['letterSpacing'] ) ) {
			$clean['letterSpacing'] = intval( $raw['letterSpacing'] );
		}

		if ( isset( $raw['lineHeight'] ) ) {
			$clean['lineHeight'] = floatval( $raw['lineHeight'] );
		}

		if ( isset( $raw['features'] ) && is_array( $raw['features'] ) ) {
			$clean['features'] = array_map( 'sanitize_key', $raw['features'] );
		}

		if ( ! empty( $raw['fontVariationSettings'] ) ) {
			$clean['fontVariationSettings'] = sanitize_text_field( $raw['fontVariationSettings'] );
		}

		return $clean;
	}
}

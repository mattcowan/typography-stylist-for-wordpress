<?php
/**
 * Typography Stylist - Variable Fonts module
 *
 * Variable font axis controls for Typography Stylist. Detects and exposes
 * variable font axes (wght, wdth, slnt, opsz, custom) with per-axis slider
 * controls in the editor.
 *
 * Structured like the Glyphs Panel module. This file intentionally has NO
 * plugin header and no plugins_loaded bootstrap — it is required from
 * typost_init() in typography-stylist.php, guarded by class_exists() so the
 * final class below can never fatally redeclare. The module keeps its own
 * text domain and consumes only core's public extension API.
 *
 * @since 2.1.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// Guarded like glyphs-panel, so re-entry can never redefine these.
if ( ! defined( 'TYPOST_VF_VERSION' ) ) {
	define( 'TYPOST_VF_VERSION', '1.3.1' );
	define( 'TYPOST_VF_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
	define( 'TYPOST_VF_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
}

/**
 * Typography Stylist - Variable Fonts
 *
 * Singleton class that hooks into Typography Stylist's extensibility system
 * to provide variable font axis detection and per-axis slider controls.
 */
final class Typost_Variable_Fonts {

	/** @var self|null */
	private static $instance = null;

	/** @var string Option key for storing per-font axes data */
	const OPTION_KEY = 'typost_variable_font_axes';

	/** @var string Option key for storing which fonts are marked as variable */
	const VARIABLE_FLAGS_KEY = 'typost_variable_font_flags';

	/** @var string Transient key for caching axes data */
	const CACHE_KEY = 'typost_vf_axes_cache';

	/** @var string REST namespace (shared with core plugin) */
	const REST_NAMESPACE = 'typost/v1';

	/** @var array Registered axis tag → human-readable name map */
	const REGISTERED_AXES = array(
		'wght' => 'Weight',
		'wdth' => 'Width',
		'slnt' => 'Slant',
		'opsz' => 'Optical Size',
		'ital' => 'Italic',
	);

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
		// Translations (own text domain, bundled languages dir).
		add_action( 'init', array( $this, 'load_textdomain' ) );

		// Admin tab.
		add_filter( 'typost_font_card_badges', array( $this, 'render_font_card_badge' ), 10, 3 );

		// Admin form injection — per-font variable font settings.
		add_action( 'typost_after_weight_checkboxes', array( $this, 'render_variable_font_admin_ui' ), 10, 2 );

		// Editor data.
		add_filter( 'typost_editor_data', array( $this, 'add_editor_data' ) );

		// REST routes.
		add_action( 'typost_register_rest_routes', array( $this, 'register_rest_routes' ) );

		// Assets.
		add_action( 'typost_editor_assets', array( $this, 'enqueue_editor_assets' ) );
		add_action( 'typost_admin_assets', array( $this, 'enqueue_admin_assets' ) );

		// Override parent plugin's success message.
		add_filter( 'typost_admin_localize_data', array( $this, 'filter_admin_strings' ) );

		// Cache clear.
		add_action( 'typost_cache_clear', array( $this, 'clear_cache' ) );

		// Font lifecycle hooks.
		add_action( 'typost_font_uploaded', array( $this, 'on_font_uploaded' ), 10, 1 );
		add_action( 'typost_font_deleted', array( $this, 'on_font_deleted' ), 10, 2 );
	}

	/**
	 * Load the module's translations.
	 *
	 * @since 1.1.0
	 */
	public function load_textdomain() {
		load_plugin_textdomain(
			'typost-variable-fonts',
			false,
			dirname( plugin_basename( __FILE__ ) ) . '/languages'
		);
	}

	// -------------------------------------------------------------------------
	// Data Access
	// -------------------------------------------------------------------------

	/**
	 * Get all axes data.
	 *
	 * @return array Associative array keyed by font string ID.
	 */
	public function get_all_axes() {
		$cached = get_transient( self::CACHE_KEY );
		if ( false !== $cached ) {
			return $cached;
		}

		$axes = get_option( self::OPTION_KEY, array() );
		if ( ! is_array( $axes ) ) {
			$axes = array();
		}

		set_transient( self::CACHE_KEY, $axes, 12 * HOUR_IN_SECONDS );
		return $axes;
	}

	/**
	 * Get axes for a specific font by string ID.
	 *
	 * @param string $font_id The font's string ID (e.g., 'kit-123-inter').
	 * @return array Array of axis definitions, or empty array.
	 */
	public function get_axes_for_font( $font_id ) {
		$all_axes = $this->get_all_axes();
		return isset( $all_axes[ $font_id ] ) ? $all_axes[ $font_id ] : array();
	}

	/**
	 * Save axes for a specific font.
	 *
	 * @param string $font_id The font's string ID.
	 * @param array  $axes    Array of axis definitions.
	 */
	public function save_axes_for_font( $font_id, $axes ) {
		$all_axes = get_option( self::OPTION_KEY, array() );
		if ( ! is_array( $all_axes ) ) {
			$all_axes = array();
		}

		if ( empty( $axes ) ) {
			unset( $all_axes[ $font_id ] );
		} else {
			$all_axes[ $font_id ] = $axes;
		}

		update_option( self::OPTION_KEY, $all_axes );
		$this->clear_cache();
	}

	/**
	 * Clear cached axes data.
	 */
	public function clear_cache() {
		delete_transient( self::CACHE_KEY );
	}

	/**
	 * Check if a font is marked as variable.
	 *
	 * @param string $font_id The font's string ID.
	 * @return bool
	 */
	public function is_font_variable( $font_id ) {
		$flags = get_option( self::VARIABLE_FLAGS_KEY, array() );
		if ( ! is_array( $flags ) ) {
			$flags = array();
		}

		// Support both legacy boolean and new array format when flag exists.
		if ( isset( $flags[ $font_id ] ) ) {
			return is_array( $flags[ $font_id ] )
				? ! empty( $flags[ $font_id ]['isVariable'] )
				: ! empty( $flags[ $font_id ] );
		}

		// Legacy fallback: if no flag is present, infer variability from stored axes.
		$axes = $this->get_axes_for_font( $font_id );
		if ( ! empty( $axes ) ) {
			// Migrate: store a simple boolean flag for this font to avoid repeated lookups.
			$flags[ $font_id ] = true;
			update_option( self::VARIABLE_FLAGS_KEY, $flags );
			return true;
		}

		return false;
	}

	/**
	 * Check if weight selection should be hidden for a font.
	 *
	 * When hideWeights is not explicitly set, a variable font hides the
	 * discrete weight UI by default: with a wght axis the slider replaces
	 * it, and without one the weight is fixed by the binary. An explicit
	 * admin toggle (stored flag) always wins.
	 *
	 * @param string $font_id The font's string ID.
	 * @return bool
	 */
	public function should_hide_weights( $font_id ) {
		if ( ! $this->is_font_variable( $font_id ) ) {
			return false;
		}

		$flags = get_option( self::VARIABLE_FLAGS_KEY, array() );
		if ( isset( $flags[ $font_id ] ) && is_array( $flags[ $font_id ] ) && isset( $flags[ $font_id ]['hideWeights'] ) ) {
			return (bool) $flags[ $font_id ]['hideWeights'];
		}

		return true;
	}

	/**
	 * Set variable font flags for a font.
	 *
	 * @param string    $font_id      The font's string ID.
	 * @param bool      $is_variable  Whether the font is variable.
	 * @param bool|null $hide_weights Whether to hide the weight checkboxes. Null = auto-detect.
	 */
	public function set_font_variable( $font_id, $is_variable, $hide_weights = null ) {
		$flags = get_option( self::VARIABLE_FLAGS_KEY, array() );
		if ( ! is_array( $flags ) ) {
			$flags = array();
		}

		if ( $is_variable ) {
			$font_flags = array( 'isVariable' => true );
			if ( null !== $hide_weights ) {
				$font_flags['hideWeights'] = (bool) $hide_weights;
			}
			$flags[ $font_id ] = $font_flags;
		} else {
			unset( $flags[ $font_id ] );
		}

		update_option( self::VARIABLE_FLAGS_KEY, $flags );
	}

	// -------------------------------------------------------------------------
	// Font Lifecycle Hooks
	// -------------------------------------------------------------------------

	/**
	 * Auto-detect variable font axes on upload.
	 *
	 * @param array $font_entries Array of newly uploaded font entry objects.
	 */
	public function on_font_uploaded( $font_entries ) {
		if ( ! is_array( $font_entries ) ) {
			return;
		}

		require_once TYPOST_VF_PLUGIN_DIR . 'includes/font-parser.php';

		foreach ( $font_entries as $entry ) {
			$axes = Typost_Font_Parser::find_and_parse_axes( $entry );
			if ( ! empty( $axes ) ) {
				$this->save_axes_for_font( $entry['id'], $axes );
				// Null = auto: variable fonts hide the discrete weight UI.
				$this->set_font_variable( $entry['id'], true, null );
			}
		}
	}

	/**
	 * Clean up axes data when a font is deleted.
	 *
	 * @param string $id        The deleted font's ID.
	 * @param array  $font_data The deleted font's data.
	 */
	public function on_font_deleted( $id, $font_data ) {
		$all_axes = get_option( self::OPTION_KEY, array() );
		if ( isset( $all_axes[ $id ] ) ) {
			unset( $all_axes[ $id ] );
			update_option( self::OPTION_KEY, $all_axes );
			$this->clear_cache();
		}
		$this->set_font_variable( $id, false );
	}

	// -------------------------------------------------------------------------
	// Admin Font Card Badge
	// -------------------------------------------------------------------------

	/**
	 * Append a "Variable" pill to the font card badges for variable fonts.
	 *
	 * Replaced the former read-only Variable Fonts admin tab: the same
	 * information now shows in context on each font's card, next to the
	 * source badge. Axes are managed in the font's edit form as before.
	 *
	 * @param string $badges HTML of extension badges accumulated so far.
	 * @param array  $font   The font entry being rendered.
	 * @param string $type   Card type: 'uploaded', 'adobe', 'manual', 'wplibrary'.
	 * @return string Badge HTML.
	 */
	public function render_font_card_badge( $badges, $font, $type ) {
		$string_id = '';
		if ( 'wplibrary' === $type ) {
			$string_id = isset( $font['slug'] ) ? 'wpl-' . $font['slug'] : '';
		} elseif ( isset( $font['id'] ) ) {
			$string_id = $font['id'];
		}

		if ( '' === $string_id || ! $this->is_font_variable( $string_id ) ) {
			return $badges;
		}

		$axes   = $this->get_axes_for_font( $string_id );
		$tags   = implode( ', ', array_filter( wp_list_pluck( $axes, 'tag' ) ) );
		$title  = $tags
			/* translators: %s: comma-separated list of variable font axis tags. */
			? sprintf( __( 'Variable font — axes: %s', 'typost-variable-fonts' ), $tags )
			: __( 'Configured as a variable font', 'typost-variable-fonts' );

		$badges .= sprintf(
			'<span class="typost-font-type-badge typost-badge-variable" title="%s">%s</span>',
			esc_attr( $title ),
			esc_html__( 'Variable', 'typost-variable-fonts' )
		);
		return $badges;
	}

	// -------------------------------------------------------------------------
	// Admin Form Injection — Per-Font Variable Font Settings
	// -------------------------------------------------------------------------

	/**
	 * Render variable font checkbox and axes configuration in font edit forms.
	 *
	 * Called via typost_after_weight_checkboxes hook, injected after weight
	 * checkboxes in all font edit forms (uploaded, Adobe, manual).
	 *
	 * @param array  $font   The font data array.
	 * @param string $prefix The font type prefix ('font', 'adobe', or 'manual').
	 */
	public function render_variable_font_admin_ui( $font, $prefix ) {
		$font_id      = isset( $font['id'] ) ? $font['id'] : '';
		$axes         = $this->get_axes_for_font( $font_id );
		$is_variable  = $this->is_font_variable( $font_id );
		$hide_weights = $this->should_hide_weights( $font_id );
		?>
		<div class="typost-vf-settings" data-font-id="<?php echo esc_attr( $font_id ); ?>" data-font-type="<?php echo esc_attr( $prefix ); ?>" data-hide-weights="<?php echo $hide_weights ? '1' : '0'; ?>">
			<div class="typost-form-field">
				<label class="typost-vf-toggle-label">
					<input
						type="checkbox"
						class="typost-vf-is-variable-checkbox"
						<?php checked( $is_variable ); ?>
					/>
					<?php esc_html_e( 'Variable Font', 'typost-variable-fonts' ); ?>
				</label>
				<p class="description"><?php esc_html_e( 'Enable to define variable font axes (weight, width, slant, etc.) with custom ranges.', 'typost-variable-fonts' ); ?></p>
			</div>

			<div class="typost-vf-axes-section" style="<?php echo $is_variable ? '' : 'display:none;'; ?>">
				<div class="typost-vf-axes-list">
					<?php if ( ! empty( $axes ) ) : ?>
						<?php foreach ( $axes as $axis ) : ?>
							<div class="typost-vf-axis-row">
								<input type="text" class="typost-vf-axis-tag" value="<?php echo esc_attr( $axis['tag'] ); ?>" placeholder="<?php esc_attr_e( 'Tag', 'typost-variable-fonts' ); ?>" aria-label="<?php esc_attr_e( 'Axis tag', 'typost-variable-fonts' ); ?>" maxlength="4" size="5" />
								<input type="text" class="typost-vf-axis-name" value="<?php echo esc_attr( $axis['name'] ); ?>" placeholder="<?php esc_attr_e( 'Name', 'typost-variable-fonts' ); ?>" aria-label="<?php esc_attr_e( 'Axis name', 'typost-variable-fonts' ); ?>" size="12" />
								<label class="typost-vf-axis-num-label"><?php esc_html_e( 'Min', 'typost-variable-fonts' ); ?>
									<input type="number" class="typost-vf-axis-min" value="<?php echo esc_attr( $axis['min'] ); ?>" step="any" size="6" />
								</label>
								<label class="typost-vf-axis-num-label"><?php esc_html_e( 'Max', 'typost-variable-fonts' ); ?>
									<input type="number" class="typost-vf-axis-max" value="<?php echo esc_attr( $axis['max'] ); ?>" step="any" size="6" />
								</label>
								<label class="typost-vf-axis-num-label"><?php esc_html_e( 'Default', 'typost-variable-fonts' ); ?>
									<input type="number" class="typost-vf-axis-default" value="<?php echo esc_attr( $axis['default'] ); ?>" step="any" size="6" />
								</label>
								<button type="button" class="button typost-vf-remove-axis" title="<?php esc_attr_e( 'Remove axis', 'typost-variable-fonts' ); ?>">&times;</button>
							</div>
						<?php endforeach; ?>
					<?php endif; ?>
				</div>
				<button type="button" class="button typost-vf-add-axis">
					<?php esc_html_e( '+ Add Axis', 'typost-variable-fonts' ); ?>
				</button>
				<?php
				// Uploaded kits can always be re-read server-side from their
				// own font files. Adobe projects and manual definitions point
				// at remote files, so they need the browser-side parser the
				// Glyphs Panel provides.
				$can_detect = ( 'font' === $prefix ) || class_exists( 'Typost_Glyphs_Panel' );
				?>
				<?php if ( $can_detect ) : ?>
					<div class="typost-vf-detect-field">
						<button type="button" class="button typost-vf-detect-axes">
							<?php esc_html_e( 'Detect Axes from Font File', 'typost-variable-fonts' ); ?>
						</button>
						<span class="typost-vf-detect-status" role="status" aria-live="polite"></span>
						<p class="description">
							<?php esc_html_e( 'Reads the axes back out of the font file and replaces every axis row above — any axis names, ranges, or defaults you set by hand are discarded. Nothing is stored until you save.', 'typost-variable-fonts' ); ?>
						</p>
					</div>
				<?php endif; ?>
				<div class="typost-vf-hide-weights-field">
					<label class="typost-vf-toggle-label">
						<input
							type="checkbox"
							class="typost-vf-hide-weights-checkbox"
							<?php checked( $hide_weights ); ?>
						/>
						<?php esc_html_e( 'Hide weight selection', 'typost-variable-fonts' ); ?>
					</label>
					<p class="description"><?php esc_html_e( 'Hide the standard weight checkboxes above. Auto-enabled when no wght axis is defined.', 'typost-variable-fonts' ); ?></p>
				</div>
			</div>
		</div>
		<?php
	}

	// -------------------------------------------------------------------------
	// Editor Data
	// -------------------------------------------------------------------------

	/**
	 * Add variable font axes and flags data to the editor data object.
	 *
	 * Builds variableFontAxes and variableFontFlags maps keyed by numeric
	 * font_id (matching how editors reference fonts via CSS variables).
	 * Flags carry isVariable plus a server-resolved hideWeights so the editor
	 * can hide the standard weight control for wght-less variable fonts.
	 *
	 * @param array $data The editor data array.
	 * @return array Modified data array.
	 */
	public function add_editor_data( $data ) {
		$all_axes  = $this->get_all_axes();
		$fonts_map = array(); // string id → numeric font_id

		if ( class_exists( 'Typost' ) ) {
			$typost = Typost::get_instance();

			foreach ( $typost->get_custom_fonts() as $font ) {
				if ( isset( $font['id'], $font['font_id'] ) ) {
					$fonts_map[ $font['id'] ] = $font['font_id'];
				}
			}
			foreach ( $typost->get_adobe_fonts() as $font ) {
				if ( isset( $font['id'], $font['font_id'] ) ) {
					$fonts_map[ $font['id'] ] = $font['font_id'];
				}
			}
			foreach ( $typost->get_manual_fonts() as $font ) {
				if ( isset( $font['id'], $font['font_id'] ) ) {
					$fonts_map[ $font['id'] ] = $font['font_id'];
				}
			}
			// Adopted WP Font Library fonts (core 2.1.0+): string ids "wpl-{slug}".
			if ( method_exists( $typost, 'font_sources' ) ) {
				foreach ( $typost->font_sources()->get_adopted_wp_fonts() as $font ) {
					if ( isset( $font['id'], $font['font_id'] ) ) {
						$fonts_map[ $font['id'] ] = $font['font_id'];
					}
				}
			}
		}

		$axes_by_numeric_id = array();
		foreach ( $all_axes as $string_id => $axes ) {
			if ( isset( $fonts_map[ $string_id ] ) ) {
				$axes_by_numeric_id[ (string) $fonts_map[ $string_id ] ] = $axes;
			}
		}

		// Per-font variable flags with hideWeights resolved server-side, so the
		// editor can suppress the standard weight control even when the font has
		// no wght axis (e.g. variable fonts exposing only custom axes).
		$flags_by_numeric_id = array();
		foreach ( $fonts_map as $string_id => $numeric_id ) {
			if ( $this->is_font_variable( $string_id ) ) {
				$flags_by_numeric_id[ (string) $numeric_id ] = array(
					'isVariable'  => true,
					'hideWeights' => $this->should_hide_weights( $string_id ),
				);
			}
		}

		$data['variableFontAxes']  = $axes_by_numeric_id;
		$data['variableFontFlags'] = $flags_by_numeric_id;
		return $data;
	}

	// -------------------------------------------------------------------------
	// REST API
	// -------------------------------------------------------------------------

	/**
	 * Register REST API routes.
	 */
	public function register_rest_routes() {
		register_rest_route( self::REST_NAMESPACE, '/variable-font-axes', array(
			'methods'             => 'GET',
			'callback'            => array( $this, 'rest_get_all_axes' ),
			'permission_callback' => array( $this, 'check_permissions' ),
		) );

		register_rest_route( self::REST_NAMESPACE, '/variable-font-axes/(?P<id>[a-zA-Z0-9_-]+)', array(
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'rest_get_axes' ),
				'permission_callback' => array( $this, 'check_permissions' ),
			),
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'rest_save_axes' ),
				'permission_callback' => array( $this, 'check_permissions' ),
			),
			array(
				'methods'             => 'DELETE',
				'callback'            => array( $this, 'rest_delete_axes' ),
				'permission_callback' => array( $this, 'check_permissions' ),
			),
		) );

		register_rest_route( self::REST_NAMESPACE, '/variable-font-axes/(?P<id>[a-zA-Z0-9_-]+)/redetect', array(
			'methods'             => 'POST',
			'callback'            => array( $this, 'rest_redetect_axes' ),
			'permission_callback' => array( $this, 'check_permissions' ),
		) );
	}

	/**
	 * Check REST API permissions.
	 *
	 * Deliberately manage_options (not the edit_posts used by core's font
	 * CRUD): axis definitions live in a site-wide option and change how
	 * fonts render everywhere, which is administrator configuration rather
	 * than per-author font picking.
	 *
	 * @return bool
	 */
	public function check_permissions() {
		return current_user_can( 'manage_options' );
	}

	/**
	 * REST: Get all axes data.
	 *
	 * @return WP_REST_Response
	 */
	public function rest_get_all_axes() {
		return rest_ensure_response( array(
			'success' => true,
			'axes'    => $this->get_all_axes(),
		) );
	}

	/**
	 * REST: Get axes for a specific font.
	 *
	 * @param WP_REST_Request $request REST request.
	 * @return WP_REST_Response
	 */
	public function rest_get_axes( $request ) {
		$id   = sanitize_key( $request->get_param( 'id' ) );
		$axes = $this->get_axes_for_font( $id );

		return rest_ensure_response( array(
			'success'     => true,
			'fontId'      => $id,
			'isVariable'  => $this->is_font_variable( $id ),
			'hideWeights' => $this->should_hide_weights( $id ),
			'axes'        => $axes,
		) );
	}

	/**
	 * REST: Re-read a font's axes from its font binary.
	 *
	 * Returns the detected axes without touching the stored option. The admin
	 * form repopulates its rows for review and the author still has to Save
	 * Changes, so a mis-click cannot destroy hand-tuned axis definitions.
	 *
	 * Only uploaded kit fonts can be re-detected server-side: Adobe projects
	 * and manual definitions reference remote files the server does not host,
	 * so those keep using the browser-side parser in admin.js.
	 *
	 * @param WP_REST_Request $request REST request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function rest_redetect_axes( $request ) {
		$id = sanitize_key( $request->get_param( 'id' ) );

		$entry = null;
		if ( class_exists( 'Typost' ) ) {
			foreach ( Typost::get_instance()->get_custom_fonts() as $font ) {
				if ( isset( $font['id'] ) && $font['id'] === $id ) {
					$entry = $font;
					break;
				}
			}
		}

		if ( null === $entry ) {
			return new WP_Error(
				'font_not_found',
				__( 'Axes can only be re-detected from uploaded font files.', 'typost-variable-fonts' ),
				array( 'status' => 404 )
			);
		}

		require_once TYPOST_VF_PLUGIN_DIR . 'includes/font-parser.php';

		return rest_ensure_response( array(
			'success' => true,
			'fontId'  => $id,
			'axes'    => Typost_Font_Parser::find_and_parse_axes( $entry ),
		) );
	}

	/**
	 * REST: Save axes for a specific font.
	 *
	 * @param WP_REST_Request $request REST request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function rest_save_axes( $request ) {
		$id     = sanitize_key( $request->get_param( 'id' ) );
		$params = $request->get_json_params();

		if ( ! isset( $params['axes'] ) || ! is_array( $params['axes'] ) ) {
			return new WP_Error(
				'missing_axes',
				__( 'Axes array is required', 'typost-variable-fonts' ),
				array( 'status' => 400 )
			);
		}

		$is_variable  = ! empty( $params['isVariable'] );
		$hide_weights = isset( $params['hideWeights'] ) ? (bool) $params['hideWeights'] : null;

		$sanitized_axes = array();
		foreach ( $params['axes'] as $raw_axis ) {
			$axis = $this->sanitize_axis( $raw_axis );
			if ( null !== $axis ) {
				$sanitized_axes[] = $axis;
			}
		}

		// When a font is explicitly marked non-variable, don't persist axes — stored
		// axes would make is_font_variable() re-infer it as variable on the next read,
		// silently undoing the disable (mirrors rest_delete_axes()).
		$this->save_axes_for_font( $id, $is_variable ? $sanitized_axes : array() );
		$this->set_font_variable( $id, $is_variable, $hide_weights );

		return rest_ensure_response( array(
			'success'     => true,
			'fontId'      => $id,
			'isVariable'  => $is_variable,
			'hideWeights' => $this->should_hide_weights( $id ),
			'axes'        => $sanitized_axes,
		) );
	}

	/**
	 * REST: Delete axes for a specific font.
	 *
	 * @param WP_REST_Request $request REST request.
	 * @return WP_REST_Response
	 */
	public function rest_delete_axes( $request ) {
		$id = sanitize_key( $request->get_param( 'id' ) );
		$this->save_axes_for_font( $id, array() );
		$this->set_font_variable( $id, false );

		return rest_ensure_response( array(
			'success' => true,
			'fontId'  => $id,
		) );
	}

	/**
	 * Sanitize a single axis definition.
	 *
	 * @param array $raw Raw axis data.
	 * @return array|null Sanitized axis, or null if invalid.
	 */
	private function sanitize_axis( $raw ) {
		if ( ! is_array( $raw ) ) {
			return null;
		}

		// OpenType tags: 4 alphanumeric chars. Registered axes lowercase, custom uppercase.
		$tag = preg_replace( '/[^a-zA-Z0-9]/', '', substr( isset( $raw['tag'] ) ? $raw['tag'] : '', 0, 4 ) );
		if ( strlen( $tag ) !== 4 ) {
			return null;
		}

		$min     = floatval( isset( $raw['min'] ) ? $raw['min'] : 0 );
		$max     = floatval( isset( $raw['max'] ) ? $raw['max'] : 1000 );
		$default = floatval( isset( $raw['default'] ) ? $raw['default'] : 400 );

		// Enforce min <= max.
		if ( $min > $max ) {
			$tmp = $min;
			$min = $max;
			$max = $tmp;
		}

		// Clamp default within [min, max].
		$default = max( $min, min( $max, $default ) );

		return array(
			'tag'     => $tag,
			'name'    => sanitize_text_field( isset( $raw['name'] ) ? $raw['name'] : '' ),
			'min'     => $min,
			'max'     => $max,
			'default' => $default,
		);
	}

	// -------------------------------------------------------------------------
	// Assets
	// -------------------------------------------------------------------------

	/**
	 * Enqueue editor JavaScript.
	 */
	public function enqueue_editor_assets() {
		wp_enqueue_script(
			'typost-variable-fonts-utils',
			TYPOST_VF_PLUGIN_URL . 'assets/js/lib/variation-utils.js',
			array(),
			TYPOST_VF_VERSION,
			true
		);

		wp_enqueue_script(
			'typost-variable-fonts-editor',
			TYPOST_VF_PLUGIN_URL . 'assets/js/editor.js',
			array( 'typost-variable-fonts-utils', 'typost-block-editor', 'wp-element', 'wp-components', 'wp-i18n' ),
			TYPOST_VF_VERSION,
			true
		);

		wp_set_script_translations(
			'typost-variable-fonts-editor',
			'typost-variable-fonts',
			TYPOST_VF_PLUGIN_DIR . 'languages'
		);

		wp_enqueue_style(
			'typost-variable-fonts-editor',
			TYPOST_VF_PLUGIN_URL . 'assets/css/editor.css',
			array(),
			TYPOST_VF_VERSION
		);
	}

	/**
	 * Override parent plugin's admin localized strings.
	 *
	 * @param array $data Admin data array.
	 * @return array
	 */
	public function filter_admin_strings( $data ) {
		if ( isset( $data['strings'] ) ) {
			$data['strings']['fallbacksUpdated'] = esc_html__( 'Settings saved successfully! Reloading page...', 'typost-variable-fonts' );
		}
		return $data;
	}

	/**
	 * Enqueue admin JavaScript and CSS.
	 */
	public function enqueue_admin_assets() {
		wp_enqueue_script(
			'typost-variable-fonts-utils',
			TYPOST_VF_PLUGIN_URL . 'assets/js/lib/variation-utils.js',
			array(),
			TYPOST_VF_VERSION,
			true
		);

		$admin_deps = array( 'jquery', 'wp-i18n', 'typost-variable-fonts-utils' );

		// Axis auto-detection reuses the Glyphs Panel's font loader (vendored
		// opentype.js + wawoff2). The module enqueues its lib chain on the same
		// typost_admin_assets hook, so the handle resolves at print time.
		if ( class_exists( 'Typost_Glyphs_Panel' ) ) {
			$admin_deps[] = 'typost-glyphs-font-loader';
		}

		wp_enqueue_script(
			'typost-variable-fonts-admin',
			TYPOST_VF_PLUGIN_URL . 'assets/js/admin.js',
			$admin_deps,
			TYPOST_VF_VERSION,
			true
		);

		wp_set_script_translations(
			'typost-variable-fonts-admin',
			'typost-variable-fonts',
			TYPOST_VF_PLUGIN_DIR . 'languages'
		);

		wp_localize_script( 'typost-variable-fonts-admin', 'typostVFAdmin', array(
			'restUrl' => rest_url( self::REST_NAMESPACE . '/variable-font-axes/' ),
			'nonce'   => wp_create_nonce( 'wp_rest' ),
			'registeredAxes' => self::REGISTERED_AXES,
		) );

		wp_enqueue_style(
			'typost-variable-fonts-admin',
			TYPOST_VF_PLUGIN_URL . 'assets/css/admin.css',
			array(),
			TYPOST_VF_VERSION
		);
	}
}

// No bootstrap: instantiated from typost_init() in typography-stylist.php.

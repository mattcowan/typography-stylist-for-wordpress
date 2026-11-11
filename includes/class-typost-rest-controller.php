<?php
/**
 * REST API routes and handlers for Typography Stylist (typost/v1)
 *
 * Registers the core plugin's routes, holds their handlers and applies the
 * write-request rate limit. Extracted from the Typost class (#360). Typost
 * keeps every public method (the route callbacks, check_permissions(),
 * register_rest_routes(), enforce_rest_rate_limit()) as a delegating wrapper,
 * and the routes still name those Typost methods as their callbacks, so code
 * that reads or replaces a route's callback sees what it saw before.
 *
 * @internal Reach these handlers through Typost's public methods.
 * @since 2.4.0
 */

if (!defined('ABSPATH')) {
    exit;
}

class Typost_Rest_Controller {

    /**
     * The plugin instance whose methods the routes name as callbacks.
     *
     * @var Typost
     */
    private $typost;

    /**
     * Requests already counted by the REST write limit. A route that uses
     * check_permissions() reaches the counter twice (permission callback,
     * then rest_dispatch_request) and must be counted once. SplObjectStorage
     * holds each request, so a freed request cannot pass its object ID on to
     * a later one (spl_object_id() values are reused, e.g. in /batch/v1).
     *
     * One controller exists per Typost instance, so both paths share it.
     *
     * @var SplObjectStorage|null
     */
    private $rate_limited_requests = null;

    /**
     * @param Typost $typost Plugin instance.
     */
    public function __construct($typost) {
        $this->typost = $typost;
    }

    /**
     * Register REST API routes
     */
    public function register_rest_routes() {
        register_rest_route('typost/v1', '/presets', array(
            'methods' => 'GET',
            'callback' => array($this->typost, 'get_presets_endpoint'),
            'permission_callback' => array($this->typost, 'check_permissions')
        ));

        register_rest_route('typost/v1', '/presets', array(
            'methods' => 'POST',
            'callback' => array($this->typost, 'save_preset_endpoint'),
            'permission_callback' => array($this->typost, 'check_permissions')
        ));

        register_rest_route('typost/v1', '/presets/(?P<id>[a-zA-Z0-9_-]+)', array(
            'methods' => 'DELETE',
            'callback' => array($this->typost, 'delete_preset_endpoint'),
            'permission_callback' => array($this->typost, 'check_permissions')
        ));

        // Add features endpoint
        register_rest_route('typost/v1', '/features', array(
            'methods' => 'GET',
            'callback' => array($this->typost, 'get_features_endpoint'),
            'permission_callback' => array($this->typost, 'check_permissions')
        ));

        register_rest_route('typost/v1', '/fonts', array(
            'methods' => 'GET',
            'callback' => array($this->typost, 'get_fonts_endpoint'),
            'permission_callback' => array($this->typost, 'check_permissions')
        ));

        register_rest_route('typost/v1', '/fonts', array(
            'methods' => 'POST',
            'callback' => array($this->typost, 'upload_font_endpoint'),
            'permission_callback' => function() {
                return current_user_can('upload_files');
            }
        ));

        register_rest_route('typost/v1', '/fonts/(?P<id>[a-zA-Z0-9_-]+)', array(
            'methods' => 'DELETE',
            'callback' => array($this->typost, 'delete_font_endpoint'),
            'permission_callback' => function() {
                return current_user_can('upload_files');
            }
        ));

        // Adobe Fonts endpoints
        register_rest_route('typost/v1', '/adobe-fonts', array(
            'methods' => 'GET',
            'callback' => array($this->typost, 'get_adobe_fonts_endpoint'),
            'permission_callback' => array($this->typost, 'check_permissions')
        ));

        register_rest_route('typost/v1', '/adobe-fonts', array(
            'methods' => 'POST',
            'callback' => array($this->typost, 'add_adobe_font_endpoint'),
            'permission_callback' => function() {
                return current_user_can('upload_files');
            }
        ));

        register_rest_route('typost/v1', '/adobe-fonts/(?P<id>[a-zA-Z0-9_-]+)', array(
            'methods' => 'DELETE',
            'callback' => array($this->typost, 'delete_adobe_font_endpoint'),
            'permission_callback' => function() {
                return current_user_can('upload_files');
            }
        ));

        register_rest_route('typost/v1', '/adobe-fonts/(?P<id>[a-zA-Z0-9_-]+)/fallback', array(
            'methods' => 'PATCH',
            'callback' => array($this->typost, 'update_adobe_font_fallback_endpoint'),
            'permission_callback' => function() {
                return current_user_can('upload_files');
            }
        ));

        register_rest_route('typost/v1', '/adobe-fonts/(?P<id>[a-zA-Z0-9_-]+)/load-on-all-pages', array(
            'methods' => 'PATCH',
            'callback' => array($this->typost, 'update_adobe_font_load_on_all_pages_endpoint'),
            'permission_callback' => function() {
                return current_user_can('upload_files');
            }
        ));

        // Manual fonts endpoints
        register_rest_route('typost/v1', '/manual-fonts', array(
            'methods' => 'GET',
            'callback' => array($this->typost, 'get_manual_fonts_endpoint'),
            'permission_callback' => array($this->typost, 'check_permissions')
        ));

        register_rest_route('typost/v1', '/manual-fonts', array(
            'methods' => 'POST',
            'callback' => array($this->typost, 'add_manual_font_endpoint'),
            'permission_callback' => function() {
                return current_user_can('edit_posts');
            }
        ));

        register_rest_route('typost/v1', '/manual-fonts/(?P<id>[a-zA-Z0-9_-]+)', array(
            'methods' => 'DELETE',
            'callback' => array($this->typost, 'delete_manual_font_endpoint'),
            'permission_callback' => function() {
                return current_user_can('edit_posts');
            }
        ));

        register_rest_route('typost/v1', '/manual-fonts/(?P<id>[a-zA-Z0-9_-]+)', array(
            'methods' => 'PATCH',
            'callback' => array($this->typost, 'update_manual_font_endpoint'),
            'permission_callback' => function() {
                return current_user_can('edit_posts');
            }
        ));

        // Fallback endpoint for uploaded fonts
        register_rest_route('typost/v1', '/fonts/(?P<id>[a-zA-Z0-9_-]+)/fallback', array(
            'methods' => 'PATCH',
            'callback' => array($this->typost, 'update_font_fallback_endpoint'),
            'permission_callback' => function() {
                return current_user_can('upload_files');
            }
        ));

        // Load on all pages endpoint for uploaded fonts
        register_rest_route('typost/v1', '/fonts/(?P<id>[a-zA-Z0-9_-]+)/load-on-all-pages', array(
            'methods' => 'PATCH',
            'callback' => array($this->typost, 'update_font_load_on_all_pages_endpoint'),
            'permission_callback' => function() {
                return current_user_can('upload_files');
            }
        ));

        // Bulk auto-detect available weights for fonts that predate weight
        // detection (entries without the available_weights key). upload_files
        // matches the per-font weight-save (fallback) endpoints.
        register_rest_route('typost/v1', '/fonts/detect-weights/bulk', array(
            'methods' => 'POST',
            'callback' => array($this->typost, 'bulk_detect_weights_endpoint'),
            'permission_callback' => function() {
                return current_user_can('upload_files');
            }
        ));

        // WP Font Library registration endpoints (site-wide configuration,
        // hence manage_options rather than the edit_posts used for font CRUD)
        register_rest_route('typost/v1', '/fonts/wp-library/bulk', array(
            'methods' => 'POST',
            'callback' => array($this->typost, 'bulk_register_fonts_in_library_endpoint'),
            'permission_callback' => function() {
                return current_user_can('manage_options');
            }
        ));

        // Adopt a WP Font Library font for editor use (allocates a font_id).
        // edit_posts: authors pick fonts, matching the other editor-facing
        // font endpoints.
        register_rest_route('typost/v1', '/wp-fonts/adopt', array(
            'methods' => 'POST',
            'callback' => array($this->typost, 'adopt_wp_font_endpoint'),
            'permission_callback' => function() {
                return current_user_can('edit_posts');
            }
        ));

        register_rest_route('typost/v1', '/fonts/wp-library/dismiss-notice', array(
            'methods' => 'POST',
            'callback' => array($this->typost, 'dismiss_wp_library_notice_endpoint'),
            'permission_callback' => function() {
                return current_user_can('manage_options');
            }
        ));

        register_rest_route('typost/v1', '/fonts/(?P<id>[a-zA-Z0-9_-]+)/wp-library', array(
            'methods' => 'POST',
            'callback' => array($this->typost, 'register_font_in_library_endpoint'),
            'permission_callback' => function() {
                return current_user_can('manage_options');
            }
        ));

        register_rest_route('typost/v1', '/fonts/(?P<id>[a-zA-Z0-9_-]+)/wp-library', array(
            'methods' => 'DELETE',
            'callback' => array($this->typost, 'unregister_font_from_library_endpoint'),
            'permission_callback' => function() {
                return current_user_can('manage_options');
            }
        ));

        // Font replacement endpoints
        register_rest_route('typost/v1', '/font-replacements', array(
            'methods' => 'GET',
            'callback' => array($this->typost, 'get_font_replacements_endpoint'),
            'permission_callback' => array($this->typost, 'check_permissions')
        ));

        register_rest_route('typost/v1', '/font-replacements', array(
            'methods' => 'POST',
            'callback' => array($this->typost, 'add_font_replacement_endpoint'),
            'permission_callback' => function() {
                return current_user_can('edit_posts');
            }
        ));

        register_rest_route('typost/v1', '/font-replacements/(?P<id>\d+)', array(
            'methods' => 'PATCH',
            'callback' => array($this->typost, 'update_font_replacement_endpoint'),
            'permission_callback' => function() {
                return current_user_can('edit_posts');
            }
        ));

        register_rest_route('typost/v1', '/font-replacements/(?P<id>\d+)', array(
            'methods' => 'DELETE',
            'callback' => array($this->typost, 'delete_font_replacement_endpoint'),
            'permission_callback' => function() {
                return current_user_can('edit_posts');
            }
        ));

        register_rest_route('typost/v1', '/font-replacements/orphans', array(
            'methods' => 'GET',
            'callback' => array($this->typost, 'get_unassigned_fonts_endpoint'),
            'permission_callback' => array($this->typost, 'check_permissions')
        ));

        // Font display order endpoints
        register_rest_route('typost/v1', '/font-order', array(
            'methods'             => 'GET',
            'callback'            => array($this->typost, 'rest_get_font_order'),
            'permission_callback' => array($this->typost, 'check_permissions'),
        ));
        register_rest_route('typost/v1', '/font-order', array(
            'methods'             => 'POST',
            'callback'            => array($this->typost, 'rest_update_font_order'),
            'permission_callback' => array($this->typost, 'check_permissions'),
        ));

        // Font feature visibility endpoints
        register_rest_route('typost/v1', '/font-feature-visibility', array(
            'methods'             => 'GET',
            'callback'            => array($this->typost, 'rest_get_font_feature_visibility'),
            'permission_callback' => array($this->typost, 'check_permissions'),
        ));
        register_rest_route('typost/v1', '/font-feature-visibility/(?P<font_id>\d+)', array(
            'methods'             => 'POST',
            'callback'            => array($this->typost, 'rest_update_font_feature_visibility'),
            'permission_callback' => array($this->typost, 'check_permissions'),
            'args'                => array(
                'font_id' => array(
                    'validate_callback' => function($param) {
                        return is_numeric($param) && (int) $param > 0;
                    },
                ),
            ),
        ));

        // Admin settings page AJAX endpoints. The settings page itself is
        // manage_options-only, so its endpoints are too.
        register_rest_route('typost/v1', '/admin/refresh', array(
            'methods'             => 'GET',
            'callback'            => array($this->typost, 'rest_get_admin_refresh'),
            'permission_callback' => function() {
                return current_user_can('manage_options');
            },
        ));

        register_rest_route('typost/v1', '/admin/options', array(
            'methods'             => 'POST',
            'callback'            => array($this->typost, 'rest_save_admin_options'),
            'permission_callback' => function() {
                return current_user_can('manage_options');
            },
        ));

        register_rest_route('typost/v1', '/admin/accessibility', array(
            'methods'             => 'POST',
            'callback'            => array($this->typost, 'rest_save_accessibility_options'),
            'permission_callback' => function() {
                return current_user_can('manage_options');
            },
        ));

        register_rest_route('typost/v1', '/admin/clear-cache', array(
            'methods'             => 'POST',
            'callback'            => array($this->typost, 'rest_clear_font_cache'),
            'permission_callback' => function() {
                return current_user_can('manage_options');
            },
        ));

        // Export and import (#205)
        $this->typost->export()->register_rest_routes();

        /**
         * Fires after core REST API routes are registered.
         *
         * Allows extension plugins to register their own REST API routes under
         * the typost/v1 namespace. Extensions can reuse Typost::check_permissions()
         * for authorization and rate limiting.
         *
         * @since 2.0.0
         */
        do_action('typost_register_rest_routes');
    }

    /**
     * Check REST API permissions with rate limiting
     *
     * Extensions can still use this callback in their own namespace and get
     * the write limit; routes in typost/v1 are also limited centrally by
     * enforce_rest_rate_limit(), and a request is never counted twice.
     *
     * @param WP_REST_Request|null $request Request, or null for a plain capability check.
     * @return true|false|WP_Error
     */
    public function check_permissions($request = null) {
        // Check capability
        if (!current_user_can('edit_posts')) {
            return false;
        }

        return $this->consume_rate_limit($request);
    }

    /**
     * Apply the REST write limit to every route in the typost/v1 namespace.
     *
     * Hooked to rest_dispatch_request, which WordPress runs only after the
     * route's permission callback has passed. So it counts authorized write
     * requests only, whatever capability the route checks (edit_posts,
     * upload_files, manage_options). Before this, only routes that used
     * check_permissions() were limited, which left font uploads, Adobe
     * projects, custom fonts, replacements and the Font Library routes
     * without a limit.
     *
     * @since 2.3.2
     * @param mixed           $result  Dispatch result from an earlier filter; null to continue.
     * @param WP_REST_Request $request Request.
     * @param string          $route   Matched route, e.g. /typost/v1/fonts.
     * @param array           $handler Route handler (unused).
     * @return mixed The earlier result, null to continue, or a 429 WP_Error.
     */
    public function enforce_rest_rate_limit($result, $request, $route, $handler) {
        unset($handler);
        if (null !== $result || !is_string($route) || 0 !== strpos($route, '/typost/v1/')) {
            return $result;
        }

        $limited = $this->consume_rate_limit($request);

        return is_wp_error($limited) ? $limited : $result;
    }

    /**
     * REST endpoint: Get presets
     */
    public function get_presets_endpoint($request) {
        return rest_ensure_response($this->typost->get_presets());
    }

    /**
     * REST endpoint: Get features
     */
    public function get_features_endpoint($request) {
        return rest_ensure_response($this->typost->get_available_features());
    }

    /**
     * REST endpoint: Save preset
     */
    public function save_preset_endpoint($request) {
        $params = $request->get_json_params();

        // Validate required parameters
        if (empty($params['id']) || empty($params['name']) || empty($params['features'])) {
            return new WP_Error('missing_params', esc_html__('Missing required parameters', 'typography-stylist'), array('status' => 400));
        }

        if (!is_array($params['features']) || count($params['features']) === 0) {
            return new WP_Error('invalid_features', esc_html__('Features must be a non-empty array', 'typography-stylist'), array('status' => 400));
        }

        // Validate feature IDs
        $available_features = array_column($this->typost->get_available_features(), 'id');
        foreach ($params['features'] as $feature) {
            if (!in_array($feature, $available_features, true)) {
                /* translators: %s: The invalid OpenType feature ID */
                return new WP_Error('invalid_feature_id', sprintf(esc_html__('Invalid feature ID: %s', 'typography-stylist'), esc_html($feature)), array('status' => 400));
            }
        }

        $new_preset = array(
            'id' => sanitize_key($params['id']),
            'name' => sanitize_text_field($params['name']),
            'features' => array_map('sanitize_key', $params['features']),
            'description' => isset($params['description']) ? sanitize_text_field($params['description']) : ''
        );

        $presets = $this->typost->get_presets();
        $presets[] = $new_preset;
        update_option('typost_presets', $presets);

        // Clear cache
        $this->typost->clear_caches();

        return rest_ensure_response(array('success' => true, 'preset' => $new_preset));
    }

    /**
     * REST endpoint: Delete preset
     */
    public function delete_preset_endpoint($request) {
        $id = sanitize_key($request->get_param('id'));
        $presets = $this->typost->get_presets();

        // More efficient: find and unset by key
        $found = false;
        foreach ($presets as $key => $preset) {
            if ($preset['id'] === $id) {
                unset($presets[$key]);
                $found = true;
                break; // Stop once found
            }
        }

        if (!$found) {
            return new WP_Error(
                'preset_not_found',
                esc_html__('Preset not found', 'typography-stylist'),
                array('status' => 404)
            );
        }

        update_option('typost_presets', array_values($presets));
        $this->typost->clear_caches();

        return rest_ensure_response(array('success' => true));
    }

    /**
     * REST callback: GET /font-feature-visibility
     *
     * @since 2.0.0
     */
    public function rest_get_font_feature_visibility() {
        return rest_ensure_response($this->typost->get_font_feature_visibility());
    }

    /**
     * REST callback: POST /font-feature-visibility/{font_id}
     *
     * Expects JSON body: { "disabled_features": ["ss15", "ornm"] }
     * An empty array means all features are enabled for this font.
     *
     * @since 2.0.0
     * @param WP_REST_Request $request
     */
    public function rest_update_font_feature_visibility(WP_REST_Request $request) {
        $font_id  = (int) $request->get_param('font_id');
        $body     = $request->get_json_params();

        if (!isset($body['disabled_features']) || !is_array($body['disabled_features'])) {
            return new WP_Error(
                'invalid_params',
                esc_html__('disabled_features must be an array.', 'typography-stylist'),
                array('status' => 400)
            );
        }

        // Validate each feature ID against the known feature list
        $valid_ids  = array_column($this->typost->get_available_features(), 'id');
        $sanitized  = array();
        foreach ($body['disabled_features'] as $fid) {
            $fid = sanitize_key($fid);
            if (in_array($fid, $valid_ids, true)) {
                $sanitized[] = $fid;
            }
        }

        $visibility          = $this->typost->get_font_feature_visibility();
        $visibility[$font_id] = array('disabled_features' => $sanitized);
        update_option('typost_font_feature_visibility', $visibility);

        // Bust the editor data cache for all users — feature visibility is global
        $this->typost->invalidate_editor_data_cache();

        return rest_ensure_response(array(
            'success'  => true,
            'font_id'  => $font_id,
            'disabled_features' => $sanitized,
        ));
    }

    /**
     * REST callback: GET /font-order
     *
     * @since 2.0.0
     */
    public function rest_get_font_order() {
        return rest_ensure_response($this->typost->get_font_order());
    }

    /**
     * REST callback: POST /font-order
     *
     * Expects JSON body: { "order": ["font-12", "adobe-34", "manual-56"] }
     *
     * @since 2.0.0
     * @param WP_REST_Request $request
     */
    public function rest_update_font_order(WP_REST_Request $request) {
        $body = $request->get_json_params();

        if (!isset($body['order']) || !is_array($body['order'])) {
            return new WP_Error(
                'invalid_params',
                esc_html__('order must be an array.', 'typography-stylist'),
                array('status' => 400)
            );
        }

        // Sanitize each key — allow alphanumeric, hyphens only
        $sanitized = array();
        foreach ($body['order'] as $key) {
            $key = sanitize_text_field((string) $key);
            // font/adobe/manual keys use numeric IDs; wpl keys use slugs (alphanumeric + hyphens)
            if (preg_match('/^(font|adobe|manual)-\d+$/', $key) || preg_match('/^wpl-[a-z0-9][a-z0-9\-]*$/', $key)) {
                $sanitized[] = $key;
            }
        }

        update_option('typost_font_order', $sanitized);

        // Bust the editor data cache for all users — font order is global
        $this->typost->invalidate_editor_data_cache();

        return rest_ensure_response(array(
            'success' => true,
            'order'   => $sanitized,
        ));
    }

    /**
     * REST callback: GET /admin/refresh
     *
     * Returns re-rendered admin page fragments plus refreshed font data so
     * the settings page can update in place after font changes instead of
     * reloading. HTML fragments are produced by the same template functions
     * the page itself uses, so extension hooks (badges, per-font settings)
     * render identically.
     *
     * @since 2.3.0
     */
    public function rest_get_admin_refresh() {
        require_once TYPOST_PLUGIN_DIR . 'includes/admin-page.php';

        $custom_fonts = get_option('typost_custom_fonts', array());
        $adobe_fonts  = $this->typost->get_adobe_fonts();
        $manual_fonts = $this->typost->get_manual_fonts();

        ob_start();
        typost_render_font_list_section($this->typost, $custom_fonts, $adobe_fonts, $manual_fonts);
        $font_list_html = ob_get_clean();

        ob_start();
        typost_render_preview_font_options($this->typost, $custom_fonts, $adobe_fonts, $manual_fonts);
        $preview_options_html = ob_get_clean();

        // No Adobe kit URLs: the page loads a kit when an element that uses
        // it comes into view, from the refreshed adobeFonts data (#226).
        return rest_ensure_response(array(
            'fontListHtml'          => $font_list_html,
            'previewOptionsHtml'    => $preview_options_html,
            'fonts'                 => $this->typost->get_custom_fonts(),
            'adobeFonts'            => $adobe_fonts,
            'manualFonts'           => $manual_fonts,
            'fontFeatureVisibility' => $this->typost->get_font_feature_visibility(),
            'fontOrder'             => $this->typost->get_font_order(),
            'wpFontLibraryFonts'    => $this->typost->get_wp_font_library_fonts(),
            'fontVariablesCss'      => $this->typost->get_font_css_variables(),
            'adminFontCss'          => $this->typost->get_admin_font_css(),
        ));
    }

    /**
     * REST callback: POST /admin/options
     *
     * AJAX counterpart of the Options tab form. Mirrors the POST handler in
     * render_admin_page() (which remains as the no-JavaScript fallback).
     *
     * @since 2.3.0
     * @param WP_REST_Request $request
     */
    public function rest_save_admin_options(WP_REST_Request $request) {
        // Typost_Admin_Options::sanitize() is shared with the POST fallback
        // and import. Clients may send real booleans (JSON) or strings like
        // "false"/"0" (form-encoded), which are truthy in PHP.
        update_option('typost_show_clear_confirmation', Typost_Admin_Options::sanitize('typost_show_clear_confirmation', $request->get_param('show_clear_confirmation')));
        update_option('typost_archive_full_content_check', Typost_Admin_Options::sanitize('typost_archive_full_content_check', $request->get_param('archive_full_content_check')));

        // Only save when the client actually sent the value. A browser holding a
        // cached copy of admin-page.js from before this option existed would post
        // without the field, and an unguarded write would read that absence as
        // "unchecked" and silently turn the default off.
        if (null !== $request->get_param('block_enter_line_break')) {
            update_option('typost_block_enter_line_break', Typost_Admin_Options::sanitize('typost_block_enter_line_break', $request->get_param('block_enter_line_break')));
        }

        // Same "only save what the client sent" rule (#248)
        if (null !== $request->get_param('new_font_sizes_px')) {
            update_option('typost_new_font_sizes_px', Typost_Admin_Options::sanitize('typost_new_font_sizes_px', $request->get_param('new_font_sizes_px')));
        }

        // Checkbox rendered only when the Font Library is available; only
        // save when the client actually sent the value.
        if ($this->typost->font_library_bridge()->is_available() && null !== $request->get_param('auto_register_wp_fonts')) {
            update_option('typost_auto_register_wp_fonts', Typost_Admin_Options::sanitize('typost_auto_register_wp_fonts', $request->get_param('auto_register_wp_fonts')));
        }

        // Extension-registered checkbox options (see typost_admin_options_rows).
        // Keyed by the full option name, which is also the form field name.
        // Same "only save what the client sent" rule as above.
        foreach ($this->typost->get_extension_option_checkboxes() as $option_key) {
            if (null !== $request->get_param($option_key)) {
                update_option($option_key, Typost_Admin_Options::sanitize($option_key, $request->get_param($option_key)));
            }
        }

        $color_scheme = $this->typost->sanitize_color_scheme(sanitize_key((string) $request->get_param('color_scheme')));
        update_option('typost_admin_color_scheme', $color_scheme);

        // Clear cache for all users when options change
        // Archive content check changes require cache refresh to take effect
        $this->typost->clear_caches();

        return rest_ensure_response(array(
            'success'   => true,
            'scheme'    => $color_scheme,
            'schemeCss' => $this->typost->get_color_scheme_css($color_scheme),
        ));
    }

    /**
     * REST callback: POST /admin/accessibility
     *
     * AJAX counterpart of the Accessibility tab form. Mirrors the POST
     * handler in render_admin_page() (which remains as the no-JavaScript
     * fallback).
     *
     * @since 2.3.0
     * @param WP_REST_Request $request
     */
    public function rest_save_accessibility_options(WP_REST_Request $request) {
        // rest_sanitize_boolean(): clients may send real booleans (JSON) or
        // strings like "false"/"0" (form-encoded), which are truthy in PHP.
        update_option('typost_disable_accessibility_warning', Typost_Admin_Options::sanitize('typost_disable_accessibility_warning', $request->get_param('disable_accessibility_warning')));

        // Clear cache when accessibility settings change
        $this->typost->clear_caches();

        return rest_ensure_response(array('success' => true));
    }

    /**
     * REST callback: POST /admin/clear-cache
     *
     * AJAX counterpart of the Options tab cache-clear form.
     *
     * @since 2.3.0
     */
    public function rest_clear_font_cache() {
        $this->typost->clear_caches();

        return rest_ensure_response(array('success' => true));
    }

    /**
     * REST endpoint: Get fonts
     */
    public function get_fonts_endpoint($request) {
        return rest_ensure_response($this->typost->get_custom_fonts());
    }

    /**
     * REST endpoint: Upload font kit
     */
    public function upload_font_endpoint($request) {
        try {
            // Get uploaded file
            $files = $request->get_file_params();
            $params = $request->get_params();

            if (empty($files['zip_file'])) {
                return new WP_Error('missing_data', esc_html__('Missing required font data', 'typography-stylist'), array('status' => 400));
            }

            $uploaded_file = $files['zip_file'];

            // Kit name is optional (2.1.0): it is stored on entries for
            // back-compat but never displayed anywhere — font cards show the
            // family names parsed from the kit. Default to the ZIP filename.
            $kit_name = !empty($params['name'])
                ? sanitize_text_field($params['name'])
                : preg_replace('/\.zip$/i', '', sanitize_file_name($uploaded_file['name']));

            // Validate file type and extension more securely
            $file_info = wp_check_filetype_and_ext($uploaded_file['tmp_name'], $uploaded_file['name']);
            $ext = $file_info['ext'];
            $type = $file_info['type'];

            if (!$ext || !$type) {
                return new WP_Error('invalid_file', esc_html__('Invalid file type', 'typography-stylist'), array('status' => 400));
            }

            if ($ext !== 'zip' || !in_array($type, array('application/zip', 'application/x-zip-compressed'), true)) {
                return new WP_Error('invalid_file', esc_html__('Please upload a valid ZIP file', 'typography-stylist'), array('status' => 400));
            }

            // Validate file size (max 10MB)
            $max_size = 10 * 1024 * 1024; // 10MB
            if ($uploaded_file['size'] > $max_size) {
                /* translators: %s: The maximum allowed file size in human-readable format (e.g., "10 MB") */
                return new WP_Error('file_too_large', sprintf(esc_html__('File size exceeds maximum allowed (%s)', 'typography-stylist'), size_format($max_size)), array('status' => 400));
            }

            // Check for upload errors
            if ($uploaded_file['error'] !== UPLOAD_ERR_OK) {
                return new WP_Error('upload_error', esc_html__('File upload error', 'typography-stylist'), array('status' => 400));
            }

            // Process the ZIP file - returns array of font entries
            $font_entries = $this->typost->process_font_kit_zip($uploaded_file, $kit_name);

            if (is_wp_error($font_entries)) {
                return $font_entries;
            }

            // Add all font entries from the kit
            $fonts = $this->typost->get_custom_fonts();
            foreach ($font_entries as $font_entry) {
                $fonts[] = $font_entry;
            }
            update_option('typost_custom_fonts', $fonts);

            // Clear cache
            $this->typost->clear_caches();

            // Auto-register new fonts in the WP Font Library (WP 6.5+).
            // Runs before typost_font_uploaded fires so extension hooks see
            // entries that already carry their wp_slug/wp_post_id fields.
            if ($this->typost->font_library_bridge()->auto_register_enabled()) {
                $registered_any = false;
                $updated_entries = array();
                foreach ($font_entries as $font_entry) {
                    $registered = $this->typost->font_library_bridge()->register_font($font_entry);
                    if (is_array($registered)) {
                        $updated = $this->typost->font_sources()->update_custom_font_entry($font_entry['id'], array(
                            'wp_slug'            => $registered['slug'],
                            'wp_post_id'         => $registered['post_id'],
                            'wp_registered_date' => current_time('mysql'),
                        ));
                        $updated_entries[] = $updated ? $updated : $font_entry;
                        $registered_any = true;
                    } else {
                        // Registration failed — entry simply stays plugin-managed
                        $updated_entries[] = $font_entry;
                    }
                }
                $font_entries = $updated_entries;
                if ($registered_any) {
                    $this->typost->clear_caches();
                }
            }

            /**
             * Fires after a font kit is successfully uploaded and processed.
             *
             * Allows extension plugins to perform additional processing on newly
             * uploaded fonts, such as variable font axis detection or glyph parsing.
             *
             * @since 2.0.0
             * @param array $font_entries Array of font entry objects that were added.
             */
            do_action('typost_font_uploaded', $font_entries);

            return rest_ensure_response(array(
                'success' => true,
                'fonts' => $font_entries,
                'count' => count($font_entries),
                'warnings' => $this->typost->get_font_kit_warnings()
            ));
        } catch (Exception $e) {
            // Return generic message to users
            return new WP_Error(
                'upload_exception',
                esc_html__('Upload failed due to an internal error. Please try again or contact support.', 'typography-stylist'),
                array('status' => 500)
            );
        }
    }

    /**
     * REST endpoint: Delete font
     */
    public function delete_font_endpoint($request) {
        $id = sanitize_key($request->get_param('id'));
        $fonts = $this->typost->get_custom_fonts();

        // Find the font to delete
        $font_to_delete = null;
        foreach ($fonts as $font) {
            if ($font['id'] === $id) {
                $font_to_delete = $font;
                break;
            }
        }

        if (!$font_to_delete) {
            return new WP_Error('font_not_found', esc_html__('Font not found', 'typography-stylist'), array('status' => 404));
        }

        // Remove the font's WP Font Library registration first, so no orphaned
        // wp_font_family post is left pointing at deleted font files (WP would
        // keep printing its @font-face site-wide). unregister_font() is
        // ownership-guarded via _typost_font_id meta — user-created families
        // are never touched. Running this while the entry still exists in the
        // option keeps the deleted_post watcher's read-modify-write from
        // resurrecting the entry via a stale cache.
        if (!empty($font_to_delete['wp_post_id'])) {
            $this->typost->font_library_bridge()->unregister_font($font_to_delete);
            $fonts = $this->typost->get_custom_fonts(); // re-read: the watcher may have cleared wp_* fields
        }

        // Check if this is the last font in the kit
        $kit_id = isset($font_to_delete['kit_id']) ? $font_to_delete['kit_id'] : null;
        $remaining_kit_fonts = 0;

        if ($kit_id) {
            foreach ($fonts as $font) {
                if (isset($font['kit_id']) && $font['kit_id'] === $kit_id && $font['id'] !== $id) {
                    $remaining_kit_fonts++;
                }
            }
        }

        // If this is the last font in the kit, delete the shared directory
        if ($kit_id && $remaining_kit_fonts === 0 && !empty($font_to_delete['upload_path'])) {
            require_once(ABSPATH . 'wp-admin/includes/file.php');
            WP_Filesystem();
            global $wp_filesystem;

            if ($wp_filesystem->exists($font_to_delete['upload_path'])) {
                $wp_filesystem->rmdir($font_to_delete['upload_path'], true);
            }
        }

        // Remove from database
        $found = false;
        foreach ($fonts as $key => $font) {
            if ($font['id'] === $id) {
                unset($fonts[$key]);
                $found = true;
                break;
            }
        }

        update_option('typost_custom_fonts', array_values($fonts));

        // Clear cache
        $this->typost->clear_caches();

        /**
         * Fires after a font is successfully deleted.
         *
         * Allows extension plugins to clean up related data when a font is removed.
         *
         * @since 2.0.0
         * @param string $id        The deleted font's ID.
         * @param array  $font_data The deleted font's data.
         */
        do_action('typost_font_deleted', $id, $font_to_delete);

        return rest_ensure_response(array('success' => true));
    }

    /**
     * REST endpoint: Bulk auto-detect available weights
     *
     * Processes uploaded and Adobe fonts whose entries lack the
     * available_weights key (fonts added before weight detection existed, or
     * whose Adobe stylesheet fetch failed at add time). Uploaded fonts derive
     * weights from their stored font faces; Adobe fonts from their kit
     * stylesheet, fetched once per distinct URL. Fonts whose stylesheet cannot
     * be fetched keep the key absent so the action stays available for retry.
     * Manual fonts are skipped — there is no source of truth for their weights.
     *
     * @since 2.1.2
     *
     * @param WP_REST_Request $request The REST request object.
     * @return WP_REST_Response Summary: updated (weights narrowed), defaulted
     *                          (nothing narrowed — all weights kept), failed
     *                          (stylesheet unreachable).
     */
    public function bulk_detect_weights_endpoint($request) {
        $updated = array();
        $defaulted = array();
        $failed = array();

        // Uploaded fonts: derive from the stored parsed @font-face data
        $custom_fonts = $this->typost->get_custom_fonts();
        $custom_changed = false;
        foreach ($custom_fonts as $key => $font) {
            if (array_key_exists('available_weights', $font)) {
                continue;
            }
            $faces = isset($font['font_faces']) && is_array($font['font_faces']) ? $font['font_faces'] : array();
            $weights = $this->typost->font_sources()->derive_available_weights_from_faces($faces);
            $custom_fonts[$key]['available_weights'] = $weights;
            $custom_changed = true;

            $name = isset($font['name']) ? $font['name'] : $font['id'];
            if ($weights !== array()) {
                $updated[] = array('id' => $font['id'], 'name' => $name, 'weights' => $weights);
            } else {
                // Nothing narrowed (no faces, or the font covers all 9 weights):
                // all weights stay enabled, key now present
                $defaulted[] = array('id' => $font['id'], 'name' => $name);
            }
        }
        if ($custom_changed) {
            update_option('typost_custom_fonts', $custom_fonts);
        }

        // Adobe fonts: group candidates by stylesheet URL, fetch each once
        $adobe_fonts = $this->typost->get_adobe_fonts();
        $adobe_changed = false;
        $candidates_by_url = array();
        foreach ($adobe_fonts as $key => $font) {
            if (array_key_exists('available_weights', $font)) {
                continue;
            }
            $css_url = isset($font['css_url']) ? $font['css_url'] : '';
            $family = isset($font['font_family']) ? $font['font_family'] : '';
            if ($family === '' && isset($font['name'])) {
                $family = $font['name'];
            }
            if ($css_url === '' || $family === '') {
                $failed[] = array(
                    'id' => $font['id'],
                    'name' => isset($font['name']) ? $font['name'] : $font['id']
                );
                continue;
            }
            $candidates_by_url[$css_url][] = array('key' => $key, 'family' => $family);
        }

        foreach ($candidates_by_url as $css_url => $candidates) {
            $detected = $this->detect_adobe_available_weights($css_url, wp_list_pluck($candidates, 'family'));

            foreach ($candidates as $candidate) {
                $key = $candidate['key'];
                $font = $adobe_fonts[$key];
                $name = isset($font['name']) ? $font['name'] : $font['id'];

                if ($detected === false) {
                    // Stylesheet unreachable: key stays absent so a retry is possible
                    $failed[] = array('id' => $font['id'], 'name' => $name);
                    continue;
                }

                $family_slug = sanitize_title($candidate['family']);
                $weights = isset($detected[$family_slug]) ? $detected[$family_slug] : array();
                $adobe_fonts[$key]['available_weights'] = $weights;
                $adobe_changed = true;

                $found_in_css = $weights !== array();
                if ($found_in_css) {
                    $updated[] = array('id' => $font['id'], 'name' => $name, 'weights' => $weights);
                } else {
                    // Family absent from the stylesheet (or it genuinely serves
                    // all 9): all weights stay enabled, key now present
                    $defaulted[] = array('id' => $font['id'], 'name' => $name);
                }
            }
        }
        if ($adobe_changed) {
            update_option('typost_adobe_fonts', $adobe_fonts);
        }

        if ($custom_changed || $adobe_changed) {
            $this->typost->clear_caches();
        }

        return rest_ensure_response(array(
            'success' => true,
            'updated' => $updated,
            'defaulted' => $defaulted,
            'failed' => $failed
        ));
    }

    /**
     * REST endpoint: Get Adobe Fonts
     *
     * Returns all configured Adobe Fonts projects.
     *
     * @since 1.0.0
     *
     * @param WP_REST_Request $request The REST request object.
     * @return WP_REST_Response REST response containing array of Adobe Fonts projects.
     */
    public function get_adobe_fonts_endpoint($request) {
        return rest_ensure_response($this->typost->get_adobe_fonts());
    }

    /**
     * REST endpoint: Add Adobe Font
     *
     * Parses Adobe Fonts embed code and adds a new Adobe Fonts project.
     * Validates the embed code, checks for duplicates, and stores project configuration.
     *
     * @since 1.0.0
     *
     * @param WP_REST_Request $request REST request with 'embed_code', 'name', and 'font_families' params.
     * @return WP_REST_Response|WP_Error REST response with success status and font data, or error.
     */
    public function add_adobe_font_endpoint($request) {
        $params = $request->get_json_params();

        if (empty($params['embed_code'])) {
            return new WP_Error('missing_embed_code', esc_html__('Embed code is required', 'typography-stylist'), array('status' => 400));
        }

        // Parse embed code
        $parsed = $this->typost->parse_adobe_fonts_code($params['embed_code']);
        if (!$parsed) {
            // phpcs:ignore WordPress.WP.EnqueuedResources.NonEnqueuedStylesheet -- False positive: error message text, not actual inline CSS/JS
            return new WP_Error('invalid_embed_code', esc_html__('Invalid Adobe Fonts embed code. Please paste the complete <link> or <script> tag from Adobe Fonts.', 'typography-stylist'), array('status' => 400));
        }

        // Parse font families from user input
        $font_families_input = !empty($params['font_families']) && is_array($params['font_families'])
            ? array_map('sanitize_text_field', $params['font_families'])
            : array();

        if (empty($font_families_input)) {
            return new WP_Error('missing_families', esc_html__('At least one font family is required', 'typography-stylist'), array('status' => 400));
        }

        // Create kit metadata
        $kit_id = 'adobe-' . $parsed['kit_id'];

        // Check for duplicate kit ID or CSS URL
        $existing_fonts = $this->typost->get_adobe_fonts();
        foreach ($existing_fonts as $font) {
            $is_duplicate_kit_id = isset($font['kit_id']) && $font['kit_id'] === $kit_id;
            $is_duplicate_css_url = isset($font['css_url'], $parsed['css_url']) && $font['css_url'] === $parsed['css_url'];

            if ($is_duplicate_kit_id || $is_duplicate_css_url) {
                return new WP_Error('duplicate_kit', esc_html__('This Adobe Fonts kit has already been added. Please use a different kit or remove the existing one first.', 'typography-stylist'), array('status' => 400));
            }
        }
        $kit_name = !empty($params['name']) ? sanitize_text_field($params['name']) : 'Adobe Fonts ' . $parsed['kit_id'];

        // Detect available weights from the kit stylesheet. On fetch failure the
        // entries simply omit available_weights (= all weights enabled).
        $detected_weights = $this->detect_adobe_available_weights($parsed['css_url'], $font_families_input);

        // Create individual font entries for each family (similar to MyFonts kits)
        $font_entries = array();
        foreach ($font_families_input as $family) {
            $family_slug = sanitize_title($family);
            $weights = ($detected_weights !== false && isset($detected_weights[$family_slug])) ? $detected_weights[$family_slug] : null;
            $font_entries[] = $this->typost->build_adobe_font_entry($kit_id, $kit_name, $parsed['css_url'], $family, $weights);
        }

        // Add all font entries from the kit
        $fonts = $this->typost->get_adobe_fonts();
        foreach ($font_entries as $font_entry) {
            $fonts[] = $font_entry;
        }
        update_option('typost_adobe_fonts', $fonts);

        // Clear cache
        $this->typost->clear_caches();

        return rest_ensure_response(array(
            'success' => true,
            'fonts' => $font_entries,
            'count' => count($font_entries)
        ));
    }

    /**
     * REST endpoint: Delete Adobe Font
     *
     * Removes an Adobe Fonts project from the plugin configuration.
     *
     * @since 1.0.0
     *
     * @param WP_REST_Request $request REST request with 'id' parameter.
     * @return WP_REST_Response|WP_Error REST response with success status, or error if not found.
     */
    public function delete_adobe_font_endpoint($request) {
        $id = sanitize_key($request->get_param('id'));
        $fonts = $this->typost->get_adobe_fonts();

        $found = false;
        $font_to_delete = null;
        foreach ($fonts as $key => $font) {
            if ($font['id'] === $id) {
                $font_to_delete = $font;
                unset($fonts[$key]);
                $found = true;
                break;
            }
        }

        if (!$found) {
            return new WP_Error('font_not_found', esc_html__('Adobe Font not found', 'typography-stylist'), array('status' => 404));
        }

        update_option('typost_adobe_fonts', array_values($fonts));
        $this->typost->clear_caches();

        /** This action is documented in typography-stylist.php delete_font_endpoint */
        do_action( 'typost_font_deleted', $id, $font_to_delete );

        return rest_ensure_response(array('success' => true));
    }

    /**
     * REST endpoint: Update Adobe Font fallback
     *
     * Updates the fallback fonts for an Adobe Fonts project.
     *
     * @since 1.0.0
     *
     * @param WP_REST_Request $request REST request with 'id' parameter and 'fallbacks' in body.
     * @return WP_REST_Response|WP_Error REST response with updated font data, or error if not found.
     */
    public function update_adobe_font_fallback_endpoint($request) {
        $id = sanitize_key($request->get_param('id'));
        $params = $request->get_json_params();

        if (!isset($params['fallbacks']) && !isset($params['available_weights'])) {
            return new WP_Error('missing_params', esc_html__('Either fallbacks or available_weights parameter is required', 'typography-stylist'), array('status' => 400));
        }

        $fonts = $this->typost->get_adobe_fonts();
        $found = false;

        foreach ($fonts as $key => $font) {
            if ($font['id'] === $id) {
                if (isset($params['fallbacks'])) {
                    $fonts[$key]['fallbacks'] = sanitize_text_field($params['fallbacks']);
                }
                if (isset($params['available_weights'])) {
                    $fonts[$key]['available_weights'] = $this->typost->sanitize_available_weights($params['available_weights']);
                }
                $found = true;
                break;
            }
        }

        if (!$found) {
            return new WP_Error('font_not_found', esc_html__('Adobe Font not found', 'typography-stylist'), array('status' => 404));
        }

        update_option('typost_adobe_fonts', $fonts);
        $this->typost->clear_caches();

        /**
         * Fires after a font's settings are saved via the REST API.
         *
         * @since 2.0.0
         * @param string $id        The font's string ID.
         * @param array  $font_data The updated font data.
         * @param string $type      The font type ('uploaded', 'adobe', or 'manual').
         */
        do_action( 'typost_font_saved', $id, $fonts[$key], 'adobe' );

        return rest_ensure_response(array('success' => true, 'font' => $fonts[$key]));
    }

    /**
     * REST endpoint: Update Adobe Font load on all pages setting
     *
     * Updates whether an Adobe Font should be loaded on all pages or only when used.
     *
     * @since 1.0.0
     *
     * @param WP_REST_Request $request REST request with 'id' parameter and 'load_on_all_pages' in body.
     * @return WP_REST_Response|WP_Error REST response with updated font data, or error if not found.
     */
    public function update_adobe_font_load_on_all_pages_endpoint($request) {
        $id = sanitize_key($request->get_param('id'));
        $params = $request->get_json_params();

        if (!isset($params['load_on_all_pages'])) {
            return new WP_Error('missing_parameter', esc_html__('load_on_all_pages parameter is required', 'typography-stylist'), array('status' => 400));
        }

        $fonts = $this->typost->get_adobe_fonts();
        $found = false;

        foreach ($fonts as $key => $font) {
            if ($font['id'] === $id) {
                $fonts[$key]['load_on_all_pages'] = (bool) $params['load_on_all_pages'];
                $found = true;
                break;
            }
        }

        if (!$found) {
            return new WP_Error('font_not_found', esc_html__('Adobe Font not found', 'typography-stylist'), array('status' => 404));
        }

        update_option('typost_adobe_fonts', $fonts);
        $this->typost->clear_caches();

        do_action( 'typost_font_saved', $id, $fonts[$key], 'adobe' );

        return rest_ensure_response(array('success' => true, 'font' => $fonts[$key]));
    }

    /**
     * REST endpoint: Update font fallback (uploaded fonts)
     *
     * Updates the fallback fonts for an uploaded custom font kit.
     *
     * @since 1.0.0
     *
     * @param WP_REST_Request $request REST request with 'id' parameter and 'fallbacks' in body.
     * @return WP_REST_Response|WP_Error REST response with updated font data, or error if not found.
     */
    public function update_font_fallback_endpoint($request) {
        $id = sanitize_key($request->get_param('id'));
        $params = $request->get_json_params();

        if (!isset($params['fallbacks']) && !isset($params['available_weights'])) {
            return new WP_Error('missing_params', esc_html__('Either fallbacks or available_weights parameter is required', 'typography-stylist'), array('status' => 400));
        }

        $fonts = $this->typost->get_custom_fonts();
        $found = false;

        foreach ($fonts as $key => $font) {
            if ($font['id'] === $id) {
                if (isset($params['fallbacks'])) {
                    $fonts[$key]['fallbacks'] = sanitize_text_field($params['fallbacks']);
                }
                if (isset($params['available_weights'])) {
                    $fonts[$key]['available_weights'] = $this->typost->sanitize_available_weights($params['available_weights']);
                }
                $found = true;
                break;
            }
        }

        if (!$found) {
            return new WP_Error('font_not_found', esc_html__('Font not found', 'typography-stylist'), array('status' => 404));
        }

        update_option('typost_custom_fonts', $fonts);
        $this->typost->clear_caches();

        /** This action is documented in typography-stylist.php update_adobe_font_fallback_endpoint */
        do_action( 'typost_font_saved', $id, $fonts[$key], 'uploaded' );

        return rest_ensure_response(array('success' => true, 'font' => $fonts[$key]));
    }

    /**
     * REST endpoint: Update font load on all pages setting (uploaded fonts)
     *
     * Updates whether an uploaded font should be loaded on all pages or only when used.
     *
     * @since 1.0.0
     *
     * @param WP_REST_Request $request REST request with 'id' parameter and 'load_on_all_pages' in body.
     * @return WP_REST_Response|WP_Error REST response with updated font data, or error if not found.
     */
    public function update_font_load_on_all_pages_endpoint($request) {
        $id = sanitize_key($request->get_param('id'));
        $params = $request->get_json_params();

        if (!isset($params['load_on_all_pages'])) {
            return new WP_Error('missing_parameter', esc_html__('load_on_all_pages parameter is required', 'typography-stylist'), array('status' => 400));
        }

        $fonts = $this->typost->get_custom_fonts();
        $found = false;

        foreach ($fonts as $key => $font) {
            if ($font['id'] === $id) {
                $fonts[$key]['load_on_all_pages'] = (bool) $params['load_on_all_pages'];
                $found = true;
                break;
            }
        }

        if (!$found) {
            return new WP_Error('font_not_found', esc_html__('Font not found', 'typography-stylist'), array('status' => 404));
        }

        update_option('typost_custom_fonts', $fonts);
        $this->typost->clear_caches();

        do_action( 'typost_font_saved', $id, $fonts[$key], 'uploaded' );

        return rest_ensure_response(array('success' => true, 'font' => $fonts[$key]));
    }

    /**
     * REST endpoint: Register an uploaded font in the WP Font Library
     *
     * @since 2.1.0
     * @param WP_REST_Request $request
     * @return WP_REST_Response|WP_Error
     */
    public function register_font_in_library_endpoint($request) {
        if (!$this->typost->font_library_bridge()->is_available()) {
            return new WP_Error(
                'font_library_unavailable',
                esc_html__('The WordPress Font Library requires WordPress 6.5 or later.', 'typography-stylist'),
                array('status' => 400)
            );
        }

        $id = sanitize_key($request->get_param('id'));
        $entry = $this->find_custom_font_entry($id);

        if (!$entry) {
            return new WP_Error('font_not_found', esc_html__('Font not found', 'typography-stylist'), array('status' => 404));
        }

        $registered = $this->typost->font_library_bridge()->register_font($entry);

        if (!is_array($registered)) {
            return new WP_Error(
                'registration_failed',
                esc_html__('The font could not be registered in the Font Library. It remains fully functional as a plugin-managed font.', 'typography-stylist'),
                array('status' => 500)
            );
        }

        $updated = $this->typost->font_sources()->update_custom_font_entry($id, array(
            'wp_slug'            => $registered['slug'],
            'wp_post_id'         => $registered['post_id'],
            'wp_registered_date' => current_time('mysql'),
        ));
        $this->typost->clear_caches();

        do_action('typost_font_saved', $id, $updated ? $updated : $entry, 'uploaded');

        return rest_ensure_response(array(
            'success' => true,
            'slug'    => $registered['slug'],
            'font'    => $updated ? $updated : $entry,
        ));
    }

    /**
     * REST endpoint: Remove an uploaded font from the WP Font Library
     *
     * Deletes the plugin-owned wp_font_family post (ownership-guarded) and
     * clears the registration fields; the plugin-managed @font-face path
     * resumes on the next request. Safe to call on stale registrations.
     *
     * @since 2.1.0
     * @param WP_REST_Request $request
     * @return WP_REST_Response|WP_Error
     */
    public function unregister_font_from_library_endpoint($request) {
        $id = sanitize_key($request->get_param('id'));
        $entry = $this->find_custom_font_entry($id);

        if (!$entry) {
            return new WP_Error('font_not_found', esc_html__('Font not found', 'typography-stylist'), array('status' => 404));
        }

        // Deleting the post fires the deleted_post watcher, which clears the
        // entry fields. If the post was already gone (stale registration),
        // clear the fields directly.
        $removed = $this->typost->font_library_bridge()->unregister_font($entry);
        if (!$removed) {
            $this->typost->font_sources()->update_custom_font_entry($id, array(
                'wp_slug'            => null,
                'wp_post_id'         => null,
                'wp_registered_date' => null,
            ));
        }
        $this->typost->clear_caches();

        return rest_ensure_response(array('success' => true, 'removed_post' => (bool) $removed));
    }

    /**
     * REST endpoint: Register all unregistered uploaded fonts in the Library
     *
     * Failures are per-font and non-fatal — a font that cannot be registered
     * simply stays plugin-managed and is reported in the response.
     *
     * @since 2.1.0
     * @param WP_REST_Request $request
     * @return WP_REST_Response|WP_Error
     */
    public function bulk_register_fonts_in_library_endpoint($request) {
        if (!$this->typost->font_library_bridge()->is_available()) {
            return new WP_Error(
                'font_library_unavailable',
                esc_html__('The WordPress Font Library requires WordPress 6.5 or later.', 'typography-stylist'),
                array('status' => 400)
            );
        }

        $results = array(
            'registered' => array(),
            'skipped'    => array(),
            'failed'     => array(),
        );

        foreach ($this->typost->get_custom_fonts() as $entry) {
            if (!isset($entry['id'])) {
                continue;
            }
            if ($this->typost->font_library_bridge()->entry_has_live_registration($entry)) {
                $results['skipped'][] = $entry['id'];
                continue;
            }

            $registered = $this->typost->font_library_bridge()->register_font($entry);
            if (is_array($registered)) {
                $this->typost->font_sources()->update_custom_font_entry($entry['id'], array(
                    'wp_slug'            => $registered['slug'],
                    'wp_post_id'         => $registered['post_id'],
                    'wp_registered_date' => current_time('mysql'),
                ));
                $results['registered'][] = $entry['id'];
            } else {
                $results['failed'][] = $entry['id'];
            }
        }

        if (!empty($results['registered'])) {
            $this->typost->clear_caches();
        }

        return rest_ensure_response(array_merge(array('success' => true), $results));
    }

    /**
     * REST endpoint: Adopt a WP Font Library font for editor use
     *
     * Idempotent — returns the existing entry (with its font_id) when the
     * slug was already adopted or belongs to a plugin-registered font.
     *
     * @since 2.1.0
     * @param WP_REST_Request $request
     * @return WP_REST_Response|WP_Error
     */
    public function adopt_wp_font_endpoint($request) {
        $params = $request->get_json_params();
        $slug = isset($params['slug']) ? sanitize_title($params['slug']) : '';

        if ('' === $slug) {
            return new WP_Error('missing_parameter', esc_html__('slug parameter is required', 'typography-stylist'), array('status' => 400));
        }

        $entry = $this->typost->font_library_bridge()->adopt_library_font($slug);

        if (!is_array($entry)) {
            return new WP_Error('font_not_found', esc_html__('Font not found in the WordPress Font Library.', 'typography-stylist'), array('status' => 404));
        }

        $this->typost->clear_caches();

        return rest_ensure_response(array(
            'success' => true,
            'font'    => $entry,
        ));
    }

    /**
     * REST endpoint: Dismiss the Font Library migration admin notice
     *
     * @since 2.1.0
     * @return WP_REST_Response
     */
    public function dismiss_wp_library_notice_endpoint() {
        update_option('typost_wp_library_notice_dismissed', '1', false);
        return rest_ensure_response(array('success' => true));
    }

    /**
     * REST endpoint: Get manual fonts
     *
     * Returns all manually configured custom fonts (non-uploaded, non-Adobe).
     *
     * @since 1.0.0
     *
     * @param WP_REST_Request $request The REST request object.
     * @return WP_REST_Response REST response containing array of manual fonts.
     */
    public function get_manual_fonts_endpoint($request) {
        return rest_ensure_response($this->typost->get_manual_fonts());
    }

    /**
     * REST endpoint: Add manual font
     *
     * Adds a manually configured custom font by specifying name and CSS font-family value.
     * Used for fonts loaded elsewhere (theme, other plugins) that support OpenType features.
     *
     * @since 1.0.0
     *
     * @param WP_REST_Request $request REST request with 'name', 'font_family', and optional 'fallbacks' params.
     * @return WP_REST_Response|WP_Error REST response with success status and font data, or error.
     */
    public function add_manual_font_endpoint($request) {
        $params = $request->get_json_params();

        if (empty($params['name']) || empty($params['font_family'])) {
            return new WP_Error('missing_data', esc_html__('Name and font family are required', 'typography-stylist'), array('status' => 400));
        }

        $new_font = $this->typost->store_manual_font_entry(
            $params['name'],
            $params['font_family'],
            isset($params['fallbacks']) ? $params['fallbacks'] : ''
        );

        return rest_ensure_response(array('success' => true, 'font' => $new_font));
    }

    /**
     * REST endpoint: Delete manual font
     *
     * Removes a manually configured custom font from the plugin configuration.
     *
     * @since 1.0.0
     *
     * @param WP_REST_Request $request REST request with 'id' parameter.
     * @return WP_REST_Response|WP_Error REST response with success status, or error if not found.
     */
    public function delete_manual_font_endpoint($request) {
        $id = sanitize_key($request->get_param('id'));
        $fonts = $this->typost->get_manual_fonts();

        $found = false;
        $font_to_delete = null;
        foreach ($fonts as $key => $font) {
            if ($font['id'] === $id) {
                $font_to_delete = $font;
                unset($fonts[$key]);
                $found = true;
                break;
            }
        }

        if (!$found) {
            return new WP_Error('font_not_found', esc_html__('Manual font not found', 'typography-stylist'), array('status' => 404));
        }

        update_option('typost_manual_fonts', array_values($fonts));
        $this->typost->clear_caches();

        /** This action is documented in typography-stylist.php delete_font_endpoint */
        do_action( 'typost_font_deleted', $id, $font_to_delete );

        return rest_ensure_response(array('success' => true));
    }

    /**
     * REST endpoint: Update manual font
     *
     * Updates a manually configured custom font's font_family and fallbacks.
     *
     * @since 1.0.0
     *
     * @param WP_REST_Request $request REST request with 'id' parameter and 'font_family', 'fallbacks' in body.
     * @return WP_REST_Response|WP_Error REST response with updated font data, or error if not found.
     */
    public function update_manual_font_endpoint($request) {
        $id = sanitize_key($request->get_param('id'));
        $params = $request->get_json_params();

        if (!isset($params['font_family']) && !isset($params['available_weights'])) {
            return new WP_Error('missing_params', esc_html__('Either font_family or available_weights parameter is required', 'typography-stylist'), array('status' => 400));
        }

        $fonts = $this->typost->get_manual_fonts();
        $found = false;

        foreach ($fonts as $key => $font) {
            if ($font['id'] === $id) {
                if (isset($params['font_family'])) {
                    $fonts[$key]['font_family'] = sanitize_text_field($params['font_family']);
                }
                if (isset($params['fallbacks'])) {
                    $fonts[$key]['fallbacks'] = sanitize_text_field($params['fallbacks']);
                }
                if (isset($params['available_weights'])) {
                    $fonts[$key]['available_weights'] = $this->typost->sanitize_available_weights($params['available_weights']);
                }
                $found = true;
                break;
            }
        }

        if (!$found) {
            return new WP_Error('font_not_found', esc_html__('Manual font not found', 'typography-stylist'), array('status' => 404));
        }

        update_option('typost_manual_fonts', $fonts);
        $this->typost->clear_caches();

        /** This action is documented in typography-stylist.php update_adobe_font_fallback_endpoint */
        do_action( 'typost_font_saved', $id, $fonts[$key], 'manual' );

        return rest_ensure_response(array('success' => true, 'font' => $fonts[$key]));
    }

    /**
     * REST API: Get all font replacements
     */
    public function get_font_replacements_endpoint($request) {
        $replacements = $this->typost->font_sources()->get_font_replacements();
        return rest_ensure_response($replacements);
    }

    /**
     * REST API: Add font replacement
     */
    public function add_font_replacement_endpoint($request) {
        $deleted_id = $request->get_param('deleted_id');
        $replacement_id = $request->get_param('replacement_id');
        $global_load = $request->get_param('global_load');

        if (empty($deleted_id) || empty($replacement_id)) {
            return new WP_Error('missing_params', __('Missing required parameters.', 'typography-stylist'), array('status' => 400));
        }

        $success = $this->typost->add_font_replacement((int) $deleted_id, (int) $replacement_id, (bool) $global_load);

        if ($success === false) {
            return new WP_Error('invalid_id', __('Invalid font ID (0). Font IDs must be greater than 0.', 'typography-stylist'), array('status' => 400));
        }

        if ($success) {
            return rest_ensure_response(array('success' => true, 'replacements' => $this->typost->font_sources()->get_font_replacements()));
        }

        return new WP_Error('failed', __('Failed to add font replacement.', 'typography-stylist'), array('status' => 500));
    }

    /**
     * REST API: Update font replacement
     */
    public function update_font_replacement_endpoint($request) {
        $deleted_id = $request->get_param('id');
        $replacement_id = $request->get_param('replacement_id');
        $global_load = $request->get_param('global_load');

        if (empty($deleted_id)) {
            return new WP_Error('missing_id', __('Missing font ID.', 'typography-stylist'), array('status' => 400));
        }

        $success = $this->typost->add_font_replacement((int) $deleted_id, (int) $replacement_id, (bool) $global_load);

        if ($success === false) {
            return new WP_Error('invalid_id', __('Invalid font ID (0). Font IDs must be greater than 0.', 'typography-stylist'), array('status' => 400));
        }

        if ($success) {
            return rest_ensure_response(array('success' => true, 'replacements' => $this->typost->font_sources()->get_font_replacements()));
        }

        return new WP_Error('failed', __('Failed to update font replacement.', 'typography-stylist'), array('status' => 500));
    }

    /**
     * REST API: Delete font replacement
     */
    public function delete_font_replacement_endpoint($request) {
        $deleted_id = $request->get_param('id');

        if (empty($deleted_id)) {
            return new WP_Error('missing_id', __('Missing font ID.', 'typography-stylist'), array('status' => 400));
        }

        $success = $this->typost->remove_font_replacement((int) $deleted_id);

        if ($success) {
            return rest_ensure_response(array('success' => true));
        }

        return new WP_Error('failed', __('Failed to delete font replacement.', 'typography-stylist'), array('status' => 500));
    }

    /**
     * REST API: Get unassigned fonts
     */
    public function get_unassigned_fonts_endpoint($request) {
        $unassigned = $this->typost->get_unassigned_font_ids();
        return rest_ensure_response(array('orphaned_ids' => $unassigned));
    }

    /**
     * Count one write request for the current user: at most 50 per minute.
     *
     * GET and other read methods are not counted. A request object is counted
     * at most once (see $rate_limited_requests).
     *
     * The window is fixed: it starts with the first write and ends 60 seconds
     * later. An expiry renewed on every request (the old behavior) let the
     * count grow for as long as writes kept coming, so a steady 30 writes a
     * minute reached 50 after about 100 seconds and was refused.
     *
     * The window lives in user meta, not a transient. On a site with a
     * persistent object cache a transient exists only in that cache, and
     * clear_cache(), which most write endpoints call, can reach
     * wp_cache_flush(); every save then reset the count. User meta is stored
     * in the database, so a flush only drops the cached copy.
     *
     * The limit is best-effort: the read and the write are separate, so two
     * concurrent requests can read the same count.
     *
     * @param WP_REST_Request|null $request Request.
     * @return true|WP_Error True when allowed, a 429 WP_Error when over the limit.
     */
    private function consume_rate_limit($request) {
        if (!$request || !is_object($request) || !method_exists($request, 'get_method')
            || !in_array($request->get_method(), array('POST', 'DELETE', 'PUT', 'PATCH'), true)) {
            return true;
        }

        if (null === $this->rate_limited_requests) {
            $this->rate_limited_requests = new SplObjectStorage();
        }
        if ($this->rate_limited_requests->contains($request)) {
            return true;
        }
        $this->rate_limited_requests->attach($request);

        $user_id = get_current_user_id();
        if (!$user_id) {
            // Every typost/v1 route requires a capability, so an anonymous
            // write never reaches this point; there is no user to count.
            return true;
        }
        $window = get_user_meta($user_id, 'typost_rate_limit_window', true);
        $now = time();

        // A missing, expired, or malformed window starts a new one.
        if (!is_array($window) || !isset($window['count'], $window['start'])
            || ($now - (int) $window['start']) >= MINUTE_IN_SECONDS) {
            $window = array('count' => 0, 'start' => $now);
        }

        // Max 50 requests per minute
        if ($window['count'] >= 50) {
            return new WP_Error(
                'rate_limit_exceeded',
                esc_html__('Too many requests. Please try again later.', 'typography-stylist'),
                array('status' => 429)
            );
        }

        $window['count']++;
        update_user_meta($user_id, 'typost_rate_limit_window', $window);

        return true;
    }

    /**
     * Find an uploaded-kit font entry by its string entry ID
     *
     * @since 2.1.0
     * @param string $entry_id
     * @return array|null
     */
    private function find_custom_font_entry($entry_id) {
        foreach ($this->typost->get_custom_fonts() as $font) {
            if (isset($font['id']) && $font['id'] === $entry_id) {
                return $font;
            }
        }
        return null;
    }

    /**
     * Detect available weights per family from an Adobe Fonts stylesheet
     *
     * Fetches the Typekit CSS server-side and reads the font-weight declared
     * by each @font-face block. Typekit family names are slugs (e.g.
     * "proxima-nova") while users enter display names ("Proxima Nova"), so
     * both sides are normalized with sanitize_title() before matching.
     *
     * @since 2.1.2
     *
     * @param string $css_url  Typekit stylesheet URL.
     * @param array  $families User-entered family display names.
     * @return array|false Map of family slug => weights array (possibly empty
     *                     = all weights) for every requested family, or false
     *                     when the stylesheet could not be fetched.
     */
    private function detect_adobe_available_weights($css_url, array $families) {
        $response = wp_remote_get($css_url, array('timeout' => 5));
        if (is_wp_error($response) || (int) wp_remote_retrieve_response_code($response) !== 200) {
            return false;
        }

        $css_faces = $this->typost->parse_webfont_kit(wp_remote_retrieve_body($response));

        $faces_by_slug = array();
        foreach ($css_faces as $face) {
            $slug = sanitize_title($face['family']);
            if ($slug === '') {
                continue;
            }
            $faces_by_slug[$slug][] = $face;
        }

        $weights_by_slug = array();
        foreach ($families as $family) {
            $family_slug = sanitize_title($family);
            $weights_by_slug[$family_slug] = isset($faces_by_slug[$family_slug])
                ? $this->typost->font_sources()->derive_available_weights_from_faces($faces_by_slug[$family_slug])
                : array();
        }

        return $weights_by_slug;
    }
}

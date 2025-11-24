<?php
/**
 * Plugin Name: Headline Ligatures and Styles
 * Plugin URI: https://github.com/yourusername/headline-ligatures-styles
 * Description: Add advanced OpenType features (ligatures, stylistic sets, swashes) to headlines with inline text selection and live preview.
 * Version: 1.0.1
 * Author: Your Name
 * Author URI: https://yourwebsite.com
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: headline-ligatures-styles
 * Domain Path: /languages
 * Requires at least: 5.8
 * Requires PHP: 7.4
 */

// Exit if accessed directly
if (!defined('ABSPATH')) {
    exit;
}

// Define plugin constants
define('HLS_VERSION', '1.0.1');
define('HLS_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('HLS_PLUGIN_URL', plugin_dir_url(__FILE__));
define('HLS_PLUGIN_BASENAME', plugin_basename(__FILE__));

/**
 * Main plugin class
 */
class Headline_Ligatures_Styles {

    /**
     * Instance of this class
     */
    private static $instance = null;

    /**
     * Object cache for database queries
     */
    private $presets_cache = null;
    private $fonts_cache = null;
    private $features_cache = null;

    /**
     * Get instance
     */
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * Constructor
     */
    private function __construct() {
        $this->init_hooks();
    }

    /**
     * Initialize WordPress hooks
     */
    private function init_hooks() {
        // Load plugin text domain
        add_action('plugins_loaded', array($this, 'load_textdomain'));

        // Enqueue block editor assets
        add_action('enqueue_block_editor_assets', array($this, 'enqueue_block_editor_assets'));

        // Enqueue assets in the editor iframe (for block rendering)
        add_action('enqueue_block_assets', array($this, 'enqueue_block_assets'));

        // Enqueue frontend assets
        add_action('wp_enqueue_scripts', array($this, 'enqueue_frontend_assets'));

        // Add admin menu
        add_action('admin_menu', array($this, 'add_admin_menu'));

        // Register settings
        add_action('admin_init', array($this, 'register_settings'));

        // Add REST API endpoints
        add_action('rest_api_init', array($this, 'register_rest_routes'));

        // Secure upload directory on activation
        register_activation_hook(__FILE__, array($this, 'activate_plugin'));
    }

    /**
     * Plugin activation
     */
    public function activate_plugin() {
        $this->secure_upload_directory();
    }

    /**
     * Load plugin text domain
     */
    public function load_textdomain() {
        load_plugin_textdomain(
            'headline-ligatures-styles',
            false,
            dirname(HLS_PLUGIN_BASENAME) . '/languages'
        );
    }

    /**
     * Enqueue block assets (loads in both editor iframe and frontend)
     * This hook fires for both editor and frontend
     */
    public function enqueue_block_assets() {
        // Only load fonts in editor context, not frontend
        // Frontend uses enqueue_frontend_assets() with optimized loading
        if (is_admin()) {
            $this->enqueue_custom_fonts_for_blocks();
        }
    }

    /**
     * Enqueue block editor assets (toolbar, popover, etc.)
     */
    public function enqueue_block_editor_assets() {
        $suffix = (defined('SCRIPT_DEBUG') && SCRIPT_DEBUG) ? '' : '.min';

        // Enqueue fonts for popover preview
        $this->enqueue_custom_fonts_for_editor();

        // Editor styles
        wp_enqueue_style(
            'hls-block-editor',
            HLS_PLUGIN_URL . "assets/css/block-editor{$suffix}.css",
            array('wp-edit-blocks'),
            HLS_VERSION
        );

        // Editor JavaScript
        wp_enqueue_script(
            'hls-block-editor',
            HLS_PLUGIN_URL . "assets/js/block-editor{$suffix}.js",
            array(
                'wp-blocks',
                'wp-element',
                'wp-components',
                'wp-data',
                'wp-rich-text',
                'wp-block-editor',
                'wp-i18n',
                'wp-compose'
            ),
            HLS_VERSION,
            true
        );

        // Cache the localized data with transient
        $cache_key = 'hls_editor_data_' . get_current_user_id();
        $localized_data = get_transient($cache_key);

        if (false === $localized_data) {
            $localized_data = array(
                'presets' => $this->get_presets(),
                'features' => $this->get_available_features(),
                'fonts' => $this->get_custom_fonts(),
                'restUrl' => rest_url('hls/v1/'),
                'nonce' => wp_create_nonce('wp_rest')
            );

            // Cache for 1 hour
            set_transient($cache_key, $localized_data, HOUR_IN_SECONDS);
        }

        // Pass data to JavaScript
        wp_localize_script('hls-block-editor', 'hlsData', $localized_data);
    }

    /**
     * Check if current post has styled content
     */
    private function has_styled_content() {
        global $post;

        if (!is_singular() || !isset($post->ID)) {
            return false;
        }

        // Cache the result per post
        $cache_key = 'hls_has_styled_' . $post->ID;
        $has_styled = get_transient($cache_key);

        if (false === $has_styled) {
            // Check both raw content and rendered content (for Gutenberg blocks)
            $raw_content = $post->post_content;

            // Apply content filters to render Gutenberg blocks
            $rendered_content = apply_filters('the_content', $raw_content);

            // Check if hls-styled class exists in either raw or rendered content
            $has_styled = (strpos($raw_content, 'hls-styled') !== false ||
                          strpos($rendered_content, 'hls-styled') !== false) ? 'yes' : 'no';

            set_transient($cache_key, $has_styled, 12 * HOUR_IN_SECONDS);
        }

        return $has_styled === 'yes';
    }

    /**
     * Get fonts used in current post content
     */
    private function get_used_fonts_in_content() {
        global $post;

        if (!is_singular() || !isset($post->ID)) {
            return array();
        }

        // Cache the result per post
        $cache_key = 'hls_used_fonts_' . $post->ID;
        $used_fonts = get_transient($cache_key);

        if (false === $used_fonts) {
            $used_fonts = array();

            // Check both raw content and rendered content (for Gutenberg blocks)
            $raw_content = $post->post_content;
            $rendered_content = apply_filters('the_content', $raw_content);

            // Look for data-font attributes in both raw and rendered content
            $content_to_check = $raw_content . ' ' . $rendered_content;
            if (preg_match_all('/data-font=["\']([^"\']+)["\']/', $content_to_check, $matches)) {
                $used_fonts = array_unique($matches[1]);
            }

            set_transient($cache_key, $used_fonts, 12 * HOUR_IN_SECONDS);
        }

        return $used_fonts;
    }

    /**
     * Enqueue frontend assets
     */
    public function enqueue_frontend_assets() {
        // Debug: Always enqueue to test
        $has_styled = $this->has_styled_content();

        // Only enqueue if content has styled headlines
        if (!$has_styled) {
            // DEBUG: Add HTML comment to see why fonts aren't loading
            add_action('wp_footer', function() {
                echo '<!-- HLS Debug: No styled content detected on this page -->';
            });
            return;
        }

        $suffix = (defined('SCRIPT_DEBUG') && SCRIPT_DEBUG) ? '' : '.min';

        wp_enqueue_style(
            'hls-frontend',
            HLS_PLUGIN_URL . "assets/css/frontend{$suffix}.css",
            array(),
            HLS_VERSION
        );

        // Enqueue custom fonts only when needed
        $this->enqueue_custom_fonts_optimized();

        // DEBUG: Add info about what fonts were detected
        $used_fonts = $this->get_used_fonts_in_content();
        add_action('wp_footer', function() use ($used_fonts) {
            echo '<!-- HLS Debug: Styled content found. Used fonts: ' . esc_html(implode(', ', $used_fonts)) . ' -->';
        });
    }

    /**
     * Optimized font enqueuing with caching - only loads fonts used on current page
     */
    public function enqueue_custom_fonts_optimized() {
        $all_fonts = $this->get_custom_fonts();

        if (empty($all_fonts)) {
            return;
        }

        // Get fonts actually used in this post's content
        $used_font_families = $this->get_used_fonts_in_content();

        // If no custom fonts are used, don't load any
        if (empty($used_font_families)) {
            return;
        }

        // Build cache key based on used fonts
        $cache_key = 'hls_font_css_' . md5(serialize($used_font_families));
        $combined_css = get_transient($cache_key);

        if (false === $combined_css) {
            $combined_css = '';

            // Only include fonts that are actually used
            foreach ($all_fonts as $font) {
                if (!empty($font['css_content']) && !empty($font['font_faces'])) {
                    // Check if any face from this font kit is used
                    $font_is_used = false;
                    foreach ($font['font_faces'] as $face) {
                        if (in_array($face['family'], $used_font_families)) {
                            $font_is_used = true;
                            break;
                        }
                    }

                    if ($font_is_used) {
                        // Sanitize CSS before adding
                        $combined_css .= "\n" . $this->sanitize_css_content($font['css_content']);
                    }
                }
            }

            // Minify (remove extra whitespace)
            $combined_css = preg_replace('/\s+/', ' ', $combined_css);

            // Cache for 24 hours
            set_transient($cache_key, $combined_css, DAY_IN_SECONDS);
        }

        if (!empty($combined_css)) {
            wp_add_inline_style('hls-frontend', $combined_css);

            // DEBUG: Confirm fonts were added
            add_action('wp_footer', function() use ($combined_css) {
                $css_length = strlen($combined_css);
                echo '<!-- HLS Debug: Font CSS added (' . $css_length . ' bytes) -->';
            });
        } else {
            // DEBUG: No CSS to add
            add_action('wp_footer', function() use ($all_fonts, $used_font_families) {
                echo '<!-- HLS Debug: No font CSS generated. Total font kits: ' . count($all_fonts) . ', Used families: ' . count($used_font_families) . ' -->';
            });
        }
    }

    /**
     * Add admin menu
     */
    public function add_admin_menu() {
        $hook = add_options_page(
            __('Headline Ligatures & Styles', 'headline-ligatures-styles'),
            __('Headline Typography', 'headline-ligatures-styles'),
            'manage_options',
            'headline-ligatures-styles',
            array($this, 'render_admin_page')
        );

        // Enqueue admin assets only on plugin page
        add_action('admin_print_styles-' . $hook, array($this, 'enqueue_admin_assets'));
        add_action('admin_print_scripts-' . $hook, array($this, 'enqueue_admin_assets'));
    }

    /**
     * Enqueue admin page assets
     */
    public function enqueue_admin_assets() {
        $suffix = (defined('SCRIPT_DEBUG') && SCRIPT_DEBUG) ? '' : '.min';

        wp_enqueue_style(
            'hls-admin',
            HLS_PLUGIN_URL . "assets/css/admin-page{$suffix}.css",
            array(),
            HLS_VERSION
        );

        wp_enqueue_script(
            'hls-admin',
            HLS_PLUGIN_URL . "assets/js/admin-page{$suffix}.js",
            array('jquery'),
            HLS_VERSION,
            true
        );

        // Enqueue custom fonts for preview
        $this->enqueue_custom_fonts_for_admin();

        // Localize script for translations and data
        wp_localize_script('hls-admin', 'hlsAdmin', array(
            'restUrl' => rest_url('hls/v1/'),
            'nonce' => wp_create_nonce('wp_rest'),
            'strings' => array(
                'confirmDelete' => __('Are you sure you want to delete this font kit?', 'headline-ligatures-styles'),
                'uploadError' => __('Failed to upload font kit.', 'headline-ligatures-styles'),
                'selectZip' => __('Please select a ZIP file (.zip)', 'headline-ligatures-styles'),
                'enterName' => __('Please enter a font kit name.', 'headline-ligatures-styles'),
                'selectFile' => __('Please select a ZIP file.', 'headline-ligatures-styles'),
                'uploadSuccess' => __('Font kit uploaded and processed successfully! Reloading page...', 'headline-ligatures-styles'),
                'deleteError' => __('Failed to delete font kit.', 'headline-ligatures-styles'),
                'noFonts' => __('No custom fonts uploaded yet.', 'headline-ligatures-styles'),
                'uploadPrompt' => __('Upload a webfont kit using the form below to add custom fonts with OpenType features.', 'headline-ligatures-styles'),
                'uploading' => __('Uploading', 'headline-ligatures-styles'),
                'uploadingZip' => __('Uploading ZIP file...', 'headline-ligatures-styles'),
                'processing' => __('Processing...', 'headline-ligatures-styles'),
                'uploadButton' => __('Upload Font Kit', 'headline-ligatures-styles')
            )
        ));
    }

    /**
     * Enqueue custom fonts for admin page preview
     */
    public function enqueue_custom_fonts_for_admin() {
        $fonts = $this->get_custom_fonts();

        if (empty($fonts)) {
            return;
        }

        // Cache combined font CSS
        $cache_key = 'hls_admin_font_css';
        $combined_css = get_transient($cache_key);

        if (false === $combined_css) {
            $combined_css = '';
            foreach ($fonts as $font) {
                if (!empty($font['css_content'])) {
                    // Sanitize CSS before adding
                    $combined_css .= "\n" . $this->sanitize_css_content($font['css_content']);
                }
            }

            // Minify (remove extra whitespace)
            $combined_css = preg_replace('/\s+/', ' ', $combined_css);

            // Cache for 24 hours
            set_transient($cache_key, $combined_css, DAY_IN_SECONDS);
        }

        if (!empty($combined_css)) {
            wp_add_inline_style('hls-admin', $combined_css);
        }
    }

    /**
     * Enqueue custom fonts for block rendering in editor canvas iframe
     * This is called by enqueue_block_assets hook
     */
    public function enqueue_custom_fonts_for_blocks() {
        $fonts = $this->get_custom_fonts();

        if (empty($fonts)) {
            return;
        }

        // Cache combined font CSS
        $cache_key = 'hls_block_font_css';
        $combined_css = get_transient($cache_key);

        if (false === $combined_css) {
            $combined_css = '';
            foreach ($fonts as $font) {
                if (!empty($font['css_content'])) {
                    // Sanitize CSS before adding
                    $combined_css .= "\n" . $this->sanitize_css_content($font['css_content']);
                }
            }

            // Minify (remove extra whitespace)
            $combined_css = preg_replace('/\s+/', ' ', $combined_css);

            // Cache for 24 hours
            set_transient($cache_key, $combined_css, DAY_IN_SECONDS);
        }

        if (!empty($combined_css)) {
            // Register and enqueue font CSS for blocks in editor iframe
            wp_register_style('hls-block-fonts', false);
            wp_enqueue_style('hls-block-fonts');
            wp_add_inline_style('hls-block-fonts', $combined_css);
        }
    }

    /**
     * Enqueue custom fonts for block editor (deprecated - keeping for popover preview)
     */
    public function enqueue_custom_fonts_for_editor() {
        $fonts = $this->get_custom_fonts();

        if (empty($fonts)) {
            return;
        }

        // Cache combined font CSS
        $cache_key = 'hls_editor_font_css';
        $combined_css = get_transient($cache_key);

        if (false === $combined_css) {
            $combined_css = '';
            foreach ($fonts as $font) {
                if (!empty($font['css_content'])) {
                    // Sanitize CSS before adding
                    $combined_css .= "\n" . $this->sanitize_css_content($font['css_content']);
                }
            }

            // Minify (remove extra whitespace)
            $combined_css = preg_replace('/\s+/', ' ', $combined_css);

            // Cache for 24 hours
            set_transient($cache_key, $combined_css, DAY_IN_SECONDS);
        }

        if (!empty($combined_css)) {
            // Register a separate handle for fonts in the popover/toolbar context
            wp_register_style('hls-editor-fonts', false);
            wp_enqueue_style('hls-editor-fonts');
            wp_add_inline_style('hls-editor-fonts', $combined_css);
        }
    }

    /**
     * Register settings
     */
    public function register_settings() {
        register_setting('hls_settings', 'hls_presets', array(
            'type' => 'array',
            'default' => $this->get_default_presets(),
            'sanitize_callback' => array($this, 'sanitize_presets')
        ));

        register_setting('hls_settings', 'hls_global_settings', array(
            'type' => 'array',
            'default' => array(),
            'sanitize_callback' => array($this, 'sanitize_global_settings')
        ));

        register_setting('hls_settings', 'hls_custom_fonts', array(
            'type' => 'array',
            'default' => array(),
            'sanitize_callback' => array($this, 'sanitize_custom_fonts')
        ));
    }

    /**
     * Register REST API routes
     */
    public function register_rest_routes() {
        register_rest_route('hls/v1', '/presets', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_presets_endpoint'),
            'permission_callback' => array($this, 'check_permissions')
        ));

        register_rest_route('hls/v1', '/presets', array(
            'methods' => 'POST',
            'callback' => array($this, 'save_preset_endpoint'),
            'permission_callback' => array($this, 'check_permissions')
        ));

        register_rest_route('hls/v1', '/presets/(?P<id>[a-zA-Z0-9_-]+)', array(
            'methods' => 'DELETE',
            'callback' => array($this, 'delete_preset_endpoint'),
            'permission_callback' => array($this, 'check_permissions')
        ));

        // Add features endpoint
        register_rest_route('hls/v1', '/features', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_features_endpoint'),
            'permission_callback' => array($this, 'check_permissions')
        ));

        register_rest_route('hls/v1', '/fonts', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_fonts_endpoint'),
            'permission_callback' => array($this, 'check_permissions')
        ));

        register_rest_route('hls/v1', '/fonts', array(
            'methods' => 'POST',
            'callback' => array($this, 'upload_font_endpoint'),
            'permission_callback' => function() {
                return current_user_can('upload_files');
            }
        ));

        register_rest_route('hls/v1', '/fonts/(?P<id>[a-zA-Z0-9_-]+)', array(
            'methods' => 'DELETE',
            'callback' => array($this, 'delete_font_endpoint'),
            'permission_callback' => function() {
                return current_user_can('upload_files');
            }
        ));
    }

    /**
     * Check REST API permissions with rate limiting
     */
    public function check_permissions($request = null) {
        // Check capability
        if (!current_user_can('edit_posts')) {
            return false;
        }

        // Rate limiting for write operations
        if ($request && in_array($request->get_method(), array('POST', 'DELETE', 'PUT', 'PATCH'))) {
            $user_id = get_current_user_id();
            $rate_limit_key = 'hls_rate_limit_' . $user_id;
            $requests = get_transient($rate_limit_key);

            if (false === $requests) {
                $requests = 1;
            } else {
                $requests++;
            }

            // Max 50 requests per minute
            if ($requests > 50) {
                return new WP_Error(
                    'rate_limit_exceeded',
                    __('Too many requests. Please try again later.', 'headline-ligatures-styles'),
                    array('status' => 429)
                );
            }

            set_transient($rate_limit_key, $requests, MINUTE_IN_SECONDS);
        }

        return true;
    }

    /**
     * Get presets with object caching
     */
    public function get_presets() {
        if (null === $this->presets_cache) {
            $this->presets_cache = get_option('hls_presets', $this->get_default_presets());
        }
        return $this->presets_cache;
    }

    /**
     * Get default presets (empty by default - users create their own)
     */
    private function get_default_presets() {
        return array();
    }

    /**
     * Get sample text for feature demonstrations
     */
    public function get_feature_demo_text($feature_id) {
        $demo_texts = array(
            // Ligatures
            'liga' => 'fi fl ff ffi ffl',
            'dlig' => 'ct st sp Th',
            'calt' => 'Beautiful Typography',

            // Stylistic Sets (generic - works for most)
            'ss01' => 'AaBbGgQqRr 1234567890',
            'ss02' => 'AaBbGgQqRr 1234567890',
            'ss03' => 'AaBbGgQqRr 1234567890',
            'ss04' => 'AaBbGgQqRr 1234567890',
            'ss05' => 'AaBbGgQqRr 1234567890',

            // Swashes & Alternates
            'swsh' => 'Elegant Flourish',
            'cswh' => 'Beautiful Swashes',
            'salt' => 'Alternative Glyphs',
            'titl' => 'TITLING CAPS',
            'ornm' => '* § ¶ † ‡ • ◆'
        );

        return isset($demo_texts[$feature_id]) ? $demo_texts[$feature_id] : 'Sample Text';
    }

    /**
     * Get available OpenType features with object caching
     */
    public function get_available_features() {
        if (null === $this->features_cache) {
            $this->features_cache = array(
                array(
                    'id' => 'liga',
                    'name' => __('Standard Ligatures', 'headline-ligatures-styles'),
                    'category' => 'ligatures',
                    'description' => __('Common letter combinations like fi, fl', 'headline-ligatures-styles')
                ),
                array(
                    'id' => 'dlig',
                    'name' => __('Discretionary Ligatures', 'headline-ligatures-styles'),
                    'category' => 'ligatures',
                    'description' => __('Optional decorative ligatures', 'headline-ligatures-styles')
                ),
                array(
                    'id' => 'calt',
                    'name' => __('Contextual Alternates', 'headline-ligatures-styles'),
                    'category' => 'ligatures',
                    'description' => __('Context-aware letter forms', 'headline-ligatures-styles')
                ),
                array(
                    'id' => 'ss01',
                    'name' => __('Stylistic Set 1', 'headline-ligatures-styles'),
                    'category' => 'stylistic-sets',
                    'description' => __('Alternate character designs', 'headline-ligatures-styles')
                ),
                array(
                    'id' => 'ss02',
                    'name' => __('Stylistic Set 2', 'headline-ligatures-styles'),
                    'category' => 'stylistic-sets',
                    'description' => __('Alternate character designs', 'headline-ligatures-styles')
                ),
                array(
                    'id' => 'ss03',
                    'name' => __('Stylistic Set 3', 'headline-ligatures-styles'),
                    'category' => 'stylistic-sets',
                    'description' => __('Alternate character designs', 'headline-ligatures-styles')
                ),
                array(
                    'id' => 'ss04',
                    'name' => __('Stylistic Set 4', 'headline-ligatures-styles'),
                    'category' => 'stylistic-sets',
                    'description' => __('Alternate character designs', 'headline-ligatures-styles')
                ),
                array(
                    'id' => 'ss05',
                    'name' => __('Stylistic Set 5', 'headline-ligatures-styles'),
                    'category' => 'stylistic-sets',
                    'description' => __('Alternate character designs', 'headline-ligatures-styles')
                ),
                array(
                    'id' => 'swsh',
                    'name' => __('Swashes', 'headline-ligatures-styles'),
                    'category' => 'alternates',
                    'description' => __('Decorative flourishes', 'headline-ligatures-styles')
                ),
                array(
                    'id' => 'cswh',
                    'name' => __('Contextual Swashes', 'headline-ligatures-styles'),
                    'category' => 'alternates',
                    'description' => __('Context-aware decorative flourishes', 'headline-ligatures-styles')
                ),
                array(
                    'id' => 'salt',
                    'name' => __('Stylistic Alternates', 'headline-ligatures-styles'),
                    'category' => 'alternates',
                    'description' => __('Alternative character forms', 'headline-ligatures-styles')
                ),
                array(
                    'id' => 'titl',
                    'name' => __('Titling', 'headline-ligatures-styles'),
                    'category' => 'alternates',
                    'description' => __('Optimized for large titles', 'headline-ligatures-styles')
                ),
                array(
                    'id' => 'ornm',
                    'name' => __('Ornaments', 'headline-ligatures-styles'),
                    'category' => 'decorative',
                    'description' => __('Decorative ornaments', 'headline-ligatures-styles')
                )
            );
        }
        return $this->features_cache;
    }

    /**
     * Sanitize presets
     */
    public function sanitize_presets($presets) {
        if (!is_array($presets)) {
            return $this->get_default_presets();
        }

        $sanitized = array();
        $available_features = array_column($this->get_available_features(), 'id');

        foreach ($presets as $preset) {
            // Skip invalid entries early
            if (!is_array($preset) ||
                !isset($preset['id'], $preset['name'], $preset['features']) ||
                !is_array($preset['features'])) {
                continue;
            }

            // Validate feature IDs
            $valid_features = array();
            foreach ($preset['features'] as $feature) {
                if (in_array($feature, $available_features, true)) {
                    $valid_features[] = sanitize_key($feature);
                }
            }

            if (empty($valid_features)) {
                continue;
            }

            $sanitized_preset = array(
                'id' => sanitize_key($preset['id']),
                'name' => sanitize_text_field($preset['name']),
                'features' => $valid_features,
                'description' => !empty($preset['description']) ? sanitize_text_field($preset['description']) : ''
            );

            // Add optional font-family field
            if (!empty($preset['fontFamily'])) {
                $sanitized_preset['fontFamily'] = sanitize_text_field($preset['fontFamily']);
            }

            $sanitized[] = $sanitized_preset;
        }

        return $sanitized;
    }

    /**
     * Sanitize global settings
     */
    public function sanitize_global_settings($settings) {
        if (!is_array($settings)) {
            return array();
        }

        $sanitized = array();

        // Define expected settings and their sanitization
        $allowed_keys = array(
            'enable_frontend_css' => 'absint',
            'default_features' => 'array',
            'allowed_blocks' => 'array',
        );

        foreach ($settings as $key => $value) {
            if (!isset($allowed_keys[$key])) {
                continue; // Skip unknown keys
            }

            switch ($allowed_keys[$key]) {
                case 'absint':
                    $sanitized[$key] = absint($value);
                    break;
                case 'array':
                    $sanitized[$key] = is_array($value) ? array_map('sanitize_text_field', $value) : array();
                    break;
                default:
                    $sanitized[$key] = sanitize_text_field($value);
            }
        }

        return $sanitized;
    }

    /**
     * REST endpoint: Get presets
     */
    public function get_presets_endpoint($request) {
        return rest_ensure_response($this->get_presets());
    }

    /**
     * REST endpoint: Get features
     */
    public function get_features_endpoint($request) {
        return rest_ensure_response($this->get_available_features());
    }

    /**
     * REST endpoint: Save preset
     */
    public function save_preset_endpoint($request) {
        $params = $request->get_json_params();

        // Validate required parameters
        if (empty($params['id']) || empty($params['name']) || empty($params['features'])) {
            return new WP_Error('missing_params', __('Missing required parameters', 'headline-ligatures-styles'), array('status' => 400));
        }

        if (!is_array($params['features']) || count($params['features']) === 0) {
            return new WP_Error('invalid_features', __('Features must be a non-empty array', 'headline-ligatures-styles'), array('status' => 400));
        }

        // Validate feature IDs
        $available_features = array_column($this->get_available_features(), 'id');
        foreach ($params['features'] as $feature) {
            if (!in_array($feature, $available_features, true)) {
                return new WP_Error('invalid_feature_id', sprintf(__('Invalid feature ID: %s', 'headline-ligatures-styles'), esc_html($feature)), array('status' => 400));
            }
        }

        $new_preset = array(
            'id' => sanitize_key($params['id']),
            'name' => sanitize_text_field($params['name']),
            'features' => array_map('sanitize_key', $params['features']),
            'description' => isset($params['description']) ? sanitize_text_field($params['description']) : ''
        );

        $presets = $this->get_presets();
        $presets[] = $new_preset;
        update_option('hls_presets', $presets);

        // Clear cache
        $this->clear_cache();

        return rest_ensure_response(array('success' => true, 'preset' => $new_preset));
    }

    /**
     * REST endpoint: Delete preset
     */
    public function delete_preset_endpoint($request) {
        $id = sanitize_key($request->get_param('id'));
        $presets = $this->get_presets();

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
                __('Preset not found', 'headline-ligatures-styles'),
                array('status' => 404)
            );
        }

        update_option('hls_presets', array_values($presets));
        $this->clear_cache();

        return rest_ensure_response(array('success' => true));
    }

    /**
     * Convert features array to CSS font-feature-settings string
     */
    public function features_to_css($features) {
        if (empty($features) || !is_array($features)) {
            return '';
        }

        $settings = array();
        foreach ($features as $feature) {
            $settings[] = '"' . sanitize_key($feature) . '"';
        }

        return implode(', ', $settings);
    }

    /**
     * Get custom fonts with object caching
     */
    public function get_custom_fonts() {
        if (null === $this->fonts_cache) {
            $this->fonts_cache = get_option('hls_custom_fonts', array());
        }
        return $this->fonts_cache;
    }

    /**
     * Clear object cache (call after updating options)
     */
    private function clear_cache() {
        $this->presets_cache = null;
        $this->fonts_cache = null;

        // Clear all font CSS caches
        delete_transient('hls_combined_font_css');
        delete_transient('hls_admin_font_css');
        delete_transient('hls_editor_font_css');
        delete_transient('hls_block_font_css');

        // Clear per-page font caches (all cached variations)
        global $wpdb;
        $wpdb->query("DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_hls_font_css_%'");
        $wpdb->query("DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_timeout_hls_font_css_%'");
        $wpdb->query("DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_hls_has_styled_%'");
        $wpdb->query("DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_timeout_hls_has_styled_%'");
        $wpdb->query("DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_hls_used_fonts_%'");
        $wpdb->query("DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_timeout_hls_used_fonts_%'");

        // Clear editor data cache for all users
        $this->invalidate_editor_data_cache();
    }

    /**
     * Invalidate editor data cache
     */
    private function invalidate_editor_data_cache($user_id = null) {
        if ($user_id) {
            delete_transient('hls_editor_data_' . $user_id);
        } else {
            // Clear for all users
            global $wpdb;
            $wpdb->query(
                $wpdb->prepare(
                    "DELETE FROM {$wpdb->options} WHERE option_name LIKE %s",
                    $wpdb->esc_like('_transient_hls_editor_data_') . '%'
                )
            );
        }
    }

    /**
     * Get upload directory for fonts
     */
    public function get_fonts_upload_dir() {
        $upload_dir = wp_upload_dir();
        $font_dir = $upload_dir['basedir'] . '/hls/fonts';
        $font_url = $upload_dir['baseurl'] . '/hls/fonts';

        return array(
            'path' => $font_dir,
            'url' => $font_url
        );
    }

    /**
     * Parse webfont kit CSS file
     */
    public function parse_webfont_kit($css_content) {
        $fonts = array();

        // Extract @font-face rules
        preg_match_all('/@font-face\s*\{([^}]+)\}/s', $css_content, $matches);

        foreach ($matches[1] as $font_face) {
            $font_data = array();

            // Extract font-family
            if (preg_match('/font-family:\s*["\']?([^"\';\n]+)["\']?/i', $font_face, $family_match)) {
                $font_data['family'] = trim($family_match[1]);
            }

            // Extract src URLs
            if (preg_match('/src:\s*([^;]+);/i', $font_face, $src_match)) {
                $font_data['src'] = trim($src_match[1]);
            }

            // Extract font-weight
            if (preg_match('/font-weight:\s*([^;]+);/i', $font_face, $weight_match)) {
                $font_data['weight'] = trim($weight_match[1]);
            } else {
                $font_data['weight'] = 'normal';
            }

            // Extract font-style
            if (preg_match('/font-style:\s*([^;]+);/i', $font_face, $style_match)) {
                $font_data['style'] = trim($style_match[1]);
            } else {
                $font_data['style'] = 'normal';
            }

            if (!empty($font_data['family'])) {
                $fonts[] = $font_data;
            }
        }

        return $fonts;
    }

    /**
     * Sanitize CSS content to prevent XSS
     */
    private function sanitize_css_content($css) {
        // Remove dangerous CSS expressions
        $css = preg_replace('/expression\s*\(/i', '', $css);
        $css = preg_replace('/-moz-binding\s*:/i', '', $css);

        // Remove javascript: protocol
        $css = preg_replace('/javascript\s*:/i', '', $css);

        // Only allow @font-face rules, remove other @ rules
        $css = preg_replace('/@(?!font-face)[a-z-]+/i', '', $css);

        // Validate URL schemes in url() - only allow http, https, data for fonts
        $css = preg_replace_callback(
            '/url\s*\(\s*["\']?([^"\')\s]+)["\']?\s*\)/i',
            function($matches) {
                $url = $matches[1];
                // Allow relative URLs, http, https, data URIs for fonts
                if (preg_match('/^(https?:|data:font\/|data:application\/font|\/)/i', $url)) {
                    return $matches[0];
                }
                return ''; // Remove invalid URLs
            },
            $css
        );

        return $css;
    }

    /**
     * Sanitize custom fonts
     */
    public function sanitize_custom_fonts($fonts) {
        if (!is_array($fonts)) {
            return array();
        }

        $sanitized = array();
        foreach ($fonts as $font) {
            if (isset($font['id']) && isset($font['name'])) {
                // Sanitize CSS content
                $css_content = isset($font['css_content']) ? $font['css_content'] : '';
                $sanitized_css = $this->sanitize_css_content($css_content);

                $sanitized_font = array(
                    'id' => sanitize_key($font['id']),
                    'name' => sanitize_text_field($font['name']),
                    'css_content' => $sanitized_css,
                    'font_faces' => isset($font['font_faces']) ? $font['font_faces'] : array(),
                    'uploaded_date' => isset($font['uploaded_date']) ? sanitize_text_field($font['uploaded_date']) : current_time('mysql')
                );

                // Add path/url fields if they exist
                if (isset($font['upload_path'])) {
                    $sanitized_font['upload_path'] = sanitize_text_field($font['upload_path']);
                }
                if (isset($font['upload_url'])) {
                    $sanitized_font['upload_url'] = esc_url_raw($font['upload_url']);
                }
                if (isset($font['file_count'])) {
                    $sanitized_font['file_count'] = absint($font['file_count']);
                }

                $sanitized[] = $sanitized_font;
            }
        }

        return $sanitized;
    }

    /**
     * REST endpoint: Get fonts
     */
    public function get_fonts_endpoint($request) {
        return rest_ensure_response($this->get_custom_fonts());
    }

    /**
     * REST endpoint: Upload font kit
     */
    public function upload_font_endpoint($request) {
        // Get uploaded file
        $files = $request->get_file_params();
        $params = $request->get_params();

        if (empty($files['zip_file']) || empty($params['name'])) {
            return new WP_Error('missing_data', __('Missing required font data', 'headline-ligatures-styles'), array('status' => 400));
        }

        $uploaded_file = $files['zip_file'];

        // Validate file type and extension more securely
        $file_info = wp_check_filetype_and_ext($uploaded_file['tmp_name'], $uploaded_file['name']);
        $ext = $file_info['ext'];
        $type = $file_info['type'];

        if (!$ext || !$type) {
            return new WP_Error('invalid_file', __('Invalid file type', 'headline-ligatures-styles'), array('status' => 400));
        }

        if ($ext !== 'zip' || !in_array($type, array('application/zip', 'application/x-zip-compressed'), true)) {
            return new WP_Error('invalid_file', __('Please upload a valid ZIP file', 'headline-ligatures-styles'), array('status' => 400));
        }

        // Validate file size (max 10MB)
        $max_size = 10 * 1024 * 1024; // 10MB
        if ($uploaded_file['size'] > $max_size) {
            return new WP_Error('file_too_large', sprintf(__('File size exceeds maximum allowed (%s)', 'headline-ligatures-styles'), size_format($max_size)), array('status' => 400));
        }

        // Check for upload errors
        if ($uploaded_file['error'] !== UPLOAD_ERR_OK) {
            return new WP_Error('upload_error', __('File upload error', 'headline-ligatures-styles'), array('status' => 400));
        }

        // Process the ZIP file
        $result = $this->process_font_kit_zip($uploaded_file, sanitize_text_field($params['name']));

        if (is_wp_error($result)) {
            return $result;
        }

        $fonts = $this->get_custom_fonts();
        $fonts[] = $result;
        update_option('hls_custom_fonts', $fonts);

        // Clear cache
        $this->clear_cache();

        return rest_ensure_response(array('success' => true, 'font' => $result));
    }

    /**
     * REST endpoint: Delete font
     */
    public function delete_font_endpoint($request) {
        $id = sanitize_key($request->get_param('id'));
        $fonts = $this->get_custom_fonts();

        // Find the font to delete and clean up files
        $font_to_delete = null;
        foreach ($fonts as $font) {
            if ($font['id'] === $id) {
                $font_to_delete = $font;
                break;
            }
        }

        // Delete uploaded files if path exists
        if ($font_to_delete && !empty($font_to_delete['upload_path'])) {
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

        if (!$found) {
            return new WP_Error('font_not_found', __('Font not found', 'headline-ligatures-styles'), array('status' => 404));
        }

        update_option('hls_custom_fonts', array_values($fonts));

        // Clear cache
        $this->clear_cache();

        return rest_ensure_response(array('success' => true));
    }

    /**
     * Process uploaded font kit ZIP file
     */
    public function process_font_kit_zip($uploaded_file, $kit_name) {
        // Increase timeout for large files
        if (!ini_get('safe_mode')) {
            @set_time_limit(300); // 5 minutes
        }

        // Create unique kit ID and directory
        $kit_id = 'kit-' . time() . '-' . wp_generate_password(8, false);
        $upload_dir = wp_upload_dir();
        $kit_base_path = $upload_dir['basedir'] . '/hls/fonts/' . $kit_id;
        $kit_base_url = $upload_dir['baseurl'] . '/hls/fonts/' . $kit_id;

        // Create directory
        if (!wp_mkdir_p($kit_base_path)) {
            return new WP_Error('mkdir_failed', __('Failed to create upload directory', 'headline-ligatures-styles'));
        }

        // Initialize WordPress filesystem
        require_once(ABSPATH . 'wp-admin/includes/file.php');
        WP_Filesystem();
        global $wp_filesystem;

        // Extract ZIP file
        $unzip_result = unzip_file($uploaded_file['tmp_name'], $kit_base_path);

        if (is_wp_error($unzip_result)) {
            // Clean up on failure
            $wp_filesystem->rmdir($kit_base_path, true);
            // Log the actual error for administrators
            error_log('HLS: ZIP extraction failed - ' . $unzip_result->get_error_message());
            // Return generic message to users
            return new WP_Error('unzip_failed', __('Failed to extract ZIP file. Please ensure the file is a valid ZIP archive.', 'headline-ligatures-styles'), array('status' => 400));
        }

        // Validate extracted files - only allow CSS, WOFF, WOFF2, TTF, OTF, EOT
        $all_files = list_files($kit_base_path, 100);
        $allowed_extensions = array('css', 'woff', 'woff2', 'ttf', 'otf', 'eot', 'svg');

        foreach ($all_files as $file) {
            $file_ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));

            // Delete any non-allowed file types
            if (!in_array($file_ext, $allowed_extensions, true)) {
                @unlink($file);
            }

            // Prevent PHP execution
            if (in_array($file_ext, array('php', 'php3', 'php4', 'php5', 'phtml', 'phps'), true)) {
                @unlink($file);
            }

            // Validate file is within expected directory
            $real_path = realpath($file);
            $real_base = realpath($kit_base_path);
            if ($real_path === false || $real_base === false || strpos($real_path, $real_base) !== 0) {
                @unlink($file);
            }
        }

        // Find CSS file using DirectoryIterator
        $css_file_path = null;
        try {
            $iterator = new RecursiveDirectoryIterator($kit_base_path, RecursiveDirectoryIterator::SKIP_DOTS);
            foreach (new RecursiveIteratorIterator($iterator) as $file) {
                if ($file->isFile() && strtolower($file->getExtension()) === 'css') {
                    $css_file_path = $file->getPathname();
                    break; // Use first CSS file found
                }
            }
        } catch (Exception $e) {
            $wp_filesystem->rmdir($kit_base_path, true);
            return new WP_Error('iterator_failed', __('Failed to process font kit', 'headline-ligatures-styles'));
        }

        if (!$css_file_path) {
            $wp_filesystem->rmdir($kit_base_path, true);
            return new WP_Error('no_css', __('No CSS file found in the font kit', 'headline-ligatures-styles'));
        }

        // Validate it's a real file, not a symlink
        if (!is_file($css_file_path) || is_link($css_file_path)) {
            $wp_filesystem->rmdir($kit_base_path, true);
            return new WP_Error('invalid_css', __('Invalid CSS file', 'headline-ligatures-styles'));
        }

        // Check CSS file size (max 1MB)
        $file_size = filesize($css_file_path);
        if ($file_size > 1024 * 1024) {
            $wp_filesystem->rmdir($kit_base_path, true);
            return new WP_Error('css_too_large', __('CSS file is too large (max 1MB)', 'headline-ligatures-styles'));
        }

        // Use WP Filesystem API
        $css_content = $wp_filesystem->get_contents($css_file_path);

        if ($css_content === false) {
            $wp_filesystem->rmdir($kit_base_path, true);
            return new WP_Error('css_read_error', __('Could not read CSS file', 'headline-ligatures-styles'));
        }

        // Validate it looks like CSS (basic check)
        if (!preg_match('/@font-face\s*\{/i', $css_content)) {
            $wp_filesystem->rmdir($kit_base_path, true);
            return new WP_Error('invalid_css', __('CSS file does not contain @font-face declarations', 'headline-ligatures-styles'));
        }

        // Get the directory where the CSS file is located (relative to kit_base_path)
        $css_dir = dirname($css_file_path);
        $css_relative_dir = str_replace($kit_base_path, '', $css_dir);

        // Convert Windows backslashes to forward slashes for URLs
        $css_relative_dir = str_replace('\\', '/', $css_relative_dir);

        $css_base_url = $kit_base_url . $css_relative_dir;

        // Rewrite URLs in CSS to point to WordPress uploads
        $css_content = $this->rewrite_css_urls($css_content, $css_base_url);

        // Parse font families
        $font_faces = $this->parse_webfont_kit($css_content);

        if (empty($font_faces)) {
            // Clean up on failure
            $wp_filesystem->rmdir($kit_base_path, true);
            return new WP_Error('invalid_css', __('No valid @font-face rules found in CSS', 'headline-ligatures-styles'));
        }

        // Count font files more efficiently
        $font_count = 0;
        $extensions = array('woff', 'woff2', 'ttf', 'otf', 'eot');

        try {
            $iterator = new RecursiveDirectoryIterator($kit_base_path, RecursiveDirectoryIterator::SKIP_DOTS);
            foreach (new RecursiveIteratorIterator($iterator) as $file) {
                if ($file->isFile() && in_array(strtolower($file->getExtension()), $extensions, true)) {
                    $font_count++;
                }
            }
        } catch (Exception $e) {
            // Continue anyway, font_count will just be 0
        }

        return array(
            'id' => sanitize_key($kit_id),
            'name' => sanitize_text_field($kit_name),
            'css_content' => $css_content,
            'font_faces' => $font_faces,
            'upload_path' => $kit_base_path,
            'upload_url' => $kit_base_url,
            'file_count' => $font_count,
            'uploaded_date' => current_time('mysql')
        );
    }

    /**
     * Rewrite relative URLs in CSS to absolute WordPress URLs
     */
    public function rewrite_css_urls($css_content, $base_url) {
        // Replace url('path') with url('absolute-path')
        $css_content = preg_replace_callback(
            "/url\s*\(\s*['\"]?([^)'\"\s]+)['\"]?\s*\)/i",
            function($matches) use ($base_url) {
                $url = $matches[1];

                // Skip if already absolute URL or data URI
                if (preg_match('/^(https?:)?\/\//', $url) || strpos($url, 'data:') === 0) {
                    return $matches[0];
                }

                // Convert relative to absolute
                $absolute_url = rtrim($base_url, '/') . '/' . ltrim($url, '/');
                return "url('" . $absolute_url . "')";
            },
            $css_content
        );

        return $css_content;
    }

    /**
     * Secure upload directory
     */
    public function secure_upload_directory() {
        $upload_dir = wp_upload_dir();
        $font_dir = $upload_dir['basedir'] . '/hls/fonts';

        if (!file_exists($font_dir)) {
            wp_mkdir_p($font_dir);
        }

        // Add .htaccess to prevent PHP execution
        $htaccess_file = $font_dir . '/.htaccess';
        if (!file_exists($htaccess_file)) {
            $htaccess_content = "# Prevent PHP execution\n";
            $htaccess_content .= "<FilesMatch \"\\.php$\">\n";
            $htaccess_content .= "    Deny from all\n";
            $htaccess_content .= "</FilesMatch>\n";
            $htaccess_content .= "# Prevent directory listing\n";
            $htaccess_content .= "Options -Indexes\n";

            @file_put_contents($htaccess_file, $htaccess_content);
        }

        // Add index.php to prevent directory listing
        $index_file = $font_dir . '/index.php';
        if (!file_exists($index_file)) {
            @file_put_contents($index_file, '<?php // Silence is golden');
        }
    }

    /**
     * Render admin page
     */
    public function render_admin_page() {
        // Verify user has permission
        if (!current_user_can('manage_options')) {
            wp_die(__('You do not have sufficient permissions to access this page.', 'headline-ligatures-styles'));
        }

        include HLS_PLUGIN_DIR . 'includes/admin-page.php';
    }
}

// Initialize plugin
function hls_init() {
    return Headline_Ligatures_Styles::get_instance();
}

// Start plugin
add_action('plugins_loaded', 'hls_init');

<?php
/**
 * Plugin Name: OpenType Stylist
 * Plugin URI: https://github.com/mattcowan/opentype-stylist
 * Description: Add advanced OpenType features (ligatures, stylistic sets, swashes) to headlines with inline text selection and live preview.
 * Version: 1.0.0
 * Author: Matthew Cowan
 * Author URI: https://mnc4.com
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: opentype-stylist
 * Domain Path: /languages
 * Requires at least: 5.8
 * Requires PHP: 7.4
 */

// Exit if accessed directly
if (!defined('ABSPATH')) {
    exit;
}

// Define plugin constants
define('OTS_VERSION', '1.1.0');
define('OTS_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('OTS_PLUGIN_URL', plugin_dir_url(__FILE__));
define('OTS_PLUGIN_BASENAME', plugin_basename(__FILE__));

/**
 * Main plugin class
 */
class OpenType_Stylist {

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
    private $manual_fonts_cache = null;

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

        // Register custom block
        add_action('init', array($this, 'register_block'));

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
     * Enqueue block assets (loads in both editor iframe and frontend)
     * This hook fires for both editor and frontend
     */
    public function enqueue_block_assets() {
        // Only load fonts in editor context, not frontend
        // Frontend uses enqueue_frontend_assets() with optimized loading
        if (is_admin()) {
            $this->enqueue_custom_fonts_for_blocks();
            $this->enqueue_adobe_fonts();
        }
    }

    /**
     * Enqueue block editor assets (toolbar, popover, etc.)
     */
    public function enqueue_block_editor_assets() {
        $suffix = (defined('SCRIPT_DEBUG') && SCRIPT_DEBUG) ? '' : '.min';

        // Enqueue fonts for popover preview
        $this->enqueue_custom_fonts_for_editor();
        $this->enqueue_adobe_fonts();

        // Editor styles
        wp_enqueue_style(
            'ots-block-editor',
            OTS_PLUGIN_URL . "assets/css/block-editor{$suffix}.css",
            array('wp-edit-blocks'),
            OTS_VERSION
        );

        // Editor JavaScript
        wp_enqueue_script(
            'ots-block-editor',
            OTS_PLUGIN_URL . "assets/js/block-editor{$suffix}.js",
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
            OTS_VERSION,
            true
        );

        // Enable JavaScript translations
        wp_set_script_translations(
            'ots-block-editor',
            'opentype-stylist',
            OTS_PLUGIN_DIR . 'languages'
        );

        // Cache the localized data with transient
        $cache_key = 'ots_editor_data_' . get_current_user_id();
        $localized_data = get_transient($cache_key);

        if (false === $localized_data) {
            $localized_data = array(
                'presets' => $this->get_presets(),
                'features' => $this->get_available_features(),
                'fonts' => $this->get_custom_fonts(),
                'adobeFonts' => $this->get_adobe_fonts(),
                'manualFonts' => $this->get_manual_fonts(),
                'restUrl' => rest_url('ots/v1/'),
                'nonce' => wp_create_nonce('wp_rest'),
                'enableAriaLabels' => get_option('ots_enable_aria_labels', false)
            );

            // Cache for 1 hour
            set_transient($cache_key, $localized_data, HOUR_IN_SECONDS);
        }

        // Pass data to JavaScript
        wp_localize_script('ots-block-editor', 'otsData', $localized_data);
    }

    /**
     * Check if current page has styled content
     * Works for both singular posts and archive pages with multiple posts
     */
    private function has_styled_content() {
        global $wp_query;

        if (is_singular()) {
            // Single post/page - check just this post
            global $post;
            if (!isset($post->ID)) {
                return false;
            }

            // Cache the result per post
            $cache_key = 'ots_has_styled_' . $post->ID;
            $has_styled = get_transient($cache_key);

            if (false === $has_styled) {
                // Check both raw content and rendered content (for Gutenberg blocks)
                $raw_content = $post->post_content;

                // Apply content filters to render Gutenberg blocks
                $rendered_content = apply_filters('the_content', $raw_content);

                // Check if ots-styled class exists in either raw or rendered content
                $has_styled = (strpos($raw_content, 'ots-styled') !== false ||
                              strpos($rendered_content, 'ots-styled') !== false) ? 'yes' : 'no';

                set_transient($cache_key, $has_styled, 12 * HOUR_IN_SECONDS);
            }

            return $has_styled === 'yes';
        } else {
            // Archive page - check all posts in the loop
            if (empty($wp_query->posts)) {
                return false;
            }

            // Build cache key from all post IDs on this page
            $post_ids = wp_list_pluck($wp_query->posts, 'ID');
            $cache_key = 'ots_has_styled_archive_' . md5(serialize($post_ids));
            $has_styled = get_transient($cache_key);

            if (false === $has_styled) {
                $has_styled = 'no';

                // Check each post in the loop
                foreach ($wp_query->posts as $loop_post) {
                    $raw_content = $loop_post->post_content;
                    $rendered_content = apply_filters('the_content', $raw_content);

                    if (strpos($raw_content, 'ots-styled') !== false ||
                        strpos($rendered_content, 'ots-styled') !== false) {
                        $has_styled = 'yes';
                        break; // Found styled content, no need to check more
                    }
                }

                set_transient($cache_key, $has_styled, 12 * HOUR_IN_SECONDS);
            }

            return $has_styled === 'yes';
        }
    }

    /**
     * Get fonts used in current page content
     * Works for both singular posts and archive pages with multiple posts
     */
    private function get_used_fonts_in_content() {
        global $wp_query;

        if (is_singular()) {
            // Single post/page - check just this post
            global $post;
            if (!isset($post->ID)) {
                return array();
            }

            // Cache the result per post
            $cache_key = 'ots_used_fonts_' . $post->ID;
            $used_fonts = get_transient($cache_key);

            if (false === $used_fonts) {
                $used_fonts = array();

                // Method 1: Parse block attributes directly (most reliable)
                $blocks = parse_blocks($post->post_content);
                $this->extract_fonts_from_blocks($blocks, $used_fonts);

                // Method 2: Look for data-font attributes in HTML (for inline formats and backward compatibility)
                $raw_content = $post->post_content;
                $rendered_content = apply_filters('the_content', $raw_content);
                $content_to_check = $raw_content . ' ' . $rendered_content;

                if (preg_match_all('/data-font=["\']([^"\']+)["\']/', $content_to_check, $matches)) {
                    $used_fonts = array_merge($used_fonts, $matches[1]);
                }

                // Remove duplicates and empty values
                $used_fonts = array_filter(array_unique($used_fonts));

                set_transient($cache_key, $used_fonts, 12 * HOUR_IN_SECONDS);
            }

            return $used_fonts;
        } else {
            // Archive page - check all posts in the loop
            if (empty($wp_query->posts)) {
                return array();
            }

            // Build cache key from all post IDs on this page
            $post_ids = wp_list_pluck($wp_query->posts, 'ID');
            $cache_key = 'ots_used_fonts_archive_' . md5(serialize($post_ids));
            $used_fonts = get_transient($cache_key);

            if (false === $used_fonts) {
                $used_fonts = array();

                // Check each post in the loop
                foreach ($wp_query->posts as $loop_post) {
                    // Method 1: Parse block attributes directly
                    $blocks = parse_blocks($loop_post->post_content);
                    $this->extract_fonts_from_blocks($blocks, $used_fonts);

                    // Method 2: Look for data-font attributes in HTML
                    $raw_content = $loop_post->post_content;
                    $rendered_content = apply_filters('the_content', $raw_content);
                    $content_to_check = $raw_content . ' ' . $rendered_content;

                    if (preg_match_all('/data-font=["\']([^"\']+)["\']/', $content_to_check, $matches)) {
                        $used_fonts = array_merge($used_fonts, $matches[1]);
                    }
                }

                // Remove duplicates and empty values
                $used_fonts = array_filter(array_unique($used_fonts));

                set_transient($cache_key, $used_fonts, 12 * HOUR_IN_SECONDS);
            }

            return $used_fonts;
        }
    }

    /**
     * Recursively extract fontFamily from OpenType Stylist blocks
     *
     * @param array $blocks Array of parsed blocks
     * @param array &$fonts Array to collect font families (passed by reference)
     */
    private function extract_fonts_from_blocks($blocks, &$fonts) {
        foreach ($blocks as $block) {
            // Check if this is an OpenType Stylist block with a fontFamily attribute
            if ($block['blockName'] === 'opentype-stylist/block' &&
                isset($block['attrs']['fontFamily']) &&
                !empty($block['attrs']['fontFamily'])) {
                $fonts[] = $block['attrs']['fontFamily'];
            }

            // Recursively check inner blocks
            if (!empty($block['innerBlocks'])) {
                $this->extract_fonts_from_blocks($block['innerBlocks'], $fonts);
            }
        }
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
                echo '<!-- OTS Debug: No styled content detected on this page -->';
            });
            return;
        }

        $suffix = (defined('SCRIPT_DEBUG') && SCRIPT_DEBUG) ? '' : '.min';

        wp_enqueue_style(
            'ots-frontend',
            OTS_PLUGIN_URL . "assets/css/frontend{$suffix}.css",
            array(),
            OTS_VERSION
        );

        // Enqueue custom fonts only when needed
        $this->enqueue_custom_fonts_optimized();

        // Enqueue Adobe Fonts (always load if configured, they're lightweight)
        $this->enqueue_adobe_fonts();

        // DEBUG: Add info about what fonts were detected
        $used_fonts = $this->get_used_fonts_in_content();
        add_action('wp_footer', function() use ($used_fonts) {
            echo '<!-- OTS Debug: Styled content found. Used fonts: ' . esc_html(implode(', ', $used_fonts)) . ' -->';
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

        // Parse font families from CSS font-family values (which may include fallbacks)
        // E.g., "My Font, Arial, sans-serif" -> ["My Font", "Arial", "sans-serif"]
        $parsed_font_families = array();
        foreach ($used_font_families as $font_family_value) {
            // Split by comma and trim each part
            $families = array_map('trim', explode(',', $font_family_value));
            foreach ($families as $family) {
                // Remove quotes if present
                $family = trim($family, '"\'');
                if (!empty($family)) {
                    $parsed_font_families[] = $family;
                }
            }
        }
        $parsed_font_families = array_unique($parsed_font_families);

        // Build cache key based on used fonts
        $cache_key = 'ots_font_css_' . md5(serialize($used_font_families));
        $combined_css = get_transient($cache_key);

        if (false === $combined_css) {
            $combined_css = '';

            // Only include fonts that are actually used
            foreach ($all_fonts as $font) {
                if (!empty($font['css_content']) && !empty($font['font_faces'])) {
                    // Check if any face from this font kit is used
                    $font_is_used = false;
                    foreach ($font['font_faces'] as $face) {
                        if (in_array($face['family'], $parsed_font_families)) {
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
            wp_add_inline_style('ots-frontend', $combined_css);

            // DEBUG: Confirm fonts were added
            add_action('wp_footer', function() use ($combined_css) {
                $css_length = strlen($combined_css);
                echo '<!-- OTS Debug: Font CSS added (' . esc_html($css_length) . ' bytes) -->';
            });
        } else {
            // DEBUG: No CSS to add
            add_action('wp_footer', function() use ($all_fonts, $used_font_families) {
                echo '<!-- OTS Debug: No font CSS generated. Total font kits: ' . absint(count($all_fonts)) . ', Used families: ' . absint(count($used_font_families)) . ' -->';
            });
        }
    }

    /**
     * Add admin menu
     */
    public function add_admin_menu() {
        $hook = add_options_page(
            esc_html__('OpenType Stylist', 'opentype-stylist'),
            esc_html__('OpenType Stylist', 'opentype-stylist'),
            'manage_options',
            'opentype-stylist',
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
            'ots-admin',
            OTS_PLUGIN_URL . "assets/css/admin-page{$suffix}.css",
            array(),
            OTS_VERSION
        );

        wp_enqueue_script(
            'ots-admin',
            OTS_PLUGIN_URL . "assets/js/admin-page{$suffix}.js",
            array('jquery'),
            OTS_VERSION,
            true
        );

        // Enqueue custom fonts for preview
        $this->enqueue_custom_fonts_for_admin();
        $this->enqueue_adobe_fonts();

        // Localize script for translations and data
        wp_localize_script('ots-admin', 'otsAdmin', array(
            'restUrl' => rest_url('ots/v1/'),
            'nonce' => wp_create_nonce('wp_rest'),
            'strings' => array(
                'confirmDelete' => esc_html__('Are you sure you want to delete this font kit?', 'opentype-stylist'),
                'uploadError' => esc_html__('Failed to upload font kit.', 'opentype-stylist'),
                'selectZip' => esc_html__('Please select a ZIP file (.zip)', 'opentype-stylist'),
                'enterName' => esc_html__('Please enter a font kit name.', 'opentype-stylist'),
                'selectFile' => esc_html__('Please select a ZIP file.', 'opentype-stylist'),
                'uploadSuccess' => esc_html__('Font kit uploaded and processed successfully! Reloading page...', 'opentype-stylist'),
                'deleteError' => esc_html__('Failed to delete font kit.', 'opentype-stylist'),
                'noFonts' => esc_html__('No custom fonts uploaded yet.', 'opentype-stylist'),
                'uploadPrompt' => esc_html__('Upload a webfont kit using the form below to add custom fonts with OpenType features.', 'opentype-stylist'),
                'uploading' => esc_html__('Uploading', 'opentype-stylist'),
                'uploadingZip' => esc_html__('Uploading ZIP file...', 'opentype-stylist'),
                'processing' => esc_html__('Processing...', 'opentype-stylist'),
                'uploadButton' => esc_html__('Upload Font Kit', 'opentype-stylist'),
                // Adobe Fonts strings
                'enterAdobeProjectName' => esc_html__('Please enter a project name.', 'opentype-stylist'),
                'enterAdobeEmbedCode' => esc_html__('Please paste the Adobe Fonts embed code.', 'opentype-stylist'),
                'enterAdobeFontFamilies' => esc_html__('Please enter at least one font family name.', 'opentype-stylist'),
                'adding' => esc_html__('Adding...', 'opentype-stylist'),
                'adobeFontSuccess' => esc_html__('Adobe Fonts project added successfully! Reloading page...', 'opentype-stylist'),
                'addAdobeFontError' => esc_html__('Failed to add Adobe Fonts project.', 'opentype-stylist'),
                'addAdobeFontButton' => esc_html__('Add Adobe Fonts Project', 'opentype-stylist'),
                'confirmDeleteAdobeFont' => esc_html__('Are you sure you want to delete this Adobe Fonts project?', 'opentype-stylist'),
                'deleteAdobeFontError' => esc_html__('Failed to delete Adobe Fonts project.', 'opentype-stylist'),
                // Manual/Custom Fonts strings
                'enterManualFontName' => esc_html__('Please enter a font name.', 'opentype-stylist'),
                'enterFontFamily' => esc_html__('Please enter a CSS font-family value.', 'opentype-stylist'),
                'manualFontSuccess' => esc_html__('Custom font added successfully! Reloading page...', 'opentype-stylist'),
                'addManualFontError' => esc_html__('Failed to add custom font.', 'opentype-stylist'),
                'addManualFontButton' => esc_html__('Add Custom Font', 'opentype-stylist'),
                'confirmDeleteManualFont' => esc_html__('Are you sure you want to delete this custom font?', 'opentype-stylist'),
                'deleteManualFontError' => esc_html__('Failed to delete custom font.', 'opentype-stylist')
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
        $cache_key = 'ots_admin_font_css';
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
            wp_add_inline_style('ots-admin', $combined_css);
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
        $cache_key = 'ots_block_font_css';
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
            wp_register_style('ots-block-fonts', false, array(), OTS_VERSION);
            wp_enqueue_style('ots-block-fonts');
            wp_add_inline_style('ots-block-fonts', $combined_css);
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
        $cache_key = 'ots_editor_font_css';
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
            wp_register_style('ots-editor-fonts', false, array(), OTS_VERSION);
            wp_enqueue_style('ots-editor-fonts');
            wp_add_inline_style('ots-editor-fonts', $combined_css);
        }
    }

    /**
     * Register settings
     */
    public function register_settings() {
        register_setting('ots_settings', 'ots_presets', array(
            'type' => 'array',
            'default' => $this->get_default_presets(),
            'sanitize_callback' => array($this, 'sanitize_presets')
        ));

        register_setting('ots_settings', 'ots_global_settings', array(
            'type' => 'array',
            'default' => array(),
            'sanitize_callback' => array($this, 'sanitize_global_settings')
        ));

        register_setting('ots_settings', 'ots_custom_fonts', array(
            'type' => 'array',
            'default' => array(),
            'sanitize_callback' => array($this, 'sanitize_custom_fonts')
        ));

        register_setting('ots_settings', 'ots_adobe_fonts', array(
            'type' => 'array',
            'default' => array(),
            'sanitize_callback' => array($this, 'sanitize_adobe_fonts')
        ));

        register_setting('ots_settings', 'ots_manual_fonts', array(
            'type' => 'array',
            'default' => array(),
            'sanitize_callback' => array($this, 'sanitize_manual_fonts')
        ));
    }

    /**
     * Register custom block
     */
    public function register_block() {
        register_block_type(OTS_PLUGIN_DIR . 'blocks/opentype-stylist');
    }

    /**
     * Register REST API routes
     */
    public function register_rest_routes() {
        register_rest_route('ots/v1', '/presets', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_presets_endpoint'),
            'permission_callback' => array($this, 'check_permissions')
        ));

        register_rest_route('ots/v1', '/presets', array(
            'methods' => 'POST',
            'callback' => array($this, 'save_preset_endpoint'),
            'permission_callback' => array($this, 'check_permissions')
        ));

        register_rest_route('ots/v1', '/presets/(?P<id>[a-zA-Z0-9_-]+)', array(
            'methods' => 'DELETE',
            'callback' => array($this, 'delete_preset_endpoint'),
            'permission_callback' => array($this, 'check_permissions')
        ));

        // Add features endpoint
        register_rest_route('ots/v1', '/features', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_features_endpoint'),
            'permission_callback' => array($this, 'check_permissions')
        ));

        register_rest_route('ots/v1', '/fonts', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_fonts_endpoint'),
            'permission_callback' => array($this, 'check_permissions')
        ));

        register_rest_route('ots/v1', '/fonts', array(
            'methods' => 'POST',
            'callback' => array($this, 'upload_font_endpoint'),
            'permission_callback' => function() {
                return current_user_can('upload_files');
            }
        ));

        register_rest_route('ots/v1', '/fonts/(?P<id>[a-zA-Z0-9_-]+)', array(
            'methods' => 'DELETE',
            'callback' => array($this, 'delete_font_endpoint'),
            'permission_callback' => function() {
                return current_user_can('upload_files');
            }
        ));

        // Adobe Fonts endpoints
        register_rest_route('ots/v1', '/adobe-fonts', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_adobe_fonts_endpoint'),
            'permission_callback' => array($this, 'check_permissions')
        ));

        register_rest_route('ots/v1', '/adobe-fonts', array(
            'methods' => 'POST',
            'callback' => array($this, 'add_adobe_font_endpoint'),
            'permission_callback' => function() {
                return current_user_can('upload_files');
            }
        ));

        register_rest_route('ots/v1', '/adobe-fonts/(?P<id>[a-zA-Z0-9_-]+)', array(
            'methods' => 'DELETE',
            'callback' => array($this, 'delete_adobe_font_endpoint'),
            'permission_callback' => function() {
                return current_user_can('upload_files');
            }
        ));

        register_rest_route('ots/v1', '/adobe-fonts/(?P<id>[a-zA-Z0-9_-]+)/fallback', array(
            'methods' => 'PATCH',
            'callback' => array($this, 'update_adobe_font_fallback_endpoint'),
            'permission_callback' => function() {
                return current_user_can('edit_posts');
            }
        ));

        // Manual fonts endpoints
        register_rest_route('ots/v1', '/manual-fonts', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_manual_fonts_endpoint'),
            'permission_callback' => array($this, 'check_permissions')
        ));

        register_rest_route('ots/v1', '/manual-fonts', array(
            'methods' => 'POST',
            'callback' => array($this, 'add_manual_font_endpoint'),
            'permission_callback' => function() {
                return current_user_can('edit_posts');
            }
        ));

        register_rest_route('ots/v1', '/manual-fonts/(?P<id>[a-zA-Z0-9_-]+)', array(
            'methods' => 'DELETE',
            'callback' => array($this, 'delete_manual_font_endpoint'),
            'permission_callback' => function() {
                return current_user_can('edit_posts');
            }
        ));

        // Fallback endpoint for uploaded fonts
        register_rest_route('ots/v1', '/fonts/(?P<id>[a-zA-Z0-9_-]+)/fallback', array(
            'methods' => 'PATCH',
            'callback' => array($this, 'update_font_fallback_endpoint'),
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
            $rate_limit_key = 'ots_rate_limit_' . $user_id;
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
                    esc_html__('Too many requests. Please try again later.', 'opentype-stylist'),
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
            $this->presets_cache = get_option('ots_presets', $this->get_default_presets());
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
                    'name' => esc_html__('Standard Ligatures', 'opentype-stylist'),
                    'category' => 'ligatures',
                    'description' => esc_html__('Common letter combinations like fi, fl', 'opentype-stylist')
                ),
                array(
                    'id' => 'dlig',
                    'name' => esc_html__('Discretionary Ligatures', 'opentype-stylist'),
                    'category' => 'ligatures',
                    'description' => esc_html__('Optional decorative ligatures', 'opentype-stylist')
                ),
                array(
                    'id' => 'calt',
                    'name' => esc_html__('Contextual Alternates', 'opentype-stylist'),
                    'category' => 'ligatures',
                    'description' => esc_html__('Context-aware letter forms', 'opentype-stylist')
                ),
                array(
                    'id' => 'ss01',
                    'name' => esc_html__('Stylistic Set 1', 'opentype-stylist'),
                    'category' => 'stylistic-sets',
                    'description' => esc_html__('Alternate character designs', 'opentype-stylist')
                ),
                array(
                    'id' => 'ss02',
                    'name' => esc_html__('Stylistic Set 2', 'opentype-stylist'),
                    'category' => 'stylistic-sets',
                    'description' => esc_html__('Alternate character designs', 'opentype-stylist')
                ),
                array(
                    'id' => 'ss03',
                    'name' => esc_html__('Stylistic Set 3', 'opentype-stylist'),
                    'category' => 'stylistic-sets',
                    'description' => esc_html__('Alternate character designs', 'opentype-stylist')
                ),
                array(
                    'id' => 'ss04',
                    'name' => esc_html__('Stylistic Set 4', 'opentype-stylist'),
                    'category' => 'stylistic-sets',
                    'description' => esc_html__('Alternate character designs', 'opentype-stylist')
                ),
                array(
                    'id' => 'ss05',
                    'name' => esc_html__('Stylistic Set 5', 'opentype-stylist'),
                    'category' => 'stylistic-sets',
                    'description' => esc_html__('Alternate character designs', 'opentype-stylist')
                ),
                array(
                    'id' => 'swsh',
                    'name' => esc_html__('Swashes', 'opentype-stylist'),
                    'category' => 'alternates',
                    'description' => esc_html__('Decorative flourishes', 'opentype-stylist')
                ),
                array(
                    'id' => 'cswh',
                    'name' => esc_html__('Contextual Swashes', 'opentype-stylist'),
                    'category' => 'alternates',
                    'description' => esc_html__('Context-aware decorative flourishes', 'opentype-stylist')
                ),
                array(
                    'id' => 'salt',
                    'name' => esc_html__('Stylistic Alternates', 'opentype-stylist'),
                    'category' => 'alternates',
                    'description' => esc_html__('Alternative character forms', 'opentype-stylist')
                ),
                array(
                    'id' => 'titl',
                    'name' => esc_html__('Titling', 'opentype-stylist'),
                    'category' => 'alternates',
                    'description' => esc_html__('Optimized for large titles', 'opentype-stylist')
                ),
                array(
                    'id' => 'ornm',
                    'name' => esc_html__('Ornaments', 'opentype-stylist'),
                    'category' => 'decorative',
                    'description' => esc_html__('Decorative ornaments', 'opentype-stylist')
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
            return new WP_Error('missing_params', esc_html__('Missing required parameters', 'opentype-stylist'), array('status' => 400));
        }

        if (!is_array($params['features']) || count($params['features']) === 0) {
            return new WP_Error('invalid_features', esc_html__('Features must be a non-empty array', 'opentype-stylist'), array('status' => 400));
        }

        // Validate feature IDs
        $available_features = array_column($this->get_available_features(), 'id');
        foreach ($params['features'] as $feature) {
            if (!in_array($feature, $available_features, true)) {
                /* translators: %s: The invalid OpenType feature ID */
                return new WP_Error('invalid_feature_id', sprintf(esc_html__('Invalid feature ID: %s', 'opentype-stylist'), esc_html($feature)), array('status' => 400));
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
        update_option('ots_presets', $presets);

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
                esc_html__('Preset not found', 'opentype-stylist'),
                array('status' => 404)
            );
        }

        update_option('ots_presets', array_values($presets));
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
            $this->fonts_cache = get_option('ots_custom_fonts', array());
        }
        return $this->fonts_cache;
    }

    /**
     * Get manual fonts with object caching
     */
    public function get_manual_fonts() {
        if (null === $this->manual_fonts_cache) {
            $this->manual_fonts_cache = get_option('ots_manual_fonts', array());
        }
        return $this->manual_fonts_cache;
    }

    /**
     * Clear object cache (call after updating options)
     */
    private function clear_cache() {
        $this->presets_cache = null;
        $this->fonts_cache = null;
        $this->manual_fonts_cache = null;

        // Clear all font CSS caches
        delete_transient('ots_combined_font_css');
        delete_transient('ots_admin_font_css');
        delete_transient('ots_editor_font_css');
        delete_transient('ots_block_font_css');

        // Clear per-page font caches (all cached variations)
        // Direct database call is required here for bulk deletion of transients with wildcard patterns.
        // No caching needed as this is a delete operation.
        global $wpdb;
        // phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
        $wpdb->query($wpdb->prepare("DELETE FROM {$wpdb->options} WHERE option_name LIKE %s", $wpdb->esc_like('_transient_ots_font_css_') . '%'));
        $wpdb->query($wpdb->prepare("DELETE FROM {$wpdb->options} WHERE option_name LIKE %s", $wpdb->esc_like('_transient_timeout_ots_font_css_') . '%'));
        $wpdb->query($wpdb->prepare("DELETE FROM {$wpdb->options} WHERE option_name LIKE %s", $wpdb->esc_like('_transient_ots_has_styled_') . '%'));
        $wpdb->query($wpdb->prepare("DELETE FROM {$wpdb->options} WHERE option_name LIKE %s", $wpdb->esc_like('_transient_timeout_ots_has_styled_') . '%'));
        $wpdb->query($wpdb->prepare("DELETE FROM {$wpdb->options} WHERE option_name LIKE %s", $wpdb->esc_like('_transient_ots_used_fonts_') . '%'));
        $wpdb->query($wpdb->prepare("DELETE FROM {$wpdb->options} WHERE option_name LIKE %s", $wpdb->esc_like('_transient_timeout_ots_used_fonts_') . '%'));
        // phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching

        // Clear editor data cache for all users
        $this->invalidate_editor_data_cache();
    }

    /**
     * Invalidate editor data cache
     */
    private function invalidate_editor_data_cache($user_id = null) {
        if ($user_id) {
            delete_transient('ots_editor_data_' . $user_id);
            wp_cache_delete('ots_editor_data_' . $user_id, 'transient');
        } else {
            // Clear for all users
            // Direct database call is required for bulk deletion of user-specific transients.
            // No caching needed as this is a delete operation.
            global $wpdb;
            // phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
            $wpdb->query(
                $wpdb->prepare(
                    "DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",
                    $wpdb->esc_like('_transient_ots_editor_data_') . '%',
                    $wpdb->esc_like('_transient_timeout_ots_editor_data_') . '%'
                )
            );
            // phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching

            // Flush object cache for transient group
            wp_cache_flush();
        }
    }

    /**
     * Get upload directory for fonts
     */
    public function get_fonts_upload_dir() {
        $upload_dir = wp_upload_dir();
        $font_dir = $upload_dir['basedir'] . '/ots/fonts';
        $font_url = $upload_dir['baseurl'] . '/ots/fonts';

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
                    'uploaded_date' => isset($font['uploaded_date']) ? sanitize_text_field($font['uploaded_date']) : current_time('mysql'),
                    'fallbacks' => isset($font['fallbacks']) ? sanitize_text_field($font['fallbacks']) : ''
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
            return new WP_Error('missing_data', esc_html__('Missing required font data', 'opentype-stylist'), array('status' => 400));
        }

        $uploaded_file = $files['zip_file'];

        // Validate file type and extension more securely
        $file_info = wp_check_filetype_and_ext($uploaded_file['tmp_name'], $uploaded_file['name']);
        $ext = $file_info['ext'];
        $type = $file_info['type'];

        if (!$ext || !$type) {
            return new WP_Error('invalid_file', esc_html__('Invalid file type', 'opentype-stylist'), array('status' => 400));
        }

        if ($ext !== 'zip' || !in_array($type, array('application/zip', 'application/x-zip-compressed'), true)) {
            return new WP_Error('invalid_file', esc_html__('Please upload a valid ZIP file', 'opentype-stylist'), array('status' => 400));
        }

        // Validate file size (max 10MB)
        $max_size = 10 * 1024 * 1024; // 10MB
        if ($uploaded_file['size'] > $max_size) {
            /* translators: %s: The maximum allowed file size in human-readable format (e.g., "10 MB") */
            return new WP_Error('file_too_large', sprintf(esc_html__('File size exceeds maximum allowed (%s)', 'opentype-stylist'), size_format($max_size)), array('status' => 400));
        }

        // Check for upload errors
        if ($uploaded_file['error'] !== UPLOAD_ERR_OK) {
            return new WP_Error('upload_error', esc_html__('File upload error', 'opentype-stylist'), array('status' => 400));
        }

        // Process the ZIP file
        $result = $this->process_font_kit_zip($uploaded_file, sanitize_text_field($params['name']));

        if (is_wp_error($result)) {
            return $result;
        }

        $fonts = $this->get_custom_fonts();
        $fonts[] = $result;
        update_option('ots_custom_fonts', $fonts);

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
            return new WP_Error('font_not_found', esc_html__('Font not found', 'opentype-stylist'), array('status' => 404));
        }

        update_option('ots_custom_fonts', array_values($fonts));

        // Clear cache
        $this->clear_cache();

        return rest_ensure_response(array('success' => true));
    }

    /**
     * Process uploaded font kit ZIP file
     */
    public function process_font_kit_zip($uploaded_file, $kit_name) {
        // Create unique kit ID and directory
        $kit_id = 'kit-' . time() . '-' . wp_generate_password(8, false);
        $upload_dir = wp_upload_dir();
        $kit_base_path = $upload_dir['basedir'] . '/ots/fonts/' . $kit_id;
        $kit_base_url = $upload_dir['baseurl'] . '/ots/fonts/' . $kit_id;

        // Create directory
        if (!wp_mkdir_p($kit_base_path)) {
            return new WP_Error('mkdir_failed', esc_html__('Failed to create upload directory', 'opentype-stylist'));
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
            // Return generic message to users
            return new WP_Error('unzip_failed', esc_html__('Failed to extract ZIP file. Please ensure the file is a valid ZIP archive.', 'opentype-stylist'), array('status' => 400));
        }

        // Validate extracted files - only allow CSS, WOFF, WOFF2, TTF, OTF, EOT
        $all_files = list_files($kit_base_path, 100);
        $allowed_extensions = array('css', 'woff', 'woff2', 'ttf', 'otf', 'eot', 'svg');

        foreach ($all_files as $file) {
            $file_ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));

            // Delete any non-allowed file types
            if (!in_array($file_ext, $allowed_extensions, true)) {
                wp_delete_file($file);
            }

            // Prevent PHP execution
            if (in_array($file_ext, array('php', 'php3', 'php4', 'php5', 'phtml', 'phps'), true)) {
                wp_delete_file($file);
            }

            // Validate file is within expected directory
            $real_path = realpath($file);
            $real_base = realpath($kit_base_path);
            if ($real_path === false || $real_base === false || strpos($real_path, $real_base) !== 0) {
                wp_delete_file($file);
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
            return new WP_Error('iterator_failed', esc_html__('Failed to process font kit', 'opentype-stylist'));
        }

        if (!$css_file_path) {
            $wp_filesystem->rmdir($kit_base_path, true);
            return new WP_Error('no_css', esc_html__('No CSS file found in the font kit', 'opentype-stylist'));
        }

        // Validate it's a real file, not a symlink
        if (!is_file($css_file_path) || is_link($css_file_path)) {
            $wp_filesystem->rmdir($kit_base_path, true);
            return new WP_Error('invalid_css', esc_html__('Invalid CSS file', 'opentype-stylist'));
        }

        // Check CSS file size (max 1MB)
        $file_size = filesize($css_file_path);
        if ($file_size > 1024 * 1024) {
            $wp_filesystem->rmdir($kit_base_path, true);
            return new WP_Error('css_too_large', esc_html__('CSS file is too large (max 1MB)', 'opentype-stylist'));
        }

        // Use WP Filesystem API
        $css_content = $wp_filesystem->get_contents($css_file_path);

        if ($css_content === false) {
            $wp_filesystem->rmdir($kit_base_path, true);
            return new WP_Error('css_read_error', esc_html__('Could not read CSS file', 'opentype-stylist'));
        }

        // Validate it looks like CSS (basic check)
        if (!preg_match('/@font-face\s*\{/i', $css_content)) {
            $wp_filesystem->rmdir($kit_base_path, true);
            return new WP_Error('invalid_css', esc_html__('CSS file does not contain @font-face declarations', 'opentype-stylist'));
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
            return new WP_Error('invalid_css', esc_html__('No valid @font-face rules found in CSS', 'opentype-stylist'));
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
        $font_dir = $upload_dir['basedir'] . '/ots/fonts';

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
     * Get Adobe Fonts scripts
     */
    public function get_adobe_fonts() {
        return get_option('ots_adobe_fonts', array());
    }

    /**
     * Sanitize Adobe Fonts data
     */
    public function sanitize_adobe_fonts($fonts) {
        if (!is_array($fonts)) {
            return array();
        }

        $sanitized = array();
        foreach ($fonts as $font) {
            if (isset($font['id']) && isset($font['css_url'])) {
                $sanitized_font = array(
                    'id' => sanitize_key($font['id']),
                    'name' => isset($font['name']) ? sanitize_text_field($font['name']) : '',
                    'css_url' => esc_url_raw($font['css_url'], array('https')),
                    'font_families' => isset($font['font_families']) && is_array($font['font_families'])
                        ? array_map('sanitize_text_field', $font['font_families'])
                        : array(),
                    'added_date' => isset($font['added_date']) ? sanitize_text_field($font['added_date']) : current_time('mysql'),
                    'fallbacks' => isset($font['fallbacks']) ? sanitize_text_field($font['fallbacks']) : ''
                );

                // Only add if CSS URL is valid https
                if (!empty($sanitized_font['css_url']) && strpos($sanitized_font['css_url'], 'https://') === 0) {
                    $sanitized[] = $sanitized_font;
                }
            }
        }

        return $sanitized;
    }

    /**
     * Sanitize manual fonts
     */
    public function sanitize_manual_fonts($fonts) {
        if (!is_array($fonts)) {
            return array();
        }

        $sanitized = array();
        foreach ($fonts as $font) {
            if (isset($font['id']) && isset($font['font_family'])) {
                $sanitized_font = array(
                    'id' => sanitize_key($font['id']),
                    'name' => isset($font['name']) ? sanitize_text_field($font['name']) : '',
                    'font_family' => sanitize_text_field($font['font_family']),
                    'fallbacks' => isset($font['fallbacks']) ? sanitize_text_field($font['fallbacks']) : '',
                    'added_date' => isset($font['added_date']) ? sanitize_text_field($font['added_date']) : current_time('mysql')
                );

                // Only add if font_family is not empty
                if (!empty($sanitized_font['font_family'])) {
                    $sanitized[] = $sanitized_font;
                }
            }
        }

        return $sanitized;
    }

    /**
     * Parse Adobe Fonts embed code to extract CSS URL and kit ID
     *
     * Extracts the CSS URL and kit ID from Adobe Fonts (Typekit) embed code.
     * Supports both modern <link> tag format and legacy <script> tag format,
     * as well as direct URLs with or without HTML tags.
     *
     * @since 1.1.0
     *
     * @param string $embed_code The Adobe Fonts embed code (HTML or URL).
     * @return array|false Array with 'css_url' and 'kit_id' on success, false on failure.
     */
    public function parse_adobe_fonts_code($embed_code) {
        // Try modern <link> tag format first
        if (preg_match('/<link[^>]+href=["\']([^"\']+)["\'][^>]*>/i', $embed_code, $matches)) {
            $css_url = $matches[1];
        }
        // Try legacy <script> tag format
        else if (preg_match('/<script[^>]+src=["\']([^"\']+)["\'][^>]*>/i', $embed_code, $matches)) {
            $css_url = $matches[1];
        }
        // Try direct CSS URL without tags
        else if (preg_match('/https:\/\/use\.typekit\.net\/[a-z0-9]+\.css/i', $embed_code, $matches)) {
            $css_url = $matches[0];
        }
        // Try direct JS URL without tags (legacy)
        else if (preg_match('/https:\/\/use\.typekit\.net\/[a-z0-9]+\.js/i', $embed_code, $matches)) {
            $css_url = $matches[0];
        } else {
            return false;
        }

        // Validate it's an Adobe Fonts/Typekit URL and extract kit ID
        if (preg_match('/^https:\/\/use\.typekit\.net\/([a-z0-9]+)\.(css|js)$/i', $css_url, $kit_matches)) {
            $kit_id = $kit_matches[1];
            // Normalize to CSS URL format
            $css_url = 'https://use.typekit.net/' . $kit_id . '.css';
        } else {
            return false;
        }

        return array(
            'css_url' => $css_url,
            'kit_id' => $kit_id
        );
    }

    /**
     * REST endpoint: Get Adobe Fonts
     *
     * Returns all configured Adobe Fonts projects.
     *
     * @since 1.1.0
     *
     * @param WP_REST_Request $request The REST request object.
     * @return WP_REST_Response REST response containing array of Adobe Fonts projects.
     */
    public function get_adobe_fonts_endpoint($request) {
        return rest_ensure_response($this->get_adobe_fonts());
    }

    /**
     * REST endpoint: Add Adobe Font
     *
     * Parses Adobe Fonts embed code and adds a new Adobe Fonts project.
     * Validates the embed code, checks for duplicates, and stores project configuration.
     *
     * @since 1.1.0
     *
     * @param WP_REST_Request $request REST request with 'embed_code', 'name', and 'font_families' params.
     * @return WP_REST_Response|WP_Error REST response with success status and font data, or error.
     */
    public function add_adobe_font_endpoint($request) {
        $params = $request->get_json_params();

        if (empty($params['embed_code'])) {
            return new WP_Error('missing_embed_code', esc_html__('Embed code is required', 'opentype-stylist'), array('status' => 400));
        }

        // Parse embed code
        $parsed = $this->parse_adobe_fonts_code($params['embed_code']);
        if (!$parsed) {
            return new WP_Error('invalid_embed_code', esc_html__('Invalid Adobe Fonts embed code. Please paste the complete <link> or <script> tag from Adobe Fonts.', 'opentype-stylist'), array('status' => 400));
        }

        // Check if already exists
        $existing_fonts = $this->get_adobe_fonts();
        foreach ($existing_fonts as $font) {
            if ($font['css_url'] === $parsed['css_url']) {
                return new WP_Error('duplicate_script', esc_html__('This Adobe Fonts kit has already been added.', 'opentype-stylist'), array('status' => 400));
            }
        }

        $new_font = array(
            'id' => 'adobe-' . $parsed['kit_id'],
            'name' => !empty($params['name']) ? sanitize_text_field($params['name']) : 'Adobe Fonts ' . $parsed['kit_id'],
            'css_url' => $parsed['css_url'],
            'font_families' => !empty($params['font_families']) && is_array($params['font_families'])
                ? array_map('sanitize_text_field', $params['font_families'])
                : array(),
            'added_date' => current_time('mysql')
        );

        $fonts = $this->get_adobe_fonts();
        $fonts[] = $new_font;
        update_option('ots_adobe_fonts', $fonts);

        // Clear cache
        $this->clear_cache();

        return rest_ensure_response(array('success' => true, 'font' => $new_font));
    }

    /**
     * REST endpoint: Delete Adobe Font
     *
     * Removes an Adobe Fonts project from the plugin configuration.
     *
     * @since 1.1.0
     *
     * @param WP_REST_Request $request REST request with 'id' parameter.
     * @return WP_REST_Response|WP_Error REST response with success status, or error if not found.
     */
    public function delete_adobe_font_endpoint($request) {
        $id = sanitize_key($request->get_param('id'));
        $fonts = $this->get_adobe_fonts();

        $found = false;
        foreach ($fonts as $key => $font) {
            if ($font['id'] === $id) {
                unset($fonts[$key]);
                $found = true;
                break;
            }
        }

        if (!$found) {
            return new WP_Error('font_not_found', esc_html__('Adobe Font not found', 'opentype-stylist'), array('status' => 404));
        }

        update_option('ots_adobe_fonts', array_values($fonts));
        $this->clear_cache();

        return rest_ensure_response(array('success' => true));
    }

    /**
     * REST endpoint: Update Adobe Font fallback
     *
     * Updates the fallback fonts for an Adobe Fonts project.
     *
     * @since 1.1.0
     *
     * @param WP_REST_Request $request REST request with 'id' parameter and 'fallbacks' in body.
     * @return WP_REST_Response|WP_Error REST response with updated font data, or error if not found.
     */
    public function update_adobe_font_fallback_endpoint($request) {
        $id = sanitize_key($request->get_param('id'));
        $params = $request->get_json_params();

        if (!isset($params['fallbacks'])) {
            return new WP_Error('missing_fallbacks', esc_html__('Fallbacks parameter is required', 'opentype-stylist'), array('status' => 400));
        }

        $fonts = $this->get_adobe_fonts();
        $found = false;

        foreach ($fonts as $key => $font) {
            if ($font['id'] === $id) {
                $fonts[$key]['fallbacks'] = sanitize_text_field($params['fallbacks']);
                $found = true;
                break;
            }
        }

        if (!$found) {
            return new WP_Error('font_not_found', esc_html__('Adobe Font not found', 'opentype-stylist'), array('status' => 404));
        }

        update_option('ots_adobe_fonts', $fonts);
        $this->clear_cache();

        return rest_ensure_response(array('success' => true, 'font' => $fonts[$key]));
    }

    /**
     * REST endpoint: Update font fallback (uploaded fonts)
     *
     * Updates the fallback fonts for an uploaded custom font kit.
     *
     * @since 1.1.0
     *
     * @param WP_REST_Request $request REST request with 'id' parameter and 'fallbacks' in body.
     * @return WP_REST_Response|WP_Error REST response with updated font data, or error if not found.
     */
    public function update_font_fallback_endpoint($request) {
        $id = sanitize_key($request->get_param('id'));
        $params = $request->get_json_params();

        if (!isset($params['fallbacks'])) {
            return new WP_Error('missing_fallbacks', esc_html__('Fallbacks parameter is required', 'opentype-stylist'), array('status' => 400));
        }

        $fonts = $this->get_custom_fonts();
        $found = false;

        foreach ($fonts as $key => $font) {
            if ($font['id'] === $id) {
                $fonts[$key]['fallbacks'] = sanitize_text_field($params['fallbacks']);
                $found = true;
                break;
            }
        }

        if (!$found) {
            return new WP_Error('font_not_found', esc_html__('Font not found', 'opentype-stylist'), array('status' => 404));
        }

        update_option('ots_custom_fonts', $fonts);
        $this->clear_cache();

        return rest_ensure_response(array('success' => true, 'font' => $fonts[$key]));
    }

    /**
     * REST endpoint: Get manual fonts
     *
     * Returns all manually configured custom fonts (non-uploaded, non-Adobe).
     *
     * @since 1.1.0
     *
     * @param WP_REST_Request $request The REST request object.
     * @return WP_REST_Response REST response containing array of manual fonts.
     */
    public function get_manual_fonts_endpoint($request) {
        return rest_ensure_response($this->get_manual_fonts());
    }

    /**
     * REST endpoint: Add manual font
     *
     * Adds a manually configured custom font by specifying name and CSS font-family value.
     * Used for fonts loaded elsewhere (theme, other plugins) that support OpenType features.
     *
     * @since 1.1.0
     *
     * @param WP_REST_Request $request REST request with 'name', 'font_family', and optional 'fallbacks' params.
     * @return WP_REST_Response|WP_Error REST response with success status and font data, or error.
     */
    public function add_manual_font_endpoint($request) {
        $params = $request->get_json_params();

        if (empty($params['name']) || empty($params['font_family'])) {
            return new WP_Error('missing_data', esc_html__('Name and font family are required', 'opentype-stylist'), array('status' => 400));
        }

        // Generate unique ID
        $font_id = 'manual-' . sanitize_key(strtolower(str_replace(' ', '-', $params['name']))) . '-' . time();

        $new_font = array(
            'id' => $font_id,
            'name' => sanitize_text_field($params['name']),
            'font_family' => sanitize_text_field($params['font_family']),
            'fallbacks' => isset($params['fallbacks']) ? sanitize_text_field($params['fallbacks']) : '',
            'added_date' => current_time('mysql')
        );

        $fonts = $this->get_manual_fonts();
        $fonts[] = $new_font;
        update_option('ots_manual_fonts', $fonts);

        // Clear cache
        $this->clear_cache();

        return rest_ensure_response(array('success' => true, 'font' => $new_font));
    }

    /**
     * REST endpoint: Delete manual font
     *
     * Removes a manually configured custom font from the plugin configuration.
     *
     * @since 1.1.0
     *
     * @param WP_REST_Request $request REST request with 'id' parameter.
     * @return WP_REST_Response|WP_Error REST response with success status, or error if not found.
     */
    public function delete_manual_font_endpoint($request) {
        $id = sanitize_key($request->get_param('id'));
        $fonts = $this->get_manual_fonts();

        $found = false;
        foreach ($fonts as $key => $font) {
            if ($font['id'] === $id) {
                unset($fonts[$key]);
                $found = true;
                break;
            }
        }

        if (!$found) {
            return new WP_Error('font_not_found', esc_html__('Manual font not found', 'opentype-stylist'), array('status' => 404));
        }

        update_option('ots_manual_fonts', array_values($fonts));
        $this->clear_cache();

        return rest_ensure_response(array('success' => true));
    }

    /**
     * Enqueue Adobe Fonts scripts in editor and frontend
     *
     * Loads Adobe Fonts (Typekit) CSS stylesheets for all configured projects.
     * Called in both editor and frontend contexts.
     *
     * @since 1.1.0
     *
     * @return void
     */
    public function enqueue_adobe_fonts() {
        $adobe_fonts = $this->get_adobe_fonts();

        if (empty($adobe_fonts)) {
            return;
        }

        foreach ($adobe_fonts as $font) {
            if (!empty($font['css_url'])) {
                wp_enqueue_style(
                    'ots-adobe-' . $font['id'],
                    $font['css_url'],
                    array(),
                    null
                );
            }
        }
    }

    /**
     * Render admin page
     *
     * Displays the plugin's settings page in the WordPress admin.
     * Includes presets, font management, and configuration options.
     *
     * @since 1.1.0
     *
     * @return void
     */
    public function render_admin_page() {
        // Verify user has permission
        if (!current_user_can('manage_options')) {
            wp_die(esc_html__('You do not have sufficient permissions to access this page.', 'opentype-stylist'));
        }

        include OTS_PLUGIN_DIR . 'includes/admin-page.php';
    }
}

/**
 * Initialize plugin
 *
 * Returns the singleton instance of the OpenType_Stylist plugin class.
 * Called on 'plugins_loaded' hook.
 *
 * @since 1.0.0
 *
 * @return OpenType_Stylist The plugin instance.
 */
function ots_init() {
    return OpenType_Stylist::get_instance();
}

// Start plugin
add_action('plugins_loaded', 'ots_init');

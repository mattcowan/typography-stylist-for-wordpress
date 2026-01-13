<?php
/**
 * Plugin Name: OpenType Stylist
 * Plugin URI: https://github.com/mattcowan/opentype-stylist
 * Description: Add advanced OpenType features (ligatures, stylistic sets, swashes) to headlines with inline text selection and live preview.
 * Version: 1.0.7
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

// Define plugin constants (check if already defined for test compatibility)
if (!defined('OTS_VERSION')) {
    define('OTS_VERSION', '1.0.7');
}
if (!defined('OTS_PLUGIN_DIR')) {
    define('OTS_PLUGIN_DIR', plugin_dir_path(__FILE__));
}
if (!defined('OTS_PLUGIN_URL')) {
    define('OTS_PLUGIN_URL', plugin_dir_url(__FILE__));
}
if (!defined('OTS_PLUGIN_BASENAME')) {
    define('OTS_PLUGIN_BASENAME', plugin_basename(__FILE__));
}

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
    private $font_replacements_cache = null;

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

        // Output CSS variables for fonts
        add_action('wp_head', array($this, 'output_font_css_variables'), 5);
        add_action('admin_head', array($this, 'output_font_css_variables'), 5);

        // Add admin menu
        add_action('admin_menu', array($this, 'add_admin_menu'));

        // Register settings
        add_action('admin_init', array($this, 'register_settings'));

        // Ensure .htaccess exists for existing installations
        add_action('admin_init', array($this, 'maybe_create_htaccess'), 1);

        // Add REST API endpoints
        add_action('rest_api_init', array($this, 'register_rest_routes'));

        // Register custom block
        add_action('init', array($this, 'register_block'));

        // Add Settings link on plugins page
        add_filter('plugin_action_links_' . OTS_PLUGIN_BASENAME, array($this, 'add_plugin_action_links'));

        // Secure upload directory on activation
        register_activation_hook(__FILE__, array($this, 'activate_plugin'));
    }

    /**
     * Plugin activation
     */
    public function activate_plugin() {
        $this->secure_upload_directory();
        // Mark .htaccess as verified so we don't check on every admin page load
        update_option('ots_htaccess_verified', true, false);
    }

    /**
     * Ensure .htaccess exists for existing installations
     *
     * Uses a one-time flag to avoid unnecessary file system checks on every admin page load.
     * Only runs once to upgrade existing installations that were created before the .htaccess security fix.
     */
    public function maybe_create_htaccess() {
        // Check if we've already verified .htaccess (one-time check)
        if (get_option('ots_htaccess_verified', false)) {
            return;
        }

        $upload_dir = wp_upload_dir();
        $font_dir = $upload_dir['basedir'] . '/ots/fonts';
        $htaccess_file = $font_dir . '/.htaccess';

        // If directory exists but .htaccess doesn't, create it
        if (is_dir($font_dir) && !file_exists($htaccess_file)) {
            $this->secure_upload_directory();
        }

        // Mark as verified so we don't check again
        update_option('ots_htaccess_verified', true, false);
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

            // Note: CSS variables are now output via admin_print_styles hook
            // in output_font_css_variables_iframe() method for reliable iframe injection
        }
    }

    /**
     * Output CSS variables for block editor iframe
     *
     * The block editor uses an iframe for content rendering. CSS variables
     * must be injected directly into the iframe's head, not via wp_add_inline_style()
     * on dummy handles (which is unreliable in iframe context).
     *
     * This method fires on admin_print_styles which runs in both main admin
     * and iframe contexts, ensuring CSS variables are available everywhere.
     */
    public function output_font_css_variables_iframe() {
        // Only in admin context
        if (!is_admin()) {
            return;
        }

        $css = $this->get_font_css_variables();
        if (!empty($css)) {
            $css = $this->sanitize_output_css($css);
            $allowed_css = array(
                'style' => array(
                    'id' => array(),
                    'type' => array()
                )
            );
            // Output style block directly - matches pattern from output_font_css_variables()
            // phpcs:ignore WordPress.WP.EnqueuedResources.NonEnqueuedStylesheet
            echo wp_kses("<style id=\"ots-font-variables\">\n" . $css . "\n</style>\n", $allowed_css);
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
                'enableAriaLabels' => get_option('ots_enable_aria_labels', false),
                'showClearConfirmation' => get_option('ots_show_clear_confirmation', true)
            );

            // Cache for 1 hour
            set_transient($cache_key, $localized_data, HOUR_IN_SECONDS);
        }

        // Pass data to JavaScript
        wp_localize_script('ots-block-editor', 'otsData', $localized_data);
    }

    /**
     * Get content that will be displayed for a post on archive pages
     * Determines whether to check excerpt, content before more tag, or full content
     *
     * This uses a simple heuristic:
     * 1. If manual excerpt exists, use it
     * 2. If <!--more--> tag exists, use content before it
     * 3. Otherwise, assume full content (since auto-excerpts are plain text without styled content)
     *
     * Theme authors can override this behavior using the 'ots_archive_post_content' filter.
     *
     * @param WP_Post $post Post object
     * @return string Content to check
     */
    private function get_archive_post_content($post) {
        $content_to_check = '';

        if ($post->post_excerpt) {
            // Has manual excerpt - check excerpt only
            $content_to_check = $post->post_excerpt;
        } elseif (preg_match('/<!--more(?:\s[^>]*)?-->/', $post->post_content)) {
            // Has more tag (including custom text) - check content before first more tag
            $content_parts = preg_split('/<!--more(?:\s[^>]*)?-->/', $post->post_content, 2);
            $content_to_check = $content_parts[0];
        } else {
            // No manual excerpt or more tag
            // Only check full content if theme is configured to show full posts on archives
            // Otherwise assume auto-excerpt (plain text) contains no custom fonts
            /**
             * Filter whether to check full post content on archive pages when no excerpt or more tag exists
             *
             * By default, posts without manual excerpts or more tags are not checked for custom fonts
             * on archive pages, since auto-generated excerpts are plain text without formatting.
             * Set this to true if your theme shows full post content on archives.
             *
             * @since 1.0.0
             *
             * @param bool    $check_full_content Whether to check full content (default: false)
             * @param WP_Post $post               The post object being checked
             */
            $check_full_content = apply_filters('ots_check_full_content_on_archives', false, $post);
            $content_to_check = $check_full_content ? $post->post_content : '';
        }

        /**
         * Filter the content to check for a post on archive pages
         *
         * Allows themes to override the default heuristic for determining what content
         * is displayed on archive pages. This is useful if your theme has custom logic
         * for showing excerpts vs full content.
         *
         * @since 1.0.0
         *
         * @param string  $content_to_check The content determined by the default heuristic
         * @param WP_Post $post             The post object being checked
         */
        return apply_filters('ots_archive_post_content', $content_to_check, $post);
    }

    /**
     * Render content for font detection with optional full content filter
     *
     * By default uses do_blocks() which only processes block markup without triggering:
     * - Shortcode processing (prevents arbitrary code execution)
     * - oEmbed transformations (prevents external API calls)
     * - wpautop formatting (unnecessary for font detection)
     * - Third-party 'the_content' filter hooks (prevents side effects)
     *
     * This improves performance and prevents unintended side effects on archive pages
     * (like incrementing view counters, sending notifications, executing shortcodes).
     *
     * SECURITY WARNING: Enabling full 'the_content' filter will execute shortcodes and
     * third-party hooks, which may:
     * - Execute arbitrary code through shortcodes
     * - Trigger unintended actions (analytics, notifications, view counters)
     * - Cause significant performance degradation on archive pages
     * - Make external API calls (oEmbeds, etc.)
     *
     * Only enable if you have a specific plugin that injects font information via
     * 'the_content' filter and you understand the security/performance implications.
     *
     * To enable (not recommended unless absolutely necessary):
     * add_filter('ots_use_full_content_filter', '__return_true');
     *
     * @param string $content Raw post content to render
     * @return string Rendered content
     */
    private function render_content_for_detection($content) {
        $use_full_content_filter = apply_filters('ots_use_full_content_filter', false);

        if ($use_full_content_filter) {
            return apply_filters('the_content', $content);
        }

        return function_exists('do_blocks') ? do_blocks($content) : $content;
    }

    /**
     * Check if current page has styled content
     * Works for all singular post types (posts, pages, custom post types) and archive pages
     */
    private function has_styled_content() {
        global $wp_query;

        if (is_singular()) {
            // Single post/page/CPT - check just this post
            // Use get_queried_object() for reliable post data across all post types
            $post = get_queried_object();
            if (!$post || !isset($post->ID) || !isset($post->post_content)) {
                return false;
            }

            // Cache the result per post
            $cache_key = 'ots_has_styled_' . $post->ID;
            $has_styled = get_transient($cache_key);

            if (false === $has_styled) {
                // Check both raw content and rendered content (for Gutenberg blocks)
                $raw_content = $post->post_content;

                // Apply content filters to render Gutenberg blocks
                $rendered_content = $this->render_content_for_detection($raw_content);

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
                    $content_to_check = $this->get_archive_post_content($loop_post);

                    // Check raw content first (cheap operation)
                    if (strpos($content_to_check, 'ots-styled') !== false) {
                        $has_styled = 'yes';
                        break; // Found styled content, no need to check more
                    }

                    // Only render blocks if not found in raw content (expensive operation)
                    $rendered_content = $this->render_content_for_detection($content_to_check);
                    if (strpos($rendered_content, 'ots-styled') !== false) {
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
     * Works for all singular post types (posts, pages, custom post types) and archive pages
     */
    private function get_used_fonts_in_content() {
        global $wp_query;

        if (is_singular()) {
            // Single post/page/CPT - check just this post
            // Use get_queried_object() for reliable post data across all post types
            $post = get_queried_object();
            if (!$post || !isset($post->ID) || !isset($post->post_content)) {
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
                $rendered_content = $this->render_content_for_detection($raw_content);
                $content_to_check = $raw_content . ' ' . $rendered_content;

                if (preg_match_all('/data-font=["\']([^"\']+)["\']/', $content_to_check, $matches)) {
                    $used_fonts = array_merge($used_fonts, $matches[1]);
                }

                // Method 3: Look for CSS variable references --font-{ID}
                if (preg_match_all('/--font-(\d+)/', $content_to_check, $matches)) {
                    // Store font IDs as "id:{ID}" to differentiate from font names
                    foreach ($matches[1] as $font_id) {
                        $used_fonts[] = 'id:' . $font_id;
                    }
                }

                // Method 4: Look for data-font-id attributes
                if (preg_match_all('/data-font-id=["\'](\d+)["\']/', $content_to_check, $matches)) {
                    foreach ($matches[1] as $font_id) {
                        $used_fonts[] = 'id:' . $font_id;
                    }
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
                    $content_to_check = $this->get_archive_post_content($loop_post);

                    // Method 1: Parse block attributes directly from the portion that will be shown
                    $blocks = parse_blocks($content_to_check);
                    $this->extract_fonts_from_blocks($blocks, $used_fonts);

                    // Method 2: Look for data-font attributes in HTML
                    $rendered_content = $this->render_content_for_detection($content_to_check);
                    $combined_content = $content_to_check . ' ' . $rendered_content;

                    if (preg_match_all('/data-font=["\']([^"\']+)["\']/', $combined_content, $matches)) {
                        $used_fonts = array_merge($used_fonts, $matches[1]);
                    }

                    // Method 3: Look for CSS variable references --font-{ID}
                    if (preg_match_all('/--font-(\d+)/', $combined_content, $matches)) {
                        foreach ($matches[1] as $font_id) {
                            $used_fonts[] = 'id:' . $font_id;
                        }
                    }

                    // Method 4: Look for data-font-id attributes
                    if (preg_match_all('/data-font-id=["\'](\d+)["\']/', $combined_content, $matches)) {
                        foreach ($matches[1] as $font_id) {
                            $used_fonts[] = 'id:' . $font_id;
                        }
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
        $has_styled = $this->has_styled_content();

        // Check if any fonts are set to load on all pages
        $has_always_load_fonts = false;

        // Check uploaded fonts
        $custom_fonts = $this->get_custom_fonts();
        foreach ($custom_fonts as $font) {
            if (!empty($font['load_on_all_pages'])) {
                $has_always_load_fonts = true;
                break;
            }
        }

        // Check Adobe fonts if needed
        if (!$has_always_load_fonts) {
            $adobe_fonts = $this->get_adobe_fonts();
            foreach ($adobe_fonts as $font) {
                if (!empty($font['load_on_all_pages'])) {
                    $has_always_load_fonts = true;
                    break;
                }
            }
        }

        // Only return early if NO styled content AND NO always-load fonts
        if (!$has_styled && !$has_always_load_fonts) {
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
    }

    /**
     * Parse font families from CSS font-family values
     *
     * Splits comma-separated font-family strings and removes quotes.
     * E.g., "My Font, Arial, sans-serif" -> ["My Font", "Arial", "sans-serif"]
     *
     * @param array $font_family_values Array of CSS font-family values
     * @return array Array of individual font family names
     */
    private function parse_font_family_list($font_family_values) {
        $parsed_font_families = array();
        foreach ($font_family_values as $font_family_value) {
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
        return $parsed_font_families;
    }

    /**
     * Optimized font enqueuing with caching - only loads fonts used on current page
     */
    public function enqueue_custom_fonts_optimized() {
        $all_fonts = $this->get_custom_fonts();

        if (empty($all_fonts)) {
            return;
        }

        // Check if we need to scan content for used fonts
        $has_conditional_fonts = false;
        foreach ($all_fonts as $font) {
            if (empty($font['load_on_all_pages'])) {
                $has_conditional_fonts = true;
                break;
            }
        }

        // Only get used fonts if at least one font is conditional
        $used_font_families = array();
        $used_font_ids = array();
        if ($has_conditional_fonts) {
            $used_fonts_raw = $this->get_used_fonts_in_content();

            // Separate font IDs from font family names
            foreach ($used_fonts_raw as $font_ref) {
                if (strpos($font_ref, 'id:') === 0) {
                    // This is a font ID reference
                    $used_font_ids[] = (int) substr($font_ref, 3);
                } else {
                    // This is a font family name
                    $used_font_families[] = $font_ref;
                }
            }

            // Resolve font IDs through replacement chain
            // If content uses font 16 which was replaced by font 29, we need to load font 29
            $used_font_ids = $this->resolve_used_font_replacements($used_font_ids);

            if (!empty($used_font_families)) {
                // Parse font families from CSS font-family values (which may include fallbacks)
                $parsed_font_families = $this->parse_font_family_list($used_font_families);
                $used_font_families = array_unique($parsed_font_families);
            }
        }

        // Build cache key including load_on_all_pages settings
        $load_settings = wp_list_pluck($all_fonts, 'load_on_all_pages', 'id');
        $cache_key = 'ots_font_css_' . md5(serialize($used_font_families) . serialize($load_settings));
        $combined_css = get_transient($cache_key);

        if (false === $combined_css) {
            $combined_css = '';

            // Only include fonts that are actually used OR set to load on all pages
            foreach ($all_fonts as $font) {
                if (!empty($font['css_content']) && !empty($font['font_faces'])) {
                    $should_load = false;

                    // Check if font should be loaded on all pages
                    if (!empty($font['load_on_all_pages'])) {
                        $should_load = true;
                    } else {
                        // Check if font ID is used
                        if (isset($font['font_id']) && in_array($font['font_id'], $used_font_ids)) {
                            $should_load = true;
                        }

                        // Check if any face from this font kit is used (backward compatibility)
                        if (!$should_load && !empty($used_font_families)) {
                            foreach ($font['font_faces'] as $face) {
                                if (in_array($face['family'], $used_font_families)) {
                                    $should_load = true;
                                    break;
                                }
                            }
                        }
                    }

                    if ($should_load) {
                        // Sanitize CSS before adding
                        $combined_css .= "\n" . $this->sanitize_css_content($font['css_content']);
                    }
                }
            }

            // Minify (remove CSS comments, then collapse whitespace)
            $combined_css = preg_replace('/\/\*.*?\*\//s', '', $combined_css);
            $combined_css = preg_replace('/\s+/', ' ', $combined_css);
            $combined_css = trim($combined_css);

            // Cache for 24 hours
            set_transient($cache_key, $combined_css, DAY_IN_SECONDS);
        }

        if (!empty($combined_css)) {
            wp_add_inline_style('ots-frontend', $combined_css);
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
     * Add Settings link to plugin action links on plugins page
     *
     * @param array $links Existing plugin action links
     * @return array Modified plugin action links
     */
    public function add_plugin_action_links($links) {
        $settings_link = sprintf(
            '<a href="%s">%s</a>',
            esc_url(admin_url('options-general.php?page=opentype-stylist')),
            esc_html__('Settings', 'opentype-stylist')
        );

        array_unshift($links, $settings_link);

        return $links;
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
            'fonts' => $this->get_custom_fonts(),
            'adobeFonts' => $this->get_adobe_fonts(),
            'manualFonts' => $this->get_manual_fonts(),
            'replacements' => $this->get_font_replacements(),
            'strings' => array(
                'confirmDelete' => esc_html__('Are you sure you want to delete this font kit?', 'opentype-stylist'),
                'uploadError' => esc_html__('Failed to upload font kit.', 'opentype-stylist'),
                'selectZip' => esc_html__('Please select a ZIP file (.zip)', 'opentype-stylist'),
                'enterName' => esc_html__('Please enter a font kit name.', 'opentype-stylist'),
                'selectFile' => esc_html__('Please select a ZIP file.', 'opentype-stylist'),
                'uploadSuccess' => esc_html__('Font kit uploaded and processed successfully! Reloading page...', 'opentype-stylist'),
                'deleteError' => esc_html__('Failed to delete font kit.', 'opentype-stylist'),
                'deleteFontSuccess' => esc_html__('Font deleted successfully! Reloading page...', 'opentype-stylist'),
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
                'deleteManualFontError' => esc_html__('Failed to delete custom font.', 'opentype-stylist'),
                // Font loading setting strings
                'updateSettingError' => esc_html__('Failed to update font loading setting.', 'opentype-stylist'),
                // Edit font strings
                'saving' => esc_html__('Saving...', 'opentype-stylist'),
                'saveChanges' => esc_html__('Save Changes', 'opentype-stylist'),
                'fallbacksUpdated' => esc_html__('Fallback fonts updated successfully! Reloading page...', 'opentype-stylist'),
                'updateFallbacksError' => esc_html__('Failed to update fallback fonts.', 'opentype-stylist'),
                'fontUpdated' => esc_html__('Font updated successfully! Reloading page...', 'opentype-stylist'),
                'updateFontError' => esc_html__('Failed to update font.', 'opentype-stylist')
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

            // Minify (remove CSS comments, then collapse whitespace)
            $combined_css = preg_replace('/\/\*.*?\*\//s', '', $combined_css);
            $combined_css = preg_replace('/\s+/', ' ', $combined_css);
            $combined_css = trim($combined_css);

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

            // Minify (remove CSS comments, then collapse whitespace)
            $combined_css = preg_replace('/\/\*.*?\*\//s', '', $combined_css);
            $combined_css = preg_replace('/\s+/', ' ', $combined_css);
            $combined_css = trim($combined_css);

            // Cache for 24 hours
            set_transient($cache_key, $combined_css, DAY_IN_SECONDS);
        }

        // Always register/enqueue handle even if no custom fonts, so we can attach CSS variables
        wp_register_style('ots-block-fonts', false, array(), OTS_VERSION);
        wp_enqueue_style('ots-block-fonts');

        if (!empty($combined_css)) {
            wp_add_inline_style('ots-block-fonts', $combined_css);
        }

        // Add CSS variables for font replacements to work in editor iframe
        $css_vars = $this->get_font_css_variables();
        if (!empty($css_vars)) {
            // CSS variables must be added as proper CSS (not wrapped in <style> tags)
            // wp_add_inline_style expects raw CSS content
            wp_add_inline_style('ots-block-fonts', $css_vars);
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

            // Minify (remove CSS comments, then collapse whitespace)
            $combined_css = preg_replace('/\/\*.*?\*\//s', '', $combined_css);
            $combined_css = preg_replace('/\s+/', ' ', $combined_css);
            $combined_css = trim($combined_css);

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

        register_setting('ots_settings', 'ots_font_replacements', array(
            'type' => 'array',
            'default' => array(
                'mappings' => array(),
                'global_load' => array(),
                'next_id' => array(
                    'custom' => 10,
                    'adobe' => 20,
                    'manual' => 30
                )
            ),
            'sanitize_callback' => array($this, 'sanitize_font_replacements')
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
                return current_user_can('upload_files');
            }
        ));

        register_rest_route('ots/v1', '/adobe-fonts/(?P<id>[a-zA-Z0-9_-]+)/load-on-all-pages', array(
            'methods' => 'PATCH',
            'callback' => array($this, 'update_adobe_font_load_on_all_pages_endpoint'),
            'permission_callback' => function() {
                return current_user_can('upload_files');
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

        register_rest_route('ots/v1', '/manual-fonts/(?P<id>[a-zA-Z0-9_-]+)', array(
            'methods' => 'PATCH',
            'callback' => array($this, 'update_manual_font_endpoint'),
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

        // Load on all pages endpoint for uploaded fonts
        register_rest_route('ots/v1', '/fonts/(?P<id>[a-zA-Z0-9_-]+)/load-on-all-pages', array(
            'methods' => 'PATCH',
            'callback' => array($this, 'update_font_load_on_all_pages_endpoint'),
            'permission_callback' => function() {
                return current_user_can('upload_files');
            }
        ));

        // Font replacement endpoints
        register_rest_route('ots/v1', '/font-replacements', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_font_replacements_endpoint'),
            'permission_callback' => array($this, 'check_permissions')
        ));

        register_rest_route('ots/v1', '/font-replacements', array(
            'methods' => 'POST',
            'callback' => array($this, 'add_font_replacement_endpoint'),
            'permission_callback' => function() {
                return current_user_can('edit_posts');
            }
        ));

        register_rest_route('ots/v1', '/font-replacements/(?P<id>\d+)', array(
            'methods' => 'PATCH',
            'callback' => array($this, 'update_font_replacement_endpoint'),
            'permission_callback' => function() {
                return current_user_can('edit_posts');
            }
        ));

        register_rest_route('ots/v1', '/font-replacements/(?P<id>\d+)', array(
            'methods' => 'DELETE',
            'callback' => array($this, 'delete_font_replacement_endpoint'),
            'permission_callback' => function() {
                return current_user_can('edit_posts');
            }
        ));

        register_rest_route('ots/v1', '/font-replacements/orphans', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_unassigned_fonts_endpoint'),
            'permission_callback' => array($this, 'check_permissions')
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
            'ss06' => 'AaBbGgQqRr 1234567890',
            'ss07' => 'AaBbGgQqRr 1234567890',
            'ss08' => 'AaBbGgQqRr 1234567890',
            'ss09' => 'AaBbGgQqRr 1234567890',
            'ss10' => 'AaBbGgQqRr 1234567890',
            'ss11' => 'AaBbGgQqRr 1234567890',
            'ss12' => 'AaBbGgQqRr 1234567890',
            'ss13' => 'AaBbGgQqRr 1234567890',
            'ss14' => 'AaBbGgQqRr 1234567890',
            'ss15' => 'AaBbGgQqRr 1234567890',
            'ss16' => 'AaBbGgQqRr 1234567890',
            'ss17' => 'AaBbGgQqRr 1234567890',
            'ss18' => 'AaBbGgQqRr 1234567890',
            'ss19' => 'AaBbGgQqRr 1234567890',
            'ss20' => 'AaBbGgQqRr 1234567890',

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
                    'id' => 'ss06',
                    'name' => esc_html__('Stylistic Set 6', 'opentype-stylist'),
                    'category' => 'stylistic-sets',
                    'description' => esc_html__('Alternate character designs', 'opentype-stylist')
                ),
                array(
                    'id' => 'ss07',
                    'name' => esc_html__('Stylistic Set 7', 'opentype-stylist'),
                    'category' => 'stylistic-sets',
                    'description' => esc_html__('Alternate character designs', 'opentype-stylist')
                ),
                array(
                    'id' => 'ss08',
                    'name' => esc_html__('Stylistic Set 8', 'opentype-stylist'),
                    'category' => 'stylistic-sets',
                    'description' => esc_html__('Alternate character designs', 'opentype-stylist')
                ),
                array(
                    'id' => 'ss09',
                    'name' => esc_html__('Stylistic Set 9', 'opentype-stylist'),
                    'category' => 'stylistic-sets',
                    'description' => esc_html__('Alternate character designs', 'opentype-stylist')
                ),
                array(
                    'id' => 'ss10',
                    'name' => esc_html__('Stylistic Set 10', 'opentype-stylist'),
                    'category' => 'stylistic-sets',
                    'description' => esc_html__('Alternate character designs', 'opentype-stylist')
                ),
                array(
                    'id' => 'ss11',
                    'name' => esc_html__('Stylistic Set 11', 'opentype-stylist'),
                    'category' => 'stylistic-sets',
                    'description' => esc_html__('Alternate character designs', 'opentype-stylist')
                ),
                array(
                    'id' => 'ss12',
                    'name' => esc_html__('Stylistic Set 12', 'opentype-stylist'),
                    'category' => 'stylistic-sets',
                    'description' => esc_html__('Alternate character designs', 'opentype-stylist')
                ),
                array(
                    'id' => 'ss13',
                    'name' => esc_html__('Stylistic Set 13', 'opentype-stylist'),
                    'category' => 'stylistic-sets',
                    'description' => esc_html__('Alternate character designs', 'opentype-stylist')
                ),
                array(
                    'id' => 'ss14',
                    'name' => esc_html__('Stylistic Set 14', 'opentype-stylist'),
                    'category' => 'stylistic-sets',
                    'description' => esc_html__('Alternate character designs', 'opentype-stylist')
                ),
                array(
                    'id' => 'ss15',
                    'name' => esc_html__('Stylistic Set 15', 'opentype-stylist'),
                    'category' => 'stylistic-sets',
                    'description' => esc_html__('Alternate character designs', 'opentype-stylist')
                ),
                array(
                    'id' => 'ss16',
                    'name' => esc_html__('Stylistic Set 16', 'opentype-stylist'),
                    'category' => 'stylistic-sets',
                    'description' => esc_html__('Alternate character designs', 'opentype-stylist')
                ),
                array(
                    'id' => 'ss17',
                    'name' => esc_html__('Stylistic Set 17', 'opentype-stylist'),
                    'category' => 'stylistic-sets',
                    'description' => esc_html__('Alternate character designs', 'opentype-stylist')
                ),
                array(
                    'id' => 'ss18',
                    'name' => esc_html__('Stylistic Set 18', 'opentype-stylist'),
                    'category' => 'stylistic-sets',
                    'description' => esc_html__('Alternate character designs', 'opentype-stylist')
                ),
                array(
                    'id' => 'ss19',
                    'name' => esc_html__('Stylistic Set 19', 'opentype-stylist'),
                    'category' => 'stylistic-sets',
                    'description' => esc_html__('Alternate character designs', 'opentype-stylist')
                ),
                array(
                    'id' => 'ss20',
                    'name' => esc_html__('Stylistic Set 20', 'opentype-stylist'),
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
        delete_transient('ots_css_variables');

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
        // Updated regex to properly handle multi-line @font-face with nested braces
        preg_match_all('/@font-face\s*\{((?:[^{}]+|\{[^{}]*\})*)\}/is', $css_content, $matches);

        foreach ($matches[1] as $font_face) {
            $font_data = array();

            // Extract font-family (handle both quoted and unquoted values)
            if (preg_match('/font-family:\s*["\']([^"\']+)["\']/i', $font_face, $family_match)) {
                // Quoted value (most common)
                $font_data['family'] = trim($family_match[1]);
            } elseif (preg_match('/font-family:\s*([^;\\s]+)/i', $font_face, $family_match)) {
                // Unquoted value (fallback)
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
                    'font_id' => isset($font['font_id']) ? absint($font['font_id']) : 0,
                    'css_content' => $sanitized_css,
                    'font_faces' => isset($font['font_faces']) ? $this->sanitize_font_faces($font['font_faces']) : array(),
                    'uploaded_date' => isset($font['uploaded_date']) ? sanitize_text_field($font['uploaded_date']) : current_time('mysql'),
                    'fallbacks' => isset($font['fallbacks']) ? sanitize_text_field($font['fallbacks']) : '',
                    'load_on_all_pages' => isset($font['load_on_all_pages']) ? (bool) $font['load_on_all_pages'] : false
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

                // Auto-generate font_id if missing
                if ($sanitized_font['font_id'] === 0) {
                    $sanitized_font['font_id'] = $this->generate_font_id();
                }

                $sanitized[] = $sanitized_font;
            }
        }

        return $sanitized;
    }

    /**
     * Sanitize font_faces array
     *
     * Ensures all fields in font face definitions are properly sanitized
     * to prevent XSS when displayed in admin interface.
     *
     * @param array $font_faces Array of font face definitions
     * @return array Sanitized font faces
     */
    private function sanitize_font_faces($font_faces) {
        if (!is_array($font_faces)) {
            return array();
        }

        $sanitized = array();
        foreach ($font_faces as $face) {
            if (!is_array($face)) {
                continue;
            }

            $sanitized_face = array();

            // Sanitize family name (most critical - could be rendered in UI)
            if (isset($face['family'])) {
                $sanitized_face['family'] = sanitize_text_field($face['family']);
            }

            // Sanitize weight
            if (isset($face['weight'])) {
                // Weight should be numeric (100-900 by default, 1-1000 for variable fonts) or keyword (normal, bold)
                $weight = sanitize_text_field($face['weight']);

                // Check if variable weights are enabled
                $allow_variable = get_option('ots_allow_variable_weights', false);

                // Validate it's a known weight value
                $valid_weights = array('normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900');

                if (!in_array($weight, $valid_weights, true)) {
                    // Try to coerce to number
                    $weight_num = absint($weight);

                    if ($allow_variable) {
                        // Variable fonts: accept any weight 1-1000
                        if ($weight_num >= 1 && $weight_num <= 1000) {
                            $sanitized_face['weight'] = (string) $weight_num;
                        } else {
                            $sanitized_face['weight'] = 'normal'; // Default fallback
                        }
                    } else {
                        // Standard fonts: only multiples of 100 between 100-900
                        if ($weight_num >= 100 && $weight_num <= 900 && $weight_num % 100 === 0) {
                            $sanitized_face['weight'] = (string) $weight_num;
                        } else {
                            $sanitized_face['weight'] = 'normal'; // Default fallback
                        }
                    }
                } else {
                    $sanitized_face['weight'] = $weight;
                }
            }

            // Sanitize style
            if (isset($face['style'])) {
                $style = sanitize_text_field($face['style']);
                // Style should be normal, italic, or oblique
                $valid_styles = array('normal', 'italic', 'oblique');
                if (!in_array($style, $valid_styles, true)) {
                    $sanitized_face['style'] = 'normal';
                } else {
                    $sanitized_face['style'] = $style;
                }
            }

            // Sanitize src (this is CSS, needs careful handling)
            if (isset($face['src'])) {
                // Use specialized sanitization for font src (preserves url(), format(), data URIs)
                $sanitized_face['src'] = $this->sanitize_font_src($face['src']);
            }

            $sanitized[] = $sanitized_face;
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
        try {
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

            // Process the ZIP file - returns array of font entries
            $font_entries = $this->process_font_kit_zip($uploaded_file, sanitize_text_field($params['name']));

            if (is_wp_error($font_entries)) {
                return $font_entries;
            }

            // Add all font entries from the kit
            $fonts = $this->get_custom_fonts();
            foreach ($font_entries as $font_entry) {
                $fonts[] = $font_entry;
            }
            update_option('ots_custom_fonts', $fonts);

            // Clear cache
            $this->clear_cache();

            return rest_ensure_response(array(
                'success' => true,
                'fonts' => $font_entries,
                'count' => count($font_entries)
            ));
        } catch (Exception $e) {
            // Return generic message to users
            return new WP_Error(
                'upload_exception',
                esc_html__('Upload failed due to an internal error. Please try again or contact support.', 'opentype-stylist'),
                array('status' => 500)
            );
        }
    }

    /**
     * REST endpoint: Delete font
     */
    public function delete_font_endpoint($request) {
        $id = sanitize_key($request->get_param('id'));
        $fonts = $this->get_custom_fonts();

        // Find the font to delete
        $font_to_delete = null;
        foreach ($fonts as $font) {
            if ($font['id'] === $id) {
                $font_to_delete = $font;
                break;
            }
        }

        if (!$font_to_delete) {
            return new WP_Error('font_not_found', esc_html__('Font not found', 'opentype-stylist'), array('status' => 404));
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
        // Note: SVG font files are intentionally excluded here, even though SVG is a valid font format,
        // because SVG can embed JavaScript (e.g. <script> tags or event handlers) and therefore pose an XSS risk.
        // SVG fonts were previously allowed but were removed for defense-in-depth and to avoid serving active content.
        $all_files = list_files($kit_base_path, 100);
        $allowed_extensions = array('css', 'woff', 'woff2', 'ttf', 'otf', 'eot');

        foreach ($all_files as $file) {
            $file_ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));

            // Delete any non-allowed file types
            if (!in_array($file_ext, $allowed_extensions, true)) {
                wp_delete_file($file);
                continue;
            }

            // Prevent PHP execution
            if (in_array($file_ext, array('php', 'php3', 'php4', 'php5', 'phtml', 'phps'), true)) {
                wp_delete_file($file);
                continue;
            }

            // Validate file is within expected directory
            $real_path = realpath($file);
            $real_base = realpath($kit_base_path);
            if ($real_path === false || $real_base === false || strpos($real_path, $real_base) !== 0) {
                wp_delete_file($file);
                continue;
            }

            // Validate font files by magic number (file signature)
            if (in_array($file_ext, array('woff', 'woff2', 'ttf', 'otf', 'eot'), true)) {
                if (!$this->is_valid_font_file($file)) {
                    wp_delete_file($file); // Not a real font file
                }
            }
        }

        // Find ALL CSS files in the kit
        $css_files = array();
        try {
            $iterator = new RecursiveDirectoryIterator($kit_base_path, RecursiveDirectoryIterator::SKIP_DOTS);
            foreach (new RecursiveIteratorIterator($iterator) as $file) {
                if ($file->isFile() && strtolower($file->getExtension()) === 'css') {
                    $css_files[] = $file->getPathname();
                }
            }
        } catch (Exception $e) {
            $wp_filesystem->rmdir($kit_base_path, true);
            return new WP_Error(
                'iterator_failed',
                esc_html__('Failed to process font kit. The archive may be corrupted.', 'opentype-stylist')
            );
        }

        if (empty($css_files)) {
            $wp_filesystem->rmdir($kit_base_path, true);
            return new WP_Error('no_css', esc_html__('No CSS file found in the font kit', 'opentype-stylist'));
        }

        // Select the best CSS file (prioritizes actual font CSS over specimen/demo files)
        $css_file_path = $this->select_font_css_file($css_files, $kit_base_path, $wp_filesystem);

        if (is_wp_error($css_file_path)) {
            $wp_filesystem->rmdir($kit_base_path, true);
            return $css_file_path;
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

        // Sanitize CSS content to remove dangerous rules and external URLs
        $css_content = $this->sanitize_font_css($css_content);

        // Check if sanitization removed all content
        if (empty($css_content)) {
            $wp_filesystem->rmdir($kit_base_path, true);
            return new WP_Error('invalid_css', esc_html__('No valid @font-face declarations found after sanitization', 'opentype-stylist'));
        }

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

        // Group font faces by family name to create individual font entries
        $fonts_by_family = array();
        foreach ($font_faces as $face) {
            $family = $face['family'];
            if (!isset($fonts_by_family[$family])) {
                $fonts_by_family[$family] = array();
            }
            $fonts_by_family[$family][] = $face;
        }

        // Create individual font entries for each family
        $font_entries = array();
        foreach ($fonts_by_family as $family => $faces) {
            // Create unique ID for this font (not the kit)
            $family_slug = sanitize_title($family);
            $composite_font_id = $kit_id . '-' . $family_slug;

            // Extract just the @font-face rules for this family from CSS
            $family_css = $this->extract_font_face_css($css_content, $family);

            $font_entries[] = array(
                'id' => sanitize_key($composite_font_id),
                'name' => sanitize_text_field($family), // Use family name as font name
                'font_id' => $this->generate_font_id(),
                'kit_id' => sanitize_key($kit_id),       // Link back to original kit
                'kit_name' => sanitize_text_field($kit_name), // For display/grouping
                'css_content' => $family_css,
                'font_faces' => $faces,                  // Only this family's faces
                'upload_path' => $kit_base_path,         // Shared directory
                'upload_url' => $kit_base_url,
                'uploaded_date' => current_time('mysql')
            );
        }

        return $font_entries;
    }

    /**
     * Select the best CSS file from webfont kit
     *
     * Prioritizes files likely to contain actual font definitions over
     * specimen/demo CSS files that may be included in the kit.
     *
     * @param array $css_files Array of CSS file paths
     * @param string $kit_base_path Base path of the extracted kit
     * @param WP_Filesystem_Base $wp_filesystem WordPress filesystem API instance
     * @return string|WP_Error Path to selected CSS file or WP_Error
     */
    private function select_font_css_file($css_files, $kit_base_path, $wp_filesystem) {
        $candidates = array();

        foreach ($css_files as $css_path) {
            $score = 0;
            $relative_path = str_replace($kit_base_path, '', $css_path);
            $relative_path = str_replace('\\', '/', $relative_path); // Normalize Windows paths
            $basename = basename($css_path);
            $dirname = dirname($relative_path);

            // Priority scoring heuristics

            // 1. Prioritize files at root level (+100 points)
            $depth = substr_count($relative_path, '/');
            if ($depth <= 1) { // Root or one level deep
                $score += 100;
            }

            // 2. Prioritize common font CSS filenames (+50 points)
            $font_css_names = array('stylesheet.css', 'styles.css', 'fonts.css', 'webfonts.css', 'font.css');
            if (in_array(strtolower($basename), $font_css_names, true)) {
                $score += 50;
            }

            // 3. Penalize specimen/demo/example directories (-200 points)
            $excluded_dirs = array('specimen', 'demo', 'example', 'test', 'sample');
            foreach ($excluded_dirs as $excluded) {
                if (stripos($dirname, $excluded) !== false) {
                    $score -= 200;
                    break;
                }
            }

            // 4. Read file and check for @font-face (+1000 points - REQUIRED)
            $css_content = $wp_filesystem->get_contents($css_path);
            $has_font_face = false;

            if ($css_content !== false && preg_match('/@font-face\s*\{/i', $css_content)) {
                $has_font_face = true;
                $score += 1000;

                // 5. Prioritize smaller files (font CSS is typically small)
                $file_size = filesize($css_path);
                if ($file_size < 5120) { // Under 5KB
                    $score += 20;
                } elseif ($file_size < 10240) { // Under 10KB
                    $score += 10;
                }
            }

            // Store candidate with score
            $candidates[] = array(
                'path' => $css_path,
                'score' => $score,
                'has_font_face' => $has_font_face,
                'relative_path' => $relative_path,
                'size' => filesize($css_path)
            );
        }

        // Sort by score (highest first)
        usort($candidates, function($a, $b) {
            return $b['score'] - $a['score'];
        });

        // Select the best candidate that has @font-face
        foreach ($candidates as $candidate) {
            if ($candidate['has_font_face']) {
                return $candidate['path'];
            }
        }

        // No valid CSS file found - return detailed error
        $file_list = array_map(function($candidate) {
            return sprintf(
                '%s (%s)',
                $candidate['relative_path'],
                $candidate['has_font_face'] ? 'has @font-face' : 'no @font-face'
            );
        }, $candidates);

        return new WP_Error(
            'no_font_face_css',
            sprintf(
                /* translators: %d: number of CSS files found */
                esc_html__('Found %d CSS file(s) in the font kit, but none contain valid @font-face declarations. Please ensure the ZIP file contains a proper webfont stylesheet.', 'opentype-stylist'),
                count($css_files)
            ),
            array(
                'status' => 400,
                'css_files_found' => $file_list
            )
        );
    }

    /**
     * Extract @font-face CSS rules for a specific font family
     *
     * @param string $css_content Full CSS content
     * @param string $family Font family name
     * @return string CSS containing only @font-face rules for this family
     */
    private function extract_font_face_css($css_content, $family) {
        $family_css = '';

        // Find all @font-face blocks that match this family
        // Updated regex to properly handle multi-line @font-face with nested braces
        preg_match_all('/@font-face\s*\{((?:[^{}]+|\{[^{}]*\})*)\}/is', $css_content, $matches, PREG_SET_ORDER);

        foreach ($matches as $match) {
            $font_face_block = $match[0];
            $font_face_content = $match[1];

            // Check if this block contains the target family
            if (preg_match('/font-family:\s*["\']?' . preg_quote($family, '/') . '["\']?/i', $font_face_content)) {
                $family_css .= $font_face_block . "\n\n";
            }
        }

        return $family_css;
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

        // Add .htaccess to prevent PHP execution - Compatible with Apache 2.2 and 2.4+
        $htaccess_file = $font_dir . '/.htaccess';
        if (!file_exists($htaccess_file)) {
            $htaccess_content = $this->get_htaccess_content();

            // Initialize WP_Filesystem for secure file writing
            global $wp_filesystem;
            if (empty($wp_filesystem)) {
                require_once ABSPATH . 'wp-admin/includes/file.php';
                WP_Filesystem();
            }

            // Write .htaccess file using WP_Filesystem API
            $wp_filesystem->put_contents($htaccess_file, $htaccess_content, FS_CHMOD_FILE);
        }

        // Add index.php to prevent directory listing
        $index_file = $font_dir . '/index.php';
        if (!file_exists($index_file)) {
            @file_put_contents($index_file, '<?php // Silence is golden');
        }
    }

    /**
     * Get .htaccess content for font directory protection
     *
     * @return string .htaccess file content
     */
    private function get_htaccess_content() {
        $content = "# Prevent PHP execution\n";
        $content .= "# Apache 2.4+\n";
        $content .= "<IfModule mod_authz_core.c>\n";
        $content .= "    <FilesMatch \"\\.php$\">\n";
        $content .= "        Require all denied\n";
        $content .= "    </FilesMatch>\n";
        $content .= "</IfModule>\n";
        $content .= "# Apache 2.2\n";
        $content .= "<IfModule !mod_authz_core.c>\n";
        $content .= "    <FilesMatch \"\\.php$\">\n";
        $content .= "        Deny from all\n";
        $content .= "    </FilesMatch>\n";
        $content .= "</IfModule>\n";
        $content .= "# Prevent directory listing\n";
        $content .= "Options -Indexes\n";

        return $content;
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
                    'font_id' => isset($font['font_id']) ? absint($font['font_id']) : 0,
                    'css_url' => esc_url_raw($font['css_url'], array('https')),
                    'font_families' => isset($font['font_families']) && is_array($font['font_families'])
                        ? array_map('sanitize_text_field', $font['font_families'])
                        : array(),
                    'added_date' => isset($font['added_date']) ? sanitize_text_field($font['added_date']) : current_time('mysql'),
                    'fallbacks' => isset($font['fallbacks']) ? sanitize_text_field($font['fallbacks']) : '',
                    'load_on_all_pages' => isset($font['load_on_all_pages']) ? (bool) $font['load_on_all_pages'] : false
                );

                // Auto-generate font_id if missing
                if ($sanitized_font['font_id'] === 0) {
                    $sanitized_font['font_id'] = $this->generate_font_id();
                }

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
                    'font_id' => isset($font['font_id']) ? absint($font['font_id']) : 0,
                    'font_family' => sanitize_text_field($font['font_family']),
                    'fallbacks' => isset($font['fallbacks']) ? sanitize_text_field($font['fallbacks']) : '',
                    'added_date' => isset($font['added_date']) ? sanitize_text_field($font['added_date']) : current_time('mysql')
                );

                // Auto-generate font_id if missing
                if ($sanitized_font['font_id'] === 0) {
                    $sanitized_font['font_id'] = $this->generate_font_id();
                }

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
     * @since 1.0.0
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
     * @since 1.0.0
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
     * @since 1.0.0
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

        // Parse font families from user input
        $font_families_input = !empty($params['font_families']) && is_array($params['font_families'])
            ? array_map('sanitize_text_field', $params['font_families'])
            : array();

        if (empty($font_families_input)) {
            return new WP_Error('missing_families', esc_html__('At least one font family is required', 'opentype-stylist'), array('status' => 400));
        }

        // Create kit metadata
        $kit_id = 'adobe-' . $parsed['kit_id'];

        // Check for duplicate kit ID or CSS URL
        $existing_fonts = $this->get_adobe_fonts();
        foreach ($existing_fonts as $font) {
            $is_duplicate_kit_id = isset($font['kit_id']) && $font['kit_id'] === $kit_id;
            $is_duplicate_css_url = isset($font['css_url'], $parsed['css_url']) && $font['css_url'] === $parsed['css_url'];

            if ($is_duplicate_kit_id || $is_duplicate_css_url) {
                return new WP_Error('duplicate_kit', esc_html__('This Adobe Fonts kit has already been added. Please use a different kit or remove the existing one first.', 'opentype-stylist'), array('status' => 400));
            }
        }
        $kit_name = !empty($params['name']) ? sanitize_text_field($params['name']) : 'Adobe Fonts ' . $parsed['kit_id'];

        // Create individual font entries for each family (similar to MyFonts kits)
        $font_entries = array();
        foreach ($font_families_input as $family) {
            $family_slug = sanitize_title($family);
            $composite_font_id = $kit_id . '-' . $family_slug;

            $font_entries[] = array(
                'id' => sanitize_key($composite_font_id),
                'name' => sanitize_text_field($family), // Use family name as font name
                'font_id' => $this->generate_font_id(),
                'font_family' => sanitize_text_field($family), // Single family per entry
                'kit_id' => sanitize_key($kit_id),       // Link back to original kit
                'kit_name' => sanitize_text_field($kit_name), // For display/grouping
                'css_url' => $parsed['css_url'],         // Same CSS URL for all fonts in kit
                'added_date' => current_time('mysql')
            );
        }

        // Add all font entries from the kit
        $fonts = $this->get_adobe_fonts();
        foreach ($font_entries as $font_entry) {
            $fonts[] = $font_entry;
        }
        update_option('ots_adobe_fonts', $fonts);

        // Clear cache
        $this->clear_cache();

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
     * @since 1.0.0
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
            return new WP_Error('missing_parameter', esc_html__('load_on_all_pages parameter is required', 'opentype-stylist'), array('status' => 400));
        }

        $fonts = $this->get_adobe_fonts();
        $found = false;

        foreach ($fonts as $key => $font) {
            if ($font['id'] === $id) {
                $fonts[$key]['load_on_all_pages'] = (bool) $params['load_on_all_pages'];
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
     * @since 1.0.0
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
            return new WP_Error('missing_parameter', esc_html__('load_on_all_pages parameter is required', 'opentype-stylist'), array('status' => 400));
        }

        $fonts = $this->get_custom_fonts();
        $found = false;

        foreach ($fonts as $key => $font) {
            if ($font['id'] === $id) {
                $fonts[$key]['load_on_all_pages'] = (bool) $params['load_on_all_pages'];
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
     * @since 1.0.0
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
     * @since 1.0.0
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
            'font_id' => $this->generate_font_id(),
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
     * @since 1.0.0
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

        if (!isset($params['font_family'])) {
            return new WP_Error('missing_font_family', esc_html__('Font family parameter is required', 'opentype-stylist'), array('status' => 400));
        }

        $fonts = $this->get_manual_fonts();
        $found = false;

        foreach ($fonts as $key => $font) {
            if ($font['id'] === $id) {
                $fonts[$key]['font_family'] = sanitize_text_field($params['font_family']);
                $fonts[$key]['fallbacks'] = isset($params['fallbacks']) ? sanitize_text_field($params['fallbacks']) : '';
                $found = true;
                break;
            }
        }

        if (!$found) {
            return new WP_Error('font_not_found', esc_html__('Manual font not found', 'opentype-stylist'), array('status' => 404));
        }

        update_option('ots_manual_fonts', $fonts);
        $this->clear_cache();

        return rest_ensure_response(array('success' => true, 'font' => $fonts[$key]));
    }

    /**
     * Enqueue Adobe Fonts scripts in editor and frontend
     *
     * Loads Adobe Fonts (Typekit) CSS stylesheets for configured projects.
     * In editor contexts: loads all fonts for preview.
     * On frontend: only loads fonts that are either:
     *   - Set to "load on all pages" OR
     *   - Actually used on the current page
     *
     * @since 1.0.0
     *
     * @return void
     */
    public function enqueue_adobe_fonts() {
        $adobe_fonts = $this->get_adobe_fonts();

        if (empty($adobe_fonts)) {
            return;
        }

        // In admin/editor, always load all fonts for preview
        $is_editor = is_admin();

        // Only get used fonts if at least one font is set to load conditionally
        $used_font_families = array();
        $used_font_ids = array();
        $has_conditional_fonts = false;
        if (!$is_editor) {
            foreach ($adobe_fonts as $font) {
                if (empty($font['load_on_all_pages'])) {
                    $has_conditional_fonts = true;
                    break;
                }
            }
            if ($has_conditional_fonts) {
                $used_fonts_raw = $this->get_used_fonts_in_content();

                // Separate font IDs from font family names
                foreach ($used_fonts_raw as $font_ref) {
                    if (strpos($font_ref, 'id:') === 0) {
                        $used_font_ids[] = (int) substr($font_ref, 3);
                    } else {
                        $used_font_families[] = $font_ref;
                    }
                }

                // Resolve font IDs through replacement chain
                // If content uses font 16 which was replaced by font 29, we need to load font 29
                $used_font_ids = $this->resolve_used_font_replacements($used_font_ids);

                // Parse font families from CSS font-family values
                if (!empty($used_font_families)) {
                    $individual_font_families = $this->parse_font_family_list($used_font_families);
                    $used_font_families = array_unique($individual_font_families);
                }
            }
        }

        // Track which CSS URLs should be loaded (to avoid duplicates when fonts are from same kit)
        $css_urls_to_load = array();

        foreach ($adobe_fonts as $font) {
            if (empty($font['css_url'])) {
                continue;
            }

            // Determine if this font should be loaded
            $should_load = false;

            if ($is_editor) {
                // Always load in editor for preview
                $should_load = true;
            } else {
                // On frontend, check load_on_all_pages setting
                if (!empty($font['load_on_all_pages'])) {
                    $should_load = true;
                } else {
                    // Check if font ID is used
                    if (isset($font['font_id']) && in_array($font['font_id'], $used_font_ids)) {
                        $should_load = true;
                    }

                    // Check if font_family is used (new structure: single string)
                    if (!$should_load && !empty($font['font_family'])) {
                        if (in_array($font['font_family'], $used_font_families)) {
                            $should_load = true;
                        }
                    }

                    // Check if any of font_families are used (legacy structure: array)
                    if (!$should_load && !empty($font['font_families'])) {
                        foreach ($font['font_families'] as $family) {
                            if (in_array($family, $used_font_families)) {
                                $should_load = true;
                                break;
                            }
                        }
                    }
                }
            }

            if ($should_load) {
                // Use kit_id for handle if available, otherwise fall back to font id
                $handle_id = !empty($font['kit_id']) ? $font['kit_id'] : $font['id'];
                $css_urls_to_load[$handle_id] = $font['css_url'];
            }
        }

        // Enqueue each unique CSS URL once
        foreach ($css_urls_to_load as $handle_id => $css_url) {
            wp_enqueue_style(
                'ots-adobe-' . $handle_id,
                esc_url($css_url, array('https')),
                array(),
                $handle_id  // Use kit ID as version for cache busting when Adobe updates fonts
            );
        }
    }

    /**
     * =========================================================================
     * FONT ID AND REPLACEMENT MANAGEMENT
     * =========================================================================
     */

    /**
     * REST API: Get all font replacements
     */
    public function get_font_replacements_endpoint($request) {
        $replacements = $this->get_font_replacements();
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
            return new WP_Error('missing_params', __('Missing required parameters.', 'opentype-stylist'), array('status' => 400));
        }

        $success = $this->add_font_replacement((int) $deleted_id, (int) $replacement_id, (bool) $global_load);

        if ($success === false) {
            return new WP_Error('invalid_id', __('Invalid font ID (0). Font IDs must be greater than 0.', 'opentype-stylist'), array('status' => 400));
        }

        if ($success) {
            return rest_ensure_response(array('success' => true, 'replacements' => $this->get_font_replacements()));
        }

        return new WP_Error('failed', __('Failed to add font replacement.', 'opentype-stylist'), array('status' => 500));
    }

    /**
     * REST API: Update font replacement
     */
    public function update_font_replacement_endpoint($request) {
        $deleted_id = $request->get_param('id');
        $replacement_id = $request->get_param('replacement_id');
        $global_load = $request->get_param('global_load');

        if (empty($deleted_id)) {
            return new WP_Error('missing_id', __('Missing font ID.', 'opentype-stylist'), array('status' => 400));
        }

        $success = $this->add_font_replacement((int) $deleted_id, (int) $replacement_id, (bool) $global_load);

        if ($success === false) {
            return new WP_Error('invalid_id', __('Invalid font ID (0). Font IDs must be greater than 0.', 'opentype-stylist'), array('status' => 400));
        }

        if ($success) {
            return rest_ensure_response(array('success' => true, 'replacements' => $this->get_font_replacements()));
        }

        return new WP_Error('failed', __('Failed to update font replacement.', 'opentype-stylist'), array('status' => 500));
    }

    /**
     * REST API: Delete font replacement
     */
    public function delete_font_replacement_endpoint($request) {
        $deleted_id = $request->get_param('id');

        if (empty($deleted_id)) {
            return new WP_Error('missing_id', __('Missing font ID.', 'opentype-stylist'), array('status' => 400));
        }

        $success = $this->remove_font_replacement((int) $deleted_id);

        if ($success) {
            return rest_ensure_response(array('success' => true));
        }

        return new WP_Error('failed', __('Failed to delete font replacement.', 'opentype-stylist'), array('status' => 500));
    }

    /**
     * REST API: Get unassigned fonts
     */
    public function get_unassigned_fonts_endpoint($request) {
        $unassigned = $this->get_unassigned_font_ids();
        return rest_ensure_response(array('orphaned_ids' => $unassigned));
    }

    /**
     * Get font replacements data
     *
     * @return array Font replacement mappings and settings
     */
    private function get_font_replacements() {
        if (null === $this->font_replacements_cache) {
            $this->font_replacements_cache = get_option('ots_font_replacements', array(
                'mappings' => array(),
                'global_load' => array(),
                'next_id' => 1
            ));
        }
        return $this->font_replacements_cache;
    }

    /**
     * Generate next available font ID
     *
     * Uses simple sequential allocation starting from 1
     * All fonts (custom, adobe, manual) share the same ID sequence
     *
     * @return int Next available ID
     */
    private function generate_font_id() {
        $replacements = $this->get_font_replacements();

        // Get next ID (starts at 1)
        $next_id = isset($replacements['next_id']) ? $replacements['next_id'] : 1;
        $current_id = $next_id;

        // Increment for next time
        $replacements['next_id'] = $next_id + 1;
        update_option('ots_font_replacements', $replacements);
        $this->font_replacements_cache = $replacements;

        return $current_id;
    }

    /**
     * Get all font IDs currently in use
     *
     * @return array Array of all active font IDs
     */
    private function get_all_active_font_ids() {
        $ids = array();

        // Get custom fonts
        $custom_fonts = $this->get_custom_fonts();
        foreach ($custom_fonts as $font) {
            if (isset($font['font_id'])) {
                $ids[] = $font['font_id'];
            }
        }

        // Get Adobe fonts
        $adobe_fonts = $this->get_adobe_fonts();
        foreach ($adobe_fonts as $font) {
            if (isset($font['font_id'])) {
                $ids[] = $font['font_id'];
            }
        }

        // Get manual fonts
        $manual_fonts = $this->get_manual_fonts();
        foreach ($manual_fonts as $font) {
            if (isset($font['font_id'])) {
                $ids[] = $font['font_id'];
            }
        }

        return $ids;
    }

    /**
     * Flatten replacement chain
     *
     * If A→B and B→C exist, this updates to A→C (removes intermediate mappings)
     * Prevents circular references
     *
     * @param array $mappings Current replacement mappings
     * @return array Flattened mappings
     */
    private function flatten_replacement_chain($mappings) {
        $flattened = array();
        $seen = array();

        foreach ($mappings as $deleted_id => $replacement_id) {
            // Detect circular references
            if (isset($seen[$deleted_id])) {
                continue; // Skip circular reference
            }

            $seen[$deleted_id] = true;
            $current = $replacement_id;
            $depth = 0;
            $max_depth = 10; // Safety limit

            // Follow the chain to the end
            while (isset($mappings[$current]) && $depth < $max_depth) {
                $current = $mappings[$current];
                $depth++;
            }

            // Store the final target
            $flattened[$deleted_id] = $current;
        }

        return $flattened;
    }

    /**
     * Resolve font IDs through replacement chain
     *
     * Takes an array of used font IDs and returns an expanded array that includes
     * both the original IDs and any fonts they've been replaced with.
     * This ensures that when content references a deleted font ID, the replacement
     * font's assets are actually loaded.
     *
     * @param array $used_font_ids Array of font IDs found in content (e.g., [16, 32])
     * @return array Expanded array including replacement targets (e.g., [16, 29, 32])
     */
    private function resolve_used_font_replacements($used_font_ids) {
        $replacements = $this->get_font_replacements();

        if (empty($replacements['mappings'])) {
            return $used_font_ids;
        }

        $resolved_ids = array();

        foreach ($used_font_ids as $font_id) {
            // Always include the original ID (for the CSS variable alias)
            $resolved_ids[] = $font_id;

            // If this font has been replaced, also include the replacement target
            if (isset($replacements['mappings'][$font_id])) {
                $replacement_id = $replacements['mappings'][$font_id];
                $resolved_ids[] = $replacement_id;
            }
        }

        return array_unique($resolved_ids);
    }

    /**
     * Add or update font replacement mapping
     *
     * @param int $deleted_id Font ID that was deleted
     * @param int $replacement_id Font ID to use as replacement
     * @param bool $global_load Whether to load this replacement globally
     * @return bool Success
     */
    public function add_font_replacement($deleted_id, $replacement_id, $global_load = false) {
        // Validate IDs are not 0
        if ((int) $deleted_id === 0 || (int) $replacement_id === 0) {
            return false;
        }

        $replacements = $this->get_font_replacements();

        // Add mapping
        $replacements['mappings'][$deleted_id] = $replacement_id;

        // Flatten chains
        $replacements['mappings'] = $this->flatten_replacement_chain($replacements['mappings']);

        // Update global load setting
        if ($global_load) {
            if (!in_array($deleted_id, $replacements['global_load'])) {
                $replacements['global_load'][] = $deleted_id;
            }
        } else {
            $replacements['global_load'] = array_diff($replacements['global_load'], array($deleted_id));
        }

        update_option('ots_font_replacements', $replacements);
        $this->font_replacements_cache = $replacements;
        $this->clear_cache();

        return true;
    }

    /**
     * Remove font replacement mapping
     *
     * @param int $deleted_id Font ID to remove mapping for
     * @return bool Success
     */
    public function remove_font_replacement($deleted_id) {
        $replacements = $this->get_font_replacements();

        unset($replacements['mappings'][$deleted_id]);
        $replacements['global_load'] = array_diff($replacements['global_load'], array($deleted_id));

        update_option('ots_font_replacements', $replacements);
        $this->font_replacements_cache = $replacements;
        $this->clear_cache();

        return true;
    }

    /**
     * Get unassigned font IDs
     *
     * Returns font IDs that are referenced in replacement mappings
     * but no longer exist as active fonts
     *
     * @return array Array of unassigned font IDs
     */
    public function get_unassigned_font_ids() {
        $replacements = $this->get_font_replacements();
        $active_ids = $this->get_all_active_font_ids();
        $unassigned = array();

        // Check both deleted IDs (keys) and replacement IDs (values) in mappings
        foreach ($replacements['mappings'] as $deleted_id => $replacement_id) {
            // Check if replacement target still exists as an active font
            if (!in_array($replacement_id, $active_ids)) {
                // Replacement ID no longer exists - this mapping is broken
                $unassigned[] = $deleted_id;
            }
        }

        return $unassigned;
    }

    /**
     * Get CSS variables string for all fonts
     *
     * Returns CSS string with :root { --font-ID: "Family Name", fallback; } declarations
     * Includes aliases for deleted fonts with replacements
     *
     * @return string CSS variables string
     */
    public function get_font_css_variables() {
        // Check transient cache first
        $cache_key = 'ots_css_variables';
        $cached_css = get_transient($cache_key);

        if (false !== $cached_css) {
            return $cached_css;
        }

        $css_vars = array();
        $replacements = $this->get_font_replacements();

        // Process custom fonts
        $custom_fonts = $this->get_custom_fonts();
        foreach ($custom_fonts as $font) {
            if (isset($font['font_id']) && !empty($font['font_faces'][0])) {
                // Use first face for main variable - sanitize for CSS context
                $family = $this->sanitize_css_value($font['font_faces'][0]['family']);
                $fallback = isset($font['fallbacks']) ? ', ' . $this->sanitize_css_value($font['fallbacks']) : '';
                $css_vars[] = sprintf('--font-%d: "%s"%s', $font['font_id'], $family, $fallback);
            }
        }

        // Process Adobe fonts
        $adobe_fonts = $this->get_adobe_fonts();
        foreach ($adobe_fonts as $font) {
            if (isset($font['font_id'])) {
                $family = '';

                // New structure: font_family (single string) - sanitize for CSS context
                if (!empty($font['font_family'])) {
                    $family = $this->sanitize_css_value($font['font_family']);
                }
                // Legacy structure: font_families (array, use first)
                elseif (!empty($font['font_families'][0])) {
                    $family = $this->sanitize_css_value($font['font_families'][0]);
                }

                if ($family) {
                    $fallback = isset($font['fallbacks']) ? ', ' . $this->sanitize_css_value($font['fallbacks']) : '';
                    $css_vars[] = sprintf('--font-%d: "%s"%s', $font['font_id'], $family, $fallback);
                }
            }
        }

        // Process manual fonts
        $manual_fonts = $this->get_manual_fonts();
        foreach ($manual_fonts as $font) {
            if (isset($font['font_id']) && !empty($font['font_family'])) {
                $family_raw = $font['font_family'];

                // Check if font_family already contains commas (indicating fallbacks are included)
                // and whether there are separate fallbacks defined - sanitize for CSS context
                if (!empty($font['fallbacks'])) {
                    if (strpos($family_raw, ',') === false) {
                        // Separate fallbacks provided and font_family is a single family
                        $family = '"' . $this->sanitize_css_value($family_raw) . '", ' . $this->sanitize_css_value($font['fallbacks']);
                    } else {
                        // font_family already provides a stack; append additional fallbacks
                        $family = $this->sanitize_css_value($family_raw) . ', ' . $this->sanitize_css_value($font['fallbacks']);
                    }
                } else {
                    // No separate fallbacks defined; use font_family as provided
                    $family = $this->sanitize_css_value($family_raw);
                }

                $css_vars[] = sprintf('--font-%d: %s', $font['font_id'], $family);
            }
        }

        // Add replacement aliases
        foreach ($replacements['mappings'] as $deleted_id => $replacement_id) {
            $css_vars[] = sprintf('--font-%d: var(--font-%d)', (int) $deleted_id, (int) $replacement_id);
        }

        if (empty($css_vars)) {
            return '';
        }

        $css = ":root {\n    " . implode(";\n    ", $css_vars) . ";\n}";

        // Cache for 24 hours
        set_transient($cache_key, $css, DAY_IN_SECONDS);

        return $css;
    }

    /**
     * Output CSS variables for all fonts
     *
     * Generates :root { --font-ID: "Family Name", fallback; } declarations
     * Includes aliases for deleted fonts with replacements
     *
     * Note: Uses direct style element output rather than wp_add_inline_style()
     * because CSS custom properties must be available globally across admin contexts
     * (block editor, settings page) where stylesheets may not be uniformly enqueued.
     */
    public function output_font_css_variables() {
        // Only output in appropriate contexts
        if (!is_admin() && !$this->has_styled_content()) {
            $replacements = $this->get_font_replacements();
            // Check if any replacements are set to global load
            if (empty($replacements['global_load'])) {
                return;
            }
        }

        $css = $this->get_font_css_variables();
        if (!empty($css)) {
            // Additional CSS content sanitization
            // Remove any potentially dangerous CSS constructs
            $css = $this->sanitize_output_css($css);

            // Sanitize CSS output - allow only safe CSS for :root variables
            $allowed_css = array(
                'style' => array(
                    'id' => array(),
                    'type' => array()
                )
            );
            // Direct style output required (not wp_add_inline_style) because:
            // 1. Must be available globally across all admin contexts (block editor, settings, iframe)
            // 2. Conditional logic requires early wp_head hook (priority 5) - stylesheets not enqueued yet
            // 3. Stylesheet handles aren't uniformly enqueued across contexts (esp. block editor iframe)
            // 4. wp_add_inline_style() on dummy handles is unreliable in iframe context
            // 5. CSS variables must be in DOM before any blocks render to prevent FOUC
            // Alternative approaches tested:
            // - Dummy handle + wp_add_inline_style: Failed in iframe, timing issues in editor
            // - Per-context enqueue: Caused duplication and cache invalidation problems
            // - admin_print_styles hook: Too late for some editor initialization contexts
            // Output is sanitized via sanitize_output_css() and wp_kses()
            // phpcs:ignore WordPress.WP.EnqueuedResources.NonEnqueuedStylesheet
            echo wp_kses("<style id=\"ots-font-variables\">\n" . $css . "\n</style>\n", $allowed_css);
        }
    }

    /**
     * Sanitize CSS output for style tag
     *
     * Removes dangerous CSS constructs that could be injected via font names
     * or other user-controlled data.
     *
     * @param string $css CSS content
     * @return string Sanitized CSS
     */
    private function sanitize_output_css($css) {
        // Remove CSS comments (could hide malicious code)
        $css = preg_replace('/\/\*.*?\*\//s', '', $css);

        // Remove @import (could load external stylesheets)
        $css = preg_replace('/@import[^;]+;/i', '', $css);

        // Remove expressions (IE-specific, can execute JavaScript)
        $css = preg_replace('/expression\s*\(/i', '', $css);

        // Remove behavior (IE-specific, can load HTC files)
        $css = preg_replace('/behavior\s*:/i', '', $css);

        // Remove -moz-binding (Firefox-specific, can execute XML)
        $css = preg_replace('/-moz-binding\s*:/i', '', $css);

        // Remove javascript: protocol from any remaining URLs
        $css = preg_replace('/javascript\s*:/i', '', $css);

        // Validate CSS is only :root variable declarations
        // This is what get_font_css_variables() should generate
        // Pattern: :root { --font-123: "Font Name", fallback; }
        if (!preg_match('/^\s*:root\s*\{[^}]+\}\s*$/s', $css)) {
            // If CSS doesn't match expected pattern, return empty
            return '';
        }

        return $css;
    }

    /**
     * Sanitize uploaded font CSS content
     *
     * Removes dangerous CSS rules like @import, external URLs, and non-@font-face declarations
     * to prevent CSS injection attacks and data exfiltration.
     *
     * @param string $css_content Raw CSS content from uploaded font kit
     * @return string Sanitized CSS content containing only safe @font-face rules
     */
    private function sanitize_font_css($css_content) {
        // Remove @import statements (can load external stylesheets)
        $css_content = preg_replace('/@import\s+[^;]+;/i', '', $css_content);

        // Extract only @font-face blocks
        // Updated regex to properly handle multi-line @font-face with nested braces
        // Note: We only extract @font-face blocks (whitelisting), so no need to
        // explicitly remove other @-rules - they're ignored automatically.
        preg_match_all(
            '/@font-face\s*\{(?:[^{}]+|\{[^{}]*\})*\}/is',
            $css_content,
            $matches
        );

        if (empty($matches[0])) {
            return '';
        }

        $sanitized_font_faces = array();
        foreach ($matches[0] as $font_face) {
            // Validate each @font-face block
            if ($this->validate_font_face_block($font_face)) {
                $sanitized_font_faces[] = $font_face;
            }
        }

        return implode("\n\n", $sanitized_font_faces);
    }

    /**
     * Validate a single @font-face block
     *
     * Ensures the @font-face block contains required properties and no external URLs.
     * URLs are validated against the WordPress uploads directory path, not the site URL,
     * to handle protocol mismatches and CDN configurations.
     *
     * @param string $font_face_block A single @font-face {...} block
     * @return bool True if valid and safe
     */
    private function validate_font_face_block($font_face_block) {
        // Must contain font-family
        if (!preg_match('/font-family\s*:/i', $font_face_block)) {
            return false;
        }

        // Must contain src with valid URL or local()
        if (!preg_match('/src\s*:/i', $font_face_block)) {
            return false;
        }

        // Extract all URLs from the @font-face block
        preg_match_all('/url\s*\(\s*[\'"]?([^\)\'"\s]+)[\'"]?\s*\)/i', $font_face_block, $url_matches);

        if (empty($url_matches[1])) {
            // No URLs found - might use local() only, which is fine
            return true;
        }

        // Get hosts for validation (cache in static variables for performance)
        static $upload_host = null;
        static $site_host = null;

        if ($upload_host === null) {
            $upload_dir = wp_upload_dir();
            $upload_url_parts = wp_parse_url($upload_dir['baseurl']);
            $upload_host = isset($upload_url_parts['host']) ? strtolower($upload_url_parts['host']) : '';

            $site_url_parts = wp_parse_url(get_site_url());
            $site_host = isset($site_url_parts['host']) ? strtolower($site_url_parts['host']) : '';
        }

        // Check each URL
        foreach ($url_matches[1] as $url) {
            // Allow data URIs (embedded fonts)
            if (stripos($url, 'data:') === 0) {
                continue;
            }

            // Check if this is an absolute URL (contains ://)
            if (preg_match('/^https?:\/\//i', $url)) {
                // Parse the URL
                $url_parts = wp_parse_url($url);
                if ($url_parts === false) {
                    return false; // Malformed URL
                }

                $url_host = isset($url_parts['host']) ? strtolower($url_parts['host']) : '';
                $url_path = isset($url_parts['path']) ? $url_parts['path'] : '';

                // Validate the URL is from our WordPress installation
                // Check both upload host and site host to handle CDN configurations
                $is_local_host = (
                    $url_host === $upload_host ||
                    $url_host === $site_host ||
                    $url_host === 'localhost' ||
                    $url_host === '127.0.0.1' ||
                    $url_host === '[::1]'  // IPv6 localhost
                );

                if (!$is_local_host) {
                    // External host detected - reject
                    return false;
                }

                // Verify the path points to our uploads directory
                // Normalize path to prevent traversal attacks (e.g., /malicious/../wp-content/uploads/ots/fonts/)
                $normalized_path = preg_replace('#/+#', '/', $url_path); // Collapse multiple slashes
                $normalized_path = preg_replace('#/\.\./|/\./#', '/', $normalized_path); // Remove . and ..

                if (strpos($normalized_path, '/wp-content/uploads/ots/fonts/') === false) {
                    // URL is from our host but not in our uploads directory - reject
                    return false;
                }
            }
            // Relative URLs are fine - they'll be rewritten by rewrite_css_urls()
        }

        return true;
    }

    /**
     * Validate file is actually a font file by checking magic numbers
     *
     * Prevents PHP files or other malicious content from being uploaded with font extensions.
     * Uses hybrid approach: tries native fopen/fread for performance (reads only 4 bytes),
     * falls back to WP_Filesystem if fopen is disabled.
     *
     * @param string $file_path Path to file
     * @return bool True if valid font file
     */
    private function is_valid_font_file($file_path) {
        // Check if file exists first
        if (!file_exists($file_path)) {
            return false;
        }

        // Get file size to validate it's not empty
        $size = filesize($file_path);
        if ($size === false || $size < 4) {
            return false;
        }

        // Try native PHP file reading first (most performant - only reads 4 bytes)
        // phpcs:disable WordPress.WP.AlternativeFunctions.file_system_operations_fopen -- Performance: only reads 4 bytes vs loading entire 1-3MB font file
        if (function_exists('fopen') && ini_get('allow_url_fopen')) {
            $handle = @fopen($file_path, 'rb');
            if ($handle !== false) {
                // phpcs:disable WordPress.WP.AlternativeFunctions.file_system_operations_fread -- Performance: only reads 4 bytes vs loading entire font file
                $magic = fread($handle, 4);
                // phpcs:enable WordPress.WP.AlternativeFunctions.file_system_operations_fread
                // phpcs:disable WordPress.WP.AlternativeFunctions.file_system_operations_fclose
                fclose($handle);
                // phpcs:enable WordPress.WP.AlternativeFunctions.file_system_operations_fclose

                if ($magic !== false && strlen($magic) === 4) {
                    return $this->validate_font_magic_number($magic);
                }
            }
        }
        // phpcs:enable WordPress.WP.AlternativeFunctions.file_system_operations_fopen

        // Fallback to WP_Filesystem for compatibility
        // This loads entire file but ensures compatibility with restrictive environments
        global $wp_filesystem;
        if (empty($wp_filesystem)) {
            require_once ABSPATH . 'wp-admin/includes/file.php';
            WP_Filesystem();
        }

        if (!$wp_filesystem->exists($file_path)) {
            return false;
        }

        // Only use get_contents as fallback
        // Modern web fonts can be 1-3MB, so this isn't ideal but necessary for compatibility
        $contents = $wp_filesystem->get_contents($file_path);
        if ($contents === false || strlen($contents) < 4) {
            return false;
        }

        $magic = substr($contents, 0, 4);
        return $this->validate_font_magic_number($magic);
    }

    /**
     * Validate font file magic number (file signature)
     *
     * @param string $magic First 4 bytes of file
     * @return bool True if valid font signature
     */
    private function validate_font_magic_number($magic) {
        // Check for known font file magic numbers (signatures)
        $valid_signatures = array(
            'wOFF', // WOFF
            'wOF2', // WOFF2
            "\x00\x01\x00\x00", // TrueType/OpenType with TrueType outlines
            "OTTO", // OpenType with CFF outlines
            "true", // TrueType (old Mac)
            "typ1", // PostScript Type 1
        );

        foreach ($valid_signatures as $signature) {
            if (substr($magic, 0, strlen($signature)) === $signature) {
                return true;
            }
        }

        // EOT (Embedded OpenType) - basic detection
        // EOT headers typically start with two 0x00 bytes
        if (strlen($magic) >= 2 && substr($magic, 0, 2) === "\x00\x00") {
            return true;
        }

        return false;
    }

    /**
     * Sanitize CSS value for use in font-family and similar CSS properties
     *
     * Removes HTML tags, dangerous CSS characters, and potential injection vectors
     * while preserving valid font family syntax.
     *
     * @param string $value Raw CSS value
     * @return string Sanitized CSS value
     */
    private function sanitize_css_value($value) {
        // Remove any HTML tags
        $value = wp_strip_all_tags($value);

        // Remove dangerous CSS metacharacters that could break CSS syntax
        // Parentheses are removed for security (prevent CSS function injection like url(), calc(), expression())
        // Font names containing parentheses should be properly quoted per CSS specifications
        $value = str_replace(array('{', '}', ';', '<', '>', '(', ')', '[', ']', '\\'), '', $value);

        // Only allow letters, numbers, spaces, commas, hyphens, underscores, single quotes, and double quotes
        // Underscores and hyphens are valid in CSS font-family names per CSS spec
        // Periods are not allowed because: (1) they're invalid in unquoted CSS identifiers, and
        // (2) they often indicate file extensions (e.g., "Arial.ttf") which should not be in font-family names
        $value = preg_replace('/[^a-zA-Z0-9\s,\-_\'"]/', '', $value);

        // Return trimmed value (esc_attr removed - output is in <style> tag, not HTML attribute)
        // Multiple sanitization layers above prevent injection: wp_strip_all_tags, character filtering,
        // plus sanitize_output_css() and wp_kses() when output. HTML entities not decoded in CSS context.
        return trim($value);
    }

    /**
     * Sanitize font src value for @font-face declarations
     *
     * Font src values can contain url() functions with URLs, data URIs, format() specifications,
     * and local() references. This function validates the structure while preventing XSS.
     *
     * @param string $src_value Raw font src value (e.g., "url('font.woff2') format('woff2')")
     * @return string Sanitized src value or empty string if invalid
     */
    private function sanitize_font_src($src_value) {
        // Remove any HTML tags
        $src_value = wp_strip_all_tags($src_value);

        // Remove dangerous CSS that could break out of context
        $src_value = str_replace(array('{', '}', '<', '>'), '', $src_value);

        // Validate URLs within url() functions
        // Extract and validate each url() and keep the rest of the syntax
        $sanitized = preg_replace_callback(
            '/url\s*\(\s*[\'"]?([^\)\'"\s]+)[\'"]?\s*\)/i',
            function($matches) {
                $url = $matches[1];
                // Allow only safe protocols for fonts
                // - http/https for external fonts
                // - data: for embedded fonts (data:font/woff2;charset=utf-8;base64,...)
                // - Relative paths starting with / or ../
                if (preg_match('/^(https?:|data:(?:font\/|application\/(?:font-)?(?:woff2?|opentype|truetype))(?:[^,]*)[;,]|\.\.?\/)/i', $url)) {
                    // URL seems valid, return original match
                    return $matches[0];
                }
                // Invalid or potentially dangerous URL
                return '';
            },
            $src_value
        );

        // Remove any remaining script: or javascript: protocols that might have escaped
        $sanitized = preg_replace('/(?:javascript|script|vbscript|data:(?!font\/|application\/(?:font-)?(?:woff2?|opentype|truetype)))\s*:/i', '', $sanitized);

        // Validate format() and local() functions - they should only contain safe values
        $sanitized = preg_replace_callback(
            '/(format|local)\s*\(\s*[\'"]?([^\)\'"\s]+)[\'"]?\s*\)/i',
            function($matches) {
                $func = $matches[1];
                $value = $matches[2];
                // Allow only alphanumeric, hyphens, and underscores in format/local values
                if (preg_match('/^[a-zA-Z0-9_-]+$/', $value)) {
                    return $matches[0];
                }
                return '';
            },
            $sanitized
        );

        // Escape for safe output in style context
        return esc_attr(trim($sanitized));
    }

    /**
     * Sanitize fallback fonts for CSS use
     *
     * @param string $fallbacks Comma-separated fallback font list
     * @return string Sanitized fallback fonts
     */
    private function sanitize_fallback_fonts($fallbacks) {
        if (empty($fallbacks)) {
            return '';
        }

        // Remove HTML
        $fallbacks = sanitize_text_field($fallbacks);

        // Use CSS-specific sanitization
        return $this->sanitize_css_value($fallbacks);
    }

    /**
     * Sanitize font replacements data
     *
     * @param array $input Input data
     * @return array Sanitized data
     */
    public function sanitize_font_replacements($input) {
        if (!is_array($input)) {
            return array(
                'mappings' => array(),
                'global_load' => array(),
                'next_id' => array(
                    'custom' => 10,
                    'adobe' => 20,
                    'manual' => 30
                )
            );
        }

        $sanitized = array(
            'mappings' => array(),
            'global_load' => array(),
            'next_id' => isset($input['next_id']) ? $input['next_id'] : array(
                'custom' => 10,
                'adobe' => 20,
                'manual' => 30
            )
        );

        // Sanitize mappings
        if (isset($input['mappings']) && is_array($input['mappings'])) {
            foreach ($input['mappings'] as $deleted_id => $replacement_id) {
                $sanitized['mappings'][(int) $deleted_id] = (int) $replacement_id;
            }
        }

        // Sanitize global_load
        if (isset($input['global_load']) && is_array($input['global_load'])) {
            foreach ($input['global_load'] as $id) {
                $sanitized['global_load'][] = (int) $id;
            }
        }

        return $sanitized;
    }





    /**
     * Render admin page
     *
     * Displays the plugin's settings page in the WordPress admin.
     * Includes presets, font management, and configuration options.
     *
     * @since 1.0.0
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

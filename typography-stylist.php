<?php
/**
 * Plugin Name: Typography Stylist
 * Plugin URI: https://wordpress.org/plugins/typography-stylist/
 * Description: Add advanced OpenType features (ligatures, stylistic sets, swashes) to headlines with inline text selection and live preview.
 * Version: 2.2.3
 * Author: Matthew Cowan
 * Author URI: https://mnc4.com
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: typography-stylist
 * Domain Path: /languages
 * Requires at least: 5.8
 * Requires PHP: 7.4
 */

// Exit if accessed directly
if (!defined('ABSPATH')) {
    exit;
}

// Define plugin constants (check if already defined for test compatibility)
if (!defined('TYPOST_VERSION')) {
    define('TYPOST_VERSION', '2.2.3');
}
if (!defined('TYPOST_PLUGIN_DIR')) {
    define('TYPOST_PLUGIN_DIR', plugin_dir_path(__FILE__));
}
if (!defined('TYPOST_PLUGIN_URL')) {
    define('TYPOST_PLUGIN_URL', plugin_dir_url(__FILE__));
}
if (!defined('TYPOST_PLUGIN_BASENAME')) {
    define('TYPOST_PLUGIN_BASENAME', plugin_basename(__FILE__));
}

// Font subsystem modules (__DIR__ so test bootstraps that define
// TYPOST_PLUGIN_DIR without a trailing slash still resolve correctly)
require_once __DIR__ . '/includes/class-typost-font-sources.php';
require_once __DIR__ . '/includes/class-typost-font-library-bridge.php';
require_once __DIR__ . '/includes/class-typost-font-metadata.php';

/**
 * Main plugin class
 */
class Typost {

    /**
     * Instance of this class
     */
    private static $instance = null;

    /**
     * Object cache for database queries
     */
    private $presets_cache = null;
    private $features_cache = null;

    /**
     * Non-fatal warnings produced by the most recent process_font_kit_zip()
     * run (e.g. "@font-face CSS was generated from filename guesses").
     * Kept out of the method's return value so its array-of-entries|WP_Error
     * contract — and the typost_font_uploaded payload — stay unchanged.
     *
     * @since 2.1.0
     * @var string[]
     */
    private $font_kit_warnings = array();

    /**
     * Font subsystem modules (lazily instantiated)
     * @since 2.1.0
     */
    private $font_sources = null;
    private $font_library_bridge = null;

    /**
     * Frontend font detection state (for archive pages)
     * @since 1.1.9
     */
    private $detected_fonts = null;
    private $has_styled_content = null;
    private $fonts_detected = false;

    /**
     * Font IDs forced to load via the typost_force_enqueue_font_ids filter
     * (memoized per request)
     * @since 2.1.0
     */
    private $forced_font_ids = null;

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
     * Get the font sources module (option-backed font storage + ID sequence)
     *
     * @since 2.1.0
     * @return Typost_Font_Sources
     */
    public function font_sources() {
        if (null === $this->font_sources) {
            $this->font_sources = new Typost_Font_Sources();
        }
        return $this->font_sources;
    }

    /**
     * Get the WP Font Library bridge module
     *
     * @since 2.1.0
     * @return Typost_Font_Library_Bridge
     */
    public function font_library_bridge() {
        if (null === $this->font_library_bridge) {
            $this->font_library_bridge = new Typost_Font_Library_Bridge($this->font_sources());
        }
        return $this->font_library_bridge;
    }

    /**
     * Initialize WordPress hooks
     */
    private function init_hooks() {
        // Enqueue block editor assets
        add_action('enqueue_block_editor_assets', array($this, 'enqueue_block_editor_assets'));

        // Enqueue assets in the editor iframe (for block rendering)
        add_action('enqueue_block_assets', array($this, 'enqueue_block_assets'));

        // Detect fonts early on archive pages (after main query executes)
        add_action('template_redirect', array($this, 'detect_frontend_fonts'), 1);

        // Enqueue frontend assets
        add_action('wp_enqueue_scripts', array($this, 'enqueue_frontend_assets'));

        // Clear per-post and archive caches when posts are saved or deleted
        add_action('save_post', array($this, 'on_post_save'), 10, 3);
        add_action('before_delete_post', array($this, 'on_post_delete'));

        // Silent rollback when a plugin-registered wp_font_family post is
        // deleted (e.g. through the Appearance > Font Library UI)
        add_action('deleted_post', array($this, 'on_wp_font_family_deleted'), 10, 2);

        // Output CSS variables for fonts
        add_action('wp_head', array($this, 'output_font_css_variables'), 5);
        add_action('admin_head', array($this, 'output_font_css_variables'), 5);

        // Add admin menu
        add_action('admin_menu', array($this, 'add_admin_menu'));

        // Register settings
        add_action('admin_init', array($this, 'register_settings'));

        // Process color scheme save early (before admin_enqueue_scripts)
        // so inline CSS matches the newly-selected scheme on the save request
        add_action('admin_init', array($this, 'early_save_color_scheme'));

        // Ensure .htaccess exists for existing installations
        add_action('admin_init', array($this, 'maybe_create_htaccess'), 1);

        // Add REST API endpoints
        add_action('rest_api_init', array($this, 'register_rest_routes'));

        // Register custom block
        add_action('init', array($this, 'register_block'));

        // Add Settings link on plugins page
        add_filter('plugin_action_links_' . TYPOST_PLUGIN_BASENAME, array($this, 'add_plugin_action_links'));

        // Secure upload directory on activation
        register_activation_hook(__FILE__, array($this, 'activate_plugin'));
    }

    /**
     * Plugin activation
     */
    public function activate_plugin() {
        $this->secure_upload_directory();
        // Mark .htaccess as verified so we don't check on every admin page load
        update_option('typost_htaccess_verified', true, false);
    }

    /**
     * Ensure .htaccess exists for existing installations
     *
     * Uses a one-time flag to avoid unnecessary file system checks on every admin page load.
     * Only runs once to upgrade existing installations that were created before the .htaccess security fix.
     */
    public function maybe_create_htaccess() {
        // Check if we've already verified .htaccess (one-time check)
        if (get_option('typost_htaccess_verified', false)) {
            return;
        }

        $upload_dir = wp_upload_dir();
        $font_dir = $upload_dir['basedir'] . '/typography-stylist/fonts';
        $htaccess_file = $font_dir . '/.htaccess';

        // If directory exists but .htaccess doesn't, create it
        if (is_dir($font_dir) && !file_exists($htaccess_file)) {
            $this->secure_upload_directory();
        }

        // Mark as verified so we don't check again
        update_option('typost_htaccess_verified', true, false);
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

            // Note: CSS variables are output via admin_head hook
            // in output_font_css_variables() method for reliable iframe injection
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
            'typost-block-editor',
            TYPOST_PLUGIN_URL . "assets/css/block-editor{$suffix}.css",
            array('wp-edit-blocks'),
            TYPOST_VERSION
        );

        // Editor JavaScript
        wp_enqueue_script(
            'typost-block-editor',
            TYPOST_PLUGIN_URL . "assets/js/block-editor{$suffix}.js",
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
            TYPOST_VERSION,
            true
        );

        // Enable JavaScript translations.
        //
        // The domain must be the one the strings themselves declare. Every
        // __() call in the editor scripts uses 'typography-stylist' (the
        // plugin's Text Domain header); this argument said 'typost', so
        // WordPress looked for a catalogue under a domain no string belongs
        // to and the editor's JS strings could never be translated. The
        // bundled modules already pass their own matching domains.
        wp_set_script_translations(
            'typost-block-editor',
            'typography-stylist',
            TYPOST_PLUGIN_DIR . 'languages'
        );

        // Cache the localized data with transient
        // Note: nonce is added after cache read since it's session-specific
        $cache_key = 'typost_editor_data_' . get_current_user_id();
        $localized_data = get_transient($cache_key);

        if (false === $localized_data) {
            $localized_data = array(
                'presets' => $this->get_presets(),
                'features' => $this->get_available_features(),
                'fonts' => $this->get_custom_fonts(),
                'adobeFonts' => $this->get_adobe_fonts(),
                'manualFonts' => $this->get_manual_fonts(),
                'fontFeatureVisibility' => $this->get_font_feature_visibility(),
                'fontOrder' => $this->get_font_order(),
                'wpFontLibraryFonts' => $this->get_wp_font_library_fonts(),
                'adoptedWpFonts' => $this->get_adopted_wp_fonts_by_slug(),
                'pluginRegisteredSlugs' => $this->get_plugin_registered_slugs(),
                'restUrl' => rest_url('typost/v1/'),
                // Cast every flag: these options are stored as '1'/'0' strings,
                // and wp_localize_script() stringifies whatever it is given —
                // so an uncast '0' reaches JavaScript as the string "0", which
                // is truthy. Every one of these settings silently did nothing
                // when switched off until 2.3.0. (A bool becomes "" / "1".)
                'enableAriaLabels' => (bool) get_option('typost_enable_aria_labels', false),
                'disableAccessibilityWarning' => (bool) get_option('typost_disable_accessibility_warning', false),
                'showClearConfirmation' => (bool) get_option('typost_show_clear_confirmation', true),
                // When true (default), Enter inside a Typography Stylist block
                // inserts a line break; when false the block declares core's
                // `splitting` support and Enter starts a new block instead.
                'blockEnterLineBreak' => (bool) get_option('typost_block_enter_line_break', true),
                'settingsUrl' => admin_url('options-general.php?page=typography-stylist')
            );

            // Cache for 1 hour
            set_transient($cache_key, $localized_data, HOUR_IN_SECONDS);
        }

        // Add nonce after cache read (session-specific, must not be cached)
        $localized_data['nonce'] = wp_create_nonce('wp_rest');

        /**
         * Filter editor data passed to JavaScript as typostData.
         *
         * Allows extension plugins to add their own data to the editor context.
         * This data is available in both the inline editor (block-editor.js) and
         * the Typography Stylist block editor (edit.js).
         *
         * @since 2.0.0
         * @param array $localized_data Editor data array.
         */
        $localized_data = apply_filters('typost_editor_data', $localized_data);

        // Re-inject nonce after filter to prevent extensions from overwriting it
        $localized_data['nonce'] = wp_create_nonce('wp_rest');

        // Pass data to JavaScript
        wp_localize_script('typost-block-editor', 'typostData', $localized_data);

        /**
         * Fires after core editor assets are enqueued.
         *
         * Allows extension plugins to enqueue their own editor scripts and styles
         * with 'typost-block-editor' as a dependency.
         *
         * @since 2.0.0
         */
        do_action('typost_editor_assets');
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
     * Theme authors can override this behavior using the 'typost_archive_post_content' filter.
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
             * By default (as of v1.1.9), full post content is checked to ensure custom fonts load properly
             * on archive pages. This can be disabled via Settings > Typography Stylist > Options if needed.
             * Previous versions defaulted to false for performance reasons, but modern caching makes this
             * unnecessary.
             *
             * @since 1.0.0
             * @since 1.1.9 Default changed from false to true (configurable via admin)
             *
             * @param bool    $check_full_content Whether to check full content (default: true)
             * @param WP_Post $post               The post object being checked
             */
            $default_check = get_option('typost_archive_full_content_check', '1') === '1';
            $check_full_content = apply_filters('typost_check_full_content_on_archives', $default_check, $post);
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
        return apply_filters('typost_archive_post_content', $content_to_check, $post);
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
     * add_filter('typost_use_full_content_filter', '__return_true');
     *
     * @param string $content Raw post content to render
     * @return string Rendered content
     */
    private function render_content_for_detection($content) {
        $use_full_content_filter = apply_filters('typost_use_full_content_filter', false);

        if ($use_full_content_filter) {
            // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound -- WordPress core hook
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
            $cache_key = 'typost_has_styled_' . $post->ID;
            $has_styled = get_transient($cache_key);

            if (false === $has_styled) {
                // Check both raw content and rendered content (for Gutenberg blocks)
                $raw_content = $post->post_content;

                // Apply content filters to render Gutenberg blocks
                $rendered_content = $this->render_content_for_detection($raw_content);

                // Check if typost-styled class exists in either raw or rendered content
                $has_styled_class = (strpos($raw_content, 'typost-styled') !== false ||
                                    strpos($rendered_content, 'typost-styled') !== false);

                // Also check for Typography Stylist blocks directly (block-level fonts)
                $has_typost_block = (strpos($raw_content, 'wp:typost/block') !== false);

                $has_styled = ($has_styled_class || $has_typost_block) ? 'yes' : 'no';

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
            $cache_key = 'typost_has_styled_archive_' . md5(serialize($post_ids));
            $has_styled = get_transient($cache_key);

            if (false === $has_styled) {
                $has_styled = 'no';

                // Check each post in the loop
                foreach ($wp_query->posts as $loop_post) {
                    $content_to_check = $this->get_archive_post_content($loop_post);

                    // Check for typost-styled class first (cheap operation)
                    if (strpos($content_to_check, 'typost-styled') !== false) {
                        $has_styled = 'yes';
                        break; // Found styled content, no need to check more
                    }

                    // Check for Typography Stylist blocks directly (block-level fonts)
                    if (strpos($content_to_check, 'wp:typost/block') !== false) {
                        $has_styled = 'yes';
                        break; // Found Typography Stylist block, no need to check more
                    }

                    // Only render blocks if not found in raw content (expensive operation)
                    $rendered_content = $this->render_content_for_detection($content_to_check);
                    if (strpos($rendered_content, 'typost-styled') !== false) {
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
            $cache_key = 'typost_used_fonts_' . $post->ID;
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
            $cache_key = 'typost_used_fonts_archive_' . md5(serialize($post_ids));
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
     * Recursively extract fontFamily from Typography Stylist blocks
     *
     * @param array $blocks Array of parsed blocks
     * @param array &$fonts Array to collect font families (passed by reference)
     */
    private function extract_fonts_from_blocks($blocks, &$fonts) {
        foreach ($blocks as $block) {
            // Check if this is a Typography Stylist block
            if ($block['blockName'] === 'typost/block') {
                // Extract fontFamily (backward compatibility)
                if (isset($block['attrs']['fontFamily']) && !empty($block['attrs']['fontFamily'])) {
                    $fonts[] = $block['attrs']['fontFamily'];
                }

                // Extract fontId (CSS variable references - block level)
                if (isset($block['attrs']['fontId']) && !empty($block['attrs']['fontId'])) {
                    $fonts[] = 'id:' . $block['attrs']['fontId'];
                }

                // Extract inline fonts from content HTML (Quick Feature Toggle fonts)
                if (isset($block['attrs']['content']) && !empty($block['attrs']['content'])) {
                    $content = $block['attrs']['content'];

                    // Look for data-font-id attributes in inline spans
                    if (preg_match_all('/data-font-id=["\'\\\\]*(\d+)["\'\\\\]*/', $content, $matches)) {
                        foreach ($matches[1] as $font_id) {
                            $fonts[] = 'id:' . $font_id;
                        }
                    }

                    // Look for data-font attributes (backward compatibility)
                    if (preg_match_all('/data-font=["\'\\\\]*([^"\'\\\\]+)["\'\\\\]*/', $content, $matches)) {
                        foreach ($matches[1] as $font_family) {
                            $fonts[] = $font_family;
                        }
                    }
                }
            }

            // Recursively check inner blocks
            if (!empty($block['innerBlocks'])) {
                $this->extract_fonts_from_blocks($block['innerBlocks'], $fonts);
            }
        }
    }

    /**
     * Detect fonts needed on archive pages (runs on template_redirect hook)
     *
     * This method runs AFTER the main WordPress query has executed, ensuring
     * $wp_query->posts is populated on archive pages. It caches the detection
     * results in instance variables for use by enqueue_frontend_assets() and
     * enqueue_custom_fonts_optimized().
     *
     * Only runs on archive pages (!is_singular()) as singular pages already work
     * correctly via the wp_enqueue_scripts hook using get_queried_object().
     *
     * @since 1.1.9
     */
    public function detect_frontend_fonts() {
        // Only run on archive pages (singular posts already work correctly)
        if (is_singular()) {
            return;
        }

        // Only run on frontend
        if (is_admin() || wp_doing_ajax() || (defined('REST_REQUEST') && REST_REQUEST)) {
            return;
        }

        // Detect if current page has styled content
        $this->has_styled_content = $this->has_styled_content();

        // Check if any fonts are set to load on all pages
        $has_always_load_fonts = false;

        $custom_fonts = $this->get_custom_fonts();
        foreach ($custom_fonts as $font) {
            if (!empty($font['load_on_all_pages'])) {
                $has_always_load_fonts = true;
                break;
            }
        }

        if (!$has_always_load_fonts) {
            $adobe_fonts = $this->get_adobe_fonts();
            foreach ($adobe_fonts as $font) {
                if (!empty($font['load_on_all_pages'])) {
                    $has_always_load_fonts = true;
                    break;
                }
            }
        }

        // Fonts forced by themes/extensions (typost_force_enqueue_font_ids)
        $forced_font_ids = $this->get_forced_font_ids();

        // Only detect fonts if we have styled content, always-load fonts, or forced fonts
        if ($this->has_styled_content || $has_always_load_fonts || !empty($forced_font_ids)) {
            // Get fonts used in content
            $used_fonts_raw = $this->get_used_fonts_in_content();

            // Separate font IDs from font family names
            $used_font_families = array();
            $used_font_ids = array();

            foreach ($used_fonts_raw as $font_ref) {
                if (strpos($font_ref, 'id:') === 0) {
                    $used_font_ids[] = (int) substr($font_ref, 3);
                } else {
                    $used_font_families[] = $font_ref;
                }
            }

            // Resolve font replacements
            $used_font_ids = $this->resolve_used_font_replacements($used_font_ids);

            // Merge forced fonts (resolved through the replacement chain too)
            if (!empty($forced_font_ids)) {
                $used_font_ids = array_values(array_unique(array_merge(
                    $used_font_ids,
                    $this->resolve_used_font_replacements($forced_font_ids)
                )));
            }

            // Parse font families
            if (!empty($used_font_families)) {
                $parsed_font_families = $this->parse_font_family_list($used_font_families);
                $used_font_families = array_unique($parsed_font_families);
            }

            // Store detection results
            $this->detected_fonts = array(
                'font_ids' => $used_font_ids,
                'font_families' => $used_font_families,
                'has_always_load' => $has_always_load_fonts,
            );
        }

        $this->fonts_detected = true;
    }

    /**
     * Enqueue frontend assets
     */
    public function enqueue_frontend_assets() {
        // On archive pages, use cached detection results from template_redirect
        // On singular pages, use existing detection logic (which works correctly)
        if (!is_singular() && $this->fonts_detected) {
            // Use cached results for archive pages
            $has_styled = $this->has_styled_content;
            $has_always_load_fonts = ($this->detected_fonts && !empty($this->detected_fonts['has_always_load']));
        } else {
            // Singular pages or fallback: use existing detection logic
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
        }

        // Only return early if NO styled content, NO always-load fonts,
        // and NO fonts forced by the typost_force_enqueue_font_ids filter
        if (!$has_styled && !$has_always_load_fonts && empty($this->get_forced_font_ids())) {
            return;
        }

        $suffix = (defined('SCRIPT_DEBUG') && SCRIPT_DEBUG) ? '' : '.min';

        wp_enqueue_style(
            'typost-frontend',
            TYPOST_PLUGIN_URL . "assets/css/frontend{$suffix}.css",
            array(),
            TYPOST_VERSION
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
            // On archive pages, use cached detection results from template_redirect
            // On singular pages, use existing detection logic (which works correctly)
            if (!is_singular() && $this->fonts_detected && $this->detected_fonts) {
                // Use cached results for archive pages
                $used_font_ids = $this->detected_fonts['font_ids'];
                $used_font_families = $this->detected_fonts['font_families'];
            } else {
                // Singular pages or fallback: use existing detection logic
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
        }

        // Merge fonts forced by the typost_force_enqueue_font_ids filter
        // (resolved through the replacement chain like content-detected IDs)
        $forced_font_ids = $this->get_forced_font_ids();
        if (!empty($forced_font_ids)) {
            $used_font_ids = array_values(array_unique(array_merge(
                $used_font_ids,
                $this->resolve_used_font_replacements($forced_font_ids)
            )));
        }

        // Skip the plugin's own @font-face only for fonts WordPress will
        // actually print on this page (wp_print_font_faces covers theme
        // fonts + Library fonts ACTIVATED in global styles). A live
        // registration alone is not enough — registered-but-unactivated
        // families get nothing from WordPress and need the plugin output.
        // Stale registrations resume the plugin path automatically.
        $library_printed_ids = array();
        foreach ($all_fonts as $font) {
            if (isset($font['font_id']) && $this->font_library_bridge()->entry_faces_printed_by_wordpress($font)) {
                $library_printed_ids[] = (int) $font['font_id'];
            }
        }

        // Build cache key including load_on_all_pages settings
        $load_settings = array();
        foreach ($all_fonts as $font) {
            $font_id = isset($font['id']) ? $font['id'] : '';
            $load_settings[$font_id] = !empty($font['load_on_all_pages']);
        }
        $cache_key = $this->get_font_css_cache_key($used_font_families, $used_font_ids, $load_settings, $library_printed_ids);
        $combined_css = get_transient($cache_key);

        if (false === $combined_css) {
            $combined_css = '';

            // Only include fonts that are actually used OR set to load on all pages
            foreach ($all_fonts as $font) {
                if (isset($font['font_id']) && in_array((int) $font['font_id'], $library_printed_ids, true)) {
                    continue;
                }
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
                        // Sanitize CSS before adding and ensure URLs are relative
                        $combined_css .= "\n" . $this->ensure_relative_font_urls($this->sanitize_css_content($font['css_content']));
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
            wp_add_inline_style('typost-frontend', $combined_css);
        }
    }

    /**
     * Build the transient cache key for the combined per-page font CSS
     *
     * Includes the used font IDs (not just family names) so pages using
     * different fonts by ID never share cached CSS, and sorts inputs so
     * detection order doesn't fragment the cache.
     *
     * @since 2.1.0
     * @param array $used_font_families   Font family names used on the page
     * @param array $used_font_ids        Numeric font IDs used on the page
     * @param array $load_settings        Per-font load_on_all_pages flags
     * @param array $library_printed_ids  Font IDs whose @font-face WP prints
     * @return string Transient key
     */
    private function get_font_css_cache_key($used_font_families, $used_font_ids, $load_settings, $library_printed_ids = array()) {
        $used_font_ids = array_map('intval', (array) $used_font_ids);
        sort($used_font_ids);
        $used_font_families = array_map('strval', (array) $used_font_families);
        sort($used_font_families);
        $library_printed_ids = array_map('intval', (array) $library_printed_ids);
        sort($library_printed_ids);
        return 'typost_font_css_' . md5(serialize($used_font_families) . serialize($used_font_ids) . serialize($load_settings) . serialize($library_printed_ids));
    }

    /**
     * Add admin menu
     */
    public function add_admin_menu() {
        $hook = add_options_page(
            esc_html__('Typography Stylist', 'typography-stylist'),
            esc_html__('Typography Stylist', 'typography-stylist'),
            'manage_options',
            'typography-stylist',
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
            esc_url(admin_url('options-general.php?page=typography-stylist')),
            esc_html__('Settings', 'typography-stylist')
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
            'typost-admin',
            TYPOST_PLUGIN_URL . "assets/css/admin-page{$suffix}.css",
            array(),
            TYPOST_VERSION
        );

        // Output color scheme CSS variable overrides only once per request
        static $color_scheme_output = false;

        if (!$color_scheme_output) {
            $this->output_admin_color_scheme();
            $color_scheme_output = true;
        }

        wp_enqueue_script(
            'typost-admin',
            TYPOST_PLUGIN_URL . "assets/js/admin-page{$suffix}.js",
            array('jquery', 'jquery-ui-sortable'),
            TYPOST_VERSION,
            true
        );

        // Enqueue custom fonts for preview
        $this->enqueue_custom_fonts_for_admin();
        $this->enqueue_adobe_fonts();

        // Localize script for translations and data
        $admin_data = array(
            'restUrl' => rest_url('typost/v1/'),
            'nonce' => wp_create_nonce('wp_rest'),
            'fonts' => $this->get_custom_fonts(),
            'adobeFonts' => $this->get_adobe_fonts(),
            'manualFonts' => $this->get_manual_fonts(),
            'replacements' => $this->get_font_replacements(),
            'fontFeatureVisibility' => $this->get_font_feature_visibility(),
            'features' => $this->get_available_features(),
            'fontOrder' => $this->get_font_order(),
            'wpFontLibraryFonts' => $this->get_wp_font_library_fonts(),
            'strings' => array(
                'confirmDelete' => esc_html__('Are you sure you want to delete this font kit?', 'typography-stylist'),
                'uploadError' => esc_html__('Failed to upload font kit.', 'typography-stylist'),
                'selectZip' => esc_html__('Please select a ZIP file (.zip)', 'typography-stylist'),
                'selectFile' => esc_html__('Please select a ZIP file.', 'typography-stylist'),
                'uploadSuccess' => esc_html__('Font kit uploaded and processed successfully!', 'typography-stylist'),
                'deleteError' => esc_html__('Failed to delete font kit.', 'typography-stylist'),
                'deleteFontSuccess' => esc_html__('Font deleted successfully!', 'typography-stylist'),
                'deleteFontFailed' => esc_html__('Failed to delete font.', 'typography-stylist'),
                'replacementFailed' => esc_html__('Failed to create font replacement.', 'typography-stylist'),
                'deleting' => esc_html__('Deleting...', 'typography-stylist'),
                'noFonts' => esc_html__('No custom fonts uploaded yet.', 'typography-stylist'),
                'uploadPrompt' => esc_html__('Upload a webfont kit using the form below to add custom fonts with OpenType features.', 'typography-stylist'),
                'uploading' => esc_html__('Uploading', 'typography-stylist'),
                'uploadingZip' => esc_html__('Uploading ZIP file...', 'typography-stylist'),
                'processing' => esc_html__('Processing...', 'typography-stylist'),
                'uploadButton' => esc_html__('Upload Font Kit', 'typography-stylist'),
                // Adobe Fonts strings
                'enterAdobeEmbedCode' => esc_html__('Please paste the Adobe Fonts embed code.', 'typography-stylist'),
                'enterAdobeFontFamilies' => esc_html__('Please enter at least one font family name.', 'typography-stylist'),
                'adding' => esc_html__('Adding...', 'typography-stylist'),
                'adobeFontSuccess' => esc_html__('Adobe Fonts project added successfully!', 'typography-stylist'),
                'addAdobeFontError' => esc_html__('Failed to add Adobe Fonts project.', 'typography-stylist'),
                'addAdobeFontButton' => esc_html__('Add Adobe Fonts Project', 'typography-stylist'),
                'confirmDeleteAdobeFont' => esc_html__('Are you sure you want to delete this Adobe Fonts project?', 'typography-stylist'),
                'deleteAdobeFontError' => esc_html__('Failed to delete Adobe Fonts project.', 'typography-stylist'),
                // Manual/Custom Fonts strings
                'enterManualFontName' => esc_html__('Please enter a font name.', 'typography-stylist'),
                'enterFontFamily' => esc_html__('Please enter a CSS font-family value.', 'typography-stylist'),
                'manualFontSuccess' => esc_html__('Custom font added successfully!', 'typography-stylist'),
                'addManualFontError' => esc_html__('Failed to add custom font.', 'typography-stylist'),
                'addManualFontButton' => esc_html__('Add Custom Font', 'typography-stylist'),
                'confirmDeleteManualFont' => esc_html__('Are you sure you want to delete this custom font?', 'typography-stylist'),
                'deleteManualFontError' => esc_html__('Failed to delete custom font.', 'typography-stylist'),
                // Font loading setting strings
                'updateSettingError' => esc_html__('Failed to update font loading setting.', 'typography-stylist'),
                // Edit font strings
                'saving' => esc_html__('Saving...', 'typography-stylist'),
                'saveChanges' => esc_html__('Save Changes', 'typography-stylist'),
                'fallbacksUpdated' => esc_html__('Fallback fonts updated successfully!', 'typography-stylist'),
                'updateFallbacksError' => esc_html__('Failed to update fallback fonts.', 'typography-stylist'),
                'fontUpdated' => esc_html__('Font updated successfully!', 'typography-stylist'),
                'updateFontError' => esc_html__('Failed to update font.', 'typography-stylist'),
                // Feature visibility strings
                'featureVisibilitySaved' => esc_html__('Saved', 'typography-stylist'),
                'featureVisibilityError' => esc_html__('Failed to save feature visibility.', 'typography-stylist'),
                'enableAll' => esc_html__('Enable All', 'typography-stylist'),
                'disableAll' => esc_html__('Disable All', 'typography-stylist'),
                // Font order strings
                'orderSaveError' => esc_html__('Failed to save font order.', 'typography-stylist'),
                // WP Font Library strings
                'wpLibraryBadge' => esc_html__('WP Library', 'typography-stylist'),
                'manageInEditor' => esc_html__('Manage in Appearance → Editor', 'typography-stylist'),
                // WP Font Library registration strings
                'wplRegistering' => esc_html__('Registering...', 'typography-stylist'),
                'wplRegisterSuccess' => esc_html__('Font registered in the Font Library!', 'typography-stylist'),
                'wplRegisterError' => esc_html__('Failed to register the font in the Font Library.', 'typography-stylist'),
                'wplRemoving' => esc_html__('Removing...', 'typography-stylist'),
                'wplRemoveSuccess' => esc_html__('Font removed from the Font Library!', 'typography-stylist'),
                'wplRemoveError' => esc_html__('Failed to remove the font from the Font Library.', 'typography-stylist'),
                'wplConfirmRemove' => esc_html__('Remove this font from the WordPress Font Library? Existing content keeps rendering — the plugin resumes serving the font files itself.', 'typography-stylist'),
                /* translators: 1: number of registered fonts, 2: number of failed fonts */
                'wplBulkDone' => esc_html__('Registered %1$s font(s) in the Font Library (%2$s failed).', 'typography-stylist'),
                // Weight auto-detection strings
                'detectWeightsRunning' => esc_html__('Detecting weights...', 'typography-stylist'),
                /* translators: 1: fonts with detected weights, 2: fonts left with all weights, 3: fonts that could not be checked */
                'detectWeightsDone' => esc_html__('Weights detected for %1$s font(s); %2$s kept all weights; %3$s could not be checked.', 'typography-stylist'),
                'detectWeightsError' => esc_html__('Weight detection failed. Please try again.', 'typography-stylist'),
                // AJAX refresh strings
                'fontListUpdated' => esc_html__('Font list updated.', 'typography-stylist'),
                'refreshError' => esc_html__('Could not refresh the font list. Reloading the page instead.', 'typography-stylist'),
                'dismissNotice' => esc_html__('Dismiss this notice.', 'typography-stylist'),
                // Settings forms AJAX strings
                'savingSettings' => esc_html__('Saving...', 'typography-stylist'),
                'optionsSaved' => esc_html__('Options saved successfully.', 'typography-stylist'),
                'optionsSaveError' => esc_html__('Failed to save options.', 'typography-stylist'),
                'accessibilitySaved' => esc_html__('Accessibility settings saved successfully.', 'typography-stylist'),
                'accessibilitySaveError' => esc_html__('Failed to save accessibility settings.', 'typography-stylist'),
                'cacheCleared' => esc_html__('Font cache cleared successfully. Fonts will be re-detected on the next page load.', 'typography-stylist'),
                'cacheClearError' => esc_html__('Failed to clear the font cache.', 'typography-stylist')
            )
        );

        /**
         * Filter admin page data passed to JavaScript as typostAdmin.
         *
         * Allows extension plugins to add their own data to the admin page context.
         *
         * @since 2.0.0
         * @param array $admin_data Admin data array.
         */
        $admin_data = apply_filters('typost_admin_localize_data', $admin_data);

        // Re-inject nonce after filter to prevent extensions from overwriting it
        $admin_data['nonce'] = wp_create_nonce('wp_rest');

        wp_localize_script('typost-admin', 'typostAdmin', $admin_data);

        /**
         * Fires after core admin assets are enqueued.
         *
         * Allows extension plugins to enqueue their own admin scripts and styles
         * with 'typost-admin' as a dependency.
         *
         * @since 2.0.0
         */
        do_action('typost_admin_assets');
    }

    /**
     * Sanitize color scheme option value
     *
     * @param string $value The color scheme value to sanitize.
     * @return string Sanitized color scheme value.
     */
    public function sanitize_color_scheme($value) {
        $valid = array('default', 'admin-colors', 'alice-blue', 'dark', 'high-contrast');
        return in_array($value, $valid, true) ? $value : 'default';
    }

    /**
     * Process color scheme save early in admin_init, before admin_enqueue_scripts.
     * This ensures the inline CSS matches the newly-selected scheme on the same request.
     */
    public function early_save_color_scheme() {
        if (
            isset($_POST['typost_save_options_settings']) &&
            isset($_POST['typost_admin_color_scheme']) &&
            current_user_can('manage_options') &&
            check_admin_referer('typography_stylist_options_settings_nonce')
        ) {
            $color_scheme = sanitize_key(wp_unslash($_POST['typost_admin_color_scheme']));
            update_option('typost_admin_color_scheme', $this->sanitize_color_scheme($color_scheme));
        }
    }

    /**
     * Output admin color scheme CSS variable overrides via inline style
     */
    public function output_admin_color_scheme() {
        // Dedicated handle so the scheme CSS lands in its own inline <style>
        // (id="typost-admin-color-scheme-inline-css"), which the Options tab
        // AJAX save swaps to restyle the page without a reload.
        wp_register_style('typost-admin-color-scheme', false, array('typost-admin'), TYPOST_VERSION);
        wp_enqueue_style('typost-admin-color-scheme');

        $css = $this->get_color_scheme_css();

        if (!empty($css)) {
            wp_add_inline_style('typost-admin-color-scheme', $css);
        }
    }

    /**
     * Get the CSS variable overrides for an admin color scheme.
     *
     * Public so the admin options REST endpoint can return the CSS for a
     * newly selected scheme, letting the settings page restyle without a
     * reload.
     *
     * @param string|null $scheme Scheme key, or null to use the saved option.
     * @return string CSS string (empty for the 'default' scheme).
     */
    public function get_color_scheme_css($scheme = null) {
        if (null === $scheme) {
            $scheme = get_option('typost_admin_color_scheme', 'alice-blue');
        }
        $scheme = $this->sanitize_color_scheme($scheme);

        if ('default' === $scheme) {
            return '';
        }

        $css = '';

        switch ($scheme) {
            case 'admin-colors':
                $css = $this->get_admin_colors_css();
                break;

            case 'alice-blue':
                // Primary + muted text darkened for WCAG AA: primary must hold
                // 4.5:1 both as text on the darkest alice tint (#dce9f5) and
                // as the white-text badge background.
                $css = '.typost-admin-wrap {
                    --typost-color-primary: #2a689e;
                    --typost-color-primary-dark: #235a8c;
                    --typost-color-primary-focus: rgba(42, 104, 158, 0.3);
                    --typost-bg-page: #f0f8ff;
                    --typost-bg-surface: #ffffff;
                    --typost-bg-surface-alt: #f7fbff;
                    --typost-bg-section: #eef5fc;
                    --typost-bg-info: #e3f0fc;
                    --typost-bg-header: #dce9f5;
                    --typost-bg-header-hover: #cdddef;
                    --typost-bg-muted: #e8f1fa;
                    --typost-bg-code: #dce9f5;
                    --typost-bg-adobe-card: #eaf3fc;
                    --typost-border-default: #b3cde0;
                    --typost-border-strong: #8bb0cf;
                    --typost-border-container: #a6c5dd;
                    --typost-border-subtle: #c5d9eb;
                    --typost-border-input: #7ea5c3;
                    --typost-text-primary: #1a2a3a;
                    --typost-text-secondary: #4a6580;
                    --typost-text-muted: #44647c;
                    --typost-color-support-bg: #f0f8ff;
                }';
                break;

            case 'dark':
                $css = '.typost-admin-wrap {
                    --typost-color-primary: #6db3e8;
                    --typost-color-primary-dark: #8ec5f0;
                    --typost-color-primary-focus: rgba(109, 179, 232, 0.35);
                    --typost-bg-page: #0f1729;
                    --typost-bg-surface: #1a2538;
                    --typost-bg-surface-alt: #1f2b3d;
                    --typost-bg-section: #152030;
                    --typost-bg-info: #162540;
                    --typost-bg-header: #243348;
                    --typost-bg-header-hover: #2d3d55;
                    --typost-bg-muted: #1c2a3e;
                    --typost-bg-code: #1f2d44;
                    --typost-bg-adobe-card: #162238;
                    --typost-border-default: #2e4562;
                    --typost-border-strong: #3a5575;
                    --typost-border-container: #2a3f5a;
                    --typost-border-subtle: #253750;
                    --typost-border-input: #3a5575;
                    --typost-text-primary: #f0f4f8;
                    --typost-text-secondary: #c4d0dc;
                    --typost-text-muted: #8fa4b8;
                    --typost-text-on-primary: #0f1729;
                    --typost-color-danger: #f58080;
                    --typost-color-danger-hover: #f89090;
                    --typost-color-danger-bright: #ff9999;
                    --typost-color-support-bg: #1a2510;
                    --typost-color-warning-bg: #2a2510;
                    --typost-color-warning-text: #e8b830;
                    --typost-color-highlight-bg: #2e3520;
                }';
                break;

            case 'high-contrast':
                $css = '.typost-admin-wrap {
                    --typost-color-primary: #0050a0;
                    --typost-color-primary-dark: #003870;
                    --typost-color-primary-focus: rgba(0, 80, 160, 0.4);
                    --typost-bg-page: #ffffff;
                    --typost-bg-surface: #ffffff;
                    --typost-bg-surface-alt: #f5f5f5;
                    --typost-bg-section: #f0f0f0;
                    --typost-bg-info: #e8f0f8;
                    --typost-bg-header: #e0e0e0;
                    --typost-bg-header-hover: #d0d0d0;
                    --typost-bg-muted: #ebebeb;
                    --typost-bg-code: #e0e0e0;
                    --typost-bg-adobe-card: #f0f5fa;
                    --typost-border-default: #333333;
                    --typost-border-strong: #222222;
                    --typost-border-container: #333333;
                    --typost-border-subtle: #444444;
                    --typost-border-input: #222222;
                    --typost-text-primary: #000000;
                    --typost-text-secondary: #333333;
                    --typost-text-muted: #444444;
                    --typost-color-danger: #b00000;
                    --typost-color-danger-hover: #990000;
                    --typost-color-danger-bright: #b00000;
                }';
                break;
        }

        return $css;
    }

    /**
     * Generate CSS variable overrides from the user's WordPress admin color scheme
     *
     * @return string CSS string with variable overrides.
     */
    private function get_admin_colors_css() {
        global $_wp_admin_css_colors;

        $scheme_name = get_user_option('admin_color');
        if (empty($scheme_name) || empty($_wp_admin_css_colors[$scheme_name])) {
            return ''; // Fall back to default
        }

        $scheme = $_wp_admin_css_colors[$scheme_name];
        $colors = $scheme->colors;

        // WordPress admin color schemes provide 4 base colors:
        // [0] = base (sidebar bg), [1] = highlight (hover/accent), [2] = notification, [3] = action/link
        $base    = isset($colors[0]) ? $colors[0] : '#23282d';
        $accent  = isset($colors[1]) ? $colors[1] : '#0073aa';
        $notify  = isset($colors[2]) ? $colors[2] : '#0073aa';
        $action  = isset($colors[3]) ? $colors[3] : '#00a0d2';

        // Use action color as primary, accent as primary-dark. WP admin
        // scheme action colors are often too light for AA text/badge use
        // (e.g. default's #00a0d2 is 2.5:1 against white), so darken until
        // the color holds 4.5:1 against white — which also guarantees it as
        // readable text on the scheme's light tinted backgrounds below.
        $primary      = $this->darken_to_contrast($action, 4.5);
        $primary_dark = $this->darken_to_contrast($accent, 4.5);

        // Derive lighter variants by mixing with white
        $info_bg   = $this->mix_hex_color($primary, '#ffffff', 0.9);
        $header_bg = $this->mix_hex_color($primary, '#ffffff', 0.85);
        $hover_bg  = $this->mix_hex_color($primary, '#ffffff', 0.78);
        $muted_bg  = $this->mix_hex_color($primary, '#ffffff', 0.88);

        return ".typost-admin-wrap {
            --typost-color-primary: {$primary};
            --typost-color-primary-dark: {$primary_dark};
            --typost-bg-page: #f0f0f1;
            --typost-bg-info: {$info_bg};
            --typost-bg-header: {$header_bg};
            --typost-bg-header-hover: {$hover_bg};
            --typost-bg-muted: {$muted_bg};
            --typost-bg-code: {$header_bg};
            --typost-bg-adobe-card: {$info_bg};
            --typost-text-primary: #1d2327;
            --typost-border-default: #c3c4c7;
        }";
    }

    /**
     * Mix two hex colors at a given ratio
     *
     * @param string $color1 First hex color (e.g., '#2271b1').
     * @param string $color2 Second hex color (e.g., '#ffffff').
     * @param float  $ratio  Ratio of color2 (0.0 = all color1, 1.0 = all color2).
     * @return string Mixed hex color.
     */
    private function mix_hex_color($color1, $color2, $ratio) {
        $c1 = array_map('hexdec', str_split(ltrim($color1, '#'), 2));
        $c2 = array_map('hexdec', str_split(ltrim($color2, '#'), 2));

        $r = round($c1[0] * (1 - $ratio) + $c2[0] * $ratio);
        $g = round($c1[1] * (1 - $ratio) + $c2[1] * $ratio);
        $b = round($c1[2] * (1 - $ratio) + $c2[2] * $ratio);

        return sprintf('#%02x%02x%02x', min(255, $r), min(255, $g), min(255, $b));
    }

    /**
     * WCAG relative luminance of a hex color.
     *
     * @param string $color Hex color (e.g., '#2271b1').
     * @return float Relative luminance (0-1).
     */
    private function relative_luminance($color) {
        $rgb = array_map('hexdec', str_split(ltrim($color, '#'), 2));
        $channels = array_map(function ($v) {
            $v /= 255;
            return $v <= 0.03928 ? $v / 12.92 : pow(($v + 0.055) / 1.055, 2.4);
        }, $rgb);
        return 0.2126 * $channels[0] + 0.7152 * $channels[1] + 0.0722 * $channels[2];
    }

    /**
     * Darken a color (by mixing toward black) until it reaches the target
     * WCAG contrast ratio against white. Colors already meeting the target
     * are returned unchanged.
     *
     * @param string $color  Hex color to adjust.
     * @param float  $target Minimum contrast ratio against white (e.g., 4.5).
     * @return string Adjusted hex color.
     */
    private function darken_to_contrast($color, $target) {
        $adjusted = $color;
        for ($i = 0; $i < 20; $i++) {
            $ratio = 1.05 / ($this->relative_luminance($adjusted) + 0.05);
            if ($ratio >= $target) {
                return $adjusted;
            }
            $adjusted = $this->mix_hex_color($adjusted, '#000000', 0.08);
        }
        return $adjusted;
    }

    /**
     * Enqueue custom fonts for admin page preview
     */
    public function enqueue_custom_fonts_for_admin() {
        $combined_css = $this->get_admin_font_css();

        if (!empty($combined_css)) {
            wp_add_inline_style('typost-admin', $combined_css);
        }
    }

    /**
     * Get the combined @font-face CSS for uploaded font kits on admin pages.
     *
     * Public so the admin refresh REST endpoint can return updated font CSS
     * after fonts are added or removed without a page reload.
     *
     * @return string Combined, sanitized, minified CSS (may be empty).
     */
    public function get_admin_font_css() {
        $fonts = $this->get_custom_fonts();

        if (empty($fonts)) {
            return '';
        }

        // Cache combined font CSS
        $cache_key = 'typost_admin_font_css';
        $combined_css = get_transient($cache_key);

        if (false === $combined_css) {
            $combined_css = '';
            foreach ($fonts as $font) {
                if (!empty($font['css_content'])) {
                    // Sanitize CSS before adding and ensure URLs are relative
                    $combined_css .= "\n" . $this->ensure_relative_font_urls($this->sanitize_css_content($font['css_content']));
                }
            }

            // Minify (remove CSS comments, then collapse whitespace)
            $combined_css = preg_replace('/\/\*.*?\*\//s', '', $combined_css);
            $combined_css = preg_replace('/\s+/', ' ', $combined_css);
            $combined_css = trim($combined_css);

            // Cache for 24 hours
            set_transient($cache_key, $combined_css, DAY_IN_SECONDS);
        }

        return $combined_css;
    }

    /**
     * Enqueue custom fonts for block rendering in editor canvas iframe
     * This is called by enqueue_block_assets hook
     */
    public function enqueue_custom_fonts_for_blocks() {
        // Register/enqueue the handle and attach the --font-N CSS variables
        // unconditionally: the iframed editor canvas (WP 6.3+) only receives
        // styles enqueued on this hook, and Adobe/manual/Library fonts need the
        // variables even when no uploaded webfont kits exist.
        wp_register_style('typost-block-fonts', false, array(), TYPOST_VERSION);
        wp_enqueue_style('typost-block-fonts');

        // CSS variables must be added as raw CSS (not wrapped in <style> tags)
        $css_vars = $this->get_font_css_variables();
        if (!empty($css_vars)) {
            wp_add_inline_style('typost-block-fonts', $css_vars);
        }

        $fonts = $this->get_custom_fonts();

        if (empty($fonts)) {
            return;
        }

        // Cache combined font CSS
        $cache_key = 'typost_block_font_css';
        $combined_css = get_transient($cache_key);

        if (false === $combined_css) {
            $combined_css = '';
            foreach ($fonts as $font) {
                if (!empty($font['css_content'])) {
                    // Sanitize CSS before adding and ensure URLs are relative
                    $combined_css .= "\n" . $this->ensure_relative_font_urls($this->sanitize_css_content($font['css_content']));
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
            wp_add_inline_style('typost-block-fonts', $combined_css);
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
        $cache_key = 'typost_editor_font_css';
        $combined_css = get_transient($cache_key);

        if (false === $combined_css) {
            $combined_css = '';
            foreach ($fonts as $font) {
                if (!empty($font['css_content'])) {
                    // Sanitize CSS before adding and ensure URLs are relative
                    $combined_css .= "\n" . $this->ensure_relative_font_urls($this->sanitize_css_content($font['css_content']));
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
            wp_register_style('typost-editor-fonts', false, array(), TYPOST_VERSION);
            wp_enqueue_style('typost-editor-fonts');
            wp_add_inline_style('typost-editor-fonts', $combined_css);
        }
    }

    /**
     * Register settings
     */
    public function register_settings() {
        register_setting('typost_settings', 'typost_presets', array(
            'type' => 'array',
            'default' => $this->get_default_presets(),
            'sanitize_callback' => array($this, 'sanitize_presets')
        ));

        register_setting('typost_settings', 'typost_global_settings', array(
            'type' => 'array',
            'default' => array(),
            'sanitize_callback' => array($this, 'sanitize_global_settings')
        ));

        register_setting('typost_settings', 'typost_custom_fonts', array(
            'type' => 'array',
            'default' => array(),
            'sanitize_callback' => array($this, 'sanitize_custom_fonts')
        ));

        register_setting('typost_settings', 'typost_adobe_fonts', array(
            'type' => 'array',
            'default' => array(),
            'sanitize_callback' => array($this, 'sanitize_adobe_fonts')
        ));

        register_setting('typost_settings', 'typost_manual_fonts', array(
            'type' => 'array',
            'default' => array(),
            'sanitize_callback' => array($this, 'sanitize_manual_fonts')
        ));

        register_setting('typost_settings', 'typost_auto_register_wp_fonts', array(
            'type' => 'boolean',
            'default' => true,
            'sanitize_callback' => 'rest_sanitize_boolean'
        ));

        register_setting('typost_settings', 'typost_font_replacements', array(
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
        add_filter('block_type_metadata', array($this, 'filter_block_splitting_support'));
        register_block_type(TYPOST_PLUGIN_DIR . 'blocks/typography-stylist');
        remove_filter('block_type_metadata', array($this, 'filter_block_splitting_support'));
    }

    /**
     * Add core's `splitting` block support when Enter should start a new block.
     *
     * WordPress decides the Enter key entirely from this support flag: with it,
     * writing-flow runs __unstableSplitSelection() and Enter starts a new block;
     * without it RichText inserts a line break instead. Shift+Enter inserts a
     * line break either way, so only the plain-Enter behaviour changes.
     *
     * Applied server-side rather than through a JS `blocks.registerBlockType`
     * filter so the flag is present in the bootstrapped block definition before
     * any editor script runs — the block script and the typostData localization
     * belong to different handles with no guaranteed order between them.
     *
     * block.json is deliberately left alone: the default (line break) stays the
     * static, no-configuration behaviour.
     *
     * @since 2.3.0
     * @param array $metadata Block metadata read from block.json.
     * @return array Metadata, with supports.splitting added when the option is off.
     */
    public function filter_block_splitting_support($metadata) {
        if (!isset($metadata['name']) || 'typost/block' !== $metadata['name']) {
            return $metadata;
        }

        if (get_option('typost_block_enter_line_break', true)) {
            return $metadata;
        }

        if (!isset($metadata['supports']) || !is_array($metadata['supports'])) {
            $metadata['supports'] = array();
        }
        $metadata['supports']['splitting'] = true;

        return $metadata;
    }

    /**
     * Register REST API routes
     */
    public function register_rest_routes() {
        register_rest_route('typost/v1', '/presets', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_presets_endpoint'),
            'permission_callback' => array($this, 'check_permissions')
        ));

        register_rest_route('typost/v1', '/presets', array(
            'methods' => 'POST',
            'callback' => array($this, 'save_preset_endpoint'),
            'permission_callback' => array($this, 'check_permissions')
        ));

        register_rest_route('typost/v1', '/presets/(?P<id>[a-zA-Z0-9_-]+)', array(
            'methods' => 'DELETE',
            'callback' => array($this, 'delete_preset_endpoint'),
            'permission_callback' => array($this, 'check_permissions')
        ));

        // Add features endpoint
        register_rest_route('typost/v1', '/features', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_features_endpoint'),
            'permission_callback' => array($this, 'check_permissions')
        ));

        register_rest_route('typost/v1', '/fonts', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_fonts_endpoint'),
            'permission_callback' => array($this, 'check_permissions')
        ));

        register_rest_route('typost/v1', '/fonts', array(
            'methods' => 'POST',
            'callback' => array($this, 'upload_font_endpoint'),
            'permission_callback' => function() {
                return current_user_can('upload_files');
            }
        ));

        register_rest_route('typost/v1', '/fonts/(?P<id>[a-zA-Z0-9_-]+)', array(
            'methods' => 'DELETE',
            'callback' => array($this, 'delete_font_endpoint'),
            'permission_callback' => function() {
                return current_user_can('upload_files');
            }
        ));

        // Adobe Fonts endpoints
        register_rest_route('typost/v1', '/adobe-fonts', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_adobe_fonts_endpoint'),
            'permission_callback' => array($this, 'check_permissions')
        ));

        register_rest_route('typost/v1', '/adobe-fonts', array(
            'methods' => 'POST',
            'callback' => array($this, 'add_adobe_font_endpoint'),
            'permission_callback' => function() {
                return current_user_can('upload_files');
            }
        ));

        register_rest_route('typost/v1', '/adobe-fonts/(?P<id>[a-zA-Z0-9_-]+)', array(
            'methods' => 'DELETE',
            'callback' => array($this, 'delete_adobe_font_endpoint'),
            'permission_callback' => function() {
                return current_user_can('upload_files');
            }
        ));

        register_rest_route('typost/v1', '/adobe-fonts/(?P<id>[a-zA-Z0-9_-]+)/fallback', array(
            'methods' => 'PATCH',
            'callback' => array($this, 'update_adobe_font_fallback_endpoint'),
            'permission_callback' => function() {
                return current_user_can('upload_files');
            }
        ));

        register_rest_route('typost/v1', '/adobe-fonts/(?P<id>[a-zA-Z0-9_-]+)/load-on-all-pages', array(
            'methods' => 'PATCH',
            'callback' => array($this, 'update_adobe_font_load_on_all_pages_endpoint'),
            'permission_callback' => function() {
                return current_user_can('upload_files');
            }
        ));

        // Manual fonts endpoints
        register_rest_route('typost/v1', '/manual-fonts', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_manual_fonts_endpoint'),
            'permission_callback' => array($this, 'check_permissions')
        ));

        register_rest_route('typost/v1', '/manual-fonts', array(
            'methods' => 'POST',
            'callback' => array($this, 'add_manual_font_endpoint'),
            'permission_callback' => function() {
                return current_user_can('edit_posts');
            }
        ));

        register_rest_route('typost/v1', '/manual-fonts/(?P<id>[a-zA-Z0-9_-]+)', array(
            'methods' => 'DELETE',
            'callback' => array($this, 'delete_manual_font_endpoint'),
            'permission_callback' => function() {
                return current_user_can('edit_posts');
            }
        ));

        register_rest_route('typost/v1', '/manual-fonts/(?P<id>[a-zA-Z0-9_-]+)', array(
            'methods' => 'PATCH',
            'callback' => array($this, 'update_manual_font_endpoint'),
            'permission_callback' => function() {
                return current_user_can('edit_posts');
            }
        ));

        // Fallback endpoint for uploaded fonts
        register_rest_route('typost/v1', '/fonts/(?P<id>[a-zA-Z0-9_-]+)/fallback', array(
            'methods' => 'PATCH',
            'callback' => array($this, 'update_font_fallback_endpoint'),
            'permission_callback' => function() {
                return current_user_can('upload_files');
            }
        ));

        // Load on all pages endpoint for uploaded fonts
        register_rest_route('typost/v1', '/fonts/(?P<id>[a-zA-Z0-9_-]+)/load-on-all-pages', array(
            'methods' => 'PATCH',
            'callback' => array($this, 'update_font_load_on_all_pages_endpoint'),
            'permission_callback' => function() {
                return current_user_can('upload_files');
            }
        ));

        // Bulk auto-detect available weights for fonts that predate weight
        // detection (entries without the available_weights key). upload_files
        // matches the per-font weight-save (fallback) endpoints.
        register_rest_route('typost/v1', '/fonts/detect-weights/bulk', array(
            'methods' => 'POST',
            'callback' => array($this, 'bulk_detect_weights_endpoint'),
            'permission_callback' => function() {
                return current_user_can('upload_files');
            }
        ));

        // WP Font Library registration endpoints (site-wide configuration,
        // hence manage_options rather than the edit_posts used for font CRUD)
        register_rest_route('typost/v1', '/fonts/wp-library/bulk', array(
            'methods' => 'POST',
            'callback' => array($this, 'bulk_register_fonts_in_library_endpoint'),
            'permission_callback' => function() {
                return current_user_can('manage_options');
            }
        ));

        // Adopt a WP Font Library font for editor use (allocates a font_id).
        // edit_posts: authors pick fonts, matching the other editor-facing
        // font endpoints.
        register_rest_route('typost/v1', '/wp-fonts/adopt', array(
            'methods' => 'POST',
            'callback' => array($this, 'adopt_wp_font_endpoint'),
            'permission_callback' => function() {
                return current_user_can('edit_posts');
            }
        ));

        register_rest_route('typost/v1', '/fonts/wp-library/dismiss-notice', array(
            'methods' => 'POST',
            'callback' => array($this, 'dismiss_wp_library_notice_endpoint'),
            'permission_callback' => function() {
                return current_user_can('manage_options');
            }
        ));

        register_rest_route('typost/v1', '/fonts/(?P<id>[a-zA-Z0-9_-]+)/wp-library', array(
            'methods' => 'POST',
            'callback' => array($this, 'register_font_in_library_endpoint'),
            'permission_callback' => function() {
                return current_user_can('manage_options');
            }
        ));

        register_rest_route('typost/v1', '/fonts/(?P<id>[a-zA-Z0-9_-]+)/wp-library', array(
            'methods' => 'DELETE',
            'callback' => array($this, 'unregister_font_from_library_endpoint'),
            'permission_callback' => function() {
                return current_user_can('manage_options');
            }
        ));

        // Font replacement endpoints
        register_rest_route('typost/v1', '/font-replacements', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_font_replacements_endpoint'),
            'permission_callback' => array($this, 'check_permissions')
        ));

        register_rest_route('typost/v1', '/font-replacements', array(
            'methods' => 'POST',
            'callback' => array($this, 'add_font_replacement_endpoint'),
            'permission_callback' => function() {
                return current_user_can('edit_posts');
            }
        ));

        register_rest_route('typost/v1', '/font-replacements/(?P<id>\d+)', array(
            'methods' => 'PATCH',
            'callback' => array($this, 'update_font_replacement_endpoint'),
            'permission_callback' => function() {
                return current_user_can('edit_posts');
            }
        ));

        register_rest_route('typost/v1', '/font-replacements/(?P<id>\d+)', array(
            'methods' => 'DELETE',
            'callback' => array($this, 'delete_font_replacement_endpoint'),
            'permission_callback' => function() {
                return current_user_can('edit_posts');
            }
        ));

        register_rest_route('typost/v1', '/font-replacements/orphans', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_unassigned_fonts_endpoint'),
            'permission_callback' => array($this, 'check_permissions')
        ));

        // Font display order endpoints
        register_rest_route('typost/v1', '/font-order', array(
            'methods'             => 'GET',
            'callback'            => array($this, 'rest_get_font_order'),
            'permission_callback' => array($this, 'check_permissions'),
        ));
        register_rest_route('typost/v1', '/font-order', array(
            'methods'             => 'POST',
            'callback'            => array($this, 'rest_update_font_order'),
            'permission_callback' => array($this, 'check_permissions'),
        ));

        // Font feature visibility endpoints
        register_rest_route('typost/v1', '/font-feature-visibility', array(
            'methods'             => 'GET',
            'callback'            => array($this, 'rest_get_font_feature_visibility'),
            'permission_callback' => array($this, 'check_permissions'),
        ));
        register_rest_route('typost/v1', '/font-feature-visibility/(?P<font_id>\d+)', array(
            'methods'             => 'POST',
            'callback'            => array($this, 'rest_update_font_feature_visibility'),
            'permission_callback' => array($this, 'check_permissions'),
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
            'callback'            => array($this, 'rest_get_admin_refresh'),
            'permission_callback' => function() {
                return current_user_can('manage_options');
            },
        ));

        register_rest_route('typost/v1', '/admin/options', array(
            'methods'             => 'POST',
            'callback'            => array($this, 'rest_save_admin_options'),
            'permission_callback' => function() {
                return current_user_can('manage_options');
            },
        ));

        register_rest_route('typost/v1', '/admin/accessibility', array(
            'methods'             => 'POST',
            'callback'            => array($this, 'rest_save_accessibility_options'),
            'permission_callback' => function() {
                return current_user_can('manage_options');
            },
        ));

        register_rest_route('typost/v1', '/admin/clear-cache', array(
            'methods'             => 'POST',
            'callback'            => array($this, 'rest_clear_font_cache'),
            'permission_callback' => function() {
                return current_user_can('manage_options');
            },
        ));

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
     */
    public function check_permissions($request = null) {
        // Check capability
        if (!current_user_can('edit_posts')) {
            return false;
        }

        // Rate limiting for write operations
        if ($request && in_array($request->get_method(), array('POST', 'DELETE', 'PUT', 'PATCH'))) {
            $user_id = get_current_user_id();
            $rate_limit_key = 'typost_rate_limit_' . $user_id;
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
                    esc_html__('Too many requests. Please try again later.', 'typography-stylist'),
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
            $this->presets_cache = get_option('typost_presets', $this->get_default_presets());
        }

        /**
         * Filter the presets list (saved and default presets combined).
         *
         * Allows extension plugins to inject additional presets or modify existing ones.
         *
         * @since 2.0.0
         * @param array $presets Array of preset objects.
         */
        return apply_filters('typost_presets', $this->presets_cache);
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
            'hist' => 'Long ſ and hiſtoric',
            'ornm' => '* § ¶ † ‡ • ◆',

            // Additional Ligatures
            'clig' => 'ffi ffl ct st',
            'hlig' => 'ct ſt ſi ſl',

            // Numerals & Figures
            'pnum' => '0123456789',
            'tnum' => '0123456789',
            'lnum' => '0123456789',
            'onum' => '0123456789',
            'frac' => '1/2 3/4 5/8 7/16',
            'zero' => 'O0 l1 Z2 S5',

            // Capitals & Case
            'smcp' => 'Small Capitals',
            'c2sc' => 'CAPITALS TO SMALL CAPS',
            'pcap' => 'Petite Capitals',
            'case' => 'H[A]R{D} (CAPS)',

            // Positional Forms
            'init' => 'Initial',
            'medi' => 'Medium',
            'fina' => 'Final',
            'isol' => 'Isolated',

            // Superscript & Ordinals
            'sups' => 'H2O x2 1st',
            'subs' => 'H2O CO2 x1',
            'ordn' => '1st 2nd 3rd 4th',

            // Other Features
            'kern' => 'AV To WA Ty',
            'locl' => 'Localized Forms',
            'rand' => 'Handwritten Style'
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
                    'name' => esc_html__('Standard Ligatures', 'typography-stylist'),
                    'category' => 'ligatures',
                    'description' => esc_html__('Common letter combinations like fi, fl', 'typography-stylist')
                ),
                array(
                    'id' => 'dlig',
                    'name' => esc_html__('Discretionary Ligatures', 'typography-stylist'),
                    'category' => 'ligatures',
                    'description' => esc_html__('Optional decorative ligatures', 'typography-stylist')
                ),
                array(
                    'id' => 'calt',
                    'name' => esc_html__('Contextual Alternates', 'typography-stylist'),
                    'category' => 'ligatures',
                    'description' => esc_html__('Context-aware letter forms', 'typography-stylist')
                ),
                array(
                    'id' => 'clig',
                    'name' => esc_html__('Contextual Ligatures', 'typography-stylist'),
                    'category' => 'ligatures',
                    'description' => esc_html__('Context-dependent ligature substitutions', 'typography-stylist')
                ),
                array(
                    'id' => 'hlig',
                    'name' => esc_html__('Historical Ligatures', 'typography-stylist'),
                    'category' => 'ligatures',
                    'description' => esc_html__('Archaic and historical ligature forms', 'typography-stylist')
                ),
                array(
                    'id' => 'ss01',
                    'name' => esc_html__('Stylistic Set 1', 'typography-stylist'),
                    'category' => 'stylistic-sets',
                    'description' => esc_html__('Alternate character designs', 'typography-stylist')
                ),
                array(
                    'id' => 'ss02',
                    'name' => esc_html__('Stylistic Set 2', 'typography-stylist'),
                    'category' => 'stylistic-sets',
                    'description' => esc_html__('Alternate character designs', 'typography-stylist')
                ),
                array(
                    'id' => 'ss03',
                    'name' => esc_html__('Stylistic Set 3', 'typography-stylist'),
                    'category' => 'stylistic-sets',
                    'description' => esc_html__('Alternate character designs', 'typography-stylist')
                ),
                array(
                    'id' => 'ss04',
                    'name' => esc_html__('Stylistic Set 4', 'typography-stylist'),
                    'category' => 'stylistic-sets',
                    'description' => esc_html__('Alternate character designs', 'typography-stylist')
                ),
                array(
                    'id' => 'ss05',
                    'name' => esc_html__('Stylistic Set 5', 'typography-stylist'),
                    'category' => 'stylistic-sets',
                    'description' => esc_html__('Alternate character designs', 'typography-stylist')
                ),
                array(
                    'id' => 'ss06',
                    'name' => esc_html__('Stylistic Set 6', 'typography-stylist'),
                    'category' => 'stylistic-sets',
                    'description' => esc_html__('Alternate character designs', 'typography-stylist')
                ),
                array(
                    'id' => 'ss07',
                    'name' => esc_html__('Stylistic Set 7', 'typography-stylist'),
                    'category' => 'stylistic-sets',
                    'description' => esc_html__('Alternate character designs', 'typography-stylist')
                ),
                array(
                    'id' => 'ss08',
                    'name' => esc_html__('Stylistic Set 8', 'typography-stylist'),
                    'category' => 'stylistic-sets',
                    'description' => esc_html__('Alternate character designs', 'typography-stylist')
                ),
                array(
                    'id' => 'ss09',
                    'name' => esc_html__('Stylistic Set 9', 'typography-stylist'),
                    'category' => 'stylistic-sets',
                    'description' => esc_html__('Alternate character designs', 'typography-stylist')
                ),
                array(
                    'id' => 'ss10',
                    'name' => esc_html__('Stylistic Set 10', 'typography-stylist'),
                    'category' => 'stylistic-sets',
                    'description' => esc_html__('Alternate character designs', 'typography-stylist')
                ),
                array(
                    'id' => 'ss11',
                    'name' => esc_html__('Stylistic Set 11', 'typography-stylist'),
                    'category' => 'stylistic-sets',
                    'description' => esc_html__('Alternate character designs', 'typography-stylist')
                ),
                array(
                    'id' => 'ss12',
                    'name' => esc_html__('Stylistic Set 12', 'typography-stylist'),
                    'category' => 'stylistic-sets',
                    'description' => esc_html__('Alternate character designs', 'typography-stylist')
                ),
                array(
                    'id' => 'ss13',
                    'name' => esc_html__('Stylistic Set 13', 'typography-stylist'),
                    'category' => 'stylistic-sets',
                    'description' => esc_html__('Alternate character designs', 'typography-stylist')
                ),
                array(
                    'id' => 'ss14',
                    'name' => esc_html__('Stylistic Set 14', 'typography-stylist'),
                    'category' => 'stylistic-sets',
                    'description' => esc_html__('Alternate character designs', 'typography-stylist')
                ),
                array(
                    'id' => 'ss15',
                    'name' => esc_html__('Stylistic Set 15', 'typography-stylist'),
                    'category' => 'stylistic-sets',
                    'description' => esc_html__('Alternate character designs', 'typography-stylist')
                ),
                array(
                    'id' => 'ss16',
                    'name' => esc_html__('Stylistic Set 16', 'typography-stylist'),
                    'category' => 'stylistic-sets',
                    'description' => esc_html__('Alternate character designs', 'typography-stylist')
                ),
                array(
                    'id' => 'ss17',
                    'name' => esc_html__('Stylistic Set 17', 'typography-stylist'),
                    'category' => 'stylistic-sets',
                    'description' => esc_html__('Alternate character designs', 'typography-stylist')
                ),
                array(
                    'id' => 'ss18',
                    'name' => esc_html__('Stylistic Set 18', 'typography-stylist'),
                    'category' => 'stylistic-sets',
                    'description' => esc_html__('Alternate character designs', 'typography-stylist')
                ),
                array(
                    'id' => 'ss19',
                    'name' => esc_html__('Stylistic Set 19', 'typography-stylist'),
                    'category' => 'stylistic-sets',
                    'description' => esc_html__('Alternate character designs', 'typography-stylist')
                ),
                array(
                    'id' => 'ss20',
                    'name' => esc_html__('Stylistic Set 20', 'typography-stylist'),
                    'category' => 'stylistic-sets',
                    'description' => esc_html__('Alternate character designs', 'typography-stylist')
                ),
                array(
                    'id' => 'swsh',
                    'name' => esc_html__('Swashes', 'typography-stylist'),
                    'category' => 'alternates',
                    'description' => esc_html__('Decorative flourishes', 'typography-stylist')
                ),
                array(
                    'id' => 'cswh',
                    'name' => esc_html__('Contextual Swashes', 'typography-stylist'),
                    'category' => 'alternates',
                    'description' => esc_html__('Context-aware decorative flourishes', 'typography-stylist')
                ),
                array(
                    'id' => 'salt',
                    'name' => esc_html__('Stylistic Alternates', 'typography-stylist'),
                    'category' => 'alternates',
                    'description' => esc_html__('Alternative character forms', 'typography-stylist')
                ),
                array(
                    'id' => 'titl',
                    'name' => esc_html__('Titling', 'typography-stylist'),
                    'category' => 'alternates',
                    'description' => esc_html__('Optimized for large titles', 'typography-stylist')
                ),
                array(
                    'id' => 'hist',
                    'name' => esc_html__('Historical Forms', 'typography-stylist'),
                    'category' => 'alternates',
                    'description' => esc_html__('Archaic and historical letterforms', 'typography-stylist')
                ),
                array(
                    'id' => 'ornm',
                    'name' => esc_html__('Ornaments', 'typography-stylist'),
                    'category' => 'decorative',
                    'description' => esc_html__('Decorative ornaments', 'typography-stylist')
                ),
                // Numerals & Figures
                array(
                    'id' => 'pnum',
                    'name' => esc_html__('Proportional Figures', 'typography-stylist'),
                    'category' => 'numerals',
                    'description' => esc_html__('Variable-width number spacing', 'typography-stylist')
                ),
                array(
                    'id' => 'tnum',
                    'name' => esc_html__('Tabular Figures', 'typography-stylist'),
                    'category' => 'numerals',
                    'description' => esc_html__('Fixed-width number spacing for alignment', 'typography-stylist')
                ),
                array(
                    'id' => 'lnum',
                    'name' => esc_html__('Lining Figures', 'typography-stylist'),
                    'category' => 'numerals',
                    'description' => esc_html__('Numbers aligned to the baseline', 'typography-stylist')
                ),
                array(
                    'id' => 'onum',
                    'name' => esc_html__('Oldstyle Figures', 'typography-stylist'),
                    'category' => 'numerals',
                    'description' => esc_html__('Numbers with varying heights and descenders', 'typography-stylist')
                ),
                array(
                    'id' => 'frac',
                    'name' => esc_html__('Fractions', 'typography-stylist'),
                    'category' => 'numerals',
                    'description' => esc_html__('Automatic fraction formation', 'typography-stylist')
                ),
                array(
                    'id' => 'zero',
                    'name' => esc_html__('Slashed Zero', 'typography-stylist'),
                    'category' => 'numerals',
                    'description' => esc_html__('Zero with slash to distinguish from letter O', 'typography-stylist')
                ),
                // Capitals & Case
                array(
                    'id' => 'smcp',
                    'name' => esc_html__('Small Capitals', 'typography-stylist'),
                    'category' => 'capitals',
                    'description' => esc_html__('Lowercase letters as small capital forms', 'typography-stylist')
                ),
                array(
                    'id' => 'c2sc',
                    'name' => esc_html__('Capitals to Small Caps', 'typography-stylist'),
                    'category' => 'capitals',
                    'description' => esc_html__('Convert uppercase letters to small capitals', 'typography-stylist')
                ),
                array(
                    'id' => 'pcap',
                    'name' => esc_html__('Petite Capitals', 'typography-stylist'),
                    'category' => 'capitals',
                    'description' => esc_html__('Smaller than small capitals, matching x-height', 'typography-stylist')
                ),
                array(
                    'id' => 'case',
                    'name' => esc_html__('Case-Sensitive Forms', 'typography-stylist'),
                    'category' => 'capitals',
                    'description' => esc_html__('Punctuation and symbols adjusted for all-caps text', 'typography-stylist')
                ),
                // Positional Forms
                array(
                    'id' => 'init',
                    'name' => esc_html__('Initial Forms', 'typography-stylist'),
                    'category' => 'positional',
                    'description' => esc_html__('Letterforms used at the beginning of a word', 'typography-stylist')
                ),
                array(
                    'id' => 'medi',
                    'name' => esc_html__('Medial Forms', 'typography-stylist'),
                    'category' => 'positional',
                    'description' => esc_html__('Letterforms used in the middle of a word', 'typography-stylist')
                ),
                array(
                    'id' => 'fina',
                    'name' => esc_html__('Terminal Forms', 'typography-stylist'),
                    'category' => 'positional',
                    'description' => esc_html__('Letterforms used at the end of a word', 'typography-stylist')
                ),
                array(
                    'id' => 'isol',
                    'name' => esc_html__('Isolated Forms', 'typography-stylist'),
                    'category' => 'positional',
                    'description' => esc_html__('Standalone letterforms not connected to adjacent characters', 'typography-stylist')
                ),
                // Superscript & Ordinals
                array(
                    'id' => 'sups',
                    'name' => esc_html__('Superscript', 'typography-stylist'),
                    'category' => 'super-sub',
                    'description' => esc_html__('Raised characters for footnotes and exponents', 'typography-stylist')
                ),
                array(
                    'id' => 'subs',
                    'name' => esc_html__('Subscript', 'typography-stylist'),
                    'category' => 'super-sub',
                    'description' => esc_html__('Lowered characters for chemical formulas and indices', 'typography-stylist')
                ),
                array(
                    'id' => 'ordn',
                    'name' => esc_html__('Ordinals', 'typography-stylist'),
                    'category' => 'super-sub',
                    'description' => esc_html__('Ordinal indicators like 1st, 2nd, 3rd', 'typography-stylist')
                ),
                // Other Features
                array(
                    'id' => 'kern',
                    'name' => esc_html__('Kerning', 'typography-stylist'),
                    'category' => 'other',
                    'description' => esc_html__('Fine-tuned letter spacing adjustments', 'typography-stylist')
                ),
                array(
                    'id' => 'locl',
                    'name' => esc_html__('Localized Forms', 'typography-stylist'),
                    'category' => 'other',
                    'description' => esc_html__('Script and language-specific character variants', 'typography-stylist')
                ),
                array(
                    'id' => 'rand',
                    'name' => esc_html__('Randomize', 'typography-stylist'),
                    'category' => 'other',
                    'description' => esc_html__('Randomized glyph variants for handwriting and calligraphic fonts', 'typography-stylist')
                )
            );
        }
        /**
         * Filter the available OpenType features list.
         *
         * Allows extension plugins to add custom features or modify the features list.
         * Each feature should have: id, name, category, description.
         *
         * @since 2.0.0
         * @param array $features Array of feature objects.
         */
        return apply_filters('typost_available_features', $this->features_cache);
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
            return new WP_Error('missing_params', esc_html__('Missing required parameters', 'typography-stylist'), array('status' => 400));
        }

        if (!is_array($params['features']) || count($params['features']) === 0) {
            return new WP_Error('invalid_features', esc_html__('Features must be a non-empty array', 'typography-stylist'), array('status' => 400));
        }

        // Validate feature IDs
        $available_features = array_column($this->get_available_features(), 'id');
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

        $presets = $this->get_presets();
        $presets[] = $new_preset;
        update_option('typost_presets', $presets);

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
                esc_html__('Preset not found', 'typography-stylist'),
                array('status' => 404)
            );
        }

        update_option('typost_presets', array_values($presets));
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
        return $this->font_sources()->get_custom_fonts();
    }

    /**
     * Get manual fonts with object caching
     */
    public function get_manual_fonts() {
        return $this->font_sources()->get_manual_fonts();
    }

    /**
     * Get per-font feature visibility settings.
     *
     * Returns an associative array keyed by numeric font_id, each containing
     * a 'disabled_features' array. Missing entry = all features enabled (backward compatible).
     *
     * @since 2.0.0
     * @return array
     */
    public function get_font_feature_visibility() {
        return get_option('typost_font_feature_visibility', array());
    }

    /**
     * REST callback: GET /font-feature-visibility
     *
     * @since 2.0.0
     */
    public function rest_get_font_feature_visibility() {
        return rest_ensure_response($this->get_font_feature_visibility());
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
        $valid_ids  = array_column($this->get_available_features(), 'id');
        $sanitized  = array();
        foreach ($body['disabled_features'] as $fid) {
            $fid = sanitize_key($fid);
            if (in_array($fid, $valid_ids, true)) {
                $sanitized[] = $fid;
            }
        }

        $visibility          = $this->get_font_feature_visibility();
        $visibility[$font_id] = array('disabled_features' => $sanitized);
        update_option('typost_font_feature_visibility', $visibility);

        // Bust the editor data cache for all users — feature visibility is global
        $this->invalidate_editor_data_cache();

        return rest_ensure_response(array(
            'success'  => true,
            'font_id'  => $font_id,
            'disabled_features' => $sanitized,
        ));
    }

    /**
     * Get the saved font display order.
     *
     * Returns an array of font keys like ['font-12', 'adobe-34', 'manual-56', 'wpl-78'].
     * Fonts not present in the array are appended at the end when building the list.
     *
     * @since 2.0.0
     * @return array
     */
    public function get_font_order() {
        return get_option('typost_font_order', array());
    }

    /**
     * REST callback: GET /font-order
     *
     * @since 2.0.0
     */
    public function rest_get_font_order() {
        return rest_ensure_response($this->get_font_order());
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
        $this->invalidate_editor_data_cache();

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
        $adobe_fonts  = $this->get_adobe_fonts();
        $manual_fonts = $this->get_manual_fonts();

        ob_start();
        typost_render_font_list_section($this, $custom_fonts, $adobe_fonts, $manual_fonts);
        $font_list_html = ob_get_clean();

        ob_start();
        typost_render_preview_font_options($this, $custom_fonts, $adobe_fonts, $manual_fonts);
        $preview_options_html = ob_get_clean();

        $adobe_css_urls = array();
        foreach ($adobe_fonts as $adobe_font) {
            if (!empty($adobe_font['css_url'])) {
                $adobe_css_urls[] = $adobe_font['css_url'];
            }
        }

        return rest_ensure_response(array(
            'fontListHtml'          => $font_list_html,
            'previewOptionsHtml'    => $preview_options_html,
            'fonts'                 => $this->get_custom_fonts(),
            'adobeFonts'            => $adobe_fonts,
            'manualFonts'           => $manual_fonts,
            'fontFeatureVisibility' => $this->get_font_feature_visibility(),
            'fontOrder'             => $this->get_font_order(),
            'wpFontLibraryFonts'    => $this->get_wp_font_library_fonts(),
            'fontVariablesCss'      => $this->get_font_css_variables(),
            'adminFontCss'          => $this->get_admin_font_css(),
            'adobeCssUrls'          => array_values(array_unique($adobe_css_urls)),
        ));
    }

    /**
     * Option keys for extension checkboxes rendered into the Options tab.
     *
     * Modules and extension plugins that echo a settings row on the
     * `typost_admin_options_rows` action register the option key here so both
     * the REST save and the no-JavaScript POST fallback persist it. Values are
     * always stored as '1'/'0'.
     *
     * Keys must start with `typost_`: an extension may add its own settings,
     * not rewrite arbitrary WordPress options through this plugin's form.
     *
     * @since 2.3.0
     * @return array List of option names.
     */
    public function get_extension_option_checkboxes() {
        /**
         * Filter the extension checkbox options saved with the Options tab.
         *
         * @since 2.3.0
         * @param array $options List of option names (must be prefixed `typost_`).
         */
        $options = apply_filters('typost_admin_options_checkboxes', array());

        if (!is_array($options)) {
            return array();
        }

        $valid = array();
        foreach ($options as $option_key) {
            if (is_string($option_key) && 0 === strpos($option_key, 'typost_')) {
                $valid[] = $option_key;
            }
        }

        return array_values(array_unique($valid));
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
        // rest_sanitize_boolean(): clients may send real booleans (JSON) or
        // strings like "false"/"0" (form-encoded), which are truthy in PHP.
        update_option('typost_show_clear_confirmation', rest_sanitize_boolean($request->get_param('show_clear_confirmation')) ? '1' : '0');
        update_option('typost_archive_full_content_check', rest_sanitize_boolean($request->get_param('archive_full_content_check')) ? '1' : '0');

        // Only save when the client actually sent the value. A browser holding a
        // cached copy of admin-page.js from before this option existed would post
        // without the field, and an unguarded write would read that absence as
        // "unchecked" and silently turn the default off.
        if (null !== $request->get_param('block_enter_line_break')) {
            update_option('typost_block_enter_line_break', rest_sanitize_boolean($request->get_param('block_enter_line_break')) ? '1' : '0');
        }

        // Checkbox rendered only when the Font Library is available; only
        // save when the client actually sent the value.
        if ($this->font_library_bridge()->is_available() && null !== $request->get_param('auto_register_wp_fonts')) {
            update_option('typost_auto_register_wp_fonts', rest_sanitize_boolean($request->get_param('auto_register_wp_fonts')) ? '1' : '0');
        }

        // Extension-registered checkbox options (see typost_admin_options_rows).
        // Keyed by the full option name, which is also the form field name.
        // Same "only save what the client sent" rule as above.
        foreach ($this->get_extension_option_checkboxes() as $option_key) {
            if (null !== $request->get_param($option_key)) {
                update_option($option_key, rest_sanitize_boolean($request->get_param($option_key)) ? '1' : '0');
            }
        }

        $color_scheme = $this->sanitize_color_scheme(sanitize_key((string) $request->get_param('color_scheme')));
        update_option('typost_admin_color_scheme', $color_scheme);

        // Clear cache for all users when options change
        // Archive content check changes require cache refresh to take effect
        $this->clear_cache();

        return rest_ensure_response(array(
            'success'   => true,
            'scheme'    => $color_scheme,
            'schemeCss' => $this->get_color_scheme_css($color_scheme),
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
        update_option('typost_enable_aria_labels', rest_sanitize_boolean($request->get_param('enable_aria_labels')) ? '1' : '0');
        update_option('typost_disable_accessibility_warning', rest_sanitize_boolean($request->get_param('disable_accessibility_warning')) ? '1' : '0');

        // Clear cache when accessibility settings change
        $this->clear_cache();

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
        $this->clear_cache();

        return rest_ensure_response(array('success' => true));
    }

    /**
     * Get fonts from the WordPress Font Library (WP 6.5+).
     *
     * Returns an empty array on older WordPress versions.
     * Results are read-only — the WP Font Library manages its own CRUD.
     *
     * @since 2.0.0
     * @return array Normalized font entries with keys: post_id, name, font_family, slug.
     */
    public function get_wp_font_library_fonts() {
        return $this->font_library_bridge()->get_wp_font_library_fonts();
    }

    /**
     * Get WP Font Library fonts for display surfaces (admin list, pickers)
     *
     * Excludes families the plugin itself registered — those are already
     * represented by their uploaded font card / picker entry.
     *
     * @since 2.1.0
     * @return array Same shape as get_wp_font_library_fonts().
     */
    public function get_wp_font_library_fonts_for_display() {
        return $this->font_library_bridge()->get_wp_font_library_fonts_for_display();
    }

    /**
     * Get adopted WP Font Library fonts keyed by slug (for editor data)
     *
     * @since 2.1.0
     * @return array
     */
    public function get_adopted_wp_fonts_by_slug() {
        $by_slug = array();
        foreach ($this->font_sources()->get_adopted_wp_fonts() as $font) {
            if (isset($font['wp_slug'])) {
                $by_slug[$font['wp_slug']] = $font;
            }
        }
        return $by_slug;
    }

    /**
     * Get Library slugs of fonts the plugin itself registered (for editor
     * data — the picker skips these in the WP Font Library group because
     * they already appear as uploaded kit fonts)
     *
     * @since 2.1.0
     * @return array
     */
    public function get_plugin_registered_slugs() {
        $slugs = array();
        foreach ($this->get_custom_fonts() as $font) {
            if (!empty($font['wp_slug'])) {
                $slugs[] = $font['wp_slug'];
            }
        }
        return $slugs;
    }

    /**
     * Clear object cache (call after updating options)
     */
    private function clear_cache() {
        $this->presets_cache = null;
        $this->font_sources()->clear_runtime_cache();
        $this->font_library_bridge()->clear_snapshot_cache();

        // Clear all font CSS caches
        delete_transient('typost_combined_font_css');
        delete_transient('typost_admin_font_css');
        delete_transient('typost_editor_font_css');
        delete_transient('typost_block_font_css');
        delete_transient('typost_css_variables');

        // Clear per-page font caches (all cached variations)
        // Direct database call is required here for bulk deletion of transients with wildcard patterns.
        // No caching needed as this is a delete operation.
        global $wpdb;
        // phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
        $wpdb->query($wpdb->prepare("DELETE FROM {$wpdb->options} WHERE option_name LIKE %s", $wpdb->esc_like('_transient_typost_font_css_') . '%'));
        $wpdb->query($wpdb->prepare("DELETE FROM {$wpdb->options} WHERE option_name LIKE %s", $wpdb->esc_like('_transient_timeout_typost_font_css_') . '%'));
        $wpdb->query($wpdb->prepare("DELETE FROM {$wpdb->options} WHERE option_name LIKE %s", $wpdb->esc_like('_transient_typost_has_styled_') . '%'));
        $wpdb->query($wpdb->prepare("DELETE FROM {$wpdb->options} WHERE option_name LIKE %s", $wpdb->esc_like('_transient_timeout_typost_has_styled_') . '%'));
        $wpdb->query($wpdb->prepare("DELETE FROM {$wpdb->options} WHERE option_name LIKE %s", $wpdb->esc_like('_transient_typost_used_fonts_') . '%'));
        $wpdb->query($wpdb->prepare("DELETE FROM {$wpdb->options} WHERE option_name LIKE %s", $wpdb->esc_like('_transient_timeout_typost_used_fonts_') . '%'));
        // phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching

        // Clear editor data cache for all users
        $this->invalidate_editor_data_cache();

        /**
         * Fires after all Typography Stylist caches are cleared.
         *
         * Allows extension plugins to clear their own caches when
         * the core plugin clears its caches.
         *
         * @since 2.0.0
         */
        do_action('typost_cache_clear');
    }

    /**
     * Invalidate editor data cache
     */
    private function invalidate_editor_data_cache($user_id = null) {
        if ($user_id) {
            delete_transient('typost_editor_data_' . $user_id);
            wp_cache_delete('typost_editor_data_' . $user_id, 'transient');
        } else {
            // Clear for all users
            // Direct database call is required for bulk deletion of user-specific transients.
            // No caching needed as this is a delete operation.
            global $wpdb;
            // phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
            $wpdb->query(
                $wpdb->prepare(
                    "DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",
                    $wpdb->esc_like('_transient_typost_editor_data_') . '%',
                    $wpdb->esc_like('_transient_timeout_typost_editor_data_') . '%'
                )
            );
            // phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching

            // Flush object cache for transient group
            wp_cache_flush();
        }
    }

    /**
     * Handle post save: clear per-post and archive font detection caches.
     *
     * Clears stale font detection transients when post content changes,
     * ensuring the frontend re-detects fonts on the next page load.
     *
     * @since 1.1.9
     *
     * @param int     $post_id  Post ID.
     * @param WP_Post $_post    Post object. Unused but required by the save_post hook signature.
     * @param bool    $_update  Whether this is an update to an existing post. Unused but required by the hook.
     */
    public function on_post_save($post_id, $_post, $_update) {
        if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) {
            return;
        }

        if (wp_is_post_revision($post_id)) {
            return;
        }

        if (!in_array(get_post_status($post_id), array('publish', 'private'), true)) {
            return;
        }

        $this->clear_post_content_caches($post_id);
    }

    /**
     * Handle post deletion: clear per-post and archive font detection caches.
     *
     * @since 1.1.9
     *
     * @param int $post_id Post ID being deleted.
     */
    public function on_post_delete($post_id) {
        if (wp_is_post_revision($post_id)) {
            return;
        }

        $this->clear_post_content_caches($post_id);
    }

    /**
     * deleted_post handler: roll back Font Library registration fields when a
     * plugin-registered wp_font_family post is deleted (e.g. via the
     * Appearance > Font Library UI). CSS emission falls back to the
     * plugin-managed path on the next request.
     *
     * @since 2.1.0
     * @param int          $post_id Deleted post ID
     * @param WP_Post|null $post    Deleted post object
     */
    public function on_wp_font_family_deleted($post_id, $post = null) {
        if ($this->font_library_bridge()->handle_deleted_post($post_id, $post)) {
            $this->clear_cache();
        }
    }

    /**
     * Clear font detection caches related to a specific post.
     *
     * Removes per-post transients for styled content detection and used fonts,
     * plus all archive page caches (which cannot be targeted by post ID because
     * they use MD5 hashes of serialized post ID arrays as cache keys).
     *
     * Does NOT clear global font CSS caches (admin_font_css, editor_font_css,
     * block_font_css, css_variables) because those only change when fonts
     * themselves are added/removed/modified. Does NOT clear font_css_* caches
     * because they are keyed by font combination -- when a post's used fonts
     * change, a new cache key is generated automatically.
     *
     * @since 1.1.9
     * @access private
     *
     * @param int $post_id Post ID whose caches should be cleared.
     */
    private function clear_post_content_caches($post_id) {
        $post_id = absint($post_id);
        if (!$post_id) {
            return;
        }

        // Clear per-post transients (exact key, no wildcard needed)
        delete_transient('typost_has_styled_' . $post_id);
        delete_transient('typost_used_fonts_' . $post_id);
        wp_cache_delete('typost_has_styled_' . $post_id, 'transient');
        wp_cache_delete('typost_used_fonts_' . $post_id, 'transient');

        // Clear all archive page caches.
        // Archive cache keys use MD5(serialized post IDs), so we cannot target
        // specific archives containing this post. Wildcard delete is required.
        // Direct database call is required for bulk deletion of transients with wildcard patterns.
        // No caching needed as this is a delete operation.
        global $wpdb;
        // phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
        $wpdb->query(
            $wpdb->prepare(
                "DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s OR option_name LIKE %s OR option_name LIKE %s",
                $wpdb->esc_like('_transient_typost_has_styled_archive_') . '%',
                $wpdb->esc_like('_transient_timeout_typost_has_styled_archive_') . '%',
                $wpdb->esc_like('_transient_typost_used_fonts_archive_') . '%',
                $wpdb->esc_like('_transient_timeout_typost_used_fonts_archive_') . '%'
            )
        );
        // phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching

        // Flush object cache to clear archive transients stored in persistent cache (Redis, Memcached)
        wp_cache_flush();
    }

    /**
     * Get upload directory for fonts
     */
    public function get_fonts_upload_dir() {
        $upload_dir = wp_upload_dir();
        $font_dir = $upload_dir['basedir'] . '/typography-stylist/fonts';
        $font_url = $upload_dir['baseurl'] . '/typography-stylist/fonts';

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

                // Kit grouping fields (present on all kit uploads)
                if (isset($font['kit_id'])) {
                    $sanitized_font['kit_id'] = sanitize_key($font['kit_id']);
                }
                if (isset($font['kit_name'])) {
                    $sanitized_font['kit_name'] = sanitize_text_field($font['kit_name']);
                }
                if (isset($font['available_weights']) && is_array($font['available_weights'])) {
                    $sanitized_font['available_weights'] = array_map('sanitize_text_field', $font['available_weights']);
                }

                // WP Font Library registration fields (@since 2.1.0)
                if (!empty($font['wp_slug'])) {
                    $sanitized_font['wp_slug'] = sanitize_title($font['wp_slug']);
                }
                if (!empty($font['wp_post_id'])) {
                    $sanitized_font['wp_post_id'] = absint($font['wp_post_id']);
                }
                if (!empty($font['wp_registered_date'])) {
                    $sanitized_font['wp_registered_date'] = sanitize_text_field($font['wp_registered_date']);
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
                $allow_variable = get_option('typost_allow_variable_weights', false);

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
            $font_entries = $this->process_font_kit_zip($uploaded_file, $kit_name);

            if (is_wp_error($font_entries)) {
                return $font_entries;
            }

            // Add all font entries from the kit
            $fonts = $this->get_custom_fonts();
            foreach ($font_entries as $font_entry) {
                $fonts[] = $font_entry;
            }
            update_option('typost_custom_fonts', $fonts);

            // Clear cache
            $this->clear_cache();

            // Auto-register new fonts in the WP Font Library (WP 6.5+).
            // Runs before typost_font_uploaded fires so extension hooks see
            // entries that already carry their wp_slug/wp_post_id fields.
            if ($this->font_library_bridge()->auto_register_enabled()) {
                $registered_any = false;
                $updated_entries = array();
                foreach ($font_entries as $font_entry) {
                    $registered = $this->font_library_bridge()->register_font($font_entry);
                    if (is_array($registered)) {
                        $updated = $this->font_sources()->update_custom_font_entry($font_entry['id'], array(
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
                    $this->clear_cache();
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
                'warnings' => $this->get_font_kit_warnings()
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
            $this->font_library_bridge()->unregister_font($font_to_delete);
            $fonts = $this->get_custom_fonts(); // re-read: the watcher may have cleared wp_* fields
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
        $this->clear_cache();

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
     * Process uploaded font kit ZIP file
     *
     * Kits normally contain a stylesheet with @font-face rules. Since 2.1.0,
     * kits with no usable CSS (e.g. bare Google Fonts downloads) are also
     * accepted: a stylesheet is generated from the font binaries' metadata
     * (see generate_css_from_fonts()) and the normal pipeline runs on it.
     * Non-fatal warnings from that path are exposed via
     * get_font_kit_warnings(); the return contract is unchanged.
     *
     * @param array  $uploaded_file The $_FILES-style upload array.
     * @param string $kit_name      User-provided kit name.
     * @return array|WP_Error Array of per-family font entries, or WP_Error.
     */
    public function process_font_kit_zip($uploaded_file, $kit_name) {
        $this->font_kit_warnings = array();

        // Create unique kit ID and directory
        $kit_id = 'kit-' . time() . '-' . wp_generate_password(8, false);
        $upload_dir = wp_upload_dir();
        $kit_base_path = $upload_dir['basedir'] . '/typography-stylist/fonts/' . $kit_id;
        $kit_base_url = $upload_dir['baseurl'] . '/typography-stylist/fonts/' . $kit_id;

        // Create directory
        if (!wp_mkdir_p($kit_base_path)) {
            return new WP_Error('mkdir_failed', esc_html__('Failed to create upload directory', 'typography-stylist'));
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
            return new WP_Error('unzip_failed', esc_html__('Failed to extract ZIP file. Please ensure the file is a valid ZIP archive.', 'typography-stylist'), array('status' => 400));
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
                esc_html__('Failed to process font kit. The archive may be corrupted.', 'typography-stylist')
            );
        }

        if (empty($css_files)) {
            // Bare-font kit (e.g. a Google Fonts download): generate the
            // stylesheet from the font binaries' metadata, then let the
            // normal CSS pipeline below run unchanged.
            $generated = $this->generate_css_from_fonts($kit_base_path, $wp_filesystem);
            if (is_wp_error($generated)) {
                $wp_filesystem->rmdir($kit_base_path, true);
                return $generated;
            }
            $css_files[] = $generated['path'];
            $this->font_kit_warnings = $generated['warnings'];
        }

        // Select the best CSS file (prioritizes actual font CSS over specimen/demo files)
        $css_file_path = $this->select_font_css_file($css_files, $kit_base_path, $wp_filesystem);

        if (is_wp_error($css_file_path)) {
            // CSS files exist but none contains @font-face (e.g. a stray
            // specimen/demo stylesheet): fall back to generating one from the
            // font binaries before giving up. A different filename is used in
            // case a non-font-face stylesheet.css is already present.
            if ($css_file_path->get_error_code() === 'no_font_face_css') {
                $filename = $wp_filesystem->exists($kit_base_path . '/stylesheet.css') ? 'typost-generated.css' : 'stylesheet.css';
                $generated = $this->generate_css_from_fonts($kit_base_path, $wp_filesystem, $filename);
                if (!is_wp_error($generated)) {
                    $css_file_path = $generated['path'];
                    $this->font_kit_warnings = $generated['warnings'];
                }
            }
            if (is_wp_error($css_file_path)) {
                $wp_filesystem->rmdir($kit_base_path, true);
                return $css_file_path;
            }
        }

        // Validate it's a real file, not a symlink
        if (!is_file($css_file_path) || is_link($css_file_path)) {
            $wp_filesystem->rmdir($kit_base_path, true);
            return new WP_Error('invalid_css', esc_html__('Invalid CSS file', 'typography-stylist'));
        }

        // Check CSS file size (max 1MB)
        $file_size = filesize($css_file_path);
        if ($file_size > 1024 * 1024) {
            $wp_filesystem->rmdir($kit_base_path, true);
            return new WP_Error('css_too_large', esc_html__('CSS file is too large (max 1MB)', 'typography-stylist'));
        }

        // Use WP Filesystem API
        $css_content = $wp_filesystem->get_contents($css_file_path);

        if ($css_content === false) {
            $wp_filesystem->rmdir($kit_base_path, true);
            return new WP_Error('css_read_error', esc_html__('Could not read CSS file', 'typography-stylist'));
        }

        // Validate it looks like CSS (basic check)
        if (!preg_match('/@font-face\s*\{/i', $css_content)) {
            $wp_filesystem->rmdir($kit_base_path, true);
            return new WP_Error('invalid_css', esc_html__('CSS file does not contain @font-face declarations', 'typography-stylist'));
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
            return new WP_Error('invalid_css', esc_html__('No valid @font-face declarations found after sanitization', 'typography-stylist'));
        }

        // Parse font families
        $font_faces = $this->parse_webfont_kit($css_content);

        if (empty($font_faces)) {
            // Clean up on failure
            $wp_filesystem->rmdir($kit_base_path, true);
            return new WP_Error('invalid_css', esc_html__('No valid @font-face rules found in CSS', 'typography-stylist'));
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
                'available_weights' => $this->derive_available_weights_from_faces($faces),
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
                esc_html__('Found %d CSS file(s) in the font kit, but none contain valid @font-face declarations. Please ensure the ZIP file contains a proper webfont stylesheet.', 'typography-stylist'),
                count($css_files)
            ),
            array(
                'status' => 400,
                'css_files_found' => $file_list
            )
        );
    }

    /**
     * Generate a stylesheet from the font binaries in a kit directory
     *
     * Used when an uploaded kit contains no usable CSS (e.g. a Google Fonts
     * download of bare font files). Reads family/weight/style metadata from
     * the binaries via Typost_Font_Metadata, writes the generated stylesheet
     * into the kit directory, and returns translated non-fatal warnings for
     * any file whose metadata had to be guessed from its filename.
     *
     * @since 2.1.0
     * @param string $kit_base_path Absolute path to the kit directory.
     * @param object $wp_filesystem WP_Filesystem instance.
     * @param string $filename      Stylesheet filename to write.
     * @return array|WP_Error array('path' => string, 'warnings' => string[]) on success.
     */
    private function generate_css_from_fonts($kit_base_path, $wp_filesystem, $filename = 'stylesheet.css') {
        $font_files = array();
        $font_extensions = array('woff', 'woff2', 'ttf', 'otf', 'eot');

        try {
            $iterator = new RecursiveDirectoryIterator($kit_base_path, RecursiveDirectoryIterator::SKIP_DOTS);
            foreach (new RecursiveIteratorIterator($iterator) as $file) {
                if ($file->isFile() && !$file->isLink() && in_array(strtolower($file->getExtension()), $font_extensions, true)) {
                    $font_files[] = $file->getPathname();
                }
            }
        } catch (Exception $e) {
            return new WP_Error(
                'iterator_failed',
                esc_html__('Failed to process font kit. The archive may be corrupted.', 'typography-stylist')
            );
        }

        sort($font_files); // Deterministic @font-face order regardless of filesystem order

        $result = Typost_Font_Metadata::generate_stylesheet($font_files, $kit_base_path);

        if (empty($result['css'])) {
            return new WP_Error(
                'no_css',
                esc_html__('No CSS file was found in the font kit, and no usable font files were found to generate one from.', 'typography-stylist'),
                array('status' => 400)
            );
        }

        $css_path = $kit_base_path . '/' . $filename;
        if (!$wp_filesystem->put_contents($css_path, $result['css'], FS_CHMOD_FILE)) {
            return new WP_Error(
                'css_write_failed',
                esc_html__('Could not write the generated stylesheet to the font kit directory.', 'typography-stylist')
            );
        }

        $warnings = array();
        foreach ($result['warnings'] as $warning) {
            // ZIP entries can carry hostile filenames (HTML, control chars);
            // these strings also leave through the REST response, where other
            // clients may not render them as safely as the admin UI does.
            $file = isset($warning['file']) ? sanitize_text_field($warning['file']) : '';
            if (isset($warning['code']) && $warning['code'] === 'woff2_filename_guess') {
                $warnings[] = sprintf(
                    /* translators: %s: font file name */
                    esc_html__('%s is a WOFF2 file, whose metadata cannot be read on the server — its font family and weight were guessed from the filename. Please review the generated font styles.', 'typography-stylist'),
                    $file
                );
            } else {
                $warnings[] = sprintf(
                    /* translators: %s: font file name */
                    esc_html__('Could not read font metadata from %s — its font family and weight were guessed from the filename. Please review the generated font styles.', 'typography-stylist'),
                    $file
                );
            }
        }

        return array(
            'path'     => $css_path,
            'warnings' => $warnings,
        );
    }

    /**
     * Get non-fatal warnings from the most recent font kit upload
     *
     * @since 2.1.0
     * @return string[] Translated warning messages (empty when none).
     */
    public function get_font_kit_warnings() {
        return $this->font_kit_warnings;
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
     * Convert absolute font URLs to relative URLs dynamically
     * Handles legacy fonts without needing migration
     */
    private function ensure_relative_font_urls($css_content) {
        return preg_replace_callback(
            "/url\s*\(\s*['\"]?([^)'\"\s]+)['\"]?\s*\)/i",
            function($matches) {
                $url = $matches[1];

                // Skip data URIs
                if (strpos($url, 'data:') === 0) {
                    return $matches[0];
                }

                // Only process absolute URLs (http://, https://) and protocol-relative URLs (//)
                // Skip everything else (relative paths like /path/to/font.woff, ../fonts/file.woff, etc.)
                if (!preg_match('/^(https?:)?\/\//', $url)) {
                    return $matches[0];
                }

                // Convert absolute to relative (extract path only)
                $parsed = parse_url($url);

                // If parsing fails or no path, keep original
                if ($parsed === false || !isset($parsed['path'])) {
                    return $matches[0];
                }

                // Build path with sanitized query string and fragment if present
                $path = $parsed['path'];

                // Add query string if present and safe (validate against injection)
                if (isset($parsed['query']) && $parsed['query'] !== '') {
                    // Allow only safe URL query characters (alphanumeric, dash, underscore, percent, equals, ampersand, dot)
                    if (preg_match('/^[a-zA-Z0-9_\-=&%.]+$/', $parsed['query'])) {
                        $path .= '?' . $parsed['query'];
                    }
                }

                // Add fragment if present and safe (common in font URLs like #iefix)
                if (isset($parsed['fragment']) && $parsed['fragment'] !== '') {
                    // Allow alphanumeric, dash, underscore (covers #iefix, #svg-id, etc.)
                    if (preg_match('/^[a-zA-Z0-9_\-]+$/', $parsed['fragment'])) {
                        $path .= '#' . $parsed['fragment'];
                    }
                }

                return "url('" . $path . "')";
            },
            $css_content
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

                // Convert relative to absolute, then extract path only (protocol-agnostic)
                $absolute_url = rtrim($base_url, '/') . '/' . ltrim($url, '/');
                $parsed = parse_url($absolute_url);

                // If parsing fails or no path, keep original
                if ($parsed === false || !isset($parsed['path'])) {
                    return $matches[0];
                }

                // Build relative URL with sanitized query string and fragment if present
                $relative_url = $parsed['path'];

                // Add query string if present and safe (validate against injection)
                if (isset($parsed['query']) && $parsed['query'] !== '') {
                    // Allow only safe URL query characters (alphanumeric, dash, underscore, percent, equals, ampersand, dot)
                    if (preg_match('/^[a-zA-Z0-9_\-=&%.]+$/', $parsed['query'])) {
                        $relative_url .= '?' . $parsed['query'];
                    }
                }

                // Add fragment if present and safe (common in font URLs like #iefix)
                if (isset($parsed['fragment']) && $parsed['fragment'] !== '') {
                    // Allow alphanumeric, dash, underscore (covers #iefix, #svg-id, etc.)
                    if (preg_match('/^[a-zA-Z0-9_\-]+$/', $parsed['fragment'])) {
                        $relative_url .= '#' . $parsed['fragment'];
                    }
                }

                return "url('" . $relative_url . "')";
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
        $font_dir = $upload_dir['basedir'] . '/typography-stylist/fonts';

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
        return $this->font_sources()->get_adobe_fonts();
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

                // Preserve key absence: entries without available_weights predate
                // weight detection and are candidates for the bulk detect action
                if (isset($font['available_weights']) && is_array($font['available_weights'])) {
                    $sanitized_font['available_weights'] = $this->sanitize_available_weights($font['available_weights']);
                }

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

                // Preserve user-saved weight selections (key absence preserved too)
                if (isset($font['available_weights']) && is_array($font['available_weights'])) {
                    $sanitized_font['available_weights'] = $this->sanitize_available_weights($font['available_weights']);
                }

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

        $css_faces = $this->parse_webfont_kit(wp_remote_retrieve_body($response));

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
                ? $this->derive_available_weights_from_faces($faces_by_slug[$family_slug])
                : array();
        }

        return $weights_by_slug;
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
        $custom_fonts = $this->get_custom_fonts();
        $custom_changed = false;
        foreach ($custom_fonts as $key => $font) {
            if (array_key_exists('available_weights', $font)) {
                continue;
            }
            $faces = isset($font['font_faces']) && is_array($font['font_faces']) ? $font['font_faces'] : array();
            $weights = $this->derive_available_weights_from_faces($faces);
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
        $adobe_fonts = $this->get_adobe_fonts();
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
            $this->clear_cache();
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
            return new WP_Error('missing_embed_code', esc_html__('Embed code is required', 'typography-stylist'), array('status' => 400));
        }

        // Parse embed code
        $parsed = $this->parse_adobe_fonts_code($params['embed_code']);
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
        $existing_fonts = $this->get_adobe_fonts();
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
            $composite_font_id = $kit_id . '-' . $family_slug;

            $font_entry = array(
                'id' => sanitize_key($composite_font_id),
                'name' => sanitize_text_field($family), // Use family name as font name
                'font_id' => $this->generate_font_id(),
                'font_family' => sanitize_text_field($family), // Single family per entry
                'kit_id' => sanitize_key($kit_id),       // Link back to original kit
                'kit_name' => sanitize_text_field($kit_name), // For display/grouping
                'css_url' => $parsed['css_url'],         // Same CSS URL for all fonts in kit
                'added_date' => current_time('mysql')
            );

            if ($detected_weights !== false && isset($detected_weights[$family_slug])) {
                $font_entry['available_weights'] = $detected_weights[$family_slug];
            }

            $font_entries[] = $font_entry;
        }

        // Add all font entries from the kit
        $fonts = $this->get_adobe_fonts();
        foreach ($font_entries as $font_entry) {
            $fonts[] = $font_entry;
        }
        update_option('typost_adobe_fonts', $fonts);

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
        $this->clear_cache();

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

        $fonts = $this->get_adobe_fonts();
        $found = false;

        foreach ($fonts as $key => $font) {
            if ($font['id'] === $id) {
                if (isset($params['fallbacks'])) {
                    $fonts[$key]['fallbacks'] = sanitize_text_field($params['fallbacks']);
                }
                if (isset($params['available_weights'])) {
                    $fonts[$key]['available_weights'] = $this->sanitize_available_weights($params['available_weights']);
                }
                $found = true;
                break;
            }
        }

        if (!$found) {
            return new WP_Error('font_not_found', esc_html__('Adobe Font not found', 'typography-stylist'), array('status' => 404));
        }

        update_option('typost_adobe_fonts', $fonts);
        $this->clear_cache();

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
            return new WP_Error('font_not_found', esc_html__('Adobe Font not found', 'typography-stylist'), array('status' => 404));
        }

        update_option('typost_adobe_fonts', $fonts);
        $this->clear_cache();

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

        $fonts = $this->get_custom_fonts();
        $found = false;

        foreach ($fonts as $key => $font) {
            if ($font['id'] === $id) {
                if (isset($params['fallbacks'])) {
                    $fonts[$key]['fallbacks'] = sanitize_text_field($params['fallbacks']);
                }
                if (isset($params['available_weights'])) {
                    $fonts[$key]['available_weights'] = $this->sanitize_available_weights($params['available_weights']);
                }
                $found = true;
                break;
            }
        }

        if (!$found) {
            return new WP_Error('font_not_found', esc_html__('Font not found', 'typography-stylist'), array('status' => 404));
        }

        update_option('typost_custom_fonts', $fonts);
        $this->clear_cache();

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
            return new WP_Error('font_not_found', esc_html__('Font not found', 'typography-stylist'), array('status' => 404));
        }

        update_option('typost_custom_fonts', $fonts);
        $this->clear_cache();

        do_action( 'typost_font_saved', $id, $fonts[$key], 'uploaded' );

        return rest_ensure_response(array('success' => true, 'font' => $fonts[$key]));
    }

    /**
     * Find an uploaded-kit font entry by its string entry ID
     *
     * @since 2.1.0
     * @param string $entry_id
     * @return array|null
     */
    private function find_custom_font_entry($entry_id) {
        foreach ($this->get_custom_fonts() as $font) {
            if (isset($font['id']) && $font['id'] === $entry_id) {
                return $font;
            }
        }
        return null;
    }

    /**
     * REST endpoint: Register an uploaded font in the WP Font Library
     *
     * @since 2.1.0
     * @param WP_REST_Request $request
     * @return WP_REST_Response|WP_Error
     */
    public function register_font_in_library_endpoint($request) {
        if (!$this->font_library_bridge()->is_available()) {
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

        $registered = $this->font_library_bridge()->register_font($entry);

        if (!is_array($registered)) {
            return new WP_Error(
                'registration_failed',
                esc_html__('The font could not be registered in the Font Library. It remains fully functional as a plugin-managed font.', 'typography-stylist'),
                array('status' => 500)
            );
        }

        $updated = $this->font_sources()->update_custom_font_entry($id, array(
            'wp_slug'            => $registered['slug'],
            'wp_post_id'         => $registered['post_id'],
            'wp_registered_date' => current_time('mysql'),
        ));
        $this->clear_cache();

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
        $removed = $this->font_library_bridge()->unregister_font($entry);
        if (!$removed) {
            $this->font_sources()->update_custom_font_entry($id, array(
                'wp_slug'            => null,
                'wp_post_id'         => null,
                'wp_registered_date' => null,
            ));
        }
        $this->clear_cache();

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
        if (!$this->font_library_bridge()->is_available()) {
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

        foreach ($this->get_custom_fonts() as $entry) {
            if (!isset($entry['id'])) {
                continue;
            }
            if ($this->font_library_bridge()->entry_has_live_registration($entry)) {
                $results['skipped'][] = $entry['id'];
                continue;
            }

            $registered = $this->font_library_bridge()->register_font($entry);
            if (is_array($registered)) {
                $this->font_sources()->update_custom_font_entry($entry['id'], array(
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
            $this->clear_cache();
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

        $entry = $this->font_library_bridge()->adopt_library_font($slug);

        if (!is_array($entry)) {
            return new WP_Error('font_not_found', esc_html__('Font not found in the WordPress Font Library.', 'typography-stylist'), array('status' => 404));
        }

        $this->clear_cache();

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
            return new WP_Error('missing_data', esc_html__('Name and font family are required', 'typography-stylist'), array('status' => 400));
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
        update_option('typost_manual_fonts', $fonts);

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
        $this->clear_cache();

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

        $fonts = $this->get_manual_fonts();
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
                    $fonts[$key]['available_weights'] = $this->sanitize_available_weights($params['available_weights']);
                }
                $found = true;
                break;
            }
        }

        if (!$found) {
            return new WP_Error('font_not_found', esc_html__('Manual font not found', 'typography-stylist'), array('status' => 404));
        }

        update_option('typost_manual_fonts', $fonts);
        $this->clear_cache();

        /** This action is documented in typography-stylist.php update_adobe_font_fallback_endpoint */
        do_action( 'typost_font_saved', $id, $fonts[$key], 'manual' );

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

            // Merge fonts forced by the typost_force_enqueue_font_ids filter
            // (theme CSS may reference an Adobe font's --font-N variable)
            $forced_font_ids = $this->get_forced_font_ids();
            if (!empty($forced_font_ids)) {
                $used_font_ids = array_values(array_unique(array_merge(
                    $used_font_ids,
                    $this->resolve_used_font_replacements($forced_font_ids)
                )));
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
                'typost-adobe-' . $handle_id,
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
            return new WP_Error('missing_params', __('Missing required parameters.', 'typography-stylist'), array('status' => 400));
        }

        $success = $this->add_font_replacement((int) $deleted_id, (int) $replacement_id, (bool) $global_load);

        if ($success === false) {
            return new WP_Error('invalid_id', __('Invalid font ID (0). Font IDs must be greater than 0.', 'typography-stylist'), array('status' => 400));
        }

        if ($success) {
            return rest_ensure_response(array('success' => true, 'replacements' => $this->get_font_replacements()));
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

        $success = $this->add_font_replacement((int) $deleted_id, (int) $replacement_id, (bool) $global_load);

        if ($success === false) {
            return new WP_Error('invalid_id', __('Invalid font ID (0). Font IDs must be greater than 0.', 'typography-stylist'), array('status' => 400));
        }

        if ($success) {
            return rest_ensure_response(array('success' => true, 'replacements' => $this->get_font_replacements()));
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

        $success = $this->remove_font_replacement((int) $deleted_id);

        if ($success) {
            return rest_ensure_response(array('success' => true));
        }

        return new WP_Error('failed', __('Failed to delete font replacement.', 'typography-stylist'), array('status' => 500));
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
        return $this->font_sources()->get_font_replacements();
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
        return $this->font_sources()->generate_font_id();
    }

    /**
     * Get all font IDs currently in use
     *
     * @return array Array of all active font IDs
     */
    private function get_all_active_font_ids() {
        return $this->font_sources()->get_all_active_font_ids();
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
    /**
     * Get font IDs that must always be loaded on the frontend
     *
     * Applies the typost_force_enqueue_font_ids filter, which lets themes and
     * extensions force @font-face and --font-N variable loading for fonts that
     * are referenced only from theme/extension CSS and are therefore invisible
     * to the post-content scan (e.g. a theme assigning fonts per color scheme).
     *
     * The result is memoized for the request because it feeds transient cache
     * keys — filter callbacks must return stable output within a request.
     *
     * @since 2.1.0
     * @return array Unique positive integer font IDs
     */
    public function get_forced_font_ids() {
        if (null === $this->forced_font_ids) {
            $ids = apply_filters('typost_force_enqueue_font_ids', array());
            if (!is_array($ids)) {
                $ids = array();
            }
            $ids = array_map('intval', $ids);
            $ids = array_filter($ids, function ($id) {
                return $id > 0;
            });
            $this->forced_font_ids = array_values(array_unique($ids));
        }
        return $this->forced_font_ids;
    }

    private function resolve_used_font_replacements($used_font_ids) {
        return $this->font_sources()->resolve_used_font_replacements($used_font_ids);
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

        $this->font_sources()->save_font_replacements($replacements);
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

        $this->font_sources()->save_font_replacements($replacements);
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
        $cache_key = 'typost_css_variables';
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
                $fallback = !empty($font['fallbacks']) ? ', ' . $this->sanitize_css_value($font['fallbacks']) : '';

                // Fonts registered in the WP Font Library alias to the
                // slug-based preset variable, with the literal family as the
                // var() fallback so contexts without preset variables (plain
                // admin pages) and stale registrations still render.
                if ($this->font_library_bridge()->entry_has_live_registration($font)) {
                    $css_vars[] = sprintf(
                        '--font-%d: var(--wp--preset--font-family--%s, "%s"%s)',
                        $font['font_id'],
                        sanitize_title($font['wp_slug']),
                        $family,
                        $fallback
                    );
                    continue;
                }

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
                    $fallback = !empty($font['fallbacks']) ? ', ' . $this->sanitize_css_value($font['fallbacks']) : '';
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

        // Process adopted WP Font Library fonts: alias to the slug-based
        // preset variable with the literal family as fallback (covers plain
        // admin pages and fonts later removed from the Library)
        $adopted_fonts = $this->font_sources()->get_adopted_wp_fonts();
        foreach ($adopted_fonts as $font) {
            if (isset($font['font_id']) && !empty($font['wp_slug']) && !empty($font['font_family'])) {
                $family = $this->sanitize_css_value($font['font_family']);
                $css_vars[] = sprintf(
                    '--font-%d: var(--wp--preset--font-family--%s, %s)',
                    $font['font_id'],
                    sanitize_title($font['wp_slug']),
                    $family
                );
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
     * Note: Serves the frontend (wp_head) and plain admin pages / editor
     * parent document (admin_head) via a directly echoed style element. The
     * iframed editor canvas is served separately by the typost-block-fonts
     * handle in enqueue_custom_fonts_for_blocks() — admin_head output never
     * reaches the iframe document.
     */
    public function output_font_css_variables() {
        // Only output in appropriate contexts
        if (!is_admin() && !$this->has_styled_content()) {
            $replacements = $this->get_font_replacements();
            // Check if any replacements are set to global load, or any fonts
            // are forced by the typost_force_enqueue_font_ids filter (theme
            // CSS needs the --font-N definitions even without styled content)
            if (empty($replacements['global_load']) && empty($this->get_forced_font_ids())) {
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
            // Direct style output covers the frontend (wp_head p5, before
            // stylesheets are printed) and plain admin pages / the editor
            // PARENT document (admin_head). It never reaches the iframed
            // editor canvas (WP 6.3+): admin_head does not fire inside the
            // iframe. The canvas gets the same variables via the
            // typost-block-fonts handle enqueued on enqueue_block_assets
            // (see enqueue_custom_fonts_for_blocks()), which WordPress
            // mirrors into the iframe. In legacy non-iframed editors both
            // land in one document; the duplicate identical :root block is
            // harmless.
            // Output is sanitized via sanitize_output_css() and wp_kses()
            // phpcs:ignore WordPress.WP.EnqueuedResources.NonEnqueuedStylesheet
            echo wp_kses("<style id=\"typost-font-variables\">\n" . $css . "\n</style>\n", $allowed_css);
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
                // Normalize path to prevent traversal attacks (e.g., /malicious/../wp-content/uploads/typography-stylist/fonts/)
                $normalized_path = preg_replace('#/+#', '/', $url_path); // Collapse multiple slashes
                $normalized_path = preg_replace('#/\.\./|/\./#', '/', $normalized_path); // Remove . and ..

                if (strpos($normalized_path, '/wp-content/uploads/typography-stylist/fonts/') === false) {
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
     * Sanitize available font weights
     *
     * Validates and filters an array of font weight values against the standard
     * CSS font-weight scale (100-900). Returns empty array if all 9 weights are
     * provided (meaning "all weights available").
     *
     * @since 2.0.0
     *
     * @param mixed $weights Input weights array.
     * @return array Sanitized array of weight strings, or empty array for "all weights".
     */
    private function sanitize_available_weights($weights) {
        if (!is_array($weights)) {
            return array();
        }

        $allowed = array('100', '200', '300', '400', '500', '600', '700', '800', '900');
        $sanitized = array_values(array_intersect(
            array_map('sanitize_text_field', $weights),
            $allowed
        ));

        // If all 9 weights selected, store empty array (= "all weights available")
        if (count($sanitized) === 9) {
            return array();
        }

        sort($sanitized);
        return $sanitized;
    }

    /**
     * Derive the available weights for a font from its parsed @font-face data
     *
     * Thin delegating wrapper — the logic lives in Typost_Font_Sources so the
     * Font Library bridge can share it at adoption time.
     *
     * @since 2.1.2
     *
     * @param array $font_faces Parsed font faces, each optionally carrying a 'weight' key.
     * @return array Sorted array of weight strings, or empty array for "all weights".
     */
    private function derive_available_weights_from_faces(array $font_faces) {
        return $this->font_sources()->derive_available_weights_from_faces($font_faces);
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
            wp_die(esc_html__('You do not have sufficient permissions to access this page.', 'typography-stylist'));
        }

        // Save settings (with proper sanitization)
        if (isset($_POST['typost_save_settings']) &&
            check_admin_referer('typost_settings_nonce') &&
            current_user_can('manage_options')) {

            // Use proper sanitization via registered settings
            if (isset($_POST['typost_presets'])) {
                $sanitized = $this->sanitize_presets(wp_unslash($_POST['typost_presets'])); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
                update_option('typost_presets', $sanitized);

                // Clear cache
                $this->clear_cache();

                echo '<div class="notice notice-success"><p>' .
                     esc_html__('Settings saved successfully.', 'typography-stylist') .
                     '</p></div>';
            }
        }

        // Handle manual cache clear (separate form with dedicated nonce)
        if (isset($_POST['typost_clear_cache']) &&
            check_admin_referer('typography_stylist_clear_cache_nonce') &&
            current_user_can('manage_options')) {

            $this->clear_cache();

            echo '<div class="notice notice-success"><p>' .
                 esc_html__('Font cache cleared successfully. Fonts will be re-detected on the next page load.', 'typography-stylist') .
                 '</p></div>';
        }

        // Save options settings
        if (isset($_POST['typost_save_options_settings']) &&
            check_admin_referer('typography_stylist_options_settings_nonce') &&
            current_user_can('manage_options')) {

            // Get previous value to detect changes
            $previous_show_clear_confirmation = (bool) get_option('typost_show_clear_confirmation', true);
            $show_clear_confirmation = isset($_POST['typost_show_clear_confirmation']) ? '1' : '0';
            update_option('typost_show_clear_confirmation', $show_clear_confirmation);

            // Save variable weight setting
            $allow_variable = isset($_POST['typost_allow_variable_weights']) ? '1' : '0';
            update_option('typost_allow_variable_weights', $allow_variable);

            // Save archive full content check setting
            $archive_check = isset($_POST['typost_archive_full_content_check']) ? '1' : '0';
            update_option('typost_archive_full_content_check', $archive_check);

            // Save Enter-key behaviour for the Typography Stylist block
            $enter_line_break = isset($_POST['typost_block_enter_line_break']) ? '1' : '0';
            update_option('typost_block_enter_line_break', $enter_line_break);

            // Save WP Font Library auto-register setting (checkbox rendered
            // only when the Font Library is available)
            if ($this->font_library_bridge()->is_available()) {
                $auto_register = isset($_POST['typost_auto_register_wp_fonts']) ? '1' : '0';
                update_option('typost_auto_register_wp_fonts', $auto_register);
            }

            // Save extension-registered checkbox options (see typost_admin_options_rows).
            // A full form POST always carries every rendered checkbox, so an
            // absent field genuinely means unchecked here.
            foreach ($this->get_extension_option_checkboxes() as $option_key) {
                update_option($option_key, isset($_POST[$option_key]) ? '1' : '0');
            }

            // Save color scheme setting
            $color_scheme = isset($_POST['typost_admin_color_scheme'])
                ? sanitize_key(wp_unslash($_POST['typost_admin_color_scheme']))
                : 'default';
            update_option('typost_admin_color_scheme', $this->sanitize_color_scheme($color_scheme));

            // Clear cache for all users when options change
            // Archive content check changes require cache refresh to take effect
            $this->clear_cache();

            echo '<div class="notice notice-success"><p>' .
                 esc_html__('Options saved successfully.', 'typography-stylist') .
                 '</p></div>';
        }

        // Save accessibility settings
        if (isset($_POST['typost_save_accessibility_settings']) &&
            check_admin_referer('typography_stylist_accessibility_settings_nonce') &&
            current_user_can('manage_options')) {

            // Store checkbox values explicitly as '1' (enabled) or '0' (disabled)
            $enable_aria = isset($_POST['typost_enable_aria_labels']) ? '1' : '0';
            update_option('typost_enable_aria_labels', $enable_aria);

            $disable_warning = isset($_POST['typost_disable_accessibility_warning']) ? '1' : '0';
            update_option('typost_disable_accessibility_warning', $disable_warning);

            // Clear cache when accessibility settings change
            $this->clear_cache();

            echo '<div class="notice notice-success"><p>' .
                 esc_html__('Accessibility settings saved successfully.', 'typography-stylist') .
                 '</p></div>';
        }

        // Prepare template data
        $template_data = array(
            'instance' => $this,
            'presets' => $this->get_presets(),
            'custom_fonts' => get_option('typost_custom_fonts', array()),
            'adobe_fonts' => $this->get_adobe_fonts(),
            'manual_fonts' => $this->get_manual_fonts(),
        );

        // Include template file and render (include_once: the admin refresh
        // REST endpoint loads the same file for its fragment renderers)
        include_once TYPOST_PLUGIN_DIR . 'includes/admin-page.php';
        typost_render_admin_template(
            $template_data['instance'],
            $template_data['presets'],
            $template_data['custom_fonts'],
            $template_data['adobe_fonts'],
            $template_data['manual_fonts']
        );
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
 * @return Typost The plugin instance.
 */
function typost_init() {
    $instance = Typost::get_instance();

    // Load the bundled Glyphs Panel module (integrated into core in v2.0).
    // Guarded so a still-active standalone copy of the former extension wins
    // gracefully instead of triggering a fatal class redeclare.
    if ( ! class_exists( 'Typost_Glyphs_Panel' ) ) {
        require_once TYPOST_PLUGIN_DIR . 'glyphs-panel/glyphs-panel.php';
        Typost_Glyphs_Panel::get_instance();
    }

    // Load the Variable Fonts module (added in v2.1).
    // Same guard pattern: the final class must never fatally redeclare if
    // this file is reached twice.
    if ( ! class_exists( 'Typost_Variable_Fonts' ) ) {
        require_once TYPOST_PLUGIN_DIR . 'variable-fonts/variable-fonts.php';
        Typost_Variable_Fonts::get_instance();
    }

    // Load the Paragraph Styles module (integrated into core in v2.3).
    // Guarded so a still-active standalone copy of the former extension wins
    // gracefully instead of triggering a fatal class redeclare.
    if ( ! class_exists( 'Typost_Paragraph_Styles' ) ) {
        require_once TYPOST_PLUGIN_DIR . 'paragraph-styles/paragraph-styles.php';
        Typost_Paragraph_Styles::get_instance();
    }

    return $instance;
}

// Start plugin
add_action('plugins_loaded', 'typost_init');

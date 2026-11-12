<?php
/**
 * Plugin Name: Typography Stylist
 * Plugin URI: https://wordpress.org/plugins/typography-stylist/
 * Description: Add advanced OpenType features (ligatures, stylistic sets, swashes) to headlines with inline text selection and live preview.
 * Version: 2.3.6
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
    define('TYPOST_VERSION', '2.3.6');
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
require_once __DIR__ . '/includes/class-typost-export-fonts.php';
require_once __DIR__ . '/includes/class-typost-export.php';
require_once __DIR__ . '/includes/class-typost-admin-options.php';
require_once __DIR__ . '/includes/class-typost-export-settings.php';

// Services split out of the Typost class (#360); Typost delegates to them
require_once __DIR__ . '/includes/class-typost-rest-controller.php';
require_once __DIR__ . '/includes/class-typost-font-kit-upload.php';
require_once __DIR__ . '/includes/class-typost-assets.php';

/**
 * Main plugin class
 */
class Typost {

    /**
     * CSS properties the plugin writes into post content that WordPress's
     * kses CSS filter (safecss_filter_attr()) does not allow by default (#277).
     * Every other property the editors write (font-family, font-weight,
     * font-style, font-size, letter-spacing, line-height, text-align,
     * text-transform, vertical-align and the --typost-* custom properties) is
     * already on the list. Features and axes need WordPress 7.0.1 or later
     * as well; see allow_typography_css_properties().
     *
     * @since 2.3.3
     * @var string[]
     */
    const SAFE_CSS_PROPERTIES = array(
        'font-feature-settings',
        'font-variation-settings',
        'font-variant-caps',
        'font-synthesis-small-caps',
    );

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
     * Font subsystem modules (lazily instantiated)
     * @since 2.1.0
     */
    private $font_sources = null;
    private $font_library_bridge = null;
    private $export = null;

    /**
     * Services split out of this class (lazily instantiated: tests build
     * Typost without its constructor)
     * @since 2.4.0
     */
    private $rest_controller = null;
    private $font_kit_upload = null;
    private $assets = null;

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
     * Hook suffix of the Settings → Typography Stylist page (set in
     * add_admin_menu(), matched in maybe_enqueue_admin_assets()).
     * @since 2.3.1
     */
    private $admin_page_hook = '';

    /**
     * Font references in the post open in the block editor (memoized per
     * request: enqueue_adobe_fonts() runs for the canvas and the editor page).
     * @since 2.3.1
     */
    private $editor_used_fonts = null;

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
     * Get the export and import module (#205)
     *
     * @since 2.3.5
     * @return Typost_Export
     */
    public function export() {
        if (null === $this->export) {
            $this->export = new Typost_Export($this);
        }
        return $this->export;
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
     * Get the REST controller (routes, handlers, write-request rate limit)
     *
     * Private: the public API stays on this class, whose route callbacks and
     * check_permissions() delegate here.
     *
     * @since 2.4.0
     * @return Typost_Rest_Controller
     */
    private function rest_controller() {
        if (null === $this->rest_controller) {
            $this->rest_controller = new Typost_Rest_Controller($this);
        }
        return $this->rest_controller;
    }

    /**
     * Get the font kit ZIP processor
     *
     * Private: process_font_kit_zip(), get_font_kit_warnings() and
     * rewrite_css_urls() on this class delegate here.
     *
     * @since 2.4.0
     * @return Typost_Font_Kit_Upload
     */
    private function font_kit_upload() {
        if (null === $this->font_kit_upload) {
            $this->font_kit_upload = new Typost_Font_Kit_Upload($this);
        }
        return $this->font_kit_upload;
    }

    /**
     * Get the editor, canvas and admin asset enqueuer
     *
     * Private: the enqueue methods on this class, which stay hooked here,
     * delegate to it.
     *
     * @since 2.4.0
     * @return Typost_Assets
     */
    private function assets() {
        if (null === $this->assets) {
            $this->assets = new Typost_Assets($this);
        }
        return $this->assets;
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

        // A family installed or edited in the Font Library must reach the
        // editor picker on the next load, not when the hourly localized-data
        // transient expires (QA 2026-09 E-16); a face added to an adopted
        // family must reach the printed @font-face CSS the same way.
        add_action('save_post_wp_font_family', array($this, 'on_wp_font_family_saved'), 10, 3);
        add_action('save_post_wp_font_face', array($this, 'on_wp_font_face_saved'), 10, 3);

        // Output CSS variables for fonts
        add_action('wp_head', array($this, 'output_font_css_variables'), 5);
        add_action('admin_head', array($this, 'output_font_css_variables'), 5);

        // Add admin menu
        add_action('admin_menu', array($this, 'add_admin_menu'));

        // Export & Import tab (#205)
        add_filter('typost_admin_tabs', array($this->export(), 'register_admin_tab'));
        add_action('typost_admin_tab_content_export', array($this->export(), 'render_admin_tab'));
        add_action('typost_admin_assets', array($this->export(), 'enqueue_admin_assets'));
        add_filter('typost_export_sections', array(new Typost_Export_Settings($this), 'register_sections'));

        // Register settings
        add_action('admin_init', array($this, 'register_settings'));

        // Process color scheme save early (before admin_enqueue_scripts)
        // so inline CSS matches the newly-selected scheme on the save request
        add_action('admin_init', array($this, 'early_save_color_scheme'));

        // Ensure .htaccess exists for existing installations
        add_action('admin_init', array($this, 'maybe_create_htaccess'), 1);

        // Repair Font Library posts registered before #310, once
        add_action('admin_init', array($this, 'maybe_repair_font_library_json'));

        // Add REST API endpoints
        add_action('rest_api_init', array($this, 'register_rest_routes'));
        add_filter('rest_dispatch_request', array($this, 'enforce_rest_rate_limit'), 10, 4);

        // Register custom block
        add_action('init', array($this, 'register_block'));

        // Keep the plugin's CSS when kses filters a post (#277)
        add_filter('safe_style_css', array($this, 'allow_typography_css_properties'));

        // Let the plain typography switch keep hung fit lines inside the block (#315)
        add_filter('render_block', array($this, 'add_fit_line_plain_properties'), 10, 2);

        // Write the block's sidebar settings to its wrapper at render time
        add_filter('render_block', array($this, 'add_block_support_attributes'), 10, 2);

        // Load translations.
        //
        // On WordPress 6.7+ just-in-time loading already finds the bundled
        // languages/ directory, so this is belt-and-braces there — verified by
        // forcing the locale and watching the domain load on the first __()
        // call. It matters for the older versions this plugin still supports:
        // before the textdomain registry learned to discover plugin language
        // directories, just-in-time loading looked only in
        // wp-content/languages/plugins/, and a bundled .mo was never opened
        // without this call. The three bundled modules each make it too.
        add_action('init', array($this, 'load_textdomain'));

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
     * Repair the JSON of Font Library posts registered before #310
     *
     * Runs on an admin request by a user who can manage options (the
     * capability that registration itself requires) until a run has no
     * failed rewrite. The repair skips posts that need none, so a retry only
     * touches the posts that failed. See
     * Typost_Font_Library_Bridge::repair_registered_font_json().
     *
     * @since 2.3.4
     */
    public function maybe_repair_font_library_json() {
        if (get_option('typost_font_library_json_repaired', false) || !current_user_can('manage_options')) {
            return;
        }

        $counts = $this->font_library_bridge()->repair_registered_font_json();

        // Without the Font Library (WordPress before 6.5) the repair finds
        // nothing and the flag is stored: registration needs the Library,
        // so such a site has no registered posts to repair
        if (0 === $counts['failed']) {
            update_option('typost_font_library_json_repaired', true, false);
        }
    }

    /**
     * Enqueue block assets (loads in both editor iframe and frontend)
     * This hook fires for both editor and frontend
     *
     * Delegates to Typost_Assets::enqueue_block_assets().
     */
    public function enqueue_block_assets() {
        return $this->assets()->enqueue_block_assets();
    }

    /**
     * Enqueue block editor assets (toolbar, popover, etc.)
     *
     * Delegates to Typost_Assets::enqueue_block_editor_assets().
     */
    public function enqueue_block_editor_assets() {
        return $this->assets()->enqueue_block_editor_assets();
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

                // Content that references fonts only through an extension's own
                // markup (typost_content_font_ids) carries neither marker, yet
                // still needs the font assets. Ask before deciding "no".
                $has_extension_fonts = (!$has_styled_class && !$has_typost_block)
                    && $this->content_references_extension_fonts($raw_content . ' ' . $rendered_content);

                $has_styled = ($has_styled_class || $has_typost_block || $has_extension_fonts) ? 'yes' : 'no';

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

                    // Fonts referenced only through an extension's own markup
                    if ($this->content_references_extension_fonts($content_to_check . ' ' . $rendered_content)) {
                        $has_styled = 'yes';
                        break;
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

                // Method 5: Fonts referenced indirectly (paragraph style classes, extensions)
                $this->collect_extension_font_ids($content_to_check, $used_fonts);

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

                    // Method 5: Fonts referenced indirectly (paragraph style classes, extensions)
                    $this->collect_extension_font_ids($combined_content, $used_fonts);
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

                    // Fonts referenced indirectly (paragraph style ids on spans)
                    $this->collect_extension_font_ids($content, $fonts);
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
     *
     * Covers uploaded kits and adopted WP Font Library fonts. An adopted
     * font is always conditional (loaded only when its font_id is used or
     * forced), and its @font-face is printed by the plugin only when
     * WordPress will not print it (installed but not activated in global
     * styles) — see get_adopted_fonts_to_print().
     */
    public function enqueue_custom_fonts_optimized() {
        $all_fonts = $this->get_custom_fonts();
        $adopted_fonts = $this->get_adopted_fonts_for_face_printing();

        if (empty($all_fonts) && empty($adopted_fonts)) {
            return;
        }

        // Check if we need to scan content for used fonts
        $has_conditional_fonts = !empty($adopted_fonts);
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

        // Adopted Library fonts in use on this page whose faces WordPress
        // will NOT print (installed, not activated): the plugin builds their
        // @font-face from the family's wp_font_face posts. Their slugs are
        // part of the cache key so activating one later can't serve stale CSS.
        $adopted_to_print = $this->get_adopted_fonts_to_print($adopted_fonts, $used_font_ids);
        $adopted_face_slugs = wp_list_pluck($adopted_to_print, 'wp_slug');

        // Build cache key including load_on_all_pages settings
        $load_settings = array();
        foreach ($all_fonts as $font) {
            $font_id = isset($font['id']) ? $font['id'] : '';
            $load_settings[$font_id] = !empty($font['load_on_all_pages']);
        }
        $cache_key = $this->get_font_css_cache_key($used_font_families, $used_font_ids, $load_settings, $library_printed_ids, $adopted_face_slugs);
        $combined_css = get_transient($cache_key);

        if (false === $combined_css) {
            $combined_css = '';

            // Adopted Library fonts first: their rules are already sanitized
            // and their src URLs may live outside this site, so they skip the
            // kit-only ensure_relative_font_urls() pass below.
            $combined_css .= $this->get_adopted_font_face_css($adopted_to_print);

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
     * @param array $adopted_face_slugs   Slugs of adopted Library fonts whose
     *                                    @font-face the plugin prints itself
     *                                    (in use on the page and not printed
     *                                    by WordPress); since 2.3.0
     * @return string Transient key
     */
    private function get_font_css_cache_key($used_font_families, $used_font_ids, $load_settings, $library_printed_ids = array(), $adopted_face_slugs = array()) {
        $used_font_ids = array_map('intval', (array) $used_font_ids);
        sort($used_font_ids);
        $used_font_families = array_map('strval', (array) $used_font_families);
        sort($used_font_families);
        $library_printed_ids = array_map('intval', (array) $library_printed_ids);
        sort($library_printed_ids);
        $adopted_face_slugs = array_values(array_unique(array_map('strval', (array) $adopted_face_slugs)));
        sort($adopted_face_slugs);
        $key_input = serialize($used_font_families) . serialize($used_font_ids) . serialize($load_settings) . serialize($library_printed_ids);
        if (!empty($adopted_face_slugs)) {
            // Appended only when present so keys for pages without adopted
            // fonts are unchanged from 2.2.x. The face version rotates every
            // key that carries adopted faces when a wp_font_face post is saved
            // (on_wp_font_face_saved()), instead of a wildcard delete + flush.
            $key_input .= serialize($adopted_face_slugs) . '|' . (string) get_option('typost_font_face_version', '0');
        }
        return 'typost_font_css_' . md5($key_input);
    }

    /**
     * Adopted WP Font Library fonts whose @font-face the plugin may need to
     * print itself
     *
     * Excludes adopted entries that share a font_id or slug with an uploaded
     * kit: adopt_library_font() reuses the kit's font_id when the slug
     * belongs to a plugin-registered family, and those faces already print
     * through the kit path (double-printing would be harmless but wasteful).
     * Entries without a slug cannot be resolved to face posts and are
     * skipped too.
     *
     * @since 2.3.0
     * @return array[] Adopted entries ({id, name, wp_slug, font_id, font_family, ...})
     *
     * @internal Public only for the services split out of this class (#360).
     *           Not part of the extension API; it may change without notice.
     */
    public function get_adopted_fonts_for_face_printing() {
        $adopted = $this->font_sources()->get_adopted_wp_fonts();
        if (empty($adopted)) {
            return array();
        }

        $kit_font_ids = array();
        $kit_slugs = array();
        foreach ($this->get_custom_fonts() as $font) {
            if (isset($font['font_id'])) {
                $kit_font_ids[(int) $font['font_id']] = true;
            }
            if (!empty($font['wp_slug'])) {
                $kit_slugs[$font['wp_slug']] = true;
            }
        }

        $result = array();
        foreach ($adopted as $entry) {
            if (!isset($entry['font_id']) || empty($entry['wp_slug'])) {
                continue;
            }
            if (isset($kit_font_ids[(int) $entry['font_id']]) || isset($kit_slugs[$entry['wp_slug']])) {
                continue;
            }
            $result[] = $entry;
        }
        return $result;
    }

    /**
     * Narrow adopted fonts to those in use on the page whose faces
     * WordPress will not print
     *
     * "In use" is the same signal that drives the uploaded kits: the entry's
     * font_id appears in the detected/forced (replacement-resolved) IDs. A
     * family present in the merged theme.json data (theme font, or a Library
     * font activated in global styles) is printed by wp_print_font_faces()
     * and is left to WordPress.
     *
     * @since 2.3.0
     * @param array[] $adopted_fonts From get_adopted_fonts_for_face_printing()
     * @param array   $used_font_ids Numeric font IDs used or forced on the page
     * @return array[] Adopted entries the plugin must print faces for
     */
    private function get_adopted_fonts_to_print(array $adopted_fonts, array $used_font_ids) {
        if (empty($adopted_fonts) || empty($used_font_ids)) {
            return array();
        }

        $used = array_map('intval', $used_font_ids);
        $to_print = array();
        foreach ($adopted_fonts as $entry) {
            if (!in_array((int) $entry['font_id'], $used, true)) {
                continue;
            }
            if ($this->font_library_bridge()->adopted_entry_faces_printed_by_wordpress($entry)) {
                continue;
            }
            $to_print[] = $entry;
        }
        return $to_print;
    }

    /**
     * Concatenated @font-face CSS for adopted Library fonts, built from
     * their wp_font_face posts
     *
     * Output is already sanitized rule-by-rule by
     * Typost_Font_Library_Bridge::build_font_face_rule(); callers append it
     * to a combined stylesheet as-is (no ensure_relative_font_urls() pass,
     * since Library faces may reference files outside this site).
     *
     * @since 2.3.0
     * @param array[] $adopted_fonts Adopted entries with a wp_slug
     * @return string CSS (may be empty), newline-prefixed per family
     *
     * @internal Public only for the services split out of this class (#360).
     *           Not part of the extension API; it may change without notice.
     */
    public function get_adopted_font_face_css(array $adopted_fonts) {
        $css = '';
        foreach ($adopted_fonts as $entry) {
            if (empty($entry['wp_slug'])) {
                continue;
            }
            $family_css = $this->font_library_bridge()->build_font_face_css_for_family($entry['wp_slug']);
            if ('' !== $family_css) {
                $css .= "\n" . $family_css;
            }
        }
        return $css;
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

        // Enqueue admin assets only on plugin page. One hook, so the assets,
        // the localized data and typost_admin_assets run once per page load
        // (#226: the old admin_print_styles-/admin_print_scripts- pair ran
        // them twice, and every localized object printed twice).
        $this->admin_page_hook = $hook ? $hook : '';
        add_action('admin_enqueue_scripts', array($this, 'maybe_enqueue_admin_assets'));
    }

    /**
     * Enqueue the settings page assets when the current screen is the
     * settings page.
     *
     * @since 2.3.1
     * @param string $hook_suffix The current admin page hook suffix.
     */
    public function maybe_enqueue_admin_assets($hook_suffix) {
        if ('' !== $this->admin_page_hook && $hook_suffix === $this->admin_page_hook) {
            $this->enqueue_admin_assets();
        }
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
     *
     * Delegates to Typost_Assets::enqueue_admin_assets().
     */
    public function enqueue_admin_assets() {
        return $this->assets()->enqueue_admin_assets();
    }

    /**
     * Sanitize color scheme option value
     *
     * @param string $value The color scheme value to sanitize.
     * @return string Sanitized color scheme value.
     */
    public function sanitize_color_scheme($value) {
        return Typost_Admin_Options::sanitize(Typost_Admin_Options::COLOR_SCHEME, $value);
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
     *
     * Delegates to Typost_Assets::enqueue_custom_fonts_for_admin().
     */
    public function enqueue_custom_fonts_for_admin() {
        return $this->assets()->enqueue_custom_fonts_for_admin();
    }

    /**
     * Get the combined @font-face CSS for uploaded font kits and adopted
     * WP Font Library fonts on admin pages.
     *
     * Public so the admin refresh REST endpoint can return updated font CSS
     * after fonts are added or removed without a page reload. Adopted
     * Library fonts are included unconditionally (like the kits, and unlike
     * the frontend): admin pages only get WordPress's own @font-face for
     * activated families, and this transient is cleared by clear_cache()
     * rather than keyed on activation state.
     *
     * @return string Combined, sanitized, minified CSS (may be empty).
     */
    public function get_admin_font_css() {
        $fonts = $this->get_custom_fonts();
        $adopted_fonts = $this->get_adopted_fonts_for_face_printing();

        if (empty($fonts) && empty($adopted_fonts)) {
            return '';
        }

        // Cache combined font CSS
        $cache_key = 'typost_admin_font_css';
        $combined_css = get_transient($cache_key);

        if (false === $combined_css) {
            $combined_css = $this->get_adopted_font_face_css($adopted_fonts);
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
     *
     * Delegates to Typost_Assets::enqueue_custom_fonts_for_blocks().
     */
    public function enqueue_custom_fonts_for_blocks() {
        return $this->assets()->enqueue_custom_fonts_for_blocks();
    }

    /**
     * Enqueue custom fonts for block editor (deprecated - keeping for popover preview)
     *
     * Delegates to Typost_Assets::enqueue_custom_fonts_for_editor().
     */
    public function enqueue_custom_fonts_for_editor() {
        return $this->assets()->enqueue_custom_fonts_for_editor();
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
     * Load the plugin text domain.
     *
     * Registers the bundled languages/ directory with WordPress so the
     * shipped .mo files are found on every supported version, not only those
     * new enough to discover the directory on their own.
     *
     * @return void
     */
    public function load_textdomain() {
        load_plugin_textdomain(
            'typography-stylist',
            false,
            dirname(TYPOST_PLUGIN_BASENAME) . '/languages'
        );
    }

    /**
     * Register custom block
     */
    public function register_block() {
        add_filter('block_type_metadata', array($this, 'filter_block_splitting_support'));
        register_block_type(TYPOST_PLUGIN_DIR . 'blocks/typography-stylist');

        // Point the block's editor script at this plugin's languages folder.
        //
        // register_block_type() already calls wp_set_script_translations() for
        // us when block.json declares a textdomain, but it passes no path (see
        // register_block_script_handle() in wp-includes/blocks.php), so core
        // looks only in wp-content/languages/plugins/ and never finds the JSON
        // files bundled here. Calling it again with the path is what makes the
        // block's strings translatable from the plugin's own catalogue.
        wp_set_script_translations(
            'typost-block-editor-script',
            'typography-stylist',
            TYPOST_PLUGIN_DIR . 'languages'
        );
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
     * Allow the plugin's CSS properties through kses (#277).
     *
     * When a user without the unfiltered_html capability saves a post (an
     * Author or a Contributor, and every user but a super admin on
     * multisite), WordPress runs the content through kses, and
     * safecss_filter_attr() drops each style declaration whose property is
     * not on this list. Without this filter those users lost OpenType
     * features, variable font axes and small caps on save, in inline spans
     * and in Typography Stylist blocks (whose `content` attribute is kses
     * filtered too). A block whose saved style no longer matches its save()
     * output then shows as invalid in the editor.
     *
     * Only the property names are added: kses still checks every value. It
     * rejects \ ( & } = and comments outside the CSS functions it knows
     * (var(), calc(), clamp() and others), and url() is allowed only on its
     * own list of properties, which these four are not on.
     *
     * Limit: features and axes survive only on WordPress 7.0.1 and later.
     * Their values carry quotes ("liga" 1), which the serializer writes as
     * &quot;. From 7.0.1, wp_kses_attr_check() decodes the attribute before
     * safecss_filter_attr(); before that, the raw value goes in, explode(';')
     * cuts it inside &quot;, and the pieces fail the & check, filter or not.
     * No hook runs before that split, so on older versions this filter keeps
     * only font-variant-caps and font-synthesis-small-caps.
     *
     * @since 2.3.3
     * @param mixed $properties The allowed CSS property names.
     * @return mixed The list with the plugin's properties added, or the
     *               input unchanged when it is not an array.
     */
    public function allow_typography_css_properties($properties) {
        if (!is_array($properties)) {
            return $properties;
        }
        return array_values(array_unique(array_merge($properties, self::SAFE_CSS_PROPERTIES)));
    }

    /**
     * Write a Typography Stylist block's sidebar settings to its wrapper.
     *
     * The block supports color, spacing, line height, alignment, an anchor and
     * a CSS class. In the editor useBlockProps() applies them, but save.js
     * writes a bare wrapper, and core skips blocks.getSaveContent.extraProps
     * for an apiVersion above 1, so they never reach the saved markup. This
     * filter asks core's block supports API for what the editor shows and adds
     * it at render time. Saved markup does not change (no deprecation), content
     * already saved is covered, and the frontend loads no script. A block with
     * none of these settings comes back byte for byte. A Line indent is also
     * repeated as --typost-text-indent (#364, add_text_indent_property()).
     *
     * Runs on `render_block`, because a static block has no render callback, so
     * core does not set WP_Block_Supports::$block_to_render for it. The value is
     * restored afterwards, because this can run inside a dynamic parent.
     *
     * @since 2.4.0
     * @param string $block_content The rendered block HTML.
     * @param array  $block         The parsed block.
     * @return string The HTML, with the settings on the wrapper.
     */
    public function add_block_support_attributes($block_content, $block) {
        // A block with no attributes has no sidebar settings: core would give it
        // only its generated class, which is dropped below
        if (!is_string($block_content) || !is_array($block)
            || !isset($block['blockName']) || 'typost/block' !== $block['blockName']
            || empty($block['attrs']) || !is_array($block['attrs'])
            || !class_exists('WP_Block_Supports')) {
            return $block_content;
        }

        $previous = WP_Block_Supports::$block_to_render;
        WP_Block_Supports::$block_to_render = $block;
        $support = WP_Block_Supports::get_instance()->apply_block_supports();
        WP_Block_Supports::$block_to_render = $previous;

        $classes = isset($support['class']) ? preg_split('/\s+/', trim((string) $support['class'])) : array();
        // Core's generated class is not one of the settings, and the block's
        // CSS does not use it, so a block with nothing set stays as it was saved
        $classes = array_diff($classes, array('', 'wp-block-typost', 'wp-block-typost-block'));
        $style = self::add_text_indent_property(isset($support['style']) ? trim((string) $support['style']) : '');
        // WordPress before 7.0 has no anchor support on the server. block.json
        // declares supports.anchor, so the attribute is the block's own, and it is
        // escaped below
        $id = !empty($support['id']) ? $support['id'] : (isset($block['attrs']['anchor']) ? $block['attrs']['anchor'] : '');
        if (empty($classes) && '' === $style && '' === (string) $id) {
            return $block_content;
        }

        // The wrapper save.js writes, which has only a class. Core's own filters
        // run first at this priority and can add a class to it: its layout support
        // adds wp-container-content-* to a block in a Row. Any other form is not
        // this block's wrapper, so it is left alone.
        return preg_replace_callback(
            '/^(\s*)<div class="([^"]*)">/',
            function ($matches) use ($id, $style, $classes) {
                $existing = preg_split('/\s+/', trim($matches[2]), -1, PREG_SPLIT_NO_EMPTY);
                if (!in_array('wp-block-typost', $existing, true)) {
                    return $matches[0];
                }
                return $matches[1] . '<div'
                    . ('' !== (string) $id ? ' id="' . esc_attr($id) . '"' : '')
                    . ' class="' . esc_attr(implode(' ', array_values(array_unique(array_merge($existing, $classes))))) . '"'
                    . ('' !== $style ? ' style="' . esc_attr($style) . '"' : '')
                    . '>';
            },
            $block_content,
            1
        );
    }

    /**
     * Repeat the Line indent core wrote as --typost-text-indent (#364).
     *
     * style.css gives the block's visual copy `text-indent: var(...)`, so an
     * em value resolves against the text's own size, not the wrapper's. The
     * value is taken from the declarations core's block supports produced
     * (WordPress 7.0 and later write `text-indent:24px;`), not from the block
     * attribute: only a value core accepted is repeated, in the form it wrote
     * it, and the caller escapes the whole attribute. The editor writes the
     * same pair (withBlockTextIndentProperty() in the block's utils.js).
     * When the string holds more than one text-indent (an attribute edited by
     * hand can make core write two), the last one that has a value is
     * repeated, because that is the one the browser applies to the wrapper.
     *
     * @since 2.4.0
     * @param string $style The wrapper's inline style from core.
     * @return string The style, with the property added after core's
     *                declarations when they hold a text-indent.
     */
    private static function add_text_indent_property($style) {
        if (!preg_match_all('/(?:^|;)\s*text-indent\s*:\s*([^;]*)/i', $style, $matches)) {
            return $style;
        }
        $values = array_values(array_filter(array_map('trim', $matches[1]), 'strlen'));
        $value  = empty($values) ? '' : end($values);
        if ('' === $value) {
            return $style;
        }
        return $style . (preg_match('/;\s*$/', $style) ? '' : ';') . '--typost-text-indent:' . $value . ';';
    }

    /**
     * Give each fit-to-width line of a rendered Typography Stylist block the
     * values the plain typography switch needs (#315).
     *
     * A hung fit line is sized so that its ink minus the hang fills the
     * block. When a theme turns the switch on (`.typost-plain` or
     * `--typost-plain: 1`), style.css removes the hang and divides the line's
     * size by (1 + ratio × hang), which needs the ratio and the size. Both are
     * only literals in the line's inline font-size, so this filter copies them
     * into `--typost-fit-ratio` and `--typost-fit-size` at render time. Saved
     * markup does not change (no deprecation), content saved before #315 is
     * covered, and the frontend loads no script. With the switch off the
     * divisor is 1, so the rendered size is unchanged.
     *
     * @since 2.3.5
     * @param string $block_content The rendered block HTML.
     * @param array  $block         The parsed block.
     * @return string The HTML, with the properties on each fit line.
     */
    public function add_fit_line_plain_properties($block_content, $block) {
        if (!is_string($block_content) || !is_array($block)
            || !isset($block['blockName']) || 'typost/block' !== $block['blockName']
            || false === strpos($block_content, 'typost-line')) {
            return $block_content;
        }
        // Only tags that mention typost-line reach the callback, which then
        // checks the class word exactly
        $result = preg_replace_callback('/<span\b[^>]*typost-line[^>]*>/i', function ($match) {
            return self::add_plain_properties_to_fit_line_tag($match[0]);
        }, $block_content);
        return null === $result ? $block_content : $result;
    }

    /**
     * Add the plain typography properties to one opening tag, when it is a
     * fit line (class `typost-line` with a ratio-based font-size).
     *
     * The values are copied as raw attribute text: they came from the same
     * attribute, so they need no new escaping. A tag that already has the
     * properties, or whose size does not start with `calc(R *`, is returned
     * unchanged.
     *
     * @since 2.3.5
     * @param string $tag An opening `<span …>` tag.
     * @return string The tag.
     */
    public static function add_plain_properties_to_fit_line_tag($tag) {
        if (!preg_match('/\sclass="(?:[^"]*\s)?typost-line(?:\s[^"]*)?"/i', $tag)
            || !preg_match('/\sstyle="([^"]*)"/i', $tag, $style, PREG_OFFSET_CAPTURE)) {
            return $tag;
        }
        $css = $style[1][0];
        if (false !== strpos($css, '--typost-fit-ratio')
            || !preg_match('/(?:^|;)\s*font-size\s*:\s*([^;]+?)\s*(?:;|$)/i', $css, $size)
            || !preg_match('/^(?:min\(\s*)?calc\(\s*(\d*\.?\d+)\s*\*/i', $size[1], $ratio)
            || !((float) $ratio[1] > 0)) {
            return $tag;
        }
        $added = rtrim($css, "; \t") . ';--typost-fit-ratio:' . $ratio[1] . ';--typost-fit-size:' . $size[1];
        return substr_replace($tag, $added, $style[1][1], strlen($css));
    }

    /**
     * The unit new content writes its font sizes in.
     *
     * rem by default (#233), so new headings follow the reader's default font
     * size. A theme that changes the root font size (html { font-size: 62.5% })
     * makes rem sizes smaller than the px value the author entered, so the
     * Options tab can switch new content to px (#248). Only new content follows
     * the setting: a block stores its unit when it is inserted, a paragraph
     * style when it is saved, and an inline span in its own declaration.
     * block.json's fontSizeUnit default stays 'rem' because it also decides how
     * saved blocks parse.
     *
     * @since 2.3.2
     * @return string 'px' or 'rem'
     */
    public function get_new_font_size_unit() {
        return get_option('typost_new_font_sizes_px', false) ? 'px' : 'rem';
    }

    /**
     * Register REST API routes
     *
     * Delegates to Typost_Rest_Controller::register_rest_routes().
     */
    public function register_rest_routes() {
        return $this->rest_controller()->register_rest_routes();
    }

    /**
     * Check REST API permissions with rate limiting
     *
     * Delegates to Typost_Rest_Controller::check_permissions().
     *
     * @param WP_REST_Request|null $request Request, or null for a plain capability check.
     * @return true|false|WP_Error
     */
    public function check_permissions($request = null) {
        return $this->rest_controller()->check_permissions($request);
    }

    /**
     * Apply the REST write limit to every route in the typost/v1 namespace.
     *
     * Delegates to Typost_Rest_Controller::enforce_rest_rate_limit().
     *
     * @since 2.3.2
     * @param mixed           $result  Dispatch result from an earlier filter; null to continue.
     * @param WP_REST_Request $request Request.
     * @param string          $route   Matched route, e.g. /typost/v1/fonts.
     * @param array           $handler Route handler (unused).
     * @return mixed The earlier result, null to continue, or a 429 WP_Error.
     */
    public function enforce_rest_rate_limit($result, $request, $route, $handler) {
        return $this->rest_controller()->enforce_rest_rate_limit($result, $request, $route, $handler);
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
     * Display titles for the feature categories used by get_available_features().
     *
     * Passed to admin-page.js as typostAdmin.featureCategoryTitles: the font
     * cards' Feature Visibility checkboxes are built in the browser when the
     * section is first opened (#226 — rendered in PHP they were ~24 KB per
     * font, 3.2 MB of the page on a site with 134 fonts).
     *
     * @since 2.3.1
     * @return array Category slug => translated title.
     */
    public function get_feature_category_titles() {
        return array(
            'ligatures'      => __('Ligatures', 'typography-stylist'),
            'stylistic-sets' => __('Stylistic Sets', 'typography-stylist'),
            'alternates'     => __('Swashes & Alternates', 'typography-stylist'),
            'decorative'     => __('Decorative', 'typography-stylist'),
            'numerals'       => __('Numerals & Figures', 'typography-stylist'),
            'capitals'       => __('Capitals & Case', 'typography-stylist'),
            'positional'     => __('Positional Forms', 'typography-stylist'),
            'super-sub'      => __('Superscript & Ordinals', 'typography-stylist'),
            'other'          => __('Other Features', 'typography-stylist'),
        );
    }

    /**
     * Get available OpenType features with object caching
     */
    public function get_available_features() {
        if (null === $this->features_cache) {
            $this->features_cache = require __DIR__ . '/includes/available-features.php';
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
     *
     * Delegates to Typost_Rest_Controller::get_presets_endpoint().
     */
    public function get_presets_endpoint($request) {
        return $this->rest_controller()->get_presets_endpoint($request);
    }

    /**
     * REST endpoint: Get features
     *
     * Delegates to Typost_Rest_Controller::get_features_endpoint().
     */
    public function get_features_endpoint($request) {
        return $this->rest_controller()->get_features_endpoint($request);
    }

    /**
     * REST endpoint: Save preset
     *
     * Delegates to Typost_Rest_Controller::save_preset_endpoint().
     */
    public function save_preset_endpoint($request) {
        return $this->rest_controller()->save_preset_endpoint($request);
    }

    /**
     * REST endpoint: Delete preset
     *
     * Delegates to Typost_Rest_Controller::delete_preset_endpoint().
     */
    public function delete_preset_endpoint($request) {
        return $this->rest_controller()->delete_preset_endpoint($request);
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
     * Delegates to Typost_Rest_Controller::rest_get_font_feature_visibility().
     *
     * @since 2.0.0
     */
    public function rest_get_font_feature_visibility() {
        return $this->rest_controller()->rest_get_font_feature_visibility();
    }

    /**
     * REST callback: POST /font-feature-visibility/{font_id}
     *
     * Delegates to Typost_Rest_Controller::rest_update_font_feature_visibility().
     *
     * @since 2.0.0
     * @param WP_REST_Request $request
     */
    public function rest_update_font_feature_visibility(WP_REST_Request $request) {
        return $this->rest_controller()->rest_update_font_feature_visibility($request);
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
     * Delegates to Typost_Rest_Controller::rest_get_font_order().
     *
     * @since 2.0.0
     */
    public function rest_get_font_order() {
        return $this->rest_controller()->rest_get_font_order();
    }

    /**
     * REST callback: POST /font-order
     *
     * Delegates to Typost_Rest_Controller::rest_update_font_order().
     *
     * @since 2.0.0
     * @param WP_REST_Request $request
     */
    public function rest_update_font_order(WP_REST_Request $request) {
        return $this->rest_controller()->rest_update_font_order($request);
    }

    /**
     * REST callback: GET /admin/refresh
     *
     * Delegates to Typost_Rest_Controller::rest_get_admin_refresh().
     *
     * @since 2.3.0
     */
    public function rest_get_admin_refresh() {
        return $this->rest_controller()->rest_get_admin_refresh();
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
     * Delegates to Typost_Rest_Controller::rest_save_admin_options().
     *
     * @since 2.3.0
     * @param WP_REST_Request $request
     */
    public function rest_save_admin_options(WP_REST_Request $request) {
        return $this->rest_controller()->rest_save_admin_options($request);
    }

    /**
     * REST callback: POST /admin/accessibility
     *
     * Delegates to Typost_Rest_Controller::rest_save_accessibility_options().
     *
     * @since 2.3.0
     * @param WP_REST_Request $request
     */
    public function rest_save_accessibility_options(WP_REST_Request $request) {
        return $this->rest_controller()->rest_save_accessibility_options($request);
    }

    /**
     * REST callback: POST /admin/clear-cache
     *
     * Delegates to Typost_Rest_Controller::rest_clear_font_cache().
     *
     * @since 2.3.0
     */
    public function rest_clear_font_cache() {
        return $this->rest_controller()->rest_clear_font_cache();
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
        $this->clear_font_detection_cache();

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
     * Clear every plugin cache, as the save routes do after a write.
     *
     * Public for code outside this class that writes plugin options, such
     * as import (#205): presets, options and Feature Visibility.
     *
     * @since 2.3.5
     */
    public function clear_caches() {
        $this->clear_cache();
    }

    /**
     * Clear the per-page font detection caches.
     *
     * Drops every cached "which fonts does this page use" answer (per-post
     * and archive `typost_used_fonts_*`, `typost_has_styled_*`) and the
     * per-page font CSS built from them. Public so modules whose data feeds
     * detection through `typost_content_font_ids` (paragraph styles) can
     * invalidate it when that data changes — a style that switches font
     * would otherwise keep serving the old @font-face for up to 12 hours.
     *
     * Under a persistent object cache (Redis, Memcached) this flushes the
     * whole object cache, because the wildcard row deletes cannot reach the
     * cached transient copies. Call it on data changes, not on every request.
     * On the `clear_cache()` path the later editor-data invalidation flushes
     * again; both are idempotent.
     *
     * @since 2.3.0
     */
    public function clear_font_detection_cache() {
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

        // The row deletes above do not reach a persistent object cache, where
        // get_transient() would keep answering from the cached copy. The other
        // wildcard deletion paths flush for the same reason.
        if (wp_using_ext_object_cache()) {
            wp_cache_flush();
        }
    }

    /**
     * Invalidate editor data cache
     *
     * @internal Public only for the services split out of this class (#360).
     *           Not part of the extension API; it may change without notice.
     */
    public function invalidate_editor_data_cache($user_id = null) {
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

            // The row deletes do not reach a persistent object cache, where
            // get_transient() would keep answering from the cached copy; without
            // one the flush would only cost a cold cache (review of E-16).
            if (wp_using_ext_object_cache()) {
                wp_cache_flush();
            }
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
            return;
        }
        // Any other deleted family still leaves the picker list stale for an
        // hour (QA 2026-09 E-16): drop the localized editor data so the next
        // editor load rebuilds it.
        if ($post && isset($post->post_type) && 'wp_font_family' === $post->post_type) {
            $this->invalidate_editor_data_cache();
            return;
        }
        // A deleted face must leave the printed CSS the same way a saved one
        // enters it (PR #194 review)
        if ($post && isset($post->post_type) && 'wp_font_face' === $post->post_type) {
            $this->invalidate_font_face_css();
        }
    }

    /**
     * Drop the caches that hold adopted Library faces.
     *
     * Shared by the wp_font_face save and delete handlers. Deliberately cheap
     * (see on_wp_font_face_saved()): the three static CSS transients go by
     * name, and the per-page frontend keys rotate through a fresh face
     * version folded into get_font_css_cache_key().
     *
     * @since 2.3.0
     */
    private function invalidate_font_face_css() {
        delete_transient('typost_admin_font_css');
        delete_transient('typost_editor_font_css');
        delete_transient('typost_block_font_css');
        // A UUID rather than a timestamp: two saves in the same instant
        // must not share a version (PR #194 review)
        update_option('typost_font_face_version', wp_generate_uuid4(), false);
        $this->font_library_bridge()->clear_snapshot_cache();
    }

    /**
     * save_post_wp_font_family handler: a family installed or edited in the
     * Font Library appears in the editor picker on the next load.
     *
     * The picker reads `wpFontLibraryFonts` from the per-user localized-data
     * transient (typost_editor_data_{user}, one hour), which nothing else
     * invalidated on a Library install (QA 2026-09 finding E-16).
     *
     * @since 2.3.0
     * @param int     $post_id Post ID
     * @param WP_Post $post    Post object
     * @param bool    $update  Whether this is an update
     */
    public function on_wp_font_family_saved($post_id, $post = null, $update = false) {
        if (wp_is_post_revision($post_id) || wp_is_post_autosave($post_id)) {
            return;
        }
        if ($post && isset($post->post_status) && 'auto-draft' === $post->post_status) {
            return;
        }
        $this->invalidate_editor_data_cache();
    }

    /**
     * save_post_wp_font_face handler: a face added to or changed on a Library
     * family reaches the plugin-printed @font-face CSS (adopted families that
     * WordPress does not print) on the next request.
     *
     * Face posts only feed the adopted-font CSS, so this is deliberately
     * cheap: WordPress saves every variant of an installed family as its own
     * wp_font_face post, and a full clear_cache() per face (wildcard row
     * deletes plus an object-cache flush) would stampede a Redis/Memcached
     * site during one install (review of E-16). The three static CSS
     * transients are deleted by name (cache-safe), and the per-page frontend
     * CSS keys are rotated through the face version folded into
     * get_font_css_cache_key() whenever adopted faces are printed.
     *
     * @since 2.3.0
     * @param int     $post_id Post ID
     * @param WP_Post $post    Post object
     * @param bool    $update  Whether this is an update
     */
    public function on_wp_font_face_saved($post_id, $post = null, $update = false) {
        if (wp_is_post_revision($post_id) || wp_is_post_autosave($post_id)) {
            return;
        }
        if ($post && isset($post->post_status) && 'auto-draft' === $post->post_status) {
            return;
        }
        $this->invalidate_font_face_css();
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
     *
     * @internal Public only for the services split out of this class (#360).
     *           Not part of the extension API; it may change without notice.
     */
    public function sanitize_css_content($css) {
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
     * Weights outside the 100-900 hundreds are accepted (1-1000, for
     * variable fonts) only when the `typost_allow_variable_weights` option
     * is truthy. That option has NO admin UI and nothing in the plugin
     * writes it; it is kept, default false, so a site that set it directly
     * (wp-config, WP-CLI, a filter on `option_typost_allow_variable_weights`)
     * keeps its behavior. The Variable Fonts module handles variable weights
     * through its own axis definitions and does not depend on it.
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
     *
     * Delegates to Typost_Rest_Controller::get_fonts_endpoint().
     */
    public function get_fonts_endpoint($request) {
        return $this->rest_controller()->get_fonts_endpoint($request);
    }

    /**
     * REST endpoint: Upload font kit
     *
     * Delegates to Typost_Rest_Controller::upload_font_endpoint().
     */
    public function upload_font_endpoint($request) {
        return $this->rest_controller()->upload_font_endpoint($request);
    }

    /**
     * REST endpoint: Delete font
     *
     * Delegates to Typost_Rest_Controller::delete_font_endpoint().
     */
    public function delete_font_endpoint($request) {
        return $this->rest_controller()->delete_font_endpoint($request);
    }

    /**
     * Process uploaded font kit ZIP file
     *
     * Delegates to Typost_Font_Kit_Upload::process_font_kit_zip().
     *
     * @param array  $uploaded_file The $_FILES-style upload array.
     * @param string $kit_name      User-provided kit name.
     * @return array|WP_Error Array of per-family font entries, or WP_Error.
     */
    public function process_font_kit_zip($uploaded_file, $kit_name) {
        return $this->font_kit_upload()->process_font_kit_zip($uploaded_file, $kit_name);
    }

    /**
     * Get non-fatal warnings from the most recent font kit upload
     *
     * Delegates to Typost_Font_Kit_Upload::get_font_kit_warnings().
     *
     * @since 2.1.0
     * @return string[] Translated warning messages (empty when none).
     */
    public function get_font_kit_warnings() {
        return $this->font_kit_upload()->get_font_kit_warnings();
    }

    /**
     * Convert absolute font URLs to relative URLs dynamically
     * Handles legacy fonts without needing migration
     *
     * @internal Public only for the services split out of this class (#360).
     *           Not part of the extension API; it may change without notice.
     */
    public function ensure_relative_font_urls($css_content) {
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
     *
     * Delegates to Typost_Font_Kit_Upload::rewrite_css_urls().
     */
    public function rewrite_css_urls($css_content, $base_url) {
        return $this->font_kit_upload()->rewrite_css_urls($css_content, $base_url);
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
     * REST endpoint: Bulk auto-detect available weights
     *
     * Delegates to Typost_Rest_Controller::bulk_detect_weights_endpoint().
     *
     * @since 2.1.2
     * @param WP_REST_Request $request The REST request object.
     * @return WP_REST_Response Summary: updated (weights narrowed), defaulted
     *                          (nothing narrowed — all weights kept), failed
     *                          (stylesheet unreachable).
     */
    public function bulk_detect_weights_endpoint($request) {
        return $this->rest_controller()->bulk_detect_weights_endpoint($request);
    }

    /**
     * REST endpoint: Get Adobe Fonts
     *
     * Delegates to Typost_Rest_Controller::get_adobe_fonts_endpoint().
     *
     * @since 1.0.0
     * @param WP_REST_Request $request The REST request object.
     * @return WP_REST_Response REST response containing array of Adobe Fonts projects.
     */
    public function get_adobe_fonts_endpoint($request) {
        return $this->rest_controller()->get_adobe_fonts_endpoint($request);
    }

    /**
     * REST endpoint: Add Adobe Font
     *
     * Delegates to Typost_Rest_Controller::add_adobe_font_endpoint().
     *
     * @since 1.0.0
     * @param WP_REST_Request $request REST request with 'embed_code', 'name', and 'font_families' params.
     * @return WP_REST_Response|WP_Error REST response with success status and font data, or error.
     */
    public function add_adobe_font_endpoint($request) {
        return $this->rest_controller()->add_adobe_font_endpoint($request);
    }

    /**
     * Build one Adobe Fonts entry (one family of a project)
     *
     * Shared by the add endpoint and import (#205), so both store the same
     * shape. Allocates a font ID.
     *
     * @since 2.3.5
     * @param string     $kit_id   Stored kit ID ("adobe-{project}").
     * @param string     $kit_name Project name for display.
     * @param string     $css_url  Normalized Typekit stylesheet URL.
     * @param string     $family   Family name.
     * @param array|null $weights  Available weights, null = all.
     * @return array
     *
     * @internal Public only for the services split out of this class (#360).
     *           Not part of the extension API; it may change without notice.
     */
    public function build_adobe_font_entry($kit_id, $kit_name, $css_url, $family, $weights = null) {
        $font_entry = array(
            'id' => sanitize_key($kit_id . '-' . sanitize_title($family)),
            'name' => sanitize_text_field($family), // Use family name as font name
            'font_id' => $this->generate_font_id(),
            'font_family' => sanitize_text_field($family), // Single family per entry
            'kit_id' => sanitize_key($kit_id),       // Link back to original kit
            'kit_name' => sanitize_text_field($kit_name), // For display/grouping
            'css_url' => $css_url,                   // Same CSS URL for all fonts in kit
            'added_date' => current_time('mysql')
        );

        if (is_array($weights)) {
            $font_entry['available_weights'] = $weights;
        }

        return $font_entry;
    }

    /**
     * Add one Adobe Fonts family from an import file (#205)
     *
     * The project's stylesheet URL comes from the file, checked against the
     * same Typekit URL rule as the add endpoint. A project already on this
     * site keeps its stored URL and name; the family is added to it.
     *
     * @since 2.3.5
     * @param array $descriptor Sanitized font descriptor (Typost_Export_Fonts::sanitize_descriptor()).
     * @return array|false The stored entry, or false when the URL is not a Typekit stylesheet.
     */
    public function add_adobe_font_entry($descriptor) {
        $parsed = $this->parse_adobe_fonts_code(isset($descriptor['cssUrl']) ? (string) $descriptor['cssUrl'] : '');
        if (!$parsed || empty($descriptor['family'])) {
            return false;
        }
        $kit_id = 'adobe-' . $parsed['kit_id'];
        $css_url = $parsed['css_url'];
        $kit_name = !empty($descriptor['kitName']) ? $descriptor['kitName'] : 'Adobe Fonts ' . $parsed['kit_id'];

        $fonts = $this->get_adobe_fonts();
        foreach ($fonts as $font) {
            if (isset($font['kit_id']) && $font['kit_id'] === $kit_id) {
                $css_url = isset($font['css_url']) ? $font['css_url'] : $css_url;
                $kit_name = isset($font['kit_name']) ? $font['kit_name'] : $kit_name;
                break;
            }
        }

        $weights = !empty($descriptor['availableWeights']) ? $this->sanitize_available_weights($descriptor['availableWeights']) : null;
        $entry = $this->build_adobe_font_entry($kit_id, $kit_name, $css_url, $descriptor['family'], $weights ? $weights : null);
        $fonts[] = $entry;
        update_option('typost_adobe_fonts', $fonts);
        $this->clear_cache();

        return $entry;
    }

    /**
     * REST endpoint: Delete Adobe Font
     *
     * Delegates to Typost_Rest_Controller::delete_adobe_font_endpoint().
     *
     * @since 1.0.0
     * @param WP_REST_Request $request REST request with 'id' parameter.
     * @return WP_REST_Response|WP_Error REST response with success status, or error if not found.
     */
    public function delete_adobe_font_endpoint($request) {
        return $this->rest_controller()->delete_adobe_font_endpoint($request);
    }

    /**
     * REST endpoint: Update Adobe Font fallback
     *
     * Delegates to Typost_Rest_Controller::update_adobe_font_fallback_endpoint().
     *
     * @since 1.0.0
     * @param WP_REST_Request $request REST request with 'id' parameter and 'fallbacks' in body.
     * @return WP_REST_Response|WP_Error REST response with updated font data, or error if not found.
     */
    public function update_adobe_font_fallback_endpoint($request) {
        return $this->rest_controller()->update_adobe_font_fallback_endpoint($request);
    }

    /**
     * REST endpoint: Update Adobe Font load on all pages setting
     *
     * Delegates to Typost_Rest_Controller::update_adobe_font_load_on_all_pages_endpoint().
     *
     * @since 1.0.0
     * @param WP_REST_Request $request REST request with 'id' parameter and 'load_on_all_pages' in body.
     * @return WP_REST_Response|WP_Error REST response with updated font data, or error if not found.
     */
    public function update_adobe_font_load_on_all_pages_endpoint($request) {
        return $this->rest_controller()->update_adobe_font_load_on_all_pages_endpoint($request);
    }

    /**
     * REST endpoint: Update font fallback (uploaded fonts)
     *
     * Delegates to Typost_Rest_Controller::update_font_fallback_endpoint().
     *
     * @since 1.0.0
     * @param WP_REST_Request $request REST request with 'id' parameter and 'fallbacks' in body.
     * @return WP_REST_Response|WP_Error REST response with updated font data, or error if not found.
     */
    public function update_font_fallback_endpoint($request) {
        return $this->rest_controller()->update_font_fallback_endpoint($request);
    }

    /**
     * REST endpoint: Update font load on all pages setting (uploaded fonts)
     *
     * Delegates to Typost_Rest_Controller::update_font_load_on_all_pages_endpoint().
     *
     * @since 1.0.0
     * @param WP_REST_Request $request REST request with 'id' parameter and 'load_on_all_pages' in body.
     * @return WP_REST_Response|WP_Error REST response with updated font data, or error if not found.
     */
    public function update_font_load_on_all_pages_endpoint($request) {
        return $this->rest_controller()->update_font_load_on_all_pages_endpoint($request);
    }

    /**
     * REST endpoint: Register an uploaded font in the WP Font Library
     *
     * Delegates to Typost_Rest_Controller::register_font_in_library_endpoint().
     *
     * @since 2.1.0
     * @param WP_REST_Request $request
     * @return WP_REST_Response|WP_Error
     */
    public function register_font_in_library_endpoint($request) {
        return $this->rest_controller()->register_font_in_library_endpoint($request);
    }

    /**
     * REST endpoint: Remove an uploaded font from the WP Font Library
     *
     * Delegates to Typost_Rest_Controller::unregister_font_from_library_endpoint().
     *
     * @since 2.1.0
     * @param WP_REST_Request $request
     * @return WP_REST_Response|WP_Error
     */
    public function unregister_font_from_library_endpoint($request) {
        return $this->rest_controller()->unregister_font_from_library_endpoint($request);
    }

    /**
     * REST endpoint: Register all unregistered uploaded fonts in the Library
     *
     * Delegates to Typost_Rest_Controller::bulk_register_fonts_in_library_endpoint().
     *
     * @since 2.1.0
     * @param WP_REST_Request $request
     * @return WP_REST_Response|WP_Error
     */
    public function bulk_register_fonts_in_library_endpoint($request) {
        return $this->rest_controller()->bulk_register_fonts_in_library_endpoint($request);
    }

    /**
     * REST endpoint: Adopt a WP Font Library font for editor use
     *
     * Delegates to Typost_Rest_Controller::adopt_wp_font_endpoint().
     *
     * @since 2.1.0
     * @param WP_REST_Request $request
     * @return WP_REST_Response|WP_Error
     */
    public function adopt_wp_font_endpoint($request) {
        return $this->rest_controller()->adopt_wp_font_endpoint($request);
    }

    /**
     * REST endpoint: Dismiss the Font Library migration admin notice
     *
     * Delegates to Typost_Rest_Controller::dismiss_wp_library_notice_endpoint().
     *
     * @since 2.1.0
     * @return WP_REST_Response
     */
    public function dismiss_wp_library_notice_endpoint() {
        return $this->rest_controller()->dismiss_wp_library_notice_endpoint();
    }

    /**
     * REST endpoint: Get manual fonts
     *
     * Delegates to Typost_Rest_Controller::get_manual_fonts_endpoint().
     *
     * @since 1.0.0
     * @param WP_REST_Request $request The REST request object.
     * @return WP_REST_Response REST response containing array of manual fonts.
     */
    public function get_manual_fonts_endpoint($request) {
        return $this->rest_controller()->get_manual_fonts_endpoint($request);
    }

    /**
     * REST endpoint: Add manual font
     *
     * Delegates to Typost_Rest_Controller::add_manual_font_endpoint().
     *
     * @since 1.0.0
     * @param WP_REST_Request $request REST request with 'name', 'font_family', and optional 'fallbacks' params.
     * @return WP_REST_Response|WP_Error REST response with success status and font data, or error.
     */
    public function add_manual_font_endpoint($request) {
        return $this->rest_controller()->add_manual_font_endpoint($request);
    }

    /**
     * Store a manual font definition and allocate its font ID
     *
     * Shared by the add endpoint and import (#205).
     *
     * @since 2.3.5
     * @param string $name        Display name.
     * @param string $font_family CSS font-family name.
     * @param string $fallbacks   Fallback stack.
     * @return array The stored entry.
     *
     * @internal Public only for the services split out of this class (#360).
     *           Not part of the extension API; it may change without notice.
     */
    public function store_manual_font_entry($name, $font_family, $fallbacks) {
        // Generate unique ID
        $font_id = 'manual-' . sanitize_key(strtolower(str_replace(' ', '-', $name))) . '-' . time();

        $new_font = array(
            'id' => $font_id,
            'name' => sanitize_text_field($name),
            'font_id' => $this->generate_font_id(),
            'font_family' => sanitize_text_field($font_family),
            'fallbacks' => sanitize_text_field($fallbacks),
            'added_date' => current_time('mysql')
        );

        $fonts = $this->get_manual_fonts();
        $fonts[] = $new_font;
        update_option('typost_manual_fonts', $fonts);

        // Clear cache
        $this->clear_cache();

        return $new_font;
    }

    /**
     * Add a manual font definition from an import file (#205)
     *
     * @since 2.3.5
     * @param array $descriptor Sanitized font descriptor (Typost_Export_Fonts::sanitize_descriptor()).
     * @return array|false The stored entry, or false without a name and family.
     */
    public function add_manual_font_entry($descriptor) {
        $family = !empty($descriptor['fontFamily']) ? $descriptor['fontFamily'] : (isset($descriptor['family']) ? $descriptor['family'] : '');
        if (empty($descriptor['name']) || '' === $family) {
            return false;
        }
        return $this->store_manual_font_entry($descriptor['name'], $family, isset($descriptor['fallbacks']) ? $descriptor['fallbacks'] : '');
    }

    /**
     * REST endpoint: Delete manual font
     *
     * Delegates to Typost_Rest_Controller::delete_manual_font_endpoint().
     *
     * @since 1.0.0
     * @param WP_REST_Request $request REST request with 'id' parameter.
     * @return WP_REST_Response|WP_Error REST response with success status, or error if not found.
     */
    public function delete_manual_font_endpoint($request) {
        return $this->rest_controller()->delete_manual_font_endpoint($request);
    }

    /**
     * REST endpoint: Update manual font
     *
     * Delegates to Typost_Rest_Controller::update_manual_font_endpoint().
     *
     * @since 1.0.0
     * @param WP_REST_Request $request REST request with 'id' parameter and 'font_family', 'fallbacks' in body.
     * @return WP_REST_Response|WP_Error REST response with updated font data, or error if not found.
     */
    public function update_manual_font_endpoint($request) {
        return $this->rest_controller()->update_manual_font_endpoint($request);
    }

    /**
     * Enqueue Adobe Fonts scripts in editor and frontend
     *
     * Loads Adobe Fonts (Typekit) CSS stylesheets for configured projects,
     * only for fonts that are either:
     *   - Set to "load on all pages", OR
     *   - Forced by the typost_force_enqueue_font_ids filter, OR
     *   - Actually used: on the frontend, by the current page; in the block
     *     editor (since 2.3.1), by the saved content of the post being
     *     edited (get_editor_used_fonts()). editor-font-kits.js adds the kit
     *     for any other font the author uses or previews.
     *
     * Not called on the settings page (since 2.3.1): admin-page.js loads
     * kits there on demand.
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

        // The block editor (canvas and editor page) uses the same rules as
        // the frontend, with the edited post's saved content as "the page".
        // editor-font-kits.js adds any other kit on demand (#230: the editor
        // loaded every kit, twice — 154 requests on a site with 77 kits).
        $is_editor = is_admin();

        // Only get used fonts if at least one font is set to load conditionally
        $used_font_families = array();
        $used_font_ids = array();
        $has_conditional_fonts = false;
        foreach ($adobe_fonts as $font) {
            if (empty($font['load_on_all_pages'])) {
                $has_conditional_fonts = true;
                break;
            }
        }
        if ($has_conditional_fonts) {
            $used_fonts_raw = $is_editor ? $this->get_editor_used_fonts() : $this->get_used_fonts_in_content();

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

        // Track which CSS URLs should be loaded (to avoid duplicates when fonts are from same kit)
        $css_urls_to_load = array();

        foreach ($adobe_fonts as $font) {
            if (empty($font['css_url'])) {
                continue;
            }

            // Determine if this font should be loaded
            $should_load = false;

            // Check load_on_all_pages setting (in the editor too: theme CSS
            // can use the font anywhere in the canvas)
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
     * Font references in the saved content of the post open in the block
     * editor, in the get_used_fonts_in_content() shape ('id:N' strings and
     * family names).
     *
     * Reads the raw post content only: no the_content filters or block
     * rendering in the editor request. Inline spans, --font-N variables and
     * block attributes are all in the raw content; synced patterns are read
     * from their own wp_block posts (get_synced_pattern_content()); paragraph
     * style references go through the typost_content_font_ids filter. The
     * site editor and the widgets editor have no single post, so they get
     * none — editor-font-kits.js loads their kits once the blocks (template
     * parts included) are in the block editor store.
     *
     * @since 2.3.1
     * @return array Font references (may be empty).
     */
    private function get_editor_used_fonts() {
        if (null !== $this->editor_used_fonts) {
            return $this->editor_used_fonts;
        }

        $fonts = array();
        $post  = function_exists('get_post') ? get_post() : null;
        $raw   = ($post && isset($post->post_content) && is_string($post->post_content)) ? $post->post_content : '';

        if ('' !== $raw) {
            // A synced pattern is saved as <!-- wp:block {"ref":N} /--> only,
            // so add each referenced pattern's own content to the scan.
            $visited = array();
            $raw    .= $this->get_synced_pattern_content($raw, $visited);

            if (function_exists('parse_blocks')) {
                $this->extract_fonts_from_blocks(parse_blocks($raw), $fonts);
            }
            if (preg_match_all('/data-font=["\']([^"\']+)["\']/', $raw, $matches)) {
                $fonts = array_merge($fonts, $matches[1]);
            }
            if (preg_match_all('/--font-(\d+)/', $raw, $matches)) {
                foreach ($matches[1] as $font_id) {
                    $fonts[] = 'id:' . $font_id;
                }
            }
            if (preg_match_all('/data-font-id=["\'](\d+)["\']/', $raw, $matches)) {
                foreach ($matches[1] as $font_id) {
                    $fonts[] = 'id:' . $font_id;
                }
            }
            $this->collect_extension_font_ids($raw, $fonts);
        }

        $this->editor_used_fonts = array_values(array_filter(array_unique($fonts)));
        return $this->editor_used_fonts;
    }

    /**
     * The saved content of every synced pattern (core/block) that a piece of
     * content references, nested patterns included.
     *
     * @since 2.3.1
     * @param string $content  Block content.
     * @param array  $visited  Pattern IDs already read (by reference), so a
     *                         pattern that references itself cannot loop.
     * @param int    $depth    Nesting depth (stops at 5).
     * @return string The patterns' content, newline-separated ('' if none).
     */
    private function get_synced_pattern_content($content, array &$visited, $depth = 0) {
        if ($depth > 5 || !is_string($content) || false === strpos($content, 'wp:block') || !function_exists('parse_blocks')) {
            return '';
        }

        $refs = array();
        $this->collect_synced_pattern_refs(parse_blocks($content), $refs);

        $out = '';
        foreach ($refs as $ref) {
            if (isset($visited[$ref])) {
                continue;
            }
            $visited[$ref] = true;
            $pattern = get_post($ref);
            if (!$pattern || !isset($pattern->post_type) || 'wp_block' !== $pattern->post_type || !is_string($pattern->post_content)) {
                continue;
            }
            $out .= "\n" . $pattern->post_content;
            $out .= $this->get_synced_pattern_content($pattern->post_content, $visited, $depth + 1);
        }
        return $out;
    }

    /**
     * Collect the `ref` IDs of core/block (synced pattern) blocks.
     *
     * @since 2.3.1
     * @param array $blocks Parsed blocks.
     * @param array $refs   Positive pattern IDs (by reference).
     */
    private function collect_synced_pattern_refs($blocks, array &$refs) {
        foreach ((array) $blocks as $block) {
            if (isset($block['blockName']) && 'core/block' === $block['blockName'] && !empty($block['attrs']['ref'])) {
                $ref = absint($block['attrs']['ref']);
                if ($ref > 0) {
                    $refs[] = $ref;
                }
            }
            if (!empty($block['innerBlocks'])) {
                $this->collect_synced_pattern_refs($block['innerBlocks'], $refs);
            }
        }
    }

    /**
     * =========================================================================
     * FONT ID AND REPLACEMENT MANAGEMENT
     * =========================================================================
     */

    /**
     * REST API: Get all font replacements
     *
     * Delegates to Typost_Rest_Controller::get_font_replacements_endpoint().
     */
    public function get_font_replacements_endpoint($request) {
        return $this->rest_controller()->get_font_replacements_endpoint($request);
    }

    /**
     * REST API: Add font replacement
     *
     * Delegates to Typost_Rest_Controller::add_font_replacement_endpoint().
     */
    public function add_font_replacement_endpoint($request) {
        return $this->rest_controller()->add_font_replacement_endpoint($request);
    }

    /**
     * REST API: Update font replacement
     *
     * Delegates to Typost_Rest_Controller::update_font_replacement_endpoint().
     */
    public function update_font_replacement_endpoint($request) {
        return $this->rest_controller()->update_font_replacement_endpoint($request);
    }

    /**
     * REST API: Delete font replacement
     *
     * Delegates to Typost_Rest_Controller::delete_font_replacement_endpoint().
     */
    public function delete_font_replacement_endpoint($request) {
        return $this->rest_controller()->delete_font_replacement_endpoint($request);
    }

    /**
     * REST API: Get unassigned fonts
     *
     * Delegates to Typost_Rest_Controller::get_unassigned_fonts_endpoint().
     */
    public function get_unassigned_fonts_endpoint($request) {
        return $this->rest_controller()->get_unassigned_fonts_endpoint($request);
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
     * Add font IDs that the built-in content scan cannot see.
     *
     * The scan recognises `data-font`, `data-font-id` and `--font-N`. Content
     * styled only through a paragraph style class (`data-style-id="N"` on a
     * span, `typost-ps-N` on a block) names no font at all — the font lives in
     * the style definition — so without this hook the frontend never printed
     * its @font-face. Modules and extensions report those IDs through the
     * `typost_content_font_ids` filter; the IDs are appended in the scan's
     * `id:N` form.
     *
     * @since 2.3.0
     * @param string $content     The content being scanned (raw + rendered).
     * @param array  $used_fonts  Font references collected so far (by reference).
     */
    private function collect_extension_font_ids($content, array &$used_fonts) {
        if (!is_string($content) || '' === $content) {
            return;
        }
        /**
         * Filters font IDs referenced indirectly by a piece of content.
         *
         * @since 2.3.0
         * @param int[]  $ids     Font IDs found so far (empty on entry).
         * @param string $content The content being scanned.
         */
        $ids = apply_filters('typost_content_font_ids', array(), $content);
        if (!is_array($ids)) {
            return;
        }
        foreach ($ids as $id) {
            $id = intval($id);
            if ($id > 0) {
                $used_fonts[] = 'id:' . $id;
            }
        }
    }

    /**
     * Does this content reference any font only through an extension's markup?
     *
     * Used by the has-styled-content gate: a page whose only typography
     * comes from an extension (no `typost-styled` class, no Typography
     * Stylist block) would otherwise be skipped before the font scan ran,
     * and its `@font-face` rules and `--font-N` variables never printed.
     *
     * @since 2.3.0
     * @param string $content Raw plus rendered content.
     * @return bool
     */
    private function content_references_extension_fonts($content) {
        $ids = array();
        $this->collect_extension_font_ids($content, $ids);
        return !empty($ids);
    }

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
     *
     * @internal Public only for the services split out of this class (#360).
     *           Not part of the extension API; it may change without notice.
     */
    public function sanitize_available_weights($weights) {
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

            // A checkbox is in the POST only when checked. Values go through
            // Typost_Admin_Options::sanitize(), shared with REST and import.
            // typost_allow_variable_weights is deliberately NOT written here:
            // the Options tab renders no control for it, and a no-JS save must
            // not reset an option that has no checkbox (see sanitize_font_faces()).
            $checkboxes = array(
                'typost_show_clear_confirmation',
                'typost_archive_full_content_check',
                'typost_block_enter_line_break',
                'typost_new_font_sizes_px', // #248
            );
            // The Font Library checkbox is rendered only when the Library is available.
            if ($this->font_library_bridge()->is_available()) {
                $checkboxes[] = 'typost_auto_register_wp_fonts';
            }
            // Extension-registered checkbox options (see typost_admin_options_rows).
            // A full form POST always carries every rendered checkbox, so an
            // absent field genuinely means unchecked here.
            $checkboxes = array_merge($checkboxes, $this->get_extension_option_checkboxes());
            foreach ($checkboxes as $option_key) {
                update_option($option_key, Typost_Admin_Options::sanitize($option_key, isset($_POST[$option_key])));
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
            update_option('typost_disable_accessibility_warning', Typost_Admin_Options::sanitize('typost_disable_accessibility_warning', isset($_POST['typost_disable_accessibility_warning'])));

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

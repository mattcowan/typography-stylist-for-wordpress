<?php
/**
 * Uninstall script for Typography Stylist plugin
 *
 * This file is called when the plugin is uninstalled via the WordPress admin.
 * It cleans up all plugin data from the database and filesystem.
 *
 * @package OpenType_Stylist
 */

// Exit if accessed directly or not uninstalling
if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

// Delete plugin options from database
delete_option('typost_presets');
delete_option('typost_custom_fonts');
delete_option('typost_adobe_fonts');
delete_option('typost_manual_fonts');
delete_option('typost_font_replacements');
delete_option('typost_font_feature_visibility');
delete_option('typost_font_order');
delete_option('typost_htaccess_verified');
delete_option('typost_enable_aria_labels');
delete_option('typost_disable_accessibility_warning');
delete_option('typost_show_clear_confirmation');
delete_option('typost_global_settings');

// Paragraph Styles module (bundled in v2.3)
delete_option('typost_paragraph_styles');
delete_option('typost_paragraph_styles_next_id');

// Variable Fonts module (bundled in v2.1)
delete_option('typost_variable_font_axes');
delete_option('typost_variable_font_flags');

// WP Font Library integration (v2.1)
delete_option('typost_adopted_wp_fonts');
delete_option('typost_auto_register_wp_fonts');
delete_option('typost_wp_library_notice_dismissed');

// Remaining settings options
delete_option('typost_admin_color_scheme');
delete_option('typost_allow_variable_weights');
delete_option('typost_archive_full_content_check');
delete_option('typost_block_enter_line_break');

// Delete transients
// Direct database calls are required during uninstall for bulk deletion with wildcard patterns.
// This is the standard approach for plugin cleanup as no caching is needed during uninstall.
global $wpdb;

// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching

// Delete all editor data transients
$wpdb->query(
    $wpdb->prepare(
        "DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",
        $wpdb->esc_like('_transient_typost_editor_data_') . '%',
        $wpdb->esc_like('_transient_timeout_typost_editor_data_') . '%'
    )
);

// Delete combined font CSS transients
delete_transient('typost_combined_font_css');
delete_transient('typost_admin_font_css');
delete_transient('typost_editor_font_css');
delete_transient('typost_block_font_css');

// Delete bundled module transients
delete_transient('typost_paragraph_styles_cache');
delete_transient('typost_paragraph_styles_css');
delete_transient('typost_vf_axes_cache');

// Delete per-page font CSS transients
$wpdb->query(
    $wpdb->prepare(
        "DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",
        $wpdb->esc_like('_transient_typost_font_css_') . '%',
        $wpdb->esc_like('_transient_timeout_typost_font_css_') . '%'
    )
);

// Delete has_styled transients for all posts
$wpdb->query(
    $wpdb->prepare(
        "DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",
        $wpdb->esc_like('_transient_typost_has_styled_') . '%',
        $wpdb->esc_like('_transient_timeout_typost_has_styled_') . '%'
    )
);

// Delete used fonts transients
$wpdb->query(
    $wpdb->prepare(
        "DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",
        $wpdb->esc_like('_transient_typost_used_fonts_') . '%',
        $wpdb->esc_like('_transient_timeout_typost_used_fonts_') . '%'
    )
);

// Delete rate limit transients
$wpdb->query(
    $wpdb->prepare(
        "DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",
        $wpdb->esc_like('_transient_typost_rate_limit_') . '%',
        $wpdb->esc_like('_transient_timeout_typost_rate_limit_') . '%'
    )
);

// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching

// Delete uploaded font files
$typost_upload_dir = wp_upload_dir();
$typost_font_dir = $typost_upload_dir['basedir'] . '/typography-stylist';

if (file_exists($typost_font_dir)) {
    require_once(ABSPATH . 'wp-admin/includes/file.php');

    // Initialize WordPress Filesystem
    if (WP_Filesystem()) {
        global $wp_filesystem;

        // Remove entire typography-stylist directory including fonts
        $wp_filesystem->rmdir($typost_font_dir, true);
    } else {
        // Fallback to PHP functions if WP_Filesystem fails
        // phpcs:disable WordPress.WP.AlternativeFunctions -- WP_Filesystem failed, this is emergency cleanup during uninstall
        if (is_dir($typost_font_dir)) {
            $typost_files = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($typost_font_dir, RecursiveDirectoryIterator::SKIP_DOTS),
                RecursiveIteratorIterator::CHILD_FIRST
            );

            foreach ($typost_files as $typost_file) {
                if ($typost_file->isDir()) {
                    @rmdir($typost_file->getRealPath());
                } else {
                    @unlink($typost_file->getRealPath());
                }
            }

            @rmdir($typost_font_dir);
        }
        // phpcs:enable WordPress.WP.AlternativeFunctions
    }
}

// Clean up any orphaned post meta (though this plugin doesn't use post meta, good practice)
// Features are stored inline in post content, so no cleanup needed there

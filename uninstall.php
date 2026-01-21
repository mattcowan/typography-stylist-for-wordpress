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
delete_option('typost_htaccess_verified');
delete_option('typost_enable_aria_labels');
delete_option('typost_show_clear_confirmation');
delete_option('typost_global_settings');

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
$upload_dir = wp_upload_dir();
$font_dir = $upload_dir['basedir'] . '/typography-stylist';

if (file_exists($font_dir)) {
    require_once(ABSPATH . 'wp-admin/includes/file.php');

    // Initialize WordPress Filesystem
    if (WP_Filesystem()) {
        global $wp_filesystem;

        // Remove entire typography-stylist directory including fonts
        $wp_filesystem->rmdir($font_dir, true);
    } else {
        // Fallback to PHP functions if WP_Filesystem fails
        if (is_dir($font_dir)) {
            $files = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($font_dir, RecursiveDirectoryIterator::SKIP_DOTS),
                RecursiveIteratorIterator::CHILD_FIRST
            );

            foreach ($files as $file) {
                if ($file->isDir()) {
                    @rmdir($file->getRealPath());
                } else {
                    @unlink($file->getRealPath());
                }
            }

            @rmdir($font_dir);
        }
    }
}

// Clean up any orphaned post meta (though this plugin doesn't use post meta, good practice)
// Features are stored inline in post content, so no cleanup needed there

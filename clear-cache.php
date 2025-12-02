<?php
/**
 * Clear OpenType Stylist Transient Caches
 * Run this script to clear all OTS caches after making code changes
 *
 * Usage: php clear-cache.php
 */

// Load WordPress
define('WP_USE_THEMES', false);
require('../../../wp-load.php');

global $wpdb;

// Clear all OTS transients
$deleted = $wpdb->query(
    "DELETE FROM {$wpdb->options}
    WHERE option_name LIKE '_transient_ots_%'
    OR option_name LIKE '_transient_timeout_ots_%'"
);

echo "Cleared {$deleted} OpenType Stylist transient cache entries.\n";
echo "Cache cleared successfully!\n";

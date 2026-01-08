<?php
/**
 * PHPUnit bootstrap file for OpenType Stylist plugin tests
 */

// Load Composer autoloader
require_once dirname(__DIR__) . '/vendor/autoload.php';

// Load Brain Monkey
require_once dirname(__DIR__) . '/vendor/brain/monkey/inc/patchwork-loader.php';

// Define plugin constants for testing (if not already defined)
if (!defined('OTS_PLUGIN_DIR')) {
    define('OTS_PLUGIN_DIR', dirname(__DIR__));
}
if (!defined('OTS_PLUGIN_URL')) {
    define('OTS_PLUGIN_URL', 'http://localhost/wp-content/plugins/opentype-stylist/');
}
if (!defined('OTS_PLUGIN_BASENAME')) {
    define('OTS_PLUGIN_BASENAME', 'opentype-stylist/opentype-stylist.php');
}
if (!defined('OTS_VERSION')) {
    define('OTS_VERSION', '1.0.7');
}

// Define WordPress constants
if (!defined('ABSPATH')) {
    $absPath = getenv('WP_ABSPATH');
    if ($absPath === false || $absPath === '') {
        $absPath = dirname(__DIR__);
    }
    define('ABSPATH', rtrim($absPath, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR);
}

// WordPress test environment setup
\Brain\Monkey\setUp();

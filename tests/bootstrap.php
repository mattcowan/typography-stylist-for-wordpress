<?php
/**
 * PHPUnit bootstrap file for Typography Stylist plugin tests
 */

// Load Composer autoloader
require_once dirname(__DIR__) . '/vendor/autoload.php';

// Load Brain Monkey
require_once dirname(__DIR__) . '/vendor/brain/monkey/inc/patchwork-loader.php';

// Define plugin constants for testing (if not already defined)
if (!defined('TYPOST_PLUGIN_DIR')) {
    define('TYPOST_PLUGIN_DIR', dirname(__DIR__));
}
if (!defined('TYPOST_PLUGIN_URL')) {
    define('TYPOST_PLUGIN_URL', 'http://localhost/wp-content/plugins/opentype-stylist/');
}
if (!defined('TYPOST_PLUGIN_BASENAME')) {
    define('TYPOST_PLUGIN_BASENAME', 'typography-stylist/typography-stylist.php');
}
if (!defined('TYPOST_VERSION')) {
    define('TYPOST_VERSION', 'test-version');
}

// Define WordPress constants
if (!defined('ABSPATH')) {
    $absPath = getenv('WP_ABSPATH');
    if ($absPath === false || $absPath === '') {
        $absPath = dirname(__DIR__);
    }
    define('ABSPATH', rtrim($absPath, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR);
}

// Minimal WP_Error stand-in so tests can assert on error returns from REST
// callbacks. Only the accessors the plugin uses are implemented.
if (!class_exists('WP_Error')) {
    class WP_Error {
        private $code;
        private $message;
        private $data;

        public function __construct($code = '', $message = '', $data = '') {
            $this->code = $code;
            $this->message = $message;
            $this->data = $data;
        }

        public function get_error_code() {
            return $this->code;
        }

        public function get_error_message() {
            return $this->message;
        }

        public function get_error_data() {
            return $this->data;
        }
    }
}

// WordPress test environment setup
\Brain\Monkey\setUp();

<?php
namespace TypographyStylist\Tests;

use Brain\Monkey;
use PHPUnit\Framework\TestCase as PHPUnitTestCase;

/**
 * Base test case for all Typography Stylist tests
 */
abstract class TestCase extends PHPUnitTestCase {

    protected function setUp(): void {
        parent::setUp();
        Monkey\setUp();

        // Mock common WordPress functions
        $this->mockWordPressFunctions();
    }

    protected function tearDown(): void {
        Monkey\tearDown();
        parent::tearDown();
    }

    /**
     * Mock common WordPress functions used throughout the plugin
     */
    protected function mockWordPressFunctions() {
        // Mock sanitization functions
        Monkey\Functions\when('sanitize_text_field')->returnArg();
        Monkey\Functions\when('sanitize_key')->returnArg();
        Monkey\Functions\when('esc_url_raw')->returnArg();
        Monkey\Functions\when('esc_html__')->returnArg();
        Monkey\Functions\when('__')->returnArg();
        Monkey\Functions\when('wp_strip_all_tags')->returnArg();
        Monkey\Functions\when('esc_attr')->returnArg();
        Monkey\Functions\when('esc_html')->returnArg();

        // Mock WordPress paths
        Monkey\Functions\when('wp_upload_dir')->alias(function () {
            $baseDir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'wp-content' . DIRECTORY_SEPARATOR . 'uploads';
            $subdir  = '/2024/01';
            $path    = $baseDir . str_replace('/', DIRECTORY_SEPARATOR, $subdir);

            return [
                'basedir' => $baseDir,
                'baseurl' => 'http://localhost/wp-content/uploads',
                'path'    => $path,
                'url'     => 'http://localhost/wp-content/uploads' . $subdir,
                'subdir'  => $subdir,
                'error'   => false,
            ];
        });
        Monkey\Functions\when('get_site_url')->justReturn('http://localhost');
        Monkey\Functions\when('wp_parse_url')->alias(function($url, $component = -1) {
            return parse_url($url, $component);
        });

        // Mock WordPress hooks
        Monkey\Functions\when('add_action')->justReturn(true);
        Monkey\Functions\when('add_filter')->justReturn(true);
        Monkey\Functions\when('register_activation_hook')->justReturn(true);

        // Mock file system constants
        if (!defined('FS_CHMOD_FILE')) {
            define('FS_CHMOD_FILE', 0644);
        }
    }
}

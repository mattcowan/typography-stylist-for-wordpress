<?php
/**
 * Tests for the Typost methods import calls (#205): adding an Adobe Fonts
 * family or a font definition from a file's descriptor, the import
 * permission, and the Variable Fonts module's axis tags.
 */

namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use Brain\Monkey\Functions;

class ExportFontEntriesTest extends TestCase {

    /** @var array Simulated wp_options storage */
    private $options = array();

    protected function setUp(): void {
        parent::setUp();
        static $loaded = false;
        if (!$loaded) {
            require_once TYPOST_PLUGIN_DIR . '/typography-stylist.php';
            $loaded = true;
        }

        $options = &$this->options;
        Functions\when('get_option')->alias(function ($key, $default = false) use (&$options) {
            return array_key_exists($key, $options) ? $options[$key] : $default;
        });
        Functions\when('update_option')->alias(function ($key, $value) use (&$options) {
            $options[$key] = $value;
            return true;
        });
        Functions\when('current_time')->justReturn('2026-10-28 12:00:00');
        Functions\when('sanitize_title')->alias(function ($title) {
            return trim(preg_replace('/[^a-z0-9]+/', '-', strtolower((string) $title)), '-');
        });
        Functions\when('delete_transient')->justReturn(true);
        Functions\when('get_users')->justReturn(array());
        Functions\when('wp_cache_delete')->justReturn(true);
        Functions\when('wp_cache_flush')->justReturn(true);
        Functions\when('do_action')->justReturn(null);

        // clear_cache() runs wildcard transient deletes through $wpdb
        global $wpdb;
        $wpdb = new class {
            public $options = 'wp_options';
            public $usermeta = 'wp_usermeta';
            public function query($sql) {
                return 0;
            }
            public function prepare($sql, ...$args) {
                return $sql;
            }
            public function esc_like($text) {
                return $text;
            }
        };
    }

    private function typost() {
        return (new \ReflectionClass(\Typost::class))->newInstanceWithoutConstructor();
    }

    private function adobeDescriptor(array $fields = array()) {
        return \Typost_Export_Fonts::sanitize_descriptor($fields + array(
            'source'  => 'adobe',
            'family'  => 'Proxima Nova',
            'kit'     => 'abc1234',
            'kitName' => 'Brand',
            'cssUrl'  => 'https://use.typekit.net/abc1234.css',
        ));
    }

    public function test_an_adobe_family_is_stored_like_the_add_endpoint_stores_it() {
        $entry = $this->typost()->add_adobe_font_entry($this->adobeDescriptor(array('availableWeights' => array('400', '700'))));

        $this->assertSame('adobe-abc1234-proxima-nova', $entry['id']);
        $this->assertSame(1, $entry['font_id']);
        $this->assertSame('Proxima Nova', $entry['font_family']);
        $this->assertSame('adobe-abc1234', $entry['kit_id']);
        $this->assertSame('Brand', $entry['kit_name']);
        $this->assertSame('https://use.typekit.net/abc1234.css', $entry['css_url']);
        $this->assertSame(array('400', '700'), $entry['available_weights']);
        $this->assertSame(array($entry), $this->options['typost_adobe_fonts']);
    }

    public function test_a_family_joins_a_project_already_on_the_site() {
        $this->options['typost_adobe_fonts'] = array(array(
            'id' => 'adobe-abc1234-other', 'name' => 'Other', 'font_id' => 5, 'font_family' => 'Other',
            'kit_id' => 'adobe-abc1234', 'kit_name' => 'Site Project', 'css_url' => 'https://use.typekit.net/abc1234.css',
        ));
        $entry = $this->typost()->add_adobe_font_entry($this->adobeDescriptor(array('kitName' => 'From File')));

        $this->assertSame('Site Project', $entry['kit_name']);
        $this->assertArrayNotHasKey('available_weights', $entry);
        $this->assertCount(2, $this->options['typost_adobe_fonts']);
    }

    public function test_an_adobe_family_needs_a_typekit_url() {
        $descriptor = $this->adobeDescriptor();
        $descriptor['cssUrl'] = 'https://evil.example/abc1234.css';
        $this->assertFalse($this->typost()->add_adobe_font_entry($descriptor));
        $this->assertArrayNotHasKey('typost_adobe_fonts', $this->options);
    }

    public function test_a_font_definition_keeps_its_font_family_and_fallbacks() {
        $descriptor = \Typost_Export_Fonts::sanitize_descriptor(array(
            'source' => 'manual', 'name' => 'Theme Serif', 'family' => 'Theme Serif', 'fontFamily' => '"Theme Serif"', 'fallbacks' => 'Georgia, serif',
        ));
        $entry = $this->typost()->add_manual_font_entry($descriptor);

        $this->assertStringStartsWith('manual-theme-serif-', $entry['id']);
        $this->assertSame('"Theme Serif"', $entry['font_family']);
        $this->assertSame('Georgia, serif', $entry['fallbacks']);
        $this->assertSame(1, $entry['font_id']);
        $this->assertSame(array($entry), $this->options['typost_manual_fonts']);
    }

    public function test_import_needs_manage_options() {
        $typost = $this->typost();
        $export = new \Typost_Export($typost);

        Functions\when('current_user_can')->alias(function ($cap) {
            return 'edit_posts' === $cap;
        });
        $this->assertFalse($export->check_import_permissions());

        Functions\when('current_user_can')->justReturn(true);
        Functions\when('get_current_user_id')->justReturn(0);
        $this->assertTrue((bool) $export->check_import_permissions());
    }

    public function test_the_variable_fonts_module_reports_axis_tags_by_numeric_id() {
        if (!defined('TYPOST_VF_VERSION')) {
            define('TYPOST_VF_VERSION', 'test-version');
            define('TYPOST_VF_PLUGIN_DIR', TYPOST_PLUGIN_DIR . '/variable-fonts/');
            define('TYPOST_VF_PLUGIN_URL', 'http://localhost/variable-fonts/');
        }
        if (!defined('HOUR_IN_SECONDS')) {
            define('HOUR_IN_SECONDS', 3600);
        }
        require_once TYPOST_PLUGIN_DIR . '/variable-fonts/variable-fonts.php';
        Functions\when('get_transient')->justReturn(false);
        Functions\when('set_transient')->justReturn(true);

        $this->options['typost_custom_fonts'] = array(array('id' => 'kit-1-fraunces', 'name' => 'Fraunces', 'font_id' => 7));
        $this->options['typost_variable_font_axes'] = array('kit-1-fraunces' => array(
            array('tag' => 'wght', 'min' => 100, 'max' => 900),
            array('tag' => 'SOFT', 'min' => 0, 'max' => 100),
        ));

        $property = (new \ReflectionClass(\Typost::class))->getProperty('instance');
        $property->setAccessible(true);
        $saved = $property->getValue();
        $property->setValue(null, $this->typost());
        try {
            $module = (new \ReflectionClass(\Typost_Variable_Fonts::class))->newInstanceWithoutConstructor();
            $this->assertSame(array('wght', 'SOFT'), $module->font_axis_tags(null, 7));
            // Known module, font without axes: an empty list, not "unknown".
            $this->assertSame(array(), $module->font_axis_tags(null, 8));
        } finally {
            $property->setValue(null, $saved);
        }
    }
}

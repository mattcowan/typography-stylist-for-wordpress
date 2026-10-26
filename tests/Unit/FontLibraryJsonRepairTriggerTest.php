<?php
/**
 * #310: the one-time repair of Font Library posts registered with unslashed
 * JSON runs once, for a user who can manage options, and stores a flag.
 * The repair itself is covered in FontLibraryBridgeTest.
 *
 * @package Typography_Stylist
 */

namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use Brain\Monkey\Functions;

class FontLibraryJsonRepairTriggerTest extends TestCase {

    /** @var array Simulated wp_options storage */
    private $options = array();

    protected function setUp(): void {
        parent::setUp();
        $this->options = array();
        $options = &$this->options;

        Functions\when('get_option')->alias(function ($key, $default = false) use (&$options) {
            return array_key_exists($key, $options) ? $options[$key] : $default;
        });
        Functions\when('update_option')->alias(function ($key, $value) use (&$options) {
            $options[$key] = $value;
            return true;
        });
        Functions\when('post_type_exists')->justReturn(true);
    }

    private function getPluginInstance() {
        static $loaded = false;
        if (!$loaded) {
            require_once TYPOST_PLUGIN_DIR . '/typography-stylist.php';
            $loaded = true;
        }
        return \Typost::get_instance();
    }

    public function test_runs_once_and_stores_the_flag() {
        Functions\when('current_user_can')->justReturn(true);

        $this->getPluginInstance()->maybe_repair_font_library_json();

        $this->assertTrue($this->options['typost_font_library_json_repaired']);
    }

    public function test_does_not_run_again_after_the_flag_is_stored() {
        Functions\when('current_user_can')->justReturn(true);
        $this->options['typost_font_library_json_repaired'] = true;
        Functions\expect('get_post')->never();
        // An entry the repair would look at if it ran
        $this->options['typost_custom_fonts'] = array(array('font_id' => 7, 'wp_post_id' => 100));

        $this->getPluginInstance()->maybe_repair_font_library_json();

        $this->assertTrue($this->options['typost_font_library_json_repaired']);
    }

    public function test_waits_for_a_user_who_can_manage_options() {
        Functions\when('current_user_can')->justReturn(false);

        $this->getPluginInstance()->maybe_repair_font_library_json();

        $this->assertArrayNotHasKey('typost_font_library_json_repaired', $this->options);
    }
}

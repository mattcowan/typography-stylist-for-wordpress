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

    /** @var array Autoload argument passed for each option */
    private $autoload = array();

    protected function setUp(): void {
        parent::setUp();
        $this->options = array();
        $this->autoload = array();
        $options = &$this->options;

        Functions\when('get_option')->alias(function ($key, $default = false) use (&$options) {
            return array_key_exists($key, $options) ? $options[$key] : $default;
        });
        $autoload = &$this->autoload;
        Functions\when('update_option')->alias(function ($key, $value, $autoload_arg = null) use (&$options, &$autoload) {
            $options[$key] = $value;
            $autoload[$key] = $autoload_arg;
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
        $plugin = \Typost::get_instance();
        // Fresh modules, so no font list cached by an earlier test leaks in
        foreach (array('font_sources', 'font_library_bridge') as $prop) {
            $ref = new \ReflectionProperty(\Typost::class, $prop);
            $ref->setAccessible(true);
            $ref->setValue($plugin, null);
        }
        return $plugin;
    }

    public function test_runs_once_and_stores_the_flag() {
        Functions\when('current_user_can')->justReturn(true);

        $this->getPluginInstance()->maybe_repair_font_library_json();

        $this->assertTrue($this->options['typost_font_library_json_repaired']);
        $this->assertFalse($this->autoload['typost_font_library_json_repaired'], 'The flag is read only on admin requests, so it is not autoloaded');
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

    public function test_runs_again_after_a_failed_rewrite() {
        Functions\when('current_user_can')->justReturn(true);
        // One owned family whose JSON does not decode, and a rewrite that fails
        $this->options['typost_custom_fonts'] = array(array(
            'id'         => 'kit-a',
            'name'       => 'EB Garamond',
            'font_id'    => 7,
            'wp_post_id' => 100,
            'font_faces' => array(),
        ));
        Functions\when('get_post')->justReturn((object) array(
            'ID'           => 100,
            'post_type'    => 'wp_font_family',
            'post_name'    => 'eb-garamond',
            'post_content' => '{"fontFamily":""EB Garamond""}',
        ));
        Functions\when('get_post_meta')->justReturn('7');
        Functions\when('get_posts')->justReturn(array());
        Functions\when('wp_json_encode')->alias('json_encode');
        Functions\when('wp_slash')->alias('addslashes');
        Functions\expect('wp_update_post')->twice()->andReturn(0, 100);

        $plugin = $this->getPluginInstance();
        $plugin->maybe_repair_font_library_json();
        $this->assertArrayNotHasKey('typost_font_library_json_repaired', $this->options, 'A failed rewrite must leave the flag unset');

        $plugin->maybe_repair_font_library_json();
        $this->assertTrue($this->options['typost_font_library_json_repaired']);
    }

    public function test_waits_for_a_user_who_can_manage_options() {
        Functions\when('current_user_can')->justReturn(false);

        $this->getPluginInstance()->maybe_repair_font_library_json();

        $this->assertArrayNotHasKey('typost_font_library_json_repaired', $this->options);
    }
}

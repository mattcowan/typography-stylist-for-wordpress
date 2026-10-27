<?php
/**
 * #322: the Glyphs and Paragraph Styles toolbar buttons are on by default.
 * Each module turns its button on once, behind a stored flag, and then keeps
 * what the author sets in Options.
 *
 * @package Typography_Stylist
 */

namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use Brain\Monkey\Functions;

class ToolbarButtonsDefaultOnTest extends TestCase {

    /** @var array Simulated wp_options storage */
    private $options = array();

    /** @var array Autoload argument passed for each option */
    private $autoload = array();

    protected function setUp(): void {
        parent::setUp();
        $this->options  = array();
        $this->autoload = array();
        $options        = &$this->options;
        $autoload       = &$this->autoload;

        Functions\when('get_option')->alias(function ($key, $default = false) use (&$options) {
            return array_key_exists($key, $options) ? $options[$key] : $default;
        });
        Functions\when('update_option')->alias(function ($key, $value, $autoload_arg = null) use (&$options, &$autoload) {
            $options[$key]  = $value;
            $autoload[$key] = $autoload_arg;
            return true;
        });
    }

    /**
     * The two modules, each without its constructor (which registers hooks).
     *
     * @return array[] Class name, toolbar option, flag option.
     */
    public static function modules() {
        return array(
            'glyphs panel'     => array('Typost_Glyphs_Panel', 'typost_glyphs_toolbar_button', 'typost_glyphs_toolbar_button_default_on'),
            'paragraph styles' => array('Typost_Paragraph_Styles', 'typost_ps_toolbar_button', 'typost_ps_toolbar_button_default_on'),
        );
    }

    private function instance($class) {
        static $loaded = false;
        if (!defined('HOUR_IN_SECONDS')) {
            define('HOUR_IN_SECONDS', 3600);
        }
        if (!$loaded) {
            Functions\when('plugin_dir_path')->alias(function ($file) {
                return dirname($file) . '/';
            });
            Functions\when('plugin_dir_url')->justReturn('http://localhost/module/');
            require_once TYPOST_PLUGIN_DIR . '/glyphs-panel/glyphs-panel.php';
            require_once TYPOST_PLUGIN_DIR . '/paragraph-styles/paragraph-styles.php';
            $loaded = true;
        }
        return (new \ReflectionClass($class))->newInstanceWithoutConstructor();
    }

    private function enabled($module) {
        $method = new \ReflectionMethod($module, 'toolbar_button_enabled');
        $method->setAccessible(true);
        return $method->invoke($module);
    }

    /**
     * @dataProvider modules
     */
    public function test_a_new_install_shows_the_button_with_no_options_saved($class, $option) {
        $this->assertTrue($this->enabled($this->instance($class)));
    }

    /**
     * @dataProvider modules
     */
    public function test_the_update_turns_off_buttons_on_once_and_stores_the_flag($class, $option, $flag) {
        $module                 = $this->instance($class);
        $this->options[$option] = '0';

        $module->maybe_turn_on_toolbar_button();

        $this->assertSame('1', $this->options[$option]);
        $this->assertTrue($this->enabled($module));
        $this->assertTrue($this->options[$flag]);
        $this->assertFalse($this->autoload[$flag], 'The flag is read only on admin requests, so it is not autoloaded');
    }

    /**
     * @dataProvider modules
     */
    public function test_a_button_turned_off_after_the_update_stays_off($class, $option, $flag) {
        $module = $this->instance($class);
        $module->maybe_turn_on_toolbar_button();

        // The author unchecks the box in Options; the save stores '0'
        $this->options[$option] = '0';
        $module->maybe_turn_on_toolbar_button();

        $this->assertSame('0', $this->options[$option]);
        $this->assertFalse($this->enabled($module));
    }

    /**
     * @dataProvider modules
     */
    public function test_the_options_checkbox_shows_the_state_the_editor_uses($class, $option) {
        $module = $this->instance($class);
        Functions\when('esc_attr')->returnArg();
        Functions\when('esc_html_e')->justReturn(null);
        Functions\when('checked')->alias(function ($value) {
            echo $value ? ' checked=\'checked\'' : '';
        });

        foreach (array(array(), array($option => '1'), array($option => '0')) as $stored) {
            $this->options = $stored;
            ob_start();
            $module->render_options_row();
            $html = ob_get_clean();
            $this->assertSame($this->enabled($module), false !== strpos($html, "checked='checked'"));
        }
    }
}

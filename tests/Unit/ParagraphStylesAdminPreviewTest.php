<?php
/**
 * Tests for the Paragraph Styles admin tab preview (issue #220):
 * Typost_Paragraph_Styles::resolve_font_label() and the style CSS that
 * enqueue_admin_assets() adds to the settings page.
 */

namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use Brain\Monkey\Functions;

class ParagraphStylesAdminPreviewTest extends TestCase {

    private function freshInstance() {
        static $loaded = false;
        if (!defined('HOUR_IN_SECONDS')) {
            define('HOUR_IN_SECONDS', 3600);
        }
        if (!$loaded) {
            Functions\when('plugin_dir_path')->justReturn(TYPOST_PLUGIN_DIR . '/paragraph-styles/');
            Functions\when('plugin_dir_url')->justReturn('http://localhost/paragraph-styles/');
            require_once TYPOST_PLUGIN_DIR . '/paragraph-styles/paragraph-styles.php';
            $loaded = true;
        }
        $reflection = new \ReflectionClass(\Typost_Paragraph_Styles::class);
        return $reflection->newInstanceWithoutConstructor();
    }

    // -------------------------------------------------------------------------
    // resolve_font_label()
    // -------------------------------------------------------------------------

    public function test_no_font_set_is_default() {
        $this->freshInstance();
        $this->assertSame(
            array('status' => 'default', 'name' => '', 'font_id' => 0),
            \Typost_Paragraph_Styles::resolve_font_label(0, array(36 => 'Fraunces'), array())
        );
    }

    public function test_existing_font_is_found_by_name() {
        $this->freshInstance();
        $this->assertSame(
            array('status' => 'found', 'name' => 'Fraunces', 'font_id' => 36),
            \Typost_Paragraph_Styles::resolve_font_label(36, array(36 => 'Fraunces'), array())
        );
    }

    public function test_deleted_font_with_replacement_names_the_replacement() {
        $this->freshInstance();
        $this->assertSame(
            array('status' => 'replaced', 'name' => 'EB Garamond', 'font_id' => 37),
            \Typost_Paragraph_Styles::resolve_font_label(16, array(37 => 'EB Garamond'), array(16 => 37))
        );
    }

    public function test_replacement_chain_is_followed() {
        $this->freshInstance();
        // 16 was replaced by 29, then 29 was deleted and replaced by 37.
        $this->assertSame(
            array('status' => 'replaced', 'name' => 'EB Garamond', 'font_id' => 37),
            \Typost_Paragraph_Styles::resolve_font_label(16, array(37 => 'EB Garamond'), array(16 => 29, 29 => 37))
        );
    }

    public function test_replaced_result_carries_the_replacement_id_not_the_saved_one() {
        $this->freshInstance();
        // Deleted font 16 replaced by manual font 40: the admin tab checks the
        // returned font_id against the manual-font set to show its note.
        $result = \Typost_Paragraph_Styles::resolve_font_label(16, array(40 => 'Theme Serif'), array(16 => 40));
        $this->assertSame('replaced', $result['status']);
        $this->assertSame(40, $result['font_id']);
    }

    public function test_deleted_font_without_replacement_is_missing() {
        $this->freshInstance();
        $this->assertSame(
            array('status' => 'missing', 'name' => '', 'font_id' => 0),
            \Typost_Paragraph_Styles::resolve_font_label(99, array(36 => 'Fraunces'), array())
        );
    }

    public function test_replacement_that_was_also_deleted_is_missing() {
        $this->freshInstance();
        $this->assertSame(
            array('status' => 'missing', 'name' => '', 'font_id' => 0),
            \Typost_Paragraph_Styles::resolve_font_label(16, array(36 => 'Fraunces'), array(16 => 29))
        );
    }

    public function test_cyclic_mapping_terminates_as_missing() {
        $this->freshInstance();
        $this->assertSame(
            array('status' => 'missing', 'name' => '', 'font_id' => 0),
            \Typost_Paragraph_Styles::resolve_font_label(16, array(), array(16 => 29, 29 => 16))
        );
    }

    public function test_non_array_inputs_and_string_ids_are_tolerated() {
        $this->freshInstance();
        $this->assertSame(
            array('status' => 'missing', 'name' => '', 'font_id' => 0),
            \Typost_Paragraph_Styles::resolve_font_label('12', null, 'not-an-array')
        );
        $this->assertSame(
            array('status' => 'default', 'name' => '', 'font_id' => 0),
            \Typost_Paragraph_Styles::resolve_font_label('', array(), array())
        );
    }

    // -------------------------------------------------------------------------
    // enqueue_admin_assets()
    // -------------------------------------------------------------------------

    /**
     * Stub the enqueue calls and record every wp_add_inline_style() call.
     *
     * @return \ArrayObject Recorded [handle, css] pairs.
     */
    private function stubAdminEnqueue() {
        Functions\when('wp_enqueue_script')->justReturn(null);
        Functions\when('wp_set_script_translations')->justReturn(true);
        Functions\when('wp_enqueue_style')->justReturn(null);
        Functions\when('wp_localize_script')->justReturn(true);
        Functions\when('rest_url')->justReturn('http://localhost/wp-json/typost/v1/paragraph-styles');
        Functions\when('wp_create_nonce')->justReturn('nonce');

        $calls = new \ArrayObject();
        Functions\when('wp_add_inline_style')->alias(function ($handle, $css) use ($calls) {
            $calls->append(array($handle, $css));
            return true;
        });
        return $calls;
    }

    public function test_style_css_is_added_to_the_admin_style_handle() {
        $module = $this->freshInstance();
        $calls  = $this->stubAdminEnqueue();
        Functions\when('get_transient')->justReturn('.typost-ps-3 { font-weight: 700; }');

        $module->enqueue_admin_assets();

        $this->assertSame(
            array(array('typost-paragraph-styles-admin', '.typost-ps-3 { font-weight: 700; }')),
            $calls->getArrayCopy()
        );
    }

    public function test_repeat_calls_do_not_add_the_style_css_again() {
        $module = $this->freshInstance();
        $calls  = $this->stubAdminEnqueue();
        Functions\when('get_transient')->justReturn('.typost-ps-3 { font-weight: 700; }');

        // A precaution, not a live bug: core fires typost_admin_assets once
        // per page load (admin_enqueue_scripts, #226).
        $module->enqueue_admin_assets();
        $module->enqueue_admin_assets();

        $this->assertSame(
            array(array('typost-paragraph-styles-admin', '.typost-ps-3 { font-weight: 700; }')),
            $calls->getArrayCopy()
        );
    }

    public function test_no_inline_style_when_there_are_no_styles() {
        $module = $this->freshInstance();
        $calls  = $this->stubAdminEnqueue();
        Functions\when('get_transient')->justReturn('');

        $module->enqueue_admin_assets();

        $this->assertCount(0, $calls);
    }
}

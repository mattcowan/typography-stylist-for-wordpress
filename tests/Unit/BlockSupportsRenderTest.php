<?php
namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use Brain\Monkey\Functions;

/**
 * Tests for the render_block filter that writes a Typography Stylist block's
 * sidebar settings (color, spacing, alignment, anchor, CSS class) to its
 * wrapper. save.js writes a bare wrapper and the block is apiVersion 3, so
 * core adds nothing to the saved markup.
 */
class BlockSupportsRenderTest extends TestCase {

    const SAVED = '<div class="wp-block-typost"><h2 class="visually-hidden">Own</h2><h2 style="font-weight:400" class="typost-styled" aria-hidden="true">Own</h2></div>';
    const TAIL = '<h2 class="visually-hidden">Own</h2><h2 style="font-weight:400" class="typost-styled" aria-hidden="true">Own</h2></div>';

    protected function setUp(): void {
        parent::setUp();

        static $loaded = false;
        if (!$loaded) {
            require_once TYPOST_PLUGIN_DIR . '/typography-stylist.php';
            if (!class_exists('WP_Block_Supports', false)) {
                eval('class WP_Block_Supports {
                    public static $block_to_render = null;
                    public static $fixture = array();
                    public static $seen = null;
                    public static function get_instance() { return new self(); }
                    public function apply_block_supports() { self::$seen = self::$block_to_render; return self::$fixture; }
                }');
            }
            $loaded = true;
        }
        Functions\when('esc_attr')->alias(function ($value) {
            return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
        });
    }

    private function render($html, $block, $support = array()) {
        \WP_Block_Supports::$fixture = $support;
        \WP_Block_Supports::$seen = null;
        $reflection = new \ReflectionClass(\Typost::class);
        $plugin = $reflection->newInstanceWithoutConstructor();
        return $plugin->add_block_support_attributes($html, $block);
    }

    public function test_classes_style_and_id_reach_the_wrapper() {
        $out = $this->render(self::SAVED, array('blockName' => 'typost/block', 'attrs' => array('anchor' => 'a')), array(
            'class' => 'alignwide qa-custom wp-block-typost-block has-text-color has-background',
            'style' => 'color:#ff0000;background-color:#00ff00; margin-top:77px;',
            'id'    => 'qa-anchor',
        ));

        $this->assertSame(
            '<div id="qa-anchor" class="wp-block-typost alignwide qa-custom has-text-color has-background" style="color:#ff0000;background-color:#00ff00; margin-top:77px;">' . self::TAIL,
            $out
        );
    }

    public function test_a_block_with_nothing_set_stays_byte_identical() {
        $out = $this->render(self::SAVED, array('blockName' => 'typost/block', 'attrs' => array('content' => 'Own')), array(
            'class' => 'wp-block-typost-block',
        ));

        $this->assertSame(self::SAVED, $out);
    }

    public function test_a_block_with_no_attributes_never_reaches_the_api() {
        $out = $this->render(self::SAVED, array('blockName' => 'typost/block', 'attrs' => array()), array('class' => 'has-text-color'));

        $this->assertSame(self::SAVED, $out);
        $this->assertNull(\WP_Block_Supports::$seen);
    }

    public function test_other_blocks_are_left_alone() {
        $html = '<div class="wp-block-typost">Other</div>';
        $out = $this->render($html, array('blockName' => 'core/group', 'attrs' => array('align' => 'wide')), array('class' => 'alignwide'));

        $this->assertSame($html, $out);
        $this->assertNull(\WP_Block_Supports::$seen);
    }

    public function test_the_anchor_attribute_is_used_when_core_has_no_anchor_support() {
        // WordPress before 7.0 has no block-supports/anchor.php
        $out = $this->render(self::SAVED, array('blockName' => 'typost/block', 'attrs' => array('anchor' => 'old-anchor')), array(
            'class' => 'wp-block-typost-block',
        ));

        $this->assertSame('<div id="old-anchor" class="wp-block-typost">' . self::TAIL, $out);
    }

    public function test_attribute_values_are_escaped() {
        $out = $this->render(self::SAVED, array('blockName' => 'typost/block', 'attrs' => array('className' => 'x')), array(
            'class' => 'a"onclick="b',
            'style' => 'color:"red"',
            'id'    => '"><script>',
        ));

        $this->assertStringNotContainsString('<script>', $out);
        $this->assertStringNotContainsString('onclick="b', $out);
        $this->assertStringStartsWith('<div id="&quot;&gt;&lt;script&gt;" class="wp-block-typost', $out);
    }

    public function test_the_block_being_rendered_is_restored_after_the_call() {
        $outer = array('blockName' => 'core/group');
        \WP_Block_Supports::$block_to_render = $outer;
        $block = array('blockName' => 'typost/block', 'attrs' => array('align' => 'wide'));

        $this->render(self::SAVED, $block, array('class' => 'alignwide'));

        $this->assertSame($block, \WP_Block_Supports::$seen);
        $this->assertSame($outer, \WP_Block_Supports::$block_to_render);
        \WP_Block_Supports::$block_to_render = null;
    }

    public function test_only_the_wrapper_changes_when_the_html_holds_a_second_block_class() {
        $html = "\n" . '<div class="wp-block-typost"><p>Text <span class="wp-block-typost">in</span></p></div>';
        $out = $this->render($html, array('blockName' => 'typost/block', 'attrs' => array('align' => 'full')), array('class' => 'alignfull'));

        $this->assertSame("\n" . '<div class="wp-block-typost alignfull"><p>Text <span class="wp-block-typost">in</span></p></div>', $out);
    }

    public function test_a_class_core_added_first_is_kept_and_the_settings_still_apply() {
        // Core's layout support runs at the same priority and is registered
        // first, so a block in a Row reaches this filter with its class added
        $html = '<div class="wp-block-typost wp-container-content-ceb7f5b3"><p>Text</p></div>';
        $out = $this->render($html, array('blockName' => 'typost/block', 'attrs' => array('style' => array())), array(
            'class' => 'wp-block-typost-block has-text-color',
            'style' => 'color:#ff0000;',
        ));

        $this->assertSame(
            '<div class="wp-block-typost wp-container-content-ceb7f5b3 has-text-color" style="color:#ff0000;"><p>Text</p></div>',
            $out
        );
    }

    public function test_a_class_already_on_the_wrapper_is_not_written_twice() {
        $html = '<div class="wp-block-typost alignwide"><p>Text</p></div>';
        $out = $this->render($html, array('blockName' => 'typost/block', 'attrs' => array('align' => 'wide')), array('class' => 'alignwide'));

        $this->assertSame($html, $out);
    }

    public function test_a_first_div_that_is_not_the_block_wrapper_is_left_alone() {
        foreach (array('<div class="wp-block-typost-other"><p>Text</p></div>', '<div class="other"><div class="wp-block-typost">x</div></div>') as $html) {
            $out = $this->render($html, array('blockName' => 'typost/block', 'attrs' => array('align' => 'wide')), array('class' => 'alignwide'));

            $this->assertSame($html, $out);
        }
    }

    public function test_html_with_another_wrapper_form_is_left_alone() {
        $html = '<div data-x="1" class="wp-block-typost"><p>Text</p></div>';
        $out = $this->render($html, array('blockName' => 'typost/block', 'attrs' => array('align' => 'full')), array('class' => 'alignfull'));

        $this->assertSame($html, $out);
    }
}

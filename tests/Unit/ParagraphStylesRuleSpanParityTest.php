<?php
/**
 * The span a GREP rule and a nested rule wrap text in (#358).
 *
 * Typost_PS_Grep::open_tag() and Typost_PS_Nested::open_tag() write the same
 * span except for one class (typost-grep or typost-nested), which keeps the
 * two kinds apart. The rest (typost-styled, data-style-id and the
 * data-typost-font-id that the frontend font scan reads) must stay the same.
 */

namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use Brain\Monkey\Functions;

class ParagraphStylesRuleSpanParityTest extends TestCase {

    protected function setUp(): void {
        parent::setUp();
        if (!defined('HOUR_IN_SECONDS')) {
            define('HOUR_IN_SECONDS', 3600);
        }
        Functions\when('plugin_dir_path')->justReturn(TYPOST_PLUGIN_DIR . '/paragraph-styles/');
        Functions\when('plugin_dir_url')->justReturn('http://localhost/paragraph-styles/');
        require_once TYPOST_PLUGIN_DIR . '/paragraph-styles/paragraph-styles.php';
    }

    public function tags() {
        return array(
            'style only'          => array(5, 0),
            'style and font'      => array(5, 12),
            'string ids'          => array('7', '3'),
            'junk ids'            => array('7x', 'abc'),
            'negative font'       => array(2, -4),
        );
    }

    /**
     * @dataProvider tags
     */
    public function test_the_spans_differ_only_in_their_kind_class($style_id, $font_id) {
        $grep   = \Typost_PS_Grep::open_tag($style_id, $font_id);
        $nested = \Typost_PS_Nested::open_tag($style_id, $font_id);
        $this->assertStringContainsString('class="typost-styled typost-grep"', $grep);
        $this->assertStringContainsString('class="typost-styled typost-nested"', $nested);
        $this->assertSame(str_replace('typost-grep', 'typost-nested', $grep), $nested);
    }
}

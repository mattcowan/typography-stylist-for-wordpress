<?php
/**
 * Tests for alignment, word spacing and line breaking in paragraph styles (#207).
 *
 * generate_style_css() must match buildStyleCssBlock() in ps-utils.js byte
 * for byte, so both read paragraph-styles/__tests__/fixtures/alignment-css.json.
 */

namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use Brain\Monkey\Functions;

class ParagraphStylesAlignmentTest extends TestCase {

    private function instance() {
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
        Functions\when('sanitize_text_field')->returnArg();
        Functions\when('sanitize_key')->returnArg();
        Functions\when('absint')->alias(function ($v) { return abs((int) $v); });

        $reflection = new \ReflectionClass(\Typost_Paragraph_Styles::class);
        return $reflection->newInstanceWithoutConstructor();
    }

    private function sanitize(array $raw, $keep_empty = false) {
        $instance   = $this->instance();
        $reflection = new \ReflectionClass(\Typost_Paragraph_Styles::class);
        $method     = $reflection->getMethod('sanitize_properties');
        $method->setAccessible(true);
        return $method->invoke($instance, $raw, $keep_empty);
    }

    public function fixtureCases() {
        $json  = file_get_contents(TYPOST_PLUGIN_DIR . '/paragraph-styles/__tests__/fixtures/alignment-css.json');
        $cases = array();
        foreach (json_decode($json, true)['cases'] as $case) {
            $cases[$case['label']] = array($case['properties'], isset($case['legacyId']) ? $case['legacyId'] : '', $case['css']);
        }
        return $cases;
    }

    /**
     * @dataProvider fixtureCases
     */
    public function test_css_matches_the_shared_fixture($properties, $legacy_id, $css) {
        $style = array('id' => 8, 'properties' => $properties);
        if ('' !== $legacy_id) {
            $style['legacyId'] = $legacy_id;
        }
        $this->assertSame($css, $this->instance()->generate_style_css($style, array()));
    }

    public function test_the_fixture_is_read() {
        // A control: an empty provider would let every case above pass by never running.
        $this->assertGreaterThanOrEqual(8, count($this->fixtureCases()));
    }

    public function test_sanitize_keeps_valid_values() {
        $clean = $this->sanitize(array(
            'alignment'   => 'justify',
            'alignLast'   => 'center',
            'wordSpacing' => '-25',
            'textWrap'    => 'pretty',
        ));
        $this->assertSame(array('alignment' => 'justify', 'alignLast' => 'center', 'wordSpacing' => -25, 'textWrap' => 'pretty'), $clean);
    }

    public function test_sanitize_drops_unknown_values_and_a_last_line_without_justify() {
        $clean = $this->sanitize(array(
            'alignment' => 'left',
            'alignLast' => 'center',
            'textWrap'  => 'stable',
        ));
        $this->assertSame(array(), $clean);

        $clean = $this->sanitize(array('alignment' => 'center', 'alignLast' => 'center'));
        $this->assertSame(array('alignment' => 'center'), $clean);

        // Start is the default for the last line, never stored
        $clean = $this->sanitize(array('alignment' => 'justify', 'alignLast' => 'start'));
        $this->assertSame(array('alignment' => 'justify'), $clean);
    }

    public function test_sanitize_keeps_the_empty_values_only_for_a_style_with_a_parent() {
        $raw = array('alignment' => '', 'textWrap' => '', 'wordSpacing' => 0);
        $this->assertSame(array('wordSpacing' => 0), $this->sanitize($raw));
        $this->assertSame(array('alignment' => '', 'wordSpacing' => 0, 'textWrap' => ''), $this->sanitize($raw, true));
    }

    public function test_card_details_list_the_settings() {
        $this->instance();
        $html = \Typost_Paragraph_Styles::render_card_details(
            array('alignment' => 'justify', 'alignLast' => 'center', 'wordSpacing' => 50, 'textWrap' => 'balance'),
            array('status' => 'default', 'name' => '', 'font_id' => 0)
        );
        $this->assertStringContainsString('<strong>Alignment:</strong> Justify (last line: Center)', $html);
        $this->assertStringContainsString('<strong>Word Spacing:</strong> 0.05em', $html);
        $this->assertStringContainsString('<strong>Line Breaking:</strong> Balance lines', $html);
    }

    public function test_card_details_leave_them_out_for_fit_to_width() {
        $this->instance();
        $html = \Typost_Paragraph_Styles::render_card_details(
            array('fontSize' => 'fit', 'fontSizeMin' => 16, 'fontSizePreferred' => 24, 'fontSizeMax' => 64, 'alignment' => 'center', 'wordSpacing' => 50, 'textWrap' => 'balance'),
            array('status' => 'default', 'name' => '', 'font_id' => 0)
        );
        $this->assertStringNotContainsString('Alignment:', $html);
        $this->assertStringNotContainsString('Word Spacing:', $html);
        $this->assertStringNotContainsString('Line Breaking:', $html);
    }

    public function test_card_details_show_none_for_an_unset_inherited_value() {
        $this->instance();
        $html = \Typost_Paragraph_Styles::render_card_details(
            array(),
            array('status' => 'default', 'name' => '', 'font_id' => 0),
            array('own' => array('alignment' => '', 'textWrap' => '', 'wordSpacing' => 0), 'parent' => 'Body')
        );
        $this->assertStringContainsString('<strong>Alignment:</strong> None', $html);
        $this->assertStringContainsString('<strong>Line Breaking:</strong> None', $html);
        $this->assertStringContainsString('<strong>Word Spacing:</strong> None', $html);
    }
}

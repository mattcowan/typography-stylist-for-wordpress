<?php
/**
 * Tests for indents and paragraph spacing in paragraph styles (#199).
 *
 * generate_style_css() must match buildStyleCssBlock() in ps-utils.js byte
 * for byte, so both read
 * paragraph-styles/__tests__/fixtures/paragraph-layout-css.json.
 */

namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use Brain\Monkey\Functions;

class ParagraphStylesLayoutTest extends TestCase {

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

    private function details(array $props, $inheritance = null) {
        $this->instance();
        return \Typost_Paragraph_Styles::render_card_details($props, array('status' => 'default', 'name' => '', 'font_id' => 0), $inheritance);
    }

    public function fixtureCases() {
        $json  = file_get_contents(TYPOST_PLUGIN_DIR . '/paragraph-styles/__tests__/fixtures/paragraph-layout-css.json');
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
        $this->assertGreaterThanOrEqual(12, count($this->fixtureCases()));
    }

    /**
     * @dataProvider lengthCases
     */
    public function test_normalize_length($value, $allow_negative, $expected) {
        $this->instance();
        $this->assertSame($expected, \Typost_Paragraph_Styles::normalize_length($value, $allow_negative));
    }

    public function lengthCases() {
        // Same cases as normalizeLength in paragraph-layout.test.js
        return array(
            array('1.5em', false, '1.5em'),
            array(' 1.50EM ', false, '1.5em'),
            array('24px', false, '24px'),
            array('.5em', false, '0.5em'),
            array('1.0005em', false, '1.001em'),
            array('2000px', false, '1000px'),
            array('80em', false, '50em'),
            array('-1.5em', true, '-1.5em'),
            array('-1.5em', false, ''),
            array('0em', false, ''),
            array('0.0004px', false, ''),
            array('1.5', false, ''),
            array('1.5rem', false, ''),
            array('1e2px', false, ''),
            array(12, false, ''),
            array(null, false, ''),
        );
    }

    public function test_sanitize_keeps_valid_values_in_their_stored_form() {
        $clean = $this->sanitize(array(
            'indentStart'     => ' 2EM',
            'indentEnd'       => '12px',
            'firstLineIndent' => '1.50em',
            'indentAfterSame' => true,
            'spaceBefore'     => '.5em',
            'spaceAfter'      => '9999px',
        ));
        $this->assertSame(array(
            'indentStart'     => '2em',
            'indentEnd'       => '12px',
            'spaceBefore'     => '0.5em',
            'spaceAfter'      => '1000px',
            'firstLineIndent' => '1.5em',
            'indentAfterSame' => true,
        ), $clean);
    }

    public function test_sanitize_drops_invalid_values_and_the_option_without_a_positive_indent() {
        $this->assertSame(array(), $this->sanitize(array(
            'indentStart'     => '-2em',
            'indentEnd'       => '3rem',
            'spaceBefore'     => 'calc(1em + 2px)',
            'spaceAfter'      => '0px',
            'indentAfterSame' => true,
        )));
        // A hanging indent keeps its value, not the option
        $this->assertSame(array('firstLineIndent' => '-1em'), $this->sanitize(array('firstLineIndent' => '-1em', 'indentAfterSame' => true)));
        // The option is only true
        $this->assertSame(array('firstLineIndent' => '1em'), $this->sanitize(array('firstLineIndent' => '1em', 'indentAfterSame' => 'yes')));
    }

    public function test_sanitize_keeps_the_empty_values_only_for_a_style_with_a_parent() {
        $raw = array('indentStart' => '', 'indentEnd' => '', 'firstLineIndent' => '', 'spaceBefore' => '', 'spaceAfter' => '');
        $this->assertSame(array(), $this->sanitize($raw));
        $this->assertSame(array('indentStart' => '', 'indentEnd' => '', 'spaceBefore' => '', 'spaceAfter' => '', 'firstLineIndent' => ''), $this->sanitize($raw, true));
    }

    public function test_card_details_list_the_indents_and_spacing() {
        $html = $this->details(array('indentStart' => '2em', 'indentEnd' => '12px', 'firstLineIndent' => '1.5em', 'indentAfterSame' => true, 'spaceBefore' => '0.5em', 'spaceAfter' => '24px'));
        $this->assertStringContainsString('<strong>Left Indent:</strong> 2em', $html);
        $this->assertStringContainsString('<strong>Right Indent:</strong> 12px', $html);
        $this->assertStringContainsString('<strong>First Line:</strong> 1.5em (after the same style only)', $html);
        $this->assertStringContainsString('<strong>Space Before:</strong> 0.5em', $html);
        $this->assertStringContainsString('<strong>Space After:</strong> 24px', $html);
    }

    public function test_card_details_leave_the_indents_out_for_fit_to_width() {
        $html = $this->details(array('fontSize' => 'fit', 'fontSizeMin' => 16, 'fontSizePreferred' => 24, 'fontSizeMax' => 64, 'indentStart' => '2em', 'firstLineIndent' => '1em', 'spaceAfter' => '1em'));
        $this->assertStringNotContainsString('Left Indent:', $html);
        $this->assertStringNotContainsString('First Line:', $html);
        $this->assertStringContainsString('<strong>Space After:</strong> 1em', $html);
    }

    public function test_card_details_show_none_for_an_unset_inherited_value() {
        $html = $this->details(array(), array('own' => array('firstLineIndent' => '', 'spaceBefore' => ''), 'parent' => 'Body'));
        $this->assertStringContainsString('<strong>First Line:</strong> None', $html);
        $this->assertStringContainsString('<strong>Space Before:</strong> None', $html);
        $this->assertStringNotContainsString('Left Indent:', $html);
    }

    public function test_a_style_without_the_new_keys_writes_no_new_css() {
        $css = $this->instance()->generate_style_css(array('id' => 3, 'properties' => array('fontWeight' => '700', 'alignment' => 'center', 'initialHang' => 0.1)), array());
        $this->assertStringNotContainsString('padding-inline', $css);
        $this->assertStringNotContainsString('margin-block', $css);
        $this->assertStringNotContainsString(':has(', $css);
    }
}

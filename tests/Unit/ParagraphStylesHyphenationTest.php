<?php
/**
 * Tests for hyphenation in paragraph styles (#208).
 *
 * generate_style_css() must match buildStyleCssBlock() in ps-utils.js byte
 * for byte, so both read paragraph-styles/__tests__/fixtures/hyphenation-css.json.
 */

namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use Brain\Monkey\Functions;

class ParagraphStylesHyphenationTest extends TestCase {

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
        $json  = file_get_contents(TYPOST_PLUGIN_DIR . '/paragraph-styles/__tests__/fixtures/hyphenation-css.json');
        $cases = array();
        foreach (json_decode($json, true)['cases'] as $case) {
            $cases[$case['label']] = array($case['properties'], $case['css']);
        }
        return $cases;
    }

    /**
     * @dataProvider fixtureCases
     */
    public function test_css_matches_the_shared_fixture($properties, $css) {
        $this->assertSame($css, $this->instance()->generate_style_css(array('id' => 9, 'properties' => $properties), array()));
    }

    public function test_the_fixture_is_read() {
        // A control: an empty provider would let every case above pass by never running.
        $this->assertGreaterThanOrEqual(10, count($this->fixtureCases()));
    }

    public function test_sanitize_keeps_valid_values() {
        $clean = $this->sanitize(array(
            'hyphens'              => 'auto',
            'hyphenateLimitWord'   => '6',
            'hyphenateLimitBefore' => 0,
            'hyphenateLimitAfter'  => 99,
            'hyphenateCharacter'   => ' = ',
        ));
        $this->assertSame(array('hyphens' => 'auto', 'hyphenateLimitWord' => 6, 'hyphenateLimitAfter' => 20, 'hyphenateCharacter' => '='), $clean);
    }

    public function test_sanitize_reads_a_limit_with_whitespace_around_it_on_every_php_version() {
        // is_numeric() accepts trailing whitespace only from PHP 8.0, and no version accepts NBSP
        foreach (array('6 ', ' 6', "6\n", "\u{00A0}6\u{3000}") as $limit) {
            $clean = $this->sanitize(array('hyphens' => 'auto', 'hyphenateLimitWord' => $limit));
            $this->assertSame(array('hyphens' => 'auto', 'hyphenateLimitWord' => 6), $clean, 'limit ' . json_encode($limit));
        }
        foreach (array("6\0", "\xff6", '6 6') as $limit) {
            $clean = $this->sanitize(array('hyphens' => 'auto', 'hyphenateLimitWord' => $limit));
            $this->assertSame(array('hyphens' => 'auto'), $clean, 'limit ' . json_encode($limit));
        }
    }

    public function test_sanitize_drops_everything_when_off() {
        $this->assertSame(array(), $this->sanitize(array('hyphens' => 'manual', 'hyphenateLimitWord' => 6, 'hyphenateCharacter' => '=')));
        $this->assertSame(array(), $this->sanitize(array('hyphenateLimitWord' => 6)));
        $this->assertSame(array(), $this->sanitize(array('hyphens' => true)));
    }

    public function test_sanitize_drops_a_character_that_could_end_the_css_string() {
        foreach (array('"', "'", '\\', '</style>', '{', '}', ';', "a\nb", "\u{0085}", "\u{2028}", '-----', "\xff") as $bad) {
            $clean = $this->sanitize(array('hyphens' => 'auto', 'hyphenateCharacter' => $bad));
            $this->assertSame(array('hyphens' => 'auto'), $clean, 'character ' . json_encode($bad));
        }
        $this->assertSame('😀😀😀😀', \Typost_Paragraph_Styles::normalize_hyphenate_character('😀😀😀😀'));
        $this->assertSame('‐', \Typost_Paragraph_Styles::normalize_hyphenate_character("\u{00A0}‐\u{3000}"));
    }

    public function test_sanitize_keeps_the_empty_value_only_for_a_style_with_a_parent() {
        $this->assertSame(array(), $this->sanitize(array('hyphens' => '')));
        $this->assertSame(array('hyphens' => ''), $this->sanitize(array('hyphens' => ''), true));
    }

    public function test_based_on_inherits_the_group_as_a_whole() {
        $this->instance();
        $parent = array('id' => 1, 'name' => 'Body', 'properties' => array('hyphens' => 'auto', 'hyphenateLimitWord' => 6, 'hyphenateCharacter' => '='));
        $child  = array('id' => 2, 'name' => 'Narrow', 'basedOn' => 1, 'properties' => array('hyphens' => 'auto', 'hyphenateLimitBefore' => 3));
        $off    = array('id' => 3, 'name' => 'Plain', 'basedOn' => 1, 'properties' => array('hyphens' => ''));
        $styles = array($parent, $child, $off);
        $this->assertSame(array('hyphens' => 'auto', 'hyphenateLimitBefore' => 3), \Typost_Paragraph_Styles::resolve_properties($child, $styles));
        $this->assertSame(array(), \Typost_Paragraph_Styles::resolve_properties($off, $styles));
        $this->assertSame(array('hyphens' => ''), \Typost_Paragraph_Styles::compute_overrides(array(), $parent['properties']));
        $this->assertSame(array(), \Typost_Paragraph_Styles::compute_overrides($parent['properties'], $parent['properties']));
    }

    public function test_card_details_list_the_settings() {
        $this->instance();
        $font = array('status' => 'default', 'name' => '', 'font_id' => 0);
        $html = \Typost_Paragraph_Styles::render_card_details(array('hyphens' => 'auto'), $font);
        $this->assertStringContainsString('<strong>Hyphenation:</strong> On', $html);

        $html = \Typost_Paragraph_Styles::render_card_details(
            array('hyphens' => 'auto', 'hyphenateLimitWord' => 6, 'hyphenateLimitBefore' => 2, 'hyphenateLimitAfter' => 3, 'hyphenateCharacter' => '='),
            $font
        );
        $this->assertStringContainsString('<strong>Hyphenation:</strong> On (words of 6+ letters, 2+ before the hyphen, 3+ after the hyphen, hyphen “=”)', $html);

        $html = \Typost_Paragraph_Styles::render_card_details(
            array('fontSize' => 'fit', 'fontSizeMin' => 16, 'fontSizePreferred' => 24, 'fontSizeMax' => 64, 'hyphens' => 'auto'),
            $font
        );
        $this->assertStringNotContainsString('Hyphenation:', $html);

        $html = \Typost_Paragraph_Styles::render_card_details(array(), $font, array('own' => array('hyphens' => ''), 'parent' => 'Body'));
        $this->assertStringContainsString('<strong>Hyphenation:</strong> None', $html);
    }
}

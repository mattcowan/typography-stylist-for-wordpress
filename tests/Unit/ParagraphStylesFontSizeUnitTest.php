<?php
/**
 * Tests for paragraph style font size units (#233).
 *
 * A style saved after #233 stores fontSizeUnit 'rem' and writes its sizes
 * divided by 16. A style without the key was saved before and writes px
 * exactly as before. generate_style_css() must match buildStyleCssBlock()
 * in ps-utils.js byte for byte, so both read the same fixture.
 */

namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use Brain\Monkey\Functions;

class ParagraphStylesFontSizeUnitTest extends TestCase {

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

    private function sanitize(array $raw) {
        $instance   = $this->instance();
        $reflection = new \ReflectionClass(\Typost_Paragraph_Styles::class);
        $method     = $reflection->getMethod('sanitize_properties');
        $method->setAccessible(true);
        return $method->invoke($instance, $raw);
    }

    public function fixtureCases() {
        $json  = file_get_contents(TYPOST_PLUGIN_DIR . '/paragraph-styles/__tests__/fixtures/font-size-unit-css.json');
        $cases = array();
        foreach (json_decode($json, true)['cases'] as $case) {
            $cases[$case['label']] = array($case['properties'], $case['rule']);
        }
        return $cases;
    }

    /**
     * @dataProvider fixtureCases
     */
    public function test_css_matches_the_shared_fixture($properties, $rule) {
        $selector = ".typost-ps-8,\n.typost-styled.typost-ps-8.typost-ps-8.typost-ps-8.typost-ps-8.typost-ps-8,\n.typost-styled[data-style-id=\"8\"][data-style-id][data-style-id][data-style-id][data-style-id]";
        $css      = $this->instance()->generate_style_css(array('id' => 8, 'properties' => $properties));
        $this->assertSame($selector . " {\n    " . $rule . ";\n}", $css);
    }

    public function test_the_fixture_is_read() {
        // A control: an empty provider would let every case above pass by
        // never running.
        $this->assertGreaterThanOrEqual(10, count($this->fixtureCases()));
    }

    public function test_px_to_rem_divides_by_16_and_rounds_to_six_decimals() {
        $this->instance();
        $this->assertSame(1.5, \Typost_Paragraph_Styles::px_to_rem('24'));
        $this->assertSame(2.28125, \Typost_Paragraph_Styles::px_to_rem(36.5));
        $this->assertSame(0.83125, \Typost_Paragraph_Styles::px_to_rem('13.3'));
        $this->assertSame(0.000123, \Typost_Paragraph_Styles::px_to_rem(0.001968));
        $this->assertSame(0, \Typost_Paragraph_Styles::px_to_rem(0.001));
        $this->assertSame(0, \Typost_Paragraph_Styles::px_to_rem(0));
    }

    public function test_sanitizer_keeps_px_and_rem() {
        $this->assertSame('rem', $this->sanitize(array('fontSize' => '24', 'fontSizeUnit' => 'rem'))['fontSizeUnit']);
        $this->assertSame('px', $this->sanitize(array('fontSize' => '24', 'fontSizeUnit' => 'px'))['fontSizeUnit']);
    }

    public function test_sanitizer_drops_any_other_unit() {
        foreach (array('em', 'REM', '', 'rem;color:red', 1, null) as $unit) {
            $this->assertArrayNotHasKey('fontSizeUnit', $this->sanitize(array('fontSize' => '24', 'fontSizeUnit' => $unit)));
        }
    }

    public function test_a_style_saved_before_233_has_no_unit_and_stays_px() {
        $clean = $this->sanitize(array('fontSize' => '24'));
        $this->assertArrayNotHasKey('fontSizeUnit', $clean);
        $this->assertStringContainsString('font-size: 24px;', $this->instance()->generate_style_css(array('id' => 2, 'properties' => $clean)));
    }
}

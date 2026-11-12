<?php
/**
 * The main rule of a paragraph style (#358).
 *
 * generate_style_css() must match buildStyleCssBlock() in ps-utils.js byte
 * for byte, so both read paragraph-styles/__tests__/fixtures/style-css.json
 * (the Jest reader is paragraph-styles/__tests__/style-css.test.js). The
 * cases pass raw properties on purpose: both generators re-validate what
 * they read, and the JS emulates PHP intval(), empty() and float printing.
 * A case with a "php" key is a known difference between the two: PHP is
 * held to that value and JS to "css".
 */

namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use Brain\Monkey\Functions;

class ParagraphStylesStyleCssTest extends TestCase {

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
        $reflection = new \ReflectionClass(\Typost_Paragraph_Styles::class);
        return $reflection->newInstanceWithoutConstructor();
    }

    public function fixtureCases() {
        $json  = file_get_contents(TYPOST_PLUGIN_DIR . '/paragraph-styles/__tests__/fixtures/style-css.json');
        $cases = array();
        foreach (json_decode($json, true)['cases'] as $case) {
            $cases[$case['label']] = array($case['style'], array_key_exists('php', $case) ? $case['php'] : $case['css']);
        }
        return $cases;
    }

    /**
     * @dataProvider fixtureCases
     */
    public function test_css_matches_the_shared_fixture($style, $css) {
        $this->assertSame($css, $this->instance()->generate_style_css($style));
    }

    public function test_the_fixture_is_read() {
        // A control: an empty provider would let every case above pass by
        // never running.
        $this->assertGreaterThanOrEqual(40, count($this->fixtureCases()));
    }
}

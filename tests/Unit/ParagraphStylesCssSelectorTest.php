<?php
/**
 * Tests for Typost_Paragraph_Styles::generate_style_css() selectors (PS-6).
 *
 * The PHP generator and buildStyleCssBlock() in ps-utils.js must emit the
 * same text. The expected strings here are copied from ps-utils.test.js.
 */

namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use Brain\Monkey\Functions;

class ParagraphStylesCssSelectorTest extends TestCase {

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

    public function test_css_matches_the_js_generator_byte_for_byte() {
        $module = $this->freshInstance();
        $css = $module->generate_style_css([
            'id' => 3,
            'properties' => [
                'fontId' => 12,
                'fontWeight' => '700',
                'fontStyle' => 'italic',
                'features' => ['liga', 'ss01'],
                'letterSpacing' => 50,
                'lineHeight' => 1.4,
                'fontSize' => '24',
            ],
        ]);

        $expected = ".typost-ps-3,\n.typost-styled.typost-ps-3.typost-ps-3.typost-ps-3.typost-ps-3.typost-ps-3,\n.typost-styled[data-style-id=\"3\"][data-style-id][data-style-id][data-style-id][data-style-id] {\n"
            . "    font-family: var(--font-12);\n"
            . "    font-weight: 700;\n"
            . "    font-style: italic;\n"
            . "    font-feature-settings: \"liga\" 1, \"ss01\" 1;\n"
            . "    letter-spacing: 0.05em;\n"
            . "    line-height: 1.4;\n"
            . "    font-size: 24px;\n"
            . "}";
        $this->assertSame($expected, $css);
    }

    public function test_legacy_ids_get_the_same_boosted_variants() {
        $module = $this->freshInstance();
        $css = $module->generate_style_css([
            'id' => 4,
            'legacyId' => 'ps_1709312345_123',
            'properties' => ['fontId' => 2],
        ]);

        $this->assertStringContainsString(".typost-ps-4,\n", $css);
        $this->assertStringContainsString(".typost-styled.typost-ps-4.typost-ps-4.typost-ps-4.typost-ps-4.typost-ps-4,\n", $css);
        $this->assertStringContainsString(".typost-styled[data-style-id=\"4\"][data-style-id][data-style-id][data-style-id][data-style-id],\n", $css);
        $this->assertStringContainsString(".typost-ps-ps_1709312345_123,\n", $css);
        $this->assertStringContainsString(".typost-styled.typost-ps-ps_1709312345_123.typost-ps-ps_1709312345_123.typost-ps-ps_1709312345_123.typost-ps-ps_1709312345_123.typost-ps-ps_1709312345_123,\n", $css);
        $this->assertStringContainsString(".typost-styled[data-style-id=\"ps_1709312345_123\"][data-style-id][data-style-id][data-style-id][data-style-id] {", $css);
    }
}

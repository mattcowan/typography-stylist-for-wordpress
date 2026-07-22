<?php
namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;

/**
 * Round-trip tests: CSS produced by Typost_Font_Metadata::build_css() must
 * survive the existing font-kit pipeline unchanged — parse_webfont_kit(),
 * rewrite_css_urls(), and sanitize_font_css().
 *
 * Only the relative-URL branch of validate_font_face_block() is exercised
 * here on purpose: its static $upload_host cache would otherwise leak state
 * across tests in the same process.
 */
class FontKitCssPipelineTest extends TestCase {

    private function getPluginInstance() {
        static $loaded = false;
        if (!$loaded) {
            require_once TYPOST_PLUGIN_DIR . '/typography-stylist.php';
            $loaded = true;
        }
        return \Typost::get_instance();
    }

    private function invokePrivate($object, $method, ...$args) {
        $reflection = new \ReflectionMethod(get_class($object), $method);
        $reflection->setAccessible(true);
        return $reflection->invokeArgs($object, $args);
    }

    private function generatedVariableCss() {
        require_once TYPOST_PLUGIN_DIR . '/includes/class-typost-font-metadata.php';
        $kit = '/tmp/kit-test';
        return \Typost_Font_Metadata::build_css(array(
            array(
                'file' => $kit . '/SpaceGrotesk[wght].ttf',
                'meta' => array(
                    'family'      => 'Space Grotesk',
                    'weight'      => array('min' => 300.0, 'max' => 700.0),
                    'style'       => 'normal',
                    'is_variable' => true,
                    'source'      => 'binary',
                ),
            ),
        ), $kit);
    }

    public function test_generated_css_parses_via_parse_webfont_kit() {
        $plugin = $this->getPluginInstance();
        $faces = $plugin->parse_webfont_kit($this->generatedVariableCss());

        $this->assertCount(1, $faces);
        $this->assertSame('Space Grotesk', $faces[0]['family']);
        $this->assertSame('300 700', $faces[0]['weight']);
        $this->assertSame('normal', $faces[0]['style']);
        $this->assertStringContainsString('truetype-variations', $faces[0]['src']);
    }

    public function test_generated_css_urls_rewritten_to_root_relative() {
        $plugin = $this->getPluginInstance();
        $base = 'http://mnc4.local/wp-content/uploads/typography-stylist/fonts/kit-x';
        $rewritten = $plugin->rewrite_css_urls($this->generatedVariableCss(), $base);

        $this->assertStringContainsString(
            "url('/wp-content/uploads/typography-stylist/fonts/kit-x/SpaceGrotesk%5Bwght%5D.ttf')",
            $rewritten
        );
    }

    public function test_generated_css_survives_sanitize_font_css() {
        $plugin = $this->getPluginInstance();
        $base = 'http://mnc4.local/wp-content/uploads/typography-stylist/fonts/kit-x';
        $rewritten = $plugin->rewrite_css_urls($this->generatedVariableCss(), $base);
        $sanitized = $this->invokePrivate($plugin, 'sanitize_font_css', $rewritten);

        $this->assertNotSame('', $sanitized);
        $this->assertStringContainsString('@font-face', $sanitized);
        $this->assertStringContainsString('font-weight: 300 700;', $sanitized);
        $this->assertStringContainsString('SpaceGrotesk%5Bwght%5D.ttf', $sanitized);
    }

    public function test_static_multi_face_css_round_trip() {
        require_once TYPOST_PLUGIN_DIR . '/includes/class-typost-font-metadata.php';
        $plugin = $this->getPluginInstance();
        $kit = '/tmp/kit-test';
        $css = \Typost_Font_Metadata::build_css(array(
            array(
                'file' => $kit . '/Lato-Regular.ttf',
                'meta' => array('family' => 'Lato', 'weight' => 400, 'style' => 'normal', 'is_variable' => false, 'source' => 'binary'),
            ),
            array(
                'file' => $kit . '/Lato-BoldItalic.ttf',
                'meta' => array('family' => 'Lato', 'weight' => 700, 'style' => 'italic', 'is_variable' => false, 'source' => 'binary'),
            ),
        ), $kit);

        $faces = $plugin->parse_webfont_kit($css);
        $this->assertCount(2, $faces);
        $this->assertSame('400', $faces[0]['weight']);
        $this->assertSame('700', $faces[1]['weight']);
        $this->assertSame('italic', $faces[1]['style']);
    }
}

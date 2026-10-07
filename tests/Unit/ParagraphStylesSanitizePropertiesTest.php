<?php
/**
 * Tests for Typost_Paragraph_Styles::sanitize_properties() (PS-3, PS-8).
 *
 * The sanitizer is private and sits behind both REST write handlers, so it
 * is exercised directly through reflection.
 */

namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use Brain\Monkey\Functions;

class ParagraphStylesSanitizePropertiesTest extends TestCase {

    private function sanitize(array $raw) {
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
        $instance   = $reflection->newInstanceWithoutConstructor();
        $method     = $reflection->getMethod('sanitize_properties');
        $method->setAccessible(true);

        return $method->invoke($instance, $raw);
    }

    public function test_fixed_size_style_drops_the_responsive_trio() {
        $clean = $this->sanitize([
            'fontSize'          => '16',
            'fontSizeMin'       => 16,
            'fontSizePreferred' => 32,
            'fontSizeMax'       => 64,
            'fontWeight'        => '400',
        ]);

        $this->assertSame('16', $clean['fontSize']);
        $this->assertArrayNotHasKey('fontSizeMin', $clean);
        $this->assertArrayNotHasKey('fontSizePreferred', $clean);
        $this->assertArrayNotHasKey('fontSizeMax', $clean);
    }

    public function test_style_without_a_size_drops_the_trio() {
        $clean = $this->sanitize([
            'fontSizeMin'       => 16,
            'fontSizePreferred' => 32,
            'fontSizeMax'       => 64,
        ]);

        $this->assertSame([], $clean);
    }

    public function test_responsive_and_fit_keep_the_trio() {
        foreach (['responsive', 'fit'] as $mode) {
            $clean = $this->sanitize([
                'fontSize'          => $mode,
                'fontSizeMin'       => '16',
                'fontSizePreferred' => '32',
                'fontSizeMax'       => '64',
                'fitMaxSize'        => '120',
            ]);

            $this->assertSame(16, $clean['fontSizeMin'], $mode);
            $this->assertSame(32, $clean['fontSizePreferred'], $mode);
            $this->assertSame(64, $clean['fontSizeMax'], $mode);
            $this->assertSame(120, $clean['fitMaxSize'], $mode);
        }
    }

    public function test_line_height_is_rounded_to_three_decimals() {
        // 0.1 + 0.2 is not 0.3 in PHP either; the literal 1.6000000000000001 is
        // bit-identical to 1.6 and would witness nothing.
        $this->assertNotSame(0.3, 0.1 + 0.2);
        $this->assertSame(0.3, $this->sanitize(['lineHeight' => 0.1 + 0.2])['lineHeight']);
        // Exact half-steps round away from zero, matching the JS roundLineHeight()
        $this->assertSame(1.001, $this->sanitize(['lineHeight' => '1.0005'])['lineHeight']);
        $this->assertSame(1.235, $this->sanitize(['lineHeight' => '1.23456'])['lineHeight']);
        $this->assertSame(1.5, $this->sanitize(['lineHeight' => '1.5'])['lineHeight']);
    }

    public function test_initial_hang_is_normalized_like_the_js_twins() {
        // Same cases as normalizeHang() in core utils.js and ps-utils.js
        $this->assertSame(0.12, $this->sanitize(['initialHang' => '0.12'])['initialHang']);
        $this->assertSame(0.124, $this->sanitize(['initialHang' => 0.1235])['initialHang']);
        $this->assertSame(1.0, $this->sanitize(['initialHang' => 5])['initialHang']);
        $this->assertSame(0.001, $this->sanitize(['initialHang' => 0.0005])['initialHang']);
    }

    public function test_no_hang_is_never_stored() {
        foreach (['', 0, '0', -0.2, 'abc', '0x1A', 0.0004, true, null] as $raw) {
            $this->assertArrayNotHasKey('initialHang', $this->sanitize(['initialHang' => $raw]), var_export($raw, true));
        }
    }
}

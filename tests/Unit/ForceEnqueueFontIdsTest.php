<?php
namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use Brain\Monkey\Functions;
use Brain\Monkey\Filters;

/**
 * Tests for the typost_force_enqueue_font_ids filter and the
 * font-CSS cache key construction.
 *
 * The filter lets themes/extensions force @font-face + --font-N variable
 * loading for fonts referenced only from theme CSS (invisible to the
 * content scan), e.g. Background Candy's per-scheme font assignments.
 */
class ForceEnqueueFontIdsTest extends TestCase {

    /**
     * Create a fresh Typost instance without running the constructor,
     * so per-request memoization does not leak between tests.
     */
    private function freshInstance() {
        static $loaded = false;
        if (!$loaded) {
            require_once TYPOST_PLUGIN_DIR . '/typography-stylist.php';
            $loaded = true;
        }
        $reflection = new \ReflectionClass(\Typost::class);
        return $reflection->newInstanceWithoutConstructor();
    }

    private function invokePrivate($instance, $method, array $args = []) {
        $reflection = new \ReflectionMethod($instance, $method);
        $reflection->setAccessible(true);
        return $reflection->invokeArgs($instance, $args);
    }

    public function test_forced_ids_are_sanitized_to_unique_positive_integers() {
        Filters\expectApplied('typost_force_enqueue_font_ids')
            ->once()
            ->with([])
            ->andReturn(['3', 5, 5, 0, -2, 'abc']);

        $plugin = $this->freshInstance();
        $this->assertSame([3, 5], $plugin->get_forced_font_ids());
    }

    public function test_forced_ids_are_memoized_per_request() {
        Filters\expectApplied('typost_force_enqueue_font_ids')
            ->once()
            ->andReturn([7]);

        $plugin = $this->freshInstance();
        $first = $plugin->get_forced_font_ids();
        $second = $plugin->get_forced_font_ids();

        $this->assertSame([7], $first);
        $this->assertSame($first, $second);
    }

    public function test_non_array_filter_return_is_treated_as_empty() {
        Filters\expectApplied('typost_force_enqueue_font_ids')
            ->once()
            ->andReturn('not-an-array');

        $plugin = $this->freshInstance();
        $this->assertSame([], $plugin->get_forced_font_ids());
    }

    public function test_default_is_empty_array() {
        $plugin = $this->freshInstance();
        $this->assertSame([], $plugin->get_forced_font_ids());
    }

    public function test_forced_ids_resolve_through_replacement_chain() {
        Functions\when('get_option')->alias(function ($key, $default = false) {
            if ('typost_font_replacements' === $key) {
                return [
                    'mappings'    => [16 => 29],
                    'global_load' => [],
                    'next_id'     => 30,
                ];
            }
            return $default;
        });

        $plugin = $this->freshInstance();
        $resolved = $this->invokePrivate($plugin, 'resolve_used_font_replacements', [[16, 32]]);

        $this->assertSame([16, 29, 32], array_values($resolved));
    }

    /**
     * Regression: the font-CSS transient key previously hashed only the used
     * font FAMILIES and load settings, omitting the used font IDs. Two pages
     * using different fonts (by ID) could share stale cached CSS.
     */
    public function test_cache_key_varies_with_used_font_ids() {
        $plugin = $this->freshInstance();

        $key_a = $this->invokePrivate($plugin, 'get_font_css_cache_key', [[], [1, 2], ['kit-1' => false]]);
        $key_b = $this->invokePrivate($plugin, 'get_font_css_cache_key', [[], [1, 3], ['kit-1' => false]]);

        $this->assertNotSame($key_a, $key_b);
    }

    public function test_cache_key_is_order_insensitive() {
        $plugin = $this->freshInstance();

        $key_a = $this->invokePrivate($plugin, 'get_font_css_cache_key', [['B Font', 'A Font'], [2, 1], []]);
        $key_b = $this->invokePrivate($plugin, 'get_font_css_cache_key', [['A Font', 'B Font'], [1, 2], []]);

        $this->assertSame($key_a, $key_b);
    }

    public function test_cache_key_varies_with_families_and_load_settings() {
        $plugin = $this->freshInstance();

        $base = $this->invokePrivate($plugin, 'get_font_css_cache_key', [['A Font'], [1], ['kit-1' => false]]);
        $diff_family = $this->invokePrivate($plugin, 'get_font_css_cache_key', [['B Font'], [1], ['kit-1' => false]]);
        $diff_load = $this->invokePrivate($plugin, 'get_font_css_cache_key', [['A Font'], [1], ['kit-1' => true]]);

        $this->assertNotSame($base, $diff_family);
        $this->assertNotSame($base, $diff_load);
    }

    public function test_cache_key_uses_expected_prefix() {
        $plugin = $this->freshInstance();
        $key = $this->invokePrivate($plugin, 'get_font_css_cache_key', [[], [], []]);
        $this->assertStringStartsWith('typost_font_css_', $key);
    }
}

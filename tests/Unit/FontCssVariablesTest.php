<?php
namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use Brain\Monkey\Functions;

/**
 * Tests for --font-N CSS variable emission: literal families for
 * plugin-managed fonts, preset-var aliases (with literal fallback) for
 * fonts registered in the WP Font Library, and replacement aliases.
 */
class FontCssVariablesTest extends TestCase {

    /** @var array Simulated wp_options storage */
    private $options;

    /** @var array Simulated wp_font_family posts */
    private $library_posts;

    protected function setUp(): void {
        parent::setUp();

        if (!defined('DAY_IN_SECONDS')) {
            define('DAY_IN_SECONDS', 86400);
        }

        static $loaded = false;
        if (!$loaded) {
            require_once TYPOST_PLUGIN_DIR . '/typography-stylist.php';
            $loaded = true;
        }

        $this->options = [];
        $this->library_posts = [];
        $options = &$this->options;
        $library_posts = &$this->library_posts;

        Functions\when('get_option')->alias(function ($key, $default = false) use (&$options) {
            return array_key_exists($key, $options) ? $options[$key] : $default;
        });
        Functions\when('update_option')->alias(function ($key, $value) use (&$options) {
            $options[$key] = $value;
            return true;
        });
        Functions\when('get_transient')->justReturn(false);
        Functions\when('set_transient')->justReturn(true);
        Functions\when('post_type_exists')->justReturn(true);
        Functions\when('get_posts')->alias(function () use (&$library_posts) {
            return $library_posts;
        });
        Functions\when('wp_list_pluck')->alias(function ($list, $field) {
            return array_map(function ($item) use ($field) {
                return is_object($item) ? $item->$field : $item[$field];
            }, $list);
        });
        Functions\when('sanitize_title')->alias(function ($title) {
            return trim(preg_replace('/[^a-z0-9-]+/', '-', strtolower((string) $title)), '-');
        });
    }

    private function freshInstance() {
        $reflection = new \ReflectionClass(\Typost::class);
        return $reflection->newInstanceWithoutConstructor();
    }

    private function addLibraryPost($slug, $title) {
        $this->library_posts[] = (object) [
            'ID' => count($this->library_posts) + 500,
            'post_type' => 'wp_font_family',
            'post_name' => $slug,
            'post_title' => $title,
            'post_content' => '',
            'post_parent' => 0,
            'post_status' => 'publish',
        ];
    }

    private function kitEntry(array $overrides = []) {
        return array_merge([
            'id' => 'kit-1-playfair-display',
            'name' => 'Playfair Display',
            'font_id' => 7,
            'css_content' => '@font-face {}',
            'font_faces' => [
                ['family' => 'Playfair Display', 'weight' => '400', 'style' => 'normal', 'src' => "url('pd.woff2')"],
            ],
            'fallbacks' => 'serif',
        ], $overrides);
    }

    public function test_unmigrated_kit_font_emits_literal_family() {
        $this->options['typost_custom_fonts'] = [$this->kitEntry()];

        $css = $this->freshInstance()->get_font_css_variables();

        $this->assertStringContainsString('--font-7: "Playfair Display", serif', $css);
        $this->assertStringNotContainsString('--wp--preset', $css);
    }

    public function test_migrated_font_with_live_slug_emits_preset_alias_with_literal_fallback() {
        $this->options['typost_custom_fonts'] = [
            $this->kitEntry(['wp_slug' => 'playfair-display', 'wp_post_id' => 500]),
        ];
        $this->addLibraryPost('playfair-display', 'Playfair Display');

        $css = $this->freshInstance()->get_font_css_variables();

        $this->assertStringContainsString(
            '--font-7: var(--wp--preset--font-family--playfair-display, "Playfair Display", serif)',
            $css
        );
    }

    public function test_migrated_font_with_missing_slug_falls_back_to_literal() {
        // Entry says registered, but the Library post is gone and the watcher
        // hasn't run — emission must self-heal to the literal family.
        $this->options['typost_custom_fonts'] = [
            $this->kitEntry(['wp_slug' => 'playfair-display', 'wp_post_id' => 500]),
        ];
        // No library posts registered

        $css = $this->freshInstance()->get_font_css_variables();

        $this->assertStringContainsString('--font-7: "Playfair Display", serif', $css);
        $this->assertStringNotContainsString('--wp--preset', $css);
    }

    public function test_adobe_and_manual_fonts_keep_literal_emission() {
        $this->options['typost_adobe_fonts'] = [
            ['id' => 'adobe-k-freight', 'name' => 'Freight Text', 'font_id' => 9, 'font_family' => 'freight-text-pro', 'css_url' => 'https://use.typekit.net/k.css'],
        ];
        $this->options['typost_manual_fonts'] = [
            ['id' => 'manual-sys-1', 'name' => 'System', 'font_id' => 11, 'font_family' => 'Georgia, serif'],
        ];

        $css = $this->freshInstance()->get_font_css_variables();

        $this->assertStringContainsString('--font-9: "freight-text-pro"', $css);
        $this->assertStringContainsString('--font-11: Georgia, serif', $css);
    }

    public function test_replacement_aliases_still_emitted() {
        $this->options['typost_custom_fonts'] = [$this->kitEntry()];
        $this->options['typost_font_replacements'] = [
            'mappings' => [3 => 7],
            'global_load' => [],
            'next_id' => 8,
        ];

        $css = $this->freshInstance()->get_font_css_variables();

        $this->assertStringContainsString('--font-3: var(--font-7)', $css);
    }
}

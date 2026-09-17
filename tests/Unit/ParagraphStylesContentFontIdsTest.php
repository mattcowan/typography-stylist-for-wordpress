<?php
/**
 * Tests for Typost_Paragraph_Styles::font_ids_from_content() (PS-7).
 */

namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use Brain\Monkey\Functions;

class ParagraphStylesContentFontIdsTest extends TestCase {

    private $styles = [
        ['id' => 2, 'name' => 'Display Swash', 'properties' => ['fontId' => 1, 'fontWeight' => '700']],
        ['id' => 5, 'name' => 'Script Accent', 'properties' => ['fontId' => 40]],
        ['id' => 6, 'name' => 'No font', 'properties' => ['fontWeight' => '400']],
        ['id' => 9, 'legacyId' => 'ps_1709312345_123', 'name' => 'Migrated', 'properties' => ['fontId' => 37]],
        ['id' => 10, 'legacyId' => 'ps-legacy-7', 'name' => 'Hyphenated', 'properties' => ['fontId' => 41]],
    ];

    private function freshInstance($stubOption = true) {
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
        Functions\when('get_transient')->justReturn(false);
        Functions\when('set_transient')->justReturn(true);
        if ($stubOption) {
            Functions\when('get_option')->justReturn($this->styles);
        }

        $reflection = new \ReflectionClass(\Typost_Paragraph_Styles::class);
        return $reflection->newInstanceWithoutConstructor();
    }

    public function test_inline_span_style_id_resolves_to_the_style_font() {
        $module = $this->freshInstance();
        $ids = $module->font_ids_from_content([], '<span class="typost-styled" data-style-id="5">Stylist</span>');
        $this->assertSame([40], $ids);
    }

    public function test_block_class_resolves_to_the_style_font() {
        $module = $this->freshInstance();
        $ids = $module->font_ids_from_content([], '<h2 class="typost-styled typost-ps-2" aria-hidden="true">Big</h2>');
        $this->assertSame([1], $ids);
    }

    public function test_escaped_quotes_from_block_attribute_json_are_matched() {
        $module = $this->freshInstance();
        $ids = $module->font_ids_from_content([], '{"content":"Typography <span class=\"typost-styled\" data-style-id=\"5\">Stylist</span>"}');
        $this->assertSame([40], $ids);
    }

    public function test_legacy_ids_are_matched_against_legacyId() {
        $module = $this->freshInstance();
        $ids = $module->font_ids_from_content([], '<span class="typost-styled" data-style-id="ps_1709312345_123">Old</span>');
        $this->assertSame([37], $ids);
    }

    public function test_hyphenated_legacy_ids_are_not_truncated_at_the_hyphen() {
        $module = $this->freshInstance();
        $this->assertSame([41], $module->font_ids_from_content([], '<span class="typost-styled" data-style-id="ps-legacy-7">a</span>'));
        $this->assertSame([41], $module->font_ids_from_content([], '<h2 class="typost-styled typost-ps-ps-legacy-7">b</h2>'));
    }

    public function test_styles_without_a_font_and_unknown_ids_add_nothing() {
        $module = $this->freshInstance();
        $ids = $module->font_ids_from_content([12], '<span data-style-id="6">a</span><span data-style-id="999">b</span>');
        $this->assertSame([12], $ids);
    }

    public function test_existing_ids_are_kept_and_duplicates_collapse() {
        $module = $this->freshInstance();
        $ids = $module->font_ids_from_content([40, '1'], '<span data-style-id="5">a</span><span data-style-id="5">b</span> typost-ps-2');
        $this->assertSame([40, 1], $ids);
    }

    public function test_content_without_style_references_is_untouched_and_cheap() {
        Functions\expect('get_option')->never();
        $module = $this->freshInstance(false);
        $this->assertSame([3], $module->font_ids_from_content([3], '<p>plain</p>'));
        $this->assertSame([], $module->font_ids_from_content('not-an-array', ''));
    }
}

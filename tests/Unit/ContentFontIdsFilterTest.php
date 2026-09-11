<?php
/**
 * Tests for the typost_content_font_ids filter (PS-7).
 *
 * Content styled only through a paragraph style class names no font, so the
 * built-in scan (data-font, data-font-id, --font-N) never saw it. Core now
 * asks modules through this filter and appends their IDs in the scan's
 * `id:N` form.
 */

namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use Brain\Monkey\Filters;

class ContentFontIdsFilterTest extends TestCase {

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

    public function test_filter_ids_are_appended_in_id_form_and_sanitized() {
        $content = '<span class="typost-styled" data-style-id="5">Stylist</span>';
        Filters\expectApplied('typost_content_font_ids')
            ->once()
            ->with([], $content)
            ->andReturn(['40', 40, 0, -3, 'abc', 37]);

        $plugin = $this->freshInstance();
        $used   = ['id:1'];
        $this->invokePrivate($plugin, 'collect_extension_font_ids', [$content, &$used]);

        $this->assertSame(['id:1', 'id:40', 'id:40', 'id:37'], $used);
    }

    public function test_non_array_filter_result_is_ignored() {
        Filters\expectApplied('typost_content_font_ids')->once()->andReturn('nope');

        $plugin = $this->freshInstance();
        $used   = [];
        $this->invokePrivate($plugin, 'collect_extension_font_ids', ['<p>x</p>', &$used]);

        $this->assertSame([], $used);
    }

    public function test_empty_content_does_not_apply_the_filter() {
        Filters\expectApplied('typost_content_font_ids')->never();

        $plugin = $this->freshInstance();
        $used   = [];
        $this->invokePrivate($plugin, 'collect_extension_font_ids', ['', &$used]);

        $this->assertSame([], $used);
    }

    public function test_extension_only_content_counts_as_styled_for_the_frontend_gate() {
        // No typost-styled class and no Typography Stylist block: only the
        // filter can say this page needs font assets.
        Filters\expectApplied('typost_content_font_ids')
            ->twice()
            ->andReturnUsing(function ($ids, $content) {
                return strpos($content, 'data-my-preset="2"') !== false ? [40] : $ids;
            });

        $plugin = $this->freshInstance();
        $this->assertTrue($this->invokePrivate($plugin, 'content_references_extension_fonts', ['<p data-my-preset="2">x</p>']));
        $this->assertFalse($this->invokePrivate($plugin, 'content_references_extension_fonts', ['<p>plain</p>']));
    }

    public function test_block_attribute_scan_asks_the_filter_for_inline_content() {
        // A Typography Stylist block whose only styling is a class-only span.
        $blocks = [[
            'blockName' => 'typost/block',
            'attrs'     => ['content' => 'Typography <span class="typost-styled" data-style-id="5">Stylist</span> Block'],
            'innerBlocks' => [],
        ]];
        Filters\expectApplied('typost_content_font_ids')
            ->once()
            ->andReturnUsing(function ($ids, $content) {
                return strpos($content, 'data-style-id="5"') !== false ? [40] : $ids;
            });

        $plugin = $this->freshInstance();
        $fonts  = [];
        $this->invokePrivate($plugin, 'extract_fonts_from_blocks', [$blocks, &$fonts]);

        $this->assertContains('id:40', $fonts);
    }
}

<?php
/**
 * Tests for the per-page frontend paragraph style CSS (#227).
 *
 * A frontend page prints the rules only for the styles its content uses,
 * plus styles that blocks rendered, styles a filter forces, and every style
 * when the editor is mounted on the page.
 */

namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use Brain\Monkey\Functions;
use Brain\Monkey\Filters;

class ParagraphStylesFrontendCssTest extends TestCase {

    private $styles = [
        ['id' => 3, 'name' => 'Three', 'properties' => ['fontId' => 12, 'fontWeight' => '700']],
        ['id' => 4, 'name' => 'Four', 'properties' => ['fontWeight' => '300']],
        ['id' => 5, 'name' => 'Five', 'properties' => ['fontId' => 40, 'lineHeight' => 1.2]],
        ['id' => 9, 'legacyId' => 'ps_1709312345_123', 'name' => 'Migrated', 'properties' => ['fontWeight' => '600']],
    ];

    protected function tearDown(): void {
        unset($GLOBALS['wp_query']);
        parent::tearDown();
    }

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
        Functions\when('get_transient')->justReturn(false);
        Functions\when('set_transient')->justReturn(true);
        Functions\when('get_option')->justReturn($this->styles);

        $reflection = new \ReflectionClass(\Typost_Paragraph_Styles::class);
        return $reflection->newInstanceWithoutConstructor();
    }

    private function singular($content) {
        Functions\when('is_singular')->justReturn(true);
        Functions\when('get_queried_object')->justReturn((object) ['ID' => 1, 'post_content' => $content, 'post_excerpt' => '']);
    }

    private function archive(array $contents) {
        Functions\when('is_singular')->justReturn(false);
        $posts = [];
        foreach ($contents as $i => $content) {
            $posts[] = (object) ['ID' => $i + 1, 'post_content' => $content, 'post_excerpt' => ''];
        }
        $GLOBALS['wp_query'] = (object) ['posts' => $posts];
    }

    private function head($module) {
        ob_start();
        $module->output_style_css();
        return ob_get_clean();
    }

    private function footer($module) {
        ob_start();
        $module->output_late_style_css();
        return ob_get_clean();
    }

    /** Numeric style ids whose plain `.typost-ps-N` selector appears in the output, in order. */
    private function printedIds($css) {
        preg_match_all('/^\.typost-ps-(\d+),$/m', $css, $m);
        return $m[1];
    }

    public function test_a_page_with_no_style_references_prints_nothing() {
        $this->singular('<!-- wp:paragraph --><p class="typost-styled">Plain <span class="typost-styled" data-features="liga">styled</span></p><!-- /wp:paragraph -->');
        $module = $this->freshInstance();

        $this->assertSame('', $this->head($module));
        $this->assertSame('', $this->footer($module));
    }

    public function test_a_page_that_uses_styles_3_and_5_prints_only_those_rules() {
        $this->singular('<h2 class="typost-styled typost-ps-5">A</h2><p>b <span class="typost-styled" data-style-id="3">c</span></p>');
        $module = $this->freshInstance();

        $css = $this->head($module);
        $this->assertStringContainsString('<style id="typost-paragraph-styles-css">', $css);
        // Stored order, not content order — the same order get_all_css() uses.
        $this->assertSame(['3', '5'], $this->printedIds($css));
    }

    public function test_the_rules_are_the_same_text_get_all_css_prints() {
        $this->singular('<span data-style-id="3">a</span><span data-style-id="5">b</span>');
        $module = $this->freshInstance();

        $expected = $module->generate_style_css($this->styles[0]) . "\n\n" . $module->generate_style_css($this->styles[2]);
        $this->assertSame("\n<style id=\"typost-paragraph-styles-css\">\n" . $expected . "\n</style>\n", $this->head($module));
    }

    public function test_a_legacy_style_id_still_gets_its_rule() {
        $this->singular('<span class="typost-styled" data-style-id="ps_1709312345_123">Old</span>');
        $module = $this->freshInstance();

        $css = $this->head($module);
        $this->assertSame(['9'], $this->printedIds($css));
        $this->assertStringContainsString('.typost-ps-ps_1709312345_123', $css);
    }

    public function test_escaped_block_attribute_json_is_matched() {
        $this->singular('<!-- wp:typost/block {"content":"a <span class=\"typost-styled\" data-style-id=\"4\">b</span>"} -->');
        $this->assertSame(['4'], $this->printedIds($this->head($this->freshInstance())));
    }

    public function test_an_archive_prints_the_rules_for_every_post_in_the_loop() {
        $this->archive([
            '<span data-style-id="5">first post</span>',
            '<p>no styles</p>',
            '<h2 class="typost-styled typost-ps-3">third post</h2>',
        ]);
        $this->assertSame(['3', '5'], $this->printedIds($this->head($this->freshInstance())));
    }

    public function test_an_archive_reads_manual_excerpts() {
        Functions\when('is_singular')->justReturn(false);
        $GLOBALS['wp_query'] = (object) ['posts' => [
            (object) ['ID' => 1, 'post_content' => '<p>body</p>', 'post_excerpt' => '<span data-style-id="4">teaser</span>'],
        ]];
        $this->assertSame(['4'], $this->printedIds($this->head($this->freshInstance())));
    }

    public function test_an_empty_archive_prints_nothing() {
        $this->archive([]);
        $this->assertSame('', $this->head($this->freshInstance()));
    }

    public function test_synced_patterns_in_the_content_are_scanned() {
        $this->singular('<!-- wp:block {"ref":77} /-->');
        Functions\when('get_post')->alias(function ($id) {
            $patterns = [
                77 => (object) ['post_type' => 'wp_block', 'post_content' => '<!-- wp:block {"ref":78} /--><span data-style-id="5">x</span>'],
                78 => (object) ['post_type' => 'wp_block', 'post_content' => '<!-- wp:block {"ref":77} /--><h2 class="typost-ps-4">y</h2>'],
            ];
            return $patterns[$id] ?? null;
        });

        // Nested pattern 78 is read; its reference back to 77 does not loop.
        $this->assertSame(['4', '5'], $this->printedIds($this->head($this->freshInstance())));
    }

    public function test_a_ref_to_a_post_that_is_not_a_pattern_is_ignored() {
        $this->singular('<!-- wp:block {"ref":12} /-->');
        Functions\when('get_post')->justReturn((object) ['post_type' => 'post', 'post_content' => '<span data-style-id="5">x</span>']);
        $this->assertSame('', $this->head($this->freshInstance()));
    }

    public function test_blocks_rendered_before_the_head_are_printed_in_the_head() {
        // A block theme renders its template (template parts included) before wp_head.
        $this->singular('<p>no styles</p>');
        $module = $this->freshInstance();
        $html = '<header><h2 class="typost-styled typost-ps-4">Site title</h2></header>';

        $this->assertSame($html, $module->collect_rendered_style_refs($html));
        $this->assertSame(['4'], $this->printedIds($this->head($module)));
        $this->assertSame('', $this->footer($module));
    }

    public function test_blocks_rendered_after_the_head_print_in_the_footer_once() {
        $this->singular('<span data-style-id="3">post</span>');
        $module = $this->freshInstance();

        $this->assertSame(['3'], $this->printedIds($this->head($module)));

        // A classic theme's footer widget renders after wp_head, and repeats style 3.
        $module->collect_rendered_style_refs('<span data-style-id="3">a</span><span data-style-id="5">b</span>');
        $module->collect_rendered_style_refs('<div><span data-style-id="5">nested parent repeats it</span></div>');

        $late = $this->footer($module);
        $this->assertStringContainsString('<style id="typost-paragraph-styles-late-css">', $late);
        $this->assertSame(['5'], $this->printedIds($late));
    }

    public function test_blocks_without_style_references_are_returned_unchanged() {
        Functions\expect('get_option')->never();
        $module = (new \ReflectionClass(\Typost_Paragraph_Styles::class))->newInstanceWithoutConstructor();
        $this->assertSame('<p>plain</p>', $module->collect_rendered_style_refs('<p>plain</p>'));
        $this->assertSame(null, $module->collect_rendered_style_refs(null));
    }

    public function test_the_filter_adds_styles_that_have_no_content_reference() {
        $this->singular('<p>no styles</p>');
        Filters\expectApplied('typost_force_enqueue_paragraph_style_ids')
            ->once()
            ->with([])
            ->andReturn([4, 'ps_1709312345_123', '<bad>', 999, null]);
        $module = $this->freshInstance();

        $this->assertSame(['4', '9'], $this->printedIds($this->head($module)));
        // Memoized: the font hook below reuses the same answer.
        $this->assertSame([7], $module->font_ids_from_forced_styles([7]));
    }

    public function test_forced_styles_add_their_fonts_to_the_forced_font_ids() {
        Filters\expectApplied('typost_force_enqueue_paragraph_style_ids')->once()->andReturn([3, 5, 4]);
        $module = $this->freshInstance();

        $this->assertSame([2, 12, 40], $module->font_ids_from_forced_styles([2]));
    }

    public function test_a_non_array_filter_result_forces_nothing() {
        Filters\expectApplied('typost_force_enqueue_paragraph_style_ids')->once()->andReturn('3');
        $module = $this->freshInstance();

        $this->assertSame([], $module->get_forced_style_refs());
        $this->assertSame([], $module->font_ids_from_forced_styles('nope'));
    }

    public function test_an_editor_mounted_on_the_frontend_gets_every_style() {
        $this->singular('<span data-style-id="5">post</span>');
        Functions\when('is_admin')->justReturn(false);
        Functions\when('wp_enqueue_script')->justReturn(true);
        Functions\when('wp_set_script_translations')->justReturn(true);
        $module = $this->freshInstance();

        // A shortcode enqueues the editor while the content renders, after wp_head.
        $this->assertSame(['5'], $this->printedIds($this->head($module)));
        $module->enqueue_editor_assets();
        $this->assertSame(['3', '4', '9'], $this->printedIds($this->footer($module)));
    }

    public function test_the_wp_admin_editor_does_not_set_the_frontend_flag() {
        $this->singular('<p>none</p>');
        Functions\when('is_admin')->justReturn(true);
        Functions\when('wp_enqueue_script')->justReturn(true);
        Functions\when('wp_set_script_translations')->justReturn(true);
        $module = $this->freshInstance();

        $module->enqueue_editor_assets();
        $this->assertSame('', $this->footer($module));
    }

    public function test_style_refs_from_content_collects_both_forms_once() {
        $module = $this->freshInstance();
        $this->assertSame(
            ['5', 'ps-legacy-7', '3'],
            $module->style_refs_from_content('<span data-style-id="5">a</span><span data-style-id=\'ps-legacy-7\'>b</span> typost-ps-3 typost-ps-5')
        );
        $this->assertSame([], $module->style_refs_from_content(''));
        $this->assertSame([], $module->style_refs_from_content(null));
    }
}

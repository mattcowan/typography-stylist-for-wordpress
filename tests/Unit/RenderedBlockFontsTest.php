<?php
namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use Brain\Monkey\Functions;
use Brain\Monkey\Filters;

/**
 * Tests for the fonts of the blocks that a block theme renders before
 * wp_head (#481).
 *
 * A block theme renders the whole template (template parts, synced
 * patterns, query loops) before wp_head. collect_rendered_block_font_ids()
 * records the font IDs of each rendered block on render_block, and the
 * frontend font output adds them: the @font-face CSS of the kits, the Adobe
 * Fonts kits, and the --font-N variables. A classic theme renders the body
 * after wp_head, so it collects nothing.
 */
class RenderedBlockFontsTest extends TestCase {

    /** @var array Simulated wp_options storage */
    private $options;

    /** @var array Simulated transients */
    private $transients;

    /** @var bool Simulated is_admin() */
    private $is_admin;

    /** @var bool Simulated wp_is_block_theme() */
    private $block_theme;

    /** @var int Simulated did_action('wp_head') */
    private $wp_head_done;

    /** @var string[] Filters that doing_filter() reports as running */
    private $doing_filters;

    /** @var array Handles passed to wp_enqueue_style() */
    private $enqueued;

    /** @var array CSS passed to wp_add_inline_style(), by handle */
    private $inline;

    public static function setUpBeforeClass(): void {
        parent::setUpBeforeClass();
        if (!defined('DAY_IN_SECONDS')) {
            define('DAY_IN_SECONDS', 86400);
        }
        if (!defined('HOUR_IN_SECONDS')) {
            define('HOUR_IN_SECONDS', 3600);
        }
        // The double FontFacePrintingTest installs: no font is printed by
        // WordPress unless a test adds it
        if (!class_exists('WP_Font_Face_Resolver')) {
            eval('class WP_Font_Face_Resolver {
                public static $fonts = array();
                public static function get_fonts_from_theme_json() {
                    return self::$fonts;
                }
            }');
        }
    }

    protected function setUp(): void {
        parent::setUp();

        static $loaded = false;
        if (!$loaded) {
            require_once TYPOST_PLUGIN_DIR . '/typography-stylist.php';
            $loaded = true;
        }

        \WP_Font_Face_Resolver::$fonts = [];
        $this->options = [];
        $this->transients = [];
        $this->is_admin = false;
        $this->block_theme = true;
        $this->wp_head_done = 0;
        $this->doing_filters = [];
        $this->enqueued = [];
        $this->inline = [];

        $options = &$this->options;
        $transients = &$this->transients;
        $is_admin = &$this->is_admin;
        $block_theme = &$this->block_theme;
        $wp_head_done = &$this->wp_head_done;
        $doing_filters = &$this->doing_filters;
        $enqueued = &$this->enqueued;
        $inline = &$this->inline;

        Functions\when('get_option')->alias(function ($key, $default = false) use (&$options) {
            return array_key_exists($key, $options) ? $options[$key] : $default;
        });
        Functions\when('get_transient')->alias(function ($key) use (&$transients) {
            return array_key_exists($key, $transients) ? $transients[$key] : false;
        });
        Functions\when('set_transient')->alias(function ($key, $value) use (&$transients) {
            $transients[$key] = $value;
            return true;
        });
        Functions\when('is_admin')->alias(function () use (&$is_admin) {
            return $is_admin;
        });
        Functions\when('wp_is_block_theme')->alias(function () use (&$block_theme) {
            return $block_theme;
        });
        Functions\when('did_action')->alias(function ($hook) use (&$wp_head_done) {
            return 'wp_head' === $hook ? $wp_head_done : 0;
        });
        Functions\when('doing_filter')->alias(function ($hook = null) use (&$doing_filters) {
            return null === $hook ? !empty($doing_filters) : in_array($hook, $doing_filters, true);
        });
        Functions\when('wp_doing_ajax')->justReturn(false);
        Functions\when('is_singular')->justReturn(true);
        Functions\when('get_queried_object')->justReturn((object) ['ID' => 42, 'post_content' => '<p>Plain</p>']);
        Functions\when('parse_blocks')->justReturn([]);
        Functions\when('do_blocks')->returnArg();
        Functions\when('wp_kses')->returnArg();
        Functions\when('esc_url')->returnArg();
        Functions\when('post_type_exists')->justReturn(true);
        Functions\when('get_posts')->justReturn([]);
        Functions\when('wp_list_pluck')->alias(function ($list, $field) {
            $out = [];
            foreach ($list as $item) {
                $out[] = is_object($item) ? $item->$field : $item[$field];
            }
            return $out;
        });
        Functions\when('sanitize_title')->alias(function ($title) {
            return trim(preg_replace('/[^a-z0-9-]+/', '-', strtolower((string) $title)), '-');
        });
        Functions\when('wp_enqueue_style')->alias(function ($handle) use (&$enqueued) {
            $enqueued[] = $handle;
        });
        Functions\when('wp_add_inline_style')->alias(function ($handle, $css) use (&$inline) {
            $inline[$handle] = $css;
            return true;
        });
    }

    private function freshInstance() {
        $reflection = new \ReflectionClass(\Typost::class);
        return $reflection->newInstanceWithoutConstructor();
    }

    private function invokePrivate($object, $method, array $args = []) {
        $reflection = new \ReflectionMethod(\Typost::class, $method);
        $reflection->setAccessible(true);
        return $reflection->invokeArgs($object, $args);
    }

    private function kit($font_id, $family) {
        return [
            'id' => 'kit-' . $font_id,
            'name' => $family,
            'font_id' => $font_id,
            'css_content' => '@font-face { font-family: "' . $family . '"; }',
            'font_faces' => [
                ['family' => $family, 'weight' => '400', 'style' => 'normal', 'src' => "url('f.woff2')"],
            ],
            'fallbacks' => 'serif',
        ];
    }

    /** Uploaded fonts 3, 5, 7, 9 and an Adobe font 20. */
    private function seedFonts() {
        $this->options['typost_custom_fonts'] = [
            $this->kit(3, 'Three'),
            $this->kit(5, 'Five'),
            $this->kit(7, 'Seven'),
            $this->kit(9, 'Nine'),
        ];
        $this->options['typost_adobe_fonts'] = [
            ['id' => 'adobe-20', 'name' => 'Twenty', 'font_id' => 20, 'kit_id' => 'twk', 'font_family' => 'twenty-pro', 'css_url' => 'https://use.typekit.net/twk.css'],
        ];
    }

    /** The content scan of post 42 found these references (cached). */
    private function content(array $used_fonts) {
        $this->transients['typost_has_styled_42'] = empty($used_fonts) ? 'no' : 'yes';
        $this->transients['typost_used_fonts_42'] = $used_fonts;
    }

    /** A Typography Stylist block as it renders, with a block-level font. */
    private function typostBlock($font_id) {
        return [
            '<div class="wp-block-typost"><p class="visually-hidden">Text</p><p style="font-family: var(--font-' . $font_id . ')" class="typost-styled" aria-hidden="true" data-font-id="' . $font_id . '">Text</p></div>',
            ['blockName' => 'typost/block', 'attrs' => ['fontId' => $font_id], 'innerBlocks' => []],
        ];
    }

    /** Render blocks through the collector, as the template does before wp_head. */
    private function renderTemplate($plugin, array $blocks) {
        // template-loader.php: the theme template loads, then renders
        $this->assertSame('/theme/template-canvas.php', $plugin->start_collecting_rendered_block_fonts('/theme/template-canvas.php'));
        foreach ($blocks as $block) {
            $this->assertSame($block[0], $plugin->collect_rendered_block_font_ids($block[0], $block[1]));
        }
        $this->wp_head_done = 1;
        return $plugin;
    }

    /** The markup that the collector keeps and has not read yet. */
    private function storedMarkup($plugin) {
        $markup = new \ReflectionProperty(\Typost::class, 'rendered_block_markup');
        $markup->setAccessible(true);
        $value = $markup->getValue($plugin);
        return is_array($value) ? implode("\n", $value) : $value;
    }

    private function collected($plugin) {
        $ids = $this->invokePrivate($plugin, 'get_rendered_block_font_ids');
        sort($ids);
        return $ids;
    }

    private function variables($plugin) {
        ob_start();
        $plugin->output_font_css_variables();
        $html = ob_get_clean();
        preg_match_all('/--font-(\d+)\s*:/', $html, $matches);
        $ids = array_map('intval', $matches[1]);
        sort($ids);
        return $ids;
    }

    private function fontFaceCss($plugin) {
        $plugin->enqueue_custom_fonts_optimized();
        return isset($this->inline['typost-frontend']) ? $this->inline['typost-frontend'] : '';
    }

    // ── The collector ───────────────────────────────────────────────────────

    public function test_it_reads_font_variables_font_id_attributes_and_the_block_attribute() {
        $plugin = $this->renderTemplate($this->freshInstance(), [
            // A core heading with an inline span
            ['<h2><span class="typost-styled" style="font-family: var(--font-5)">A</span></h2>', ['blockName' => 'core/heading', 'attrs' => []]],
            // An inline span written with data-font-id only
            ["<p><span class='typost-styled' data-font-id='7'>B</span></p>", ['blockName' => 'core/paragraph', 'attrs' => []]],
            // The block attribute, with markup that names no font
            ['<div class="wp-block-typost"></div>', ['blockName' => 'typost/block', 'attrs' => ['fontId' => '9']]],
        ]);

        $this->assertSame([5, 7, 9], $this->collected($plugin));
    }

    public function test_a_font_id_attribute_on_another_block_or_a_preset_variable_is_not_a_font() {
        $plugin = $this->renderTemplate($this->freshInstance(), [
            ['<p style="font-size:var(--wp--preset--font-size--large)">A</p>', ['blockName' => 'core/paragraph', 'attrs' => ['fontId' => 3]]],
            ['<div class="wp-block-typost"></div>', ['blockName' => 'typost/block', 'attrs' => ['fontId' => 'abc']]],
            ['<div class="wp-block-typost"></div>', ['blockName' => 'typost/block', 'attrs' => ['fontId' => 0]]],
            ['<div class="wp-block-typost"></div>', ['blockName' => 'typost/block', 'attrs' => ['fontId' => -4]]],
            ['', ['blockName' => 'typost/block', 'attrs' => []]],
            [null, null],
        ]);

        $this->assertSame([], $this->collected($plugin));
    }

    public function test_a_font_variable_named_in_the_text_is_not_a_font() {
        // A post excerpt in a query loop can quote the variable in prose
        $plugin = $this->renderTemplate($this->freshInstance(), [
            ['<p class="wp-block-post-excerpt__excerpt">Content refers to fonts with a CSS variable, for example var(--font-12) or data-font-id="13".</p>', ['blockName' => 'core/post-excerpt', 'attrs' => []]],
            ['<p><code>var(--font-14)</code></p>', ['blockName' => 'core/paragraph', 'attrs' => []]],
            // Two references in one tag both count
            ['<p><span class="typost-styled" style="font-family: var(--font-5); --typost-alt: var(--font-7)" data-font-id="5">A</span></p>', ['blockName' => 'core/paragraph', 'attrs' => []]],
        ]);

        $this->assertSame([5, 7], $this->collected($plugin));
    }

    public function test_it_reads_the_fonts_that_extensions_report() {
        Filters\expectApplied('typost_content_font_ids')->andReturnUsing(function ($ids, $content) {
            return strpos($content, 'typost-ps-2') !== false ? [11, 'x', 0] : $ids;
        });

        $plugin = $this->renderTemplate($this->freshInstance(), [
            ['<p class="typost-ps-2">Styled by a paragraph style</p>', ['blockName' => 'core/paragraph', 'attrs' => []]],
        ]);

        $this->assertSame([11], $this->collected($plugin));
    }

    public function test_the_extension_filter_runs_once_for_the_page() {
        // The Paragraph Styles callback resolves the styles it finds on each
        // call, so one call for each block made a page with many styled
        // blocks slower
        Filters\expectApplied('typost_content_font_ids')->once()->andReturn([11]);

        $plugin = $this->renderTemplate($this->freshInstance(), [
            ['<p class="typost-ps-2">One</p>', ['blockName' => 'core/paragraph', 'attrs' => []]],
            ['<p class="typost-ps-2">Two</p>', ['blockName' => 'core/paragraph', 'attrs' => []]],
            ['<div class="wp-block-group"><p class="typost-ps-2">One</p><p class="typost-ps-2">Two</p></div>', ['blockName' => 'core/group', 'attrs' => []]],
        ]);

        $this->assertSame([11], $this->collected($plugin));
        // A second read finds the same list without a new call
        $this->assertSame([11], $this->collected($plugin));
    }

    public function test_blocks_rendered_after_a_read_are_read_on_the_next_one() {
        $plugin = $this->freshInstance();
        $plugin->start_collecting_rendered_block_fonts('/theme/template-canvas.php');
        $plugin->collect_rendered_block_font_ids($this->typostBlock(5)[0], ['blockName' => 'core/html']);
        $this->assertSame([5], $this->collected($plugin));

        $plugin->collect_rendered_block_font_ids($this->typostBlock(7)[0], ['blockName' => 'core/html']);

        $this->assertSame([5, 7], $this->collected($plugin));
    }

    public function test_a_classic_theme_collects_nothing() {
        $this->block_theme = false;

        $plugin = $this->renderTemplate($this->freshInstance(), [$this->typostBlock(9)]);

        $this->assertSame([], $this->collected($plugin));
    }

    public function test_blocks_rendered_after_wp_head_are_not_collected() {
        $plugin = $this->freshInstance();
        $plugin->start_collecting_rendered_block_fonts('/theme/template-canvas.php');
        $this->wp_head_done = 1;

        $plugin->collect_rendered_block_font_ids($this->typostBlock(9)[0], $this->typostBlock(9)[1]);

        $this->assertSame([], $this->collected($plugin));
    }

    public function test_blocks_rendered_before_a_theme_template_loads_are_not_collected() {
        // wp and template_redirect run before template_include
        $plugin = $this->freshInstance();
        $plugin->collect_rendered_block_font_ids($this->typostBlock(5)[0], $this->typostBlock(5)[1]);

        $plugin->start_collecting_rendered_block_fonts('/theme/template-canvas.php');
        $plugin->collect_rendered_block_font_ids($this->typostBlock(9)[0], $this->typostBlock(9)[1]);

        $this->assertSame([9], $this->collected($plugin));
    }

    public function test_a_request_that_loads_no_theme_template_keeps_no_markup() {
        // Cron, WP-CLI, XML-RPC, feeds, REST and admin requests never run
        // template_include, and wp_head never fires to stop a collection
        $plugin = $this->freshInstance();
        for ($i = 0; $i < 50; $i++) {
            $plugin->collect_rendered_block_font_ids($this->typostBlock(9)[0], $this->typostBlock(9)[1]);
        }

        $this->assertSame('', $this->storedMarkup($plugin));
        $this->assertSame([], $this->collected($plugin));
    }

    // ── Nested blocks ───────────────────────────────────────────────────────

    public function test_a_nested_block_keeps_its_markup_once() {
        // render_block fires for each block, inner blocks first, and the
        // output of a block holds the output of its inner blocks: a
        // paragraph in a group in a group was kept once for each level
        $leaf = '<p><span class="typost-styled" style="font-family: var(--font-5)">A</span></p>';
        $inner = '<div class="wp-block-group inner">' . $leaf . '</div>';
        $outer = '<div class="wp-block-group outer">' . $inner . '</div>';
        $part = '<header class="wp-block-template-part">' . $outer . '</header>';

        $plugin = $this->freshInstance();
        $plugin->start_collecting_rendered_block_fonts('/theme/template-canvas.php');
        $plugin->collect_rendered_block_font_ids($leaf, ['blockName' => 'core/paragraph', 'attrs' => []]);
        $plugin->collect_rendered_block_font_ids($inner, ['blockName' => 'core/group', 'attrs' => []]);
        $plugin->collect_rendered_block_font_ids($outer, ['blockName' => 'core/group', 'attrs' => []]);
        $plugin->collect_rendered_block_font_ids($part, ['blockName' => 'core/template-part', 'attrs' => []]);

        $this->assertSame(1, substr_count($this->storedMarkup($plugin), $leaf));
        $this->assertSame($part, $this->storedMarkup($plugin));
        $this->assertSame([5], $this->collected($plugin));
    }

    public function test_sibling_blocks_are_all_kept() {
        $first = '<p><span class="typost-styled" style="font-family: var(--font-5)">A</span></p>';
        $second = '<p><span class="typost-styled" style="font-family: var(--font-7)">B</span></p>';
        $group = '<div class="wp-block-group">' . $first . "\n\n" . $second . '</div>';
        $footer = '<p><span class="typost-styled" data-font-id="9">C</span></p>';

        $plugin = $this->freshInstance();
        $plugin->start_collecting_rendered_block_fonts('/theme/template-canvas.php');
        // Two inner blocks of one group, then a block after the group
        $plugin->collect_rendered_block_font_ids($first, ['blockName' => 'core/paragraph', 'attrs' => []]);
        $plugin->collect_rendered_block_font_ids($second, ['blockName' => 'core/paragraph', 'attrs' => []]);
        $plugin->collect_rendered_block_font_ids($group, ['blockName' => 'core/group', 'attrs' => []]);
        $plugin->collect_rendered_block_font_ids($footer, ['blockName' => 'core/paragraph', 'attrs' => []]);

        $stored = $this->storedMarkup($plugin);
        $this->assertSame($group . "\n" . $footer, $stored);
        $this->assertSame(1, substr_count($stored, $first));
        $this->assertSame(1, substr_count($stored, $second));
        $this->assertSame([5, 7, 9], $this->collected($plugin));
    }

    public function test_an_inner_block_that_its_parent_does_not_output_verbatim_is_kept() {
        // A parent that drops or rewrites the output of its inner blocks:
        // the collector cannot tell the two apart, so it keeps the inner
        // block (a font that loads for nothing, never a font that is
        // missing)
        $leaf = '<p><span class="typost-styled" style="font-family: var(--font-9)">A</span></p>';
        $previous = '<p><span class="typost-styled" style="font-family: var(--font-5)">B</span></p>';

        $plugin = $this->freshInstance();
        $plugin->start_collecting_rendered_block_fonts('/theme/template-canvas.php');
        $plugin->collect_rendered_block_font_ids($previous, ['blockName' => 'core/paragraph', 'attrs' => []]);
        $plugin->collect_rendered_block_font_ids($leaf, ['blockName' => 'core/paragraph', 'attrs' => []]);
        $plugin->collect_rendered_block_font_ids('<div class="wp-block-example"></div>', ['blockName' => 'example/drops-content', 'attrs' => []]);
        $rewritten = str_replace('<span ', '<span data-extra="1" ', $leaf);
        $plugin->collect_rendered_block_font_ids('<div class="wp-block-example">' . $rewritten . '</div>', ['blockName' => 'example/rewrites-content', 'attrs' => []]);

        $stored = $this->storedMarkup($plugin);
        $this->assertSame(1, substr_count($stored, $previous));
        $this->assertSame(1, substr_count($stored, $leaf));
        $this->assertSame([5, 9], $this->collected($plugin));
    }

    public function test_a_query_loop_keeps_each_post_once() {
        // core/post-template renders its inner blocks once for each post,
        // and core/query holds the post template
        $plugin = $this->freshInstance();
        $plugin->start_collecting_rendered_block_fonts('/theme/template-canvas.php');
        $items = '';
        foreach ([3, 5, 7] as $font_id) {
            $title = '<h2 class="wp-block-post-title"><span class="typost-styled" data-font-id="' . $font_id . '">T</span></h2>';
            $plugin->collect_rendered_block_font_ids($title, ['blockName' => 'core/post-title', 'attrs' => []]);
            $plugin->collect_rendered_block_font_ids($title, ['blockName' => null, 'attrs' => []]);
            $items .= '<li class="wp-block-post">' . $title . '</li>';
        }
        $template = '<ul class="wp-block-post-template">' . $items . '</ul>';
        $plugin->collect_rendered_block_font_ids($template, ['blockName' => 'core/post-template', 'attrs' => []]);
        $query = '<div class="wp-block-query">' . $template . '</div>';
        $plugin->collect_rendered_block_font_ids($query, ['blockName' => 'core/query', 'attrs' => []]);

        $this->assertSame($query, $this->storedMarkup($plugin));
        $this->assertSame([3, 5, 7], $this->collected($plugin));
    }

    public function test_blocks_rendered_for_an_excerpt_are_not_collected() {
        // core/post-excerpt on a search or archive page: wp_trim_excerpt()
        // renders the whole post on get_the_excerpt, and shows only text
        $plugin = $this->freshInstance();
        $plugin->start_collecting_rendered_block_fonts('/theme/template-canvas.php');

        $this->doing_filters = ['get_the_excerpt', 'the_content'];
        $plugin->collect_rendered_block_font_ids($this->typostBlock(5)[0], $this->typostBlock(5)[1]);
        $this->doing_filters = ['the_content'];
        $plugin->collect_rendered_block_font_ids($this->typostBlock(9)[0], $this->typostBlock(9)[1]);

        $this->assertSame([9], $this->collected($plugin));
    }

    // ── The --font-N variables ──────────────────────────────────────────────

    public function test_a_template_font_prints_its_variable_with_the_content_fonts() {
        $this->seedFonts();
        $this->content(['id:3']);

        $plugin = $this->renderTemplate($this->freshInstance(), [$this->typostBlock(9)]);

        $this->assertSame([3, 9], $this->variables($plugin));
    }

    public function test_a_page_with_nothing_styled_prints_the_template_font_variable() {
        // A site title in the header on a page with plain content: the
        // variables element prints when the page's list has a font (#482).
        $this->seedFonts();
        $this->content([]);

        $plugin = $this->renderTemplate($this->freshInstance(), [$this->typostBlock(9)]);

        $this->assertSame([9], $this->variables($plugin));
    }

    public function test_a_deleted_template_font_prints_its_alias_and_the_replacement() {
        $this->seedFonts();
        $this->options['typost_font_replacements'] = [
            'mappings' => [16 => 7],
            'global_load' => [],
            'next_id' => 21,
        ];
        $this->content(['id:3']);

        $plugin = $this->renderTemplate($this->freshInstance(), [$this->typostBlock(16)]);

        $this->assertSame([3, 7, 16], $this->variables($plugin));
    }

    public function test_a_classic_theme_prints_only_the_content_fonts() {
        $this->seedFonts();
        $this->block_theme = false;
        $this->content(['id:3']);

        $plugin = $this->renderTemplate($this->freshInstance(), [$this->typostBlock(9)]);

        $this->assertSame([3], $this->variables($plugin));
    }

    public function test_a_template_without_fonts_adds_nothing() {
        $this->seedFonts();
        $this->content(['id:3']);

        $plugin = $this->renderTemplate($this->freshInstance(), [
            ['<header class="wp-block-group"><p class="wp-block-site-title">Site</p></header>', ['blockName' => 'core/group', 'attrs' => []]],
        ]);

        $this->assertSame([3], $this->variables($plugin));
        $this->assertSame([3], $this->fontFaceCssIds($plugin));
    }

    // ── The @font-face CSS and the Adobe Fonts kits ─────────────────────────

    /** The kits whose @font-face the frontend CSS holds, by font ID. */
    private function fontFaceCssIds($plugin) {
        $css = $this->fontFaceCss($plugin);
        $names = ['Three' => 3, 'Five' => 5, 'Seven' => 7, 'Nine' => 9];
        $ids = [];
        foreach ($names as $name => $id) {
            if (strpos($css, '"' . $name . '"') !== false) {
                $ids[] = $id;
            }
        }
        return $ids;
    }

    public function test_a_template_font_loads_its_font_face() {
        $this->seedFonts();
        $this->content(['id:3']);

        $plugin = $this->renderTemplate($this->freshInstance(), [$this->typostBlock(9)]);

        $this->assertSame([3, 9], $this->fontFaceCssIds($plugin));
    }

    public function test_a_deleted_template_font_loads_the_replacement_font_face() {
        $this->seedFonts();
        $this->options['typost_font_replacements'] = [
            'mappings' => [16 => 7],
            'global_load' => [],
            'next_id' => 21,
        ];
        $this->content(['id:3']);

        $plugin = $this->renderTemplate($this->freshInstance(), [$this->typostBlock(16)]);

        $this->assertSame([3, 7], $this->fontFaceCssIds($plugin));
    }

    public function test_a_classic_theme_loads_only_the_content_font_faces() {
        $this->seedFonts();
        $this->block_theme = false;
        $this->content(['id:3']);

        $plugin = $this->renderTemplate($this->freshInstance(), [$this->typostBlock(9)]);

        $this->assertSame([3], $this->fontFaceCssIds($plugin));
    }

    public function test_a_page_with_nothing_styled_loads_the_template_font_face() {
        $this->seedFonts();
        $this->content([]);

        $plugin = $this->renderTemplate($this->freshInstance(), [$this->typostBlock(9)]);
        $plugin->enqueue_frontend_assets();

        $this->assertContains('typost-frontend', $this->enqueued);
        $this->assertStringContainsString('"Nine"', $this->inline['typost-frontend']);
    }

    public function test_a_page_with_nothing_styled_and_no_template_font_loads_nothing() {
        $this->seedFonts();
        $this->content([]);

        $plugin = $this->renderTemplate($this->freshInstance(), [
            ['<p>Plain</p>', ['blockName' => 'core/paragraph', 'attrs' => []]],
        ]);
        $plugin->enqueue_frontend_assets();

        $this->assertSame([], $this->enqueued);
        $this->assertSame([], $this->inline);
    }

    public function test_an_adobe_font_in_the_template_loads_its_kit() {
        $this->seedFonts();
        $this->content(['id:3']);

        $plugin = $this->renderTemplate($this->freshInstance(), [$this->typostBlock(20)]);
        $plugin->enqueue_adobe_fonts();

        $this->assertSame(['typost-adobe-twk'], $this->enqueued);
    }

    public function test_an_adobe_font_used_nowhere_loads_no_kit() {
        $this->seedFonts();
        $this->content(['id:3']);

        $plugin = $this->renderTemplate($this->freshInstance(), [$this->typostBlock(9)]);
        $plugin->enqueue_adobe_fonts();

        $this->assertSame([], $this->enqueued);
    }
}

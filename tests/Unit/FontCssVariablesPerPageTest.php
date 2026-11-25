<?php
namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use Brain\Monkey\Functions;
use Brain\Monkey\Filters;

/**
 * Tests for the --font-N variables a frontend page prints (#474).
 *
 * A frontend page prints the variables only for the fonts it uses: the
 * fonts its content references (paragraph styles report theirs through
 * typost_content_font_ids), the replacement of each deleted font in that
 * list with the deleted font's alias line, the fonts that
 * typost_force_enqueue_font_ids adds, and the fonts with "Load on all
 * pages" on. The editor and admin pages keep every variable.
 */
class FontCssVariablesPerPageTest extends TestCase {

    /** @var array Simulated wp_options storage */
    private $options;

    /** @var array Simulated transients */
    private $transients;

    /** @var bool Simulated is_admin() */
    private $is_admin;

    /** @var bool Simulated is_singular() */
    private $is_singular;

    /** @var object|null Simulated queried post */
    private $queried;

    public static function setUpBeforeClass(): void {
        parent::setUpBeforeClass();
        if (!defined('DAY_IN_SECONDS')) {
            define('DAY_IN_SECONDS', 86400);
        }
        if (!defined('HOUR_IN_SECONDS')) {
            define('HOUR_IN_SECONDS', 3600);
        }
    }

    protected function setUp(): void {
        parent::setUp();

        static $loaded = false;
        if (!$loaded) {
            require_once TYPOST_PLUGIN_DIR . '/typography-stylist.php';
            $loaded = true;
        }

        $this->options = [];
        $this->transients = [];
        $this->is_admin = false;
        $this->is_singular = true;
        $this->queried = (object) ['ID' => 42, 'post_content' => '<p>Plain</p>'];

        $options = &$this->options;
        $transients = &$this->transients;
        $is_admin = &$this->is_admin;
        $is_singular = &$this->is_singular;
        $queried = &$this->queried;

        Functions\when('get_option')->alias(function ($key, $default = false) use (&$options) {
            return array_key_exists($key, $options) ? $options[$key] : $default;
        });
        Functions\when('update_option')->alias(function ($key, $value) use (&$options) {
            $options[$key] = $value;
            return true;
        });
        Functions\when('get_transient')->alias(function ($key) use (&$transients) {
            return array_key_exists($key, $transients) ? $transients[$key] : false;
        });
        Functions\when('set_transient')->alias(function ($key, $value) use (&$transients) {
            $transients[$key] = $value;
            return true;
        });
        Functions\when('delete_transient')->alias(function ($key) use (&$transients) {
            unset($transients[$key]);
            return true;
        });
        Functions\when('is_admin')->alias(function () use (&$is_admin) {
            return $is_admin;
        });
        Functions\when('is_singular')->alias(function () use (&$is_singular) {
            return $is_singular;
        });
        Functions\when('get_queried_object')->alias(function () use (&$queried) {
            return $queried;
        });
        Functions\when('parse_blocks')->justReturn([]);
        Functions\when('do_blocks')->returnArg();
        Functions\when('wp_kses')->returnArg();
        Functions\when('post_type_exists')->justReturn(true);
        Functions\when('get_posts')->justReturn([]);
        Functions\when('sanitize_title')->alias(function ($title) {
            return trim(preg_replace('/[^a-z0-9-]+/', '-', strtolower((string) $title)), '-');
        });
    }

    private function freshInstance() {
        $reflection = new \ReflectionClass(\Typost::class);
        return $reflection->newInstanceWithoutConstructor();
    }

    private function setPrivate($object, $name, $value) {
        $property = new \ReflectionProperty(\Typost::class, $name);
        $property->setAccessible(true);
        $property->setValue($object, $value);
    }

    private function invokePrivate($object, $method, array $args = []) {
        $reflection = new \ReflectionMethod(\Typost::class, $method);
        $reflection->setAccessible(true);
        return $reflection->invokeArgs($object, $args);
    }

    private function kit($font_id, $family, array $overrides = []) {
        return array_merge([
            'id' => 'kit-' . $font_id,
            'name' => $family,
            'font_id' => $font_id,
            'css_content' => '@font-face {}',
            'font_faces' => [
                ['family' => $family, 'weight' => '400', 'style' => 'normal', 'src' => "url('f.woff2')"],
            ],
            'fallbacks' => 'serif',
        ], $overrides);
    }

    /** Five uploaded fonts (3, 5, 7, 9, 11) and one Adobe font (20). */
    private function seedFonts() {
        $this->options['typost_custom_fonts'] = [
            $this->kit(3, 'Three'),
            $this->kit(5, 'Five'),
            $this->kit(7, 'Seven'),
            $this->kit(9, 'Nine'),
            $this->kit(11, 'Eleven'),
        ];
        $this->options['typost_adobe_fonts'] = [
            ['id' => 'adobe-20', 'name' => 'Twenty', 'font_id' => 20, 'font_family' => 'twenty-pro', 'css_url' => 'https://use.typekit.net/k.css'],
        ];
    }

    /** A singular page whose cached content scan found these references. */
    private function singularPage(array $used_fonts) {
        $this->is_singular = true;
        $this->transients['typost_has_styled_42'] = 'yes';
        $this->transients['typost_used_fonts_42'] = $used_fonts;
    }

    /** Run the wp_head output and return what it echoed. */
    private function output($plugin = null) {
        $plugin = $plugin ?: $this->freshInstance();
        ob_start();
        $plugin->output_font_css_variables();
        return ob_get_clean();
    }

    /** The font IDs declared in an echoed element, sorted. */
    private function printedIds($html) {
        preg_match_all('/--font-(\d+)\s*:/', $html, $matches);
        $ids = array_map('intval', $matches[1]);
        sort($ids);
        return $ids;
    }

    // ── get_font_css_variables() with and without a font list ───────────────

    public function test_without_a_list_every_font_is_declared() {
        $this->seedFonts();

        $css = $this->freshInstance()->get_font_css_variables();

        $this->assertSame([3, 5, 7, 9, 11, 20], $this->printedIds($css));
    }

    public function test_a_list_selects_its_fonts_and_keeps_the_root_shape() {
        $this->seedFonts();

        $css = $this->freshInstance()->get_font_css_variables([5, 3]);

        $this->assertSame(":root {\n    --font-3: \"Three\", serif;\n    --font-5: \"Five\", serif;\n}", $css);
        // sanitize_output_css() accepts it unchanged
        $this->assertSame($css, $this->invokePrivate($this->freshInstance(), 'sanitize_output_css', [$css]));
    }

    public function test_an_empty_list_or_unknown_ids_give_nothing() {
        $this->seedFonts();
        $plugin = $this->freshInstance();

        $this->assertSame('', $plugin->get_font_css_variables([]));
        $this->assertSame('', $plugin->get_font_css_variables([99, 0, -3]));
    }

    public function test_the_cache_holds_every_font_and_selection_follows_the_read() {
        $this->seedFonts();
        $plugin = $this->freshInstance();

        $plugin->get_font_css_variables([3]);

        // The cache keeps the declaration of every font, one entry each, so
        // pages with other fonts reuse it
        $this->assertArrayHasKey('typost_css_variable_decls', $this->transients);
        $this->assertCount(6, $this->transients['typost_css_variable_decls']);
        $this->assertArrayNotHasKey('typost_css_variables', $this->transients);

        // A second page selects from the cached list, not from the options
        $this->options['typost_custom_fonts'] = [];
        $this->assertSame([5, 9], $this->printedIds($this->freshInstance()->get_font_css_variables([5, 9])));
    }

    public function test_a_joined_string_under_the_old_key_is_not_read() {
        $this->seedFonts();
        // What 2.3.x cached: the joined string of every font
        $this->transients['typost_css_variables'] = ":root {\n    --font-99: \"Old\";\n}";

        $css = $this->freshInstance()->get_font_css_variables([3]);

        $this->assertSame([3], $this->printedIds($css));
    }

    public function test_a_cache_entry_that_is_not_a_list_is_rebuilt() {
        $this->seedFonts();
        $this->transients['typost_css_variable_decls'] = 'not a list';

        $css = $this->freshInstance()->get_font_css_variables([7]);

        $this->assertSame([7], $this->printedIds($css));
        $this->assertIsArray($this->transients['typost_css_variable_decls']);
    }

    // ── The frontend element (output_font_css_variables) ─────────────────────

    public function test_a_page_that_uses_fonts_3_and_5_prints_only_those() {
        $this->seedFonts();
        $this->singularPage(['id:3', 'id:5']);

        $html = $this->output();

        $this->assertStringContainsString('<style id="typost-font-variables">', $html);
        $this->assertSame([3, 5], $this->printedIds($html));
    }

    public function test_a_deleted_font_prints_its_alias_and_the_replacement() {
        $this->seedFonts();
        $this->options['typost_font_replacements'] = [
            'mappings' => [16 => 7],
            'global_load' => [],
            'next_id' => 21,
        ];
        $this->singularPage(['id:16', 'id:3']);

        $html = $this->output();

        $this->assertStringContainsString('--font-16: var(--font-7)', $html);
        $this->assertSame([3, 7, 16], $this->printedIds($html));
    }

    public function test_a_replacement_chain_prints_every_link() {
        // add_font_replacement() flattens chains, so only a raw option write
        // can store one; the alias of the middle font must print too, or the
        // first alias points at an undefined variable.
        $this->seedFonts();
        $this->options['typost_font_replacements'] = [
            'mappings' => [16 => 29, 29 => 9, 30 => 31, 31 => 30],
            'global_load' => [],
            'next_id' => 32,
        ];
        $this->singularPage(['id:16', 'id:30']);

        $html = $this->output();

        $this->assertStringContainsString('--font-16: var(--font-29)', $html);
        $this->assertStringContainsString('--font-29: var(--font-9)', $html);
        // A cycle ends without looping
        $this->assertSame([9, 16, 29, 30, 31], $this->printedIds($html));
    }

    public function test_a_forced_font_prints_on_a_page_that_does_not_reference_it() {
        $this->seedFonts();
        $this->singularPage(['id:3']);
        Filters\expectApplied('typost_force_enqueue_font_ids')->andReturn([20]);

        $html = $this->output();

        $this->assertSame([3, 20], $this->printedIds($html));
    }

    public function test_a_forced_font_prints_on_a_page_with_nothing_styled() {
        $this->seedFonts();
        $this->transients['typost_has_styled_42'] = 'no';
        $this->transients['typost_used_fonts_42'] = [];
        Filters\expectApplied('typost_force_enqueue_font_ids')->andReturn([9]);

        $this->assertSame([9], $this->printedIds($this->output()));
    }

    public function test_load_on_all_pages_fonts_print_on_a_styled_page() {
        $this->options['typost_custom_fonts'] = [
            $this->kit(3, 'Three'),
            $this->kit(5, 'Five', ['load_on_all_pages' => true]),
        ];
        $this->options['typost_adobe_fonts'] = [
            ['id' => 'adobe-20', 'font_id' => 20, 'font_family' => 'twenty-pro', 'load_on_all_pages' => true],
            ['id' => 'adobe-21', 'font_id' => 21, 'font_family' => 'twenty-one-pro'],
        ];
        $this->singularPage(['id:3']);

        $this->assertSame([3, 5, 20], $this->printedIds($this->output()));
    }

    public function test_a_global_load_replacement_prints_its_alias_and_target() {
        $this->seedFonts();
        $this->options['typost_font_replacements'] = [
            'mappings' => [16 => 7, 17 => 9],
            'global_load' => [16],
            'next_id' => 21,
        ];
        $this->transients['typost_has_styled_42'] = 'no';
        $this->transients['typost_used_fonts_42'] = [];

        $html = $this->output();

        $this->assertStringContainsString('--font-16: var(--font-7)', $html);
        $this->assertSame([7, 16], $this->printedIds($html));
    }

    public function test_a_paragraph_style_font_prints_through_the_content_scan() {
        // Nothing cached: the real singular scan runs. The content names no
        // font; the module reports the style's font through the filter.
        $this->seedFonts();
        $this->queried = (object) ['ID' => 42, 'post_content' => '<p class="typost-ps-2">Styled by a style</p>'];
        Filters\expectApplied('typost_content_font_ids')->andReturnUsing(function ($ids, $content) {
            return strpos($content, 'typost-ps-2') !== false ? [11] : $ids;
        });

        $html = $this->output();

        $this->assertSame([11], $this->printedIds($html));
    }

    public function test_an_archive_prints_the_fonts_of_every_post_on_the_page() {
        // detect_frontend_fonts() stored the fonts of all posts in the loop
        $this->seedFonts();
        $this->is_singular = false;
        $plugin = $this->freshInstance();
        $this->setPrivate($plugin, 'fonts_detected', true);
        $this->setPrivate($plugin, 'has_styled_content', true);
        $this->setPrivate($plugin, 'detected_fonts', [
            'font_ids' => [5, 9],
            'font_families' => [],
            'has_always_load' => false,
        ]);
        // has_styled_content() reads the archive answer from its transient
        $GLOBALS['wp_query'] = (object) ['posts' => [(object) ['ID' => 1], (object) ['ID' => 2]]];
        Functions\when('wp_list_pluck')->justReturn([1, 2]);
        $this->transients['typost_has_styled_archive_' . md5(serialize([1, 2]))] = 'yes';

        $html = $this->output($plugin);
        unset($GLOBALS['wp_query']);

        $this->assertSame([5, 9], $this->printedIds($html));
    }

    public function test_a_page_with_nothing_styled_and_no_forced_fonts_prints_no_element() {
        $this->seedFonts();
        $this->transients['typost_has_styled_42'] = 'no';
        $this->transients['typost_used_fonts_42'] = [];

        $this->assertSame('', $this->output());
    }

    public function test_a_styled_page_that_uses_no_font_prints_no_element() {
        $this->seedFonts();
        $this->singularPage([]);

        $this->assertSame('', $this->output());
    }

    public function test_admin_pages_print_every_font() {
        $this->seedFonts();
        $this->is_admin = true;
        $this->singularPage(['id:3']);

        $this->assertSame([3, 5, 7, 9, 11, 20], $this->printedIds($this->output()));
    }

    public function test_a_new_font_prints_on_the_next_load_after_the_cache_clear() {
        $this->seedFonts();
        $this->singularPage(['id:3', 'id:12']);
        $this->assertSame([3], $this->printedIds($this->output()));

        // A new font 12 is saved: the save routes call clear_cache()
        $this->options['typost_custom_fonts'][] = $this->kit(12, 'Twelve');
        $GLOBALS['wpdb'] = new class {
            public $options = 'wp_options';
            public function esc_like($text) { return $text; }
            public function prepare($query) { return $query; }
            public function query($query) { return 0; }
        };
        Functions\when('wp_cache_delete')->justReturn(true);
        $this->invokePrivate($this->freshInstance(), 'clear_cache');
        unset($GLOBALS['wpdb']);

        $this->assertArrayNotHasKey('typost_css_variable_decls', $this->transients);
        $this->singularPage(['id:3', 'id:12']);
        $this->assertSame([3, 12], $this->printedIds($this->output()));
    }
}

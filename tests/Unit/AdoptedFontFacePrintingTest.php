<?php
namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use Brain\Monkey\Functions;

/**
 * Tests for printing @font-face rules for ADOPTED WP Font Library fonts.
 *
 * An adopted Library font that is installed but not activated in global
 * styles gets no @font-face from wp_print_font_faces(), so the plugin must
 * build the rules from the family's wp_font_face posts and append them to
 * the same combined CSS the uploaded kits use (QA finding E-8). Covers:
 *
 * - Typost_Font_Library_Bridge::build_font_face_rule() sanitization
 * - build_font_face_css_for_family() reading wp_font_face posts
 * - adopted_entry_faces_printed_by_wordpress() (activated vs installed)
 * - the frontend path (enqueue_custom_fonts_optimized): emitted only when
 *   the font is used on the page AND WordPress will not print it
 * - the font CSS cache key changing with the adopted-faces state
 * - the deleted_post watcher reporting adopted families so caches clear
 */
class AdoptedFontFacePrintingTest extends TestCase {

    /** @var array Simulated wp_options storage */
    private $options;

    /** @var array Simulated wp_font_family posts */
    private $family_posts;

    /** @var array Simulated wp_font_face posts keyed by parent ID */
    private $face_posts;

    public static function setUpBeforeClass(): void {
        parent::setUpBeforeClass();

        // Same test double FontFacePrintingTest installs: output controlled
        // per-test via $fonts (array of families, each an array of faces
        // with kebab-case keys).
        if (!class_exists('WP_Font_Face_Resolver')) {
            eval('class WP_Font_Face_Resolver {
                public static $fonts = array();
                public static function get_fonts_from_theme_json() {
                    return self::$fonts;
                }
            }');
        }
        if (!defined('DAY_IN_SECONDS')) {
            define('DAY_IN_SECONDS', 86400);
        }
    }

    protected function setUp(): void {
        parent::setUp();

        static $loaded = false;
        if (!$loaded) {
            require_once TYPOST_PLUGIN_DIR . '/includes/class-typost-font-sources.php';
            require_once TYPOST_PLUGIN_DIR . '/includes/class-typost-font-library-bridge.php';
            require_once TYPOST_PLUGIN_DIR . '/typography-stylist.php';
            $loaded = true;
        }

        \WP_Font_Face_Resolver::$fonts = [];
        $this->options = [];
        $this->family_posts = [];
        $this->face_posts = [];

        $options = &$this->options;
        $family_posts = &$this->family_posts;
        $face_posts = &$this->face_posts;

        Functions\when('get_option')->alias(function ($key, $default = false) use (&$options) {
            return array_key_exists($key, $options) ? $options[$key] : $default;
        });
        Functions\when('update_option')->alias(function ($key, $value) use (&$options) {
            $options[$key] = $value;
            return true;
        });
        Functions\when('post_type_exists')->justReturn(true);
        Functions\when('sanitize_title')->alias(function ($title) {
            return trim(preg_replace('/[^a-z0-9-]+/', '-', strtolower((string) $title)), '-');
        });
        Functions\when('wp_list_pluck')->alias(function ($list, $field) {
            $out = [];
            foreach ($list as $item) {
                $out[] = is_object($item) ? $item->$field : $item[$field];
            }
            return $out;
        });
        Functions\when('get_posts')->alias(function ($args) use (&$family_posts, &$face_posts) {
            if (isset($args['post_type']) && 'wp_font_family' === $args['post_type']) {
                if (isset($args['name'])) {
                    return array_values(array_filter($family_posts, function ($post) use ($args) {
                        return $post->post_name === $args['name'];
                    }));
                }
                return array_values($family_posts);
            }
            if (isset($args['post_type']) && 'wp_font_face' === $args['post_type']) {
                $parent = isset($args['post_parent']) ? (int) $args['post_parent'] : 0;
                return isset($face_posts[$parent]) ? $face_posts[$parent] : [];
            }
            return [];
        });
    }

    // ── Fixtures ────────────────────────────────────────────────────────────

    private function addFamily($slug, $post_id, $font_family = null) {
        $this->family_posts[] = (object) [
            'ID' => $post_id,
            'post_type' => 'wp_font_family',
            'post_name' => $slug,
            'post_title' => ucwords(str_replace('-', ' ', $slug)),
            'post_content' => json_encode(['fontFamily' => $font_family ?: ucwords(str_replace('-', ' ', $slug))]),
            'post_parent' => 0,
            'post_status' => 'publish',
        ];
    }

    private function addFace($parent_id, array $settings) {
        $this->face_posts[$parent_id][] = (object) [
            'ID' => 1000 + count($this->face_posts[$parent_id] ?? []),
            'post_type' => 'wp_font_face',
            'post_parent' => $parent_id,
            'post_content' => json_encode($settings),
            'post_status' => 'publish',
        ];
    }

    private function adoptedEntry($slug = 'fraunces', $font_id = 41, $font_family = 'Fraunces') {
        return [
            'id' => 'wpl-' . $slug,
            'name' => ucwords(str_replace('-', ' ', $slug)),
            'wp_slug' => $slug,
            'font_id' => $font_id,
            'font_family' => $font_family,
            'fallbacks' => '',
            'added_date' => '2026-09-18 10:00:00',
        ];
    }

    private function activate($family) {
        \WP_Font_Face_Resolver::$fonts[] = [
            ['font-family' => $family, 'src' => ['http://example.test/' . strtolower($family) . '.woff2']],
        ];
    }

    private function bridge() {
        return new \Typost_Font_Library_Bridge(new \Typost_Font_Sources());
    }

    /**
     * A Typost instance without the constructor, with the archive-page
     * detection results pre-populated so enqueue_custom_fonts_optimized()
     * takes the cached-detection branch instead of scanning content.
     */
    private function frontendPlugin(array $used_font_ids) {
        $reflection = new \ReflectionClass(\Typost::class);
        $plugin = $reflection->newInstanceWithoutConstructor();

        foreach (['fonts_detected' => true, 'detected_fonts' => [
            'font_ids' => $used_font_ids,
            'font_families' => [],
            'has_always_load' => false,
        ]] as $name => $value) {
            $property = new \ReflectionProperty(\Typost::class, $name);
            $property->setAccessible(true);
            $property->setValue($plugin, $value);
        }

        return $plugin;
    }

    private function invokePrivate($object, $method, ...$args) {
        $reflection = new \ReflectionMethod(get_class($object), $method);
        $reflection->setAccessible(true);
        return $reflection->invokeArgs($object, $args);
    }

    /**
     * Run the frontend font path and return the CSS handed to
     * wp_add_inline_style('typost-frontend') ('' when nothing was added).
     */
    private function runFrontend(array $used_font_ids) {
        $inline = [];
        Functions\when('is_singular')->justReturn(false);
        Functions\when('get_transient')->justReturn(false);
        Functions\when('set_transient')->justReturn(true);
        Functions\when('wp_add_inline_style')->alias(function ($handle, $css) use (&$inline) {
            $inline[$handle] = $css;
            return true;
        });

        $this->frontendPlugin($used_font_ids)->enqueue_custom_fonts_optimized();

        return isset($inline['typost-frontend']) ? $inline['typost-frontend'] : '';
    }

    // ── build_font_face_rule ────────────────────────────────────────────────

    public function test_rule_from_string_src() {
        $rule = $this->bridge()->build_font_face_rule([
            'fontFamily' => 'Fraunces',
            'fontStyle' => 'italic',
            'fontWeight' => '100 900',
            'fontDisplay' => 'swap',
            'src' => 'http://example.test/fonts/fraunces-italic.woff2',
        ]);

        $this->assertSame(
            '@font-face{font-family:"Fraunces";font-style:italic;font-weight:100 900;font-display:swap;src:url("http://example.test/fonts/fraunces-italic.woff2") format("woff2");}',
            $rule
        );
    }

    public function test_rule_from_src_array_keeps_order_and_formats() {
        $rule = $this->bridge()->build_font_face_rule([
            'fontFamily' => '"Playfair Display"',
            'fontWeight' => 700,
            'src' => [
                'http://example.test/fonts/pd.woff2',
                'http://example.test/fonts/pd.woff',
                'http://example.test/fonts/pd.ttf?v=2',
            ],
        ]);

        $this->assertStringContainsString('font-family:"Playfair Display"', $rule);
        $this->assertStringContainsString('font-weight:700', $rule);
        $this->assertStringContainsString('font-style:normal', $rule);
        $this->assertStringContainsString(
            'src:url("http://example.test/fonts/pd.woff2") format("woff2"), url("http://example.test/fonts/pd.woff") format("woff"), url("http://example.test/fonts/pd.ttf?v=2") format("truetype");',
            $rule
        );
        $this->assertStringNotContainsString('font-display', $rule);
    }

    public function test_face_without_src_is_skipped() {
        $bridge = $this->bridge();
        $this->assertSame('', $bridge->build_font_face_rule(['fontFamily' => 'Fraunces', 'fontWeight' => '400']));
        $this->assertSame('', $bridge->build_font_face_rule(['fontFamily' => 'Fraunces', 'src' => []]));
        $this->assertSame('', $bridge->build_font_face_rule(['fontFamily' => 'Fraunces', 'src' => '']));
        $this->assertSame('', $bridge->build_font_face_rule(['fontFamily' => 'Fraunces', 'src' => [null, 42]]));
    }

    public function test_face_without_family_is_skipped() {
        $this->assertSame('', $this->bridge()->build_font_face_rule([
            'src' => 'http://example.test/fonts/x.woff2',
        ]));
    }

    public function test_rule_sanitizes_values() {
        $rule = $this->bridge()->build_font_face_rule([
            'fontFamily' => 'Evil"; } body { display:none } @font-face { font-family:"x',
            'fontStyle' => 'slanted',
            'fontWeight' => '1200',
            'fontDisplay' => 'expression(alert(1))',
            'fontStretch' => 'wide',
            'unicodeRange' => 'not-a-range',
            'src' => [
                'http://example.test/fonts/ok.woff2',
                'http://example.test/fonts/bad"file.woff2',
            ],
        ]);

        // The payload survives only as an inert family-name string: no
        // quote, brace or semicolon is left to close the declaration, so the
        // rule still has exactly one block and the family is one quoted token.
        $this->assertSame(1, substr_count($rule, '{'));
        $this->assertSame(1, substr_count($rule, '}'));
        $this->assertSame(1, preg_match('/^@font-face\{font-family:"[^"{};]*";font-style:/', $rule));
        $this->assertStringContainsString('font-style:normal', $rule);
        $this->assertStringContainsString('font-weight:400', $rule);
        $this->assertStringNotContainsString('font-display', $rule);
        $this->assertStringNotContainsString('font-stretch', $rule);
        $this->assertStringNotContainsString('unicode-range', $rule);
        $this->assertStringNotContainsString('bad"file', $rule);
        $this->assertStringContainsString('src:url("http://example.test/fonts/ok.woff2") format("woff2");', $rule);
    }

    public function test_rule_keeps_valid_stretch_and_unicode_range() {
        $rule = $this->bridge()->build_font_face_rule([
            'fontFamily' => 'Fraunces',
            'fontStretch' => 'semi-condensed',
            'unicodeRange' => 'U+0000-00FF, U+0131',
            'src' => 'http://example.test/fonts/fraunces.otf',
        ]);

        $this->assertStringContainsString('font-stretch:semi-condensed', $rule);
        $this->assertStringContainsString('unicode-range:U+0000-00FF,U+0131', $rule);
        $this->assertStringContainsString('format("opentype")', $rule);
    }

    // ── build_font_face_css_for_family ──────────────────────────────────────

    public function test_family_css_is_built_from_face_posts_and_skips_srcless_faces() {
        $this->addFamily('fraunces', 500);
        $this->addFace(500, ['fontFamily' => 'Fraunces', 'fontWeight' => '400', 'src' => 'http://example.test/f-400.woff2']);
        $this->addFace(500, ['fontFamily' => 'Fraunces', 'fontWeight' => '700']); // no src
        $this->addFace(500, ['fontFamily' => 'Fraunces', 'fontWeight' => '900', 'fontStyle' => 'italic', 'src' => ['http://example.test/f-900i.woff2']]);

        $css = $this->bridge()->build_font_face_css_for_family('fraunces');

        $this->assertSame(2, substr_count($css, '@font-face{'));
        $this->assertStringContainsString('font-weight:400', $css);
        $this->assertStringContainsString('font-weight:900', $css);
        $this->assertStringNotContainsString('font-weight:700', $css);
    }

    public function test_family_css_is_empty_for_unknown_slug_or_without_font_library() {
        $this->addFamily('fraunces', 500);
        $this->addFace(500, ['fontFamily' => 'Fraunces', 'src' => 'http://example.test/f.woff2']);

        $this->assertSame('', $this->bridge()->build_font_face_css_for_family('missing'));
        $this->assertSame('', $this->bridge()->build_font_face_css_for_family(''));

        Functions\when('post_type_exists')->justReturn(false);
        $this->assertSame('', $this->bridge()->build_font_face_css_for_family('fraunces'));
    }

    // ── adopted_entry_faces_printed_by_wordpress ────────────────────────────

    public function test_adopted_installed_but_not_activated_is_not_printed_by_wordpress() {
        $this->addFamily('fraunces', 500);
        \WP_Font_Face_Resolver::$fonts = [];

        $this->assertFalse($this->bridge()->adopted_entry_faces_printed_by_wordpress($this->adoptedEntry()));
    }

    public function test_adopted_and_activated_is_printed_by_wordpress() {
        $this->addFamily('fraunces', 500);
        $this->activate('Fraunces');

        $this->assertTrue($this->bridge()->adopted_entry_faces_printed_by_wordpress($this->adoptedEntry()));
    }

    public function test_adopted_printed_check_uses_first_family_of_the_stack() {
        $this->addFamily('fraunces', 500);
        $this->activate('Fraunces');

        $entry = $this->adoptedEntry('fraunces', 41, '"Fraunces", serif');
        $this->assertTrue($this->bridge()->adopted_entry_faces_printed_by_wordpress($entry));
    }

    public function test_adopted_entry_whose_family_left_the_library_is_not_printed() {
        // No family post: stale adoption. WordPress prints nothing and the
        // plugin has no faces either — the var() fallback is what is left.
        $this->activate('Fraunces');
        $this->assertFalse($this->bridge()->adopted_entry_faces_printed_by_wordpress($this->adoptedEntry()));
    }

    // ── Frontend path ───────────────────────────────────────────────────────

    public function test_frontend_prints_faces_for_used_adopted_font_wordpress_will_not_print() {
        $this->addFamily('fraunces', 500);
        $this->addFace(500, ['fontFamily' => 'Fraunces', 'fontWeight' => '100 900', 'src' => 'http://example.test/fraunces.woff2']);
        $this->options['typost_adopted_wp_fonts'] = [$this->adoptedEntry('fraunces', 41)];

        $css = $this->runFrontend([41]);

        $this->assertStringContainsString('@font-face{font-family:"Fraunces"', $css);
        $this->assertStringContainsString('url("http://example.test/fraunces.woff2")', $css);
    }

    public function test_frontend_prints_nothing_when_wordpress_prints_the_family() {
        $this->addFamily('fraunces', 500);
        $this->addFace(500, ['fontFamily' => 'Fraunces', 'fontWeight' => '400', 'src' => 'http://example.test/fraunces.woff2']);
        $this->activate('Fraunces');
        $this->options['typost_adopted_wp_fonts'] = [$this->adoptedEntry('fraunces', 41)];

        $this->assertSame('', $this->runFrontend([41]));
    }

    public function test_frontend_prints_nothing_for_adopted_font_not_used_on_page() {
        $this->addFamily('fraunces', 500);
        $this->addFace(500, ['fontFamily' => 'Fraunces', 'fontWeight' => '400', 'src' => 'http://example.test/fraunces.woff2']);
        $this->options['typost_adopted_wp_fonts'] = [$this->adoptedEntry('fraunces', 41)];

        $this->assertSame('', $this->runFrontend([7]));
        $this->assertSame('', $this->runFrontend([]));
    }

    public function test_frontend_prints_adopted_faces_alongside_kit_css() {
        $this->addFamily('fraunces', 500);
        $this->addFace(500, ['fontFamily' => 'Fraunces', 'fontWeight' => '400', 'src' => 'http://example.test/fraunces.woff2']);
        $this->options['typost_adopted_wp_fonts'] = [$this->adoptedEntry('fraunces', 41)];
        $this->options['typost_custom_fonts'] = [[
            'id' => 'kit-1-inter',
            'name' => 'Inter',
            'font_id' => 3,
            'css_content' => '@font-face { font-family: "Inter"; src: url("/wp-content/uploads/typography-stylist/fonts/kit-1/inter.woff2"); }',
            'font_faces' => [['family' => 'Inter', 'weight' => '400', 'style' => 'normal', 'src' => 'url("/wp-content/uploads/typography-stylist/fonts/kit-1/inter.woff2")']],
        ]];

        $css = $this->runFrontend([3, 41]);

        $this->assertStringContainsString('font-family:"Fraunces"', $css);
        $this->assertStringContainsString('font-family: "Inter"', $css);
    }

    public function test_frontend_does_not_double_print_kit_reused_adoption() {
        // adopt_library_font() hands back the kit's font_id when the slug is
        // a plugin-registered family; should such an entry ever be stored,
        // the kit path already prints the faces.
        $this->addFamily('inter', 500);
        $this->addFace(500, ['fontFamily' => 'Inter', 'fontWeight' => '400', 'src' => 'http://example.test/inter-library.woff2']);
        $this->options['typost_adopted_wp_fonts'] = [$this->adoptedEntry('inter', 3, 'Inter')];
        $this->options['typost_custom_fonts'] = [[
            'id' => 'kit-1-inter',
            'name' => 'Inter',
            'font_id' => 3,
            'wp_slug' => 'inter',
            'wp_post_id' => 500,
            'css_content' => '@font-face { font-family: "Inter"; src: url("/wp-content/uploads/typography-stylist/fonts/kit-1/inter.woff2"); }',
            'font_faces' => [['family' => 'Inter', 'weight' => '400', 'style' => 'normal', 'src' => 'url("/wp-content/uploads/typography-stylist/fonts/kit-1/inter.woff2")']],
        ]];

        $css = $this->runFrontend([3]);

        $this->assertStringNotContainsString('inter-library.woff2', $css);
        $this->assertSame(1, substr_count($css, '@font-face'));
    }

    // ── Cache key ───────────────────────────────────────────────────────────

    public function test_cache_key_changes_with_adopted_faces_state() {
        $plugin = $this->frontendPlugin([]);

        $plugin_prints = $this->invokePrivate($plugin, 'get_font_css_cache_key', ['A'], [41], [], [], ['fraunces']);
        $wordpress_prints = $this->invokePrivate($plugin, 'get_font_css_cache_key', ['A'], [41], [], [], []);
        $legacy_signature = $this->invokePrivate($plugin, 'get_font_css_cache_key', ['A'], [41], [], []);

        $this->assertNotSame($plugin_prints, $wordpress_prints);
        // No adopted faces to print: identical to the pre-2.3 key
        $this->assertSame($wordpress_prints, $legacy_signature);
    }

    public function test_cache_key_is_order_insensitive_for_adopted_slugs() {
        $plugin = $this->frontendPlugin([]);

        $key_a = $this->invokePrivate($plugin, 'get_font_css_cache_key', [], [1, 2], [], [], ['b-font', 'a-font']);
        $key_b = $this->invokePrivate($plugin, 'get_font_css_cache_key', [], [2, 1], [], [], ['a-font', 'b-font']);

        $this->assertSame($key_a, $key_b);
    }

    // ── Cache invalidation ──────────────────────────────────────────────────

    public function test_deleted_post_watcher_reports_adopted_family_without_touching_entry() {
        $this->options['typost_adopted_wp_fonts'] = [$this->adoptedEntry('fraunces', 41)];

        $deleted = (object) ['ID' => 500, 'post_type' => 'wp_font_family', 'post_name' => 'fraunces'];
        $this->assertTrue($this->bridge()->handle_deleted_post(500, $deleted));

        // The adopted entry keeps its canonical font_id
        $this->assertSame(41, $this->options['typost_adopted_wp_fonts'][0]['font_id']);
        $this->assertSame('fraunces', $this->options['typost_adopted_wp_fonts'][0]['wp_slug']);

        // Unrelated family: nothing to clear
        $other = (object) ['ID' => 501, 'post_type' => 'wp_font_family', 'post_name' => 'other'];
        $this->assertFalse($this->bridge()->handle_deleted_post(501, $other));
    }

    // ── Editor / admin paths ────────────────────────────────────────────────

    public function test_admin_font_css_includes_adopted_faces_even_without_kits() {
        $this->addFamily('fraunces', 500);
        $this->addFace(500, ['fontFamily' => 'Fraunces', 'fontWeight' => '400', 'src' => 'http://example.test/fraunces.woff2']);
        $this->options['typost_adopted_wp_fonts'] = [$this->adoptedEntry('fraunces', 41)];
        Functions\when('get_transient')->justReturn(false);
        Functions\when('set_transient')->justReturn(true);

        $css = $this->frontendPlugin([])->get_admin_font_css();

        $this->assertStringContainsString('@font-face{font-family:"Fraunces"', $css);
    }

    public function test_block_editor_handle_receives_adopted_faces() {
        $this->addFamily('fraunces', 500);
        $this->addFace(500, ['fontFamily' => 'Fraunces', 'fontWeight' => '400', 'src' => 'http://example.test/fraunces.woff2']);
        $this->options['typost_adopted_wp_fonts'] = [$this->adoptedEntry('fraunces', 41)];

        $inline = [];
        Functions\when('get_transient')->justReturn(false);
        Functions\when('set_transient')->justReturn(true);
        Functions\when('wp_register_style')->justReturn(true);
        Functions\when('wp_enqueue_style')->justReturn(true);
        Functions\when('wp_add_inline_style')->alias(function ($handle, $css) use (&$inline) {
            $inline[$handle][] = $css;
            return true;
        });

        $this->frontendPlugin([])->enqueue_custom_fonts_for_blocks();

        $block_css = implode("\n", $inline['typost-block-fonts'] ?? []);
        $this->assertStringContainsString('@font-face{font-family:"Fraunces"', $block_css);
    }
}

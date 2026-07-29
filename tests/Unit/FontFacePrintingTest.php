<?php
namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use Brain\Monkey\Functions;

/**
 * Tests for entry_faces_printed_by_wordpress(): the plugin's own
 * @font-face output may only be skipped when WordPress will ACTUALLY
 * print faces for the family (merged theme.json = theme fonts +
 * Library fonts activated in global styles). A live registration alone
 * proves the font is installed, not activated — wp_print_font_faces()
 * emits nothing for it, and skipping would leave the frontend on
 * silent local/system fallbacks.
 */
class FontFacePrintingTest extends TestCase {

    /** @var array Simulated wp_font_family posts */
    private $library_posts;

    public static function setUpBeforeClass(): void {
        parent::setUpBeforeClass();

        // Test double for the WP 6.5+ resolver: output controlled per-test
        // via $fonts. Shape mirrors core: array of families, each an array
        // of face arrays with kebab-case keys.
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
            require_once TYPOST_PLUGIN_DIR . '/includes/class-typost-font-sources.php';
            require_once TYPOST_PLUGIN_DIR . '/includes/class-typost-font-library-bridge.php';
            $loaded = true;
        }

        \WP_Font_Face_Resolver::$fonts = [];
        $this->library_posts = [];
        $library_posts = &$this->library_posts;

        Functions\when('get_option')->justReturn([]);
        Functions\when('post_type_exists')->justReturn(true);
        Functions\when('get_posts')->alias(function () use (&$library_posts) {
            return $library_posts;
        });
        Functions\when('wp_list_pluck')->alias(function ($list, $field) {
            return array_map(function ($item) use ($field) {
                return is_object($item) ? $item->$field : $item[$field];
            }, $list);
        });
    }

    private function bridge() {
        return new \Typost_Font_Library_Bridge(new \Typost_Font_Sources());
    }

    private function addLibraryPost($slug) {
        $this->library_posts[] = (object) [
            'ID' => count($this->library_posts) + 500,
            'post_type' => 'wp_font_family',
            'post_name' => $slug,
            'post_title' => $slug,
            'post_content' => '',
            'post_parent' => 0,
            'post_status' => 'publish',
        ];
    }

    private function frauncesEntry() {
        return [
            'id' => 'kit-1-fraunces',
            'font_id' => 36,
            'wp_slug' => 'fraunces',
            'wp_post_id' => 500,
            'font_faces' => [
                ['family' => 'Fraunces', 'weight' => '100 900'],
            ],
        ];
    }

    public function test_registered_and_activated_family_is_skipped() {
        $this->addLibraryPost('fraunces');
        \WP_Font_Face_Resolver::$fonts = [
            [
                ['font-family' => 'Fraunces', 'src' => ['http://example.test/fraunces.ttf']],
            ],
        ];

        $this->assertTrue($this->bridge()->entry_faces_printed_by_wordpress($this->frauncesEntry()));
    }

    public function test_registered_but_unactivated_family_is_not_skipped() {
        // Installed in the Library, but the merged theme.json (what
        // wp_print_font_faces actually prints) doesn't include it.
        $this->addLibraryPost('fraunces');
        \WP_Font_Face_Resolver::$fonts = [
            [
                ['font-family' => 'Some Theme Font', 'src' => ['http://example.test/theme.woff2']],
            ],
        ];

        $this->assertFalse($this->bridge()->entry_faces_printed_by_wordpress($this->frauncesEntry()));
    }

    public function test_unregistered_entry_is_never_skipped_even_if_family_printed() {
        // Theme happens to print a same-named family, but the entry has no
        // live registration — plugin-managed path stays authoritative.
        \WP_Font_Face_Resolver::$fonts = [
            [
                ['font-family' => 'Fraunces', 'src' => ['http://example.test/theme-fraunces.woff2']],
            ],
        ];

        $entry = $this->frauncesEntry();
        unset($entry['wp_slug'], $entry['wp_post_id']);
        $this->assertFalse($this->bridge()->entry_faces_printed_by_wordpress($entry));
    }

    public function test_family_matching_normalizes_quotes_and_case() {
        $this->addLibraryPost('fraunces');
        \WP_Font_Face_Resolver::$fonts = [
            [
                ['font-family' => '"fraunces"', 'src' => ['http://example.test/fraunces.ttf']],
            ],
        ];

        $this->assertTrue($this->bridge()->entry_faces_printed_by_wordpress($this->frauncesEntry()));
    }

    public function test_flat_face_array_shape_is_tolerated() {
        $this->addLibraryPost('fraunces');
        \WP_Font_Face_Resolver::$fonts = [
            ['font-family' => 'Fraunces', 'src' => ['http://example.test/fraunces.ttf']],
        ];

        $this->assertTrue($this->bridge()->entry_faces_printed_by_wordpress($this->frauncesEntry()));
    }

    public function test_entry_without_faces_is_not_skipped() {
        $this->addLibraryPost('fraunces');
        \WP_Font_Face_Resolver::$fonts = [
            [
                ['font-family' => 'Fraunces', 'src' => ['http://example.test/fraunces.ttf']],
            ],
        ];

        $entry = $this->frauncesEntry();
        $entry['font_faces'] = [];
        $this->assertFalse($this->bridge()->entry_faces_printed_by_wordpress($entry));
    }

    public function test_printed_families_cache_clears_with_snapshot_cache() {
        $this->addLibraryPost('fraunces');
        \WP_Font_Face_Resolver::$fonts = [];

        $bridge = $this->bridge();
        $this->assertFalse($bridge->entry_faces_printed_by_wordpress($this->frauncesEntry()));

        // Activation happens mid-request (e.g. after a global styles save)
        \WP_Font_Face_Resolver::$fonts = [
            [
                ['font-family' => 'Fraunces', 'src' => ['http://example.test/fraunces.ttf']],
            ],
        ];
        // Still false: per-request cache
        $this->assertFalse($bridge->entry_faces_printed_by_wordpress($this->frauncesEntry()));

        $bridge->clear_snapshot_cache();
        $this->assertTrue($bridge->entry_faces_printed_by_wordpress($this->frauncesEntry()));
    }
}

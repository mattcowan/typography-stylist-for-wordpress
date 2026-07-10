<?php
namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use Brain\Monkey\Functions;

/**
 * Tests for skipping the plugin's own @font-face output for fonts whose
 * WP Font Library registration is live (WP prints those faces), including
 * the fallback when a registration went stale.
 */
class FontEnqueueSkipTest extends TestCase {

    /** @var array Simulated wp_font_family posts */
    private $library_posts;

    protected function setUp(): void {
        parent::setUp();

        static $loaded = false;
        if (!$loaded) {
            require_once TYPOST_PLUGIN_DIR . '/includes/class-typost-font-sources.php';
            require_once TYPOST_PLUGIN_DIR . '/includes/class-typost-font-library-bridge.php';
            $loaded = true;
        }

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

    public function test_live_registration_is_detected() {
        $this->addLibraryPost('playfair-display');

        $bridge = $this->bridge();
        $this->assertTrue($bridge->entry_has_live_registration([
            'wp_slug' => 'playfair-display',
            'wp_post_id' => 500,
        ]));
    }

    public function test_unregistered_entry_is_not_skipped() {
        $bridge = $this->bridge();
        $this->assertFalse($bridge->entry_has_live_registration([
            'id' => 'kit-1-inter',
            'font_id' => 1,
        ]));
    }

    public function test_stale_registration_is_not_skipped() {
        // wp_slug set on the entry but the Library post no longer exists —
        // the plugin @font-face path must resume automatically.
        $bridge = $this->bridge();
        $this->assertFalse($bridge->entry_has_live_registration([
            'wp_slug' => 'playfair-display',
            'wp_post_id' => 500,
        ]));
    }

    public function test_registration_not_live_when_font_library_absent() {
        Functions\when('post_type_exists')->justReturn(false);
        $this->addLibraryPost('playfair-display');

        // theme.json path could still expose the slug on WP < 6.5 themes, but
        // entry registration requires the wp_font_family post type
        $bridge = $this->bridge();
        $this->assertFalse($bridge->entry_has_live_registration([
            'wp_slug' => 'playfair-display',
            'wp_post_id' => 500,
        ]));
    }

    public function test_cache_key_varies_with_skipped_ids() {
        static $loaded = false;
        if (!$loaded) {
            require_once TYPOST_PLUGIN_DIR . '/typography-stylist.php';
            $loaded = true;
        }
        $reflection = new \ReflectionClass(\Typost::class);
        $plugin = $reflection->newInstanceWithoutConstructor();
        $method = new \ReflectionMethod($plugin, 'get_font_css_cache_key');
        $method->setAccessible(true);

        $key_a = $method->invokeArgs($plugin, [['A'], [1], [], [7]]);
        $key_b = $method->invokeArgs($plugin, [['A'], [1], [], []]);

        $this->assertNotSame($key_a, $key_b);
    }
}

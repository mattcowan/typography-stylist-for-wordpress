<?php
namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use Brain\Monkey\Functions;

/**
 * Tests for delete_font_endpoint(): deleting an uploaded font that was
 * registered in the WP Font Library must also remove the plugin-owned
 * wp_font_family registration (ownership-guarded), so no orphaned Library
 * families are left pointing at deleted font files.
 */
class FontDeleteEndpointTest extends TestCase {

    /** @var array Simulated wp_options storage */
    private $options;

    /** @var array Simulated posts keyed by ID */
    private $posts;

    /** @var array Simulated post meta keyed by post ID */
    private $post_meta;

    protected function setUp(): void {
        parent::setUp();

        $this->options = [];
        $this->posts = [];
        $this->post_meta = [];

        $options = &$this->options;
        $posts = &$this->posts;
        $post_meta = &$this->post_meta;

        Functions\when('get_option')->alias(function ($key, $default = false) use (&$options) {
            return array_key_exists($key, $options) ? $options[$key] : $default;
        });
        Functions\when('update_option')->alias(function ($key, $value) use (&$options) {
            $options[$key] = $value;
            return true;
        });
        Functions\when('post_type_exists')->justReturn(true);
        Functions\when('get_post')->alias(function ($id) use (&$posts) {
            $id = is_object($id) ? $id->ID : (int) $id;
            return isset($posts[$id]) ? $posts[$id] : null;
        });
        Functions\when('get_posts')->alias(function ($args) use (&$posts) {
            $found = [];
            foreach ($posts as $post) {
                if (isset($args['post_type']) && $post->post_type !== $args['post_type']) {
                    continue;
                }
                if (isset($args['post_parent']) && (int) $post->post_parent !== (int) $args['post_parent']) {
                    continue;
                }
                $found[] = (isset($args['fields']) && 'ids' === $args['fields']) ? $post->ID : $post;
            }
            return $found;
        });
        Functions\when('wp_delete_post')->alias(function ($id, $force = false) use (&$posts, &$post_meta) {
            unset($posts[(int) $id], $post_meta[(int) $id]);
            return true;
        });
        Functions\when('get_post_meta')->alias(function ($post_id, $key, $single = false) use (&$post_meta) {
            return isset($post_meta[(int) $post_id][$key]) ? $post_meta[(int) $post_id][$key] : '';
        });
        Functions\when('delete_transient')->justReturn(true);
        Functions\when('wp_cache_delete')->justReturn(true);
        Functions\when('wp_cache_flush')->justReturn(true);
        Functions\when('rest_ensure_response')->returnArg();

        // clear_cache() runs wildcard transient deletes through $wpdb
        global $wpdb;
        $wpdb = new class {
            public $options = 'wp_options';
            public function query($sql) {
                return 0;
            }
            public function prepare($sql, ...$args) {
                return $sql;
            }
            public function esc_like($text) {
                return $text;
            }
        };
    }

    private function getPluginInstance() {
        static $loaded = false;
        if (!$loaded) {
            require_once TYPOST_PLUGIN_DIR . '/typography-stylist.php';
            $loaded = true;
        }
        return \Typost::get_instance();
    }

    /** Build a request stub exposing get_param(). */
    private function makeRequest($id) {
        return new class($id) {
            private $id;
            public function __construct($id) {
                $this->id = $id;
            }
            public function get_param($key) {
                return ('id' === $key) ? $this->id : null;
            }
        };
    }

    private function registeredEntry() {
        // Family post the plugin registered earlier, with ownership meta
        $this->posts[200] = (object) [
            'ID' => 200,
            'post_type' => 'wp_font_family',
            'post_name' => 'space-grotesk',
            'post_title' => 'Space Grotesk',
            'post_content' => '{}',
            'post_parent' => 0,
            'post_status' => 'publish',
        ];
        $this->posts[201] = (object) [
            'ID' => 201,
            'post_type' => 'wp_font_face',
            'post_name' => 'space-grotesk-400',
            'post_title' => 'Space Grotesk; normal; 400',
            'post_content' => '{}',
            'post_parent' => 200,
            'post_status' => 'publish',
        ];
        $this->post_meta[200]['_typost_font_id'] = 14;

        return [
            'id' => 'kit-1-abc-space-grotesk',
            'name' => 'Space Grotesk',
            'font_id' => 14,
            'kit_id' => 'kit-1-abc',
            'css_content' => '@font-face { font-family: "Space Grotesk"; }',
            'font_faces' => [
                ['family' => 'Space Grotesk', 'weight' => '300 700', 'style' => 'normal', 'src' => "url('a.ttf')"],
            ],
            'upload_path' => '', // skip the filesystem branch in the test
            'upload_url' => 'http://example.test/kit',
            'wp_slug' => 'space-grotesk',
            'wp_post_id' => 200,
            'wp_registered_date' => '2026-07-22 00:00:00',
        ];
    }

    public function test_delete_removes_entry_and_unregisters_library_family() {
        $entry = $this->registeredEntry();
        $this->options['typost_custom_fonts'] = [$entry];

        $plugin = $this->getPluginInstance();
        // Fresh modules so the sources cache sees this test's option state
        foreach (['font_sources', 'font_library_bridge'] as $prop) {
            $ref = new \ReflectionProperty(\Typost::class, $prop);
            $ref->setAccessible(true);
            $ref->setValue($plugin, null);
        }

        $response = $plugin->delete_font_endpoint($this->makeRequest($entry['id']));

        $this->assertIsArray($response);
        $this->assertTrue($response['success']);
        $this->assertSame([], $this->options['typost_custom_fonts'], 'Entry must be removed');
        $this->assertArrayNotHasKey(200, $this->posts, 'Registered wp_font_family post must be deleted');
        $this->assertArrayNotHasKey(201, $this->posts, 'wp_font_face children must be deleted');
    }

    public function test_delete_never_touches_unowned_library_family() {
        $entry = $this->registeredEntry();
        // Simulate a family the plugin does NOT own (no/foreign ownership meta)
        $this->post_meta[200]['_typost_font_id'] = 999;
        $this->options['typost_custom_fonts'] = [$entry];

        $plugin = $this->getPluginInstance();
        foreach (['font_sources', 'font_library_bridge'] as $prop) {
            $ref = new \ReflectionProperty(\Typost::class, $prop);
            $ref->setAccessible(true);
            $ref->setValue($plugin, null);
        }

        $response = $plugin->delete_font_endpoint($this->makeRequest($entry['id']));

        $this->assertTrue($response['success']);
        $this->assertSame([], $this->options['typost_custom_fonts']);
        $this->assertArrayHasKey(200, $this->posts, 'Unowned family post must survive');
    }

    public function test_delete_unregistered_font_skips_library() {
        $entry = $this->registeredEntry();
        unset($entry['wp_slug'], $entry['wp_post_id'], $entry['wp_registered_date']);
        $this->options['typost_custom_fonts'] = [$entry];

        $plugin = $this->getPluginInstance();
        foreach (['font_sources', 'font_library_bridge'] as $prop) {
            $ref = new \ReflectionProperty(\Typost::class, $prop);
            $ref->setAccessible(true);
            $ref->setValue($plugin, null);
        }

        $response = $plugin->delete_font_endpoint($this->makeRequest($entry['id']));

        $this->assertTrue($response['success']);
        $this->assertArrayHasKey(200, $this->posts, 'Post untouched when entry has no registration fields');
    }
}

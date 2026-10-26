<?php
namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use Brain\Monkey\Functions;

/**
 * Tests for Typost_Font_Library_Bridge write path: wp_font_family /
 * wp_font_face payload construction, idempotent registration,
 * ownership-guarded unregistration, and the deleted-post watcher.
 */
class FontLibraryBridgeTest extends TestCase {

    /** @var array Simulated wp_options storage */
    private $options;

    /** @var array Simulated posts keyed by ID */
    private $posts;

    /** @var array Simulated post meta keyed by post ID */
    private $post_meta;

    /** @var int Auto-increment post ID */
    private $next_post_id;

    protected function setUp(): void {
        parent::setUp();

        static $loaded = false;
        if (!$loaded) {
            require_once TYPOST_PLUGIN_DIR . '/includes/class-typost-font-sources.php';
            require_once TYPOST_PLUGIN_DIR . '/includes/class-typost-font-library-bridge.php';
            $loaded = true;
        }

        $this->options = [];
        $this->posts = [];
        $this->post_meta = [];
        $this->next_post_id = 100;

        $options = &$this->options;
        $posts = &$this->posts;
        $post_meta = &$this->post_meta;
        $next_post_id = &$this->next_post_id;

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
        Functions\when('wp_unique_post_slug')->alias(function ($slug) use (&$posts) {
            $existing = [];
            foreach ($posts as $post) {
                $existing[] = $post->post_name;
            }
            $candidate = $slug;
            $i = 2;
            while (in_array($candidate, $existing, true)) {
                $candidate = $slug . '-' . $i;
                $i++;
            }
            return $candidate;
        });
        // Core unslashes wp_insert_post() and wp_update_post() input, so the
        // doubles do too: a caller that skips wp_slash() loses its
        // backslashes here as it does on a real site (#310).
        $unslash = function ($args) {
            return array_map(function ($value) {
                return is_string($value) ? stripslashes($value) : $value;
            }, $args);
        };
        Functions\when('wp_slash')->alias(function ($value) {
            return is_string($value) ? addslashes($value) : $value;
        });
        Functions\when('wp_insert_post')->alias(function ($args) use (&$posts, &$next_post_id, $unslash) {
            $args = $unslash($args);
            $id = $next_post_id++;
            $post = (object) array_merge([
                'ID' => $id,
                'post_title' => '',
                'post_name' => '',
                'post_content' => '',
                'post_type' => 'post',
                'post_parent' => 0,
                'post_status' => 'publish',
            ], $args);
            $post->ID = $id;
            $posts[$id] = $post;
            return $id;
        });
        Functions\when('wp_update_post')->alias(function ($args) use (&$posts, $unslash) {
            $args = $unslash($args);
            $id = (int) $args['ID'];
            if (!isset($posts[$id])) {
                return 0;
            }
            foreach ($args as $key => $value) {
                $posts[$id]->$key = $value;
            }
            return $id;
        });
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
        Functions\when('update_post_meta')->alias(function ($post_id, $key, $value) use (&$post_meta) {
            $post_meta[(int) $post_id][$key] = $value;
            return true;
        });
        Functions\when('get_post_meta')->alias(function ($post_id, $key, $single = false) use (&$post_meta) {
            return isset($post_meta[(int) $post_id][$key]) ? $post_meta[(int) $post_id][$key] : '';
        });
        Functions\when('wp_json_encode')->alias('json_encode');
        Functions\when('wp_list_pluck')->alias(function ($list, $field) {
            return array_map(function ($item) use ($field) {
                return is_object($item) ? $item->$field : $item[$field];
            }, $list);
        });
        Functions\when('site_url')->alias(function ($path = '') {
            return 'http://example.test' . $path;
        });
        Functions\when('current_time')->justReturn('2026-07-02 12:00:00');
        Functions\when('absint')->alias(function ($v) {
            return abs((int) $v);
        });
    }

    private function bridge() {
        return new \Typost_Font_Library_Bridge(new \Typost_Font_Sources());
    }

    private function sampleEntry() {
        return [
            'id' => 'kit-123-abc-playfair-display',
            'name' => 'Playfair Display',
            'font_id' => 7,
            'kit_id' => 'kit-123-abc',
            'kit_name' => 'Playfair Kit',
            'css_content' => '@font-face { font-family: "Playfair Display"; }',
            'font_faces' => [
                [
                    'family' => 'Playfair Display',
                    'weight' => '400',
                    'style' => 'normal',
                    'src' => "url('/wp-content/uploads/typography-stylist/fonts/kit-123-abc/pd.woff2') format('woff2'), url('pd.woff') format('woff')",
                ],
                [
                    'family' => 'Playfair Display',
                    'weight' => '700',
                    'style' => 'italic',
                    'src' => "url('https://cdn.example.com/pd-bold.woff2') format('woff2')",
                ],
            ],
            'upload_path' => '/tmp/uploads/typography-stylist/fonts/kit-123-abc',
            'upload_url' => 'http://example.test/wp-content/uploads/typography-stylist/fonts/kit-123-abc',
            'uploaded_date' => '2026-07-01 00:00:00',
            'fallbacks' => 'serif',
        ];
    }

    public function test_family_post_content_includes_quoted_family_and_fallbacks() {
        $content = $this->bridge()->build_font_family_post_content($this->sampleEntry(), 'playfair-display');

        $this->assertSame('Playfair Display', $content['name']);
        $this->assertSame('playfair-display', $content['slug']);
        $this->assertSame('"Playfair Display", serif', $content['fontFamily']);
        $this->assertArrayHasKey('preview', $content);
    }

    public function test_face_post_content_resolves_src_urls() {
        $entry = $this->sampleEntry();
        $face = $entry['font_faces'][0];

        $content = $this->bridge()->build_font_face_post_content($face, $entry['upload_url']);

        $this->assertSame('Playfair Display', $content['fontFamily']);
        $this->assertSame('normal', $content['fontStyle']);
        $this->assertSame('400', $content['fontWeight']);
        // Site-relative resolved to absolute; kit-relative resolved against upload_url
        $this->assertSame([
            'http://example.test/wp-content/uploads/typography-stylist/fonts/kit-123-abc/pd.woff2',
            'http://example.test/wp-content/uploads/typography-stylist/fonts/kit-123-abc/pd.woff',
        ], $content['src']);
    }

    public function test_src_extraction_keeps_absolute_urls_and_skips_data_uris() {
        $urls = $this->bridge()->extract_face_src_urls(
            "url(data:font/woff2;base64,AAAA) format('woff2'), url('https://cdn.example.com/a.woff2')",
            'http://example.test/kit'
        );
        $this->assertSame(['https://cdn.example.com/a.woff2'], $urls);
    }

    public function test_register_font_creates_family_and_face_posts_with_ownership_meta() {
        $entry = $this->sampleEntry();
        $result = $this->bridge()->register_font($entry);

        $this->assertIsArray($result);
        $this->assertSame('playfair-display', $result['slug']);

        $family_post = $this->posts[$result['post_id']];
        $this->assertSame('wp_font_family', $family_post->post_type);
        $decoded = json_decode($family_post->post_content, true);
        $this->assertSame('"Playfair Display", serif', $decoded['fontFamily']);

        // Ownership marker
        $this->assertSame(7, $this->post_meta[$result['post_id']]['_typost_font_id']);

        // Two face children
        $faces = array_filter($this->posts, function ($p) use ($result) {
            return 'wp_font_face' === $p->post_type && (int) $p->post_parent === (int) $result['post_id'];
        });
        $this->assertCount(2, $faces);
        foreach ($faces as $face) {
            $face_data = json_decode($face->post_content, true);
            $this->assertIsArray($face_data, 'Each face post must store JSON that decodes');
            $this->assertSame('Playfair Display', $face_data['fontFamily']);
        }
    }

    public function test_register_font_keeps_non_ascii_family_names() {
        $entry = $this->sampleEntry();
        $entry['name'] = 'Café';
        $entry['font_faces'][0]['family'] = 'Café';
        $entry['font_faces'][1]['family'] = 'Café';

        $result = $this->bridge()->register_font($entry);

        $family = json_decode($this->posts[$result['post_id']]->post_content, true);
        $this->assertSame('Café, serif', $family['fontFamily']);
        foreach ($this->facePosts($result['post_id']) as $face) {
            $this->assertSame('Café', json_decode($face->post_content, true)['fontFamily']);
        }
    }

    /**
     * Register the entry, then store its posts the way versions before
     * #310 did: wp_json_encode() output with every backslash removed.
     *
     * @return array {entry, post_id} with the entry saved as registered
     */
    private function registerWithLegacyContent(array $entry) {
        $bridge = $this->bridge();
        $result = $bridge->register_font($entry);
        $family = $this->posts[$result['post_id']];
        $family->post_content = stripslashes(json_encode($bridge->build_font_family_post_content($entry, $family->post_name)));
        foreach ($this->facePosts($result['post_id']) as $face) {
            $face->post_content = stripslashes(json_encode(json_decode($face->post_content, true)));
        }

        $entry['wp_post_id'] = $result['post_id'];
        $entry['wp_slug'] = $result['slug'];
        $this->options['typost_custom_fonts'] = [$entry];

        return ['entry' => $entry, 'post_id' => $result['post_id']];
    }

    private function facePosts($family_id) {
        return array_values(array_filter($this->posts, function ($p) use ($family_id) {
            return 'wp_font_face' === $p->post_type && (int) $p->post_parent === (int) $family_id;
        }));
    }

    public function test_repair_rebuilds_owned_family_with_invalid_json() {
        $registered = $this->registerWithLegacyContent($this->sampleEntry());
        $family = $this->posts[$registered['post_id']];
        $this->assertNull(json_decode($family->post_content, true), 'Precondition: legacy family JSON does not decode');

        $repaired = $this->bridge()->repair_registered_font_json();

        $this->assertSame(['repaired' => 1, 'failed' => 0], $repaired, 'Only the family post was broken; the faces only lost "\/" escapes');
        $data = json_decode($family->post_content, true);
        $this->assertSame('"Playfair Display", serif', $data['fontFamily']);
        $this->assertSame('playfair-display', $data['slug']);
        $this->assertSame('Playfair Display', $data['name']);
    }

    public function test_repair_restores_non_ascii_names_in_family_and_faces() {
        $entry = $this->sampleEntry();
        $entry['name'] = 'Café';
        $entry['fallbacks'] = '';
        $entry['font_faces'][0]['family'] = 'Café';
        $entry['font_faces'][1]['family'] = 'Café';
        $registered = $this->registerWithLegacyContent($entry);
        // Legacy content decodes, but with the wrong name: the "u00e9" escape lost its backslash
        $this->assertSame('Cafu00e9', json_decode($this->posts[$registered['post_id']]->post_content, true)['fontFamily']);

        $repaired = $this->bridge()->repair_registered_font_json();

        $this->assertSame(['repaired' => 3, 'failed' => 0], $repaired);
        $this->assertSame('Café', json_decode($this->posts[$registered['post_id']]->post_content, true)['fontFamily']);
        foreach ($this->facePosts($registered['post_id']) as $face) {
            $data = json_decode($face->post_content, true);
            $this->assertSame('Café', $data['fontFamily']);
            $this->assertNotEmpty($data['src']);
        }
    }

    /**
     * Two faces with one title: same family, style and weight, other files
     */
    private function entryWithSameTitleFaces() {
        $entry = $this->sampleEntry();
        $entry['name'] = 'Café';
        $entry['fallbacks'] = '';
        $entry['font_faces'] = [
            ['family' => 'Café', 'weight' => '400', 'style' => 'normal', 'src' => "url('https://cdn.example.com/cafe-book.woff2')"],
            ['family' => 'Café', 'weight' => '400', 'style' => 'normal', 'src' => "url('https://cdn.example.com/cafe-regular.woff2')"],
        ];
        return $entry;
    }

    public function test_repair_keeps_each_face_with_a_shared_title_on_its_own_files() {
        $registered = $this->registerWithLegacyContent($this->entryWithSameTitleFaces());

        $this->assertSame(['repaired' => 3, 'failed' => 0], $this->bridge()->repair_registered_font_json());
        $repaired = array_map(function ($face) {
            $data = json_decode($face->post_content, true);
            return $data['fontFamily'] . ' ' . $data['src'][0];
        }, $this->facePosts($registered['post_id']));
        sort($repaired);
        $this->assertSame([
            'Café https://cdn.example.com/cafe-book.woff2',
            'Café https://cdn.example.com/cafe-regular.woff2',
        ], $repaired);
    }

    public function test_repair_skips_a_shared_title_face_that_matches_no_candidate() {
        $registered = $this->registerWithLegacyContent($this->entryWithSameTitleFaces());
        // Broken content that neither face was registered from: a guess
        // would give this post the files of the other face
        $face = $this->facePosts($registered['post_id'])[0];
        $face->post_content = '{"fontFamily":""Other""}';

        $this->assertSame(['repaired' => 2, 'failed' => 0], $this->bridge()->repair_registered_font_json());
        $this->assertSame('{"fontFamily":""Other""}', $face->post_content);
    }

    public function test_repair_never_touches_families_without_ownership_meta() {
        $registered = $this->registerWithLegacyContent($this->sampleEntry());
        $legacy = $this->posts[$registered['post_id']]->post_content;
        // A family the user made in the Font Library UI has no marker
        unset($this->post_meta[$registered['post_id']]['_typost_font_id']);

        $this->assertSame(['repaired' => 0, 'failed' => 0], $this->bridge()->repair_registered_font_json());
        $this->assertSame($legacy, $this->posts[$registered['post_id']]->post_content);
    }

    public function test_repair_never_touches_a_family_owned_by_another_font() {
        $registered = $this->registerWithLegacyContent($this->sampleEntry());
        $legacy = $this->posts[$registered['post_id']]->post_content;
        $this->post_meta[$registered['post_id']]['_typost_font_id'] = 999;

        $this->assertSame(['repaired' => 0, 'failed' => 0], $this->bridge()->repair_registered_font_json());
        $this->assertSame($legacy, $this->posts[$registered['post_id']]->post_content);
    }

    public function test_repair_leaves_valid_posts_unchanged() {
        $result = $this->bridge()->register_font($this->sampleEntry());
        $entry = $this->sampleEntry();
        $entry['wp_post_id'] = $result['post_id'];
        $this->options['typost_custom_fonts'] = [$entry];
        // A face that lost only its "\/" escapes still decodes to the same URLs
        $face = $this->facePosts($result['post_id'])[0];
        $face->post_content = stripslashes($face->post_content);
        $before = array_map(function ($p) {
            return $p->post_content;
        }, $this->posts);

        $this->assertSame(['repaired' => 0, 'failed' => 0], $this->bridge()->repair_registered_font_json());
        $this->assertSame($before, array_map(function ($p) {
            return $p->post_content;
        }, $this->posts));
    }

    public function test_repair_counts_a_rewrite_that_wp_update_post_refuses() {
        $registered = $this->registerWithLegacyContent($this->sampleEntry());
        $legacy = $this->posts[$registered['post_id']]->post_content;
        Functions\when('wp_update_post')->justReturn(0);

        $this->assertSame(['repaired' => 0, 'failed' => 1], $this->bridge()->repair_registered_font_json());
        $this->assertSame($legacy, $this->posts[$registered['post_id']]->post_content);
    }

    public function test_repair_does_nothing_without_font_library() {
        $this->registerWithLegacyContent($this->sampleEntry());
        Functions\when('post_type_exists')->justReturn(false);

        $this->assertSame(['repaired' => 0, 'failed' => 0], $this->bridge()->repair_registered_font_json());
    }

    public function test_register_font_is_idempotent_when_post_exists() {
        $entry = $this->sampleEntry();
        $first = $this->bridge()->register_font($entry);

        $entry['wp_post_id'] = $first['post_id'];
        $entry['wp_slug'] = $first['slug'];

        $post_count = count($this->posts);
        $second = $this->bridge()->register_font($entry);

        $this->assertSame($first['post_id'], $second['post_id']);
        $this->assertCount($post_count, $this->posts, 'No new posts should be created');
    }

    public function test_register_font_uses_unique_slug_on_collision() {
        // Pre-existing family with the same slug (user-created)
        $this->posts[99] = (object) [
            'ID' => 99,
            'post_type' => 'wp_font_family',
            'post_name' => 'playfair-display',
            'post_title' => 'Playfair Display',
            'post_content' => '',
            'post_parent' => 0,
            'post_status' => 'publish',
        ];

        $result = $this->bridge()->register_font($this->sampleEntry());
        $this->assertSame('playfair-display-2', $result['slug']);
    }

    public function test_unregister_font_deletes_only_owned_posts() {
        $entry = $this->sampleEntry();
        $result = $this->bridge()->register_font($entry);
        $entry['wp_post_id'] = $result['post_id'];

        // Wrong font_id — ownership meta mismatch, nothing deleted
        $impostor = $entry;
        $impostor['font_id'] = 999;
        $this->assertFalse($this->bridge()->unregister_font($impostor));
        $this->assertArrayHasKey($result['post_id'], $this->posts);

        // Correct owner — family and face children removed
        $this->assertTrue($this->bridge()->unregister_font($entry));
        $this->assertArrayNotHasKey($result['post_id'], $this->posts);
        $remaining_faces = array_filter($this->posts, function ($p) {
            return 'wp_font_face' === $p->post_type;
        });
        $this->assertCount(0, $remaining_faces);
    }

    public function test_unregister_never_deletes_posts_without_ownership_meta() {
        // A user-created family the plugin does not own
        $this->posts[50] = (object) [
            'ID' => 50,
            'post_type' => 'wp_font_family',
            'post_name' => 'user-font',
            'post_title' => 'User Font',
            'post_content' => '',
            'post_parent' => 0,
            'post_status' => 'publish',
        ];

        $entry = $this->sampleEntry();
        $entry['wp_post_id'] = 50;

        $this->assertFalse($this->bridge()->unregister_font($entry));
        $this->assertArrayHasKey(50, $this->posts);
    }

    public function test_deleted_post_watcher_clears_entry_registration_fields() {
        $entry = $this->sampleEntry();
        $entry['wp_slug'] = 'playfair-display';
        $entry['wp_post_id'] = 123;
        $entry['wp_registered_date'] = '2026-07-01 00:00:00';
        $this->options['typost_custom_fonts'] = [$entry];

        $deleted_post = (object) ['ID' => 123, 'post_type' => 'wp_font_family', 'post_name' => 'playfair-display'];

        $sources = new \Typost_Font_Sources();
        $bridge = new \Typost_Font_Library_Bridge($sources);
        $this->assertTrue($bridge->handle_deleted_post(123, $deleted_post));

        $saved = $this->options['typost_custom_fonts'][0];
        $this->assertArrayNotHasKey('wp_slug', $saved);
        $this->assertArrayNotHasKey('wp_post_id', $saved);
        $this->assertArrayNotHasKey('wp_registered_date', $saved);
        // Font data itself untouched
        $this->assertSame(7, $saved['font_id']);
        $this->assertNotEmpty($saved['css_content']);
    }

    public function test_deleted_post_watcher_ignores_unrelated_posts() {
        $this->options['typost_custom_fonts'] = [$this->sampleEntry()];

        $bridge = $this->bridge();
        $this->assertFalse($bridge->handle_deleted_post(1, (object) ['ID' => 1, 'post_type' => 'post']));
        $this->assertFalse($bridge->handle_deleted_post(2, null));
    }

    public function test_register_font_unavailable_without_font_library() {
        Functions\when('post_type_exists')->justReturn(false);
        $this->assertFalse($this->bridge()->register_font($this->sampleEntry()));
    }

    public function test_display_list_excludes_plugin_registered_families() {
        // Register a plugin-owned family, and add a user-created one
        $entry = $this->sampleEntry();
        $result = $this->bridge()->register_font($entry);
        $entry['wp_slug'] = $result['slug'];
        $entry['wp_post_id'] = $result['post_id'];
        $this->options['typost_custom_fonts'] = [$entry];

        $this->posts[50] = (object) [
            'ID' => 50,
            'post_type' => 'wp_font_family',
            'post_name' => 'user-font',
            'post_title' => 'User Font',
            'post_content' => '',
            'post_parent' => 0,
            'post_status' => 'publish',
        ];

        $bridge = $this->bridge();

        // Raw snapshot contains both (validity checks depend on this)
        $all_slugs = wp_list_pluck($bridge->get_wp_font_library_fonts(), 'slug');
        $this->assertContains('playfair-display', $all_slugs);
        $this->assertContains('user-font', $all_slugs);
        $this->assertTrue($bridge->entry_has_live_registration($entry));

        // Display list hides the plugin-registered family, keeps the user's
        $display_slugs = wp_list_pluck($bridge->get_wp_font_library_fonts_for_display(), 'slug');
        $this->assertNotContains('playfair-display', $display_slugs);
        $this->assertContains('user-font', $display_slugs);
    }

    public function test_display_list_keeps_orphaned_registrations_visible() {
        // A family the plugin registered, whose plugin entry was later deleted
        // WITHOUT unregistering (legacy orphan) — it must stay visible so the
        // user can find and remove it via the Library UI.
        $result = $this->bridge()->register_font($this->sampleEntry());
        $this->options['typost_custom_fonts'] = []; // entry gone, post remains

        $display_slugs = wp_list_pluck($this->bridge()->get_wp_font_library_fonts_for_display(), 'slug');
        $this->assertContains($result['slug'], $display_slugs);
    }
}

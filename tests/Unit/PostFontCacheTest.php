<?php
namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use Brain\Monkey\Functions;

/**
 * Tests for the per-post font detection caches and Preview (#480).
 *
 * The frontend caches, per post, which fonts the content uses
 * (`typost_used_fonts_<ID>`) and whether it has styled content
 * (`typost_has_styled_<ID>`), for 12 hours. Covers:
 *
 * - on_post_save(): a real save of any status clears the post's two
 *   caches; revisions and autosave revisions do not; the archive caches
 *   and the object cache flush stay limited to posts that archives can
 *   list (published and private). The DOING_AUTOSAVE return (an autosave
 *   that updates a draft itself) is not covered here: a constant cannot be
 *   undefined between tests, and a separate process does not run cleanly
 *   on every PHP setup.
 * - has_styled_content() and get_used_fonts_in_content(): in a preview by
 *   a user who can edit the post they scan the previewed content and
 *   neither read nor write the per-post cache (a preview of a published
 *   post shows its autosave, which the cache does not describe); a normal
 *   view, and ?preview=true from a user who cannot edit the post (WordPress
 *   then shows the saved post), read the cache as before
 */
class PostFontCacheTest extends TestCase {

    /** @var array Simulated transients, keyed by transient name */
    private $transients;

    /** @var string[] Transient names read with get_transient() */
    private $reads;

    /** @var string[] Transient names written with set_transient() */
    private $writes;

    /** @var string[] Transient names passed to delete_transient() */
    private $deletes;

    /** @var string[] SQL run through $wpdb->query() */
    private $queries;

    /** @var int wp_cache_flush() calls */
    private $flushes;

    /** @var bool What is_preview() reports */
    private $preview;

    /** @var bool What current_user_can('edit_post', …) reports */
    private $canEdit;

    /** @var array Arguments of each current_user_can() call */
    private $capChecks;

    public static function setUpBeforeClass(): void {
        parent::setUpBeforeClass();
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

        $this->transients = [];
        $this->reads = [];
        $this->writes = [];
        $this->deletes = [];
        $this->queries = [];
        $this->flushes = 0;
        $this->preview = false;
        $this->canEdit = false;
        $this->capChecks = [];

        Functions\when('get_transient')->alias(function ($key) {
            $this->reads[] = $key;
            return array_key_exists($key, $this->transients) ? $this->transients[$key] : false;
        });
        Functions\when('set_transient')->alias(function ($key, $value) {
            $this->writes[] = $key;
            $this->transients[$key] = $value;
            return true;
        });
        Functions\when('delete_transient')->alias(function ($key) {
            $this->deletes[] = $key;
            unset($this->transients[$key]);
            return true;
        });
        Functions\when('wp_cache_delete')->justReturn(true);
        Functions\when('wp_cache_flush')->alias(function () {
            $this->flushes++;
            return true;
        });
        Functions\when('absint')->alias(function ($value) {
            return abs((int) $value);
        });
        Functions\when('wp_is_post_revision')->justReturn(false);
        Functions\when('is_preview')->alias(function () {
            return $this->preview;
        });
        Functions\when('current_user_can')->alias(function (...$args) {
            $this->capChecks[] = $args;
            return $this->canEdit;
        });
        Functions\when('parse_blocks')->justReturn([]);
        // Rendering adds nothing here. Mocked because another test file can
        // define do_blocks() first, and then the scan calls it.
        Functions\when('do_blocks')->returnArg();
        Functions\when('wp_list_pluck')->alias(function ($list, $field) {
            $out = [];
            foreach ($list as $item) {
                $out[] = is_object($item) ? $item->$field : $item[$field];
            }
            return $out;
        });

        $queries = &$this->queries;
        $GLOBALS['wpdb'] = new class($queries) {
            public $options = 'wp_options';
            private $log;
            public function __construct(&$log) {
                $this->log = &$log;
            }
            public function esc_like($text) {
                return addcslashes($text, '_%\\');
            }
            public function prepare($query, ...$args) {
                return vsprintf(str_replace('%s', "'%s'", $query), $args);
            }
            public function query($sql) {
                $this->log[] = $sql;
                return 0;
            }
        };
    }

    protected function tearDown(): void {
        unset($GLOBALS['wpdb'], $GLOBALS['wp_query']);
        parent::tearDown();
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    private function plugin() {
        $reflection = new \ReflectionClass(\Typost::class);
        return $reflection->newInstanceWithoutConstructor();
    }

    private function invokePrivate($object, $method, ...$args) {
        $reflection = new \ReflectionMethod(get_class($object), $method);
        $reflection->setAccessible(true);
        return $reflection->invokeArgs($object, $args);
    }

    /** Cache both per-post answers for post 7, as an earlier view did. */
    private function seedPostCaches($id = 7) {
        $this->transients['typost_used_fonts_' . $id] = ['id:48'];
        $this->transients['typost_has_styled_' . $id] = 'yes';
    }

    private function saveWithStatus($status, $id = 7) {
        Functions\when('get_post_status')->justReturn($status);
        // A post: only content post types clear (#483, PostSaveScopeTest)
        Functions\when('is_post_type_viewable')->justReturn(true);
        $this->plugin()->on_post_save($id, (object) ['ID' => $id, 'post_type' => 'post', 'post_status' => $status], true);
    }

    private function archiveCacheDeletes() {
        return array_values(array_filter($this->queries, function ($sql) {
            return strpos($sql, 'archive') !== false;
        }));
    }

    /** A singular view of post 7 with the given content. */
    private function singular($content, $id = 7) {
        Functions\when('is_singular')->justReturn(true);
        Functions\when('get_queried_object')->justReturn((object) [
            'ID' => $id,
            'post_content' => $content,
            'post_excerpt' => '',
        ]);
    }

    /** A real preview: is_preview(), by a user who can edit the post. */
    private function previewByEditor() {
        $this->preview = true;
        $this->canEdit = true;
    }

    private function span($font_id) {
        return '<p><span class="typost-styled" data-font-id="' . $font_id . '" style="font-family: var(--font-' . $font_id . ')">x</span></p>';
    }

    // ── on_post_save() ──────────────────────────────────────────────────────

    public function statusesProvider() {
        return [
            'draft' => ['draft'],
            'pending' => ['pending'],
            'future' => ['future'],
            'publish' => ['publish'],
            'private' => ['private'],
        ];
    }

    /**
     * @dataProvider statusesProvider
     */
    public function test_a_save_of_any_status_clears_the_posts_font_caches($status) {
        $this->seedPostCaches();
        $this->seedPostCaches(8);

        $this->saveWithStatus($status);

        $this->assertArrayNotHasKey('typost_used_fonts_7', $this->transients);
        $this->assertArrayNotHasKey('typost_has_styled_7', $this->transients);
        // Only the saved post's caches go
        $this->assertSame(['id:48'], $this->transients['typost_used_fonts_8']);
        $this->assertSame('yes', $this->transients['typost_has_styled_8']);
    }

    public function test_a_published_or_private_save_still_clears_the_archive_caches() {
        foreach (['publish', 'private'] as $status) {
            $this->queries = [];
            $this->saveWithStatus($status);
            $this->assertCount(1, $this->archiveCacheDeletes(), $status);
        }
    }

    /**
     * Archives list only published (and private) posts, so a draft, pending
     * or scheduled save cannot change what an archive cache holds. It costs
     * no wildcard delete and no object cache flush.
     */
    public function test_a_save_of_an_unpublished_post_leaves_the_archive_caches_and_the_object_cache() {
        foreach (['draft', 'pending', 'future', 'auto-draft'] as $status) {
            $this->queries = [];
            $this->flushes = 0;
            $this->saveWithStatus($status);
            $this->assertSame([], $this->queries, $status);
            $this->assertSame(0, $this->flushes, $status);
        }
    }

    public function test_a_revision_or_autosave_revision_does_not_clear_the_cache() {
        $this->seedPostCaches();
        // wp_is_post_revision() is true for autosave revisions too (both
        // have the post type "revision") and returns the parent's ID.
        Functions\when('wp_is_post_revision')->justReturn(7);

        foreach (['inherit', 'draft', 'publish'] as $status) {
            $this->saveWithStatus($status, 99);
        }

        $this->assertSame([], $this->deletes);
        $this->assertSame([], $this->queries);
        $this->assertSame(['id:48'], $this->transients['typost_used_fonts_7']);
    }

    // ── The readers under is_preview() ──────────────────────────────────────

    public function test_a_preview_scans_the_previewed_fonts_and_ignores_the_cache() {
        // The cache describes the saved post (font 48); the preview shows
        // content that uses fonts 48 and 26.
        $this->seedPostCaches();
        $this->singular($this->span(48) . $this->span(26));
        $this->previewByEditor();

        $fonts = $this->invokePrivate($this->plugin(), 'get_used_fonts_in_content');

        $this->assertSame([['edit_post', 7]], $this->capChecks);
        $this->assertContains('id:26', $fonts);
        $this->assertContains('id:48', $fonts);
        $this->assertNotContains('typost_used_fonts_7', $this->reads);
        $this->assertNotContains('typost_used_fonts_7', $this->writes);
        $this->assertSame(['id:48'], $this->transients['typost_used_fonts_7'], 'The preview left the cache alone');
    }

    public function test_a_preview_does_not_write_the_cache_when_it_is_empty() {
        $this->singular($this->span(26));
        $this->previewByEditor();
        $plugin = $this->plugin();

        $this->assertContains('id:26', $this->invokePrivate($plugin, 'get_used_fonts_in_content'));
        $this->assertTrue($this->invokePrivate($plugin, 'has_styled_content'));

        $this->assertSame([], $this->writes);
        $this->assertSame([], $this->reads);
    }

    public function test_a_preview_finds_styled_content_that_the_cache_says_is_not_there() {
        $this->transients['typost_has_styled_7'] = 'no';
        $this->singular($this->span(26));
        $this->previewByEditor();

        $this->assertTrue($this->invokePrivate($this->plugin(), 'has_styled_content'));
        $this->assertSame([['edit_post', 7]], $this->capChecks);
        $this->assertSame('no', $this->transients['typost_has_styled_7']);
        $this->assertNotContains('typost_has_styled_7', $this->reads);
    }

    /**
     * `preview` is a public query var, so anyone can add ?preview=true and
     * WordPress sets is_preview(). Without the right to edit the post,
     * WordPress shows the saved post (a draft is not shown at all, and the
     * autosave needs a nonce bound to the user), which the cache describes.
     * Such a request reads and writes the cache as a normal view does.
     */
    public function test_a_preview_by_a_user_who_cannot_edit_the_post_uses_the_cache() {
        $this->seedPostCaches();
        $this->transients['typost_has_styled_7'] = 'no';
        $this->singular($this->span(26));
        $this->preview = true;
        $plugin = $this->plugin();

        $this->assertSame(['id:48'], $this->invokePrivate($plugin, 'get_used_fonts_in_content'));
        $this->assertFalse($this->invokePrivate($plugin, 'has_styled_content'));
        $this->assertSame(['typost_used_fonts_7', 'typost_has_styled_7'], $this->reads);

        // An empty cache is filled, as on a normal view
        $this->transients = [];
        $this->assertSame(['id:26'], array_values($this->invokePrivate($plugin, 'get_used_fonts_in_content')));
        $this->assertTrue($this->invokePrivate($plugin, 'has_styled_content'));
        $this->assertSame(['typost_used_fonts_7', 'typost_has_styled_7'], $this->writes);
    }

    public function test_a_normal_view_reads_the_cache_as_before() {
        $this->seedPostCaches();
        $this->transients['typost_has_styled_7'] = 'no';
        $this->singular($this->span(26));
        $plugin = $this->plugin();

        $this->assertSame(['id:48'], $this->invokePrivate($plugin, 'get_used_fonts_in_content'));
        $this->assertFalse($this->invokePrivate($plugin, 'has_styled_content'));
        $this->assertSame([], $this->writes);
    }

    public function test_a_normal_view_with_an_empty_cache_scans_and_writes_it() {
        $this->singular($this->span(26));
        $plugin = $this->plugin();

        $this->assertSame(['id:26'], array_values($this->invokePrivate($plugin, 'get_used_fonts_in_content')));
        $this->assertTrue($this->invokePrivate($plugin, 'has_styled_content'));

        $this->assertSame(['id:26'], array_values($this->transients['typost_used_fonts_7']));
        $this->assertSame('yes', $this->transients['typost_has_styled_7']);
    }

    /**
     * A preview URL on a page that lists posts (`?preview=true`) lists
     * published posts as they are saved: WordPress puts the autosave only
     * into a single post or page. The archive caches stay in use.
     */
    public function test_a_preview_of_a_page_that_lists_posts_uses_the_archive_cache() {
        Functions\when('is_singular')->justReturn(false);
        $GLOBALS['wp_query'] = (object) ['posts' => [
            (object) ['ID' => 7, 'post_content' => $this->span(26), 'post_excerpt' => ''],
        ]];
        $this->previewByEditor();
        $key ='typost_used_fonts_archive_' . md5(serialize([7]));
        $this->transients[$key] = ['id:48'];

        $this->assertSame(['id:48'], $this->invokePrivate($this->plugin(), 'get_used_fonts_in_content'));
        $this->assertContains($key, $this->reads);
    }
}

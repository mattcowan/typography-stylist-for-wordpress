<?php
namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use Brain\Monkey\Functions;

/**
 * Tests for which post saves clear the font detection caches (#483).
 *
 * on_post_save() runs on save_post for every post type. The frontend scan
 * reads the content of posts that have a frontend view (singular and list
 * pages) and, through rendering, the synced patterns (wp_block) that such
 * content references. Only a save of those types clears the caches. Menu
 * items, Font Library faces and families, global styles, templates,
 * template parts, navigation menus, oEmbed caches, Customizer changesets
 * and revisions clear nothing: saving a menu or installing a font family
 * saves one post per item or face, and each published save ran a wildcard
 * delete and an object cache flush.
 *
 * The status rules of #480 (the post's own keys for every status, the
 * archive caches only for published and private posts) are covered in
 * PostFontCacheTest; here they are checked again only for the types that
 * still clear.
 */
class PostSaveScopeTest extends TestCase {

    /**
     * Post types as core registers them on WordPress 7.1, with what
     * is_post_type_viewable() reports for each (publicly_queryable, or
     * built in and public), plus two custom types.
     *
     * @var array<string, bool>
     */
    private const VIEWABLE = [
        'post' => true,
        'page' => true,
        'attachment' => true,
        'revision' => false,
        'nav_menu_item' => false,
        'custom_css' => false,
        'customize_changeset' => false,
        'oembed_cache' => false,
        'user_request' => false,
        'wp_block' => false,
        'wp_template' => false,
        'wp_template_part' => false,
        'wp_global_styles' => false,
        'wp_navigation' => false,
        'wp_font_family' => false,
        'wp_font_face' => false,
        // A custom public post type (register_post_type('book', ['public' => true]))
        'book' => true,
        // A custom internal post type (register_post_type('acme_log'), not public)
        'acme_log' => false,
    ];

    /** @var string[] Transient names passed to delete_transient() */
    private $deletes;

    /** @var string[] SQL run through $wpdb->query() */
    private $queries;

    /** @var int wp_cache_flush() calls */
    private $flushes;

    /** @var int Deletes of the archive key generation (#486) */
    private $generationDeletes;

    /** @var array<int, string|false> What get_post_type() reports, by post ID */
    private $types;

    /** @var string[] Post types passed to is_post_type_viewable() */
    private $viewableChecks;

    protected function setUp(): void {
        parent::setUp();

        static $loaded = false;
        if (!$loaded) {
            require_once TYPOST_PLUGIN_DIR . '/typography-stylist.php';
            $loaded = true;
        }

        $this->deletes = [];
        $this->queries = [];
        $this->flushes = 0;
        $this->generationDeletes = 0;
        $this->types = [];
        $this->viewableChecks = [];

        Functions\when('delete_transient')->alias(function ($key) {
            $this->deletes[] = $key;
            return true;
        });
        Functions\when('wp_cache_delete')->alias(function ($key, $group = '') {
            if ('last_changed' === $key && 'typost_archive_fonts' === $group) {
                $this->generationDeletes++;
            }
            return true;
        });
        Functions\when('wp_cache_flush')->alias(function () {
            $this->flushes++;
            return true;
        });
        Functions\when('absint')->alias(function ($value) {
            return abs((int) $value);
        });
        Functions\when('wp_is_post_revision')->justReturn(false);
        // A persistent object cache: a full clear also deletes the archive
        // key generation (#486, only then), so a full clear is visible as one
        // generation delete
        Functions\when('wp_using_ext_object_cache')->justReturn(true);
        Functions\when('get_post_type')->alias(function ($post_id) {
            return array_key_exists($post_id, $this->types) ? $this->types[$post_id] : false;
        });
        Functions\when('is_post_type_viewable')->alias(function ($post_type) {
            $this->viewableChecks[] = $post_type;
            return is_string($post_type) && !empty(self::VIEWABLE[$post_type]);
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
        unset($GLOBALS['wpdb']);
        parent::tearDown();
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    private function plugin() {
        $reflection = new \ReflectionClass(\Typost::class);
        return $reflection->newInstanceWithoutConstructor();
    }

    /**
     * Save post 7 as save_post does: with the WP_Post of the saved post.
     */
    private function save($post_type, $status = 'publish', $id = 7) {
        $this->types[$id] = $post_type;
        Functions\when('get_post_status')->justReturn($status);
        $post = (object) ['ID' => $id, 'post_type' => $post_type, 'post_status' => $status];
        $this->plugin()->on_post_save($id, $post, true);
    }

    private function archiveCacheDeletes() {
        return array_values(array_filter($this->queries, function ($sql) {
            return strpos($sql, 'archive') !== false;
        }));
    }

    private function assertNothingCleared($message = '') {
        $this->assertSame([], $this->deletes, $message . ': per-post transients');
        $this->assertSame([], $this->queries, $message . ': wildcard delete');
        $this->assertSame(0, $this->flushes, $message . ': object cache flush');
        $this->assertSame(0, $this->generationDeletes, $message . ': archive key generation');
    }

    /**
     * One full clear, as clear_post_content_caches() ran it at #480, with
     * the archive key generation in place of the object cache flush (#486).
     */
    private function assertFullClear($id, $message = '') {
        $this->assertContains('typost_has_styled_' . $id, $this->deletes, $message);
        $this->assertContains('typost_used_fonts_' . $id, $this->deletes, $message);
        $this->assertCount(1, $this->archiveCacheDeletes(), $message);
        $this->assertSame(1, $this->generationDeletes, $message);
        $this->assertSame(0, $this->flushes, $message . ': object cache flush');
    }

    // ── Types that clear nothing ────────────────────────────────────────────

    public function internalTypesProvider() {
        return [
            'nav_menu_item' => ['nav_menu_item'],
            'wp_font_face' => ['wp_font_face'],
            'wp_font_family' => ['wp_font_family'],
            'wp_global_styles' => ['wp_global_styles'],
            'wp_template' => ['wp_template'],
            'wp_template_part' => ['wp_template_part'],
            'wp_navigation' => ['wp_navigation'],
            'oembed_cache' => ['oembed_cache'],
            'customize_changeset' => ['customize_changeset'],
            'revision' => ['revision'],
            'a custom internal post type' => ['acme_log'],
        ];
    }

    /**
     * @dataProvider internalTypesProvider
     */
    public function test_a_published_save_of_an_internal_post_type_clears_nothing($post_type) {
        $this->save($post_type, 'publish');

        $this->assertNothingCleared($post_type);
    }

    /**
     * @dataProvider internalTypesProvider
     */
    public function test_an_unpublished_save_of_an_internal_post_type_clears_nothing($post_type) {
        foreach (['draft', 'private', 'inherit', 'auto-draft'] as $status) {
            $this->save($post_type, $status);
        }

        $this->assertNothingCleared($post_type);
    }

    /**
     * A menu with 10 items saves 10 nav_menu_item posts; a Font Library
     * family with 9 faces saves the family and 9 wp_font_face posts. None
     * of these saves clears a cache.
     */
    public function test_saving_a_menu_or_installing_a_font_family_runs_no_clear() {
        for ($id = 101; $id <= 110; $id++) {
            $this->save('nav_menu_item', 'publish', $id);
        }
        $this->save('wp_font_family', 'publish', 200);
        for ($id = 201; $id <= 209; $id++) {
            $this->save('wp_font_face', 'publish', $id);
        }

        $this->assertNothingCleared('menu and font family');
    }

    // ── Types that clear as before ──────────────────────────────────────────

    public function contentTypesProvider() {
        return [
            'post' => ['post'],
            'page' => ['page'],
            'synced pattern' => ['wp_block'],
            'a custom public post type' => ['book'],
        ];
    }

    /**
     * @dataProvider contentTypesProvider
     */
    public function test_a_published_or_private_save_of_a_content_type_clears_as_before($post_type) {
        foreach (['publish', 'private'] as $status) {
            $this->deletes = [];
            $this->queries = [];
            $this->flushes = 0;
            $this->generationDeletes = 0;

            $this->save($post_type, $status);

            $this->assertFullClear(7, $post_type . ' ' . $status);
        }
    }

    /**
     * @dataProvider contentTypesProvider
     */
    public function test_an_unpublished_save_of_a_content_type_clears_its_own_caches_as_before($post_type) {
        foreach (['draft', 'pending', 'future'] as $status) {
            $this->deletes = [];
            $this->queries = [];
            $this->flushes = 0;
            $this->generationDeletes = 0;

            $this->save($post_type, $status);

            $this->assertSame(['typost_has_styled_7', 'typost_used_fonts_7'], $this->deletes, $post_type . ' ' . $status);
            $this->assertSame([], $this->queries, $post_type . ' ' . $status);
            $this->assertSame(0, $this->flushes, $post_type . ' ' . $status);
            $this->assertSame(0, $this->generationDeletes, $post_type . ' ' . $status);
        }
    }

    /**
     * The rule asks WordPress whether the type has a frontend view, so a
     * custom post type needs no list: a public type clears, an internal one
     * does not. A synced pattern has no view of its own, but its content
     * renders in the posts that reference it, so it clears without asking.
     */
    public function test_the_rule_asks_whether_the_post_type_is_viewable() {
        $this->save('book');
        $this->save('acme_log');
        $this->save('wp_block');

        $this->assertSame(['book', 'acme_log'], $this->viewableChecks);
        $this->assertSame(2, $this->generationDeletes, 'book and wp_block');
        $this->assertSame(0, $this->flushes);
    }

    // ── Where the post type comes from ──────────────────────────────────────

    /**
     * save_post passes the WP_Post. A caller that passes no post object
     * (do_action('save_post', $id, null, …)) still gets the type rule:
     * on_post_save() reads the type with get_post_type().
     */
    public function test_the_post_type_falls_back_to_get_post_type_without_a_post_object() {
        Functions\when('get_post_status')->justReturn('publish');
        $this->types[7] = 'nav_menu_item';
        $this->types[8] = 'page';

        $this->plugin()->on_post_save(7, null, true);
        $this->assertNothingCleared('nav_menu_item by ID');

        $this->plugin()->on_post_save(8, null, true);
        $this->assertFullClear(8, 'page by ID');
    }

    public function test_a_post_that_does_not_exist_clears_nothing() {
        Functions\when('get_post_status')->justReturn(false);

        $this->plugin()->on_post_save(404, null, true);

        $this->assertNothingCleared('missing post');
    }

    // ── Deletes (on_post_delete(), before_delete_post) ──────────────────────

    /**
     * Delete post 7 as before_delete_post does: the post still exists, so
     * get_post_type() and get_post_status() read it.
     */
    private function delete($post_type, $id = 7, $status = 'publish') {
        $this->types[$id] = $post_type;
        Functions\when('get_post_status')->justReturn($status);
        $this->plugin()->on_post_delete($id);
    }

    /**
     * @dataProvider internalTypesProvider
     */
    public function test_a_delete_of_an_internal_post_type_clears_nothing($post_type) {
        $this->delete($post_type);

        $this->assertNothingCleared($post_type);
    }

    /**
     * Deleting a menu deletes each of its nav_menu_item posts; deleting a
     * Font Library family deletes the family and each wp_font_face. None of
     * these deletes clears a cache.
     */
    public function test_deleting_a_menu_or_a_font_family_runs_no_clear() {
        for ($id = 101; $id <= 110; $id++) {
            $this->delete('nav_menu_item', $id);
        }
        for ($id = 201; $id <= 209; $id++) {
            $this->delete('wp_font_face', $id);
        }
        $this->delete('wp_font_family', 200);

        $this->assertNothingCleared('menu and font family');
    }

    /**
     * @dataProvider contentTypesProvider
     */
    public function test_a_published_or_private_delete_of_a_content_type_clears_as_before($post_type) {
        foreach (['publish', 'private'] as $status) {
            $this->deletes = [];
            $this->queries = [];
            $this->flushes = 0;
            $this->generationDeletes = 0;

            $this->delete($post_type, 7, $status);

            $this->assertFullClear(7, $post_type . ' ' . $status);
        }
    }

    /**
     * Archives list only published and private posts, so a delete of a
     * post with another status clears only its own two caches, as a save
     * does (#480).
     *
     * @dataProvider contentTypesProvider
     */
    public function test_an_unpublished_delete_of_a_content_type_clears_only_its_own_caches($post_type) {
        foreach (['draft', 'pending', 'future', 'auto-draft', 'trash'] as $status) {
            $this->deletes = [];
            $this->queries = [];
            $this->flushes = 0;
            $this->generationDeletes = 0;

            $this->delete($post_type, 7, $status);

            $this->assertSame(['typost_has_styled_7', 'typost_used_fonts_7'], $this->deletes, $post_type . ' ' . $status);
            $this->assertSame([], $this->queries, $post_type . ' ' . $status);
            $this->assertSame(0, $this->flushes, $post_type . ' ' . $status);
            $this->assertSame(0, $this->generationDeletes, $post_type . ' ' . $status);
        }
    }

    /**
     * "Empty Trash" and the daily wp_delete_auto_drafts() delete posts one
     * by one through wp_delete_post(), which fires before_delete_post.
     */
    public function test_emptying_the_trash_and_deleting_auto_drafts_runs_no_archive_clear() {
        for ($id = 301; $id <= 310; $id++) {
            $this->delete('post', $id, 'trash');
        }
        for ($id = 401; $id <= 405; $id++) {
            $this->delete('post', $id, 'auto-draft');
        }

        $this->assertSame([], $this->queries);
        $this->assertSame(0, $this->flushes);
        $this->assertSame(0, $this->generationDeletes);
        $this->assertCount(30, $this->deletes, 'Two own keys for each of the 15 posts');
    }

    public function test_a_delete_of_a_post_that_does_not_exist_clears_nothing() {
        $this->plugin()->on_post_delete(404);

        $this->assertNothingCleared('missing post');
    }

    public function test_a_delete_of_a_revision_clears_nothing() {
        // A revision of a post: wp_is_post_revision() returns the parent ID
        Functions\when('wp_is_post_revision')->justReturn(7);

        $this->delete('post', 99);

        $this->assertNothingCleared('revision');
    }
}

<?php
namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use Brain\Monkey\Functions;

/**
 * Tests for the object cache after a post save or delete (#484, #486).
 *
 * clear_post_content_caches() runs for a published or private save
 * (on_post_save()) and for a delete (on_post_delete()). It deletes the
 * post's two font caches by name and every archive font cache with a
 * wildcard row delete. A row delete does not reach a persistent object
 * cache (Redis, Memcached), where the transients live, so only there does
 * it delete the generation of the archive keys (`last_changed` in the
 * `typost_archive_fonts` group). It never flushes the object cache: until
 * #484 it flushed on every site, and until #486 under a persistent object
 * cache. What the generation does to the archive keys is covered in
 * ArchiveFontCacheGenerationTest.
 *
 * The tests call clear_post_content_caches() directly and through
 * on_post_delete(). Which saves reach it is on_post_save()'s rule, covered
 * in PostFontCacheTest.
 */
class PostCacheFlushTest extends TestCase {

    /** @var string[] Transient names passed to delete_transient() */
    private $deletes;

    /** @var string[] SQL run through $wpdb->query() */
    private $queries;

    /** @var int wp_cache_flush() calls */
    private $flushes;

    /** @var array[] Arguments of each wp_cache_delete() call */
    private $cacheDeletes;

    /** @var bool What wp_using_ext_object_cache() reports */
    private $persistent;

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
        $this->cacheDeletes = [];
        $this->persistent = false;

        Functions\when('delete_transient')->alias(function ($key) {
            $this->deletes[] = $key;
            return true;
        });
        Functions\when('wp_cache_delete')->alias(function ($key, $group = '') {
            $this->cacheDeletes[] = [$key, $group];
            return true;
        });
        Functions\when('wp_cache_flush')->alias(function () {
            $this->flushes++;
            return true;
        });
        Functions\when('wp_using_ext_object_cache')->alias(function () {
            return $this->persistent;
        });
        Functions\when('absint')->alias(function ($value) {
            return abs((int) $value);
        });
        Functions\when('wp_is_post_revision')->justReturn(false);
        // The post that on_post_delete() sees: a published post. Since #483
        // the handler reads its type and status before it clears.
        Functions\when('get_post_type')->justReturn('post');
        Functions\when('is_post_type_viewable')->justReturn(true);
        Functions\when('get_post_status')->justReturn('publish');

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

    private function clear($post_id) {
        $method = new \ReflectionMethod(\Typost::class, 'clear_post_content_caches');
        $method->setAccessible(true);
        $method->invoke($this->plugin(), $post_id);
    }

    /** The one wildcard delete of the archive caches, or null. */
    private function archiveDelete() {
        $archive = array_values(array_filter($this->queries, function ($sql) {
            return strpos($sql, 'archive') !== false;
        }));
        $this->assertLessThanOrEqual(1, count($archive));
        return $archive ? $archive[0] : null;
    }

    /** How many times the archive key generation was deleted. */
    private function generationDeletes() {
        return count(array_filter($this->cacheDeletes, function ($args) {
            return ['last_changed', 'typost_archive_fonts'] === $args;
        }));
    }

    private function assertArchiveCachesDeleted() {
        $sql = $this->archiveDelete();
        $this->assertNotNull($sql, 'The archive caches must still be deleted');
        foreach (['has\_styled\_archive\_', 'used\_fonts\_archive\_'] as $name) {
            $this->assertStringContainsString("'\_transient\_typost\_{$name}%'", $sql);
            $this->assertStringContainsString("'\_transient\_timeout\_typost\_{$name}%'", $sql);
        }
    }

    // ── Without a persistent object cache ───────────────────────────────────

    public function test_without_a_persistent_object_cache_a_clear_does_not_flush() {
        $this->clear(7);

        $this->assertSame(0, $this->flushes);
        // The keys have no generation there (ArchiveFontCacheGenerationTest)
        $this->assertSame(0, $this->generationDeletes());
    }

    public function test_without_a_persistent_object_cache_the_caches_are_still_deleted() {
        $this->clear(7);

        $this->assertSame(['typost_has_styled_7', 'typost_used_fonts_7'], $this->deletes);
        $this->assertArchiveCachesDeleted();
    }

    public function test_a_post_delete_without_a_persistent_object_cache_does_not_flush() {
        $this->plugin()->on_post_delete(7);

        $this->assertSame(0, $this->flushes);
        $this->assertArchiveCachesDeleted();
    }

    // ── With a persistent object cache ──────────────────────────────────────

    /**
     * The archive transients live in the object cache, where the row delete
     * cannot reach them: a new generation of their keys makes them stale,
     * and the other cached values of the site stay (#486).
     */
    public function test_with_a_persistent_object_cache_a_clear_deletes_the_generation_and_does_not_flush() {
        $this->persistent = true;

        $this->clear(7);

        $this->assertSame(0, $this->flushes);
        $this->assertSame(1, $this->generationDeletes());
        $this->assertSame(['typost_has_styled_7', 'typost_used_fonts_7'], $this->deletes);
        $this->assertArchiveCachesDeleted();
    }

    public function test_a_post_delete_with_a_persistent_object_cache_deletes_the_generation_and_does_not_flush() {
        $this->persistent = true;

        $this->plugin()->on_post_delete(7);

        $this->assertSame(0, $this->flushes);
        $this->assertSame(1, $this->generationDeletes());
    }

    // ── No post ID ──────────────────────────────────────────────────────────

    public function invalidIdsProvider() {
        return [
            'zero' => [0],
            'null' => [null],
            'empty string' => [''],
            'non-numeric' => ['abc'],
        ];
    }

    /**
     * @dataProvider invalidIdsProvider
     */
    public function test_no_post_id_clears_and_flushes_nothing($post_id) {
        $this->persistent = true;

        $this->clear($post_id);

        $this->assertSame([], $this->deletes);
        $this->assertSame([], $this->queries);
        $this->assertSame(0, $this->flushes);
        $this->assertSame(0, $this->generationDeletes());
    }
}

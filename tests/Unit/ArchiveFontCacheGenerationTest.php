<?php
namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use Brain\Monkey\Functions;

/**
 * Tests for the generation in the archive font cache keys (#486).
 *
 * An archive page caches its font answers under keys that hash the IDs of
 * the listed posts (`typost_has_styled_archive_…`,
 * `typost_used_fonts_archive_…`), so a post save cannot name the keys of
 * the archives that list the post. Without a persistent object cache the
 * transients are option rows, and a save deletes them with a wildcard. With
 * one, they are in the object cache, which cannot delete by prefix: the
 * keys then also hash the generation of the `typost_archive_fonts` cache
 * group (`wp_cache_get_last_changed()`), and a published or private save or
 * delete deletes that generation instead of flushing the whole object
 * cache.
 *
 * The object cache here is an in-memory map behind Brain Monkey stubs of
 * the wp_cache_*() functions, with core's `last_changed` logic and a
 * wp_cache_flush() that empties the map, so a flush is visible as lost
 * values.
 */
class ArchiveFontCacheGenerationTest extends TestCase {

    /** @var array<string, array<string, mixed>> Object cache: group => key => value */
    private $cache;

    /** @var array Transients, keyed by name */
    private $transients;

    /** @var string[] Transient names read with get_transient() */
    private $reads;

    /** @var string[] SQL run through $wpdb->query() */
    private $queries;

    /** @var int wp_cache_flush() calls */
    private $flushes;

    /** @var bool What wp_using_ext_object_cache() reports */
    private $persistent;

    /** @var int Generations made by wp_cache_get_last_changed() */
    private $generations;

    /** @var int Posts whose content an archive scan read */
    private $scans;

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

        $this->cache = [];
        $this->transients = [];
        $this->reads = [];
        $this->queries = [];
        $this->flushes = 0;
        $this->persistent = false;
        $this->generations = 0;
        $this->scans = 0;

        Functions\when('wp_using_ext_object_cache')->alias(function () {
            return $this->persistent;
        });
        Functions\when('wp_cache_get')->alias(function ($key, $group = '') {
            return isset($this->cache[$group][$key]) ? $this->cache[$group][$key] : false;
        });
        Functions\when('wp_cache_set')->alias(function ($key, $value, $group = '') {
            $this->cache[$group][$key] = $value;
            return true;
        });
        Functions\when('wp_cache_delete')->alias(function ($key, $group = '') {
            unset($this->cache[$group][$key]);
            return true;
        });
        Functions\when('wp_cache_flush')->alias(function () {
            $this->flushes++;
            $this->cache = [];
            return true;
        });
        // Core (WordPress 4.7+): the stored generation, or a new one. Core
        // uses microtime(); a counter keeps the test deterministic.
        Functions\when('wp_cache_get_last_changed')->alias(function ($group) {
            $last_changed = isset($this->cache[$group]['last_changed']) ? $this->cache[$group]['last_changed'] : false;
            if (!$last_changed) {
                $this->generations++;
                $last_changed = 'generation-' . $this->generations;
                $this->cache[$group]['last_changed'] = $last_changed;
            }
            return $last_changed;
        });

        // Transients: in the object cache with a persistent one, else rows
        Functions\when('get_transient')->alias(function ($key) {
            $this->reads[] = $key;
            if ($this->persistent) {
                return isset($this->cache['transient'][$key]) ? $this->cache['transient'][$key] : false;
            }
            return array_key_exists($key, $this->transients) ? $this->transients[$key] : false;
        });
        Functions\when('set_transient')->alias(function ($key, $value) {
            if ($this->persistent) {
                $this->cache['transient'][$key] = $value;
            } else {
                $this->transients[$key] = $value;
            }
            return true;
        });
        Functions\when('delete_transient')->alias(function ($key) {
            unset($this->cache['transient'][$key], $this->transients[$key]);
            return true;
        });

        Functions\when('absint')->alias(function ($value) {
            return abs((int) $value);
        });
        Functions\when('wp_is_post_revision')->justReturn(false);
        Functions\when('get_post_type')->justReturn('post');
        Functions\when('is_post_type_viewable')->justReturn(true);
        Functions\when('get_post_status')->justReturn('publish');
        Functions\when('is_singular')->justReturn(false);
        Functions\when('get_option')->alias(function ($name, $default = false) {
            return $default;
        });
        Functions\when('parse_blocks')->justReturn([]);
        Functions\when('do_blocks')->alias(function ($content) {
            $this->scans++;
            return $content;
        });
        Functions\when('wp_list_pluck')->alias(function ($list, $field) {
            $out = [];
            foreach ($list as $item) {
                $out[] = $item->$field;
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

    private function span($font_id) {
        return '<p><span class="typost-styled" data-font-id="' . $font_id . '">x</span></p>';
    }

    /** An archive page that lists posts 1 (font 48) and 2 (nothing styled). */
    private function archive() {
        $GLOBALS['wp_query'] = (object) ['posts' => [
            (object) ['ID' => 1, 'post_excerpt' => '', 'post_content' => $this->span(48)],
            (object) ['ID' => 2, 'post_excerpt' => '', 'post_content' => '<p>Plain</p>'],
        ]];
    }

    /** Change post 1 in the loop: what a save of post 1 stored. */
    private function changePostOne($content) {
        $GLOBALS['wp_query']->posts[0]->post_content = $content;
    }

    /** One archive view: both readers, as detect_frontend_fonts() calls them. */
    private function view() {
        $plugin = $this->plugin();
        return [
            'styled' => $this->invokePrivate($plugin, 'has_styled_content'),
            'fonts' => array_values($this->invokePrivate($plugin, 'get_used_fonts_in_content')),
        ];
    }

    private function legacyKey($prefix) {
        return $prefix . md5(serialize([1, 2]));
    }

    private function archiveReads() {
        return array_values(array_filter($this->reads, function ($key) {
            return strpos($key, '_archive_') !== false;
        }));
    }

    /** Whether the archive generation is gone from the object cache. */
    private function generationDeleted() {
        return !isset($this->cache['typost_archive_fonts']['last_changed']);
    }

    // ── Without a persistent object cache ───────────────────────────────────

    /**
     * The keys stay as they were: there `last_changed` lives for one request
     * only, so a generation in the key would miss on every view and leave
     * an orphan row each time.
     */
    public function test_without_a_persistent_object_cache_the_archive_keys_have_no_generation() {
        Functions\expect('wp_cache_get_last_changed')->never();
        $this->archive();

        $this->view();

        $this->assertSame([
            $this->legacyKey('typost_has_styled_archive_'),
            $this->legacyKey('typost_used_fonts_archive_'),
        ], $this->archiveReads());
    }

    public function test_without_a_persistent_object_cache_a_save_deletes_the_rows_and_does_not_flush() {
        Functions\expect('wp_cache_get_last_changed')->never();
        $this->archive();
        $this->view();
        $this->cache['other_plugin']['value'] = 'kept';

        $this->plugin()->on_post_save(1, (object) ['ID' => 1, 'post_type' => 'post'], true);

        $this->assertSame(0, $this->flushes);
        $this->assertSame('kept', $this->cache['other_plugin']['value']);
        $archive = array_values(array_filter($this->queries, function ($sql) {
            return strpos($sql, 'archive') !== false;
        }));
        $this->assertCount(1, $archive, 'The wildcard row delete still runs');
    }

    // ── With a persistent object cache ──────────────────────────────────────

    public function test_with_a_persistent_object_cache_both_keys_carry_one_generation() {
        $this->persistent = true;
        $this->archive();

        $this->view();

        $reads = $this->archiveReads();
        $this->assertCount(2, $reads);
        // The generation is hashed after the prefix: the key keeps its
        // length, and clear_font_detection_cache()'s typost_has_styled_% and
        // typost_used_fonts_% row matches still find it.
        $this->assertStringStartsWith('typost_has_styled_archive_', $reads[0]);
        $this->assertStringStartsWith('typost_used_fonts_archive_', $reads[1]);
        $this->assertSame(strlen($this->legacyKey('typost_has_styled_archive_')), strlen($reads[0]));
        $this->assertNotSame($this->legacyKey('typost_has_styled_archive_'), $reads[0]);
        $this->assertNotSame($this->legacyKey('typost_used_fonts_archive_'), $reads[1]);
        $this->assertSame(1, $this->generations, 'Both readers share one generation');
    }

    /**
     * The acceptance path: an archive view caches; a published save makes
     * the next view scan again, with no flush, and the other cached values
     * of the site stay.
     */
    public function test_with_a_persistent_object_cache_a_save_makes_the_archive_scan_again_without_a_flush() {
        $this->persistent = true;
        $this->archive();
        $this->cache['other_plugin']['value'] = 'kept';

        $first = $this->view();
        $this->assertSame(['styled' => true, 'fonts' => ['id:48']], $first);

        // The next view hits the cache: no scan, the old answer
        $this->changePostOne($this->span(52));
        $scans = $this->scans;
        $this->assertSame($first, $this->view());
        $this->assertSame($scans, $this->scans, 'A cached archive does not scan');

        // Post 1 is saved with font 52
        $this->plugin()->on_post_save(1, (object) ['ID' => 1, 'post_type' => 'post'], true);

        $this->assertSame(0, $this->flushes, 'A post save does not flush the object cache');
        $this->assertSame('kept', $this->cache['other_plugin']['value']);
        $this->assertTrue($this->generationDeleted());

        $this->assertSame(['styled' => true, 'fonts' => ['id:52']], $this->view());
        $this->assertGreaterThan($scans, $this->scans, 'The archive scans again');
    }

    public function test_with_a_persistent_object_cache_a_permanent_delete_makes_the_archive_scan_again_without_a_flush() {
        $this->persistent = true;
        $this->archive();
        $this->cache['other_plugin']['value'] = 'kept';
        $this->view();
        $this->changePostOne('<p>Plain</p>');

        $this->plugin()->on_post_delete(1);

        $this->assertSame(0, $this->flushes);
        $this->assertSame('kept', $this->cache['other_plugin']['value']);
        $this->assertSame(['styled' => false, 'fonts' => []], $this->view());
    }

    /**
     * Archives list only published and private posts: a draft save keeps
     * the generation, so the archive keeps its cache.
     */
    public function test_with_a_persistent_object_cache_a_draft_save_keeps_the_archive_cache() {
        $this->persistent = true;
        $this->archive();
        $first = $this->view();
        Functions\when('get_post_status')->justReturn('draft');
        $this->changePostOne($this->span(52));

        $this->plugin()->on_post_save(1, (object) ['ID' => 1, 'post_type' => 'post'], true);

        $this->assertSame(0, $this->flushes);
        $this->assertFalse($this->generationDeleted());
        $this->assertSame($first, $this->view());
    }

    /**
     * An evicted generation (the object cache dropped it, or a flush by
     * someone else) only makes the next view miss and scan again.
     */
    public function test_an_evicted_generation_makes_the_next_view_scan_again() {
        $this->persistent = true;
        $this->archive();
        $this->view();
        $this->changePostOne($this->span(52));

        unset($this->cache['typost_archive_fonts']);

        $this->assertSame(['styled' => true, 'fonts' => ['id:52']], $this->view());
    }
}

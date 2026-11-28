<?php
namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use Brain\Monkey\Functions;

/**
 * Tests for clearing the font caches of the posts that use a synced pattern (#487).
 *
 * A post caches the fonts that its content uses for 12 hours
 * (typost_used_fonts_<ID>, typost_has_styled_<ID>). The content scan renders
 * synced patterns, so a pattern's fonts are in the caches of each post that
 * uses it, but the post saves only <!-- wp:block {"ref":N} /-->. A published
 * or private save or delete of the pattern now also deletes the two caches
 * of every post that references it, directly or through other patterns.
 *
 * The fake $wpdb below keeps a posts table and an options table. It runs the
 * SELECT that finds the posts the way MySQL would: it reads the WHERE clause
 * (post_type <> 'revision' AND post_content LIKE '%"ref":%' AND
 * (post_content LIKE ... OR ...)) and applies
 * each LIKE pattern, with its escapes, to every post. A SELECT of another
 * shape fails the test. The DELETE of option rows removes the named rows.
 */
class SyncedPatternUserCachesTest extends TestCase {

    /** @var object The fake $wpdb */
    private $db;

    /** @var array<int, string|false> What get_post_type() reports, by post ID */
    private $types;

    /** @var string[] Transient names passed to delete_transient() */
    private $deletes;

    /** @var array<int, array{0: string, 1: string}> wp_cache_delete() calls: key, group */
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

        $this->types = [];
        $this->deletes = [];
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
        Functions\when('wp_cache_flush')->justReturn(true);
        // The per-post key helper of #486 reads the generation under a
        // persistent object cache, through clear_post_content_caches()
        Functions\when('wp_cache_get_last_changed')->justReturn('1');
        Functions\when('wp_using_ext_object_cache')->alias(function () {
            return $this->persistent;
        });
        Functions\when('absint')->alias(function ($value) {
            return abs((int) $value);
        });
        Functions\when('wp_is_post_revision')->justReturn(false);
        Functions\when('get_post_type')->alias(function ($post_id) {
            return array_key_exists($post_id, $this->types) ? $this->types[$post_id] : false;
        });
        Functions\when('is_post_type_viewable')->alias(function ($post_type) {
            return in_array($post_type, ['post', 'page', 'attachment', 'book'], true);
        });
        Functions\when('get_post_status')->justReturn('publish');

        $this->db = new class {
            public $posts = 'wp_posts';
            public $options = 'wp_options';
            /** @var array<int, array{ID: int, post_type: string, post_content: string}> */
            public $rows = [];
            /** @var array<string, true> Option rows */
            public $optionRows = [];
            /** @var string[] SELECT queries */
            public $selects = [];
            /** @var string[] DELETE ... IN queries */
            public $optionDeletes = [];

            public function esc_like($text) {
                return addcslashes($text, '_%\\');
            }
            public function prepare($query, ...$args) {
                return vsprintf(str_replace('%s', "'%s'", $query), $args);
            }
            public function query($sql) {
                if (preg_match("/^DELETE FROM wp_options WHERE option_name IN \\((.*)\\)$/s", $sql, $m)) {
                    $this->optionDeletes[] = $sql;
                    $deleted = 0;
                    foreach (explode(', ', $m[1]) as $quoted) {
                        $name = trim($quoted, "'");
                        if (isset($this->optionRows[$name])) {
                            unset($this->optionRows[$name]);
                            $deleted++;
                        }
                    }
                    return $deleted;
                }
                // The archive wildcard delete of clear_post_content_caches()
                return 0;
            }
            public function get_results($sql) {
                $this->selects[] = $sql;
                if (!preg_match("/^SELECT ID, post_type FROM wp_posts WHERE post_type <> '([^']*)' AND post_content LIKE '([^']*)' AND \\((.*)\\)$/s", $sql, $m)) {
                    throw new \RuntimeException('Unexpected SQL: ' . $sql);
                }
                // The prefilter that leaves out posts with no reference (#487 review)
                if ('%"ref":%' !== $m[2]) {
                    throw new \RuntimeException('Unexpected prefilter: ' . $m[2]);
                }
                $prefilter = self::likeToRegex($m[2]);
                $regexes = [];
                foreach (explode(' OR ', $m[3]) as $part) {
                    if (!preg_match("/^post_content LIKE '(.*)'$/s", $part, $like)) {
                        throw new \RuntimeException('Unexpected condition: ' . $part);
                    }
                    $regexes[] = self::likeToRegex($like[1]);
                }
                $out = [];
                foreach ($this->rows as $row) {
                    if ($row['post_type'] === $m[1] || !preg_match($prefilter, $row['post_content'])) {
                        continue;
                    }
                    foreach ($regexes as $regex) {
                        if (preg_match($regex, $row['post_content'])) {
                            // wpdb returns every column as a string
                            $out[] = (object) ['ID' => (string) $row['ID'], 'post_type' => $row['post_type']];
                            break;
                        }
                    }
                }
                return $out;
            }
            /** A MySQL LIKE pattern as a regex: % any run, _ one character, \ escapes. */
            private static function likeToRegex($like) {
                $regex = '';
                for ($i = 0, $n = strlen($like); $i < $n; $i++) {
                    $c = $like[$i];
                    if ('\\' === $c && $i + 1 < $n) {
                        $regex .= preg_quote($like[++$i], '/');
                    } elseif ('%' === $c) {
                        $regex .= '.*';
                    } elseif ('_' === $c) {
                        $regex .= '.';
                    } else {
                        $regex .= preg_quote($c, '/');
                    }
                }
                return '/^' . $regex . '$/s';
            }
        };
        $GLOBALS['wpdb'] = $this->db;
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

    /** Add a post to the fake table, with its two font caches in the options table. */
    private function addPost($id, $post_type, $content) {
        $this->db->rows[] = ['ID' => $id, 'post_type' => $post_type, 'post_content' => $content];
        $this->types[$id] = $post_type;
        foreach (['typost_used_fonts_', 'typost_has_styled_'] as $prefix) {
            $this->db->optionRows['_transient_' . $prefix . $id] = true;
            $this->db->optionRows['_transient_timeout_' . $prefix . $id] = true;
        }
    }

    private function ref($pattern_id, $more = '') {
        return '<!-- wp:block {"ref":' . $pattern_id . $more . '} /-->';
    }

    private function savePattern($id, $status = 'publish') {
        $this->types[$id] = 'wp_block';
        Functions\when('get_post_status')->justReturn($status);
        $this->plugin()->on_post_save($id, (object) ['ID' => $id, 'post_type' => 'wp_block', 'post_status' => $status], true);
    }

    private function hasCaches($id) {
        $all = true;
        $any = false;
        foreach (['typost_used_fonts_', 'typost_has_styled_'] as $prefix) {
            foreach (['_transient_', '_transient_timeout_'] as $row) {
                $present = isset($this->db->optionRows[$row . $prefix . $id]);
                $all = $all && $present;
                $any = $any || $present;
            }
        }
        $this->assertSame($all, $any, "Post $id: its four cache rows must go or stay together");
        return $all;
    }

    private function assertCleared($id, $message = '') {
        $this->assertFalse($this->hasCaches($id), "Post $id must lose its font caches. $message");
    }

    private function assertKept($id, $message = '') {
        $this->assertTrue($this->hasCaches($id), "Post $id must keep its font caches. $message");
    }

    // ── The posts that use the pattern ──────────────────────────────────────

    public function test_a_pattern_save_clears_the_posts_that_use_it_and_keeps_the_rest() {
        $this->addPost(12, 'wp_block', '<!-- wp:paragraph --><p>Pattern</p><!-- /wp:paragraph -->');
        $this->addPost(100, 'post', '<!-- wp:paragraph --><p>Intro</p><!-- /wp:paragraph -->' . $this->ref(12));
        $this->addPost(101, 'page', $this->ref(12, ',"className":"is-style-x"'));
        $this->addPost(102, 'post', '<!-- wp:group --><div class="wp-block-group">' . $this->ref(12) . '</div><!-- /wp:group -->');
        $this->addPost(103, 'book', $this->ref(12));
        // Posts that do not use pattern 12
        $this->addPost(200, 'post', $this->ref(123));
        $this->addPost(201, 'post', $this->ref(1234, ',"className":"x"'));
        $this->addPost(202, 'post', $this->ref(112));
        $this->addPost(203, 'post', '<!-- wp:paragraph --><p>No pattern</p><!-- /wp:paragraph -->');

        $this->savePattern(12);

        foreach ([100, 101, 102, 103] as $id) {
            $this->assertCleared($id);
        }
        foreach ([200, 201, 202, 203] as $id) {
            $this->assertKept($id, 'It does not use pattern 12.');
        }
        $this->assertCount(1, $this->db->selects, 'One SELECT for a pattern that no other pattern holds');
        $this->assertCount(1, $this->db->optionDeletes, 'One DELETE for up to 100 posts');
    }

    public function test_the_pattern_s_own_caches_are_still_cleared_as_before() {
        $this->addPost(12, 'wp_block', 'Pattern');

        $this->savePattern(12);

        $this->assertSame(['typost_has_styled_12', 'typost_used_fonts_12'], $this->deletes);
    }

    public function test_a_post_that_uses_the_pattern_only_through_another_pattern_is_cleared() {
        // 12 is inside 20, 20 is inside 30
        $this->addPost(12, 'wp_block', 'Inner');
        $this->addPost(20, 'wp_block', 'Middle ' . $this->ref(12));
        $this->addPost(30, 'wp_block', 'Outer ' . $this->ref(20, ',"className":"x"'));
        $this->addPost(100, 'post', $this->ref(12));
        $this->addPost(101, 'post', $this->ref(20));
        $this->addPost(102, 'post', $this->ref(30));
        $this->addPost(40, 'wp_block', 'Other');
        $this->addPost(103, 'post', $this->ref(40));

        $this->savePattern(12);

        $this->assertCleared(100, 'It uses pattern 12.');
        $this->assertCleared(101, 'It uses pattern 20, which holds 12.');
        $this->assertCleared(102, 'It uses pattern 30, which holds 20.');
        $this->assertKept(103, 'It uses pattern 40 only.');
        // One SELECT per level: users of 12, of 20, of 30 (none)
        $this->assertCount(3, $this->db->selects);
    }

    public function test_patterns_that_hold_each_other_do_not_loop() {
        $this->addPost(12, 'wp_block', 'A ' . $this->ref(20) . $this->ref(12));
        $this->addPost(20, 'wp_block', 'B ' . $this->ref(12));
        $this->addPost(100, 'post', $this->ref(20));

        $this->savePattern(12);

        $this->assertCleared(100);
        // Users of 12 (finds 20; 12 itself is visited), then users of 20
        // (finds 12, visited, and post 100)
        $this->assertCount(2, $this->db->selects);
    }

    /**
     * The page render has no depth limit, so the search follows the
     * references up as far as they go, with only a cost ceiling of 20
     * levels: a post that uses pattern 7 (six levels above the saved one)
     * is cleared, a post 20 levels up is cleared, a post 21 levels up is not,
     * and no more than 20 SELECTs run.
     */
    public function test_the_search_follows_up_to_twenty_levels() {
        // Pattern 1 is in 2, 2 in 3, ... 21 in 22
        $this->addPost(1, 'wp_block', 'Level 0');
        for ($id = 2; $id <= 22; $id++) {
            $this->addPost($id, 'wp_block', $this->ref($id - 1));
        }
        $this->addPost(107, 'post', $this->ref(7));
        $this->addPost(120, 'post', $this->ref(20));
        $this->addPost(121, 'post', $this->ref(21));

        $this->savePattern(1);

        $this->assertCleared(107, 'Pattern 1 is six levels under pattern 7: the page renders it.');
        $this->assertCleared(120, 'Pattern 1 is 19 levels under pattern 20: inside the ceiling.');
        $this->assertKept(121, 'Pattern 1 is 20 levels under pattern 21: past the ceiling.');
        $this->assertCount(20, $this->db->selects);
    }

    public function test_the_search_stops_at_the_first_level_that_finds_no_new_pattern() {
        // Pattern 1 is in 2, 2 in 3; nothing holds 3
        $this->addPost(1, 'wp_block', 'Level 0');
        $this->addPost(2, 'wp_block', $this->ref(1));
        $this->addPost(3, 'wp_block', $this->ref(2));
        $this->addPost(103, 'post', $this->ref(3));

        $this->savePattern(1);

        $this->assertCleared(103);
        // Users of 1 (pattern 2), of 2 (pattern 3), of 3 (post 103 only)
        $this->assertCount(3, $this->db->selects);
    }

    public function test_revisions_templates_and_other_internal_types_are_not_cleared_or_followed() {
        $this->addPost(12, 'wp_block', 'Pattern');
        $this->addPost(100, 'post', 'Old ' . $this->ref(12));
        $this->addPost(500, 'revision', $this->ref(12));
        $this->addPost(501, 'wp_template_part', $this->ref(12));
        $this->addPost(502, 'wp_template', $this->ref(12));
        $this->addPost(503, 'nav_menu_item', $this->ref(12));

        $this->savePattern(12);

        $this->assertCleared(100);
        foreach ([500, 501, 502, 503] as $id) {
            $this->assertKept($id, 'It keeps no frontend font cache.');
        }
        $this->assertCount(1, $this->db->selects, 'A template part is not searched for its users');
        $this->assertStringContainsString("post_type <> 'revision'", $this->db->selects[0]);
    }

    // ── When it runs ────────────────────────────────────────────────────────

    public function unpublishedStatusesProvider() {
        return [
            'draft' => ['draft'],
            'pending' => ['pending'],
            'future' => ['future'],
            'trash' => ['trash'],
            'auto-draft' => ['auto-draft'],
        ];
    }

    /**
     * WordPress renders a synced pattern only while it is published, so a
     * save with another status changes no post's fonts.
     *
     * @dataProvider unpublishedStatusesProvider
     */
    public function test_an_unpublished_pattern_save_searches_nothing($status) {
        $this->addPost(12, 'wp_block', 'Pattern');
        $this->addPost(100, 'post', $this->ref(12));

        $this->savePattern(12, $status);

        $this->assertSame([], $this->db->selects);
        $this->assertKept(100);
    }

    public function test_a_private_pattern_save_clears_the_posts_that_use_it() {
        $this->addPost(12, 'wp_block', 'Pattern');
        $this->addPost(100, 'post', $this->ref(12));

        $this->savePattern(12, 'private');

        $this->assertCleared(100);
    }

    public function test_a_published_pattern_delete_clears_the_posts_that_use_it() {
        $this->addPost(12, 'wp_block', 'Pattern');
        $this->addPost(100, 'post', $this->ref(12));
        $this->addPost(200, 'post', $this->ref(120));

        $this->plugin()->on_post_delete(12);

        $this->assertCleared(100);
        $this->assertKept(200);
    }

    public function test_a_post_or_page_save_searches_nothing() {
        $this->addPost(12, 'post', 'A post');
        $this->addPost(13, 'page', 'A page');
        $this->addPost(100, 'post', $this->ref(12));

        $this->plugin()->on_post_save(12, (object) ['ID' => 12, 'post_type' => 'post'], true);
        $this->plugin()->on_post_save(13, (object) ['ID' => 13, 'post_type' => 'page'], true);
        $this->plugin()->on_post_delete(13);

        $this->assertSame([], $this->db->selects);
        $this->assertKept(100);
    }

    public function test_a_pattern_that_no_post_uses_runs_one_select_and_no_delete() {
        $this->addPost(12, 'wp_block', 'Pattern');
        $this->addPost(100, 'post', $this->ref(13));

        $this->savePattern(12);

        $this->assertCount(1, $this->db->selects);
        $this->assertSame([], $this->db->optionDeletes);
        $this->assertKept(100);
    }

    // ── Cost and caches ─────────────────────────────────────────────────────

    public function test_many_posts_are_cleared_with_one_delete_per_100_posts() {
        $this->addPost(12, 'wp_block', 'Pattern');
        for ($id = 1000; $id < 1250; $id++) {
            $this->addPost($id, 'post', $this->ref(12));
        }
        $this->addPost(2000, 'post', $this->ref(13));

        $this->savePattern(12);

        for ($id = 1000; $id < 1250; $id++) {
            $this->assertCleared($id);
        }
        $this->assertKept(2000);
        $this->assertCount(1, $this->db->selects);
        $this->assertCount(3, $this->db->optionDeletes, '250 posts: 100 + 100 + 50');
    }

    /**
     * Under a persistent object cache the transients are in the cache, not
     * in the options table: each key is deleted there, and this method runs
     * no flush of its own.
     */
    public function test_with_a_persistent_object_cache_the_keys_are_deleted_from_the_cache() {
        $this->persistent = true;
        $this->addPost(12, 'wp_block', 'Pattern');
        $this->addPost(100, 'post', $this->ref(12));
        $this->addPost(200, 'post', $this->ref(123));

        $this->savePattern(12);

        $this->assertContains(['typost_used_fonts_100', 'transient'], $this->cacheDeletes);
        $this->assertContains(['typost_has_styled_100', 'transient'], $this->cacheDeletes);
        $this->assertNotContains(['typost_used_fonts_200', 'transient'], $this->cacheDeletes);
        $this->assertSame([], $this->db->optionDeletes);
    }

    public function invalidIdsProvider() {
        return [
            'zero' => [0],
            'null' => [null],
            'non-numeric' => ['abc'],
        ];
    }

    /**
     * @dataProvider invalidIdsProvider
     */
    public function test_no_pattern_id_searches_nothing($pattern_id) {
        $method = new \ReflectionMethod(\Typost::class, 'clear_synced_pattern_user_caches');
        $method->setAccessible(true);

        $this->assertSame([], $method->invoke($this->plugin(), $pattern_id));
        $this->assertSame([], $this->db->selects);
    }
}

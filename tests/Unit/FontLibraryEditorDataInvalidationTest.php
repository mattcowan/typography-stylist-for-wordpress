<?php
/**
 * QA 2026-09 Session E finding E-16: a family installed in the Font Library
 * did not reach the editor picker until the hourly localized-data transient
 * (typost_editor_data_{user}) expired. The save_post_wp_font_family and
 * save_post_wp_font_face handlers, and the widened deleted_post handler,
 * invalidate that transient (and, for faces, the font CSS caches).
 *
 * @package Typography_Stylist
 */

namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use Brain\Monkey\Functions;

class FontLibraryEditorDataInvalidationTest extends TestCase {

    /** @var array Captured $wpdb->query() SQL strings. */
    private $queries = array();

    protected function setUp(): void {
        parent::setUp();
        $this->queries = array();

        Functions\when('wp_is_post_revision')->justReturn(false);
        Functions\when('wp_is_post_autosave')->justReturn(false);
        Functions\when('delete_transient')->justReturn(true);
        Functions\when('wp_cache_delete')->justReturn(true);
        Functions\when('wp_cache_flush')->justReturn(true);
        Functions\when('wp_using_ext_object_cache')->justReturn(false);
        Functions\when('post_type_exists')->justReturn(true);
        Functions\when('get_option')->justReturn(array());
        Functions\when('get_post_meta')->justReturn('');
        Functions\when('get_posts')->justReturn(array());
        Functions\when('do_action')->justReturn(null);
        Functions\when('wp_generate_uuid4')->alias(function () {
            static $n = 0;
            return 'uuid-' . (++$n);
        });

        // Every wildcard transient delete goes through $wpdb; capture the SQL.
        global $wpdb;
        $queries = &$this->queries;
        $wpdb = new class($queries) {
            public $options = 'wp_options';
            private $log;
            public function __construct(&$log) {
                $this->log = &$log;
            }
            public function query($sql) {
                $this->log[] = $sql;
                return 0;
            }
            public function prepare($sql, ...$args) {
                return vsprintf(str_replace('%s', "'%s'", $sql), $args);
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

    private function makePost($type, $status = 'publish') {
        return (object) array('ID' => 900, 'post_type' => $type, 'post_status' => $status, 'post_name' => 'qa-family');
    }

    private function editorDataDeletes() {
        return array_values(array_filter($this->queries, function ($sql) {
            return false !== strpos($sql, '_transient_typost_editor_data_');
        }));
    }

    public function test_saving_a_font_family_invalidates_the_editor_data_transient() {
        $plugin = $this->getPluginInstance();
        $plugin->on_wp_font_family_saved(900, $this->makePost('wp_font_family'), false);

        $this->assertCount(1, $this->editorDataDeletes(), 'the per-user editor data transients must be deleted');
    }

    public function test_an_auto_draft_family_is_ignored() {
        $plugin = $this->getPluginInstance();
        $plugin->on_wp_font_family_saved(900, $this->makePost('wp_font_family', 'auto-draft'), false);

        $this->assertSame(array(), $this->editorDataDeletes());
    }

    public function test_a_revision_is_ignored() {
        Functions\when('wp_is_post_revision')->justReturn(901);
        $plugin = $this->getPluginInstance();
        $plugin->on_wp_font_family_saved(901, $this->makePost('wp_font_family'), true);

        $this->assertSame(array(), $this->editorDataDeletes());
    }

    public function test_saving_a_font_face_rotates_the_css_caches_without_a_flush() {
        $deleted = array();
        $updated = array();
        Functions\when('delete_transient')->alias(function ($key) use (&$deleted) {
            $deleted[] = $key;
            return true;
        });
        Functions\when('update_option')->alias(function ($key, $value) use (&$updated) {
            $updated[$key] = $value;
            return true;
        });
        Functions\expect('wp_cache_flush')->never();

        $plugin = $this->getPluginInstance();
        $plugin->on_wp_font_face_saved(902, $this->makePost('wp_font_face'), false);

        // The three static CSS transients go by name (object-cache safe) …
        foreach (array('typost_admin_font_css', 'typost_editor_font_css', 'typost_block_font_css') as $key) {
            $this->assertContains($key, $deleted);
        }
        // … the per-page frontend keys rotate through the face version …
        $this->assertArrayHasKey('typost_font_face_version', $updated);
        // … and nothing runs a wildcard delete (no stampede per face post).
        $this->assertSame(array(), $this->queries, 'a face save must not issue wildcard transient deletes');
    }

    public function test_deleting_a_font_face_rotates_the_css_caches_like_a_save() {
        $deleted = array();
        $updated = array();
        Functions\when('delete_transient')->alias(function ($key) use (&$deleted) {
            $deleted[] = $key;
            return true;
        });
        Functions\when('update_option')->alias(function ($key, $value) use (&$updated) {
            $updated[$key] = $value;
            return true;
        });
        Functions\expect('wp_cache_flush')->never();

        $plugin = $this->getPluginInstance();
        $plugin->on_wp_font_family_deleted(908, $this->makePost('wp_font_face'));

        foreach (array('typost_admin_font_css', 'typost_editor_font_css', 'typost_block_font_css') as $key) {
            $this->assertContains($key, $deleted);
        }
        $this->assertArrayHasKey('typost_font_face_version', $updated);
        $this->assertSame(array(), $this->editorDataDeletes(), 'a face deletion does not touch the editor data transients');
        $this->assertSame(array(), $this->queries);
    }

    public function test_two_face_saves_get_different_versions() {
        $versions = array();
        Functions\when('update_option')->alias(function ($key, $value) use (&$versions) {
            if ('typost_font_face_version' === $key) {
                $versions[] = $value;
            }
            return true;
        });
        $plugin = $this->getPluginInstance();
        $plugin->on_wp_font_face_saved(909, $this->makePost('wp_font_face'), false);
        $plugin->on_wp_font_face_saved(910, $this->makePost('wp_font_face'), false);

        $this->assertCount(2, $versions);
        $this->assertNotSame($versions[0], $versions[1]);
    }

    public function test_the_editor_data_flush_is_gated_on_a_persistent_object_cache() {
        Functions\when('wp_using_ext_object_cache')->justReturn(false);
        Functions\expect('wp_cache_flush')->never();

        $plugin = $this->getPluginInstance();
        $plugin->on_wp_font_family_deleted(907, $this->makePost('wp_font_family'));

        $this->assertCount(1, $this->editorDataDeletes());
    }

    public function test_deleting_an_unrelated_family_still_invalidates_the_editor_data() {
        // Not plugin-registered, not adopted: the bridge reports nothing to roll back.
        $plugin = $this->getPluginInstance();
        $plugin->on_wp_font_family_deleted(903, $this->makePost('wp_font_family'));

        $this->assertCount(1, $this->editorDataDeletes());
    }

    public function test_deleting_a_post_of_another_type_does_nothing() {
        $plugin = $this->getPluginInstance();
        $plugin->on_wp_font_family_deleted(904, $this->makePost('post'));

        $this->assertSame(array(), $this->editorDataDeletes());
    }
}

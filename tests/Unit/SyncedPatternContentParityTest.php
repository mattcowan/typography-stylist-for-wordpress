<?php
/**
 * The two readers of synced pattern content (#358).
 *
 * Typost::get_synced_pattern_content() (the editor's Adobe kit scan) parses
 * the content with parse_blocks() and collects core/block refs.
 * Typost_Paragraph_Styles::get_synced_pattern_content() (the style
 * references of a post) finds `<!-- wp:block {..."ref":N` with a regular
 * expression, because the module uses public API only. Both must read the
 * same patterns from the same content. Where they do not today, the case
 * is named `differs:` and pins what each one reads.
 *
 * parse_blocks() is WordPress's own parser (WP_Block_Parser), loaded from
 * TYPOST_WP_DIR; without it the test is skipped.
 */

namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use Brain\Monkey\Functions;

class SyncedPatternContentParityTest extends TestCase {

    /** @var array<int, object> Posts get_post() returns, by ID */
    private $posts = array();

    protected function setUp(): void {
        parent::setUp();
        $root = getenv('TYPOST_WP_DIR');
        $dir  = is_string($root) && '' !== $root ? rtrim($root, '/\\') . '/wp-includes/' : '';
        if ('' === $dir || !is_file($dir . 'class-wp-block-parser.php')) {
            $this->markTestSkipped('Set TYPOST_WP_DIR to a WordPress checkout with wp-includes/class-wp-block-parser.php to run this test.');
        }
        foreach (array('class-wp-block-parser-block.php', 'class-wp-block-parser-frame.php', 'class-wp-block-parser.php') as $file) {
            if (is_file($dir . $file)) {
                require_once $dir . $file;
            }
        }
        if (!defined('HOUR_IN_SECONDS')) {
            define('HOUR_IN_SECONDS', 3600);
        }
        static $loaded = false;
        if (!$loaded) {
            require_once TYPOST_PLUGIN_DIR . '/typography-stylist.php';
            Functions\when('plugin_dir_path')->justReturn(TYPOST_PLUGIN_DIR . '/paragraph-styles/');
            Functions\when('plugin_dir_url')->justReturn('http://localhost/paragraph-styles/');
            require_once TYPOST_PLUGIN_DIR . '/paragraph-styles/paragraph-styles.php';
            $loaded = true;
        }
        Functions\when('parse_blocks')->alias(function ($content) {
            $parser = new \WP_Block_Parser();
            return $parser->parse($content);
        });
        Functions\when('absint')->alias(function ($v) { return abs((int) $v); });
        Functions\when('get_post')->alias(function ($id) {
            return isset($this->posts[$id]) ? $this->posts[$id] : null;
        });
    }

    private function pattern($id, $content, $type = 'wp_block') {
        $this->posts[$id] = (object) array('ID' => $id, 'post_type' => $type, 'post_content' => $content);
    }

    private function ref($id) {
        return '<!-- wp:block {"ref":' . $id . '} /-->';
    }

    /** The content each copy reads for $content, as a list of pattern contents. */
    private function read($class, $content) {
        $object  = (new \ReflectionClass($class))->newInstanceWithoutConstructor();
        $visited = array();
        $call    = \Closure::bind(function ($content) use (&$visited) {
            return $this->get_synced_pattern_content($content, $visited);
        }, $object, $class);
        $out = $call($content);
        return '' === $out ? array() : explode("\n", substr($out, 1));
    }

    private function both($content) {
        return array(
            'core'   => $this->read(\Typost::class, $content),
            'module' => $this->read(\Typost_Paragraph_Styles::class, $content),
        );
    }

    public function test_one_pattern() {
        $this->pattern(5, 'P5');
        $this->assertSame(array('core' => array('P5'), 'module' => array('P5')), $this->both('<!-- wp:paragraph --><p>x</p><!-- /wp:paragraph -->' . $this->ref(5)));
    }

    public function test_a_pattern_inside_a_group() {
        $this->pattern(5, 'P5');
        $content = '<!-- wp:group --><div class="wp-block-group">' . $this->ref(5) . '</div><!-- /wp:group -->';
        $this->assertSame(array('core' => array('P5'), 'module' => array('P5')), $this->both($content));
    }

    public function test_nested_patterns_in_document_order() {
        $this->pattern(5, 'P5' . $this->ref(6));
        $this->pattern(6, 'P6');
        $this->pattern(7, 'P7');
        $result = $this->both($this->ref(5) . $this->ref(7));
        $this->assertSame($result['core'], $result['module']);
        $this->assertSame(array('P5' . $this->ref(6), 'P6', 'P7'), $result['core']);
    }

    public function test_a_loop_reads_each_pattern_once() {
        $this->pattern(8, 'P8' . $this->ref(9));
        $this->pattern(9, 'P9' . $this->ref(8));
        $result = $this->both($this->ref(8) . $this->ref(8));
        $this->assertSame($result['core'], $result['module']);
        $this->assertSame(array('P8' . $this->ref(9), 'P9' . $this->ref(8)), $result['core']);
    }

    public function test_the_depth_cap_is_the_same() {
        for ($id = 11; $id <= 20; $id++) {
            $this->pattern($id, 'P' . $id . $this->ref($id + 1));
        }
        $result = $this->both($this->ref(11));
        $this->assertSame($result['core'], $result['module']);
        $this->assertCount(6, $result['core']);
    }

    public function test_a_post_that_is_not_a_pattern_is_skipped() {
        $this->pattern(5, 'P5', 'page');
        $this->assertSame(array('core' => array(), 'module' => array()), $this->both($this->ref(5)));
    }

    public function test_a_ref_in_text_that_is_not_a_block_is_ignored() {
        $this->pattern(5, 'P5');
        $content = '<!-- wp:paragraph --><p>wp:block {"ref":5} and &lt;!-- wp:block {"ref":5} /--&gt;</p><!-- /wp:paragraph -->';
        $this->assertSame(array('core' => array(), 'module' => array()), $this->both($content));
    }

    public function test_escaped_json_in_other_attributes() {
        $this->pattern(5, 'P5');
        // Block comments escape < > and " inside attribute strings
        $attrs   = json_encode(array('ref' => 5, 'content' => array('note' => '<b> "q"')), JSON_HEX_TAG | JSON_HEX_QUOT);
        $content = '<!-- wp:block ' . $attrs . ' /-->';
        $this->assertStringContainsString('<', $content);
        $this->assertSame(array('core' => array('P5'), 'module' => array('P5')), $this->both($content));
    }

    public function test_differs_a_ref_stored_as_a_string() {
        // parse_blocks() reads {"ref":"5"} and absint() takes it; the regular
        // expression wants digits right after the colon.
        $this->pattern(5, 'P5');
        $this->assertSame(array('core' => array('P5'), 'module' => array()), $this->both('<!-- wp:block {"ref":"5"} /-->'));
    }

    public function test_differs_a_space_after_the_colon() {
        $this->pattern(5, 'P5');
        $this->assertSame(array('core' => array('P5'), 'module' => array()), $this->both('<!-- wp:block {"ref": 5} /-->'));
    }

    public function test_the_namespaced_block_name_is_missed_by_both() {
        // The serializer writes wp:block. wp:core/block is the same block,
        // but both copies first look for the text "wp:block" and stop.
        $this->pattern(5, 'P5');
        $this->assertSame(array('core' => array(), 'module' => array()), $this->both('<!-- wp:core/block {"ref":5} /-->'));
    }

    public function test_differs_a_ref_key_inside_another_attribute_first() {
        // The regular expression takes the first "ref" it meets.
        $this->pattern(5, 'P5');
        $this->pattern(9, 'P9');
        $this->assertSame(array('core' => array('P5'), 'module' => array('P9')), $this->both('<!-- wp:block {"metadata":{"ref":9},"ref":5} /-->'));
    }
}

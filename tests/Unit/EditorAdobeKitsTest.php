<?php
namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use Brain\Monkey\Functions;

/**
 * Tests for #230: in the block editor, enqueue_adobe_fonts() loads only the
 * kits that the edited post's saved content uses (plus "load on all pages"
 * and forced fonts), not every kit.
 */
class EditorAdobeKitsTest extends TestCase {

    const ADOBE = array(
        array('id' => 'adobe-a', 'font_id' => 5, 'kit_id' => 'abc', 'css_url' => 'https://use.typekit.net/abc.css', 'font_family' => 'bookmania'),
        array('id' => 'adobe-b', 'font_id' => 6, 'kit_id' => 'xyz', 'css_url' => 'https://use.typekit.net/xyz.css', 'font_family' => 'zeplin-vf'),
        array('id' => 'adobe-c', 'font_id' => 7, 'kit_id' => 'all', 'css_url' => 'https://use.typekit.net/all.css', 'font_family' => 'please-vf', 'load_on_all_pages' => true),
        array('id' => 'adobe-d', 'font_id' => 8, 'kit_id' => 'frc', 'css_url' => 'https://use.typekit.net/frc.css', 'font_family' => 'forced'),
        array('id' => 'adobe-e', 'font_id' => 29, 'kit_id' => 'rep', 'css_url' => 'https://use.typekit.net/rep.css', 'font_family' => 'replacement'),
    );

    /** @var array Handles passed to wp_enqueue_style(). */
    private $enqueued = array();

    protected function setUp(): void {
        parent::setUp();
        static $loaded = false;
        if (!$loaded) {
            require_once TYPOST_PLUGIN_DIR . '/includes/class-typost-font-sources.php';
            require_once TYPOST_PLUGIN_DIR . '/typography-stylist.php';
            $loaded = true;
        }
        $this->enqueued = array();
        $enqueued = &$this->enqueued;
        Functions\when('is_admin')->justReturn(true);
        Functions\when('esc_url')->returnArg();
        Functions\when('parse_blocks')->justReturn(array());
        Functions\when('wp_enqueue_style')->alias(function ($handle) use (&$enqueued) {
            $enqueued[] = $handle;
        });
    }

    /**
     * A Typost stand-in whose font data comes from the fixtures.
     *
     * @param array $forced       Forced font IDs.
     * @param array $replacements Deleted ID => replacement ID.
     */
    private function plugin(array $forced = array(), array $replacements = array()) {
        $sources = $this->getMockBuilder(\Typost_Font_Sources::class)
            ->disableOriginalConstructor()
            ->onlyMethods(array('get_adobe_fonts', 'resolve_used_font_replacements', 'get_font_replacements'))
            ->getMock();
        $sources->method('get_adobe_fonts')->willReturn(self::ADOBE);
        $sources->method('resolve_used_font_replacements')->willReturnCallback(function ($ids) use ($replacements) {
            $out = $ids;
            foreach ($ids as $id) {
                if (isset($replacements[$id])) {
                    $out[] = $replacements[$id];
                }
            }
            return array_values(array_unique($out));
        });
        $sources->method('get_font_replacements')->willReturn(array('mappings' => $replacements, 'global_load' => array()));

        $plugin = $this->getMockBuilder(\Typost::class)
            ->disableOriginalConstructor()
            ->onlyMethods(array('font_sources', 'get_forced_font_ids'))
            ->getMock();
        $plugin->method('font_sources')->willReturn($sources);
        $plugin->method('get_forced_font_ids')->willReturn($forced);
        return $plugin;
    }

    private function editPost($content) {
        Functions\when('get_post')->justReturn((object) array('ID' => 253, 'post_content' => $content));
    }

    public function test_editor_loads_only_the_kits_the_post_uses() {
        $this->editPost('<!-- wp:heading --><h2><span class="typost-styled" data-font-id="5" style="font-family: var(--font-5)">Hi</span></h2><!-- /wp:heading -->');
        $this->plugin()->enqueue_adobe_fonts();

        $this->assertSame(array('typost-adobe-abc', 'typost-adobe-all'), $this->enqueued);
    }

    public function test_editor_without_a_post_loads_only_all_pages_and_forced_kits() {
        // Site editor, widgets editor: no single post
        Functions\when('get_post')->justReturn(null);
        $this->plugin(array(8))->enqueue_adobe_fonts();

        $this->assertSame(array('typost-adobe-all', 'typost-adobe-frc'), $this->enqueued);
    }

    public function test_editor_reads_block_attributes() {
        $this->editPost('<!-- wp:typost/block {"fontId":6} /-->');
        Functions\when('parse_blocks')->justReturn(array(
            array('blockName' => 'typost/block', 'attrs' => array('fontId' => 6), 'innerBlocks' => array()),
        ));
        $this->plugin()->enqueue_adobe_fonts();

        $this->assertContains('typost-adobe-xyz', $this->enqueued);
        $this->assertNotContains('typost-adobe-abc', $this->enqueued);
    }

    public function test_editor_matches_a_legacy_family_name_reference() {
        $this->editPost('<span class="typost-styled" data-font="bookmania">Hi</span>');
        $this->plugin()->enqueue_adobe_fonts();

        $this->assertContains('typost-adobe-abc', $this->enqueued);
    }

    public function test_editor_loads_the_replacement_of_a_deleted_font() {
        $this->editPost('<span data-font-id="16" style="font-family: var(--font-16)">Hi</span>');
        $this->plugin(array(), array(16 => 29))->enqueue_adobe_fonts();

        $this->assertContains('typost-adobe-rep', $this->enqueued);
    }

    public function test_editor_scans_the_post_once_per_request() {
        $calls = 0;
        Functions\when('get_post')->alias(function () use (&$calls) {
            $calls++;
            return (object) array('ID' => 253, 'post_content' => '<span data-font-id="5">x</span>');
        });
        $plugin = $this->plugin();
        // Canvas (enqueue_block_assets) and editor page (enqueue_block_editor_assets)
        $plugin->enqueue_adobe_fonts();
        $plugin->enqueue_adobe_fonts();

        $this->assertSame(1, $calls);
    }

    /**
     * Stub parse_blocks() to report core/block refs found in the content,
     * and get_post() to return the edited post (no argument) or a pattern.
     *
     * @param string $post_content Saved content of the edited post.
     * @param array  $patterns     Pattern ID => saved content.
     */
    private function editPostWithPatterns($post_content, array $patterns) {
        Functions\when('parse_blocks')->alias(function ($content) {
            $blocks = array();
            if (preg_match_all('/wp:block \{"ref":(\d+)\}/', $content, $m)) {
                foreach ($m[1] as $ref) {
                    $blocks[] = array('blockName' => 'core/block', 'attrs' => array('ref' => (int) $ref), 'innerBlocks' => array());
                }
            }
            return $blocks;
        });
        Functions\when('get_post')->alias(function ($id = null) use ($post_content, $patterns) {
            if (null === $id) {
                return (object) array('ID' => 253, 'post_type' => 'page', 'post_content' => $post_content);
            }
            return isset($patterns[$id])
                ? (object) array('ID' => $id, 'post_type' => 'wp_block', 'post_content' => $patterns[$id])
                : null;
        });
    }

    public function test_editor_reads_fonts_inside_a_synced_pattern() {
        $this->editPostWithPatterns('<!-- wp:block {"ref":42} /-->', array(
            42 => '<p><span data-font-id="6" style="font-family: var(--font-6)">x</span></p>',
        ));
        $this->plugin()->enqueue_adobe_fonts();

        $this->assertContains('typost-adobe-xyz', $this->enqueued);
    }

    public function test_editor_follows_nested_patterns_and_stops_on_a_cycle() {
        $this->editPostWithPatterns('<!-- wp:block {"ref":42} /-->', array(
            42 => '<!-- wp:block {"ref":43} /-->',
            43 => '<span data-font-id="5">x</span><!-- wp:block {"ref":42} /-->',
        ));
        $this->plugin()->enqueue_adobe_fonts();

        $this->assertContains('typost-adobe-abc', $this->enqueued);
    }

    public function test_editor_ignores_a_ref_that_is_not_a_pattern() {
        Functions\when('parse_blocks')->justReturn(array(
            array('blockName' => 'core/block', 'attrs' => array('ref' => 7), 'innerBlocks' => array()),
        ));
        Functions\when('get_post')->alias(function ($id = null) {
            return null === $id
                ? (object) array('ID' => 253, 'post_content' => '<!-- wp:block {"ref":7} /-->')
                : (object) array('ID' => 7, 'post_type' => 'post', 'post_content' => '<span data-font-id="6">x</span>');
        });
        $this->plugin()->enqueue_adobe_fonts();

        $this->assertNotContains('typost-adobe-xyz', $this->enqueued);
    }

    public function test_replacement_mappings_for_the_editor_are_positive_integers() {
        $plugin = $this->plugin(array(), array('16' => '29', 0 => 5, 7 => 0, 'x' => 3));
        $method = new \ReflectionMethod($plugin, 'get_replacement_mappings_for_editor');
        $method->setAccessible(true);

        $this->assertSame(array(16 => 29), $method->invoke($plugin));
    }
}

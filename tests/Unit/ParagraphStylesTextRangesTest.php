<?php
/**
 * Tests for the render-time text range engine of GREP styles (#196):
 * Typost_PS_Text_Ranges, run on WordPress's real HTML API, and the module's
 * wrap_grep() / render_block filter on top of it.
 *
 * The parser tests need TYPOST_WP_DIR (a WordPress 6.9+ checkout, see
 * tests/Support/HtmlApi.php) and are skipped without it.
 */

namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use TypographyStylist\Tests\Support\HtmlApi;
use Brain\Monkey\Functions;

class ParagraphStylesTextRangesTest extends TestCase {

    /** @var array Simulated wp_options storage */
    private $options = array();

    protected function setUp(): void {
        parent::setUp();
        if (!defined('HOUR_IN_SECONDS')) {
            define('HOUR_IN_SECONDS', 3600);
        }
        Functions\when('plugin_dir_path')->justReturn(TYPOST_PLUGIN_DIR . '/paragraph-styles/');
        Functions\when('plugin_dir_url')->justReturn('http://localhost/paragraph-styles/');
        require_once TYPOST_PLUGIN_DIR . '/paragraph-styles/paragraph-styles.php';
        Functions\when('wp_trigger_error')->justReturn(null);
        Functions\when('_doing_it_wrong')->justReturn(null);
        Functions\when('get_transient')->justReturn(false);
        Functions\when('set_transient')->justReturn(true);
        $options = &$this->options;
        Functions\when('get_option')->alias(function ($key, $default = false) use (&$options) {
            return array_key_exists($key, $options) ? $options[$key] : $default;
        });
        \Typost_PS_Grep::reset();
    }

    protected function tearDown(): void {
        // Later tests run as on WordPress before 6.9, whatever this loaded
        HtmlApi::setSupported(false);
        unset($GLOBALS['shortcode_tags']);
        parent::tearDown();
    }

    private function requireParser() {
        if (!HtmlApi::load()) {
            $this->markTestSkipped('Set TYPOST_WP_DIR to a WordPress 6.9+ checkout to run the HTML API tests.');
        }
        HtmlApi::setSupported(null);
        $this->assertTrue(\Typost_PS_Text_Ranges::is_supported());
    }

    /** Wrap every match of a PCRE pattern inside `typost-ps-3` roots. */
    private function wrapPattern($html, $regex) {
        $root = function ($p) {
            return $p->has_class('typost-ps-3') ? 3 : null;
        };
        $ranges = function ($key, $plain) use ($regex) {
            preg_match_all($regex, $plain, $m, PREG_OFFSET_CAPTURE);
            $out = array();
            foreach ($m[0] as $match) {
                $out[] = array($match[1], $match[1] + strlen($match[0]), '<span class="g">');
            }
            return $out;
        };
        return \Typost_PS_Text_Ranges::wrap($html, $root, $ranges);
    }

    // ---------------------------------------------------------------------
    // Pure mapping (no parser)
    // ---------------------------------------------------------------------

    public function test_map_ranges_writes_each_covered_piece_in_its_own_node() {
        // "N" + "AS" + "A x": one range over NASA crosses three text nodes
        $segments = array(
            array(0, 1, 1, 'N'),
            array(1, 3, 3, 'AS'),
            array(3, 6, 5, 'A x'),
        );
        $out = \Typost_PS_Text_Ranges::map_ranges_to_segments($segments, array(array(0, 4, '<b>')));
        $this->assertSame(array(
            1 => '<b>N</span>',
            3 => '<b>AS</span>',
            5 => '<b>A</span> x',
        ), $out);
    }

    public function test_map_ranges_escapes_text_and_leaves_untouched_nodes_out() {
        $segments = array(
            array(0, 5, 0, 'a<b&c'),
            array(5, 8, 2, 'xyz'),
        );
        $out = \Typost_PS_Text_Ranges::map_ranges_to_segments($segments, array(array(1, 2, '<i>'), array(3, 4, '<i>')));
        $this->assertSame(array(0 => 'a<i>&lt;</span>b<i>&amp;</span>c'), $out);
    }

    public function test_escape_leaves_quotes_literal_and_keeps_the_html_apis_other_text_rules() {
        $this->assertSame('He said "it\'s" &lt;b&gt; &amp;', \Typost_PS_Text_Ranges::escape('He said "it\'s" <b> &'));
        // A decoded carriage return would otherwise read back as a line feed (WordPress 7.1's serializer)
        $this->assertSame("a&#xD;b\u{FFFD}", \Typost_PS_Text_Ranges::escape("a\rb\x00"));
    }

    public function test_map_ranges_leaves_quotes_literal() {
        $out = \Typost_PS_Text_Ranges::map_ranges_to_segments(array(array(0, 13, 0, '"NASA" isn\'t ')), array(array(1, 5, '<i>')));
        $this->assertSame(array(0 => '"<i>NASA</span>" isn\'t '), $out);
    }

    public function test_a_quote_right_after_a_wrapper_is_curled_with_the_text_before_it() {
        // wptexturize() reads each text between tags on its own, so it reads this quote as an opening one
        Functions\when('wptexturize')->alias(function ($text) {
            return strtr($text, array(
                "x's" => 'x&#8217;s',
                "1's" => '1&#8217;s',
                "x' " => 'x&#8217; ',
                "1' " => '1&#8242; ',
                'x" ' => 'x&#8221; ',
                '1" ' => '1&#8243; ',
            ));
        });
        $map = function ($text) {
            $at = strpos($text, 'NASA');
            return \Typost_PS_Text_Ranges::map_ranges_to_segments(array(array(0, strlen($text), 0, $text)), array(array($at, $at + 4, '<i>')))[0];
        };

        // Not in the_content's filters: nothing will curl the other quotes, so this one stays literal
        $this->assertSame('<i>NASA</span>\'s', $map('NASA\'s'));

        Functions\when('has_filter')->justReturn(10);
        $this->assertSame('<i>NASA</span>&#8217;s team', $map('NASA\'s team'));
        $this->assertSame('He said "<i>NASA</span>&#8221;.', $map('He said "NASA".'));
        $this->assertSame('<i>NASA</span>&#8217;', $map('NASA\''));
        $this->assertSame('<i>NASA</span> it\'s', $map('NASA it\'s'), 'only the quote that touches the wrapper');

        $digit = \Typost_PS_Text_Ranges::map_ranges_to_segments(array(array(0, 8, 0, '6\' and 7')), array(array(0, 1, '<i>')));
        $this->assertSame(array(0 => '<i>6</span>&#8242; and 7'), $digit);

        // A match that ends in an opening character leaves the next quote an opening quote
        $open = \Typost_PS_Text_Ranges::map_ranges_to_segments(array(array(0, 5, 0, '( "a"')), array(array(0, 2, '<i>')));
        $this->assertSame(array(0 => '<i>( </span>"a"'), $open);

        // Two wrappers side by side (nested rules follow each other): the same quote, inside the second
        $adjacent = \Typost_PS_Text_Ranges::map_ranges_to_segments(array(array(0, 13, 0, 'O\'Brien spoke')), array(array(0, 1, '<i>'), array(1, 8, '<b>')));
        $this->assertSame(array(0 => '<i>O</span><b>&#8217;Brien </span>spoke'), $adjacent);
        // The first wrapper of a node is not after anything
        $first = \Typost_PS_Text_Ranges::map_ranges_to_segments(array(array(0, 6, 0, '\'a b c')), array(array(0, 2, '<i>')));
        $this->assertSame(array(0 => '<i>\'a</span> b c'), $first);
    }

    public function test_without_the_html_api_the_html_comes_back_unchanged() {
        HtmlApi::setSupported(false);
        $html = '<p class="typost-styled typost-ps-3">NASA</p>';
        $this->assertSame($html, $this->wrapPattern($html, '/NASA/'));
    }

    // ---------------------------------------------------------------------
    // Real parser
    // ---------------------------------------------------------------------

    public function test_a_match_across_an_inline_element_is_wrapped_piece_by_piece() {
        $this->requireParser();
        $out = $this->wrapPattern('<p class="typost-ps-3">N<em>AS</em>A rocks</p>', '/NASA/');
        $this->assertSame('<p class="typost-ps-3"><span class="g">N</span><em><span class="g">AS</span></em><span class="g">A</span> rocks</p>', $out);
    }

    public function test_a_pattern_never_matches_inside_a_tag_or_an_attribute() {
        $this->requireParser();
        $html = '<p class="typost-ps-3"><a href="/NASA" title="NASA">go</a> <img alt="NASA" src="x.png"></p>';
        $this->assertSame($html, $this->wrapPattern($html, '/NASA/'));
        $this->assertSame($html, $this->wrapPattern($html, '/href|title|alt|class|typost/'));
    }

    public function test_text_inside_a_link_is_wrapped_inside_the_link() {
        $this->requireParser();
        $out = $this->wrapPattern('<p class="typost-ps-3"><a href="/NASA">NASA</a></p>', '/NASA/');
        $this->assertSame('<p class="typost-ps-3"><a href="/NASA"><span class="g">NASA</span></a></p>', $out);
    }

    public function test_no_match_returns_the_original_bytes() {
        $this->requireParser();
        // Single-quoted attribute, upper-case tag: normalized only when wrapped
        $html = "<P class='typost-ps-3'>nothing here</P>";
        $this->assertSame($html, $this->wrapPattern($html, '/NASA/'));
    }

    public function test_entities_are_matched_as_text_and_written_escaped() {
        $this->requireParser();
        $out = $this->wrapPattern('<p class="typost-ps-3">R&amp;D &lt;3</p>', '/&|</');
        $this->assertSame('<p class="typost-ps-3">R<span class="g">&amp;</span>D <span class="g">&lt;</span>3</p>', $out);
    }

    public function test_quotes_in_every_text_node_stay_literal_for_wptexturize() {
        $this->requireParser();
        // the_content runs do_blocks at 9 and wptexturize at 10, and wptexturize does not read &apos; or &quot;
        $out = $this->wrapPattern(
            '<div><h2>It\'s "here"</h2><p class="typost-ps-3" title="it\'s">He said "NASA isn\'t" <em>"go"</em></p></div>',
            '/NASA/'
        );
        $this->assertSame(
            '<div><h2>It\'s "here"</h2><p class="typost-ps-3" title="it&apos;s">He said "<span class="g">NASA</span> isn\'t" <em>"go"</em></p></div>',
            $out
        );
    }

    public function test_an_unterminated_trailing_token_returns_the_original_bytes() {
        $this->requireParser();
        foreach (array(
            '<p class="typost-ps-3">NASA</p><a href="x',
            '<p class="typost-ps-3">NASA <a href="x',
            '<p class="typost-ps-3">NASA <!-- not closed',
        ) as $html) {
            $this->assertSame($html, $this->wrapPattern($html, '/NASA/'), $html);
        }
    }

    public function test_code_and_line_breaks_separate_the_text() {
        $this->requireParser();
        // A match cannot join the text around <code> or skip into it
        $out = $this->wrapPattern('<p class="typost-ps-3">AB<code>CD</code>EF<br>GH</p>', '/[A-Z]{2,}/');
        $this->assertSame('<p class="typost-ps-3"><span class="g">AB</span><code>CD</code><span class="g">EF</span><br><span class="g">GH</span></p>', $out);

        $joined = $this->wrapPattern('<p class="typost-ps-3">AB<br>CD</p>', '/AB\nCD/');
        $this->assertSame('<p class="typost-ps-3"><span class="g">AB</span><br><span class="g">CD</span></p>', $joined);
    }

    public function test_text_outside_a_root_is_never_touched() {
        $this->requireParser();
        $html = '<div><p>NASA</p><p class="typost-ps-3">NASA</p><p>NASA</p></div>';
        $this->assertSame('<div><p>NASA</p><p class="typost-ps-3"><span class="g">NASA</span></p><p>NASA</p></div>', $this->wrapPattern($html, '/NASA/'));
    }

    // ---------------------------------------------------------------------
    // GREP on blocks
    // ---------------------------------------------------------------------

    private function acronymRules() {
        return array('3' => array(array('pattern' => 'acronyms', 'styleId' => 9)));
    }

    public function test_core_block_matches_get_the_style_span() {
        $this->requireParser();
        $out = \Typost_Paragraph_Styles::wrap_grep('<p class="typost-styled typost-ps-3">The NASA team</p>', $this->acronymRules(), array(9 => true));
        $this->assertSame('<p class="typost-styled typost-ps-3">The <span class="typost-styled typost-grep" data-style-id="9">NASA</span> team</p>', $out);
    }

    public function test_the_screen_reader_copy_of_the_block_does_not_change() {
        $this->requireParser();
        $html = '<div class="wp-block-typost"><h2 class="visually-hidden">The NASA team</h2>'
            . '<h2 class="typost-styled typost-ps-3" aria-hidden="true" data-style-id="3">The NASA team</h2></div>';
        $out = \Typost_Paragraph_Styles::wrap_grep($html, $this->acronymRules(), array(9 => true));
        $this->assertStringStartsWith('<div class="wp-block-typost"><h2 class="visually-hidden">The NASA team</h2>', $out);
        $this->assertStringContainsString('aria-hidden="true" data-style-id="3">The <span class="typost-styled typost-grep" data-style-id="9">NASA</span> team</h2>', $out);
    }

    public function test_fit_to_width_text_and_unstyled_previews_are_left_alone() {
        $this->requireParser();
        $fit = '<h2 class="typost-styled typost-fit typost-ps-3">NASA</h2>';
        $this->assertSame($fit, \Typost_Paragraph_Styles::wrap_grep($fit, $this->acronymRules(), array(9 => true)));

        // Without typost-styled only the admin preview (require_styled false) matches
        $sample = '<p class="typost-ps-preview-sample typost-ps-3">NASA</p>';
        $this->assertSame($sample, \Typost_Paragraph_Styles::wrap_grep($sample, $this->acronymRules(), array(9 => true)));
        $this->assertStringContainsString('data-style-id="9">NASA</span>', \Typost_Paragraph_Styles::wrap_grep($sample, $this->acronymRules(), array(9 => true), false));
    }

    public function test_a_rule_whose_style_was_deleted_does_nothing() {
        $this->requireParser();
        $html = '<p class="typost-styled typost-ps-3">NASA</p>';
        $this->assertSame($html, \Typost_Paragraph_Styles::wrap_grep($html, $this->acronymRules(), array(3 => true)));
    }

    public function test_a_slow_custom_pattern_fails_open_and_other_rules_still_run() {
        $this->requireParser();
        // Stored without validation (an old or hand-edited option)
        $rules = array('3' => array(
            array('pattern' => 'custom', 'regex' => '(a|aa)+$', 'styleId' => 8),
            array('pattern' => 'acronyms', 'styleId' => 9),
        ));
        $html = '<p class="typost-styled typost-ps-3">' . str_repeat('a', 40) . '! NASA</p>';
        $out = \Typost_Paragraph_Styles::wrap_grep($html, $rules, array(8 => true, 9 => true));
        $this->assertStringNotContainsString('data-style-id="8"', $out);
        $this->assertStringContainsString('data-style-id="9">NASA</span>', $out);
    }

    /** Register shortcodes through a stand-in for core's regex (the shape do_shortcode() matches). */
    private function registerShortcodes(array $tags) {
        $GLOBALS['shortcode_tags'] = array_fill_keys($tags, '__return_empty_string');
        Functions\when('get_shortcode_regex')->justReturn('\[(\[?)(' . implode('|', $tags) . ')(?![\w-])[^\]]*\](\]?)');
    }

    public function test_a_block_with_a_registered_shortcode_is_left_for_do_shortcode() {
        $this->requireParser();
        $this->registerShortcodes(array('foo'));
        $wrap = function ($html) {
            return \Typost_Paragraph_Styles::wrap_grep($html, $this->acronymRules(), array(9 => true));
        };

        // Patterns must not match inside it, and its quotes must survive
        foreach (array(
            '<p class="typost-styled typost-ps-3">[foo id="NASA"] and NASA</p>',
            '<p class="typost-styled typost-ps-3">[[foo]] and NASA</p>',
            // Written back decoded, this text would become a real shortcode
            '<p class="typost-styled typost-ps-3">&#91;foo&#93; and NASA</p>',
            '<p class="typost-styled typost-ps-3">&lsqb;foo&rsqb; and NASA</p>',
        ) as $html) {
            $this->assertSame($html, $wrap($html), $html);
        }

        // Control: brackets that are not a registered shortcode do not stop the rules
        $this->assertStringContainsString('data-style-id="9">NASA</span>', $wrap('<p class="typost-styled typost-ps-3">[sic] and NASA</p>'));
        $this->assertStringContainsString('data-style-id="9">NASA</span>', $wrap('<p class="typost-styled typost-ps-3">[foobar] and NASA</p>'));
    }

    public function test_with_no_shortcodes_registered_brackets_do_not_stop_the_rules() {
        $this->requireParser();
        // The core regex with no tag names would match any "[ "
        Functions\when('get_shortcode_regex')->justReturn('\[(\[?)()(?![\w-])[^\]]*\](\]?)');
        $GLOBALS['shortcode_tags'] = array();
        $out = \Typost_Paragraph_Styles::wrap_grep('<p class="typost-styled typost-ps-3">[ ] and NASA</p>', $this->acronymRules(), array(9 => true));
        $this->assertStringContainsString('data-style-id="9">NASA</span>', $out);
    }

    public function test_the_gate_reads_the_blocks_style_references_against_the_rules() {
        $rules = array('3' => array(array('pattern' => 'numbers', 'styleId' => 9)), 'ps_123_456' => array(array('pattern' => 'numbers', 'styleId' => 9)));
        $this->assertTrue(\Typost_Paragraph_Styles::references_grep_rules('<p class="typost-styled typost-ps-3">1</p>', $rules));
        $this->assertTrue(\Typost_Paragraph_Styles::references_grep_rules('<p class="a typost-ps-ps_123_456 b">1</p>', $rules));
        $this->assertTrue(\Typost_Paragraph_Styles::references_grep_rules("<p class='typost-ps-7 typost-ps-3'>1</p>", $rules));
        $this->assertFalse(\Typost_Paragraph_Styles::references_grep_rules('<p class="typost-styled typost-ps-7">1</p>', $rules));
        $this->assertFalse(\Typost_Paragraph_Styles::references_grep_rules('<p class="typost-ps-33">1</p>', $rules), 'a longer id is another style');
        $this->assertFalse(\Typost_Paragraph_Styles::references_grep_rules('<p class="typost-ps-ps_123">1</p>', $rules));
        $this->assertFalse(\Typost_Paragraph_Styles::references_grep_rules('', $rules));
        $this->assertFalse(\Typost_Paragraph_Styles::references_grep_rules('<p class="typost-ps-3">1</p>', array()));
    }

    public function test_render_block_filter_finds_a_legacy_reference_and_skips_a_style_with_no_rules() {
        $this->requireParser();
        $this->options['typost_paragraph_styles'] = array(
            array('id' => 3, 'legacyId' => 'ps_123_456', 'name' => 'Body', 'properties' => array(), 'grepRules' => array(array('pattern' => 'numbers', 'styleId' => 9))),
            array('id' => 7, 'name' => 'Plain', 'properties' => array()),
            array('id' => 9, 'name' => 'Figures', 'properties' => array()),
        );
        $module = (new \ReflectionClass(\Typost_Paragraph_Styles::class))->newInstanceWithoutConstructor();

        $out = $module->apply_grep_styles('<p class="typost-styled typost-ps-ps_123_456">1</p>', array('blockName' => 'core/paragraph'));
        $this->assertSame('<p class="typost-styled typost-ps-ps_123_456"><span class="typost-styled typost-grep" data-style-id="9">1</span></p>', $out);

        $plain = '<p class="typost-styled typost-ps-7">1</p>';
        $this->assertSame($plain, $module->apply_grep_styles($plain, array('blockName' => 'core/paragraph')));
    }

    public function test_render_block_filter_runs_only_for_styled_blocks_with_rules() {
        $this->requireParser();
        $this->options['typost_paragraph_styles'] = array(
            array('id' => 3, 'name' => 'Body', 'properties' => array(), 'grepRules' => array(array('pattern' => 'fractions', 'styleId' => 9))),
            array('id' => 9, 'name' => 'Fraction', 'properties' => array('features' => array('frac'))),
        );
        $module = (new \ReflectionClass(\Typost_Paragraph_Styles::class))->newInstanceWithoutConstructor();
        $html = '<p class="typost-styled typost-ps-3">Add 1/2 cup on 9/22/2026.</p>';

        $out = $module->apply_grep_styles($html, array('blockName' => 'core/paragraph'));
        $this->assertSame('<p class="typost-styled typost-ps-3">Add <span class="typost-styled typost-grep" data-style-id="9">1/2</span> cup on 9/22/2026.</p>', $out);
        // Other blocks and unstyled content pass through
        $this->assertSame($html, $module->apply_grep_styles($html, array('blockName' => 'core/list-item')));
        $this->assertSame('<p>1/2</p>', $module->apply_grep_styles('<p>1/2</p>', array('blockName' => 'core/paragraph')));
    }

    public function test_the_admin_card_names_the_font_of_a_rules_style_and_the_frontend_does_not() {
        $this->requireParser();
        Functions\when('esc_html_e')->alias(function ($text) { echo $text; });
        $styles = array(
            array('id' => 3, 'name' => 'Body', 'properties' => array('fontId' => 1), 'grepRules' => array(
                array('pattern' => 'fractions', 'styleId' => 9),
                array('pattern' => 'custom', 'regex' => 'offices', 'styleId' => 12),
                array('pattern' => 'custom', 'regex' => 'off\b', 'styleId' => 14),
            )),
            // Its font was deleted and replaced
            array('id' => 9, 'name' => 'Fraction', 'properties' => array('fontId' => 5)),
            array('id' => 12, 'name' => 'No font', 'properties' => array()),
            // Inherits its font from a parent
            array('id' => 13, 'name' => 'Parent', 'properties' => array('fontId' => 8)),
            array('id' => 14, 'name' => 'Child', 'basedOn' => 13, 'properties' => array()),
        );
        $context = array('lookup' => array(1 => 'Body font', 6 => 'Kit', 8 => 'Parent font'), 'mappings' => array(5 => 6), 'manual_ids' => array());
        $preview = \Typost_Paragraph_Styles::render_admin_card_parts($styles[0], $styles, $context)['preview'];

        $this->assertStringContainsString('<span class="typost-styled typost-grep" data-style-id="9" data-typost-font-id="6">1/2</span>', $preview);
        $this->assertStringContainsString('<span class="typost-styled typost-grep" data-style-id="12">offices</span>', $preview);
        $this->assertStringContainsString('<span class="typost-styled typost-grep" data-style-id="14" data-typost-font-id="8">off</span>', $preview);

        // The frontend path writes no loader attribute
        $front = \Typost_Paragraph_Styles::wrap_grep('<p class="typost-styled typost-ps-3">1/2</p>', array('3' => $styles[0]['grepRules']), array(9 => true));
        $this->assertSame('<p class="typost-styled typost-ps-3"><span class="typost-styled typost-grep" data-style-id="9">1/2</span></p>', $front);
    }

    public function test_the_admin_card_lists_the_rules_and_previews_them_through_the_engine() {
        $this->requireParser();
        Functions\when('esc_html_e')->alias(function ($text) { echo $text; });
        $styles = array(
            array('id' => 3, 'name' => 'Body', 'properties' => array(), 'grepRules' => array(
                array('pattern' => 'fractions', 'styleId' => 9),
                array('pattern' => 'custom', 'regex' => 'Th', 'styleId' => 12),
            )),
            array('id' => 9, 'name' => 'Fraction', 'properties' => array('features' => array('frac'))),
        );
        $context = array('lookup' => array(), 'mappings' => array(), 'manual_ids' => array());
        $parts = \Typost_Paragraph_Styles::render_admin_card_parts($styles[0], $styles, $context);

        $this->assertStringContainsString('<strong>GREP styles:</strong> Fractions (1/2, not dates) → Fraction; Custom (Th) → A deleted style', $parts['details']);
        // The sample's "1/2" renders in the Fraction style; the deleted style's rule does nothing
        $this->assertStringContainsString('offices, <span class="typost-styled typost-grep" data-style-id="9">1/2</span> off', $parts['preview']);
        $this->assertStringNotContainsString('data-style-id="12"', $parts['preview']);

        // Below WordPress 6.9 the card shows neither
        HtmlApi::setSupported(false);
        $old = \Typost_Paragraph_Styles::render_admin_card_parts($styles[0], $styles, $context);
        $this->assertStringNotContainsString('GREP', $old['details']);
        $this->assertStringNotContainsString('typost-grep', $old['preview']);
    }
}

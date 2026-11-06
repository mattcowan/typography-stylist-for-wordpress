<?php
/**
 * Tests for nested styles (#195): counting words, characters and markers,
 * sanitizing, the render filter on the real HTML API (with GREP after it),
 * the First line CSS, the REST routes, fonts, and the admin card.
 *
 * The parser tests need TYPOST_WP_DIR (a WordPress 6.9+ checkout, see
 * tests/Support/HtmlApi.php) and are skipped without it.
 */

namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use TypographyStylist\Tests\Support\HtmlApi;
use Brain\Monkey\Functions;

class ParagraphStylesNestedTest extends TestCase {

    /** @var array Simulated wp_options storage */
    private $options = array();

    /** @var object|null Typost singleton replaced for the test */
    private $savedTypost = null;

    protected function setUp(): void {
        parent::setUp();
        if (!defined('HOUR_IN_SECONDS')) {
            define('HOUR_IN_SECONDS', 3600);
        }
        Functions\when('plugin_dir_path')->justReturn(TYPOST_PLUGIN_DIR . '/paragraph-styles/');
        Functions\when('plugin_dir_url')->justReturn('http://localhost/paragraph-styles/');
        require_once TYPOST_PLUGIN_DIR . '/paragraph-styles/paragraph-styles.php';

        Functions\when('absint')->alias(function ($v) { return abs((int) $v); });
        Functions\when('current_time')->justReturn('2026-11-06');
        Functions\when('get_transient')->justReturn(false);
        Functions\when('set_transient')->justReturn(true);
        Functions\when('delete_transient')->justReturn(true);
        Functions\when('current_user_can')->justReturn(true);
        Functions\when('wp_trigger_error')->justReturn(null);
        Functions\when('_doing_it_wrong')->justReturn(null);
        Functions\when('_n')->alias(function ($single, $plural, $number) { return 1 === $number ? $single : $plural; });

        $options = &$this->options;
        Functions\when('get_option')->alias(function ($key, $default = false) use (&$options) {
            return array_key_exists($key, $options) ? $options[$key] : $default;
        });
        Functions\when('update_option')->alias(function ($key, $value) use (&$options) {
            $options[$key] = $value;
            return true;
        });

        if (class_exists('Typost')) {
            $property = (new \ReflectionClass(\Typost::class))->getProperty('instance');
            $property->setAccessible(true);
            $this->savedTypost = $property->getValue();
            $property->setValue(null, new class {
                public function clear_font_detection_cache() {}
            });
        }
    }

    protected function tearDown(): void {
        if (class_exists('Typost')) {
            $property = (new \ReflectionClass(\Typost::class))->getProperty('instance');
            $property->setAccessible(true);
            $property->setValue(null, $this->savedTypost);
        }
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

    private function module(array $styles) {
        $this->options['typost_paragraph_styles'] = $styles;
        $this->options['typost_paragraph_styles_next_id'] = 20;
        return (new \ReflectionClass(\Typost_Paragraph_Styles::class))->newInstanceWithoutConstructor();
    }

    private function request(array $params, $id = null) {
        return new class($params, $id) implements \ArrayAccess {
            private $params;
            private $id;
            public function __construct($params, $id) { $this->params = $params; $this->id = $id; }
            public function get_param($key) { return array_key_exists($key, $this->params) ? $this->params[$key] : null; }
            public function has_param($key) { return array_key_exists($key, $this->params); }
            #[\ReturnTypeWillChange]
            public function offsetGet($key) { return 'id' === $key ? $this->id : null; }
            public function offsetExists($key): bool { return 'id' === $key; }
            public function offsetSet($key, $value): void {}
            public function offsetUnset($key): void {}
        };
    }

    private function stored($id) {
        foreach ($this->options['typost_paragraph_styles'] as $style) {
            if ($style['id'] === $id) {
                return $style;
            }
        }
        return null;
    }

    /** The texts each rule covers, as "style:text". */
    private function covered($plain, array $rules) {
        $ranges = \Typost_PS_Nested::find_ranges($plain, $rules, function ($id) {
            return 99 === $id ? '' : (string) $id;
        });
        return array_map(function ($range) use ($plain) {
            return $range[2] . ':' . substr($plain, $range[0], $range[1] - $range[0]);
        }, $ranges);
    }

    private function styles() {
        return array(
            array('id' => 1, 'name' => 'Step', 'properties' => array('features' => array('onum'))),
            array('id' => 2, 'name' => 'Bold', 'properties' => array('fontWeight' => '700')),
            array('id' => 3, 'name' => 'Small caps', 'properties' => array('features' => array('c2sc'), 'fontId' => 8)),
        );
    }

    // ---------------------------------------------------------------------
    // Counting
    // ---------------------------------------------------------------------

    public function test_the_issue_example_styles_the_label_then_the_next_three_words() {
        $rules = array(
            array('styleId' => 2, 'unit' => 'marker', 'count' => 1, 'marker' => ':', 'end' => 'through'),
            array('styleId' => 3, 'unit' => 'words', 'count' => 3, 'end' => 'upto'),
        );
        $this->assertSame(array('2:Step 1:', '3:Whisk the eggs'), $this->covered('Step 1: Whisk the eggs until pale.', $rules));
    }

    public function test_words_through_takes_the_spaces_after_the_last_word() {
        $through = array(array('styleId' => 2, 'unit' => 'words', 'count' => 2, 'end' => 'through'));
        $upto = array(array('styleId' => 2, 'unit' => 'words', 'count' => 2, 'end' => 'upto'));
        $this->assertSame(array('2:One two  '), $this->covered('One two  three', $through));
        $this->assertSame(array('2:One two'), $this->covered('One two  three', $upto));
        // Punctuation belongs to its word; a line break separates words
        $this->assertSame(array('2:Yes, no'), $this->covered("Yes, no\nmaybe", $upto));
    }

    public function test_an_image_separates_words() {
        $rule = array(array('styleId' => 2, 'unit' => 'words', 'count' => 1, 'end' => 'upto'));
        $this->assertSame(array('2:A'), $this->covered("A\u{FFFC}B C", $rule));
    }

    public function test_characters_count_user_perceived_characters_and_inner_spaces() {
        $rule = function ($count) {
            return array(array('styleId' => 2, 'unit' => 'characters', 'count' => $count));
        };
        $this->assertSame(array('2:Q'), $this->covered('Q: why?', $rule(1)));
        $this->assertSame(array('2:Q: w'), $this->covered('Q: why?', $rule(4)));
        // e + combining acute is one character; a flag is one character
        $this->assertSame(array("2:e\u{0301}t"), $this->covered("e\u{0301}té", $rule(2)));
        $this->assertSame(array("2:\u{1F1EB}\u{1F1F7}"), $this->covered("\u{1F1EB}\u{1F1F7} France", $rule(1)));
    }

    public function test_a_marker_rule_runs_to_the_nth_marker() {
        $through = array(array('styleId' => 2, 'unit' => 'marker', 'count' => 2, 'marker' => '—', 'end' => 'through'));
        $upto = array(array('styleId' => 2, 'unit' => 'marker', 'count' => 2, 'marker' => '—', 'end' => 'upto'));
        $this->assertSame(array('2:a—b—'), $this->covered('a—b—c', $through));
        $this->assertSame(array('2:a—b'), $this->covered('a—b—c', $upto));
        // Up to: the next rule starts at the marker itself
        $next = array_merge(
            array(array('styleId' => 2, 'unit' => 'marker', 'count' => 1, 'marker' => ':', 'end' => 'upto')),
            array(array('styleId' => 3, 'unit' => 'characters', 'count' => 1))
        );
        $this->assertSame(array('2:Q', '3::'), $this->covered('Q: x', $next));
    }

    public function test_text_shorter_than_the_count_stops_the_rule_at_the_end() {
        $rules = array(
            array('styleId' => 2, 'unit' => 'words', 'count' => 5, 'end' => 'through'),
            array('styleId' => 3, 'unit' => 'words', 'count' => 1, 'end' => 'through'),
        );
        $this->assertSame(array('2:Only two'), $this->covered('Only two', $rules));
        // A marker that is not there runs to the end
        $this->assertSame(array('2:No colon here'), $this->covered('No colon here', array(array('styleId' => 2, 'unit' => 'marker', 'count' => 1, 'marker' => ':', 'end' => 'upto'))));
        $this->assertSame(array('2:ab'), $this->covered('ab', array(array('styleId' => 2, 'unit' => 'characters', 'count' => 9))));
    }

    public function test_each_rule_starts_at_its_first_character_that_is_not_a_space() {
        $rules = array(
            array('styleId' => 2, 'unit' => 'marker', 'count' => 1, 'marker' => ':', 'end' => 'through'),
            array('styleId' => 3, 'unit' => 'characters', 'count' => 3),
        );
        $this->assertSame(array('2:Step 1:', '3:Mix'), $this->covered("  Step 1: \n Mix well", $rules));
    }

    public function test_a_deleted_style_keeps_its_text_and_first_line_stops_the_count() {
        $rules = array(
            array('styleId' => 99, 'unit' => 'words', 'count' => 1, 'end' => 'through'),
            array('styleId' => 3, 'unit' => 'words', 'count' => 1, 'end' => 'upto'),
            array('styleId' => 2, 'unit' => 'line'),
        );
        $this->assertSame(array('3:two'), $this->covered('one two three', $rules));
        $this->assertSame(array(), $this->covered('one', array(array('styleId' => 2, 'unit' => 'line'))));
        $this->assertSame(2, \Typost_PS_Nested::line_style_id($rules));
        $this->assertFalse(\Typost_PS_Nested::has_text_rules(array(array('styleId' => 2, 'unit' => 'line'))));
        $this->assertSame(array(99, 3), \Typost_PS_Nested::target_style_ids($rules, true));
    }

    public function test_the_shared_fixture_matches_the_javascript_twin() {
        // paragraph-styles/__tests__/nested-preview.test.js reads the same file
        $cases = json_decode(file_get_contents(TYPOST_PLUGIN_DIR . '/paragraph-styles/__tests__/fixtures/nested-rule-ranges.json'), true);
        $this->assertNotEmpty($cases);
        foreach ($cases as $case) {
            $expected = array_map(function ($pair) {
                return $pair[0] . ':' . $pair[1];
            }, $case['covered']);
            $this->assertSame($expected, $this->covered($case['plain'], $case['rules']), $case['name']);
        }
    }

    // ---------------------------------------------------------------------
    // Sanitizing
    // ---------------------------------------------------------------------

    public function test_sanitize_normalizes_each_unit() {
        $result = \Typost_PS_Nested::sanitize_rules(array(
            array('styleId' => '2', 'unit' => 'words', 'count' => '3', 'end' => 'upto', 'marker' => ':', 'extra' => 1),
            array('styleId' => 3, 'unit' => 'characters', 'count' => 1, 'end' => 'upto'),
            array('styleId' => 2, 'unit' => 'marker', 'count' => 1, 'marker' => '—'),
            array('styleId' => 3, 'unit' => 'line', 'count' => 4),
        ), array('own_id' => 1, 'style_ids' => array(1, 2, 3)));
        $this->assertSame('', $result['error']);
        $this->assertSame(array(
            array('styleId' => 2, 'unit' => 'words', 'count' => 3, 'end' => 'upto'),
            array('styleId' => 3, 'unit' => 'characters', 'count' => 1),
            array('styleId' => 2, 'unit' => 'marker', 'count' => 1, 'marker' => '—', 'end' => 'through'),
            array('styleId' => 3, 'unit' => 'line'),
        ), $result['rules']);
    }

    public function sanitizeFailures() {
        $ok = array('styleId' => 2, 'unit' => 'words', 'count' => 1, 'end' => 'through');
        return array(
            'not a list'         => array(array('a' => $ok), -1, ''),
            'too many'           => array(array_fill(0, 11, $ok), -1, ''),
            'unknown style'      => array(array($ok, array_merge($ok, array('styleId' => 7))), 1, 'styleId'),
            'own style'          => array(array(array_merge($ok, array('styleId' => 1))), 0, 'styleId'),
            'unknown unit'       => array(array(array_merge($ok, array('unit' => 'lines'))), 0, 'unit'),
            'zero count'         => array(array(array_merge($ok, array('count' => 0))), 0, 'count'),
            'big count'          => array(array(array_merge($ok, array('count' => 101))), 0, 'count'),
            'fraction count'     => array(array(array_merge($ok, array('count' => 1.5))), 0, 'count'),
            'bad end'            => array(array(array_merge($ok, array('end' => 'until'))), 0, 'end'),
            'empty marker'       => array(array(array('styleId' => 2, 'unit' => 'marker', 'count' => 1, 'marker' => '')), 0, 'marker'),
            'two characters'     => array(array(array('styleId' => 2, 'unit' => 'marker', 'count' => 1, 'marker' => '::')), 0, 'marker'),
            'control character'  => array(array(array('styleId' => 2, 'unit' => 'marker', 'count' => 1, 'marker' => "\t")), 0, 'marker'),
            'object mark'        => array(array(array('styleId' => 2, 'unit' => 'marker', 'count' => 1, 'marker' => "\u{FFFC}")), 0, 'marker'),
            'line not last'      => array(array(array('styleId' => 2, 'unit' => 'line'), $ok), 0, 'unit'),
        );
    }

    /** @dataProvider sanitizeFailures */
    public function test_sanitize_rejects_the_whole_list($raw, $index, $field) {
        $result = \Typost_PS_Nested::sanitize_rules($raw, array('own_id' => 1, 'style_ids' => array(1, 2, 3)));
        $this->assertNotSame('', $result['error']);
        $this->assertSame(array(), $result['rules']);
        $this->assertSame(array($index, $field), array($result['index'], $result['field']));
    }

    public function test_a_marker_can_be_any_one_character() {
        foreach (array(':', '—', '?', '¿', "\u{1F44D}", "e\u{0301}", ' ', '"') as $marker) {
            $this->assertSame('', \Typost_PS_Nested::validate_marker($marker), $marker);
        }
    }

    public function test_rule_labels() {
        $this->assertSame('Through 1 “:”', \Typost_PS_Nested::rule_label(array('unit' => 'marker', 'count' => 1, 'marker' => ':', 'end' => 'through')));
        $this->assertSame('Up to 3 words', \Typost_PS_Nested::rule_label(array('unit' => 'words', 'count' => 3, 'end' => 'upto')));
        $this->assertSame('Through 1 word', \Typost_PS_Nested::rule_label(array('unit' => 'words', 'count' => 1, 'end' => 'through')));
        $this->assertSame('2 characters', \Typost_PS_Nested::rule_label(array('unit' => 'characters', 'count' => 2)));
        $this->assertSame('First line', \Typost_PS_Nested::rule_label(array('unit' => 'line')));
    }

    // ---------------------------------------------------------------------
    // Rendering
    // ---------------------------------------------------------------------

    public function test_wrap_nested_crosses_inline_elements_and_leaves_the_screen_reader_copy() {
        $this->requireParser();
        $rules = array('1' => array(
            array('styleId' => 2, 'unit' => 'marker', 'count' => 1, 'marker' => ':', 'end' => 'through'),
            array('styleId' => 3, 'unit' => 'words', 'count' => 2, 'end' => 'upto'),
        ));
        $html = '<div class="wp-block-typost"><h2 class="screen-reader-text">Step <em>1</em>: Mix it well</h2>'
            . '<h2 class="typost-styled typost-ps-1" aria-hidden="true">Step <em>1</em>: Mix it well</h2></div>';
        $out = \Typost_Paragraph_Styles::wrap_nested($html, $rules, array(2 => true, 3 => true));
        $this->assertSame(
            '<div class="wp-block-typost"><h2 class="screen-reader-text">Step <em>1</em>: Mix it well</h2>'
            . '<h2 class="typost-styled typost-ps-1" aria-hidden="true"><span class="typost-styled typost-nested" data-style-id="2">Step </span>'
            . '<em><span class="typost-styled typost-nested" data-style-id="2">1</span></em><span class="typost-styled typost-nested" data-style-id="2">:</span> '
            . '<span class="typost-styled typost-nested" data-style-id="3">Mix it</span> well</h2></div>',
            $out
        );
        // Fit-to-width text and a fragment without the classes are left alone
        $fit = '<h2 class="typost-styled typost-ps-1 typost-fit">Step 1: go</h2>';
        $this->assertSame($fit, \Typost_Paragraph_Styles::wrap_nested($fit, $rules, array(2 => true, 3 => true)));
    }

    public function test_render_filters_run_nested_then_grep_inside_it() {
        $this->requireParser();
        $module = $this->module(array(
            array('id' => 1, 'name' => 'Step', 'properties' => array(),
                'nestedRules' => array(array('styleId' => 2, 'unit' => 'words', 'count' => 2, 'end' => 'through')),
                'grepRules' => array(array('pattern' => 'numbers', 'styleId' => 3))),
            array('id' => 2, 'name' => 'Bold', 'properties' => array('fontWeight' => '700')),
            array('id' => 3, 'name' => 'Figures', 'properties' => array()),
            array('id' => 4, 'name' => 'Line only', 'properties' => array(), 'nestedRules' => array(array('styleId' => 2, 'unit' => 'line'))),
        ));
        $block = array('blockName' => 'core/paragraph');
        $html = '<p class="typost-styled typost-ps-1">Step 12 mix 3 eggs</p>';
        $out = $module->apply_grep_styles($module->apply_nested_styles($html, $block), $block);
        $this->assertSame(
            '<p class="typost-styled typost-ps-1"><span class="typost-styled typost-nested" data-style-id="2">Step '
            . '<span class="typost-styled typost-grep" data-style-id="3">12</span> </span>'
            . 'mix <span class="typost-styled typost-grep" data-style-id="3">3</span> eggs</p>',
            $out
        );
        // A style with only a First line rule is not parsed; other blocks pass through
        $line = '<p class="typost-styled typost-ps-4">Step 12</p>';
        $this->assertSame($line, $module->apply_nested_styles($line, $block));
        $this->assertSame($html, $module->apply_nested_styles($html, array('blockName' => 'core/list-item')));

        // Below WordPress 6.9 nothing changes
        HtmlApi::setSupported(false);
        $this->assertSame($html, $module->apply_nested_styles($html, $block));
    }

    // ---------------------------------------------------------------------
    // CSS and fonts
    // ---------------------------------------------------------------------

    public function test_nested_css_combines_features_and_writes_the_first_line_rule() {
        HtmlApi::setSupported(true);
        $styles = $this->styles();
        $styles[0]['legacyId'] = 'ps_1_2';
        $styles[0]['nestedRules'] = array(
            array('styleId' => 3, 'unit' => 'words', 'count' => 1, 'end' => 'through'),
            array('styleId' => 4, 'unit' => 'line'),
        );
        $styles[] = array('id' => 4, 'name' => 'Lead', 'properties' => array(
            'fontId' => 8, 'features' => array('smcp'), 'letterSpacing' => 50, 'initialHang' => 0.2, 'textWrap' => 'balance', 'alignment' => 'center', 'textCase' => 'uppercase',
        ));
        $css = \Typost_Paragraph_Styles::nested_css($styles[0], $styles);
        $this->assertSame(
            ".typost-ps-1 .typost-nested.typost-nested.typost-nested[data-style-id=\"3\"][data-style-id][data-style-id][data-style-id],\n"
            . ".typost-ps-ps_1_2 .typost-nested.typost-nested.typost-nested[data-style-id=\"3\"][data-style-id][data-style-id][data-style-id] {\n"
            . "    font-feature-settings: \"onum\" 1, \"c2sc\" 1;\n}\n\n"
            . ".typost-ps-1:not(.typost-fit)::first-line,\n.typost-ps-ps_1_2:not(.typost-fit)::first-line {\n"
            . "    font-family: var(--font-8);\n    font-feature-settings: \"onum\" 1, \"smcp\" 1;\n    letter-spacing: 0.05em;\n"
            . "    text-transform: uppercase;\n    font-variant-caps: normal;\n}",
            $css
        );

        // Below WordPress 6.9: nothing, First line included
        HtmlApi::setSupported(false);
        $this->assertSame('', \Typost_Paragraph_Styles::nested_css($styles[0], $styles));
    }

    public function test_first_line_features_inherit_when_the_line_style_sets_none() {
        HtmlApi::setSupported(true);
        $styles = $this->styles();
        $styles[0]['nestedRules'] = array(array('styleId' => 2, 'unit' => 'line'));
        $this->assertSame(
            ".typost-ps-1:not(.typost-fit)::first-line {\n    font-weight: 700;\n}",
            \Typost_Paragraph_Styles::nested_css($styles[0], $styles)
        );
        // A deleted line style writes nothing
        $styles[0]['nestedRules'] = array(array('styleId' => 9, 'unit' => 'line'));
        $this->assertSame('', \Typost_Paragraph_Styles::nested_css($styles[0], $styles));
    }

    public function test_a_first_line_takes_no_hyphenation_from_its_style() {
        HtmlApi::setSupported(true);
        $styles = $this->styles();
        $styles[0]['nestedRules'] = array(array('styleId' => 4, 'unit' => 'line'));
        $styles[] = array('id' => 4, 'name' => 'Lead', 'properties' => array('fontWeight' => '700', 'hyphens' => 'auto', 'hyphenateLimitWord' => 6, 'hyphenateCharacter' => '='));
        $this->assertSame(
            ".typost-ps-1:not(.typost-fit)::first-line {\n    font-weight: 700;\n}",
            \Typost_Paragraph_Styles::nested_css($styles[0], $styles)
        );
    }

    public function test_get_nested_css_is_the_nested_part_of_the_full_css() {
        // The editor reads it after a style changes, so a first line rule that reads the style stays current (#354)
        HtmlApi::setSupported(true);
        $styles = $this->styles();
        $styles[0]['nestedRules'] = array(array('styleId' => 2, 'unit' => 'line'));
        $module = $this->module($styles);
        $nested = $module->get_nested_css();
        $this->assertSame(".typost-ps-1:not(.typost-fit)::first-line {\n    font-weight: 700;\n}", $nested);
        $this->assertStringContainsString($nested, $module->get_all_css());

        $this->assertSame('', $this->module($this->styles())->get_nested_css());
        HtmlApi::setSupported(false);
        $this->assertSame('', $module->get_nested_css());
    }

    public function test_the_card_loads_the_font_of_a_style_only_a_first_line_rule_uses() {
        // No span carries that font, so the preview wrapper names it for the admin font loader (#354)
        $this->requireParser();
        $html = \Typost_Paragraph_Styles::render_card_preview(1, array('font_id' => 0), array(), null, array(
            'rules' => array(array('styleId' => 3, 'unit' => 'line')),
            'ids'   => array(3 => true),
            'fonts' => array(3 => 8),
        ));
        $this->assertStringContainsString('<div class="typost-ps-preview" id="typost-ps-preview-1" data-typost-font-id="8">', $html);

        // A style with no font adds nothing
        $html = \Typost_Paragraph_Styles::render_card_preview(1, array('font_id' => 0), array(), null, array(
            'rules' => array(array('styleId' => 3, 'unit' => 'line')),
            'ids'   => array(3 => true),
            'fonts' => array(),
        ));
        $this->assertStringContainsString('<div class="typost-ps-preview" id="typost-ps-preview-1">', $html);
    }

    public function test_a_first_line_with_a_transparent_fill_stays_visible_in_forced_colors() {
        HtmlApi::setSupported(true);
        $styles = $this->styles();
        $styles[0]['legacyId'] = 'ps_1_2';
        $styles[0]['nestedRules'] = array(array('styleId' => 4, 'unit' => 'line'));
        $styles[] = array('id' => 4, 'name' => 'Outline', 'properties' => array('textColor' => 'transparent', 'textStrokeWidth' => 2, 'textStrokeColor' => '#000000'));
        $css = \Typost_Paragraph_Styles::nested_css($styles[0], $styles);
        $this->assertStringContainsString(
            "@media (forced-colors: active) {\n.typost-ps-1:not(.typost-fit)::first-line,\n.typost-ps-ps_1_2:not(.typost-fit)::first-line {\n    color: CanvasText;\n    -webkit-text-stroke-color: CanvasText;\n}\n}",
            $css
        );
        // A first line with a real color needs none
        $styles[count($styles) - 1]['properties']['textColor'] = '#111111';
        $this->assertStringNotContainsString('forced-colors', \Typost_Paragraph_Styles::nested_css($styles[0], $styles));
    }

    public function test_the_style_css_itself_is_unchanged_by_the_declarations_refactor() {
        $module = $this->module($this->styles());
        $styles = $this->styles();
        $this->assertSame(
            ".typost-ps-3,\n.typost-styled.typost-ps-3.typost-ps-3.typost-ps-3.typost-ps-3.typost-ps-3,\n.typost-styled[data-style-id=\"3\"][data-style-id][data-style-id][data-style-id][data-style-id] {\n"
            . "    font-family: var(--font-8);\n    font-feature-settings: \"c2sc\" 1;\n}",
            $module->generate_style_css($styles[2], $styles)
        );
    }

    public function test_content_using_a_style_loads_the_fonts_of_its_nested_styles() {
        $styles = $this->styles();
        $styles[0]['properties']['fontId'] = 5;
        $styles[0]['nestedRules'] = array(array('styleId' => 3, 'unit' => 'line'));
        $module = $this->module($styles);
        $this->assertSame(array(5, 8), $module->font_ids_from_content(array(), '<p class="typost-styled typost-ps-1">Text</p>'));
    }

    public function test_get_all_css_adds_the_nested_rules_after_the_styles() {
        HtmlApi::setSupported(true);
        $styles = $this->styles();
        $styles[0]['nestedRules'] = array(array('styleId' => 3, 'unit' => 'line'));
        $css = $this->module($styles)->get_all_css();
        $this->assertGreaterThan(strpos($css, '.typost-ps-3,'), strpos($css, '::first-line'));
    }

    // ---------------------------------------------------------------------
    // REST
    // ---------------------------------------------------------------------

    public function test_update_stores_rules_and_a_save_without_them_keeps_them() {
        $module = $this->module($this->styles());
        $rules = array(
            array('styleId' => 2, 'unit' => 'marker', 'count' => 1, 'marker' => ':', 'end' => 'through'),
            array('styleId' => 3, 'unit' => 'line'),
        );
        $response = $module->rest_update_style($this->request(array('nestedRules' => $rules), 1));
        $this->assertSame(200, $response->get_status());
        $this->assertSame($rules, $this->stored(1)['nestedRules']);

        $module->rest_update_style($this->request(array('properties' => array('features' => array('liga'))), 1));
        $this->assertSame($rules, $this->stored(1)['nestedRules']);

        $module->rest_update_style($this->request(array('nestedRules' => array()), 1));
        $this->assertArrayNotHasKey('nestedRules', $this->stored(1));
    }

    public function test_create_and_update_reject_bad_rules_with_the_failing_field() {
        $module = $this->module($this->styles());
        $response = $module->rest_update_style($this->request(array('nestedRules' => array(
            array('styleId' => 2, 'unit' => 'words', 'count' => 2, 'end' => 'upto'),
            array('styleId' => 3, 'unit' => 'marker', 'count' => 1, 'marker' => 'ab', 'end' => 'upto'),
        )), 1));
        $this->assertSame(400, $response->get_status());
        $this->assertSame(array('nestedRules', 1, 'marker'), array($response->get_data()['field'], $response->get_data()['ruleIndex'], $response->get_data()['ruleField']));
        $this->assertArrayNotHasKey('nestedRules', $this->stored(1));

        $created = $module->rest_create_style($this->request(array('name' => 'New', 'nestedRules' => array(array('styleId' => 2, 'unit' => 'characters', 'count' => 1)))));
        $this->assertSame(201, $created->get_status());
        $this->assertSame(array(array('styleId' => 2, 'unit' => 'characters', 'count' => 1)), $created->get_data()['nestedRules']);
    }

    public function test_deleting_a_style_removes_the_nested_rules_that_apply_it() {
        $styles = $this->styles();
        $styles[0]['nestedRules'] = array(
            array('styleId' => 2, 'unit' => 'words', 'count' => 1, 'end' => 'through'),
            array('styleId' => 3, 'unit' => 'line'),
        );
        $styles[1]['nestedRules'] = array(array('styleId' => 3, 'unit' => 'characters', 'count' => 1));
        $module = $this->module($styles);

        $response = $module->rest_delete_style($this->request(array(), 3));
        $this->assertSame(array(1, 2), $response->get_data()['nestedChanged']);
        $this->assertSame(array(array('styleId' => 2, 'unit' => 'words', 'count' => 1, 'end' => 'through')), $this->stored(1)['nestedRules']);
        $this->assertArrayNotHasKey('nestedRules', $this->stored(2));
    }

    // ---------------------------------------------------------------------
    // Admin card
    // ---------------------------------------------------------------------

    public function test_the_admin_card_lists_the_rules_and_previews_them_through_the_engine() {
        $this->requireParser();
        Functions\when('esc_html_e')->alias(function ($text) { echo $text; });
        $styles = $this->styles();
        $styles[0]['nestedRules'] = array(
            array('styleId' => 3, 'unit' => 'words', 'count' => 2, 'end' => 'upto'),
            array('styleId' => 2, 'unit' => 'line'),
        );
        $context = array('lookup' => array(8 => 'Caps font'), 'mappings' => array(), 'manual_ids' => array());
        $parts = \Typost_Paragraph_Styles::render_admin_card_parts($styles[0], $styles, $context);

        $this->assertStringContainsString('<strong>Nested styles:</strong> Up to 2 words → Small caps; First line → Bold', $parts['details']);
        $this->assertMatchesRegularExpression('#<p class="typost-ps-preview-sample typost-ps-1"[^>]*><span class="typost-styled typost-nested" data-style-id="3" data-typost-font-id="8">\S+ \S+</span> #u', $parts['preview']);

        HtmlApi::setSupported(false);
        $old = \Typost_Paragraph_Styles::render_admin_card_parts($styles[0], $styles, $context);
        $this->assertStringNotContainsString('Nested', $old['details']);
        $this->assertStringNotContainsString('typost-nested', $old['preview']);
    }
}

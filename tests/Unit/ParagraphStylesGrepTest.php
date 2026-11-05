<?php
/**
 * Tests for GREP styles (#196): built-in patterns, custom pattern
 * validation (the PCRE / JavaScript subset and the match limits), rule
 * order, sanitizing with the capability split, the REST routes, the
 * feature CSS, and the fonts and CSS of the styles rules apply.
 */

namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use Brain\Monkey\Functions;

class ParagraphStylesGrepTest extends TestCase {

    /** @var array Simulated wp_options storage */
    private $options = array();

    /** @var object|null Typost singleton replaced for the test */
    private $savedTypost = null;

    /** @var bool What current_user_can( 'manage_options' ) returns */
    private $isAdmin = true;

    protected function setUp(): void {
        parent::setUp();
        if (!defined('HOUR_IN_SECONDS')) {
            define('HOUR_IN_SECONDS', 3600);
        }
        Functions\when('plugin_dir_path')->justReturn(TYPOST_PLUGIN_DIR . '/paragraph-styles/');
        Functions\when('plugin_dir_url')->justReturn('http://localhost/paragraph-styles/');
        require_once TYPOST_PLUGIN_DIR . '/paragraph-styles/paragraph-styles.php';

        Functions\when('absint')->alias(function ($v) { return abs((int) $v); });
        Functions\when('current_time')->justReturn('2026-11-04');
        Functions\when('get_transient')->justReturn(false);
        Functions\when('set_transient')->justReturn(true);
        Functions\when('delete_transient')->justReturn(true);
        $isAdmin = &$this->isAdmin;
        Functions\when('current_user_can')->alias(function ($cap) use (&$isAdmin) {
            return 'manage_options' === $cap ? $isAdmin : true;
        });

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
        \Typost_PS_Grep::reset();
    }

    protected function tearDown(): void {
        if (class_exists('Typost')) {
            $property = (new \ReflectionClass(\Typost::class))->getProperty('instance');
            $property->setAccessible(true);
            $property->setValue(null, $this->savedTypost);
        }
        parent::tearDown();
    }

    private function module(array $styles) {
        $this->options['typost_paragraph_styles'] = $styles;
        $this->options['typost_paragraph_styles_next_id'] = 20;
        return (new \ReflectionClass(\Typost_Paragraph_Styles::class))->newInstanceWithoutConstructor();
    }

    /** The texts a built-in pattern matches in a sample. */
    private function builtInMatches($name, $text) {
        $patterns = \Typost_PS_Grep::built_in_patterns();
        $out = array();
        foreach (\Typost_PS_Grep::match_all($patterns[$name], $text) as $range) {
            $out[] = substr($text, $range[0], $range[1] - $range[0]);
        }
        return $out;
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

    // ---------------------------------------------------------------------
    // Built-in patterns
    // ---------------------------------------------------------------------

    public function test_every_built_in_pattern_passes_the_custom_pattern_checks() {
        // So an editor preview can run them in JavaScript later
        foreach (\Typost_PS_Grep::built_in_patterns() as $name => $source) {
            $this->assertSame('', \Typost_PS_Grep::validate_pattern($source), $name);
        }
        $this->assertSame(array('acronyms', 'fractions', 'ordinals', 'numbers', 'ampersand', 'custom'), array_keys(\Typost_PS_Grep::pattern_labels()));
    }

    public function test_acronyms_match_two_or_more_capitals_as_a_word() {
        $this->assertSame(array('NASA', 'FBI', 'PDF'), $this->builtInMatches('acronyms', 'NASA and the FBI sent PDFs. A I Ok NASAx'));
    }

    public function test_fractions_skip_dates_and_decimals() {
        $text = 'Add 1/2 cup and 3' . "\u{2044}" . '4 tsp on 9/22/2026 or 2026/9/22; 1.5/2 and 3/4.5 too.';
        $this->assertSame(array('1/2', '3' . "\u{2044}" . '4'), $this->builtInMatches('fractions', $text));
    }

    public function test_ordinals_match_the_letters_after_a_number() {
        $this->assertSame(array('st', 'nd', 'rd', 'th', 'er', 'e'), $this->builtInMatches('ordinals', '1st 2nd 3rd 4th 1er 2e 5x 3D first'));
    }

    public function test_numbers_and_ampersand() {
        $this->assertSame(array('1,000.50', '42'), $this->builtInMatches('numbers', 'Pay 1,000.50 by day 42.'));
        $this->assertSame(array('&', '&'), $this->builtInMatches('ampersand', 'R&D & more'));
    }

    // ---------------------------------------------------------------------
    // Custom pattern validation
    // ---------------------------------------------------------------------

    public function shared_subset_cases() {
        $backslash = chr(92);
        return array(
            'atomic group'         => array('(?>a)', '(?>'),
            'possessive'           => array('a++', '++'),
            'possessive optional'  => array('a?+', '?+'),
            'inline flag'          => array('(?i)a', '(?i'),
            'pcre named group'     => array('(?P<n>a)', '(?P'),
            'verb'                 => array('(*SKIP)a', '(*'),
            'pcre hex'             => array($backslash . 'x{41}', $backslash . 'x'),
            'pcre anchor'          => array($backslash . 'A', $backslash . 'A'),
            'vertical space'       => array($backslash . 'v', $backslash . 'v'),
            'script name'          => array($backslash . 'p{Greek}', $backslash . 'p'),
            'escaped hyphen'       => array($backslash . '-', $backslash . '-'),
            'unicode escape'       => array($backslash . 'u0041', $backslash . 'u'),
            'posix class'          => array('[[:alpha:]]', '[:'),
            'leading bracket'      => array('[]a]', '[]'),
            'lone brace'           => array('a{', '{'),
            'lone closing brace'   => array('}', '}'),
            'quantified lookahead' => array('(?=a)*', '*'),
        );
    }

    /**
     * @dataProvider shared_subset_cases
     */
    public function test_constructs_outside_the_shared_subset_are_named($pattern, $construct) {
        $this->assertStringStartsWith($construct, \Typost_PS_Grep::js_incompatibility($pattern));
        $this->assertStringContainsString('“' . $construct, \Typost_PS_Grep::validate_pattern($pattern));
    }

    public function test_patterns_in_the_shared_subset_are_valid() {
        $backslash = chr(92);
        foreach (array(
            $backslash . 'b[A-Z]{2,}' . $backslash . 'b',
            '(?<y>' . $backslash . 'd{4})-' . $backslash . 'k<y>',
            '[' . $backslash . 'd-]+?',
            '(?<=' . $backslash . 'd)(?:st|nd)',
            $backslash . 'p{Lu}' . $backslash . 'P{Ll}*',
            'é+|' . $backslash . 'x41|' . $backslash . '/',
            '^a$',
        ) as $pattern) {
            $this->assertSame('', \Typost_PS_Grep::validate_pattern($pattern), $pattern);
        }
    }

    public function test_slow_invalid_long_and_empty_patterns_are_rejected() {
        $this->assertStringContainsString('takes too long', \Typost_PS_Grep::validate_pattern('(a|aa)+$'));
        $this->assertStringContainsString('takes too long', \Typost_PS_Grep::validate_pattern('(' . chr(92) . 'w+' . chr(92) . 's?)+$'));
        $this->assertStringContainsString('not valid', \Typost_PS_Grep::validate_pattern('(?<=a+)b'));
        $this->assertStringContainsString('too long', \Typost_PS_Grep::validate_pattern(str_repeat('a', 201)));
        $this->assertSame('', \Typost_PS_Grep::validate_pattern(str_repeat('é', 200)));
        $this->assertSame('Enter a pattern.', \Typost_PS_Grep::validate_pattern(''));
        $this->assertStringContainsString('control character', \Typost_PS_Grep::validate_pattern("a\tb"));
        $this->assertStringContainsString('UTF-8', \Typost_PS_Grep::validate_pattern("\xC3"));
    }

    public function test_the_compile_error_fallback_is_safe_on_php_7_4() {
        // preg_last_error_msg() is PHP 8+; the plugin requires PHP 7.4. No warning reaches this branch here, so read the source.
        $source = file_get_contents(TYPOST_PLUGIN_DIR . '/paragraph-styles/includes/class-typost-ps-grep.php');
        $this->assertGreaterThan(0, preg_match_all('/preg_last_error_msg\(\)/', $source, $calls));
        $this->assertSame(count($calls[0]), preg_match_all("/function_exists\( 'preg_last_error_msg' \) \? preg_last_error_msg\(\)/", $source));
    }

    public function test_dollar_matches_only_at_the_end_as_in_javascript() {
        $this->assertSame(array(), \Typost_PS_Grep::match_all('a$', "a\n"));
        $this->assertSame(array(array(0, 1)), \Typost_PS_Grep::match_all('a$', 'a'));
    }

    // ---------------------------------------------------------------------
    // Matching
    // ---------------------------------------------------------------------

    public function test_the_rule_higher_in_the_list_wins_where_matches_overlap() {
        $tag = function ($id) { return '<' . $id . '>'; };
        $text = 'Mix 1/2 of 250';
        $fractionsFirst = \Typost_PS_Grep::find_ranges($text, array(
            array('pattern' => 'fractions', 'styleId' => 2),
            array('pattern' => 'numbers', 'styleId' => 3),
        ), $tag);
        $this->assertSame(array(array(4, 7, '<2>'), array(11, 14, '<3>')), $fractionsFirst);

        $numbersFirst = \Typost_PS_Grep::find_ranges($text, array(
            array('pattern' => 'numbers', 'styleId' => 3),
            array('pattern' => 'fractions', 'styleId' => 2),
        ), $tag);
        $this->assertSame(array(array(4, 5, '<3>'), array(6, 7, '<3>'), array(11, 14, '<3>')), $numbersFirst);
    }

    public function test_broken_rules_and_deleted_styles_are_skipped() {
        $tag = function ($id) { return 9 === $id ? '' : '<' . $id . '>'; };
        $ranges = \Typost_PS_Grep::find_ranges('NASA', array(
            array('pattern' => 'custom', 'regex' => '(', 'styleId' => 2),
            array('pattern' => 'nope', 'styleId' => 2),
            array('pattern' => 'acronyms', 'styleId' => 9),
            array('pattern' => 'acronyms', 'styleId' => 4),
        ), $tag);
        $this->assertSame(array(array(0, 4, '<4>')), $ranges);
    }

    public function test_matches_per_rule_are_capped() {
        $text = str_repeat('1 ', \Typost_PS_Grep::MAX_MATCHES + 50);
        $ranges = \Typost_PS_Grep::find_ranges($text, array(array('pattern' => 'numbers', 'styleId' => 2)), function () { return '<x>'; });
        $this->assertCount(\Typost_PS_Grep::MAX_MATCHES, $ranges);
    }

    // ---------------------------------------------------------------------
    // Sanitizing
    // ---------------------------------------------------------------------

    private function sanitize($raw, array $args = array()) {
        return \Typost_PS_Grep::sanitize_rules($raw, $args + array(
            'own_id'           => 1,
            'style_ids'        => array(1, 2, 3),
            'existing'         => array(),
            'can_write_custom' => true,
        ));
    }

    public function test_sanitize_keeps_known_fields_only() {
        $result = $this->sanitize(array(
            array('pattern' => 'acronyms', 'styleId' => '2', 'regex' => 'ignored', 'extra' => 1),
            array('pattern' => 'custom', 'regex' => '[A-Z]+', 'styleId' => 3),
        ));
        $this->assertSame('', $result['error']);
        $this->assertSame(array(
            array('pattern' => 'acronyms', 'styleId' => 2),
            array('pattern' => 'custom', 'styleId' => 3, 'regex' => '[A-Z]+'),
        ), $result['rules']);
        $this->assertSame(array(), $this->sanitize(null)['rules']);
    }

    public function sanitize_error_cases() {
        return array(
            'not a list'        => array(array('a' => array()), -1, ''),
            'unknown pattern'   => array(array(array('pattern' => 'nope', 'styleId' => 2)), 0, 'pattern'),
            'missing style'     => array(array(array('pattern' => 'acronyms', 'styleId' => 0)), 0, 'styleId'),
            'unknown style'     => array(array(array('pattern' => 'acronyms', 'styleId' => 99)), 0, 'styleId'),
            'own style'         => array(array(array('pattern' => 'acronyms', 'styleId' => 2), array('pattern' => 'numbers', 'styleId' => 1)), 1, 'styleId'),
            'invalid pattern'   => array(array(array('pattern' => 'custom', 'regex' => '(?>a)', 'styleId' => 2)), 0, 'regex'),
            'too many rules'    => array(array_fill(0, 21, array('pattern' => 'numbers', 'styleId' => 2)), -1, ''),
        );
    }

    /**
     * @dataProvider sanitize_error_cases
     */
    public function test_sanitize_rejects_the_whole_list($raw, $index, $field) {
        $result = $this->sanitize($raw);
        $this->assertNotSame('', $result['error']);
        $this->assertSame(array(), $result['rules']);
        $this->assertSame($index, $result['index']);
        $this->assertSame($field, $result['field']);
    }

    public function test_only_administrators_add_or_change_custom_patterns() {
        $custom = array(array('pattern' => 'custom', 'regex' => '[A-Z]+', 'styleId' => 2));
        $denied = $this->sanitize($custom, array('can_write_custom' => false));
        $this->assertStringContainsString('Only administrators', $denied['error']);

        // An author keeps a pattern an administrator stored, and can reorder it
        $kept = $this->sanitize(
            array(array('pattern' => 'numbers', 'styleId' => 3), $custom[0]),
            array('can_write_custom' => false, 'existing' => $custom)
        );
        $this->assertSame('', $kept['error']);
        $this->assertCount(2, $kept['rules']);

        // ...but not change it
        $changed = $this->sanitize(
            array(array('pattern' => 'custom', 'regex' => '[A-Z]{2}', 'styleId' => 2)),
            array('can_write_custom' => false, 'existing' => $custom)
        );
        $this->assertStringContainsString('Only administrators', $changed['error']);

        // Built-in patterns are open to every author
        $this->assertSame('', $this->sanitize(array(array('pattern' => 'acronyms', 'styleId' => 2)), array('can_write_custom' => false))['error']);
    }

    // ---------------------------------------------------------------------
    // REST
    // ---------------------------------------------------------------------

    private function styles() {
        return array(
            array('id' => 1, 'name' => 'Body', 'properties' => array('features' => array('onum'))),
            array('id' => 2, 'name' => 'Small caps', 'properties' => array('features' => array('c2sc')), 'grepRules' => array()),
            array('id' => 3, 'name' => 'Fraction', 'properties' => array('features' => array('frac'))),
        );
    }

    private function stored($id) {
        foreach ($this->options['typost_paragraph_styles'] as $style) {
            if ($style['id'] === $id) {
                return $style;
            }
        }
        return null;
    }

    public function test_update_stores_rules_and_a_save_without_them_keeps_them() {
        $module = $this->module($this->styles());
        $rules = array(array('pattern' => 'fractions', 'styleId' => 3), array('pattern' => 'acronyms', 'styleId' => 2));

        $response = $module->rest_update_style($this->request(array('grepRules' => $rules), 1));
        $this->assertSame(200, $response->get_status());
        $this->assertSame($rules, $this->stored(1)['grepRules']);
        $this->assertSame($rules, $response->get_data()['grepRules']);

        // Update Style from an editor sends properties only
        $module->rest_update_style($this->request(array('properties' => array('features' => array('onum', 'liga'))), 1));
        $this->assertSame($rules, $this->stored(1)['grepRules']);

        // An empty list removes them
        $module->rest_update_style($this->request(array('grepRules' => array()), 1));
        $this->assertArrayNotHasKey('grepRules', $this->stored(1));
    }

    public function test_create_and_update_reject_bad_rules_with_the_failing_field() {
        $module = $this->module($this->styles());

        $response = $module->rest_update_style($this->request(array('grepRules' => array(
            array('pattern' => 'acronyms', 'styleId' => 2),
            array('pattern' => 'custom', 'regex' => 'a++', 'styleId' => 3),
        )), 1));
        $this->assertSame(400, $response->get_status());
        $this->assertSame(array('grepRules', 1, 'regex'), array($response->get_data()['field'], $response->get_data()['ruleIndex'], $response->get_data()['ruleField']));
        $this->assertArrayNotHasKey('grepRules', $this->stored(1));

        $this->isAdmin = false;
        $create = $module->rest_create_style($this->request(array('name' => 'New', 'grepRules' => array(array('pattern' => 'custom', 'regex' => 'x', 'styleId' => 2)))));
        $this->assertSame(400, $create->get_status());
        $this->assertCount(3, $this->options['typost_paragraph_styles']);

        $created = $module->rest_create_style($this->request(array('name' => 'New', 'grepRules' => array(array('pattern' => 'numbers', 'styleId' => 2)))));
        $this->assertSame(201, $created->get_status());
        $this->assertSame(array(array('pattern' => 'numbers', 'styleId' => 2)), $created->get_data()['grepRules']);
    }

    public function test_deleting_a_style_removes_the_rules_that_apply_it() {
        $styles = $this->styles();
        $styles[0]['grepRules'] = array(array('pattern' => 'fractions', 'styleId' => 3), array('pattern' => 'acronyms', 'styleId' => 2));
        $styles[1]['grepRules'] = array(array('pattern' => 'fractions', 'styleId' => 3));
        $module = $this->module($styles);

        $response = $module->rest_delete_style($this->request(array(), 3));
        $this->assertSame(array(1, 2), $response->get_data()['grepChanged']);
        $this->assertSame(array(array('pattern' => 'acronyms', 'styleId' => 2)), $this->stored(1)['grepRules']);
        $this->assertArrayNotHasKey('grepRules', $this->stored(2));
    }

    // ---------------------------------------------------------------------
    // CSS and fonts
    // ---------------------------------------------------------------------

    public function test_feature_css_keeps_the_paragraph_features_inside_a_grep_span() {
        $styles = $this->styles();
        $styles[0]['legacyId'] = 'ps_1_2';
        $styles[0]['grepRules'] = array(array('pattern' => 'acronyms', 'styleId' => 2), array('pattern' => 'fractions', 'styleId' => 3), array('pattern' => 'numbers', 'styleId' => 3));
        $css = \Typost_Paragraph_Styles::grep_feature_css($styles[0], $styles);
        $this->assertSame(
            ".typost-ps-1 .typost-grep.typost-grep.typost-grep[data-style-id=\"2\"][data-style-id][data-style-id][data-style-id],\n"
            . ".typost-ps-ps_1_2 .typost-grep.typost-grep.typost-grep[data-style-id=\"2\"][data-style-id][data-style-id][data-style-id] {\n"
            . "    font-feature-settings: \"onum\" 1, \"c2sc\" 1;\n}\n\n"
            . ".typost-ps-1 .typost-grep.typost-grep.typost-grep[data-style-id=\"3\"][data-style-id][data-style-id][data-style-id],\n"
            . ".typost-ps-ps_1_2 .typost-grep.typost-grep.typost-grep[data-style-id=\"3\"][data-style-id][data-style-id][data-style-id] {\n"
            . "    font-feature-settings: \"onum\" 1, \"frac\" 1;\n}",
            $css
        );

        // Nothing to combine when either side sets no features
        $styles[0]['properties'] = array();
        $this->assertSame('', \Typost_Paragraph_Styles::grep_feature_css($styles[0], $styles));
        $this->assertSame('', \Typost_Paragraph_Styles::grep_feature_css($styles[2], $styles));
    }

    public function test_get_all_css_adds_the_feature_rules_after_the_styles() {
        $styles = $this->styles();
        $styles[0]['grepRules'] = array(array('pattern' => 'fractions', 'styleId' => 3));
        $css = $this->module($styles)->get_all_css();
        $this->assertGreaterThan(strpos($css, '"frac" 1;'), strrpos($css, '"onum" 1, "frac" 1'));
    }

    public function test_content_using_a_style_loads_the_fonts_of_the_styles_its_rules_apply() {
        $module = $this->module(array(
            array('id' => 1, 'name' => 'Body', 'properties' => array('fontId' => 5), 'grepRules' => array(array('pattern' => 'ampersand', 'styleId' => 2))),
            array('id' => 2, 'name' => 'Amp', 'properties' => array('fontId' => 8)),
        ));
        $this->assertSame(array(5, 8), $module->font_ids_from_content(array(), '<p class="typost-styled typost-ps-1">R&amp;D</p>'));
        // Without the rule only the paragraph's font
        $this->options['typost_paragraph_styles'][0]['grepRules'] = array();
        $module = $this->module($this->options['typost_paragraph_styles']);
        $this->assertSame(array(5), $module->font_ids_from_content(array(), '<p class="typost-styled typost-ps-1">R&amp;D</p>'));
    }
}

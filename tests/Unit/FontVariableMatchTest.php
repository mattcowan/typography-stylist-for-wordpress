<?php
/**
 * The --font-N pattern of the PHP font scans (#485).
 *
 * A scan counts --font-N only as a whole custom property name, so a theme's
 * var(--wp--custom--font-2-size) does not load font 2. Every PHP scan uses
 * Typost::FONT_VARIABLE_PATTERN. The cases come from
 * tests/fixtures/font-variable-refs.json, which the editor scan's test reads
 * too (assets/js/__tests__/editor-font-kits.test.js), so both sides find the
 * same IDs.
 */

namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;

class FontVariableMatchTest extends TestCase {

    protected function setUp(): void {
        parent::setUp();

        static $loaded = false;
        if (!$loaded) {
            require_once TYPOST_PLUGIN_DIR . '/typography-stylist.php';
            $loaded = true;
        }
    }

    private static function cases() {
        $json = file_get_contents(dirname(__DIR__) . '/fixtures/font-variable-refs.json');
        return json_decode($json, true)['cases'];
    }

    public function fixtureCases() {
        $out = array();
        foreach (self::cases() as $case) {
            $out[$case['label']] = array($case['markup'], $case['ids']);
        }
        return $out;
    }

    /**
     * @dataProvider fixtureCases
     */
    public function test_the_pattern_finds_the_fixture_ids($markup, $ids) {
        $found = array();
        if (preg_match_all(\Typost::FONT_VARIABLE_PATTERN, $markup, $matches)) {
            foreach ($matches[1] as $id) {
                if (!in_array((int) $id, $found, true)) {
                    $found[] = (int) $id;
                }
            }
        }
        $this->assertSame($ids, $found);
    }

    public function test_the_fixture_has_cases_that_match_and_cases_that_do_not() {
        $matching = 0;
        $empty    = 0;
        foreach (self::cases() as $case) {
            if (empty($case['ids'])) {
                $empty++;
            } else {
                $matching++;
            }
        }
        $this->assertGreaterThan(0, $matching);
        $this->assertGreaterThan(0, $empty);
    }

    /**
     * Every scan in the main plugin file uses the constant: no other
     * --font-N pattern is left to drift from it.
     */
    public function test_no_scan_in_the_plugin_file_keeps_its_own_pattern() {
        $source = file_get_contents(TYPOST_PLUGIN_DIR . '/typography-stylist.php');
        $this->assertSame(1, preg_match_all('/\'\/\(\?<!\[\\\\w-\]\)--font-/', $source), 'the constant is defined once');
        // A scan pattern is a regex literal that starts with --font-( and
        // captures the number; the declaration parser anchors with ^ and is
        // not a scan.
        $this->assertSame(0, preg_match_all('/\'\/--font-\(\\\\d\+\)\//', $source), 'no scan keeps /--font-(\d+)/');
        // Any other spelling of a --font- pattern written inline in a
        // preg_match() or preg_match_all() call (double quotes, \b, [0-9]):
        // only the anchored declaration parser of
        // join_font_css_declarations() may do that.
        $this->assertSame(1, preg_match_all(self::INLINE_FONT_PATTERN_CALL, $source), 'only the declaration parser writes its own --font- pattern');
    }

    public function test_control_the_source_check_finds_a_planted_scan_pattern() {
        $planted = "if (preg_match_all('/--font-(\\d+)/', \$raw, \$matches)) {";
        $this->assertSame(1, preg_match_all('/\'\/--font-\(\\\\d\+\)\//', $planted));
    }

    /**
     * The inline check finds a scan pattern in other spellings, and does not
     * count the constant or a pattern kept in a variable.
     */
    public function test_control_the_inline_check_finds_other_spellings() {
        $planted = array(
            "preg_match_all(\"/--font-(\\\\d+)/\", \$raw, \$m)",
            "preg_match_all('/--font-(\\d+)\\b/', \$raw, \$m)",
            "preg_match_all('/--font-([0-9]+)/', \$raw, \$m)",
            "preg_match_all('/var\\(--font-(\\d+)\\)/', \$raw, \$m)",
        );
        foreach ($planted as $line) {
            $this->assertSame(1, preg_match_all(self::INLINE_FONT_PATTERN_CALL, $line), $line);
        }
        $this->assertSame(0, preg_match_all(self::INLINE_FONT_PATTERN_CALL, 'preg_match_all(self::FONT_VARIABLE_PATTERN, $raw, $m)'));
    }

    /** A preg_match() or preg_match_all() call whose inline pattern names --font-. */
    const INLINE_FONT_PATTERN_CALL = '/preg_match(?:_all)?\(\s*([\'"])(?:(?!\1).)*--font-/';
}

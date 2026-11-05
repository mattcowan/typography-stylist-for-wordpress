<?php
/**
 * Tests for GREP styles in export files (#196, #205): each rule's style is
 * a file key exported with it, built-in patterns are written by name, and a
 * custom pattern gets the same checks as Save, is listed in the preview,
 * and rejects the whole file when it fails.
 */

namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\ExportTestCase;
use TypographyStylist\Tests\Support\HtmlApi;

class ParagraphStylesGrepTransferTest extends ExportTestCase {

    private function export() {
        return new \Typost_Export($this->site);
    }

    private function parse($text) {
        $file = \Typost_Export::parse_file($text);
        $this->assertIsArray($file);
        return $file;
    }

    private function sourceSite() {
        return $this->module(array(
            array('id' => 4, 'name' => 'Body', 'properties' => array('lineHeight' => 1.5), 'grepRules' => array(
                array('pattern' => 'fractions', 'styleId' => 9),
                array('pattern' => 'custom', 'regex' => '[A-Z]{2,}', 'styleId' => 7),
            )),
            array('id' => 7, 'name' => 'Small caps', 'properties' => array('features' => array('c2sc'))),
            array('id' => 9, 'name' => 'Fraction', 'properties' => array('features' => array('frac'))),
            array('id' => 11, 'name' => 'Unrelated', 'properties' => array()),
        ), 12);
    }

    /** A file with the given paragraph styles section. */
    private function file(array $styles) {
        return $this->parse(json_encode(array(
            'format'   => 'typost-export',
            'version'  => 1,
            'sections' => array('paragraphStyles' => $styles),
        )));
    }

    public function test_export_writes_style_keys_and_built_in_names() {
        $result = $this->exportWith($this->sourceSite(), array('sections' => array('paragraphStyles')));
        $styles = $result['file']['sections']['paragraphStyles'];
        $this->assertSame(array(
            array('pattern' => 'fractions', 'style' => 's3'),
            array('pattern' => 'custom', 'regex' => '[A-Z]{2,}', 'style' => 's2'),
        ), $styles[0]['grepRules']);
        // A style with no rules says so, so Overwrite can clear the target's rules
        $this->assertSame(array(), $styles[1]['grepRules']);
    }

    public function test_overwriting_from_a_style_with_no_rules_clears_the_rules_of_the_target() {
        $source = $this->module(array(
            array('id' => 1, 'name' => 'Body', 'properties' => array('lineHeight' => 2)),
        ), 2);
        $text = json_encode($this->exportWith($source, array('sections' => array('paragraphStyles')))['file']);
        $this->assertStringContainsString('"grepRules":[]', $text);

        $this->registerSection($this->module(array(
            array('id' => 4, 'name' => 'Body', 'properties' => array(), 'grepRules' => array(array('pattern' => 'numbers', 'styleId' => 5))),
            array('id' => 5, 'name' => 'Figures', 'properties' => array()),
        ), 6));
        $this->export()->import($this->parse($text), array('sections' => array('paragraphStyles' => array('s1' => array('action' => 'overwrite')))));

        $this->assertArrayNotHasKey('grepRules', $this->storedStyle('Body'));
        $this->assertEquals(2, $this->storedStyle('Body')['properties']['lineHeight']);
    }

    public function test_exporting_a_style_adds_the_styles_its_rules_apply() {
        $result = $this->exportWith($this->sourceSite(), array('sections' => array('paragraphStyles'), 'sectionArgs' => array('paragraphStyles' => array('items' => array(4)))));
        $this->assertSame(array('Body', 'Small caps', 'Fraction'), array_column($result['file']['sections']['paragraphStyles'], 'name'));
        $this->assertSame(array(
            '“Fraction” was added because a GREP rule of “Body” applies it.',
            '“Small caps” was added because a GREP rule of “Body” applies it.',
        ), $result['notes']);
    }

    public function test_import_on_another_site_keeps_order_and_remaps_styles() {
        $result = $this->exportWith($this->sourceSite(), array('sections' => array('paragraphStyles')));
        $text = json_encode($result['file']);
        $this->module(array(array('id' => 1, 'name' => 'Caption', 'properties' => array())), 2);

        $preview = $this->export()->preview($this->parse($text));
        $section = $preview['sections']['paragraphStyles']['preview'];
        $this->assertSame(array('Fractions (1/2, not dates) → Fraction', 'Custom ([A-Z]{2,}) → Small caps'), $section['items'][0]['grep']);
        $this->assertSame(array('“Body” has a custom GREP pattern, which runs on every page that uses the style: [A-Z]{2,} (applies “Small caps”).'), $section['notes']);

        // Below WordPress 6.9 the rules are imported but do nothing, and the preview says so
        HtmlApi::setSupported(false);
        $unsupported = $this->export()->preview($this->parse($text))['sections']['paragraphStyles']['preview']['warnings'];
        $this->assertContains('GREP styles need WordPress 6.9 or later. They are imported, but have no effect on this site until WordPress is updated.', $unsupported);

        $this->export()->import($this->parse($text), array());
        $body = $this->storedStyle('Body');
        $this->assertSame(array(
            array('pattern' => 'fractions', 'styleId' => $this->storedStyle('Fraction')['id']),
            array('pattern' => 'custom', 'styleId' => $this->storedStyle('Small caps')['id'], 'regex' => '[A-Z]{2,}'),
        ), $body['grepRules']);
    }

    public function test_import_on_the_same_site_changes_nothing() {
        $module = $this->sourceSite();
        $text = json_encode($this->exportWith($module, array('sections' => array('paragraphStyles')))['file']);
        $before = $this->options['typost_paragraph_styles'];
        $this->export()->import($this->parse($text), array());
        $this->assertSame($before, $this->options['typost_paragraph_styles']);
    }

    public function test_a_custom_pattern_that_fails_rejects_the_whole_file() {
        $this->registerSection($this->module(array(), 1));
        $file = $this->file(array(
            array('key' => 's1', 'name' => 'Body', 'basedOn' => null, 'properties' => array(), 'grepRules' => array(
                array('pattern' => 'acronyms', 'style' => 's2'),
                array('pattern' => 'custom', 'regex' => '(a|aa)+$', 'style' => 's2'),
            )),
            array('key' => 's2', 'name' => 'Small caps', 'basedOn' => null, 'properties' => array()),
        ));

        $preview = $this->export()->preview($file);
        $this->assertInstanceOf(\WP_Error::class, $preview);
        $this->assertStringStartsWith('“Body”, GREP rule 2: The pattern takes too long', $preview->get_error_message());

        $result = $this->export()->import($file, array());
        $this->assertInstanceOf(\WP_Error::class, $result);
        $this->assertSame(array(), $this->storedStyles());
    }

    public function test_rules_that_point_at_a_missing_key_or_the_style_itself_are_an_unreadable_file() {
        $this->registerSection($this->module(array(), 1));
        foreach (array('s9', 's1') as $target) {
            $file = $this->file(array(
                array('key' => 's1', 'name' => 'Body', 'basedOn' => null, 'properties' => array(), 'grepRules' => array(array('pattern' => 'acronyms', 'style' => $target))),
            ));
            $this->assertInstanceOf(\WP_Error::class, $this->export()->preview($file), $target);
        }
    }

    public function test_an_unknown_pattern_and_a_left_out_style_drop_the_rule_with_a_warning() {
        $this->registerSection($this->module(array(), 1));
        $file = $this->file(array(
            array('key' => 's1', 'name' => 'Body', 'basedOn' => null, 'properties' => array(), 'grepRules' => array(
                array('pattern' => 'emoji', 'style' => 's2'),
                array('pattern' => 'numbers', 'style' => 's3'),
                array('pattern' => 'acronyms', 'style' => 's2'),
            )),
            array('key' => 's2', 'name' => 'Small caps', 'basedOn' => null, 'properties' => array()),
            array('key' => 's3', 'name' => 'Figures', 'basedOn' => null, 'properties' => array()),
        ));

        $result = $this->export()->import($file, array('sections' => array('paragraphStyles' => array('s3' => array('action' => 'skip')))));
        $this->assertSame(array(
            '“Body”, GREP rule 1: this site does not know the pattern “emoji”, so the rule is left out.',
            '“Body”, GREP rule 2: “Figures” is not imported, so the rule is left out.',
        ), $result['sections']['paragraphStyles']['warnings']);
        $this->assertSame(array(array('pattern' => 'acronyms', 'styleId' => $this->storedStyle('Small caps')['id'])), $this->storedStyle('Body')['grepRules']);
    }

    public function test_overwrite_takes_the_files_rules_and_a_file_without_rules_keeps_the_sites() {
        $this->registerSection($this->module(array(
            array('id' => 1, 'name' => 'Body', 'properties' => array(), 'grepRules' => array(array('pattern' => 'numbers', 'styleId' => 2))),
            array('id' => 2, 'name' => 'Figures', 'properties' => array()),
        ), 3));
        $choices = array('sections' => array('paragraphStyles' => array('s1' => array('action' => 'overwrite'))));

        // A file written before #196 has no grepRules key
        $old = $this->file(array(array('key' => 's1', 'name' => 'Body', 'basedOn' => null, 'properties' => array('lineHeight' => 2))));
        $this->export()->import($old, $choices);
        $this->assertSame(array(array('pattern' => 'numbers', 'styleId' => 2)), $this->storedStyle('Body')['grepRules']);

        $new = $this->file(array(
            array('key' => 's1', 'name' => 'Body', 'basedOn' => null, 'properties' => array(), 'grepRules' => array()),
        ));
        $this->export()->import($new, $choices);
        $this->assertArrayNotHasKey('grepRules', $this->storedStyle('Body'));
    }
}

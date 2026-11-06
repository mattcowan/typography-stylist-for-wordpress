<?php
/**
 * Tests for nested styles in export files (#195, #205): each rule's style
 * is a file key exported with it, a marker round-trips as written (non-ASCII
 * included), a rule gets the same checks as Save, and import remaps the
 * styles.
 */

namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\ExportTestCase;
use TypographyStylist\Tests\Support\HtmlApi;

class ParagraphStylesNestedTransferTest extends ExportTestCase {

    private function export() {
        return new \Typost_Export($this->site);
    }

    private function parse($text) {
        $file = \Typost_Export::parse_file($text);
        $this->assertIsArray($file);
        return $file;
    }

    private function rules() {
        return array(
            array('styleId' => 9, 'unit' => 'marker', 'count' => 1, 'marker' => '—', 'end' => 'through'),
            array('styleId' => 7, 'unit' => 'words', 'count' => 3, 'end' => 'upto'),
            array('styleId' => 9, 'unit' => 'line'),
        );
    }

    private function sourceSite() {
        return $this->module(array(
            array('id' => 4, 'name' => 'Step', 'properties' => array('lineHeight' => 1.5), 'nestedRules' => $this->rules()),
            array('id' => 7, 'name' => 'Small caps', 'properties' => array('features' => array('c2sc'))),
            array('id' => 9, 'name' => 'Bold', 'properties' => array('fontWeight' => '700')),
            array('id' => 11, 'name' => 'Unrelated', 'properties' => array()),
        ), 12);
    }

    private function file(array $styles) {
        return $this->parse(json_encode(array(
            'format'   => 'typost-export',
            'version'  => 1,
            'sections' => array('paragraphStyles' => $styles),
        )));
    }

    public function test_export_writes_style_keys_and_adds_the_styles_rules_apply() {
        $result = $this->exportWith($this->sourceSite(), array('sections' => array('paragraphStyles'), 'sectionArgs' => array('paragraphStyles' => array('items' => array(4)))));
        $styles = $result['file']['sections']['paragraphStyles'];
        $this->assertSame(array('Step', 'Small caps', 'Bold'), array_column($styles, 'name'));
        $this->assertSame(array(
            array('style' => 's3', 'unit' => 'marker', 'count' => 1, 'marker' => '—', 'end' => 'through'),
            array('style' => 's2', 'unit' => 'words', 'count' => 3, 'end' => 'upto'),
            array('style' => 's3', 'unit' => 'line'),
        ), $styles[0]['nestedRules']);
        $this->assertSame(array(), $styles[1]['nestedRules']);
        $this->assertSame(array(
            '“Bold” was added because a nested rule of “Step” applies it.',
            '“Small caps” was added because a nested rule of “Step” applies it.',
        ), $result['notes']);
    }

    public function test_import_on_another_site_remaps_styles_and_keeps_the_marker() {
        // The file text as a browser would send it back, with the marker escaped
        $text = json_encode($this->exportWith($this->sourceSite(), array('sections' => array('paragraphStyles')))['file']);
        $this->assertStringContainsString('"marker":"\\u2014"', $text);
        $this->module(array(array('id' => 1, 'name' => 'Caption', 'properties' => array())), 2);

        $preview = $this->export()->preview($this->parse($text))['sections']['paragraphStyles']['preview'];
        $this->assertSame(array('Through 1 “—” → Bold', 'Up to 3 words → Small caps', 'First line → Bold'), $preview['items'][0]['nested']);

        HtmlApi::setSupported(false);
        $this->assertContains('Nested styles need WordPress 6.9 or later. They are imported, but have no effect on this site until WordPress is updated.', $this->export()->preview($this->parse($text))['sections']['paragraphStyles']['preview']['warnings']);

        $this->export()->import($this->parse($text), array());
        $bold = $this->storedStyle('Bold')['id'];
        $this->assertSame(array(
            array('styleId' => $bold, 'unit' => 'marker', 'count' => 1, 'marker' => '—', 'end' => 'through'),
            array('styleId' => $this->storedStyle('Small caps')['id'], 'unit' => 'words', 'count' => 3, 'end' => 'upto'),
            array('styleId' => $bold, 'unit' => 'line'),
        ), $this->storedStyle('Step')['nestedRules']);
    }

    public function test_import_on_the_same_site_changes_nothing() {
        $module = $this->sourceSite();
        $text = json_encode($this->exportWith($module, array('sections' => array('paragraphStyles')))['file']);
        $before = $this->options['typost_paragraph_styles'];
        $this->export()->import($this->parse($text), array());
        $this->assertSame($before, $this->options['typost_paragraph_styles']);
    }

    public function test_a_rule_that_fails_the_checks_rejects_the_whole_file() {
        $this->registerSection($this->module(array(), 1));
        $styles = function ($rules) {
            return array(
                array('key' => 's1', 'name' => 'Step', 'basedOn' => null, 'properties' => array(), 'nestedRules' => $rules),
                array('key' => 's2', 'name' => 'Bold', 'basedOn' => null, 'properties' => array()),
            );
        };

        $file = $this->file($styles(array(
            array('style' => 's2', 'unit' => 'words', 'count' => 1, 'end' => 'through'),
            array('style' => 's2', 'unit' => 'marker', 'count' => 1, 'marker' => '::', 'end' => 'through'),
        )));
        $preview = $this->export()->preview($file);
        $this->assertInstanceOf(\WP_Error::class, $preview);
        $this->assertSame('“Step”, nested rule 2: Type one character only. Nothing was saved.', $preview->get_error_message());
        $this->assertInstanceOf(\WP_Error::class, $this->export()->import($file, array()));
        $this->assertSame(array(), $this->storedStyles());

        // A missing key, the style itself, and First line before another rule
        foreach (array(
            array(array('style' => 's9', 'unit' => 'line')),
            array(array('style' => 's1', 'unit' => 'line')),
            array(array('style' => 's2', 'unit' => 'line'), array('style' => 's2', 'unit' => 'characters', 'count' => 1)),
            'not a list',
        ) as $rules) {
            $this->assertInstanceOf(\WP_Error::class, $this->export()->preview($this->file($styles($rules))));
        }
    }

    public function test_a_left_out_style_drops_the_rule_with_a_warning() {
        $this->registerSection($this->module(array(), 1));
        $file = $this->file(array(
            array('key' => 's1', 'name' => 'Step', 'basedOn' => null, 'properties' => array(), 'nestedRules' => array(
                array('style' => 's3', 'unit' => 'words', 'count' => 1, 'end' => 'through'),
                array('style' => 's2', 'unit' => 'characters', 'count' => 2),
            )),
            array('key' => 's2', 'name' => 'Bold', 'basedOn' => null, 'properties' => array()),
            array('key' => 's3', 'name' => 'Label', 'basedOn' => null, 'properties' => array()),
        ));
        $result = $this->export()->import($file, array('sections' => array('paragraphStyles' => array('s3' => array('action' => 'skip')))));
        $this->assertSame(array('“Step”, nested rule 1: “Label” is not imported, so the rule is left out and the rules after it start earlier.'), $result['sections']['paragraphStyles']['warnings']);
        $this->assertSame(array(array('styleId' => $this->storedStyle('Bold')['id'], 'unit' => 'characters', 'count' => 2)), $this->storedStyle('Step')['nestedRules']);
    }

    public function test_overwrite_takes_the_files_rules_and_a_file_without_them_keeps_the_sites() {
        $this->registerSection($this->module(array(
            array('id' => 1, 'name' => 'Step', 'properties' => array(), 'nestedRules' => array(array('styleId' => 2, 'unit' => 'line'))),
            array('id' => 2, 'name' => 'Bold', 'properties' => array()),
        ), 3));
        $choices = array('sections' => array('paragraphStyles' => array('s1' => array('action' => 'overwrite'))));

        $this->export()->import($this->file(array(array('key' => 's1', 'name' => 'Step', 'basedOn' => null, 'properties' => array('lineHeight' => 2)))), $choices);
        $this->assertSame(array(array('styleId' => 2, 'unit' => 'line')), $this->storedStyle('Step')['nestedRules']);

        $this->export()->import($this->file(array(array('key' => 's1', 'name' => 'Step', 'basedOn' => null, 'properties' => array(), 'nestedRules' => array()))), $choices);
        $this->assertArrayNotHasKey('nestedRules', $this->storedStyle('Step'));
    }
}

<?php
/**
 * Tests for the export file envelope (#205): what export writes, and which
 * files import refuses before anything is saved.
 */

namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\ExportTestCase;
use Brain\Monkey\Functions;

class ExportFileFormatTest extends ExportTestCase {

    private function errorMessage($result) {
        $this->assertInstanceOf(\WP_Error::class, $result);
        return $result->get_error_message();
    }

    public function test_export_writes_the_envelope() {
        $module = $this->module(array(array('id' => 1, 'name' => 'Body', 'properties' => array('lineHeight' => 1.5))));
        $result = $this->exportWith($module, array('sections' => array('paragraphStyles')));

        $file = $result['file'];
        $this->assertSame('typost-export', $file['format']);
        $this->assertSame(1, $file['version']);
        $this->assertSame(TYPOST_VERSION, $file['plugin']);
        $this->assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}$/', $file['exported']);
        $this->assertArrayHasKey('paragraphStyles', $file['sections']);
    }

    public function test_an_empty_font_map_stays_a_json_object() {
        $module = $this->module(array(array('id' => 1, 'name' => 'Body', 'properties' => array())));
        $result = $this->exportWith($module, array('sections' => array('paragraphStyles')));

        $json = json_encode($result['file']);
        $this->assertStringContainsString('"fonts":{}', $json);
        $this->assertStringContainsString('"properties":{}', $json);
    }

    public function test_export_with_nothing_chosen_is_rejected() {
        $result = $this->exportWith($this->module(), array('sections' => array()));
        $this->assertSame('typost_export_empty', $result->get_error_code());
    }

    public function test_export_of_an_unknown_section_is_rejected() {
        $result = $this->exportWith($this->module(), array('sections' => array('nope')));
        $this->assertSame('typost_export_unknown_section', $result->get_error_code());
    }

    public function test_export_checks_the_section_capability() {
        Functions\when('current_user_can')->alias(function ($cap) {
            return 'edit_posts' !== $cap;
        });
        $result = $this->exportWith($this->module(), array('sections' => array('paragraphStyles')));
        $this->assertSame('typost_export_forbidden', $result->get_error_code());
        $this->assertSame(403, $result->get_error_data()['status']);
    }

    public function test_all_fonts_needs_manage_options() {
        Functions\when('current_user_can')->alias(function ($cap) {
            return 'edit_posts' === $cap;
        });
        $module = $this->module(array(array('id' => 1, 'name' => 'Body', 'properties' => array())));

        $this->assertIsArray($this->exportWith($module, array('sections' => array('paragraphStyles'))));
        $result = $this->exportWith($module, array('sections' => array('paragraphStyles'), 'allFonts' => true));
        $this->assertSame('typost_export_forbidden', $result->get_error_code());
    }

    public function test_all_fonts_adds_fonts_no_style_uses() {
        $this->site->manual = array(array('id' => 'manual-a', 'name' => 'Brand Sans', 'font_id' => 4, 'font_family' => 'Brand Sans', 'fallbacks' => 'sans-serif'));
        $module = $this->module(array(array('id' => 1, 'name' => 'Body', 'properties' => array())));

        $result = $this->exportWith($module, array('sections' => array('paragraphStyles'), 'allFonts' => true));
        $this->assertCount(1, $result['file']['fonts']);
        $this->assertSame('manual', $result['file']['fonts']['f1']['source']);
    }

    public function test_export_round_trips_through_parse_file() {
        $module = $this->module(array(array('id' => 1, 'name' => 'Body', 'properties' => array())));
        $result = $this->exportWith($module, array('sections' => array('paragraphStyles')));

        $file = \Typost_Export::parse_file($this->fileText($result['file']));
        $this->assertIsArray($file);
        $this->assertSame(1, $file['version']);
    }

    /**
     * @dataProvider rejectedFiles
     */
    public function test_files_that_cannot_be_read_are_rejected($text, $expected) {
        $message = $this->errorMessage(\Typost_Export::parse_file($text));
        $this->assertStringContainsString($expected, $message);
    }

    public function rejectedFiles() {
        return array(
            'no file'           => array('', 'Choose an export file'),
            'not a string'      => array(array('format' => 'typost-export'), 'Choose an export file'),
            'not JSON'          => array('{"format": "typost-export",', 'not valid JSON'),
            'a JSON string'     => array('"typost-export"', 'not valid JSON'),
            'another format'    => array('{"format": "wp-styles", "version": 1}', 'not a Typography Stylist export file'),
            'no format'         => array('{"version": 1}', 'not a Typography Stylist export file'),
            'no version'        => array('{"format": "typost-export"}', 'no format version'),
            'version as string' => array('{"format": "typost-export", "version": "1"}', 'no format version'),
            'version 0'         => array('{"format": "typost-export", "version": 0}', 'no format version'),
            'bad fonts'         => array('{"format": "typost-export", "version": 1, "fonts": "x"}', 'fonts in this file'),
            'bad font'          => array('{"format": "typost-export", "version": 1, "fonts": {"f1": {"source": "kit"}}}', 'fonts in this file'),
            'bad sections'      => array('{"format": "typost-export", "version": 1, "sections": 3}', 'sections in this file'),
        );
    }

    public function test_a_newer_version_names_both_versions() {
        $message = $this->errorMessage(\Typost_Export::parse_file('{"format": "typost-export", "version": 2}'));
        $this->assertStringContainsString('version 2', $message);
        $this->assertStringContainsString('up to version 1', $message);
        $this->assertStringContainsString('Nothing was saved', $message);
    }

    public function test_a_file_over_the_size_limit_is_rejected_before_parsing() {
        $text = '{"format": "typost-export", "version": 1, "pad": "' . str_repeat('x', \Typost_Export::MAX_FILE_BYTES) . '"}';
        $this->assertStringContainsString('too large', $this->errorMessage(\Typost_Export::parse_file($text)));
    }

    public function test_a_byte_order_mark_is_ignored() {
        $file = \Typost_Export::parse_file("\xEF\xBB\xBF" . '{"format": "typost-export", "version": 1}');
        $this->assertIsArray($file);
    }

    public function test_a_rejected_file_saves_nothing() {
        $module = $this->module(array(array('id' => 1, 'name' => 'Body', 'properties' => array())), 2);
        $this->registerSection($module);
        $before = $this->options;

        $export = new \Typost_Export($this->site);
        $request = new class {
            public function get_param($key) {
                return 'fileText' === $key ? '{"format": "typost-export", "version": 9, "sections": {"paragraphStyles": []}}' : null;
            }
        };
        $this->assertInstanceOf(\WP_Error::class, $export->rest_import($request));
        $this->assertSame($before, $this->options);
    }

    public function test_sections_the_site_does_not_know_are_listed_and_the_rest_imports() {
        $module = $this->module(array(), 1);
        $this->registerSection($module);
        $file = \Typost_Export::parse_file(json_encode(array(
            'format'   => 'typost-export',
            'version'  => 1,
            'sections' => array(
                'layeredFonts'    => array('x' => 1),
                'paragraphStyles' => array(array('key' => 's1', 'name' => 'Body', 'basedOn' => null, 'properties' => array('lineHeight' => 1.4))),
            ),
        )));
        $export = new \Typost_Export($this->site);

        $preview = $export->preview($file);
        $this->assertSame(array('layeredFonts'), $preview['unknownSections']);

        $result = $export->import($file, array());
        $this->assertSame(array('layeredFonts'), $result['notImported']);
        $this->assertSame(array('Body'), $result['sections']['paragraphStyles']['added']);
    }

    public function test_import_can_leave_a_section_out() {
        $module = $this->module(array(), 1);
        $this->registerSection($module);
        $file = \Typost_Export::parse_file(json_encode(array(
            'format'   => 'typost-export',
            'version'  => 1,
            'sections' => array('paragraphStyles' => array(array('key' => 's1', 'name' => 'Body', 'basedOn' => null, 'properties' => array()))),
        )));

        (new \Typost_Export($this->site))->import($file, array('include' => array()));
        $this->assertSame(array(), $this->storedStyles());
    }

    public function test_filename_names_the_site_and_date() {
        Functions\when('get_bloginfo')->justReturn('My Site');
        $this->assertMatchesRegularExpression('/^typography-my-site-\d{4}-\d{2}-\d{2}\.json$/', \Typost_Export::filename());
    }

    public function test_sections_without_callbacks_are_ignored() {
        Functions\when('apply_filters')->alias(function ($hook, $value) {
            return array(
                array('id' => 'broken', 'export' => 'nope'),
                array('id' => 'bad id!', 'export' => '__return_true', 'preview' => '__return_true', 'import' => '__return_true'),
            );
        });
        $this->assertSame(array(), (new \Typost_Export($this->site))->get_sections());
    }
}

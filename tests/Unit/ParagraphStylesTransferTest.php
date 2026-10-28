<?php
/**
 * Tests for paragraph styles in export files (#205): export, preview and
 * import, Based On chains, name collisions, and the font mapping.
 */

namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\ExportTestCase;
use Brain\Monkey\Functions;

class ParagraphStylesTransferTest extends ExportTestCase {

    /** Export from the current options and return the file text. */
    private function exportText($module, array $args = array()) {
        $result = $this->exportWith($module, $args + array('sections' => array('paragraphStyles')));
        $this->assertIsArray($result);
        return $this->fileText($result['file']);
    }

    private function export() {
        return new \Typost_Export($this->site);
    }

    private function parse($text) {
        $file = \Typost_Export::parse_file($text);
        $this->assertIsArray($file);
        return $file;
    }

    private function sourceSite() {
        $this->site->manual = array(array('id' => 'manual-serif', 'name' => 'House Serif', 'font_id' => 3, 'font_family' => 'House Serif', 'fallbacks' => 'serif'));
        return $this->module(array(
            array('id' => 4, 'name' => 'Body', 'legacyId' => 'ps_1_1', 'created' => '2026-01-01', 'modified' => '2026-01-01', 'properties' => array('fontId' => 3, 'lineHeight' => 1.5, 'initialHang' => 0.25)),
            array('id' => 7, 'name' => 'Body – First', 'basedOn' => 4, 'properties' => array('initialHang' => 0)),
            array('id' => 9, 'name' => 'Kicker', 'properties' => array('fontSize' => '14', 'textCase' => 'uppercase', 'letterSpacing' => 80)),
        ), 10);
    }

    // ---------------------------------------------------------------------
    // Export
    // ---------------------------------------------------------------------

    public function test_export_writes_file_keys_not_site_ids() {
        $text = $this->exportText($this->sourceSite());
        $file = json_decode($text, true);
        $styles = $file['sections']['paragraphStyles'];

        $this->assertSame(array('s1', 's2', 's3'), array_column($styles, 'key'));
        $this->assertSame('f1', $styles[0]['properties']['fontId']);
        $this->assertSame('s1', $styles[1]['basedOn']);
        $this->assertNull($styles[0]['basedOn']);
        // A child keeps only what it sets itself.
        $this->assertSame(array('initialHang' => 0), $styles[1]['properties']);
        $this->assertStringNotContainsString('legacyId', $text);
        $this->assertStringNotContainsString('"id"', $text);
        $this->assertSame('House Serif', $file['fonts']['f1']['name']);
    }

    public function test_exporting_a_child_adds_its_parents_and_says_so() {
        $module = $this->sourceSite();
        $result = $this->exportWith($module, array('sections' => array('paragraphStyles'), 'sectionArgs' => array('paragraphStyles' => array('styles' => array(7)))));

        $this->assertSame(array('Body', 'Body – First'), array_column($result['file']['sections']['paragraphStyles'], 'name'));
        $this->assertSame(array('“Body” was added because “Body – First” is based on it.'), $result['notes']);
    }

    public function test_a_selection_without_parents_exports_only_what_was_picked() {
        $result = $this->exportWith($this->sourceSite(), array('sections' => array('paragraphStyles'), 'sectionArgs' => array('paragraphStyles' => array('styles' => array(9)))));
        $this->assertSame(array('Kicker'), array_column($result['file']['sections']['paragraphStyles'], 'name'));
        $this->assertSame(array(), $result['notes']);
        $this->assertSame(array(), (array) $result['file']['fonts']);
    }

    public function test_a_style_whose_parent_was_deleted_exports_its_own_look() {
        $module = $this->module(array(array('id' => 2, 'name' => 'Orphan', 'basedOn' => 99, 'properties' => array('lineHeight' => 1.2, 'fontStyle' => ''))));
        $file = json_decode($this->exportText($module), true);
        $this->assertNull($file['sections']['paragraphStyles'][0]['basedOn']);
        $this->assertSame(array('lineHeight' => 1.2), $file['sections']['paragraphStyles'][0]['properties']);
    }

    public function test_a_font_that_no_longer_exists_is_left_out() {
        $module = $this->module(array(
            array('id' => 1, 'name' => 'Parent', 'properties' => array('fontId' => 50)),
            array('id' => 2, 'name' => 'Child', 'basedOn' => 1, 'properties' => array('fontId' => 51)),
        ));
        $file = json_decode($this->exportText($module), true);
        $this->assertArrayNotHasKey('fontId', (array) $file['sections']['paragraphStyles'][0]['properties']);
        // A child writes 0, so it does not take its parent's font instead.
        $this->assertSame(0, $file['sections']['paragraphStyles'][1]['properties']['fontId']);
    }

    // ---------------------------------------------------------------------
    // Same site: nothing changes
    // ---------------------------------------------------------------------

    public function test_import_on_the_same_site_changes_nothing() {
        $module = $this->sourceSite();
        $text = $this->exportText($module);
        $before = $this->options;

        $preview = $this->export()->preview($this->parse($text));
        $this->assertSame(array('found'), array_unique(array_column($preview['fonts'], 'status')));
        $items = $preview['sections']['paragraphStyles']['preview']['items'];
        $this->assertSame(array('skip'), array_unique(array_column($items, 'action')));
        $this->assertSame(array(), $preview['sections']['paragraphStyles']['preview']['warnings']);

        $result = $this->export()->import($this->parse($text), array());
        $this->assertSame(array('Body', 'Body – First', 'Kicker'), $result['sections']['paragraphStyles']['skipped']);
        $this->assertSame($before['typost_paragraph_styles'], $this->options['typost_paragraph_styles']);
        $this->assertSame($before['typost_paragraph_styles_next_id'], $this->options['typost_paragraph_styles_next_id']);
    }

    public function test_preview_names_the_styles_using_each_font() {
        $preview = $this->export()->preview($this->parse($this->exportText($this->sourceSite())));
        $this->assertSame(array('Body'), $preview['fonts'][0]['usedBy']);
        $this->assertNotEmpty($preview['siteFonts']);
    }

    // ---------------------------------------------------------------------
    // Another site
    // ---------------------------------------------------------------------

    public function test_import_on_another_site_adds_new_ids_and_remaps_parents_and_fonts() {
        $text = $this->exportText($this->sourceSite());

        // The target site: one unrelated style with ID 4 and a deleted ID 5
        // the counter has moved past; the font has another ID here.
        $this->site->manual = array(array('id' => 'manual-x', 'name' => 'House Serif', 'font_id' => 40, 'font_family' => 'House Serif'));
        $this->module(array(array('id' => 4, 'name' => 'Caption', 'properties' => array())), 6);

        $result = $this->export()->import($this->parse($text), array());
        $this->assertSame(array('Body', 'Body – First', 'Kicker'), $result['sections']['paragraphStyles']['added']);

        $body = $this->storedStyle('Body');
        $first = $this->storedStyle('Body – First');
        $kicker = $this->storedStyle('Kicker');
        $this->assertSame(array(6, 7, 8), array($body['id'], $first['id'], $kicker['id']));
        $this->assertSame(9, $this->options['typost_paragraph_styles_next_id']);
        $this->assertSame(40, $body['properties']['fontId']);
        $this->assertSame(6, $first['basedOn']);
        $this->assertSame(array('initialHang' => 0), $first['properties']);
        $this->assertArrayNotHasKey('legacyId', $body);
        $this->assertSame('2026-10-28', $body['created']);

        // The child resolves to its parent's look minus the hang, as it did
        // on the source site.
        $resolved = \Typost_Paragraph_Styles::resolve_properties($first, $this->storedStyles());
        $this->assertSame(array('fontId' => 40, 'lineHeight' => 1.5), $resolved);
    }

    public function test_ids_never_reuse_a_deleted_styles_id() {
        $text = $this->exportText($this->module(array(array('id' => 1, 'name' => 'A', 'properties' => array()))));
        // Styles 1 to 11 were deleted on this site; the counter remembers.
        $this->module(array(), 12);
        $this->export()->import($this->parse($text), array());
        $this->assertSame(12, $this->storedStyle('A')['id']);
        $this->assertSame(13, $this->options['typost_paragraph_styles_next_id']);
    }

    public function test_a_child_listed_before_its_parent_still_imports() {
        $file = $this->parse(json_encode(array(
            'format'   => 'typost-export',
            'version'  => 1,
            'sections' => array('paragraphStyles' => array(
                array('key' => 'c', 'name' => 'Child', 'basedOn' => 'p', 'properties' => array('fontStyle' => 'italic')),
                array('key' => 'p', 'name' => 'Parent', 'basedOn' => null, 'properties' => array('lineHeight' => 1.3)),
            )),
        )));
        $this->registerSection($this->module(array(), 1));

        $this->export()->import($file, array());
        $this->assertSame($this->storedStyle('Parent')['id'], $this->storedStyle('Child')['basedOn']);
    }

    public function test_a_font_that_is_not_found_gets_no_font_id_and_is_listed() {
        $text = $this->exportText($this->sourceSite());
        $this->site->manual = array();
        $this->module(array(), 1);

        $result = $this->export()->import($this->parse($text), array('fonts' => array('f1' => array('action' => 'none'))));
        $this->assertSame(array('House Serif'), $result['fonts']['notFound']);
        $this->assertArrayNotHasKey('fontId', $this->storedStyle('Body')['properties']);
    }

    public function test_a_font_definition_can_be_added_from_the_file() {
        $text = $this->exportText($this->sourceSite());
        $this->site->manual = array();
        $this->module(array(), 1);

        $preview = $this->export()->preview($this->parse($text));
        $this->assertSame('addable', $preview['fonts'][0]['status']);

        $result = $this->export()->import($this->parse($text), array());
        $this->assertSame(array('House Serif'), $result['fonts']['added']);
        $this->assertSame(100, $this->storedStyle('Body')['properties']['fontId']);
    }

    public function test_a_style_saved_before_rem_stays_without_a_unit() {
        $text = $this->exportText($this->sourceSite());
        $this->module(array(), 1);
        $this->export()->import($this->parse($text), array());
        $this->assertArrayNotHasKey('fontSizeUnit', $this->storedStyle('Kicker')['properties']);
        $this->assertSame('14', $this->storedStyle('Kicker')['properties']['fontSize']);
    }

    // ---------------------------------------------------------------------
    // Name collisions
    // ---------------------------------------------------------------------

    public function test_rename_adds_the_style_under_a_new_name() {
        $text = $this->exportText($this->sourceSite());
        $this->module(array(array('id' => 1, 'name' => 'kicker', 'properties' => array('lineHeight' => 2))), 2);

        $preview = $this->export()->preview($this->parse($text));
        $kicker = $preview['sections']['paragraphStyles']['preview']['items'][2];
        $this->assertTrue($kicker['exists']);
        $this->assertSame('kicker', $kicker['existingName']);
        $this->assertSame('skip', $kicker['action']);
        $this->assertSame('Kicker (2)', $kicker['suggestedName']);

        $result = $this->export()->import($this->parse($text), array('sections' => array('paragraphStyles' => array('s3' => array('action' => 'rename', 'name' => 'Kicker (2)')))));
        $this->assertSame(array(array('from' => 'Kicker', 'to' => 'Kicker (2)')), $result['sections']['paragraphStyles']['renamed']);
        $this->assertSame(array('lineHeight' => 2), $this->storedStyle('kicker')['properties']);
        $this->assertSame('uppercase', $this->storedStyle('Kicker (2)')['properties']['textCase']);
    }

    public function test_overwrite_keeps_the_id_name_and_legacy_id_and_lists_affected_styles() {
        $text = $this->exportText($this->sourceSite());
        $this->module(array(
            array('id' => 2, 'name' => 'body', 'legacyId' => 'ps_9_9', 'created' => '2025-05-05', 'properties' => array('lineHeight' => 2)),
            array('id' => 3, 'name' => 'Body Small', 'basedOn' => 2, 'properties' => array('fontSize' => '12')),
        ), 4);

        $preview = $this->export()->preview($this->parse($text));
        $this->assertSame(array('Body Small'), $preview['sections']['paragraphStyles']['preview']['items'][0]['affected']);

        $this->export()->import($this->parse($text), array('sections' => array('paragraphStyles' => array('s1' => array('action' => 'overwrite')))));
        $body = $this->storedStyle('body');
        $this->assertSame(2, $body['id']);
        $this->assertSame('ps_9_9', $body['legacyId']);
        $this->assertSame('2025-05-05', $body['created']);
        $this->assertSame(1.5, $body['properties']['lineHeight']);
        // Body – First is added and based on the overwritten style.
        $this->assertSame(2, $this->storedStyle('Body – First')['basedOn']);
    }

    public function test_import_never_changes_a_style_unless_overwrite_is_chosen() {
        $text = $this->exportText($this->sourceSite());
        $existing = array('id' => 2, 'name' => 'Body', 'properties' => array('lineHeight' => 2));
        $this->module(array($existing), 3);

        $this->export()->import($this->parse($text), array('sections' => array('paragraphStyles' => array('s1' => array('action' => 'skip')))));
        $this->assertSame($existing, $this->storedStyle('Body'));
    }

    public function test_a_skipped_parent_hands_its_children_to_the_style_on_this_site_with_a_warning() {
        $text = $this->exportText($this->sourceSite());
        // "Body" exists here with another line height.
        $this->site->manual = array(array('id' => 'manual-x', 'name' => 'House Serif', 'font_id' => 3, 'font_family' => 'House Serif'));
        $this->module(array(array('id' => 2, 'name' => 'Body', 'properties' => array('lineHeight' => 2))), 3);

        $preview = $this->export()->preview($this->parse($text));
        $warnings = $preview['sections']['paragraphStyles']['preview']['warnings'];
        $this->assertCount(1, $warnings);
        $this->assertStringContainsString('“Body – First” is based on “Body” on this site', $warnings[0]);

        $this->export()->import($this->parse($text), array());
        $this->assertSame(2, $this->storedStyle('Body – First')['basedOn']);
    }

    public function test_no_warning_when_the_style_on_this_site_looks_the_same() {
        $module = $this->sourceSite();
        $text = $this->exportText($module);
        // Same site, but "Body – First" deleted: it comes back based on Body.
        $styles = $this->storedStyles();
        array_splice($styles, 1, 1);
        $this->module($styles, 10);

        $result = $this->export()->import($this->parse($text), array());
        $this->assertSame(array('Body – First'), $result['sections']['paragraphStyles']['added']);
        $this->assertSame(array(), $result['sections']['paragraphStyles']['warnings']);
        $this->assertSame(4, $this->storedStyle('Body – First')['basedOn']);
    }

    public function test_a_child_whose_parent_is_left_out_keeps_its_look_standalone() {
        $text = $this->exportText($this->sourceSite());
        $this->site->manual = array(array('id' => 'manual-x', 'name' => 'House Serif', 'font_id' => 3, 'font_family' => 'House Serif'));
        $this->module(array(), 1);

        $this->export()->import($this->parse($text), array('sections' => array('paragraphStyles' => array('s1' => array('action' => 'skip')))));
        $first = $this->storedStyle('Body – First');
        $this->assertArrayNotHasKey('basedOn', $first);
        $this->assertSame(array('fontId' => 3, 'lineHeight' => 1.5), $first['properties']);
    }

    public function test_two_styles_with_one_name_in_the_file_start_as_add_and_rename() {
        $file = $this->parse(json_encode(array(
            'format'   => 'typost-export',
            'version'  => 1,
            'sections' => array('paragraphStyles' => array(
                array('key' => 'a', 'name' => 'Note', 'properties' => array()),
                array('key' => 'b', 'name' => 'note', 'properties' => array('lineHeight' => 1.1)),
            )),
        )));
        $this->registerSection($this->module(array(), 1));

        $items = $this->export()->preview($file)['sections']['paragraphStyles']['preview']['items'];
        $this->assertSame(array('add', 'rename'), array_column($items, 'action'));
        $this->assertSame('note (2)', $items[1]['suggestedName']);

        $error = $this->export()->import($file, array('sections' => array('paragraphStyles' => array('b' => array('action' => 'add')))));
        $this->assertInstanceOf(\WP_Error::class, $error);
        $this->assertSame(array(), $this->storedStyles());

        // With no choice sent, the import takes the preview's defaults.
        $this->export()->import($file, array());
        $this->assertSame(array('Note', 'note (2)'), array_column($this->storedStyles(), 'name'));
    }

    /**
     * @dataProvider invalidChoices
     */
    public function test_invalid_choices_save_nothing($choice, $message) {
        $text = $this->exportText($this->sourceSite());
        $this->module(array(array('id' => 2, 'name' => 'Kicker', 'properties' => array())), 3);
        $before = $this->options;

        $result = $this->export()->import($this->parse($text), array('sections' => array('paragraphStyles' => array('s3' => $choice))));
        $this->assertInstanceOf(\WP_Error::class, $result);
        $this->assertStringContainsString($message, $result->get_error_message());
        $this->assertStringContainsString('Nothing was saved', $result->get_error_message());
        $this->assertSame($before, $this->options);
    }

    public function invalidChoices() {
        return array(
            'add over an existing name'   => array(array('action' => 'add'), 'already exists'),
            'rename to an existing name'  => array(array('action' => 'rename', 'name' => 'kicker'), 'already exists'),
            'rename to nothing'           => array(array('action' => 'rename', 'name' => '  '), 'Style name is required'),
            'unknown action'              => array(array('action' => 'merge'), 'not valid'),
        );
    }

    public function test_overwrite_needs_a_style_with_that_name() {
        $text = $this->exportText($this->sourceSite());
        $this->module(array(), 1);
        $result = $this->export()->import($this->parse($text), array('sections' => array('paragraphStyles' => array('s3' => array('action' => 'overwrite')))));
        $this->assertStringContainsString('no style with this name', $result->get_error_message());
    }

    public function test_an_overwrite_that_would_make_a_loop_is_rejected() {
        // File: A based on B. Site: B based on A. Overwriting A to be based
        // on B (skipped, so the site's B) would loop.
        $file = $this->parse(json_encode(array(
            'format'   => 'typost-export',
            'version'  => 1,
            'sections' => array('paragraphStyles' => array(
                array('key' => 'b', 'name' => 'B', 'properties' => array()),
                array('key' => 'a', 'name' => 'A', 'basedOn' => 'b', 'properties' => array()),
            )),
        )));
        $this->registerSection($this->module(array(
            array('id' => 1, 'name' => 'A', 'properties' => array()),
            array('id' => 2, 'name' => 'B', 'basedOn' => 1, 'properties' => array()),
        ), 3));
        $before = $this->options;

        $result = $this->export()->import($file, array('sections' => array('paragraphStyles' => array('a' => array('action' => 'overwrite')))));
        $this->assertStringContainsString('cannot be based on itself', $result->get_error_message());
        $this->assertSame($before, $this->options);
    }

    // ---------------------------------------------------------------------
    // Files the section rejects
    // ---------------------------------------------------------------------

    /**
     * @dataProvider invalidSections
     */
    public function test_a_section_that_cannot_be_read_is_rejected($styles, $message) {
        $this->registerSection($this->module(array(), 1));
        $file = $this->parse(json_encode(array('format' => 'typost-export', 'version' => 1, 'sections' => array('paragraphStyles' => $styles))));

        $preview = $this->export()->preview($file);
        $this->assertInstanceOf(\WP_Error::class, $preview);
        $this->assertStringContainsString($message, $preview->get_error_message());
        $this->assertInstanceOf(\WP_Error::class, $this->export()->import($file, array()));
        $this->assertSame(array(), $this->storedStyles());
    }

    public function invalidSections() {
        $chain = array();
        for ($i = 1; $i <= 11; $i++) {
            $chain[] = array('key' => 's' . $i, 'name' => 'Level ' . $i, 'basedOn' => $i > 1 ? 's' . ($i - 1) : null, 'properties' => array());
        }
        return array(
            'not a list'        => array(array('a' => array('key' => 'a', 'name' => 'A')), 'cannot be read'),
            'no key'            => array(array(array('name' => 'A')), 'cannot be read'),
            'bad key'           => array(array(array('key' => 'a b', 'name' => 'A')), 'cannot be read'),
            'duplicate key'     => array(array(array('key' => 'a', 'name' => 'A'), array('key' => 'a', 'name' => 'B')), 'cannot be read'),
            'no name'           => array(array(array('key' => 'a', 'name' => ' ')), 'cannot be read'),
            'missing parent'    => array(array(array('key' => 'a', 'name' => 'A', 'basedOn' => 'zz')), 'cannot be read'),
            'self parent'       => array(array(array('key' => 'a', 'name' => 'A', 'basedOn' => 'a')), 'cannot be read'),
            'bad properties'    => array(array(array('key' => 'a', 'name' => 'A', 'properties' => 'big')), 'cannot be read'),
            'loop'              => array(array(array('key' => 'a', 'name' => 'A', 'basedOn' => 'b'), array('key' => 'b', 'name' => 'B', 'basedOn' => 'a')), 'cannot be based on itself'),
            'chain of 11'       => array($chain, 'at most 10 styles'),
        );
    }

    // ---------------------------------------------------------------------
    // Sanitizing and font support warnings
    // ---------------------------------------------------------------------

    public function test_imported_values_go_through_the_create_routes_sanitizing() {
        $this->registerSection($this->module(array(), 1));
        $file = $this->parse(json_encode(array(
            'format'   => 'typost-export',
            'version'  => 1,
            'sections' => array('paragraphStyles' => array(array('key' => 'a', 'name' => 'A', 'properties' => array(
                'fontStyle'  => 'wild',
                'textCase'   => 'shout',
                'fontId'     => 12,
                'evil'       => '<script>',
                'lineHeight' => '1.23456',
            )))),
        )));
        $this->export()->import($file, array());

        // A numeric font ID is the source site's, so it means no font here.
        $this->assertSame(array('lineHeight' => 1.235), $this->storedStyle('A')['properties']);
    }

    public function test_warns_when_features_are_hidden_or_axes_are_not_defined_for_the_mapped_font() {
        $this->site->manual = array(array('id' => 'manual-v', 'name' => 'Var', 'font_id' => 3, 'font_family' => 'Var'));
        $this->site->visibility = array(3 => array('disabled_features' => array('swsh', 'ss02')));
        $module = $this->module(array(array('id' => 1, 'name' => 'Display', 'properties' => array(
            'fontId'                => 3,
            'features'              => array('liga', 'swsh'),
            'fontVariationSettings' => '"wght" 600, "SOFT" 50',
        ))));
        $text = $this->exportText($module);
        $this->module(array(), 1);

        // The section, plus Variable Fonts answering "wght only" for the font.
        $transfer = new \Typost_PS_Transfer($module);
        Functions\when('apply_filters')->alias(function ($hook, $value) use ($transfer) {
            if ('typost_export_sections' === $hook) {
                return $transfer->register_section($value);
            }
            return 'typost_font_axis_tags' === $hook ? array('wght') : $value;
        });

        $result = $this->export()->import($this->parse($text), array());
        $warnings = $result['sections']['paragraphStyles']['warnings'];
        $this->assertCount(2, $warnings);
        $this->assertStringContainsString('hidden for Var in Feature Visibility', $warnings[0]);
        $this->assertStringContainsString(': swsh.', $warnings[0]);
        $this->assertStringContainsString('not defined for Var', $warnings[1]);
        $this->assertStringContainsString(': SOFT.', $warnings[1]);
    }

    public function test_unique_name_counts_up() {
        $this->assertSame('A', \Typost_PS_Transfer::unique_name('A', array()));
        $this->assertSame('A (3)', \Typost_PS_Transfer::unique_name('A', array('a' => true, 'a (2)' => true)));
    }
}

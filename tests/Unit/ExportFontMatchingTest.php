<?php
/**
 * Tests for fonts in export files (#205): descriptors, the matching chain,
 * and the author's font choices.
 */

namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\ExportTestCase;
use Brain\Monkey\Functions;

class ExportFontMatchingTest extends ExportTestCase {

    private function fonts() {
        return new \Typost_Export_Fonts($this->site);
    }

    private function descriptor(array $fields) {
        return \Typost_Export_Fonts::sanitize_descriptor($fields);
    }

    private function match(array $fields) {
        return \Typost_Export_Fonts::match_descriptor($this->descriptor($fields), $this->fonts()->get_local_fonts());
    }

    private function adobe($font_id, $kit, $family) {
        return array(
            'id'          => 'adobe-' . $kit . '-' . strtolower($family),
            'name'        => $family,
            'font_id'     => $font_id,
            'font_family' => $family,
            'kit_id'      => 'adobe-' . $kit,
            'kit_name'    => 'Project ' . $kit,
            'css_url'     => 'https://use.typekit.net/' . $kit . '.css',
        );
    }

    // ---------------------------------------------------------------------
    // Descriptors (export)
    // ---------------------------------------------------------------------

    public function test_each_source_writes_its_portable_fields() {
        $this->site->custom = array(array('id' => 'kit-1-x', 'name' => 'Inter Kit', 'font_id' => 1, 'font_faces' => array(array('family' => 'Inter')), 'wp_slug' => 'inter-2', 'fallbacks' => 'sans-serif'));
        $this->site->adobe = array($this->adobe(2, 'abc1234', 'Proxima Nova') + array('available_weights' => array('400', '700')));
        $this->site->manual = array(array('id' => 'manual-x', 'name' => 'Theme Serif', 'font_id' => 3, 'font_family' => '"Theme Serif"', 'fallbacks' => 'serif'));
        $this->site->adopted = array(array('id' => 'wpl-eb', 'name' => 'EB Garamond', 'wp_slug' => 'eb-garamond', 'font_id' => 4, 'font_family' => '"EB Garamond", serif'));

        $fonts = $this->fonts();
        foreach (array(1, 2, 3, 4) as $id) {
            $fonts->key_for_font_id($id);
        }
        $d = $fonts->get_descriptors();

        $this->assertSame(array('source' => 'kit', 'name' => 'Inter Kit', 'family' => 'Inter', 'slug' => 'inter-2', 'fallbacks' => 'sans-serif'), $d['f1']);
        $this->assertSame('adobe', $d['f2']['source']);
        $this->assertSame('abc1234', $d['f2']['kit']);
        $this->assertSame('https://use.typekit.net/abc1234.css', $d['f2']['cssUrl']);
        $this->assertSame(array('400', '700'), $d['f2']['availableWeights']);
        $this->assertSame(array('source' => 'manual', 'name' => 'Theme Serif', 'family' => 'Theme Serif', 'fontFamily' => '"Theme Serif"', 'fallbacks' => 'serif'), $d['f3']);
        $this->assertSame(array('source' => 'library', 'name' => 'EB Garamond', 'family' => 'EB Garamond', 'slug' => 'eb-garamond'), $d['f4']);
    }

    public function test_a_font_gets_one_key_however_often_it_is_used() {
        $this->site->manual = array(array('id' => 'm', 'name' => 'A', 'font_id' => 7, 'font_family' => 'A'));
        $fonts = $this->fonts();
        $this->assertSame('f1', $fonts->key_for_font_id(7));
        $this->assertSame('f1', $fonts->key_for_font_id(7));
        $this->assertCount(1, $fonts->get_descriptors());
    }

    public function test_a_deleted_font_is_exported_as_its_replacement() {
        $this->site->manual = array(array('id' => 'm', 'name' => 'Now', 'font_id' => 9, 'font_family' => 'Now'));
        $this->site->mappings = array(5 => 6, 6 => 9);

        $fonts = $this->fonts();
        $this->assertSame('f1', $fonts->key_for_font_id(5));
        $this->assertSame('Now', $fonts->get_descriptors()['f1']['name']);
    }

    public function test_a_deleted_font_without_replacement_has_no_key() {
        $this->site->mappings = array(5 => 6, 6 => 5);
        $this->assertNull($this->fonts()->key_for_font_id(5));
        $this->assertNull($this->fonts()->key_for_font_id(0));
    }

    // ---------------------------------------------------------------------
    // Sanitizing a descriptor (import)
    // ---------------------------------------------------------------------

    public function test_a_css_url_must_be_the_projects_typekit_stylesheet() {
        $ok = $this->descriptor(array('source' => 'adobe', 'family' => 'X', 'kit' => 'abc1234', 'cssUrl' => 'https://use.typekit.net/abc1234.css'));
        $this->assertSame('https://use.typekit.net/abc1234.css', $ok['cssUrl']);

        foreach (array('https://evil.example/abc1234.css', 'https://use.typekit.net/other99.css', 'http://use.typekit.net/abc1234.css', 'https://use.typekit.net/abc1234.css?x=<script>') as $url) {
            $d = $this->descriptor(array('source' => 'adobe', 'family' => 'X', 'kit' => 'abc1234', 'cssUrl' => $url));
            $this->assertSame('', $d['cssUrl'], $url);
        }
    }

    public function test_a_descriptor_needs_a_name_or_family() {
        $this->assertNull($this->descriptor(array('source' => 'kit')));
        $this->assertNull(\Typost_Export_Fonts::sanitize_descriptor('Inter'));
        $this->assertNotNull($this->descriptor(array('name' => 'Inter')));
    }

    public function test_unknown_sources_and_bad_weights_are_dropped() {
        $d = $this->descriptor(array('source' => 'ftp', 'family' => 'X', 'availableWeights' => array('400', 'bold', 2000, 700)));
        $this->assertSame('', $d['source']);
        $this->assertSame(array('400', '700'), $d['availableWeights']);
    }

    public function test_first_family_reads_a_font_family_stack() {
        $this->assertSame('EB Garamond', \Typost_Export_Fonts::first_family('"EB Garamond", Georgia, serif'));
        $this->assertSame('Inter', \Typost_Export_Fonts::first_family(" 'Inter' "));
        $this->assertSame('eb garamond', \Typost_Export_Fonts::normalize_family('"EB Garamond", serif'));
    }

    // ---------------------------------------------------------------------
    // The matching chain
    // ---------------------------------------------------------------------

    public function test_adobe_project_and_family_match_first() {
        $this->site->adobe = array($this->adobe(2, 'abc1234', 'Proxima Nova'), $this->adobe(3, 'zzz9999', 'Proxima Nova'));
        $result = $this->match(array('source' => 'adobe', 'family' => 'Proxima Nova', 'kit' => 'abc1234'));
        $this->assertSame(array('status' => 'found', 'candidates' => array('id:2')), $result);
    }

    public function test_library_slug_needs_the_family_too() {
        $this->site->adopted = array(
            array('id' => 'wpl-a', 'name' => 'Lora', 'wp_slug' => 'lora', 'font_id' => 5, 'font_family' => 'Lora'),
            array('id' => 'wpl-b', 'name' => 'Other', 'wp_slug' => 'lora-2', 'font_id' => 6, 'font_family' => 'Other'),
        );
        // lora-2 is another family here, so the slug alone does not match;
        // the family step then finds Lora.
        $result = $this->match(array('source' => 'library', 'family' => 'Lora', 'slug' => 'lora-2'));
        $this->assertSame(array('status' => 'found', 'candidates' => array('id:5')), $result);
    }

    public function test_family_matches_case_insensitively_across_sources() {
        $this->site->manual = array(array('id' => 'm', 'name' => 'Brand', 'font_id' => 4, 'font_family' => '"inter", sans-serif'));
        $result = $this->match(array('source' => 'kit', 'family' => 'Inter', 'name' => 'Inter Kit'));
        $this->assertSame(array('status' => 'found', 'candidates' => array('id:4')), $result);
    }

    public function test_display_name_is_the_last_step() {
        $this->site->manual = array(array('id' => 'm', 'name' => 'House Sans', 'font_id' => 4, 'font_family' => 'HouseSansWeb'));
        $result = $this->match(array('source' => 'kit', 'family' => 'HouseSans', 'name' => 'house sans'));
        $this->assertSame(array('status' => 'found', 'candidates' => array('id:4')), $result);
    }

    public function test_two_fonts_at_the_first_matching_step_are_ambiguous() {
        $this->site->custom = array(
            array('id' => 'kit-a', 'name' => 'Inter A', 'font_id' => 1, 'font_faces' => array(array('family' => 'Inter'))),
            array('id' => 'kit-b', 'name' => 'Inter B', 'font_id' => 2, 'font_faces' => array(array('family' => 'Inter'))),
        );
        $result = $this->match(array('source' => 'kit', 'family' => 'Inter', 'name' => 'Inter A'));
        $this->assertSame('ambiguous', $result['status']);
        $this->assertSame(array('id:1', 'id:2'), $result['candidates']);
    }

    public function test_an_earlier_step_with_one_match_wins_over_a_later_tie() {
        $this->site->adobe = array($this->adobe(2, 'abc1234', 'Inter'));
        $this->site->custom = array(array('id' => 'kit-a', 'name' => 'Inter', 'font_id' => 1, 'font_faces' => array(array('family' => 'Inter'))));
        $result = $this->match(array('source' => 'adobe', 'family' => 'Inter', 'kit' => 'abc1234'));
        $this->assertSame(array('status' => 'found', 'candidates' => array('id:2')), $result);
    }

    public function test_a_kit_registered_in_the_library_is_one_candidate() {
        $this->site->custom = array(array('id' => 'kit-a', 'name' => 'Lora', 'font_id' => 1, 'font_faces' => array(array('family' => 'Lora')), 'wp_slug' => 'lora'));
        $this->site->library = array(array('slug' => 'lora', 'name' => 'Lora', 'font_family' => 'Lora'));
        $result = $this->match(array('source' => 'library', 'family' => 'Lora', 'slug' => 'lora'));
        $this->assertSame(array('status' => 'found', 'candidates' => array('id:1')), $result);
    }

    public function test_a_library_font_not_adopted_yet_is_a_candidate() {
        $this->site->library = array(array('slug' => 'lora', 'name' => 'Lora', 'font_family' => 'Lora, serif'));
        $result = $this->match(array('source' => 'library', 'family' => 'Lora', 'slug' => 'lora'));
        $this->assertSame(array('status' => 'found', 'candidates' => array('wpl:lora')), $result);
    }

    public function test_no_match_is_addable_for_adobe_and_definitions_only() {
        $adobe = $this->match(array('source' => 'adobe', 'family' => 'X', 'kit' => 'abc1234', 'cssUrl' => 'https://use.typekit.net/abc1234.css'));
        $manual = $this->match(array('source' => 'manual', 'family' => 'X', 'name' => 'X'));
        $kit = $this->match(array('source' => 'kit', 'family' => 'X', 'name' => 'X'));
        $adobe_without_url = $this->match(array('source' => 'adobe', 'family' => 'X', 'kit' => 'abc1234'));

        $this->assertSame('addable', $adobe['status']);
        $this->assertSame('addable', $manual['status']);
        $this->assertSame('not_found', $kit['status']);
        $this->assertSame('not_found', $adobe_without_url['status']);
    }

    // ---------------------------------------------------------------------
    // Preview and choices
    // ---------------------------------------------------------------------

    public function test_preview_starts_with_the_match_and_labels_candidates() {
        $this->site->custom = array(
            array('id' => 'kit-a', 'name' => 'Inter A', 'font_id' => 1, 'font_faces' => array(array('family' => 'Inter'))),
            array('id' => 'kit-b', 'name' => 'Inter B', 'font_id' => 2, 'font_faces' => array(array('family' => 'Inter'))),
        );
        $rows = $this->fonts()->preview(array(
            'f1' => $this->descriptor(array('source' => 'kit', 'family' => 'Inter', 'name' => 'Inter')),
            'f2' => $this->descriptor(array('source' => 'manual', 'family' => 'X', 'name' => 'X')),
            'f3' => $this->descriptor(array('source' => 'kit', 'family' => 'Y', 'name' => 'Y')),
        ));

        $this->assertSame('ambiguous', $rows[0]['status']);
        $this->assertSame(array('action' => 'map', 'target' => ''), $rows[0]['choice']);
        $this->assertSame('Inter A (Inter, uploaded)', $rows[0]['candidates'][0]['label']);
        $this->assertSame(array('action' => 'add'), $rows[1]['choice']);
        $this->assertSame(array('action' => 'none'), $rows[2]['choice']);
    }

    public function test_an_ambiguous_font_needs_a_choice() {
        $this->site->custom = array(
            array('id' => 'kit-a', 'name' => 'A', 'font_id' => 1, 'font_faces' => array(array('family' => 'Inter'))),
            array('id' => 'kit-b', 'name' => 'B', 'font_id' => 2, 'font_faces' => array(array('family' => 'Inter'))),
        );
        $descriptors = array('f1' => $this->descriptor(array('source' => 'kit', 'family' => 'Inter', 'name' => 'Inter')));

        $error = $this->fonts()->validate_choices($descriptors, array());
        $this->assertInstanceOf(\WP_Error::class, $error);
        $this->assertStringContainsString('Choose a font on this site for “Inter”', $error->get_error_message());

        $ok = $this->fonts()->validate_choices($descriptors, array('f1' => array('action' => 'map', 'target' => 'id:2')));
        $this->assertSame(array('f1' => array('action' => 'map', 'target' => 'id:2')), $ok);
    }

    public function test_the_author_can_map_to_any_font_on_the_site() {
        $this->site->manual = array(array('id' => 'm', 'name' => 'Other', 'font_id' => 8, 'font_family' => 'Other'));
        $descriptors = array('f1' => $this->descriptor(array('source' => 'kit', 'family' => 'Inter', 'name' => 'Inter')));
        $ok = $this->fonts()->validate_choices($descriptors, array('f1' => array('action' => 'map', 'target' => 'id:8')));
        $this->assertSame('id:8', $ok['f1']['target']);
    }

    public function test_invalid_choices_are_rejected() {
        $descriptors = array('f1' => $this->descriptor(array('source' => 'kit', 'family' => 'Inter', 'name' => 'Inter')));
        $fonts = $this->fonts();

        $this->assertInstanceOf(\WP_Error::class, $fonts->validate_choices($descriptors, array('f1' => array('action' => 'map', 'target' => 'id:999'))));
        $this->assertStringContainsString('cannot be added', $fonts->validate_choices($descriptors, array('f1' => array('action' => 'add')))->get_error_message());
        $this->assertInstanceOf(\WP_Error::class, $fonts->validate_choices($descriptors, array('f1' => array('action' => 'delete'))));
    }

    public function test_commit_adds_adopts_and_reports_fonts_not_found() {
        $this->site->library = array(array('slug' => 'lora', 'name' => 'Lora', 'font_family' => 'Lora'));
        $descriptors = array(
            'f1' => $this->descriptor(array('source' => 'adobe', 'family' => 'Proxima Nova', 'kit' => 'abc1234', 'cssUrl' => 'https://use.typekit.net/abc1234.css', 'kitName' => 'Brand')),
            'f2' => $this->descriptor(array('source' => 'library', 'family' => 'Lora', 'slug' => 'lora', 'name' => 'Lora')),
            'f3' => $this->descriptor(array('source' => 'kit', 'family' => 'Gone', 'name' => 'Gone')),
        );
        $fonts = $this->fonts();
        $choices = $fonts->validate_choices($descriptors, array());
        $result = $fonts->commit($descriptors, $choices);

        $this->assertSame(array('Proxima Nova'), $result['added']);
        $this->assertSame(array('Gone'), $result['notFound']);
        $this->assertSame(100, $fonts->import_font_id('f1'));
        $this->assertSame(101, $fonts->import_font_id('f2'));
        $this->assertSame(0, $fonts->import_font_id('f3'));
        $this->assertSame(0, $fonts->import_font_id('nope'));
        $this->assertSame('lora', $this->site->adopted[0]['wp_slug']);
    }

    public function test_a_dry_run_maps_existing_fonts_and_writes_nothing() {
        $this->site->manual = array(array('id' => 'm', 'name' => 'Inter', 'font_id' => 4, 'font_family' => 'Inter'));
        $this->site->library = array(array('slug' => 'lora', 'name' => 'Lora', 'font_family' => 'Lora'));
        $descriptors = array(
            'f1' => $this->descriptor(array('source' => 'kit', 'family' => 'Inter', 'name' => 'Inter')),
            'f2' => $this->descriptor(array('source' => 'library', 'family' => 'Lora', 'slug' => 'lora')),
        );
        $fonts = $this->fonts();
        $fonts->plan_import_ids($fonts->validate_choices($descriptors, array()));

        $this->assertSame(4, $fonts->import_font_id('f1'));
        $this->assertSame(0, $fonts->import_font_id('f2'));
        $this->assertSame(array(), $this->site->adopted);
    }

    // ---------------------------------------------------------------------
    // What a font supports
    // ---------------------------------------------------------------------

    public function test_hidden_features_and_axis_tags() {
        $this->site->visibility = array(4 => array('disabled_features' => array('ss01', 'swsh')));
        $fonts = $this->fonts();
        $this->assertSame(array('ss01', 'swsh'), $fonts->hidden_features(4));
        $this->assertSame(array(), $fonts->hidden_features(5));

        Functions\when('apply_filters')->alias(function ($hook, $value, $font_id = 0) {
            return 'typost_font_axis_tags' === $hook && 4 === $font_id ? array('wght') : $value;
        });
        $this->assertSame(array('wght'), $fonts->axis_tags(4));
        $this->assertNull($fonts->axis_tags(5));
    }
}

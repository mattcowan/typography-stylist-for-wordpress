<?php
/**
 * Presets, options, Feature Visibility and variable font axes in export
 * files (#205 step 2).
 */

namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\ExportTestCase;
use Brain\Monkey\Functions;

class ExportSettingsTest extends ExportTestCase {

    protected function setUp(): void {
        parent::setUp();
        $this->registerSection($this->module());
    }

    /** The source site's font: a definition with font ID 3. */
    private function sourceFont() {
        $this->site->manual = array(array('id' => 'manual-a', 'name' => 'Brand', 'font_id' => 3, 'font_family' => 'Brand'));
    }

    /** The same font on the other site, with another ID. */
    private function targetFont() {
        $this->site->manual = array(array('id' => 'manual-b', 'name' => 'Brand', 'font_id' => 30, 'font_family' => 'Brand'));
    }

    /**
     * Export these sections and return the file's text.
     *
     * @param string[] $sections Section ids.
     * @return string
     */
    private function exportText(array $sections) {
        $result = $this->exportWith($this->module(), array('sections' => $sections));
        $this->assertIsArray($result);
        return $this->fileText($result['file']);
    }

    private function preview($text) {
        return (new \Typost_Export($this->site))->preview(\Typost_Export::parse_file($text));
    }

    private function import($text, array $choices = array()) {
        return (new \Typost_Export($this->site))->import(\Typost_Export::parse_file($text), $choices);
    }

    /** A file with only these sections, built by hand. */
    private function file(array $sections, array $fonts = array()) {
        return json_encode(array(
            'format'   => 'typost-export',
            'version'  => 1,
            'plugin'   => '2.3.5',
            'exported' => '2026-10-29',
            'fonts'    => $fonts ? $fonts : new \stdClass(),
            'sections' => $sections,
        ));
    }

    // ---------------------------------------------------------------------
    // The shared option sanitizer
    // ---------------------------------------------------------------------

    public function test_checkbox_values_are_stored_as_one_or_zero() {
        foreach (array('1', 1, true, 'true', 'on', 'yes') as $on) {
            $this->assertSame('1', \Typost_Admin_Options::sanitize('typost_block_enter_line_break', $on), var_export($on, true));
        }
        foreach (array('0', 0, false, 'false', 'FALSE', '', null, array('1')) as $off) {
            $this->assertSame('0', \Typost_Admin_Options::sanitize('typost_block_enter_line_break', $off), var_export($off, true));
        }
    }

    public function test_the_color_scheme_accepts_only_known_schemes() {
        $this->assertSame('dark', \Typost_Admin_Options::sanitize('typost_admin_color_scheme', 'dark'));
        $this->assertSame('default', \Typost_Admin_Options::sanitize('typost_admin_color_scheme', 'neon'));
        $this->assertSame('default', \Typost_Admin_Options::sanitize('typost_admin_color_scheme', array('dark')));
    }

    public function test_the_current_value_uses_the_default_and_reads_old_booleans() {
        $definitions = \Typost_Admin_Options::definitions($this->site);
        $this->assertSame('1', \Typost_Admin_Options::current('typost_block_enter_line_break', $definitions['typost_block_enter_line_break']));
        $this->assertSame('alice-blue', \Typost_Admin_Options::current('typost_admin_color_scheme', $definitions['typost_admin_color_scheme']));
        $this->options['typost_show_clear_confirmation'] = false;
        $this->assertSame('0', \Typost_Admin_Options::current('typost_show_clear_confirmation', $definitions['typost_show_clear_confirmation']));
    }

    public function test_the_font_library_option_is_left_out_where_there_is_no_library() {
        $this->assertArrayHasKey('typost_auto_register_wp_fonts', \Typost_Admin_Options::definitions($this->site));
        $this->site->library_available = false;
        $this->assertArrayNotHasKey('typost_auto_register_wp_fonts', \Typost_Admin_Options::definitions($this->site));
    }

    public function test_extension_options_take_their_label_from_the_filter() {
        $this->site->extension_options = array('typost_glyphs_toolbar_button', 'typost_other_extension');
        Functions\when('apply_filters')->alias(function ($hook, $value) {
            if ('typost_export_option_details' === $hook) {
                $value['typost_glyphs_toolbar_button'] = array('label' => 'Glyphs button', 'default' => true);
            }
            return $value;
        });
        $definitions = \Typost_Admin_Options::definitions($this->site);
        $this->assertSame(array('label' => 'Glyphs button', 'type' => 'bool', 'default' => true), $definitions['typost_glyphs_toolbar_button']);
        $this->assertSame(array('label' => 'typost_other_extension', 'type' => 'bool', 'default' => false), $definitions['typost_other_extension']);
    }

    // ---------------------------------------------------------------------
    // Options
    // ---------------------------------------------------------------------

    public function test_options_export_every_value_this_site_has() {
        $this->options['typost_new_font_sizes_px'] = '1';
        $this->options['typost_admin_color_scheme'] = 'dark';
        $file = json_decode($this->exportText(array('options')), true);
        $options = $file['sections']['options'];

        $this->assertSame('1', $options['typost_new_font_sizes_px']);
        $this->assertSame('dark', $options['typost_admin_color_scheme']);
        $this->assertSame('1', $options['typost_block_enter_line_break']);
        // Extension checkboxes travel too.
        $this->assertArrayHasKey('typost_glyphs_toolbar_button', $options);
        $this->assertArrayNotHasKey('typost_presets', $options);
    }

    public function test_the_same_site_sees_no_option_to_choose_and_imports_without_choices() {
        $text = $this->exportText(array('options'));
        $before = $this->options;

        $preview = $this->preview($text);
        $this->assertSame(array(), $preview['sections']['options']['preview']['rows']);
        $this->assertSame(array('Every option in the file has the same value on this site.'), $preview['sections']['options']['preview']['notes']);

        $this->assertIsArray($this->import($text));
        $this->assertSame($before, $this->options);
    }

    public function test_an_option_that_differs_has_no_default_choice() {
        $text = $this->file(array('options' => array('typost_new_font_sizes_px' => '1', 'typost_block_enter_line_break' => '1')));
        $rows = $this->preview($text)['sections']['options']['preview']['rows'];

        $this->assertCount(1, $rows);
        $this->assertSame('typost_new_font_sizes_px', $rows[0]['key']);
        $this->assertSame('Write new font sizes in px', $rows[0]['name']);
        $this->assertSame('Off', $rows[0]['current']);
        $this->assertSame('On', $rows[0]['incoming']);
        $this->assertSame('', $rows[0]['choice']);
        $this->assertSame(array('keep', 'apply'), array_column($rows[0]['choices'], 'value'));
    }

    public function test_an_import_without_a_choice_for_a_differing_option_saves_nothing() {
        $this->sourceFont();
        $module = $this->module(array(array('id' => 1, 'name' => 'Body', 'properties' => array('fontId' => 3))));
        $file = $this->exportWith($module, array('sections' => array('paragraphStyles')))['file'];
        $file['sections']['options'] = array('typost_new_font_sizes_px' => '1');
        $text = $this->fileText($file);

        $this->module(array(), 1);
        $result = $this->import($text);

        $this->assertInstanceOf(\WP_Error::class, $result);
        $this->assertSame('typost_import_option_choice', $result->get_error_code());
        $this->assertSame(array(), $this->storedStyles());
        $this->assertArrayNotHasKey('typost_new_font_sizes_px', $this->options);
    }

    public function test_use_the_value_in_the_file_or_keep_the_value_here() {
        $this->options['typost_admin_color_scheme'] = 'dark';
        $text = $this->file(array('options' => array('typost_new_font_sizes_px' => '1', 'typost_admin_color_scheme' => 'high-contrast')));

        $result = $this->import($text, array('sections' => array('options' => array(
            'typost_new_font_sizes_px'  => 'apply',
            'typost_admin_color_scheme' => 'keep',
        ))));

        $this->assertIsArray($result);
        $this->assertSame('1', $this->options['typost_new_font_sizes_px']);
        $this->assertSame('dark', $this->options['typost_admin_color_scheme']);
        $this->assertSame(1, $this->site->cache_cleared);
        $this->assertSame(array(
            array('heading' => 'Options changed', 'items' => array('Write new font sizes in px: On')),
            array('heading' => 'Options kept', 'items' => array('Admin Color Scheme')),
        ), $result['sections']['options']['groups']);
    }

    public function test_file_values_are_sanitized_and_unknown_options_are_never_written() {
        $text = $this->file(array('options' => array(
            'typost_admin_color_scheme' => 'neon',
            'siteurl'                   => 'https://attacker.example',
            'typost_presets'            => array(),
        )));
        $preview = $this->preview($text)['sections']['options']['preview'];
        $this->assertSame('Default', $preview['rows'][0]['incoming']);
        $this->assertStringContainsString('siteurl, typost_presets', $preview['notes'][0]);

        $this->import($text, array('sections' => array('options' => array('typost_admin_color_scheme' => 'apply'))));
        $this->assertSame('default', $this->options['typost_admin_color_scheme']);
        $this->assertArrayNotHasKey('siteurl', $this->options);
        $this->assertArrayNotHasKey('typost_presets', $this->options);
    }

    public function test_an_options_section_that_is_a_list_is_rejected() {
        $result = $this->preview($this->file(array('options' => array('1', '0'))));
        $this->assertInstanceOf(\WP_Error::class, $result);
    }

    // ---------------------------------------------------------------------
    // Presets
    // ---------------------------------------------------------------------

    private function storePresets() {
        $this->options['typost_presets'] = array(
            array('id' => 'swash', 'name' => 'Swash caps', 'features' => array('swsh', 'salt'), 'description' => 'Display'),
            array('id' => 'sc', 'name' => 'Small caps', 'features' => array('smcp')),
        );
    }

    public function test_presets_travel_to_another_site_with_new_ids() {
        $this->storePresets();
        $text = $this->exportText(array('presets'));
        $file = json_decode($text, true);
        $this->assertSame(array('key' => 'p1', 'name' => 'Swash caps', 'features' => array('swsh', 'salt'), 'description' => 'Display'), $file['sections']['presets'][0]);
        $this->assertSame('', $file['sections']['presets'][1]['description']);

        unset($this->options['typost_presets']);
        $result = $this->import($text);

        $this->assertSame(array(
            array('id' => 'preset-swash-caps', 'name' => 'Swash caps', 'features' => array('swsh', 'salt'), 'description' => 'Display'),
            array('id' => 'preset-small-caps', 'name' => 'Small caps', 'features' => array('smcp'), 'description' => ''),
        ), $this->options['typost_presets']);
        $this->assertSame(array(array('heading' => 'Presets added', 'items' => array('Swash caps', 'Small caps'))), $result['sections']['presets']['groups']);
    }

    public function test_the_same_site_skips_every_preset() {
        $this->storePresets();
        $text = $this->exportText(array('presets'));
        $before = $this->options['typost_presets'];

        $rows = $this->preview($text)['sections']['presets']['preview']['rows'];
        $this->assertSame(array('skip', 'skip'), array_column($rows, 'choice'));
        $this->assertSame('A preset with this name exists.', $rows[0]['note']);
        $this->assertSame(array('skip', 'rename', 'overwrite'), array_column($rows[0]['choices'], 'value'));
        $this->assertSame('Add as “Swash caps (2)”', $rows[0]['choices'][1]['label']);

        $this->import($text);
        $this->assertSame($before, $this->options['typost_presets']);
    }

    public function test_overwrite_keeps_the_id_and_rename_adds_a_free_name() {
        $this->storePresets();
        $text = $this->file(array('presets' => array(
            array('key' => 'p1', 'name' => 'swash caps', 'features' => array('dlig')),
            array('key' => 'p2', 'name' => 'Small caps', 'features' => array('c2sc', 'smcp')),
        )));

        $result = $this->import($text, array('sections' => array('presets' => array('p1' => 'overwrite', 'p2' => 'rename'))));

        $stored = $this->options['typost_presets'];
        $this->assertSame(array('id' => 'swash', 'name' => 'Swash caps', 'features' => array('dlig'), 'description' => ''), $stored[0]);
        // c2sc is not a feature this site knows, so it is dropped.
        $this->assertSame(array('id' => 'preset-small-caps-2', 'name' => 'Small caps (2)', 'features' => array('smcp'), 'description' => ''), $stored[2]);
        $this->assertSame(array(
            array('heading' => 'Presets added', 'items' => array('“Small caps” as “Small caps (2)”')),
            array('heading' => 'Presets overwritten', 'items' => array('Swash caps')),
        ), $result['sections']['presets']['groups']);
    }

    public function test_a_name_used_twice_in_the_file_defaults_to_a_rename() {
        $text = $this->file(array('presets' => array(
            array('key' => 'p1', 'name' => 'Caps', 'features' => array('smcp')),
            array('key' => 'p2', 'name' => 'Caps', 'features' => array('smcp')),
            array('key' => 'p3', 'name' => 'Caps (2)', 'features' => array('smcp')),
        )));
        // "Caps (2)" is free, so the third preset keeps its own name and the
        // rename suggestion avoids it.
        $rows = $this->preview($text)['sections']['presets']['preview']['rows'];
        $this->assertSame(array('add', 'rename', 'add'), array_column($rows, 'choice'));
        $this->assertSame('Add as “Caps (3)”', $rows[1]['choices'][0]['label']);

        $this->import($text);
        $this->assertSame(array('Caps', 'Caps (3)', 'Caps (2)'), array_column($this->options['typost_presets'], 'name'));
    }

    public function test_a_preset_with_no_known_feature_is_not_imported() {
        $text = $this->file(array('presets' => array(array('key' => 'p1', 'name' => 'Odd', 'features' => array('zzzz')))));
        $preview = $this->preview($text)['sections']['presets']['preview'];
        $this->assertSame(array(), $preview['rows']);
        $this->assertSame(array('These presets use only OpenType features this site does not know, so they are not imported: Odd.'), $preview['notes']);

        $result = $this->import($text);
        $this->assertArrayNotHasKey('typost_presets', $this->options);
        $this->assertSame($preview['notes'], $result['sections']['presets']['warnings']);
    }

    public function test_an_invalid_preset_choice_saves_nothing() {
        $text = $this->file(array('presets' => array(array('key' => 'p1', 'name' => 'Caps', 'features' => array('smcp')))));
        $result = $this->import($text, array('sections' => array('presets' => array('p1' => 'overwrite'))));
        $this->assertInstanceOf(\WP_Error::class, $result);
        $this->assertArrayNotHasKey('typost_presets', $this->options);
    }

    // ---------------------------------------------------------------------
    // Feature Visibility
    // ---------------------------------------------------------------------

    public function test_feature_visibility_follows_the_font_to_its_id_on_the_other_site() {
        $this->sourceFont();
        $this->options['typost_font_feature_visibility'] = array(
            3  => array('disabled_features' => array('ss15', 'ornm')),
            99 => array('disabled_features' => array('ss01')), // no such font: left out
            4  => array('disabled_features' => array()),
        );
        $text = $this->exportText(array('featureVisibility'));
        $file = json_decode($text, true);
        $this->assertSame(array('f1' => array('disabledFeatures' => array('ss15', 'ornm'))), $file['sections']['featureVisibility']);

        $this->targetFont();
        unset($this->options['typost_font_feature_visibility']);
        $preview = $this->preview($text);
        $row = $preview['sections']['featureVisibility']['preview']['rows'][0];
        $this->assertSame(array('key' => 'f1', 'name' => 'Brand', 'note' => '', 'current' => 'No features hidden', 'incoming' => 'ss15, ornm'), array_intersect_key($row, array_flip(array('key', 'name', 'note', 'current', 'incoming'))));
        $this->assertSame('apply', $row['choice']);
        $this->assertSame(array('Feature Visibility'), $preview['fonts'][0]['usedBy']);

        $result = $this->import($text);
        $this->assertSame(array(30 => array('disabled_features' => array('ss15', 'ornm'))), $this->options['typost_font_feature_visibility']);
        $this->assertSame(array(array('heading' => 'Feature Visibility: settings imported', 'items' => array('Brand'))), $result['sections']['featureVisibility']['groups']);
    }

    public function test_a_font_with_its_own_feature_visibility_keeps_it_by_default() {
        $text = $this->file(array('featureVisibility' => array('f1' => array('disabledFeatures' => array('ss15')))), array('f1' => array('source' => 'manual', 'family' => 'Brand', 'name' => 'Brand', 'fontFamily' => 'Brand')));
        $this->targetFont();
        $this->options['typost_font_feature_visibility'] = array(30 => array('disabled_features' => array('ornm')));

        $row = $this->preview($text)['sections']['featureVisibility']['preview']['rows'][0];
        $this->assertSame('keep', $row['choice']);
        $this->assertSame('ornm', $row['current']);

        $this->import($text);
        $this->assertSame(array('ornm'), $this->options['typost_font_feature_visibility'][30]['disabled_features']);

        $this->import($text, array('sections' => array('featureVisibility' => array('f1' => 'apply'))));
        $this->assertSame(array('ss15'), $this->options['typost_font_feature_visibility'][30]['disabled_features']);
    }

    public function test_feature_visibility_for_a_font_that_is_not_here_is_listed_and_not_saved() {
        $text = $this->file(array('featureVisibility' => array('f1' => array('disabledFeatures' => array('ss15')))), array('f1' => array('source' => 'kit', 'family' => 'Gone', 'name' => 'Gone')));

        $row = $this->preview($text)['sections']['featureVisibility']['preview']['rows'][0];
        $this->assertSame('—', $row['current']);
        $this->assertNotSame('', $row['note']);

        $result = $this->import($text);
        $this->assertArrayNotHasKey('typost_font_feature_visibility', $this->options);
        $this->assertSame(array(array('heading' => 'Feature Visibility: not imported, because the font is not on this site', 'items' => array('Gone'))), $result['sections']['featureVisibility']['groups']);
    }

    public function test_a_font_only_feature_visibility_uses_is_not_added_when_that_section_is_left_out() {
        $text = $this->file(
            array('featureVisibility' => array('f1' => array('disabledFeatures' => array('ss15'))), 'presets' => array()),
            array('f1' => array('source' => 'manual', 'family' => 'New', 'name' => 'New', 'fontFamily' => 'New'))
        );
        $this->import($text, array('include' => array('presets'), 'fonts' => array('f1' => array('action' => 'add'))));
        $this->assertSame(array(), $this->site->manual);
    }

    public function test_a_deleted_font_never_overrides_its_replacements_own_feature_visibility() {
        $this->sourceFont();
        $this->site->mappings = array(9 => 3); // Font 9 was deleted and replaced by 3.

        // Both have entries: the replacement's own wins, in either order.
        $this->options['typost_font_feature_visibility'] = array(3 => array('disabled_features' => array('ss15')), 9 => array('disabled_features' => array('ornm')));
        $this->assertSame(array('f1' => array('disabledFeatures' => array('ss15'))), json_decode($this->exportText(array('featureVisibility')), true)['sections']['featureVisibility']);

        // The replacement hides nothing on purpose: nothing is exported.
        $this->options['typost_font_feature_visibility'] = array(9 => array('disabled_features' => array('ornm')), 3 => array('disabled_features' => array()));
        $this->assertSame(array(), json_decode($this->exportText(array('featureVisibility')), true)['sections']['featureVisibility']);

        // Only the deleted font has an entry: it describes the font it renders as.
        $this->options['typost_font_feature_visibility'] = array(9 => array('disabled_features' => array('ornm')));
        $this->assertSame(array('f1' => array('disabledFeatures' => array('ornm'))), json_decode($this->exportText(array('featureVisibility')), true)['sections']['featureVisibility']);
    }

    public function test_per_font_settings_under_a_key_the_file_has_no_font_for_are_left_out() {
        $fonts = array('f1' => array('source' => 'manual', 'family' => 'Brand', 'name' => 'Brand', 'fontFamily' => 'Brand'));
        $text = $this->file(array(
            'featureVisibility' => array('f1' => array('disabledFeatures' => array('ss15')), 'f9' => array('disabledFeatures' => array('ornm'))),
            'variableFonts'     => array('f9' => array('isVariable' => true, 'axes' => $this->axes())),
        ), $fonts);
        $this->targetFont();

        $preview = $this->preview($text)['sections'];
        $this->assertSame(array('f1'), array_column($preview['featureVisibility']['preview']['rows'], 'key'));
        $this->assertSame(array(), $preview['variableFonts']['preview']['rows']);

        $result = $this->import($text);
        $this->assertSame(array(30 => array('disabled_features' => array('ss15'))), $this->options['typost_font_feature_visibility']);
        $this->assertArrayNotHasKey('typost_variable_font_axes', $this->options);
        $this->assertSame(array(), $result['sections']['variableFonts']['groups']);
    }

    public function test_feature_visibility_drops_features_this_site_does_not_know() {
        $text = $this->file(array('featureVisibility' => array('f1' => array('disabledFeatures' => array('ss15', 'zzzz', 'ss15')))), array('f1' => array('source' => 'manual', 'family' => 'Brand', 'name' => 'Brand', 'fontFamily' => 'Brand')));
        $this->targetFont();
        $this->import($text);
        $this->assertSame(array('ss15'), $this->options['typost_font_feature_visibility'][30]['disabled_features']);
    }

    // ---------------------------------------------------------------------
    // Variable font axes (the Variable Fonts module's section)
    // ---------------------------------------------------------------------

    private function axes() {
        return array(array('tag' => 'wght', 'name' => 'Weight', 'min' => 100.0, 'max' => 900.0, 'default' => 400.0));
    }

    public function test_variable_font_settings_follow_the_font_to_its_string_id_on_the_other_site() {
        $this->sourceFont();
        $this->options['typost_variable_font_axes'] = array('manual-a' => $this->axes());
        $this->options['typost_variable_font_flags'] = array('manual-a' => array('isVariable' => true, 'hideWeights' => false));
        $text = $this->exportText(array('variableFonts'));
        $file = json_decode($text, true);
        // JSON writes 100.0 as 100, so compare loosely.
        $this->assertEquals(array('f1' => array('isVariable' => true, 'axes' => $this->axes(), 'hideWeights' => false)), $file['sections']['variableFonts']);

        $this->targetFont();
        unset($this->options['typost_variable_font_axes'], $this->options['typost_variable_font_flags']);
        $row = $this->preview($text)['sections']['variableFonts']['preview']['rows'][0];
        $this->assertSame('None', $row['current']);
        $this->assertSame('wght 100–900', $row['incoming']);
        $this->assertSame('apply', $row['choice']);

        $result = $this->import($text);
        $this->assertSame(array('manual-b' => $this->axes()), $this->options['typost_variable_font_axes']);
        $this->assertSame(array('manual-b' => array('isVariable' => true, 'hideWeights' => false)), $this->options['typost_variable_font_flags']);
        $this->assertSame(array(array('heading' => 'Variable font axes: settings imported', 'items' => array('Brand'))), $result['sections']['variableFonts']['groups']);
    }

    public function test_a_font_with_its_own_axes_keeps_them_by_default() {
        $text = $this->file(array('variableFonts' => array('f1' => array('isVariable' => true, 'axes' => $this->axes()))), array('f1' => array('source' => 'manual', 'family' => 'Brand', 'name' => 'Brand', 'fontFamily' => 'Brand')));
        $this->targetFont();
        $own = array(array('tag' => 'opsz', 'name' => 'Optical size', 'min' => 8.0, 'max' => 144.0, 'default' => 12.0));
        $this->options['typost_variable_font_axes'] = array('manual-b' => $own);

        $this->assertSame('keep', $this->preview($text)['sections']['variableFonts']['preview']['rows'][0]['choice']);
        $this->import($text);
        $this->assertSame($own, $this->options['typost_variable_font_axes']['manual-b']);
    }

    public function test_variable_font_axes_are_sanitized_like_the_save_route() {
        $text = $this->file(array('variableFonts' => array('f1' => array(
            'isVariable' => true,
            'axes'       => array(
                array('tag' => 'wght<script>', 'min' => 900, 'max' => 100, 'default' => 2000),
                array('tag' => 'x'),
            ),
        ))), array('f1' => array('source' => 'manual', 'family' => 'Brand', 'name' => 'Brand', 'fontFamily' => 'Brand')));
        $this->targetFont();
        $this->import($text);
        $this->assertSame(array(array('tag' => 'wght', 'name' => '', 'min' => 100.0, 'max' => 900.0, 'default' => 900.0)), $this->options['typost_variable_font_axes']['manual-b']);
    }

    // ---------------------------------------------------------------------
    // Everything at once
    // ---------------------------------------------------------------------

    public function test_settings_import_before_the_styles_that_read_them() {
        $this->registerSection($this->module());
        $order = array_keys((new \Typost_Export($this->site))->get_sections());
        $this->assertSame(array('featureVisibility', 'variableFonts', 'paragraphStyles', 'presets', 'options'), $order);
    }
}

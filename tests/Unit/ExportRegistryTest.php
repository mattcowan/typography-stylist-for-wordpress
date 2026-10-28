<?php
/**
 * Nothing left behind (#205): every option the plugin stores is either
 * exported by a section or excluded with a reason, and every property a
 * paragraph style can store survives export and import.
 *
 * Both tests read the source, so a new option or style property fails
 * here until someone decides how it is exported.
 */

namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\ExportTestCase;

class ExportRegistryTest extends ExportTestCase {

    /** Every `typost_*` option, meta key and transient uninstall.php deletes by name. */
    private function uninstalledNames() {
        $source = file_get_contents(TYPOST_PLUGIN_DIR . '/uninstall.php');
        preg_match_all("/'(typost_[a-z0-9_]+)'/", $source, $m);
        // Names ending in "_" are prefixes of per-post or per-user keys.
        return array_values(array_unique(array_filter($m[1], function ($name) {
            return '_' !== substr($name, -1);
        })));
    }

    /** Every option name the plugin's PHP reads or writes. */
    private function optionNamesInCode() {
        $names = array();
        $directories = new \RecursiveCallbackFilterIterator(
            new \RecursiveDirectoryIterator(TYPOST_PLUGIN_DIR, \FilesystemIterator::SKIP_DOTS),
            function ($file) {
                return !$file->isDir() || !in_array($file->getFilename(), array('vendor', 'node_modules', 'tests', '.git'), true);
            }
        );
        foreach (new \RecursiveIteratorIterator($directories) as $file) {
            if ('php' !== $file->getExtension() || 'uninstall.php' === $file->getFilename()) {
                continue;
            }
            $path = $file->getPathname();
            $source = file_get_contents($path);
            preg_match_all("/(?:get_option|update_option|add_option|delete_option)\\(\\s*'(typost_[a-z0-9_]+)'/", $source, $calls);
            preg_match_all("/register_setting\\(\\s*'[^']+'\\s*,\\s*'(typost_[a-z0-9_]+)'/", $source, $settings);
            preg_match_all("/const\\s+[A-Z_]*(?:OPTION|KEY|FLAG)[A-Z_]*\\s*=\\s*'(typost_[a-z0-9_]+)'/", $source, $consts);
            $names = array_merge($names, $calls[1], $settings[1], $consts[1]);
        }
        return array_values(array_unique($names));
    }

    private function exportedOptions() {
        $this->registerSection($this->module());
        $options = array();
        foreach ((new \Typost_Export($this->site))->get_sections() as $section) {
            $options = array_merge($options, $section['options']);
        }
        return $options;
    }

    public function test_the_source_scans_find_known_names() {
        // Controls: a broken pattern would find nothing and pass every test below.
        $this->assertContains('typost_paragraph_styles', $this->uninstalledNames());
        $this->assertContains('typost_rate_limit_window', $this->uninstalledNames());
        $this->assertContains('typost_new_font_sizes_px', $this->optionNamesInCode());
        $this->assertContains('typost_variable_font_axes', $this->optionNamesInCode());
        $this->assertContains('typost_global_settings', $this->optionNamesInCode());
        $this->assertContains('initialHang', $this->sanitizedPropertyKeys());
        $this->assertContains('fakeSmallCaps', $this->sanitizedPropertyKeys());
        $this->assertGreaterThanOrEqual(16, count($this->sanitizedPropertyKeys()));
    }

    public function test_every_option_in_code_is_deleted_by_uninstall() {
        $missing = array_diff($this->optionNamesInCode(), $this->uninstalledNames());
        $this->assertSame(array(), array_values($missing), 'Add these options to uninstall.php (and then decide their export in Typost_Export::NOT_EXPORTED or a section).');
    }

    public function test_every_stored_name_is_exported_or_excluded_with_a_reason() {
        $decided = array_merge($this->exportedOptions(), array_keys(\Typost_Export::NOT_EXPORTED));
        $undecided = array_diff($this->uninstalledNames(), $decided);
        $this->assertSame(array(), array_values($undecided), 'Export these in a section, or add them to Typost_Export::NOT_EXPORTED with the reason.');
    }

    public function test_no_name_is_both_exported_and_excluded() {
        $this->assertSame(array(), array_values(array_intersect($this->exportedOptions(), array_keys(\Typost_Export::NOT_EXPORTED))));
    }

    public function test_every_exclusion_names_a_stored_option_and_gives_a_reason() {
        $stale = array_diff(array_keys(\Typost_Export::NOT_EXPORTED), $this->uninstalledNames());
        $this->assertSame(array(), array_values($stale), 'These exclusions name options uninstall.php no longer deletes.');
        foreach (\Typost_Export::NOT_EXPORTED as $name => $reason) {
            $this->assertNotSame('', trim($reason), $name);
        }
    }

    public function test_the_paragraph_styles_section_exports_the_styles_option() {
        $this->assertContains('typost_paragraph_styles', $this->exportedOptions());
    }

    // ---------------------------------------------------------------------
    // Style properties
    // ---------------------------------------------------------------------

    /** The keys sanitize_properties() can write, read from its source. */
    private function sanitizedPropertyKeys() {
        $source = file_get_contents(TYPOST_PLUGIN_DIR . '/paragraph-styles/paragraph-styles.php');
        $start = strpos($source, 'private function sanitize_properties(');
        $this->assertNotFalse($start);
        $end = strpos($source, "\n\t}\n", $start);
        preg_match_all("/\\\$clean\\['([A-Za-z]+)'\\]\\s*=/", substr($source, $start, $end - $start), $m);
        return array_values(array_unique($m[1]));
    }

    /** One style that sets every property, as the editors would store it. */
    private function everyProperty() {
        return array(
            'fontId'                => 3,
            'fontWeight'            => '600',
            'fontStyle'             => 'italic',
            'fontSize'              => 'fit',
            'fontSizeUnit'          => 'rem',
            'fontSizeMin'           => 20,
            'fontSizePreferred'     => 40,
            'fontSizeMax'           => 96,
            'fitMaxSize'            => 120,
            'letterSpacing'         => 25,
            'lineHeight'            => 1.125,
            'features'              => array('liga', 'ss01'),
            'fontVariationSettings' => '"wght" 600',
            'initialHang'           => 0.5,
            'textCase'              => 'small-caps',
            'fakeSmallCaps'         => false,
        );
    }

    public function test_the_fixture_sets_every_property_sanitize_accepts() {
        $missing = array_diff($this->sanitizedPropertyKeys(), array_keys($this->everyProperty()));
        $this->assertSame(array(), array_values($missing), 'A new style property: add it to everyProperty() so its export round trip is tested.');
    }

    public function test_every_property_round_trips_to_another_site() {
        $this->site->manual = array(array('id' => 'manual-a', 'name' => 'Brand', 'font_id' => 3, 'font_family' => 'Brand'));
        $module = $this->module(array(array('id' => 1, 'name' => 'Everything', 'properties' => $this->everyProperty())));
        $text = $this->fileText($this->exportWith($module, array('sections' => array('paragraphStyles')))['file']);

        // Another site: the font has another ID, no styles yet.
        $this->site->manual = array(array('id' => 'manual-b', 'name' => 'Brand', 'font_id' => 30, 'font_family' => 'Brand'));
        $this->module(array(), 1);
        (new \Typost_Export($this->site))->import(\Typost_Export::parse_file($text), array());

        $expected = array('fontId' => 30) + $this->everyProperty();
        $this->assertEquals($expected, $this->storedStyle('Everything')['properties']);
    }

    public function test_every_property_of_a_child_round_trips_with_its_unsets() {
        // A child that unsets every inherited value it can.
        $unsets = array(
            'fontId'                => 0,
            'fontWeight'            => '',
            'fontStyle'             => '',
            'fontSize'              => 'inherit',
            'letterSpacing'         => 0,
            'lineHeight'            => 0,
            'features'              => array(),
            'fontVariationSettings' => '',
            'initialHang'           => 0,
            'textCase'              => '',
        );
        $this->site->manual = array(array('id' => 'manual-a', 'name' => 'Brand', 'font_id' => 3, 'font_family' => 'Brand'));
        $module = $this->module(array(
            array('id' => 1, 'name' => 'Parent', 'properties' => $this->everyProperty()),
            array('id' => 2, 'name' => 'Child', 'basedOn' => 1, 'properties' => $unsets),
        ));
        $text = $this->fileText($this->exportWith($module, array('sections' => array('paragraphStyles')))['file']);

        $this->module(array(), 1);
        (new \Typost_Export($this->site))->import(\Typost_Export::parse_file($text), array());

        $child = $this->storedStyle('Child');
        $this->assertSame($this->storedStyle('Parent')['id'], $child['basedOn']);
        $this->assertEquals($unsets, $child['properties']);
        $this->assertSame(array(), \Typost_Paragraph_Styles::resolve_properties($child, $this->storedStyles()));
    }
}

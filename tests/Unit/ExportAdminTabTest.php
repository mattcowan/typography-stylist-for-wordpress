<?php
/**
 * The Export & Import tab (#205): its markup, its place among the tabs and
 * its script.
 */

namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\ExportTestCase;
use Brain\Monkey\Functions;

class ExportAdminTabTest extends ExportTestCase {

    protected function setUp(): void {
        parent::setUp();
        Functions\when('esc_html_e')->echoArg();
        Functions\when('esc_attr_e')->echoArg();
    }

    private function render(array $sections, $can_import = true) {
        require_once TYPOST_PLUGIN_DIR . '/includes/admin-export-tab.php';
        ob_start();
        typost_render_export_tab($sections, $can_import);
        return ob_get_clean();
    }

    private function styles() {
        return array('paragraphStyles' => array('label' => 'Paragraph styles', 'items' => array(
            array('id' => 4, 'name' => 'Body', 'parent' => 0),
            array('id' => 7, 'name' => 'Body <First>', 'parent' => 4),
        )));
    }

    public function test_the_tab_lists_each_section_with_its_items() {
        $html = $this->render($this->styles());

        $this->assertStringContainsString('id="typost-export-section-paragraphStyles" class="typost-export-section-toggle" value="paragraphStyles" checked', $html);
        $this->assertStringContainsString('Paragraph styles (2)', $html);
        $this->assertStringContainsString('id="typost-export-section-paragraphStyles-item-7" class="typost-export-item" value="7" data-parent="4"', $html);
        $this->assertStringContainsString('<ul class="typost-export-item-list" id="typost-export-section-paragraphStyles-list" hidden>', $html);
        $this->assertStringContainsString('id="typost-export-all-fonts"', $html);
        $this->assertStringContainsString('id="typost-import-form"', $html);
    }

    public function test_every_control_has_a_label() {
        $html = $this->render($this->styles());
        preg_match_all('/<(?:input|select)[^>]*\sid="([^"]+)"/', $html, $m);
        $this->assertNotEmpty($m[1]);
        foreach ($m[1] as $id) {
            $this->assertStringContainsString('for="' . $id . '"', $html, $id);
        }
    }

    public function test_messages_are_announced() {
        $html = $this->render($this->styles());
        $this->assertMatchesRegularExpression('/id="typost-export-notes"[^>]*role="status"/', $html);
        $this->assertMatchesRegularExpression('/id="typost-export-error"[^>]*role="alert"/', $html);
        $this->assertMatchesRegularExpression('/id="typost-import-error"[^>]*role="alert"/', $html);
    }

    public function test_an_author_who_cannot_import_gets_no_import_form_or_all_fonts() {
        $html = $this->render($this->styles(), false);
        $this->assertStringNotContainsString('typost-import-form', $html);
        $this->assertStringNotContainsString('typost-export-all-fonts', $html);
        $this->assertStringContainsString('Only administrators can import.', $html);
    }

    public function test_nothing_to_export() {
        $html = $this->render(array());
        $this->assertStringNotContainsString('typost-export-form', $html);
        $this->assertStringContainsString('There is nothing you can export.', $html);
    }

    public function test_the_tab_comes_before_help() {
        $tabs = (new \Typost_Export($this->site))->register_admin_tab(array(array('id' => 'help', 'label' => 'Help', 'priority' => 100)));
        $this->assertSame(array('id' => 'export', 'label' => 'Export & Import', 'priority' => 90), $tabs[1]);
    }

    public function test_render_admin_tab_leaves_out_sections_the_user_cannot_export() {
        $this->registerSection($this->module(array(array('id' => 1, 'name' => 'Body', 'properties' => array()))));
        Functions\when('current_user_can')->alias(function ($cap) {
            return 'manage_options' === $cap;
        });

        ob_start();
        (new \Typost_Export($this->site))->render_admin_tab($this->site);
        $html = ob_get_clean();
        $this->assertStringContainsString('There is nothing you can export.', $html);
    }

    public function test_the_script_gets_its_data_and_flat_strings() {
        $localized = array();
        Functions\when('wp_enqueue_script')->justReturn(true);
        Functions\when('rest_url')->alias(function ($path) { return 'https://example.test/wp-json/' . $path; });
        Functions\when('wp_create_nonce')->justReturn('nonce');
        Functions\when('wp_localize_script')->alias(function ($handle, $name, $value) use (&$localized) {
            $localized[$name] = $value;
            return true;
        });

        (new \Typost_Export($this->site))->enqueue_admin_assets();

        $this->assertSame(array('restUrl' => 'https://example.test/wp-json/typost/v1/', 'nonce' => 'nonce'), $localized['typostExportData']);
        // Flat: WP_Scripts::localize() decodes entities in top-level values only (#307).
        foreach ($localized['typostExportL10n'] as $key => $value) {
            $this->assertIsString($value, $key);
        }
    }
}

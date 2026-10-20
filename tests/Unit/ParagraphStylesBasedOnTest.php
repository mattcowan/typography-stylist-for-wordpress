<?php
/**
 * Tests for Based On (#200): a paragraph style inherits every property it
 * does not set from another style.
 *
 * The resolution, the compare and the CSS of a child are held to the same
 * fixture as the JS twins in ps-utils.js
 * (paragraph-styles/__tests__/based-on.test.js).
 */

namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use Brain\Monkey\Functions;

class ParagraphStylesBasedOnTest extends TestCase {

    /** @var array Simulated wp_options storage */
    private $options = array();

    /** @var object|null Typost singleton replaced for the test */
    private $savedTypost = null;

    protected function setUp(): void {
        parent::setUp();
        if (!defined('HOUR_IN_SECONDS')) {
            define('HOUR_IN_SECONDS', 3600);
        }
        Functions\when('plugin_dir_path')->justReturn(TYPOST_PLUGIN_DIR . '/paragraph-styles/');
        Functions\when('plugin_dir_url')->justReturn('http://localhost/paragraph-styles/');
        require_once TYPOST_PLUGIN_DIR . '/paragraph-styles/paragraph-styles.php';

        Functions\when('absint')->alias(function ($v) { return abs((int) $v); });
        Functions\when('current_time')->justReturn('2026-10-20');
        Functions\when('get_transient')->justReturn(false);
        Functions\when('set_transient')->justReturn(true);
        Functions\when('delete_transient')->justReturn(true);

        $options = &$this->options;
        Functions\when('get_option')->alias(function ($key, $default = false) use (&$options) {
            return array_key_exists($key, $options) ? $options[$key] : $default;
        });
        Functions\when('update_option')->alias(function ($key, $value) use (&$options) {
            $options[$key] = $value;
            return true;
        });

        // save_styles() clears core's font detection cache through the Typost
        // singleton when the class is loaded (another test may have loaded it)
        if (class_exists('Typost')) {
            $property = (new \ReflectionClass(\Typost::class))->getProperty('instance');
            $property->setAccessible(true);
            $this->savedTypost = $property->getValue();
            $property->setValue(null, new class {
                public function clear_font_detection_cache() {}
                public function get_custom_fonts() { return array(); }
                public function get_adobe_fonts() { return array(); }
                public function get_manual_fonts() { return array(); }
            });
        }
    }

    protected function tearDown(): void {
        if (class_exists('Typost')) {
            $property = (new \ReflectionClass(\Typost::class))->getProperty('instance');
            $property->setAccessible(true);
            $property->setValue(null, $this->savedTypost);
        }
        parent::tearDown();
    }

    private function module(array $styles = array()) {
        $this->options['typost_paragraph_styles'] = $styles;
        $reflection = new \ReflectionClass(\Typost_Paragraph_Styles::class);
        return $reflection->newInstanceWithoutConstructor();
    }

    private function fixture() {
        return json_decode(file_get_contents(TYPOST_PLUGIN_DIR . '/paragraph-styles/__tests__/fixtures/based-on.json'), true);
    }

    private function request(array $params) {
        return new class($params) implements \ArrayAccess {
            private $params;
            public function __construct($params) {
                $this->params = $params;
            }
            public function get_param($name) {
                return array_key_exists($name, $this->params) ? $this->params[$name] : null;
            }
            #[\ReturnTypeWillChange]
            public function offsetGet($key) {
                return $this->get_param($key);
            }
            #[\ReturnTypeWillChange]
            public function offsetExists($key) {
                return array_key_exists($key, $this->params);
            }
            #[\ReturnTypeWillChange]
            public function offsetSet($key, $value) {}
            #[\ReturnTypeWillChange]
            public function offsetUnset($key) {}
        };
    }

    private function stored($id) {
        foreach ($this->options['typost_paragraph_styles'] as $style) {
            if ((int) $style['id'] === $id) {
                return $style;
            }
        }
        return null;
    }

    /** Body (font, fluid size, line height, features, hang), Body – First, Caption. */
    private function useCaseStyles() {
        return $this->fixture()['resolve'][1]['styles'];
    }

    // -------------------------------------------------------------------------
    // Shared fixture
    // -------------------------------------------------------------------------

    public function test_resolution_matches_the_shared_fixture() {
        $cases = $this->fixture()['resolve'];
        $this->assertGreaterThanOrEqual(8, count($cases));
        foreach ($cases as $case) {
            foreach ($case['expected'] as $id => $expected) {
                $style = null;
                foreach ($case['styles'] as $candidate) {
                    if ((string) $candidate['id'] === (string) $id) {
                        $style = $candidate;
                    }
                }
                $this->assertEquals($expected, \Typost_Paragraph_Styles::resolve_properties($style, $case['styles']), $case['label'] . " (style $id)");
            }
        }
    }

    public function test_the_compare_matches_the_shared_fixture() {
        $cases = $this->fixture()['equality'];
        $this->assertGreaterThanOrEqual(15, count($cases));
        foreach ($cases as $case) {
            $left = \Typost_Paragraph_Styles::drop_inherited_properties($case['a'], $case['b']);
            $this->assertSame(!$case['equal'], array_key_exists($case['key'], $left), $case['label']);
        }
    }

    public function test_child_css_matches_the_shared_fixture() {
        $module = $this->module();
        foreach ($this->fixture()['css'] as $case) {
            foreach ($case['styles'] as $style) {
                if ($style['id'] === $case['id']) {
                    $this->assertSame($case['css'], $module->generate_style_css($style, $case['styles']), $case['label']);
                }
            }
        }
    }

    public function test_a_style_without_a_parent_resolves_to_what_it_stores() {
        $props = array('fontId' => 0, 'letterSpacing' => 0, 'fontWeight' => '700');
        $this->assertSame($props, \Typost_Paragraph_Styles::resolve_properties(array('id' => 1, 'properties' => $props), array()));
    }

    public function test_generate_style_css_reads_the_store_when_no_list_is_given() {
        $styles = $this->useCaseStyles();
        $module = $this->module($styles);
        $this->assertSame($this->fixture()['css'][1]['css'], $module->generate_style_css($styles[2]));
    }

    // -------------------------------------------------------------------------
    // Readers: fonts, client shape
    // -------------------------------------------------------------------------

    public function test_the_frontend_loads_a_font_a_child_inherits() {
        $module = $this->module($this->useCaseStyles());
        $this->assertSame(array(5), $module->font_ids_from_content(array(), '<p class="typost-styled typost-ps-3">Caption</p>'));
    }

    public function test_forced_child_styles_force_the_inherited_font() {
        $module = $this->module($this->useCaseStyles());
        Functions\when('apply_filters')->alias(function ($hook, $value) {
            return 'typost_force_enqueue_paragraph_style_ids' === $hook ? array(2) : $value;
        });
        $this->assertSame(array(5), $module->font_ids_from_forced_styles(array()));
    }

    public function test_client_shape_resolves_children_and_leaves_other_styles_unchanged() {
        $styles = $this->useCaseStyles();
        $client = $this->module($styles)->get_client_styles();

        $this->assertSame($styles[0], $client[0]);
        $this->assertSame($styles[2]['properties'], $client[2]['ownProperties']);
        $this->assertSame(5, $client[2]['properties']['fontId']);
        $this->assertSame('14', $client[2]['properties']['fontSize']);
    }

    // -------------------------------------------------------------------------
    // Based On choices
    // -------------------------------------------------------------------------

    public function test_descendants_are_found_through_every_level() {
        $styles = array(
            array('id' => 1, 'properties' => array()),
            array('id' => 2, 'basedOn' => 1, 'properties' => array()),
            array('id' => 3, 'basedOn' => 2, 'properties' => array()),
            array('id' => 4, 'basedOn' => 1, 'properties' => array()),
            array('id' => 5, 'properties' => array()),
        );
        $ids = \Typost_Paragraph_Styles::descendant_ids($styles, 1);
        sort($ids);
        $this->assertSame(array(2, 3, 4), $ids);
        $this->assertSame(array(), \Typost_Paragraph_Styles::descendant_ids($styles, 5));
    }

    public function test_based_on_rejects_itself_a_descendant_and_a_missing_style() {
        $styles = array(
            array('id' => 1, 'properties' => array()),
            array('id' => 2, 'basedOn' => 1, 'properties' => array()),
        );
        $this->assertNotSame('', \Typost_Paragraph_Styles::based_on_error($styles, 1, 1));
        $this->assertNotSame('', \Typost_Paragraph_Styles::based_on_error($styles, 1, 2));
        $this->assertNotSame('', \Typost_Paragraph_Styles::based_on_error($styles, 1, 9));
        $this->assertSame('', \Typost_Paragraph_Styles::based_on_error($styles, 2, 1));
        $this->assertSame('', \Typost_Paragraph_Styles::based_on_error($styles, 0, 2));
    }

    public function test_based_on_allows_ten_levels_and_rejects_eleven() {
        $styles = array(array('id' => 1, 'properties' => array()));
        for ($id = 2; $id <= 9; $id++) {
            $styles[] = array('id' => $id, 'basedOn' => $id - 1, 'properties' => array());
        }
        $styles[] = array('id' => 20, 'properties' => array());
        $styles[] = array('id' => 21, 'basedOn' => 20, 'properties' => array());

        // 9 levels above + a new style = 10
        $this->assertSame('', \Typost_Paragraph_Styles::based_on_error($styles, 0, 9));
        // 9 above + style 20 + its child 21 = 11
        $this->assertNotSame('', \Typost_Paragraph_Styles::based_on_error($styles, 20, 9));
        // 8 above + 20 + 21 = 10
        $this->assertSame('', \Typost_Paragraph_Styles::based_on_error($styles, 20, 8));
    }

    // -------------------------------------------------------------------------
    // REST
    // -------------------------------------------------------------------------

    public function test_setting_based_on_makes_matching_values_inherited() {
        $module = $this->module(array(
            array('id' => 1, 'name' => 'Body', 'properties' => array('fontId' => 5, 'lineHeight' => 1.6, 'fontWeight' => '400')),
            array('id' => 2, 'name' => 'Caption', 'properties' => array('fontId' => 5, 'lineHeight' => 1.4, 'fontSize' => '14', 'fontSizeUnit' => 'rem')),
        ));
        $response = $module->rest_update_style($this->request(array('id' => 2, 'basedOn' => 1)));

        $this->assertSame(200, $response->get_status());
        $stored = $this->stored(2);
        $this->assertSame(1, $stored['basedOn']);
        // fontId matched Body and is inherited now; the weight it never set inherits too
        $this->assertSame(array('lineHeight' => 1.4, 'fontSize' => '14', 'fontSizeUnit' => 'rem'), $stored['properties']);
        $this->assertSame('400', $response->get_data()['properties']['fontWeight']);
        $this->assertSame($stored['properties'], $response->get_data()['ownProperties']);
    }

    public function test_removing_based_on_keeps_the_look() {
        $module = $this->module($this->useCaseStyles());
        $module->rest_update_style($this->request(array('id' => 3, 'basedOn' => 0)));

        $stored = $this->stored(3);
        $this->assertArrayNotHasKey('basedOn', $stored);
        $this->assertEquals($this->fixture()['resolve'][1]['expected']['3'], $stored['properties']);
    }

    public function test_a_loop_is_rejected_and_nothing_is_saved() {
        $styles = $this->useCaseStyles();
        $module = $this->module($styles);
        $response = $module->rest_update_style($this->request(array('id' => 1, 'basedOn' => 3)));

        $this->assertSame(400, $response->get_status());
        $this->assertSame($styles, $this->options['typost_paragraph_styles']);
    }

    public function test_reset_to_base_removes_every_override() {
        $module = $this->module($this->useCaseStyles());
        $module->rest_update_style($this->request(array('id' => 3, 'properties' => array())));

        $stored = $this->stored(3);
        $this->assertSame(1, $stored['basedOn']);
        $this->assertSame(array(), $stored['properties']);
    }

    public function test_a_child_keeps_the_empty_values_that_unset_inherited_properties() {
        $module = $this->module($this->useCaseStyles());
        $module->rest_update_style($this->request(array('id' => 2, 'properties' => array(
            'initialHang' => 0, 'fontStyle' => '', 'textCase' => '', 'fontVariationSettings' => '', 'features' => array(),
        ))));

        $this->assertSame(
            array('fontStyle' => '', 'features' => array(), 'fontVariationSettings' => '', 'initialHang' => 0, 'textCase' => ''),
            $this->stored(2)['properties']
        );
    }

    public function test_a_style_without_a_parent_still_drops_empty_values() {
        $module = $this->module($this->useCaseStyles());
        $module->rest_update_style($this->request(array('id' => 1, 'properties' => array(
            'fontId' => 5, 'initialHang' => 0, 'fontStyle' => '', 'textCase' => '',
        ))));

        $this->assertSame(array('fontId' => 5), $this->stored(1)['properties']);
    }

    public function test_updating_a_parent_changes_its_children_with_no_change_to_them() {
        $module = $this->module($this->useCaseStyles());
        $before = $this->stored(3);
        $module->rest_update_style($this->request(array('id' => 1, 'properties' => array('fontId' => 8, 'lineHeight' => 1.5))));

        $this->assertSame($before, $this->stored(3));
        $css = $module->generate_style_css($this->stored(3));
        $this->assertStringContainsString('font-family: var(--font-8)', $css);
        $this->assertStringContainsString('line-height: 1.5', $css);
    }

    public function test_deleting_a_parent_copies_its_values_into_the_children() {
        $styles = $this->useCaseStyles();
        $styles[] = array('id' => 4, 'name' => 'Small Caption', 'basedOn' => 3, 'properties' => array('fontSize' => '12', 'fontSizeUnit' => 'rem'));
        $module = $this->module($styles);
        $cssBefore = array(
            3 => $module->generate_style_css($styles[2], $styles),
            4 => $module->generate_style_css($styles[3], $styles),
        );

        $response = $module->rest_delete_style($this->request(array('id' => 1)));

        $this->assertSame(array(2, 3), $response->get_data()['detached']);
        $this->assertNull($this->stored(1));
        $this->assertArrayNotHasKey('basedOn', $this->stored(3));
        $this->assertSame(3, $this->stored(4)['basedOn']);
        $after = $this->options['typost_paragraph_styles'];
        $this->assertSame($cssBefore[3], $module->generate_style_css($this->stored(3), $after));
        $this->assertSame($cssBefore[4], $module->generate_style_css($this->stored(4), $after));
    }

    public function test_create_accepts_based_on_and_rejects_a_missing_parent() {
        $this->options['typost_paragraph_styles_next_id'] = 4;
        $module = $this->module($this->useCaseStyles());

        $ok = $module->rest_create_style($this->request(array('name' => 'Quote', 'basedOn' => 1, 'properties' => array('fontStyle' => 'italic'))));
        $this->assertSame(201, $ok->get_status());
        $this->assertSame(1, $this->stored(4)['basedOn']);
        $this->assertSame(5, $ok->get_data()['properties']['fontId']);

        $bad = $module->rest_create_style($this->request(array('name' => 'Nope', 'basedOn' => 99)));
        $this->assertSame(400, $bad->get_status());
    }

    // -------------------------------------------------------------------------
    // Settings tab (on the #221 edit form)
    // -------------------------------------------------------------------------

    public function test_card_details_label_inherited_values_overrides_and_unset_values() {
        $styles = $this->useCaseStyles();
        $html = \Typost_Paragraph_Styles::render_admin_card_parts(
            $styles[1],
            $styles,
            array('lookup' => array('5' => 'Fraunces'), 'mappings' => array(), 'manual_ids' => array())
        )['details'];

        $this->assertStringContainsString('<strong>Based on:</strong> Body', $html);
        $this->assertStringContainsString('<strong>Font:</strong> Fraunces (400)<span class="typost-ps-detail-source is-inherited">Inherited</span>', $html);
        // Body – First unsets Body's hang
        $this->assertStringContainsString('<strong>First Letter Hang:</strong> None<span class="typost-ps-detail-source is-override">Override</span>', $html);
        // The form labels the inherited font
        $this->assertStringContainsString('data-font-label="Fraunces"', $html);
    }

    public function test_a_style_without_a_parent_has_no_labels() {
        $styles = $this->useCaseStyles();
        $html = \Typost_Paragraph_Styles::render_admin_card_parts(
            $styles[0],
            $styles,
            array('lookup' => array(), 'mappings' => array(), 'manual_ids' => array())
        )['details'];

        $this->assertStringNotContainsString('typost-ps-detail-source', $html);
        $this->assertStringNotContainsString('Based on:', $html);
    }

    public function test_admin_card_returns_the_cards_of_the_styles_based_on_it_and_every_style() {
        $styles = $this->useCaseStyles();
        $styles[] = array('id' => 4, 'name' => 'Small Caption', 'basedOn' => 3, 'properties' => array('fontSize' => '12', 'fontSizeUnit' => 'rem'));
        $module = $this->module($styles);
        Functions\when('get_user_locale')->justReturn('en_US');

        $data = $module->rest_get_admin_card(array('id' => '1'))->get_data();

        $this->assertSame(array(2, 3, 4), array_column($data['related'], 'id'));
        $this->assertStringContainsString('<strong>Based on:</strong> Caption', $data['related'][2]['details']);
        $this->assertCount(4, $data['styles']);
        $this->assertSame(5, $data['styles'][3]['properties']['fontId']);
        $this->assertSame(array('fontSize' => '12', 'fontSizeUnit' => 'rem'), $data['styles'][3]['ownProperties']);
    }

    public function test_admin_assets_localize_the_client_shape() {
        $module = $this->module($this->useCaseStyles());
        $client = $module->get_client_styles();
        $this->assertSame(1, $client[2]['basedOn']);
        $this->assertArrayHasKey('ownProperties', $client[2]);
    }
}

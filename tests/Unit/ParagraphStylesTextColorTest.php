<?php
/**
 * Tests for text color and outline in paragraph styles (#215).
 *
 * generate_style_css() must match buildStyleCssBlock() in ps-utils.js byte
 * for byte, so both read paragraph-styles/__tests__/fixtures/text-color-css.json.
 */

namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use Brain\Monkey\Functions;

class ParagraphStylesTextColorTest extends TestCase {

    private function instance() {
        static $loaded = false;
        if (!defined('HOUR_IN_SECONDS')) {
            define('HOUR_IN_SECONDS', 3600);
        }
        if (!$loaded) {
            Functions\when('plugin_dir_path')->justReturn(TYPOST_PLUGIN_DIR . '/paragraph-styles/');
            Functions\when('plugin_dir_url')->justReturn('http://localhost/paragraph-styles/');
            require_once TYPOST_PLUGIN_DIR . '/paragraph-styles/paragraph-styles.php';
            $loaded = true;
        }
        Functions\when('sanitize_text_field')->returnArg();
        Functions\when('sanitize_key')->returnArg();
        Functions\when('absint')->alias(function ($v) { return abs((int) $v); });

        $reflection = new \ReflectionClass(\Typost_Paragraph_Styles::class);
        return $reflection->newInstanceWithoutConstructor();
    }

    private function sanitize(array $raw, $keep_empty = false) {
        $instance   = $this->instance();
        $reflection = new \ReflectionClass(\Typost_Paragraph_Styles::class);
        $method     = $reflection->getMethod('sanitize_properties');
        $method->setAccessible(true);
        return $method->invoke($instance, $raw, $keep_empty);
    }

    public function fixtureCases() {
        $json  = file_get_contents(TYPOST_PLUGIN_DIR . '/paragraph-styles/__tests__/fixtures/text-color-css.json');
        $cases = array();
        foreach (json_decode($json, true)['cases'] as $case) {
            $cases[$case['label']] = array($case['properties'], isset($case['legacyId']) ? $case['legacyId'] : '', $case['css']);
        }
        return $cases;
    }

    /**
     * @dataProvider fixtureCases
     */
    public function test_css_matches_the_shared_fixture($properties, $legacy_id, $css) {
        $style = array('id' => 8, 'properties' => $properties);
        if ('' !== $legacy_id) {
            $style['legacyId'] = $legacy_id;
        }
        $this->assertSame($css, $this->instance()->generate_style_css($style, array()));
    }

    public function test_the_fixture_is_read() {
        // A control: an empty provider would let every case above pass by never running.
        $this->assertGreaterThanOrEqual(12, count($this->fixtureCases()));
    }

    public function test_a_style_without_color_writes_what_it_wrote_before() {
        $css = $this->instance()->generate_style_css(array('id' => 8, 'properties' => array('fontWeight' => '700')), array());
        $this->assertSame(".typost-ps-8,\n.typost-styled.typost-ps-8.typost-ps-8.typost-ps-8.typost-ps-8.typost-ps-8,\n.typost-styled[data-style-id=\"8\"][data-style-id][data-style-id][data-style-id][data-style-id] {\n    font-weight: 700;\n}", $css);
    }

    public function test_normalize_color() {
        $this->instance();
        $this->assertSame('#aabbcc', \Typost_Paragraph_Styles::normalize_color('#ABC'));
        $this->assertSame('#aabbccdd', \Typost_Paragraph_Styles::normalize_color(' #abcd '));
        $this->assertSame('#cc000080', \Typost_Paragraph_Styles::normalize_color('#CC000080'));
        $this->assertSame('var:preset|color|accent-1|#cc0000', \Typost_Paragraph_Styles::normalize_color('var:preset|color|accent-1|#CC0000'));
        $this->assertSame('var:preset|color|accent-1', \Typost_Paragraph_Styles::normalize_color('var:preset|color|accent-1'));
        $this->assertSame('', \Typost_Paragraph_Styles::normalize_color('transparent'));
        $this->assertSame('transparent', \Typost_Paragraph_Styles::normalize_color('transparent', true));
        foreach (array('red', '#ggg', '#12345', 'var:preset|color|a b', 'var:preset|color|x|red', 'var(--x)', 'url(x)', 'var:preset|color|x;color:red', array(), null, 5) as $bad) {
            $this->assertSame('', \Typost_Paragraph_Styles::normalize_color($bad), var_export($bad, true));
        }
    }

    public function test_color_css_value() {
        $this->instance();
        $this->assertSame('var(--wp--preset--color--accent-1, #cc0000)', \Typost_Paragraph_Styles::color_css_value('var:preset|color|accent-1|#cc0000'));
        $this->assertSame('var(--wp--preset--color--accent-1)', \Typost_Paragraph_Styles::color_css_value('var:preset|color|accent-1'));
        $this->assertSame('accent-1', \Typost_Paragraph_Styles::palette_color_slug('var:preset|color|accent-1|#cc0000'));
        $this->assertSame('#cc0000', \Typost_Paragraph_Styles::palette_color_fallback('var:preset|color|accent-1|#cc0000'));
        $this->assertSame('', \Typost_Paragraph_Styles::palette_color_slug('#cc0000'));
    }

    public function test_normalize_stroke_width() {
        $this->instance();
        $this->assertSame(0, \Typost_Paragraph_Styles::normalize_stroke_width(0));
        $this->assertSame(0, \Typost_Paragraph_Styles::normalize_stroke_width('0.004'));
        $this->assertSame(0, \Typost_Paragraph_Styles::normalize_stroke_width(-2));
        $this->assertSame(0, \Typost_Paragraph_Styles::normalize_stroke_width(true));
        $this->assertSame(0, \Typost_Paragraph_Styles::normalize_stroke_width('2px'));
        $this->assertSame(2, \Typost_Paragraph_Styles::normalize_stroke_width('2'));
        $this->assertSame(1.26, \Typost_Paragraph_Styles::normalize_stroke_width(1.255));
        $this->assertSame(20, \Typost_Paragraph_Styles::normalize_stroke_width(99));
    }

    public function test_sanitize_keeps_valid_values() {
        $clean = $this->sanitize(array(
            'textColor'          => 'var:preset|color|accent-1|#CC0000',
            'textStrokeWidth'    => '2',
            'textStrokeColor'    => '#FFF',
            'textStrokePosition' => 'behind',
        ));
        $this->assertSame(array(
            'textColor'          => 'var:preset|color|accent-1|#cc0000',
            'textStrokeWidth'    => 2,
            'textStrokeColor'    => '#ffffff',
            'textStrokePosition' => 'behind',
        ), $clean);
        $this->assertSame(array('textColor' => 'transparent'), $this->sanitize(array('textColor' => 'transparent')));
    }

    public function test_sanitize_drops_invalid_values_and_an_outline_without_a_width() {
        $this->assertSame(array(), $this->sanitize(array('textColor' => 'red;background:url(x)')));
        $this->assertSame(array(), $this->sanitize(array('textStrokeColor' => '#000', 'textStrokePosition' => 'behind')));
        $this->assertSame(array('textStrokeWidth' => 1), $this->sanitize(array('textStrokeWidth' => 1, 'textStrokeColor' => 'transparent', 'textStrokePosition' => 'over')));
    }

    public function test_sanitize_keeps_the_empty_values_only_for_a_style_with_a_parent() {
        $raw = array('textColor' => '', 'textStrokeWidth' => 0);
        $this->assertSame(array(), $this->sanitize($raw));
        $this->assertSame(array('textColor' => '', 'textStrokeWidth' => 0), $this->sanitize($raw, true));
    }

    public function test_based_on_the_outline_inherits_as_a_group() {
        $this->instance();
        $styles = array(
            array('id' => 1, 'name' => 'Display', 'properties' => array('textColor' => '#111111', 'textStrokeWidth' => 2, 'textStrokeColor' => '#cc0000', 'textStrokePosition' => 'behind')),
            array('id' => 2, 'name' => 'Display thin', 'basedOn' => 1, 'properties' => array('textStrokeWidth' => 1)),
            array('id' => 3, 'name' => 'Display plain', 'basedOn' => 1, 'properties' => array('textStrokeWidth' => 0, 'textColor' => '')),
        );
        // A child's own outline does not keep the parent's color or position
        $this->assertSame(array('textColor' => '#111111', 'textStrokeWidth' => 1), \Typost_Paragraph_Styles::resolve_properties($styles[1], $styles));
        // Empty values unset the parent's outline and color
        $this->assertSame(array(), \Typost_Paragraph_Styles::resolve_properties($styles[2], $styles));
        // An outline equal to the parent's becomes inherited
        $this->assertSame(array(), \Typost_Paragraph_Styles::drop_inherited_properties(array('textStrokeWidth' => '2', 'textStrokeColor' => '#CC0000', 'textStrokePosition' => 'behind', 'textColor' => '#111'), $styles[0]['properties']));
        // A look without the parent's outline and color stores the empty values
        $this->assertSame(array('textStrokeWidth' => 0, 'textColor' => ''), \Typost_Paragraph_Styles::compute_overrides(array(), $styles[0]['properties']));
    }

    public function test_the_block_color_rule_matches_only_a_block_with_its_own_color() {
        $css = $this->instance()->generate_style_css(array('id' => 8, 'properties' => array('textColor' => '#336699')), array());
        $this->assertStringContainsString(".wp-block-typost.has-text-color > .typost-styled.typost-ps-8.typost-ps-8.typost-ps-8.typost-ps-8.typost-ps-8 {\n    color: inherit;\n}", $css);
    }

    /**
     * Leaves an empty palette cached, so later tests that never mock the
     * global settings functions (which Brain Monkey keeps defined once a
     * test mocked them) do not call them.
     */
    private function resetPalette($value = array()) {
        $property = (new \ReflectionClass(\Typost_Paragraph_Styles::class))->getProperty('color_palette');
        $property->setAccessible(true);
        $property->setValue(null, $value);
    }

    private function stubGlobalSettings($palette, $default_palette = true, $styles = array()) {
        $this->resetPalette(null);
        Functions\when('wp_get_global_settings')->alias(function ($path) use ($palette, $default_palette) {
            return array('color', 'palette') === $path ? $palette : $default_palette;
        });
        Functions\when('wp_get_global_styles')->justReturn($styles);
        Functions\when('_wp_to_kebab_case')->alias(function ($s) {
            // Core splits letters from digits: accent1 -> accent-1
            return strtolower(trim(preg_replace('/[^A-Za-z0-9]+/', '-', preg_replace('/([a-z])([0-9])/', '$1-$2', $s)), '-'));
        });
    }

    public function test_palette_lists_the_theme_first_and_drops_the_default_palette_when_the_theme_turns_it_off() {
        $this->instance();
        $this->stubGlobalSettings(array(
            'default' => array(array('slug' => 'black', 'name' => 'Black', 'color' => '#000000')),
            'theme'   => array(array('slug' => 'accent1', 'name' => 'Accent', 'color' => '#CC0000'), array('slug' => 'bad', 'name' => 'Bad', 'color' => 'red;}</style>')),
            'custom'  => array(array('slug' => 'brand', 'name' => 'Brand', 'color' => 'rgb(0, 51, 102)')),
        ));
        $palette = \Typost_Paragraph_Styles::get_color_palette();
        $this->assertSame(array('accent-1', 'brand', 'black'), array_column($palette, 'slug'));
        $this->assertSame('#CC0000', $palette[0]['color']);

        $this->stubGlobalSettings(array('default' => array(array('slug' => 'black', 'name' => 'Black', 'color' => '#000'))), false);
        $this->assertSame(array(), \Typost_Paragraph_Styles::get_color_palette());
        $this->resetPalette();
    }

    public function test_theme_colors_resolve_palette_references() {
        $this->instance();
        $this->stubGlobalSettings(
            array('theme' => array(array('slug' => 'base', 'name' => 'Base', 'color' => '#fafafa'), array('slug' => 'contrast', 'name' => 'Contrast', 'color' => '#111111'))),
            true,
            array('background' => 'var:preset|color|base', 'text' => 'var(--wp--preset--color--contrast)')
        );
        $this->assertSame(array('background' => '#fafafa', 'text' => '#111111'), \Typost_Paragraph_Styles::get_theme_colors());

        $css = \Typost_Paragraph_Styles::admin_preview_surface_css();
        $this->assertStringContainsString("--wp--preset--color--base: #fafafa", $css);
        $this->assertStringContainsString("background-color: #fafafa", $css);
        // The theme text color never outranks a style's own color
        $this->assertStringContainsString(":where(.typost-ps-preview-sample) {\n    color: #111111;\n}", $css);
        $this->resetPalette();
    }

    public function test_card_details_name_palette_colors_and_the_outline() {
        $this->instance();
        $this->stubGlobalSettings(array('theme' => array(array('slug' => 'accent-1', 'name' => 'Accent', 'color' => '#cc0000'))));
        $font = array('status' => 'default', 'name' => '', 'font_id' => 0);
        $html = \Typost_Paragraph_Styles::render_card_details(array(
            'textColor'          => 'transparent',
            'textStrokeWidth'    => 2,
            'textStrokeColor'    => 'var:preset|color|accent-1|#cc0000',
            'textStrokePosition' => 'behind',
        ), $font);
        $this->assertStringContainsString('<strong>Color:</strong> Transparent (outline only)', $html);
        $this->assertStringContainsString('<strong>Outline:</strong> 2px, Accent, behind the fill', $html);

        $html = \Typost_Paragraph_Styles::render_card_details(array('textColor' => 'var:preset|color|gone|#123456', 'textStrokeWidth' => 0.5), $font);
        $this->assertStringContainsString('<strong>Color:</strong> gone (not in the theme palette)', $html);
        $this->assertStringContainsString('<strong>Outline:</strong> 0.5px, text color, on top of the fill', $html);

        $html = \Typost_Paragraph_Styles::render_card_details(array(), $font, array('own' => array('textColor' => '', 'textStrokeWidth' => 0), 'parent' => 'Display'));
        $this->assertStringContainsString('<strong>Color:</strong> None', $html);
        $this->assertStringContainsString('<strong>Outline:</strong> None', $html);
        $this->resetPalette();
    }
}

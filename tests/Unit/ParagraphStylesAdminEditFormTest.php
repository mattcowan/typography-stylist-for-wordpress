<?php
/**
 * Tests for the Paragraph Styles admin edit form (#221): the card
 * renderers shared by the tab and the admin-card route, the font context,
 * the route itself, the form template, and the data localized for it.
 */

namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use Brain\Monkey\Functions;

/**
 * Stand-in for the core Typost instance the admin tab receives.
 */
class FakeAdminTypost {
    public $custom  = array();
    public $adobe   = array();
    public $manual  = array();
    public $adopted = array();
    public $mappings = array();

    public function get_custom_fonts() { return $this->custom; }
    public function get_adobe_fonts() { return $this->adobe; }
    public function get_manual_fonts() { return $this->manual; }
    public function get_adopted_wp_fonts_by_slug() { return $this->adopted; }
    public function font_sources() { return $this; }
    public function get_font_replacements() { return array('mappings' => $this->mappings); }
    public function get_available_features() {
        return array(
            array('id' => 'liga', 'name' => 'Standard Ligatures', 'category' => 'ligatures'),
            array('id' => 'ss01', 'name' => 'Stylistic Set 1', 'category' => 'stylistic-sets'),
            array('id' => 'swsh', 'name' => 'Swashes &amp; Flourishes', 'category' => 'alternates'),
        );
    }
    public function get_feature_category_titles() {
        return array('ligatures' => 'Ligatures', 'stylistic-sets' => 'Stylistic Sets', 'alternates' => 'Swashes & Alternates');
    }
}

class ParagraphStylesAdminEditFormTest extends TestCase {

    /** Every data-field the edit form reads; admin.js relies on these names. */
    const FORM_FIELDS = array(
        'name', 'basedOn', 'fontId', 'fontWeight', 'fontStyle', 'sizeMode', 'fontSize',
        'fontSizeMin', 'fontSizePreferred', 'fontSizeMax', 'fitMaxSize',
        'letterSpacing', 'lineHeight', 'initialHang', 'textCase', 'fakeSmallCaps',
        'alignment', 'alignLast', 'wordSpacing', 'textWrap',
        'fontVariationSettings',
    );

    private function freshInstance() {
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
        $reflection = new \ReflectionClass(\Typost_Paragraph_Styles::class);
        return $reflection->newInstanceWithoutConstructor();
    }

    private function fontsInstance() {
        $instance          = new FakeAdminTypost();
        $instance->custom  = array(array('id' => 'kit-1', 'font_id' => 36, 'name' => 'Fraunces'));
        $instance->adobe   = array(array('id' => 'abc', 'font_id' => 12, 'name' => 'Bookmania'));
        $instance->manual  = array(array('id' => 'manual-x', 'font_id' => 40, 'name' => 'Theme Serif'));
        $instance->adopted = array('inter' => array('id' => 'wpl-inter', 'font_id' => 50, 'name' => 'Inter'));
        $instance->mappings = array(16 => 36);
        return $instance;
    }

    // -------------------------------------------------------------------------
    // build_admin_font_context()
    // -------------------------------------------------------------------------

    public function test_font_context_collects_every_source_sorted_by_name() {
        $this->freshInstance();
        $context = \Typost_Paragraph_Styles::build_admin_font_context($this->fontsInstance());

        $this->assertSame(
            array(12 => 'Bookmania', 36 => 'Fraunces', 50 => 'Inter', 40 => 'Theme Serif'),
            $context['options']
        );
        $this->assertSame('Fraunces', $context['lookup']['36']);
        $this->assertSame('Inter', $context['lookup']['50']);
        $this->assertSame(array(16 => 36), $context['mappings']);
        $this->assertSame(array(40 => true), $context['manual_ids']);
    }

    public function test_font_context_without_an_instance_is_empty() {
        $this->freshInstance();
        $context = \Typost_Paragraph_Styles::build_admin_font_context(null);
        $this->assertSame(array(), $context['options']);
        $this->assertSame(array(), $context['lookup']);
    }

    // -------------------------------------------------------------------------
    // render_card_details() / render_card_preview()
    // -------------------------------------------------------------------------

    public function test_details_list_every_property_the_form_edits() {
        $this->freshInstance();
        $html = \Typost_Paragraph_Styles::render_card_details(
            array(
                'fontWeight'            => '600',
                'fontStyle'             => 'italic',
                'fontSize'              => 'responsive',
                'fontSizeMin'           => 18,
                'fontSizePreferred'     => 24,
                'fontSizeMax'           => 48,
                'features'              => array('liga', 'swsh'),
                'letterSpacing'         => 25,
                'lineHeight'            => 1.6,
                'fontVariationSettings' => '"wght" 650',
                'initialHang'           => 0.5,
                'textCase'              => 'small-caps',
                'fakeSmallCaps'         => false,
            ),
            array('status' => 'found', 'name' => 'Fraunces', 'font_id' => 36)
        );

        $this->assertStringContainsString('data-font-label="Fraunces"', $html);
        $this->assertStringContainsString('Fraunces (600)', $html);
        $this->assertStringContainsString('Italic', $html);
        $this->assertStringContainsString('Responsive (18/24/48px)', $html);
        $this->assertStringContainsString('liga, swsh', $html);
        $this->assertStringContainsString('0.025em', $html);
        $this->assertStringContainsString('1.6', $html);
        $this->assertStringContainsString('<strong>Axes:</strong> "wght" 650', $html);
        $this->assertStringContainsString('0.5em', $html);
        $this->assertStringContainsString('Small Caps (no fake small caps)', $html);
    }

    /**
     * @dataProvider rem_size_cases
     */
    public function test_details_show_the_rem_value_for_a_rem_style( $props, $expected ) {
        $this->freshInstance();
        $html = \Typost_Paragraph_Styles::render_card_details(
            $props + array('fontSizeUnit' => 'rem'),
            array('status' => 'default', 'name' => '', 'font_id' => 0)
        );
        $this->assertStringContainsString($expected, $html);
    }

    public static function rem_size_cases() {
        return array(
            'fixed'      => array(array('fontSize' => 20), '20px (1.25rem)'),
            'responsive' => array(
                array('fontSize' => 'responsive', 'fontSizeMin' => 16, 'fontSizePreferred' => 24, 'fontSizeMax' => 64),
                'Responsive (16px (1rem) / 24px (1.5rem) / 64px (4rem))',
            ),
            'fit'        => array(
                array('fontSize' => 'fit', 'fontSizeMin' => 18, 'fontSizePreferred' => 32, 'fontSizeMax' => 72),
                'Fit to width (fallback 18px (1.125rem) – 72px (4.5rem))',
            ),
            'missing'    => array(array('fontSize' => 'responsive', 'fontSizeMin' => 16), 'Responsive (16px (1rem) / ? / ?)'),
        );
    }

    /**
     * @dataProvider px_size_cases
     */
    public function test_details_keep_the_px_text_for_px_and_older_styles( $props, $expected ) {
        $this->freshInstance();
        foreach (array(array('fontSizeUnit' => 'px'), array()) as $unit) {
            $html = \Typost_Paragraph_Styles::render_card_details(
                $props + $unit,
                array('status' => 'default', 'name' => '', 'font_id' => 0)
            );
            $this->assertStringContainsString($expected, $html);
            $this->assertStringNotContainsString('rem', $html);
        }
    }

    public static function px_size_cases() {
        return array(
            'fixed'      => array(array('fontSize' => 20), '20px'),
            'responsive' => array(
                array('fontSize' => 'responsive', 'fontSizeMin' => 16, 'fontSizePreferred' => 24, 'fontSizeMax' => 64),
                'Responsive (16/24/64px)',
            ),
            'fit'        => array(
                array('fontSize' => 'fit', 'fontSizeMin' => 18, 'fontSizePreferred' => 32, 'fontSizeMax' => 72),
                'Fit to width (fallback 18–72px)',
            ),
        );
    }

    public function test_details_for_an_empty_style_name_the_default_font() {
        $this->freshInstance();
        $html = \Typost_Paragraph_Styles::render_card_details(array(), array('status' => 'default', 'name' => '', 'font_id' => 0));
        $this->assertStringContainsString('data-font-label="Default"', $html);
        $this->assertStringContainsString('Default (400)', $html);
        $this->assertStringNotContainsString('Size:', $html);
        $this->assertStringNotContainsString('Axes:', $html);
    }

    public function test_details_name_a_deleted_font_for_the_form() {
        $this->freshInstance();
        $html = \Typost_Paragraph_Styles::render_card_details(array('fontId' => 99), array('status' => 'missing', 'name' => '', 'font_id' => 0));
        $this->assertStringContainsString('data-font-label="Deleted font, shown in the default font"', $html);
    }

    public function test_preview_carries_the_style_class_and_the_rendered_font() {
        $this->freshInstance();
        Functions\when('get_user_locale')->justReturn('en_US');
        $html = \Typost_Paragraph_Styles::render_card_preview(7, array('status' => 'replaced', 'name' => 'Theme Serif', 'font_id' => 40), array(40 => true));

        $this->assertStringContainsString('id="typost-ps-preview-7"', $html);
        $this->assertStringContainsString('class="typost-ps-preview-sample typost-ps-7"', $html);
        $this->assertStringContainsString('lang="en"', $html);
        $this->assertStringContainsString('data-typost-font-id="40"', $html);
        $this->assertStringContainsString('typost-ps-preview-note', $html);
    }

    public function test_preview_without_a_font_has_no_font_id() {
        $this->freshInstance();
        Functions\when('get_user_locale')->justReturn('en_US');
        $html = \Typost_Paragraph_Styles::render_card_preview(3, array('status' => 'default', 'name' => '', 'font_id' => 0), array());
        $this->assertStringNotContainsString('data-typost-font-id', $html);
        $this->assertStringNotContainsString('typost-ps-preview-note', $html);
    }

    // -------------------------------------------------------------------------
    // GET /paragraph-styles/{id}/admin-card
    // -------------------------------------------------------------------------

    private function stubStyles(array $styles, $css) {
        // Core's options (the new-content unit, fonts) read as their defaults
        Functions\when('get_option')->alias(function ($key, $default = false) {
            return $default;
        });
        Functions\when('get_transient')->alias(function ($key) use ($styles, $css) {
            return \Typost_Paragraph_Styles::CSS_CACHE_KEY === $key ? $css : $styles;
        });
    }

    public function test_admin_card_returns_details_preview_and_css() {
        $module = $this->freshInstance();
        Functions\when('get_user_locale')->justReturn('en_US');
        $this->stubStyles(
            array(array('id' => 4, 'name' => 'Pull quote', 'properties' => array('lineHeight' => 1.8))),
            '.typost-ps-4 { line-height: 1.8; }'
        );

        $response = $module->rest_get_admin_card(array('id' => '4'));

        $this->assertSame(200, $response->get_status());
        $data = $response->get_data();
        $this->assertSame('Pull quote', $data['style']['name']);
        $this->assertStringContainsString('<strong>Line Height:</strong> 1.8', $data['details']);
        $this->assertStringContainsString('typost-ps-preview-sample typost-ps-4', $data['preview']);
        $this->assertSame('.typost-ps-4 { line-height: 1.8; }', $data['css']);
    }

    public function test_admin_card_for_an_unknown_style_is_404() {
        $module = $this->freshInstance();
        $this->stubStyles(array(), '');
        $response = $module->rest_get_admin_card(array('id' => '9'));
        $this->assertSame(404, $response->get_status());
    }

    // -------------------------------------------------------------------------
    // Template and localized data
    // -------------------------------------------------------------------------

    private function renderTab(array $styles, $instance) {
        $module = $this->freshInstance();
        $reflection = new \ReflectionClass(\Typost_Paragraph_Styles::class);
        $prop = $reflection->getProperty('instance');
        $prop->setAccessible(true);
        $prop->setValue(null, $module);

        $this->stubStyles($styles, '');
        Functions\when('get_user_locale')->justReturn('en_US');
        Functions\when('esc_html_e')->echoArg();
        Functions\when('wp_specialchars_decode')->alias(function ($text) {
            return htmlspecialchars_decode($text, ENT_QUOTES);
        });

        ob_start();
        $module->render_admin_tab($instance);
        $html = ob_get_clean();
        $prop->setValue(null, null);
        return $html;
    }

    public function test_tab_renders_one_form_template_with_every_field() {
        $html = $this->renderTab(
            array(
                array('id' => 1, 'name' => 'Body', 'properties' => array()),
                array('id' => 2, 'name' => 'Caption', 'properties' => array('fontId' => 36)),
            ),
            $this->fontsInstance()
        );

        $this->assertSame(1, substr_count($html, '<template id="typost-ps-edit-form-template">'));
        foreach (self::FORM_FIELDS as $field) {
            $this->assertStringContainsString('data-field="' . $field . '"', $html, $field);
        }
        // Each card gets an empty container, filled from the template
        $this->assertSame(2, substr_count($html, '<div class="typost-ps-edit-form" style="display: none;"></div>'));
        // Font choices, the feature list (escaped once) and every case value
        $this->assertStringContainsString('<option value="36">Fraunces</option>', $html);
        $this->assertStringContainsString('value="ss01"', $html);
        // Core's names arrive HTML-escaped; they are decoded before esc_html()
        // (a pass-through here), so the page escapes them once
        $this->assertStringContainsString('Swashes & Flourishes', $html);
        foreach (\Typost_Paragraph_Styles::TEXT_CASE_VALUES as $case) {
            $this->assertStringContainsString('<option value="' . $case . '">', $html);
        }
        // fontSizeUnit is kept, never shown
        $this->assertStringNotContainsString('fontSizeUnit', $html);
    }

    public function test_card_buttons_carry_the_escaped_style_name() {
        // #295: a list of buttons tells the cards apart. Real escaping here,
        // so a name with quotes or markup cannot leave the attribute.
        Functions\when('esc_attr')->alias(function ($text) {
            return htmlspecialchars($text, ENT_QUOTES);
        });
        $html = $this->renderTab(
            array(
                array('id' => 1, 'name' => 'Body', 'properties' => array()),
                array('id' => 2, 'name' => 'Pull "quote" <b>&', 'properties' => array()),
            ),
            $this->fontsInstance()
        );

        $this->assertStringContainsString('aria-label="Edit “Body”"', $html);
        $this->assertStringContainsString('aria-label="Delete “Body”"', $html);
        $this->assertStringContainsString('aria-label="Edit “Pull &quot;quote&quot; &lt;b&gt;&amp;”"', $html);
        $this->assertStringContainsString('aria-label="Delete “Pull &quot;quote&quot; &lt;b&gt;&amp;”"', $html);
    }

    public function test_admin_assets_localize_the_styles_and_new_content_unit() {
        $module = $this->freshInstance();
        Functions\when('wp_enqueue_script')->justReturn(null);
        Functions\when('wp_set_script_translations')->justReturn(true);
        Functions\when('wp_enqueue_style')->justReturn(null);
        Functions\when('wp_add_inline_style')->justReturn(true);
        Functions\when('rest_url')->justReturn('http://localhost/wp-json/typost/v1/paragraph-styles');
        Functions\when('wp_create_nonce')->justReturn('nonce');
        $styles = array(array('id' => 4, 'name' => 'Pull quote', 'properties' => array('lineHeight' => 1.8)));
        $this->stubStyles($styles, '');

        $localized = null;
        Functions\when('wp_localize_script')->alias(function ($handle, $name, $data) use (&$localized) {
            $localized = array($handle, $name, $data);
            return true;
        });

        $module->enqueue_admin_assets();

        $this->assertSame('typost-paragraph-styles-admin', $localized[0]);
        $this->assertSame('typostPSAdmin', $localized[1]);
        $this->assertSame($styles, $localized[2]['styles']);
        $this->assertContains($localized[2]['newFontSizeUnit'], array('px', 'rem'));
    }
}

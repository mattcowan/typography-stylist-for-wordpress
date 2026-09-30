<?php
namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use Brain\Monkey\Functions;

/**
 * Tests for the settings page font loading work in #226:
 * - the admin assets are enqueued from one hook, once per page load;
 * - font card headings past the first screen defer their font to JS;
 * - the Feature Visibility section renders only its shell.
 */
class AdminPageFontLoadingTest extends TestCase {

    private function loadTemplate() {
        require_once TYPOST_PLUGIN_DIR . '/includes/admin-page.php';
    }

    private function freshInstance() {
        static $loaded = false;
        if (!$loaded) {
            require_once TYPOST_PLUGIN_DIR . '/typography-stylist.php';
            $loaded = true;
        }
        $reflection = new \ReflectionClass(\Typost::class);
        return $reflection->newInstanceWithoutConstructor();
    }

    // -------------------------------------------------------------------------
    // typost_font_heading_attributes()
    // -------------------------------------------------------------------------

    public function test_first_screen_card_gets_inline_font_and_font_id() {
        $this->loadTemplate();
        $this->assertSame(
            ' data-typost-font-id="12" style="font-family: var(--font-12), sans-serif"',
            typost_font_heading_attributes('var(--font-12), sans-serif', 12, 0)
        );
    }

    public function test_last_eager_card_is_still_inline() {
        $this->loadTemplate();
        $attrs = typost_font_heading_attributes('var(--font-3), sans-serif', 3, TYPOST_ADMIN_EAGER_FONT_CARDS - 1);
        $this->assertStringContainsString(' style="font-family: var(--font-3), sans-serif"', $attrs);
        $this->assertStringNotContainsString('data-typost-font-family', $attrs);
    }

    public function test_card_past_the_first_screen_defers_its_font() {
        $this->loadTemplate();
        $this->assertSame(
            ' data-typost-font-id="40" data-typost-font-family="var(--font-40), sans-serif"',
            typost_font_heading_attributes('var(--font-40), sans-serif', 40, TYPOST_ADMIN_EAGER_FONT_CARDS)
        );
    }

    public function test_library_card_without_font_id_gets_only_the_family() {
        $this->loadTemplate();
        $this->assertSame(
            ' data-typost-font-family="Inter, sans-serif"',
            typost_font_heading_attributes('Inter, sans-serif', 0, 50)
        );
    }

    public function test_no_family_and_no_id_gives_no_attributes() {
        $this->loadTemplate();
        $this->assertSame('', typost_font_heading_attributes('', 0, 0));
        $this->assertSame('', typost_font_heading_attributes('', 'abc', 99));
    }

    public function test_font_id_without_family_still_lets_js_load_the_kit() {
        $this->loadTemplate();
        $this->assertSame(' data-typost-font-id="7"', typost_font_heading_attributes('', '7', 99));
    }

    // -------------------------------------------------------------------------
    // typost_render_feature_visibility_checkboxes()
    // -------------------------------------------------------------------------

    public function test_feature_visibility_renders_the_shell_without_checkboxes() {
        $this->loadTemplate();
        Functions\when('esc_html_e')->alias(function ($text) {
            echo $text;
        });

        ob_start();
        typost_render_feature_visibility_checkboxes(array('font_id' => 36), null);
        $html = ob_get_clean();

        $this->assertStringContainsString('data-font-numeric-id="36"', $html);
        $this->assertStringContainsString('typost-form-enable-all', $html);
        $this->assertStringContainsString('<div class="typost-form-visibility-categories"></div>', $html);
        $this->assertStringNotContainsString('typost-font-form-visibility-checkbox', $html);
    }

    public function test_feature_visibility_renders_nothing_without_a_font_id() {
        $this->loadTemplate();
        ob_start();
        typost_render_feature_visibility_checkboxes(array('id' => 'kit-x'), null);
        $this->assertSame('', ob_get_clean());
    }

    // -------------------------------------------------------------------------
    // Admin asset hook (single enqueue)
    // -------------------------------------------------------------------------

    public function test_admin_menu_hooks_the_assets_once_on_admin_enqueue_scripts() {
        $plugin = $this->freshInstance();
        $added  = array();
        Functions\when('esc_html__')->returnArg();
        Functions\when('add_options_page')->justReturn('settings_page_typography-stylist');
        Functions\when('add_action')->alias(function ($hook, $callback) use (&$added) {
            $added[] = $hook;
            return true;
        });

        $plugin->add_admin_menu();

        $this->assertSame(array('admin_enqueue_scripts'), $added);
    }

    public function test_assets_enqueue_only_on_the_settings_page_hook() {
        $this->freshInstance();
        $plugin = $this->getMockBuilder(\Typost::class)
            ->disableOriginalConstructor()
            ->onlyMethods(array('enqueue_admin_assets'))
            ->getMock();
        $plugin->expects($this->once())->method('enqueue_admin_assets');

        $property = new \ReflectionProperty(\Typost::class, 'admin_page_hook');
        $property->setAccessible(true);
        $property->setValue($plugin, 'settings_page_typography-stylist');

        $plugin->maybe_enqueue_admin_assets('post.php');
        $plugin->maybe_enqueue_admin_assets('settings_page_typography-stylist');
    }

    public function test_assets_never_enqueue_before_the_menu_registers_the_page() {
        $this->freshInstance();
        $plugin = $this->getMockBuilder(\Typost::class)
            ->disableOriginalConstructor()
            ->onlyMethods(array('enqueue_admin_assets'))
            ->getMock();
        $plugin->expects($this->never())->method('enqueue_admin_assets');

        // add_options_page() returns false when the user lacks the capability;
        // an empty hook must not match an empty or missing hook suffix.
        $plugin->maybe_enqueue_admin_assets('');
    }

    public function test_feature_category_titles_cover_every_feature_category() {
        $plugin = $this->freshInstance();
        Functions\when('apply_filters')->returnArg(2);
        Functions\when('wp_cache_get')->justReturn(false);
        Functions\when('wp_cache_set')->justReturn(true);

        $titles = $plugin->get_feature_category_titles();
        foreach ($plugin->get_available_features() as $feature) {
            $this->assertArrayHasKey($feature['category'], $titles, 'No title for category ' . $feature['category']);
        }
    }
}

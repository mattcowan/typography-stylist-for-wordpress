<?php
namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use Brain\Monkey\Functions;

/**
 * Tests for the safe_style_css filter (#277).
 *
 * kses runs safecss_filter_attr() on post content saved by a user without
 * unfiltered_html. It drops every declaration whose property is not on the
 * safe_style_css list, and WordPress's list has no font-feature-settings,
 * font-variation-settings, font-variant-caps or font-synthesis-small-caps.
 */
class SafeStyleCssTest extends TestCase {

    protected function setUp(): void {
        parent::setUp();

        static $loaded = false;
        if (!$loaded) {
            require_once TYPOST_PLUGIN_DIR . '/typography-stylist.php';
            $loaded = true;
        }
    }

    private function plugin() {
        $reflection = new \ReflectionClass(\Typost::class);
        return $reflection->newInstanceWithoutConstructor();
    }

    public function test_adds_the_four_properties_kses_does_not_allow() {
        $allowed = $this->plugin()->allow_typography_css_properties(['font-family', 'text-transform']);

        foreach (['font-feature-settings', 'font-variation-settings', 'font-variant-caps', 'font-synthesis-small-caps'] as $property) {
            $this->assertContains($property, $allowed);
        }
    }

    public function test_keeps_the_existing_list_and_adds_no_duplicates() {
        $allowed = $this->plugin()->allow_typography_css_properties(['font-family', 'font-feature-settings']);

        $this->assertSame('font-family', $allowed[0]);
        $this->assertSame(1, count(array_keys($allowed, 'font-feature-settings', true)));
        $this->assertSame(array_values($allowed), $allowed, 'a list, not a sparse array');
    }

    public function test_adds_only_font_properties() {
        // The filter widens kses for every post on the site: it must not add
        // a property that takes url() or affects layout outside the text
        foreach (\Typost::SAFE_CSS_PROPERTIES as $property) {
            $this->assertStringStartsWith('font-', $property);
        }
    }

    public function test_a_value_that_is_not_an_array_is_returned_unchanged() {
        $this->assertNull($this->plugin()->allow_typography_css_properties(null));
        $this->assertSame('x', $this->plugin()->allow_typography_css_properties('x'));
    }

    public function test_the_filter_is_registered_with_the_other_hooks() {
        // TestCase stubs add_filter, so record the calls instead of asking
        // has_filter()
        $filters = [];
        Functions\when('add_filter')->alias(function ($hook, $callback) use (&$filters) {
            $filters[] = [$hook, $callback];
            return true;
        });
        Functions\when('register_activation_hook')->justReturn(null);
        $plugin = $this->plugin();
        $init = new \ReflectionMethod(\Typost::class, 'init_hooks');
        $init->setAccessible(true);
        $init->invoke($plugin);

        $this->assertContains(['safe_style_css', [$plugin, 'allow_typography_css_properties']], $filters);
    }
}

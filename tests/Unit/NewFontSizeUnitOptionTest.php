<?php
namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use Brain\Monkey\Functions;

/**
 * Tests for the `typost_new_font_sizes_px` option (#248).
 *
 * New content writes font sizes in rem by default (#233). The Options tab
 * setting "Write new font sizes in px" switches new content to px for themes
 * that change the root font size. The editor receives the unit as the string
 * typostData.newFontSizeUnit ('px' or 'rem'), never as a stringified flag.
 */
class NewFontSizeUnitOptionTest extends TestCase {

    /** @var array Simulated wp_options storage */
    private $options;

    protected function setUp(): void {
        parent::setUp();

        static $loaded = false;
        if (!$loaded) {
            require_once TYPOST_PLUGIN_DIR . '/typography-stylist.php';
            $loaded = true;
        }

        $this->options = [];
        $options = &$this->options;

        Functions\when('get_option')->alias(function ($key, $default = false) use (&$options) {
            return array_key_exists($key, $options) ? $options[$key] : $default;
        });
    }

    private function unit() {
        $reflection = new \ReflectionClass(\Typost::class);
        return $reflection->newInstanceWithoutConstructor()->get_new_font_size_unit();
    }

    public function test_rem_by_default() {
        $this->assertSame('rem', $this->unit());
    }

    public function test_px_when_the_option_is_on() {
        $this->options['typost_new_font_sizes_px'] = '1';
        $this->assertSame('px', $this->unit());
    }

    public function test_rem_when_the_option_is_off() {
        // Stored as '0' by both save paths: must not read as on
        $this->options['typost_new_font_sizes_px'] = '0';
        $this->assertSame('rem', $this->unit());
    }

    /**
     * Both save paths write the option, the editor data carries the unit as
     * a string and uninstall removes the option.
     */
    public function test_option_is_wired_through_the_save_paths() {
        $main = file_get_contents(TYPOST_PLUGIN_DIR . '/typography-stylist.php');

        // REST save: only when the client sent the value
        $this->assertMatchesRegularExpression(
            "/null !== \\\$request->get_param\('new_font_sizes_px'\)\)\s*\{\s*update_option\('typost_new_font_sizes_px'/",
            $main
        );
        // No-JS POST fallback
        $this->assertStringContainsString("isset(\$_POST['typost_new_font_sizes_px']) ? '1' : '0'", $main);
        // Editor data
        $this->assertStringContainsString("'newFontSizeUnit' => \$this->get_new_font_size_unit()", $main);

        $uninstall = file_get_contents(TYPOST_PLUGIN_DIR . '/uninstall.php');
        $this->assertStringContainsString("delete_option('typost_new_font_sizes_px');", $uninstall);

        $template = file_get_contents(TYPOST_PLUGIN_DIR . '/includes/admin-page.php');
        $this->assertStringContainsString('name="typost_new_font_sizes_px"', $template);
        $this->assertStringContainsString("checked(get_option('typost_new_font_sizes_px', false))", $template);
    }
}

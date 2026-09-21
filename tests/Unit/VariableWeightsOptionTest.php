<?php
namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use Brain\Monkey\Functions;

/**
 * Tests for the `typost_allow_variable_weights` option (QA finding E-14).
 *
 * The option has no admin control: the Options tab row was removed, and
 * the no-JS POST fallback no longer writes it (a form save must not reset
 * an option it renders no checkbox for). The sanitizer keeps reading it,
 * default false, so a site that set it directly keeps 1-1000 weights.
 */
class VariableWeightsOptionTest extends TestCase {

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
        Functions\when('absint')->alias(function ($v) {
            return abs((int) $v);
        });
    }

    private function plugin() {
        $reflection = new \ReflectionClass(\Typost::class);
        return $reflection->newInstanceWithoutConstructor();
    }

    private function sanitizeFaces(array $faces) {
        $method = new \ReflectionMethod(\Typost::class, 'sanitize_font_faces');
        $method->setAccessible(true);
        return $method->invoke($this->plugin(), $faces);
    }

    public function test_intermediate_weight_rejected_when_option_unset() {
        $faces = $this->sanitizeFaces([['family' => 'Var', 'weight' => '450']]);
        $this->assertSame('normal', $faces[0]['weight']);
    }

    public function test_intermediate_weight_accepted_when_option_set() {
        $this->options['typost_allow_variable_weights'] = '1';

        $faces = $this->sanitizeFaces([['family' => 'Var', 'weight' => '450'], ['family' => 'Var', 'weight' => '1000']]);
        $this->assertSame('450', $faces[0]['weight']);
        $this->assertSame('1000', $faces[1]['weight']);
    }

    public function test_out_of_range_weight_rejected_even_when_option_set() {
        $this->options['typost_allow_variable_weights'] = '1';

        $faces = $this->sanitizeFaces([['family' => 'Var', 'weight' => '1200'], ['family' => 'Var', 'weight' => '0']]);
        $this->assertSame('normal', $faces[0]['weight']);
        $this->assertSame('normal', $faces[1]['weight']);
    }

    public function test_standard_weights_accepted_regardless_of_option() {
        $faces = $this->sanitizeFaces([['weight' => '700'], ['weight' => 'bold'], ['weight' => '300']]);
        $this->assertSame(['700', 'bold', '300'], array_column($faces, 'weight'));
    }

    /**
     * The no-JS Options POST handler must not touch the option: the file's
     * only remaining references are the sanitizer read and its docblock.
     */
    public function test_options_post_fallback_no_longer_writes_the_option() {
        $source = file_get_contents(TYPOST_PLUGIN_DIR . '/typography-stylist.php');

        $this->assertSame(0, preg_match('/update_option\(\s*[\'"]typost_allow_variable_weights[\'"]/', $source));
        // Control: the sanitizer read is still there (proves the pattern style matches)
        $this->assertSame(1, preg_match('/get_option\(\s*[\'"]typost_allow_variable_weights[\'"]/', $source));

        $admin = file_get_contents(TYPOST_PLUGIN_DIR . '/includes/admin-page.php');
        $this->assertStringNotContainsString('allow_variable_weights', $admin);
    }
}

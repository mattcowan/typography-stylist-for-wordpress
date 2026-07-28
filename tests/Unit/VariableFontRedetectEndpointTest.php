<?php
namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use Brain\Monkey\Functions;

/**
 * The re-detect endpoint re-reads a font's axes from its own binaries and
 * hands them back for review. It must never write the axes option itself —
 * the admin form repopulates its rows and the author still has to save, so a
 * mis-click cannot destroy hand-tuned axis definitions.
 */
class VariableFontRedetectEndpointTest extends TestCase {

    /** @var string Temporary kit directory */
    private $kitDir;

    /** @var array Simulated wp_options storage */
    private $options;

    protected function setUp(): void {
        parent::setUp();

        if (!defined('TYPOST_VF_VERSION')) {
            define('TYPOST_VF_VERSION', 'test-version');
            define('TYPOST_VF_PLUGIN_DIR', TYPOST_PLUGIN_DIR . '/variable-fonts/');
            define('TYPOST_VF_PLUGIN_URL', 'http://localhost/variable-fonts/');
        }
        require_once TYPOST_PLUGIN_DIR . '/variable-fonts/variable-fonts.php';

        $this->kitDir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'typost-vf-rest-' . uniqid('', true);
        mkdir($this->kitDir, 0777, true);

        // A single-axis variable font: fvar-only sfnt, wght 100..900.
        $fvar = pack('nnnnnnnn', 1, 0, 16, 2, 1, 20, 0, 0)
            . 'wght' . pack('NNN', 100 * 65536, 400 * 65536, 900 * 65536) . pack('nn', 0, 0);
        file_put_contents(
            $this->kitDir . DIRECTORY_SEPARATOR . 'demo.ttf',
            pack('N', 0x00010000) . pack('nnnn', 1, 0, 0, 0)
            . 'fvar' . pack('NNN', 0, 28, strlen($fvar)) . $fvar
        );

        $this->options = [
            'typost_variable_font_axes' => [
                'kit-demo-fraunces' => [
                    ['tag' => 'opsz', 'name' => 'Hand tuned', 'min' => 10, 'max' => 20, 'default' => 12],
                ],
            ],
        ];

        $options = &$this->options;
        Functions\when('get_option')->alias(function ($key, $default = false) use (&$options) {
            return array_key_exists($key, $options) ? $options[$key] : $default;
        });
        Functions\when('update_option')->alias(function ($key, $value) use (&$options) {
            $options[$key] = $value;
            return true;
        });
        Functions\when('get_transient')->justReturn(false);
        Functions\when('set_transient')->justReturn(true);
        Functions\when('delete_transient')->justReturn(true);
        Functions\when('rest_ensure_response')->returnArg();
    }

    protected function tearDown(): void {
        if (is_dir($this->kitDir)) {
            foreach (glob($this->kitDir . DIRECTORY_SEPARATOR . '*') as $file) {
                unlink($file);
            }
            rmdir($this->kitDir);
        }
        parent::tearDown();
    }

    /**
     * Stand-in for WP_REST_Request carrying only the id param.
     *
     * @param string $id Font string id.
     * @return object
     */
    private function request($id) {
        return new class($id) {
            private $id;
            public function __construct($id) {
                $this->id = $id;
            }
            public function get_param($name) {
                return 'id' === $name ? $this->id : null;
            }
        };
    }

    /**
     * Replace the Typost singleton with a stub exposing the kit fonts.
     *
     * @param array $fonts Font entries get_custom_fonts() should return.
     */
    private function stubTypostFonts(array $fonts) {
        $reflection = new \ReflectionClass(\Typost::class);
        $instance = $reflection->getProperty('instance');
        $instance->setAccessible(true);
        $instance->setValue(null, new class($fonts) {
            private $fonts;
            public function __construct($fonts) {
                $this->fonts = $fonts;
            }
            public function get_custom_fonts() {
                return $this->fonts;
            }
        });
    }

    private function module() {
        $reflection = new \ReflectionClass(\Typost_Variable_Fonts::class);
        $instance = $reflection->getProperty('instance');
        $instance->setAccessible(true);
        $module = $reflection->newInstanceWithoutConstructor();
        $instance->setValue(null, $module);
        return $module;
    }

    // -------------------------------------------------------------------------
    // Tests
    // -------------------------------------------------------------------------

    public function testPermissionCallbackRequiresManageOptions() {
        $module = $this->module();

        Functions\when('current_user_can')->alias(function ($cap) {
            return 'manage_options' === $cap;
        });
        $this->assertTrue($module->check_permissions());

        Functions\when('current_user_can')->alias(function ($cap) {
            return 'edit_posts' === $cap;
        });
        $this->assertFalse($module->check_permissions());
    }

    public function testReturnsDetectedAxesWithoutWritingTheOption() {
        require_once TYPOST_PLUGIN_DIR . '/typography-stylist.php';
        $this->stubTypostFonts([
            [
                'id'          => 'kit-demo-fraunces',
                'font_id'     => 12,
                'font_faces'  => [
                    ['src' => "url('/wp-content/uploads/typography-stylist/fonts/kit-demo/demo.ttf')"],
                ],
                'upload_path' => $this->kitDir,
                'upload_url'  => 'http://localhost/wp-content/uploads/typography-stylist/fonts/kit-demo',
            ],
        ]);

        $before = $this->options['typost_variable_font_axes'];
        $response = $this->module()->rest_redetect_axes($this->request('kit-demo-fraunces'));

        $this->assertTrue($response['success']);
        $this->assertSame('kit-demo-fraunces', $response['fontId']);
        $this->assertCount(1, $response['axes']);
        $this->assertSame('wght', $response['axes'][0]['tag']);
        $this->assertSame(900.0, $response['axes'][0]['max']);

        // The hand-tuned stored axes are untouched until the user saves.
        $this->assertSame($before, $this->options['typost_variable_font_axes']);
    }

    public function testUnknownFontIsRejectedAndNothingIsStored() {
        require_once TYPOST_PLUGIN_DIR . '/typography-stylist.php';
        $this->stubTypostFonts([]);

        $before = $this->options['typost_variable_font_axes'];
        $response = $this->module()->rest_redetect_axes($this->request('adobe-typekit-project'));

        $this->assertInstanceOf(\WP_Error::class, $response);
        $this->assertSame('font_not_found', $response->get_error_code());
        $this->assertSame($before, $this->options['typost_variable_font_axes']);
    }
}

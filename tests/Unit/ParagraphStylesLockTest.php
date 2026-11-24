<?php
/**
 * #452: "Only administrators can change paragraph styles" (Options tab).
 *
 * With the lock on, the routes that create, change and delete a style refuse
 * a user without manage_options with 403, in the permission callback. The
 * read routes stay open, an administrator keeps everything, and the lock is
 * off on a new install and on an updated site (no option stored). The option
 * travels with the Options section of an export, and the editor gets a
 * boolean flag for the current user.
 *
 * The option is set per test in a simulated wp_options array, never in a
 * database.
 *
 * @package Typography_Stylist
 */

namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use Brain\Monkey\Functions;

class ParagraphStylesLockTest extends TestCase {

    /** @var array Simulated wp_options storage */
    private $options = array();

    /** @var string[] Capabilities of the current user */
    private $caps = array();

    /** @var array[] Calls to register_rest_route(): route => list of endpoint arrays */
    private $routes = array();

    protected function setUp(): void {
        parent::setUp();
        if (!defined('HOUR_IN_SECONDS')) {
            define('HOUR_IN_SECONDS', 3600);
        }
        Functions\when('plugin_dir_path')->justReturn(TYPOST_PLUGIN_DIR . '/paragraph-styles/');
        Functions\when('plugin_dir_url')->justReturn('http://localhost/paragraph-styles/');
        require_once TYPOST_PLUGIN_DIR . '/paragraph-styles/paragraph-styles.php';

        $this->options = array();
        $this->caps    = array();
        $this->routes  = array();
        $options       = &$this->options;
        $caps          = &$this->caps;
        $routes        = &$this->routes;

        Functions\when('get_option')->alias(function ($key, $default = false) use (&$options) {
            return array_key_exists($key, $options) ? $options[$key] : $default;
        });
        Functions\when('current_user_can')->alias(function ($cap) use (&$caps) {
            return in_array($cap, $caps, true);
        });
        // 403 for a logged-in user, as core returns it
        Functions\when('rest_authorization_required_code')->justReturn(403);
        Functions\when('register_rest_route')->alias(function ($namespace, $route, $endpoints) use (&$routes) {
            $routes[$route] = $endpoints;
            return true;
        });
    }

    private function module() {
        return (new \ReflectionClass(\Typost_Paragraph_Styles::class))->newInstanceWithoutConstructor();
    }

    private function author() {
        $this->caps = array('edit_posts');
    }

    private function administrator() {
        $this->caps = array('edit_posts', 'manage_options');
    }

    private function lock($value) {
        $this->options['typost_ps_lock_style_changes'] = $value;
    }

    /**
     * The permission callback of each method of each route.
     *
     * @return array "METHOD /route" => callback
     */
    private function callbacks() {
        if (!class_exists('WP_REST_Server')) {
            // The constants register_rest_routes() reads, with core's values
            eval('class WP_REST_Server { const READABLE = "GET"; const CREATABLE = "POST"; const EDITABLE = "POST, PUT, PATCH"; const DELETABLE = "DELETE"; const ALLMETHODS = "GET, POST, PUT, PATCH, DELETE"; }');
        }
        $this->module()->register_rest_routes();
        $out = array();
        foreach ($this->routes as $route => $endpoints) {
            foreach ($endpoints as $endpoint) {
                $out[$endpoint['methods'] . ' ' . $route] = $endpoint['permission_callback'];
            }
        }
        return $out;
    }

    public function test_the_lock_is_off_with_no_option_stored() {
        $this->author();
        $module = $this->module();
        $this->assertTrue($module->check_write_permissions(), 'A new install or an updated site stores no option: the lock is off');
        $this->assertFalse($module->style_changes_locked_for_current_user());
    }

    public function test_the_lock_refuses_an_author_with_403() {
        $this->author();
        $this->lock('1');
        $result = $this->module()->check_write_permissions();
        $this->assertInstanceOf(\WP_Error::class, $result);
        $this->assertSame('rest_forbidden', $result->get_error_code());
        $this->assertSame(array('status' => 403), $result->get_error_data());
        $this->assertNotSame('', $result->get_error_message());
    }

    public function test_the_lock_keeps_an_administrator_allowed() {
        $this->administrator();
        $this->lock('1');
        $this->assertTrue($this->module()->check_write_permissions());
        $this->assertFalse($this->module()->style_changes_locked_for_current_user());
    }

    public function test_an_options_save_that_unchecks_the_box_turns_the_lock_off() {
        // Both Options saves store through Typost_Admin_Options::sanitize():
        // the AJAX save sends the JSON false of an unchecked box
        // (admin-page.js, data-typost-option), and the no-JavaScript POST
        // fallback sends isset($_POST[...]), which is false for it too
        require_once TYPOST_PLUGIN_DIR . '/includes/class-typost-admin-options.php';
        // As core: the strings "false" and "0" are false
        Functions\when('rest_sanitize_boolean')->alias(function ($value) {
            if (is_string($value) && in_array(strtolower($value), array('false', '0'), true)) {
                $value = false;
            }
            return (bool) $value;
        });
        $this->author();
        $this->lock(\Typost_Admin_Options::sanitize('typost_ps_lock_style_changes', true));
        $this->assertInstanceOf(\WP_Error::class, $this->module()->check_write_permissions(), 'A checked box turns the lock on');

        $this->lock(\Typost_Admin_Options::sanitize('typost_ps_lock_style_changes', false));
        $this->assertSame('0', $this->options['typost_ps_lock_style_changes'], 'An unchecked box stores 0, not nothing');
        $this->assertTrue($this->module()->check_write_permissions());
    }

    public function test_a_user_without_edit_posts_stays_refused_with_the_lock_off() {
        $this->caps = array();
        $this->assertFalse($this->module()->check_write_permissions());
    }

    public function test_reads_stay_open_with_the_lock_on() {
        $this->author();
        $this->lock('1');
        $this->assertTrue($this->module()->check_permissions());
    }

    public function test_write_routes_use_the_write_check_and_read_routes_do_not() {
        $callbacks = $this->callbacks();
        $name = function ($callback) {
            return is_array($callback) ? $callback[1] : $callback;
        };
        $this->assertSame('check_write_permissions', $name($callbacks['POST /paragraph-styles']));
        $this->assertSame('check_write_permissions', $name($callbacks['PATCH /paragraph-styles/(?P<id>[\d]+)']));
        $this->assertSame('check_write_permissions', $name($callbacks['DELETE /paragraph-styles/(?P<id>[\d]+)']));
        $this->assertSame('check_permissions', $name($callbacks['GET /paragraph-styles']));
        $this->assertSame('check_permissions', $name($callbacks['GET /paragraph-styles/(?P<id>[\d]+)/admin-card']));
        $this->assertSame('check_permissions', $name($callbacks['GET /paragraph-styles/editor-css']));
        // Every route was found: a renamed route would leave one untested
        $this->assertCount(6, $callbacks);
    }

    public function test_each_write_route_refuses_a_locked_author_and_allows_an_administrator() {
        $callbacks = $this->callbacks();
        foreach (array('POST /paragraph-styles', 'PATCH /paragraph-styles/(?P<id>[\d]+)', 'DELETE /paragraph-styles/(?P<id>[\d]+)') as $key) {
            $this->lock('1');
            $this->author();
            $result = call_user_func($callbacks[$key]);
            $this->assertInstanceOf(\WP_Error::class, $result, $key . ' with the lock on, as an author');
            $this->assertSame(array('status' => 403), $result->get_error_data(), $key);

            $this->administrator();
            $this->assertTrue(call_user_func($callbacks[$key]), $key . ' with the lock on, as an administrator');

            $this->lock('0');
            $this->author();
            $this->assertTrue(call_user_func($callbacks[$key]), $key . ' with the lock off, as an author');
        }
    }

    public function test_the_editor_flag_is_a_boolean_for_the_current_user() {
        Functions\when('get_transient')->justReturn(array());
        Functions\when('set_transient')->justReturn(true);
        $module = $this->module();
        $flag = function () use ($module) {
            // Only the flag: the rest of add_editor_data() reads styles, colors and the GREP support
            $method = new \ReflectionMethod($module, 'style_changes_locked_for_current_user');
            return $method->invoke($module);
        };

        $this->author();
        $this->lock('1');
        $this->assertTrue($flag());
        $this->lock('0');
        $this->assertFalse($flag(), "A stored '0' is off, not the truthy string \"0\"");
        $this->administrator();
        $this->lock('1');
        $this->assertFalse($flag());
    }

    public function test_add_editor_data_sends_the_flag_cast_to_bool() {
        $source = file_get_contents(TYPOST_PLUGIN_DIR . '/paragraph-styles/paragraph-styles.php');
        $start = strpos($source, 'public function add_editor_data(');
        $this->assertNotFalse($start);
        $body = substr($source, $start, strpos($source, "\n\t}\n", $start) - $start);
        $this->assertMatchesRegularExpression("/'styleChangesLocked'\\s*=>\\s*\\(bool\\)\\s*\\\$this->style_changes_locked_for_current_user\\(\\)/", $body);
    }

    public function test_the_option_is_registered_exported_and_off_by_default() {
        $module = $this->module();
        $this->assertContains('typost_ps_lock_style_changes', $module->register_option_key(array()));
        $details = $module->export_option_details(array());
        $this->assertArrayHasKey('typost_ps_lock_style_changes', $details);
        $this->assertFalse($details['typost_ps_lock_style_changes']['default']);
        $this->assertNotSame('', $details['typost_ps_lock_style_changes']['label']);
        // The toolbar option is still there
        $this->assertArrayHasKey('typost_ps_toolbar_button', $details);
    }

    public function test_the_options_row_shows_the_stored_state() {
        Functions\when('esc_html_e')->justReturn(null);
        Functions\when('checked')->alias(function ($value) {
            echo $value ? " checked='checked'" : '';
        });
        $module = $this->module();
        foreach (array(array(null, false), array('1', true), array('0', false)) as $case) {
            $this->options = null === $case[0] ? array() : array('typost_ps_lock_style_changes' => $case[0]);
            ob_start();
            $module->render_lock_options_row();
            $html = ob_get_clean();
            $this->assertStringContainsString('name="typost_ps_lock_style_changes"', $html);
            $this->assertSame($case[1], false !== strpos($html, "checked='checked'"), var_export($case[0], true));
        }
    }

    public function test_uninstall_deletes_the_option() {
        $source = file_get_contents(TYPOST_PLUGIN_DIR . '/uninstall.php');
        $this->assertStringContainsString("delete_option('typost_ps_lock_style_changes');", $source);
    }
}

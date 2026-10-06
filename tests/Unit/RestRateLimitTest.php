<?php
namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use Brain\Monkey\Functions;

/**
 * Tests for the REST write-request rate limit.
 *
 * The limit used to live only in check_permissions(), so it covered just the
 * routes that use that callback (presets, font order). Font kits, Adobe
 * projects, custom fonts, replacements, the Font Library routes and the
 * bundled modules use their own callbacks and had no limit at all.
 * enforce_rest_rate_limit() now applies the same counter to every write
 * request in the typost/v1 namespace, after the route's own permission check
 * has passed.
 */
class RestRateLimitTest extends TestCase {

    /** @var array Simulated transients */
    private $transients;

    protected function setUp(): void {
        parent::setUp();

        if (!defined('MINUTE_IN_SECONDS')) {
            define('MINUTE_IN_SECONDS', 60);
        }

        $this->transients = [];
        $transients = &$this->transients;

        Functions\when('get_transient')->alias(function ($key) use (&$transients) {
            return array_key_exists($key, $transients) ? $transients[$key] : false;
        });
        Functions\when('set_transient')->alias(function ($key, $value) use (&$transients) {
            $transients[$key] = $value;
            return true;
        });
        Functions\when('get_current_user_id')->justReturn(7);
        Functions\when('current_user_can')->justReturn(true);
        Functions\when('esc_html__')->returnArg(1);
    }

    private function getPluginInstance() {
        static $loaded = false;
        if (!$loaded) {
            require_once TYPOST_PLUGIN_DIR . '/typography-stylist.php';
            $loaded = true;
        }
        return \Typost::get_instance();
    }

    /** Build a request stub exposing get_method(). */
    private function makeRequest($method) {
        return new class($method) {
            private $method;
            public function __construct($method) {
                $this->method = $method;
            }
            public function get_method() {
                return $this->method;
            }
        };
    }

    public function test_write_requests_to_any_typost_route_count_and_the_51st_is_refused() {
        $plugin = $this->getPluginInstance();

        // A route with its own capability callback (no check_permissions()).
        for ($i = 1; $i <= 50; $i++) {
            $result = $plugin->enforce_rest_rate_limit(null, $this->makeRequest('POST'), '/typost/v1/fonts', array());
            $this->assertNull($result, "Request $i must be allowed");
        }

        $result = $plugin->enforce_rest_rate_limit(null, $this->makeRequest('DELETE'), '/typost/v1/adobe-fonts/abc', array());

        $this->assertInstanceOf(\WP_Error::class, $result);
        $this->assertSame('rate_limit_exceeded', $result->get_error_code());
        $this->assertSame(array('status' => 429), $result->get_error_data());
    }

    public function test_read_requests_do_not_count() {
        $plugin = $this->getPluginInstance();

        for ($i = 0; $i < 60; $i++) {
            $this->assertNull($plugin->enforce_rest_rate_limit(null, $this->makeRequest('GET'), '/typost/v1/fonts', array()));
        }

        $this->assertArrayNotHasKey('typost_rate_limit_7', $this->transients);
    }

    public function test_other_namespaces_are_not_counted() {
        $plugin = $this->getPluginInstance();

        $this->assertNull($plugin->enforce_rest_rate_limit(null, $this->makeRequest('POST'), '/wp/v2/posts', array()));
        $this->assertNull($plugin->enforce_rest_rate_limit(null, $this->makeRequest('POST'), '/typost/v10/fonts', array()));

        $this->assertArrayNotHasKey('typost_rate_limit_7', $this->transients);
    }

    public function test_a_request_is_counted_once_when_check_permissions_also_runs() {
        $plugin = $this->getPluginInstance();
        $request = $this->makeRequest('POST');

        // A check_permissions() route: the permission callback runs first,
        // then the dispatch filter sees the same request object.
        $this->assertTrue($plugin->check_permissions($request));
        $this->assertNull($plugin->enforce_rest_rate_limit(null, $request, '/typost/v1/presets', array()));

        $this->assertSame(1, $this->transients['typost_rate_limit_7']['count']);
    }

    public function test_the_window_is_fixed_so_later_writes_do_not_extend_it() {
        $plugin = $this->getPluginInstance();
        $expirations = [];
        $transients = &$this->transients;
        Functions\when('set_transient')->alias(function ($key, $value, $expiration) use (&$transients, &$expirations) {
            $transients[$key] = $value;
            $expirations[] = $expiration;
            return true;
        });

        // A window that started 50 seconds ago with 10 writes in it.
        $this->transients['typost_rate_limit_7'] = array('count' => 10, 'start' => time() - 50);

        $this->assertNull($plugin->enforce_rest_rate_limit(null, $this->makeRequest('POST'), '/typost/v1/fonts', array()));

        $this->assertSame(11, $this->transients['typost_rate_limit_7']['count']);
        $this->assertLessThanOrEqual(10, end($expirations), 'Expiry must be the time left in the window, not a fresh 60 seconds');
        $this->assertGreaterThanOrEqual(1, end($expirations));
    }

    public function test_a_steady_rate_under_the_limit_is_never_refused() {
        $plugin = $this->getPluginInstance();

        // 50 writes in a window that has already ended: the next write
        // starts a new window instead of adding to the old count.
        $this->transients['typost_rate_limit_7'] = array('count' => 50, 'start' => time() - 61);

        $this->assertNull($plugin->enforce_rest_rate_limit(null, $this->makeRequest('POST'), '/typost/v1/fonts', array()));
        $this->assertSame(1, $this->transients['typost_rate_limit_7']['count']);
    }

    public function test_an_old_integer_counter_starts_a_new_window() {
        $plugin = $this->getPluginInstance();

        // Stored by the limiter before the window had a start time.
        $this->transients['typost_rate_limit_7'] = 49;

        $this->assertNull($plugin->enforce_rest_rate_limit(null, $this->makeRequest('POST'), '/typost/v1/fonts', array()));
        $this->assertSame(1, $this->transients['typost_rate_limit_7']['count']);
    }

    public function test_an_earlier_dispatch_result_is_passed_through_unchanged() {
        $plugin = $this->getPluginInstance();
        $earlier = array('handled' => true);

        $this->assertSame($earlier, $plugin->enforce_rest_rate_limit($earlier, $this->makeRequest('POST'), '/typost/v1/fonts', array()));
        $this->assertArrayNotHasKey('typost_rate_limit_7', $this->transients);
    }
}

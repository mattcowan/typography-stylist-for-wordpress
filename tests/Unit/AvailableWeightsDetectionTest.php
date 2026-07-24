<?php
namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use Brain\Monkey\Functions;

/**
 * Tests for automatic available_weights detection:
 * - Typost_Font_Sources::derive_available_weights_from_faces() weight math
 * - Adobe stylesheet detection (detect_adobe_available_weights)
 * - Bulk detect endpoint (key-absence candidacy, per-URL fetch, manual skip)
 * - Sanitizer passthrough that preserves the key AND key absence
 * - WP Font Library adoption-time derivation
 */
class AvailableWeightsDetectionTest extends TestCase {

    /** @var array Simulated wp_options storage */
    private $options;

    protected function setUp(): void {
        parent::setUp();

        $this->options = [];
        $options = &$this->options;

        Functions\when('get_option')->alias(function ($key, $default = false) use (&$options) {
            return array_key_exists($key, $options) ? $options[$key] : $default;
        });
        Functions\when('update_option')->alias(function ($key, $value) use (&$options) {
            $options[$key] = $value;
            return true;
        });
        Functions\when('sanitize_title')->alias(function ($title) {
            return trim(preg_replace('/[^a-z0-9-]+/', '-', strtolower((string) $title)), '-');
        });
        Functions\when('wp_list_pluck')->alias(function ($list, $field) {
            $out = [];
            foreach ($list as $item) {
                $out[] = is_object($item) ? $item->$field : $item[$field];
            }
            return $out;
        });
        Functions\when('current_time')->justReturn('2026-07-23 18:00:00');
        Functions\when('delete_transient')->justReturn(true);
        Functions\when('wp_cache_delete')->justReturn(true);
        Functions\when('wp_cache_flush')->justReturn(true);
        Functions\when('rest_ensure_response')->returnArg();
        Functions\when('is_wp_error')->alias(function ($thing) {
            return is_object($thing) && !empty($thing->is_error);
        });

        // clear_cache() runs wildcard transient deletes through $wpdb
        global $wpdb;
        $wpdb = new class {
            public $options = 'wp_options';
            public function query($sql) {
                return 0;
            }
            public function prepare($sql, ...$args) {
                return $sql;
            }
            public function esc_like($text) {
                return $text;
            }
        };
    }

    private function getPluginInstance() {
        static $loaded = false;
        if (!$loaded) {
            require_once TYPOST_PLUGIN_DIR . '/typography-stylist.php';
            $loaded = true;
        }
        $plugin = \Typost::get_instance();

        // The singleton's Typost_Font_Sources caches option reads per request;
        // drop it so each test reads from this test's simulated options
        $property = new \ReflectionProperty(\Typost::class, 'font_sources');
        $property->setAccessible(true);
        $property->setValue($plugin, null);

        return $plugin;
    }

    private function getFontSources() {
        require_once TYPOST_PLUGIN_DIR . '/includes/class-typost-font-sources.php';
        return new \Typost_Font_Sources();
    }

    private function invokePrivate($object, $method, ...$args) {
        $reflection = new \ReflectionMethod(get_class($object), $method);
        $reflection->setAccessible(true);
        return $reflection->invokeArgs($object, $args);
    }

    private function faces(...$weights) {
        return array_map(function ($w) {
            return ['weight' => $w];
        }, $weights);
    }

    // ── derive_available_weights_from_faces ─────────────────────────────────

    public function test_derive_keywords_resolve_to_numeric_weights() {
        $sources = $this->getFontSources();
        $this->assertSame(['400'], $sources->derive_available_weights_from_faces($this->faces('normal')));
        $this->assertSame(['700'], $sources->derive_available_weights_from_faces($this->faces('bold')));
        $this->assertSame(['400', '700'], $sources->derive_available_weights_from_faces($this->faces('normal', 'bold')));
    }

    public function test_derive_numeric_weights_snap_and_clamp() {
        $sources = $this->getFontSources();
        $this->assertSame(['400'], $sources->derive_available_weights_from_faces($this->faces('350')));
        $this->assertSame(['900'], $sources->derive_available_weights_from_faces($this->faces('1000')));
        $this->assertSame(['100'], $sources->derive_available_weights_from_faces($this->faces('50')));
        $this->assertSame(['300'], $sources->derive_available_weights_from_faces($this->faces('300')));
    }

    public function test_derive_full_range_collapses_to_all_weights() {
        $sources = $this->getFontSources();
        $this->assertSame([], $sources->derive_available_weights_from_faces($this->faces('100 900')));
    }

    public function test_derive_partial_range_enables_canonical_weights_in_range() {
        $sources = $this->getFontSources();
        $this->assertSame(
            ['300', '400', '500', '600', '700'],
            $sources->derive_available_weights_from_faces($this->faces('300 700'))
        );
    }

    public function test_derive_reversed_range_is_normalized() {
        $sources = $this->getFontSources();
        $this->assertSame(
            ['300', '400', '500', '600', '700'],
            $sources->derive_available_weights_from_faces($this->faces('700 300'))
        );
    }

    public function test_derive_duplicate_weights_dedupe() {
        // Normal + italic faces of the same weight count once
        $sources = $this->getFontSources();
        $this->assertSame(
            ['400', '700'],
            $sources->derive_available_weights_from_faces($this->faces('400', '400', 'bold', '700'))
        );
    }

    public function test_derive_invalid_and_missing_weights_default_to_400() {
        $sources = $this->getFontSources();
        $this->assertSame(['400'], $sources->derive_available_weights_from_faces($this->faces('oblique')));
        $this->assertSame(['400'], $sources->derive_available_weights_from_faces([['family' => 'X']]));
    }

    public function test_derive_empty_faces_means_all_weights() {
        $sources = $this->getFontSources();
        $this->assertSame([], $sources->derive_available_weights_from_faces([]));
    }

    public function test_derive_all_nine_static_weights_collapse_to_empty() {
        $sources = $this->getFontSources();
        $all = $this->faces('100', '200', '300', '400', '500', '600', '700', '800', '900');
        $this->assertSame([], $sources->derive_available_weights_from_faces($all));
    }

    // ── kit pipeline: parse_webfont_kit → derive ────────────────────────────

    public function test_multi_weight_kit_css_derives_expected_weights() {
        $plugin = $this->getPluginInstance();
        $css = "@font-face { font-family: 'Test Sans'; font-weight: 300; src: url('a.woff2'); }\n"
             . "@font-face { font-family: 'Test Sans'; font-weight: 700; font-style: italic; src: url('b.woff2'); }";
        $faces = $plugin->parse_webfont_kit($css);
        $weights = $this->invokePrivate($plugin, 'derive_available_weights_from_faces', $faces);
        $this->assertSame(['300', '700'], $weights);
    }

    public function test_variable_font_generated_css_derives_range_weights() {
        require_once TYPOST_PLUGIN_DIR . '/includes/class-typost-font-metadata.php';
        $css = \Typost_Font_Metadata::build_css([
            [
                'file' => '/tmp/kit/SpaceGrotesk[wght].ttf',
                'meta' => [
                    'family'      => 'Space Grotesk',
                    'weight'      => ['min' => 300.0, 'max' => 700.0],
                    'style'       => 'normal',
                    'is_variable' => true,
                    'source'      => 'binary',
                ],
            ],
        ], '/tmp/kit');

        $plugin = $this->getPluginInstance();
        $faces = $plugin->parse_webfont_kit($css);
        $weights = $this->invokePrivate($plugin, 'derive_available_weights_from_faces', $faces);
        $this->assertSame(['300', '400', '500', '600', '700'], $weights);
    }

    // ── Adobe stylesheet detection ──────────────────────────────────────────

    private function typekitCss() {
        return "@font-face { font-family: \"proxima-nova\"; font-weight: 400; font-style: normal; src: url('https://use.typekit.net/af/x.woff2'); }\n"
             . "@font-face { font-family: \"proxima-nova\"; font-weight: 700; font-style: normal; src: url('https://use.typekit.net/af/y.woff2'); }\n"
             . "@font-face { font-family: \"proxima-nova\"; font-weight: 700; font-style: italic; src: url('https://use.typekit.net/af/z.woff2'); }";
    }

    private function mockRemoteGet($body, $code = 200, $error = false) {
        $response = $error ? (object) ['is_error' => true] : ['body' => $body, 'code' => $code];
        Functions\when('wp_remote_get')->justReturn($response);
        Functions\when('wp_remote_retrieve_response_code')->justReturn($error ? 0 : $code);
        Functions\when('wp_remote_retrieve_body')->justReturn($error ? '' : $body);
    }

    public function test_adobe_detection_matches_display_name_to_slug() {
        $this->mockRemoteGet($this->typekitCss());
        $plugin = $this->getPluginInstance();

        $detected = $this->invokePrivate(
            $plugin, 'detect_adobe_available_weights',
            'https://use.typekit.net/abc1234.css', ['Proxima Nova']
        );

        $this->assertSame(['proxima-nova' => ['400', '700']], $detected);
    }

    public function test_adobe_detection_unmatched_family_gets_empty_weights() {
        $this->mockRemoteGet($this->typekitCss());
        $plugin = $this->getPluginInstance();

        $detected = $this->invokePrivate(
            $plugin, 'detect_adobe_available_weights',
            'https://use.typekit.net/abc1234.css', ['Missing Family']
        );

        $this->assertSame(['missing-family' => []], $detected);
    }

    public function test_adobe_detection_returns_false_on_wp_error() {
        $this->mockRemoteGet('', 0, true);
        $plugin = $this->getPluginInstance();

        $detected = $this->invokePrivate(
            $plugin, 'detect_adobe_available_weights',
            'https://use.typekit.net/abc1234.css', ['Proxima Nova']
        );

        $this->assertFalse($detected);
    }

    public function test_adobe_detection_returns_false_on_http_error() {
        $this->mockRemoteGet('Not Found', 404);
        $plugin = $this->getPluginInstance();

        $detected = $this->invokePrivate(
            $plugin, 'detect_adobe_available_weights',
            'https://use.typekit.net/abc1234.css', ['Proxima Nova']
        );

        $this->assertFalse($detected);
    }

    // ── Bulk detect endpoint ────────────────────────────────────────────────

    public function test_bulk_detect_processes_only_entries_without_the_key() {
        $this->mockRemoteGet($this->typekitCss());
        $plugin = $this->getPluginInstance();

        $this->options['typost_custom_fonts'] = [
            [
                'id' => 'kit-old', 'name' => 'Old Kit Font', 'font_id' => 1,
                'font_faces' => $this->faces('300', '700'),
            ],
            [
                'id' => 'kit-configured', 'name' => 'Configured Font', 'font_id' => 2,
                'font_faces' => $this->faces('300'),
                'available_weights' => [], // user deliberately saved "all"
            ],
        ];
        $this->options['typost_adobe_fonts'] = [
            [
                'id' => 'adobe-a-proxima-nova', 'name' => 'Proxima Nova', 'font_id' => 3,
                'font_family' => 'Proxima Nova',
                'css_url' => 'https://use.typekit.net/abc1234.css',
            ],
        ];

        $response = $plugin->bulk_detect_weights_endpoint(null);

        $this->assertTrue($response['success']);
        $this->assertCount(2, $response['updated']);
        $this->assertSame([], $response['failed']);

        $custom = $this->options['typost_custom_fonts'];
        $this->assertSame(['300', '700'], $custom[0]['available_weights']);
        // Deliberately-configured entry untouched
        $this->assertSame([], $custom[1]['available_weights']);

        $adobe = $this->options['typost_adobe_fonts'];
        $this->assertSame(['400', '700'], $adobe[0]['available_weights']);
    }

    public function test_bulk_detect_leaves_key_absent_when_stylesheet_unreachable() {
        $this->mockRemoteGet('', 0, true);
        $plugin = $this->getPluginInstance();

        $this->options['typost_adobe_fonts'] = [
            [
                'id' => 'adobe-a-proxima-nova', 'name' => 'Proxima Nova', 'font_id' => 3,
                'font_family' => 'Proxima Nova',
                'css_url' => 'https://use.typekit.net/abc1234.css',
            ],
        ];

        $response = $plugin->bulk_detect_weights_endpoint(null);

        $this->assertCount(1, $response['failed']);
        $adobe = $this->options['typost_adobe_fonts'];
        $this->assertArrayNotHasKey('available_weights', $adobe[0]);
    }

    public function test_bulk_detect_defaults_unmatched_adobe_family() {
        $this->mockRemoteGet($this->typekitCss());
        $plugin = $this->getPluginInstance();

        $this->options['typost_adobe_fonts'] = [
            [
                'id' => 'adobe-a-typo', 'name' => 'Typo Family', 'font_id' => 4,
                'font_family' => 'Typo Family',
                'css_url' => 'https://use.typekit.net/abc1234.css',
            ],
        ];

        $response = $plugin->bulk_detect_weights_endpoint(null);

        $this->assertCount(1, $response['defaulted']);
        $adobe = $this->options['typost_adobe_fonts'];
        // Key now present (won't be re-offered), all weights enabled
        $this->assertSame([], $adobe[0]['available_weights']);
    }

    // ── Sanitizer passthrough ───────────────────────────────────────────────

    public function test_adobe_sanitizer_preserves_weights_and_key_absence() {
        Functions\when('absint')->alias(function ($v) {
            return abs((int) $v);
        });
        $plugin = $this->getPluginInstance();

        $sanitized = $plugin->sanitize_adobe_fonts([
            [
                'id' => 'adobe-a-one', 'name' => 'One', 'font_id' => 1,
                'css_url' => 'https://use.typekit.net/a.css',
                'available_weights' => ['700', '400'],
            ],
            [
                'id' => 'adobe-a-two', 'name' => 'Two', 'font_id' => 2,
                'css_url' => 'https://use.typekit.net/a.css',
            ],
        ]);

        $this->assertSame(['400', '700'], $sanitized[0]['available_weights']);
        $this->assertArrayNotHasKey('available_weights', $sanitized[1]);
    }

    public function test_manual_sanitizer_preserves_weights_and_key_absence() {
        Functions\when('absint')->alias(function ($v) {
            return abs((int) $v);
        });
        $plugin = $this->getPluginInstance();

        $sanitized = $plugin->sanitize_manual_fonts([
            [
                'id' => 'manual-one', 'name' => 'One', 'font_id' => 1,
                'font_family' => 'One, serif',
                'available_weights' => ['300'],
            ],
            [
                'id' => 'manual-two', 'name' => 'Two', 'font_id' => 2,
                'font_family' => 'Two, serif',
            ],
        ]);

        $this->assertSame(['300'], $sanitized[0]['available_weights']);
        $this->assertArrayNotHasKey('available_weights', $sanitized[1]);
    }

    // ── WP Font Library adoption ────────────────────────────────────────────

    public function test_adoption_derives_weights_from_font_face_posts() {
        require_once TYPOST_PLUGIN_DIR . '/includes/class-typost-font-sources.php';
        require_once TYPOST_PLUGIN_DIR . '/includes/class-typost-font-library-bridge.php';

        Functions\when('post_type_exists')->justReturn(true);

        $family_post = (object) [
            'ID' => 10, 'post_type' => 'wp_font_family', 'post_name' => 'inter',
            'post_title' => 'Inter', 'post_content' => json_encode(['fontFamily' => 'Inter']),
            'post_parent' => 0, 'post_status' => 'publish',
        ];
        $face_posts = [
            (object) ['ID' => 11, 'post_type' => 'wp_font_face', 'post_parent' => 10, 'post_content' => json_encode(['fontWeight' => '400'])],
            (object) ['ID' => 12, 'post_type' => 'wp_font_face', 'post_parent' => 10, 'post_content' => json_encode(['fontWeight' => '600'])],
        ];
        Functions\when('get_posts')->alias(function ($args) use ($family_post, $face_posts) {
            if (isset($args['post_type']) && $args['post_type'] === 'wp_font_family') {
                return (!isset($args['name']) || $args['name'] === 'inter') ? [$family_post] : [];
            }
            if (isset($args['post_type']) && $args['post_type'] === 'wp_font_face') {
                return ((int) $args['post_parent'] === 10) ? $face_posts : [];
            }
            return [];
        });

        $sources = new \Typost_Font_Sources();
        $bridge = new \Typost_Font_Library_Bridge($sources);

        $entry = $bridge->adopt_library_font('inter');

        $this->assertIsArray($entry);
        $this->assertSame(['400', '600'], $entry['available_weights']);
        // Persisted entry matches
        $stored = $this->options['typost_adopted_wp_fonts'];
        $this->assertSame(['400', '600'], $stored[0]['available_weights']);
    }

    public function test_adoption_omits_key_when_no_faces_found() {
        require_once TYPOST_PLUGIN_DIR . '/includes/class-typost-font-sources.php';
        require_once TYPOST_PLUGIN_DIR . '/includes/class-typost-font-library-bridge.php';

        Functions\when('post_type_exists')->justReturn(true);
        $family_post = (object) [
            'ID' => 20, 'post_type' => 'wp_font_family', 'post_name' => 'system-serif',
            'post_title' => 'System Serif', 'post_content' => json_encode(['fontFamily' => 'serif']),
            'post_parent' => 0, 'post_status' => 'publish',
        ];
        Functions\when('get_posts')->alias(function ($args) use ($family_post) {
            if (isset($args['post_type']) && $args['post_type'] === 'wp_font_family') {
                return [$family_post];
            }
            return [];
        });

        $sources = new \Typost_Font_Sources();
        $bridge = new \Typost_Font_Library_Bridge($sources);

        $entry = $bridge->adopt_library_font('system-serif');

        $this->assertIsArray($entry);
        $this->assertArrayNotHasKey('available_weights', $entry);
    }
}

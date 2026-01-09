<?php
namespace OpenTypeStylist\Tests\Unit;

use OpenTypeStylist\Tests\TestCase;
use Brain\Monkey\Functions;

/**
 * Security tests for Issue #1 and #2
 */
class SecurityTest extends TestCase {

    /**
     * Get plugin instance for testing
     */
    private function getPluginInstance() {
        static $loaded = false;
        if (!$loaded) {
            require_once OTS_PLUGIN_DIR . '/opentype-stylist.php';
            $loaded = true;
        }
        return \OpenType_Stylist::get_instance();
    }

    /**
     * Test that .htaccess content is properly generated
     */
    public function test_htaccess_content_blocks_php_execution() {
        $expected_patterns = [
            '/Require all denied/',
            '/Deny from all/',
            '/Options -Indexes/',
            '/FilesMatch.*\\.php\$/',
            '/IfModule mod_authz_core.c/',
            '/IfModule !mod_authz_core.c/',
        ];

        // Since get_htaccess_content() is private, we need to use reflection
        $plugin = $this->getPluginInstance();
        $reflection = new \ReflectionClass($plugin);
        $method = $reflection->getMethod('get_htaccess_content');
        $method->setAccessible(true);
        $content = $method->invoke($plugin);

        foreach ($expected_patterns as $pattern) {
            $this->assertMatchesRegularExpression($pattern, $content, "Expected pattern $pattern not found in .htaccess content");
        }

        // Verify it has both Apache 2.2 and 2.4+ directives
        $this->assertStringContainsString('Apache 2.4+', $content);
        $this->assertStringContainsString('Apache 2.2', $content);
    }

    /**
     * Test that .htaccess content prevents directory listing
     */
    public function test_htaccess_prevents_directory_listing() {
        $plugin = $this->getPluginInstance();
        $reflection = new \ReflectionClass($plugin);
        $method = $reflection->getMethod('get_htaccess_content');
        $method->setAccessible(true);
        $content = $method->invoke($plugin);

        $this->assertStringContainsString('Options -Indexes', $content);
        $this->assertStringContainsString('Prevent directory listing', $content);
    }

    /**
     * Test that .htaccess content uses both Apache 2.2 and 2.4 syntax
     */
    public function test_htaccess_supports_both_apache_versions() {
        $plugin = $this->getPluginInstance();
        $reflection = new \ReflectionClass($plugin);
        $method = $reflection->getMethod('get_htaccess_content');
        $method->setAccessible(true);
        $content = $method->invoke($plugin);

        // Apache 2.4+ uses "Require all denied"
        $this->assertStringContainsString('Require all denied', $content);

        // Apache 2.2 uses "Deny from all"
        $this->assertStringContainsString('Deny from all', $content);

        // Both should be wrapped in IfModule directives
        $this->assertStringContainsString('<IfModule mod_authz_core.c>', $content);
        $this->assertStringContainsString('<IfModule !mod_authz_core.c>', $content);
    }
}

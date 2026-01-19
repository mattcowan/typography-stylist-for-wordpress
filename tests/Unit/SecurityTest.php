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
        return \Typography_Stylist::get_instance();
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

    /**
     * Test sanitize_css_value() with valid font family names
     *
     * @dataProvider validFontFamilyProvider
     */
    public function test_sanitize_css_value_allows_valid_font_families($input, $expected) {
        $plugin = $this->getPluginInstance();
        $reflection = new \ReflectionClass($plugin);
        $method = $reflection->getMethod('sanitize_css_value');
        $method->setAccessible(true);

        $result = $method->invoke($plugin, $input);
        $this->assertEquals($expected, $result, "Failed to sanitize: $input");
    }

    /**
     * Provider for valid font family names
     */
    public function validFontFamilyProvider() {
        return [
            // Font names with underscores (Issue #35)
            ['alex_brushregular', 'alex_brushregular'],
            ['font_family_name', 'font_family_name'],
            ['my_custom_font_2024', 'my_custom_font_2024'],

            // Standard font names
            ['Arial', 'Arial'],
            ['Helvetica Neue', 'Helvetica Neue'],
            ['Times-New-Roman', 'Times-New-Roman'],
            ['Courier New', 'Courier New'],

            // Font names with quotes
            ['"Open Sans"', '"Open Sans"'],
            ["'Roboto'", "'Roboto'"],

            // Font fallback lists
            ['Arial, sans-serif', 'Arial, sans-serif'],
            ['"Helvetica Neue", Helvetica, Arial', '"Helvetica Neue", Helvetica, Arial'],

            // Mixed valid characters
            ['Font-Name_123', 'Font-Name_123'],
            ['MyFont2024', 'MyFont2024'],

            // Leading/trailing whitespace should be trimmed
            ['  Arial  ', 'Arial'],
            ["\tHelvetica\n", 'Helvetica'],
        ];
    }

    /**
     * Test sanitize_css_value() blocks malicious CSS injection attempts
     *
     * @dataProvider maliciousInputProvider
     */
    public function test_sanitize_css_value_blocks_css_injection($input, $description) {
        $plugin = $this->getPluginInstance();
        $reflection = new \ReflectionClass($plugin);
        $method = $reflection->getMethod('sanitize_css_value');
        $method->setAccessible(true);

        $result = $method->invoke($plugin, $input);

        // Verify dangerous characters are stripped
        $this->assertStringNotContainsString('{', $result, "$description: Curly brace not removed");
        $this->assertStringNotContainsString('}', $result, "$description: Curly brace not removed");
        $this->assertStringNotContainsString(';', $result, "$description: Semicolon not removed");
        $this->assertStringNotContainsString('<', $result, "$description: Less-than not removed");
        $this->assertStringNotContainsString('>', $result, "$description: Greater-than not removed");
        $this->assertStringNotContainsString('(', $result, "$description: Parenthesis not removed");
        $this->assertStringNotContainsString(')', $result, "$description: Parenthesis not removed");
        $this->assertStringNotContainsString('[', $result, "$description: Bracket not removed");
        $this->assertStringNotContainsString(']', $result, "$description: Bracket not removed");
        $this->assertStringNotContainsString('\\', $result, "$description: Backslash not removed");
    }

    /**
     * Provider for malicious CSS injection attempts
     */
    public function maliciousInputProvider() {
        return [
            // CSS function injection attempts
            ['url(javascript:alert(1))', 'JavaScript URL injection'],
            ['calc(100% - 20px)', 'calc() function injection'],
            ['expression(alert("XSS"))', 'IE expression() injection'],
            ['attr(data-value)', 'attr() function injection'],

            // CSS property injection
            ['Arial; color: red', 'Property injection with semicolon'],
            ['Arial} body{background:red', 'CSS block injection'],
            ['Arial"; color: red; font-family: "Arial', 'Property injection with quotes'],

            // HTML/JavaScript injection
            ['<script>alert(1)</script>', 'Script tag injection'],
            ['<img src=x onerror=alert(1)>', 'Image tag injection'],
            ['</style><script>alert(1)</script>', 'Style tag breakout'],

            // CSS escape sequences
            ['Arial\0000', 'Null character escape'],
            ['Arial\27 ', 'Unicode escape sequence'],

            // Path traversal attempts
            ['../../etc/passwd', 'Path traversal'],
            ['..\\..\\windows\\system32', 'Windows path traversal'],

            // Special CSS metacharacters
            ['font[weight=bold]', 'Attribute selector injection'],
            ['Arial()', 'Function-like syntax'],
            ['Arial{weight:bold}', 'Property block injection'],
        ];
    }

    /**
     * Test sanitize_css_value() handles edge cases correctly
     *
     * @dataProvider edgeCaseProvider
     */
    public function test_sanitize_css_value_handles_edge_cases($input, $expected, $description) {
        $plugin = $this->getPluginInstance();
        $reflection = new \ReflectionClass($plugin);
        $method = $reflection->getMethod('sanitize_css_value');
        $method->setAccessible(true);

        $result = $method->invoke($plugin, $input);
        $this->assertEquals($expected, $result, $description);
    }

    /**
     * Provider for edge case inputs
     */
    public function edgeCaseProvider() {
        return [
            // Empty and whitespace
            ['', '', 'Empty string'],
            ['   ', '', 'Only whitespace'],
            ["\t\n\r", '', 'Various whitespace characters'],

            // Special characters that should be removed
            ['Arial.ttf', 'Arialttf', 'Period should be removed (invalid in unquoted CSS identifiers, often indicates file extension)'],
            ['Font@Family', 'FontFamily', 'At sign should be removed'],
            ['Font#Name', 'FontName', 'Hash should be removed'],
            ['Font$Name', 'FontName', 'Dollar sign should be removed'],
            ['Font%Name', 'FontName', 'Percent sign should be removed'],
            ['Font&Name', 'FontName', 'Ampersand should be removed'],
            ['Font*Name', 'FontName', 'Asterisk should be removed'],
            ['Font+Name', 'FontName', 'Plus sign should be removed'],
            ['Font=Name', 'FontName', 'Equals sign should be removed'],
            ['Font|Name', 'FontName', 'Pipe should be removed'],
            ['Font~Name', 'FontName', 'Tilde should be removed'],
            ['Font`Name', 'FontName', 'Backtick should be removed'],
            ['Font^Name', 'FontName', 'Caret should be removed'],

            // Unicode and international characters should be removed
            ['Font™Name', 'FontName', 'Trademark symbol should be removed'],
            ['Font©Name', 'FontName', 'Copyright symbol should be removed'],
            ['Font€Name', 'FontName', 'Euro symbol should be removed'],

            // Multiple consecutive spaces should be preserved (CSS spec allows it)
            ['Font  Family', 'Font  Family', 'Multiple spaces preserved'],

            // Quotes in various positions
            ['"Arial"', '"Arial"', 'Double quotes preserved'],
            ["'Arial'", "'Arial'", 'Single quotes preserved'],
            ['"Arial', '"Arial', 'Unclosed double quote preserved'],
            ["'Arial", "'Arial", 'Unclosed single quote preserved'],

            // Very long input (should still be processed)
            [str_repeat('a', 1000), str_repeat('a', 1000), 'Very long valid input'],

            // Input with only invalid characters
            ['!!!???***', '', 'Only invalid characters should result in empty string'],
        ];
    }

    /**
     * Test that underscores are preserved in real-world font family names
     * This is a regression test for Issue #35
     */
    public function test_sanitize_css_value_preserves_underscores_in_font_names() {
        $plugin = $this->getPluginInstance();
        $reflection = new \ReflectionClass($plugin);
        $method = $reflection->getMethod('sanitize_css_value');
        $method->setAccessible(true);

        // Real-world font names from FontSquirrel kits that use underscores
        $fontNames = [
            'alex_brushregular' => 'alex_brushregular',
            'source_sans_proregular' => 'source_sans_proregular',
            'open_sansregular' => 'open_sansregular',
            'roboto_condensedregular' => 'roboto_condensedregular',
            'lato_regular' => 'lato_regular',
        ];

        foreach ($fontNames as $input => $expected) {
            $result = $method->invoke($plugin, $input);
            $this->assertEquals($expected, $result, "Underscore should be preserved in: $input");
            $this->assertStringContainsString('_', $result, "Underscore missing in sanitized output for: $input");
        }
    }

    /**
     * Test that sanitize_css_value() is safe for use in CSS variables
     * CSS variables are used in the get_font_css_variables() method
     */
    public function test_sanitize_css_value_output_is_safe_in_css_variables() {
        $plugin = $this->getPluginInstance();
        $reflection = new \ReflectionClass($plugin);
        $method = $reflection->getMethod('sanitize_css_value');
        $method->setAccessible(true);

        // Test with input containing CSS injection attempt
        $fontFamily = 'alex_brushregular; color: red';
        $sanitized = $method->invoke($plugin, $fontFamily);

        // Verify dangerous characters that would break CSS syntax are removed
        $this->assertStringNotContainsString(';', $sanitized, 'Semicolon should be stripped to prevent CSS injection');
        $this->assertStringNotContainsString('{', $sanitized, 'Opening brace should be stripped');
        $this->assertStringNotContainsString('}', $sanitized, 'Closing brace should be stripped');
        $this->assertStringNotContainsString('(', $sanitized, 'Opening parenthesis should be stripped');
        $this->assertStringNotContainsString(')', $sanitized, 'Closing parenthesis should be stripped');

        // Verify the sanitized value only contains safe characters (whitelist validation)
        // Uses * instead of + to allow empty string (when all chars are invalid)
        $this->assertMatchesRegularExpression('/^[a-zA-Z0-9\s,\-_\'"]*$/', $sanitized, 'Sanitized value should only contain allowed characters');

        // For this specific input, verify valid characters are preserved and result matches expectation
        $this->assertNotEmpty($sanitized, 'Valid font name characters should be preserved');
        $this->assertEquals('alex_brushregular color red', $sanitized, 'Result should be sanitized but preserve valid characters');
    }
}

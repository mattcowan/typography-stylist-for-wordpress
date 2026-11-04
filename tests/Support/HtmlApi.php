<?php
namespace TypographyStylist\Tests\Support;

/**
 * Loads WordPress's HTML API (WP_HTML_Processor) for the GREP styles tests
 * (#196), which run the real parser rather than a stand-in.
 *
 * The plugin does not bundle WordPress. Point TYPOST_WP_DIR at a WordPress
 * 6.9+ checkout (the directory that holds wp-includes); CI fetches the two
 * paths it needs with a sparse clone (.github/workflows/ci.yml). Without it
 * the tests that need the parser are skipped.
 */
final class HtmlApi {

    /**
     * Load the classes once.
     *
     * @return bool Whether WP_HTML_Processor with a public serialize_token() is there.
     */
    public static function load() {
        if (!class_exists('WP_HTML_Processor', false)) {
            $root = getenv('TYPOST_WP_DIR');
            if (!is_string($root) || '' === $root) {
                return false;
            }
            $dir = rtrim($root, '/\\') . '/wp-includes/';
            if (!is_file($dir . 'html-api/class-wp-html-processor.php') || !is_file($dir . 'class-wp-token-map.php')) {
                return false;
            }
            require_once $dir . 'class-wp-token-map.php';
            require_once $dir . 'html-api/html5-named-character-references.php';
            foreach (array(
                'class-wp-html-attribute-token',
                'class-wp-html-span',
                'class-wp-html-text-replacement',
                'class-wp-html-decoder',
                'class-wp-html-tag-processor',
                'class-wp-html-doctype-info',
                'class-wp-html-open-elements',
                'class-wp-html-token',
                'class-wp-html-unsupported-exception',
                'class-wp-html-active-formatting-elements',
                'class-wp-html-processor-state',
                'class-wp-html-stack-event',
                'class-wp-html-processor',
            ) as $file) {
                require_once $dir . 'html-api/' . $file . '.php';
            }
        }
        $method = new \ReflectionMethod('WP_HTML_Processor', 'serialize_token');
        return $method->isPublic();
    }

    /**
     * Set the engine's memoized support check (null = check again).
     *
     * @param bool|null $value
     */
    public static function setSupported($value) {
        require_once TYPOST_PLUGIN_DIR . '/paragraph-styles/includes/class-typost-ps-text-ranges.php';
        $property = (new \ReflectionClass(\Typost_PS_Text_Ranges::class))->getProperty('supported');
        $property->setAccessible(true);
        $property->setValue(null, $value);
    }
}

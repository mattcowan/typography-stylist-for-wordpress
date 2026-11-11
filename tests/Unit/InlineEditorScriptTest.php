<?php
/**
 * The inline editor script is built by browserify and babel (block-editor.js
 * holds require() and JSX), so no browser can run its source file.
 *
 * @package Typography_Stylist
 */

namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;

class InlineEditorScriptTest extends TestCase {

    public function test_the_handle_always_loads_the_built_file() {
        // The editor assets are enqueued by the service split out of Typost (#360)
        $source = file_get_contents( dirname( __DIR__, 2 ) . '/includes/class-typost-assets.php' );

        $this->assertStringContainsString( '"assets/js/block-editor.min.js"', $source );
        $this->assertStringNotContainsString( 'assets/js/block-editor{$suffix}.js', $source );
    }
}

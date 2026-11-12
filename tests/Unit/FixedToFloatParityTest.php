<?php
/**
 * The two copies of the OpenType Fixed (16.16) reader (#358).
 *
 * Typost_Font_Metadata::fixed_to_float() is a copy of
 * Typost_Font_Parser::fixed_to_float() in the Variable Fonts module, kept on
 * purpose so the core metadata reader does not depend on the module. Both
 * read the same fvar axis values, so they must give the same number.
 */

namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;

class FixedToFloatParityTest extends TestCase {

    private function call($class, $value) {
        $method = new \ReflectionMethod($class, 'fixed_to_float');
        $method->setAccessible(true);
        return $method->invoke(null, $value);
    }

    public function values() {
        // The values from 0x80000000 up are unsigned 32-bit numbers, as the
        // font file holds them. They are ints only where PHP's int is 64-bit
        // (every supported platform); on a 32-bit build they would be floats.
        return array(
            'zero'                   => array(0),
            'one'                    => array(0x00010000),
            'weight 400'             => array(400 * 65536),
            'weight 1000'            => array(1000 * 65536),
            'half'                   => array(0x00008000),
            'smallest fraction'      => array(1),
            'largest positive'       => array(0x7FFFFFFF),
            'minus one'              => array(0xFFFF0000),
            'slant -12.5'            => array(0xFFF38000),
            'most negative'          => array(0x80000000),
        );
    }

    /**
     * @dataProvider values
     */
    public function test_both_copies_read_the_same_number($value) {
        require_once TYPOST_PLUGIN_DIR . '/includes/class-typost-font-metadata.php';
        require_once TYPOST_PLUGIN_DIR . '/variable-fonts/includes/font-parser.php';

        $core   = $this->call(\Typost_Font_Metadata::class, $value);
        $module = $this->call(\Typost_Font_Parser::class, $value);

        // The core copy divides by an int, so an exact value comes back as
        // an int (2, not 2.0); every caller rounds it. Compare the numbers.
        $this->assertSame((float) $module, (float) $core);
    }

    public function test_known_values() {
        require_once TYPOST_PLUGIN_DIR . '/variable-fonts/includes/font-parser.php';
        $this->assertSame(-12.5, $this->call(\Typost_Font_Parser::class, 0xFFF38000));
        $this->assertSame(1.0, $this->call(\Typost_Font_Parser::class, 0x00010000));
    }
}

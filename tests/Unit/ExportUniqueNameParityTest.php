<?php
/**
 * The two copies of the import name helpers (#358).
 *
 * Typost_Export_Settings (presets) and Typost_PS_Transfer (paragraph styles)
 * each keep unique_name() and lower(): the "Name (2)" suggestion for a name
 * that is taken, compared without case. The import dialog shows both kinds
 * of suggestion side by side, so they must be made the same way.
 */

namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\ExportTestCase;

class ExportUniqueNameParityTest extends ExportTestCase {

    private function call($class, $method, array $args) {
        $reflection = new \ReflectionMethod($class, $method);
        $reflection->setAccessible(true);
        return $reflection->invokeArgs(null, $args);
    }

    public function names() {
        return array(
            'free name'                   => array('Body', array()),
            'taken'                       => array('Body', array('body' => true)),
            'taken twice'                 => array('Body', array('body' => true, 'body (2)' => true)),
            'taken in other case'         => array('BODY', array('body' => true)),
            'surrounding spaces'          => array('  Body ', array('body' => true)),
            'non-ASCII capitals'          => array('Éclat', array('éclat' => true, 'éclat (2)' => true, 'éclat (3)' => true)),
            'a numbered name'             => array('Body (2)', array('body (2)' => true)),
            'empty'                       => array('', array('' => true)),
        );
    }

    /**
     * @dataProvider names
     */
    public function test_both_copies_suggest_the_same_name($name, $taken) {
        $settings = $this->call(\Typost_Export_Settings::class, 'unique_name', array($name, $taken));
        $styles   = $this->call(\Typost_PS_Transfer::class, 'unique_name', array($name, $taken));
        $this->assertSame($styles, $settings);
    }

    /**
     * @dataProvider names
     */
    public function test_both_copies_compare_names_the_same_way($name) {
        $this->assertSame(
            $this->call(\Typost_PS_Transfer::class, 'lower', array($name)),
            $this->call(\Typost_Export_Settings::class, 'lower', array($name))
        );
    }

    public function test_known_values() {
        $this->assertSame('Body (3)', $this->call(\Typost_PS_Transfer::class, 'unique_name', array('Body', array('body' => true, 'body (2)' => true))));
        $this->assertSame('éclat', $this->call(\Typost_Export_Settings::class, 'lower', array(' Éclat ')));
    }
}

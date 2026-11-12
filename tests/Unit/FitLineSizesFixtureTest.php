<?php
/**
 * The fit line sizes the block writes, read back by the render filter (#358).
 *
 * buildFitFontSize() in blocks/typography-stylist/utils.js writes a fit
 * line's font-size, and add_fit_line_plain_properties() copies the line
 * ratio out of it for the plain typography switch (#315). Both read
 * tests/fixtures/fit-line-sizes.json (the Jest reader is
 * blocks/typography-stylist/__tests__/css-js-mirrors.test.js), so a size the
 * block writes that the filter cannot read fails one of them.
 */

namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;

class FitLineSizesFixtureTest extends TestCase {

    protected function setUp(): void {
        parent::setUp();

        static $loaded = false;
        if (!$loaded) {
            require_once TYPOST_PLUGIN_DIR . '/typography-stylist.php';
            $loaded = true;
        }
    }

    public function fixtureCases() {
        $json  = file_get_contents(TYPOST_PLUGIN_DIR . '/tests/fixtures/fit-line-sizes.json');
        $cases = array();
        foreach (json_decode($json, true)['cases'] as $case) {
            $cases[$case['label']] = array($case['fontSize'], $case['ratio']);
        }
        return $cases;
    }

    /**
     * @dataProvider fixtureCases
     */
    public function test_the_filter_reads_the_ratio_of_every_line_the_block_writes($font_size, $ratio) {
        $reflection = new \ReflectionClass(\Typost::class);
        $plugin     = $reflection->newInstanceWithoutConstructor();
        $html       = '<span class="typost-line" style="font-size:' . $font_size . '">x</span>';

        $this->assertSame(
            '<span class="typost-line" style="font-size:' . $font_size . ';--typost-fit-ratio:' . $ratio . ';--typost-fit-size:' . $font_size . '">x</span>',
            $plugin->add_fit_line_plain_properties($html, array('blockName' => 'typost/block'))
        );
    }

    public function test_the_fixture_is_read() {
        // A control: an empty provider would let every case above pass by
        // never running.
        $this->assertGreaterThanOrEqual(5, count($this->fixtureCases()));
    }
}

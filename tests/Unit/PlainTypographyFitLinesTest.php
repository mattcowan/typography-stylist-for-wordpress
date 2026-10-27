<?php
namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;

/**
 * Tests for the render_block filter behind the plain typography switch (#315).
 *
 * style.css divides a hung fit line's size by (1 + ratio × hang) when the
 * switch is on. The ratio and the size are only literals in the line's
 * inline font-size, so the filter copies them into --typost-fit-ratio and
 * --typost-fit-size at render time.
 */
class PlainTypographyFitLinesTest extends TestCase {

    protected function setUp(): void {
        parent::setUp();

        static $loaded = false;
        if (!$loaded) {
            require_once TYPOST_PLUGIN_DIR . '/typography-stylist.php';
            $loaded = true;
        }
    }

    private function render($html, $block_name = 'typost/block') {
        $reflection = new \ReflectionClass(\Typost::class);
        $plugin = $reflection->newInstanceWithoutConstructor();
        return $plugin->add_fit_line_plain_properties($html, array('blockName' => $block_name));
    }

    public function test_px_line_gets_the_ratio_and_the_size() {
        $html = '<h2 class="typost-styled typost-fit"><span class="typost-line" style="font-size:calc(0.4606 * 100cqi)">April</span></h2>';

        $this->assertSame(
            '<h2 class="typost-styled typost-fit"><span class="typost-line" style="font-size:calc(0.4606 * 100cqi);--typost-fit-ratio:0.4606;--typost-fit-size:calc(0.4606 * 100cqi)">April</span></h2>',
            $this->render($html)
        );
    }

    public function test_rem_line_with_caps_and_a_line_hang_copies_the_whole_size() {
        $size = 'min(calc(0.25 * var(--typost-fit-width, 100cqi)), calc(0.3 * 100cqi), 4rem)';
        $html = '<span class="typost-line" style="font-size:' . $size . ';--typost-line-hang:0.2">Moonlit</span>';

        $this->assertSame(
            '<span class="typost-line" style="font-size:' . $size . ';--typost-line-hang:0.2;--typost-fit-ratio:0.25;--typost-fit-size:' . $size . '">Moonlit</span>',
            $this->render($html)
        );
    }

    public function test_every_line_is_handled_and_inner_spans_are_left_alone() {
        $html = '<span class="typost-line" style="font-size:calc(0.5 * 100cqi)">One</span>'
            . '<span class="typost-line" style="font-size:calc(0.75 * 100cqi)"><span class="typost-styled" data-fontsize="24" style="font-size:24px">Two</span></span>';

        $out = $this->render($html);

        $this->assertStringContainsString('--typost-fit-ratio:0.5;', $out);
        $this->assertStringContainsString('--typost-fit-ratio:0.75;', $out);
        $this->assertStringContainsString('data-fontsize="24" style="font-size:24px"', $out);
        $this->assertSame(2, substr_count($out, '--typost-fit-size'));
    }

    public function test_kses_spacing_and_a_trailing_semicolon_are_accepted() {
        $html = '<span class="typost-line" style="font-size: calc(0.5 * 100cqi);">x</span>';

        $this->assertSame(
            '<span class="typost-line" style="font-size: calc(0.5 * 100cqi);--typost-fit-ratio:0.5;--typost-fit-size:calc(0.5 * 100cqi)">x</span>',
            $this->render($html)
        );
    }

    public function test_running_twice_adds_nothing_more() {
        $html = '<span class="typost-line" style="font-size:calc(0.5 * 100cqi)">x</span>';

        $once = $this->render($html);

        $this->assertSame($once, $this->render($once));
    }

    public function test_a_line_with_no_ratio_size_is_unchanged() {
        foreach (array(
            '<span class="typost-line">x</span>',
            '<span class="typost-line" style="--typost-line-hang:0.2">x</span>',
            '<span class="typost-line" style="font-size:32px">x</span>',
            '<span class="typost-line" style="font-size:calc(0 * 100cqi)">x</span>',
        ) as $html) {
            $this->assertSame($html, $this->render($html), $html);
        }
    }

    public function test_other_classes_and_other_blocks_are_unchanged() {
        $html = '<span class="typost-line-extra" style="font-size:calc(0.5 * 100cqi)">x</span>';
        $this->assertSame($html, $this->render($html));

        $line = '<span class="typost-line" style="font-size:calc(0.5 * 100cqi)">x</span>';
        $this->assertSame($line, $this->render($line, 'core/heading'));
    }

    public function test_typost_line_is_matched_between_other_classes() {
        // Control for the class match above: typost-line with other classes
        $html = '<span class="a typost-line b" style="font-size:calc(0.5 * 100cqi)">x</span>';

        $this->assertStringContainsString('--typost-fit-ratio:0.5', $this->render($html));
    }

    public function test_px_line_with_a_px_cap_takes_the_ratio_not_the_cap() {
        // buildFitFontSize() writes the ratio term first and the cap last
        $size = 'min(calc(0.4606 * 100cqi), 64px)';
        $html = '<span class="typost-line" style="font-size:' . $size . '">April</span>';

        $this->assertSame(
            '<span class="typost-line" style="font-size:' . $size . ';--typost-fit-ratio:0.4606;--typost-fit-size:' . $size . '">April</span>',
            $this->render($html)
        );
    }

    public function test_rem_line_with_a_rem_cap_takes_the_ratio() {
        $size = 'min(calc(0.4606 * var(--typost-fit-width, 100cqi)), calc(0.4606 * 100cqi), 4rem)';
        $html = '<span class="typost-line" style="font-size:' . $size . '">April</span>';

        $this->assertStringContainsString(';--typost-fit-ratio:0.4606;', $this->render($html));
    }

    public function test_input_that_is_not_block_html_is_returned_unchanged() {
        $reflection = new \ReflectionClass(\Typost::class);
        $plugin = $reflection->newInstanceWithoutConstructor();

        $this->assertNull($plugin->add_fit_line_plain_properties(null, array('blockName' => 'typost/block')));
        $this->assertSame('x', $plugin->add_fit_line_plain_properties('x', null));
    }
}

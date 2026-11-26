<?php
/**
 * The fit heading's letter spacing as a custom property (#458).
 *
 * save.js writes a fit block's letter spacing in em on the heading, and an
 * em value is resolved where it is declared, so every fit line inherited it
 * at the heading's size. add_fit_letter_spacing_property() copies the value
 * into --typost-fit-letter-spacing at render time, and style.css sets each
 * line's letter-spacing from it, so the line resolves it at its own size.
 * The values the block writes come from tests/fixtures/fit-letter-spacing.json
 * (the Jest reader is blocks/typography-stylist/__tests__/css-js-mirrors.test.js).
 */

namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;

class FitLetterSpacingTest extends TestCase {

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
        $plugin     = $reflection->newInstanceWithoutConstructor();
        return $plugin->add_fit_letter_spacing_property($html, array('blockName' => $block_name));
    }

    // A fit block as save() serializes it: style before class, no spaces
    private function fitBlock($style, $class = 'typost-styled typost-fit') {
        return '<div class="wp-block-typost"><h2 class="visually-hidden">Moonlit garden</h2>'
            . '<h2 style="' . $style . '" class="' . $class . '" aria-hidden="true">'
            . '<span class="typost-line" style="font-size:min(calc(0.3 * var(--typost-fit-width, 100cqi)), calc(0.3 * 100cqi))">Moonlit</span>'
            . '<span class="typost-line" style="font-size:min(calc(0.4 * var(--typost-fit-width, 100cqi)), calc(0.4 * 100cqi))">garden</span>'
            . '</h2></div>';
    }

    public function fixtureCases() {
        $json  = file_get_contents(TYPOST_PLUGIN_DIR . '/tests/fixtures/fit-letter-spacing.json');
        $cases = array();
        foreach (json_decode($json, true)['cases'] as $case) {
            $cases[$case['label']] = array($case['value']);
        }
        return $cases;
    }

    /**
     * @dataProvider fixtureCases
     */
    public function test_the_filter_copies_every_value_the_block_writes($value) {
        $style = 'font-weight:700;letter-spacing:' . $value . ';font-size:clamp(1rem, 2rem + 2vw, 4rem)';
        $this->assertSame(
            $this->fitBlock($style . ';--typost-fit-letter-spacing:' . $value),
            $this->render($this->fitBlock($style))
        );
    }

    public function test_the_fixture_is_read() {
        // A control: an empty provider would let every case above pass by
        // never running.
        $this->assertGreaterThanOrEqual(5, count($this->fixtureCases()));
    }

    public function test_it_reads_a_declaration_with_spaces_and_at_either_end() {
        $this->assertStringContainsString('letter-spacing: -0.05em;--typost-fit-letter-spacing:-0.05em"', $this->render($this->fitBlock('letter-spacing: -0.05em;')));
        $this->assertStringContainsString('font-weight: 700; letter-spacing : .5em;--typost-fit-letter-spacing:.5em"', $this->render($this->fitBlock('font-weight: 700; letter-spacing : .5em')));
    }

    public function test_it_changes_only_the_fit_heading() {
        $out = $this->render($this->fitBlock('letter-spacing:0.05em'));
        $this->assertSame(1, substr_count($out, '--typost-fit-letter-spacing'));
        $this->assertStringContainsString('<span class="typost-line" style="font-size:min(calc(0.3 * var(--typost-fit-width, 100cqi)), calc(0.3 * 100cqi))">Moonlit</span>', $out);
    }

    public function test_it_leaves_other_markup_alone() {
        $cases = array(
            'a block that is not fit to width' => $this->fitBlock('letter-spacing:0.05em', 'typost-styled'),
            'the editing class only'           => $this->fitBlock('letter-spacing:0.05em', 'typost-styled typost-fit-editing'),
            'no letter spacing'                => $this->fitBlock('font-weight:700'),
            'letter spacing in px'             => $this->fitBlock('letter-spacing:2px'),
            'letter spacing in rem'            => $this->fitBlock('letter-spacing:0.05rem'),
            'a paragraph style (no inline)'    => $this->fitBlock('text-align:center', 'typost-styled typost-fit typost-ps-3'),
            'the property already there'       => $this->fitBlock('letter-spacing:0.05em;--typost-fit-letter-spacing:0.05em'),
            'a custom property that ends in it' => $this->fitBlock('--my-letter-spacing:0.05em'),
        );
        foreach ($cases as $label => $html) {
            $this->assertSame($html, $this->render($html), $label);
        }
    }

    public function test_it_runs_on_the_typography_stylist_block_only() {
        $html = $this->fitBlock('letter-spacing:0.05em');
        $this->assertSame($html, $this->render($html, 'core/heading'));
        $this->assertNull($this->render(null));
        $reflection = new \ReflectionClass(\Typost::class);
        $plugin     = $reflection->newInstanceWithoutConstructor();
        $this->assertSame('x', $plugin->add_fit_letter_spacing_property('x', null));
    }

    public function test_the_filter_is_registered() {
        $source = file_get_contents(TYPOST_PLUGIN_DIR . '/typography-stylist.php');
        $this->assertSame(
            1,
            preg_match("/^\\s*add_filter\\('render_block', array\\(\\\$this, 'add_fit_letter_spacing_property'\\), 10, 2\\);/m", $source),
            'typography-stylist.php registers add_fit_letter_spacing_property() on render_block'
        );
    }
}

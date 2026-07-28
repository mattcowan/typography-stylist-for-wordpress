<?php
namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;

/**
 * Axis detection must be scoped to the font files a single entry owns.
 *
 * A kit ZIP holding several families produces one font entry per family, but
 * every entry shares the kit directory as 'upload_path'. Scanning that
 * directory handed each family the axes of whichever file parsed first — a
 * multi-family kit containing EB Garamond (wght only) and Fraunces
 * (opsz/SOFT/WONK/wght) gave Fraunces a lone weight slider.
 */
class VariableFontAxisScopingTest extends TestCase {

    /** @var string Temporary kit directory for the current test */
    private $kitDir;

    /** @var string Temporary directory outside the kit */
    private $outsideDir;

    protected function setUp(): void {
        parent::setUp();

        // The parser reads REGISTERED_AXES off the module class.
        if (!defined('TYPOST_VF_VERSION')) {
            define('TYPOST_VF_VERSION', 'test-version');
            define('TYPOST_VF_PLUGIN_DIR', TYPOST_PLUGIN_DIR . '/variable-fonts/');
            define('TYPOST_VF_PLUGIN_URL', 'http://localhost/variable-fonts/');
        }
        require_once TYPOST_PLUGIN_DIR . '/variable-fonts/variable-fonts.php';
        require_once TYPOST_PLUGIN_DIR . '/variable-fonts/includes/font-parser.php';

        $base = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'typost-vf-' . uniqid('', true);
        $this->kitDir = $base . DIRECTORY_SEPARATOR . 'kit';
        $this->outsideDir = $base . DIRECTORY_SEPARATOR . 'outside';
        mkdir($this->kitDir, 0777, true);
        mkdir($this->outsideDir, 0777, true);
    }

    protected function tearDown(): void {
        foreach ([$this->kitDir, $this->outsideDir] as $dir) {
            if (is_dir($dir)) {
                foreach (glob($dir . DIRECTORY_SEPARATOR . '*') as $file) {
                    unlink($file);
                }
                rmdir($dir);
            }
        }
        $parent = dirname($this->kitDir);
        if (is_dir($parent)) {
            rmdir($parent);
        }
        parent::tearDown();
    }

    // -------------------------------------------------------------------------
    // Fixtures
    // -------------------------------------------------------------------------

    /**
     * Write a minimal TrueType file whose only table is fvar.
     *
     * @param string $path Absolute destination path.
     * @param array  $axes [tag => [min, default, max]].
     */
    private function writeVariableFont($path, array $axes) {
        $fvar = pack('nnnnnnnn', 1, 0, 16, 2, count($axes), 20, 0, 0);
        foreach ($axes as $tag => $range) {
            $fvar .= substr(str_pad($tag, 4), 0, 4);
            $fvar .= pack('NNN', $range[0] * 65536, $range[1] * 65536, $range[2] * 65536);
            $fvar .= pack('nn', 0, 0); // flags, axisNameID
        }

        $tableOffset = 12 + 16; // header + one table record
        $font = pack('N', 0x00010000) . pack('nnnn', 1, 0, 0, 0);
        $font .= 'fvar' . pack('NNN', 0, $tableOffset, strlen($fvar));
        $font .= $fvar;

        file_put_contents($path, $font);
    }

    /**
     * Build a kit font entry in the shape process_font_kit_zip() produces.
     *
     * @param string $id       Composite font id.
     * @param array  $srcFiles File names referenced by this family's @font-face rules.
     * @return array
     */
    private function kitEntry($id, array $srcFiles) {
        $faces = [];
        foreach ($srcFiles as $file) {
            // rewrite_css_urls() stores src as a root-relative path.
            $faces[] = [
                'family' => $id,
                'src'    => "url('/wp-content/uploads/typography-stylist/fonts/kit-demo/{$file}') format('truetype')",
                'weight' => 'normal',
                'style'  => 'normal',
            ];
        }

        return [
            'id'          => $id,
            'name'        => $id,
            'font_id'     => 12,
            'font_faces'  => $faces,
            'upload_path' => $this->kitDir,
            'upload_url'  => 'http://localhost/wp-content/uploads/typography-stylist/fonts/kit-demo',
        ];
    }

    /**
     * @param array $axes Result of find_and_parse_axes().
     * @return array Axis tags in file order.
     */
    private function tags(array $axes) {
        return array_map(function ($axis) {
            return $axis['tag'];
        }, $axes);
    }

    // -------------------------------------------------------------------------
    // Tests
    // -------------------------------------------------------------------------

    /**
     * The regression: two families in one kit each keep their own axes.
     */
    public function testEachFamilyInAKitResolvesItsOwnAxes() {
        // Alphabetically first, so a directory scan would return this one's
        // axes for both entries.
        $this->writeVariableFont($this->kitDir . '/eb-garamond.ttf', [
            'wght' => [400, 400, 700],
        ]);
        $this->writeVariableFont($this->kitDir . '/fraunces.ttf', [
            'opsz' => [9, 14, 144],
            'wght' => [100, 400, 900],
            'SOFT' => [0, 0, 100],
            'WONK' => [0, 0, 1],
        ]);

        $garamond = \Typost_Font_Parser::find_and_parse_axes(
            $this->kitEntry('kit-demo-eb-garamond', ['eb-garamond.ttf'])
        );
        $fraunces = \Typost_Font_Parser::find_and_parse_axes(
            $this->kitEntry('kit-demo-fraunces', ['fraunces.ttf'])
        );

        $this->assertSame(['wght'], $this->tags($garamond));
        $this->assertSame(['opsz', 'wght', 'SOFT', 'WONK'], $this->tags($fraunces));

        // Ranges come from the family's own binary, not its neighbour's.
        $this->assertSame(9.0, $fraunces[0]['min']);
        $this->assertSame(144.0, $fraunces[0]['max']);
        $this->assertSame('Optical Size', $fraunces[0]['name']);
    }

    /**
     * A non-variable family in a mixed kit must not inherit a phantom axis.
     */
    public function testNonVariableFamilyInAMixedKitGetsNoAxes() {
        $this->writeVariableFont($this->kitDir . '/eb-garamond.ttf', [
            'wght' => [400, 400, 700],
        ]);
        // A static face: valid sfnt header, no fvar table.
        file_put_contents(
            $this->kitDir . '/style-script.ttf',
            pack('N', 0x00010000) . pack('nnnn', 1, 0, 0, 0) . 'cmap' . pack('NNN', 0, 28, 4) . 'data'
        );

        $axes = \Typost_Font_Parser::find_and_parse_axes(
            $this->kitEntry('kit-demo-style-script', ['style-script.ttf'])
        );

        $this->assertSame([], $axes);
    }

    /**
     * Entries with no font_faces still fall back to the directory scan, so
     * single-family kits stored before this change keep working.
     */
    public function testEntryWithoutFontFacesFallsBackToDirectoryScan() {
        $this->writeVariableFont($this->kitDir . '/only-font.ttf', [
            'wdth' => [75, 100, 125],
        ]);

        $entry = $this->kitEntry('kit-demo-only', []);
        unset($entry['font_faces']);

        $axes = \Typost_Font_Parser::find_and_parse_axes($entry);

        $this->assertSame(['wdth'], $this->tags($axes));
    }

    /**
     * Kit CSS arrives inside an uploaded ZIP, so a src that climbs out of the
     * upload directory must be refused rather than parsed.
     */
    public function testTraversalOutsideTheUploadDirectoryIsRefused() {
        $this->writeVariableFont($this->outsideDir . '/secret.ttf', [
            'slnt' => [-15, 0, 0],
        ]);

        $entry = $this->kitEntry('kit-demo-evil', []);
        $entry['font_faces'] = [
            ['src' => "url('../outside/secret.ttf') format('truetype')"],
            ['src' => "url('/wp-content/uploads/typography-stylist/fonts/kit-demo/../../../../outside/secret.ttf')"],
            ['src' => "url('http://evil.example.com/wp-content/uploads/typography-stylist/fonts/kit-demo/secret.ttf')"],
        ];

        $this->assertSame([], \Typost_Font_Parser::find_and_parse_axes($entry));
    }

    /**
     * A root-relative src belonging to a different kit is out of scope.
     */
    public function testSrcFromAnotherKitIsIgnored() {
        $this->writeVariableFont($this->kitDir . '/other.ttf', [
            'wght' => [100, 400, 900],
        ]);

        $entry = $this->kitEntry('kit-demo-other', []);
        $entry['font_faces'] = [
            ['src' => "url('/wp-content/uploads/typography-stylist/fonts/kit-elsewhere/other.ttf')"],
        ];

        $this->assertSame([], \Typost_Font_Parser::find_and_parse_axes($entry));
    }

    /**
     * WOFF2 cannot be decompressed server-side (no Brotli in PHP), so those
     * entries report no axes instead of borrowing a sibling's.
     */
    public function testWoff2OnlyFamilyReportsNoAxes() {
        $this->writeVariableFont($this->kitDir . '/sibling.ttf', [
            'wght' => [100, 400, 900],
        ]);
        file_put_contents($this->kitDir . '/compressed.woff2', 'wOF2 not really a font');

        $axes = \Typost_Font_Parser::find_and_parse_axes(
            $this->kitEntry('kit-demo-compressed', ['compressed.woff2'])
        );

        $this->assertSame([], $axes);
    }

    /**
     * A missing upload directory is not an error, just "no axes".
     */
    public function testMissingUploadDirectoryYieldsNoAxes() {
        $entry = $this->kitEntry('kit-demo-gone', ['whatever.ttf']);
        $entry['upload_path'] = $this->kitDir . DIRECTORY_SEPARATOR . 'does-not-exist';

        $this->assertSame([], \Typost_Font_Parser::find_and_parse_axes($entry));
    }
}

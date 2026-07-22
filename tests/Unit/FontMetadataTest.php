<?php
namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;

/**
 * Tests for Typost_Font_Metadata — the binary metadata reader and
 * @font-face CSS generator used when a font kit ZIP contains no CSS.
 *
 * Fixtures are synthetic sfnt/WOFF binaries built with pack() so no
 * binary files need to be committed to the repo.
 */
class FontMetadataTest extends TestCase {

    /** @var string[] Temp files created during a test */
    private $tempFiles = array();

    /** @var string|null Temp directory created during a test */
    private $tempDir = null;

    public static function setUpBeforeClass(): void {
        parent::setUpBeforeClass();
        require_once TYPOST_PLUGIN_DIR . '/includes/class-typost-font-metadata.php';
    }

    protected function tearDown(): void {
        foreach ($this->tempFiles as $file) {
            if (is_file($file)) {
                unlink($file);
            }
        }
        $this->tempFiles = array();

        if ($this->tempDir !== null && is_dir($this->tempDir)) {
            $iterator = new \RecursiveIteratorIterator(
                new \RecursiveDirectoryIterator($this->tempDir, \RecursiveDirectoryIterator::SKIP_DOTS),
                \RecursiveIteratorIterator::CHILD_FIRST
            );
            foreach ($iterator as $item) {
                if ($item->isDir()) {
                    rmdir($item->getPathname());
                } else {
                    unlink($item->getPathname());
                }
            }
            rmdir($this->tempDir);
            $this->tempDir = null;
        }

        parent::tearDown();
    }

    // -----------------------------------------------------------------
    // Reflection helper
    // -----------------------------------------------------------------

    private static function invokePrivate($method, ...$args) {
        $reflection = new \ReflectionMethod(\Typost_Font_Metadata::class, $method);
        $reflection->setAccessible(true);
        return $reflection->invokeArgs(null, $args);
    }

    // -----------------------------------------------------------------
    // Binary fixture builders
    // -----------------------------------------------------------------

    /**
     * Build a name table (format 0).
     *
     * @param array $names Each: ['platform'=>int,'encoding'=>int,'language'=>int,'nameId'=>int,'value'=>string]
     */
    private function buildNameTable(array $names) {
        $count = count($names);
        $stringOffset = 6 + 12 * $count;
        $records = '';
        $strings = '';
        foreach ($names as $n) {
            $isUtf16 = ($n['platform'] === 3 || $n['platform'] === 0);
            $encoded = $isUtf16 ? mb_convert_encoding($n['value'], 'UTF-16BE', 'UTF-8') : $n['value'];
            $records .= pack('nnnnnn', $n['platform'], $n['encoding'], $n['language'], $n['nameId'], strlen($encoded), strlen($strings));
            $strings .= $encoded;
        }
        return pack('nnn', 0, $count, $stringOffset) . $records . $strings;
    }

    /** Convenience: a name table with a single Windows (3/1/0x409) record. */
    private function winName($nameId, $value) {
        return array('platform' => 3, 'encoding' => 1, 'language' => 0x0409, 'nameId' => $nameId, 'value' => $value);
    }

    private function buildOs2($weightClass, $fsSelection = 0, $length = 96) {
        $bytes = str_repeat("\0", $length);
        if ($length >= 6) {
            $bytes = substr_replace($bytes, pack('n', $weightClass), 4, 2);
        }
        if ($length >= 64) {
            $bytes = substr_replace($bytes, pack('n', $fsSelection), 62, 2);
        }
        return $bytes;
    }

    private function buildHead($macStyle) {
        $bytes = str_repeat("\0", 54);
        return substr_replace($bytes, pack('n', $macStyle), 44, 2);
    }

    private function toFixed($value) {
        $int = (int) round($value * 65536);
        if ($int < 0) {
            $int += 4294967296;
        }
        return $int;
    }

    /**
     * Build an fvar table.
     *
     * @param array $axes Each: ['tag'=>'wght','min'=>float,'default'=>float,'max'=>float]
     */
    private function buildFvar(array $axes) {
        $header = pack('nnnnnn', 1, 0, 16, 2, count($axes), 20);
        $data = $header . str_repeat("\0", 4); // pad header to axesArrayOffset (16)
        foreach ($axes as $axis) {
            $data .= str_pad(substr($axis['tag'], 0, 4), 4, ' ');
            $data .= pack('NNN', $this->toFixed($axis['min']), $this->toFixed($axis['default']), $this->toFixed($axis['max']));
            $data .= pack('nn', 0, 257); // flags, axisNameID
        }
        return $data;
    }

    /**
     * Build a complete sfnt (TTF/OTF) binary.
     *
     * @param array $tables tag => raw table bytes
     * @param int   $flavor sfnt version (0x00010000 or 0x4F54544F 'OTTO')
     */
    private function buildSfnt(array $tables, $flavor = 0x00010000) {
        $numTables = count($tables);
        $header = pack('N', $flavor) . pack('nnnn', $numTables, 0, 0, 0);
        $offset = 12 + 16 * $numTables;
        $dir = '';
        $blob = '';
        foreach ($tables as $tag => $bytes) {
            $dir .= str_pad(substr($tag, 0, 4), 4, ' ') . pack('NNN', 0, $offset, strlen($bytes));
            $pad = (4 - (strlen($bytes) % 4)) % 4;
            $blob .= $bytes . str_repeat("\0", $pad);
            $offset += strlen($bytes) + $pad;
        }
        return $header . $dir . $blob;
    }

    /**
     * Build a WOFF (v1) binary wrapping the given tables.
     */
    private function buildWoff(array $tables, $compress = true, $flavor = 0x00010000) {
        $numTables = count($tables);
        $offset = 44 + 20 * $numTables;
        $dir = '';
        $blob = '';
        foreach ($tables as $tag => $bytes) {
            $comp = $compress ? gzcompress($bytes) : $bytes;
            if (strlen($comp) >= strlen($bytes)) {
                $comp = $bytes; // WOFF spec: store uncompressed when compression does not shrink
            }
            $dir .= str_pad(substr($tag, 0, 4), 4, ' ') . pack('NNNN', $offset, strlen($comp), strlen($bytes), 0);
            $pad = (4 - (strlen($comp) % 4)) % 4;
            $blob .= $comp . str_repeat("\0", $pad);
            $offset += strlen($comp) + $pad;
        }
        $totalLength = 44 + 20 * $numTables + strlen($blob);
        $header = 'wOFF' . pack('N', $flavor) . pack('N', $totalLength)
            . pack('nn', $numTables, 0)
            . pack('N', 0)      // totalSfntSize (unused by the reader)
            . pack('nn', 1, 0)  // majorVersion, minorVersion
            . pack('NNNNN', 0, 0, 0, 0, 0); // metaOffset, metaLength, metaOrigLength, privOffset, privLength
        return $header . $dir . $blob;
    }

    private function writeTempFont($bytes) {
        $path = tempnam(sys_get_temp_dir(), 'tsf');
        file_put_contents($path, $bytes);
        $this->tempFiles[] = $path;
        return $path;
    }

    /** Create a temp dir and write named files into it. Returns the dir path. */
    private function makeTempKit(array $files) {
        $this->tempDir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'typost-test-' . uniqid();
        mkdir($this->tempDir, 0777, true);
        foreach ($files as $name => $bytes) {
            $target = $this->tempDir . DIRECTORY_SEPARATOR . $name;
            $parent = dirname($target);
            if (!is_dir($parent)) {
                mkdir($parent, 0777, true);
            }
            file_put_contents($target, $bytes);
        }
        return $this->tempDir;
    }

    // -----------------------------------------------------------------
    // parse_name_table
    // -----------------------------------------------------------------

    public function test_name_table_reads_windows_record() {
        $table = $this->buildNameTable(array($this->winName(1, 'Test Family')));
        $names = self::invokePrivate('parse_name_table', $table);
        $this->assertSame('Test Family', $names[1]);
    }

    public function test_name_table_prefers_windows_over_mac() {
        $table = $this->buildNameTable(array(
            array('platform' => 1, 'encoding' => 0, 'language' => 0, 'nameId' => 1, 'value' => 'MacName'),
            $this->winName(1, 'WinName'),
        ));
        $names = self::invokePrivate('parse_name_table', $table);
        $this->assertSame('WinName', $names[1]);
    }

    public function test_name_table_mac_only_record_decodes() {
        $table = $this->buildNameTable(array(
            array('platform' => 1, 'encoding' => 0, 'language' => 0, 'nameId' => 1, 'value' => 'Mac Family'),
        ));
        $names = self::invokePrivate('parse_name_table', $table);
        $this->assertSame('Mac Family', $names[1]);
    }

    public function test_name_table_decodes_utf16_non_ascii() {
        $table = $this->buildNameTable(array($this->winName(16, 'Fütura Grotesk')));
        $names = self::invokePrivate('parse_name_table', $table);
        $this->assertSame('Fütura Grotesk', $names[16]);
    }

    public function test_name_table_collects_all_relevant_name_ids() {
        $table = $this->buildNameTable(array(
            $this->winName(1, 'Legacy Family'),
            $this->winName(2, 'Bold'),
            $this->winName(16, 'Typographic Family'),
            $this->winName(17, 'Semibold Italic'),
        ));
        $names = self::invokePrivate('parse_name_table', $table);
        $this->assertSame('Legacy Family', $names[1]);
        $this->assertSame('Bold', $names[2]);
        $this->assertSame('Typographic Family', $names[16]);
        $this->assertSame('Semibold Italic', $names[17]);
    }

    public function test_name_table_truncated_returns_empty_no_throw() {
        $table = $this->buildNameTable(array($this->winName(1, 'Test Family')));
        $names = self::invokePrivate('parse_name_table', substr($table, 0, 10));
        $this->assertSame(array(), $names);
    }

    public function test_name_table_garbage_returns_empty() {
        $this->assertSame(array(), self::invokePrivate('parse_name_table', 'not a name table'));
        $this->assertSame(array(), self::invokePrivate('parse_name_table', ''));
    }

    // -----------------------------------------------------------------
    // parse_os2_table
    // -----------------------------------------------------------------

    public function test_os2_reads_weight_class() {
        $result = self::invokePrivate('parse_os2_table', $this->buildOs2(700));
        $this->assertSame(700, $result['weight']);
        $this->assertFalse($result['italic']);
    }

    public function test_os2_clamps_zero_weight_to_400() {
        $result = self::invokePrivate('parse_os2_table', $this->buildOs2(0));
        $this->assertSame(400, $result['weight']);
    }

    public function test_os2_clamps_excessive_weight_to_1000() {
        $result = self::invokePrivate('parse_os2_table', $this->buildOs2(1100));
        $this->assertSame(1000, $result['weight']);
    }

    public function test_os2_italic_bit() {
        $result = self::invokePrivate('parse_os2_table', $this->buildOs2(400, 0x01));
        $this->assertTrue($result['italic']);
    }

    public function test_os2_short_table_weight_readable_italic_null() {
        $result = self::invokePrivate('parse_os2_table', $this->buildOs2(500, 0, 40));
        $this->assertSame(500, $result['weight']);
        $this->assertNull($result['italic']);
    }

    public function test_os2_too_short_returns_null() {
        $this->assertNull(self::invokePrivate('parse_os2_table', "\0\0\0"));
    }

    // -----------------------------------------------------------------
    // parse_head_mac_style
    // -----------------------------------------------------------------

    public function test_head_mac_style_italic_bit() {
        $this->assertTrue(self::invokePrivate('parse_head_mac_style', $this->buildHead(0x02)));
        $this->assertFalse(self::invokePrivate('parse_head_mac_style', $this->buildHead(0x00)));
    }

    public function test_head_mac_style_short_table_returns_null() {
        $this->assertNull(self::invokePrivate('parse_head_mac_style', "\0\0\0\0"));
    }

    // -----------------------------------------------------------------
    // parse_fvar_wght
    // -----------------------------------------------------------------

    public function test_fvar_wght_axis_range() {
        $table = $this->buildFvar(array(
            array('tag' => 'wght', 'min' => 300, 'default' => 400, 'max' => 700),
        ));
        $result = self::invokePrivate('parse_fvar_wght', $table);
        $this->assertSame(300.0, $result['min']);
        $this->assertSame(700.0, $result['max']);
        $this->assertSame(400.0, $result['default']);
    }

    public function test_fvar_without_wght_returns_null() {
        $table = $this->buildFvar(array(
            array('tag' => 'wdth', 'min' => 75, 'default' => 100, 'max' => 125),
        ));
        $this->assertNull(self::invokePrivate('parse_fvar_wght', $table));
    }

    public function test_fvar_finds_wght_among_multiple_axes() {
        $table = $this->buildFvar(array(
            array('tag' => 'wdth', 'min' => 75, 'default' => 100, 'max' => 125),
            array('tag' => 'wght', 'min' => 100, 'default' => 400, 'max' => 900),
        ));
        $result = self::invokePrivate('parse_fvar_wght', $table);
        $this->assertSame(100.0, $result['min']);
        $this->assertSame(900.0, $result['max']);
    }

    public function test_fvar_malformed_returns_null() {
        $table = $this->buildFvar(array(
            array('tag' => 'wght', 'min' => 300, 'default' => 400, 'max' => 700),
        ));
        $this->assertNull(self::invokePrivate('parse_fvar_wght', substr($table, 0, 8)));
        $this->assertNull(self::invokePrivate('parse_fvar_wght', ''));
    }

    public function test_fvar_negative_fixed_values() {
        $table = $this->buildFvar(array(
            array('tag' => 'wght', 'min' => -50, 'default' => 0, 'max' => 50),
        ));
        $result = self::invokePrivate('parse_fvar_wght', $table);
        $this->assertSame(-50.0, $result['min']);
        $this->assertSame(50.0, $result['max']);
    }

    // -----------------------------------------------------------------
    // read_font_metadata — whole files
    // -----------------------------------------------------------------

    public function test_read_static_ttf_metadata() {
        $binary = $this->buildSfnt(array(
            'name' => $this->buildNameTable(array($this->winName(1, 'Test Family'))),
            'OS/2' => $this->buildOs2(300),
        ));
        $meta = \Typost_Font_Metadata::read_font_metadata($this->writeTempFont($binary));
        $this->assertSame('Test Family', $meta['family']);
        $this->assertSame(300, $meta['weight']);
        $this->assertSame('normal', $meta['style']);
        $this->assertFalse($meta['is_variable']);
        $this->assertSame('binary', $meta['source']);
    }

    public function test_read_prefers_typographic_family_name() {
        $binary = $this->buildSfnt(array(
            'name' => $this->buildNameTable(array(
                $this->winName(1, 'Legacy Light'),
                $this->winName(16, 'Typographic'),
            )),
            'OS/2' => $this->buildOs2(300),
        ));
        $meta = \Typost_Font_Metadata::read_font_metadata($this->writeTempFont($binary));
        $this->assertSame('Typographic', $meta['family']);
    }

    public function test_read_variable_ttf_metadata() {
        $binary = $this->buildSfnt(array(
            'name' => $this->buildNameTable(array($this->winName(16, 'Space Grotesk'))),
            'OS/2' => $this->buildOs2(400),
            'fvar' => $this->buildFvar(array(
                array('tag' => 'wght', 'min' => 300, 'default' => 400, 'max' => 700),
            )),
        ));
        $meta = \Typost_Font_Metadata::read_font_metadata($this->writeTempFont($binary));
        $this->assertSame('Space Grotesk', $meta['family']);
        $this->assertTrue($meta['is_variable']);
        $this->assertSame(300.0, $meta['weight']['min']);
        $this->assertSame(700.0, $meta['weight']['max']);
    }

    public function test_read_otto_flavor_accepted() {
        $binary = $this->buildSfnt(array(
            'name' => $this->buildNameTable(array($this->winName(1, 'CFF Family'))),
            'OS/2' => $this->buildOs2(400),
        ), 0x4F54544F);
        $meta = \Typost_Font_Metadata::read_font_metadata($this->writeTempFont($binary));
        $this->assertSame('CFF Family', $meta['family']);
    }

    public function test_read_woff_with_compressed_tables() {
        $tables = array(
            'name' => $this->buildNameTable(array($this->winName(1, 'Woff Family'))),
            'OS/2' => $this->buildOs2(600, 0x01),
        );
        $meta = \Typost_Font_Metadata::read_font_metadata($this->writeTempFont($this->buildWoff($tables, true)));
        $this->assertSame('Woff Family', $meta['family']);
        $this->assertSame(600, $meta['weight']);
        $this->assertSame('italic', $meta['style']);
    }

    public function test_read_woff_with_stored_tables() {
        $tables = array(
            'name' => $this->buildNameTable(array($this->winName(1, 'Woff Family'))),
            'OS/2' => $this->buildOs2(600),
        );
        $meta = \Typost_Font_Metadata::read_font_metadata($this->writeTempFont($this->buildWoff($tables, false)));
        $this->assertSame('Woff Family', $meta['family']);
        $this->assertSame(600, $meta['weight']);
    }

    public function test_read_woff_variable_font() {
        $tables = array(
            'name' => $this->buildNameTable(array($this->winName(16, 'Var Woff'))),
            'fvar' => $this->buildFvar(array(
                array('tag' => 'wght', 'min' => 100, 'default' => 400, 'max' => 900),
            )),
        );
        $meta = \Typost_Font_Metadata::read_font_metadata($this->writeTempFont($this->buildWoff($tables)));
        $this->assertTrue($meta['is_variable']);
        $this->assertSame(100.0, $meta['weight']['min']);
    }

    public function test_read_woff_oversized_table_rejected() {
        // A name table padded past the 1MB per-table ceiling must be refused,
        // making the file unreadable (family unavailable).
        $tables = array(
            'name' => $this->buildNameTable(array($this->winName(1, 'Bomb'))) . str_repeat("\0", 1200000),
        );
        $this->assertFalse(\Typost_Font_Metadata::read_font_metadata($this->writeTempFont($this->buildWoff($tables))));
    }

    public function test_read_woff2_returns_false() {
        $this->assertFalse(\Typost_Font_Metadata::read_font_metadata($this->writeTempFont('wOF2' . str_repeat("\0", 100))));
    }

    public function test_read_eot_returns_false() {
        $this->assertFalse(\Typost_Font_Metadata::read_font_metadata($this->writeTempFont("\x00\x00" . str_repeat('x', 100))));
    }

    public function test_read_empty_file_returns_false() {
        $this->assertFalse(\Typost_Font_Metadata::read_font_metadata($this->writeTempFont('')));
    }

    public function test_read_garbage_returns_false() {
        $this->assertFalse(\Typost_Font_Metadata::read_font_metadata($this->writeTempFont('hello world, not a font')));
    }

    public function test_read_missing_file_returns_false() {
        $this->assertFalse(\Typost_Font_Metadata::read_font_metadata(sys_get_temp_dir() . '/typost-does-not-exist.ttf'));
    }

    public function test_read_sfnt_without_name_table_returns_false() {
        $binary = $this->buildSfnt(array('OS/2' => $this->buildOs2(400)));
        $this->assertFalse(\Typost_Font_Metadata::read_font_metadata($this->writeTempFont($binary)));
    }

    public function test_read_falls_back_to_head_mac_style_for_italic() {
        $binary = $this->buildSfnt(array(
            'name' => $this->buildNameTable(array($this->winName(1, 'Head Italic'))),
            'head' => $this->buildHead(0x02),
        ));
        $meta = \Typost_Font_Metadata::read_font_metadata($this->writeTempFont($binary));
        $this->assertSame('italic', $meta['style']);
        $this->assertSame(400, $meta['weight']); // no OS/2 → default weight
    }

    // -----------------------------------------------------------------
    // metadata_from_filename
    // -----------------------------------------------------------------

    public function test_filename_google_variable_pattern() {
        $meta = \Typost_Font_Metadata::metadata_from_filename('SpaceGrotesk[wght].woff2');
        $this->assertSame('Space Grotesk', $meta['family']);
        $this->assertTrue($meta['is_variable']);
        $this->assertSame(100, $meta['weight']['min']);
        $this->assertSame(900, $meta['weight']['max']);
        $this->assertSame('normal', $meta['style']);
        $this->assertSame('filename', $meta['source']);
    }

    public function test_filename_google_variable_italic_pattern() {
        $meta = \Typost_Font_Metadata::metadata_from_filename('OpenSans-Italic[wght].woff2');
        $this->assertSame('Open Sans', $meta['family']);
        $this->assertTrue($meta['is_variable']);
        $this->assertSame('italic', $meta['style']);
    }

    public function test_filename_multi_axis_bracket_pattern() {
        $meta = \Typost_Font_Metadata::metadata_from_filename('Recursive[CASL,CRSV,MONO,slnt,wght].ttf');
        $this->assertSame('Recursive', $meta['family']);
        $this->assertTrue($meta['is_variable']);
        $this->assertSame(100, $meta['weight']['min']);
    }

    public function test_filename_static_weight_suffixes() {
        $meta = \Typost_Font_Metadata::metadata_from_filename('Lato-SemiBold.woff2');
        $this->assertSame('Lato', $meta['family']);
        $this->assertSame(600, $meta['weight']);
        $this->assertSame('normal', $meta['style']);
        $this->assertFalse($meta['is_variable']);
    }

    public function test_filename_bold_italic_suffix() {
        $meta = \Typost_Font_Metadata::metadata_from_filename('Roboto-BoldItalic.woff2');
        $this->assertSame('Roboto', $meta['family']);
        $this->assertSame(700, $meta['weight']);
        $this->assertSame('italic', $meta['style']);
    }

    public function test_filename_plain_italic_suffix() {
        $meta = \Typost_Font_Metadata::metadata_from_filename('Merriweather-Italic.ttf');
        $this->assertSame('Merriweather', $meta['family']);
        $this->assertSame(400, $meta['weight']);
        $this->assertSame('italic', $meta['style']);
    }

    public function test_filename_no_pattern_falls_back_to_basename() {
        $meta = \Typost_Font_Metadata::metadata_from_filename('weirdname.woff2');
        $this->assertSame('weirdname', $meta['family']);
        $this->assertSame(400, $meta['weight']);
        $this->assertSame('normal', $meta['style']);
        $this->assertFalse($meta['is_variable']);
    }

    public function test_filename_camel_case_split() {
        $meta = \Typost_Font_Metadata::metadata_from_filename('PlayfairDisplay-Bold.ttf');
        $this->assertSame('Playfair Display', $meta['family']);
        $this->assertSame(700, $meta['weight']);
    }

    // -----------------------------------------------------------------
    // build_css
    // -----------------------------------------------------------------

    private function variableMeta($family = 'Space Grotesk', $min = 300, $max = 700) {
        return array(
            'family'      => $family,
            'weight'      => array('min' => (float) $min, 'max' => (float) $max),
            'style'       => 'normal',
            'is_variable' => true,
            'source'      => 'binary',
        );
    }

    private function staticMeta($family, $weight = 400, $style = 'normal') {
        return array(
            'family'      => $family,
            'weight'      => $weight,
            'style'       => $style,
            'is_variable' => false,
            'source'      => 'binary',
        );
    }

    public function test_build_css_variable_font_block() {
        $kit = '/tmp/kit';
        $css = \Typost_Font_Metadata::build_css(array(
            array('file' => $kit . '/SpaceGrotesk[wght].ttf', 'meta' => $this->variableMeta()),
        ), $kit);

        $this->assertStringContainsString('font-family: "Space Grotesk";', $css);
        $this->assertStringContainsString("format('truetype-variations')", $css);
        $this->assertStringContainsString('font-weight: 300 700;', $css);
        $this->assertStringContainsString('font-style: normal;', $css);
        $this->assertStringContainsString('font-display: swap;', $css);
        $this->assertStringContainsString("url('SpaceGrotesk%5Bwght%5D.ttf')", $css);
    }

    public function test_build_css_static_font_block() {
        $kit = '/tmp/kit';
        $css = \Typost_Font_Metadata::build_css(array(
            array('file' => $kit . '/Lato-SemiBold.woff', 'meta' => $this->staticMeta('Lato', 600)),
        ), $kit);

        $this->assertStringContainsString('font-weight: 600;', $css);
        $this->assertStringContainsString("format('woff')", $css);
        $this->assertStringNotContainsString('variations', $css);
    }

    public function test_build_css_merges_formats_of_same_face_woff2_first() {
        $kit = '/tmp/kit';
        $css = \Typost_Font_Metadata::build_css(array(
            array('file' => $kit . '/Lato.woff', 'meta' => $this->staticMeta('Lato')),
            array('file' => $kit . '/Lato.woff2', 'meta' => $this->staticMeta('Lato')),
        ), $kit);

        $this->assertSame(1, substr_count($css, '@font-face'));
        $woff2Pos = strpos($css, 'Lato.woff2');
        $woffPos = strpos($css, "Lato.woff')");
        $this->assertNotFalse($woff2Pos);
        $this->assertNotFalse($woffPos);
        $this->assertLessThan($woffPos, $woff2Pos, 'woff2 src must come before woff');
    }

    public function test_build_css_separate_blocks_for_different_weights() {
        $kit = '/tmp/kit';
        $css = \Typost_Font_Metadata::build_css(array(
            array('file' => $kit . '/Lato-Regular.ttf', 'meta' => $this->staticMeta('Lato', 400)),
            array('file' => $kit . '/Lato-Bold.ttf', 'meta' => $this->staticMeta('Lato', 700)),
        ), $kit);
        $this->assertSame(2, substr_count($css, '@font-face'));
        $this->assertStringContainsString('font-weight: 400;', $css);
        $this->assertStringContainsString('font-weight: 700;', $css);
    }

    public function test_build_css_two_families_two_blocks() {
        $kit = '/tmp/kit';
        $css = \Typost_Font_Metadata::build_css(array(
            array('file' => $kit . '/A.ttf', 'meta' => $this->staticMeta('Family A')),
            array('file' => $kit . '/B.ttf', 'meta' => $this->staticMeta('Family B')),
        ), $kit);
        $this->assertSame(2, substr_count($css, '@font-face'));
        $this->assertStringContainsString('"Family A"', $css);
        $this->assertStringContainsString('"Family B"', $css);
    }

    public function test_build_css_subdirectory_and_space_encoding() {
        $kit = '/tmp/kit';
        $css = \Typost_Font_Metadata::build_css(array(
            array('file' => $kit . '/sub dir/My Font.woff', 'meta' => $this->staticMeta('My Font')),
        ), $kit);
        $this->assertStringContainsString("url('sub%20dir/My%20Font.woff')", $css);
    }

    public function test_build_css_windows_paths_normalized() {
        $kit = 'C:\\uploads\\kit';
        $css = \Typost_Font_Metadata::build_css(array(
            array('file' => 'C:\\uploads\\kit\\sub\\Font.ttf', 'meta' => $this->staticMeta('Font')),
        ), $kit);
        $this->assertStringContainsString("url('sub/Font.ttf')", $css);
    }

    public function test_build_css_apostrophe_family_survives() {
        $kit = '/tmp/kit';
        $css = \Typost_Font_Metadata::build_css(array(
            array('file' => $kit . "/font.ttf", 'meta' => $this->staticMeta("Font's Sans")),
        ), $kit);
        $this->assertStringContainsString('font-family: "Font\'s Sans";', $css);
    }

    public function test_build_css_double_quote_stripped_from_family() {
        $kit = '/tmp/kit';
        $css = \Typost_Font_Metadata::build_css(array(
            array('file' => $kit . '/font.ttf', 'meta' => $this->staticMeta('Fo"nt')),
        ), $kit);
        $this->assertStringContainsString('font-family: "Font";', $css);
    }

    public function test_build_css_eot_format() {
        $kit = '/tmp/kit';
        $css = \Typost_Font_Metadata::build_css(array(
            array('file' => $kit . '/old.eot', 'meta' => $this->staticMeta('Old Font')),
        ), $kit);
        $this->assertStringContainsString("format('embedded-opentype')", $css);
    }

    public function test_build_css_woff2_variable_format() {
        $kit = '/tmp/kit';
        $css = \Typost_Font_Metadata::build_css(array(
            array('file' => $kit . '/Var.woff2', 'meta' => $this->variableMeta('Var', 100, 900)),
        ), $kit);
        $this->assertStringContainsString("format('woff2-variations')", $css);
        $this->assertStringContainsString('font-weight: 100 900;', $css);
    }

    public function test_build_css_empty_input_returns_empty_string() {
        $this->assertSame('', \Typost_Font_Metadata::build_css(array(), '/tmp/kit'));
    }

    public function test_build_css_declarations_all_semicolon_terminated() {
        // parse_webfont_kit's regexes require ';' after every declaration.
        $kit = '/tmp/kit';
        $css = \Typost_Font_Metadata::build_css(array(
            array('file' => $kit . '/A.ttf', 'meta' => $this->staticMeta('A')),
        ), $kit);
        preg_match('/@font-face\s*\{([^}]*)\}/', $css, $m);
        $body = trim($m[1]);
        $this->assertStringEndsWith(';', $body);
        $this->assertGreaterThanOrEqual(5, substr_count($body, ';'), 'every declaration must end with a semicolon');
    }

    // -----------------------------------------------------------------
    // generate_stylesheet
    // -----------------------------------------------------------------

    public function test_generate_stylesheet_from_variable_ttf() {
        $binary = $this->buildSfnt(array(
            'name' => $this->buildNameTable(array($this->winName(16, 'Space Grotesk'))),
            'OS/2' => $this->buildOs2(400),
            'fvar' => $this->buildFvar(array(
                array('tag' => 'wght', 'min' => 300, 'default' => 400, 'max' => 700),
            )),
        ));
        $kit = $this->makeTempKit(array('SpaceGrotesk[wght].ttf' => $binary));
        $result = \Typost_Font_Metadata::generate_stylesheet(array($kit . DIRECTORY_SEPARATOR . 'SpaceGrotesk[wght].ttf'), $kit);

        $this->assertSame(array(), $result['warnings']);
        $this->assertStringContainsString('"Space Grotesk"', $result['css']);
        $this->assertStringContainsString('font-weight: 300 700;', $result['css']);
        $this->assertStringContainsString("format('truetype-variations')", $result['css']);
    }

    public function test_generate_stylesheet_woff2_falls_back_with_warning() {
        $kit = $this->makeTempKit(array(
            'SpaceGrotesk[wght].woff2' => 'wOF2' . str_repeat("\0", 64),
        ));
        $result = \Typost_Font_Metadata::generate_stylesheet(array($kit . DIRECTORY_SEPARATOR . 'SpaceGrotesk[wght].woff2'), $kit);

        $this->assertStringContainsString('"Space Grotesk"', $result['css']);
        $this->assertCount(1, $result['warnings']);
        $this->assertSame('woff2_filename_guess', $result['warnings'][0]['code']);
        $this->assertSame('SpaceGrotesk[wght].woff2', $result['warnings'][0]['file']);
    }

    public function test_generate_stylesheet_corrupt_ttf_falls_back_with_warning() {
        $kit = $this->makeTempKit(array('Broken-Bold.ttf' => 'not really a font'));
        $result = \Typost_Font_Metadata::generate_stylesheet(array($kit . DIRECTORY_SEPARATOR . 'Broken-Bold.ttf'), $kit);

        $this->assertStringContainsString('"Broken"', $result['css']);
        $this->assertStringContainsString('font-weight: 700;', $result['css']);
        $this->assertCount(1, $result['warnings']);
        $this->assertSame('filename_guess', $result['warnings'][0]['code']);
    }

    public function test_generate_stylesheet_empty_input() {
        $result = \Typost_Font_Metadata::generate_stylesheet(array(), '/tmp/kit');
        $this->assertSame('', $result['css']);
        $this->assertSame(array(), $result['warnings']);
    }

    public function test_generate_stylesheet_mixed_kit() {
        $regular = $this->buildSfnt(array(
            'name' => $this->buildNameTable(array($this->winName(1, 'Mixed Family'))),
            'OS/2' => $this->buildOs2(400),
        ));
        $bold = $this->buildSfnt(array(
            'name' => $this->buildNameTable(array($this->winName(1, 'Mixed Family'))),
            'OS/2' => $this->buildOs2(700),
        ));
        $kit = $this->makeTempKit(array(
            'Mixed-Regular.ttf' => $regular,
            'Mixed-Bold.ttf'    => $bold,
        ));
        $result = \Typost_Font_Metadata::generate_stylesheet(array(
            $kit . DIRECTORY_SEPARATOR . 'Mixed-Regular.ttf',
            $kit . DIRECTORY_SEPARATOR . 'Mixed-Bold.ttf',
        ), $kit);

        $this->assertSame(2, substr_count($result['css'], '@font-face'));
        $this->assertStringContainsString('font-weight: 400;', $result['css']);
        $this->assertStringContainsString('font-weight: 700;', $result['css']);
        $this->assertSame(array(), $result['warnings']);
    }
}

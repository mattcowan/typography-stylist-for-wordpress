<?php
/**
 * Compile PO files to MO format
 *
 * This script compiles .po translation files to .mo binary format
 * that WordPress uses for translations.
 *
 * Usage: php scripts/compile-po.php [locale]
 * Example: php scripts/compile-po.php es_ES
 * Or: php scripts/compile-po.php (compiles all .po files)
 */

class PO_to_MO_Compiler {
    private $po_file;
    private $mo_file;

    public function __construct($po_file) {
        $this->po_file = $po_file;
        $this->mo_file = str_replace('.po', '.mo', $po_file);
    }

    public function compile() {
        if (!file_exists($this->po_file)) {
            throw new Exception("PO file not found: {$this->po_file}");
        }

        $po_content = file_get_contents($this->po_file);
        $entries = $this->parse_po($po_content);

        if (empty($entries)) {
            throw new Exception("No translation entries found in PO file");
        }

        $this->write_mo($entries);
        return true;
    }

    private function parse_po($content) {
        $entries = [];
        $lines = explode("\n", $content);
        $current = null;
        $type = null;

        foreach ($lines as $line) {
            $line = trim($line);

            // Skip empty lines and comments (except translator comments we want to preserve)
            if (empty($line) || $line[0] === '#') {
                if ($current !== null && isset($current['msgid']) && isset($current['msgstr'])) {
                    // Handle plural forms
                    if (isset($current['msgid_plural'])) {
                        // Store plural entries
                        $entries[] = $current;
                    } elseif (!empty($current['msgstr'])) {
                        $entries[] = $current;
                    }
                    $current = null;
                    $type = null;
                }
                continue;
            }

            // Parse msgid
            if (strpos($line, 'msgid ') === 0) {
                if ($current !== null && isset($current['msgid']) && isset($current['msgstr'])) {
                    if (!isset($current['msgid_plural']) && !empty($current['msgstr'])) {
                        $entries[] = $current;
                    }
                }
                $current = ['msgid' => $this->extract_string($line), 'msgstr' => ''];
                $type = 'msgid';
                continue;
            }

            // Parse msgid_plural
            if (strpos($line, 'msgid_plural ') === 0) {
                $current['msgid_plural'] = $this->extract_string($line);
                $current['msgstr'] = [];
                $type = 'msgid_plural';
                continue;
            }

            // Parse msgstr (singular)
            if (strpos($line, 'msgstr ') === 0) {
                if (!isset($current['msgid_plural'])) {
                    $current['msgstr'] = $this->extract_string($line);
                    $type = 'msgstr';
                }
                continue;
            }

            // Parse msgstr[n] (plural forms)
            if (preg_match('/^msgstr\[(\d+)\]\s+"(.*)"\s*$/', $line, $matches)) {
                $index = (int)$matches[1];
                $current['msgstr'][$index] = $this->unescape_string($matches[2]);
                $type = 'msgstr';
                continue;
            }

            // Continue multiline string
            if ($line[0] === '"' && $type !== null) {
                $string = $this->extract_string($line);
                if ($type === 'msgid') {
                    $current['msgid'] .= $string;
                } elseif ($type === 'msgid_plural') {
                    $current['msgid_plural'] .= $string;
                } elseif ($type === 'msgstr') {
                    if (is_array($current['msgstr'])) {
                        // Append to last plural form
                        end($current['msgstr']);
                        $key = key($current['msgstr']);
                        $current['msgstr'][$key] .= $string;
                    } else {
                        $current['msgstr'] .= $string;
                    }
                }
            }
        }

        // Add last entry
        if ($current !== null && isset($current['msgid']) && isset($current['msgstr'])) {
            if (!isset($current['msgid_plural']) && !empty($current['msgstr'])) {
                $entries[] = $current;
            } elseif (isset($current['msgid_plural'])) {
                $entries[] = $current;
            }
        }

        return $entries;
    }

    private function extract_string($line) {
        // Remove msgid/msgstr prefix and extract quoted string
        if (preg_match('/"(.*)"\s*$/', $line, $matches)) {
            return $this->unescape_string($matches[1]);
        }
        return '';
    }

    private function unescape_string($str) {
        // Unescape standard escape sequences
        $str = str_replace('\"', '"', $str);
        $str = str_replace('\\n', "\n", $str);
        $str = str_replace('\\t', "\t", $str);
        $str = str_replace('\\r', "\r", $str);
        $str = str_replace('\\\\', '\\', $str);
        return $str;
    }

    private function write_mo($entries) {
        // MO file format: https://www.gnu.org/software/gettext/manual/html_node/MO-Files.html

        $originals = [];
        $translations = [];

        foreach ($entries as $entry) {
            if (isset($entry['msgid_plural'])) {
                // Plural form: join with \0
                $original = $entry['msgid'] . "\0" . $entry['msgid_plural'];
                $translation = implode("\0", $entry['msgstr']);
            } else {
                $original = $entry['msgid'];
                $translation = $entry['msgstr'];
            }

            if (!empty($original) && !empty($translation)) {
                $originals[] = $original;
                $translations[] = $translation;
            }
        }

        // Build MO file structure
        $count = count($originals);

        // Magic number (little endian)
        $mo = pack('V', 0x950412de);

        // Format revision
        $mo .= pack('V', 0);

        // Number of strings
        $mo .= pack('V', $count);

        // Offset of table with original strings
        $mo .= pack('V', 28);

        // Offset of table with translation strings
        $mo .= pack('V', 28 + $count * 8);

        // Hash table size (we use 0 for no hash table)
        $mo .= pack('V', 0);

        // Offset of hash table (we use 0)
        $mo .= pack('V', 0);

        // Calculate string offsets
        $original_offset = 28 + $count * 8 + $count * 8;
        $translation_offset = $original_offset;

        foreach ($originals as $str) {
            $translation_offset += strlen($str) + 1; // +1 for null terminator
        }

        // Build tables
        $original_table = '';
        $translation_table = '';
        $original_strings = '';
        $translation_strings = '';

        $current_original_offset = $original_offset;
        $current_translation_offset = $translation_offset;

        for ($i = 0; $i < $count; $i++) {
            // Original string table entry
            $original_table .= pack('V', strlen($originals[$i]));
            $original_table .= pack('V', $current_original_offset);
            $current_original_offset += strlen($originals[$i]) + 1;

            // Translation string table entry
            $translation_table .= pack('V', strlen($translations[$i]));
            $translation_table .= pack('V', $current_translation_offset);
            $current_translation_offset += strlen($translations[$i]) + 1;

            // Strings (null-terminated)
            $original_strings .= $originals[$i] . "\0";
            $translation_strings .= $translations[$i] . "\0";
        }

        // Concatenate everything
        $mo .= $original_table;
        $mo .= $translation_table;
        $mo .= $original_strings;
        $mo .= $translation_strings;

        // Write to file
        if (file_put_contents($this->mo_file, $mo) === false) {
            throw new Exception("Failed to write MO file: {$this->mo_file}");
        }

        return true;
    }
}

// Main execution
try {
    $languages_dir = __DIR__ . '/../languages';

    // Check if specific locale provided
    $locale = isset($argv[1]) ? $argv[1] : null;

    if ($locale) {
        // Compile specific locale
        $po_file = $languages_dir . '/typography-stylist-' . $locale . '.po';

        if (!file_exists($po_file)) {
            echo "Error: PO file not found: {$po_file}\n";
            exit(1);
        }

        echo "Compiling {$locale}...\n";
        $compiler = new PO_to_MO_Compiler($po_file);
        $compiler->compile();
        echo "✓ Compiled: " . basename($po_file) . " → " . str_replace('.po', '.mo', basename($po_file)) . "\n";

    } else {
        // Compile all PO files
        $po_files = glob($languages_dir . '/*.po');

        if (empty($po_files)) {
            echo "No PO files found in {$languages_dir}\n";
            exit(0);
        }

        echo "Found " . count($po_files) . " PO file(s) to compile\n\n";

        foreach ($po_files as $po_file) {
            echo "Compiling " . basename($po_file) . "...\n";
            $compiler = new PO_to_MO_Compiler($po_file);
            $compiler->compile();
            echo "✓ Compiled: " . basename($po_file) . " → " . str_replace('.po', '.mo', basename($po_file)) . "\n";
        }
    }

    echo "\n✓ All translations compiled successfully!\n";

} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}

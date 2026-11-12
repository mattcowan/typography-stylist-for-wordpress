<?php
/**
 * The styles an export adds, as the server adds them (#358).
 *
 * The Export & Import tab announces the added styles before the export with
 * addedParents() in assets/js/admin-export.js; the server adds them in
 * Typost_PS_Transfer::export(). Both read
 * paragraph-styles/__tests__/fixtures/export-added-styles.json (the Jest
 * reader is assets/js/__tests__/admin-export-added-styles.test.js).
 */

namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\ExportTestCase;

class ParagraphStylesExportAddedStylesTest extends ExportTestCase {

    public function fixtureCases() {
        $json  = file_get_contents(TYPOST_PLUGIN_DIR . '/paragraph-styles/__tests__/fixtures/export-added-styles.json');
        $cases = array();
        foreach (json_decode($json, true)['cases'] as $case) {
            $cases[$case['label']] = array($case['styles'], $case['items'], $case['server'], $case['client'], 0 === strpos($case['label'], 'differs:'));
        }
        return $cases;
    }

    /**
     * @dataProvider fixtureCases
     */
    public function test_the_client_side_in_the_fixture_matches_unless_the_case_differs($styles, $items, $notes, $client, $differs) {
        // What the server would note for the pairs the client announces
        $from_client = array_map(function ($pair) {
            return '“' . $pair[0] . '” was added because “' . $pair[1] . '” is based on it.';
        }, $client);
        if ($differs) {
            $this->assertNotSame($notes, $from_client, 'A differs: case whose two sides agree has a stale label.');
        } else {
            $this->assertSame($notes, $from_client);
        }
    }

    /**
     * @dataProvider fixtureCases
     */
    public function test_the_server_adds_what_the_fixture_says($styles, $items, $notes) {
        foreach ($styles as &$style) {
            $style += array('properties' => array());
        }
        unset($style);
        $result = $this->exportWith(
            $this->module($styles, 100),
            array('sections' => array('paragraphStyles'), 'sectionArgs' => array('paragraphStyles' => array('items' => $items)))
        );
        $this->assertSame($notes, $result['notes']);
    }

    public function test_the_fixture_is_read() {
        // A control: an empty provider would let every case above pass by
        // never running.
        $this->assertGreaterThanOrEqual(5, count($this->fixtureCases()));
    }
}

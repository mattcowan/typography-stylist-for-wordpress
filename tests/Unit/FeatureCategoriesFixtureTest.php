<?php
/**
 * The feature categories the server sends (#358).
 *
 * Both copies of getCategoryTitle() (the block's feature-categories.js and
 * the inline editor's feature-options.js) must have a title for every
 * category in includes/available-features.php. The Jest side reads
 * tests/fixtures/feature-categories.json; this test holds the PHP data to
 * the same list.
 */

namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;

class FeatureCategoriesFixtureTest extends TestCase {

    public function test_the_php_feature_list_uses_exactly_the_fixture_categories() {
        $features   = require TYPOST_PLUGIN_DIR . '/includes/available-features.php';
        $categories = array();
        foreach ($features as $feature) {
            $categories[$feature['category']] = true;
        }

        $fixture = json_decode(file_get_contents(TYPOST_PLUGIN_DIR . '/tests/fixtures/feature-categories.json'), true);
        $this->assertNotEmpty($fixture['categories']);

        // Compared as sets: getCategoryTitle() maps one category at a time,
        // and the editors group features in the order typostData sends them,
        // not in the fixture's order.
        $expected = $fixture['categories'];
        $actual   = array_keys($categories);
        sort($expected);
        sort($actual);
        $this->assertSame($expected, $actual);
    }
}

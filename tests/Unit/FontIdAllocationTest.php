<?php
namespace TypographyStylist\Tests\Unit;

use TypographyStylist\Tests\TestCase;
use Brain\Monkey\Functions;

/**
 * Tests for Typost_Font_Sources: font ID allocation, replacement
 * resolution, active-ID collection, and runtime caching.
 */
class FontIdAllocationTest extends TestCase {

    /** @var array Simulated wp_options storage */
    private $options;

    protected function setUp(): void {
        parent::setUp();

        static $loaded = false;
        if (!$loaded) {
            require_once TYPOST_PLUGIN_DIR . '/includes/class-typost-font-sources.php';
            $loaded = true;
        }

        $this->options = [];
        $options = &$this->options;

        Functions\when('get_option')->alias(function ($key, $default = false) use (&$options) {
            return array_key_exists($key, $options) ? $options[$key] : $default;
        });
        Functions\when('update_option')->alias(function ($key, $value) use (&$options) {
            $options[$key] = $value;
            return true;
        });
    }

    private function sources() {
        return new \Typost_Font_Sources();
    }

    public function test_font_ids_allocate_sequentially_from_one() {
        $sources = $this->sources();

        $this->assertSame(1, $sources->generate_font_id());
        $this->assertSame(2, $sources->generate_font_id());
        $this->assertSame(3, $sources->generate_font_id());
        $this->assertSame(4, $this->options['typost_font_replacements']['next_id']);
    }

    public function test_allocation_resumes_from_persisted_next_id() {
        $this->options['typost_font_replacements'] = [
            'mappings'    => [],
            'global_load' => [],
            'next_id'     => 42,
        ];

        $sources = $this->sources();
        $this->assertSame(42, $sources->generate_font_id());
        $this->assertSame(43, $this->options['typost_font_replacements']['next_id']);
    }

    public function test_allocation_preserves_existing_mappings() {
        $this->options['typost_font_replacements'] = [
            'mappings'    => [16 => 29],
            'global_load' => [16],
            'next_id'     => 30,
        ];

        $sources = $this->sources();
        $sources->generate_font_id();

        $this->assertSame([16 => 29], $this->options['typost_font_replacements']['mappings']);
        $this->assertSame([16], $this->options['typost_font_replacements']['global_load']);
    }

    public function test_ids_are_never_reused() {
        $sources = $this->sources();
        $seen = [];
        for ($i = 0; $i < 20; $i++) {
            $id = $sources->generate_font_id();
            $this->assertNotContains($id, $seen, "Font ID {$id} was allocated twice");
            $seen[] = $id;
        }
    }

    public function test_resolve_replacements_passthrough_without_mappings() {
        $sources = $this->sources();
        $this->assertSame([5, 9], $sources->resolve_used_font_replacements([5, 9]));
    }

    public function test_resolve_replacements_expands_chain_targets() {
        $this->options['typost_font_replacements'] = [
            'mappings'    => [16 => 29],
            'global_load' => [],
            'next_id'     => 30,
        ];

        $sources = $this->sources();
        $resolved = array_values($sources->resolve_used_font_replacements([16, 32]));
        $this->assertSame([16, 29, 32], $resolved);
    }

    public function test_get_all_active_font_ids_spans_all_sources() {
        $this->options['typost_custom_fonts'] = [
            ['id' => 'kit-1-inter', 'font_id' => 1],
            ['id' => 'kit-1-lora', 'font_id' => 2],
        ];
        $this->options['typost_adobe_fonts'] = [
            ['id' => 'adobe-abc-freight', 'font_id' => 3],
        ];
        $this->options['typost_manual_fonts'] = [
            ['id' => 'manual-system-123', 'font_id' => 4],
        ];

        $sources = $this->sources();
        $this->assertSame([1, 2, 3, 4], $sources->get_all_active_font_ids());
    }

    public function test_custom_fonts_are_cached_until_cleared() {
        $this->options['typost_custom_fonts'] = [['id' => 'kit-1-inter', 'font_id' => 1]];

        $sources = $this->sources();
        $first = $sources->get_custom_fonts();

        // Mutate underlying storage; cached value should be returned
        $this->options['typost_custom_fonts'] = [];
        $this->assertSame($first, $sources->get_custom_fonts());

        // After clearing the runtime cache, the fresh value is read
        $sources->clear_runtime_cache();
        $this->assertSame([], $sources->get_custom_fonts());
    }

    public function test_save_font_replacements_updates_cache_and_option() {
        $sources = $this->sources();
        $data = ['mappings' => [1 => 2], 'global_load' => [], 'next_id' => 3];

        $sources->save_font_replacements($data);

        $this->assertSame($data, $this->options['typost_font_replacements']);
        $this->assertSame($data, $sources->get_font_replacements());
    }
}

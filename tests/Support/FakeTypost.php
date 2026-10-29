<?php
namespace TypographyStylist\Tests\Support;

/**
 * The part of Typost's public API the export and import code reads (#205),
 * backed by plain arrays so a test can describe a site's fonts.
 */
class FakeTypost {

    /** @var array Uploaded kit entries */
    public $custom = array();

    /** @var array Adobe Fonts entries */
    public $adobe = array();

    /** @var array Manual font definitions */
    public $manual = array();

    /** @var array Adopted Font Library entries */
    public $adopted = array();

    /** @var array Font Library families, {slug, name, font_family} */
    public $library = array();

    /** @var array Deleted font ID => replacement font ID */
    public $mappings = array();

    /** @var array Font ID => {disabled_features} */
    public $visibility = array();

    /** @var int Next font ID to allocate */
    public $next_font_id = 100;

    /** @var string[] Extension checkbox options (the bundled modules register these two) */
    public $extension_options = array('typost_glyphs_toolbar_button', 'typost_ps_toolbar_button');

    /** @var bool Whether the WordPress Font Library is available */
    public $library_available = true;

    /** @var int How often clear_cache() ran */
    public $cache_cleared = 0;

    public function get_extension_option_checkboxes() {
        return $this->extension_options;
    }

    public function get_available_features() {
        return array_map(function ($id) {
            return array('id' => $id);
        }, array('liga', 'dlig', 'calt', 'swsh', 'salt', 'ss01', 'ss02', 'ss15', 'smcp', 'ornm'));
    }

    public function clear_caches() {
        $this->cache_cleared++;
    }

    // Typost's own clear_cache() and invalidate_editor_data_cache() are
    // private: the double has them private too, so code that calls them
    // from outside fails here as it does on a real site.
    private function clear_cache() {
    }

    private function invalidate_editor_data_cache() {
    }

    public function get_custom_fonts() {
        return $this->custom;
    }

    public function get_adobe_fonts() {
        return $this->adobe;
    }

    public function get_manual_fonts() {
        return $this->manual;
    }

    public function get_font_feature_visibility() {
        return $this->visibility;
    }

    public function check_permissions($request = null) {
        return true;
    }

    public function clear_font_detection_cache() {
    }

    public function get_adopted_wp_fonts_by_slug() {
        $out = array();
        foreach ($this->adopted as $font) {
            $out[$font['wp_slug']] = $font;
        }
        return $out;
    }

    public function font_sources() {
        $site = $this;
        return new class($site) {
            private $site;
            public function __construct($site) {
                $this->site = $site;
            }
            public function get_adopted_wp_fonts() {
                return $this->site->adopted;
            }
            public function get_font_replacements() {
                return array('mappings' => $this->site->mappings, 'global_load' => array(), 'next_id' => $this->site->next_font_id);
            }
        };
    }

    public function font_library_bridge() {
        $site = $this;
        return new class($site) {
            private $site;
            public function __construct($site) {
                $this->site = $site;
            }
            public function is_available() {
                return $this->site->library_available;
            }
            public function get_wp_font_library_fonts() {
                return $this->site->library;
            }
            public function adopt_library_font($slug) {
                foreach ($this->site->library as $family) {
                    if ($family['slug'] === $slug) {
                        $entry = array(
                            'id'          => 'wpl-' . $slug,
                            'name'        => $family['name'],
                            'wp_slug'     => $slug,
                            'font_id'     => $this->site->next_font_id++,
                            'font_family' => $family['font_family'],
                        );
                        $this->site->adopted[] = $entry;
                        return $entry;
                    }
                }
                return false;
            }
        };
    }

    public function add_adobe_font_entry($descriptor) {
        $entry = array(
            'id'          => 'adobe-' . $descriptor['kit'] . '-' . strtolower($descriptor['family']),
            'name'        => $descriptor['family'],
            'font_id'     => $this->next_font_id++,
            'font_family' => $descriptor['family'],
            'kit_id'      => 'adobe-' . $descriptor['kit'],
            'kit_name'    => $descriptor['kitName'],
            'css_url'     => $descriptor['cssUrl'],
        );
        $this->adobe[] = $entry;
        return $entry;
    }

    public function add_manual_font_entry($descriptor) {
        $entry = array(
            'id'          => 'manual-' . strtolower($descriptor['name']),
            'name'        => $descriptor['name'],
            'font_id'     => $this->next_font_id++,
            'font_family' => '' !== $descriptor['fontFamily'] ? $descriptor['fontFamily'] : $descriptor['family'],
            'fallbacks'   => $descriptor['fallbacks'],
        );
        $this->manual[] = $entry;
        return $entry;
    }
}

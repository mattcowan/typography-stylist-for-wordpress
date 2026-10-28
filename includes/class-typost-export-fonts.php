<?php
/**
 * Fonts in export files (#205)
 *
 * A style stores a numeric font ID that only means something on the site
 * that allocated it. An export file names each font by a descriptor
 * instead (source, family, Adobe project, Library slug, name), and import
 * maps each descriptor to a font on the receiving site, or adds it when the
 * file carries enough to do so (an Adobe Fonts project, a font definition).
 *
 * One instance serves one export or one import: export hands out file keys
 * (f1, f2, ...) for the font IDs the sections reference, import resolves
 * file keys back to local font IDs once the author's choices are committed.
 *
 * Consumes only Typost's public API, so the paragraph styles module and
 * extensions can rely on the same object.
 *
 * @since 2.3.5
 */

if (!defined('ABSPATH')) {
    exit;
}

class Typost_Export_Fonts {

    /** @var string Adobe Fonts stylesheet URL with the project ID captured */
    const ADOBE_CSS_URL_PATTERN = '/^https:\/\/use\.typekit\.net\/([a-z0-9]+)\.css$/';

    /** @var object Typost instance (or a test double with the same public API) */
    private $typost;

    /** @var array<int,string> Local font ID => file key, filled by export */
    private $export_keys = array();

    /** @var array<string,array> File key => descriptor, filled by export */
    private $descriptors = array();

    /** @var array<string,int> File key => local font ID, filled by import */
    private $import_ids = array();

    /** @var array|null Memoized local font list */
    private $local_fonts = null;

    /**
     * @param object $typost Typost instance.
     */
    public function __construct($typost) {
        $this->typost = $typost;
    }

    // -------------------------------------------------------------------------
    // Export
    // -------------------------------------------------------------------------

    /**
     * The file key for a local font ID, adding its descriptor to the file.
     *
     * A deleted font is followed through the replacement chain first, so
     * the file names the font the style renders in. Returns null when the
     * ID names no font (deleted with no replacement): the section then
     * writes no font.
     *
     * @param int $font_id Local font ID.
     * @return string|null
     */
    public function key_for_font_id($font_id) {
        $font_id = $this->resolve_replacement(absint($font_id));
        if (0 === $font_id) {
            return null;
        }
        if (isset($this->export_keys[$font_id])) {
            return $this->export_keys[$font_id];
        }
        foreach ($this->get_local_fonts() as $font) {
            if (isset($font['font_id']) && $font['font_id'] === $font_id) {
                $key = 'f' . (count($this->descriptors) + 1);
                $this->export_keys[$font_id] = $key;
                $this->descriptors[$key] = $font['descriptor'];
                return $key;
            }
        }
        return null;
    }

    /**
     * Add every font on this site to the file (the "All fonts" choice), so
     * Adobe Fonts projects and font definitions no style uses still travel.
     */
    public function add_all_fonts() {
        foreach ($this->get_local_fonts() as $font) {
            if (isset($font['font_id'])) {
                $this->key_for_font_id($font['font_id']);
            }
        }
    }

    /**
     * Descriptors added so far, keyed by file key.
     *
     * @return array<string,array>
     */
    public function get_descriptors() {
        return $this->descriptors;
    }

    /**
     * Follow the replacement chain of a deleted font ID.
     *
     * Same walk as Typost_Paragraph_Styles::resolve_font_label(): stops at
     * an ID that exists, and at a loop.
     *
     * @param int $font_id Font ID.
     * @return int The ID that exists, or 0.
     */
    private function resolve_replacement($font_id) {
        if (0 === $font_id) {
            return 0;
        }
        $known = array();
        foreach ($this->get_local_fonts() as $font) {
            if (isset($font['font_id'])) {
                $known[$font['font_id']] = true;
            }
        }
        $mappings = array();
        if (method_exists($this->typost, 'font_sources')) {
            $replacements = $this->typost->font_sources()->get_font_replacements();
            if (isset($replacements['mappings']) && is_array($replacements['mappings'])) {
                $mappings = $replacements['mappings'];
            }
        }
        $visited = array();
        $current = $font_id;
        while (!isset($known[$current])) {
            if (!isset($mappings[$current]) || isset($visited[$current])) {
                return 0;
            }
            $visited[$current] = true;
            $current = absint($mappings[$current]);
        }
        return $current;
    }

    // -------------------------------------------------------------------------
    // The fonts on this site
    // -------------------------------------------------------------------------

    /**
     * Every font on this site, each with the fields matching reads.
     *
     * Entries: {value, font_id (absent for a Library font not adopted yet),
     * source, name, family (normalized), slug, kit, descriptor}. `value` is
     * what the import choices name: "id:{font_id}", or "wpl:{slug}" for a
     * Library font that import would adopt.
     *
     * @return array[]
     */
    public function get_local_fonts() {
        if (null !== $this->local_fonts) {
            return $this->local_fonts;
        }
        $fonts = array();
        $slugs = array();

        foreach ((array) $this->typost->get_custom_fonts() as $entry) {
            if (!is_array($entry) || !isset($entry['font_id'])) {
                continue;
            }
            $family = !empty($entry['font_faces'][0]['family']) ? $entry['font_faces'][0]['family'] : (isset($entry['name']) ? $entry['name'] : '');
            $slug = !empty($entry['wp_slug']) ? (string) $entry['wp_slug'] : '';
            $fonts[] = $this->local_font('kit', $entry, $family, $slug, '', array(
                'source'    => 'kit',
                'name'      => isset($entry['name']) ? (string) $entry['name'] : '',
                'family'    => self::first_family($family),
                'slug'      => $slug,
                'fallbacks' => isset($entry['fallbacks']) ? (string) $entry['fallbacks'] : '',
            ));
            if ('' !== $slug) {
                $slugs[$slug] = true;
            }
        }

        foreach ((array) $this->typost->get_adobe_fonts() as $entry) {
            if (!is_array($entry) || !isset($entry['font_id'])) {
                continue;
            }
            $family = isset($entry['font_family']) ? (string) $entry['font_family'] : '';
            $kit = self::adobe_kit_from_entry($entry);
            $descriptor = array(
                'source'  => 'adobe',
                'name'    => isset($entry['name']) ? (string) $entry['name'] : $family,
                'family'  => self::first_family($family),
                'kit'     => $kit,
                'kitName' => isset($entry['kit_name']) ? (string) $entry['kit_name'] : '',
                'cssUrl'  => isset($entry['css_url']) ? (string) $entry['css_url'] : '',
            );
            if (!empty($entry['available_weights']) && is_array($entry['available_weights'])) {
                $descriptor['availableWeights'] = array_values($entry['available_weights']);
            }
            $fonts[] = $this->local_font('adobe', $entry, $family, '', $kit, $descriptor);
        }

        foreach ((array) $this->typost->get_manual_fonts() as $entry) {
            if (!is_array($entry) || !isset($entry['font_id'])) {
                continue;
            }
            $family = isset($entry['font_family']) ? (string) $entry['font_family'] : '';
            $fonts[] = $this->local_font('manual', $entry, $family, '', '', array(
                'source'     => 'manual',
                'name'       => isset($entry['name']) ? (string) $entry['name'] : $family,
                'family'     => self::first_family($family),
                'fontFamily' => $family,
                'fallbacks'  => isset($entry['fallbacks']) ? (string) $entry['fallbacks'] : '',
            ));
        }

        $adopted = array();
        if (method_exists($this->typost, 'font_sources')) {
            $adopted = (array) $this->typost->font_sources()->get_adopted_wp_fonts();
        }
        foreach ($adopted as $entry) {
            if (!is_array($entry) || !isset($entry['font_id'])) {
                continue;
            }
            $family = isset($entry['font_family']) ? (string) $entry['font_family'] : '';
            $slug = isset($entry['wp_slug']) ? (string) $entry['wp_slug'] : '';
            $fonts[] = $this->local_font('library', $entry, $family, $slug, '', array(
                'source' => 'library',
                'name'   => isset($entry['name']) ? (string) $entry['name'] : $family,
                'family' => self::first_family($family),
                'slug'   => $slug,
            ));
            if ('' !== $slug) {
                $slugs[$slug] = true;
            }
        }

        // Library fonts no one adopted yet: import can adopt them, which
        // allocates a font ID then. A slug already known above is the same
        // font, so it is listed once.
        foreach ($this->library_snapshot() as $family_entry) {
            $slug = isset($family_entry['slug']) ? (string) $family_entry['slug'] : '';
            if ('' === $slug || isset($slugs[$slug])) {
                continue;
            }
            $slugs[$slug] = true;
            $family = isset($family_entry['font_family']) ? (string) $family_entry['font_family'] : '';
            $name = isset($family_entry['name']) ? (string) $family_entry['name'] : $family;
            $fonts[] = array(
                'value'      => 'wpl:' . $slug,
                'source'     => 'library',
                'name'       => $name,
                'family'     => self::normalize_family($family),
                'slug'       => $slug,
                'kit'        => '',
                'descriptor' => array(
                    'source' => 'library',
                    'name'   => $name,
                    'family' => self::first_family($family),
                    'slug'   => $slug,
                ),
            );
        }

        $this->local_fonts = $fonts;
        return $fonts;
    }

    /**
     * One entry of get_local_fonts() for a font that has an ID.
     */
    private function local_font($source, $entry, $family, $slug, $kit, $descriptor) {
        $font_id = absint($entry['font_id']);
        return array(
            'value'      => 'id:' . $font_id,
            'font_id'    => $font_id,
            'source'     => $source,
            'name'       => isset($entry['name']) ? (string) $entry['name'] : $family,
            'family'     => self::normalize_family($family),
            'slug'       => $slug,
            'kit'        => $kit,
            'descriptor' => $descriptor,
        );
    }

    /**
     * Font Library families (WP 6.5+), empty where the Library is missing.
     *
     * @return array[]
     */
    private function library_snapshot() {
        if (!method_exists($this->typost, 'font_library_bridge')) {
            return array();
        }
        $bridge = $this->typost->font_library_bridge();
        if (method_exists($bridge, 'is_available') && !$bridge->is_available()) {
            return array();
        }
        return (array) $bridge->get_wp_font_library_fonts();
    }

    /**
     * Forget the memoized local font list (after import added fonts).
     */
    public function reset_local_fonts() {
        $this->local_fonts = null;
    }

    // -------------------------------------------------------------------------
    // Matching
    // -------------------------------------------------------------------------

    /**
     * The first family of a CSS font-family value, without quotes.
     *
     * "\"EB Garamond\", serif" gives EB Garamond. Family names never hold a
     * comma in practice, so the first comma ends the family.
     *
     * @param string $value font-family value or family name.
     * @return string
     */
    public static function first_family($value) {
        $value = (string) $value;
        $comma = strpos($value, ',');
        if (false !== $comma) {
            $value = substr($value, 0, $comma);
        }
        return trim(trim($value), "\"' ");
    }

    /**
     * A family or display name in the form matching compares.
     *
     * @param string $value Family, font-family value or name.
     * @return string
     */
    public static function normalize_family($value) {
        $value = self::first_family($value);
        return function_exists('mb_strtolower') ? mb_strtolower($value, 'UTF-8') : strtolower($value);
    }

    /**
     * The Adobe Fonts project ID of an Adobe entry, without the "adobe-"
     * prefix the plugin stores.
     *
     * @param array $entry Adobe font entry.
     * @return string
     */
    private static function adobe_kit_from_entry($entry) {
        if (!empty($entry['css_url']) && preg_match(self::ADOBE_CSS_URL_PATTERN, (string) $entry['css_url'], $m)) {
            return strtolower($m[1]);
        }
        $kit = isset($entry['kit_id']) ? (string) $entry['kit_id'] : '';
        return strtolower(0 === strpos($kit, 'adobe-') ? substr($kit, 6) : $kit);
    }

    /**
     * Read a descriptor from a file into the fields matching uses.
     *
     * Values are sanitized here; anything else in the descriptor is ignored.
     *
     * @param mixed $raw Descriptor from the file.
     * @return array|null Null when it is not an object with a name or family.
     */
    public static function sanitize_descriptor($raw) {
        if (!is_array($raw)) {
            return null;
        }
        $text = function ($key) use ($raw) {
            return isset($raw[$key]) && is_scalar($raw[$key]) ? trim(sanitize_text_field((string) $raw[$key])) : '';
        };
        $source = $text('source');
        $descriptor = array(
            'source'     => in_array($source, array('kit', 'adobe', 'manual', 'library'), true) ? $source : '',
            'name'       => $text('name'),
            'family'     => self::first_family($text('family')),
            'slug'       => sanitize_title($text('slug')),
            'kit'        => strtolower(preg_replace('/[^a-z0-9]/i', '', $text('kit'))),
            'kitName'    => $text('kitName'),
            'cssUrl'     => '',
            'fontFamily' => $text('fontFamily'),
            'fallbacks'  => $text('fallbacks'),
        );
        $css_url = $text('cssUrl');
        if (preg_match(self::ADOBE_CSS_URL_PATTERN, $css_url, $m) && strtolower($m[1]) === $descriptor['kit']) {
            $descriptor['cssUrl'] = $css_url;
        }
        if (isset($raw['availableWeights']) && is_array($raw['availableWeights'])) {
            $weights = array();
            foreach ($raw['availableWeights'] as $weight) {
                // Strings, as the font entries store them ('400').
                if (is_numeric($weight) && (int) $weight >= 1 && (int) $weight <= 1000) {
                    $weights[] = (string) (int) $weight;
                }
            }
            if ($weights) {
                $descriptor['availableWeights'] = array_values(array_unique($weights));
            }
        }
        if ('' === $descriptor['family'] && '' === $descriptor['name']) {
            return null;
        }
        return $descriptor;
    }

    /**
     * Match one descriptor against the fonts on this site.
     *
     * The steps run in order, and the first step that finds any font
     * decides: Adobe project and family, then Library slug and family
     * (slugs can carry a -2 suffix, so the family must agree too), then
     * family name, then display name, both case-insensitive. One font is
     * "found"; more than one is "ambiguous", and the author picks — import
     * never guesses. With no match, an Adobe Fonts project or a font
     * definition can be added from the file ("addable"); anything else is
     * "not_found".
     *
     * @param array   $descriptor  Sanitized descriptor.
     * @param array[] $local_fonts get_local_fonts().
     * @return array {status, candidates: string[] (local `value`s)}
     */
    public static function match_descriptor($descriptor, $local_fonts) {
        $family = self::normalize_family($descriptor['family']);
        $name = self::normalize_family($descriptor['name']);
        $steps = array(
            function ($font) use ($descriptor, $family) {
                return '' !== $descriptor['kit'] && 'adobe' === $font['source'] && $font['kit'] === $descriptor['kit'] && $font['family'] === $family;
            },
            function ($font) use ($descriptor, $family) {
                return '' !== $descriptor['slug'] && $font['slug'] === $descriptor['slug'] && $font['family'] === $family;
            },
            function ($font) use ($family) {
                return '' !== $family && $font['family'] === $family;
            },
            function ($font) use ($name) {
                return '' !== $name && self::normalize_family($font['name']) === $name;
            },
        );
        foreach ($steps as $step) {
            $candidates = array();
            foreach ($local_fonts as $font) {
                if ($step($font)) {
                    $candidates[$font['value']] = true;
                }
            }
            if ($candidates) {
                return array(
                    'status'     => 1 === count($candidates) ? 'found' : 'ambiguous',
                    'candidates' => array_keys($candidates),
                );
            }
        }
        return array(
            'status'     => self::can_add($descriptor) ? 'addable' : 'not_found',
            'candidates' => array(),
        );
    }

    /**
     * Whether import can add this font from the file alone.
     *
     * An Adobe Fonts project needs its stylesheet URL and the family; a
     * font definition needs its family. Uploaded kits and Library fonts
     * need files the file does not carry.
     *
     * @param array $descriptor Sanitized descriptor.
     * @return bool
     */
    public static function can_add($descriptor) {
        if ('adobe' === $descriptor['source']) {
            return '' !== $descriptor['cssUrl'] && '' !== $descriptor['family'];
        }
        if ('manual' === $descriptor['source']) {
            return '' !== $descriptor['family'] && '' !== $descriptor['name'];
        }
        return false;
    }

    // -------------------------------------------------------------------------
    // Import
    // -------------------------------------------------------------------------

    /**
     * Read the file's font map: sanitized descriptors keyed by file key.
     *
     * @param mixed $raw The file's `fonts` value.
     * @return array<string,array>|WP_Error
     */
    public static function read_file_fonts($raw) {
        if (null === $raw) {
            return array();
        }
        if (!is_array($raw)) {
            return new WP_Error('typost_import_invalid_file', __('The fonts in this file cannot be read.', 'typography-stylist'), array('status' => 400));
        }
        $fonts = array();
        foreach ($raw as $key => $descriptor) {
            $key = (string) $key;
            $clean = self::sanitize_descriptor($descriptor);
            if (!preg_match('/^[a-z0-9_-]{1,40}$/i', $key) || null === $clean) {
                return new WP_Error('typost_import_invalid_file', __('The fonts in this file cannot be read.', 'typography-stylist'), array('status' => 400));
            }
            $fonts[$key] = $clean;
        }
        return $fonts;
    }

    /**
     * The preview of each font in the file.
     *
     * @param array<string,array> $descriptors read_file_fonts().
     * @return array[] One row per font: {key, name, family, source, status,
     *                 candidates: [{value, label}], choice}.
     */
    public function preview($descriptors) {
        $local = $this->get_local_fonts();
        $by_value = array();
        foreach ($local as $font) {
            $by_value[$font['value']] = $font;
        }
        $rows = array();
        foreach ($descriptors as $key => $descriptor) {
            $match = self::match_descriptor($descriptor, $local);
            $candidates = array();
            foreach ($match['candidates'] as $value) {
                $candidates[] = array('value' => $value, 'label' => self::local_font_label($by_value[$value]));
            }
            $rows[] = array(
                'key'        => (string) $key,
                'name'       => '' !== $descriptor['name'] ? $descriptor['name'] : $descriptor['family'],
                'family'     => $descriptor['family'],
                'source'     => $descriptor['source'],
                'status'     => $match['status'],
                'candidates' => $candidates,
                'choice'     => self::default_choice($match),
            );
        }
        return $rows;
    }

    /**
     * The label a candidate shows: its name, plus its source and family
     * when the family differs, so two candidates can be told apart.
     *
     * @param array $font get_local_fonts() entry.
     * @return string
     */
    private static function local_font_label($font) {
        $sources = array(
            'kit'     => __('uploaded', 'typography-stylist'),
            'adobe'   => __('Adobe Fonts', 'typography-stylist'),
            'manual'  => __('font definition', 'typography-stylist'),
            'library' => __('Font Library', 'typography-stylist'),
        );
        $source = isset($sources[$font['source']]) ? $sources[$font['source']] : $font['source'];
        $family = self::first_family($font['descriptor']['family']);
        if ('' !== $family && self::normalize_family($family) !== self::normalize_family($font['name'])) {
            /* translators: 1: font name, 2: font family, 3: where the font comes from (uploaded, Adobe Fonts, font definition, Font Library) */
            return sprintf(__('%1$s (%2$s, %3$s)', 'typography-stylist'), $font['name'], $family, $source);
        }
        /* translators: 1: font name, 2: where the font comes from (uploaded, Adobe Fonts, font definition, Font Library) */
        return sprintf(__('%1$s (%2$s)', 'typography-stylist'), $font['name'], $source);
    }

    /**
     * The choice the preview starts with: the one candidate, add, or none.
     * An ambiguous font starts with no target, so the author must pick.
     *
     * @param array $match match_descriptor() result.
     * @return array {action, target?}
     */
    private static function default_choice($match) {
        switch ($match['status']) {
            case 'found':
                return array('action' => 'map', 'target' => $match['candidates'][0]);
            case 'addable':
                return array('action' => 'add');
            case 'ambiguous':
                return array('action' => 'map', 'target' => '');
            default:
                return array('action' => 'none');
        }
    }

    /**
     * The preview's choice for every font in the file.
     *
     * @param array<string,array> $descriptors read_file_fonts().
     * @return array<string,array>
     */
    public function default_choices($descriptors) {
        $out = array();
        foreach ($descriptors as $key => $descriptor) {
            $out[$key] = self::default_choice(self::match_descriptor($descriptor, $this->get_local_fonts()));
        }
        return $out;
    }

    /**
     * Check the author's font choices against the file, without writing.
     *
     * A font without a choice takes the preview's default. "map" must name
     * a font on this site (any font, not only a candidate: the author can
     * correct a match), "add" needs a font the file can add, "none" leaves
     * the styles without the font.
     *
     * @param array<string,array> $descriptors read_file_fonts().
     * @param mixed               $choices     Choices keyed by file key.
     * @return array<string,array>|WP_Error Normalized choices for every key.
     */
    public function validate_choices($descriptors, $choices) {
        $choices = is_array($choices) ? $choices : array();
        $local = array();
        foreach ($this->get_local_fonts() as $font) {
            $local[$font['value']] = $font;
        }
        $out = array();
        foreach ($descriptors as $key => $descriptor) {
            $choice = isset($choices[$key]) && is_array($choices[$key]) ? $choices[$key] : self::default_choice(self::match_descriptor($descriptor, $this->get_local_fonts()));
            $action = isset($choice['action']) ? (string) $choice['action'] : '';
            $label = '' !== $descriptor['name'] ? $descriptor['name'] : $descriptor['family'];
            if ('map' === $action) {
                $target = isset($choice['target']) ? (string) $choice['target'] : '';
                if (!isset($local[$target])) {
                    return new WP_Error(
                        'typost_import_font_choice',
                        /* translators: %s: font name from the import file */
                        sprintf(__('Choose a font on this site for “%s”.', 'typography-stylist'), $label),
                        array('status' => 400, 'font' => $key)
                    );
                }
                $out[$key] = array('action' => 'map', 'target' => $target);
            } elseif ('add' === $action) {
                if (!self::can_add($descriptor)) {
                    return new WP_Error(
                        'typost_import_font_choice',
                        /* translators: %s: font name from the import file */
                        sprintf(__('“%s” cannot be added from this file. Its font files must be on this site first.', 'typography-stylist'), $label),
                        array('status' => 400, 'font' => $key)
                    );
                }
                $out[$key] = array('action' => 'add');
            } elseif ('none' === $action) {
                $out[$key] = array('action' => 'none');
            } else {
                return new WP_Error('typost_import_font_choice', __('A font choice in the request is not valid.', 'typography-stylist'), array('status' => 400, 'font' => $key));
            }
        }
        return $out;
    }

    /**
     * Set the file key => local font ID map without writing anything, for
     * a dry run: mapped fonts that exist resolve, everything else is 0.
     *
     * @param array<string,array> $choices validate_choices() result.
     */
    public function plan_import_ids($choices) {
        $this->import_ids = array();
        foreach ($choices as $key => $choice) {
            $this->import_ids[$key] = ('map' === $choice['action'] && 0 === strpos($choice['target'], 'id:'))
                ? absint(substr($choice['target'], 3))
                : 0;
        }
    }

    /**
     * Carry out the font choices: adopt Library fonts, add Adobe Fonts
     * projects and font definitions, and fill the key => font ID map.
     *
     * @param array<string,array> $descriptors read_file_fonts().
     * @param array<string,array> $choices     validate_choices() result.
     * @return array {added: string[], notFound: string[]} Font names.
     */
    public function commit($descriptors, $choices) {
        $this->plan_import_ids($choices);
        $added = array();
        $not_found = array();
        foreach ($choices as $key => $choice) {
            $descriptor = $descriptors[$key];
            $label = '' !== $descriptor['name'] ? $descriptor['name'] : $descriptor['family'];
            $font_id = 0;
            if ('map' === $choice['action'] && 0 === strpos($choice['target'], 'wpl:')) {
                $entry = $this->typost->font_library_bridge()->adopt_library_font(substr($choice['target'], 4));
                $font_id = is_array($entry) && isset($entry['font_id']) ? absint($entry['font_id']) : 0;
            } elseif ('map' === $choice['action']) {
                $font_id = $this->import_ids[$key];
            } elseif ('add' === $choice['action']) {
                $entry = 'adobe' === $descriptor['source']
                    ? $this->typost->add_adobe_font_entry($descriptor)
                    : $this->typost->add_manual_font_entry($descriptor);
                $font_id = is_array($entry) && isset($entry['font_id']) ? absint($entry['font_id']) : 0;
                if ($font_id) {
                    $added[] = $label;
                }
            }
            if (0 === $font_id) {
                $not_found[] = $label;
            }
            $this->import_ids[$key] = $font_id;
        }
        $this->reset_local_fonts();
        return array('added' => $added, 'notFound' => $not_found);
    }

    /**
     * The local font ID for a file key, 0 when the font is not on this site.
     *
     * @param mixed $key File key.
     * @return int
     */
    public function import_font_id($key) {
        $key = is_scalar($key) ? (string) $key : '';
        return isset($this->import_ids[$key]) ? $this->import_ids[$key] : 0;
    }

    // -------------------------------------------------------------------------
    // What a font on this site supports (import warnings)
    // -------------------------------------------------------------------------

    /**
     * The display name of a local font ID, '' when unknown.
     *
     * @param int $font_id Font ID.
     * @return string
     */
    public function font_name($font_id) {
        foreach ($this->get_local_fonts() as $font) {
            if (isset($font['font_id']) && $font['font_id'] === (int) $font_id) {
                return $font['name'];
            }
        }
        return '';
    }

    /**
     * OpenType features hidden for a font in Feature Visibility.
     *
     * @param int $font_id Font ID.
     * @return string[]
     */
    public function hidden_features($font_id) {
        if (!method_exists($this->typost, 'get_font_feature_visibility')) {
            return array();
        }
        $visibility = (array) $this->typost->get_font_feature_visibility();
        $font_id = (int) $font_id;
        if (isset($visibility[$font_id]['disabled_features']) && is_array($visibility[$font_id]['disabled_features'])) {
            return array_values(array_map('strval', $visibility[$font_id]['disabled_features']));
        }
        return array();
    }

    /**
     * Variable font axis tags defined for a font.
     *
     * @param int $font_id Font ID.
     * @return string[]|null Null when nothing on this site defines axes
     *                       (the Variable Fonts module is not loaded).
     */
    public function axis_tags($font_id) {
        /**
         * Filters the variable font axis tags defined for a font (#205).
         *
         * The bundled Variable Fonts module answers from its axis
         * definitions. Null means "unknown", and import then gives no axis
         * warning.
         *
         * @since 2.3.5
         * @param string[]|null $tags    Axis tags, such as array( 'wght', 'opsz' ).
         * @param int           $font_id Numeric font ID.
         */
        $tags = apply_filters('typost_font_axis_tags', null, (int) $font_id);
        return is_array($tags) ? array_values(array_map('strval', $tags)) : null;
    }
}

<?php
/**
 * Font source data access for Typography Stylist
 *
 * Owns the option-backed storage for the plugin's font sources (uploaded
 * webfont kits, Adobe Fonts, manual definitions), the shared numeric font ID
 * sequence, and the font-replacement mappings. Extracted from the Typost
 * class; Typost keeps thin delegating wrappers so the public extension API
 * is unchanged.
 *
 * @since 2.1.0
 */

if (!defined('ABSPATH')) {
    exit;
}

class Typost_Font_Sources {

    /**
     * Runtime (per-request) caches for option reads
     */
    private $custom_fonts_cache = null;
    private $manual_fonts_cache = null;
    private $replacements_cache = null;

    /**
     * Get uploaded webfont kit fonts
     *
     * @return array
     */
    public function get_custom_fonts() {
        if (null === $this->custom_fonts_cache) {
            $this->custom_fonts_cache = get_option('typost_custom_fonts', array());
        }
        return $this->custom_fonts_cache;
    }

    /**
     * Get Adobe Fonts entries
     *
     * Intentionally uncached: entries are small and some callers mutate the
     * option between reads within a request.
     *
     * @return array
     */
    public function get_adobe_fonts() {
        return get_option('typost_adobe_fonts', array());
    }

    /**
     * Get manual (theme/plugin/CDN) font definitions
     *
     * @return array
     */
    public function get_manual_fonts() {
        if (null === $this->manual_fonts_cache) {
            $this->manual_fonts_cache = get_option('typost_manual_fonts', array());
        }
        return $this->manual_fonts_cache;
    }

    /**
     * Get font replacements data (mappings, global_load, next_id)
     *
     * @return array
     */
    public function get_font_replacements() {
        if (null === $this->replacements_cache) {
            $this->replacements_cache = get_option('typost_font_replacements', array(
                'mappings' => array(),
                'global_load' => array(),
                'next_id' => 1
            ));
        }
        return $this->replacements_cache;
    }

    /**
     * Persist font replacements data and refresh the runtime cache
     *
     * @param array $replacements
     * @return bool
     */
    public function save_font_replacements($replacements) {
        $result = update_option('typost_font_replacements', $replacements);
        $this->replacements_cache = $replacements;
        return (bool) $result;
    }

    /**
     * Generate next available font ID
     *
     * Uses simple sequential allocation starting from 1.
     * All fonts (custom, adobe, manual) share the same ID sequence.
     *
     * @return int Next available ID
     */
    public function generate_font_id() {
        $replacements = $this->get_font_replacements();

        // Get next ID (starts at 1)
        $next_id = isset($replacements['next_id']) ? $replacements['next_id'] : 1;
        $current_id = $next_id;

        // Increment for next time
        $replacements['next_id'] = $next_id + 1;
        $this->save_font_replacements($replacements);

        return $current_id;
    }

    /**
     * Resolve font IDs through replacement chain
     *
     * Takes an array of used font IDs and returns an expanded array that includes
     * both the original IDs and any fonts they've been replaced with.
     * This ensures that when content references a deleted font ID, the replacement
     * font's assets are actually loaded.
     *
     * @param array $used_font_ids Array of font IDs found in content (e.g., [16, 32])
     * @return array Expanded array including replacement targets (e.g., [16, 29, 32])
     */
    public function resolve_used_font_replacements($used_font_ids) {
        $replacements = $this->get_font_replacements();

        if (empty($replacements['mappings'])) {
            return $used_font_ids;
        }

        $resolved_ids = array();

        foreach ($used_font_ids as $font_id) {
            // Always include the original ID (for the CSS variable alias)
            $resolved_ids[] = $font_id;

            // If this font has been replaced, also include the replacement target
            if (isset($replacements['mappings'][$font_id])) {
                $replacement_id = $replacements['mappings'][$font_id];
                $resolved_ids[] = $replacement_id;
            }
        }

        return array_unique($resolved_ids);
    }

    /**
     * Get all font IDs currently in use across all sources
     *
     * @return array Array of all active font IDs
     */
    public function get_all_active_font_ids() {
        $ids = array();

        foreach ($this->get_custom_fonts() as $font) {
            if (isset($font['font_id'])) {
                $ids[] = $font['font_id'];
            }
        }

        foreach ($this->get_adobe_fonts() as $font) {
            if (isset($font['font_id'])) {
                $ids[] = $font['font_id'];
            }
        }

        foreach ($this->get_manual_fonts() as $font) {
            if (isset($font['font_id'])) {
                $ids[] = $font['font_id'];
            }
        }

        return $ids;
    }

    /**
     * Update fields on a single uploaded-kit font entry (matched by string id)
     *
     * Persists the option and refreshes the runtime cache. Returns the updated
     * entry, or null when no entry matched.
     *
     * @param string $entry_id Entry 'id' (e.g. "kit-123-inter")
     * @param array  $fields   Key/value pairs to set on the entry
     * @return array|null
     */
    public function update_custom_font_entry($entry_id, array $fields) {
        $fonts = $this->get_custom_fonts();
        $updated = null;

        foreach ($fonts as $index => $font) {
            if (isset($font['id']) && $font['id'] === $entry_id) {
                foreach ($fields as $key => $value) {
                    if (null === $value) {
                        unset($fonts[$index][$key]);
                    } else {
                        $fonts[$index][$key] = $value;
                    }
                }
                $updated = $fonts[$index];
                break;
            }
        }

        if (null !== $updated) {
            update_option('typost_custom_fonts', $fonts);
            $this->custom_fonts_cache = $fonts;
        }

        return $updated;
    }

    /**
     * Find an uploaded-kit font entry by its numeric font_id
     *
     * @param int $font_id
     * @return array|null
     */
    public function find_custom_font_by_font_id($font_id) {
        foreach ($this->get_custom_fonts() as $font) {
            if (isset($font['font_id']) && (int) $font['font_id'] === (int) $font_id) {
                return $font;
            }
        }
        return null;
    }

    /**
     * Clear the per-request option caches (call after updating options)
     */
    public function clear_runtime_cache() {
        $this->custom_fonts_cache = null;
        $this->manual_fonts_cache = null;
        $this->replacements_cache = null;
    }
}

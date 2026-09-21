<?php
/**
 * WordPress Font Library bridge for Typography Stylist
 *
 * Read access to the WP Font Library (WP 6.5+, wp_font_family/wp_font_face
 * post types) and — in later steps — registration of plugin-managed fonts
 * into the Library. All functionality is feature-gated so the plugin keeps
 * working on WordPress < 6.5.
 *
 * @since 2.1.0
 */

if (!defined('ABSPATH')) {
    exit;
}

class Typost_Font_Library_Bridge {

    /**
     * @var Typost_Font_Sources
     */
    private $sources;

    /**
     * Snapshot cache of Library fonts (per request)
     */
    private $library_snapshot = null;

    /**
     * Lowercased font-family names WordPress will print @font-face for
     * on this request (per-request cache; null = not yet resolved)
     */
    private $printed_families = null;

    public function __construct(Typost_Font_Sources $sources) {
        $this->sources = $sources;
    }

    /**
     * Whether the WP Font Library is available on this install (WP 6.5+)
     *
     * @return bool
     */
    public function is_available() {
        return post_type_exists('wp_font_family');
    }

    /**
     * Get fonts available in the WordPress Font Library / theme.json
     *
     * Merges fonts from the merged theme.json data (theme fonts and fonts
     * installed via Appearance > Font Library, which land in the 'custom'
     * group) with any wp_font_family posts not already captured there.
     *
     * @return array[] Each entry: {post_id, name, font_family, slug, source}
     */
    public function get_wp_font_library_fonts() {
        if ($this->library_snapshot !== null) {
            return $this->library_snapshot;
        }

        $result = array();

        // Source 1: Fonts registered in theme.json (theme, parent-theme, and user/custom keys).
        // This covers fonts bundled with the active theme AND fonts installed via the
        // Appearance > Font Library UI (WP 6.5+), which land in the 'custom' key.
        if (class_exists('WP_Theme_JSON_Resolver')) {
            $theme_json = WP_Theme_JSON_Resolver::get_merged_data();
            $settings   = $theme_json->get_settings();
            $all_groups = isset($settings['typography']['fontFamilies'])
                ? $settings['typography']['fontFamilies']
                : array();

            // Iterate all source groups (theme, custom, etc.)
            foreach ($all_groups as $group_key => $families) {
                if (!is_array($families)) {
                    continue;
                }
                foreach ($families as $family) {
                    if (empty($family['name']) || empty($family['slug'])) {
                        continue;
                    }
                    $font_family = isset($family['fontFamily']) ? $family['fontFamily'] : $family['name'];
                    $result[]    = array(
                        'post_id'     => 0,
                        'name'        => $family['name'],
                        'font_family' => $font_family,
                        'slug'        => $family['slug'],
                        'source'      => $group_key, // 'theme', 'custom', etc.
                    );
                }
            }
        }

        // Source 2: wp_font_family posts (fonts installed via Font Library when theme.json
        // integration isn't the storage mechanism — rare but possible on some setups).
        if (post_type_exists('wp_font_family')) {
            $existing_slugs = wp_list_pluck($result, 'slug');
            $posts = get_posts(array(
                'post_type'      => 'wp_font_family',
                'posts_per_page' => -1,
                'post_status'    => 'publish',
                'orderby'        => 'title',
                'order'          => 'ASC',
            ));
            foreach ($posts as $post) {
                // Skip if already captured via theme.json
                if (in_array($post->post_name, $existing_slugs, true)) {
                    continue;
                }
                $font_family = $post->post_title;
                if (!empty($post->post_content)) {
                    $data = json_decode($post->post_content, true);
                    if (is_array($data) && !empty($data['fontFamily'])) {
                        $font_family = $data['fontFamily'];
                    }
                }
                $result[] = array(
                    'post_id'     => $post->ID,
                    'name'        => $post->post_title,
                    'font_family' => $font_family,
                    'slug'        => $post->post_name,
                    'source'      => 'installed',
                );
            }
        }

        // Sort alphabetically by name
        usort($result, function($a, $b) {
            return strcmp($a['name'], $b['name']);
        });

        $this->library_snapshot = $result;
        return $this->library_snapshot;
    }

    /**
     * Library fonts for display surfaces (admin list, editor picker groups)
     *
     * Same as get_wp_font_library_fonts() minus families the plugin itself
     * registered (slug matches a live wp_slug on an uploaded-kit entry) —
     * those fonts are already represented by their uploaded card / picker
     * entry, so listing them again reads as a duplicate. Orphaned
     * registrations (family post exists but the plugin entry is gone) stay
     * visible so they can be found and removed via the Library UI.
     *
     * Validity checks (library_slug_exists / entry_has_live_registration)
     * intentionally keep using the unfiltered snapshot.
     *
     * @since 2.1.0
     * @return array[] Same shape as get_wp_font_library_fonts()
     */
    public function get_wp_font_library_fonts_for_display() {
        $registered_slugs = array();
        foreach ($this->sources->get_custom_fonts() as $entry) {
            if (!empty($entry['wp_slug'])) {
                $registered_slugs[$entry['wp_slug']] = true;
            }
        }

        $fonts = $this->get_wp_font_library_fonts();
        if (empty($registered_slugs)) {
            return $fonts;
        }

        $filtered = array();
        foreach ($fonts as $font) {
            if (isset($registered_slugs[$font['slug']])) {
                continue;
            }
            $filtered[] = $font;
        }
        return $filtered;
    }

    /**
     * Whether a slug currently exists in the Library snapshot
     *
     * @param string $slug
     * @return bool
     */
    public function library_slug_exists($slug) {
        if ('' === (string) $slug) {
            return false;
        }
        foreach ($this->get_wp_font_library_fonts() as $font) {
            if ($font['slug'] === $slug) {
                return true;
            }
        }
        return false;
    }

    /**
     * Clear the per-request Library snapshot cache
     */
    public function clear_snapshot_cache() {
        $this->library_snapshot = null;
        $this->printed_families = null;
    }

    /**
     * Whether a font entry's Library registration is live
     *
     * True only when the Font Library is available AND the entry's wp_slug
     * currently exists in the Library snapshot. When this returns true, WP
     * prints the @font-face rules for the font; when false (never
     * registered, stale registration, or WP < 6.5), the plugin-managed
     * path applies.
     *
     * @param array $entry Font entry
     * @return bool
     */
    public function entry_has_live_registration(array $entry) {
        if (empty($entry['wp_slug'])) {
            return false;
        }
        if (!$this->is_available()) {
            return false;
        }
        return $this->library_slug_exists($entry['wp_slug']);
    }

    /**
     * Whether WordPress itself will print @font-face rules for this
     * entry's family on the current page load
     *
     * A live Library registration is NOT enough: wp_print_font_faces()
     * only prints faces present in the merged theme.json data — theme
     * fonts plus Library fonts the user has ACTIVATED in global styles.
     * A family the plugin registered programmatically is installed but
     * not activated, so WordPress prints nothing for it and the plugin
     * must keep emitting its own @font-face (otherwise the frontend
     * silently falls back to a local/system font while the editor, which
     * keeps plugin font CSS, looks correct).
     *
     * Matching is by font-family NAME, not slug: rendering only cares
     * whether a face with this family name reaches the page, whoever
     * declared it.
     *
     * @since 2.2.2
     * @param array $entry Font entry
     * @return bool
     */
    public function entry_faces_printed_by_wordpress(array $entry) {
        if (!$this->entry_has_live_registration($entry)) {
            return false;
        }
        if (empty($entry['font_faces'][0]['family'])) {
            return false;
        }
        $family = $this->normalize_family_name($entry['font_faces'][0]['family']);
        return in_array($family, $this->get_wordpress_printed_families(), true);
    }

    /**
     * Lowercased family names WordPress will print @font-face for
     * (merged theme.json: theme fonts + activated Library fonts).
     * Resolved once per request.
     *
     * @return string[]
     */
    private function get_wordpress_printed_families() {
        if (null !== $this->printed_families) {
            return $this->printed_families;
        }

        $this->printed_families = array();
        if (!class_exists('WP_Font_Face_Resolver')) {
            return $this->printed_families;
        }

        // Array of families, each an array of face arrays with kebab-case
        // keys ('font-family', 'src', ...). Tolerate a flat face array too.
        $fonts = WP_Font_Face_Resolver::get_fonts_from_theme_json();
        foreach ((array) $fonts as $family_faces) {
            if (isset($family_faces['font-family'])) {
                $family_faces = array($family_faces);
            }
            foreach ((array) $family_faces as $face) {
                if (!empty($face['font-family'])) {
                    $this->printed_families[] = $this->normalize_family_name($face['font-family']);
                }
            }
        }
        $this->printed_families = array_values(array_unique($this->printed_families));

        return $this->printed_families;
    }

    /**
     * Normalize a font-family name for comparison (strip quotes, lowercase)
     *
     * @param string $family
     * @return string
     */
    private function normalize_family_name($family) {
        return strtolower(trim((string) $family, " \t\"'"));
    }

    /**
     * Whether newly uploaded font kits should auto-register in the Library
     *
     * Governed by the typost_auto_register_wp_fonts option (default on)
     * and gated on Font Library availability (WP 6.5+).
     *
     * @return bool
     */
    public function auto_register_enabled() {
        return $this->is_available() && (bool) get_option('typost_auto_register_wp_fonts', true);
    }

    /**
     * Register an uploaded-kit font entry in the WP Font Library
     *
     * Creates one wp_font_family post plus one wp_font_face child per font
     * face. Font binaries are NOT copied — faces reference the files already
     * stored in the plugin's upload directory, which keeps registration
     * cheap, idempotent, and trivially reversible (unregistering never has
     * to restore files). The created family post is stamped with a
     * _typost_font_id meta as an ownership marker so rollback can never
     * delete a user-created family.
     *
     * @param array $entry Uploaded-kit font entry (see typost_custom_fonts)
     * @return array|false {slug, post_id} on success (or when already
     *                     registered), false on failure/unavailability
     */
    public function register_font(array $entry) {
        if (!$this->is_available()) {
            return false;
        }
        if (empty($entry['name']) || empty($entry['font_faces']) || !is_array($entry['font_faces'])) {
            return false;
        }

        // Idempotent: already registered and the family post still exists
        if (!empty($entry['wp_post_id'])) {
            $existing = get_post((int) $entry['wp_post_id']);
            if ($existing && 'wp_font_family' === $existing->post_type) {
                return array(
                    'slug'    => $existing->post_name,
                    'post_id' => (int) $existing->ID,
                );
            }
        }

        $slug = sanitize_title($entry['name']);
        if ('' === $slug) {
            $slug = sanitize_title('typost-font-' . (isset($entry['font_id']) ? (int) $entry['font_id'] : 0));
        }
        $slug = wp_unique_post_slug($slug, 0, 'publish', 'wp_font_family', 0);

        $content = $this->build_font_family_post_content($entry, $slug);

        $post_id = wp_insert_post(array(
            'post_type'    => 'wp_font_family',
            'post_status'  => 'publish',
            'post_title'   => sanitize_text_field($entry['name']),
            'post_name'    => $slug,
            'post_content' => wp_json_encode($content),
        ), true);

        if (is_wp_error($post_id) || !$post_id) {
            return false;
        }

        // Ownership marker: rollback only ever deletes posts carrying this meta
        update_post_meta($post_id, '_typost_font_id', isset($entry['font_id']) ? (int) $entry['font_id'] : 0);

        $base_url = isset($entry['upload_url']) ? $entry['upload_url'] : '';
        foreach ($entry['font_faces'] as $face) {
            if (!is_array($face)) {
                continue;
            }
            $face_content = $this->build_font_face_post_content($face, $base_url);
            if (empty($face_content['src'])) {
                // No resolvable font files for this face — skip it rather
                // than registering a face WP cannot print
                continue;
            }
            wp_insert_post(array(
                'post_type'    => 'wp_font_face',
                'post_status'  => 'publish',
                'post_parent'  => (int) $post_id,
                'post_title'   => trim($face_content['fontFamily'] . '; ' . $face_content['fontStyle'] . '; ' . $face_content['fontWeight']),
                'post_content' => wp_json_encode($face_content),
            ));
        }

        $this->clear_snapshot_cache();

        return array(
            'slug'    => $slug,
            'post_id' => (int) $post_id,
        );
    }

    /**
     * Remove a previously registered font from the WP Font Library
     *
     * Deletes the wp_font_family post and its wp_font_face children, but
     * ONLY when the post carries a matching _typost_font_id ownership meta —
     * user-created families are never touched.
     *
     * @param array $entry Uploaded-kit font entry with wp_post_id set
     * @return bool Whether the family post was deleted
     */
    public function unregister_font(array $entry) {
        if (empty($entry['wp_post_id'])) {
            return false;
        }

        $post = get_post((int) $entry['wp_post_id']);
        if (!$post || 'wp_font_family' !== $post->post_type) {
            return false;
        }

        $owner_font_id = (int) get_post_meta($post->ID, '_typost_font_id', true);
        $entry_font_id = isset($entry['font_id']) ? (int) $entry['font_id'] : 0;
        if (!$owner_font_id || $owner_font_id !== $entry_font_id) {
            return false;
        }

        $children = get_posts(array(
            'post_type'      => 'wp_font_face',
            'post_parent'    => $post->ID,
            'posts_per_page' => -1,
            'post_status'    => 'any',
            'fields'         => 'ids',
        ));
        foreach ($children as $child_id) {
            wp_delete_post($child_id, true);
        }
        wp_delete_post($post->ID, true);

        $this->clear_snapshot_cache();

        return true;
    }

    /**
     * deleted_post watcher: silent rollback when a plugin-registered family
     * is deleted through the Font Library UI (or anywhere else)
     *
     * Clears the wp_slug/wp_post_id fields on the matching entry so CSS
     * emission falls back to the plugin-managed path on the next request.
     *
     * Also reports true (without touching the entry) when the deleted
     * family's slug is an ADOPTED Library font: the adopted entry keeps its
     * canonical font_id, but the cached @font-face CSS the plugin built from
     * the family's face posts is now stale and the caller must clear it.
     *
     * @param int          $post_id Deleted post ID
     * @param WP_Post|null $post    Deleted post object
     * @return bool Whether plugin font data depended on the deleted family
     *              (an entry was updated, or an adopted font lost its faces)
     */
    public function handle_deleted_post($post_id, $post = null) {
        if (!$post || !isset($post->post_type) || 'wp_font_family' !== $post->post_type) {
            return false;
        }

        $changed = false;
        foreach ($this->sources->get_custom_fonts() as $entry) {
            if (!empty($entry['wp_post_id']) && (int) $entry['wp_post_id'] === (int) $post_id && isset($entry['id'])) {
                $this->sources->update_custom_font_entry($entry['id'], array(
                    'wp_slug'            => null,
                    'wp_post_id'         => null,
                    'wp_registered_date' => null,
                ));
                $changed = true;
            }
        }

        if (!$changed && !empty($post->post_name) && $this->sources->find_adopted_wp_font_by_slug($post->post_name)) {
            $changed = true;
        }

        if ($changed) {
            $this->clear_snapshot_cache();
        }

        return $changed;
    }

    /**
     * Collect the font-face weight declarations for a Library font
     *
     * Looks in the merged theme.json data first (fontFace arrays cover theme
     * fonts and Font Library installs on most setups), then falls back to
     * wp_font_face child posts. Returns a faces-shaped array so the result
     * can feed Typost_Font_Sources::derive_available_weights_from_faces().
     *
     * @since 2.1.2
     * @param string $slug Library font slug
     * @return array[] Each entry: {weight: string}; empty when nothing found
     */
    public function get_library_font_face_weights($slug) {
        $slug = sanitize_title($slug);
        if ('' === $slug) {
            return array();
        }

        $faces = array();

        // Source 1: merged theme.json fontFace declarations
        if (class_exists('WP_Theme_JSON_Resolver')) {
            $theme_json = WP_Theme_JSON_Resolver::get_merged_data();
            $settings   = $theme_json->get_settings();
            $all_groups = isset($settings['typography']['fontFamilies'])
                ? $settings['typography']['fontFamilies']
                : array();

            foreach ($all_groups as $families) {
                if (!is_array($families)) {
                    continue;
                }
                foreach ($families as $family) {
                    // theme.json slugs aren't guaranteed to be normalized;
                    // sanitize before comparing against the sanitized input
                    if (empty($family['slug']) || sanitize_title($family['slug']) !== $slug || empty($family['fontFace'])) {
                        continue;
                    }
                    foreach ((array) $family['fontFace'] as $face) {
                        if (isset($face['fontWeight'])) {
                            $faces[] = array('weight' => (string) $face['fontWeight']);
                        }
                    }
                }
            }
        }

        // Source 2: wp_font_face child posts of the matching wp_font_family post
        if (empty($faces)) {
            foreach ($this->get_library_font_face_settings($slug) as $data) {
                if (isset($data['fontWeight'])) {
                    $faces[] = array('weight' => (string) $data['fontWeight']);
                }
            }
        }

        return $faces;
    }

    /**
     * Decoded font_face_settings of every published wp_font_face child of
     * a Library family, looked up by family slug
     *
     * Returns the raw camelCase payloads WordPress stores in post_content
     * ({fontFamily, fontStyle, fontWeight, src, fontDisplay, ...}), unsanitized;
     * build_font_face_rule() is the sanitizing consumer. Empty when the Font
     * Library is unavailable, the family does not exist, or it has no faces.
     *
     * @since 2.3.0
     * @param string $slug Library font slug
     * @return array[] Decoded face settings, in post order
     */
    public function get_library_font_face_settings($slug) {
        $slug = sanitize_title($slug);
        if ('' === $slug || !post_type_exists('wp_font_family')) {
            return array();
        }

        $family_posts = get_posts(array(
            'post_type'      => 'wp_font_family',
            'name'           => $slug,
            'posts_per_page' => 1,
            'post_status'    => 'publish',
        ));
        if (empty($family_posts)) {
            return array();
        }

        $face_posts = get_posts(array(
            'post_type'      => 'wp_font_face',
            'post_parent'    => $family_posts[0]->ID,
            'posts_per_page' => -1,
            'post_status'    => 'publish',
        ));

        $settings = array();
        foreach ((array) $face_posts as $face_post) {
            if (empty($face_post->post_content)) {
                continue;
            }
            $data = json_decode($face_post->post_content, true);
            if (is_array($data)) {
                $settings[] = $data;
            }
        }

        return $settings;
    }

    /**
     * Build sanitized @font-face CSS for a Library family from its
     * wp_font_face posts
     *
     * This is how an adopted Library font that is installed but NOT activated
     * in global styles gets its faces onto the page: wp_print_font_faces()
     * prints nothing for it, so without this the --font-N variable resolves
     * to a family no @font-face declares and the browser silently falls back.
     * Faces without a usable src are skipped.
     *
     * @since 2.3.0
     * @param string $slug Library font slug
     * @return string Concatenated @font-face rules ('' when none)
     */
    public function build_font_face_css_for_family($slug) {
        $rules = array();
        foreach ($this->get_library_font_face_settings($slug) as $settings) {
            $rule = $this->build_font_face_rule($settings);
            if ('' !== $rule) {
                $rules[] = $rule;
            }
        }
        return implode("\n", $rules);
    }

    /**
     * Build one sanitized @font-face rule from a face's font_face_settings
     *
     * Pure: no option or post reads. Mirrors the property set core's
     * WP_Font_Face prints (family, style, weight, display, src, stretch,
     * unicode-range) and sanitizes each the way sanitize_font_faces() does
     * for uploaded kits — family via sanitize_text_field, src URLs via
     * esc_url_raw, weights/styles/keywords against allow-lists. A Library
     * face may be a variable font, so weight ranges ("100 900") and any
     * weight 1-1000 are accepted here regardless of the
     * typost_allow_variable_weights option, which only governs kit uploads.
     *
     * @since 2.3.0
     * @param array $settings Decoded wp_font_face post_content
     *                        ({fontFamily, fontStyle, fontWeight, src, ...})
     * @return string A single "@font-face{...}" rule, or '' when the face has
     *                no family or no usable src
     */
    public function build_font_face_rule(array $settings) {
        $family = isset($settings['fontFamily']) ? sanitize_text_field((string) $settings['fontFamily']) : '';
        $family = trim($family, " \t\"'");
        $family = str_replace(array('"', ';', '{', '}', '\\'), '', $family);
        if ('' === $family) {
            return '';
        }

        $src_entries = array();
        $raw_src = isset($settings['src']) ? $settings['src'] : array();
        foreach ((array) $raw_src as $url) {
            if (!is_string($url)) {
                continue;
            }
            $url = esc_url_raw(trim($url));
            if ('' === $url || preg_match('/[\s"\'()]/', $url)) {
                continue;
            }
            $format = $this->font_format_from_url($url);
            $src_entries[] = 'url("' . $url . '")' . ('' !== $format ? ' format("' . $format . '")' : '');
        }
        if (empty($src_entries)) {
            return '';
        }

        $weight = isset($settings['fontWeight']) ? strtolower(trim((string) $settings['fontWeight'])) : '';
        if (!preg_match('/^(normal|bold|\d{1,4}(\s+\d{1,4})?)$/', $weight) || !$this->weight_tokens_in_range($weight)) {
            $weight = '400';
        }
        $weight = preg_replace('/\s+/', ' ', $weight);

        $style = isset($settings['fontStyle']) ? strtolower(trim((string) $settings['fontStyle'])) : '';
        if (!preg_match('/^(normal|italic|oblique(\s+-?\d+(\.\d+)?deg)?)$/', $style)) {
            $style = 'normal';
        }
        $style = preg_replace('/\s+/', ' ', $style);

        $declarations = array(
            'font-family:"' . $family . '"',
            'font-style:' . $style,
            'font-weight:' . $weight,
        );

        $display = isset($settings['fontDisplay']) ? strtolower(trim((string) $settings['fontDisplay'])) : '';
        if (in_array($display, array('auto', 'block', 'swap', 'fallback', 'optional'), true)) {
            $declarations[] = 'font-display:' . $display;
        }

        $stretch = isset($settings['fontStretch']) ? strtolower(trim((string) $settings['fontStretch'])) : '';
        if ('' !== $stretch && preg_match('/^(normal|(ultra|extra|semi)?-?(condensed|expanded)|\d+(\.\d+)?%(\s+\d+(\.\d+)?%)?)$/', $stretch)) {
            $declarations[] = 'font-stretch:' . preg_replace('/\s+/', ' ', $stretch);
        }

        $unicode_range = isset($settings['unicodeRange']) ? strtoupper(preg_replace('/\s+/', '', (string) $settings['unicodeRange'])) : '';
        if ('' !== $unicode_range && preg_match('/^U\+[0-9A-F?]{1,6}(-[0-9A-F]{1,6})?(,U\+[0-9A-F?]{1,6}(-[0-9A-F]{1,6})?)*$/', $unicode_range)) {
            $declarations[] = 'unicode-range:' . $unicode_range;
        }

        $declarations[] = 'src:' . implode(', ', $src_entries);

        return '@font-face{' . implode(';', $declarations) . ';}';
    }

    /**
     * Whether every numeric token of a validated weight value is 1-1000
     *
     * @param string $weight Weight already matched against the shape regex
     * @return bool
     */
    private function weight_tokens_in_range($weight) {
        foreach (preg_split('/\s+/', $weight) as $token) {
            if (ctype_digit($token) && ((int) $token < 1 || (int) $token > 1000)) {
                return false;
            }
        }
        return true;
    }

    /**
     * Map a font file URL to its @font-face format() hint (same table core's
     * WP_Font_Face uses); '' when the extension is unknown
     *
     * @param string $url Font file URL
     * @return string
     */
    private function font_format_from_url($url) {
        $path = preg_replace('/[?#].*$/', '', $url);
        $extension = strtolower((string) pathinfo($path, PATHINFO_EXTENSION));
        $formats = array(
            'woff2' => 'woff2',
            'woff'  => 'woff',
            'ttf'   => 'truetype',
            'otf'   => 'opentype',
            'eot'   => 'embedded-opentype',
            'svg'   => 'svg',
        );
        return isset($formats[$extension]) ? $formats[$extension] : '';
    }

    /**
     * Whether WordPress itself prints @font-face rules for an adopted
     * Library font on the current page load
     *
     * The adopted-entry counterpart of entry_faces_printed_by_wordpress():
     * adopted entries carry no font_faces, so the family name comes from the
     * entry's font_family (first family of the stack) and name. Same rule:
     * only a family present in the merged theme.json data — theme fonts plus
     * Library fonts ACTIVATED in global styles — counts as printed. An
     * adopted font that is merely installed gets nothing from WordPress and
     * the plugin prints its faces (build_font_face_css_for_family()).
     *
     * @since 2.3.0
     * @param array $entry Adopted Library font entry ({wp_slug, font_family, name, ...})
     * @return bool
     */
    public function adopted_entry_faces_printed_by_wordpress(array $entry) {
        if (!$this->entry_has_live_registration($entry)) {
            return false;
        }

        $candidates = array();
        if (!empty($entry['font_family'])) {
            $stack = explode(',', (string) $entry['font_family']);
            $candidates[] = $this->normalize_family_name($stack[0]);
        }
        if (!empty($entry['name'])) {
            $candidates[] = $this->normalize_family_name($entry['name']);
        }
        $candidates = array_filter(array_unique($candidates), 'strlen');
        if (empty($candidates)) {
            return false;
        }

        $printed = $this->get_wordpress_printed_families();
        foreach ($candidates as $candidate) {
            if (in_array($candidate, $printed, true)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Adopt a WP Font Library font for editor use
     *
     * Idempotent: returns the existing adopted entry when the slug was
     * already adopted, and when the slug belongs to a font the plugin itself
     * registered, returns that kit font's identity instead of duplicating it.
     * Otherwise allocates a font_id from the shared sequence and stores a
     * manual-fonts-shaped entry, so every downstream system (CSS variables,
     * detection, extensions' numeric maps) works unchanged.
     *
     * @since 2.1.0
     * @param string $slug Library font slug
     * @return array|false The adopted entry (or kit-entry equivalent), false when the slug is unknown
     */
    public function adopt_library_font($slug) {
        $slug = sanitize_title($slug);
        if ('' === $slug) {
            return false;
        }

        // Already adopted
        $existing = $this->sources->find_adopted_wp_font_by_slug($slug);
        if ($existing) {
            return $existing;
        }

        // Slug belongs to a font the plugin registered — reuse its font_id
        foreach ($this->sources->get_custom_fonts() as $entry) {
            if (!empty($entry['wp_slug']) && $entry['wp_slug'] === $slug && isset($entry['font_id'])) {
                $family = !empty($entry['font_faces'][0]['family']) ? $entry['font_faces'][0]['family'] : $entry['name'];
                return array(
                    'id'          => 'wpl-' . $slug,
                    'name'        => $entry['name'],
                    'wp_slug'     => $slug,
                    'font_id'     => (int) $entry['font_id'],
                    'font_family' => $family,
                    'fallbacks'   => isset($entry['fallbacks']) ? $entry['fallbacks'] : '',
                );
            }
        }

        // Must exist in the Library snapshot
        $library_font = null;
        foreach ($this->get_wp_font_library_fonts() as $font) {
            if ($font['slug'] === $slug) {
                $library_font = $font;
                break;
            }
        }
        if (!$library_font) {
            return false;
        }

        $entry = array(
            'id'          => 'wpl-' . $slug,
            'name'        => sanitize_text_field($library_font['name']),
            'wp_slug'     => $slug,
            'font_id'     => $this->sources->generate_font_id(),
            'font_family' => sanitize_text_field($library_font['font_family']),
            'fallbacks'   => '',
            'added_date'  => current_time('mysql'),
        );

        // Detect available weights from the family's font-face declarations.
        // No declarations found → omit the key (= all weights enabled).
        $faces = $this->get_library_font_face_weights($slug);
        if (!empty($faces)) {
            $entry['available_weights'] = $this->sources->derive_available_weights_from_faces($faces);
        }

        return $this->sources->add_adopted_wp_font($entry);
    }

    /**
     * Build the wp_font_family post_content payload for a font entry
     *
     * @param array  $entry Uploaded-kit font entry
     * @param string $slug  Chosen family slug
     * @return array {name, slug, fontFamily, preview}
     */
    public function build_font_family_post_content(array $entry, $slug) {
        $family = '';
        if (!empty($entry['font_faces'][0]['family'])) {
            $family = $entry['font_faces'][0]['family'];
        } elseif (!empty($entry['name'])) {
            $family = $entry['name'];
        }

        $font_family_value = (false !== strpos($family, ' ')) ? '"' . $family . '"' : $family;
        if (!empty($entry['fallbacks'])) {
            $font_family_value .= ', ' . $entry['fallbacks'];
        }

        return array(
            'name'       => isset($entry['name']) ? $entry['name'] : $family,
            'slug'       => $slug,
            'fontFamily' => $font_family_value,
            'preview'    => '',
        );
    }

    /**
     * Build the wp_font_face post_content payload for a single face
     *
     * @param array  $face     Face data {family, weight, style, src}
     * @param string $base_url Kit upload URL for resolving relative src paths
     * @return array {fontFamily, fontStyle, fontWeight, src[]}
     */
    public function build_font_face_post_content(array $face, $base_url) {
        return array(
            'fontFamily' => isset($face['family']) ? $face['family'] : '',
            'fontStyle'  => !empty($face['style']) ? $face['style'] : 'normal',
            'fontWeight' => !empty($face['weight']) ? (string) $face['weight'] : '400',
            'src'        => $this->extract_face_src_urls(isset($face['src']) ? $face['src'] : '', $base_url),
        );
    }

    /**
     * Extract font file URLs from a CSS src value
     *
     * Handles the three URL shapes produced by the kit upload pipeline:
     * absolute URLs (kept), site-relative paths like
     * /wp-content/uploads/... (resolved via site_url()), and kit-relative
     * filenames (resolved against the kit's upload URL). Data URIs are
     * skipped — WP Font Library faces reference files.
     *
     * @param string $src      CSS src value, e.g. "url('a.woff2') format('woff2'), url('a.woff')"
     * @param string $base_url Kit upload URL
     * @return array Ordered unique URLs
     */
    public function extract_face_src_urls($src, $base_url) {
        $urls = array();

        if (!is_string($src) || '' === $src) {
            return $urls;
        }

        if (!preg_match_all("/url\s*\(\s*['\"]?([^)'\"\s]+)['\"]?\s*\)/i", $src, $matches)) {
            return $urls;
        }

        foreach ($matches[1] as $url) {
            if (0 === strpos($url, 'data:')) {
                continue;
            }

            if (preg_match('/^https?:\/\//i', $url)) {
                // Absolute URL — keep as-is
                $urls[] = $url;
            } elseif (0 === strpos($url, '//')) {
                // Protocol-relative — keep as-is
                $urls[] = $url;
            } elseif (0 === strpos($url, '/')) {
                // Site-relative path (produced by rewrite_css_urls at upload time)
                $urls[] = site_url($url);
            } elseif ('' !== $base_url) {
                // Kit-relative filename
                $urls[] = rtrim($base_url, '/') . '/' . ltrim($url, './');
            }
        }

        return array_values(array_unique($urls));
    }
}

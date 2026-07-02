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
    }
}

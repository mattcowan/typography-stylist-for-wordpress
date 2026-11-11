<?php
/**
 * Font kit ZIP processing for Typography Stylist
 *
 * Extracts an uploaded webfont kit, removes files that are not fonts or CSS,
 * checks font files by their signature, picks (or generates) the kit's
 * stylesheet, rewrites and sanitizes its @font-face rules and returns one
 * font entry per family. Extracted from the Typost class (#360); Typost keeps
 * process_font_kit_zip(), get_font_kit_warnings() and rewrite_css_urls() as
 * delegating wrappers, so the public API is unchanged.
 *
 * @internal Reach it through Typost's public methods.
 * @since 2.4.0
 */

if (!defined('ABSPATH')) {
    exit;
}

class Typost_Font_Kit_Upload {

    /**
     * The plugin instance.
     *
     * @var Typost
     */
    private $typost;

    /**
     * Non-fatal warnings produced by the most recent process_font_kit_zip()
     * run (e.g. "@font-face CSS was generated from filename guesses").
     * Kept out of the method's return value so its array-of-entries|WP_Error
     * contract — and the typost_font_uploaded payload — stay unchanged.
     *
     * @since 2.1.0
     * @var string[]
     */
    private $font_kit_warnings = array();

    /**
     * @param Typost $typost Plugin instance.
     */
    public function __construct($typost) {
        $this->typost = $typost;
    }

    /**
     * Process uploaded font kit ZIP file
     *
     * Kits normally contain a stylesheet with @font-face rules. Since 2.1.0,
     * kits with no usable CSS (e.g. bare Google Fonts downloads) are also
     * accepted: a stylesheet is generated from the font binaries' metadata
     * (see generate_css_from_fonts()) and the normal pipeline runs on it.
     * Non-fatal warnings from that path are exposed via
     * get_font_kit_warnings(); the return contract is unchanged.
     *
     * @param array  $uploaded_file The $_FILES-style upload array.
     * @param string $kit_name      User-provided kit name.
     * @return array|WP_Error Array of per-family font entries, or WP_Error.
     */
    public function process_font_kit_zip($uploaded_file, $kit_name) {
        $this->font_kit_warnings = array();

        // Create unique kit ID and directory
        $kit_id = 'kit-' . time() . '-' . wp_generate_password(8, false);
        $upload_dir = wp_upload_dir();
        $kit_base_path = $upload_dir['basedir'] . '/typography-stylist/fonts/' . $kit_id;
        $kit_base_url = $upload_dir['baseurl'] . '/typography-stylist/fonts/' . $kit_id;

        // Create directory
        if (!wp_mkdir_p($kit_base_path)) {
            return new WP_Error('mkdir_failed', esc_html__('Failed to create upload directory', 'typography-stylist'));
        }

        // Initialize WordPress filesystem
        require_once(ABSPATH . 'wp-admin/includes/file.php');
        WP_Filesystem();
        global $wp_filesystem;

        // Extract ZIP file
        $unzip_result = unzip_file($uploaded_file['tmp_name'], $kit_base_path);

        if (is_wp_error($unzip_result)) {
            // Clean up on failure
            $wp_filesystem->rmdir($kit_base_path, true);
            // Return generic message to users
            return new WP_Error('unzip_failed', esc_html__('Failed to extract ZIP file. Please ensure the file is a valid ZIP archive.', 'typography-stylist'), array('status' => 400));
        }

        // Validate extracted files - only allow CSS, WOFF, WOFF2, TTF, OTF, EOT
        // Note: SVG font files are intentionally excluded here, even though SVG is a valid font format,
        // because SVG can embed JavaScript (e.g. <script> tags or event handlers) and therefore pose an XSS risk.
        // SVG fonts were previously allowed but were removed for defense-in-depth and to avoid serving active content.
        $all_files = list_files($kit_base_path, 100);
        $allowed_extensions = array('css', 'woff', 'woff2', 'ttf', 'otf', 'eot');

        foreach ($all_files as $file) {
            $file_ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));

            // Delete any non-allowed file types
            if (!in_array($file_ext, $allowed_extensions, true)) {
                wp_delete_file($file);
                continue;
            }

            // Prevent PHP execution
            if (in_array($file_ext, array('php', 'php3', 'php4', 'php5', 'phtml', 'phps'), true)) {
                wp_delete_file($file);
                continue;
            }

            // Validate file is within expected directory
            $real_path = realpath($file);
            $real_base = realpath($kit_base_path);
            if ($real_path === false || $real_base === false || strpos($real_path, $real_base) !== 0) {
                wp_delete_file($file);
                continue;
            }

            // Validate font files by magic number (file signature)
            if (in_array($file_ext, array('woff', 'woff2', 'ttf', 'otf', 'eot'), true)) {
                if (!$this->is_valid_font_file($file)) {
                    wp_delete_file($file); // Not a real font file
                }
            }
        }

        // Find ALL CSS files in the kit
        $css_files = array();
        try {
            $iterator = new RecursiveDirectoryIterator($kit_base_path, RecursiveDirectoryIterator::SKIP_DOTS);
            foreach (new RecursiveIteratorIterator($iterator) as $file) {
                if ($file->isFile() && strtolower($file->getExtension()) === 'css') {
                    $css_files[] = $file->getPathname();
                }
            }
        } catch (Exception $e) {
            $wp_filesystem->rmdir($kit_base_path, true);
            return new WP_Error(
                'iterator_failed',
                esc_html__('Failed to process font kit. The archive may be corrupted.', 'typography-stylist')
            );
        }

        if (empty($css_files)) {
            // Bare-font kit (e.g. a Google Fonts download): generate the
            // stylesheet from the font binaries' metadata, then let the
            // normal CSS pipeline below run unchanged.
            $generated = $this->generate_css_from_fonts($kit_base_path, $wp_filesystem);
            if (is_wp_error($generated)) {
                $wp_filesystem->rmdir($kit_base_path, true);
                return $generated;
            }
            $css_files[] = $generated['path'];
            $this->font_kit_warnings = $generated['warnings'];
        }

        // Select the best CSS file (prioritizes actual font CSS over specimen/demo files)
        $css_file_path = $this->select_font_css_file($css_files, $kit_base_path, $wp_filesystem);

        if (is_wp_error($css_file_path)) {
            // CSS files exist but none contains @font-face (e.g. a stray
            // specimen/demo stylesheet): fall back to generating one from the
            // font binaries before giving up. A different filename is used in
            // case a non-font-face stylesheet.css is already present.
            if ($css_file_path->get_error_code() === 'no_font_face_css') {
                $filename = $wp_filesystem->exists($kit_base_path . '/stylesheet.css') ? 'typost-generated.css' : 'stylesheet.css';
                $generated = $this->generate_css_from_fonts($kit_base_path, $wp_filesystem, $filename);
                if (!is_wp_error($generated)) {
                    $css_file_path = $generated['path'];
                    $this->font_kit_warnings = $generated['warnings'];
                }
            }
            if (is_wp_error($css_file_path)) {
                $wp_filesystem->rmdir($kit_base_path, true);
                return $css_file_path;
            }
        }

        // Validate it's a real file, not a symlink
        if (!is_file($css_file_path) || is_link($css_file_path)) {
            $wp_filesystem->rmdir($kit_base_path, true);
            return new WP_Error('invalid_css', esc_html__('Invalid CSS file', 'typography-stylist'));
        }

        // Check CSS file size (max 1MB)
        $file_size = filesize($css_file_path);
        if ($file_size > 1024 * 1024) {
            $wp_filesystem->rmdir($kit_base_path, true);
            return new WP_Error('css_too_large', esc_html__('CSS file is too large (max 1MB)', 'typography-stylist'));
        }

        // Use WP Filesystem API
        $css_content = $wp_filesystem->get_contents($css_file_path);

        if ($css_content === false) {
            $wp_filesystem->rmdir($kit_base_path, true);
            return new WP_Error('css_read_error', esc_html__('Could not read CSS file', 'typography-stylist'));
        }

        // Validate it looks like CSS (basic check)
        if (!preg_match('/@font-face\s*\{/i', $css_content)) {
            $wp_filesystem->rmdir($kit_base_path, true);
            return new WP_Error('invalid_css', esc_html__('CSS file does not contain @font-face declarations', 'typography-stylist'));
        }

        // Get the directory where the CSS file is located (relative to kit_base_path)
        $css_dir = dirname($css_file_path);
        $css_relative_dir = str_replace($kit_base_path, '', $css_dir);

        // Convert Windows backslashes to forward slashes for URLs
        $css_relative_dir = str_replace('\\', '/', $css_relative_dir);

        $css_base_url = $kit_base_url . $css_relative_dir;

        // Rewrite URLs in CSS to point to WordPress uploads
        $css_content = $this->typost->rewrite_css_urls($css_content, $css_base_url);

        // Sanitize CSS content to remove dangerous rules and external URLs
        $css_content = $this->sanitize_font_css($css_content);

        // Check if sanitization removed all content
        if (empty($css_content)) {
            $wp_filesystem->rmdir($kit_base_path, true);
            return new WP_Error('invalid_css', esc_html__('No valid @font-face declarations found after sanitization', 'typography-stylist'));
        }

        // Parse font families
        $font_faces = $this->typost->parse_webfont_kit($css_content);

        if (empty($font_faces)) {
            // Clean up on failure
            $wp_filesystem->rmdir($kit_base_path, true);
            return new WP_Error('invalid_css', esc_html__('No valid @font-face rules found in CSS', 'typography-stylist'));
        }

        // Count font files more efficiently
        $font_count = 0;
        $extensions = array('woff', 'woff2', 'ttf', 'otf', 'eot');

        try {
            $iterator = new RecursiveDirectoryIterator($kit_base_path, RecursiveDirectoryIterator::SKIP_DOTS);
            foreach (new RecursiveIteratorIterator($iterator) as $file) {
                if ($file->isFile() && in_array(strtolower($file->getExtension()), $extensions, true)) {
                    $font_count++;
                }
            }
        } catch (Exception $e) {
            // Continue anyway, font_count will just be 0
        }

        // Group font faces by family name to create individual font entries
        $fonts_by_family = array();
        foreach ($font_faces as $face) {
            $family = $face['family'];
            if (!isset($fonts_by_family[$family])) {
                $fonts_by_family[$family] = array();
            }
            $fonts_by_family[$family][] = $face;
        }

        // Create individual font entries for each family
        $font_entries = array();
        foreach ($fonts_by_family as $family => $faces) {
            // Create unique ID for this font (not the kit)
            $family_slug = sanitize_title($family);
            $composite_font_id = $kit_id . '-' . $family_slug;

            // Extract just the @font-face rules for this family from CSS
            $family_css = $this->extract_font_face_css($css_content, $family);

            $font_entries[] = array(
                'id' => sanitize_key($composite_font_id),
                'name' => sanitize_text_field($family), // Use family name as font name
                'font_id' => $this->typost->font_sources()->generate_font_id(),
                'kit_id' => sanitize_key($kit_id),       // Link back to original kit
                'kit_name' => sanitize_text_field($kit_name), // For display/grouping
                'css_content' => $family_css,
                'font_faces' => $faces,                  // Only this family's faces
                'available_weights' => $this->typost->font_sources()->derive_available_weights_from_faces($faces),
                'upload_path' => $kit_base_path,         // Shared directory
                'upload_url' => $kit_base_url,
                'uploaded_date' => current_time('mysql')
            );
        }

        return $font_entries;
    }

    /**
     * Select the best CSS file from webfont kit
     *
     * Prioritizes files likely to contain actual font definitions over
     * specimen/demo CSS files that may be included in the kit.
     *
     * @param array $css_files Array of CSS file paths
     * @param string $kit_base_path Base path of the extracted kit
     * @param WP_Filesystem_Base $wp_filesystem WordPress filesystem API instance
     * @return string|WP_Error Path to selected CSS file or WP_Error
     */
    private function select_font_css_file($css_files, $kit_base_path, $wp_filesystem) {
        $candidates = array();

        foreach ($css_files as $css_path) {
            $score = 0;
            $relative_path = str_replace($kit_base_path, '', $css_path);
            $relative_path = str_replace('\\', '/', $relative_path); // Normalize Windows paths
            $basename = basename($css_path);
            $dirname = dirname($relative_path);

            // Priority scoring heuristics

            // 1. Prioritize files at root level (+100 points)
            $depth = substr_count($relative_path, '/');
            if ($depth <= 1) { // Root or one level deep
                $score += 100;
            }

            // 2. Prioritize common font CSS filenames (+50 points)
            $font_css_names = array('stylesheet.css', 'styles.css', 'fonts.css', 'webfonts.css', 'font.css');
            if (in_array(strtolower($basename), $font_css_names, true)) {
                $score += 50;
            }

            // 3. Penalize specimen/demo/example directories (-200 points)
            $excluded_dirs = array('specimen', 'demo', 'example', 'test', 'sample');
            foreach ($excluded_dirs as $excluded) {
                if (stripos($dirname, $excluded) !== false) {
                    $score -= 200;
                    break;
                }
            }

            // 4. Read file and check for @font-face (+1000 points - REQUIRED)
            $css_content = $wp_filesystem->get_contents($css_path);
            $has_font_face = false;

            if ($css_content !== false && preg_match('/@font-face\s*\{/i', $css_content)) {
                $has_font_face = true;
                $score += 1000;

                // 5. Prioritize smaller files (font CSS is typically small)
                $file_size = filesize($css_path);
                if ($file_size < 5120) { // Under 5KB
                    $score += 20;
                } elseif ($file_size < 10240) { // Under 10KB
                    $score += 10;
                }
            }

            // Store candidate with score
            $candidates[] = array(
                'path' => $css_path,
                'score' => $score,
                'has_font_face' => $has_font_face,
                'relative_path' => $relative_path,
                'size' => filesize($css_path)
            );
        }

        // Sort by score (highest first)
        usort($candidates, function($a, $b) {
            return $b['score'] - $a['score'];
        });

        // Select the best candidate that has @font-face
        foreach ($candidates as $candidate) {
            if ($candidate['has_font_face']) {
                return $candidate['path'];
            }
        }

        // No valid CSS file found - return detailed error
        $file_list = array_map(function($candidate) {
            return sprintf(
                '%s (%s)',
                $candidate['relative_path'],
                $candidate['has_font_face'] ? 'has @font-face' : 'no @font-face'
            );
        }, $candidates);

        return new WP_Error(
            'no_font_face_css',
            sprintf(
                /* translators: %d: number of CSS files found */
                esc_html__('Found %d CSS file(s) in the font kit, but none contain valid @font-face declarations. Please ensure the ZIP file contains a proper webfont stylesheet.', 'typography-stylist'),
                count($css_files)
            ),
            array(
                'status' => 400,
                'css_files_found' => $file_list
            )
        );
    }

    /**
     * Generate a stylesheet from the font binaries in a kit directory
     *
     * Used when an uploaded kit contains no usable CSS (e.g. a Google Fonts
     * download of bare font files). Reads family/weight/style metadata from
     * the binaries via Typost_Font_Metadata, writes the generated stylesheet
     * into the kit directory, and returns translated non-fatal warnings for
     * any file whose metadata had to be guessed from its filename.
     *
     * @since 2.1.0
     * @param string $kit_base_path Absolute path to the kit directory.
     * @param object $wp_filesystem WP_Filesystem instance.
     * @param string $filename      Stylesheet filename to write.
     * @return array|WP_Error array('path' => string, 'warnings' => string[]) on success.
     */
    private function generate_css_from_fonts($kit_base_path, $wp_filesystem, $filename = 'stylesheet.css') {
        $font_files = array();
        $font_extensions = array('woff', 'woff2', 'ttf', 'otf', 'eot');

        try {
            $iterator = new RecursiveDirectoryIterator($kit_base_path, RecursiveDirectoryIterator::SKIP_DOTS);
            foreach (new RecursiveIteratorIterator($iterator) as $file) {
                if ($file->isFile() && !$file->isLink() && in_array(strtolower($file->getExtension()), $font_extensions, true)) {
                    $font_files[] = $file->getPathname();
                }
            }
        } catch (Exception $e) {
            return new WP_Error(
                'iterator_failed',
                esc_html__('Failed to process font kit. The archive may be corrupted.', 'typography-stylist')
            );
        }

        sort($font_files); // Deterministic @font-face order regardless of filesystem order

        $result = Typost_Font_Metadata::generate_stylesheet($font_files, $kit_base_path);

        if (empty($result['css'])) {
            return new WP_Error(
                'no_css',
                esc_html__('No CSS file was found in the font kit, and no usable font files were found to generate one from.', 'typography-stylist'),
                array('status' => 400)
            );
        }

        $css_path = $kit_base_path . '/' . $filename;
        if (!$wp_filesystem->put_contents($css_path, $result['css'], FS_CHMOD_FILE)) {
            return new WP_Error(
                'css_write_failed',
                esc_html__('Could not write the generated stylesheet to the font kit directory.', 'typography-stylist')
            );
        }

        $warnings = array();
        foreach ($result['warnings'] as $warning) {
            // ZIP entries can carry hostile filenames (HTML, control chars);
            // these strings also leave through the REST response, where other
            // clients may not render them as safely as the admin UI does.
            $file = isset($warning['file']) ? sanitize_text_field($warning['file']) : '';
            if (isset($warning['code']) && $warning['code'] === 'woff2_filename_guess') {
                $warnings[] = sprintf(
                    /* translators: %s: font file name */
                    esc_html__('%s is a WOFF2 file. The server cannot read WOFF2 metadata, so the plugin guessed the font family and weight from the filename. Please review the generated font styles.', 'typography-stylist'),
                    $file
                );
            } else {
                $warnings[] = sprintf(
                    /* translators: %s: font file name */
                    esc_html__('Could not read the font metadata from %s, so the plugin guessed the font family and weight from the filename. Please review the generated font styles.', 'typography-stylist'),
                    $file
                );
            }
        }

        return array(
            'path'     => $css_path,
            'warnings' => $warnings,
        );
    }

    /**
     * Get non-fatal warnings from the most recent font kit upload
     *
     * @since 2.1.0
     * @return string[] Translated warning messages (empty when none).
     */
    public function get_font_kit_warnings() {
        return $this->font_kit_warnings;
    }

    /**
     * Extract @font-face CSS rules for a specific font family
     *
     * @param string $css_content Full CSS content
     * @param string $family Font family name
     * @return string CSS containing only @font-face rules for this family
     */
    private function extract_font_face_css($css_content, $family) {
        $family_css = '';

        // Find all @font-face blocks that match this family
        // Updated regex to properly handle multi-line @font-face with nested braces
        preg_match_all('/@font-face\s*\{((?:[^{}]+|\{[^{}]*\})*)\}/is', $css_content, $matches, PREG_SET_ORDER);

        foreach ($matches as $match) {
            $font_face_block = $match[0];
            $font_face_content = $match[1];

            // Check if this block contains the target family
            if (preg_match('/font-family:\s*["\']?' . preg_quote($family, '/') . '["\']?/i', $font_face_content)) {
                $family_css .= $font_face_block . "\n\n";
            }
        }

        return $family_css;
    }

    /**
     * Rewrite relative URLs in CSS to absolute WordPress URLs
     */
    public function rewrite_css_urls($css_content, $base_url) {
        // Replace url('path') with url('absolute-path')
        $css_content = preg_replace_callback(
            "/url\s*\(\s*['\"]?([^)'\"\s]+)['\"]?\s*\)/i",
            function($matches) use ($base_url) {
                $url = $matches[1];

                // Skip if already absolute URL or data URI
                if (preg_match('/^(https?:)?\/\//', $url) || strpos($url, 'data:') === 0) {
                    return $matches[0];
                }

                // Convert relative to absolute, then extract path only (protocol-agnostic)
                $absolute_url = rtrim($base_url, '/') . '/' . ltrim($url, '/');
                $parsed = parse_url($absolute_url);

                // If parsing fails or no path, keep original
                if ($parsed === false || !isset($parsed['path'])) {
                    return $matches[0];
                }

                // Build relative URL with sanitized query string and fragment if present
                $relative_url = $parsed['path'];

                // Add query string if present and safe (validate against injection)
                if (isset($parsed['query']) && $parsed['query'] !== '') {
                    // Allow only safe URL query characters (alphanumeric, dash, underscore, percent, equals, ampersand, dot)
                    if (preg_match('/^[a-zA-Z0-9_\-=&%.]+$/', $parsed['query'])) {
                        $relative_url .= '?' . $parsed['query'];
                    }
                }

                // Add fragment if present and safe (common in font URLs like #iefix)
                if (isset($parsed['fragment']) && $parsed['fragment'] !== '') {
                    // Allow alphanumeric, dash, underscore (covers #iefix, #svg-id, etc.)
                    if (preg_match('/^[a-zA-Z0-9_\-]+$/', $parsed['fragment'])) {
                        $relative_url .= '#' . $parsed['fragment'];
                    }
                }

                return "url('" . $relative_url . "')";
            },
            $css_content
        );

        return $css_content;
    }

    /**
     * Sanitize uploaded font CSS content
     *
     * Removes dangerous CSS rules like @import, external URLs, and non-@font-face declarations
     * to prevent CSS injection attacks and data exfiltration.
     *
     * @param string $css_content Raw CSS content from uploaded font kit
     * @return string Sanitized CSS content containing only safe @font-face rules
     */
    private function sanitize_font_css($css_content) {
        // Remove @import statements (can load external stylesheets)
        $css_content = preg_replace('/@import\s+[^;]+;/i', '', $css_content);

        // Extract only @font-face blocks
        // Updated regex to properly handle multi-line @font-face with nested braces
        // Note: We only extract @font-face blocks (whitelisting), so no need to
        // explicitly remove other @-rules - they're ignored automatically.
        preg_match_all(
            '/@font-face\s*\{(?:[^{}]+|\{[^{}]*\})*\}/is',
            $css_content,
            $matches
        );

        if (empty($matches[0])) {
            return '';
        }

        $sanitized_font_faces = array();
        foreach ($matches[0] as $font_face) {
            // Validate each @font-face block
            if ($this->validate_font_face_block($font_face)) {
                $sanitized_font_faces[] = $font_face;
            }
        }

        return implode("\n\n", $sanitized_font_faces);
    }

    /**
     * Validate a single @font-face block
     *
     * Ensures the @font-face block contains required properties and no external URLs.
     * URLs are validated against the WordPress uploads directory path, not the site URL,
     * to handle protocol mismatches and CDN configurations.
     *
     * @param string $font_face_block A single @font-face {...} block
     * @return bool True if valid and safe
     */
    private function validate_font_face_block($font_face_block) {
        // Must contain font-family
        if (!preg_match('/font-family\s*:/i', $font_face_block)) {
            return false;
        }

        // Must contain src with valid URL or local()
        if (!preg_match('/src\s*:/i', $font_face_block)) {
            return false;
        }

        // Extract all URLs from the @font-face block
        preg_match_all('/url\s*\(\s*[\'"]?([^\)\'"\s]+)[\'"]?\s*\)/i', $font_face_block, $url_matches);

        if (empty($url_matches[1])) {
            // No URLs found - might use local() only, which is fine
            return true;
        }

        // Get hosts for validation (cache in static variables for performance)
        static $upload_host = null;
        static $site_host = null;

        if ($upload_host === null) {
            $upload_dir = wp_upload_dir();
            $upload_url_parts = wp_parse_url($upload_dir['baseurl']);
            $upload_host = isset($upload_url_parts['host']) ? strtolower($upload_url_parts['host']) : '';

            $site_url_parts = wp_parse_url(get_site_url());
            $site_host = isset($site_url_parts['host']) ? strtolower($site_url_parts['host']) : '';
        }

        // Check each URL
        foreach ($url_matches[1] as $url) {
            // Allow data URIs (embedded fonts)
            if (stripos($url, 'data:') === 0) {
                continue;
            }

            // Check if this is an absolute URL (contains ://)
            if (preg_match('/^https?:\/\//i', $url)) {
                // Parse the URL
                $url_parts = wp_parse_url($url);
                if ($url_parts === false) {
                    return false; // Malformed URL
                }

                $url_host = isset($url_parts['host']) ? strtolower($url_parts['host']) : '';
                $url_path = isset($url_parts['path']) ? $url_parts['path'] : '';

                // Validate the URL is from our WordPress installation
                // Check both upload host and site host to handle CDN configurations
                $is_local_host = (
                    $url_host === $upload_host ||
                    $url_host === $site_host ||
                    $url_host === 'localhost' ||
                    $url_host === '127.0.0.1' ||
                    $url_host === '[::1]'  // IPv6 localhost
                );

                if (!$is_local_host) {
                    // External host detected - reject
                    return false;
                }

                // Verify the path points to our uploads directory
                // Normalize path to prevent traversal attacks (e.g., /malicious/../wp-content/uploads/typography-stylist/fonts/)
                $normalized_path = preg_replace('#/+#', '/', $url_path); // Collapse multiple slashes
                $normalized_path = preg_replace('#/\.\./|/\./#', '/', $normalized_path); // Remove . and ..

                if (strpos($normalized_path, '/wp-content/uploads/typography-stylist/fonts/') === false) {
                    // URL is from our host but not in our uploads directory - reject
                    return false;
                }
            }
            // Relative URLs are fine - they'll be rewritten by rewrite_css_urls()
        }

        return true;
    }

    /**
     * Validate file is actually a font file by checking magic numbers
     *
     * Prevents PHP files or other malicious content from being uploaded with font extensions.
     * Uses hybrid approach: tries native fopen/fread for performance (reads only 4 bytes),
     * falls back to WP_Filesystem if fopen is disabled.
     *
     * @param string $file_path Path to file
     * @return bool True if valid font file
     */
    private function is_valid_font_file($file_path) {
        // Check if file exists first
        if (!file_exists($file_path)) {
            return false;
        }

        // Get file size to validate it's not empty
        $size = filesize($file_path);
        if ($size === false || $size < 4) {
            return false;
        }

        // Try native PHP file reading first (most performant - only reads 4 bytes)
        // phpcs:disable WordPress.WP.AlternativeFunctions.file_system_operations_fopen -- Performance: only reads 4 bytes vs loading entire 1-3MB font file
        if (function_exists('fopen') && ini_get('allow_url_fopen')) {
            $handle = @fopen($file_path, 'rb');
            if ($handle !== false) {
                // phpcs:disable WordPress.WP.AlternativeFunctions.file_system_operations_fread -- Performance: only reads 4 bytes vs loading entire font file
                $magic = fread($handle, 4);
                // phpcs:enable WordPress.WP.AlternativeFunctions.file_system_operations_fread
                // phpcs:disable WordPress.WP.AlternativeFunctions.file_system_operations_fclose
                fclose($handle);
                // phpcs:enable WordPress.WP.AlternativeFunctions.file_system_operations_fclose

                if ($magic !== false && strlen($magic) === 4) {
                    return $this->validate_font_magic_number($magic);
                }
            }
        }
        // phpcs:enable WordPress.WP.AlternativeFunctions.file_system_operations_fopen

        // Fallback to WP_Filesystem for compatibility
        // This loads entire file but ensures compatibility with restrictive environments
        global $wp_filesystem;
        if (empty($wp_filesystem)) {
            require_once ABSPATH . 'wp-admin/includes/file.php';
            WP_Filesystem();
        }

        if (!$wp_filesystem->exists($file_path)) {
            return false;
        }

        // Only use get_contents as fallback
        // Modern web fonts can be 1-3MB, so this isn't ideal but necessary for compatibility
        $contents = $wp_filesystem->get_contents($file_path);
        if ($contents === false || strlen($contents) < 4) {
            return false;
        }

        $magic = substr($contents, 0, 4);
        return $this->validate_font_magic_number($magic);
    }

    /**
     * Validate font file magic number (file signature)
     *
     * @param string $magic First 4 bytes of file
     * @return bool True if valid font signature
     */
    private function validate_font_magic_number($magic) {
        // Check for known font file magic numbers (signatures)
        $valid_signatures = array(
            'wOFF', // WOFF
            'wOF2', // WOFF2
            "\x00\x01\x00\x00", // TrueType/OpenType with TrueType outlines
            "OTTO", // OpenType with CFF outlines
            "true", // TrueType (old Mac)
            "typ1", // PostScript Type 1
        );

        foreach ($valid_signatures as $signature) {
            if (substr($magic, 0, strlen($signature)) === $signature) {
                return true;
            }
        }

        // EOT (Embedded OpenType) - basic detection
        // EOT headers typically start with two 0x00 bytes
        if (strlen($magic) >= 2 && substr($magic, 0, 2) === "\x00\x00") {
            return true;
        }

        return false;
    }
}

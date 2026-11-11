<?php
/**
 * Editor, block canvas and admin asset enqueueing for Typography Stylist
 *
 * Enqueues the block editor's scripts and styles with the localized
 * typostData, the font CSS for the editor popover previews, the editor
 * canvas (iframe) and the admin settings page, and the settings page's own
 * scripts and styles. Extracted from the Typost class (#360). The hooks stay
 * registered on Typost, whose public enqueue methods delegate here, so
 * remove_action() calls that name Typost::get_instance() keep working.
 *
 * Frontend enqueueing stays with the frontend font detection it depends on.
 *
 * @internal Reach it through Typost's public methods.
 * @since 2.4.0
 */

if (!defined('ABSPATH')) {
    exit;
}

class Typost_Assets {

    /**
     * The plugin instance.
     *
     * @var Typost
     */
    private $typost;

    /**
     * @param Typost $typost Plugin instance.
     */
    public function __construct($typost) {
        $this->typost = $typost;
    }

    /**
     * Enqueue block assets (loads in both editor iframe and frontend)
     * This hook fires for both editor and frontend
     */
    public function enqueue_block_assets() {
        // Only load fonts in editor context, not frontend
        // Frontend uses enqueue_frontend_assets() with optimized loading
        if (is_admin()) {
            $this->typost->enqueue_custom_fonts_for_blocks();
            $this->typost->enqueue_adobe_fonts();

            // Note: CSS variables are output via admin_head hook
            // in output_font_css_variables() method for reliable iframe injection
        }
    }

    /**
     * Enqueue block editor assets (toolbar, popover, etc.)
     */
    public function enqueue_block_editor_assets() {
        $suffix = (defined('SCRIPT_DEBUG') && SCRIPT_DEBUG) ? '' : '.min';

        // Enqueue fonts for popover preview
        $this->typost->enqueue_custom_fonts_for_editor();
        $this->typost->enqueue_adobe_fonts();

        // Editor styles
        wp_enqueue_style(
            'typost-block-editor',
            TYPOST_PLUGIN_URL . "assets/css/block-editor{$suffix}.css",
            array('wp-edit-blocks'),
            TYPOST_VERSION
        );

        // Adobe Fonts kits on demand (#230). Hand-written ES5, no build step.
        // A dependency of the editor script, so window.typostFontKits exists
        // before any editor code asks it for a kit.
        wp_register_script(
            'typost-editor-font-kits',
            TYPOST_PLUGIN_URL . 'assets/js/editor-font-kits.js',
            array('wp-data'),
            TYPOST_VERSION,
            true
        );

        // Editor JavaScript
        wp_enqueue_script(
            'typost-block-editor',
            // Always the built file: the source holds require() and JSX, so a
            // browser cannot run it, with SCRIPT_DEBUG on or off.
            TYPOST_PLUGIN_URL . "assets/js/block-editor.min.js",
            array(
                'typost-editor-font-kits',
                'wp-blocks',
                'wp-element',
                'wp-components',
                'wp-data',
                'wp-rich-text',
                'wp-block-editor',
                'wp-i18n',
                'wp-compose',
                // The inline modal announces its word-boundary notice through
                // wp.a11y.speak once the dialog has been read (SR-1).
                'wp-a11y'
            ),
            TYPOST_VERSION,
            true
        );

        // Enable JavaScript translations.
        //
        // The domain must be the one the strings themselves declare. Every
        // __() call in the editor scripts uses 'typography-stylist' (the
        // plugin's Text Domain header); this argument said 'typost', so
        // WordPress looked for a catalogue under a domain no string belongs
        // to and the editor's JS strings could never be translated. The
        // bundled modules already pass their own matching domains.
        wp_set_script_translations(
            'typost-block-editor',
            'typography-stylist',
            TYPOST_PLUGIN_DIR . 'languages'
        );

        // Cache the localized data with transient
        // Note: nonce is added after cache read since it's session-specific
        $cache_key = 'typost_editor_data_' . get_current_user_id();
        $localized_data = get_transient($cache_key);

        if (false === $localized_data) {
            $localized_data = array(
                'presets' => $this->typost->get_presets(),
                'features' => $this->typost->get_available_features(),
                'fonts' => $this->typost->get_custom_fonts(),
                'adobeFonts' => $this->typost->get_adobe_fonts(),
                'manualFonts' => $this->typost->get_manual_fonts(),
                'fontFeatureVisibility' => $this->typost->get_font_feature_visibility(),
                'fontOrder' => $this->typost->get_font_order(),
                'wpFontLibraryFonts' => $this->typost->get_wp_font_library_fonts(),
                'adoptedWpFonts' => $this->typost->get_adopted_wp_fonts_by_slug(),
                'pluginRegisteredSlugs' => $this->typost->get_plugin_registered_slugs(),
                // Deleted font ID => replacement font ID. editor-font-kits.js
                // loads the replacement's Adobe kit for content that still
                // names the deleted ID (clear_cache() drops this transient
                // whenever a mapping changes).
                'fontReplacements' => (object) $this->get_replacement_mappings_for_editor(),
                'restUrl' => rest_url('typost/v1/'),
                // Cast every flag: these options are stored as '1'/'0' strings,
                // and wp_localize_script() stringifies whatever it is given —
                // so an uncast '0' reaches JavaScript as the string "0", which
                // is truthy. Every one of these settings silently did nothing
                // when switched off until 2.3.0. (A bool becomes "" / "1".)
                'disableAccessibilityWarning' => (bool) get_option('typost_disable_accessibility_warning', false),
                'showClearConfirmation' => (bool) get_option('typost_show_clear_confirmation', true),
                // When true (default), Enter inside a Typography Stylist block
                // inserts a line break; when false the block declares core's
                // `splitting` support and Enter starts a new block instead.
                'blockEnterLineBreak' => (bool) get_option('typost_block_enter_line_break', true),
                // Unit new content writes its font sizes in (#248): 'rem' by
                // default (#233), 'px' when "Write new font sizes in px" is on.
                // A string, not a bool, so it can never arrive as a truthy "0".
                'newFontSizeUnit' => $this->typost->get_new_font_size_unit(),
                'settingsUrl' => admin_url('options-general.php?page=typography-stylist')
            );

            // Cache for 1 hour
            set_transient($cache_key, $localized_data, HOUR_IN_SECONDS);
        }

        // Add nonce after cache read (session-specific, must not be cached)
        $localized_data['nonce'] = wp_create_nonce('wp_rest');

        /**
         * Filter editor data passed to JavaScript as typostData.
         *
         * Allows extension plugins to add their own data to the editor context.
         * This data is available in both the inline editor (block-editor.js) and
         * the Typography Stylist block editor (edit.js).
         *
         * @since 2.0.0
         * @param array $localized_data Editor data array.
         */
        $localized_data = apply_filters('typost_editor_data', $localized_data);

        // Re-inject nonce after filter to prevent extensions from overwriting it
        $localized_data['nonce'] = wp_create_nonce('wp_rest');

        // Pass data to JavaScript
        wp_localize_script('typost-block-editor', 'typostData', $localized_data);

        /**
         * Fires after core editor assets are enqueued.
         *
         * Allows extension plugins to enqueue their own editor scripts and styles
         * with 'typost-block-editor' as a dependency.
         *
         * @since 2.0.0
         */
        do_action('typost_editor_assets');
    }

    /**
     * Enqueue admin page assets
     */
    public function enqueue_admin_assets() {
        $suffix = (defined('SCRIPT_DEBUG') && SCRIPT_DEBUG) ? '' : '.min';

        wp_enqueue_style(
            'typost-admin',
            TYPOST_PLUGIN_URL . "assets/css/admin-page{$suffix}.css",
            array(),
            TYPOST_VERSION
        );

        // Color scheme CSS variable overrides. (The once-per-request guard
        // went with the old admin_print_* double hook, #226.)
        $this->typost->output_admin_color_scheme();

        wp_enqueue_script(
            'typost-admin',
            TYPOST_PLUGIN_URL . "assets/js/admin-page{$suffix}.js",
            array('jquery', 'jquery-ui-sortable'),
            TYPOST_VERSION,
            true
        );

        // Enqueue custom fonts for preview. The @font-face rules cost nothing
        // until text uses them. Adobe Fonts kit stylesheets are NOT enqueued
        // here: admin-page.js adds a kit's <link> when an element that uses
        // one of its fonts comes into view (#226 — the settings page loaded
        // every kit, 77 on a large site, on every visit and every tab).
        $this->typost->enqueue_custom_fonts_for_admin();

        // Localize script for translations and data
        $admin_data = array(
            'restUrl' => rest_url('typost/v1/'),
            'nonce' => wp_create_nonce('wp_rest'),
            'fonts' => $this->typost->get_custom_fonts(),
            'adobeFonts' => $this->typost->get_adobe_fonts(),
            'manualFonts' => $this->typost->get_manual_fonts(),
            'replacements' => $this->typost->font_sources()->get_font_replacements(),
            'fontFeatureVisibility' => $this->typost->get_font_feature_visibility(),
            'features' => $this->typost->get_available_features(),
            'featureCategoryTitles' => $this->typost->get_feature_category_titles(),
            'fontOrder' => $this->typost->get_font_order(),
            'wpFontLibraryFonts' => $this->typost->get_wp_font_library_fonts(),
            'strings' => array(
                'confirmDelete' => esc_html__('Are you sure you want to delete this font kit?', 'typography-stylist'),
                'uploadError' => esc_html__('Failed to upload font kit.', 'typography-stylist'),
                'selectZip' => esc_html__('Please select a ZIP file (.zip)', 'typography-stylist'),
                'selectFile' => esc_html__('Please select a ZIP file.', 'typography-stylist'),
                'uploadSuccess' => esc_html__('Font kit uploaded and processed successfully!', 'typography-stylist'),
                'deleteError' => esc_html__('Failed to delete font kit.', 'typography-stylist'),
                'deleteFontSuccess' => esc_html__('Font deleted successfully!', 'typography-stylist'),
                'deleteFontFailed' => esc_html__('Failed to delete font.', 'typography-stylist'),
                'replacementFailed' => esc_html__('Failed to create font replacement.', 'typography-stylist'),
                'deleting' => esc_html__('Deleting…', 'typography-stylist'),
                'noFonts' => esc_html__('No custom fonts uploaded yet.', 'typography-stylist'),
                'uploadPrompt' => esc_html__('Upload a webfont kit using the form below to add custom fonts with OpenType features.', 'typography-stylist'),
                'uploading' => esc_html__('Uploading', 'typography-stylist'),
                'uploadingZip' => esc_html__('Uploading ZIP file…', 'typography-stylist'),
                'processing' => esc_html__('Processing…', 'typography-stylist'),
                'uploadButton' => esc_html__('Upload Font Kit', 'typography-stylist'),
                // Adobe Fonts strings
                'enterAdobeEmbedCode' => esc_html__('Please paste the Adobe Fonts embed code.', 'typography-stylist'),
                'enterAdobeFontFamilies' => esc_html__('Please enter at least one font family name.', 'typography-stylist'),
                'adding' => esc_html__('Adding…', 'typography-stylist'),
                'adobeFontSuccess' => esc_html__('Adobe Fonts project added.', 'typography-stylist'),
                /* translators: %d: number of fonts in the project (two or more). Worded as "Fonts: %d" so no plural form is needed; the admin script has no _n(). */
                'adobeFontsSuccessCount' => esc_html__('Adobe Fonts project added. Fonts: %d.', 'typography-stylist'),
                'addAdobeFontError' => esc_html__('Failed to add Adobe Fonts project.', 'typography-stylist'),
                'addAdobeFontButton' => esc_html__('Add Adobe Fonts Project', 'typography-stylist'),
                'confirmDeleteAdobeFont' => esc_html__('Are you sure you want to delete this Adobe Fonts project?', 'typography-stylist'),
                'deleteAdobeFontError' => esc_html__('Failed to delete Adobe Fonts project.', 'typography-stylist'),
                // Manual/Custom Fonts strings
                'enterManualFontName' => esc_html__('Please enter a font name.', 'typography-stylist'),
                'enterFontFamily' => esc_html__('Please enter a CSS font-family value.', 'typography-stylist'),
                'manualFontSuccess' => esc_html__('Custom font added successfully!', 'typography-stylist'),
                'addManualFontError' => esc_html__('Failed to add custom font.', 'typography-stylist'),
                'addManualFontButton' => esc_html__('Add Custom Font', 'typography-stylist'),
                'confirmDeleteManualFont' => esc_html__('Are you sure you want to delete this custom font?', 'typography-stylist'),
                'deleteManualFontError' => esc_html__('Failed to delete custom font.', 'typography-stylist'),
                // Font loading setting strings
                'updateSettingError' => esc_html__('Failed to update font loading setting.', 'typography-stylist'),
                // Edit font strings
                'saving' => esc_html__('Saving…', 'typography-stylist'),
                'saveChanges' => esc_html__('Save Changes', 'typography-stylist'),
                'fallbacksUpdated' => esc_html__('Fallback fonts updated successfully!', 'typography-stylist'),
                'updateFallbacksError' => esc_html__('Failed to update fallback fonts.', 'typography-stylist'),
                'fontUpdated' => esc_html__('Font updated successfully!', 'typography-stylist'),
                'updateFontError' => esc_html__('Failed to update font.', 'typography-stylist'),
                // Feature visibility strings
                'featureVisibilitySaved' => esc_html__('Saved', 'typography-stylist'),
                'featureVisibilityError' => esc_html__('Failed to save feature visibility.', 'typography-stylist'),
                'enableAll' => esc_html__('Enable All', 'typography-stylist'),
                'disableAll' => esc_html__('Disable All', 'typography-stylist'),
                // Font order strings
                'orderSaveError' => esc_html__('Failed to save font order.', 'typography-stylist'),
                // WP Font Library strings
                'wpLibraryBadge' => esc_html__('WP Library', 'typography-stylist'),
                'manageInEditor' => esc_html__('Manage in Appearance → Editor', 'typography-stylist'),
                // WP Font Library registration strings
                'wplRegistering' => esc_html__('Registering…', 'typography-stylist'),
                'wplRegisterSuccess' => esc_html__('Font registered in the Font Library!', 'typography-stylist'),
                'wplRegisterError' => esc_html__('Failed to register the font in the Font Library.', 'typography-stylist'),
                'wplRemoving' => esc_html__('Removing…', 'typography-stylist'),
                'wplRemoveSuccess' => esc_html__('Font removed from the Font Library!', 'typography-stylist'),
                'wplRemoveError' => esc_html__('Failed to remove the font from the Font Library.', 'typography-stylist'),
                'wplConfirmRemove' => esc_html__('Remove this font from the WordPress Font Library? Existing content does not change, because the plugin then loads the font files itself.', 'typography-stylist'),
                /* translators: 1: number of registered fonts, 2: number of failed fonts */
                'wplBulkDone' => esc_html__('Registered %1$s font(s) in the Font Library (%2$s failed).', 'typography-stylist'),
                // Weight auto-detection strings
                'detectWeightsRunning' => esc_html__('Detecting weights…', 'typography-stylist'),
                /* translators: 1: fonts with detected weights, 2: fonts left with all weights, 3: fonts that could not be checked */
                'detectWeightsDone' => esc_html__('Weights detected for %1$s font(s); %2$s kept all weights; %3$s could not be checked.', 'typography-stylist'),
                'detectWeightsError' => esc_html__('Weight detection failed. Please try again.', 'typography-stylist'),
                // AJAX refresh strings
                'fontListUpdated' => esc_html__('Font list updated.', 'typography-stylist'),
                'refreshError' => esc_html__('Could not refresh the font list. Reloading the page instead.', 'typography-stylist'),
                'dismissNotice' => esc_html__('Dismiss this notice.', 'typography-stylist'),
                // Settings forms AJAX strings
                'savingSettings' => esc_html__('Saving…', 'typography-stylist'),
                'optionsSaved' => esc_html__('Options saved successfully.', 'typography-stylist'),
                'optionsSaveError' => esc_html__('Failed to save options.', 'typography-stylist'),
                'accessibilitySaved' => esc_html__('Accessibility settings saved successfully.', 'typography-stylist'),
                'accessibilitySaveError' => esc_html__('Failed to save accessibility settings.', 'typography-stylist'),
                'cacheCleared' => esc_html__('Font cache cleared successfully. Fonts will be re-detected on the next page load.', 'typography-stylist'),
                'cacheClearError' => esc_html__('Failed to clear the font cache.', 'typography-stylist'),
                'tipsReset' => esc_html__('Editor tips will show again the next time you open a Typography Stylist panel in this browser.', 'typography-stylist'),
                'tipsResetError' => esc_html__('Could not reset the editor tips. Your browser blocks site storage.', 'typography-stylist'),
                // Replacement Fonts tab strings (rendered by admin-page.js)
                'unknownFont' => esc_html__('Unknown Font', 'typography-stylist'),
                'deletedFont' => esc_html__('Deleted Font', 'typography-stylist'),
                'replacementFont' => esc_html__('Replacement Font', 'typography-stylist'),
                'globalLoad' => esc_html__('Global Load', 'typography-stylist'),
                'actions' => esc_html__('Actions', 'typography-stylist'),
                /* translators: %s: numeric font ID */
                'fontIdLabel' => esc_html__('ID: %s', 'typography-stylist'),
                /* translators: 1: font name, 2: numeric font ID */
                'fontOptionWithId' => esc_html__('%1$s (ID: %2$s)', 'typography-stylist'),
                'noReplacements' => esc_html__('No font replacements configured.', 'typography-stylist'),
                /* translators: %s: comma-separated list of font IDs */
                'unassignedIds' => esc_html__('Unassigned IDs: %s', 'typography-stylist'),
                'edit' => esc_html__('Edit', 'typography-stylist'),
                'remove' => esc_html__('Remove', 'typography-stylist'),
                'editReplacementTitle' => esc_html__('Edit Font Replacement', 'typography-stylist'),
                'updateReplacement' => esc_html__('Update Replacement', 'typography-stylist'),
                /* translators: %s: numeric font ID */
                'editReplacementDescription' => esc_html__('Select a new replacement font for ID %s.', 'typography-stylist'),
                'invalidFontId' => esc_html__('Invalid font ID. Please refresh the page and try again.', 'typography-stylist'),
                'confirmRemoveReplacement' => esc_html__('Remove this font replacement mapping?', 'typography-stylist'),
                'removeReplacementError' => esc_html__('Failed to remove replacement.', 'typography-stylist'),
                'globalLoadUpdateError' => esc_html__('Failed to update global load setting.', 'typography-stylist'),
                'selectDeletedId' => esc_html__('Please select a deleted font ID.', 'typography-stylist'),
                'selectReplacementFont' => esc_html__('Please select a replacement font.', 'typography-stylist'),
                'invalidFontIdZero' => esc_html__('Invalid font ID (0). Please select a valid ID.', 'typography-stylist'),
                'addReplacementButton' => esc_html__('Add Replacement', 'typography-stylist'),
                'replacementAdded' => esc_html__('Replacement mapping added successfully!', 'typography-stylist'),
                'addReplacementError' => esc_html__('Failed to add replacement mapping.', 'typography-stylist')
            )
        );

        /**
         * Filter admin page data passed to JavaScript as typostAdmin.
         *
         * Allows extension plugins to add their own data to the admin page context.
         *
         * @since 2.0.0
         * @param array $admin_data Admin data array.
         */
        $admin_data = apply_filters('typost_admin_localize_data', $admin_data);

        // Re-inject nonce after filter to prevent extensions from overwriting it
        $admin_data['nonce'] = wp_create_nonce('wp_rest');

        wp_localize_script('typost-admin', 'typostAdmin', $admin_data);

        /**
         * Fires after core admin assets are enqueued.
         *
         * Allows extension plugins to enqueue their own admin scripts and styles
         * with 'typost-admin' as a dependency.
         *
         * @since 2.0.0
         */
        do_action('typost_admin_assets');
    }

    /**
     * Enqueue custom fonts for admin page preview
     */
    public function enqueue_custom_fonts_for_admin() {
        $combined_css = $this->typost->get_admin_font_css();

        if (!empty($combined_css)) {
            wp_add_inline_style('typost-admin', $combined_css);
        }
    }

    /**
     * Enqueue custom fonts for block rendering in editor canvas iframe
     * This is called by enqueue_block_assets hook
     */
    public function enqueue_custom_fonts_for_blocks() {
        // Register/enqueue the handle and attach the --font-N CSS variables
        // unconditionally: the iframed editor canvas (WP 6.3+) only receives
        // styles enqueued on this hook, and Adobe/manual/Library fonts need the
        // variables even when no uploaded webfont kits exist.
        wp_register_style('typost-block-fonts', false, array(), TYPOST_VERSION);
        wp_enqueue_style('typost-block-fonts');

        // CSS variables must be added as raw CSS (not wrapped in <style> tags)
        $css_vars = $this->typost->get_font_css_variables();
        if (!empty($css_vars)) {
            wp_add_inline_style('typost-block-fonts', $css_vars);
        }

        $fonts = $this->typost->get_custom_fonts();
        $adopted_fonts = $this->typost->get_adopted_fonts_for_face_printing();

        if (empty($fonts) && empty($adopted_fonts)) {
            return;
        }

        // Cache combined font CSS. Adopted Library fonts are included
        // unconditionally here (the iframe only receives WordPress's own
        // @font-face for ACTIVATED families; a duplicate for one that is
        // activated is harmless), so the static cache key stays valid.
        $cache_key = 'typost_block_font_css';
        $combined_css = get_transient($cache_key);

        if (false === $combined_css) {
            $combined_css = $this->typost->get_adopted_font_face_css($adopted_fonts);
            foreach ($fonts as $font) {
                if (!empty($font['css_content'])) {
                    // Sanitize CSS before adding and ensure URLs are relative
                    $combined_css .= "\n" . $this->typost->ensure_relative_font_urls($this->typost->sanitize_css_content($font['css_content']));
                }
            }

            // Minify (remove CSS comments, then collapse whitespace)
            $combined_css = preg_replace('/\/\*.*?\*\//s', '', $combined_css);
            $combined_css = preg_replace('/\s+/', ' ', $combined_css);
            $combined_css = trim($combined_css);

            // Cache for 24 hours
            set_transient($cache_key, $combined_css, DAY_IN_SECONDS);
        }

        if (!empty($combined_css)) {
            wp_add_inline_style('typost-block-fonts', $combined_css);
        }
    }

    /**
     * Enqueue custom fonts for block editor (deprecated - keeping for popover preview)
     *
     * Serves the editor PARENT document (toolbar popover previews), which
     * enqueue_custom_fonts_for_blocks() does not reach. Includes adopted
     * WP Font Library fonts on the same unconditional basis.
     */
    public function enqueue_custom_fonts_for_editor() {
        $fonts = $this->typost->get_custom_fonts();
        $adopted_fonts = $this->typost->get_adopted_fonts_for_face_printing();

        if (empty($fonts) && empty($adopted_fonts)) {
            return;
        }

        // Cache combined font CSS
        $cache_key = 'typost_editor_font_css';
        $combined_css = get_transient($cache_key);

        if (false === $combined_css) {
            $combined_css = $this->typost->get_adopted_font_face_css($adopted_fonts);
            foreach ($fonts as $font) {
                if (!empty($font['css_content'])) {
                    // Sanitize CSS before adding and ensure URLs are relative
                    $combined_css .= "\n" . $this->typost->ensure_relative_font_urls($this->typost->sanitize_css_content($font['css_content']));
                }
            }

            // Minify (remove CSS comments, then collapse whitespace)
            $combined_css = preg_replace('/\/\*.*?\*\//s', '', $combined_css);
            $combined_css = preg_replace('/\s+/', ' ', $combined_css);
            $combined_css = trim($combined_css);

            // Cache for 24 hours
            set_transient($cache_key, $combined_css, DAY_IN_SECONDS);
        }

        if (!empty($combined_css)) {
            // Register a separate handle for fonts in the popover/toolbar context
            wp_register_style('typost-editor-fonts', false, array(), TYPOST_VERSION);
            wp_enqueue_style('typost-editor-fonts');
            wp_add_inline_style('typost-editor-fonts', $combined_css);
        }
    }

    /**
     * Replacement mappings as positive integer pairs, for typostData.
     *
     * @since 2.3.1
     * @return array Deleted font ID => replacement font ID.
     */
    private function get_replacement_mappings_for_editor() {
        $replacements = $this->typost->font_sources()->get_font_replacements();
        $mappings     = (isset($replacements['mappings']) && is_array($replacements['mappings'])) ? $replacements['mappings'] : array();
        $out          = array();
        foreach ($mappings as $deleted_id => $replacement_id) {
            $deleted_id     = (int) $deleted_id;
            $replacement_id = (int) $replacement_id;
            if ($deleted_id > 0 && $replacement_id > 0) {
                $out[$deleted_id] = $replacement_id;
            }
        }
        return $out;
    }
}

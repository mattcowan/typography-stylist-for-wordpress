<?php
/**
 * Admin settings page template
 *
 * This template is rendered by the Typography_Stylist::render_admin_page() method.
 * All variables are passed as function parameters to avoid global scope.
 */

// Exit if accessed directly
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Render the admin settings page template
 *
 * @param Typost $instance      Plugin instance
 * @param array              $presets       Array of user-created presets
 * @param array              $custom_fonts  Array of uploaded custom fonts
 * @param array              $adobe_fonts   Array of Adobe Fonts configurations
 * @param array              $manual_fonts  Array of manually defined fonts
 */
/**
 * Render available font weight checkboxes for the admin edit form
 *
 * @param array  $font       Font data array containing 'id' and optionally 'available_weights'.
 * @param string $prefix     CSS class/ID prefix for the font type (e.g., 'font', 'adobe', 'manual').
 * @param bool   $show_auto  Whether to show the auto-detected source note. The wording matches
 *                           the detection source per prefix: font files for uploaded kits,
 *                           the Adobe Fonts stylesheet for 'adobe'.
 */
function typost_render_weight_checkboxes($font, $prefix, $show_auto = false) {
    $weights = array(
        '100' => __('100 (Thin)', 'typography-stylist'),
        '200' => __('200 (Extra Light)', 'typography-stylist'),
        '300' => __('300 (Light)', 'typography-stylist'),
        '400' => __('400 (Normal)', 'typography-stylist'),
        '500' => __('500 (Medium)', 'typography-stylist'),
        '600' => __('600 (Semi Bold)', 'typography-stylist'),
        '700' => __('700 (Bold)', 'typography-stylist'),
        '800' => __('800 (Extra Bold)', 'typography-stylist'),
        '900' => __('900 (Black)', 'typography-stylist'),
    );
    $available = !empty($font['available_weights']) ? $font['available_weights'] : array();
    $all_available = empty($available); // Empty array = all weights available
    ?>
    <fieldset class="typost-form-field typost-weight-fieldset">
        <legend><?php esc_html_e('Available Font Weights:', 'typography-stylist'); ?></legend>
        <p class="description" id="typost-<?php echo esc_attr($prefix); ?>-weights-desc-<?php echo esc_attr($font['id']); ?>">
            <?php esc_html_e('Clear the weights that this font does not include. The editor then does not offer them. For a variable font, you can keep all weights selected.', 'typography-stylist'); ?>
            <?php if ($show_auto && !empty($font['available_weights'])): ?>
                <br><em><?php
                if ('adobe' === $prefix) {
                    esc_html_e('Auto-detected from the Adobe Fonts stylesheet.', 'typography-stylist');
                } else {
                    esc_html_e('Auto-detected from font files.', 'typography-stylist');
                }
                ?></em>
            <?php endif; ?>
        </p>
        <div class="typost-weight-checkboxes"
            aria-describedby="typost-<?php echo esc_attr($prefix); ?>-weights-desc-<?php echo esc_attr($font['id']); ?>">
            <?php foreach ($weights as $value => $label): ?>
                <label class="typost-weight-checkbox-label">
                    <input
                        type="checkbox"
                        class="typost-<?php echo esc_attr($prefix); ?>-weight-checkbox"
                        value="<?php echo esc_attr($value); ?>"
                        <?php checked($all_available || in_array((string) $value, $available, true)); ?> />
                    <?php echo esc_html($label); ?>
                </label>
            <?php endforeach; ?>
        </div>
    </fieldset>
    <?php
    /**
     * Fires after the weight checkboxes in a font edit form.
     *
     * Allows extension plugins to inject additional per-font settings
     * (e.g., variable font axes configuration) into the font edit form.
     *
     * @since 2.0.0
     * @param array  $font   The font data array.
     * @param string $prefix The font type prefix ('font', 'adobe', or 'manual').
     */
    do_action( 'typost_after_weight_checkboxes', $font, $prefix );
}

/**
 * Render the feature visibility section of a font edit form.
 *
 * Only the section shell is rendered here. admin-page.js builds the
 * category fieldsets and checkboxes (from typostAdmin.features,
 * .featureCategoryTitles and .fontFeatureVisibility) the first time the
 * section opens: rendered in PHP they were ~24 KB per font and 3.2 MB of the
 * settings page on a site with 134 fonts (#226). Saving already required
 * JavaScript, so there is no no-JS path to keep.
 *
 * @param array  $font     The font data array (must include 'font_id' numeric key).
 * @param object $instance The Typost plugin instance (unused since 2.3.1; kept
 *                         for the signature).
 *
 * @since 2.0.0
 */
function typost_render_feature_visibility_checkboxes($font, $instance) {
    $font_numeric_id = isset($font['font_id']) ? (int) $font['font_id'] : 0;
    if (!$font_numeric_id) {
        return;
    }
    ?>
    <details class="typost-form-field typost-feature-visibility-section" data-font-numeric-id="<?php echo esc_attr($font_numeric_id); ?>">
        <summary class="typost-feature-visibility-summary">
            <?php esc_html_e('Feature Visibility', 'typography-stylist'); ?>
            <span class="typost-feature-visibility-summary-hint"><?php esc_html_e('Control which features appear in the editor for this font', 'typography-stylist'); ?></span>
        </summary>
        <div class="typost-feature-visibility-form-controls">
            <div class="typost-form-visibility-master">
                <button type="button" class="button button-secondary typost-form-enable-all">
                    <?php esc_html_e('Enable All', 'typography-stylist'); ?>
                </button>
                <button type="button" class="button button-secondary typost-form-disable-all">
                    <?php esc_html_e('Disable All', 'typography-stylist'); ?>
                </button>
                <span class="typost-form-visibility-save-indicator typost-visibility-save-indicator" aria-live="polite"></span>
            </div>
            <div class="typost-form-visibility-categories"></div>
        </div>
    </details>
    <?php
}

/**
 * Render the <option> markup for the Font Features tab preview font selector.
 *
 * Used by the admin template and by the admin refresh REST endpoint so the
 * selector can be repopulated without a page reload.
 *
 * @param Typost $instance     Plugin instance.
 * @param array  $custom_fonts Uploaded font kits.
 * @param array  $adobe_fonts  Adobe Fonts entries.
 * @param array  $manual_fonts Manual font definitions.
 */
function typost_render_preview_font_options($instance, $custom_fonts, $adobe_fonts, $manual_fonts) {
    ?>
    <option value=""><?php esc_html_e('Default (system font)', 'typography-stylist'); ?></option>
    <?php
    // MyFonts uploaded fonts
    if (!empty($custom_fonts)) {
        echo '<optgroup label="' . esc_attr__('MyFonts Uploads', 'typography-stylist') . '">';
        foreach ($custom_fonts as $font) {
            if (!empty($font['font_faces'])) {
                $families = array_unique(array_map(function($face) {
                    return $face['family'];
                }, $font['font_faces']));

                $font_id = isset($font['font_id']) ? $font['font_id'] : '';
                foreach ($families as $family) {
                    echo '<option value="' . esc_attr($family) . '" data-font-id="' . esc_attr($font_id) . '">' . esc_html($family) . '</option>';
                }
            }
        }
        echo '</optgroup>';
    }

    // Adobe Fonts
    if (!empty($adobe_fonts)) {
        echo '<optgroup label="' . esc_attr__('Adobe Fonts', 'typography-stylist') . '">';
        foreach ($adobe_fonts as $font) {
            $font_id = isset($font['font_id']) ? $font['font_id'] : '';
            // New structure: individual font entries with font_family (single string)
            if (!empty($font['font_family'])) {
                echo '<option value="' . esc_attr($font['font_family']) . '" data-font-id="' . esc_attr($font_id) . '">' . esc_html($font['font_family']) . '</option>';
            }
            // Legacy structure: font entries with font_families (array)
            elseif (!empty($font['font_families'])) {
                foreach ($font['font_families'] as $family) {
                    echo '<option value="' . esc_attr($family) . '" data-font-id="' . esc_attr($font_id) . '">' . esc_html($family) . '</option>';
                }
            }
        }
        echo '</optgroup>';
    }

    // Manual fonts
    if (!empty($manual_fonts)) {
        echo '<optgroup label="' . esc_attr__('Custom Fonts', 'typography-stylist') . '">';
        foreach ($manual_fonts as $font) {
            if (!empty($font['font_family'])) {
                $font_id = isset($font['font_id']) ? $font['font_id'] : '';
                echo '<option value="' . esc_attr($font['font_family']) . '" data-font-id="' . esc_attr($font_id) . '">' . esc_html($font['name']) . '</option>';
            }
        }
        echo '</optgroup>';
    }

    // WP Font Library fonts (read-only source, WP 6.5+).
    // Display variant: families the plugin registered are
    // already listed as uploaded fonts above.
    $wpl_preview = $instance->get_wp_font_library_fonts_for_display();
    if (!empty($wpl_preview)) {
        echo '<optgroup label="' . esc_attr__('WP Library', 'typography-stylist') . '">';
        foreach ($wpl_preview as $wpl) {
            echo '<option value="' . esc_attr($wpl['font_family']) . '" data-font-id="">' . esc_html($wpl['name']) . '</option>';
        }
        echo '</optgroup>';
    }
}

/**
 * Number of font cards whose heading gets its font in the HTML.
 *
 * Roughly one screen of cards. A browser downloads the font of every
 * rendered heading, on screen or not (#226: 133 downloads for 7 visible
 * cards), so later cards carry the font in data-typost-font-family and
 * admin-page.js applies it when the card comes into view. A site with a
 * handful of fonts renders exactly as before, without waiting for JS.
 */
const TYPOST_ADMIN_EAGER_FONT_CARDS = 12;

/**
 * Attributes that give a font card heading its font.
 *
 * @since 2.3.1
 * @param string $font_family CSS font-family value ('' for none).
 * @param int    $font_id     Numeric font ID (0 for none). Lets admin-page.js
 *                            load the Adobe Fonts kit stylesheet for it.
 * @param int    $card_index  Zero-based position of the card in the list.
 * @return string Attribute string with a leading space, or ''.
 */
function typost_font_heading_attributes($font_family, $font_id, $card_index) {
    $attrs   = '';
    $font_id = (int) $font_id;
    if ($font_id > 0) {
        $attrs .= ' data-typost-font-id="' . esc_attr($font_id) . '"';
    }
    if ('' === (string) $font_family) {
        return $attrs;
    }
    if ((int) $card_index < TYPOST_ADMIN_EAGER_FONT_CARDS) {
        $attrs .= ' style="font-family: ' . esc_attr($font_family) . '"';
    } else {
        $attrs .= ' data-typost-font-family="' . esc_attr($font_family) . '"';
    }
    return $attrs;
}

/**
 * Render the Custom Fonts tab font-list section: the WP Font Library
 * migration notice, the weight auto-detection notice, the unified draggable
 * font list, and the empty state.
 *
 * Used by the admin template and by the admin refresh REST endpoint so the
 * whole section can be re-rendered without a page reload.
 *
 * @param Typost $instance     Plugin instance.
 * @param array  $custom_fonts Uploaded font kits.
 * @param array  $adobe_fonts  Adobe Fonts entries.
 * @param array  $manual_fonts Manual font definitions.
 */
function typost_render_font_list_section($instance, $custom_fonts, $adobe_fonts, $manual_fonts) {
    ?>
<?php
            // ── WP Font Library migration notice (opt-in, dismissible) ───────────────
            $wpl_bridge_available = $instance->font_library_bridge()->is_available();
            $wpl_unregistered_count = 0;
            if ($wpl_bridge_available) {
                foreach ($custom_fonts as $wpl_check_font) {
                    if (!$instance->font_library_bridge()->entry_has_live_registration($wpl_check_font)) {
                        $wpl_unregistered_count++;
                    }
                }
            }
            $wpl_notice_dismissed = (bool) get_option('typost_wp_library_notice_dismissed', false);
            ?>
            <?php if ($wpl_bridge_available && $wpl_unregistered_count > 0 && !$wpl_notice_dismissed) : ?>
            <div class="notice notice-info inline is-dismissible" id="typost-wpl-migration-notice">
                <p>
                    <strong><?php esc_html_e('WordPress Font Library integration available.', 'typography-stylist'); ?></strong>
                    <?php
                    printf(
                        /* translators: %d: number of uploaded fonts not yet registered */
                        esc_html(_n(
                            '%d uploaded font is not registered in the WordPress Font Library. When you register it, WordPress can use it like any other Library font. Existing content does not change, and you can undo the registration for each font at any time.',
                            '%d uploaded fonts are not registered in the WordPress Font Library. When you register them, WordPress can use them like any other Library font. Existing content does not change, and you can undo the registration for each font at any time.',
                            $wpl_unregistered_count,
                            'typography-stylist'
                        )),
                        (int) $wpl_unregistered_count
                    );
                    ?>
                </p>
                <p>
                    <button type="button" class="button button-primary" id="typost-wpl-bulk-register">
                        <?php esc_html_e('Register all in Font Library', 'typography-stylist'); ?>
                    </button>
                </p>
            </div>
            <?php endif; ?>

            <?php
            // ── Weight auto-detection notice for pre-existing fonts ──────────────────
            // Entries without the available_weights key predate weight detection
            // (or their Adobe stylesheet fetch failed) and were never manually
            // configured. Once every entry has the key, the notice disappears.
            $weight_detect_candidates = 0;
            foreach ($custom_fonts as $wd_font) {
                if (!array_key_exists('available_weights', $wd_font)) {
                    $weight_detect_candidates++;
                }
            }
            foreach ($adobe_fonts as $wd_font) {
                if (!array_key_exists('available_weights', $wd_font)) {
                    $weight_detect_candidates++;
                }
            }
            ?>
            <?php if ($weight_detect_candidates > 0) : ?>
            <div class="notice notice-info inline" id="typost-detect-weights-notice">
                <p>
                    <strong><?php esc_html_e('Font weight auto-detection available.', 'typography-stylist'); ?></strong>
                    <?php
                    printf(
                        /* translators: %d: number of fonts without detected weights */
                        esc_html(_n(
                            '%d font was added before weight detection existed, so all nine weights are turned on for it. Auto-detection selects only the weights that each font includes. It reads uploaded fonts from their font files, and Adobe Fonts from their kit stylesheet. You can change the selected weights at any time.',
                            '%d fonts were added before weight detection existed, so all nine weights are turned on for them. Auto-detection selects only the weights that each font includes. It reads uploaded fonts from their font files, and Adobe Fonts from their kit stylesheet. You can change the selected weights at any time.',
                            $weight_detect_candidates,
                            'typography-stylist'
                        )),
                        (int) $weight_detect_candidates
                    );
                    ?>
                </p>
                <p>
                    <button type="button" class="button button-primary" id="typost-detect-weights-bulk">
                        <?php esc_html_e('Auto-detect weights for existing fonts', 'typography-stylist'); ?>
                    </button>
                </p>
                <div id="typost-detect-weights-message" role="status" aria-live="polite" aria-atomic="true"></div>
            </div>
            <?php endif; ?>

            <?php
            // ── Build $all_fonts normalized array ─────────────────────────────────────
            $all_fonts_list     = array();
            $font_order_saved   = $instance->get_font_order();
            // Display variant: excludes families the plugin itself registered —
            // those already appear above as uploaded cards with the
            // "In WP Library" badge, so listing them again reads as duplicates.
            $wp_library_fonts   = $instance->get_wp_font_library_fonts_for_display();

            foreach ($custom_fonts as $font) {
                $fid = isset($font['font_id']) ? (int) $font['font_id'] : 0;
                $all_fonts_list[] = array(
                    'key'     => 'font-' . $fid,
                    'type'    => 'uploaded',
                    'font_id' => $fid,
                    'name'    => $font['name'],
                    'raw'     => $font,
                );
            }
            foreach ($adobe_fonts as $font) {
                $fid = isset($font['font_id']) ? (int) $font['font_id'] : 0;
                $all_fonts_list[] = array(
                    'key'     => 'adobe-' . $fid,
                    'type'    => 'adobe',
                    'font_id' => $fid,
                    'name'    => $font['name'],
                    'raw'     => $font,
                );
            }
            foreach ($manual_fonts as $font) {
                $fid = isset($font['font_id']) ? (int) $font['font_id'] : 0;
                $all_fonts_list[] = array(
                    'key'     => 'manual-' . $fid,
                    'type'    => 'manual',
                    'font_id' => $fid,
                    'name'    => $font['name'],
                    'raw'     => $font,
                );
            }
            foreach ($wp_library_fonts as $wpl) {
                $all_fonts_list[] = array(
                    'key'     => 'wpl-' . $wpl['slug'],
                    'type'    => 'wplibrary',
                    'font_id' => 0,
                    'name'    => $wpl['name'],
                    'raw'     => $wpl,
                );
            }

            // Apply saved order (unlisted fonts append at end in original order)
            if (!empty($font_order_saved)) {
                usort($all_fonts_list, function($a, $b) use ($font_order_saved) {
                    $pa = array_search($a['key'], $font_order_saved, true);
                    $pb = array_search($b['key'], $font_order_saved, true);
                    $pa = ($pa === false) ? PHP_INT_MAX : $pa;
                    $pb = ($pb === false) ? PHP_INT_MAX : $pb;
                    return $pa - $pb;
                });
            }
            // ─────────────────────────────────────────────────────────────────────────
            ?>

            <?php if (!empty($all_fonts_list)): ?>
            <ul id="typost-unified-font-list" class="typost-unified-font-list" aria-label="<?php esc_attr_e('Font list (drag to reorder)', 'typography-stylist'); ?>">

            <?php foreach ($all_fonts_list as $card_index => $unified): ?>
            <?php
                $u_key    = $unified['key'];
                $u_type   = $unified['type'];
                $u_fid    = $unified['font_id'];
                $u_font   = $unified['raw'];
                $css_var  = $u_fid ? 'var(--font-' . $u_fid . '), sans-serif' : '';
                $badge_labels = array(
                    'uploaded'  => __('Uploaded', 'typography-stylist'),
                    'adobe'     => __('Adobe Fonts', 'typography-stylist'),
                    'manual'    => __('Custom', 'typography-stylist'),
                    'wplibrary' => __('WP Library', 'typography-stylist'),
                );
            ?>
            <li class="typost-unified-font-item typost-type-<?php echo esc_attr($u_type); ?>" data-font-key="<?php echo esc_attr($u_key); ?>">

                <?php if ('uploaded' === $u_type): ?>
                    <?php
                    $font = $u_font;
                    $families_list = '';
                    if (!empty($font['font_faces'])) {
                        $fams = array_unique(array_map(function($f) { return $f['family']; }, $font['font_faces']));
                        $families_list = implode(', ', $fams);
                    }
                    $details_id = 'typost-font-details-' . esc_attr($font['id']);
                    ?>
                    <div class="typost-font-card" id="typost-font-card-<?php echo esc_attr($font['id']); ?>"
                        data-font-id="<?php echo esc_attr($font['id']); ?>"
                        data-font-numeric-id="<?php echo isset($font['font_id']) ? esc_attr($font['font_id']) : '0'; ?>"
                        data-font-name="<?php echo esc_attr($font['name']); ?>">
                        <div class="typost-font-header">
                            <span class="typost-drag-handle dashicons dashicons-menu" aria-hidden="true" title="<?php esc_attr_e('Drag to reorder', 'typography-stylist'); ?>"></span>
                            <button class="typost-font-expand-toggle"
                                aria-expanded="false"
                                aria-controls="<?php echo esc_attr($details_id); ?>">
                                <h3<?php echo typost_font_heading_attributes($css_var, $u_fid, $card_index); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- values escaped in the helper ?>><?php echo esc_html($font['name']); ?></h3>
                            </button>
                            <?php echo wp_kses_post(apply_filters('typost_font_card_badges', '', $font, 'uploaded')); // Extension badges (e.g. Variable) lead, before the source pills ?>
                            <span class="typost-font-type-badge typost-badge-uploaded"><?php echo esc_html($badge_labels['uploaded']); ?></span>
                            <?php if ($instance->font_library_bridge()->entry_has_live_registration($font)) : ?>
                            <span class="typost-font-type-badge typost-badge-wplibrary" title="<?php esc_attr_e('Registered in the WordPress Font Library', 'typography-stylist'); ?>"><?php esc_html_e('In WP Library', 'typography-stylist'); ?></span>
                            <?php endif; ?>
                        </div>
                        <div class="typost-font-details" id="<?php echo esc_attr($details_id); ?>" hidden>
                            <?php if ($families_list): ?>
                            <div class="typost-font-families-display"><strong><?php esc_html_e('Font Families:', 'typography-stylist'); ?></strong> <code><?php echo esc_html($families_list); ?></code></div>
                            <?php endif; ?>
                            <div class="typost-form-field">
                                <label for="typost-font-fallback-<?php echo esc_attr($font['id']); ?>"><?php esc_html_e('Fallback Fonts (optional):', 'typography-stylist'); ?></label>
                                <input type="text" id="typost-font-fallback-<?php echo esc_attr($font['id']); ?>"
                                    class="regular-text code typost-font-fallback-input"
                                    value="<?php echo esc_attr(!empty($font['fallbacks']) ? $font['fallbacks'] : ''); ?>"
                                    placeholder="<?php esc_attr_e('e.g., Georgia, serif', 'typography-stylist'); ?>"
                                    aria-describedby="typost-font-fallback-desc-<?php echo esc_attr($font['id']); ?>" />
                                <p id="typost-font-fallback-desc-<?php echo esc_attr($font['id']); ?>" class="description">
                                    <?php esc_html_e('Enter fallback fonts, separated by commas. The browser uses them if this font does not load.', 'typography-stylist'); ?>
                                </p>
                            </div>
                            <div class="typost-font-loading-option">
                                <label for="typost-load-all-pages-font-<?php echo esc_attr($font['id']); ?>">
                                    <input type="checkbox" class="typost-font-load-all-pages"
                                        data-font-id="<?php echo esc_attr($font['id']); ?>"
                                        id="typost-load-all-pages-font-<?php echo esc_attr($font['id']); ?>"
                                        <?php checked(!empty($font['load_on_all_pages'])); ?>
                                        aria-describedby="typost-load-all-pages-font-desc-<?php echo esc_attr($font['id']); ?>" />
                                    <?php esc_html_e('Load on all pages', 'typography-stylist'); ?>
                                </label>
                                <p id="typost-load-all-pages-font-desc-<?php echo esc_attr($font['id']); ?>" class="description">
                                    <?php esc_html_e('When unchecked, this font will only load on pages where it is actually used. This improves performance.', 'typography-stylist'); ?>
                                </p>
                            </div>
                            <?php if ($instance->font_library_bridge()->is_available()) : ?>
                            <div class="typost-font-library-registration">
                                <strong><?php esc_html_e('WordPress Font Library:', 'typography-stylist'); ?></strong>
                                <?php if ($instance->font_library_bridge()->entry_has_live_registration($font)) : ?>
                                    <span class="typost-wpl-status">
                                        <?php
                                        printf(
                                            /* translators: %s: font family slug in the WP Font Library */
                                            esc_html__('Registered as %s', 'typography-stylist'),
                                            '<code>' . esc_html($font['wp_slug']) . '</code>'
                                        );
                                        ?>
                                    </span>
                                    <button type="button" class="button typost-wpl-unregister" data-font-id="<?php echo esc_attr($font['id']); ?>">
                                        <?php esc_html_e('Remove from Font Library', 'typography-stylist'); ?>
                                    </button>
                                <?php else : ?>
                                    <span class="typost-wpl-status"><?php esc_html_e('Plugin-managed', 'typography-stylist'); ?></span>
                                    <button type="button" class="button typost-wpl-register" data-font-id="<?php echo esc_attr($font['id']); ?>">
                                        <?php esc_html_e('Register in Font Library', 'typography-stylist'); ?>
                                    </button>
                                <?php endif; ?>
                                <p class="description">
                                    <?php esc_html_e('Registered fonts appear in the WordPress Font Library. The font files stay in the plugin’s upload folder. Either way, the plugin’s --font-N variables keep working, so existing content does not change.', 'typography-stylist'); ?>
                                </p>
                            </div>
                            <?php endif; ?>
                            <?php typost_render_weight_checkboxes($font, 'font', true); ?>
                            <?php typost_render_feature_visibility_checkboxes($font, $instance); ?>
                            <div class="typost-form-actions">
                                <button type="button" class="button button-primary typost-save-font-edit"><?php esc_html_e('Save Changes', 'typography-stylist'); ?></button>
                                <button type="button" class="button typost-cancel-font-edit"><?php esc_html_e('Cancel', 'typography-stylist'); ?></button>
                                <button type="button" class="button typost-delete-font"
                                    aria-label="<?php echo esc_attr(sprintf(__('Delete font: %s', 'typography-stylist'), $font['name'])); ?>">
                                    <span aria-hidden="true" class="dashicons dashicons-trash"></span>
                                    <?php esc_html_e('Delete', 'typography-stylist'); ?>
                                </button>
                            </div>
                            <div class="typost-font-edit-message" role="alert" aria-live="assertive" aria-atomic="true"></div>
                        </div>
                    </div>

                <?php elseif ('adobe' === $u_type): ?>
                    <?php
                    $font = $u_font;
                    $adobe_family = !empty($font['font_family'])  ? $font['font_family']
                                  : (!empty($font['font_families']) ? implode(', ', $font['font_families']) : '');
                    $details_id = 'typost-font-details-adobe-' . esc_attr($font['id']);
                    ?>
                    <div class="typost-font-card" id="typost-font-card-adobe-<?php echo esc_attr($font['id']); ?>"
                        data-font-id="<?php echo esc_attr($font['id']); ?>"
                        data-font-numeric-id="<?php echo isset($font['font_id']) ? esc_attr($font['font_id']) : '0'; ?>"
                        data-font-name="<?php echo esc_attr($font['name']); ?>">
                        <div class="typost-font-header">
                            <span class="typost-drag-handle dashicons dashicons-menu" aria-hidden="true" title="<?php esc_attr_e('Drag to reorder', 'typography-stylist'); ?>"></span>
                            <button class="typost-font-expand-toggle"
                                aria-expanded="false"
                                aria-controls="<?php echo esc_attr($details_id); ?>">
                                <h3<?php echo typost_font_heading_attributes($css_var, $u_fid, $card_index); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- values escaped in the helper ?>><?php echo esc_html($font['name']); ?></h3>
                            </button>
                            <?php echo wp_kses_post(apply_filters('typost_font_card_badges', '', $font, 'adobe')); // Extension badges (e.g. Variable) lead, before the source pill ?>
                            <span class="typost-font-type-badge typost-badge-adobe"><?php echo esc_html($badge_labels['adobe']); ?></span>
                        </div>
                        <div class="typost-font-details" id="<?php echo esc_attr($details_id); ?>" hidden>
                            <?php if ($adobe_family): ?>
                            <div class="typost-font-families-display"><strong><?php esc_html_e('Font Family:', 'typography-stylist'); ?></strong> <code><?php echo esc_html($adobe_family); ?></code></div>
                            <?php endif; ?>
                            <div class="typost-form-field">
                                <label for="typost-adobe-font-fallback-<?php echo esc_attr($font['id']); ?>"><?php esc_html_e('Fallback Fonts (optional):', 'typography-stylist'); ?></label>
                                <input type="text" id="typost-adobe-font-fallback-<?php echo esc_attr($font['id']); ?>"
                                    class="regular-text code typost-adobe-font-fallback-input"
                                    value="<?php echo esc_attr(!empty($font['fallbacks']) ? $font['fallbacks'] : ''); ?>"
                                    placeholder="<?php esc_attr_e('e.g., Georgia, serif', 'typography-stylist'); ?>"
                                    aria-describedby="typost-adobe-font-fallback-desc-<?php echo esc_attr($font['id']); ?>" />
                                <p id="typost-adobe-font-fallback-desc-<?php echo esc_attr($font['id']); ?>" class="description">
                                    <?php esc_html_e('Enter fallback fonts, separated by commas. The browser uses them if this font does not load.', 'typography-stylist'); ?>
                                </p>
                            </div>
                            <div class="typost-font-loading-option">
                                <label for="typost-load-all-pages-adobe-<?php echo esc_attr($font['id']); ?>">
                                    <input type="checkbox" class="typost-adobe-font-load-all-pages"
                                        data-font-id="<?php echo esc_attr($font['id']); ?>"
                                        id="typost-load-all-pages-adobe-<?php echo esc_attr($font['id']); ?>"
                                        <?php checked(!empty($font['load_on_all_pages'])); ?>
                                        aria-describedby="typost-load-all-pages-adobe-desc-<?php echo esc_attr($font['id']); ?>" />
                                    <?php esc_html_e('Load on all pages', 'typography-stylist'); ?>
                                </label>
                                <p id="typost-load-all-pages-adobe-desc-<?php echo esc_attr($font['id']); ?>" class="description">
                                    <?php esc_html_e('When unchecked, this font will only load on pages where it is actually used. This improves performance.', 'typography-stylist'); ?>
                                </p>
                            </div>
                            <?php typost_render_weight_checkboxes($font, 'adobe', true); ?>
                            <?php typost_render_feature_visibility_checkboxes($font, $instance); ?>
                            <div class="typost-form-actions">
                                <button type="button" class="button button-primary typost-save-adobe-font-edit"><?php esc_html_e('Save Changes', 'typography-stylist'); ?></button>
                                <button type="button" class="button typost-cancel-adobe-font-edit"><?php esc_html_e('Cancel', 'typography-stylist'); ?></button>
                                <button type="button" class="button typost-delete-adobe-font"
                                    aria-label="<?php echo esc_attr(sprintf(__('Delete font: %s', 'typography-stylist'), $font['name'])); ?>">
                                    <span aria-hidden="true" class="dashicons dashicons-trash"></span>
                                    <?php esc_html_e('Delete', 'typography-stylist'); ?>
                                </button>
                            </div>
                            <div class="typost-adobe-font-edit-message" role="alert" aria-live="assertive" aria-atomic="true"></div>
                        </div>
                    </div>

                <?php elseif ('manual' === $u_type): ?>
                    <?php
                    $font = $u_font;
                    $details_id = 'typost-font-details-manual-' . esc_attr($font['id']);
                    ?>
                    <div class="typost-font-card typost-manual-font-card" id="typost-font-card-manual-<?php echo esc_attr($font['id']); ?>"
                        data-font-id="<?php echo esc_attr($font['id']); ?>"
                        data-font-numeric-id="<?php echo isset($font['font_id']) ? esc_attr($font['font_id']) : '0'; ?>"
                        data-font-name="<?php echo esc_attr($font['name']); ?>">
                        <div class="typost-font-header">
                            <span class="typost-drag-handle dashicons dashicons-menu" aria-hidden="true" title="<?php esc_attr_e('Drag to reorder', 'typography-stylist'); ?>"></span>
                            <button class="typost-font-expand-toggle"
                                aria-expanded="false"
                                aria-controls="<?php echo esc_attr($details_id); ?>">
                                <h3<?php echo typost_font_heading_attributes($css_var, $u_fid, $card_index); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- values escaped in the helper ?>><?php echo esc_html($font['name']); ?></h3>
                            </button>
                            <?php echo wp_kses_post(apply_filters('typost_font_card_badges', '', $font, 'manual')); // Extension badges (e.g. Variable) lead, before the source pill ?>
                            <span class="typost-font-type-badge typost-badge-manual"><?php echo esc_html($badge_labels['manual']); ?></span>
                        </div>
                        <div class="typost-font-details" id="<?php echo esc_attr($details_id); ?>" hidden>
                            <div class="typost-form-field">
                                <label for="typost-manual-font-family-edit-<?php echo esc_attr($font['id']); ?>">
                                    <?php esc_html_e('CSS Font Family:', 'typography-stylist'); ?>
                                    <span class="required" aria-label="<?php esc_attr_e('required', 'typography-stylist'); ?>">*</span>
                                </label>
                                <input type="text" id="typost-manual-font-family-edit-<?php echo esc_attr($font['id']); ?>"
                                    class="regular-text code typost-manual-font-family-input"
                                    value="<?php echo esc_attr($font['font_family']); ?>"
                                    placeholder="<?php esc_attr_e('e.g., \'Playfair Display\', Georgia, serif', 'typography-stylist'); ?>"
                                    aria-required="true"
                                    aria-describedby="typost-manual-font-family-edit-desc-<?php echo esc_attr($font['id']); ?>" />
                                <p id="typost-manual-font-family-edit-desc-<?php echo esc_attr($font['id']); ?>" class="description">
                                    <?php
                                    printf(
                                        /* translators: %s: an example CSS font-family value, shown as code. */
                                        esc_html__('Enter the exact CSS font-family value, with any fallback fonts. For example: %s', 'typography-stylist'),
                                        '<code>\'Playfair Display\', Georgia, serif</code>'
                                    );
                                    ?>
                                </p>
                            </div>
                            <?php typost_render_weight_checkboxes($font, 'manual', false); ?>
                            <?php typost_render_feature_visibility_checkboxes($font, $instance); ?>
                            <div class="typost-form-actions">
                                <button type="button" class="button button-primary typost-save-manual-font-edit"><?php esc_html_e('Save Changes', 'typography-stylist'); ?></button>
                                <button type="button" class="button typost-cancel-manual-font-edit"><?php esc_html_e('Cancel', 'typography-stylist'); ?></button>
                                <button type="button" class="button typost-delete-manual-font"
                                    aria-label="<?php echo esc_attr(sprintf(__('Delete custom font: %s', 'typography-stylist'), $font['name'])); ?>">
                                    <span aria-hidden="true" class="dashicons dashicons-trash"></span>
                                    <?php esc_html_e('Delete', 'typography-stylist'); ?>
                                </button>
                            </div>
                            <div class="typost-manual-font-edit-message" role="alert" aria-live="assertive" aria-atomic="true"></div>
                        </div>
                    </div>

                <?php elseif ('wplibrary' === $u_type): ?>
                    <?php $wpl = $u_font; ?>
                    <div class="typost-font-card typost-wpl-card">
                        <div class="typost-font-header">
                            <span class="typost-drag-handle dashicons dashicons-menu" aria-hidden="true" title="<?php esc_attr_e('Drag to reorder', 'typography-stylist'); ?>"></span>
                            <h3<?php echo typost_font_heading_attributes(!empty($wpl['font_family']) ? $wpl['font_family'] : '', 0, $card_index); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- values escaped in the helper ?>><?php echo esc_html($wpl['name']); ?></h3>
                            <?php if (!empty($wpl['font_family'])): ?>
                            <code class="typost-wpl-family"><?php echo esc_html($wpl['font_family']); ?></code>
                            <?php endif; ?>
                            <?php
                            // WordPress 7.1 added Appearance → Fonts; before that the
                            // Font Library opens from the Site Editor.
                            $typost_font_library_url = file_exists(ABSPATH . 'wp-admin/font-library.php')
                                ? admin_url('font-library.php')
                                : admin_url('site-editor.php');
                            ?>
                            <a href="<?php echo esc_url($typost_font_library_url); ?>"
                                class="button typost-wpl-manage-btn" target="_blank"
                                aria-label="<?php esc_attr_e('Manage fonts in the WordPress Font Library (opens in a new tab)', 'typography-stylist'); ?>">
                                <span aria-hidden="true" class="dashicons dashicons-external"></span>
                                <?php esc_html_e('Manage in Font Library', 'typography-stylist'); ?>
                            </a>
                            <?php echo wp_kses_post(apply_filters('typost_font_card_badges', '', $wpl, 'wplibrary')); // Extension badges (e.g. Variable) lead, before the source pill ?>
                            <span class="typost-font-type-badge typost-badge-wplibrary"><?php echo esc_html($badge_labels['wplibrary']); ?></span>
                        </div>
                    </div>
                <?php endif; ?>

            </li>
            <?php endforeach; ?>

            </ul><!-- #typost-unified-font-list -->

            <?php else: ?>
            <div class="typost-empty-state" role="status">
                <p><strong><?php esc_html_e('No fonts added yet.', 'typography-stylist'); ?></strong></p>
                <p><?php esc_html_e('Use the “Add Font” section below to upload a font kit, add an Adobe Fonts project, or define a custom font.', 'typography-stylist'); ?></p>
            </div>
            <?php endif; ?>
    <?php
}

function typost_render_admin_template($instance, $presets, $custom_fonts, $adobe_fonts, $manual_fonts) {
    ?>
<div class="wrap typost-admin-wrap" data-color-scheme="<?php echo esc_attr(get_option('typost_admin_color_scheme', 'alice-blue')); ?>">
    <h1><?php echo esc_html(get_admin_page_title()); ?></h1>

    <!-- Skip link for accessibility -->
    <a href="#typost-main-content" class="screen-reader-text skip-link">
        <?php esc_html_e('Skip to main content', 'typography-stylist'); ?>
    </a>

    <!-- Global status announcements for AJAX actions (screen readers only) -->
    <div id="typost-live-region" class="screen-reader-text" role="status" aria-live="polite" aria-atomic="true"></div>

    <div class="typost-admin-container" id="typost-main-content" tabindex="-1">
        <?php
        /**
         * Filter the admin settings tabs.
         *
         * Allows extension plugins to register new tabs in the admin interface.
         * Each tab needs: 'id' (string), 'label' (string), 'priority' (int).
         * Built-in tabs use priorities 10-100. Extensions should use gaps between.
         *
         * @since 2.0.0
         * @param array $tabs Array of tab definitions.
         */
        $built_in_tab_ids = array('fonts', 'presets', 'options', 'accessibility', 'replacements', 'help');
        $built_in_tabs = array(
            array('id' => 'fonts',         'label' => __('Custom Fonts', 'typography-stylist'),     'priority' => 10),
            array('id' => 'presets',       'label' => __('Font Features', 'typography-stylist'),     'priority' => 20),
            array('id' => 'options',       'label' => __('Options', 'typography-stylist'),            'priority' => 30),
            array('id' => 'accessibility', 'label' => __('Accessibility', 'typography-stylist'),     'priority' => 40),
            array('id' => 'replacements',  'label' => __('Replacement Fonts', 'typography-stylist'), 'priority' => 50),
            array('id' => 'help',          'label' => __('Help', 'typography-stylist'),               'priority' => 100),
        );
        $tabs = apply_filters('typost_admin_tabs', $built_in_tabs);

        // Validate and sanitize filtered tabs
        if ( ! is_array( $tabs ) || empty( $tabs ) ) {
            $tabs = $built_in_tabs;
        }
        $tabs = array_filter( $tabs, function( $tab ) {
            return is_array( $tab ) && ! empty( $tab['id'] ) && ! empty( $tab['label'] );
        } );
        $tabs = array_values( $tabs );
        if ( empty( $tabs ) ) {
            $tabs = $built_in_tabs;
        }

        // Sanitize extension tab IDs and default missing priority
        foreach ( $tabs as &$tab ) {
            if ( ! in_array( $tab['id'], $built_in_tab_ids, true ) ) {
                $tab['id'] = sanitize_key( $tab['id'] );
            }
            $tab['priority'] = isset( $tab['priority'] ) && is_numeric( $tab['priority'] ) ? absint( $tab['priority'] ) : 50;
        }
        unset( $tab );

        usort($tabs, function($a, $b) { return $a['priority'] - $b['priority']; });

        // Determine which tab should be active (URL parameter or first tab)
        $active_tab = isset($_GET['tab']) ? sanitize_key($_GET['tab']) : $tabs[0]['id']; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Tab display only, no data modification
        $tab_ids = array_column($tabs, 'id');
        if (!in_array($active_tab, $tab_ids, true)) {
            $active_tab = $tabs[0]['id'];
        }
        ?>
        <nav class="typost-admin-tabs nav-tab-wrapper" role="tablist" aria-label="<?php esc_attr_e('Settings sections', 'typography-stylist'); ?>">
            <?php foreach ($tabs as $tab): ?>
            <button
                type="button"
                class="nav-tab <?php echo $tab['id'] === $active_tab ? 'nav-tab-active' : ''; ?>"
                data-tab="<?php echo esc_attr($tab['id']); ?>"
                role="tab"
                aria-selected="<?php echo $tab['id'] === $active_tab ? 'true' : 'false'; ?>"
                tabindex="<?php echo $tab['id'] === $active_tab ? '0' : '-1'; ?>"
                aria-controls="typost-tab-<?php echo esc_attr($tab['id']); ?>"
                id="typost-tab-button-<?php echo esc_attr($tab['id']); ?>">
                <?php echo esc_html($tab['label']); ?>
            </button>
            <?php endforeach; ?>
        </nav>

        <!-- Presets Tab -->
        <div
            class="typost-tab-content <?php echo 'presets' === $active_tab ? 'active' : ''; ?>"
            id="typost-tab-presets"
            role="tabpanel"
            aria-labelledby="typost-tab-button-presets"
            <?php echo 'presets' !== $active_tab ? 'hidden="hidden"' : ''; ?>
            tabindex="0">
            <h2><?php esc_html_e('Font Features', 'typography-stylist'); ?></h2>

            <details class="typost-tab-help">
                <summary><?php esc_html_e('About Font Features', 'typography-stylist'); ?></summary>
                <div class="typost-tab-help-content">
                    <p><?php esc_html_e('OpenType features are advanced typographic capabilities built into font files. They include ligatures (connected letter pairs), stylistic sets (alternate character designs), swashes, small caps, and more.', 'typography-stylist'); ?></p>
                    <p><?php esc_html_e('Use this page to preview how each feature changes your fonts. Select one of your fonts from the list to see real results. Different fonts support different features.', 'typography-stylist'); ?></p>
                    <ul>
                        <li><?php esc_html_e('The features are grouped by category, such as ligatures, stylistic sets, and numerals.', 'typography-stylist'); ?></li>
                        <li><?php esc_html_e('Use the “Card Width” slider to change the width of the preview cards, so you can compare them more easily.', 'typography-stylist'); ?></li>
                        <li><?php esc_html_e('When you select a font, you can choose which features the editor shows for that font.', 'typography-stylist'); ?></li>
                    </ul>
                </div>
            </details>

            <p><?php esc_html_e('Explore OpenType features with live previews. Type custom text or use the default samples to see how each feature affects your typography.', 'typography-stylist'); ?></p>

            <div class="typost-preset-controls">
                <?php
                // Rendered even when empty (hidden) so an AJAX font add can
                // reveal the selector without a page reload.
                $typost_has_any_fonts = !empty($custom_fonts) || !empty($adobe_fonts) || !empty($manual_fonts)
                    || !empty($instance->get_wp_font_library_fonts_for_display());
                ?>
                <div class="typost-preset-font-selector" id="typost-preset-font-selector" <?php echo $typost_has_any_fonts ? '' : 'style="display:none;"'; ?>>
                    <label for="typost-preview-font-select">
                        <?php esc_html_e('Preview with Font:', 'typography-stylist'); ?>
                    </label>
                    <select id="typost-preview-font-select" class="typost-font-select">
                        <?php typost_render_preview_font_options($instance, $custom_fonts, $adobe_fonts, $manual_fonts); ?>
                    </select>
                    <p class="description">
                        <?php esc_html_e('Select a custom font to preview how features will look with that font.', 'typography-stylist'); ?>
                    </p>
                    <div id="typost-visibility-master-controls" class="typost-visibility-master-controls" style="display:none;">
                        <button type="button" id="typost-enable-all-features" class="button button-secondary">
                            <?php esc_html_e('Enable All Features', 'typography-stylist'); ?>
                        </button>
                        <button type="button" id="typost-disable-all-features" class="button button-secondary">
                            <?php esc_html_e('Disable All Features', 'typography-stylist'); ?>
                        </button>
                        <span id="typost-visibility-save-indicator" class="typost-visibility-save-indicator" aria-live="polite"></span>
                    </div>
                </div>

                <div class="typost-preset-size-control">
                    <label for="typost-preview-size-slider">
                        <?php esc_html_e('Preview Size:', 'typography-stylist'); ?>
                        <span id="typost-preview-size-value" class="typost-size-value">50px</span>
                    </label>
                    <input
                        type="range"
                        id="typost-preview-size-slider"
                        class="typost-size-slider"
                        min="12"
                        max="96"
                        value="50"
                        step="1"
                        aria-label="<?php esc_attr_e('Adjust preview text size', 'typography-stylist'); ?>"
                        aria-valuemin="12"
                        aria-valuemax="96"
                        aria-valuenow="50"
                        aria-valuetext="50 pixels" />
                    <p class="description">
                        <?php esc_html_e('Adjust the size of the preview text to better see typography features.', 'typography-stylist'); ?>
                    </p>
                </div>

                <div class="typost-preset-custom-text-control">
                    <label for="typost-preview-custom-text">
                        <?php esc_html_e('Custom Preview Text:', 'typography-stylist'); ?>
                    </label>
                    <input
                        type="text"
                        id="typost-preview-custom-text"
                        class="regular-text"
                        placeholder="<?php esc_attr_e('Type your own text to preview features…', 'typography-stylist'); ?>"
                        aria-label="<?php esc_attr_e('Enter custom text to preview features', 'typography-stylist'); ?>" />
                    <button
                        type="button"
                        id="typost-preview-reset-text"
                        class="button button-secondary"
                        style="display: none;">
                        <?php esc_html_e('Reset to Defaults', 'typography-stylist'); ?>
                    </button>
                    <p class="description">
                        <?php esc_html_e('Type your own text to see how each feature affects it, or leave blank to use default samples.', 'typography-stylist'); ?>
                    </p>
                </div>

                <div class="typost-preset-card-width-control">
                    <label for="typost-card-width-slider">
                        <?php esc_html_e('Card Width:', 'typography-stylist'); ?>
                        <span id="typost-card-width-value" class="typost-size-value">480px</span>
                    </label>
                    <input
                        type="range"
                        id="typost-card-width-slider"
                        class="typost-size-slider"
                        min="280"
                        max="800"
                        value="480"
                        step="20"
                        aria-label="<?php esc_attr_e('Adjust feature card width', 'typography-stylist'); ?>"
                        aria-valuemin="280"
                        aria-valuemax="800"
                        aria-valuenow="480"
                        aria-valuetext="480 pixels" />
                    <p class="description">
                        <?php esc_html_e('Adjust the minimum width of feature preview cards.', 'typography-stylist'); ?>
                    </p>
                </div>
            </div>

            <!-- Baseline Font Preview -->
            <div class="typost-baseline-preview-section">
                <h3><?php esc_html_e('Font Preview (No Features Applied)', 'typography-stylist'); ?></h3>
                <p class="description">
                    <?php esc_html_e('This shows how the selected font looks without any OpenType features applied.', 'typography-stylist'); ?>
                </p>
                <div class="typost-baseline-preview-container">
                    <div class="typost-baseline-preview" id="typost-baseline-preview" data-default-text="The quick brown fox jumps over the lazy dog">
                        The quick brown fox jumps over the lazy dog
                    </div>
                </div>
            </div>

            <?php
            $available_features = $instance->get_available_features();
            $grouped_features = array();

            // Group features by category
            foreach ($available_features as $feature) {
                $category = isset($feature['category']) ? $feature['category'] : 'other';
                if (!isset($grouped_features[$category])) {
                    $grouped_features[$category] = array();
                }
                $grouped_features[$category][] = $feature;
            }

            // Shared with the font cards' Feature Visibility fieldsets
            // (typostAdmin.featureCategoryTitles); escaped at output below.
            $category_titles = $instance->get_feature_category_titles();
            ?>

            <?php foreach ($grouped_features as $category => $features): ?>
            <details <?php echo $category === 'ligatures' ? 'open' : ''; ?> class="typost-feature-category-section">
                <summary class="typost-feature-category-summary">
                    <span class="typost-feature-category-title" role="heading" aria-level="3"><?php echo esc_html(isset($category_titles[$category]) ? $category_titles[$category] : ucfirst($category)); ?></span>
                    <span class="typost-feature-category-count"><?php
                        $count = count($features);
                        echo esc_html(sprintf(
                            /* translators: %d: number of features in category */
                            _n('%d feature', '%d features', $count, 'typography-stylist'),
                            $count
                        ));
                    ?></span>
                </summary>

                <div class="typost-feature-demos-grid">
                    <?php foreach ($features as $feature): ?>
                    <div class="typost-feature-demo-card" data-feature-id="<?php echo esc_attr($feature['id']); ?>">
                        <div class="typost-feature-demo-header">
                            <h4><?php echo esc_html($feature['name']); ?></h4>
                            <code class="typost-feature-code"><?php echo esc_html($feature['id']); ?></code>
                        </div>
                        <p class="typost-feature-demo-description"><?php echo esc_html($feature['description']); ?></p>

                        <div class="typost-feature-comparison">
                            <div class="typost-feature-preview-container">
                                <div class="typost-feature-preview-label"><?php esc_html_e('With Feature:', 'typography-stylist'); ?></div>
                                <div
                                    class="typost-feature-preview typost-feature-preview-on"
                                    data-demo-text="<?php echo esc_attr($instance->get_feature_demo_text($feature['id'])); ?>"
                                    style="font-feature-settings: '<?php echo esc_attr($feature['id']); ?>' 1;">
                                    <?php echo esc_html($instance->get_feature_demo_text($feature['id'])); ?>
                                </div>
                            </div>
                        </div>
                        <div class="typost-feature-visibility-control" style="display:none;" aria-hidden="true">
                            <label class="typost-feature-visibility-label">
                                <input
                                    type="checkbox"
                                    class="typost-feature-visibility-checkbox"
                                    data-feature-id="<?php echo esc_attr($feature['id']); ?>"
                                    checked />
                                <?php
                                echo esc_html(sprintf(
                                    /* translators: %s: OpenType feature name e.g. "Standard Ligatures" */
                                    __('Enable %s in editor for this font', 'typography-stylist'),
                                    $feature['name']
                                ));
                                ?>
                            </label>
                        </div>
                    </div>
                    <?php endforeach; ?>
                </div>
            </details>
            <?php endforeach; ?>

            <?php if (!empty($presets)): ?>
            <div class="typost-user-presets-section">
                <h3><?php esc_html_e('Your Saved Presets', 'typography-stylist'); ?></h3>
                <p><?php esc_html_e('These presets are saved on this site. The editor shows them under “Quick Presets” in the Typography Stylist panel.', 'typography-stylist'); ?></p>

                <div class="typost-presets-grid">
                    <?php foreach ($presets as $preset): ?>
                    <div class="typost-preset-card">
                        <h4><?php echo esc_html($preset['name']); ?></h4>
                        <p class="typost-preset-description"><?php echo esc_html($preset['description']); ?></p>
                        <div class="typost-preset-features">
                            <strong><?php esc_html_e('Features:', 'typography-stylist'); ?></strong>
                            <?php echo esc_html(implode(', ', $preset['features'])); ?>
                        </div>
                        <div class="typost-preset-preview" style="font-feature-settings: <?php echo esc_attr($instance->features_to_css($preset['features'])); ?>">
                            <?php echo esc_html($instance->get_feature_demo_text($preset['features'][0])); ?>
                        </div>
                    </div>
                    <?php endforeach; ?>
                </div>
            </div>
            <?php endif; ?>
            <?php do_action('typost_admin_tab_after_presets', $instance); ?>
        </div>

        <!-- Fonts Tab -->
        <div
            class="typost-tab-content <?php echo 'fonts' === $active_tab ? 'active' : ''; ?>"
            id="typost-tab-fonts"
            role="tabpanel"
            aria-labelledby="typost-tab-button-fonts"
            <?php echo 'fonts' !== $active_tab ? 'hidden="hidden"' : ''; ?>
            tabindex="0">
            <h2><?php esc_html_e('Custom Fonts', 'typography-stylist'); ?></h2>
            <?php
            // Print WP Font Library @font-face CSS (WP 6.4+) so the Library
            // font card titles below can render in their own typeface. Cheap:
            // browsers only download binaries for families actually rendered.
            if (function_exists('wp_print_font_faces')) {
                wp_print_font_faces();
            }
            ?>

            <details class="typost-tab-help">
                <summary><?php esc_html_e('Why & How to Use Custom Fonts', 'typography-stylist'); ?></summary>
                <div class="typost-tab-help-content">
                    <p><strong><?php esc_html_e('Why use custom fonts?', 'typography-stylist'); ?></strong> <?php esc_html_e('OpenType features, such as ligatures, swashes, and stylistic sets, are built into the font files. System fonts and many web fonts have few OpenType features. Fonts from sources such as MyFonts, Adobe Fonts, or Font Squirrel often include many more.', 'typography-stylist'); ?></p>
                    <p><strong><?php esc_html_e('Performance benefit:', 'typography-stylist'); ?></strong> <?php esc_html_e('By default, a font that you add here loads only on the pages that use it. If you use a decorative font on one page, it does not make the other pages on your site slower.', 'typography-stylist'); ?></p>
                    <p><strong><?php esc_html_e('Three ways to add fonts:', 'typography-stylist'); ?></strong></p>
                    <ol>
                        <li><strong><?php esc_html_e('Upload Font Kit:', 'typography-stylist'); ?></strong> <?php esc_html_e('Upload a ZIP file from a font provider, such as MyFonts, Fontspring, or Google Fonts. Use this for font files that you have downloaded.', 'typography-stylist'); ?></li>
                        <li><strong><?php esc_html_e('Adobe Fonts:', 'typography-stylist'); ?></strong> <?php esc_html_e('Paste the embed code from your Adobe Fonts (Typekit) project. Use this if you have an Adobe Creative Cloud subscription.', 'typography-stylist'); ?></li>
                        <li><strong><?php esc_html_e('Custom Font Definition:', 'typography-stylist'); ?></strong> <?php esc_html_e('Use a font that your theme, a plugin, or a CDN already loads. Typography Stylist then shows it in the editor font list.', 'typography-stylist'); ?></li>
                    </ol>
                </div>
            </details>

            <p><?php esc_html_e('Manage the fonts that the block editor can use. Drag a font to change its position. The editor font list uses the same order.', 'typography-stylist'); ?></p>

            <div id="typost-fonts-region" tabindex="-1" role="region" aria-label="<?php esc_attr_e('Font list', 'typography-stylist'); ?>">
                <?php typost_render_font_list_section($instance, $custom_fonts, $adobe_fonts, $manual_fonts); ?>
            </div>

            <!-- Add Font Section (collapsible) -->
            <details class="typost-add-font-section" id="typost-add-font-section">
                <summary class="typost-add-font-summary">
                    <span class="dashicons dashicons-plus-alt" aria-hidden="true"></span>
                    <?php esc_html_e('Add Font', 'typography-stylist'); ?>
                </summary>
                <div class="typost-add-font-content">

                    <!-- Upload Font Kit -->
                    <details class="typost-add-font-subsection">
                        <summary><?php esc_html_e('Upload Font Kit', 'typography-stylist'); ?></summary>
                        <div class="typost-add-font-subsection-body">
                        <p><?php esc_html_e('Upload a complete webfont kit as a ZIP file, for example MyWebfontsKit.zip. The ZIP can contain a CSS file and font files, or only font files (for example, a Google Fonts download). If the ZIP has no stylesheet, the plugin makes one from the metadata in the font files.', 'typography-stylist'); ?></p>
                        <div class="typost-upload-font-section" id="typost-upload-font-section">
                        <div class="typost-upload-form">
                            <div class="typost-form-field">
                                <span class="typost-field-label"><?php esc_html_e('ZIP File:', 'typography-stylist'); ?></span>
                                <label for="typost-font-file" class="screen-reader-text">
                                    <?php esc_html_e('Choose ZIP file containing webfont kit', 'typography-stylist'); ?>
                                </label>
                                <div class="typost-upload-method-buttons">
                                    <button type="button" id="typost-select-file-btn" class="button">
                                        <span class="dashicons dashicons-upload" aria-hidden="true"></span>
                                        <?php esc_html_e('Choose ZIP File', 'typography-stylist'); ?>
                                    </button>
                                </div>
                                <input type="file" id="typost-font-file" name="typost-font-file" accept=".zip"
                                    aria-describedby="typost-file-instructions" style="display: none;" />
                                <span id="typost-file-instructions" class="screen-reader-text">
                                    <?php esc_html_e('Upload a webfont kit as a ZIP file. The ZIP can contain a CSS file and font files, or only font files.', 'typography-stylist'); ?>
                                </span>
                                <div id="typost-selected-file" class="typost-selected-file" style="display: none;">
                                    <span class="dashicons dashicons-media-archive" aria-hidden="true"></span>
                                    <span id="typost-file-name"></span>
                                    <span id="typost-file-size" class="typost-file-size"></span>
                                    <button type="button" id="typost-clear-file-btn" class="button-link" aria-label="<?php esc_attr_e('Clear selected file', 'typography-stylist'); ?>">
                                        <span class="dashicons dashicons-no-alt" aria-hidden="true"></span>
                                    </button>
                                </div>
                            </div>
                            <button type="button" id="typost-upload-font-btn" class="button button-primary" disabled>
                                <?php esc_html_e('Upload Font Kit', 'typography-stylist'); ?>
                            </button>
                            <div id="typost-upload-progress" class="typost-upload-progress" style="display: none;">
                                <div class="typost-progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-labelledby="typost-progress-label">
                                    <div class="typost-progress-fill" style="width: 0%;"></div>
                                </div>
                                <div id="typost-progress-label" class="typost-progress-text" role="status" aria-live="polite">
                                    <?php esc_html_e('Uploading…', 'typography-stylist'); ?>
                                </div>
                            </div>
                            <div id="typost-font-message" role="alert" aria-live="assertive" aria-atomic="true" style="margin-top: 10px;"></div>
                        </div>
                        <div class="typost-font-help">
                            <h4><?php esc_html_e('How to use:', 'typography-stylist'); ?></h4>
                            <ol>
                                <li><?php esc_html_e('Download your webfont kit from your font provider.', 'typography-stylist'); ?></li>
                                <li><?php esc_html_e('If the kit is not a ZIP file, make a ZIP file of the whole kit folder. A CSS file is recommended, but not necessary. A ZIP of font files only also works.', 'typography-stylist'); ?></li>
                                <li><?php esc_html_e('Click “Choose ZIP File”, then select the ZIP file of your webfont kit.', 'typography-stylist'); ?></li>
                                <li><?php esc_html_e('Click “Upload Font Kit”. The plugin reads the font names from the kit.', 'typography-stylist'); ?></li>
                                <li><?php esc_html_e('The plugin extracts the ZIP, processes the fonts, and adds them to the block editor.', 'typography-stylist'); ?></li>
                            </ol>
                            <p><strong><?php esc_html_e('Compatibility Note:', 'typography-stylist'); ?></strong> <?php esc_html_e('This plugin was tested with webfont kits from MyFonts and with font-only downloads from Google Fonts. Kits from other providers should also work. If a kit has a CSS file, the plugin uses it. For a ZIP of font files only, the plugin makes a stylesheet. The server cannot read WOFF2 metadata. For a ZIP of WOFF2 files only, the plugin gets the family and weight from the filenames. Check the result, and upload TTF files instead if something is wrong.', 'typography-stylist'); ?></p>
                        </div>
                        </div><!-- .typost-upload-font-section -->
                        </div>
                    </details>

                    <!-- Adobe Fonts -->
                    <details class="typost-add-font-subsection">
                        <summary><?php esc_html_e('Add Adobe Fonts Project', 'typography-stylist'); ?></summary>
                        <div class="typost-add-font-subsection-body">
                        <div class="typost-add-adobe-font-form">
                            <div class="typost-form-field">
                                <label for="typost-adobe-embed-code">
                                    <?php esc_html_e('Adobe Fonts Embed Code:', 'typography-stylist'); ?>
                                    <span class="required" aria-label="<?php esc_attr_e('required', 'typography-stylist'); ?>">*</span>
                                </label>
                                <!-- phpcs:ignore WordPress.WP.EnqueuedResources.NonEnqueuedStylesheet -- Placeholder text showing example format -->
                                <textarea id="typost-adobe-embed-code" name="typost-adobe-embed-code" class="large-text code" rows="3"
                                    placeholder="<?php esc_attr_e('<link rel=&quot;stylesheet&quot; href=&quot;https://use.typekit.net/abc1234.css&quot;>', 'typography-stylist'); ?>"
                                    aria-required="true" aria-describedby="typost-adobe-embed-desc"></textarea>
                                <p id="typost-adobe-embed-desc" class="description">
                                    <?php esc_html_e('Paste the complete embed code from your Adobe Fonts project, including the <link> tag.', 'typography-stylist'); ?>
                                </p>
                            </div>
                            <div class="typost-form-field">
                                <label for="typost-adobe-font-families">
                                    <?php esc_html_e('Font Family Names:', 'typography-stylist'); ?>
                                    <span class="required" aria-label="<?php esc_attr_e('required', 'typography-stylist'); ?>">*</span>
                                </label>
                                <input type="text" id="typost-adobe-font-families" name="typost-adobe-font-families" class="regular-text"
                                    placeholder="<?php esc_attr_e('e.g., proxima-nova, futura-pt', 'typography-stylist'); ?>"
                                    aria-required="true" aria-describedby="typost-adobe-families-desc" />
                                <p id="typost-adobe-families-desc" class="description">
                                    <?php esc_html_e('Enter the exact font family names, separated by commas. You can find them in your Adobe Fonts project settings.', 'typography-stylist'); ?>
                                </p>
                            </div>
                            <button type="button" id="typost-add-adobe-font-btn" class="button button-primary">
                                <?php esc_html_e('Add Adobe Fonts Project', 'typography-stylist'); ?>
                            </button>
                            <div id="typost-adobe-font-message" role="alert" aria-live="assertive" aria-atomic="true" style="margin-top: 10px;"></div>
                        </div>
                        <div class="typost-adobe-help">
                            <h4><?php esc_html_e('How to use Adobe Fonts:', 'typography-stylist'); ?></h4>
                            <ol>
                                <li><?php esc_html_e('Go to fonts.adobe.com, then create or open your web project.', 'typography-stylist'); ?></li>
                                <li><?php esc_html_e('Add the fonts that you want to use to your project.', 'typography-stylist'); ?></li>
                                <li><?php esc_html_e('Copy the embed code (the <link> tag) from the project.', 'typography-stylist'); ?></li>
                                <li><?php esc_html_e('Paste the embed code above, then enter the font family names.', 'typography-stylist'); ?></li>
                            </ol>
                            <p><strong><?php esc_html_e('Note:', 'typography-stylist'); ?></strong> <?php esc_html_e('Adobe Fonts loads directly from Adobe’s servers. Make sure that your domain is authorized in your Adobe Fonts project settings.', 'typography-stylist'); ?></p>
                        </div>
                        </div>
                    </details>

                    <!-- Custom Font Definition -->
                    <details class="typost-add-font-subsection">
                        <summary><?php esc_html_e('Add Custom Font Definition', 'typography-stylist'); ?></summary>
                        <div class="typost-add-font-subsection-body">
                        <div class="typost-add-manual-font-form">
                            <div class="typost-form-field">
                                <label for="typost-manual-font-name">
                                    <?php esc_html_e('Font Name:', 'typography-stylist'); ?>
                                    <span class="required" aria-label="<?php esc_attr_e('required', 'typography-stylist'); ?>">*</span>
                                </label>
                                <input type="text" id="typost-manual-font-name" name="typost-manual-font-name" class="regular-text"
                                    placeholder="<?php esc_attr_e('e.g., Playfair Display', 'typography-stylist'); ?>"
                                    aria-required="true" aria-describedby="typost-manual-font-name-desc" />
                                <p id="typost-manual-font-name-desc" class="description">
                                    <?php esc_html_e('Enter a display name for this font.', 'typography-stylist'); ?>
                                </p>
                            </div>
                            <div class="typost-form-field">
                                <label for="typost-manual-font-family">
                                    <?php esc_html_e('CSS Font Family:', 'typography-stylist'); ?>
                                    <span class="required" aria-label="<?php esc_attr_e('required', 'typography-stylist'); ?>">*</span>
                                </label>
                                <input type="text" id="typost-manual-font-family" name="typost-manual-font-family" class="regular-text code"
                                    placeholder="<?php esc_attr_e('e.g., \'Playfair Display\', Georgia, serif', 'typography-stylist'); ?>"
                                    aria-required="true" aria-describedby="typost-manual-font-family-desc" />
                                <p id="typost-manual-font-family-desc" class="description">
                                    <?php
                                    printf(
                                        /* translators: %s: an example CSS font-family value, shown as code. */
                                        esc_html__('Enter the exact CSS font-family value, with any fallback fonts. For example: %s', 'typography-stylist'),
                                        '<code>\'Playfair Display\', Georgia, serif</code>'
                                    );
                                    ?>
                                </p>
                            </div>
                            <button type="button" id="typost-add-manual-font-btn" class="button button-primary">
                                <?php esc_html_e('Add Custom Font', 'typography-stylist'); ?>
                            </button>
                            <div id="typost-manual-font-message" role="alert" aria-live="assertive" aria-atomic="true" style="margin-top: 10px;"></div>
                        </div>
                        <div class="typost-manual-help">
                            <h4><?php esc_html_e('How to use custom font definitions:', 'typography-stylist'); ?></h4>
                            <ol>
                                <li><?php esc_html_e('Make sure that your site already loads the font, for example through your theme, a plugin, or an @font-face rule.', 'typography-stylist'); ?></li>
                                <li><?php esc_html_e('Find the exact font-family name that the CSS uses. Look in your theme’s stylesheet, or use the browser developer tools.', 'typography-stylist'); ?></li>
                                <li><?php esc_html_e('Enter the font name and the CSS font-family value above, with any fallback fonts.', 'typography-stylist'); ?></li>
                                <li><?php esc_html_e('The font then appears in the block editor font list.', 'typography-stylist'); ?></li>
                            </ol>
                            <p><strong><?php esc_html_e('Note:', 'typography-stylist'); ?></strong> <?php esc_html_e('The plugin does not load these fonts. It can style only fonts that your site already loads.', 'typography-stylist'); ?></p>
                        </div>
                        </div>
                    </details>

                </div><!-- .typost-add-font-content -->
            </details><!-- .typost-add-font-section -->

            <!-- LEGACY SECTION ANCHORS (kept for backwards-compatibility with deep links) -->
            <span id="typost-upload-font-section-anchor" style="display:none;"></span>
            <span id="typost-adobe-fonts-section-anchor" style="display:none;"></span>
            <span id="typost-manual-fonts-section-anchor" style="display:none;"></span>

            <?php do_action('typost_admin_tab_after_fonts', $instance); ?>
        </div>

        <!-- Options Tab -->
        <div
            class="typost-tab-content <?php echo 'options' === $active_tab ? 'active' : ''; ?>"
            id="typost-tab-options"
            role="tabpanel"
            aria-labelledby="typost-tab-button-options"
            <?php echo 'options' !== $active_tab ? 'hidden="hidden"' : ''; ?>
            tabindex="0">
            <h2><?php esc_html_e('Options', 'typography-stylist'); ?></h2>

            <details class="typost-tab-help">
                <summary><?php esc_html_e('About Options', 'typography-stylist'); ?></summary>
                <div class="typost-tab-help-content">
                    <p><?php esc_html_e('These settings control plugin behavior across your site. Changes take effect immediately.', 'typography-stylist'); ?></p>
                    <ul>
                        <li><strong><?php esc_html_e('Clear confirmation:', 'typography-stylist'); ?></strong> <?php esc_html_e('Controls whether a confirmation dialog appears when clearing typography formatting in the editor.', 'typography-stylist'); ?></li>
                        <li><strong><?php esc_html_e('Archive font detection:', 'typography-stylist'); ?></strong> <?php esc_html_e('When enabled, the plugin scans full post content on archive pages to detect fonts. This ensures fonts load correctly but may impact performance on sites with many posts per page.', 'typography-stylist'); ?></li>
                        <li><strong><?php esc_html_e('Cache management:', 'typography-stylist'); ?></strong> <?php esc_html_e('The plugin caches font detection results for performance. Clear the cache after making significant changes to fonts or content.', 'typography-stylist'); ?></li>
                    </ul>
                </div>
            </details>

            <p><?php esc_html_e('Configure general plugin settings and user experience preferences.', 'typography-stylist'); ?></p>

            <form method="post" action="">
                <?php wp_nonce_field('typography_stylist_options_settings_nonce'); ?>

                <table class="form-table" role="presentation">
                    <tbody>
                        <tr>
                            <th scope="row">
                                <label for="typost_admin_color_scheme">
                                    <?php esc_html_e('Admin Color Scheme', 'typography-stylist'); ?>
                                </label>
                            </th>
                            <td>
                                <?php $current_scheme = get_option('typost_admin_color_scheme', 'alice-blue'); ?>
                                <select id="typost_admin_color_scheme" name="typost_admin_color_scheme">
                                    <option value="default" <?php selected($current_scheme, 'default'); ?>>
                                        <?php esc_html_e('Default', 'typography-stylist'); ?>
                                    </option>
                                    <option value="admin-colors" <?php selected($current_scheme, 'admin-colors'); ?>>
                                        <?php esc_html_e('Match Admin Theme', 'typography-stylist'); ?>
                                    </option>
                                    <option value="alice-blue" <?php selected($current_scheme, 'alice-blue'); ?>>
                                        <?php esc_html_e('Alice Blue', 'typography-stylist'); ?>
                                    </option>
                                    <option value="dark" <?php selected($current_scheme, 'dark'); ?>>
                                        <?php esc_html_e('Dark Mode', 'typography-stylist'); ?>
                                    </option>
                                    <option value="high-contrast" <?php selected($current_scheme, 'high-contrast'); ?>>
                                        <?php esc_html_e('High Contrast', 'typography-stylist'); ?>
                                    </option>
                                </select>
                                <p class="description">
                                    <?php esc_html_e('Choose a color scheme for the Typography Stylist admin page. “Match Admin Theme” uses the colors of your WordPress admin color scheme.', 'typography-stylist'); ?>
                                </p>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row">
                                <?php esc_html_e('Clear Button Confirmation', 'typography-stylist'); ?>
                            </th>
                            <td>
                                <input
                                    type="checkbox"
                                    id="typost_show_clear_confirmation"
                                    name="typost_show_clear_confirmation"
                                    value="1"
                                    <?php checked(get_option('typost_show_clear_confirmation', true)); ?>
                                />
                                <label for="typost_show_clear_confirmation">
                                    <?php esc_html_e('Show confirmation when clearing typography features', 'typography-stylist'); ?>
                                </label>
                                <p class="description">
                                    <?php esc_html_e('When enabled, the Clear button in the block editor will show a confirmation dialog before removing all formatting. This helps prevent accidental data loss. Users can disable this on a per-session basis.', 'typography-stylist'); ?>
                                </p>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row">
                                <?php esc_html_e('Enter Key in Typography Stylist Blocks', 'typography-stylist'); ?>
                            </th>
                            <td>
                                <input
                                    type="checkbox"
                                    id="typost_block_enter_line_break"
                                    name="typost_block_enter_line_break"
                                    value="1"
                                    <?php checked(get_option('typost_block_enter_line_break', true)); ?>
                                />
                                <label for="typost_block_enter_line_break">
                                    <?php esc_html_e('Enter adds a line break inside the block', 'typography-stylist'); ?>
                                </label>
                                <p class="description">
                                    <?php esc_html_e('When enabled (the default), pressing Enter inside a Typography Stylist block adds a line break to the same block, so a multi-line headline stays one block with one set of typography settings. Turn this off to match the rest of the editor, where Enter starts a new block. Shift+Enter always adds a line break either way. Existing content is not changed by this setting.', 'typography-stylist'); ?>
                                </p>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row">
                                <?php esc_html_e('Font Size Unit for New Content', 'typography-stylist'); ?>
                            </th>
                            <td>
                                <input
                                    type="checkbox"
                                    id="typost_new_font_sizes_px"
                                    name="typost_new_font_sizes_px"
                                    value="1"
                                    aria-describedby="typost_new_font_sizes_px_description"
                                    <?php checked(get_option('typost_new_font_sizes_px', false)); ?>
                                />
                                <label for="typost_new_font_sizes_px">
                                    <?php esc_html_e('Write new font sizes in px', 'typography-stylist'); ?>
                                </label>
                                <p class="description" id="typost_new_font_sizes_px_description">
                                    <?php esc_html_e('You always enter font sizes in px. By default, new content writes them in rem (the px value divided by 16), so headings grow when a reader sets a larger default font size in the browser. If your theme changes the root font size (for example html { font-size: 62.5% }), rem sizes render smaller than the px value you enter. Turn this on to write new font sizes in px instead. It applies to new Typography Stylist blocks, new inline font sizes and new paragraph styles. Content saved before you change this setting keeps its unit.', 'typography-stylist'); ?>
                                </p>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row">
                                <?php esc_html_e('Archive Page Font Detection', 'typography-stylist'); ?>
                            </th>
                            <td>
                                <input
                                    type="checkbox"
                                    id="typost_archive_full_content_check"
                                    name="typost_archive_full_content_check"
                                    value="1"
                                    <?php checked(get_option('typost_archive_full_content_check', '1')); ?>
                                />
                                <label for="typost_archive_full_content_check">
                                    <?php esc_html_e('Check full post content on archive pages (recommended)', 'typography-stylist'); ?>
                                </label>
                                <p class="description">
                                    <?php esc_html_e('When enabled, the plugin checks the full post content on blog archives, category pages, and tag pages to find custom fonts. The fonts then load correctly, even when posts do not have manual excerpts or “Read More” tags. The results are cached for 12 hours, so the cost is small: approximately 250–600 ms on the first page load, then less than 1 ms. Turn this off only if you have a specific performance problem, or if your theme shows plain text excerpts.', 'typography-stylist'); ?>
                                </p>
                            </td>
                        </tr>
                        <?php if ($instance->font_library_bridge()->is_available()) : ?>
                        <tr>
                            <th scope="row">
                                <?php esc_html_e('WordPress Font Library', 'typography-stylist'); ?>
                            </th>
                            <td>
                                <input
                                    type="checkbox"
                                    id="typost_auto_register_wp_fonts"
                                    name="typost_auto_register_wp_fonts"
                                    value="1"
                                    <?php checked(get_option('typost_auto_register_wp_fonts', true)); ?>
                                />
                                <label for="typost_auto_register_wp_fonts">
                                    <?php esc_html_e('Automatically register newly uploaded fonts in the WordPress Font Library (recommended)', 'typography-stylist'); ?>
                                </label>
                                <p class="description">
                                    <?php esc_html_e('When enabled, the plugin also registers fonts from new webfont kits in the WordPress Font Library, so WordPress can use them like any other Library font. Either way, the plugin’s --font-N variables keep working, so existing content does not change. To register fonts that you uploaded before, go to the Custom Fonts tab. You can register them one at a time or all together.', 'typography-stylist'); ?>
                                </p>
                            </td>
                        </tr>
                        <?php endif; ?>
                        <?php
                        /**
                         * Fires inside the Options tab settings table, after the core rows.
                         *
                         * Bundled modules and extension plugins add their own settings rows
                         * here rather than in a tab of their own, so every editor option is
                         * in one place. Echo complete <tr> rows.
                         *
                         * Checkbox inputs marked data-typost-option="1" are collected by the
                         * options form's AJAX save automatically; register the option key with
                         * the `typost_admin_options_checkboxes` filter so both the REST handler
                         * and the no-JS POST fallback persist it.
                         *
                         * @since 2.3.0
                         * @param Typost $instance Plugin instance.
                         */
                        do_action('typost_admin_options_rows', $instance);
                        ?>
                    </tbody>
                </table>

                <p class="submit">
                    <button type="submit" name="typost_save_options_settings" class="button button-primary">
                        <?php esc_html_e('Save Options', 'typography-stylist'); ?>
                    </button>
                </p>
                <div class="typost-settings-ajax-message" role="status" aria-live="polite" aria-atomic="true"></div>
            </form>

            <hr style="margin: 30px 0;">

            <h3><?php esc_html_e('Cache Management', 'typography-stylist'); ?></h3>
            <p><?php esc_html_e('Typography Stylist caches font detection data for 12–24 hours to make pages faster. If fonts do not load correctly after you make changes, clear the cache here.', 'typography-stylist'); ?></p>

            <form method="post" action="">
                <?php wp_nonce_field('typography_stylist_clear_cache_nonce'); ?>
                <p class="submit">
                    <button type="submit" name="typost_clear_cache" class="button button-secondary">
                        <?php esc_html_e('Clear Font Cache', 'typography-stylist'); ?>
                    </button>
                </p>
                <div class="typost-settings-ajax-message" role="status" aria-live="polite" aria-atomic="true"></div>
            </form>

            <hr style="margin: 30px 0;">

            <h3><?php esc_html_e('Editor Tips', 'typography-stylist'); ?></h3>
            <p><?php esc_html_e('The editor panels open with a dismissible tips notice. Dismissing it is remembered in this browser only. Use this button to show the tips again in this browser.', 'typography-stylist'); ?></p>

            <form method="post" action="" class="typost-reset-tips-form">
                <p class="submit">
                    <button type="submit" name="typost_reset_tips" class="button button-secondary">
                        <?php esc_html_e('Show Editor Tips Again', 'typography-stylist'); ?>
                    </button>
                </p>
                <div class="typost-settings-ajax-message" role="status" aria-live="polite" aria-atomic="true"></div>
            </form>
            <?php do_action('typost_admin_tab_after_options', $instance); ?>
        </div>

        <!-- Accessibility Tab -->
        <div
            class="typost-tab-content <?php echo 'accessibility' === $active_tab ? 'active' : ''; ?>"
            id="typost-tab-accessibility"
            role="tabpanel"
            aria-labelledby="typost-tab-button-accessibility"
            <?php echo 'accessibility' !== $active_tab ? 'hidden="hidden"' : ''; ?>
            tabindex="0">
            <h2><?php esc_html_e('Accessibility Settings', 'typography-stylist'); ?></h2>

            <details class="typost-tab-help">
                <summary><?php esc_html_e('About Accessibility', 'typography-stylist'); ?></summary>
                <div class="typost-tab-help-content">
                    <p><?php esc_html_e('The Typography Stylist block is built for accessibility. It makes two versions of each heading: a plain text version for screen readers and a styled version for sighted readers.', 'typography-stylist'); ?></p>
                    <p><?php esc_html_e('The settings below control how screen readers and other assistive technologies handle styled text. The defaults suit most sites. Change them only if your site has specific accessibility requirements.', 'typography-stylist'); ?></p>
                </div>
            </details>

            <div class="notice notice-info inline typost-builtin-a11y">
                <h3><?php esc_html_e('Built-in Accessibility Features', 'typography-stylist'); ?></h3>
                <p><?php esc_html_e('These features work with no setup:', 'typography-stylist'); ?></p>
                <ul>
                    <li><strong><?php esc_html_e('Typography Stylist Block:', 'typography-stylist'); ?></strong> <?php
                        printf(
                            /* translators: %s: the attribute aria-hidden="true", shown as code. */
                            esc_html__('Makes two headings. Screen readers get a plain text version that is visually hidden. Sighted readers get the styled version, which %s hides from screen readers.', 'typography-stylist'),
                            '<code>aria-hidden="true"</code>'
                        );
                    ?></li>
                    <li><strong><?php esc_html_e('Inline Format (Rich Text Blocks):', 'typography-stylist'); ?></strong> <?php esc_html_e('Applies the styling directly to the text. Screen readers read the text as it is.', 'typography-stylist'); ?></li>
                </ul>
            </div>

            <form method="post" action="">
                <?php wp_nonce_field('typography_stylist_accessibility_settings_nonce'); ?>

                <h3><?php esc_html_e('Inline Format Settings', 'typography-stylist'); ?></h3>
                <p><?php esc_html_e('This setting applies to text styled with the inline format in standard blocks, such as headings and paragraphs.', 'typography-stylist'); ?></p>

                <table class="form-table" role="presentation">
                    <tbody>
                        <tr>
                            <th scope="row">
                                <?php esc_html_e('Disable Word Boundary Warning', 'typography-stylist'); ?>
                            </th>
                            <td>
                                <input
                                    type="checkbox"
                                    id="typost_disable_accessibility_warning"
                                    name="typost_disable_accessibility_warning"
                                    value="1"
                                    <?php checked(get_option('typost_disable_accessibility_warning', false)); ?>
                                />
                                <label for="typost_disable_accessibility_warning">
                                    <?php esc_html_e('Skip the warning when applying features to partial words', 'typography-stylist'); ?>
                                </label>
                                <p class="description">
                                    <?php esc_html_e('When you style part of a word (for example, one letter) with the inline format, the editor shows a warning and offers to convert the text to a Typography Stylist block. Turn this on to skip the warning and apply the styling directly.', 'typography-stylist'); ?>
                                </p>
                            </td>
                        </tr>
                    </tbody>
                </table>

                <p class="submit">
                    <button type="submit" name="typost_save_accessibility_settings" class="button button-primary">
                        <?php esc_html_e('Save Accessibility Settings', 'typography-stylist'); ?>
                    </button>
                </p>
                <div class="typost-settings-ajax-message" role="status" aria-live="polite" aria-atomic="true"></div>
            </form>

            <div class="typost-accessibility-recommendations">
                <h3><?php esc_html_e('Accessibility Best Practices', 'typography-stylist'); ?></h3>
                <ul>
                    <li><?php esc_html_e('To style part of a word, use the Typography Stylist block, not the inline format.', 'typography-stylist'); ?></li>
                    <li><?php esc_html_e('With the inline format, select complete words or phrases. A styled part of a word can make a screen reader read the word in pieces.', 'typography-stylist'); ?></li>
                    <li><?php esc_html_e('Test styled headings with a screen reader, such as NVDA on Windows or VoiceOver on macOS.', 'typography-stylist'); ?></li>
                    <li><?php esc_html_e('If you style part of a word with the inline format, the editor warns you and offers to convert the text to a Typography Stylist block. You can turn off this warning above.', 'typography-stylist'); ?></li>
                </ul>
            </div>
            <?php do_action('typost_admin_tab_after_accessibility', $instance); ?>
        </div>

        <!-- Replacement Fonts Tab -->
        <div
            class="typost-tab-content <?php echo 'replacements' === $active_tab ? 'active' : ''; ?>"
            id="typost-tab-replacements"
            role="tabpanel"
            aria-labelledby="typost-tab-button-replacements"
            <?php echo 'replacements' !== $active_tab ? 'hidden="hidden"' : ''; ?>
            tabindex="0">
            <h2><?php esc_html_e('Replacement Fonts', 'typography-stylist'); ?></h2>

            <details class="typost-tab-help">
                <summary><?php esc_html_e('About Replacement Fonts', 'typography-stylist'); ?></summary>
                <div class="typost-tab-help-content">
                    <p><?php esc_html_e('Font replacements ensure your content looks correct even after deleting a font. When a font is removed, any content that used it would normally lose its styling. Replacement mappings redirect that content to display with a different font instead.', 'typography-stylist'); ?></p>
                    <p><?php esc_html_e('Replacements are created automatically when you delete a font and choose a replacement. You can also create them manually for fonts that were deleted before this feature was available.', 'typography-stylist'); ?></p>
                </div>
            </details>

            <p><?php esc_html_e('When a font is deleted, you can map it to a replacement font. Content using the deleted font will automatically display with the replacement.', 'typography-stylist'); ?></p>

            <div id="typost-replacements-list">
                <!-- Populated by JavaScript -->
                <p class="typost-no-replacements"><?php esc_html_e('No font replacements configured.', 'typography-stylist'); ?></p>
            </div>

            <div class="typost-add-replacement-section">
                <h3><?php esc_html_e('Add New Replacement Mapping', 'typography-stylist'); ?></h3>
                <p><?php esc_html_e('Manually create a replacement mapping for a font ID that was previously deleted.', 'typography-stylist'); ?></p>

                <div class="typost-add-replacement-form">
                    <div class="typost-form-field">
                        <label for="typost-new-deleted-id">
                            <?php esc_html_e('Deleted Font ID:', 'typography-stylist'); ?>
                        </label>
                        <select id="typost-new-deleted-id" class="regular-text" aria-describedby="typost-new-deleted-id-desc">
                            <option value=""><?php esc_html_e('Select a deleted font ID…', 'typography-stylist'); ?></option>
                            <!-- Populated by JavaScript -->
                        </select>
                        <p id="typost-new-deleted-id-desc" class="description">
                            <?php esc_html_e('Select the ID of a deleted font. The list shows only the IDs that do not have a replacement yet.', 'typography-stylist'); ?>
                        </p>
                    </div>

                    <div class="typost-form-field">
                        <label for="typost-new-replacement-id">
                            <?php esc_html_e('Replacement Font:', 'typography-stylist'); ?>
                        </label>
                        <select id="typost-new-replacement-id" class="regular-text" aria-describedby="typost-new-replacement-id-desc">
                            <option value=""><?php esc_html_e('Select a replacement font…', 'typography-stylist'); ?></option>
                            <!-- Populated by JavaScript -->
                        </select>
                        <p id="typost-new-replacement-id-desc" class="description">
                            <?php esc_html_e('Select the active font that replaces the deleted font.', 'typography-stylist'); ?>
                        </p>
                    </div>

                    <div class="typost-form-actions">
                        <button type="button" id="typost-add-replacement-btn" class="button button-primary">
                            <?php esc_html_e('Add Replacement', 'typography-stylist'); ?>
                        </button>
                    </div>

                    <div id="typost-add-replacement-message" class="typost-message" role="alert" aria-live="assertive"></div>
                </div>
            </div>

            <div id="typost-unassigned-fonts" style="display:none; margin-top: 30px;">
                <h3><?php esc_html_e('Unassigned Font IDs', 'typography-stylist'); ?></h3>
                <p><?php esc_html_e('These font IDs are referenced in your replacement mappings but no longer have active fonts. Assign replacements to restore functionality.', 'typography-stylist'); ?></p>
                <div id="typost-unassigned-list">
                    <!-- Populated by JavaScript -->
                </div>
            </div>
            <?php do_action('typost_admin_tab_after_replacements', $instance); ?>
        </div>

        <!-- Help Tab -->
        <div
            class="typost-tab-content <?php echo 'help' === $active_tab ? 'active' : ''; ?>"
            id="typost-tab-help"
            role="tabpanel"
            aria-labelledby="typost-tab-button-help"
            <?php echo 'help' !== $active_tab ? 'hidden="hidden"' : ''; ?>
            tabindex="0">
            <h2><?php esc_html_e('How to Use', 'typography-stylist'); ?></h2>

            <div class="typost-help-section">
                <h3><?php esc_html_e('Method 1: Inline Format (Quick Styling)', 'typography-stylist'); ?></h3>
                <p><?php esc_html_e('Use the inline format to style complete words or phrases in a heading, paragraph, or other text block.', 'typography-stylist'); ?></p>
                <ol>
                    <li><?php esc_html_e('Add or select a heading or paragraph block.', 'typography-stylist'); ?></li>
                    <li><?php esc_html_e('Select the complete words that you want to style.', 'typography-stylist'); ?></li>
                    <li><?php esc_html_e('Click “Typography Stylist Features” in the block toolbar.', 'typography-stylist'); ?></li>
                    <li><?php esc_html_e('Choose a preset, or turn on individual features.', 'typography-stylist'); ?></li>
                    <li><?php esc_html_e('The text changes as you work. Click “Close” when you are done.', 'typography-stylist'); ?></li>
                </ol>

                <h3><?php esc_html_e('Method 2: Typography Stylist Block (Advanced)', 'typography-stylist'); ?></h3>
                <p><?php esc_html_e('Use the block for complex typography, for styling single letters, or when you need its built-in accessibility features.', 'typography-stylist'); ?></p>
                <ol>
                    <li><?php esc_html_e('Add the “Typography Stylist” block from the block inserter.', 'typography-stylist'); ?></li>
                    <li><?php esc_html_e('Choose the heading level (H1–H6) in the block toolbar.', 'typography-stylist'); ?></li>
                    <li><?php esc_html_e('Use the sidebar controls to set the font family, size, and OpenType features for the whole block.', 'typography-stylist'); ?></li>
                    <li><?php esc_html_e('To style only part of the text, select it, then click “Typography Stylist Features” in the block toolbar.', 'typography-stylist'); ?></li>
                </ol>
            </div>

            <div class="typost-help-section">
                <h3><?php esc_html_e('Line Breaks and the Enter Key', 'typography-stylist'); ?></h3>
                <p><?php esc_html_e('The Enter key works differently in a Typography Stylist block than in a regular heading or paragraph.', 'typography-stylist'); ?></p>
                <ul>
                    <li><strong><?php esc_html_e('In a Typography Stylist block:', 'typography-stylist'); ?></strong> <?php esc_html_e('Enter adds a line break and keeps you in the same block, so a multi-line headline shares one set of typography settings. You can change this on the Options tab so Enter starts a new block instead.', 'typography-stylist'); ?></li>
                    <li><strong><?php esc_html_e('In a regular heading or paragraph:', 'typography-stylist'); ?></strong> <?php esc_html_e('Enter ends the block and starts a new paragraph. This is standard WordPress behavior, and the plugin does not change it.', 'typography-stylist'); ?></li>
                </ul>
                <p><?php esc_html_e('To add a line break in a regular heading, press Shift+Enter. If a heading has already split in two, put the cursor at the start of the paragraph below it and press Backspace. This joins the text back into the heading. Then press Shift+Enter where you want the line break.', 'typography-stylist'); ?></p>
                <p><?php esc_html_e('Shift+Enter also adds a line break in a Typography Stylist block, whatever the Options setting is.', 'typography-stylist'); ?></p>
            </div>

            <div class="typost-help-section">
                <h3><?php esc_html_e('Choosing Fonts for OpenType Features', 'typography-stylist'); ?></h3>
                <p><?php esc_html_e('A feature works only when the font includes it. Look for fonts with alternate glyphs and advanced OpenType features.', 'typography-stylist'); ?></p>

                <h4><?php esc_html_e('Font types that often include OpenType features', 'typography-stylist'); ?></h4>
                <ul>
                    <li><strong><?php esc_html_e('Script and calligraphy fonts:', 'typography-stylist'); ?></strong> <?php esc_html_e('Often include contextual alternates, swashes, and stylistic sets.', 'typography-stylist'); ?></li>
                    <li><strong><?php esc_html_e('Serif display fonts:', 'typography-stylist'); ?></strong> <?php esc_html_e('Can include titling alternates and ligatures.', 'typography-stylist'); ?></li>
                    <li><strong><?php esc_html_e('Professional typefaces:', 'typography-stylist'); ?></strong> <?php esc_html_e('Many include discretionary ligatures and stylistic alternates.', 'typography-stylist'); ?></li>
                    <li><strong><?php esc_html_e('Ornamental fonts:', 'typography-stylist'); ?></strong> <?php esc_html_e('Can include ornaments and special character sets.', 'typography-stylist'); ?></li>
                </ul>

                <p><?php esc_html_e('Add fonts on the Custom Fonts tab. You can upload a font kit, connect Adobe Fonts, or define a font that your theme or a font service already loads.', 'typography-stylist'); ?></p>
            </div>

            <div class="typost-help-section">
                <h3><?php esc_html_e('Tips for Using OpenType Features', 'typography-stylist'); ?></h3>
                <ul>
                    <li><?php esc_html_e('Start with contextual alternates (calt). They change letters automatically, based on the letters around them.', 'typography-stylist'); ?></li>
                    <li><?php esc_html_e('Use swashes sparingly, on first or last letters only.', 'typography-stylist'); ?></li>
                    <li><?php esc_html_e('Try the stylistic sets (ss01–ss20) to find alternate letter designs.', 'typography-stylist'); ?></li>
                    <li><?php esc_html_e('Standard ligatures (liga) suit most text. Use discretionary ligatures (dlig) with care.', 'typography-stylist'); ?></li>
                    <li><?php esc_html_e('Preview the text at the size it will display. Features can look different at other sizes.', 'typography-stylist'); ?></li>
                    <li><?php esc_html_e('Not every font supports every feature. Read the font’s documentation, and test each feature.', 'typography-stylist'); ?></li>
                    <li><?php esc_html_e('To style part of a word, use the Typography Stylist block. This keeps the text accessible.', 'typography-stylist'); ?></li>
                </ul>
            </div>

            <div class="typost-help-section">
                <h3><?php esc_html_e('Technical Notes', 'typography-stylist'); ?></h3>
                <p><?php esc_html_e('The plugin stores features in the post content, as CSS font-feature-settings in inline styles and data attributes. It adds no database tables.', 'typography-stylist'); ?></p>
                <p><?php esc_html_e('All modern browsers (Chrome, Firefox, Safari, and Edge) support OpenType features.', 'typography-stylist'); ?></p>
                <p><?php esc_html_e('The pages that visitors see use only CSS. The plugin adds no JavaScript to them.', 'typography-stylist'); ?></p>
            </div>

            <!-- Developer Support Section -->
            <div class="typost-developer-support">
                <h3><?php esc_html_e('Looking for high-fidelity implementation?', 'typography-stylist'); ?></h3>

                <p><?php esc_html_e('Beyond this plugin, I specialize in pixel-perfect WordPress builds that strictly adhere to accessibility standards and advanced typographic systems. If you need a partner for custom block development or complex design integration:', 'typography-stylist'); ?></p>

                <p>
                    <a href="mailto:matt@mnc4.com" class="button">
                        <?php esc_html_e('Contact me at matt@mnc4.com', 'typography-stylist'); ?>
                    </a>
                    <span class="typost-separator">|</span>
                    <a href="https://buymeacoffee.com/matthewneilcowan" target="_blank" rel="noopener noreferrer" class="button">
                        <?php esc_html_e('Buy me a coffee ☕', 'typography-stylist'); ?>
                    </a>
                </p>
            </div>
            <?php do_action('typost_admin_tab_after_help', $instance); ?>
        </div>

        <?php
        // Render tab panels for extension-registered tabs
        foreach ($tabs as $tab) {
            if (!in_array($tab['id'], $built_in_tab_ids, true)) {
                ?>
                <div
                    class="typost-tab-content <?php echo $tab['id'] === $active_tab ? 'active' : ''; ?>"
                    id="typost-tab-<?php echo esc_attr($tab['id']); ?>"
                    role="tabpanel"
                    aria-labelledby="typost-tab-button-<?php echo esc_attr($tab['id']); ?>"
                    <?php echo $tab['id'] !== $active_tab ? 'hidden="hidden"' : ''; ?>
                    tabindex="0">
                    <?php
                    /**
                     * Render content for an extension-registered admin tab.
                     *
                     * The dynamic portion of the hook name, `$tab_id`, refers to the
                     * tab's 'id' value registered via the typost_admin_tabs filter.
                     *
                     * @since 2.0.0
                     * @param Typost $instance Plugin instance.
                     */
                    do_action("typost_admin_tab_content_{$tab['id']}", $instance);
                    ?>
                </div>
                <?php
            }
        }
        ?>
    </div>

    <!-- Font Deletion Modal -->
    <div id="typost-delete-font-modal" class="typost-modal" style="display:none;" role="dialog" aria-modal="true" aria-labelledby="typost-delete-font-modal-title">
        <div class="typost-modal-overlay"></div>
        <div class="typost-modal-content">
            <div class="typost-modal-header">
                <h2 id="typost-delete-font-modal-title"><?php esc_html_e('Delete Font', 'typography-stylist'); ?></h2>
                <button class="typost-modal-close" aria-label="<?php esc_attr_e('Close', 'typography-stylist'); ?>">&times;</button>
            </div>
            <div class="typost-modal-body">
                <p><?php esc_html_e('Assign a fallback for existing uses of this font?', 'typography-stylist'); ?></p>
                <p class="description"><?php esc_html_e('Content will automatically use the replacement font. You can change this later in Replacement Fonts.', 'typography-stylist'); ?></p>

                <div class="typost-modal-field">
                    <label for="typost-replacement-font-select">
                        <?php esc_html_e('Replacement Font:', 'typography-stylist'); ?>
                    </label>
                    <select id="typost-replacement-font-select">
                        <option value=""><?php esc_html_e('No Replacement (Skip)', 'typography-stylist'); ?></option>
                        <!-- Populated by JavaScript -->
                    </select>
                </div>

                <div class="typost-modal-field">
                    <label>
                        <input type="checkbox" id="typost-replacement-global-load" />
                        <?php esc_html_e('Load replacement globally', 'typography-stylist'); ?>
                    </label>
                    <p class="description"><?php esc_html_e('Forces this replacement to load on all pages, even if the deleted font is not detected.', 'typography-stylist'); ?></p>
                </div>
            </div>
            <div class="typost-modal-footer">
                <button type="button" class="button typost-modal-cancel"><?php esc_html_e('Cancel', 'typography-stylist'); ?></button>
                <button type="button" class="button button-primary typost-modal-confirm-delete"><?php esc_html_e('Delete Font', 'typography-stylist'); ?></button>
            </div>
        </div>
    </div>
</div>

<!-- All CSS and JavaScript have been moved to separate external files:
     - assets/css/admin-page.css (or admin-page.min.css)
     - assets/js/admin-page.js (or admin-page.min.js)
     These files are enqueued in the main plugin file via enqueue_admin_assets() method
-->
    <?php
}
// End of typography_stylist_render_admin_template() function

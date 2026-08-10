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
        '100' => __('100 - Thin', 'typography-stylist'),
        '200' => __('200 - Extra Light', 'typography-stylist'),
        '300' => __('300 - Light', 'typography-stylist'),
        '400' => __('400 - Normal', 'typography-stylist'),
        '500' => __('500 - Medium', 'typography-stylist'),
        '600' => __('600 - Semi Bold', 'typography-stylist'),
        '700' => __('700 - Bold', 'typography-stylist'),
        '800' => __('800 - Extra Bold', 'typography-stylist'),
        '900' => __('900 - Black', 'typography-stylist'),
    );
    $available = !empty($font['available_weights']) ? $font['available_weights'] : array();
    $all_available = empty($available); // Empty array = all weights available
    ?>
    <fieldset class="typost-form-field typost-weight-fieldset">
        <legend><?php esc_html_e('Available Font Weights:', 'typography-stylist'); ?></legend>
        <p class="description" id="typost-<?php echo esc_attr($prefix); ?>-weights-desc-<?php echo esc_attr($font['id']); ?>">
            <?php esc_html_e('Uncheck weights this font doesn\'t include to exclude them from being selected. You can leave all checked for variable fonts.', 'typography-stylist'); ?>
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
 * Render feature visibility checkboxes for a font edit form.
 *
 * @param array  $font     The font data array (must include 'font_id' numeric key).
 * @param object $instance The Typost plugin instance.
 *
 * @since 2.0.0
 */
function typost_render_feature_visibility_checkboxes($font, $instance) {
    $font_numeric_id = isset($font['font_id']) ? (int) $font['font_id'] : 0;
    if (!$font_numeric_id) {
        return;
    }

    $available_features = $instance->get_available_features();
    $visibility_map     = $instance->get_font_feature_visibility();
    $entry              = isset($visibility_map[$font_numeric_id]) ? $visibility_map[$font_numeric_id] : array();
    $disabled_features  = (!empty($entry['disabled_features']) && is_array($entry['disabled_features']))
                          ? $entry['disabled_features']
                          : array();

    // Group features by category
    $grouped = array();
    foreach ($available_features as $feature) {
        $cat = isset($feature['category']) ? $feature['category'] : 'other';
        $grouped[$cat][] = $feature;
    }

    $category_titles = array(
        'ligatures'     => __('Ligatures', 'typography-stylist'),
        'stylistic-sets'=> __('Stylistic Sets', 'typography-stylist'),
        'alternates'    => __('Swashes & Alternates', 'typography-stylist'),
        'decorative'    => __('Decorative', 'typography-stylist'),
        'numerals'      => __('Numerals & Figures', 'typography-stylist'),
        'capitals'      => __('Capitals & Case', 'typography-stylist'),
        'positional'    => __('Positional Forms', 'typography-stylist'),
        'super-sub'     => __('Superscript & Ordinals', 'typography-stylist'),
        'other'         => __('Other Features', 'typography-stylist'),
    );
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
            <?php foreach ($grouped as $cat => $features): ?>
            <fieldset class="typost-form-visibility-category">
                <legend><?php echo esc_html(isset($category_titles[$cat]) ? $category_titles[$cat] : ucfirst($cat)); ?></legend>
                <div class="typost-form-visibility-checkboxes">
                    <?php foreach ($features as $feature): ?>
                    <label class="typost-form-visibility-label">
                        <input
                            type="checkbox"
                            class="typost-font-form-visibility-checkbox"
                            data-feature-id="<?php echo esc_attr($feature['id']); ?>"
                            <?php checked(!in_array($feature['id'], $disabled_features, true)); ?> />
                        <span class="typost-form-visibility-feature-name"><?php echo esc_html($feature['name']); ?></span>
                        <code class="typost-form-visibility-feature-code"><?php echo esc_html($feature['id']); ?></code>
                    </label>
                    <?php endforeach; ?>
                </div>
            </fieldset>
            <?php endforeach; ?>
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
                            '%d uploaded font is not yet registered in the WordPress Font Library. Registering makes it available site-wide (Appearance → Editor) while everything keeps working exactly as before — existing content is never affected, and you can undo per font at any time.',
                            '%d uploaded fonts are not yet registered in the WordPress Font Library. Registering makes them available site-wide (Appearance → Editor) while everything keeps working exactly as before — existing content is never affected, and you can undo per font at any time.',
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
                            '%d font was added before weight detection existed, so all nine weights are enabled for it. Auto-detection checks only the weights each font actually includes — uploaded fonts are read from their font files, Adobe Fonts from their kit stylesheet. You can adjust the checkboxes afterwards at any time.',
                            '%d fonts were added before weight detection existed, so all nine weights are enabled for them. Auto-detection checks only the weights each font actually includes — uploaded fonts are read from their font files, Adobe Fonts from their kit stylesheet. You can adjust the checkboxes afterwards at any time.',
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
            <ul id="typost-unified-font-list" class="typost-unified-font-list" aria-label="<?php esc_attr_e('Font list — drag to reorder', 'typography-stylist'); ?>">

            <?php foreach ($all_fonts_list as $unified): ?>
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
                                <h3 <?php echo $css_var ? 'style="font-family: ' . esc_attr($css_var) . '"' : ''; ?>><?php echo esc_html($font['name']); ?></h3>
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
                                    <?php esc_html_e('Enter fallback fonts separated by commas (these will be used if the primary font fails to load)', 'typography-stylist'); ?>
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
                                    <?php esc_html_e('Registered fonts appear in the WordPress Font Library (Appearance → Editor) and WordPress serves their font files. Either way the plugin\'s --font-N variables keep working, so existing content is never affected.', 'typography-stylist'); ?>
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
                                <h3 <?php echo $css_var ? 'style="font-family: ' . esc_attr($css_var) . '"' : ''; ?>><?php echo esc_html($font['name']); ?></h3>
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
                                    <?php esc_html_e('Enter fallback fonts separated by commas (these will be used if the primary font fails to load)', 'typography-stylist'); ?>
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
                                <h3 <?php echo $css_var ? 'style="font-family: ' . esc_attr($css_var) . '"' : ''; ?>><?php echo esc_html($font['name']); ?></h3>
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
                                    <?php esc_html_e('Enter the exact CSS font-family value including any fallback fonts (e.g., \'Playfair Display\', Georgia, serif)', 'typography-stylist'); ?>
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
                            <h3 <?php echo !empty($wpl['font_family']) ? 'style="font-family: ' . esc_attr($wpl['font_family']) . '"' : ''; ?>><?php echo esc_html($wpl['name']); ?></h3>
                            <?php if (!empty($wpl['font_family'])): ?>
                            <code class="typost-wpl-family"><?php echo esc_html($wpl['font_family']); ?></code>
                            <?php endif; ?>
                            <a href="<?php echo esc_url(admin_url('themes.php?page=gutenberg-edit-site')); ?>"
                                class="button typost-wpl-manage-btn" target="_blank"
                                aria-label="<?php esc_attr_e('Manage fonts in Appearance Editor (opens in new tab)', 'typography-stylist'); ?>">
                                <span aria-hidden="true" class="dashicons dashicons-external"></span>
                                <?php esc_html_e('Manage in Editor', 'typography-stylist'); ?>
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
                <p><?php esc_html_e('Use the "Add Font" section below to upload a font kit, add an Adobe Fonts project, or define a custom font.', 'typography-stylist'); ?></p>
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
                    <p><?php esc_html_e('Use this page to preview how each feature affects your fonts. Select a custom font from the dropdown to see real results — different fonts support different features.', 'typography-stylist'); ?></p>
                    <ul>
                        <li><?php esc_html_e('Features are grouped by category (ligatures, stylistic sets, numerals, etc.)', 'typography-stylist'); ?></li>
                        <li><?php esc_html_e('Use the card width slider to adjust preview size for easier comparison', 'typography-stylist'); ?></li>
                        <li><?php esc_html_e('When a font is selected, you can enable or disable individual features for that font in the editor', 'typography-stylist'); ?></li>
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
                        placeholder="<?php esc_attr_e('Type your own text to preview features...', 'typography-stylist'); ?>"
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

            $category_titles = array(
                'ligatures' => esc_html__('Ligatures', 'typography-stylist'),
                'stylistic-sets' => esc_html__('Stylistic Sets', 'typography-stylist'),
                'alternates' => esc_html__('Swashes & Alternates', 'typography-stylist'),
                'decorative' => esc_html__('Decorative', 'typography-stylist'),
                'numerals' => esc_html__('Numerals & Figures', 'typography-stylist'),
                'capitals' => esc_html__('Capitals & Case', 'typography-stylist'),
                'positional' => esc_html__('Positional Forms', 'typography-stylist'),
                'super-sub' => esc_html__('Superscript & Ordinals', 'typography-stylist'),
                'other' => esc_html__('Other Features', 'typography-stylist')
            );
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
                <p><?php esc_html_e('These are presets you have created in the block editor.', 'typography-stylist'); ?></p>

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
                    <p><strong><?php esc_html_e('Why use custom fonts?', 'typography-stylist'); ?></strong> <?php esc_html_e('OpenType features (ligatures, swashes, stylistic sets) are built into specific font files. Standard system fonts and many web fonts have limited OpenType support. Specialty fonts from foundries like MyFonts, Adobe Fonts, or Font Squirrel often include rich OpenType feature tables that unlock the full potential of this plugin.', 'typography-stylist'); ?></p>
                    <p><strong><?php esc_html_e('Performance benefit:', 'typography-stylist'); ?></strong> <?php esc_html_e('Fonts added here only load on pages where they are actually used. If you need a particular decorative font on just one page, it will not slow down any other pages on your site.', 'typography-stylist'); ?></p>
                    <p><strong><?php esc_html_e('Three ways to add fonts:', 'typography-stylist'); ?></strong></p>
                    <ol>
                        <li><strong><?php esc_html_e('Upload Font Kit', 'typography-stylist'); ?></strong> — <?php esc_html_e('Upload a ZIP file from font providers like MyFonts, Fontspring, or Google Fonts. Best for fonts you have purchased and downloaded.', 'typography-stylist'); ?></li>
                        <li><strong><?php esc_html_e('Adobe Fonts', 'typography-stylist'); ?></strong> — <?php esc_html_e('Paste the embed code from your Adobe Fonts (Typekit) project. Best for Adobe Creative Cloud subscribers.', 'typography-stylist'); ?></li>
                        <li><strong><?php esc_html_e('Custom Font Definition', 'typography-stylist'); ?></strong> — <?php esc_html_e('Reference fonts already loaded by your theme, a plugin, or a CDN. Best when you already have a font available and just need Typography Stylist to recognize it.', 'typography-stylist'); ?></li>
                    </ol>
                </div>
            </details>

            <p><?php esc_html_e('Manage all fonts available in the block editor. Drag items to reorder them — the order here determines the order in the editor font selector.', 'typography-stylist'); ?></p>

            <div id="typost-fonts-region" tabindex="-1">
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
                        <p><?php esc_html_e('Upload a complete webfont kit as a ZIP file (e.g., MyWebfontsKit.zip). The ZIP can contain a CSS file and font files, or just the font files themselves (such as a Google Fonts download) — if no stylesheet is included, one is generated automatically from the fonts\' built-in metadata.', 'typography-stylist'); ?></p>
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
                                    <?php esc_html_e('Uploading...', 'typography-stylist'); ?>
                                </div>
                            </div>
                            <div id="typost-font-message" role="alert" aria-live="assertive" aria-atomic="true" style="margin-top: 10px;"></div>
                        </div>
                        <div class="typost-font-help">
                            <h4><?php esc_html_e('How to use:', 'typography-stylist'); ?></h4>
                            <ol>
                                <li><?php esc_html_e('Download your webfont kit from your font provider', 'typography-stylist'); ?></li>
                                <li><?php esc_html_e('If the kit is not already zipped, create a ZIP file containing the entire kit folder. A CSS file is recommended but not required — a ZIP of bare font files also works', 'typography-stylist'); ?></li>
                                <li><?php esc_html_e('Click "Choose ZIP File" and select your webfont kit ZIP file', 'typography-stylist'); ?></li>
                                <li><?php esc_html_e('Click "Upload Font Kit" — the font names are read from the kit itself', 'typography-stylist'); ?></li>
                                <li><?php esc_html_e('The plugin will extract the ZIP, process the fonts, and make them available in the block editor', 'typography-stylist'); ?></li>
                            </ol>
                            <p><strong><?php esc_html_e('Compatibility Note:', 'typography-stylist'); ?></strong> <?php esc_html_e('This plugin has been tested with webfont kits from MyFonts and with bare-font downloads from Google Fonts. Other providers should work too: kits with a CSS file are used as-is, and font-only ZIPs get a generated stylesheet. For WOFF2-only ZIPs the family and weight are detected from the filenames (the server cannot read WOFF2 metadata), so review the result and re-upload as TTF if something looks wrong.', 'typography-stylist'); ?></p>
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
                                    <?php esc_html_e('Paste the complete embed code from your Adobe Fonts project (including <link> tags)', 'typography-stylist'); ?>
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
                                    <?php esc_html_e('Enter the exact font family names separated by commas (find these in your Adobe Fonts project settings)', 'typography-stylist'); ?>
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
                                <li><?php esc_html_e('Go to fonts.adobe.com and create or open your Web Project', 'typography-stylist'); ?></li>
                                <li><?php esc_html_e('Add the fonts you want to use to your project', 'typography-stylist'); ?></li>
                                <li><?php esc_html_e('Copy the embed code (the <link> tag) from the project', 'typography-stylist'); ?></li>
                                <li><?php esc_html_e('Paste it above and give your project a name', 'typography-stylist'); ?></li>
                            </ol>
                            <p><strong><?php esc_html_e('Note:', 'typography-stylist'); ?></strong> <?php esc_html_e('Adobe Fonts loads directly from Adobe\'s servers. Make sure your domain is authorized in your Adobe Fonts project settings.', 'typography-stylist'); ?></p>
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
                                    <?php esc_html_e('Enter a display name for this font', 'typography-stylist'); ?>
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
                                    <?php esc_html_e('Enter the exact CSS font-family value including any fallback fonts (e.g., \'Playfair Display\', Georgia, serif)', 'typography-stylist'); ?>
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
                                <li><?php esc_html_e('Make sure your font is already loaded on your site (via theme, plugin, or @font-face)', 'typography-stylist'); ?></li>
                                <li><?php esc_html_e('Find the exact font-family name used in CSS (check your theme\'s stylesheet or browser developer tools)', 'typography-stylist'); ?></li>
                                <li><?php esc_html_e('Enter the font name and CSS font-family value above (including any fallback fonts)', 'typography-stylist'); ?></li>
                                <li><?php esc_html_e('The font will be available in the block editor font selector', 'typography-stylist'); ?></li>
                            </ol>
                            <p><strong><?php esc_html_e('Note:', 'typography-stylist'); ?></strong> <?php esc_html_e('This plugin does not load fonts for you - it only applies OpenType features to fonts already loaded on your site.', 'typography-stylist'); ?></p>
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
                                    <?php esc_html_e('Choose a color scheme for the Typography Stylist admin page. "Match Admin Theme" adapts to your WordPress admin color palette.', 'typography-stylist'); ?>
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
                                    <?php esc_html_e('When enabled, the plugin checks full post content on blog archives, category pages, and tag pages to detect custom fonts. This ensures fonts load correctly even when posts don\'t have manual excerpts or "Read More" tags. Performance impact is minimal due to 12-hour caching (approximately 250-600ms on first page load, then < 1ms for subsequent loads). Disable this only if you have a specific performance concern or your theme uses plain text excerpts.', 'typography-stylist'); ?>
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
                                    <?php esc_html_e('When enabled, fonts from newly uploaded webfont kits are also registered in the WordPress Font Library (Appearance → Editor), so they can be used site-wide and share WordPress\'s font system. The plugin\'s --font-N variables keep working either way, so existing content is never affected. Previously uploaded fonts can be registered individually or in bulk from the Custom Fonts tab.', 'typography-stylist'); ?>
                                </p>
                            </td>
                        </tr>
                        <?php endif; ?>
                        <?php
                        /*
                         * Variable Font Weights option - commented out for future version
                         * Backend functionality remains in place, UI option hidden until ready for release
                         */
                        ?>
                        <?php /* ?>
                        <tr>
                            <th scope="row">
                                <label for="typost_allow_variable_weights">
                                    <?php esc_html_e('Variable Font Weights', 'typography-stylist'); ?>
                                </label>
                            </th>
                            <td>
                                <input
                                    type="checkbox"
                                    id="typost_allow_variable_weights"
                                    name="typost_allow_variable_weights"
                                    value="1"
                                    <?php checked(get_option('typography_stylist_allow_variable_weights', false)); ?>
                                />
                                <label for="typost_allow_variable_weights">
                                    <?php esc_html_e('Allow custom font-weight values (1-1000) for variable fonts', 'typography-stylist'); ?>
                                </label>
                                <p class="description">
                                    <?php esc_html_e('When enabled, allows font-weight values from 1-1000 instead of just standard weights (100, 200, ..., 900). Enable this if you are using variable fonts that support intermediate weights like 450 or 350. Disabled by default for compatibility with standard fonts.', 'typography-stylist'); ?>
                                </p>
                            </td>
                        </tr>
                        <?php */ ?>
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
            <p><?php esc_html_e('Typography Stylist caches font detection data for 12-24 hours to improve performance. If fonts aren\'t loading correctly after making changes, you can manually clear the cache here.', 'typography-stylist'); ?></p>

            <form method="post" action="">
                <?php wp_nonce_field('typography_stylist_clear_cache_nonce'); ?>
                <p class="submit">
                    <button type="submit" name="typost_clear_cache" class="button button-secondary">
                        <?php esc_html_e('Clear Font Cache', 'typography-stylist'); ?>
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
                    <p><?php esc_html_e('Typography Stylist is designed with accessibility in mind. The Typography Stylist block automatically creates dual headings — a clean text version for screen readers and a visually styled version for sighted users.', 'typography-stylist'); ?></p>
                    <p><?php esc_html_e('The settings below let you fine-tune how assistive technologies interact with styled content. The default settings work well for most sites — only change them if you have specific accessibility requirements.', 'typography-stylist'); ?></p>
                </div>
            </details>

            <div class="notice notice-info inline" style="margin: 20px 0;">
                <h3><?php esc_html_e('Built-in Accessibility Features', 'typography-stylist'); ?></h3>
                <p><?php esc_html_e('This plugin includes accessibility features by default:', 'typography-stylist'); ?></p>
                <ul style="list-style: disc; margin-left: 20px;">
                    <li><strong><?php esc_html_e('Typography Stylist Block:', 'typography-stylist'); ?></strong> <?php esc_html_e('Automatically creates dual semantic headings - a clean text version for screen readers (hidden visually) and a styled version for sighted users (hidden from screen readers with aria-hidden="true"). No configuration needed.', 'typography-stylist'); ?></li>
                    <li><strong><?php esc_html_e('Inline Format (Rich Text Blocks):', 'typography-stylist'); ?></strong> <?php esc_html_e('By default, applies styling directly to text. Enable the optional setting below to add aria-label attributes for enhanced screen reader support.', 'typography-stylist'); ?></li>
                </ul>
            </div>

            <form method="post" action="">
                <?php wp_nonce_field('typography_stylist_accessibility_settings_nonce'); ?>

                <h3><?php esc_html_e('Optional Screen Reader Enhancement', 'typography-stylist'); ?></h3>
                <p><?php esc_html_e('Configure aria-label support for inline formatted text (standard heading blocks, paragraph blocks, etc.).', 'typography-stylist'); ?></p>

                <table class="form-table" role="presentation">
                    <tbody>
                        <tr>
                            <th scope="row">
                                <?php esc_html_e('Inline Format: Add aria-label Attributes', 'typography-stylist'); ?>
                            </th>
                            <td>
                                <input
                                    type="checkbox"
                                    id="typost_enable_aria_labels"
                                    name="typost_enable_aria_labels"
                                    value="1"
                                    <?php checked(get_option('typost_enable_aria_labels', false)); ?>
                                />
                                <label for="typost_enable_aria_labels">
                                    <?php esc_html_e('Add aria-label with original text to inline styled spans', 'typography-stylist'); ?>
                                </label>
                                <p class="description">
                                    <?php esc_html_e('When enabled, text styled with the inline format toolbar button will include aria-label attributes containing the original, unmodified text. This helps prevent screen reader mispronunciation of OpenType ligatures (e.g., "fi" rendered as "ﬁ").', 'typography-stylist'); ?>
                                    <strong><?php esc_html_e('Note:', 'typography-stylist'); ?></strong> <?php esc_html_e('This setting only affects inline formats. The Typography Stylist block already includes full accessibility features by default.', 'typography-stylist'); ?>
                                </p>
                            </td>
                        </tr>
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
                                    <?php esc_html_e('When applying inline typography features to a partial word (e.g., a single letter), the editor normally shows a warning recommending conversion to a Typography Stylist block. Enable this option to skip the warning and apply features directly. Screen readers handle inline spans well, so this is safe for most use cases.', 'typography-stylist'); ?>
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
                    <li><?php esc_html_e('For complex typography with partial word styling, use the Typography Stylist block instead of inline formats.', 'typography-stylist'); ?></li>
                    <li><?php esc_html_e('Always select complete words or phrases when applying inline formats to avoid fragmenting text for screen readers.', 'typography-stylist'); ?></li>
                    <li><?php esc_html_e('Test your styled headings with screen readers like NVDA (Windows) or VoiceOver (macOS) to ensure they read correctly.', 'typography-stylist'); ?></li>
                    <li><?php esc_html_e('The plugin will warn you if you attempt to apply formatting to partial words and offer to convert to an accessible block.', 'typography-stylist'); ?></li>
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
                            <option value=""><?php esc_html_e('Select a deleted font ID...', 'typography-stylist'); ?></option>
                            <!-- Populated by JavaScript -->
                        </select>
                        <p id="typost-new-deleted-id-desc" class="description">
                            <?php esc_html_e('Select a font ID that was previously deleted (available IDs shown)', 'typography-stylist'); ?>
                        </p>
                    </div>

                    <div class="typost-form-field">
                        <label for="typost-new-replacement-id">
                            <?php esc_html_e('Replacement Font:', 'typography-stylist'); ?>
                        </label>
                        <select id="typost-new-replacement-id" class="regular-text" aria-describedby="typost-new-replacement-id-desc">
                            <option value=""><?php esc_html_e('Select a replacement font...', 'typography-stylist'); ?></option>
                            <!-- Populated by JavaScript -->
                        </select>
                        <p id="typost-new-replacement-id-desc" class="description">
                            <?php esc_html_e('Select which active font should replace the deleted font', 'typography-stylist'); ?>
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
                <p><?php esc_html_e('Use this method for applying features to complete words or phrases in any heading or paragraph block.', 'typography-stylist'); ?></p>
                <ol>
                    <li><?php esc_html_e('Create or edit a heading (H1-H6) or paragraph block', 'typography-stylist'); ?></li>
                    <li><?php esc_html_e('Select the complete word(s) you want to style', 'typography-stylist'); ?></li>
                    <li><?php esc_html_e('Click the "Typography Features" button in the toolbar', 'typography-stylist'); ?></li>
                    <li><?php esc_html_e('Choose a preset or toggle individual features', 'typography-stylist'); ?></li>
                    <li><?php esc_html_e('Preview the changes and click Apply', 'typography-stylist'); ?></li>
                </ol>

                <h3><?php esc_html_e('Method 2: Typography Stylist Block (Advanced)', 'typography-stylist'); ?></h3>
                <p><?php esc_html_e('Use this method for complex typography, letter-by-letter styling, or when accessibility features are needed.', 'typography-stylist'); ?></p>
                <ol>
                    <li><?php esc_html_e('Add the "Typography Stylist" block from the block inserter', 'typography-stylist'); ?></li>
                    <li><?php esc_html_e('Choose heading level (H1-H6) in the sidebar', 'typography-stylist'); ?></li>
                    <li><?php esc_html_e('Use sidebar controls for font family, size, and OpenType features', 'typography-stylist'); ?></li>
                    <li><?php esc_html_e('For inline text styling, select text to show the quick feature popover', 'typography-stylist'); ?></li>
                </ol>
            </div>

            <div class="typost-help-section">
                <h3><?php esc_html_e('Line Breaks and the Enter Key', 'typography-stylist'); ?></h3>
                <p><?php esc_html_e('The Enter key does different things in a Typography Stylist block than it does in a regular heading or paragraph, which catches people out.', 'typography-stylist'); ?></p>
                <ul>
                    <li><strong><?php esc_html_e('In a Typography Stylist block:', 'typography-stylist'); ?></strong> <?php esc_html_e('Enter adds a line break and keeps you in the same block, so a multi-line headline shares one set of typography settings. You can change this on the Options tab so Enter starts a new block instead.', 'typography-stylist'); ?></li>
                    <li><strong><?php esc_html_e('In a regular heading or paragraph:', 'typography-stylist'); ?></strong> <?php esc_html_e('Enter ends the block and starts a new paragraph. This is standard WordPress behaviour and the plugin does not change it.', 'typography-stylist'); ?></li>
                </ul>
                <p><?php esc_html_e('To add a line break inside a regular heading without splitting it, press Shift+Enter. If a heading has already split in two, put the cursor at the very start of the paragraph below and press Backspace to merge it back into the heading as a line break.', 'typography-stylist'); ?></p>
                <p><?php esc_html_e('Shift+Enter adds a line break in a Typography Stylist block as well, whichever way the Options setting is set.', 'typography-stylist'); ?></p>
            </div>

            <div class="typost-help-section">
                <h3><?php esc_html_e('Choosing Fonts for OpenType Features', 'typography-stylist'); ?></h3>
                <p><?php esc_html_e('This plugin works with fonts that include advanced typographical features and alternate glyphs.', 'typography-stylist'); ?></p>

                <h4><?php esc_html_e('Font Types with OpenType Support:', 'typography-stylist'); ?></h4>
                <ul>
                    <li><strong><?php esc_html_e('Script & Calligraphy Fonts', 'typography-stylist'); ?></strong> - <?php esc_html_e('Often include contextual alternates, swashes, and stylistic sets', 'typography-stylist'); ?></li>
                    <li><strong><?php esc_html_e('Serif Display Fonts', 'typography-stylist'); ?></strong> - <?php esc_html_e('May feature titling alternates and ligatures', 'typography-stylist'); ?></li>
                    <li><strong><?php esc_html_e('Professional Typefaces', 'typography-stylist'); ?></strong> - <?php esc_html_e('Many include discretionary ligatures and stylistic alternates', 'typography-stylist'); ?></li>
                    <li><strong><?php esc_html_e('Ornamental Fonts', 'typography-stylist'); ?></strong> - <?php esc_html_e('Can contain ornaments and special character sets', 'typography-stylist'); ?></li>
                </ul>

                <p><?php esc_html_e('Upload fonts via the Custom Fonts tab, or load them through your theme or font service.', 'typography-stylist'); ?></p>
            </div>

            <div class="typost-help-section">
                <h3><?php esc_html_e('Tips for Using OpenType Features', 'typography-stylist'); ?></h3>
                <ul>
                    <li><?php esc_html_e('Start with contextual alternates (calt) for automatic character substitutions', 'typography-stylist'); ?></li>
                    <li><?php esc_html_e('Use swashes sparingly on initial or terminal letters only', 'typography-stylist'); ?></li>
                    <li><?php esc_html_e('Experiment with stylistic sets (ss01-ss20) to discover alternate designs', 'typography-stylist'); ?></li>
                    <li><?php esc_html_e('Test ligatures - standard (liga) usually work universally, discretionary (dlig) need careful application', 'typography-stylist'); ?></li>
                    <li><?php esc_html_e('Preview at actual display size - features may look different at various scales', 'typography-stylist'); ?></li>
                    <li><?php esc_html_e('Not all fonts support all features - check documentation and experiment', 'typography-stylist'); ?></li>
                    <li><?php esc_html_e('For partial word styling, use the Typography Stylist block to maintain accessibility', 'typography-stylist'); ?></li>
                </ul>
            </div>

            <div class="typost-help-section">
                <h3><?php esc_html_e('Technical Notes', 'typography-stylist'); ?></h3>
                <p><?php esc_html_e('Features are applied using CSS font-feature-settings stored as inline styles and data attributes. No additional database tables are required.', 'typography-stylist'); ?></p>
                <p><?php esc_html_e('Browser support: All modern browsers (Chrome, Firefox, Safari, Edge) fully support OpenType features. Internet Explorer 10+ has partial support.', 'typography-stylist'); ?></p>
                <p><?php esc_html_e('Frontend performance: The plugin uses CSS-only rendering with no JavaScript on the public site, ensuring fast page loads.', 'typography-stylist'); ?></p>
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
    <div id="typost-delete-font-modal" class="typost-modal" style="display:none;">
        <div class="typost-modal-overlay"></div>
        <div class="typost-modal-content">
            <div class="typost-modal-header">
                <h2><?php esc_html_e('Delete Font', 'typography-stylist'); ?></h2>
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
                        <option value=""><?php esc_html_e('— No Replacement (Skip) —', 'typography-stylist'); ?></option>
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

<?php
/**
 * Admin settings page template
 */

// Exit if accessed directly
if (!defined('ABSPATH')) {
    exit;
}

// Verify user has permission
if (!current_user_can('manage_options')) {
    wp_die(esc_html__('You do not have sufficient permissions to access this page.', 'opentype-stylist'));
}

// Save settings (with proper sanitization)
if (isset($_POST['ots_save_settings']) &&
    check_admin_referer('ots_settings_nonce') &&
    current_user_can('manage_options')) {

    // Use proper sanitization via registered settings
    if (isset($_POST['ots_presets'])) {
        $sanitized = OpenType_Stylist::get_instance()->sanitize_presets(wp_unslash($_POST['ots_presets'])); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
        update_option('ots_presets', $sanitized);

        // Clear cache
        OpenType_Stylist::get_instance()->clear_cache();

        echo '<div class="notice notice-success"><p>' .
             esc_html__('Settings saved successfully.', 'opentype-stylist') .
             '</p></div>';
    }
}

// Save options settings
if (isset($_POST['ots_save_options_settings']) &&
    check_admin_referer('ots_options_settings_nonce') &&
    current_user_can('manage_options')) {

    // Get previous value to detect changes
    $previous_show_clear_confirmation = (bool) get_option('ots_show_clear_confirmation', true);
    $show_clear_confirmation = isset($_POST['ots_show_clear_confirmation']) ? '1' : '0';
    update_option('ots_show_clear_confirmation', $show_clear_confirmation);

    // Save variable weight setting
    $allow_variable = isset($_POST['ots_allow_variable_weights']) ? '1' : '0';
    update_option('ots_allow_variable_weights', $allow_variable);

    // Clear cache for all users only when the clear confirmation setting changes
    if ($previous_show_clear_confirmation !== (bool) $show_clear_confirmation) {
        OpenType_Stylist::get_instance()->clear_cache();
    }

    echo '<div class="notice notice-success"><p>' .
         esc_html__('Options saved successfully.', 'opentype-stylist') .
         '</p></div>';
}

// Save accessibility settings
if (isset($_POST['ots_save_accessibility_settings']) &&
    check_admin_referer('ots_accessibility_settings_nonce') &&
    current_user_can('manage_options')) {

    // Store checkbox values explicitly as '1' (enabled) or '0' (disabled)
    $enable_aria = isset($_POST['ots_enable_aria_labels']) ? '1' : '0';
    update_option('ots_enable_aria_labels', $enable_aria);

    // Clear cache when accessibility settings change
    OpenType_Stylist::get_instance()->clear_cache();

    echo '<div class="notice notice-success"><p>' .
         esc_html__('Accessibility settings saved successfully.', 'opentype-stylist') .
         '</p></div>';
}

$instance = OpenType_Stylist::get_instance();
$presets = $instance->get_presets();
$custom_fonts = get_option('ots_custom_fonts', array());
$adobe_fonts = $instance->get_adobe_fonts();
$manual_fonts = $instance->get_manual_fonts();
?>

<div class="wrap ots-admin-wrap">
    <h1><?php echo esc_html(get_admin_page_title()); ?></h1>

    <!-- Skip link for accessibility -->
    <a href="#ots-main-content" class="screen-reader-text skip-link">
        <?php esc_html_e('Skip to main content', 'opentype-stylist'); ?>
    </a>

    <div class="ots-admin-container" id="ots-main-content" tabindex="-1">
        <div class="ots-admin-tabs" role="tablist" aria-label="<?php esc_attr_e('Settings sections', 'opentype-stylist'); ?>">
            <button
                class="ots-tab-button active"
                data-tab="fonts"
                role="tab"
                aria-selected="true"
                aria-controls="ots-tab-fonts"
                id="ots-tab-button-fonts">
                <?php esc_html_e('Custom Fonts', 'opentype-stylist'); ?>
            </button>
            <button
                class="ots-tab-button"
                data-tab="presets"
                role="tab"
                aria-selected="false"
                aria-controls="ots-tab-presets"
                id="ots-tab-button-presets">
                <?php esc_html_e('Font Features', 'opentype-stylist'); ?>
            </button>
            <button
                class="ots-tab-button"
                data-tab="options"
                role="tab"
                aria-selected="false"
                aria-controls="ots-tab-options"
                id="ots-tab-button-options">
                <?php esc_html_e('Options', 'opentype-stylist'); ?>
            </button>
            <button
                class="ots-tab-button"
                data-tab="accessibility"
                role="tab"
                aria-selected="false"
                aria-controls="ots-tab-accessibility"
                id="ots-tab-button-accessibility">
                <?php esc_html_e('Accessibility', 'opentype-stylist'); ?>
            </button>
            <button
                class="ots-tab-button"
                data-tab="replacements"
                role="tab"
                aria-selected="false"
                aria-controls="ots-tab-replacements"
                id="ots-tab-button-replacements">
                <?php esc_html_e('Replacement Fonts', 'opentype-stylist'); ?>
            </button>
            <button
                class="ots-tab-button"
                data-tab="help"
                role="tab"
                aria-selected="false"
                aria-controls="ots-tab-help"
                id="ots-tab-button-help">
                <?php esc_html_e('Help', 'opentype-stylist'); ?>
            </button>
        </div>

        <!-- Presets Tab -->
        <div
            class="ots-tab-content"
            id="ots-tab-presets"
            role="tabpanel"
            aria-labelledby="ots-tab-button-presets"
            hidden="hidden"
            tabindex="0">
            <h2><?php esc_html_e('Font Features', 'opentype-stylist'); ?></h2>
            <p><?php esc_html_e('Explore OpenType features with live previews. Type custom text or use the default samples to see how each feature affects your typography.', 'opentype-stylist'); ?></p>

            <div class="ots-preset-controls">
                <?php if (!empty($custom_fonts) || !empty($adobe_fonts) || !empty($manual_fonts)): ?>
                <div class="ots-preset-font-selector">
                    <label for="ots-preview-font-select">
                        <?php esc_html_e('Preview with Font:', 'opentype-stylist'); ?>
                    </label>
                    <select id="ots-preview-font-select" class="ots-font-select">
                        <option value=""><?php esc_html_e('Default (system font)', 'opentype-stylist'); ?></option>
                        <?php
                        // MyFonts uploaded fonts
                        if (!empty($custom_fonts)) {
                            echo '<optgroup label="' . esc_attr__('MyFonts Uploads', 'opentype-stylist') . '">';
                            foreach ($custom_fonts as $font) {
                                if (!empty($font['font_faces'])) {
                                    $families = array_unique(array_map(function($face) {
                                        return $face['family'];
                                    }, $font['font_faces']));

                                    foreach ($families as $family) {
                                        echo '<option value="' . esc_attr($family) . '">' . esc_html($family) . '</option>';
                                    }
                                }
                            }
                            echo '</optgroup>';
                        }

                        // Adobe Fonts
                        if (!empty($adobe_fonts)) {
                            echo '<optgroup label="' . esc_attr__('Adobe Fonts', 'opentype-stylist') . '">';
                            foreach ($adobe_fonts as $font) {
                                // New structure: individual font entries with font_family (single string)
                                if (!empty($font['font_family'])) {
                                    echo '<option value="' . esc_attr($font['font_family']) . '">' . esc_html($font['font_family']) . '</option>';
                                }
                                // Legacy structure: font entries with font_families (array)
                                elseif (!empty($font['font_families'])) {
                                    foreach ($font['font_families'] as $family) {
                                        echo '<option value="' . esc_attr($family) . '">' . esc_html($family) . '</option>';
                                    }
                                }
                            }
                            echo '</optgroup>';
                        }

                        // Manual fonts
                        if (!empty($manual_fonts)) {
                            echo '<optgroup label="' . esc_attr__('Custom Fonts', 'opentype-stylist') . '">';
                            foreach ($manual_fonts as $font) {
                                if (!empty($font['font_family'])) {
                                    echo '<option value="' . esc_attr($font['font_family']) . '">' . esc_html($font['name']) . '</option>';
                                }
                            }
                            echo '</optgroup>';
                        }
                        ?>
                    </select>
                    <p class="description">
                        <?php esc_html_e('Select a custom font to preview how features will look with that font.', 'opentype-stylist'); ?>
                    </p>
                </div>
                <?php endif; ?>

                <div class="ots-preset-size-control">
                    <label for="ots-preview-size-slider">
                        <?php esc_html_e('Preview Size:', 'opentype-stylist'); ?>
                        <span id="ots-preview-size-value" class="ots-size-value">50px</span>
                    </label>
                    <input
                        type="range"
                        id="ots-preview-size-slider"
                        class="ots-size-slider"
                        min="12"
                        max="96"
                        value="50"
                        step="1"
                        aria-label="<?php esc_attr_e('Adjust preview text size', 'opentype-stylist'); ?>"
                        aria-valuemin="12"
                        aria-valuemax="96"
                        aria-valuenow="50"
                        aria-valuetext="50 pixels" />
                    <p class="description">
                        <?php esc_html_e('Adjust the size of the preview text to better see typography features.', 'opentype-stylist'); ?>
                    </p>
                </div>

                <div class="ots-preset-custom-text-control">
                    <label for="ots-preview-custom-text">
                        <?php esc_html_e('Custom Preview Text:', 'opentype-stylist'); ?>
                    </label>
                    <input
                        type="text"
                        id="ots-preview-custom-text"
                        class="regular-text"
                        placeholder="<?php esc_attr_e('Type your own text to preview features...', 'opentype-stylist'); ?>"
                        aria-label="<?php esc_attr_e('Enter custom text to preview features', 'opentype-stylist'); ?>" />
                    <button
                        type="button"
                        id="ots-preview-reset-text"
                        class="button button-secondary"
                        style="display: none;">
                        <?php esc_html_e('Reset to Defaults', 'opentype-stylist'); ?>
                    </button>
                    <p class="description">
                        <?php esc_html_e('Type your own text to see how each feature affects it, or leave blank to use default samples.', 'opentype-stylist'); ?>
                    </p>
                </div>
            </div>

            <!-- Baseline Font Preview -->
            <div class="ots-baseline-preview-section">
                <h3><?php esc_html_e('Font Preview (No Features Applied)', 'opentype-stylist'); ?></h3>
                <p class="description">
                    <?php esc_html_e('This shows how the selected font looks without any OpenType features applied.', 'opentype-stylist'); ?>
                </p>
                <div class="ots-baseline-preview-container">
                    <div class="ots-baseline-preview" id="ots-baseline-preview" data-default-text="The quick brown fox jumps over the lazy dog">
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
                'ligatures' => esc_html__('Ligatures', 'opentype-stylist'),
                'stylistic-sets' => esc_html__('Stylistic Sets', 'opentype-stylist'),
                'alternates' => esc_html__('Swashes & Alternates', 'opentype-stylist'),
                'decorative' => esc_html__('Decorative', 'opentype-stylist')
            );
            ?>

            <?php foreach ($grouped_features as $category => $features): ?>
            <details <?php echo $category === 'ligatures' ? 'open' : ''; ?> class="ots-feature-category-section">
                <summary class="ots-feature-category-summary">
                    <h3><?php echo esc_html(isset($category_titles[$category]) ? $category_titles[$category] : ucfirst($category)); ?></h3>
                </summary>

                <div class="ots-feature-demos-grid">
                    <?php foreach ($features as $feature): ?>
                    <div class="ots-feature-demo-card">
                        <div class="ots-feature-demo-header">
                            <h4><?php echo esc_html($feature['name']); ?></h4>
                            <code class="ots-feature-code"><?php echo esc_html($feature['id']); ?></code>
                        </div>
                        <p class="ots-feature-demo-description"><?php echo esc_html($feature['description']); ?></p>

                        <div class="ots-feature-comparison">
                            <div class="ots-feature-preview-container">
                                <div class="ots-feature-preview-label"><?php esc_html_e('With Feature:', 'opentype-stylist'); ?></div>
                                <div
                                    class="ots-feature-preview ots-feature-preview-on"
                                    data-demo-text="<?php echo esc_attr($instance->get_feature_demo_text($feature['id'])); ?>"
                                    style="font-feature-settings: '<?php echo esc_attr($feature['id']); ?>' 1;">
                                    <?php echo esc_html($instance->get_feature_demo_text($feature['id'])); ?>
                                </div>
                            </div>
                        </div>
                    </div>
                    <?php endforeach; ?>
                </div>
            </details>
            <?php endforeach; ?>

            <?php if (!empty($presets)): ?>
            <div class="ots-user-presets-section">
                <h3><?php esc_html_e('Your Saved Presets', 'opentype-stylist'); ?></h3>
                <p><?php esc_html_e('These are presets you have created in the block editor.', 'opentype-stylist'); ?></p>

                <div class="ots-presets-grid">
                    <?php foreach ($presets as $preset): ?>
                    <div class="ots-preset-card">
                        <h4><?php echo esc_html($preset['name']); ?></h4>
                        <p class="ots-preset-description"><?php echo esc_html($preset['description']); ?></p>
                        <div class="ots-preset-features">
                            <strong><?php esc_html_e('Features:', 'opentype-stylist'); ?></strong>
                            <?php echo esc_html(implode(', ', $preset['features'])); ?>
                        </div>
                        <div class="ots-preset-preview" style="font-feature-settings: <?php echo esc_attr($instance->features_to_css($preset['features'])); ?>">
                            <?php echo esc_html($instance->get_feature_demo_text($preset['features'][0])); ?>
                        </div>
                    </div>
                    <?php endforeach; ?>
                </div>
            </div>
            <?php endif; ?>
        </div>

        <!-- Fonts Tab -->
        <div
            class="ots-tab-content active"
            id="ots-tab-fonts"
            role="tabpanel"
            aria-labelledby="ots-tab-button-fonts"
            tabindex="0">
            <h2><?php esc_html_e('Custom Fonts', 'opentype-stylist'); ?></h2>
            <p><?php esc_html_e('Upload webfont kits (MyFonts, Fontspring, etc.) to use custom fonts with OpenType features. Once uploaded, fonts will be available in the block editor, and you can edit fallback fonts for each kit.', 'opentype-stylist'); ?></p>


            <?php if (!empty($custom_fonts)): ?>
            <div class="ots-fonts-list">
                <h3><?php esc_html_e('Uploaded Fonts', 'opentype-stylist'); ?></h3>
                <?php
                // Group fonts by kit_id
                $fonts_by_kit = array();
                $standalone_fonts = array();

                foreach ($custom_fonts as $font) {
                    if (!empty($font['kit_id'])) {
                        $kit_id = $font['kit_id'];
                        if (!isset($fonts_by_kit[$kit_id])) {
                            $fonts_by_kit[$kit_id] = array(
                                'kit_name' => !empty($font['kit_name']) ? $font['kit_name'] : $font['name'],
                                'uploaded_date' => $font['uploaded_date'],
                                'fonts' => array()
                            );
                        }
                        $fonts_by_kit[$kit_id]['fonts'][] = $font;
                    } else {
                        // Legacy fonts without kit_id (uploaded before refactor)
                        $standalone_fonts[] = $font;
                    }
                }
                ?>

                <?php // Display font kits (grouped) ?>
                <?php foreach ($fonts_by_kit as $kit_id => $kit_data): ?>
                <div class="ots-font-kit-card">
                    <div class="ots-font-kit-header">
                        <h4>
                            <button
                                type="button"
                                class="ots-toggle-kit"
                                aria-expanded="false"
                                aria-controls="ots-kit-<?php echo esc_attr($kit_id); ?>">
                                <span class="dashicons dashicons-arrow-right" aria-hidden="true"></span>
                                <?php echo esc_html($kit_data['kit_name']); ?>
                            </button>
                            <span class="ots-kit-font-count"><?php
                                /* translators: %d: number of fonts in the custom font kit (Custom Fonts tab) */
                                echo esc_html(sprintf(_n('%d font', '%d fonts', count($kit_data['fonts']), 'opentype-stylist'), count($kit_data['fonts'])));
                            ?></span>
                        </h4>
                        <div class="ots-font-meta">
                            <small>
                                <?php
                                $upload_date = $kit_data['uploaded_date'];
                                if (is_string($upload_date)) {
                                    $timestamp = strtotime($upload_date);
                                    $formatted_date = date_i18n(get_option('date_format') . ' ' . get_option('time_format'), $timestamp);
                                } else {
                                    $formatted_date = esc_html($upload_date);
                                }
                                /* translators: %s: The upload date in localized format */
                                echo esc_html(sprintf(__('Uploaded: %s', 'opentype-stylist'), $formatted_date));
                                ?>
                            </small>
                        </div>
                    </div>

                    <div id="ots-kit-<?php echo esc_attr($kit_id); ?>" class="ots-kit-fonts" hidden>
                        <?php foreach ($kit_data['fonts'] as $font): ?>
                        <div class="ots-font-card ots-kit-font">
                            <div class="ots-font-header">
                                <h5><?php echo esc_html($font['name']); ?></h5>
                                <div class="ots-font-actions">
                                    <button
                                        class="button ots-edit-font"
                                        data-font-id="<?php echo esc_attr($font['id']); ?>"
                                        data-font-name="<?php echo esc_attr($font['name']); ?>"
                                        <?php /* translators: %s: The name of the font to be edited */ ?>
                                        aria-label="<?php echo esc_attr(sprintf(__('Edit fallback fonts for: %s', 'opentype-stylist'), $font['name'])); ?>">
                                        <span aria-hidden="true" class="dashicons dashicons-edit"></span>
                                        <?php esc_html_e('Edit Fallbacks', 'opentype-stylist'); ?>
                                    </button>
                                    <button
                                        class="button ots-delete-font"
                                        data-font-id="<?php echo esc_attr($font['id']); ?>"
                                        data-font-numeric-id="<?php echo isset($font['font_id']) ? esc_attr($font['font_id']) : '0'; ?>"
                                        data-font-name="<?php echo esc_attr($font['name']); ?>"
                                        <?php /* translators: %s: The name of the font to be deleted */ ?>
                                        aria-label="<?php echo esc_attr(sprintf(__('Delete font: %s', 'opentype-stylist'), $font['name'])); ?>">
                                        <span aria-hidden="true" class="dashicons dashicons-trash"></span>
                                        <?php esc_html_e('Delete', 'opentype-stylist'); ?>
                                    </button>
                                </div>
                            </div>
                            <div class="ots-font-families">
                                <strong><?php esc_html_e('Font Family:', 'opentype-stylist'); ?></strong>
                                <?php
                                if (!empty($font['font_faces'])) {
                                    $families = array_unique(array_map(function($face) {
                                        return $face['family'];
                                    }, $font['font_faces']));
                                    echo esc_html(implode(', ', $families));
                                }
                                ?>
                            </div>
                            <?php if (!empty($font['fallbacks'])): ?>
                            <div class="ots-font-fallbacks">
                                <strong><?php esc_html_e('Fallbacks:', 'opentype-stylist'); ?></strong>
                                <code><?php echo esc_html($font['fallbacks']); ?></code>
                            </div>
                            <?php endif; ?>
                            <div class="ots-font-loading-option">
                                <label for="ots-load-all-pages-font-<?php echo esc_attr($font['id']); ?>">
                                    <input
                                        type="checkbox"
                                        class="ots-font-load-all-pages"
                                        data-font-id="<?php echo esc_attr($font['id']); ?>"
                                        id="ots-load-all-pages-font-<?php echo esc_attr($font['id']); ?>"
                                        <?php checked(!empty($font['load_on_all_pages'])); ?>
                                        aria-describedby="ots-load-all-pages-font-desc-<?php echo esc_attr($font['id']); ?>" />
                                    <?php esc_html_e('Load on all pages', 'opentype-stylist'); ?>
                                </label>
                                <p id="ots-load-all-pages-font-desc-<?php echo esc_attr($font['id']); ?>" class="description">
                                    <?php esc_html_e('When unchecked, this font will only load on pages where it is actually used. This improves performance.', 'opentype-stylist'); ?>
                                </p>
                            </div>
                            <div class="ots-font-edit-form" style="display: none;">
                                <div class="ots-form-field">
                                    <label><?php esc_html_e('Font Families:', 'opentype-stylist'); ?></label>
                                    <div class="ots-font-families-display">
                                        <?php
                                        if (!empty($font['font_faces'])) {
                                            $families = array_unique(array_map(function($face) {
                                                return $face['family'];
                                            }, $font['font_faces']));
                                            echo '<code>' . esc_html(implode(', ', $families)) . '</code>';
                                        }
                                        ?>
                                    </div>
                                </div>
                                <div class="ots-form-field">
                                    <label for="ots-font-fallback-<?php echo esc_attr($font['id']); ?>">
                                        <?php esc_html_e('Fallback Fonts (optional):', 'opentype-stylist'); ?>
                                    </label>
                                    <input
                                        type="text"
                                        id="ots-font-fallback-<?php echo esc_attr($font['id']); ?>"
                                        class="regular-text code ots-font-fallback-input"
                                        value="<?php echo esc_attr(!empty($font['fallbacks']) ? $font['fallbacks'] : ''); ?>"
                                        placeholder="<?php esc_attr_e('e.g., Georgia, serif', 'opentype-stylist'); ?>"
                                        aria-describedby="ots-font-fallback-desc-<?php echo esc_attr($font['id']); ?>" />
                                    <p id="ots-font-fallback-desc-<?php echo esc_attr($font['id']); ?>" class="description">
                                        <?php esc_html_e('Enter fallback fonts separated by commas (these will be used if the primary font fails to load)', 'opentype-stylist'); ?>
                                    </p>
                                </div>
                                <div class="ots-form-actions">
                                    <button type="button" class="button button-primary ots-save-font-edit">
                                        <?php esc_html_e('Save Changes', 'opentype-stylist'); ?>
                                    </button>
                                    <button type="button" class="button ots-cancel-font-edit">
                                        <?php esc_html_e('Cancel', 'opentype-stylist'); ?>
                                    </button>
                                </div>
                                <div class="ots-font-edit-message" role="alert" aria-live="assertive" aria-atomic="true"></div>
                            </div>
                        </div>
                        <?php endforeach; ?>
                    </div>
                </div>
                <?php endforeach; ?>

                <?php // Display standalone fonts (legacy or single fonts) ?>
                <?php foreach ($standalone_fonts as $font): ?>
                <div class="ots-font-card">
                    <div class="ots-font-header">
                        <h4><?php echo esc_html($font['name']); ?></h4>
                        <div class="ots-font-actions">
                            <button
                                class="button ots-edit-font"
                                data-font-id="<?php echo esc_attr($font['id']); ?>"
                                data-font-name="<?php echo esc_attr($font['name']); ?>"
                                <?php /* translators: %s: The name of the font kit to be edited */ ?>
                                aria-label="<?php echo esc_attr(sprintf(__('Edit fallback fonts for: %s', 'opentype-stylist'), $font['name'])); ?>">
                                <span aria-hidden="true" class="dashicons dashicons-edit"></span>
                                <?php esc_html_e('Edit Fallbacks', 'opentype-stylist'); ?>
                            </button>
                            <button
                                class="button ots-delete-font"
                                data-font-id="<?php echo esc_attr($font['id']); ?>"
                                data-font-numeric-id="<?php echo isset($font['font_id']) ? esc_attr($font['font_id']) : '0'; ?>"
                                data-font-name="<?php echo esc_attr($font['name']); ?>"
                                <?php /* translators: %s: The name of the font kit to be deleted */ ?>
                                aria-label="<?php echo esc_attr(sprintf(__('Delete font kit: %s', 'opentype-stylist'), $font['name'])); ?>">
                                <span aria-hidden="true" class="dashicons dashicons-trash"></span>
                                <?php esc_html_e('Delete', 'opentype-stylist'); ?>
                            </button>
                        </div>
                    </div>
                    <div class="ots-font-families">
                        <strong><?php esc_html_e('Font Families:', 'opentype-stylist'); ?></strong>
                        <?php
                        if (!empty($font['font_faces'])) {
                            $families = array_unique(array_map(function($face) {
                                return $face['family'];
                            }, $font['font_faces']));
                            echo esc_html(implode(', ', $families));
                        }
                        ?>
                    </div>
                    <?php if (!empty($font['fallbacks'])): ?>
                    <div class="ots-font-fallbacks">
                        <strong><?php esc_html_e('Fallbacks:', 'opentype-stylist'); ?></strong>
                        <code><?php echo esc_html($font['fallbacks']); ?></code>
                    </div>
                    <?php endif; ?>
                    <div class="ots-font-loading-option">
                        <label for="ots-load-all-pages-font-<?php echo esc_attr($font['id']); ?>">
                            <input
                                type="checkbox"
                                class="ots-font-load-all-pages"
                                data-font-id="<?php echo esc_attr($font['id']); ?>"
                                id="ots-load-all-pages-font-<?php echo esc_attr($font['id']); ?>"
                                <?php checked(!empty($font['load_on_all_pages'])); ?>
                                aria-describedby="ots-load-all-pages-font-desc-<?php echo esc_attr($font['id']); ?>" />
                            <?php esc_html_e('Load on all pages', 'opentype-stylist'); ?>
                        </label>
                        <p id="ots-load-all-pages-font-desc-<?php echo esc_attr($font['id']); ?>" class="description">
                            <?php esc_html_e('When unchecked, this font will only load on pages where it is actually used. This improves performance.', 'opentype-stylist'); ?>
                        </p>
                    </div>
                    <div class="ots-font-meta">
                        <small>
                            <?php
                            // Format date using WordPress localized date format
                            $upload_date = $font['uploaded_date'];
                            if (is_string($upload_date)) {
                                // Convert MySQL datetime to localized format
                                $timestamp = strtotime($upload_date);
                                $formatted_date = date_i18n(get_option('date_format') . ' ' . get_option('time_format'), $timestamp);
                            } else {
                                $formatted_date = esc_html($upload_date);
                            }
                            /* translators: %s: The upload date in localized format */
                            echo esc_html(sprintf(__('Uploaded: %s', 'opentype-stylist'), $formatted_date));
                            ?>
                        </small>
                    </div>
                    <div class="ots-font-edit-form" style="display: none;">
                        <div class="ots-form-field">
                            <label><?php esc_html_e('Font Families:', 'opentype-stylist'); ?></label>
                            <div class="ots-font-families-display">
                                <?php
                                if (!empty($font['font_faces'])) {
                                    $families = array_unique(array_map(function($face) {
                                        return $face['family'];
                                    }, $font['font_faces']));
                                    echo '<code>' . esc_html(implode(', ', $families)) . '</code>';
                                }
                                ?>
                            </div>
                        </div>
                        <div class="ots-form-field">
                            <label for="ots-font-fallback-<?php echo esc_attr($font['id']); ?>">
                                <?php esc_html_e('Fallback Fonts (optional):', 'opentype-stylist'); ?>
                            </label>
                            <input
                                type="text"
                                id="ots-font-fallback-<?php echo esc_attr($font['id']); ?>"
                                class="regular-text code ots-font-fallback-input"
                                value="<?php echo esc_attr(!empty($font['fallbacks']) ? $font['fallbacks'] : ''); ?>"
                                placeholder="<?php esc_attr_e('e.g., Georgia, serif', 'opentype-stylist'); ?>"
                                aria-describedby="ots-font-fallback-desc-<?php echo esc_attr($font['id']); ?>" />
                            <p id="ots-font-fallback-desc-<?php echo esc_attr($font['id']); ?>" class="description">
                                <?php esc_html_e('Enter fallback fonts separated by commas (these will be used if the primary font fails to load)', 'opentype-stylist'); ?>
                            </p>
                        </div>
                        <div class="ots-form-actions">
                            <button type="button" class="button button-primary ots-save-font-edit">
                                <?php esc_html_e('Save Changes', 'opentype-stylist'); ?>
                            </button>
                            <button type="button" class="button ots-cancel-font-edit">
                                <?php esc_html_e('Cancel', 'opentype-stylist'); ?>
                            </button>
                        </div>
                        <div class="ots-font-edit-message" role="alert" aria-live="assertive" aria-atomic="true"></div>
                    </div>
                </div>
                <?php endforeach; ?>
            </div>
            <?php else: ?>
            <div class="ots-empty-state" role="status">
                <p><strong><?php esc_html_e('No custom fonts uploaded yet.', 'opentype-stylist'); ?></strong></p>
                <p><?php esc_html_e('Upload a webfont kit using the form below to add custom fonts with OpenType features.', 'opentype-stylist'); ?></p>
            </div>
            <?php endif; ?>

            <div class="ots-upload-font-section" id="ots-upload-font-section">
                <h3><?php esc_html_e('Upload Font Kit', 'opentype-stylist'); ?></h3>
                <p><?php esc_html_e('Upload a complete webfont kit as a ZIP file (e.g., MyWebfontsKit.zip). The ZIP should contain the CSS file and all font files.', 'opentype-stylist'); ?></p>

                <div class="ots-upload-form">
                    <div class="ots-form-field">
                        <label for="ots-font-name">
                            <?php esc_html_e('Font Kit Name:', 'opentype-stylist'); ?>
                            <span class="required" aria-label="<?php esc_attr_e('required', 'opentype-stylist'); ?>">*</span>
                        </label>
                        <input
                            type="text"
                            id="ots-font-name"
                            name="ots-font-name"
                            class="regular-text"
                            placeholder="<?php esc_attr_e('e.g., MyFonts Kit 2024', 'opentype-stylist'); ?>"
                            aria-required="true"
                            aria-describedby="ots-font-name-desc"
                            required />
                        <p id="ots-font-name-desc" class="description">
                            <?php esc_html_e('Enter a descriptive name for this font kit', 'opentype-stylist'); ?>
                        </p>
                    </div>

                    <div class="ots-form-field">
                        <label for="ots-font-file">
                            <?php esc_html_e('ZIP File:', 'opentype-stylist'); ?>
                        </label>
                        <label for="ots-font-file" class="screen-reader-text">
                            <?php esc_html_e('Choose ZIP file containing webfont kit', 'opentype-stylist'); ?>
                        </label>
                        <div class="ots-upload-method-buttons">
                            <button type="button" id="ots-select-file-btn" class="button">
                                <span class="dashicons dashicons-upload" aria-hidden="true"></span>
                                <?php esc_html_e('Choose ZIP File', 'opentype-stylist'); ?>
                            </button>
                        </div>
                        <input
                            type="file"
                            id="ots-font-file"
                            name="ots-font-file"
                            accept=".zip"
                            aria-describedby="ots-file-instructions"
                            style="display: none;" />
                        <span id="ots-file-instructions" class="screen-reader-text">
                            <?php esc_html_e('Upload a webfont kit as a ZIP file. The ZIP should contain CSS file and font files.', 'opentype-stylist'); ?>
                        </span>
                        <div id="ots-selected-file" class="ots-selected-file" style="display: none;">
                            <span class="dashicons dashicons-media-archive" aria-hidden="true"></span>
                            <span id="ots-file-name"></span>
                            <span id="ots-file-size" class="ots-file-size"></span>
                            <button type="button" id="ots-clear-file-btn" class="button-link" aria-label="<?php esc_attr_e('Clear selected file', 'opentype-stylist'); ?>">
                                <span class="dashicons dashicons-no-alt" aria-hidden="true"></span>
                            </button>
                        </div>
                    </div>

                    <button type="button" id="ots-upload-font-btn" class="button button-primary" disabled>
                        <?php esc_html_e('Upload Font Kit', 'opentype-stylist'); ?>
                    </button>
                    <div id="ots-upload-progress" class="ots-upload-progress" style="display: none;">
                        <div
                            class="ots-progress-bar"
                            role="progressbar"
                            aria-valuemin="0"
                            aria-valuemax="100"
                            aria-valuenow="0"
                            aria-labelledby="ots-progress-label">
                            <div class="ots-progress-fill" style="width: 0%;"></div>
                        </div>
                        <div id="ots-progress-label" class="ots-progress-text" role="status" aria-live="polite">
                            <?php esc_html_e('Uploading...', 'opentype-stylist'); ?>
                        </div>
                    </div>
                    <div id="ots-font-message" role="alert" aria-live="assertive" aria-atomic="true" style="margin-top: 10px;"></div>
                </div>

                <div class="ots-font-help">
                    <h4><?php esc_html_e('How to use:', 'opentype-stylist'); ?></h4>
                    <ol>
                        <li><?php esc_html_e('Download your webfont kit from your font provider', 'opentype-stylist'); ?></li>
                        <li><?php esc_html_e('If the kit is not already zipped, create a ZIP file containing the entire kit folder (including CSS file and all font files in their directories)', 'opentype-stylist'); ?></li>
                        <li><?php esc_html_e('Click "Choose ZIP File" and select your webfont kit ZIP file', 'opentype-stylist'); ?></li>
                        <li><?php esc_html_e('Give your kit a descriptive name and click "Upload Font Kit"', 'opentype-stylist'); ?></li>
                        <li><?php esc_html_e('The plugin will extract the ZIP, process the fonts, and make them available in the block editor', 'opentype-stylist'); ?></li>
                    </ol>
                    <p><strong><?php esc_html_e('What should the ZIP contain:', 'opentype-stylist'); ?></strong></p>
                    <ul>
                        <li><?php esc_html_e('A CSS file with @font-face declarations (e.g., stylesheet.css or MyWebfontsKit.css)', 'opentype-stylist'); ?></li>
                        <li><?php esc_html_e('Font files in their subdirectories (e.g., webFonts/FontName/font.woff2)', 'opentype-stylist'); ?></li>
                        <li><?php esc_html_e('The directory structure must match the paths in the CSS file', 'opentype-stylist'); ?></li>
                    </ul>
                    <p><strong><?php esc_html_e('Compatibility Note:', 'opentype-stylist'); ?></strong> <?php esc_html_e('This plugin has been tested with webfont kits from MyFonts. Other providers should work if they follow a similar structure (CSS file with @font-face declarations and font files in subdirectories).', 'opentype-stylist'); ?></p>
                    <p><strong><?php esc_html_e('Note:', 'opentype-stylist'); ?></strong> <?php esc_html_e('The plugin automatically rewrites CSS paths and stores all files in your WordPress uploads directory. All fonts and their files will be properly organized and served from your server.', 'opentype-stylist'); ?></p>
                </div>
            </div>

            <!-- Adobe Fonts Section -->
            <div class="ots-adobe-fonts-section" id="ots-adobe-fonts-section">
                <h3><?php esc_html_e('Adobe Fonts (Typekit)', 'opentype-stylist'); ?></h3>
                <p><?php esc_html_e('Add fonts from Adobe Fonts by pasting the embed code from your Adobe Fonts project. Once added, you can edit fallback fonts for each font family.', 'opentype-stylist'); ?></p>

                <?php if (!empty($adobe_fonts)): ?>
                <div class="ots-adobe-fonts-list">
                    <h4><?php esc_html_e('Added Adobe Fonts Projects', 'opentype-stylist'); ?></h4>

                    <?php
                    // Group Adobe fonts by kit_id (similar to MyFonts kits)
                    $adobe_kits = array();
                    $standalone_adobe_fonts = array();

                    foreach ($adobe_fonts as $font) {
                        if (!empty($font['kit_id'])) {
                            $kit_id = $font['kit_id'];
                            if (!isset($adobe_kits[$kit_id])) {
                                $adobe_kits[$kit_id] = array(
                                    'kit_name' => $font['kit_name'],
                                    'css_url' => $font['css_url'],
                                    'added_date' => $font['added_date'],
                                    'fonts' => array()
                                );
                            }
                            $adobe_kits[$kit_id]['fonts'][] = $font;
                        } else {
                            // Legacy fonts without kit_id (from before refactor)
                            $standalone_adobe_fonts[] = $font;
                        }
                    }
                    ?>

                    <?php // Display Adobe font kits (grouped) ?>
                    <?php foreach ($adobe_kits as $kit_id => $kit_data): ?>
                    <div class="ots-font-kit-card">
                        <div class="ots-font-kit-header">
                            <h4>
                                <button
                                    type="button"
                                    class="ots-toggle-kit"
                                    aria-expanded="false"
                                    aria-controls="ots-adobe-kit-<?php echo esc_attr($kit_id); ?>">
                                    <span class="dashicons dashicons-arrow-right" aria-hidden="true"></span>
                                    <?php echo esc_html($kit_data['kit_name']); ?>
                                </button>
                                <span class="ots-kit-font-count"><?php
                                    /* translators: %d: number of fonts in the Adobe Fonts kit (Adobe Fonts tab) */
                                    echo esc_html(sprintf(_n('%d font', '%d fonts', count($kit_data['fonts']), 'opentype-stylist'), count($kit_data['fonts'])));
                                ?></span>
                            </h4>
                            <div class="ots-font-meta">
                                <small>
                                    <code><?php echo esc_html($kit_data['css_url']); ?></code>
                                    <?php
                                    $upload_date = $kit_data['added_date'];
                                    if (is_string($upload_date)) {
                                        $timestamp = strtotime($upload_date);
                                        $formatted_date = date_i18n(get_option('date_format') . ' ' . get_option('time_format'), $timestamp);
                                    } else {
                                        $formatted_date = esc_html($upload_date);
                                    }
                                    echo ' &bull; ';
                                    /* translators: %s: The date when the Adobe Fonts project was added */
                                    echo esc_html(sprintf(__('Added: %s', 'opentype-stylist'), $formatted_date));
                                    ?>
                                </small>
                            </div>
                        </div>

                        <div id="ots-adobe-kit-<?php echo esc_attr($kit_id); ?>" class="ots-kit-fonts" hidden>
                            <?php foreach ($kit_data['fonts'] as $font): ?>
                            <div class="ots-font-card ots-kit-font">
                                <div class="ots-font-header">
                                    <h5><?php echo esc_html($font['name']); ?></h5>
                                    <div class="ots-font-actions">
                                        <button
                                            class="button ots-edit-adobe-font"
                                            data-font-id="<?php echo esc_attr($font['id']); ?>"
                                            data-font-name="<?php echo esc_attr($font['name']); ?>"
                                            <?php /* translators: %s: The name of the Adobe font to be edited */ ?>
                                            aria-label="<?php echo esc_attr(sprintf(__('Edit fallback fonts for: %s', 'opentype-stylist'), $font['name'])); ?>">
                                            <span aria-hidden="true" class="dashicons dashicons-edit"></span>
                                            <?php esc_html_e('Edit Fallbacks', 'opentype-stylist'); ?>
                                        </button>
                                        <button
                                            class="button ots-delete-adobe-font"
                                            data-font-id="<?php echo esc_attr($font['id']); ?>"
                                            data-font-numeric-id="<?php echo isset($font['font_id']) ? esc_attr($font['font_id']) : '0'; ?>"
                                            data-font-name="<?php echo esc_attr($font['name']); ?>"
                                            <?php /* translators: %s: The name of the Adobe font to be deleted */ ?>
                                            aria-label="<?php echo esc_attr(sprintf(__('Delete font: %s', 'opentype-stylist'), $font['name'])); ?>">
                                            <span aria-hidden="true" class="dashicons dashicons-trash"></span>
                                            <?php esc_html_e('Delete', 'opentype-stylist'); ?>
                                        </button>
                                    </div>
                                </div>
                                <div class="ots-font-families">
                                    <strong><?php esc_html_e('Font Family:', 'opentype-stylist'); ?></strong>
                                    <?php echo esc_html($font['font_family']); ?>
                                </div>
                                <?php if (!empty($font['fallbacks'])): ?>
                                <div class="ots-font-fallbacks">
                                    <strong><?php esc_html_e('Fallbacks:', 'opentype-stylist'); ?></strong>
                                    <code><?php echo esc_html($font['fallbacks']); ?></code>
                                </div>
                                <?php endif; ?>
                                <div class="ots-font-loading-option">
                                    <label for="ots-load-all-pages-adobe-<?php echo esc_attr($font['id']); ?>">
                                        <input
                                            type="checkbox"
                                            class="ots-adobe-font-load-all-pages"
                                            data-font-id="<?php echo esc_attr($font['id']); ?>"
                                            id="ots-load-all-pages-adobe-<?php echo esc_attr($font['id']); ?>"
                                            <?php checked(!empty($font['load_on_all_pages'])); ?>
                                            aria-describedby="ots-load-all-pages-adobe-desc-<?php echo esc_attr($font['id']); ?>" />
                                        <?php esc_html_e('Load on all pages', 'opentype-stylist'); ?>
                                    </label>
                                    <p id="ots-load-all-pages-adobe-desc-<?php echo esc_attr($font['id']); ?>" class="description">
                                        <?php esc_html_e('When unchecked, this font will only load on pages where it is actually used. This improves performance.', 'opentype-stylist'); ?>
                                    </p>
                                </div>
                                <div class="ots-font-edit-form" style="display: none;">
                                    <div class="ots-form-field">
                                        <label><?php esc_html_e('Font Family:', 'opentype-stylist'); ?></label>
                                        <div class="ots-font-families-display">
                                            <code><?php echo esc_html($font['font_family']); ?></code>
                                        </div>
                                    </div>
                                    <div class="ots-form-field">
                                        <label for="ots-adobe-font-fallback-<?php echo esc_attr($font['id']); ?>">
                                            <?php esc_html_e('Fallback Fonts (optional):', 'opentype-stylist'); ?>
                                        </label>
                                        <input
                                            type="text"
                                            id="ots-adobe-font-fallback-<?php echo esc_attr($font['id']); ?>"
                                            class="regular-text code ots-adobe-font-fallback-input"
                                            value="<?php echo esc_attr(!empty($font['fallbacks']) ? $font['fallbacks'] : ''); ?>"
                                            placeholder="<?php esc_attr_e('e.g., Georgia, serif', 'opentype-stylist'); ?>"
                                            aria-describedby="ots-adobe-font-fallback-desc-<?php echo esc_attr($font['id']); ?>" />
                                        <p id="ots-adobe-font-fallback-desc-<?php echo esc_attr($font['id']); ?>" class="description">
                                            <?php esc_html_e('Enter fallback fonts separated by commas (these will be used if the primary font fails to load)', 'opentype-stylist'); ?>
                                        </p>
                                    </div>
                                    <div class="ots-form-actions">
                                        <button type="button" class="button button-primary ots-save-adobe-font-edit">
                                            <?php esc_html_e('Save Changes', 'opentype-stylist'); ?>
                                        </button>
                                        <button type="button" class="button ots-cancel-adobe-font-edit">
                                            <?php esc_html_e('Cancel', 'opentype-stylist'); ?>
                                        </button>
                                    </div>
                                    <div class="ots-adobe-font-edit-message" role="alert" aria-live="assertive" aria-atomic="true"></div>
                                </div>
                            </div>
                            <?php endforeach; ?>
                        </div>
                    </div>
                    <?php endforeach; ?>

                    <?php // Display standalone Adobe fonts (legacy, before kit refactor) ?>
                    <?php foreach ($standalone_adobe_fonts as $font): ?>
                    <div class="ots-font-card">
                        <div class="ots-font-header">
                            <h5><?php echo esc_html($font['name']); ?></h5>
                            <div class="ots-font-actions">
                                <button
                                    class="button ots-edit-adobe-font"
                                    data-font-id="<?php echo esc_attr($font['id']); ?>"
                                    data-font-name="<?php echo esc_attr($font['name']); ?>"
                                    <?php /* translators: %s: The name of the Adobe font project to be edited */ ?>
                                    aria-label="<?php echo esc_attr(sprintf(__('Edit fallback fonts for: %s', 'opentype-stylist'), $font['name'])); ?>">
                                    <span aria-hidden="true" class="dashicons dashicons-edit"></span>
                                    <?php esc_html_e('Edit Fallbacks', 'opentype-stylist'); ?>
                                </button>
                                <button
                                    class="button ots-delete-adobe-font"
                                    data-font-id="<?php echo esc_attr($font['id']); ?>"
                                    data-font-numeric-id="<?php echo isset($font['font_id']) ? esc_attr($font['font_id']) : '0'; ?>"
                                    data-font-name="<?php echo esc_attr($font['name']); ?>"
                                    <?php /* translators: %s: The name of the Adobe font project to be deleted */ ?>
                                    aria-label="<?php echo esc_attr(sprintf(__('Delete Adobe Fonts project: %s', 'opentype-stylist'), $font['name'])); ?>">
                                    <span aria-hidden="true" class="dashicons dashicons-trash"></span>
                                    <?php esc_html_e('Delete', 'opentype-stylist'); ?>
                                </button>
                            </div>
                        </div>
                        <?php if (!empty($font['font_families'])): ?>
                        <div class="ots-font-families">
                            <strong><?php esc_html_e('Font Families:', 'opentype-stylist'); ?></strong>
                            <?php echo esc_html(implode(', ', $font['font_families'])); ?>
                        </div>
                        <?php endif; ?>
                        <?php if (!empty($font['fallbacks'])): ?>
                        <div class="ots-font-fallbacks">
                            <strong><?php esc_html_e('Fallbacks:', 'opentype-stylist'); ?></strong>
                            <code><?php echo esc_html($font['fallbacks']); ?></code>
                        </div>
                        <?php endif; ?>
                        <div class="ots-font-loading-option">
                            <label for="ots-load-all-pages-legacy-<?php echo esc_attr($font['id']); ?>">
                                <input
                                    type="checkbox"
                                    class="ots-adobe-font-load-all-pages"
                                    data-font-id="<?php echo esc_attr($font['id']); ?>"
                                    id="ots-load-all-pages-legacy-<?php echo esc_attr($font['id']); ?>"
                                    <?php checked(!empty($font['load_on_all_pages'])); ?>
                                    aria-describedby="ots-load-all-pages-legacy-desc-<?php echo esc_attr($font['id']); ?>" />
                                <?php esc_html_e('Load on all pages', 'opentype-stylist'); ?>
                            </label>
                            <p id="ots-load-all-pages-legacy-desc-<?php echo esc_attr($font['id']); ?>" class="description">
                                <?php esc_html_e('When unchecked, this font will only load on pages where it is actually used. This improves performance.', 'opentype-stylist'); ?>
                            </p>
                        </div>
                        <div class="ots-font-meta">
                            <small>
                                <code><?php echo esc_html($font['css_url']); ?></code>
                                <?php
                                $upload_date = $font['added_date'];
                                if (is_string($upload_date)) {
                                    $timestamp = strtotime($upload_date);
                                    $formatted_date = date_i18n(get_option('date_format') . ' ' . get_option('time_format'), $timestamp);
                                } else {
                                    $formatted_date = esc_html($upload_date);
                                }
                                echo ' &bull; ';
                                /* translators: %s: The date when the Adobe Fonts project was added */
                                echo esc_html(sprintf(__('Added: %s', 'opentype-stylist'), $formatted_date));
                                ?>
                            </small>
                        </div>
                        <div class="ots-font-edit-form" style="display: none;">
                            <div class="ots-form-field">
                                <label><?php esc_html_e('Font Families:', 'opentype-stylist'); ?></label>
                                <div class="ots-font-families-display">
                                    <?php if (!empty($font['font_families'])): ?>
                                        <code><?php echo esc_html(implode(', ', $font['font_families'])); ?></code>
                                    <?php endif; ?>
                                </div>
                            </div>
                            <div class="ots-form-field">
                                <label for="ots-adobe-font-fallback-legacy-<?php echo esc_attr($font['id']); ?>">
                                    <?php esc_html_e('Fallback Fonts (optional):', 'opentype-stylist'); ?>
                                </label>
                                <input
                                    type="text"
                                    id="ots-adobe-font-fallback-legacy-<?php echo esc_attr($font['id']); ?>"
                                    class="regular-text code ots-adobe-font-fallback-input"
                                    value="<?php echo esc_attr(!empty($font['fallbacks']) ? $font['fallbacks'] : ''); ?>"
                                    placeholder="<?php esc_attr_e('e.g., Georgia, serif', 'opentype-stylist'); ?>"
                                    aria-describedby="ots-adobe-font-fallback-legacy-desc-<?php echo esc_attr($font['id']); ?>" />
                                <p id="ots-adobe-font-fallback-legacy-desc-<?php echo esc_attr($font['id']); ?>" class="description">
                                    <?php esc_html_e('Enter fallback fonts separated by commas (these will be used if the primary font fails to load)', 'opentype-stylist'); ?>
                                </p>
                            </div>
                            <div class="ots-form-actions">
                                <button type="button" class="button button-primary ots-save-adobe-font-edit">
                                    <?php esc_html_e('Save Changes', 'opentype-stylist'); ?>
                                </button>
                                <button type="button" class="button ots-cancel-adobe-font-edit">
                                    <?php esc_html_e('Cancel', 'opentype-stylist'); ?>
                                </button>
                            </div>
                            <div class="ots-adobe-font-edit-message" role="alert" aria-live="assertive" aria-atomic="true"></div>
                        </div>
                    </div>
                    <?php endforeach; ?>
                </div>
                <?php endif; ?>

                <div class="ots-add-adobe-font-form">
                    <h4><?php esc_html_e('Add Adobe Fonts Project', 'opentype-stylist'); ?></h4>

                    <div class="ots-form-field">
                        <label for="ots-adobe-font-name">
                            <?php esc_html_e('Project Name:', 'opentype-stylist'); ?>
                            <span class="required" aria-label="<?php esc_attr_e('required', 'opentype-stylist'); ?>">*</span>
                        </label>
                        <input
                            type="text"
                            id="ots-adobe-font-name"
                            name="ots-adobe-font-name"
                            class="regular-text"
                            placeholder="<?php esc_attr_e('e.g., My Adobe Fonts Project', 'opentype-stylist'); ?>"
                            aria-required="true"
                            aria-describedby="ots-adobe-font-name-desc" />
                        <p id="ots-adobe-font-name-desc" class="description">
                            <?php esc_html_e('Enter a descriptive name for this Adobe Fonts project', 'opentype-stylist'); ?>
                        </p>
                    </div>

                    <div class="ots-form-field">
                        <label for="ots-adobe-embed-code">
                            <?php esc_html_e('Adobe Fonts Embed Code:', 'opentype-stylist'); ?>
                            <span class="required" aria-label="<?php esc_attr_e('required', 'opentype-stylist'); ?>">*</span>
                        </label>
                        <textarea
                            id="ots-adobe-embed-code"
                            name="ots-adobe-embed-code"
                            class="large-text code"
                            rows="3"
                            placeholder="<?php esc_attr_e('<link rel=&quot;stylesheet&quot; href=&quot;https://use.typekit.net/abc1234.css&quot;>', 'opentype-stylist'); ?>"
                            aria-required="true"
                            aria-describedby="ots-adobe-embed-desc"></textarea>
                        <p id="ots-adobe-embed-desc" class="description">
                            <?php esc_html_e('Paste the complete embed code from your Adobe Fonts project (including <link> tags)', 'opentype-stylist'); ?>
                        </p>
                    </div>

                    <div class="ots-form-field">
                        <label for="ots-adobe-font-families">
                            <?php esc_html_e('Font Family Names:', 'opentype-stylist'); ?>
                            <span class="required" aria-label="<?php esc_attr_e('required', 'opentype-stylist'); ?>">*</span>
                        </label>
                        <input
                            type="text"
                            id="ots-adobe-font-families"
                            name="ots-adobe-font-families"
                            class="regular-text"
                            placeholder="<?php esc_attr_e('e.g., proxima-nova, futura-pt', 'opentype-stylist'); ?>"
                            aria-required="true"
                            aria-describedby="ots-adobe-families-desc" />
                        <p id="ots-adobe-families-desc" class="description">
                            <?php esc_html_e('Enter the exact font family names separated by commas (find these in your Adobe Fonts project settings)', 'opentype-stylist'); ?>
                        </p>
                    </div>

                    <button type="button" id="ots-add-adobe-font-btn" class="button button-primary">
                        <?php esc_html_e('Add Adobe Fonts Project', 'opentype-stylist'); ?>
                    </button>
                    <div id="ots-adobe-font-message" role="alert" aria-live="assertive" aria-atomic="true" style="margin-top: 10px;"></div>
                </div>

                <div class="ots-adobe-help">
                    <h4><?php esc_html_e('How to use Adobe Fonts:', 'opentype-stylist'); ?></h4>
                    <ol>
                        <li><?php esc_html_e('Go to fonts.adobe.com and create or open your Web Project', 'opentype-stylist'); ?></li>
                        <li><?php esc_html_e('Add the fonts you want to use to your project', 'opentype-stylist'); ?></li>
                        <li><?php esc_html_e('Copy the embed code (the <script> tag) from the project', 'opentype-stylist'); ?></li>
                        <li><?php esc_html_e('Paste it above and give your project a name', 'opentype-stylist'); ?></li>
                        <li><?php esc_html_e('Optionally, enter the font family names (e.g., "proxima-nova") to enable them in the preview selector', 'opentype-stylist'); ?></li>
                    </ol>
                    <p><strong><?php esc_html_e('Note:', 'opentype-stylist'); ?></strong> <?php esc_html_e('Adobe Fonts loads directly from Adobe\'s servers. Make sure your domain is authorized in your Adobe Fonts project settings.', 'opentype-stylist'); ?></p>
                </div>
            </div>

            <!-- Manual Fonts Section -->
            <div class="ots-manual-fonts-section" id="ots-manual-fonts-section">
                <h3><?php esc_html_e('Custom Font Definitions', 'opentype-stylist'); ?></h3>
                <p><?php esc_html_e('Define custom fonts that are loaded through your theme, other plugins, or CDN. Simply enter the CSS font-family name.', 'opentype-stylist'); ?></p>

                <?php if (!empty($manual_fonts)): ?>
                <div class="ots-manual-fonts-list">
                    <h4><?php esc_html_e('Defined Custom Fonts', 'opentype-stylist'); ?></h4>
                    <?php foreach ($manual_fonts as $font): ?>
                    <div class="ots-manual-font-card">
                        <div class="ots-font-header">
                            <h5><?php echo esc_html($font['name']); ?></h5>
                            <div class="ots-font-actions">
                                <button
                                    class="button ots-edit-manual-font"
                                    data-font-id="<?php echo esc_attr($font['id']); ?>"
                                    data-font-name="<?php echo esc_attr($font['name']); ?>"
                                    <?php /* translators: %s: The name of the custom font to be edited */ ?>
                                    aria-label="<?php echo esc_attr(sprintf(__('Edit custom font: %s', 'opentype-stylist'), $font['name'])); ?>">
                                    <span aria-hidden="true" class="dashicons dashicons-edit"></span>
                                    <?php esc_html_e('Edit', 'opentype-stylist'); ?>
                                </button>
                                <button
                                    class="button ots-delete-manual-font"
                                    data-font-id="<?php echo esc_attr($font['id']); ?>"
                                    data-font-numeric-id="<?php echo isset($font['font_id']) ? esc_attr($font['font_id']) : '0'; ?>"
                                    data-font-name="<?php echo esc_attr($font['name']); ?>"
                                    <?php /* translators: %s: The name of the custom font to be deleted */ ?>
                                    aria-label="<?php echo esc_attr(sprintf(__('Delete custom font: %s', 'opentype-stylist'), $font['name'])); ?>">
                                    <span aria-hidden="true" class="dashicons dashicons-trash"></span>
                                    <?php esc_html_e('Delete', 'opentype-stylist'); ?>
                                </button>
                            </div>
                        </div>
                        <div class="ots-font-families">
                            <strong><?php esc_html_e('CSS Font Family:', 'opentype-stylist'); ?></strong>
                            <code><?php echo esc_html($font['font_family']); ?></code>
                        </div>
                        <div class="ots-font-meta">
                            <small>
                                <?php
                                $upload_date = $font['added_date'];
                                if (is_string($upload_date)) {
                                    $timestamp = strtotime($upload_date);
                                    $formatted_date = date_i18n(get_option('date_format') . ' ' . get_option('time_format'), $timestamp);
                                } else {
                                    $formatted_date = esc_html($upload_date);
                                }
                                /* translators: %s: The date when the custom font was added */
                                echo esc_html(sprintf(__('Added: %s', 'opentype-stylist'), $formatted_date));
                                ?>
                            </small>
                        </div>
                        <div class="ots-font-edit-form" style="display: none;">
                            <div class="ots-form-field">
                                <label for="ots-manual-font-family-edit-<?php echo esc_attr($font['id']); ?>">
                                    <?php esc_html_e('CSS Font Family:', 'opentype-stylist'); ?>
                                    <span class="required" aria-label="<?php esc_attr_e('required', 'opentype-stylist'); ?>">*</span>
                                </label>
                                <input
                                    type="text"
                                    id="ots-manual-font-family-edit-<?php echo esc_attr($font['id']); ?>"
                                    class="regular-text code ots-manual-font-family-input"
                                    value="<?php echo esc_attr($font['font_family']); ?>"
                                    placeholder="<?php esc_attr_e('e.g., \'Playfair Display\', Georgia, serif', 'opentype-stylist'); ?>"
                                    aria-required="true"
                                    aria-describedby="ots-manual-font-family-edit-desc-<?php echo esc_attr($font['id']); ?>" />
                                <p id="ots-manual-font-family-edit-desc-<?php echo esc_attr($font['id']); ?>" class="description">
                                    <?php esc_html_e('Enter the exact CSS font-family value including any fallback fonts (e.g., \'Playfair Display\', Georgia, serif)', 'opentype-stylist'); ?>
                                </p>
                            </div>
                            <div class="ots-form-actions">
                                <button type="button" class="button button-primary ots-save-manual-font-edit">
                                    <?php esc_html_e('Save Changes', 'opentype-stylist'); ?>
                                </button>
                                <button type="button" class="button ots-cancel-manual-font-edit">
                                    <?php esc_html_e('Cancel', 'opentype-stylist'); ?>
                                </button>
                            </div>
                            <div class="ots-manual-font-edit-message" role="alert" aria-live="assertive" aria-atomic="true"></div>
                        </div>
                    </div>
                    <?php endforeach; ?>
                </div>
                <?php endif; ?>

                <div class="ots-add-manual-font-form">
                    <h4><?php esc_html_e('Add Custom Font', 'opentype-stylist'); ?></h4>

                    <div class="ots-form-field">
                        <label for="ots-manual-font-name">
                            <?php esc_html_e('Font Name:', 'opentype-stylist'); ?>
                            <span class="required" aria-label="<?php esc_attr_e('required', 'opentype-stylist'); ?>">*</span>
                        </label>
                        <input
                            type="text"
                            id="ots-manual-font-name"
                            name="ots-manual-font-name"
                            class="regular-text"
                            placeholder="<?php esc_attr_e('e.g., Playfair Display', 'opentype-stylist'); ?>"
                            aria-required="true"
                            aria-describedby="ots-manual-font-name-desc" />
                        <p id="ots-manual-font-name-desc" class="description">
                            <?php esc_html_e('Enter a display name for this font', 'opentype-stylist'); ?>
                        </p>
                    </div>

                    <div class="ots-form-field">
                        <label for="ots-manual-font-family">
                            <?php esc_html_e('CSS Font Family:', 'opentype-stylist'); ?>
                            <span class="required" aria-label="<?php esc_attr_e('required', 'opentype-stylist'); ?>">*</span>
                        </label>
                        <input
                            type="text"
                            id="ots-manual-font-family"
                            name="ots-manual-font-family"
                            class="regular-text code"
                            placeholder="<?php esc_attr_e('e.g., \'Playfair Display\', Georgia, serif', 'opentype-stylist'); ?>"
                            aria-required="true"
                            aria-describedby="ots-manual-font-family-desc" />
                        <p id="ots-manual-font-family-desc" class="description">
                            <?php esc_html_e('Enter the exact CSS font-family value including any fallback fonts (e.g., \'Playfair Display\', Georgia, serif)', 'opentype-stylist'); ?>
                        </p>
                    </div>

                    <button type="button" id="ots-add-manual-font-btn" class="button button-primary">
                        <?php esc_html_e('Add Custom Font', 'opentype-stylist'); ?>
                    </button>
                    <div id="ots-manual-font-message" role="alert" aria-live="assertive" aria-atomic="true" style="margin-top: 10px;"></div>
                </div>

                <div class="ots-manual-help">
                    <h4><?php esc_html_e('How to use custom font definitions:', 'opentype-stylist'); ?></h4>
                    <ol>
                        <li><?php esc_html_e('Make sure your font is already loaded on your site (via theme, plugin, or @font-face)', 'opentype-stylist'); ?></li>
                        <li><?php esc_html_e('Find the exact font-family name used in CSS (check your theme\'s stylesheet or browser developer tools)', 'opentype-stylist'); ?></li>
                        <li><?php esc_html_e('Enter the font name and CSS font-family value above (including any fallback fonts)', 'opentype-stylist'); ?></li>
                        <li><?php esc_html_e('The font will be available in the block editor font selector', 'opentype-stylist'); ?></li>
                    </ol>
                    <p><strong><?php esc_html_e('Examples:', 'opentype-stylist'); ?></strong></p>
                    <ul>
                        <li><strong><?php esc_html_e('Google Fonts:', 'opentype-stylist'); ?></strong> <code>font-family: 'Playfair Display', serif</code></li>
                        <li><strong><?php esc_html_e('System Fonts:', 'opentype-stylist'); ?></strong> <code>font-family: -apple-system, BlinkMacSystemFont, sans-serif</code></li>
                        <li><strong><?php esc_html_e('Theme Fonts:', 'opentype-stylist'); ?></strong> <code>font-family: 'My Theme Font', Georgia, serif</code></li>
                    </ul>
                    <p><strong><?php esc_html_e('Note:', 'opentype-stylist'); ?></strong> <?php esc_html_e('This plugin does not load fonts for you - it only applies OpenType features to fonts already loaded on your site.', 'opentype-stylist'); ?></p>
                </div>
            </div>
        </div>

        <!-- Options Tab -->
        <div
            class="ots-tab-content"
            id="ots-tab-options"
            role="tabpanel"
            aria-labelledby="ots-tab-button-options"
            hidden="hidden"
            tabindex="0">
            <h2><?php esc_html_e('Options', 'opentype-stylist'); ?></h2>
            <p><?php esc_html_e('Configure general plugin settings and user experience preferences.', 'opentype-stylist'); ?></p>

            <form method="post" action="">
                <?php wp_nonce_field('ots_options_settings_nonce'); ?>

                <table class="form-table" role="presentation">
                    <tbody>
                        <tr>
                            <th scope="row">
                                <label for="ots_show_clear_confirmation">
                                    <?php esc_html_e('Clear Button Confirmation', 'opentype-stylist'); ?>
                                </label>
                            </th>
                            <td>
                                <input
                                    type="checkbox"
                                    id="ots_show_clear_confirmation"
                                    name="ots_show_clear_confirmation"
                                    value="1"
                                    <?php checked(get_option('ots_show_clear_confirmation', true)); ?>
                                />
                                <label for="ots_show_clear_confirmation">
                                    <?php esc_html_e('Show confirmation when clearing typography features', 'opentype-stylist'); ?>
                                </label>
                                <p class="description">
                                    <?php esc_html_e('When enabled, the Clear button in the block editor will show a confirmation dialog before removing all formatting. This helps prevent accidental data loss. Users can disable this on a per-session basis.', 'opentype-stylist'); ?>
                                </p>
                            </td>
                        </tr>
                        <?php
                        /*
                         * Variable Font Weights option - commented out for future version
                         * Backend functionality remains in place, UI option hidden until ready for release
                         */
                        ?>
                        <?php /* ?>
                        <tr>
                            <th scope="row">
                                <label for="ots_allow_variable_weights">
                                    <?php esc_html_e('Variable Font Weights', 'opentype-stylist'); ?>
                                </label>
                            </th>
                            <td>
                                <input
                                    type="checkbox"
                                    id="ots_allow_variable_weights"
                                    name="ots_allow_variable_weights"
                                    value="1"
                                    <?php checked(get_option('ots_allow_variable_weights', false)); ?>
                                />
                                <label for="ots_allow_variable_weights">
                                    <?php esc_html_e('Allow custom font-weight values (1-1000) for variable fonts', 'opentype-stylist'); ?>
                                </label>
                                <p class="description">
                                    <?php esc_html_e('When enabled, allows font-weight values from 1-1000 instead of just standard weights (100, 200, ..., 900). Enable this if you are using variable fonts that support intermediate weights like 450 or 350. Disabled by default for compatibility with standard fonts.', 'opentype-stylist'); ?>
                                </p>
                            </td>
                        </tr>
                        <?php */ ?>
                    </tbody>
                </table>

                <p class="submit">
                    <button type="submit" name="ots_save_options_settings" class="button button-primary">
                        <?php esc_html_e('Save Options', 'opentype-stylist'); ?>
                    </button>
                </p>
            </form>
        </div>

        <!-- Accessibility Tab -->
        <div
            class="ots-tab-content"
            id="ots-tab-accessibility"
            role="tabpanel"
            aria-labelledby="ots-tab-button-accessibility"
            hidden="hidden"
            tabindex="0">
            <h2><?php esc_html_e('Accessibility Settings', 'opentype-stylist'); ?></h2>

            <div class="notice notice-info inline" style="margin: 20px 0;">
                <h3><?php esc_html_e('Built-in Accessibility Features', 'opentype-stylist'); ?></h3>
                <p><?php esc_html_e('This plugin includes accessibility features by default:', 'opentype-stylist'); ?></p>
                <ul style="list-style: disc; margin-left: 20px;">
                    <li><strong><?php esc_html_e('OpenType Stylist Block:', 'opentype-stylist'); ?></strong> <?php esc_html_e('Automatically creates dual semantic headings - a clean text version for screen readers (hidden visually) and a styled version for sighted users (hidden from screen readers with aria-hidden="true"). No configuration needed.', 'opentype-stylist'); ?></li>
                    <li><strong><?php esc_html_e('Inline Format (Rich Text Blocks):', 'opentype-stylist'); ?></strong> <?php esc_html_e('By default, applies styling directly to text. Enable the optional setting below to add aria-label attributes for enhanced screen reader support.', 'opentype-stylist'); ?></li>
                </ul>
            </div>

            <form method="post" action="">
                <?php wp_nonce_field('ots_accessibility_settings_nonce'); ?>

                <h3><?php esc_html_e('Optional Screen Reader Enhancement', 'opentype-stylist'); ?></h3>
                <p><?php esc_html_e('Configure aria-label support for inline formatted text (standard heading blocks, paragraph blocks, etc.).', 'opentype-stylist'); ?></p>

                <table class="form-table" role="presentation">
                    <tbody>
                        <tr>
                            <th scope="row">
                                <label for="ots_enable_aria_labels">
                                    <?php esc_html_e('Inline Format: Add aria-label Attributes', 'opentype-stylist'); ?>
                                </label>
                            </th>
                            <td>
                                <input
                                    type="checkbox"
                                    id="ots_enable_aria_labels"
                                    name="ots_enable_aria_labels"
                                    value="1"
                                    <?php checked(get_option('ots_enable_aria_labels', false)); ?>
                                />
                                <label for="ots_enable_aria_labels">
                                    <?php esc_html_e('Add aria-label with original text to inline styled spans', 'opentype-stylist'); ?>
                                </label>
                                <p class="description">
                                    <?php esc_html_e('When enabled, text styled with the inline format toolbar button will include aria-label attributes containing the original, unmodified text. This helps prevent screen reader mispronunciation of OpenType ligatures (e.g., "fi" rendered as "ﬁ").', 'opentype-stylist'); ?>
                                    <br>
                                    <strong><?php esc_html_e('Note:', 'opentype-stylist'); ?></strong> <?php esc_html_e('This setting only affects inline formats. The OpenType Stylist block already includes full accessibility features by default.', 'opentype-stylist'); ?>
                                </p>
                            </td>
                        </tr>
                    </tbody>
                </table>

                <p class="submit">
                    <button type="submit" name="ots_save_accessibility_settings" class="button button-primary">
                        <?php esc_html_e('Save Accessibility Settings', 'opentype-stylist'); ?>
                    </button>
                </p>
            </form>

            <div class="ots-accessibility-recommendations">
                <h3><?php esc_html_e('Accessibility Best Practices', 'opentype-stylist'); ?></h3>
                <ul>
                    <li><?php esc_html_e('For complex typography with partial word styling, use the OpenType Stylist block instead of inline formats.', 'opentype-stylist'); ?></li>
                    <li><?php esc_html_e('Always select complete words or phrases when applying inline formats to avoid fragmenting text for screen readers.', 'opentype-stylist'); ?></li>
                    <li><?php esc_html_e('Test your styled headings with screen readers like NVDA (Windows) or VoiceOver (macOS) to ensure they read correctly.', 'opentype-stylist'); ?></li>
                    <li><?php esc_html_e('The plugin will warn you if you attempt to apply formatting to partial words and offer to convert to an accessible block.', 'opentype-stylist'); ?></li>
                </ul>
            </div>
        </div>

        <!-- Replacement Fonts Tab -->
        <div
            class="ots-tab-content"
            id="ots-tab-replacements"
            role="tabpanel"
            aria-labelledby="ots-tab-button-replacements"
            hidden="hidden"
            tabindex="0">
            <h2><?php esc_html_e('Replacement Fonts', 'opentype-stylist'); ?></h2>
            <p><?php esc_html_e('When a font is deleted, you can map it to a replacement font. Content using the deleted font will automatically display with the replacement.', 'opentype-stylist'); ?></p>

            <div id="ots-replacements-list">
                <!-- Populated by JavaScript -->
                <p class="ots-no-replacements"><?php esc_html_e('No font replacements configured.', 'opentype-stylist'); ?></p>
            </div>

            <div class="ots-add-replacement-section" style="margin-top: 30px; padding: 20px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 4px;">
                <h3><?php esc_html_e('Add New Replacement Mapping', 'opentype-stylist'); ?></h3>
                <p><?php esc_html_e('Manually create a replacement mapping for a font ID that was previously deleted.', 'opentype-stylist'); ?></p>

                <div class="ots-add-replacement-form">
                    <div class="ots-form-field" style="margin-bottom: 15px;">
                        <label for="ots-new-deleted-id">
                            <?php esc_html_e('Deleted Font ID:', 'opentype-stylist'); ?>
                        </label>
                        <select id="ots-new-deleted-id" class="regular-text" aria-describedby="ots-new-deleted-id-desc">
                            <option value=""><?php esc_html_e('Select a deleted font ID...', 'opentype-stylist'); ?></option>
                            <!-- Populated by JavaScript -->
                        </select>
                        <p id="ots-new-deleted-id-desc" class="description">
                            <?php esc_html_e('Select a font ID that was previously deleted (available IDs shown)', 'opentype-stylist'); ?>
                        </p>
                    </div>

                    <div class="ots-form-field" style="margin-bottom: 15px;">
                        <label for="ots-new-replacement-id">
                            <?php esc_html_e('Replacement Font:', 'opentype-stylist'); ?>
                        </label>
                        <select id="ots-new-replacement-id" class="regular-text" aria-describedby="ots-new-replacement-id-desc">
                            <option value=""><?php esc_html_e('Select a replacement font...', 'opentype-stylist'); ?></option>
                            <!-- Populated by JavaScript -->
                        </select>
                        <p id="ots-new-replacement-id-desc" class="description">
                            <?php esc_html_e('Select which active font should replace the deleted font', 'opentype-stylist'); ?>
                        </p>
                    </div>

                    <div class="ots-form-actions">
                        <button type="button" id="ots-add-replacement-btn" class="button button-primary">
                            <?php esc_html_e('Add Replacement', 'opentype-stylist'); ?>
                        </button>
                    </div>

                    <div id="ots-add-replacement-message" class="ots-message" role="alert" aria-live="assertive" style="margin-top: 10px;"></div>
                </div>
            </div>

            <div id="ots-unassigned-fonts" style="display:none; margin-top: 30px;">
                <h3><?php esc_html_e('Unassigned Font IDs', 'opentype-stylist'); ?></h3>
                <p><?php esc_html_e('These font IDs are referenced in your replacement mappings but no longer have active fonts. Assign replacements to restore functionality.', 'opentype-stylist'); ?></p>
                <div id="ots-unassigned-list">
                    <!-- Populated by JavaScript -->
                </div>
            </div>
        </div>

        <!-- Help Tab -->
        <div
            class="ots-tab-content"
            id="ots-tab-help"
            role="tabpanel"
            aria-labelledby="ots-tab-button-help"
            hidden="hidden"
            tabindex="0">
            <h2><?php esc_html_e('How to Use', 'opentype-stylist'); ?></h2>

            <div class="ots-help-section">
                <h3><?php esc_html_e('How to Use', 'opentype-stylist'); ?></h3>

                <h4><?php esc_html_e('Method 1: Inline Format (Quick Styling)', 'opentype-stylist'); ?></h4>
                <p><?php esc_html_e('Use this method for applying features to complete words or phrases in any heading or paragraph block.', 'opentype-stylist'); ?></p>
                <ol>
                    <li><?php esc_html_e('Create or edit a heading (H1-H6) or paragraph block', 'opentype-stylist'); ?></li>
                    <li><?php esc_html_e('Select the complete word(s) you want to style', 'opentype-stylist'); ?></li>
                    <li><?php esc_html_e('Click the "Typography Features" button in the toolbar', 'opentype-stylist'); ?></li>
                    <li><?php esc_html_e('Choose a preset or toggle individual features', 'opentype-stylist'); ?></li>
                    <li><?php esc_html_e('Preview the changes and click Apply', 'opentype-stylist'); ?></li>
                </ol>

                <h4><?php esc_html_e('Method 2: OpenType Stylist Block (Advanced)', 'opentype-stylist'); ?></h4>
                <p><?php esc_html_e('Use this method for complex typography, letter-by-letter styling, or when accessibility features are needed.', 'opentype-stylist'); ?></p>
                <ol>
                    <li><?php esc_html_e('Add the "OpenType Stylist" block from the block inserter', 'opentype-stylist'); ?></li>
                    <li><?php esc_html_e('Choose heading level (H1-H6) in the sidebar', 'opentype-stylist'); ?></li>
                    <li><?php esc_html_e('Use sidebar controls for font family, size, and OpenType features', 'opentype-stylist'); ?></li>
                    <li><?php esc_html_e('For inline text styling, select text to show the quick feature popover', 'opentype-stylist'); ?></li>
                </ol>
            </div>

            <div class="ots-help-section">
                <h3><?php esc_html_e('Choosing Fonts for OpenType Features', 'opentype-stylist'); ?></h3>
                <p><?php esc_html_e('This plugin works with fonts that include advanced typographical features and alternate glyphs.', 'opentype-stylist'); ?></p>

                <h4><?php esc_html_e('Font Types with OpenType Support:', 'opentype-stylist'); ?></h4>
                <ul>
                    <li><strong><?php esc_html_e('Script & Calligraphy Fonts', 'opentype-stylist'); ?></strong> - <?php esc_html_e('Often include contextual alternates, swashes, and stylistic sets', 'opentype-stylist'); ?></li>
                    <li><strong><?php esc_html_e('Serif Display Fonts', 'opentype-stylist'); ?></strong> - <?php esc_html_e('May feature titling alternates and ligatures', 'opentype-stylist'); ?></li>
                    <li><strong><?php esc_html_e('Professional Typefaces', 'opentype-stylist'); ?></strong> - <?php esc_html_e('Many include discretionary ligatures and stylistic alternates', 'opentype-stylist'); ?></li>
                    <li><strong><?php esc_html_e('Ornamental Fonts', 'opentype-stylist'); ?></strong> - <?php esc_html_e('Can contain ornaments and special character sets', 'opentype-stylist'); ?></li>
                </ul>

                <p><?php esc_html_e('Upload fonts via the Custom Fonts tab, or load them through your theme or font service.', 'opentype-stylist'); ?></p>
            </div>

            <div class="ots-help-section">
                <h3><?php esc_html_e('Tips for Using OpenType Features', 'opentype-stylist'); ?></h3>
                <ul>
                    <li><?php esc_html_e('Start with contextual alternates (calt) for automatic character substitutions', 'opentype-stylist'); ?></li>
                    <li><?php esc_html_e('Use swashes sparingly on initial or terminal letters only', 'opentype-stylist'); ?></li>
                    <li><?php esc_html_e('Experiment with stylistic sets (ss01-ss20) to discover alternate designs', 'opentype-stylist'); ?></li>
                    <li><?php esc_html_e('Test ligatures - standard (liga) usually work universally, discretionary (dlig) need careful application', 'opentype-stylist'); ?></li>
                    <li><?php esc_html_e('Preview at actual display size - features may look different at various scales', 'opentype-stylist'); ?></li>
                    <li><?php esc_html_e('Not all fonts support all features - check documentation and experiment', 'opentype-stylist'); ?></li>
                    <li><?php esc_html_e('For partial word styling, use the OpenType Stylist block to maintain accessibility', 'opentype-stylist'); ?></li>
                </ul>
            </div>

            <div class="ots-help-section">
                <h3><?php esc_html_e('Technical Notes', 'opentype-stylist'); ?></h3>
                <p><?php esc_html_e('Features are applied using CSS font-feature-settings stored as inline styles and data attributes. No additional database tables are required.', 'opentype-stylist'); ?></p>
                <p><?php esc_html_e('Browser support: All modern browsers (Chrome, Firefox, Safari, Edge) fully support OpenType features. Internet Explorer 10+ has partial support.', 'opentype-stylist'); ?></p>
                <p><?php esc_html_e('Frontend performance: The plugin uses CSS-only rendering with no JavaScript on the public site, ensuring fast page loads.', 'opentype-stylist'); ?></p>
            </div>

            <!-- Developer Support Section -->
            <div style="margin-top: 30px; background: #fff; border: 1px solid #c3c4c7; box-shadow: 0 1px 1px rgba(0,0,0,.04); padding: 20px; border-radius: 4px;">
                <h3 style="margin-top: 0; color: #2271b1;"><?php esc_html_e('Looking for high-fidelity implementation?', 'opentype-stylist'); ?></h3>

                <p><?php esc_html_e('Beyond this plugin, I specialize in pixel-perfect WordPress builds that strictly adhere to accessibility standards and advanced typographic systems. If you need a partner for custom block development or complex design integration:', 'opentype-stylist'); ?></p>

                <p>
                    <a href="mailto:matt@mnc4.com" class="button">
                        <?php esc_html_e('Contact me at matt@mnc4.com', 'opentype-stylist'); ?>
                    </a>
                    <span style="margin: 0 10px;">|</span>
                    <a href="https://buymeacoffee.com/matthewneilcowan" target="_blank" rel="noopener noreferrer" class="button">
                        <?php esc_html_e('Buy me a coffee ☕', 'opentype-stylist'); ?>
                    </a>
                </p>
            </div>
        </div>
    </div>

    <!-- Font Deletion Modal -->
    <div id="ots-delete-font-modal" class="ots-modal" style="display:none;">
        <div class="ots-modal-overlay"></div>
        <div class="ots-modal-content">
            <div class="ots-modal-header">
                <h2><?php esc_html_e('Delete Font', 'opentype-stylist'); ?></h2>
                <button class="ots-modal-close" aria-label="<?php esc_attr_e('Close', 'opentype-stylist'); ?>">&times;</button>
            </div>
            <div class="ots-modal-body">
                <p><?php esc_html_e('Assign a fallback for existing uses of this font?', 'opentype-stylist'); ?></p>
                <p class="description"><?php esc_html_e('Content will automatically use the replacement font. You can change this later in Replacement Fonts.', 'opentype-stylist'); ?></p>

                <div class="ots-modal-field">
                    <label for="ots-replacement-font-select">
                        <?php esc_html_e('Replacement Font:', 'opentype-stylist'); ?>
                    </label>
                    <select id="ots-replacement-font-select">
                        <option value=""><?php esc_html_e('— No Replacement (Skip) —', 'opentype-stylist'); ?></option>
                        <!-- Populated by JavaScript -->
                    </select>
                </div>

                <div class="ots-modal-field">
                    <label>
                        <input type="checkbox" id="ots-replacement-global-load" />
                        <?php esc_html_e('Load replacement globally', 'opentype-stylist'); ?>
                    </label>
                    <p class="description"><?php esc_html_e('Forces this replacement to load on all pages, even if the deleted font is not detected.', 'opentype-stylist'); ?></p>
                </div>
            </div>
            <div class="ots-modal-footer">
                <button type="button" class="button ots-modal-cancel"><?php esc_html_e('Cancel', 'opentype-stylist'); ?></button>
                <button type="button" class="button button-primary ots-modal-confirm-delete"><?php esc_html_e('Delete Font', 'opentype-stylist'); ?></button>
            </div>
        </div>
    </div>
</div>

<!-- All CSS and JavaScript have been moved to separate external files:
     - assets/css/admin-page.css (or admin-page.min.css)
     - assets/js/admin-page.js (or admin-page.min.js)
     These files are enqueued in the main plugin file via enqueue_admin_assets() method
-->

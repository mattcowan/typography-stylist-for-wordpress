<?php
/**
 * Export & Import tab (#205)
 *
 * The forms are rendered here; assets/js/admin-export.js sends them to the
 * export and import routes and renders the import preview and result.
 *
 * @since 2.3.5
 */

if (!defined('ABSPATH')) {
    exit;
}

if (!function_exists('typost_render_export_tab')) {
    /**
     * Render the tab content.
     *
     * @param array $sections   Section id => {label, items: {id, name, parent}[]},
     *                          only the sections the user may export.
     * @param bool  $can_import Whether the user may import (manage_options).
     */
    function typost_render_export_tab($sections, $can_import) {
        ?>
        <h2><?php esc_html_e('Export & Import', 'typography-stylist'); ?></h2>

        <details class="typost-tab-help">
            <summary><?php esc_html_e('About Export & Import', 'typography-stylist'); ?></summary>
            <div class="typost-tab-help-content">
                <p><?php esc_html_e('Move paragraph styles from one site to another, for example from a staging site to production, or reuse a house set of styles on each new site.', 'typography-stylist'); ?></p>
                <ul>
                    <li><?php esc_html_e('The file names each font by its family and where it comes from, not by this site’s font ID. On import, each font is matched to a font on the other site, and you can change the match.', 'typography-stylist'); ?></li>
                    <li><?php esc_html_e('Adobe Fonts projects and custom font definitions can be added from the file. Uploaded font files are not in the file: upload them on the other site first.', 'typography-stylist'); ?></li>
                    <li><?php esc_html_e('A style that is based on another style keeps that link. When you export some styles, the styles they are based on are added.', 'typography-stylist'); ?></li>
                    <li><?php esc_html_e('Import shows what the file holds first. Nothing is saved until you choose Import, and an existing style changes only when you choose to overwrite it.', 'typography-stylist'); ?></li>
                </ul>
            </div>
        </details>

        <noscript>
            <div class="notice notice-warning inline"><p><?php esc_html_e('Export & Import needs JavaScript.', 'typography-stylist'); ?></p></div>
        </noscript>

        <section class="typost-export-panel" aria-labelledby="typost-export-heading">
            <h3 id="typost-export-heading"><?php esc_html_e('Export', 'typography-stylist'); ?></h3>
            <?php if (empty($sections)) : ?>
                <p><?php esc_html_e('There is nothing you can export.', 'typography-stylist'); ?></p>
            <?php else : ?>
            <form id="typost-export-form" novalidate>
                <fieldset class="typost-export-sections">
                    <legend><?php esc_html_e('What to export', 'typography-stylist'); ?></legend>
                    <?php foreach ($sections as $id => $section) : ?>
                        <?php $field = 'typost-export-section-' . $id; ?>
                        <div class="typost-export-section" data-section="<?php echo esc_attr($id); ?>">
                            <p>
                                <input type="checkbox" id="<?php echo esc_attr($field); ?>" class="typost-export-section-toggle" value="<?php echo esc_attr($id); ?>" checked />
                                <label for="<?php echo esc_attr($field); ?>">
                                    <?php
                                    echo esc_html(sprintf(
                                        /* translators: 1: section name, such as Paragraph styles, 2: number of items */
                                        __('%1$s (%2$d)', 'typography-stylist'),
                                        $section['label'],
                                        count($section['items'])
                                    ));
                                    ?>
                                </label>
                            </p>
                            <?php if (!empty($section['items'])) : ?>
                                <fieldset class="typost-export-items">
                                    <legend class="screen-reader-text">
                                        <?php
                                        /* translators: %s: section name, such as Paragraph styles */
                                        echo esc_html(sprintf(__('Items to export: %s', 'typography-stylist'), $section['label']));
                                        ?>
                                    </legend>
                                    <p class="typost-export-scope">
                                        <span class="typost-export-scope-option">
                                            <input type="radio" id="<?php echo esc_attr($field . '-all'); ?>" name="<?php echo esc_attr($field . '-scope'); ?>" value="all" checked />
                                            <label for="<?php echo esc_attr($field . '-all'); ?>"><?php esc_html_e('All', 'typography-stylist'); ?></label>
                                        </span>
                                        <span class="typost-export-scope-option">
                                            <input type="radio" id="<?php echo esc_attr($field . '-some'); ?>" name="<?php echo esc_attr($field . '-scope'); ?>" value="some" aria-controls="<?php echo esc_attr($field . '-list'); ?>" />
                                            <label for="<?php echo esc_attr($field . '-some'); ?>"><?php esc_html_e('Only the ones I choose', 'typography-stylist'); ?></label>
                                        </span>
                                    </p>
                                    <ul class="typost-export-item-list" id="<?php echo esc_attr($field . '-list'); ?>" hidden>
                                        <?php foreach ($section['items'] as $item) : ?>
                                            <?php $item_field = $field . '-item-' . (int) $item['id']; ?>
                                            <li>
                                                <input type="checkbox" id="<?php echo esc_attr($item_field); ?>" class="typost-export-item" value="<?php echo (int) $item['id']; ?>" data-parent="<?php echo isset($item['parent']) ? (int) $item['parent'] : 0; ?>" data-name="<?php echo esc_attr($item['name']); ?>" />
                                                <label for="<?php echo esc_attr($item_field); ?>"><?php echo esc_html($item['name']); ?></label>
                                            </li>
                                        <?php endforeach; ?>
                                    </ul>
                                </fieldset>
                            <?php endif; ?>
                        </div>
                    <?php endforeach; ?>
                    <?php if ($can_import) : ?>
                        <p>
                            <input type="checkbox" id="typost-export-all-fonts" aria-describedby="typost-export-all-fonts-description" />
                            <label for="typost-export-all-fonts"><?php esc_html_e('All fonts on this site', 'typography-stylist'); ?></label>
                        </p>
                        <p class="description" id="typost-export-all-fonts-description">
                            <?php esc_html_e('Adds every Adobe Fonts project and font definition, also the ones no exported style uses, so the other site can add them. Fonts that the exported styles use are always in the file.', 'typography-stylist'); ?>
                        </p>
                    <?php endif; ?>
                </fieldset>
                <div id="typost-export-notes" class="typost-export-notes" role="status" aria-live="polite"></div>
                <div id="typost-export-error" class="typost-export-error" role="alert"></div>
                <p>
                    <button type="submit" class="button button-primary" id="typost-export-submit"><?php esc_html_e('Download export file', 'typography-stylist'); ?></button>
                </p>
            </form>
            <?php endif; ?>
        </section>

        <section class="typost-export-panel" aria-labelledby="typost-import-heading">
            <h3 id="typost-import-heading"><?php esc_html_e('Import', 'typography-stylist'); ?></h3>
            <?php if (!$can_import) : ?>
                <p><?php esc_html_e('Only administrators can import.', 'typography-stylist'); ?></p>
            <?php else : ?>
            <form id="typost-import-form" novalidate>
                <p><?php esc_html_e('Choose a file that Typography Stylist exported. You see what the file holds before anything is saved.', 'typography-stylist'); ?></p>
                <p>
                    <label for="typost-import-file"><?php esc_html_e('Export file', 'typography-stylist'); ?></label>
                    <input type="file" id="typost-import-file" accept=".json,application/json" />
                    <button type="submit" class="button" id="typost-import-preview-submit"><?php esc_html_e('Preview import', 'typography-stylist'); ?></button>
                </p>
                <div id="typost-import-error" class="typost-export-error" role="alert"></div>
            </form>
            <div id="typost-import-preview" class="typost-import-preview" hidden></div>
            <div id="typost-import-result" class="typost-import-result" hidden></div>
            <?php endif; ?>
        </section>
        <?php
    }
}

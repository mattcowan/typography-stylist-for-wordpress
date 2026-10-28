<?php
/**
 * Export and import (#205)
 *
 * One JSON file in sections. Each section (paragraph styles today; presets,
 * options and extension data later) registers through the
 * `typost_export_sections` filter with an export, a preview and an import
 * callback. Fonts are shared by every section, so they live at the top of
 * the file and are mapped once, before any section imports (see
 * Typost_Export_Fonts).
 *
 *     {
 *       "format": "typost-export",
 *       "version": 1,
 *       "plugin": "2.3.5",
 *       "exported": "2026-10-28",
 *       "fonts": { "f1": { "source": "adobe", ... } },
 *       "sections": { "paragraphStyles": [ ... ] }
 *     }
 *
 * Import runs in two passes: every section first checks the author's
 * choices with nothing written (a dry run), then fonts are added and the
 * sections write. A file a section rejects saves nothing.
 *
 * @since 2.3.5
 */

if (!defined('ABSPATH')) {
    exit;
}

class Typost_Export {

    /** @var string The file's `format` value */
    const FORMAT = 'typost-export';

    /** @var int The newest file version this release reads and writes */
    const VERSION = 1;

    /** @var int Largest file import reads, in bytes */
    const MAX_FILE_BYTES = 2097152;

    /**
     * Every `typost_*` option and transient that no section exports, and why.
     *
     * The export registry test (tests/Unit/ExportRegistryTest.php) reads
     * every name uninstall.php deletes and fails when one is neither listed
     * in a section's `options` nor here, so a new option cannot ship
     * without a decision about export. An option that a later section will
     * carry says so here until that section exists.
     *
     * @var array<string,string>
     */
    const NOT_EXPORTED = array(
        // Fonts travel as descriptors in the file's font map, never as rows.
        'typost_custom_fonts'                     => 'Uploaded kits: described in the font map; the files must already be on the target site.',
        'typost_adobe_fonts'                      => 'Described in the font map; import can add a project family from it.',
        'typost_manual_fonts'                     => 'Described in the font map; import can add a definition from it.',
        'typost_adopted_wp_fonts'                 => 'Described in the font map by Library slug; import adopts the family again.',
        'typost_font_replacements'                => 'Site-local font IDs; export follows it to name the replacement font.',
        'typost_paragraph_styles_next_id'         => 'ID counter; import moves it past the IDs it gives out.',
        // Planned for the options, presets and per-font settings sections (#205 step 2).
        'typost_presets'                          => 'Planned: presets section (#205 step 2).',
        'typost_font_feature_visibility'          => 'Planned: per-font settings, mapped through the font map (#205 step 2).',
        'typost_font_order'                       => 'Planned: per-font settings, mapped through the font map (#205 step 2).',
        'typost_variable_font_axes'               => 'Planned: per-font settings, mapped through the font map (#205 step 2).',
        'typost_variable_font_flags'              => 'Planned: per-font settings, mapped through the font map (#205 step 2).',
        'typost_show_clear_confirmation'          => 'Planned: options section (#205 step 2).',
        'typost_archive_full_content_check'       => 'Planned: options section (#205 step 2).',
        'typost_block_enter_line_break'           => 'Planned: options section (#205 step 2).',
        'typost_new_font_sizes_px'                => 'Planned: options section (#205 step 2).',
        'typost_auto_register_wp_fonts'           => 'Planned: options section (#205 step 2).',
        'typost_disable_accessibility_warning'    => 'Planned: options section (#205 step 2).',
        'typost_admin_color_scheme'               => 'Planned: options section (#205 step 2).',
        'typost_glyphs_toolbar_button'            => 'Planned: options section (#205 step 2).',
        'typost_ps_toolbar_button'                => 'Planned: options section (#205 step 2).',
        // State about this site or this server, not settings.
        'typost_htaccess_verified'                => 'One-time check of this server.',
        'typost_font_library_json_repaired'       => 'One-time repair of this site\'s Font Library posts.',
        'typost_glyphs_toolbar_button_default_on' => 'One-time switch that ran on this site (#322).',
        'typost_ps_toolbar_button_default_on'     => 'One-time switch that ran on this site (#322).',
        'typost_wp_library_notice_dismissed'      => 'A dismissed admin notice on this site.',
        'typost_font_face_version'                => 'Cache version of this site\'s font CSS.',
        'typost_rate_limit_window'                => 'User meta: REST rate limit counter.',
        // Options nothing reads.
        'typost_enable_aria_labels'               => 'Removed option; uninstall still deletes old values.',
        'typost_global_settings'                  => 'Registered but never read.',
        'typost_allow_variable_weights'           => 'Read-only back-compat flag with no admin control.',
        // Caches.
        'typost_combined_font_css'                => 'Cache.',
        'typost_admin_font_css'                   => 'Cache.',
        'typost_editor_font_css'                  => 'Cache.',
        'typost_block_font_css'                   => 'Cache.',
        'typost_paragraph_styles_cache'           => 'Cache.',
        'typost_paragraph_styles_css'             => 'Cache.',
        'typost_paragraph_styles_css_v2'          => 'Cache.',
        'typost_vf_axes_cache'                    => 'Cache.',
    );

    /** @var object Typost instance */
    private $typost;

    /**
     * @param object $typost Typost instance.
     */
    public function __construct($typost) {
        $this->typost = $typost;
    }

    // -------------------------------------------------------------------------
    // Sections
    // -------------------------------------------------------------------------

    /**
     * The registered sections, keyed by id, in file order.
     *
     * A section is an array:
     * - `id`         (string) Key in the file's `sections` object.
     * - `label`      (string) Shown in the export and import UI.
     * - `capability` (string) Needed to export it. Import always needs
     *                manage_options.
     * - `options`    (string[]) The `typost_*` options it carries. The
     *                export registry test reads this list.
     * - `export`     (callable) fn( Typost_Export_Fonts $fonts, array $args ):
     *                array{data: mixed, notes?: string[]}|WP_Error. Call
     *                $fonts->key_for_font_id() for every font the data names
     *                and write the key, never the ID.
     * - `preview`    (callable) fn( mixed $data, Typost_Export_Fonts $fonts ):
     *                array|WP_Error. What the import UI shows.
     * - `import`     (callable) fn( mixed $data, array $choices,
     *                Typost_Export_Fonts $fonts, bool $dry_run ): array|WP_Error.
     *                With $dry_run it must write nothing; a WP_Error stops
     *                the whole import. $fonts->import_font_id( $key ) gives
     *                the local font ID (0 = not on this site).
     * - `fontKeys`   (callable, optional) fn( mixed $data ): array<string,string[]>
     *                File font key => names of the items that use it, for
     *                the preview's "used by".
     * - `items`      (callable, optional) fn(): array{id, name, parent?}[].
     *                The things the export UI lets the author pick from
     *                (styles); the picked ids reach `export` as
     *                $args['items']. `parent` is the id the item needs
     *                with it (a style's Based On), so the UI can say it is
     *                added.
     * - `priority`   (int, optional) Import order, lower first. Default 50.
     *
     * @return array<string,array>
     */
    public function get_sections() {
        /**
         * Filters the sections an export file can carry (#205).
         *
         * @since 2.3.5
         * @param array[] $sections Section definitions, see Typost_Export::get_sections().
         */
        $sections = apply_filters('typost_export_sections', array());
        $out = array();
        foreach ((array) $sections as $section) {
            if (!is_array($section) || empty($section['id']) || !preg_match('/^[a-zA-Z][a-zA-Z0-9_]*$/', (string) $section['id'])) {
                continue;
            }
            if (empty($section['export']) || !is_callable($section['export']) || empty($section['preview']) || !is_callable($section['preview']) || empty($section['import']) || !is_callable($section['import'])) {
                continue;
            }
            $section['label'] = isset($section['label']) ? (string) $section['label'] : $section['id'];
            $section['capability'] = !empty($section['capability']) ? (string) $section['capability'] : 'manage_options';
            $section['options'] = isset($section['options']) ? array_values((array) $section['options']) : array();
            $section['priority'] = isset($section['priority']) ? (int) $section['priority'] : 50;
            $out[(string) $section['id']] = $section;
        }
        uasort($out, function ($a, $b) {
            return $a['priority'] - $b['priority'];
        });
        return $out;
    }

    // -------------------------------------------------------------------------
    // Export
    // -------------------------------------------------------------------------

    /**
     * Build an export file.
     *
     * @param array $args {
     *     @type string[] $sections    Section ids to export.
     *     @type bool     $allFonts    Add every font on this site, not only
     *                                 the ones the sections use (needs
     *                                 manage_options).
     *     @type array    $sectionArgs Per-section arguments, keyed by id
     *                                 (paragraphStyles: {styles: int[]}).
     * }
     * @return array{file: array, notes: string[]}|WP_Error
     */
    public function build_export($args) {
        $sections = $this->get_sections();
        $wanted = isset($args['sections']) ? array_map('strval', (array) $args['sections']) : array();
        $all_fonts = !empty($args['allFonts']);
        $section_args = isset($args['sectionArgs']) && is_array($args['sectionArgs']) ? $args['sectionArgs'] : array();

        if (!$wanted && !$all_fonts) {
            return new WP_Error('typost_export_empty', __('Choose what to export.', 'typography-stylist'), array('status' => 400));
        }
        if ($all_fonts && !current_user_can('manage_options')) {
            return new WP_Error('typost_export_forbidden', __('You are not allowed to export fonts.', 'typography-stylist'), array('status' => 403));
        }

        $fonts = new Typost_Export_Fonts($this->typost);
        $file_sections = array();
        $notes = array();
        foreach ($sections as $id => $section) {
            if (!in_array($id, $wanted, true)) {
                continue;
            }
            if (!current_user_can($section['capability'])) {
                return new WP_Error(
                    'typost_export_forbidden',
                    /* translators: %s: name of an export section, such as Paragraph styles */
                    sprintf(__('You are not allowed to export %s.', 'typography-stylist'), $section['label']),
                    array('status' => 403)
                );
            }
            $result = call_user_func($section['export'], $fonts, isset($section_args[$id]) && is_array($section_args[$id]) ? $section_args[$id] : array());
            if (is_wp_error($result)) {
                return $result;
            }
            $file_sections[$id] = isset($result['data']) ? $result['data'] : array();
            if (!empty($result['notes'])) {
                $notes = array_merge($notes, array_map('strval', (array) $result['notes']));
            }
        }
        foreach ($wanted as $id) {
            if (!isset($sections[$id])) {
                return new WP_Error('typost_export_unknown_section', __('The export asked for a section this site does not have.', 'typography-stylist'), array('status' => 400));
            }
        }
        if ($all_fonts) {
            $fonts->add_all_fonts();
        }

        $descriptors = $fonts->get_descriptors();
        return array(
            'file'  => array(
                'format'   => self::FORMAT,
                'version'  => self::VERSION,
                'plugin'   => defined('TYPOST_VERSION') ? TYPOST_VERSION : '',
                'exported' => gmdate('Y-m-d'),
                // An empty map must stay a JSON object, not [].
                'fonts'    => $descriptors ? $descriptors : new stdClass(),
                'sections' => $file_sections ? $file_sections : new stdClass(),
            ),
            'notes' => $notes,
        );
    }

    // -------------------------------------------------------------------------
    // Reading a file
    // -------------------------------------------------------------------------

    /**
     * Read and check an export file's text.
     *
     * Rejects text that is too large, not JSON, not an export file, or from
     * a newer version, each with a message the import UI shows as is.
     *
     * @param mixed $text File contents.
     * @return array|WP_Error {version, plugin, exported, fonts (sanitized
     *                        descriptors), sections (raw, per id)}
     */
    public static function parse_file($text) {
        if (!is_string($text) || '' === trim($text)) {
            return new WP_Error('typost_import_invalid_file', __('Choose an export file to import.', 'typography-stylist'), array('status' => 400));
        }
        if (strlen($text) > self::MAX_FILE_BYTES) {
            return new WP_Error('typost_import_invalid_file', __('This file is too large to be a Typography Stylist export file.', 'typography-stylist'), array('status' => 400));
        }
        // Remove a UTF-8 byte order mark an editor may have added.
        if (0 === strpos($text, "\xEF\xBB\xBF")) {
            $text = substr($text, 3);
        }
        $data = json_decode($text, true);
        if (!is_array($data) || JSON_ERROR_NONE !== json_last_error()) {
            return new WP_Error('typost_import_invalid_file', __('This file is not valid JSON, so it cannot be imported. Nothing was saved.', 'typography-stylist'), array('status' => 400));
        }
        if (!isset($data['format']) || self::FORMAT !== $data['format']) {
            return new WP_Error('typost_import_invalid_file', __('This file is not a Typography Stylist export file. Nothing was saved.', 'typography-stylist'), array('status' => 400));
        }
        $version = isset($data['version']) ? $data['version'] : null;
        if (!is_int($version) || $version < 1) {
            return new WP_Error('typost_import_invalid_file', __('This export file has no format version, so it cannot be read. Nothing was saved.', 'typography-stylist'), array('status' => 400));
        }
        if ($version > self::VERSION) {
            return new WP_Error(
                'typost_import_newer_version',
                sprintf(
                    /* translators: 1: version of the export file, 2: newest version this plugin reads */
                    __('This file was exported in format version %1$d, and this site reads up to version %2$d. Update Typography Stylist on this site, then import again. Nothing was saved.', 'typography-stylist'),
                    $version,
                    self::VERSION
                ),
                array('status' => 400)
            );
        }
        $fonts = Typost_Export_Fonts::read_file_fonts(isset($data['fonts']) ? $data['fonts'] : null);
        if (is_wp_error($fonts)) {
            return $fonts;
        }
        $sections = isset($data['sections']) ? $data['sections'] : array();
        if (!is_array($sections)) {
            return new WP_Error('typost_import_invalid_file', __('The sections in this file cannot be read. Nothing was saved.', 'typography-stylist'), array('status' => 400));
        }
        return array(
            'version'  => $version,
            'plugin'   => isset($data['plugin']) && is_scalar($data['plugin']) ? sanitize_text_field((string) $data['plugin']) : '',
            'exported' => isset($data['exported']) && is_scalar($data['exported']) ? sanitize_text_field((string) $data['exported']) : '',
            'fonts'    => $fonts,
            'sections' => $sections,
        );
    }

    // -------------------------------------------------------------------------
    // Preview and import
    // -------------------------------------------------------------------------

    /**
     * What the import UI shows before anything is saved.
     *
     * @param array $file parse_file() result.
     * @return array|WP_Error
     */
    public function preview($file) {
        $sections = $this->get_sections();
        $fonts = new Typost_Export_Fonts($this->typost);
        $font_rows = $fonts->preview($file['fonts']);
        // Sections preview against the default mapping (an ambiguous font
        // counts as not on this site until the author picks one).
        $fonts->plan_import_ids($fonts->default_choices($file['fonts']));

        $out_sections = array();
        $used_by = array();
        $unknown = array();
        foreach ($file['sections'] as $id => $data) {
            $id = (string) $id;
            if (!isset($sections[$id])) {
                $unknown[] = sanitize_text_field($id);
                continue;
            }
            $section = $sections[$id];
            $preview = call_user_func($section['preview'], $data, $fonts);
            if (is_wp_error($preview)) {
                return $preview;
            }
            $out_sections[$id] = array(
                'label'   => $section['label'],
                'preview' => $preview,
            );
            if (!empty($section['fontKeys']) && is_callable($section['fontKeys'])) {
                foreach ((array) call_user_func($section['fontKeys'], $data) as $key => $names) {
                    foreach ((array) $names as $name) {
                        $used_by[(string) $key][] = (string) $name;
                    }
                }
            }
        }
        foreach ($font_rows as &$row) {
            $row['usedBy'] = isset($used_by[$row['key']]) ? array_values(array_unique($used_by[$row['key']])) : array();
        }
        unset($row);

        return array(
            'version'         => $file['version'],
            'plugin'          => $file['plugin'],
            'exported'        => $file['exported'],
            'fonts'           => $font_rows,
            'sections'        => $out_sections ? $out_sections : new stdClass(),
            'unknownSections' => $unknown,
            'siteFonts'       => self::site_font_options($fonts),
        );
    }

    /**
     * Every font on this site as {value, label}, so the author can map a
     * font to one that matching did not offer.
     *
     * @param Typost_Export_Fonts $fonts Fonts helper.
     * @return array[]
     */
    private static function site_font_options($fonts) {
        $options = array();
        foreach ($fonts->get_local_fonts() as $font) {
            $options[] = array('value' => $font['value'], 'label' => $font['name']);
        }
        usort($options, function ($a, $b) {
            return strnatcasecmp($a['label'], $b['label']);
        });
        return $options;
    }

    /**
     * Import a file with the author's choices.
     *
     * @param array $file    parse_file() result.
     * @param array $choices {
     *     @type array    $fonts    File font key => {action: map|add|none, target?}.
     *     @type array    $sections Section id => that section's choices.
     *     @type string[] $include  Section ids to import (default: every
     *                              section this site knows).
     * }
     * @return array|WP_Error {fonts: {added, notFound}, sections: {id: result}, notImported: string[]}
     */
    public function import($file, $choices) {
        $sections = $this->get_sections();
        $choices = is_array($choices) ? $choices : array();
        $section_choices = isset($choices['sections']) && is_array($choices['sections']) ? $choices['sections'] : array();
        $include = isset($choices['include']) ? array_map('strval', (array) $choices['include']) : null;

        $fonts = new Typost_Export_Fonts($this->typost);
        $font_choices = $fonts->validate_choices($file['fonts'], isset($choices['fonts']) ? $choices['fonts'] : array());
        if (is_wp_error($font_choices)) {
            return $font_choices;
        }

        $run = array();
        $not_imported = array();
        foreach ($file['sections'] as $id => $data) {
            $id = (string) $id;
            if (!isset($sections[$id])) {
                $not_imported[] = sanitize_text_field($id);
            } elseif (null === $include || in_array($id, $include, true)) {
                $run[$id] = $data;
            }
        }
        // Import order follows the section priority, not the file order.
        $ordered = array();
        foreach ($sections as $id => $section) {
            if (array_key_exists($id, $run)) {
                $ordered[$id] = $run[$id];
            }
        }

        // Pass 1: every section checks its choices; nothing is written.
        $fonts->plan_import_ids($font_choices);
        foreach ($ordered as $id => $data) {
            $result = call_user_func($sections[$id]['import'], $data, isset($section_choices[$id]) ? $section_choices[$id] : array(), $fonts, true);
            if (is_wp_error($result)) {
                return $result;
            }
        }

        // Pass 2: fonts first, then each section writes.
        $font_result = $fonts->commit($file['fonts'], $font_choices);
        $results = array();
        foreach ($ordered as $id => $data) {
            $result = call_user_func($sections[$id]['import'], $data, isset($section_choices[$id]) ? $section_choices[$id] : array(), $fonts, false);
            if (is_wp_error($result)) {
                return $result;
            }
            $results[$id] = $result;
        }

        return array(
            'fonts'       => $font_result,
            'sections'    => $results ? $results : new stdClass(),
            'notImported' => $not_imported,
        );
    }

    // -------------------------------------------------------------------------
    // Admin tab
    // -------------------------------------------------------------------------

    /**
     * Add the Export & Import tab, before Help.
     *
     * @param array[] $tabs Tabs.
     * @return array[]
     */
    public function register_admin_tab($tabs) {
        $tabs = is_array($tabs) ? $tabs : array();
        $tabs[] = array('id' => 'export', 'label' => __('Export & Import', 'typography-stylist'), 'priority' => 90);
        return $tabs;
    }

    /**
     * Render the Export & Import tab.
     *
     * @param object $instance Typost instance.
     */
    public function render_admin_tab($instance) {
        $sections = array();
        foreach ($this->get_sections() as $id => $section) {
            if (!current_user_can($section['capability'])) {
                continue;
            }
            $items = array();
            if (!empty($section['items']) && is_callable($section['items'])) {
                $items = (array) call_user_func($section['items']);
            }
            $sections[$id] = array('label' => $section['label'], 'items' => $items);
        }
        require_once __DIR__ . '/admin-export-tab.php';
        typost_render_export_tab($sections, current_user_can('manage_options'));
    }

    /**
     * Enqueue the tab's script on the settings page.
     *
     * Hand-written ES5 with no build step, like editor-font-kits.js. Its
     * strings are a flat object of their own: WP_Scripts::localize()
     * decodes entities only in top-level values, so these arrive as plain
     * text and the script puts them in the page with textContent only.
     */
    public function enqueue_admin_assets() {
        wp_enqueue_script(
            'typost-admin-export',
            TYPOST_PLUGIN_URL . 'assets/js/admin-export.js',
            array('jquery', 'typost-admin'),
            TYPOST_VERSION,
            true
        );
        wp_localize_script('typost-admin-export', 'typostExportData', array(
            'restUrl' => rest_url('typost/v1/'),
            'nonce'   => wp_create_nonce('wp_rest'),
        ));
        wp_localize_script('typost-admin-export', 'typostExportL10n', self::script_strings());
    }

    /**
     * The tab script's strings.
     *
     * @return array<string,string>
     */
    public static function script_strings() {
        return array(
            /* translators: 1: name of the style added to the export, 2: name of the style based on it */
            'parentAdded'        => __('“%1$s” is added too, because “%2$s” is based on it.', 'typography-stylist'),
            'nothingChosen'      => __('Choose what to export.', 'typography-stylist'),
            'noItemsChosen'      => __('Choose at least one item, or choose “All”.', 'typography-stylist'),
            'exporting'          => __('Exporting…', 'typography-stylist'),
            'exported'           => __('The export file was downloaded.', 'typography-stylist'),
            'requestFailed'      => __('The request failed. Check your connection and try again.', 'typography-stylist'),
            'noFile'             => __('Choose an export file to import.', 'typography-stylist'),
            'fileUnreadable'     => __('This file cannot be read.', 'typography-stylist'),
            'previewing'         => __('Reading the file…', 'typography-stylist'),
            'previewHeading'     => __('What this file holds', 'typography-stylist'),
            /* translators: 1: date the file was exported, 2: plugin version that exported it */
            'fileInfo'           => __('Exported on %1$s by Typography Stylist %2$s. Nothing is saved until you choose Import.', 'typography-stylist'),
            /* translators: %s: comma-separated list of section names in the file */
            'unknownSections'    => __('This site cannot import these parts of the file, so they are left out: %s.', 'typography-stylist'),
            'fontsHeading'       => __('Fonts', 'typography-stylist'),
            'fontsIntro'         => __('Each font in the file, and the font on this site that the imported styles will use.', 'typography-stylist'),
            'colFont'            => __('Font in the file', 'typography-stylist'),
            'colUsedBy'          => __('Used by', 'typography-stylist'),
            'colOnSite'          => __('On this site', 'typography-stylist'),
            'statusFound'        => __('Found', 'typography-stylist'),
            'statusAmbiguous'    => __('More than one font matches. Choose one.', 'typography-stylist'),
            'statusAddable'      => __('Not on this site. It can be added from the file.', 'typography-stylist'),
            'statusNotFound'     => __('Not found. Upload the font first, or choose a font on this site.', 'typography-stylist'),
            'chooseFont'         => __('Choose a font…', 'typography-stylist'),
            'groupMatches'       => __('Matching fonts', 'typography-stylist'),
            'groupAllFonts'      => __('All fonts on this site', 'typography-stylist'),
            'addFont'            => __('Add it to this site', 'typography-stylist'),
            'noFont'             => __('None (use the theme font)', 'typography-stylist'),
            /* translators: %s: font name */
            'fontSelectLabel'    => __('Font on this site for “%s”', 'typography-stylist'),
            'notUsed'            => __('Not used by a style in the file', 'typography-stylist'),
            'includeSection'     => __('Import this part', 'typography-stylist'),
            'colName'            => __('Name in the file', 'typography-stylist'),
            'colBasedOn'         => __('Based on', 'typography-stylist'),
            'colAction'          => __('Import as', 'typography-stylist'),
            'existsAs'           => __('A style with this name exists.', 'typography-stylist'),
            /* translators: %s: comma-separated list of style names */
            'overwriteAffects'   => __('Overwriting it also changes the styles based on it: %s.', 'typography-stylist'),
            'actionAdd'          => __('Add', 'typography-stylist'),
            'actionSkip'         => __('Skip', 'typography-stylist'),
            'actionRename'       => __('Add with a new name', 'typography-stylist'),
            'actionOverwrite'    => __('Overwrite the style on this site', 'typography-stylist'),
            /* translators: %s: style name */
            'actionLabel'        => __('Import “%s” as', 'typography-stylist'),
            /* translators: %s: style name */
            'renameLabel'        => __('New name for “%s”', 'typography-stylist'),
            'warningsHeading'    => __('Check before you import', 'typography-stylist'),
            'import'             => __('Import', 'typography-stylist'),
            'cancel'             => __('Cancel', 'typography-stylist'),
            'importing'          => __('Importing…', 'typography-stylist'),
            /* translators: %s: font name */
            'errorChooseFont'    => __('Choose a font on this site for “%s”.', 'typography-stylist'),
            /* translators: %s: style name */
            'errorRenameEmpty'   => __('Enter a new name for “%s”.', 'typography-stylist'),
            /* translators: 1: style name, 2: the new name */
            'errorRenameTaken'   => __('“%2$s” is already used. Enter another name for “%1$s”.', 'typography-stylist'),
            'resultHeading'      => __('Import finished', 'typography-stylist'),
            'resultAdded'        => __('Added', 'typography-stylist'),
            'resultRenamed'      => __('Added with a new name', 'typography-stylist'),
            /* translators: 1: name in the file, 2: name on this site */
            'resultRenamedItem'  => __('“%1$s” as “%2$s”', 'typography-stylist'),
            'resultOverwritten'  => __('Overwritten', 'typography-stylist'),
            'resultSkipped'      => __('Skipped', 'typography-stylist'),
            'resultFontsAdded'   => __('Fonts added to this site', 'typography-stylist'),
            'resultFontsMissing' => __('Fonts not found (the styles use the theme font)', 'typography-stylist'),
            'resultNotImported'  => __('Parts of the file this site cannot import', 'typography-stylist'),
            'resultWarnings'     => __('Check these styles', 'typography-stylist'),
            'resultNothing'      => __('Nothing was imported.', 'typography-stylist'),
            'importAnother'      => __('Import another file', 'typography-stylist'),
        );
    }

    // -------------------------------------------------------------------------
    // REST
    // -------------------------------------------------------------------------

    /**
     * Register the export and import routes.
     */
    public function register_rest_routes() {
        register_rest_route('typost/v1', '/export', array(
            'methods'             => 'POST',
            'callback'            => array($this, 'rest_export'),
            // Per-section capabilities are checked in build_export().
            'permission_callback' => array($this->typost, 'check_permissions'),
        ));
        register_rest_route('typost/v1', '/import/preview', array(
            'methods'             => 'POST',
            'callback'            => array($this, 'rest_import_preview'),
            'permission_callback' => array($this, 'check_import_permissions'),
        ));
        register_rest_route('typost/v1', '/import', array(
            'methods'             => 'POST',
            'callback'            => array($this, 'rest_import'),
            'permission_callback' => array($this, 'check_import_permissions'),
        ));
    }

    /**
     * Import changes site-wide data (an overwritten style restyles every
     * post that uses it), so it needs manage_options.
     *
     * @param WP_REST_Request|null $request Request.
     * @return bool
     */
    public function check_import_permissions($request = null) {
        if (!current_user_can('manage_options')) {
            return false;
        }
        return $this->typost->check_permissions($request);
    }

    /**
     * POST /typost/v1/export — {sections, allFonts, sectionArgs}.
     *
     * POST, not GET: the arguments can list many styles.
     *
     * @param WP_REST_Request $request Request.
     * @return WP_REST_Response|WP_Error
     */
    public function rest_export($request) {
        $result = $this->build_export(array(
            'sections'    => $request->get_param('sections'),
            'allFonts'    => rest_sanitize_boolean($request->get_param('allFonts')),
            'sectionArgs' => $request->get_param('sectionArgs'),
        ));
        if (is_wp_error($result)) {
            return $result;
        }
        $result['filename'] = self::filename();
        return rest_ensure_response($result);
    }

    /**
     * POST /typost/v1/import/preview — {fileText}.
     *
     * @param WP_REST_Request $request Request.
     * @return WP_REST_Response|WP_Error
     */
    public function rest_import_preview($request) {
        $file = self::parse_file($request->get_param('fileText'));
        if (is_wp_error($file)) {
            return $file;
        }
        $preview = $this->preview($file);
        return is_wp_error($preview) ? $preview : rest_ensure_response($preview);
    }

    /**
     * POST /typost/v1/import — {fileText, choices}.
     *
     * The file is sent again rather than kept on the server between the
     * preview and the import: nothing is stored until the author imports.
     *
     * @param WP_REST_Request $request Request.
     * @return WP_REST_Response|WP_Error
     */
    public function rest_import($request) {
        $file = self::parse_file($request->get_param('fileText'));
        if (is_wp_error($file)) {
            return $file;
        }
        $result = $this->import($file, $request->get_param('choices'));
        return is_wp_error($result) ? $result : rest_ensure_response($result);
    }

    /**
     * Download name: site name and date, e.g. typography-my-site-2026-10-28.json.
     *
     * @return string
     */
    public static function filename() {
        $site = function_exists('get_bloginfo') ? sanitize_title(get_bloginfo('name')) : '';
        return 'typography-' . ('' !== $site ? $site . '-' : '') . gmdate('Y-m-d') . '.json';
    }
}

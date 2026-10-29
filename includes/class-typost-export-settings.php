<?php
/**
 * Presets, options and Feature Visibility in export files (#205 step 2)
 *
 * Registers three sections on `typost_export_sections`:
 *
 *     "presets":           [ { "key": "p1", "name": "Swash caps",
 *                              "features": ["swsh", "salt"], "description": "" } ],
 *     "options":           { "typost_block_enter_line_break": "1", ... },
 *     "featureVisibility": { "f1": { "disabledFeatures": ["ss15"] } }
 *
 * Option names are the same on every site, so they are the file's keys.
 * Feature Visibility is keyed by the file's font keys, never by a font ID.
 *
 * Their previews use the generic row form (see HOOKS.md, "Export
 * Sections"): every row offers its choices with labels from here, so the
 * import page needs no code of its own for them. A row whose `choice` is
 * '' must be answered before import.
 *
 * @since 2.3.5
 */

if (!defined('ABSPATH')) {
    exit;
}

final class Typost_Export_Settings {

    /** @var string Allowed file keys of presets */
    const KEY_PATTERN = '/^[a-z0-9_-]{1,40}$/i';

    /** @var string Option that holds the presets */
    const PRESETS_OPTION = 'typost_presets';

    /** @var string Option that holds Feature Visibility */
    const VISIBILITY_OPTION = 'typost_font_feature_visibility';

    /** @var object Typost instance (or a test double) */
    private $typost;

    /**
     * @param object $typost Typost instance.
     */
    public function __construct($typost) {
        $this->typost = $typost;
    }

    /**
     * Add the three sections to the export registry.
     *
     * Feature Visibility imports before the paragraph styles (priority 20),
     * so the styles' "hidden feature" warnings read the imported settings.
     *
     * @param array[] $sections Registered sections.
     * @return array[]
     */
    public function register_sections($sections) {
        $sections = is_array($sections) ? $sections : array();
        $sections[] = array(
            'id'         => 'featureVisibility',
            'label'      => __('Feature Visibility', 'typography-stylist'),
            'capability' => 'manage_options',
            'options'    => array(self::VISIBILITY_OPTION),
            'export'     => array($this, 'export_visibility'),
            'preview'    => array($this, 'preview_visibility'),
            'import'     => array($this, 'import_visibility'),
            'fontKeys'   => array($this, 'visibility_font_keys'),
            'priority'   => 10,
        );
        $sections[] = array(
            'id'         => 'presets',
            'label'      => __('Presets', 'typography-stylist'),
            'capability' => 'manage_options',
            'options'    => array(self::PRESETS_OPTION),
            'export'     => array($this, 'export_presets'),
            'preview'    => array($this, 'preview_presets'),
            'import'     => array($this, 'import_presets'),
            'priority'   => 30,
        );
        $sections[] = array(
            'id'         => 'options',
            'label'      => __('Options', 'typography-stylist'),
            'capability' => 'manage_options',
            'options'    => array_keys(Typost_Admin_Options::definitions($this->typost)),
            'export'     => array($this, 'export_options'),
            'preview'    => array($this, 'preview_options'),
            'import'     => array($this, 'import_options'),
            'priority'   => 40,
        );
        return $sections;
    }

    // -------------------------------------------------------------------------
    // Presets
    // -------------------------------------------------------------------------

    /**
     * Write the stored presets. Nothing is stored until an author saves a
     * preset; the built-in list is empty, so there is nothing else to carry.
     *
     * @param Typost_Export_Fonts $fonts Fonts helper (presets name no fonts).
     * @param array               $args  Not used.
     * @return array{data: array}
     */
    public function export_presets($fonts, $args) {
        $out = array();
        foreach ((array) get_option(self::PRESETS_OPTION, array()) as $preset) {
            if (!is_array($preset) || empty($preset['name']) || empty($preset['features']) || !is_array($preset['features'])) {
                continue;
            }
            $out[] = array(
                'key'         => 'p' . (count($out) + 1),
                'name'        => (string) $preset['name'],
                'features'    => array_values(array_map('strval', $preset['features'])),
                'description' => isset($preset['description']) ? (string) $preset['description'] : '',
            );
        }
        return array('data' => $out);
    }

    /**
     * Read and check the presets in the file.
     *
     * Features this site does not know are dropped, as the preset save
     * route would reject them; a preset left with none cannot be imported.
     *
     * @param mixed $data Section data.
     * @return array|WP_Error {items: [{key, name, features, description}], dropped: string[]}
     */
    private function read_presets($data) {
        $invalid = new WP_Error('typost_import_invalid_file', __('The presets in this file cannot be read. Nothing was saved.', 'typography-stylist'), array('status' => 400));
        if (!is_array($data) || array_values($data) !== $data) {
            return $invalid;
        }
        $known = $this->feature_ids();
        $items = array();
        $dropped = array();
        foreach ($data as $raw) {
            if (!is_array($raw) || !isset($raw['key']) || !is_string($raw['key']) || !preg_match(self::KEY_PATTERN, $raw['key']) || isset($items[$raw['key']])) {
                return $invalid;
            }
            $name = isset($raw['name']) && is_scalar($raw['name']) ? trim(sanitize_text_field((string) $raw['name'])) : '';
            if ('' === $name || !isset($raw['features']) || !is_array($raw['features'])) {
                return $invalid;
            }
            $features = array();
            foreach ($raw['features'] as $feature) {
                $feature = is_scalar($feature) ? sanitize_key((string) $feature) : '';
                if ('' !== $feature && in_array($feature, $known, true) && !in_array($feature, $features, true)) {
                    $features[] = $feature;
                }
            }
            if (!$features) {
                $dropped[] = $name;
                continue;
            }
            $items[$raw['key']] = array(
                'key'         => $raw['key'],
                'name'        => $name,
                'features'    => $features,
                'description' => isset($raw['description']) && is_scalar($raw['description']) ? sanitize_text_field((string) $raw['description']) : '',
            );
        }
        return array('items' => array_values($items), 'dropped' => $dropped);
    }

    /**
     * Each preset with its choices. A name that exists starts as skip, a
     * name an earlier preset in the file uses starts as "add as Name (2)",
     * anything else is added.
     *
     * @param mixed               $data  Section data.
     * @param Typost_Export_Fonts $fonts Fonts helper.
     * @return array|WP_Error
     */
    public function preview_presets($data, $fonts) {
        $read = $this->read_presets($data);
        if (is_wp_error($read)) {
            return $read;
        }
        $defaults = $this->preset_defaults($read['items']);
        $rows = array();
        foreach ($read['items'] as $item) {
            $default = $defaults[$item['key']];
            $rename = array(
                'value' => 'rename',
                /* translators: %s: a preset name that is free on this site, such as "Swash caps (2)" */
                'label' => sprintf(__('Add as “%s”', 'typography-stylist'), $default['suggestedName']),
            );
            if ($default['exists']) {
                $choices = array(
                    array('value' => 'skip', 'label' => __('Skip', 'typography-stylist')),
                    $rename,
                    array('value' => 'overwrite', 'label' => __('Overwrite the preset on this site', 'typography-stylist')),
                );
            } elseif ('rename' === $default['action']) {
                $choices = array($rename, array('value' => 'skip', 'label' => __('Skip', 'typography-stylist')));
            } else {
                $choices = array(
                    array('value' => 'add', 'label' => __('Add', 'typography-stylist')),
                    array('value' => 'skip', 'label' => __('Skip', 'typography-stylist')),
                );
            }
            $rows[] = array(
                'key'     => $item['key'],
                'name'    => $item['name'],
                'detail'  => implode(', ', $item['features']),
                'note'    => $default['exists'] ? __('A preset with this name exists.', 'typography-stylist') : '',
                'choices' => $choices,
                'choice'  => $default['action'],
            );
        }
        return array('rows' => $rows, 'notes' => $this->dropped_presets_notes($read['dropped']));
    }

    /**
     * The choice each preset starts with, and the free name a rename uses.
     *
     * Suggestions avoid every name in the file, not only the ones before
     * them, so a later preset whose own name is free still starts as add
     * ("Caps", "Caps", "Caps (2)" gives add, "Caps (3)", add). An added
     * preset offers no rename, so its suggestion is its own name.
     *
     * @param array[] $items read_presets() items.
     * @return array<string,array> Key => {action, exists, suggestedName}.
     */
    private function preset_defaults($items) {
        $existing = array();
        foreach ($this->stored_presets() as $preset) {
            $existing[self::lower($preset['name'])] = true;
        }
        $taken = $existing;
        foreach ($items as $item) {
            $taken[self::lower($item['name'])] = true;
        }
        $in_file = array();
        $out = array();
        foreach ($items as $item) {
            $lower = self::lower($item['name']);
            if (isset($existing[$lower]) || isset($in_file[$lower])) {
                $action = isset($existing[$lower]) ? 'skip' : 'rename';
                $suggested = self::unique_name($item['name'], $taken);
                $taken[self::lower($suggested)] = true;
            } else {
                $action = 'add';
                $suggested = $item['name'];
            }
            $in_file[$lower] = true;
            $out[$item['key']] = array('action' => $action, 'exists' => isset($existing[$lower]), 'suggestedName' => $suggested);
        }
        return $out;
    }

    /**
     * Import the presets with the author's choices.
     *
     * @param mixed               $data    Section data.
     * @param mixed               $choices Key => add|skip|rename|overwrite.
     * @param Typost_Export_Fonts $fonts   Fonts helper.
     * @param bool                $dry_run Check only.
     * @return array|WP_Error {groups, warnings}
     */
    public function import_presets($data, $choices, $fonts, $dry_run) {
        $read = $this->read_presets($data);
        if (is_wp_error($read)) {
            return $read;
        }
        $choices = is_array($choices) ? $choices : array();
        $defaults = $this->preset_defaults($read['items']);
        $presets = $this->stored_presets();
        $by_name = array();
        $ids = array();
        foreach ($presets as $i => $preset) {
            $by_name[self::lower($preset['name'])] = $i;
            $ids[(string) $preset['id']] = true;
        }

        $added = array();
        $renamed = array();
        $overwritten = array();
        $skipped = array();
        $overwrite_done = array();
        foreach ($read['items'] as $item) {
            $default = $defaults[$item['key']];
            $action = isset($choices[$item['key']]) && is_string($choices[$item['key']]) ? $choices[$item['key']] : $default['action'];
            $lower = self::lower($item['name']);
            $record = array(
                'name'        => $item['name'],
                'features'    => $item['features'],
                'description' => $item['description'],
            );
            if ('skip' === $action) {
                $skipped[] = $item['name'];
            } elseif ('overwrite' === $action) {
                if (!isset($by_name[$lower]) || isset($overwrite_done[$lower])) {
                    return self::preset_error($item['name'], __('There is no preset with this name to overwrite.', 'typography-stylist'));
                }
                $overwrite_done[$lower] = true;
                $index = $by_name[$lower];
                $presets[$index] = array('id' => $presets[$index]['id'], 'name' => $presets[$index]['name']) + $record;
                $overwritten[] = $presets[$index]['name'];
            } elseif ('add' === $action || 'rename' === $action) {
                $name = 'rename' === $action ? $default['suggestedName'] : $item['name'];
                if (isset($by_name[self::lower($name)])) {
                    return self::preset_error(
                        $item['name'],
                        /* translators: %s: preset name */
                        sprintf(__('A preset named “%s” already exists. Skip this preset, add it with another name, or overwrite the preset on this site.', 'typography-stylist'), $name)
                    );
                }
                $record['name'] = $name;
                $id = self::unique_id('preset-' . sanitize_title($name), $ids);
                $ids[$id] = true;
                $presets[] = array('id' => $id) + $record;
                $by_name[self::lower($name)] = count($presets) - 1;
                if ('rename' === $action) {
                    /* translators: 1: name in the file, 2: name on this site */
                    $renamed[] = sprintf(__('“%1$s” as “%2$s”', 'typography-stylist'), $item['name'], $name);
                } else {
                    $added[] = $name;
                }
            } else {
                return self::preset_error($item['name'], __('The choice for this preset is not valid.', 'typography-stylist'));
            }
        }

        if (!$dry_run && ($added || $renamed || $overwritten)) {
            update_option(self::PRESETS_OPTION, array_values($presets));
            $this->clear_cache();
        }
        return array(
            'groups'   => array_values(array_filter(array(
                self::group(__('Presets added', 'typography-stylist'), array_merge($added, $renamed)),
                self::group(__('Presets overwritten', 'typography-stylist'), $overwritten),
                self::group(__('Presets skipped', 'typography-stylist'), $skipped),
            ))),
            'warnings' => $this->dropped_presets_notes($read['dropped']),
        );
    }

    /**
     * The stored presets that have an ID and a name.
     *
     * @return array[]
     */
    private function stored_presets() {
        $out = array();
        foreach ((array) get_option(self::PRESETS_OPTION, array()) as $preset) {
            if (is_array($preset) && isset($preset['id'], $preset['name'])) {
                $out[] = $preset;
            }
        }
        return $out;
    }

    /**
     * Feature codes this site knows.
     *
     * @return string[]
     */
    private function feature_ids() {
        if (!method_exists($this->typost, 'get_available_features')) {
            return array();
        }
        return array_values(array_map('strval', array_column((array) $this->typost->get_available_features(), 'id')));
    }

    /**
     * @param string[] $names Presets with no feature this site knows.
     * @return string[]
     */
    private function dropped_presets_notes($names) {
        if (!$names) {
            return array();
        }
        /* translators: %s: comma-separated list of preset names */
        return array(sprintf(__('These presets use only OpenType features this site does not know, so they are not imported: %s.', 'typography-stylist'), implode(', ', $names)));
    }

    /**
     * @param string $name    Preset name.
     * @param string $message Reason.
     * @return WP_Error
     */
    private static function preset_error($name, $message) {
        return new WP_Error(
            'typost_import_preset_choice',
            /* translators: 1: preset name, 2: why it cannot be imported */
            sprintf(__('“%1$s”: %2$s Nothing was saved.', 'typography-stylist'), $name, $message),
            array('status' => 400)
        );
    }

    // -------------------------------------------------------------------------
    // Options
    // -------------------------------------------------------------------------

    /**
     * Write every option the Options and Accessibility tabs show, with the
     * value it has on this site.
     *
     * @param Typost_Export_Fonts $fonts Fonts helper (options name no fonts).
     * @param array               $args  Not used.
     * @return array{data: array|stdClass}
     */
    public function export_options($fonts, $args) {
        $out = array();
        foreach (Typost_Admin_Options::definitions($this->typost) as $name => $definition) {
            $out[$name] = Typost_Admin_Options::current($name, $definition);
        }
        return array('data' => $out ? $out : new stdClass());
    }

    /**
     * Compare the file's options with this site's.
     *
     * @param mixed $data Section data.
     * @return array|WP_Error {differ: [{name, label, current, incoming}], same: int, unknown: string[]}
     */
    private function compare_options($data) {
        if (!is_array($data) || ($data && array_values($data) === $data)) {
            return new WP_Error('typost_import_invalid_file', __('The options in this file cannot be read. Nothing was saved.', 'typography-stylist'), array('status' => 400));
        }
        $definitions = Typost_Admin_Options::definitions($this->typost);
        $out = array('differ' => array(), 'same' => 0, 'unknown' => array());
        foreach ($data as $name => $value) {
            $name = (string) $name;
            if (!isset($definitions[$name])) {
                $out['unknown'][] = sanitize_text_field($name);
                continue;
            }
            $incoming = Typost_Admin_Options::sanitize($name, $value);
            $current = Typost_Admin_Options::current($name, $definitions[$name]);
            if ($incoming === $current) {
                $out['same']++;
                continue;
            }
            $out['differ'][] = array(
                'name'       => $name,
                'definition' => $definitions[$name],
                'current'    => $current,
                'incoming'   => $incoming,
            );
        }
        return $out;
    }

    /**
     * One row per option whose value differs here. The author must choose
     * for each one: there is no default.
     *
     * @param mixed               $data  Section data.
     * @param Typost_Export_Fonts $fonts Fonts helper.
     * @return array|WP_Error
     */
    public function preview_options($data, $fonts) {
        $compare = $this->compare_options($data);
        if (is_wp_error($compare)) {
            return $compare;
        }
        $rows = array();
        foreach ($compare['differ'] as $option) {
            $rows[] = array(
                'key'      => $option['name'],
                'name'     => $option['definition']['label'],
                'current'  => Typost_Admin_Options::display($option['current'], $option['definition']),
                'incoming' => Typost_Admin_Options::display($option['incoming'], $option['definition']),
                'choices'  => array(
                    array('value' => 'keep', 'label' => __('Keep the value on this site', 'typography-stylist')),
                    array('value' => 'apply', 'label' => __('Use the value in the file', 'typography-stylist')),
                ),
                'choice'   => '',
            );
        }
        $notes = array();
        if (!$rows) {
            $notes[] = __('Every option in the file has the same value on this site.', 'typography-stylist');
        } elseif ($compare['same']) {
            /* translators: %d: number of options */
            $notes[] = sprintf(_n('%d other option has the same value on this site.', '%d other options have the same value on this site.', $compare['same'], 'typography-stylist'), $compare['same']);
        }
        if ($compare['unknown']) {
            /* translators: %s: comma-separated list of option names */
            $notes[] = sprintf(__('This site does not have these options, so they are left out: %s.', 'typography-stylist'), implode(', ', $compare['unknown']));
        }
        return array('rows' => $rows, 'notes' => $notes);
    }

    /**
     * Set the options the author chose "use the value in the file" for.
     *
     * Every option that differs needs a choice: an import that leaves one
     * out is refused, so nothing changes by accident.
     *
     * @param mixed               $data    Section data.
     * @param mixed               $choices Option name => keep|apply.
     * @param Typost_Export_Fonts $fonts   Fonts helper.
     * @param bool                $dry_run Check only.
     * @return array|WP_Error {groups}
     */
    public function import_options($data, $choices, $fonts, $dry_run) {
        $compare = $this->compare_options($data);
        if (is_wp_error($compare)) {
            return $compare;
        }
        $choices = is_array($choices) ? $choices : array();
        $changed = array();
        $kept = array();
        foreach ($compare['differ'] as $option) {
            $choice = isset($choices[$option['name']]) && is_string($choices[$option['name']]) ? $choices[$option['name']] : '';
            if ('apply' === $choice) {
                $changed[$option['name']] = $option;
            } elseif ('keep' === $choice) {
                $kept[] = $option['definition']['label'];
            } else {
                return new WP_Error(
                    'typost_import_option_choice',
                    /* translators: %s: option label */
                    sprintf(__('Choose whether to keep the value on this site or use the value in the file for “%s”. Nothing was saved.', 'typography-stylist'), $option['definition']['label']),
                    array('status' => 400, 'option' => $option['name'])
                );
            }
        }

        $changed_labels = array();
        foreach ($changed as $name => $option) {
            if (!$dry_run) {
                update_option($name, $option['incoming']);
            }
            /* translators: 1: option label, 2: its new value */
            $changed_labels[] = sprintf(__('%1$s: %2$s', 'typography-stylist'), $option['definition']['label'], Typost_Admin_Options::display($option['incoming'], $option['definition']));
        }
        if (!$dry_run && $changed) {
            $this->clear_cache();
        }
        return array(
            'groups' => array_values(array_filter(array(
                self::group(__('Options changed', 'typography-stylist'), $changed_labels),
                self::group(__('Options kept', 'typography-stylist'), $kept),
            ))),
        );
    }

    // -------------------------------------------------------------------------
    // Feature Visibility
    // -------------------------------------------------------------------------

    /**
     * Write the hidden features of every font that hides any, keyed by the
     * file's font keys.
     *
     * @param Typost_Export_Fonts $fonts Fonts helper.
     * @param array               $args  Not used.
     * @return array{data: array|stdClass}
     */
    public function export_visibility($fonts, $args) {
        // Deleting a font leaves its entry behind, and key_for_font_id()
        // follows the replacement chain, so a deleted font and its
        // replacement name the same key. The replacement's own entry wins,
        // also an empty one (it hides nothing on purpose); a deleted font's
        // entry is used only when the replacement has none.
        $entries = (array) get_option(self::VISIBILITY_OPTION, array());
        $out = array();
        foreach ($entries as $font_id => $entry) {
            $font_id = absint($font_id);
            $features = self::disabled_features($entry);
            if (!$features) {
                continue;
            }
            $resolved = $fonts->resolve_font_id($font_id);
            if ($resolved !== $font_id && isset($entries[$resolved])) {
                continue;
            }
            $key = $fonts->key_for_font_id($font_id);
            if (null !== $key && !isset($out[$key])) {
                $out[$key] = array('disabledFeatures' => $features);
            }
        }
        return array('data' => $out ? $out : new stdClass());
    }

    /**
     * Read and check the section: font key => sanitized feature codes.
     *
     * @param mixed $data Section data.
     * @return array<string,string[]>|WP_Error
     */
    private function read_visibility($data) {
        if (!is_array($data) || ($data && array_values($data) === $data)) {
            return new WP_Error('typost_import_invalid_file', __('The Feature Visibility settings in this file cannot be read. Nothing was saved.', 'typography-stylist'), array('status' => 400));
        }
        $known = $this->feature_ids();
        $out = array();
        foreach ($data as $key => $entry) {
            $features = array();
            foreach (is_array($entry) && isset($entry['disabledFeatures']) && is_array($entry['disabledFeatures']) ? $entry['disabledFeatures'] : array() as $feature) {
                $feature = is_scalar($feature) ? sanitize_key((string) $feature) : '';
                if (in_array($feature, $known, true) && !in_array($feature, $features, true)) {
                    $features[] = $feature;
                }
            }
            if ($features) {
                $out[(string) $key] = $features;
            }
        }
        return $out;
    }

    /**
     * @param mixed $data Section data.
     * @return array<string,string[]> File font key => [section label].
     */
    public function visibility_font_keys($data) {
        $read = $this->read_visibility($data);
        if (is_wp_error($read)) {
            return array();
        }
        return array_fill_keys(array_keys($read), array(__('Feature Visibility', 'typography-stylist')));
    }

    /**
     * One row per font. It starts on "use the file's settings" unless the
     * font it maps to hides features on this site already; then it starts
     * on "keep".
     *
     * @param mixed               $data  Section data.
     * @param Typost_Export_Fonts $fonts Fonts helper (default mapping).
     * @return array|WP_Error
     */
    public function preview_visibility($data, $fonts) {
        $read = $this->read_visibility($data);
        if (is_wp_error($read)) {
            return $read;
        }
        $visibility = (array) get_option(self::VISIBILITY_OPTION, array());
        $rows = array();
        foreach ($read as $key => $features) {
            // A key the file's font list does not have (a hand-edited
            // file) has no font row to map, so it is left out.
            if ('' === $fonts->file_font_name($key)) {
                continue;
            }
            $font_id = $fonts->import_font_id($key);
            $current = $font_id && isset($visibility[$font_id]) ? self::disabled_features($visibility[$font_id]) : array();
            $rows[] = self::font_settings_row(
                $key,
                $fonts,
                $current ? implode(', ', $current) : __('No features hidden', 'typography-stylist'),
                implode(', ', $features),
                (bool) $current
            );
        }
        return array('rows' => $rows);
    }

    /**
     * Save the file's hidden features for each font the author chose.
     *
     * @param mixed               $data    Section data.
     * @param mixed               $choices Font key => apply|keep.
     * @param Typost_Export_Fonts $fonts   Fonts helper.
     * @param bool                $dry_run Check only.
     * @return array|WP_Error {groups}
     */
    public function import_visibility($data, $choices, $fonts, $dry_run) {
        $read = $this->read_visibility($data);
        if (is_wp_error($read)) {
            return $read;
        }
        $choices = is_array($choices) ? $choices : array();
        $visibility = (array) get_option(self::VISIBILITY_OPTION, array());
        $applied = array();
        $kept = array();
        $missing = array();
        foreach ($read as $key => $features) {
            $name = $fonts->file_font_name($key);
            if ('' === $name) {
                continue; // Not in the file's font list, as in the preview.
            }
            $font_id = $fonts->import_font_id($key);
            $has_own = $font_id && isset($visibility[$font_id]) && self::disabled_features($visibility[$font_id]);
            $choice = self::font_settings_choice($choices, $key, $has_own);
            if (is_wp_error($choice)) {
                return $choice;
            }
            if (!$font_id) {
                $missing[] = $name;
            } elseif ('keep' === $choice) {
                $kept[] = $name;
            } else {
                $visibility[$font_id] = array('disabled_features' => $features);
                $applied[] = $name;
            }
        }
        if (!$dry_run && $applied) {
            update_option(self::VISIBILITY_OPTION, $visibility);
            // Also drops the editor data, which carries Feature Visibility.
            $this->clear_cache();
        }
        return array(
            'groups' => self::font_settings_groups(__('Feature Visibility', 'typography-stylist'), $applied, $kept, $missing),
        );
    }

    /**
     * @param mixed $entry Stored Feature Visibility entry.
     * @return string[]
     */
    private static function disabled_features($entry) {
        if (!is_array($entry) || !isset($entry['disabled_features']) || !is_array($entry['disabled_features'])) {
            return array();
        }
        return array_values(array_map('strval', $entry['disabled_features']));
    }

    // -------------------------------------------------------------------------
    // Shared by the per-font settings sections
    // -------------------------------------------------------------------------

    /**
     * A preview row for one font's settings, in the generic row form.
     *
     * Also used by the Variable Fonts module, so both per-font sections ask
     * the same question with the same words.
     *
     * @param string              $key      File font key.
     * @param Typost_Export_Fonts $fonts    Fonts helper (default mapping).
     * @param string              $current  The settings of the font on this site, as text.
     * @param string              $incoming The file's settings, as text.
     * @param bool                $has_own  Whether that font has settings of its own here.
     * @return array
     */
    public static function font_settings_row($key, $fonts, $current, $incoming, $has_own) {
        $font_id = $fonts->import_font_id($key);
        $name = $fonts->file_font_name($key);
        return array(
            'key'      => (string) $key,
            'name'     => '' !== $name ? $name : (string) $key,
            'note'     => $font_id ? '' : __('This font is not on this site yet. Its settings are imported only if you choose a font for it above.', 'typography-stylist'),
            'current'  => $font_id ? $current : '—',
            'incoming' => $incoming,
            'choices'  => array(
                array('value' => 'apply', 'label' => __('Use the settings in the file', 'typography-stylist')),
                array('value' => 'keep', 'label' => __('Keep the settings on this site', 'typography-stylist')),
            ),
            'choice'   => $has_own ? 'keep' : 'apply',
        );
    }

    /**
     * The author's choice for a font's settings, or the default: keep when
     * the font it maps to has settings of its own here, else apply.
     *
     * @param array  $choices Font key => apply|keep.
     * @param string $key     File font key.
     * @param bool   $has_own Whether the mapped font has settings here.
     * @return string|WP_Error
     */
    public static function font_settings_choice($choices, $key, $has_own) {
        if (!isset($choices[$key])) {
            return $has_own ? 'keep' : 'apply';
        }
        if ('apply' === $choices[$key] || 'keep' === $choices[$key]) {
            return $choices[$key];
        }
        return new WP_Error('typost_import_font_settings_choice', __('A font settings choice in the request is not valid. Nothing was saved.', 'typography-stylist'), array('status' => 400));
    }

    /**
     * The result groups of a per-font settings section.
     *
     * @param string   $label   Section label.
     * @param string[] $applied Fonts that got the file's settings.
     * @param string[] $kept    Fonts that kept their own.
     * @param string[] $missing Fonts not on this site.
     * @return array[]
     */
    public static function font_settings_groups($label, $applied, $kept, $missing) {
        return array_values(array_filter(array(
            /* translators: %s: name of a per-font setting, such as Feature Visibility */
            self::group(sprintf(__('%s: settings imported', 'typography-stylist'), $label), $applied),
            /* translators: %s: name of a per-font setting, such as Feature Visibility */
            self::group(sprintf(__('%s: settings kept', 'typography-stylist'), $label), $kept),
            /* translators: %s: name of a per-font setting, such as Feature Visibility */
            self::group(sprintf(__('%s: not imported, because the font is not on this site', 'typography-stylist'), $label), $missing),
        )));
    }

    /**
     * A result group, or null when it has no items.
     *
     * @param string   $heading Heading.
     * @param string[] $items   Items.
     * @return array|null
     */
    private static function group($heading, $items) {
        return $items ? array('heading' => $heading, 'items' => array_values($items)) : null;
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /**
     * Clear the plugin's caches after a write, as the save routes do.
     *
     * is_callable(), not method_exists(): the second is also true for a
     * private method, and calling one from here is a fatal error.
     */
    private function clear_cache() {
        if (is_callable(array($this->typost, 'clear_caches'))) {
            $this->typost->clear_caches();
        }
    }

    /**
     * A free name, "Name (2)", "Name (3)", ... when it is taken.
     *
     * @param string             $name  Name.
     * @param array<string,bool> $taken Lowercased names in use.
     * @return string
     */
    private static function unique_name($name, $taken) {
        if (!isset($taken[self::lower($name)])) {
            return $name;
        }
        for ($n = 2; ; $n++) {
            $candidate = $name . ' (' . $n . ')';
            if (!isset($taken[self::lower($candidate)])) {
                return $candidate;
            }
        }
    }

    /**
     * A preset ID that is free, with "-2", "-3", ... when it is taken.
     *
     * @param string             $base Base ID.
     * @param array<string,bool> $ids  IDs in use.
     * @return string
     */
    private static function unique_id($base, $ids) {
        $base = sanitize_key($base);
        if ('' === $base || 'preset-' === $base) {
            $base = 'preset';
        }
        if (!isset($ids[$base])) {
            return $base;
        }
        for ($n = 2; ; $n++) {
            if (!isset($ids[$base . '-' . $n])) {
                return $base . '-' . $n;
            }
        }
    }

    /**
     * @param string $name Name.
     * @return string
     */
    private static function lower($name) {
        $name = trim((string) $name);
        return function_exists('mb_strtolower') ? mb_strtolower($name, 'UTF-8') : strtolower($name);
    }
}

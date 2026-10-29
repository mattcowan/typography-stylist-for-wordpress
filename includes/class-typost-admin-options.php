<?php
/**
 * The Options and Accessibility tab settings, in one place (#205)
 *
 * Every path that writes one of these options sanitizes through
 * sanitize(): the REST handlers of both tabs, their no-JavaScript POST
 * fallback, and import. A value from any of them is stored the same way,
 * so the paths cannot drift.
 *
 * @since 2.3.5
 */

if (!defined('ABSPATH')) {
    exit;
}

final class Typost_Admin_Options {

    /** @var string[] Values the admin color scheme accepts */
    const COLOR_SCHEMES = array('default', 'admin-colors', 'alice-blue', 'dark', 'high-contrast');

    /** @var string Option that holds the admin color scheme */
    const COLOR_SCHEME = 'typost_admin_color_scheme';

    /**
     * The settings, keyed by option name.
     *
     * Each is {label, type: bool|scheme, default}. Labels are the ones the
     * tabs show next to the control. Extension checkboxes registered with
     * `typost_admin_options_checkboxes` are included; an extension can give
     * them a label and a default with `typost_export_option_details`.
     *
     * @param object|null $typost Typost instance (or a double). Without it,
     *                            only the core options are listed.
     * @return array<string,array>
     */
    public static function definitions($typost = null) {
        $out = array(
            self::COLOR_SCHEME                     => array(
                'label'   => __('Admin Color Scheme', 'typography-stylist'),
                'type'    => 'scheme',
                'default' => 'alice-blue',
            ),
            'typost_show_clear_confirmation'       => array(
                'label'   => __('Show confirmation when clearing typography features', 'typography-stylist'),
                'type'    => 'bool',
                'default' => true,
            ),
            'typost_block_enter_line_break'        => array(
                'label'   => __('Enter adds a line break inside the block', 'typography-stylist'),
                'type'    => 'bool',
                'default' => true,
            ),
            'typost_new_font_sizes_px'             => array(
                'label'   => __('Write new font sizes in px', 'typography-stylist'),
                'type'    => 'bool',
                'default' => false,
            ),
            'typost_archive_full_content_check'    => array(
                'label'   => __('Check full post content on archive pages (recommended)', 'typography-stylist'),
                'type'    => 'bool',
                'default' => true,
            ),
            'typost_auto_register_wp_fonts'        => array(
                'label'   => __('Automatically register newly uploaded fonts in the WordPress Font Library (recommended)', 'typography-stylist'),
                'type'    => 'bool',
                'default' => true,
            ),
            'typost_disable_accessibility_warning' => array(
                'label'   => __('Skip the warning when applying features to partial words', 'typography-stylist'),
                'type'    => 'bool',
                'default' => false,
            ),
        );

        // The Font Library setting exists only where the Library does: the
        // tab shows no control for it, so import must not set it either.
        if ($typost && method_exists($typost, 'font_library_bridge') && !$typost->font_library_bridge()->is_available()) {
            unset($out['typost_auto_register_wp_fonts']);
        }

        if ($typost && method_exists($typost, 'get_extension_option_checkboxes')) {
            /**
             * Filters the label and default of extension checkbox options in
             * export files (#205).
             *
             * Options registered with `typost_admin_options_checkboxes` are
             * exported with the Options section. Without an entry here, the
             * import preview names one by its option name and treats a value
             * that was never saved as off.
             *
             * @since 2.3.5
             * @param array $details Option name => {label, default (bool)}.
             */
            $details = apply_filters('typost_export_option_details', array());
            $details = is_array($details) ? $details : array();
            foreach ($typost->get_extension_option_checkboxes() as $name) {
                if (isset($out[$name])) {
                    continue;
                }
                $detail = isset($details[$name]) && is_array($details[$name]) ? $details[$name] : array();
                $out[$name] = array(
                    'label'   => isset($detail['label']) && '' !== (string) $detail['label'] ? (string) $detail['label'] : $name,
                    'type'    => 'bool',
                    'default' => !empty($detail['default']),
                );
            }
        }
        return $out;
    }

    /**
     * The value to store for an option.
     *
     * A checkbox is '1' or '0' (rest_sanitize_boolean(), so "false" and "0"
     * are off); the color scheme is one of COLOR_SCHEMES, else 'default'.
     *
     * @param string $name  Option name.
     * @param mixed  $value Value from a request, a form or a file.
     * @return string
     */
    public static function sanitize($name, $value) {
        if (self::COLOR_SCHEME === $name) {
            $value = is_scalar($value) ? sanitize_key((string) $value) : '';
            return in_array($value, self::COLOR_SCHEMES, true) ? $value : 'default';
        }
        if (is_array($value) || is_object($value)) {
            return '0';
        }
        return rest_sanitize_boolean($value) ? '1' : '0';
    }

    /**
     * The value an option has on this site, in the stored form.
     *
     * @param string $name       Option name.
     * @param array  $definition definitions() entry.
     * @return string
     */
    public static function current($name, $definition) {
        $default = 'scheme' === $definition['type'] ? $definition['default'] : ($definition['default'] ? '1' : '0');
        $value = get_option($name, $default);
        // Older code stored real booleans for some of these.
        if (true === $value) {
            $value = '1';
        } elseif (false === $value) {
            $value = '0';
        }
        return self::sanitize($name, $value);
    }

    /**
     * A stored value as the import preview shows it.
     *
     * @param string $value      sanitize() result.
     * @param array  $definition definitions() entry.
     * @return string
     */
    public static function display($value, $definition) {
        if ('scheme' === $definition['type']) {
            $labels = array(
                'default'       => __('Default', 'typography-stylist'),
                'admin-colors'  => __('Match Admin Theme', 'typography-stylist'),
                'alice-blue'    => __('Alice Blue', 'typography-stylist'),
                'dark'          => __('Dark Mode', 'typography-stylist'),
                'high-contrast' => __('High Contrast', 'typography-stylist'),
            );
            return isset($labels[$value]) ? $labels[$value] : $value;
        }
        return '1' === $value ? __('On', 'typography-stylist') : __('Off', 'typography-stylist');
    }
}

<?php
/**
 * Variable font settings in export files (#205 step 2)
 *
 * Registers the `variableFonts` section on core's `typost_export_sections`
 * filter. Each font with axis definitions or a variable flag is written
 * under the file's font key:
 *
 *     "variableFonts": { "f1": { "isVariable": true, "hideWeights": false,
 *                                "axes": [ { "tag": "wght", "name": "Weight",
 *                                            "min": 100, "max": 900, "default": 400 } ] } }
 *
 * The module stores these under a font's string ID ("kit-…", "adobe-…",
 * "wpl-{slug}"), which exists on one site only, so export and import go
 * through the numeric font ID and core's font map. The preview uses core's
 * generic rows with the same choices as Feature Visibility
 * (Typost_Export_Settings::font_settings_row()).
 *
 * @since 1.3.5 (core 2.3.5)
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Typost_VF_Transfer {

	/** @var string Section id in the file */
	const SECTION_ID = 'variableFonts';

	/** @var Typost_Variable_Fonts */
	private $module;

	/** @var object|null Typost instance for the font map (null = the core singleton) */
	private $typost;

	/**
	 * @param Typost_Variable_Fonts $module The module instance.
	 * @param object|null           $typost Typost instance or a test double.
	 */
	public function __construct( $module, $typost = null ) {
		$this->module = $module;
		$this->typost = $typost;
	}

	/**
	 * Add the section to core's export registry. It imports before the
	 * paragraph styles (priority 20), so their axis warnings read the
	 * imported axes.
	 *
	 * @param array[] $sections Registered sections.
	 * @return array[]
	 */
	public function register_section( $sections ) {
		$sections   = is_array( $sections ) ? $sections : array();
		$sections[] = array(
			'id'         => self::SECTION_ID,
			'label'      => __( 'Variable font axes', 'typost-variable-fonts' ),
			'capability' => 'manage_options',
			'options'    => array( Typost_Variable_Fonts::OPTION_KEY, Typost_Variable_Fonts::VARIABLE_FLAGS_KEY ),
			'export'     => array( $this, 'export' ),
			'preview'    => array( $this, 'preview' ),
			'import'     => array( $this, 'import' ),
			'fontKeys'   => array( $this, 'font_keys' ),
			'priority'   => 15,
		);
		return $sections;
	}

	// -------------------------------------------------------------------------
	// Export
	// -------------------------------------------------------------------------

	/**
	 * Write the settings of every font that has axes or a variable flag.
	 *
	 * @param Typost_Export_Fonts $fonts Fonts helper.
	 * @param array               $args  Not used.
	 * @return array{data: array|stdClass}
	 */
	public function export( $fonts, $args ) {
		$out = array();
		foreach ( $this->module->get_fonts_map( $this->typost ) as $string_id => $font_id ) {
			$settings = $this->settings_for( (string) $string_id );
			if ( null === $settings ) {
				continue;
			}
			$key = $fonts->key_for_font_id( absint( $font_id ) );
			if ( null !== $key ) {
				$out[ $key ] = $settings;
			}
		}
		return array( 'data' => $out ? $out : new stdClass() );
	}

	/**
	 * A font's settings on this site, null when it has none.
	 *
	 * @param string $string_id Font string ID.
	 * @return array|null {isVariable, hideWeights?, axes}
	 */
	private function settings_for( $string_id ) {
		$axes  = $this->module->get_axes_for_font( $string_id );
		$flags = get_option( Typost_Variable_Fonts::VARIABLE_FLAGS_KEY, array() );
		$flag  = is_array( $flags ) && isset( $flags[ $string_id ] ) ? $flags[ $string_id ] : null;
		if ( empty( $axes ) && empty( $flag ) ) {
			return null;
		}
		// Same reading as is_font_variable(), without its migrating write:
		// a font with axes and no flag is variable.
		$is_variable = null === $flag ? true : ( is_array( $flag ) ? ! empty( $flag['isVariable'] ) : ! empty( $flag ) );
		$settings    = array(
			'isVariable' => $is_variable,
			'axes'       => array_values( (array) $axes ),
		);
		if ( is_array( $flag ) && isset( $flag['hideWeights'] ) ) {
			$settings['hideWeights'] = (bool) $flag['hideWeights'];
		}
		return $settings;
	}

	// -------------------------------------------------------------------------
	// Reading the section
	// -------------------------------------------------------------------------

	/**
	 * Read and check the section: font key => sanitized settings. Axes go
	 * through the same sanitizing as the module's save route.
	 *
	 * @param mixed $data Section data.
	 * @return array<string,array>|WP_Error
	 */
	private function read( $data ) {
		if ( ! is_array( $data ) || ( $data && array_values( $data ) === $data ) ) {
			return new WP_Error( 'typost_import_invalid_file', __( 'The variable font settings in this file cannot be read. Nothing was saved.', 'typost-variable-fonts' ), array( 'status' => 400 ) );
		}
		$out = array();
		foreach ( $data as $key => $entry ) {
			if ( ! is_array( $entry ) ) {
				continue;
			}
			$axes = array();
			foreach ( isset( $entry['axes'] ) && is_array( $entry['axes'] ) ? $entry['axes'] : array() as $raw ) {
				$axis = $this->module->sanitize_axis( $raw );
				if ( null !== $axis ) {
					$axes[] = $axis;
				}
			}
			$is_variable = ! empty( $entry['isVariable'] );
			if ( ! $is_variable && ! $axes ) {
				continue;
			}
			$out[ (string) $key ] = array(
				'isVariable'  => $is_variable,
				'hideWeights' => isset( $entry['hideWeights'] ) && null !== $entry['hideWeights'] ? (bool) $entry['hideWeights'] : null,
				'axes'        => $axes,
			);
		}
		return $out;
	}

	/**
	 * @param mixed $data Section data.
	 * @return array<string,string[]> File font key => [section label].
	 */
	public function font_keys( $data ) {
		$read = $this->read( $data );
		if ( is_wp_error( $read ) ) {
			return array();
		}
		return array_fill_keys( array_keys( $read ), array( __( 'Variable font axes', 'typost-variable-fonts' ) ) );
	}

	// -------------------------------------------------------------------------
	// Preview and import
	// -------------------------------------------------------------------------

	/**
	 * One row per font, with core's per-font choices.
	 *
	 * @param mixed               $data  Section data.
	 * @param Typost_Export_Fonts $fonts Fonts helper (default mapping).
	 * @return array|WP_Error
	 */
	public function preview( $data, $fonts ) {
		$read = $this->read( $data );
		if ( is_wp_error( $read ) ) {
			return $read;
		}
		$string_ids = $this->string_ids();
		$rows       = array();
		foreach ( $read as $key => $settings ) {
			$font_id = $fonts->import_font_id( $key );
			$current = $font_id && isset( $string_ids[ $font_id ] ) ? $this->settings_for( $string_ids[ $font_id ] ) : null;
			$rows[]  = Typost_Export_Settings::font_settings_row(
				$key,
				$fonts,
				null === $current ? __( 'None', 'typost-variable-fonts' ) : self::describe( $current ),
				self::describe( $settings ),
				null !== $current
			);
		}
		return array( 'rows' => $rows );
	}

	/**
	 * Save the file's settings for each font the author chose.
	 *
	 * @param mixed               $data    Section data.
	 * @param mixed               $choices Font key => apply|keep.
	 * @param Typost_Export_Fonts $fonts   Fonts helper.
	 * @param bool                $dry_run Check only.
	 * @return array|WP_Error {groups}
	 */
	public function import( $data, $choices, $fonts, $dry_run ) {
		$read = $this->read( $data );
		if ( is_wp_error( $read ) ) {
			return $read;
		}
		$choices = is_array( $choices ) ? $choices : array();
		// Read after the fonts were added: an added or adopted font has its
		// string ID only now.
		$string_ids = $this->string_ids();
		$applied    = array();
		$kept       = array();
		$missing    = array();
		foreach ( $read as $key => $settings ) {
			$name      = $fonts->file_font_name( $key );
			$font_id   = $fonts->import_font_id( $key );
			$string_id = $font_id && isset( $string_ids[ $font_id ] ) ? $string_ids[ $font_id ] : '';
			$has_own   = '' !== $string_id && null !== $this->settings_for( $string_id );
			$choice    = Typost_Export_Settings::font_settings_choice( $choices, $key, $has_own );
			if ( is_wp_error( $choice ) ) {
				return $choice;
			}
			if ( '' === $string_id ) {
				$missing[] = $name;
			} elseif ( 'keep' === $choice ) {
				$kept[] = $name;
			} else {
				if ( ! $dry_run ) {
					// As the save route: a font marked not variable stores no axes.
					$this->module->save_axes_for_font( $string_id, $settings['isVariable'] ? $settings['axes'] : array() );
					$this->module->set_font_variable( $string_id, $settings['isVariable'], $settings['hideWeights'] );
				}
				$applied[] = $name;
			}
		}
		return array(
			'groups' => Typost_Export_Settings::font_settings_groups( __( 'Variable font axes', 'typost-variable-fonts' ), $applied, $kept, $missing ),
		);
	}

	/**
	 * Numeric font ID => string ID on this site.
	 *
	 * @return array<int,string>
	 */
	private function string_ids() {
		$out = array();
		foreach ( $this->module->get_fonts_map( $this->typost ) as $string_id => $font_id ) {
			$out[ absint( $font_id ) ] = (string) $string_id;
		}
		return $out;
	}

	/**
	 * Settings as the preview shows them: "wght 100–900, opsz 8–144".
	 *
	 * @param array $settings {isVariable, axes}.
	 * @return string
	 */
	private static function describe( $settings ) {
		if ( empty( $settings['isVariable'] ) ) {
			return __( 'Not variable', 'typost-variable-fonts' );
		}
		if ( empty( $settings['axes'] ) ) {
			return __( 'Variable, no axes defined', 'typost-variable-fonts' );
		}
		$parts = array();
		foreach ( $settings['axes'] as $axis ) {
			$parts[] = sprintf( '%s %s–%s', $axis['tag'], self::number( $axis['min'] ), self::number( $axis['max'] ) );
		}
		return implode( ', ', $parts );
	}

	/**
	 * @param mixed $value Number.
	 * @return string "100", "0.5"
	 */
	private static function number( $value ) {
		$value = (float) $value;
		return floor( $value ) === $value ? (string) (int) $value : (string) $value;
	}
}

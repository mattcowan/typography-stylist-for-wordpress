<?php
/**
 * Paragraph styles in export files (#205)
 *
 * Registers the `paragraphStyles` section on core's `typost_export_sections`
 * filter. Each style is written as
 *
 *     { "key": "s2", "name": "Body – First", "basedOn": "s1",
 *       "properties": { "fontId": "f1", "initialHang": 0, ... } }
 *
 * `key` and `basedOn` are file-local (s1, s2, ...) and `fontId` is a font
 * key from the file's font map, so nothing in the file names an ID of the
 * source site. A style with a parent is written with its own properties
 * only, exactly as stored, so inheritance survives the trip.
 *
 * GREP styles (#196) are written as `"grepRules": [{"pattern": "acronyms",
 * "style": "s3"}, {"pattern": "custom", "regex": "…", "style": "s4"}]`:
 * the style a rule applies is a file key too (and is exported with it),
 * and a built-in pattern is written by name, so a later release can fix
 * it. A style with no rules writes an empty list, so importing it over an
 * existing style removes that style's rules. A style written before #196
 * has no `grepRules` key; importing it over an existing style keeps that
 * style's rules.
 *
 * Import gives every added style a new ID and saves every style in one
 * write, after a dry run that checks names, parents and chains.
 *
 * @since 2.3.5
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Typost_PS_Transfer {

	/** @var string Section id in the file */
	const SECTION_ID = 'paragraphStyles';

	/** @var string Allowed file keys */
	const KEY_PATTERN = '/^[a-z0-9_-]{1,40}$/i';

	/** @var Typost_Paragraph_Styles */
	private $module;

	/**
	 * @param Typost_Paragraph_Styles $module The module instance.
	 */
	public function __construct( $module ) {
		$this->module = $module;
	}

	/**
	 * Add the section to core's export registry.
	 *
	 * @param array[] $sections Registered sections.
	 * @return array[]
	 */
	public function register_section( $sections ) {
		$sections   = is_array( $sections ) ? $sections : array();
		$sections[] = array(
			'id'         => self::SECTION_ID,
			'label'      => __( 'Paragraph styles', 'typost-paragraph-styles' ),
			// Styles are author-facing content, like the REST routes.
			'capability' => 'edit_posts',
			'options'    => array( Typost_Paragraph_Styles::OPTION_KEY ),
			'export'     => array( $this, 'export' ),
			'preview'    => array( $this, 'preview' ),
			'import'     => array( $this, 'import' ),
			'fontKeys'   => array( $this, 'font_keys' ),
			'items'      => array( $this, 'items' ),
			'priority'   => 20,
		);
		return $sections;
	}

	/**
	 * The styles the export UI lists, each with the style it is based on.
	 *
	 * @return array[] {id, name, parent}
	 */
	public function items() {
		$styles = $this->module->get_styles();
		$ids    = array();
		foreach ( $styles as $style ) {
			if ( isset( $style['id'] ) ) {
				$ids[ intval( $style['id'] ) ] = true;
			}
		}
		$out = array();
		foreach ( $styles as $style ) {
			if ( ! isset( $style['id'], $style['name'] ) ) {
				continue;
			}
			$parent = ! empty( $style['basedOn'] ) && isset( $ids[ intval( $style['basedOn'] ) ] ) ? intval( $style['basedOn'] ) : 0;
			$out[]  = array(
				'id'     => intval( $style['id'] ),
				'name'   => (string) $style['name'],
				'parent' => $parent,
			);
		}
		usort(
			$out,
			function ( $a, $b ) {
				return strnatcasecmp( $a['name'], $b['name'] );
			}
		);
		return $out;
	}

	// -------------------------------------------------------------------------
	// Export
	// -------------------------------------------------------------------------

	/**
	 * Write the styles, every one or a selection plus the styles they are
	 * based on.
	 *
	 * @param Typost_Export_Fonts $fonts Fonts helper.
	 * @param array               $args  {items: int[]} Style IDs; empty = every style.
	 * @return array{data: array, notes: string[]}
	 */
	public function export( $fonts, $args ) {
		$styles = $this->module->get_styles();
		$by_id  = array();
		foreach ( $styles as $style ) {
			if ( isset( $style['id'] ) && is_numeric( $style['id'] ) ) {
				$by_id[ intval( $style['id'] ) ] = $style;
			}
		}

		$picked = array();
		if ( ! empty( $args['items'] ) && is_array( $args['items'] ) ) {
			foreach ( $args['items'] as $id ) {
				if ( is_numeric( $id ) && isset( $by_id[ intval( $id ) ] ) ) {
					$picked[ intval( $id ) ] = true;
				}
			}
		} else {
			$picked = array_fill_keys( array_keys( $by_id ), true );
		}

		// A style needs the styles it is based on, or it cannot be imported
		// as it looks here, and the styles its GREP rules apply (#196).
		// Added styles can need others in turn, so this runs until nothing
		// is added.
		$notes    = array();
		$selected = $picked;
		$queue    = array_keys( $picked );
		while ( ! empty( $queue ) ) {
			$id      = array_shift( $queue );
			$current = $by_id[ $id ];
			if ( ! empty( $current['basedOn'] ) && isset( $by_id[ intval( $current['basedOn'] ) ] ) && ! isset( $selected[ intval( $current['basedOn'] ) ] ) ) {
				$parent_id              = intval( $current['basedOn'] );
				$selected[ $parent_id ] = true;
				$queue[]                = $parent_id;
				$notes[]                = sprintf(
					/* translators: 1: name of the style added to the export, 2: name of the style based on it */
					__( '“%1$s” was added because “%2$s” is based on it.', 'typost-paragraph-styles' ),
					$by_id[ $parent_id ]['name'],
					$current['name']
				);
			}
			foreach ( Typost_PS_Grep::target_style_ids( isset( $current['grepRules'] ) ? $current['grepRules'] : array() ) as $target_id ) {
				if ( isset( $by_id[ $target_id ] ) && ! isset( $selected[ $target_id ] ) ) {
					$selected[ $target_id ] = true;
					$queue[]                = $target_id;
					$notes[]                = sprintf(
						/* translators: 1: name of the style added to the export, 2: name of the style whose GREP rule applies it */
						__( '“%1$s” was added because a GREP rule of “%2$s” applies it.', 'typost-paragraph-styles' ),
						$by_id[ $target_id ]['name'],
						$current['name']
					);
				}
			}
		}

		// Keys in stored order, so a parent saved before its child keeps
		// that order in the file.
		$keys = array();
		foreach ( $styles as $style ) {
			if ( isset( $style['id'] ) && isset( $selected[ intval( $style['id'] ) ] ) ) {
				$keys[ intval( $style['id'] ) ] = 's' . ( count( $keys ) + 1 );
			}
		}

		$out = array();
		foreach ( $styles as $style ) {
			if ( ! isset( $style['id'] ) || ! isset( $keys[ intval( $style['id'] ) ] ) ) {
				continue;
			}
			$parent_key = ! empty( $style['basedOn'] ) && isset( $keys[ intval( $style['basedOn'] ) ] ) ? $keys[ intval( $style['basedOn'] ) ] : null;
			// A parent that no longer exists resolves to nothing, so the
			// style is written with what it renders: its own values.
			$properties = null === $parent_key
				? Typost_Paragraph_Styles::compact_properties( Typost_Paragraph_Styles::resolve_properties( $style, $styles ) )
				: ( isset( $style['properties'] ) && is_array( $style['properties'] ) ? $style['properties'] : array() );
			$entry      = array(
				'key'        => $keys[ intval( $style['id'] ) ],
				'name'       => (string) $style['name'],
				'basedOn'    => $parent_key,
				'properties' => self::export_fonts( $properties, $fonts, null !== $parent_key ),
			);
			// Always written: plan() reads no key as "keep the existing rules",
			// so an empty list is how Overwrite removes them.
			$entry['grepRules'] = self::export_grep_rules( isset( $style['grepRules'] ) ? $style['grepRules'] : array(), $keys );
			$out[]              = $entry;
		}

		return array(
			'data'  => $out,
			'notes' => $notes,
		);
	}

	/**
	 * A style's GREP rules with file style keys (#196). A rule whose style
	 * is not in the file (it was deleted) is left out.
	 *
	 * @param mixed $rules Stored rules.
	 * @param array $keys  Style ID => file key.
	 * @return array[]
	 */
	private static function export_grep_rules( $rules, $keys ) {
		$out = array();
		foreach ( is_array( $rules ) ? $rules : array() as $rule ) {
			if ( ! is_array( $rule ) || empty( $rule['styleId'] ) || ! isset( $rule['pattern'], $keys[ intval( $rule['styleId'] ) ] ) ) {
				continue;
			}
			$entry = array( 'pattern' => (string) $rule['pattern'] );
			if ( Typost_PS_Grep::CUSTOM === $rule['pattern'] ) {
				$entry['regex'] = isset( $rule['regex'] ) ? (string) $rule['regex'] : '';
			}
			$entry['style'] = $keys[ intval( $rule['styleId'] ) ];
			$out[]          = $entry;
		}
		return $out;
	}

	/**
	 * Replace a style's numeric font ID with its file font key.
	 *
	 * A font that no longer exists (deleted, no replacement) is left out; a
	 * style with a parent writes 0 instead, which keeps it from inheriting
	 * the parent's font.
	 *
	 * @param array               $properties Style properties.
	 * @param Typost_Export_Fonts $fonts      Fonts helper.
	 * @param bool                $has_parent Whether the style has a parent in the file.
	 * @return array|stdClass
	 */
	private static function export_fonts( $properties, $fonts, $has_parent ) {
		if ( array_key_exists( 'fontId', $properties ) ) {
			$key = absint( $properties['fontId'] ) > 0 ? $fonts->key_for_font_id( absint( $properties['fontId'] ) ) : null;
			if ( null !== $key ) {
				$properties['fontId'] = $key;
			} elseif ( $has_parent ) {
				$properties['fontId'] = 0;
			} else {
				unset( $properties['fontId'] );
			}
		}
		// An empty set must stay a JSON object.
		return $properties ? $properties : new stdClass();
	}

	// -------------------------------------------------------------------------
	// Reading the section
	// -------------------------------------------------------------------------

	/**
	 * Read and check the section's data.
	 *
	 * @param mixed $data The file's `sections.paragraphStyles` value.
	 * @return array[]|WP_Error Items in file order: {key, name, basedOn, properties}.
	 */
	public static function read_items( $data ) {
		$invalid = new WP_Error( 'typost_import_invalid_file', __( 'The paragraph styles in this file cannot be read. Nothing was saved.', 'typost-paragraph-styles' ), array( 'status' => 400 ) );
		if ( ! is_array( $data ) || array_values( $data ) !== $data ) {
			return $invalid;
		}
		$items = array();
		foreach ( $data as $raw ) {
			if ( ! is_array( $raw ) || ! isset( $raw['key'] ) || ! is_string( $raw['key'] ) || ! preg_match( self::KEY_PATTERN, $raw['key'] ) || isset( $items[ $raw['key'] ] ) ) {
				return $invalid;
			}
			$name = isset( $raw['name'] ) && is_scalar( $raw['name'] ) ? trim( sanitize_text_field( (string) $raw['name'] ) ) : '';
			if ( '' === $name ) {
				return $invalid;
			}
			$based_on = isset( $raw['basedOn'] ) && '' !== $raw['basedOn'] ? $raw['basedOn'] : null;
			if ( null !== $based_on && ( ! is_string( $based_on ) || $based_on === $raw['key'] ) ) {
				return $invalid;
			}
			$properties = isset( $raw['properties'] ) ? $raw['properties'] : array();
			if ( ! is_array( $properties ) ) {
				return $invalid;
			}
			// GREP rules (#196): null when the file has none (a file written
			// before #196 keeps an overwritten style's own rules)
			$grep_rules = null;
			if ( array_key_exists( 'grepRules', $raw ) ) {
				$grep_rules = $raw['grepRules'];
				if ( ! is_array( $grep_rules ) || array_values( $grep_rules ) !== $grep_rules || count( $grep_rules ) > Typost_PS_Grep::MAX_RULES ) {
					return $invalid;
				}
				foreach ( $grep_rules as $rule ) {
					if ( ! is_array( $rule ) || ! isset( $rule['pattern'], $rule['style'] ) || ! is_string( $rule['pattern'] ) || ! is_string( $rule['style'] ) || $rule['style'] === $raw['key'] ) {
						return $invalid;
					}
					if ( Typost_PS_Grep::CUSTOM === $rule['pattern'] && ( ! isset( $rule['regex'] ) || ! is_string( $rule['regex'] ) ) ) {
						return $invalid;
					}
				}
			}
			$items[ $raw['key'] ] = array(
				'key'        => $raw['key'],
				'name'       => $name,
				'basedOn'    => $based_on,
				'properties' => $properties,
				'grepRules'  => $grep_rules,
			);
		}
		foreach ( $items as $item ) {
			if ( null !== $item['basedOn'] && ! isset( $items[ $item['basedOn'] ] ) ) {
				return $invalid;
			}
			foreach ( is_array( $item['grepRules'] ) ? $item['grepRules'] : array() as $index => $rule ) {
				if ( ! isset( $items[ $rule['style'] ] ) ) {
					return $invalid;
				}
				// A custom pattern runs on every page render that uses the
				// style, so it gets the same checks as Save, and one that
				// fails rejects the whole file.
				if ( Typost_PS_Grep::CUSTOM === $rule['pattern'] ) {
					$error = Typost_PS_Grep::validate_pattern( $rule['regex'] );
					if ( '' !== $error ) {
						return new WP_Error(
							'typost_import_invalid_file',
							/* translators: 1: style name, 2: rule number, 3: why the pattern is rejected */
							sprintf( __( '“%1$s”, GREP rule %2$d: %3$s Nothing was saved.', 'typost-paragraph-styles' ), $item['name'], $index + 1, $error ),
							array( 'status' => 400 )
						);
					}
				}
			}
		}

		// The chains must be ones the style editor would accept.
		$temp = self::temp_styles( $items );
		foreach ( $temp as $style ) {
			if ( empty( $style['basedOn'] ) ) {
				continue;
			}
			$error = Typost_Paragraph_Styles::based_on_error( $temp, $style['id'], $style['basedOn'] );
			if ( '' !== $error ) {
				return new WP_Error(
					'typost_import_invalid_file',
					/* translators: 1: style name, 2: why its Based On chain is rejected */
					sprintf( __( '“%1$s”: %2$s Nothing was saved.', 'typost-paragraph-styles' ), $style['name'], $error ),
					array( 'status' => 400 )
				);
			}
		}
		return array_values( $items );
	}

	/**
	 * The file's styles as style records with IDs 1..n, so the module's
	 * chain checks and resolution can run on them.
	 *
	 * @param array[] $items Items keyed by file key.
	 * @return array[]
	 */
	private static function temp_styles( $items ) {
		$ids = array();
		foreach ( array_keys( $items ) as $i => $key ) {
			$ids[ $key ] = $i + 1;
		}
		$temp = array();
		foreach ( $items as $key => $item ) {
			$style = array(
				'id'         => $ids[ $key ],
				'name'       => $item['name'],
				'properties' => $item['properties'],
			);
			if ( null !== $item['basedOn'] ) {
				$style['basedOn'] = $ids[ $item['basedOn'] ];
			}
			$temp[ $key ] = $style;
		}
		return $temp;
	}

	/**
	 * File font key => names of the styles that set it.
	 *
	 * @param mixed $data Section data.
	 * @return array<string,string[]>
	 */
	public function font_keys( $data ) {
		$items = self::read_items( $data );
		if ( is_wp_error( $items ) ) {
			return array();
		}
		$out = array();
		foreach ( $items as $item ) {
			if ( isset( $item['properties']['fontId'] ) && is_string( $item['properties']['fontId'] ) && ! ctype_digit( $item['properties']['fontId'] ) ) {
				$out[ $item['properties']['fontId'] ][] = $item['name'];
			}
		}
		return $out;
	}

	// -------------------------------------------------------------------------
	// Preview and import
	// -------------------------------------------------------------------------

	/**
	 * What the import UI shows for each style.
	 *
	 * @param mixed               $data  Section data.
	 * @param Typost_Export_Fonts $fonts Fonts helper (default mapping).
	 * @return array|WP_Error {items: [...], warnings: string[]}
	 */
	public function preview( $data, $fonts ) {
		$items = self::read_items( $data );
		if ( is_wp_error( $items ) ) {
			return $items;
		}
		$styles   = $this->module->get_styles();
		$by_name  = self::styles_by_name( $styles );
		$defaults = self::default_choices( $items, $styles );
		$by_key   = array();
		foreach ( $items as $item ) {
			$by_key[ $item['key'] ] = $item;
		}
		$rows   = array();
		$notes  = array();
		$labels = Typost_PS_Grep::pattern_labels();
		foreach ( $items as $item ) {
			// GREP rules (#196): what each rule applies, and every custom
			// pattern listed on its own, because it runs on each page render
			$grep = array();
			foreach ( is_array( $item['grepRules'] ) ? $item['grepRules'] : array() as $rule ) {
				$target = $by_key[ $rule['style'] ]['name'];
				if ( Typost_PS_Grep::CUSTOM === $rule['pattern'] ) {
					/* translators: %s: a regular expression */
					$pattern_label = sprintf( __( 'Custom (%s)', 'typost-paragraph-styles' ), $rule['regex'] );
					$notes[]       = sprintf(
						/* translators: 1: style name, 2: a regular expression, 3: name of the style applied to its matches */
						__( '“%1$s” has a custom GREP pattern, which runs on every page that uses the style: %2$s (applies “%3$s”).', 'typost-paragraph-styles' ),
						$item['name'],
						$rule['regex'],
						$target
					);
				} else {
					$pattern_label = isset( $labels[ $rule['pattern'] ] ) ? $labels[ $rule['pattern'] ] : $rule['pattern'];
				}
				/* translators: 1: a GREP pattern, such as "Acronyms (NASA)", 2: the style applied to its matches */
				$grep[] = sprintf( __( '%1$s → %2$s', 'typost-paragraph-styles' ), $pattern_label, $target );
			}

			$lower    = self::lower( $item['name'] );
			$existing = isset( $by_name[ $lower ] ) ? $by_name[ $lower ] : null;
			$affected = array();
			if ( $existing ) {
				foreach ( Typost_Paragraph_Styles::descendant_ids( $styles, intval( $existing['id'] ) ) as $id ) {
					$affected[] = (string) self::find_style( $styles, $id )['name'];
				}
			}
			$rows[] = array(
				'key'           => $item['key'],
				'name'          => $item['name'],
				'basedOn'       => null !== $item['basedOn'] ? $by_key[ $item['basedOn'] ]['name'] : '',
				'basedOnKey'    => null !== $item['basedOn'] ? $item['basedOn'] : '',
				'exists'        => (bool) $existing,
				'existingName'  => $existing ? (string) $existing['name'] : '',
				'action'        => $defaults[ $item['key'] ]['action'],
				'suggestedName' => $defaults[ $item['key'] ]['suggestedName'],
				'affected'      => $affected,
				'grep'          => $grep,
			);
		}

		$plan     = $this->plan( $items, $defaults, $fonts );
		$warnings = is_wp_error( $plan ) ? array( $plan->get_error_message() ) : $plan['warnings'];
		if ( ! empty( $notes ) || self::file_has_grep_rules( $items ) ) {
			if ( ! Typost_Paragraph_Styles::grep_supported() ) {
				$warnings[] = __( 'GREP styles need WordPress 6.9 or later. They are imported, but have no effect on this site until WordPress is updated.', 'typost-paragraph-styles' );
			}
		}
		return array(
			'items'    => $rows,
			'notes'    => $notes,
			'warnings' => $warnings,
		);
	}

	/**
	 * Whether any style in the file has GREP rules.
	 *
	 * @param array[] $items read_items().
	 * @return bool
	 */
	private static function file_has_grep_rules( $items ) {
		foreach ( $items as $item ) {
			if ( ! empty( $item['grepRules'] ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * The choice each style starts with, used by the preview and by an
	 * import that sends no choice for a style.
	 *
	 * A name that exists on this site starts as skip; a name an earlier
	 * style in the file already uses starts as a rename, so the defaults
	 * always import cleanly; anything else is added. A skipped or renamed
	 * style gets a free name to offer for a rename; an added style offers
	 * its own name.
	 *
	 * Suggestions avoid every name in the file, not only the ones before
	 * them, so a later style whose own name is free still starts as add
	 * ("Body", "Body", "Body (2)" gives add, rename to "Body (3)", add).
	 *
	 * @param array[] $items  read_items().
	 * @param array[] $styles The styles on this site.
	 * @return array<string,array> File key => {action, name?, suggestedName}.
	 */
	private static function default_choices( $items, $styles ) {
		$by_name = self::styles_by_name( $styles );
		$taken   = array_fill_keys( array_keys( $by_name ), true );
		foreach ( $items as $item ) {
			$taken[ self::lower( $item['name'] ) ] = true;
		}
		$in_file = array();
		$out     = array();
		foreach ( $items as $item ) {
			$lower = self::lower( $item['name'] );
			if ( isset( $by_name[ $lower ] ) || isset( $in_file[ $lower ] ) ) {
				$suggested                          = self::unique_name( $item['name'], $taken );
				$taken[ self::lower( $suggested ) ] = true;
				$out[ $item['key'] ]                = isset( $by_name[ $lower ] )
					? array( 'action' => 'skip' )
					: array(
						'action' => 'rename',
						'name'   => $suggested,
					);
			} else {
				$suggested           = $item['name'];
				$out[ $item['key'] ] = array( 'action' => 'add' );
			}
			$out[ $item['key'] ]['suggestedName'] = $suggested;
			$in_file[ $lower ]                    = true;
		}
		return $out;
	}

	/**
	 * Import the styles with the author's choices.
	 *
	 * @param mixed               $data    Section data.
	 * @param mixed               $choices File key => {action: add|skip|rename|overwrite, name?}.
	 * @param Typost_Export_Fonts $fonts   Fonts helper.
	 * @param bool                $dry_run Check only.
	 * @return array|WP_Error {added, renamed: [{from, to}], overwritten, skipped, warnings}
	 */
	public function import( $data, $choices, $fonts, $dry_run ) {
		$items = self::read_items( $data );
		if ( is_wp_error( $items ) ) {
			return $items;
		}
		$choices = ( is_array( $choices ) ? $choices : array() ) + self::default_choices( $items, $this->module->get_styles() );
		$plan    = $this->plan( $items, $choices, $fonts );
		if ( is_wp_error( $plan ) || $dry_run ) {
			return $plan;
		}
		$this->module->save_imported_styles( $plan['styles'], $plan['nextId'] );
		unset( $plan['styles'], $plan['nextId'] );
		return $plan;
	}

	/**
	 * Work out the styles after an import, without saving.
	 *
	 * Styles are placed parents first. Each choice:
	 * - add: a new style with a new ID (the name must be free);
	 * - rename: the same with the name the author gave;
	 * - overwrite: the style with the same name takes the file's values and
	 *   parent, and keeps its ID, name and legacy ID, so content using it
	 *   restyles;
	 * - skip: nothing changes. A style skipped because one with its name
	 *   exists stands in for it, so its children are based on the style on
	 *   this site; one skipped with no such style leaves its children
	 *   standalone, with the values they had in the file.
	 *
	 * Every value goes through the same sanitizing as the REST create route,
	 * and a child stores only what differs from its parent here.
	 *
	 * @param array[]             $items   read_items().
	 * @param array               $choices File key => choice.
	 * @param Typost_Export_Fonts $fonts   Fonts helper.
	 * @return array|WP_Error
	 */
	private function plan( $items, $choices, $fonts ) {
		$existing_styles = $this->module->get_styles();
		$working         = array_values( $existing_styles );
		$by_name         = self::styles_by_name( $working );
		$by_key          = array();
		foreach ( $items as $item ) {
			$by_key[ $item['key'] ] = $item;
		}

		$next = intval( get_option( Typost_Paragraph_Styles::COUNTER_KEY, 1 ) );
		foreach ( $working as $style ) {
			if ( isset( $style['id'] ) && is_numeric( $style['id'] ) ) {
				$next = max( $next, intval( $style['id'] ) + 1 );
			}
		}

		// What each style looks like in the file, for children whose parent
		// is not imported and for the "looks different" warning.
		$temp      = self::temp_styles( $by_key );
		$file_look = array();
		foreach ( $temp as $key => $style ) {
			$file_look[ $key ] = self::map_fonts( Typost_Paragraph_Styles::compact_properties( Typost_Paragraph_Styles::resolve_properties( $style, $temp ) ), $fonts );
		}

		$key_to_id      = array();
		$stands_in      = array(); // File key => true when an existing style stands in for it.
		$result         = array(
			'added'       => array(),
			'renamed'     => array(),
			'overwritten' => array(),
			'skipped'     => array(),
			'warnings'    => array(),
		);
		$imported_keys  = array();
		$overwrite_ids  = array();
		foreach ( self::parents_first( $by_key ) as $key ) {
			$item     = $by_key[ $key ];
			$lower    = self::lower( $item['name'] );
			$existing = isset( $by_name[ $lower ] ) ? $by_name[ $lower ] : null;
			$choice   = isset( $choices[ $key ] ) && is_array( $choices[ $key ] ) ? $choices[ $key ] : array();
			$action   = isset( $choice['action'] ) ? (string) $choice['action'] : '';

			if ( 'skip' === $action ) {
				$key_to_id[ $key ] = $existing ? intval( $existing['id'] ) : 0;
				if ( $existing ) {
					$stands_in[ $key ] = true;
				}
				$result['skipped'][] = $item['name'];
				continue;
			}

			if ( 'overwrite' === $action ) {
				if ( ! $existing ) {
					return self::choice_error( $item['name'], __( 'There is no style with this name to overwrite.', 'typost-paragraph-styles' ) );
				}
				if ( isset( $overwrite_ids[ intval( $existing['id'] ) ] ) ) {
					return self::choice_error( $item['name'], __( 'Another style in the file already overwrites this style.', 'typost-paragraph-styles' ) );
				}
				$overwrite_ids[ intval( $existing['id'] ) ] = true;
				$id   = intval( $existing['id'] );
				$name = (string) $existing['name'];
			} elseif ( 'add' === $action || 'rename' === $action ) {
				$name = 'rename' === $action && isset( $choice['name'] ) && is_scalar( $choice['name'] ) ? trim( sanitize_text_field( (string) $choice['name'] ) ) : $item['name'];
				if ( '' === $name ) {
					return self::choice_error( $item['name'], __( 'Style name is required.', 'typost-paragraph-styles' ) );
				}
				if ( isset( $by_name[ self::lower( $name ) ] ) ) {
					return self::choice_error(
						$item['name'],
						/* translators: %s: style name */
						sprintf( __( 'A style named “%s” already exists. Skip this style, add it with a new name, or overwrite the style on this site.', 'typost-paragraph-styles' ), $name )
					);
				}
				$id = $next++;
			} else {
				return self::choice_error( $item['name'], __( 'The choice for this style is not valid.', 'typost-paragraph-styles' ) );
			}

			$parent_id = null !== $item['basedOn'] && ! empty( $key_to_id[ $item['basedOn'] ] ) ? $key_to_id[ $item['basedOn'] ] : 0;
			if ( $parent_id ) {
				$properties = $this->module->sanitize_style_properties( self::map_fonts( $item['properties'], $fonts ), true );
				$parent     = self::find_style( $working, $parent_id );
				$properties = Typost_Paragraph_Styles::drop_inherited_properties( $properties, Typost_Paragraph_Styles::resolve_properties( $parent, $working ) );
			} else {
				// No parent here: the style keeps the look it had in the file.
				$source     = null !== $item['basedOn'] ? $file_look[ $key ] : self::map_fonts( $item['properties'], $fonts );
				$properties = $this->module->sanitize_style_properties( $source, false );
				if ( isset( $properties['fontId'] ) && 0 === $properties['fontId'] ) {
					unset( $properties['fontId'] );
				}
			}

			if ( 'overwrite' === $action ) {
				foreach ( $working as $i => $style ) {
					if ( intval( $style['id'] ) === $id ) {
						$working[ $i ]['properties'] = $properties;
						$working[ $i ]['modified']   = current_time( 'Y-m-d' );
						if ( $parent_id ) {
							$working[ $i ]['basedOn'] = $parent_id;
						} else {
							unset( $working[ $i ]['basedOn'] );
						}
					}
				}
				$result['overwritten'][] = $name;
			} else {
				$record = array(
					'id'         => $id,
					'name'       => $name,
					'created'    => current_time( 'Y-m-d' ),
					'modified'   => current_time( 'Y-m-d' ),
					'properties' => $properties,
				);
				if ( $parent_id ) {
					$record['basedOn'] = $parent_id;
				}
				$working[]                        = $record;
				$by_name[ self::lower( $name ) ] = $record;
				if ( 'rename' === $action ) {
					$result['renamed'][] = array(
						'from' => $item['name'],
						'to'   => $name,
					);
				} else {
					$result['added'][] = $name;
				}
			}
			$key_to_id[ $key ]     = $id;
			$imported_keys[ $key ] = $name;
		}

		// An overwrite can link existing styles into a loop or a chain that
		// is too long; check the chain of every style the import adds or
		// changes, as the style editor would (based_on_error() also counts
		// the styles below an overwritten one). Only these: a broken chain
		// already stored on this site must not block an import that does
		// not touch it.
		foreach ( array_keys( $imported_keys ) as $key ) {
			$style = self::find_style( $working, $key_to_id[ $key ] );
			if ( empty( $style['basedOn'] ) ) {
				continue;
			}
			$error = Typost_Paragraph_Styles::based_on_error( $working, intval( $style['id'] ), intval( $style['basedOn'] ) );
			if ( '' !== $error ) {
				return self::choice_error( (string) $style['name'], $error );
			}
		}

		// GREP rules (#196), once every style has its ID: each rule's style
		// is the imported style, or the style on this site that stands in
		// for a skipped one. A rule whose style is not imported is left out.
		$built_in = Typost_PS_Grep::built_in_patterns();
		foreach ( $imported_keys as $key => $name ) {
			$file_rules = $by_key[ $key ]['grepRules'];
			if ( null === $file_rules ) {
				continue;
			}
			$own_id = $key_to_id[ $key ];
			$rules  = array();
			foreach ( $file_rules as $index => $rule ) {
				if ( Typost_PS_Grep::CUSTOM !== $rule['pattern'] && ! isset( $built_in[ $rule['pattern'] ] ) ) {
					$result['warnings'][] = sprintf(
						/* translators: 1: style name, 2: rule number, 3: pattern name from the file */
						__( '“%1$s”, GREP rule %2$d: this site does not know the pattern “%3$s”, so the rule is left out.', 'typost-paragraph-styles' ),
						$name,
						$index + 1,
						$rule['pattern']
					);
					continue;
				}
				$target_id = ! empty( $key_to_id[ $rule['style'] ] ) ? intval( $key_to_id[ $rule['style'] ] ) : 0;
				if ( ! $target_id || $target_id === $own_id ) {
					$result['warnings'][] = sprintf(
						/* translators: 1: style name, 2: rule number, 3: name of the style the rule applies */
						__( '“%1$s”, GREP rule %2$d: “%3$s” is not imported, so the rule is left out.', 'typost-paragraph-styles' ),
						$name,
						$index + 1,
						$by_key[ $rule['style'] ]['name']
					);
					continue;
				}
				$clean = array(
					'pattern' => $rule['pattern'],
					'styleId' => $target_id,
				);
				if ( Typost_PS_Grep::CUSTOM === $rule['pattern'] ) {
					$clean['regex'] = $rule['regex'];
				}
				$rules[] = $clean;
			}
			foreach ( $working as $i => $style ) {
				if ( intval( $style['id'] ) === $own_id ) {
					if ( empty( $rules ) ) {
						unset( $working[ $i ]['grepRules'] );
					} else {
						$working[ $i ]['grepRules'] = $rules;
					}
				}
			}
		}

		foreach ( $imported_keys as $key => $name ) {
			$record = self::find_style( $working, $key_to_id[ $key ] );
			$look   = Typost_Paragraph_Styles::resolve_properties( $record, $working );
			$parent = $by_key[ $key ]['basedOn'];
			if ( null !== $parent && isset( $stands_in[ $parent ] ) && ! self::same_look( $look, $file_look[ $key ] ) ) {
				$result['warnings'][] = sprintf(
					/* translators: 1: imported style name, 2: name of the style on this site it is based on */
					__( '“%1$s” is based on “%2$s” on this site, which is not the same as in the file, so “%1$s” looks different from the file.', 'typost-paragraph-styles' ),
					$name,
					$by_key[ $parent ]['name']
				);
			}
			$result['warnings'] = array_merge( $result['warnings'], self::font_support_warnings( $name, $look, $fonts ) );
		}

		$result['styles'] = $working;
		$result['nextId'] = $next;
		return $result;
	}

	/**
	 * Warnings for features hidden in the style's font and axes the font
	 * does not define.
	 *
	 * @param string              $name  Style name.
	 * @param array               $look  Resolved properties.
	 * @param Typost_Export_Fonts $fonts Fonts helper.
	 * @return string[]
	 */
	private static function font_support_warnings( $name, $look, $fonts ) {
		$font_id = isset( $look['fontId'] ) ? absint( $look['fontId'] ) : 0;
		if ( 0 === $font_id ) {
			return array();
		}
		$warnings  = array();
		$font_name = $fonts->font_name( $font_id );
		$features  = isset( $look['features'] ) && is_array( $look['features'] ) ? array_map( 'strval', $look['features'] ) : array();
		$hidden    = array_values( array_intersect( $features, $fonts->hidden_features( $font_id ) ) );
		if ( $hidden ) {
			$warnings[] = sprintf(
				/* translators: 1: style name, 2: list of OpenType feature codes, 3: font name */
				__( '“%1$s” uses OpenType features that are hidden for %3$s in Feature Visibility, so the font may not have them: %2$s.', 'typost-paragraph-styles' ),
				$name,
				implode( ', ', $hidden ),
				$font_name
			);
		}
		$settings = isset( $look['fontVariationSettings'] ) ? (string) $look['fontVariationSettings'] : '';
		if ( '' !== $settings && preg_match_all( '/["\']([A-Za-z0-9 ]{4})["\']/', $settings, $m ) ) {
			$defined = $fonts->axis_tags( $font_id );
			if ( null !== $defined ) {
				$missing = array_values( array_diff( array_unique( $m[1] ), $defined ) );
				if ( $missing ) {
					$warnings[] = sprintf(
						/* translators: 1: style name, 2: list of variable font axis tags, 3: font name */
						__( '“%1$s” sets variable font axes that are not defined for %3$s, so the font may not have them: %2$s.', 'typost-paragraph-styles' ),
						$name,
						implode( ', ', $missing ),
						$font_name
					);
				}
			}
		}
		return $warnings;
	}

	/**
	 * Replace a file font key with the local font ID (0 = not on this site).
	 *
	 * A number is a font ID of the source site, which means nothing here,
	 * so it counts as not found too.
	 *
	 * @param array               $properties Properties from the file.
	 * @param Typost_Export_Fonts $fonts      Fonts helper.
	 * @return array
	 */
	private static function map_fonts( $properties, $fonts ) {
		if ( array_key_exists( 'fontId', $properties ) ) {
			$value                = $properties['fontId'];
			$properties['fontId'] = is_string( $value ) && '' !== $value && ! ctype_digit( $value ) ? $fonts->import_font_id( $value ) : 0;
		}
		return $properties;
	}

	/**
	 * Whether two resolved property sets render the same.
	 *
	 * @param array $a Properties.
	 * @param array $b Properties.
	 * @return bool
	 */
	private static function same_look( $a, $b ) {
		return array() === Typost_Paragraph_Styles::drop_inherited_properties( $a, $b )
			&& array() === Typost_Paragraph_Styles::drop_inherited_properties( $b, $a );
	}

	/**
	 * File keys ordered so every parent comes before its children.
	 *
	 * read_items() already rejected loops, so this always finishes.
	 *
	 * @param array[] $by_key Items keyed by file key.
	 * @return string[]
	 */
	private static function parents_first( $by_key ) {
		$order = array();
		$done  = array();
		$visit = function ( $key ) use ( &$visit, &$order, &$done, $by_key ) {
			if ( isset( $done[ $key ] ) ) {
				return;
			}
			$done[ $key ] = true;
			if ( null !== $by_key[ $key ]['basedOn'] ) {
				$visit( $by_key[ $key ]['basedOn'] );
			}
			$order[] = $key;
		};
		foreach ( array_keys( $by_key ) as $key ) {
			$visit( $key );
		}
		return $order;
	}

	/**
	 * Styles keyed by lowercased name (the first one wins).
	 *
	 * @param array[] $styles Styles.
	 * @return array<string,array>
	 */
	private static function styles_by_name( $styles ) {
		$out = array();
		foreach ( $styles as $style ) {
			if ( isset( $style['name'] ) ) {
				$lower = self::lower( $style['name'] );
				if ( ! isset( $out[ $lower ] ) ) {
					$out[ $lower ] = $style;
				}
			}
		}
		return $out;
	}

	/**
	 * A name that is free, "Name (2)", "Name (3)", ... when it is taken.
	 *
	 * @param string             $name  Name.
	 * @param array<string,bool> $taken Lowercased names in use.
	 * @return string
	 */
	public static function unique_name( $name, $taken ) {
		if ( ! isset( $taken[ self::lower( $name ) ] ) ) {
			return $name;
		}
		for ( $n = 2; ; $n++ ) {
			$candidate = $name . ' (' . $n . ')';
			if ( ! isset( $taken[ self::lower( $candidate ) ] ) ) {
				return $candidate;
			}
		}
	}

	/**
	 * A style by ID.
	 *
	 * @param array[] $styles Styles.
	 * @param int     $id     Style ID.
	 * @return array
	 */
	private static function find_style( $styles, $id ) {
		foreach ( $styles as $style ) {
			if ( isset( $style['id'] ) && intval( $style['id'] ) === intval( $id ) ) {
				return $style;
			}
		}
		return array();
	}

	/**
	 * A name in the form name comparisons use.
	 *
	 * @param string $name Name.
	 * @return string
	 */
	private static function lower( $name ) {
		$name = trim( (string) $name );
		return function_exists( 'mb_strtolower' ) ? mb_strtolower( $name, 'UTF-8' ) : strtolower( $name );
	}

	/**
	 * A 400 that names the style a choice failed for.
	 *
	 * @param string $name    Style name.
	 * @param string $message Reason.
	 * @return WP_Error
	 */
	private static function choice_error( $name, $message ) {
		return new WP_Error(
			'typost_import_style_choice',
			/* translators: 1: style name, 2: why it cannot be imported */
			sprintf( __( '“%1$s”: %2$s Nothing was saved.', 'typost-paragraph-styles' ), $name, $message ),
			array( 'status' => 400 )
		);
	}
}

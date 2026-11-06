<?php
/**
 * Nested styles for paragraph styles (#195).
 *
 * A paragraph style can carry an ordered list of nested rules
 * (`nestedRules` on the style record). Each rule applies another paragraph
 * style to the start of the paragraph: the first rule from the first
 * character, every later rule from where the one before it stopped. The
 * text a rule covers is wrapped, at render time, in
 * `<span class="typost-styled typost-nested" data-style-id="B">` and renders
 * through style B's existing inline-span CSS rule. The saved post content
 * never changes. The wrapping itself is Typost_PS_Text_Ranges, the engine
 * GREP styles (#196) use.
 *
 * Rule shapes (normalized by sanitize_rules()):
 *  - array( 'styleId' => int, 'unit' => 'words', 'count' => int, 'end' => 'through'|'upto' )
 *  - array( 'styleId' => int, 'unit' => 'characters', 'count' => int )
 *  - array( 'styleId' => int, 'unit' => 'marker', 'count' => int, 'marker' => string, 'end' => 'through'|'upto' )
 *  - array( 'styleId' => int, 'unit' => 'line' )
 *
 * Counting (find_ranges(); nestedRuleRanges() in ps-utils.js is the editor's
 * twin and must count the same):
 *  - Every rule starts at the first character after the previous rule that
 *    is not a space (a line break, or an image, counts as a space), so a
 *    span never starts with a space.
 *  - Words are runs of characters between spaces. "Through" takes the
 *    spaces after the last word too (the end marker of a word is the space
 *    after it), "Up to" stops at the end of the last word.
 *  - Characters are user-perceived characters (grapheme clusters: é made of
 *    e + a combining accent is one), spaces inside the run included.
 *    Through and Up to give the same text, so the rule stores neither.
 *  - A marker is one character the author types (`:` or `—`). The rule runs
 *    to the count-th marker: "Through" includes it, "Up to" stops before
 *    it, so the next rule starts at the marker.
 *  - Text shorter than the count, or a marker that is not there: the rule
 *    stops at the end of the text, and the rules after it style nothing.
 *  - "First line" is CSS (`::first-line`, the only line CSS can select), so
 *    it is not counted here, and it must be the last rule: where the first
 *    line ends depends on the width the text renders at.
 *
 * @package Typography_Stylist_Paragraph_Styles
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( ! class_exists( 'Typost_PS_Nested' ) ) {

	/**
	 * Nested rule validation and counting.
	 */
	final class Typost_PS_Nested {

		/**
		 * Rules per style.
		 */
		const MAX_RULES = 10;

		/**
		 * Highest count of a rule.
		 */
		const MAX_COUNT = 100;

		/**
		 * Longest marker, in bytes (one character; a flag emoji is 8 bytes,
		 * a family emoji with joiners about 25).
		 */
		const MAX_MARKER_BYTES = 32;

		/**
		 * The units, in the order the admin form lists them.
		 */
		const UNITS = array( 'words', 'characters', 'marker', 'line' );

		/**
		 * The units that store Through / Up to.
		 */
		const UNITS_WITH_END = array( 'words', 'marker' );

		/**
		 * Spaces between words: Unicode white space (PCRE `\s` with the `u`
		 * modifier, which turns on Unicode properties), and the object mark
		 * the text engine writes for an image or a skipped element.
		 */
		const SPACE_CLASS = '[\s\x{FFFC}]';

		/**
		 * Labels for the Unit select.
		 *
		 * @return array unit => label.
		 */
		public static function unit_labels() {
			return array(
				'words'      => __( 'Words', 'typost-paragraph-styles' ),
				'characters' => __( 'Characters', 'typost-paragraph-styles' ),
				'marker'     => __( 'A character you type', 'typost-paragraph-styles' ),
				'line'       => __( 'First line', 'typost-paragraph-styles' ),
			);
		}

		/**
		 * Labels for the Through / Up to select.
		 *
		 * @return array end => label.
		 */
		public static function end_labels() {
			return array(
				'through' => __( 'Through', 'typost-paragraph-styles' ),
				'upto'    => __( 'Up to', 'typost-paragraph-styles' ),
			);
		}

		/**
		 * A rule in words, for the style card and the import preview:
		 * "Through 1 “:”", "Up to 3 words", "2 characters", "First line".
		 *
		 * @param array $rule Rule.
		 * @return string
		 */
		public static function rule_label( $rule ) {
			$unit    = is_array( $rule ) && isset( $rule['unit'] ) ? $rule['unit'] : '';
			$count   = is_array( $rule ) && isset( $rule['count'] ) ? max( 1, intval( $rule['count'] ) ) : 1;
			$through = ! ( is_array( $rule ) && isset( $rule['end'] ) && 'upto' === $rule['end'] );
			switch ( $unit ) {
				case 'words':
					return $through
						/* translators: %d: number of words */
						? sprintf( _n( 'Through %d word', 'Through %d words', $count, 'typost-paragraph-styles' ), $count )
						/* translators: %d: number of words */
						: sprintf( _n( 'Up to %d word', 'Up to %d words', $count, 'typost-paragraph-styles' ), $count );
				case 'characters':
					/* translators: %d: number of characters */
					return sprintf( _n( '%d character', '%d characters', $count, 'typost-paragraph-styles' ), $count );
				case 'marker':
					$marker = isset( $rule['marker'] ) ? (string) $rule['marker'] : '';
					return $through
						/* translators: 1: how many times the character occurs, 2: the character, such as ":" */
						? sprintf( __( 'Through %1$d “%2$s”', 'typost-paragraph-styles' ), $count, $marker )
						/* translators: 1: how many times the character occurs, 2: the character, such as ":" */
						: sprintf( __( 'Up to %1$d “%2$s”', 'typost-paragraph-styles' ), $count, $marker );
				case 'line':
					return __( 'First line', 'typost-paragraph-styles' );
			}
			return '';
		}

		/**
		 * Sanitize a style's rules from a request or a file.
		 *
		 * @param mixed $raw  Rules.
		 * @param array $args {
		 *     @type int   $own_id    Id of the style the rules belong to (0 for a new style).
		 *     @type int[] $style_ids Ids of every stored style.
		 * }
		 * @return array array( 'rules' => array, 'error' => string, 'index' => int,
		 *               'field' => string ): 'index' is the rule with the error
		 *               (-1 for the list), 'field' its field ('styleId',
		 *               'unit', 'count', 'marker', 'end', '' for the list).
		 */
		public static function sanitize_rules( $raw, $args ) {
			$own_id    = isset( $args['own_id'] ) ? intval( $args['own_id'] ) : 0;
			$style_ids = isset( $args['style_ids'] ) ? array_map( 'intval', (array) $args['style_ids'] ) : array();
			$result    = array(
				'rules' => array(),
				'error' => '',
				'index' => -1,
				'field' => '',
			);

			if ( null === $raw || '' === $raw ) {
				return $result;
			}
			if ( ! is_array( $raw ) || array_values( $raw ) !== $raw ) {
				$result['error'] = __( 'Nested styles must be a list of rules.', 'typost-paragraph-styles' );
				return $result;
			}
			if ( count( $raw ) > self::MAX_RULES ) {
				/* translators: %d: the most nested rules a style can have */
				$result['error'] = sprintf( __( 'A style can have %d nested rules at most.', 'typost-paragraph-styles' ), self::MAX_RULES );
				return $result;
			}

			$last = count( $raw ) - 1;
			foreach ( $raw as $index => $rule ) {
				$fail = function ( $message, $field ) use ( &$result, $index ) {
					$result['rules'] = array();
					$result['error'] = $message;
					$result['index'] = $index;
					$result['field'] = $field;
					return $result;
				};

				if ( ! is_array( $rule ) ) {
					return $fail( __( 'A nested rule is not valid.', 'typost-paragraph-styles' ), 'unit' );
				}

				$style_id = isset( $rule['styleId'] ) && is_numeric( $rule['styleId'] ) ? intval( $rule['styleId'] ) : 0;
				if ( $style_id <= 0 || ! in_array( $style_id, $style_ids, true ) ) {
					return $fail( __( 'Choose a style for each nested rule.', 'typost-paragraph-styles' ), 'styleId' );
				}
				if ( $own_id > 0 && $style_id === $own_id ) {
					return $fail( __( 'A nested rule cannot apply the style it belongs to. Choose another style.', 'typost-paragraph-styles' ), 'styleId' );
				}

				$unit = isset( $rule['unit'] ) && is_string( $rule['unit'] ) ? $rule['unit'] : '';
				if ( ! in_array( $unit, self::UNITS, true ) ) {
					return $fail( __( 'Choose a unit for each nested rule.', 'typost-paragraph-styles' ), 'unit' );
				}

				$clean = array(
					'styleId' => $style_id,
					'unit'    => $unit,
				);

				if ( 'line' === $unit ) {
					if ( $index !== $last ) {
						return $fail( __( 'A First line rule must be the last nested rule: where the first line ends depends on the screen width, so no rule can start after it.', 'typost-paragraph-styles' ), 'unit' );
					}
					$result['rules'][] = $clean;
					continue;
				}

				$count = isset( $rule['count'] ) ? $rule['count'] : null;
				if ( is_string( $count ) && preg_match( '/^\d+$/', $count ) ) {
					$count = intval( $count );
				}
				if ( ! is_int( $count ) || $count < 1 || $count > self::MAX_COUNT ) {
					/* translators: %d: the highest count */
					return $fail( sprintf( __( 'Enter a whole number from 1 to %d.', 'typost-paragraph-styles' ), self::MAX_COUNT ), 'count' );
				}
				$clean['count'] = $count;

				if ( 'marker' === $unit ) {
					$marker = isset( $rule['marker'] ) && is_string( $rule['marker'] ) ? $rule['marker'] : '';
					$error  = self::validate_marker( $marker );
					if ( '' !== $error ) {
						return $fail( $error, 'marker' );
					}
					$clean['marker'] = $marker;
				}

				if ( in_array( $unit, self::UNITS_WITH_END, true ) ) {
					$end = isset( $rule['end'] ) ? $rule['end'] : 'through';
					if ( ! in_array( $end, array( 'through', 'upto' ), true ) ) {
						return $fail( __( 'Choose Through or Up to.', 'typost-paragraph-styles' ), 'end' );
					}
					$clean['end'] = $end;
				}

				$result['rules'][] = $clean;
			}

			return $result;
		}

		/**
		 * Why a marker is not valid, or '' when it is: exactly one
		 * character (a grapheme cluster), no control character, not the
		 * object mark the text engine writes for an image.
		 *
		 * @param string $marker Marker.
		 * @return string
		 */
		public static function validate_marker( $marker ) {
			if ( ! is_string( $marker ) || '' === $marker ) {
				return __( 'Type the character that ends the rule, such as a colon.', 'typost-paragraph-styles' );
			}
			if ( strlen( $marker ) > self::MAX_MARKER_BYTES || 1 !== preg_match( '/^\X$/u', $marker ) ) {
				return __( 'Type one character only.', 'typost-paragraph-styles' );
			}
			if ( preg_match( '/[\p{Cc}\x{FFFC}]/u', $marker ) ) {
				return __( 'This character cannot end a rule. Type a letter, a digit, a punctuation mark or a symbol.', 'typost-paragraph-styles' );
			}
			return '';
		}

		/**
		 * The text ranges a style's rules cover.
		 *
		 * A rule whose style is gone (the opening tag is '') still uses its
		 * text, so the rules after it start where they always did.
		 *
		 * @param string   $plain        Plain text (Typost_PS_Text_Ranges).
		 * @param array    $rules        Sanitized rules, in order.
		 * @param callable $open_tag_for Called with a style id; returns the
		 *                               opening tag, or '' for none.
		 * @return array List of array( start, end, open_tag ): byte offsets,
		 *               sorted, not overlapping. Empty when PCRE fails.
		 */
		public static function find_ranges( $plain, $rules, $open_tag_for ) {
			if ( ! is_string( $plain ) || '' === $plain || ! is_array( $rules ) ) {
				return array();
			}
			$length = strlen( $plain );
			$pos    = 0;
			$out    = array();

			foreach ( $rules as $rule ) {
				if ( ! is_array( $rule ) || ! isset( $rule['unit'] ) || 'line' === $rule['unit'] || $pos >= $length ) {
					break;
				}

				// Each rule starts at its first character that is not a space
				$skip = preg_match( '/\G' . self::SPACE_CLASS . '+/u', $plain, $m, 0, $pos );
				if ( false === $skip ) {
					return array();
				}
				if ( $skip ) {
					$pos += strlen( $m[0] );
				}
				if ( $pos >= $length ) {
					break;
				}

				$end = self::rule_end( $plain, $pos, $rule );
				if ( false === $end ) {
					return array();
				}
				if ( $end > $pos && ! empty( $rule['styleId'] ) ) {
					$open_tag = call_user_func( $open_tag_for, intval( $rule['styleId'] ) );
					if ( '' !== $open_tag ) {
						$out[] = array( $pos, $end, $open_tag );
					}
				}
				$pos = $end;
			}

			return $out;
		}

		/**
		 * Where a rule that starts at $start ends.
		 *
		 * @param string $plain Plain text.
		 * @param int    $start Byte offset of the rule's first character.
		 * @param array  $rule  Rule.
		 * @return int|false Byte offset (exclusive), false when PCRE fails.
		 */
		private static function rule_end( $plain, $start, $rule ) {
			$length  = strlen( $plain );
			$count   = isset( $rule['count'] ) ? max( 1, min( self::MAX_COUNT, intval( $rule['count'] ) ) ) : 1;
			$through = ! ( isset( $rule['end'] ) && 'upto' === $rule['end'] );

			switch ( $rule['unit'] ) {
				case 'words':
					$pos      = $start;
					$word_end = $start;
					for ( $i = 0; $i < $count; $i++ ) {
						$word = preg_match( '/\G[^\s\x{FFFC}]+/u', $plain, $m, 0, $pos );
						if ( false === $word ) {
							return false;
						}
						if ( ! $word ) {
							break;
						}
						$pos     += strlen( $m[0] );
						$word_end = $pos;
						$space    = preg_match( '/\G' . self::SPACE_CLASS . '+/u', $plain, $m, 0, $pos );
						if ( false === $space ) {
							return false;
						}
						if ( ! $space ) {
							break;
						}
						$pos += strlen( $m[0] );
					}
					return $through ? $pos : $word_end;

				case 'characters':
					$found = preg_match( '/\G\X{1,' . $count . '}/u', $plain, $m, 0, $start );
					if ( false === $found ) {
						return false;
					}
					return $found ? $start + strlen( $m[0] ) : $start;

				case 'marker':
					$marker = isset( $rule['marker'] ) ? (string) $rule['marker'] : '';
					if ( '' === $marker ) {
						return $start;
					}
					$pos = $start;
					for ( $i = 1; $i <= $count; $i++ ) {
						$at = strpos( $plain, $marker, $pos );
						if ( false === $at ) {
							return $length;
						}
						if ( $i === $count ) {
							return $through ? $at + strlen( $marker ) : $at;
						}
						$pos = $at + strlen( $marker );
					}
					return $length;
			}
			return $start;
		}

		/**
		 * Whether rules hold any rule that wraps text (not only a First line
		 * rule, which is CSS).
		 *
		 * @param mixed $rules Rules.
		 * @return bool
		 */
		public static function has_text_rules( $rules ) {
			foreach ( is_array( $rules ) ? $rules : array() as $rule ) {
				if ( is_array( $rule ) && isset( $rule['unit'] ) && 'line' !== $rule['unit'] ) {
					return true;
				}
			}
			return false;
		}

		/**
		 * The style a trailing First line rule applies, 0 for none.
		 *
		 * @param mixed $rules Rules.
		 * @return int
		 */
		public static function line_style_id( $rules ) {
			if ( ! is_array( $rules ) || empty( $rules ) ) {
				return 0;
			}
			$last = end( $rules );
			return is_array( $last ) && isset( $last['unit'], $last['styleId'] ) && 'line' === $last['unit'] ? intval( $last['styleId'] ) : 0;
		}

		/**
		 * The style ids a list of rules applies.
		 *
		 * @param mixed $rules Rules.
		 * @param bool  $text_only Leave out the First line rule.
		 * @return int[]
		 */
		public static function target_style_ids( $rules, $text_only = false ) {
			$out = array();
			foreach ( is_array( $rules ) ? $rules : array() as $rule ) {
				if ( ! is_array( $rule ) || empty( $rule['styleId'] ) ) {
					continue;
				}
				if ( $text_only && isset( $rule['unit'] ) && 'line' === $rule['unit'] ) {
					continue;
				}
				$out[] = intval( $rule['styleId'] );
			}
			return array_values( array_unique( $out ) );
		}

		/**
		 * The opening tag of a nested span.
		 *
		 * @param int $style_id Style id.
		 * @param int $font_id  Font the admin font loader must load for this
		 *                      span (the admin card only), 0 for none.
		 * @return string
		 */
		public static function open_tag( $style_id, $font_id = 0 ) {
			$font = $font_id > 0 ? ' data-typost-font-id="' . intval( $font_id ) . '"' : '';
			return '<span class="typost-styled typost-nested" data-style-id="' . intval( $style_id ) . '"' . $font . '>';
		}
	}
}

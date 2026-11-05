<?php
/**
 * GREP styles for paragraph styles (#196).
 *
 * A paragraph style can carry an ordered list of rules (`grepRules` on the
 * style record). Each rule names a pattern and another paragraph style;
 * text in a block with the style that matches the pattern is wrapped, at
 * render time, in `<span class="typost-styled typost-grep" data-style-id="B">`
 * and renders through style B's existing inline-span CSS rule. The saved
 * post content never changes. The wrapping itself is Typost_PS_Text_Ranges.
 *
 * Rule shape: array( 'pattern' => 'acronyms'|'fractions'|'ordinals'|
 * 'numbers'|'ampersand'|'custom', 'regex' => string (custom only),
 * 'styleId' => int ). Built-in patterns are stored by name, so a later
 * release can fix one and every style gets the fix.
 *
 * Patterns are PCRE with the `u` (UTF-8) and `D` (`$` only at the very
 * end, as in JavaScript) modifiers. A custom pattern must also be valid in
 * a JavaScript `RegExp` with the `u` flag, so an editor preview can compile
 * the same pattern later: js_incompatibility() accepts a subset of syntax
 * both engines accept, and the admin form also compiles it with `new
 * RegExp( pattern, 'u' )` before saving. The check is on syntax only. On
 * text that is not ASCII, `\d`, `\w`, `\b` and `\s` match different text:
 * see js_incompatibility(). Only PCRE runs today, so this matters only when
 * an editor preview is built.
 *
 * @package Typography_Stylist_Paragraph_Styles
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( ! class_exists( 'Typost_PS_Grep' ) ) {

	/**
	 * GREP rule patterns, validation and matching.
	 */
	final class Typost_PS_Grep {

		/**
		 * The pattern value of a rule with its own regular expression.
		 */
		const CUSTOM = 'custom';

		/**
		 * Rules per style.
		 */
		const MAX_RULES = 20;

		/**
		 * Characters in a custom pattern.
		 */
		const MAX_PATTERN_LENGTH = 200;

		/**
		 * Matches per rule in one block; the rest are left unstyled.
		 */
		const MAX_MATCHES = 500;

		/**
		 * PCRE match limit for every rule (`pcre.backtrack_limit`, which
		 * also limits the JIT). PHP's default is 1,000,000; a pattern that
		 * needs more than this on a block's text is turned off for that
		 * render.
		 */
		const BACKTRACK_LIMIT = 100000;

		/**
		 * Delimiter for the compiled pattern. A control character, which
		 * validate_pattern() rejects in a pattern, so it never needs escaping.
		 */
		const DELIMITER = "\x01";

		/**
		 * PCRE modifiers: UTF-8, and `$` only at the end of the text.
		 */
		const MODIFIERS = 'uD';

		/**
		 * Unicode general categories allowed in \p{…} / \P{…}. Both engines
		 * know these names; script names are spelled differently.
		 */
		const UNICODE_CATEGORIES = array( 'L', 'Lu', 'Ll', 'Lt', 'Lm', 'Lo', 'M', 'Mn', 'Mc', 'Me', 'N', 'Nd', 'Nl', 'No', 'P', 'Pc', 'Pd', 'Ps', 'Pe', 'Pi', 'Pf', 'Po', 'S', 'Sm', 'Sc', 'Sk', 'So', 'Z', 'Zs', 'Zl', 'Zp', 'C', 'Cc', 'Cf', 'Co', 'Cn' );

		/**
		 * Compiled patterns, by pattern source.
		 *
		 * @var array
		 */
		private static $compiled = array();

		/**
		 * The built-in patterns, by name, in the order the admin form lists
		 * them. Each is checked by the tests to pass validate_pattern().
		 *
		 * @return array name => pattern source.
		 */
		public static function built_in_patterns() {
			$fraction_slash = "\u{2044}";
			return array(
				// Two or more capital letters as a word of their own; a
				// plural "s" may follow (PDFs → PDF).
				'acronyms'  => '(?<![\p{L}\p{N}])\p{Lu}{2,}(?=s?(?![\p{L}\p{N}]))',
				// 1/2, 3/16, 1⁄2. Not part of a date or a longer run:
				// 9/22/2026 and 2026/9/22 do not match, nor do 1.5/2 or 3/4.5.
				'fractions' => '(?<![\p{N}/' . $fraction_slash . '.,])\p{Nd}{1,4}[/' . $fraction_slash . ']\p{Nd}{1,4}(?![\p{N}/' . $fraction_slash . ']|[.,]\p{Nd})',
				// The letters after a number: 1st, 2nd, 3rd, 4th; French
				// 1er, 1re, 2e, 2ème.
				'ordinals'  => '(?<=\p{Nd})(?:st|nd|rd|th|er|re|ème|ère|e)(?![\p{L}\p{N}])',
				// Runs of digits, with the separators inside a number.
				'numbers'   => '\p{Nd}+(?:[.,]\p{Nd}+)*',
				'ampersand' => '&',
			);
		}

		/**
		 * Labels for the admin form and the style card.
		 *
		 * @return array name => label.
		 */
		public static function pattern_labels() {
			return array(
				'acronyms'   => __( 'Acronyms (NASA)', 'typost-paragraph-styles' ),
				'fractions'  => __( 'Fractions (1/2, not dates)', 'typost-paragraph-styles' ),
				'ordinals'   => __( 'Ordinals (the “st” in 1st)', 'typost-paragraph-styles' ),
				'numbers'    => __( 'Numbers', 'typost-paragraph-styles' ),
				'ampersand'  => __( 'Ampersand (&)', 'typost-paragraph-styles' ),
				self::CUSTOM => __( 'Custom pattern', 'typost-paragraph-styles' ),
			);
		}

		/**
		 * The pattern source a rule runs, or '' for an unknown pattern.
		 *
		 * @param array $rule Rule.
		 * @return string
		 */
		public static function rule_source( $rule ) {
			if ( ! is_array( $rule ) || ! isset( $rule['pattern'] ) ) {
				return '';
			}
			if ( self::CUSTOM === $rule['pattern'] ) {
				return isset( $rule['regex'] ) && is_string( $rule['regex'] ) ? $rule['regex'] : '';
			}
			$built_in = self::built_in_patterns();
			return isset( $built_in[ $rule['pattern'] ] ) ? $built_in[ $rule['pattern'] ] : '';
		}

		/**
		 * The full PCRE expression for a pattern source.
		 *
		 * @param string $source Pattern source.
		 * @return string
		 */
		public static function compile( $source ) {
			return self::DELIMITER . $source . self::DELIMITER . self::MODIFIERS;
		}

		/**
		 * Why a pattern cannot be used, or '' when it can.
		 *
		 * Checks, in order: present, length, no control characters, valid
		 * UTF-8, the shared PCRE/JavaScript subset, PCRE compiles it, and it
		 * stays under BACKTRACK_LIMIT on text built to make slow patterns
		 * slow.
		 *
		 * @param mixed $source Pattern source.
		 * @return string Error message, '' when valid.
		 */
		public static function validate_pattern( $source ) {
			if ( ! is_string( $source ) || '' === $source ) {
				return __( 'Enter a pattern.', 'typost-paragraph-styles' );
			}
			if ( 1 !== preg_match( '//u', $source ) ) {
				return __( 'The pattern is not valid UTF-8 text.', 'typost-paragraph-styles' );
			}
			$length = preg_match_all( '/./su', $source );
			if ( $length > self::MAX_PATTERN_LENGTH ) {
				/* translators: %d: the most characters a pattern can have */
				return sprintf( __( 'The pattern is too long. Use %d characters or fewer.', 'typost-paragraph-styles' ), self::MAX_PATTERN_LENGTH );
			}
			if ( preg_match( '/[\x00-\x1F\x7F]/', $source ) ) {
				return __( 'The pattern contains a control character, such as a tab or a line break. Use \t or \n instead.', 'typost-paragraph-styles' );
			}

			$construct = self::js_incompatibility( $source );
			if ( '' !== $construct ) {
				/* translators: %s: the part of the pattern that is not supported, for example "(?>" */
				return sprintf( __( 'The pattern uses “%s”, which GREP styles do not support. Patterns must work the same in PHP and in the browser.', 'typost-paragraph-styles' ), $construct );
			}

			$error = self::compile_error( $source );
			if ( '' !== $error ) {
				/* translators: %s: the regular expression engine's error message (in English) */
				return sprintf( __( 'The pattern is not valid: %s', 'typost-paragraph-styles' ), $error );
			}

			if ( self::exceeds_limits( $source ) ) {
				return __( 'The pattern takes too long on some text, so it would be turned off. Make it simpler, for example without a repeated group inside a repeated group.', 'typost-paragraph-styles' );
			}

			return '';
		}

		/**
		 * PCRE's compile error for a pattern, '' when it compiles.
		 *
		 * @param string $source Pattern source.
		 * @return string
		 */
		private static function compile_error( $source ) {
			$message = '';
			// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_set_error_handler -- captures preg's compile warning as the error message shown to the author; restored right after.
			set_error_handler(
				function ( $errno, $errstr ) use ( &$message ) {
					$message = preg_replace( '/^preg_match\(\):\s*(Compilation failed:\s*)?/', '', $errstr );
					return true;
				}
			);
			$result = preg_match( self::compile( $source ), '' );
			restore_error_handler();

			if ( false === $result ) {
				if ( '' !== $message ) {
					return $message;
				}
				// PHP 8+ only; the plugin requires PHP 7.4.
				return function_exists( 'preg_last_error_msg' ) ? preg_last_error_msg() : __( 'The regular expression engine gave no details.', 'typost-paragraph-styles' );
			}
			return '';
		}

		/**
		 * Whether a pattern hits the match limit on adversarial text.
		 *
		 * @param string $source Pattern source (compiles).
		 * @return bool
		 */
		private static function exceeds_limits( $source ) {
			$subjects = array(
				str_repeat( 'a', 64 ) . '!',
				str_repeat( 'A', 64 ) . '!',
				str_repeat( '1', 64 ) . '!',
				str_repeat( 'a ', 64 ) . '!',
				str_repeat( '1/', 64 ) . '!',
				str_repeat( 'ab1 ', 32 ) . "\u{2044}!",
				str_repeat( '-', 64 ) . 'a',
			);
			foreach ( $subjects as $subject ) {
				if ( false === self::match_all( $source, $subject ) ) {
					return true;
				}
			}
			return false;
		}

		/**
		 * Run a pattern over text under BACKTRACK_LIMIT.
		 *
		 * @param string $source Pattern source.
		 * @param string $text   Text.
		 * @return array|false List of array( start, end ) byte offsets, empty
		 *                     matches left out; false when the pattern does
		 *                     not compile or hits a limit.
		 */
		public static function match_all( $source, $text ) {
			if ( ! isset( self::$compiled[ $source ] ) ) {
				self::$compiled[ $source ] = '' === self::compile_error( $source ) ? self::compile( $source ) : false;
			}
			$regex = self::$compiled[ $source ];
			if ( false === $regex ) {
				return false;
			}

			$previous = ini_get( 'pcre.backtrack_limit' );
			// phpcs:ignore WordPress.PHP.IniSet.Risky -- lowered only around this call and restored right after; a host that blocks ini_set keeps its own limit.
			$changed = false !== @ini_set( 'pcre.backtrack_limit', (string) self::BACKTRACK_LIMIT );
			$count   = @preg_match_all( $regex, $text, $matches, PREG_OFFSET_CAPTURE ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- a failed match is reported through the return value.
			if ( $changed && false !== $previous ) {
				@ini_set( 'pcre.backtrack_limit', $previous ); // phpcs:ignore WordPress.PHP.IniSet.Risky,WordPress.PHP.NoSilencedErrors.Discouraged -- restores the value read above.
			}

			if ( false === $count || PREG_NO_ERROR !== preg_last_error() ) {
				return false;
			}

			$out = array();
			foreach ( $matches[0] as $match ) {
				if ( '' === $match[0] ) {
					continue;
				}
				$out[] = array( $match[1], $match[1] + strlen( $match[0] ) );
			}
			return $out;
		}

		/**
		 * The ranges a list of rules wraps in a block's plain text.
		 *
		 * Rules run in their order. A match that overlaps text an earlier
		 * rule matched is skipped, so the rule higher in the list wins
		 * (put Fractions above Numbers). A rule that fails (does not
		 * compile, hits the match limit) is skipped for this text: the text
		 * renders without it.
		 *
		 * @param string   $plain       Plain text.
		 * @param array    $rules       Rules.
		 * @param callable $open_tag_for Called with a style id; returns the
		 *                               opening tag, or '' to skip the rule
		 *                               (a deleted style).
		 * @return array List of array( start, end, open_tag ), sorted.
		 */
		public static function find_ranges( $plain, $rules, $open_tag_for ) {
			if ( ! is_string( $plain ) || '' === $plain || ! is_array( $rules ) ) {
				return array();
			}

			$accepted = array(); // sorted by start: array( start, end, open_tag )
			foreach ( $rules as $rule ) {
				$source = self::rule_source( $rule );
				if ( '' === $source || empty( $rule['styleId'] ) ) {
					continue;
				}
				$open_tag = call_user_func( $open_tag_for, intval( $rule['styleId'] ) );
				if ( '' === $open_tag ) {
					continue;
				}
				$matches = self::match_all( $source, $plain );
				if ( false === $matches ) {
					continue;
				}
				$taken = 0;
				foreach ( $matches as $match ) {
					if ( $taken >= self::MAX_MATCHES ) {
						break;
					}
					$at = self::insert_position( $accepted, $match[0], $match[1] );
					if ( null === $at ) {
						continue;
					}
					array_splice( $accepted, $at, 0, array( array( $match[0], $match[1], $open_tag ) ) );
					++$taken;
				}
			}
			return $accepted;
		}

		/**
		 * Where a range goes in a sorted list of ranges, or null when it
		 * overlaps one of them.
		 *
		 * @param array $ranges Sorted ranges.
		 * @param int   $start  Start.
		 * @param int   $end    End (exclusive).
		 * @return int|null
		 */
		private static function insert_position( array $ranges, $start, $end ) {
			$low  = 0;
			$high = count( $ranges );
			while ( $low < $high ) {
				$mid = ( $low + $high ) >> 1;
				if ( $ranges[ $mid ][0] < $start ) {
					$low = $mid + 1;
				} else {
					$high = $mid;
				}
			}
			if ( $low > 0 && $ranges[ $low - 1 ][1] > $start ) {
				return null;
			}
			if ( $low < count( $ranges ) && $ranges[ $low ][0] < $end ) {
				return null;
			}
			return $low;
		}

		/**
		 * The part of a pattern outside the syntax that PCRE and a JavaScript
		 * `u` RegExp both accept, '' when none.
		 *
		 * This shares validation, not matching. PCRE's `u` modifier also makes
		 * `\d`, `\w` and `\b` follow Unicode, while they stay ASCII in a
		 * JavaScript `u` RegExp: `\d` matches "٣" and `\w` matches "é" only in
		 * PCRE, and `f\b` matches "café" only in JavaScript. `\s` follows
		 * Unicode in both, but U+FEFF matches only in JavaScript and U+0085
		 * only in PCRE (measured on PHP 8.4 with PCRE 10.44, and Node 24). On
		 * ASCII text they agree. `\p{…}` reads the same in both, which is why
		 * the built-in patterns use it. This matters only when an editor
		 * preview runs a pattern in the browser.
		 *
		 * Accepted: literals, `.`, `^`, `$`, `|`, groups `(…)`, `(?:…)`,
		 * `(?<name>…)`, lookarounds `(?=` `(?!` `(?<=` `(?<!`, quantifiers
		 * `* + ? {n} {n,} {n,m}` with an optional lazy `?`, character
		 * classes, and the escapes `\d \D \w \W \s \S \b \B \n \r \t \f`,
		 * `\0`, back references `\1`…, `\k<name>`, `\xHH`, `\cX`,
		 * `\p{Category}` / `\P{Category}` with a general category name, and
		 * an escaped punctuation character. Everything else PCRE offers
		 * (atomic groups, possessive quantifiers, inline flags, `\x{…}`,
		 * `\A`, `\z`, `\h`, `\v`, POSIX classes, recursion, verbs) is
		 * rejected, as are a lone `{`, `}` or `]`, an empty class, and a
		 * quantified lookaround, which a JavaScript `u` RegExp rejects.
		 *
		 * @param string $p Pattern source.
		 * @return string The construct, '' when the pattern is in the subset.
		 */
		public static function js_incompatibility( $p ) {
			$length       = strlen( $p );
			$i            = 0;
			$quantifiable = false;
			$groups       = array(); // stack of booleans: is the group a lookaround?
			$last_group   = false;   // the group just closed was a lookaround

			while ( $i < $length ) {
				$c = $p[ $i ];

				if ( '\\' === $c ) {
					$read = self::read_escape( $p, $i + 1, false );
					if ( '' === $read ) {
						return substr( $p, $i, 2 );
					}
					$i           += 1 + strlen( $read );
					$quantifiable = ! in_array( $read, array( 'b', 'B' ), true );
					$last_group   = false;
					continue;
				}

				if ( '[' === $c ) {
					$end = self::read_class( $p, $i );
					if ( is_string( $end ) ) {
						return $end;
					}
					$i            = $end;
					$quantifiable = true;
					$last_group   = false;
					continue;
				}

				if ( '(' === $c ) {
					$lookaround = false;
					if ( '?' === ( $p[ $i + 1 ] ?? '' ) ) {
						$rest = substr( $p, $i + 2 );
						if ( preg_match( '/^(?::|=|!)/', $rest ) ) {
							$lookaround = ':' !== $rest[0];
							$i         += 3;
						} elseif ( preg_match( '/^<(?:=|!)/', $rest ) ) {
							$lookaround = true;
							$i         += 4;
						} elseif ( preg_match( '/^<[A-Za-z_][A-Za-z0-9_]*>/', $rest, $m ) ) {
							$i += 2 + strlen( $m[0] );
						} else {
							return substr( $p, $i, 3 );
						}
					} elseif ( '*' === ( $p[ $i + 1 ] ?? '' ) ) {
						return '(*';
					} else {
						++$i;
					}
					$groups[]     = $lookaround;
					$quantifiable = false;
					$last_group   = false;
					continue;
				}

				if ( ')' === $c ) {
					if ( empty( $groups ) ) {
						return ')';
					}
					$last_group   = array_pop( $groups );
					$quantifiable = ! $last_group;
					++$i;
					continue;
				}

				if ( '*' === $c || '+' === $c || '?' === $c || '{' === $c ) {
					if ( '{' === $c ) {
						if ( ! preg_match( '/\G\{\d+(?:,\d*)?\}/', $p, $m, 0, $i ) ) {
							return '{';
						}
						$width = strlen( $m[0] );
					} else {
						$width = 1;
					}
					if ( ! $quantifiable ) {
						return $last_group ? substr( $p, $i, $width ) . ' ' . __( '(after a lookahead or lookbehind)', 'typost-paragraph-styles' ) : substr( $p, $i, $width );
					}
					$i += $width;
					if ( '+' === ( $p[ $i ] ?? '' ) ) {
						return substr( $p, $i - $width, $width ) . '+';
					}
					if ( '?' === ( $p[ $i ] ?? '' ) ) {
						++$i;
					}
					$quantifiable = false;
					$last_group   = false;
					continue;
				}

				if ( '}' === $c || ']' === $c ) {
					return $c;
				}

				$quantifiable = ! in_array( $c, array( '^', '$', '|' ), true );
				$last_group   = false;
				// A multibyte character is one atom: skip its continuation bytes.
				++$i;
				while ( $i < $length && ( ord( $p[ $i ] ) & 0xC0 ) === 0x80 ) {
					++$i;
				}
			}

			if ( ! empty( $groups ) ) {
				return '(';
			}
			return '';
		}

		/**
		 * Read a character class from its `[`.
		 *
		 * @param string $p Pattern.
		 * @param int    $i Offset of `[`.
		 * @return int|string Offset after `]`, or the unsupported construct.
		 */
		private static function read_class( $p, $i ) {
			$length = strlen( $p );
			$start  = $i;
			++$i;
			if ( '^' === ( $p[ $i ] ?? '' ) ) {
				++$i;
			}
			if ( ']' === ( $p[ $i ] ?? '' ) ) {
				// PCRE reads a leading ] as a literal, JavaScript as an empty class
				return substr( $p, $start, $i - $start + 1 );
			}
			while ( $i < $length ) {
				$c = $p[ $i ];
				if ( ']' === $c ) {
					return $i + 1;
				}
				if ( '[' === $c && ':' === ( $p[ $i + 1 ] ?? '' ) ) {
					return '[:';
				}
				if ( '\\' === $c ) {
					$read = self::read_escape( $p, $i + 1, true );
					if ( '' === $read ) {
						return substr( $p, $i, 2 );
					}
					$i += 1 + strlen( $read );
					continue;
				}
				++$i;
			}
			return '[';
		}

		/**
		 * Read the escape after a backslash.
		 *
		 * @param string $p        Pattern.
		 * @param int    $i        Offset after the backslash.
		 * @param bool   $in_class Inside a character class.
		 * @return string The escape's text after the backslash, '' when it is
		 *                not in the shared subset.
		 */
		private static function read_escape( $p, $i, $in_class ) {
			$rest = substr( $p, $i );
			if ( '' === $rest ) {
				return '';
			}
			$simple = $in_class ? 'dDwWsSbnrtf' : 'dDwWsSbBnrtf';
			if ( false !== strpos( $simple, $rest[0] ) ) {
				return $rest[0];
			}
			if ( preg_match( '/^0(?![0-9])/', $rest ) ) {
				return '0';
			}
			if ( ! $in_class && preg_match( '/^[1-9][0-9]*/', $rest, $m ) ) {
				return $m[0];
			}
			if ( ! $in_class && preg_match( '/^k<[A-Za-z_][A-Za-z0-9_]*>/', $rest, $m ) ) {
				return $m[0];
			}
			if ( preg_match( '/^x[0-9A-Fa-f]{2}/', $rest, $m ) ) {
				return $m[0];
			}
			if ( preg_match( '/^c[A-Za-z]/', $rest, $m ) ) {
				return $m[0];
			}
			if ( preg_match( '/^[pP]\{([A-Za-z]+)\}/', $rest, $m ) && in_array( $m[1], self::UNICODE_CATEGORIES, true ) ) {
				return $m[0];
			}
			$punctuation = $in_class ? '^$\\.*+?()[]{}|/-' : '^$\\.*+?()[]{}|/';
			if ( false !== strpos( $punctuation, $rest[0] ) ) {
				return $rest[0];
			}
			return '';
		}

		/**
		 * Sanitize a style's rules from a request.
		 *
		 * @param mixed $raw  Rules from the request.
		 * @param array $args {
		 *     @type int   $own_id          Id of the style the rules belong to (0 for a new style).
		 *     @type int[] $style_ids       Ids of every stored style.
		 *     @type array $existing        The style's stored rules (a custom
		 *                                  pattern already stored may be kept
		 *                                  by a user who cannot write one).
		 *     @type bool  $can_write_custom Whether the user may add or change a
		 *                                  custom pattern (manage_options).
		 * }
		 * @return array array( 'rules' => array, 'error' => string, 'index' => int,
		 *               'field' => string ): 'index' is the rule with the error
		 *               (-1 for the list), 'field' its field ('pattern',
		 *               'regex', 'styleId', '' for the list).
		 */
		public static function sanitize_rules( $raw, $args ) {
			$own_id     = isset( $args['own_id'] ) ? intval( $args['own_id'] ) : 0;
			$style_ids  = isset( $args['style_ids'] ) ? array_map( 'intval', (array) $args['style_ids'] ) : array();
			$existing   = isset( $args['existing'] ) && is_array( $args['existing'] ) ? $args['existing'] : array();
			$can_custom = ! empty( $args['can_write_custom'] );
			$result     = array(
				'rules' => array(),
				'error' => '',
				'index' => -1,
				'field' => '',
			);

			if ( null === $raw || '' === $raw ) {
				return $result;
			}
			if ( ! is_array( $raw ) || array_values( $raw ) !== $raw ) {
				$result['error'] = __( 'GREP styles must be a list of rules.', 'typost-paragraph-styles' );
				return $result;
			}
			if ( count( $raw ) > self::MAX_RULES ) {
				/* translators: %d: the most GREP rules a style can have */
				$result['error'] = sprintf( __( 'A style can have %d GREP rules at most.', 'typost-paragraph-styles' ), self::MAX_RULES );
				return $result;
			}

			$stored_custom = array();
			foreach ( $existing as $rule ) {
				if ( is_array( $rule ) && isset( $rule['pattern'], $rule['regex'] ) && self::CUSTOM === $rule['pattern'] && is_string( $rule['regex'] ) ) {
					$stored_custom[ $rule['regex'] ] = true;
				}
			}

			$built_in = self::built_in_patterns();
			foreach ( $raw as $index => $rule ) {
				$fail = function ( $message, $field ) use ( &$result, $index ) {
					$result['rules'] = array();
					$result['error'] = $message;
					$result['index'] = $index;
					$result['field'] = $field;
					return $result;
				};

				if ( ! is_array( $rule ) ) {
					return $fail( __( 'A GREP rule is not valid.', 'typost-paragraph-styles' ), 'pattern' );
				}
				$pattern = isset( $rule['pattern'] ) && is_string( $rule['pattern'] ) ? $rule['pattern'] : '';
				if ( self::CUSTOM !== $pattern && ! isset( $built_in[ $pattern ] ) ) {
					return $fail( __( 'Choose a pattern for each GREP rule.', 'typost-paragraph-styles' ), 'pattern' );
				}

				$style_id = isset( $rule['styleId'] ) && is_numeric( $rule['styleId'] ) ? intval( $rule['styleId'] ) : 0;
				if ( $style_id <= 0 || ! in_array( $style_id, $style_ids, true ) ) {
					return $fail( __( 'Choose a style for each GREP rule.', 'typost-paragraph-styles' ), 'styleId' );
				}
				if ( $own_id > 0 && $style_id === $own_id ) {
					return $fail( __( 'A GREP rule cannot apply the style it belongs to. Choose another style.', 'typost-paragraph-styles' ), 'styleId' );
				}

				$clean = array(
					'pattern' => $pattern,
					'styleId' => $style_id,
				);
				if ( self::CUSTOM === $pattern ) {
					$regex = isset( $rule['regex'] ) && is_string( $rule['regex'] ) ? $rule['regex'] : '';
					if ( ! $can_custom && ! isset( $stored_custom[ $regex ] ) ) {
						return $fail( __( 'Only administrators can add or change a custom GREP pattern. Choose a built-in pattern.', 'typost-paragraph-styles' ), 'regex' );
					}
					$error = self::validate_pattern( $regex );
					if ( '' !== $error ) {
						return $fail( $error, 'regex' );
					}
					$clean['regex'] = $regex;
				}
				$result['rules'][] = $clean;
			}

			return $result;
		}

		/**
		 * The custom patterns in a list of rules, in order.
		 *
		 * @param mixed $rules Rules.
		 * @return string[]
		 */
		public static function custom_patterns( $rules ) {
			$out = array();
			foreach ( is_array( $rules ) ? $rules : array() as $rule ) {
				if ( is_array( $rule ) && isset( $rule['pattern'], $rule['regex'] ) && self::CUSTOM === $rule['pattern'] && is_string( $rule['regex'] ) ) {
					$out[] = $rule['regex'];
				}
			}
			return $out;
		}

		/**
		 * The style ids a list of rules applies.
		 *
		 * @param mixed $rules Rules.
		 * @return int[]
		 */
		public static function target_style_ids( $rules ) {
			$out = array();
			foreach ( is_array( $rules ) ? $rules : array() as $rule ) {
				if ( is_array( $rule ) && ! empty( $rule['styleId'] ) ) {
					$out[] = intval( $rule['styleId'] );
				}
			}
			return array_values( array_unique( $out ) );
		}

		/**
		 * The opening tag of a GREP span.
		 *
		 * @param int $style_id Style id.
		 * @param int $font_id  Font the admin font loader must load for this
		 *                      span (the admin card only), 0 for none. The
		 *                      frontend passes none.
		 * @return string
		 */
		public static function open_tag( $style_id, $font_id = 0 ) {
			$font = $font_id > 0 ? ' data-typost-font-id="' . intval( $font_id ) . '"' : '';
			return '<span class="typost-styled typost-grep" data-style-id="' . intval( $style_id ) . '"' . $font . '>';
		}

		/**
		 * Clear the compiled pattern cache (tests).
		 */
		public static function reset() {
			self::$compiled = array();
		}
	}
}

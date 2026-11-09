<?php
/**
 * Text range wrapping engine for paragraph style rules (#196, built to be
 * shared with the nested styles of #195).
 *
 * Wraps ranges of a styled element's plain text in markup, at render time,
 * without touching the saved post content. The engine reads the HTML with
 * WordPress's HTML API (WP_HTML_Processor), so a range can only ever cover
 * text: it never lands inside a tag or an attribute, and a range that
 * crosses an inline element (N<em>AS</em>A) is written as one wrapper per
 * text piece, each inside its own parent.
 *
 * How it works:
 *  1. Walk every token with next_token(). A callback decides which opening
 *     tags start a "root" (for paragraph styles: an element with the
 *     `typost-styled typost-ps-N` classes).
 *  2. Inside a root, read each text node with get_modifiable_text() (the
 *     decoded text) and append it to the root's plain text. A <br> adds
 *     "\n"; skipped elements (code, scripts, embedded SVG...) and other void
 *     elements add U+FFFC, so a pattern cannot join the text on either side
 *     of them.
 *  3. A second callback returns the ranges to wrap, as byte offsets into
 *     that plain text.
 *  4. Write the HTML back token by token: tags and comments with
 *     serialize_token(), text with escape(). A text node that a range covers
 *     is written as escaped pieces, the covered pieces inside the range's
 *     opening tag and a </span>.
 *
 * Text is not written with serialize_token(), because that turns every ' and
 * " into &apos; and &quot;. render_block runs inside do_blocks (the_content,
 * priority 9), before wptexturize (priority 10), which does not read those
 * entities: the block would keep straight quotes while its neighbors get
 * curly ones.
 *
 * Fails open: when the HTML API is not there (WordPress before 6.9, where
 * serialize_token() is not public), when the parser stops on markup it does
 * not support or on an unterminated token at the end of the HTML, or when
 * nothing is wrapped, the original HTML is returned byte for byte. When
 * something is wrapped, the whole fragment is written in the HTML API's
 * normalized form (double-quoted attributes, lower-case tag names, decoded
 * text), which renders the same.
 *
 * @package Typography_Stylist_Paragraph_Styles
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( ! class_exists( 'Typost_PS_Text_Ranges' ) ) {

	/**
	 * Render-time text range wrapper.
	 */
	final class Typost_PS_Text_Ranges {

		/**
		 * Plain text added for a <br>.
		 */
		const LINE_BREAK = "\n";

		/**
		 * Plain text added for an element whose text is not read (U+FFFC
		 * OBJECT REPLACEMENT CHARACTER): not a letter, digit or space, so
		 * built-in patterns never match it.
		 */
		const OBJECT_MARK = "\xEF\xBF\xBC";

		/**
		 * A root with more plain text than this is left as it is (bytes).
		 */
		const MAX_PLAIN_BYTES = 65536;

		/**
		 * Elements whose text is never matched: code and preformatted
		 * samples, raw text elements, embedded documents, form controls.
		 */
		const SKIP_ELEMENTS = array(
			'SCRIPT',
			'STYLE',
			'TEMPLATE',
			'TEXTAREA',
			'TITLE',
			'XMP',
			'NOSCRIPT',
			'NOEMBED',
			'NOFRAMES',
			'IFRAME',
			'SVG',
			'MATH',
			'CODE',
			'KBD',
			'SAMP',
			'PRE',
			'SELECT',
			'BUTTON',
		);

		/**
		 * Void elements that hold no text. A <br> is a line break; <wbr> is
		 * only a break opportunity and adds nothing; the rest add
		 * OBJECT_MARK.
		 */
		const VOID_ELEMENTS = array( 'AREA', 'BR', 'EMBED', 'HR', 'IMG', 'INPUT', 'WBR', 'SOURCE', 'TRACK' );

		/**
		 * Memoized support check.
		 *
		 * @var bool|null
		 */
		private static $supported = null;

		/**
		 * Whether this WordPress can run the engine: WP_HTML_Processor with a
		 * public serialize_token() (WordPress 6.9+).
		 *
		 * @return bool
		 */
		public static function is_supported() {
			if ( null === self::$supported ) {
				self::$supported = false;
				if ( class_exists( 'WP_HTML_Processor' ) && method_exists( 'WP_HTML_Processor', 'serialize_token' ) ) {
					$method          = new ReflectionMethod( 'WP_HTML_Processor', 'serialize_token' );
					self::$supported = $method->isPublic() && ! $method->isStatic();
				}
			}
			return self::$supported;
		}

		/**
		 * Reset the memoized support check (tests).
		 */
		public static function reset_support_check() {
			self::$supported = null;
		}

		/**
		 * Wrap ranges of text inside root elements.
		 *
		 * @param string   $html            An HTML fragment (a rendered block).
		 * @param callable $root_for_tag    Called with the processor at each
		 *                                  opening tag outside a root; returns
		 *                                  a root key (anything but null) to
		 *                                  make that element a root, or null.
		 * @param callable $ranges_for_root Called with ( $key, $plain ) for
		 *                                  each root; returns a list of
		 *                                  array( start, end, open_tag ): byte
		 *                                  offsets into $plain (end
		 *                                  exclusive), sorted, not
		 *                                  overlapping, and the opening tag
		 *                                  written before each covered piece
		 *                                  (closed with </span>).
		 * @return string The HTML with the ranges wrapped, or $html unchanged.
		 */
		public static function wrap( $html, $root_for_tag, $ranges_for_root ) {
			if ( ! is_string( $html ) || '' === $html || ! self::is_supported() ) {
				return $html;
			}

			$processor = WP_HTML_Processor::create_fragment( $html );
			if ( null === $processor ) {
				return $html;
			}

			// Pass 1: every token's serialization, and the plain text of each
			// root with the place of each text node in it.
			$tokens     = array();
			$roots      = array(); // root index => array( 'key', 'plain', 'segments' )
			$root       = -1;      // index of the open root, -1 outside
			$root_depth = 0;
			$skip_depth = 0;       // depth of the open skipped element, 0 for none

			while ( $processor->next_token() ) {
				$type  = $processor->get_token_type();
				$depth = $processor->get_current_depth();
				$index = count( $tokens );

				$tokens[] = '#text' === $type ? self::escape( $processor->get_modifiable_text() ) : $processor->serialize_token();

				if ( '#tag' !== $type && '#text' !== $type ) {
					if ( $root >= 0 && 0 === $skip_depth && '#comment' !== $type && '#funky-comment' !== $type ) {
						$roots[ $root ]['plain'] .= self::OBJECT_MARK;
					}
					continue;
				}

				$is_closer = '#tag' === $type && $processor->is_tag_closer();

				// Leaving the root, or a skipped element inside it: a closer
				// (or any token) back at a shallower depth.
				if ( $root >= 0 && $depth < $root_depth ) {
					$root       = -1;
					$skip_depth = 0;
				}
				if ( $skip_depth > 0 && $depth < $skip_depth ) {
					$skip_depth = 0;
					if ( $is_closer ) {
						continue;
					}
				}

				if ( $root < 0 ) {
					if ( '#tag' === $type && ! $is_closer ) {
						$key = call_user_func( $root_for_tag, $processor );
						if ( null !== $key ) {
							$root        = count( $roots );
							$root_depth  = $depth;
							$roots[]     = array(
								'key'      => $key,
								'plain'    => '',
								'segments' => array(),
							);
							// A void root (<img class="typost-styled ...">)
							// holds no text, and nothing closes it.
							if ( ! $processor->expects_closer() ) {
								$root = -1;
							}
						}
					}
					continue;
				}

				if ( $skip_depth > 0 ) {
					continue;
				}

				if ( '#text' === $type ) {
					$text = $processor->get_modifiable_text();
					if ( '' !== $text ) {
						$start                      = strlen( $roots[ $root ]['plain'] );
						$roots[ $root ]['plain']   .= $text;
						$roots[ $root ]['segments'][] = array( $start, $start + strlen( $text ), $index, $text );
					}
					continue;
				}

				if ( $is_closer ) {
					continue;
				}

				$name = $processor->get_token_name();
				if ( in_array( $name, self::SKIP_ELEMENTS, true ) || 'html' !== $processor->get_namespace() ) {
					$roots[ $root ]['plain'] .= self::OBJECT_MARK;
					if ( $processor->expects_closer() ) {
						$skip_depth = $depth;
					}
					continue;
				}
				if ( in_array( $name, self::VOID_ELEMENTS, true ) ) {
					if ( 'BR' === $name ) {
						$roots[ $root ]['plain'] .= self::LINE_BREAK;
					} elseif ( 'WBR' !== $name ) {
						$roots[ $root ]['plain'] .= self::OBJECT_MARK;
					}
				}
			}

			// An unterminated token at the end (<a href="x) stops the walk with
			// no error, and writing the tokens back would drop it.
			if ( null !== $processor->get_last_error() || $processor->paused_at_incomplete_token() || empty( $roots ) ) {
				return $html;
			}

			// Pass 2: the ranges of each root, mapped onto its text nodes.
			$replacements = array(); // token index => new HTML
			foreach ( $roots as $data ) {
				if ( '' === $data['plain'] || strlen( $data['plain'] ) > self::MAX_PLAIN_BYTES || empty( $data['segments'] ) ) {
					continue;
				}
				$ranges = call_user_func( $ranges_for_root, $data['key'], $data['plain'] );
				if ( ! is_array( $ranges ) || empty( $ranges ) ) {
					continue;
				}
				foreach ( self::map_ranges_to_segments( $data['segments'], $ranges ) as $token_index => $html_piece ) {
					$replacements[ $token_index ] = $html_piece;
				}
			}

			if ( empty( $replacements ) ) {
				return $html;
			}

			$out = '';
			foreach ( $tokens as $i => $serialized ) {
				$out .= isset( $replacements[ $i ] ) ? $replacements[ $i ] : $serialized;
			}
			return $out;
		}

		/**
		 * Write the text nodes that ranges cover, piece by piece.
		 *
		 * @param array $segments List of array( start, end, token_index, text ),
		 *                        in plain text order.
		 * @param array $ranges   List of array( start, end, open_tag ), sorted
		 *                        and not overlapping.
		 * @return array token_index => HTML for that text node.
		 */
		public static function map_ranges_to_segments( array $segments, array $ranges ) {
			$out   = array();
			$count = count( $ranges );
			$r     = 0;

			foreach ( $segments as $segment ) {
				list( $seg_start, $seg_end, $token_index, $text ) = $segment;

				// Ranges that end before this segment are done.
				while ( $r < $count && $ranges[ $r ][1] <= $seg_start ) {
					++$r;
				}

				$pos    = $seg_start;
				$html   = '';
				$was_hit = false;
				for ( $i = $r; $i < $count && $ranges[ $i ][0] < $seg_end; $i++ ) {
					$start = max( $ranges[ $i ][0], $seg_start );
					$end   = min( $ranges[ $i ][1], $seg_end );
					if ( $end <= $start ) {
						continue;
					}
					if ( $start > $pos ) {
						$html .= self::escape_gap( $text, $pos - $seg_start, $start - $pos );
					}
					// Text right after the wrapper before it, as nested rules
					// write: a quote there closes that text, as in a gap
					$inner   = $was_hit && $start === $pos
						? self::escape_gap( $text, $start - $seg_start, $end - $start )
						: self::escape( substr( $text, $start - $seg_start, $end - $start ) );
					$html   .= $ranges[ $i ][2] . $inner . '</span>';
					$pos     = $end;
					$was_hit = true;
				}

				if ( ! $was_hit ) {
					continue;
				}
				if ( $pos < $seg_end ) {
					$html .= self::escape_gap( $text, $pos - $seg_start, $seg_end - $pos );
				}
				$out[ $token_index ] = $html;
			}

			return $out;
		}

		/**
		 * Escape the text between two wrappers, or after the last one.
		 *
		 * wptexturize() reads the text between two tags on its own, so it reads
		 * a quote at the start of that text as an opening quote: "NASA's" would
		 * become NASA‘s, and "NASA". would end in “ (WordPress core ticket
		 * #43313 covers the same defect after any inline tag). A quote that touches the
		 * matched text closes it, so it is curled here, by wptexturize() itself
		 * (so the site's locale and run_wptexturize still decide), with the
		 * text around it as context. wptexturize() leaves the entity it writes
		 * alone on its later pass. Where it will not run on the content, the
		 * quote stays literal like every other quote.
		 *
		 * @param string $text   The text node.
		 * @param int    $offset Offset of the gap in the node. 0: nothing was
		 *                       wrapped before it in this node.
		 * @param int    $length Length of the gap.
		 * @return string
		 */
		private static function escape_gap( $text, $offset, $length ) {
			$gap = (string) substr( $text, $offset, $length );
			if ( 0 === $offset || ! preg_match( '/^[\'"]/', $gap ) ) {
				return self::escape( $gap );
			}

			// A match that ends in a space or an opening bracket leaves an
			// opening quote, which wptexturize() reads correctly by itself.
			$before = substr( $text, $offset - 1, 1 );
			if ( ! preg_match( '/^[0-9A-Za-z\x80-\xFF]$/', $before ) || ! function_exists( 'wptexturize' ) || false === has_filter( 'the_content', 'wptexturize' ) ) {
				return self::escape( $gap );
			}

			$previous = preg_match( '/^[0-9]$/', $before ) ? '1' : 'x';
			$next     = preg_match( '/^.[0-9A-Za-z\x80-\xFF]/', $gap ) ? 's' : ' ';
			$curled   = wptexturize( $previous . $gap[0] . $next );
			return substr( $curled, 1, -1 ) . self::escape( substr( $gap, 1 ) );
		}

		/**
		 * Escape text for a text node: `&`, `<` and `>`. Quotes stay literal
		 * (see the file comment), which is valid in text and is what the block
		 * had before it was parsed. A carriage return and a null byte follow
		 * serialize_token() in WordPress 7.1: the parser would read a literal
		 * carriage return as a line feed.
		 *
		 * @param string $text Decoded text.
		 * @return string
		 */
		public static function escape( $text ) {
			$html = htmlspecialchars( $text, ENT_NOQUOTES | ENT_SUBSTITUTE | ENT_HTML5, 'UTF-8' );
			return str_replace( array( "\r", "\x00" ), array( '&#xD;', "\u{FFFD}" ), $html );
		}
	}
}

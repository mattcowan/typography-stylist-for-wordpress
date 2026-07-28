<?php
/**
 * OpenType font file parser for variable font axis detection.
 *
 * Reads the fvar table from .ttf and .otf font files to detect
 * variable font axes and their ranges.
 *
 * @package Typography_Stylist_Variable_Fonts
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Typost_Font_Parser {

	/**
	 * Find and parse variable font axes for a single font entry.
	 *
	 * Tries each .ttf and .otf font file belonging to the entry until axes
	 * are found. Skips .woff2 files (compressed format requires Brotli).
	 *
	 * A kit ZIP holding several families produces one entry per family, but
	 * they all share the kit directory as 'upload_path' (see the entry built
	 * in Typost::process_font_kit_zip()). Scanning that directory would hand
	 * every family the axes of whichever file happens to be parsed first, so
	 * detection is scoped to the files this entry's own @font-face rules
	 * reference; the directory scan remains only as a fallback for entries
	 * that carry no usable 'font_faces'.
	 *
	 * @param array $font_entry Font entry with 'upload_path', 'upload_url' and 'font_faces'.
	 * @return array Array of axis data, or empty array if not variable.
	 */
	public static function find_and_parse_axes( $font_entry ) {
		if ( empty( $font_entry['upload_path'] ) ) {
			return array();
		}

		$upload_path = $font_entry['upload_path'];
		if ( ! is_dir( $upload_path ) ) {
			return array();
		}

		// null means the entry carried nothing to scope by, so the directory
		// scan is the only option left. An empty array means the entry's own
		// faces were readable but none pointed at a parseable local file —
		// falling back there would reintroduce the cross-family mix-up.
		$font_files = self::files_from_font_faces( $font_entry, $upload_path );
		if ( null === $font_files ) {
			$font_files = self::files_from_directory( $upload_path );
		}

		// Try each file until we find axes.
		foreach ( $font_files as $file_path ) {
			$axes = self::parse_axes( $file_path );
			if ( false !== $axes && ! empty( $axes ) ) {
				return $axes;
			}
		}

		return array();
	}

	/**
	 * Collect the parseable font files an entry's own @font-face rules point at.
	 *
	 * @param array  $font_entry  Font entry with 'font_faces' and 'upload_url'.
	 * @param string $upload_path Absolute path of the entry's upload directory.
	 * @return array|null List of absolute .ttf/.otf paths inside $upload_path,
	 *                    or null when the entry references no font files at all.
	 */
	private static function files_from_font_faces( $font_entry, $upload_path ) {
		if ( empty( $font_entry['font_faces'] ) || ! is_array( $font_entry['font_faces'] ) ) {
			return null;
		}

		$base_real = realpath( $upload_path );
		if ( false === $base_real ) {
			return null;
		}
		$base_real = rtrim( str_replace( '\\', '/', $base_real ), '/' );

		// Typost::rewrite_css_urls() stores src URLs as root-relative paths
		// (scheme and host are deliberately stripped), so the kit's own URL
		// prefix has to be compared as a path, not as a full URL.
		$upload_url_path = '';
		if ( ! empty( $font_entry['upload_url'] ) && is_string( $font_entry['upload_url'] ) ) {
			$parsed = wp_parse_url( $font_entry['upload_url'], PHP_URL_PATH );
			if ( is_string( $parsed ) ) {
				$upload_url_path = rtrim( $parsed, '/' );
			}
		}

		$files     = array();
		$saw_a_url = false;
		foreach ( $font_entry['font_faces'] as $face ) {
			if ( ! is_array( $face ) || empty( $face['src'] ) || ! is_string( $face['src'] ) ) {
				continue;
			}
			if ( ! preg_match_all( '/url\s*\(\s*[\'"]?([^)\'"\s]+)[\'"]?\s*\)/i', $face['src'], $matches ) ) {
				continue;
			}
			$saw_a_url = true;
			foreach ( $matches[1] as $url ) {
				$path = self::resolve_face_file( $url, $upload_url_path, $upload_path, $base_real );
				if ( '' !== $path && ! in_array( $path, $files, true ) ) {
					$files[] = $path;
				}
			}
		}

		return $saw_a_url ? $files : null;
	}

	/**
	 * Resolve one @font-face url() to an absolute path inside the upload directory.
	 *
	 * Kit CSS is attacker-controllable input (it arrives inside an uploaded
	 * ZIP), so the resolved path is confined to the upload directory and
	 * symlinks are refused.
	 *
	 * @param string $url             Raw url() value from a src declaration.
	 * @param string $upload_url_path Path component of the entry's upload URL.
	 * @param string $upload_path     Absolute path of the upload directory.
	 * @param string $base_real       Normalized realpath() of $upload_path.
	 * @return string Absolute file path, or '' if it cannot be used.
	 */
	private static function resolve_face_file( $url, $upload_url_path, $upload_path, $base_real ) {
		// Drop query strings and fragments (kits commonly append #iefix).
		$url = (string) preg_replace( '/[?#].*$/', '', $url );
		if ( '' === $url || 0 === stripos( $url, 'data:' ) ) {
			return '';
		}

		// Only formats the server can actually read: .woff2 needs Brotli.
		$ext = strtolower( pathinfo( $url, PATHINFO_EXTENSION ) );
		if ( ! in_array( $ext, array( 'ttf', 'otf' ), true ) ) {
			return '';
		}

		$url_path = $url;
		if ( preg_match( '#^(?:[a-z][a-z0-9+.-]*:)?//#i', $url ) ) {
			$parsed   = wp_parse_url( $url, PHP_URL_PATH );
			$url_path = is_string( $parsed ) ? $parsed : '';
		}
		if ( '' === $url_path ) {
			return '';
		}

		if ( '' !== $upload_url_path && 0 === strpos( $url_path, $upload_url_path . '/' ) ) {
			$relative = substr( $url_path, strlen( $upload_url_path ) + 1 );
		} elseif ( 0 === strpos( $url_path, '/' ) ) {
			// Root-relative, but outside this font's own kit directory.
			return '';
		} else {
			// Genuinely relative — resolve against the kit root and let the
			// containment check below reject anything that escapes it.
			$relative = $url_path;
		}
		if ( '' === $relative ) {
			return '';
		}

		$candidate = rtrim( str_replace( '\\', '/', $upload_path ), '/' ) . '/' . ltrim( $relative, '/' );
		if ( is_link( $candidate ) ) {
			return '';
		}

		$real = realpath( $candidate );
		if ( false === $real || ! is_file( $real ) ) {
			return '';
		}

		$real_normalized = str_replace( '\\', '/', $real );
		if ( 0 !== strpos( $real_normalized, $base_real . '/' ) ) {
			return '';
		}

		return $real;
	}

	/**
	 * Collect every parseable font file in a directory.
	 *
	 * Fallback for entries with no usable 'font_faces'. Ambiguous for a
	 * multi-family kit — see find_and_parse_axes().
	 *
	 * @param string $upload_path Absolute path of the upload directory.
	 * @return array List of absolute .ttf/.otf paths.
	 */
	private static function files_from_directory( $upload_path ) {
		$font_files = array();
		try {
			$iterator = new RecursiveIteratorIterator(
				new RecursiveDirectoryIterator( $upload_path, RecursiveDirectoryIterator::SKIP_DOTS )
			);

			foreach ( $iterator as $file ) {
				$ext = strtolower( pathinfo( $file->getFilename(), PATHINFO_EXTENSION ) );
				if ( in_array( $ext, array( 'ttf', 'otf' ), true ) ) {
					$font_files[] = $file->getPathname();
				}
			}
		} catch ( \UnexpectedValueException $e ) {
			// Unreadable directory — degrade silently, the font simply has no
			// detected axes (repo policy: no error_log in production code).
			return array();
		}

		return $font_files;
	}

	/**
	 * Parse variable font axes from a font file.
	 *
	 * Reads the minimal bytes needed: sfVersion (4 bytes) to confirm
	 * it's an OpenType font, then navigates the table directory to find
	 * the fvar table and extract axis records.
	 *
	 * @param string $file_path Absolute path to the font file.
	 * @return array|false Array of axis data, or false if not variable.
	 */
	public static function parse_axes( $file_path ) {
		if ( ! file_exists( $file_path ) || ! is_readable( $file_path ) ) {
			return false;
		}

		// phpcs:disable WordPress.WP.AlternativeFunctions.file_system_operations_fopen -- Binary file parsing requires fopen/fread/fseek
		$fh = fopen( $file_path, 'rb' );
		if ( ! $fh ) {
			return false;
		}

		try {
			// 1. Read sfVersion (4 bytes).
			$sf_version_raw = fread( $fh, 4 );
			if ( strlen( $sf_version_raw ) < 4 ) {
				return false;
			}

			$sf_version = unpack( 'N', $sf_version_raw )[1];

			// 0x00010000 = TrueType outlines, 0x4F54544F = 'OTTO' (CFF outlines).
			if ( $sf_version !== 0x00010000 && $sf_version !== 0x4F54544F ) {
				return false;
			}

			// 2. Read numTables (2 bytes at offset 4).
			$num_tables_raw = fread( $fh, 2 );
			if ( strlen( $num_tables_raw ) < 2 ) {
				return false;
			}
			$num_tables = unpack( 'n', $num_tables_raw )[1];

			// Skip searchRange, entrySelector, rangeShift (6 bytes).
			fseek( $fh, 12 );

			// 3. Read table directory to find 'fvar'.
			$fvar_offset = null;
			for ( $i = 0; $i < $num_tables; $i++ ) {
				$record = fread( $fh, 16 );
				if ( strlen( $record ) < 16 ) {
					return false;
				}

				$tag = substr( $record, 0, 4 );
				if ( $tag === 'fvar' ) {
					$fvar_offset = unpack( 'N', substr( $record, 8, 4 ) )[1];
					break;
				}
			}

			// 4. No fvar table = not a variable font.
			if ( null === $fvar_offset ) {
				return false;
			}

			// 5. Parse fvar header.
			fseek( $fh, $fvar_offset );
			$fvar_header = fread( $fh, 16 );
			if ( strlen( $fvar_header ) < 16 ) {
				return false;
			}

			$header = unpack( 'nmajorVersion/nminorVersion/naxesArrayOffset/nreserved/naxisCount/naxisSize', $fvar_header );

			if ( $header['majorVersion'] !== 1 ) {
				return false;
			}

			$axis_count  = $header['axisCount'];
			$axis_size   = $header['axisSize']; // Normally 20.
			$axes_offset = $fvar_offset + $header['axesArrayOffset'];

			// 6. Read axis records.
			fseek( $fh, $axes_offset );
			$axes = array();

			for ( $i = 0; $i < $axis_count; $i++ ) {
				$axis_data = fread( $fh, $axis_size );
				if ( strlen( $axis_data ) < 20 ) {
					break;
				}

				$tag       = substr( $axis_data, 0, 4 );
				$min_raw   = unpack( 'N', substr( $axis_data, 4, 4 ) )[1];
				$def_raw   = unpack( 'N', substr( $axis_data, 8, 4 ) )[1];
				$max_raw   = unpack( 'N', substr( $axis_data, 12, 4 ) )[1];

				// Convert Fixed 16.16 to float (handle signed values).
				$min_val = self::fixed_to_float( $min_raw );
				$def_val = self::fixed_to_float( $def_raw );
				$max_val = self::fixed_to_float( $max_raw );

				$tag = trim( $tag );
				// Single source of truth for the registered-axis name map
				$registered = Typost_Variable_Fonts::REGISTERED_AXES;
				$name = isset( $registered[ $tag ] ) ? $registered[ $tag ] : strtoupper( $tag );

				$axes[] = array(
					'tag'     => $tag,
					'name'    => $name,
					'min'     => round( $min_val, 2 ),
					'max'     => round( $max_val, 2 ),
					'default' => round( $def_val, 2 ),
				);
			}

			return ! empty( $axes ) ? $axes : false;

		} finally {
			fclose( $fh );
			// phpcs:enable WordPress.WP.AlternativeFunctions.file_system_operations_fopen
		}
	}

	/**
	 * Convert a Fixed 16.16 value (unsigned big-endian uint32) to float.
	 *
	 * Fixed 16.16 stores the integer part in the upper 16 bits and the
	 * fractional part in the lower 16 bits. The value is signed, so
	 * values >= 0x80000000 represent negative numbers.
	 *
	 * @param int $uint32 The raw unsigned 32-bit integer.
	 * @return float The converted float value.
	 */
	private static function fixed_to_float( $uint32 ) {
		// Convert to signed int32 if needed.
		if ( $uint32 >= 0x80000000 ) {
			$uint32 -= 0x100000000;
		}
		return $uint32 / 65536.0;
	}
}

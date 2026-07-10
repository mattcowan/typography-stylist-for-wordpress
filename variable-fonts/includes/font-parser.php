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
	 * Find and parse variable font axes from a font entry's upload directory.
	 *
	 * Tries each .ttf and .otf font file in the upload directory until
	 * axes are found. Skips .woff2 files (compressed format requires Brotli).
	 *
	 * @param array $font_entry Font entry with 'upload_path' and 'font_faces'.
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

		// Find .ttf and .otf files in the upload directory.
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

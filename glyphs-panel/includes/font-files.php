<?php
/**
 * WP Font Library file resolution for the Glyphs Panel.
 *
 * Resolves font file URLs from the merged theme.json data (theme fonts and
 * fonts installed via Appearance → Editor → Font Library), keyed by family
 * slug — matching the slugs in core's get_wp_font_library_fonts().
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Get font file URLs per WP Font Library family slug.
 *
 * @return array slug => array of {url, weight, style}
 */
function typost_gp_get_wp_font_files() {
	$map = array();

	if ( ! class_exists( 'WP_Theme_JSON_Resolver' ) ) {
		return $map;
	}

	$settings   = WP_Theme_JSON_Resolver::get_merged_data()->get_settings();
	$all_groups = isset( $settings['typography']['fontFamilies'] )
		? $settings['typography']['fontFamilies']
		: array();

	foreach ( $all_groups as $families ) {
		if ( ! is_array( $families ) ) {
			continue;
		}
		foreach ( $families as $family ) {
			if ( empty( $family['slug'] ) || empty( $family['fontFace'] ) || ! is_array( $family['fontFace'] ) ) {
				continue;
			}
			$faces = array();
			foreach ( $family['fontFace'] as $face ) {
				if ( empty( $face['src'] ) ) {
					continue;
				}
				foreach ( (array) $face['src'] as $src ) {
					if ( ! is_string( $src ) || '' === $src ) {
						continue;
					}
					// theme.json uses file:./ URIs relative to the theme root
					if ( 0 === strpos( $src, 'file:./' ) ) {
						$src = get_theme_file_uri( substr( $src, 7 ) );
					}
					$faces[] = array(
						'url'    => esc_url_raw( $src ),
						'weight' => isset( $face['fontWeight'] ) ? (string) $face['fontWeight'] : 'normal',
						'style'  => isset( $face['fontStyle'] ) ? (string) $face['fontStyle'] : 'normal',
					);
				}
			}
			if ( ! empty( $faces ) ) {
				$map[ $family['slug'] ] = $faces;
			}
		}
	}

	return $map;
}

/**
 * Build @font-face CSS for WP Font Library fonts so glyph cells render with
 * the real font in the editor parent document and the admin page (WordPress
 * only loads these fonts where the theme uses them).
 *
 * @return string CSS
 */
function typost_gp_wp_font_face_css() {
	$css = '';

	if ( ! class_exists( 'WP_Theme_JSON_Resolver' ) ) {
		return $css;
	}

	$settings   = WP_Theme_JSON_Resolver::get_merged_data()->get_settings();
	$all_groups = isset( $settings['typography']['fontFamilies'] )
		? $settings['typography']['fontFamilies']
		: array();

	foreach ( $all_groups as $families ) {
		if ( ! is_array( $families ) ) {
			continue;
		}
		foreach ( $families as $family ) {
			if ( empty( $family['fontFace'] ) || ! is_array( $family['fontFace'] ) ) {
				continue;
			}
			foreach ( $family['fontFace'] as $face ) {
				if ( empty( $face['src'] ) || empty( $face['fontFamily'] ) ) {
					continue;
				}
				$srcs = array();
				foreach ( (array) $face['src'] as $src ) {
					if ( ! is_string( $src ) || '' === $src ) {
						continue;
					}
					if ( 0 === strpos( $src, 'file:./' ) ) {
						$src = get_theme_file_uri( substr( $src, 7 ) );
					}
					$srcs[] = 'url("' . esc_url_raw( $src ) . '")';
				}
				if ( empty( $srcs ) ) {
					continue;
				}
				$weight = isset( $face['fontWeight'] ) ? (string) $face['fontWeight'] : 'normal';
				$style  = isset( $face['fontStyle'] ) ? (string) $face['fontStyle'] : 'normal';
				// Emit the family name as a quoted CSS string: backslash-escape any
				// quotes/backslashes and drop newlines so a hostile theme.json value
				// cannot break out of the declaration and inject CSS.
				$family = wp_strip_all_tags( $face['fontFamily'] );
				$family = str_replace( array( '\\', '"' ), array( '\\\\', '\\"' ), $family );
				$family = preg_replace( '/[\r\n]+/', '', $family );
				$css   .= sprintf(
					"@font-face{font-family:\"%s\";src:%s;font-weight:%s;font-style:%s;font-display:swap;}\n",
					$family,
					implode( ',', $srcs ),
					preg_replace( '/[^a-zA-Z0-9 .]/', '', $weight ),
					preg_replace( '/[^a-zA-Z0-9 -]/', '', $style )
				);
			}
		}
	}

	return $css;
}

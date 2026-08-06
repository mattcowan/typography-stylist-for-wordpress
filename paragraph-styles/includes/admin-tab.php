<?php
/**
 * Paragraph Styles admin tab content.
 *
 * Rendered inside the Typography Stylist settings page via
 * the typost_admin_tab_content_paragraph-styles action.
 *
 * @var object $instance The Typost instance passed from the action.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$styles = Typost_Paragraph_Styles::get_instance()->get_styles();

// Build a flat font lookup (numeric font ID => name) from every source the
// core plugin exposes through its public API.
$font_lookup = array();
foreach ( $instance->get_custom_fonts() as $font ) {
	if ( isset( $font['id'], $font['name'] ) ) {
		$font_lookup[ $font['id'] ] = $font['name'];
	}
}
foreach ( $instance->get_adobe_fonts() as $project ) {
	if ( isset( $project['fonts'] ) && is_array( $project['fonts'] ) ) {
		foreach ( $project['fonts'] as $font ) {
			if ( isset( $font['id'], $font['name'] ) ) {
				$font_lookup[ $font['id'] ] = $font['name'];
			}
		}
	}
}
foreach ( $instance->get_manual_fonts() as $font ) {
	if ( isset( $font['id'], $font['name'] ) ) {
		$font_lookup[ $font['id'] ] = $font['name'];
	}
}
// Adopted WP Font Library fonts carry their numeric ID in font_id
// (their string id is "wpl-{slug}").
foreach ( $instance->get_adopted_wp_fonts_by_slug() as $font ) {
	if ( isset( $font['font_id'], $font['name'] ) ) {
		$font_lookup[ $font['font_id'] ] = $font['name'];
	}
}
?>

<div class="typost-ps-admin-tab">
	<p class="typost-ps-description">
		<?php esc_html_e( 'Manage your saved paragraph styles. These appear in the Typography Stylist editor for quick application to text.', 'typost-paragraph-styles' ); ?>
	</p>

	<div id="typost-ps-styles-list">
		<?php if ( empty( $styles ) ) : ?>
			<div class="typost-ps-empty-state">
				<p><?php esc_html_e( 'No paragraph styles saved yet. Create styles from the Typography Stylist editor when editing a post.', 'typost-paragraph-styles' ); ?></p>
			</div>
		<?php else : ?>
			<?php foreach ( $styles as $style ) :
				if ( ! isset( $style['name'], $style['id'] ) || '' === $style['name'] ) {
					continue; // Skip invalid/corrupted entries
				}
				$props    = isset( $style['properties'] ) ? $style['properties'] : array();
				$style_id = isset( $style['id'] ) ? intval( $style['id'] ) : 0;
				$font_id  = isset( $props['fontId'] ) ? absint( $props['fontId'] ) : 0;
				$font_name = $font_id && isset( $font_lookup[ $font_id ] ) ? $font_lookup[ $font_id ] : __( 'Default', 'typost-paragraph-styles' );
				$weight   = ! empty( $props['fontWeight'] ) ? $props['fontWeight'] : '400';
				$features = isset( $props['features'] ) && is_array( $props['features'] ) ? $props['features'] : array();

				// CSS class name
				$css_class = 'typost-ps-' . $style_id;

				// Font size display
				$size_display = '';
				if ( ! empty( $props['fontSize'] ) ) {
					if ( $props['fontSize'] === 'responsive' ) {
						$min  = isset( $props['fontSizeMin'] ) ? $props['fontSizeMin'] : '?';
						$pref = isset( $props['fontSizePreferred'] ) ? $props['fontSizePreferred'] : '?';
						$max  = isset( $props['fontSizeMax'] ) ? $props['fontSizeMax'] : '?';
						/* translators: %1$s: min size, %2$s: preferred size, %3$s: max size */
						$size_display = sprintf( __( 'Responsive (%1$s/%2$s/%3$spx)', 'typost-paragraph-styles' ), $min, $pref, $max );
					} elseif ( $props['fontSize'] === 'fit' ) {
						$min = isset( $props['fontSizeMin'] ) ? $props['fontSizeMin'] : '?';
						$max = isset( $props['fontSizeMax'] ) ? $props['fontSizeMax'] : '?';
						/* translators: %1$s: fallback min size, %2$s: fallback max size */
						$size_display = sprintf( __( 'Fit to width (fallback %1$s–%2$spx)', 'typost-paragraph-styles' ), $min, $max );
					} else {
						/* translators: %s: font size in pixels */
						$size_display = sprintf( __( '%spx', 'typost-paragraph-styles' ), $props['fontSize'] );
					}
				}

				// Letter spacing
				$spacing_display = '';
				if ( ! empty( $props['letterSpacing'] ) ) {
					$em_value = round( $props['letterSpacing'] / 1000, 3 );
					/* translators: %s: letter spacing in em */
					$spacing_display = sprintf( __( '%sem', 'typost-paragraph-styles' ), $em_value );
				}

				// Line height
				$line_height_display = '';
				if ( ! empty( $props['lineHeight'] ) ) {
					$line_height_display = (string) $props['lineHeight'];
				}
			?>
				<div class="typost-ps-style-card" data-style-id="<?php echo esc_attr( $style_id ); ?>">
					<div class="typost-ps-style-card-header">
						<h3 class="typost-ps-style-name"><?php echo esc_html( $style['name'] ); ?></h3>
						<code class="typost-ps-css-class">.<?php echo esc_html( $css_class ); ?></code>
						<div class="typost-ps-style-actions">
							<button type="button" class="button typost-ps-edit-btn" data-style-id="<?php echo esc_attr( $style_id ); ?>">
								<?php esc_html_e( 'Edit', 'typost-paragraph-styles' ); ?>
							</button>
							<button type="button" class="button typost-ps-delete-btn" data-style-id="<?php echo esc_attr( $style_id ); ?>">
								<?php esc_html_e( 'Delete', 'typost-paragraph-styles' ); ?>
							</button>
						</div>
					</div>
					<div class="typost-ps-style-card-details">
						<span class="typost-ps-detail">
							<strong><?php esc_html_e( 'Font:', 'typost-paragraph-styles' ); ?></strong>
							<?php echo esc_html( $font_name . ' (' . $weight . ')' ); ?>
						</span>
						<?php if ( $size_display ) : ?>
							<span class="typost-ps-detail">
								<strong><?php esc_html_e( 'Size:', 'typost-paragraph-styles' ); ?></strong>
								<?php echo esc_html( $size_display ); ?>
							</span>
						<?php endif; ?>
						<?php if ( ! empty( $features ) ) : ?>
							<span class="typost-ps-detail">
								<strong><?php esc_html_e( 'Features:', 'typost-paragraph-styles' ); ?></strong>
								<?php echo esc_html( implode( ', ', $features ) ); ?>
							</span>
						<?php endif; ?>
						<?php if ( $spacing_display || $line_height_display ) : ?>
							<span class="typost-ps-detail">
								<?php if ( $spacing_display ) : ?>
									<strong><?php esc_html_e( 'Spacing:', 'typost-paragraph-styles' ); ?></strong>
									<?php echo esc_html( $spacing_display ); ?>
								<?php endif; ?>
								<?php if ( $spacing_display && $line_height_display ) : ?>
									&nbsp;/&nbsp;
								<?php endif; ?>
								<?php if ( $line_height_display ) : ?>
									<strong><?php esc_html_e( 'Line Height:', 'typost-paragraph-styles' ); ?></strong>
									<?php echo esc_html( $line_height_display ); ?>
								<?php endif; ?>
							</span>
						<?php endif; ?>
					</div>

					<div class="typost-ps-edit-form" style="display: none;">
						<div class="typost-ps-edit-form-inner">
							<label>
								<?php esc_html_e( 'Name:', 'typost-paragraph-styles' ); ?>
								<input type="text" class="typost-ps-edit-name" value="<?php echo esc_attr( $style['name'] ); ?>" />
							</label>
							<div class="typost-ps-edit-actions">
								<button type="button" class="button button-primary typost-ps-save-edit-btn">
									<?php esc_html_e( 'Save', 'typost-paragraph-styles' ); ?>
								</button>
								<button type="button" class="button typost-ps-cancel-edit-btn">
									<?php esc_html_e( 'Cancel', 'typost-paragraph-styles' ); ?>
								</button>
							</div>
						</div>
					</div>
				</div>
			<?php endforeach; ?>
		<?php endif; ?>
	</div>
</div>

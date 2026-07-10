<?php
/**
 * Admin tab content for Variable Fonts overview.
 *
 * @package Typography_Stylist_Variable_Fonts
 *
 * @var Typost $instance The core Typost plugin instance.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$vf       = Typost_Variable_Fonts::get_instance();
$all_axes = $vf->get_all_axes();

// Build font name lookup from all font types.
$font_names = array();
$custom_fonts = $instance->get_custom_fonts();
foreach ( $custom_fonts as $font ) {
	if ( isset( $font['id'], $font['name'] ) ) {
		$font_names[ $font['id'] ] = $font['name'];
	}
}
$adobe_fonts = $instance->get_adobe_fonts();
foreach ( $adobe_fonts as $font ) {
	if ( isset( $font['id'], $font['name'] ) ) {
		$font_names[ $font['id'] ] = $font['name'];
	}
}
$manual_fonts = $instance->get_manual_fonts();
foreach ( $manual_fonts as $font ) {
	$name = isset( $font['font_family'] ) ? $font['font_family'] : ( isset( $font['name'] ) ? $font['name'] : '' );
	if ( isset( $font['id'] ) && $name ) {
		$font_names[ $font['id'] ] = $name;
	}
}
?>

<div class="typost-variable-fonts-tab">
	<h3><?php esc_html_e( 'Variable Fonts', 'typost-variable-fonts' ); ?></h3>
	<p class="description">
		<?php esc_html_e( 'Fonts configured as variable fonts. Axes can be managed in each font\'s edit form under Custom Fonts, Adobe Fonts, or Custom Font Definitions.', 'typost-variable-fonts' ); ?>
	</p>

	<?php if ( empty( $all_axes ) ) : ?>
		<p><em><?php esc_html_e( 'No fonts have been configured as variable fonts yet.', 'typost-variable-fonts' ); ?></em></p>
	<?php else : ?>
		<table class="widefat striped">
			<thead>
				<tr>
					<th><?php esc_html_e( 'Font', 'typost-variable-fonts' ); ?></th>
					<th><?php esc_html_e( 'Axes', 'typost-variable-fonts' ); ?></th>
				</tr>
			</thead>
			<tbody>
				<?php foreach ( $all_axes as $font_id => $axes ) : ?>
					<tr>
						<td>
							<strong><?php echo esc_html( isset( $font_names[ $font_id ] ) ? $font_names[ $font_id ] : $font_id ); ?></strong>
							<br><code><?php echo esc_html( $font_id ); ?></code>
						</td>
						<td>
							<?php foreach ( $axes as $axis ) : ?>
								<span class="typost-vf-axis-badge">
									<strong><?php echo esc_html( $axis['tag'] ); ?></strong>
									<?php echo esc_html( $axis['name'] ); ?>
									(<?php echo esc_html( $axis['min'] . ' – ' . $axis['max'] ); ?>,
									<?php
									/* translators: %s: default axis value */
									printf( esc_html__( 'default: %s', 'typost-variable-fonts' ), esc_html( $axis['default'] ) );
									?>)
								</span>
							<?php endforeach; ?>
						</td>
					</tr>
				<?php endforeach; ?>
			</tbody>
		</table>
	<?php endif; ?>
</div>

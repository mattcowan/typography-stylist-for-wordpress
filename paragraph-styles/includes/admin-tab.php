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

// Font names, replacement mappings and manual-font IDs from core's public
// API (shared with the admin-card route, #221).
$font_context = Typost_Paragraph_Styles::build_admin_font_context( $instance );

// Edit form choices (#221). Features come from core, so the form offers the
// same list as the editors.
$form_features         = method_exists( $instance, 'get_available_features' ) ? (array) $instance->get_available_features() : array();
$form_feature_titles   = method_exists( $instance, 'get_feature_category_titles' ) ? (array) $instance->get_feature_category_titles() : array();
$form_features_grouped = array();
foreach ( $form_features as $feature ) {
	if ( ! isset( $feature['id'], $feature['name'] ) ) {
		continue;
	}
	$category = isset( $feature['category'] ) ? $feature['category'] : 'other';
	$form_features_grouped[ $category ][] = $feature;
}
?>

<div class="typost-ps-admin-tab">
	<?php // Every core tab opens with an h2; the style cards are h3s, so without
	      // this the page jumped from its h1 to h3 (QA finding A11Y-3, heading order). ?>
	<h2><?php esc_html_e( 'Paragraph Styles', 'typost-paragraph-styles' ); ?></h2>
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
				$props    = isset( $style['properties'] ) && is_array( $style['properties'] ) ? $style['properties'] : array();
				$style_id = intval( $style['id'] );
				$font_id  = isset( $props['fontId'] ) ? absint( $props['fontId'] ) : 0;
				$font     = Typost_Paragraph_Styles::resolve_font_label( $font_id, $font_context['lookup'], $font_context['mappings'] );
				$css_class = 'typost-ps-' . $style_id;
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
					<?php
					// Both renderers escape their own output; the admin-card
					// route returns the same markup after a save (#221).
					echo Typost_Paragraph_Styles::render_card_details( $props, $font ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped in render_card_details()

					// Always shown (#226). A font file downloads only while this
					// tab is open, and core's admin-page.js loads an Adobe Fonts
					// kit when a sample that needs it comes into view, from
					// data-typost-font-id (the font the style renders in, after
					// replacements).
					echo Typost_Paragraph_Styles::render_card_preview( $style_id, $font, $font_context['manual_ids'] ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped in render_card_preview()
					?>

					<?php // Filled from the template below when Edit is clicked (#221) ?>
					<div class="typost-ps-edit-form" style="display: none;"></div>
				</div>
			<?php endforeach; ?>
		<?php endif; ?>
	</div>

	<?php
	// The edit form (#221), cloned into a card by admin.js when its Edit
	// button is clicked, so the page carries one copy of the feature list
	// instead of one per style. IDs get the style ID appended on clone.
	// Every stored property is here except fontSizeUnit, which the form
	// keeps: a style that has a size keeps its unit, a size added to a
	// style without one takes the site's new-content unit.
	?>
	<template id="typost-ps-edit-form-template">
		<form class="typost-ps-edit-form-inner" novalidate>
			<p class="typost-ps-edit-field">
				<label for="typost-ps-edit-name"><?php esc_html_e( 'Name:', 'typost-paragraph-styles' ); ?></label>
				<input type="text" id="typost-ps-edit-name" class="typost-ps-edit-name" data-field="name" required />
			</p>

			<fieldset class="typost-ps-edit-group">
				<legend><?php esc_html_e( 'Font', 'typost-paragraph-styles' ); ?></legend>
				<div class="typost-ps-edit-row">
					<p class="typost-ps-edit-field">
						<label for="typost-ps-edit-font"><?php esc_html_e( 'Font family', 'typost-paragraph-styles' ); ?></label>
						<select id="typost-ps-edit-font" data-field="fontId">
							<option value="0"><?php esc_html_e( 'Default (theme font)', 'typost-paragraph-styles' ); ?></option>
							<?php foreach ( $font_context['options'] as $option_id => $option_name ) : ?>
								<option value="<?php echo esc_attr( $option_id ); ?>"><?php echo esc_html( $option_name ); ?></option>
							<?php endforeach; ?>
						</select>
					</p>
					<p class="typost-ps-edit-field">
						<label for="typost-ps-edit-weight"><?php esc_html_e( 'Weight', 'typost-paragraph-styles' ); ?></label>
						<select id="typost-ps-edit-weight" data-field="fontWeight">
							<option value=""><?php esc_html_e( 'Default', 'typost-paragraph-styles' ); ?></option>
							<?php foreach ( array( '100', '200', '300', '400', '500', '600', '700', '800', '900' ) as $weight_option ) : ?>
								<option value="<?php echo esc_attr( $weight_option ); ?>"><?php echo esc_html( $weight_option ); ?></option>
							<?php endforeach; ?>
						</select>
					</p>
					<p class="typost-ps-edit-field">
						<label for="typost-ps-edit-font-style"><?php esc_html_e( 'Font style', 'typost-paragraph-styles' ); ?></label>
						<select id="typost-ps-edit-font-style" data-field="fontStyle">
							<option value=""><?php esc_html_e( 'Default', 'typost-paragraph-styles' ); ?></option>
							<option value="normal"><?php esc_html_e( 'Normal (upright)', 'typost-paragraph-styles' ); ?></option>
							<option value="italic"><?php esc_html_e( 'Italic', 'typost-paragraph-styles' ); ?></option>
							<option value="oblique"><?php esc_html_e( 'Oblique', 'typost-paragraph-styles' ); ?></option>
						</select>
					</p>
				</div>
			</fieldset>

			<fieldset class="typost-ps-edit-group">
				<legend><?php esc_html_e( 'Size', 'typost-paragraph-styles' ); ?></legend>
				<p class="typost-ps-edit-field">
					<label for="typost-ps-edit-size-mode"><?php esc_html_e( 'Font size', 'typost-paragraph-styles' ); ?></label>
					<select id="typost-ps-edit-size-mode" data-field="sizeMode">
						<option value="inherit"><?php esc_html_e( 'Default', 'typost-paragraph-styles' ); ?></option>
						<option value="fixed"><?php esc_html_e( 'Fixed', 'typost-paragraph-styles' ); ?></option>
						<option value="responsive"><?php esc_html_e( 'Responsive (fluid)', 'typost-paragraph-styles' ); ?></option>
						<option value="fit"><?php esc_html_e( 'Fit to width', 'typost-paragraph-styles' ); ?></option>
					</select>
				</p>
				<div class="typost-ps-edit-row" data-show-for-size="fixed">
					<p class="typost-ps-edit-field">
						<label for="typost-ps-edit-size"><?php esc_html_e( 'Size (px)', 'typost-paragraph-styles' ); ?></label>
						<input type="number" id="typost-ps-edit-size" data-field="fontSize" min="1" step="any" />
					</p>
				</div>
				<div class="typost-ps-edit-row" data-show-for-size="responsive fit">
					<p class="typost-ps-edit-field">
						<label for="typost-ps-edit-size-min"><?php esc_html_e( 'Mobile (px)', 'typost-paragraph-styles' ); ?></label>
						<input type="number" id="typost-ps-edit-size-min" data-field="fontSizeMin" min="1" step="1" />
					</p>
					<p class="typost-ps-edit-field">
						<label for="typost-ps-edit-size-preferred"><?php esc_html_e( 'Intermediate (px)', 'typost-paragraph-styles' ); ?></label>
						<input type="number" id="typost-ps-edit-size-preferred" data-field="fontSizePreferred" min="1" step="1" />
					</p>
					<p class="typost-ps-edit-field">
						<label for="typost-ps-edit-size-max"><?php esc_html_e( 'Large (px)', 'typost-paragraph-styles' ); ?></label>
						<input type="number" id="typost-ps-edit-size-max" data-field="fontSizeMax" min="1" step="1" />
					</p>
				</div>
				<p class="typost-ps-edit-help" data-show-for-size="fit"><?php esc_html_e( 'Fit to width sizes each line to fill the block. The three sizes above are the fallback for browsers without container queries, and for text styled inline.', 'typost-paragraph-styles' ); ?></p>
				<div class="typost-ps-edit-row" data-show-for-size="fit">
					<p class="typost-ps-edit-field">
						<label for="typost-ps-edit-fit-max"><?php esc_html_e( 'Maximum size (px, 0 = no limit)', 'typost-paragraph-styles' ); ?></label>
						<input type="number" id="typost-ps-edit-fit-max" data-field="fitMaxSize" min="0" step="1" />
					</p>
				</div>
			</fieldset>

			<fieldset class="typost-ps-edit-group">
				<legend><?php esc_html_e( 'Spacing', 'typost-paragraph-styles' ); ?></legend>
				<div class="typost-ps-edit-row">
					<p class="typost-ps-edit-field">
						<label for="typost-ps-edit-letter-spacing"><?php esc_html_e( 'Letter spacing (1/1000 em)', 'typost-paragraph-styles' ); ?></label>
						<input type="number" id="typost-ps-edit-letter-spacing" data-field="letterSpacing" min="-200" max="200" step="1" />
					</p>
					<p class="typost-ps-edit-field">
						<label for="typost-ps-edit-line-height"><?php esc_html_e( 'Line height (0 = default)', 'typost-paragraph-styles' ); ?></label>
						<input type="number" id="typost-ps-edit-line-height" data-field="lineHeight" min="0" max="5" step="0.05" />
					</p>
					<p class="typost-ps-edit-field">
						<label for="typost-ps-edit-hang"><?php esc_html_e( 'First letter hang (em, 0–1)', 'typost-paragraph-styles' ); ?></label>
						<input type="number" id="typost-ps-edit-hang" data-field="initialHang" min="0" max="1" step="0.01" />
					</p>
				</div>
			</fieldset>

			<fieldset class="typost-ps-edit-group">
				<legend><?php esc_html_e( 'Case', 'typost-paragraph-styles' ); ?></legend>
				<div class="typost-ps-edit-row">
					<p class="typost-ps-edit-field">
						<label for="typost-ps-edit-case"><?php esc_html_e( 'Case', 'typost-paragraph-styles' ); ?></label>
						<select id="typost-ps-edit-case" data-field="textCase">
							<option value=""><?php esc_html_e( 'Default', 'typost-paragraph-styles' ); ?></option>
							<?php foreach ( Typost_Paragraph_Styles::text_case_labels() as $case_value => $case_label ) : ?>
								<option value="<?php echo esc_attr( $case_value ); ?>"><?php echo esc_html( $case_label ); ?></option>
							<?php endforeach; ?>
						</select>
					</p>
					<p class="typost-ps-edit-field typost-ps-edit-checkbox" data-show-for-case="small-caps all-small-caps">
						<input type="checkbox" id="typost-ps-edit-fake-small-caps" data-field="fakeSmallCaps" />
						<label for="typost-ps-edit-fake-small-caps"><?php esc_html_e( 'Allow fake small caps when the font has none', 'typost-paragraph-styles' ); ?></label>
					</p>
				</div>
			</fieldset>

			<fieldset class="typost-ps-edit-group">
				<legend><?php esc_html_e( 'OpenType features', 'typost-paragraph-styles' ); ?></legend>
				<div class="typost-ps-edit-features">
					<?php foreach ( $form_features_grouped as $category => $category_features ) : ?>
						<div class="typost-ps-edit-feature-group" role="group" aria-labelledby="typost-ps-edit-features-<?php echo esc_attr( $category ); ?>">
							<p class="typost-ps-edit-feature-group-title" id="typost-ps-edit-features-<?php echo esc_attr( $category ); ?>">
								<?php echo esc_html( isset( $form_feature_titles[ $category ] ) ? $form_feature_titles[ $category ] : $category ); ?>
							</p>
							<?php foreach ( $category_features as $feature ) :
								$feature_tag = sanitize_key( $feature['id'] );
								// Core's feature names come through esc_html__(); decode so they are escaped once.
								$feature_name = wp_specialchars_decode( $feature['name'], ENT_QUOTES );
							?>
								<p class="typost-ps-edit-checkbox">
									<input type="checkbox" id="typost-ps-edit-feature-<?php echo esc_attr( $feature_tag ); ?>" data-feature value="<?php echo esc_attr( $feature_tag ); ?>" />
									<label for="typost-ps-edit-feature-<?php echo esc_attr( $feature_tag ); ?>"><?php echo esc_html( $feature_name ); ?> <code><?php echo esc_html( $feature_tag ); ?></code></label>
								</p>
							<?php endforeach; ?>
						</div>
					<?php endforeach; ?>
					<?php // Features the style stores that are not in the list above are added here, checked ?>
					<div class="typost-ps-edit-feature-group" data-extra-features hidden></div>
				</div>
			</fieldset>

			<fieldset class="typost-ps-edit-group">
				<legend><?php esc_html_e( 'Variable font axes', 'typost-paragraph-styles' ); ?></legend>
				<p class="typost-ps-edit-field">
					<label for="typost-ps-edit-axes"><?php esc_html_e( 'Axis settings', 'typost-paragraph-styles' ); ?></label>
					<input type="text" id="typost-ps-edit-axes" data-field="fontVariationSettings" aria-describedby="typost-ps-edit-axes-help" spellcheck="false" />
					<span class="typost-ps-edit-help" id="typost-ps-edit-axes-help">
						<?php
						/* translators: %s: example of font variation settings, such as "wght" 650, "wdth" 80 */
						printf( esc_html__( 'Four-letter axis tags in quotes, each followed by a number, separated by commas. Example: %s. Leave empty for none.', 'typost-paragraph-styles' ), '<code>"wght" 650, "wdth" 80</code>' );
						?>
					</span>
				</p>
			</fieldset>

			<p class="typost-ps-edit-error" role="alert" hidden></p>

			<div class="typost-ps-edit-actions">
				<button type="submit" class="button button-primary typost-ps-save-edit-btn">
					<?php esc_html_e( 'Save', 'typost-paragraph-styles' ); ?>
				</button>
				<button type="button" class="button typost-ps-cancel-edit-btn">
					<?php esc_html_e( 'Cancel', 'typost-paragraph-styles' ); ?>
				</button>
			</div>
		</form>
	</template>
</div>

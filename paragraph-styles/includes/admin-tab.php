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

// Text color and outline choices (#215): the theme's palette first. A
// palette color is stored as a reference to the palette, so the style
// follows the theme when it changes the color.
$form_palette        = Typost_Paragraph_Styles::get_color_palette();
$form_palette_groups = array(
	'theme'   => __( 'Theme palette', 'typost-paragraph-styles' ),
	'custom'  => __( 'Site palette', 'typost-paragraph-styles' ),
	'default' => __( 'Default palette', 'typost-paragraph-styles' ),
);
$render_palette_options = function () use ( $form_palette, $form_palette_groups ) {
	foreach ( $form_palette_groups as $origin => $group_label ) {
		$entries = array_filter(
			$form_palette,
			function ( $entry ) use ( $origin ) {
				return $origin === $entry['origin'];
			}
		);
		if ( empty( $entries ) ) {
			continue;
		}
		echo '<optgroup label="' . esc_attr( $group_label ) . '">';
		foreach ( $entries as $entry ) {
			/* translators: 1: palette color name, 2: its color value */
			$option_label = sprintf( __( '%1$s (%2$s)', 'typost-paragraph-styles' ), $entry['name'], $entry['color'] );
			echo '<option value="' . esc_attr( 'preset:' . $entry['slug'] ) . '">' . esc_html( $option_label ) . '</option>';
		}
		echo '</optgroup>';
	}
};
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
				$style_id  = intval( $style['id'] );
				$css_class = 'typost-ps-' . $style_id;
				// Resolved values for a style based on another (#200)
				$card_parts = Typost_Paragraph_Styles::render_admin_card_parts( $style, $styles, $font_context );
			?>
				<div class="typost-ps-style-card" data-style-id="<?php echo esc_attr( $style_id ); ?>">
					<div class="typost-ps-style-card-header">
						<h3 class="typost-ps-style-name"><?php echo esc_html( $style['name'] ); ?></h3>
						<code class="typost-ps-css-class">.<?php echo esc_html( $css_class ); ?></code>
						<div class="typost-ps-style-actions">
							<?php // The style name is in each button's accessible name (#295); admin.js updates it after a rename ?>
							<button type="button" class="button typost-ps-edit-btn" data-style-id="<?php echo esc_attr( $style_id ); ?>"
								aria-label="<?php
								/* translators: %s: style name */
								echo esc_attr( sprintf( __( 'Edit “%s”', 'typost-paragraph-styles' ), $style['name'] ) );
								?>">
								<?php esc_html_e( 'Edit', 'typost-paragraph-styles' ); ?>
							</button>
							<button type="button" class="button typost-ps-delete-btn" data-style-id="<?php echo esc_attr( $style_id ); ?>"
								aria-label="<?php
								/* translators: %s: style name */
								echo esc_attr( sprintf( __( 'Delete “%s”', 'typost-paragraph-styles' ), $style['name'] ) );
								?>">
								<?php esc_html_e( 'Delete', 'typost-paragraph-styles' ); ?>
							</button>
						</div>
					</div>
					<?php
					// Both renderers escape their own output; the admin-card
					// route returns the same markup after a save (#221).
					echo $card_parts['details']; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped in render_card_details()

					// Always shown (#226). A font file downloads only while this
					// tab is open, and core's admin-page.js loads an Adobe Fonts
					// kit when a sample that needs it comes into view, from
					// data-typost-font-id (the font the style renders in, after
					// replacements).
					echo $card_parts['preview']; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped in render_card_preview()
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

			<?php
			// Based On (#200). admin.js adds every style except the edited
			// one and the styles based on it (choosing one would loop).
			?>
			<p class="typost-ps-edit-field typost-ps-edit-based-on">
				<label for="typost-ps-edit-based-on"><?php esc_html_e( 'Based on', 'typost-paragraph-styles' ); ?></label>
				<select id="typost-ps-edit-based-on" data-field="basedOn" aria-describedby="typost-ps-edit-based-on-help">
					<option value="0"><?php esc_html_e( 'None', 'typost-paragraph-styles' ); ?></option>
				</select>
				<span class="typost-ps-edit-help" id="typost-ps-edit-based-on-help"><?php esc_html_e( 'The style uses the chosen style’s value for every setting it does not set itself, and follows later changes to it. Settings that match the chosen style become inherited. None keeps the current look as the style’s own settings.', 'typost-paragraph-styles' ); ?></span>
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

			<?php
			// Alignment, word spacing and line breaking (#207). Fit to width
			// sets each line's width itself, so a fit style writes none of
			// them and the fields are hidden in fit mode.
			?>
			<fieldset class="typost-ps-edit-group">
				<legend><?php esc_html_e( 'Alignment and line breaking', 'typost-paragraph-styles' ); ?></legend>
				<p class="typost-ps-edit-help" data-show-for-size="fit"><?php esc_html_e( 'Fit to width sets the width of each line itself, so a Fit to width style does not use alignment, word spacing or line breaking.', 'typost-paragraph-styles' ); ?></p>
				<div class="typost-ps-edit-row" data-show-for-size="inherit fixed responsive">
					<p class="typost-ps-edit-field">
						<label for="typost-ps-edit-alignment"><?php esc_html_e( 'Alignment', 'typost-paragraph-styles' ); ?></label>
						<select id="typost-ps-edit-alignment" data-field="alignment" aria-describedby="typost-ps-edit-alignment-help">
							<option value=""><?php esc_html_e( 'Default', 'typost-paragraph-styles' ); ?></option>
							<?php foreach ( Typost_Paragraph_Styles::alignment_labels() as $align_value => $align_label ) : ?>
								<option value="<?php echo esc_attr( $align_value ); ?>"><?php echo esc_html( $align_label ); ?></option>
							<?php endforeach; ?>
						</select>
						<span class="typost-ps-edit-help" id="typost-ps-edit-alignment-help"><?php esc_html_e( 'Start and End follow the text direction. A block’s own alignment setting overrides this.', 'typost-paragraph-styles' ); ?></span>
					</p>
					<p class="typost-ps-edit-field" data-show-for-align="justify">
						<label for="typost-ps-edit-align-last"><?php esc_html_e( 'Last line', 'typost-paragraph-styles' ); ?></label>
						<select id="typost-ps-edit-align-last" data-field="alignLast">
							<?php foreach ( Typost_Paragraph_Styles::alignment_labels() as $align_value => $align_label ) : ?>
								<option value="<?php echo esc_attr( 'start' === $align_value ? '' : $align_value ); ?>"><?php echo esc_html( $align_label ); ?></option>
							<?php endforeach; ?>
						</select>
					</p>
				</div>
				<p class="typost-ps-edit-help typost-ps-edit-justify-note" id="typost-ps-edit-justify-note" data-show-for-align="justify"><?php esc_html_e( 'Justified text has uneven gaps between words, which makes it harder to read for some people, including many people with dyslexia. Consider turning on hyphenation, which makes the gaps smaller.', 'typost-paragraph-styles' ); ?></p>
				<div class="typost-ps-edit-row" data-show-for-size="inherit fixed responsive">
					<p class="typost-ps-edit-field">
						<label for="typost-ps-edit-word-spacing"><?php esc_html_e( 'Word spacing (1/1000 em)', 'typost-paragraph-styles' ); ?></label>
						<input type="number" id="typost-ps-edit-word-spacing" data-field="wordSpacing" min="-500" max="1000" step="1" />
					</p>
					<p class="typost-ps-edit-field">
						<label for="typost-ps-edit-text-wrap"><?php esc_html_e( 'Line breaking', 'typost-paragraph-styles' ); ?></label>
						<select id="typost-ps-edit-text-wrap" data-field="textWrap" aria-describedby="typost-ps-edit-text-wrap-help">
							<option value=""><?php esc_html_e( 'Normal', 'typost-paragraph-styles' ); ?></option>
							<?php foreach ( Typost_Paragraph_Styles::text_wrap_labels() as $wrap_value => $wrap_label ) : ?>
								<option value="<?php echo esc_attr( $wrap_value ); ?>"><?php echo esc_html( $wrap_label ); ?></option>
							<?php endforeach; ?>
						</select>
						<span class="typost-ps-edit-help" id="typost-ps-edit-text-wrap-help"><?php esc_html_e( 'Balance lines gives the lines of a short heading similar lengths. Avoid short last lines suits body text. A browser that does not support the choice uses normal line breaks.', 'typost-paragraph-styles' ); ?></span>
					</p>
				</div>
			</fieldset>

			<?php
			// Hyphenation (#208). Off by default; the letter limits and the
			// hyphen character show only while it is on. Fit to width keeps
			// each line on one line, so a fit style writes none of it.
			?>
			<fieldset class="typost-ps-edit-group">
				<legend><?php esc_html_e( 'Hyphenation', 'typost-paragraph-styles' ); ?></legend>
				<p class="typost-ps-edit-help" data-show-for-size="fit"><?php esc_html_e( 'Fit to width keeps each line on one line, so a Fit to width style does not use hyphenation.', 'typost-paragraph-styles' ); ?></p>
				<div data-show-for-size="inherit fixed responsive">
					<p class="typost-ps-edit-checkbox">
						<input type="checkbox" id="typost-ps-edit-hyphens" data-field="hyphens" aria-describedby="typost-ps-edit-hyphens-help" />
						<label for="typost-ps-edit-hyphens"><?php esc_html_e( 'Hyphenate', 'typost-paragraph-styles' ); ?></label>
						<span class="typost-ps-edit-help" id="typost-ps-edit-hyphens-help"><?php esc_html_e( 'Breaks long words at line ends, which evens out the gaps in justified or narrow text. Frequent hyphens make some readers, including many people with dyslexia, put words back together, so use it mainly where it helps. Browsers hyphenate only when they know the page language and have a dictionary for it, and the dictionaries differ by browser; Chrome does not hyphenate capitalized English words. The hyphens are not added to the text, so screen readers and copied text are unchanged. Soft hyphens typed in the text work with hyphenation off too.', 'typost-paragraph-styles' ); ?></span>
					</p>
					<div class="typost-ps-edit-row" data-show-for-hyphens="auto">
						<p class="typost-ps-edit-field">
							<label for="typost-ps-edit-hyphenate-limit-word"><?php esc_html_e( 'Shortest word to hyphenate (letters)', 'typost-paragraph-styles' ); ?></label>
							<input type="number" id="typost-ps-edit-hyphenate-limit-word" data-field="hyphenateLimitWord" min="1" max="<?php echo esc_attr( Typost_Paragraph_Styles::HYPHENATE_LIMIT_MAX ); ?>" step="1" placeholder="<?php esc_attr_e( 'Auto', 'typost-paragraph-styles' ); ?>" aria-describedby="typost-ps-edit-hyphenate-limits-help" />
						</p>
						<p class="typost-ps-edit-field">
							<label for="typost-ps-edit-hyphenate-limit-before"><?php esc_html_e( 'Fewest letters before a hyphen', 'typost-paragraph-styles' ); ?></label>
							<input type="number" id="typost-ps-edit-hyphenate-limit-before" data-field="hyphenateLimitBefore" min="1" max="<?php echo esc_attr( Typost_Paragraph_Styles::HYPHENATE_LIMIT_MAX ); ?>" step="1" placeholder="<?php esc_attr_e( 'Auto', 'typost-paragraph-styles' ); ?>" aria-describedby="typost-ps-edit-hyphenate-limits-help" />
						</p>
						<p class="typost-ps-edit-field">
							<label for="typost-ps-edit-hyphenate-limit-after"><?php esc_html_e( 'Fewest letters after a hyphen', 'typost-paragraph-styles' ); ?></label>
							<input type="number" id="typost-ps-edit-hyphenate-limit-after" data-field="hyphenateLimitAfter" min="1" max="<?php echo esc_attr( Typost_Paragraph_Styles::HYPHENATE_LIMIT_MAX ); ?>" step="1" placeholder="<?php esc_attr_e( 'Auto', 'typost-paragraph-styles' ); ?>" aria-describedby="typost-ps-edit-hyphenate-limits-help" />
						</p>
						<p class="typost-ps-edit-field">
							<label for="typost-ps-edit-hyphenate-character"><?php esc_html_e( 'Hyphen character', 'typost-paragraph-styles' ); ?></label>
							<input type="text" id="typost-ps-edit-hyphenate-character" data-field="hyphenateCharacter" maxlength="8" size="4" placeholder="<?php esc_attr_e( 'Default', 'typost-paragraph-styles' ); ?>" aria-describedby="typost-ps-edit-hyphenate-character-help" />
							<span class="typost-ps-edit-help" id="typost-ps-edit-hyphenate-character-help"><?php esc_html_e( 'Empty uses the hyphen of the language. Up to 4 characters, with no quotes, backslashes, angle brackets, braces or semicolons.', 'typost-paragraph-styles' ); ?></span>
						</p>
					</div>
					<p class="typost-ps-edit-help" id="typost-ps-edit-hyphenate-limits-help" data-show-for-hyphens="auto"><?php esc_html_e( 'Empty means the browser decides. Safari ignores these limits and uses its own.', 'typost-paragraph-styles' ); ?></p>
				</div>
			</fieldset>

			<?php
			// Indents and paragraph spacing (#199). Each value is a number and
			// a unit (em or px); 0 or empty is none. Fit to width writes no
			// indents (each line fills the width), so those fields are hidden
			// in fit mode; spacing stays.
			$length_fields = array(
				array(
					'key'   => 'indentStart',
					'id'    => 'indent-start',
					'label' => __( 'Left indent', 'typost-paragraph-styles' ),
					'unit'  => __( 'Left indent unit', 'typost-paragraph-styles' ),
					'min'   => '0',
					'fit'   => false,
				),
				array(
					'key'   => 'indentEnd',
					'id'    => 'indent-end',
					'label' => __( 'Right indent', 'typost-paragraph-styles' ),
					'unit'  => __( 'Right indent unit', 'typost-paragraph-styles' ),
					'min'   => '0',
					'fit'   => false,
				),
				array(
					'key'   => 'firstLineIndent',
					'id'    => 'first-line-indent',
					'label' => __( 'First line indent', 'typost-paragraph-styles' ),
					'unit'  => __( 'First line indent unit', 'typost-paragraph-styles' ),
					'min'   => '',
					'fit'   => false,
					'help'  => __( 'A negative value gives a hanging indent. A first line indent turns the first letter hang off.', 'typost-paragraph-styles' ),
				),
				array(
					'key'   => 'spaceBefore',
					'id'    => 'space-before',
					'label' => __( 'Space before', 'typost-paragraph-styles' ),
					'unit'  => __( 'Space before unit', 'typost-paragraph-styles' ),
					'min'   => '0',
					'fit'   => true,
				),
				array(
					'key'   => 'spaceAfter',
					'id'    => 'space-after',
					'label' => __( 'Space after', 'typost-paragraph-styles' ),
					'unit'  => __( 'Space after unit', 'typost-paragraph-styles' ),
					'min'   => '0',
					'fit'   => true,
				),
			);
			?>
			<fieldset class="typost-ps-edit-group">
				<legend><?php esc_html_e( 'Indents and spacing', 'typost-paragraph-styles' ); ?></legend>
				<p class="typost-ps-edit-help" id="typost-ps-edit-layout-help"><?php esc_html_e( 'Indents and spacing apply to whole paragraphs and headings. They have no effect when the style is applied to selected text. Left and right follow the text direction: in right-to-left text, the left indent is on the right. On a core Paragraph or Heading block, the block’s own spacing or text indent setting overrides these.', 'typost-paragraph-styles' ); ?></p>
				<p class="typost-ps-edit-help" data-show-for-size="fit"><?php esc_html_e( 'Fit to width sets the width of each line itself, so a Fit to width style does not use indents.', 'typost-paragraph-styles' ); ?></p>
				<div class="typost-ps-edit-row">
					<?php foreach ( $length_fields as $length_field ) : ?>
						<p class="typost-ps-edit-field"<?php echo $length_field['fit'] ? '' : ' data-show-for-size="inherit fixed responsive"'; ?>>
							<label for="typost-ps-edit-<?php echo esc_attr( $length_field['id'] ); ?>"><?php echo esc_html( $length_field['label'] ); ?></label>
							<span class="typost-ps-edit-length">
								<input type="number" id="typost-ps-edit-<?php echo esc_attr( $length_field['id'] ); ?>" data-field="<?php echo esc_attr( $length_field['key'] ); ?>"<?php echo '' === $length_field['min'] ? '' : ' min="' . esc_attr( $length_field['min'] ) . '"'; ?> step="any"<?php echo isset( $length_field['help'] ) ? ' aria-describedby="typost-ps-edit-' . esc_attr( $length_field['id'] ) . '-help"' : ''; ?> />
								<select id="typost-ps-edit-<?php echo esc_attr( $length_field['id'] ); ?>-unit" data-field="<?php echo esc_attr( $length_field['key'] ); ?>Unit" aria-label="<?php echo esc_attr( $length_field['unit'] ); ?>">
									<option value="em">em</option>
									<option value="px">px</option>
								</select>
							</span>
							<?php if ( isset( $length_field['help'] ) ) : ?>
								<span class="typost-ps-edit-help" id="typost-ps-edit-<?php echo esc_attr( $length_field['id'] ); ?>-help"><?php echo esc_html( $length_field['help'] ); ?></span>
							<?php endif; ?>
						</p>
					<?php endforeach; ?>
				</div>
				<p class="typost-ps-edit-checkbox" data-show-for-size="inherit fixed responsive">
					<input type="checkbox" id="typost-ps-edit-indent-after-same" data-field="indentAfterSame" aria-describedby="typost-ps-edit-indent-after-same-help" />
					<label for="typost-ps-edit-indent-after-same"><?php esc_html_e( 'Indent the first line only after a paragraph with the same style', 'typost-paragraph-styles' ); ?></label>
					<span class="typost-ps-edit-help" id="typost-ps-edit-indent-after-same-help"><?php esc_html_e( 'The book convention: the first paragraph after a heading has no indent. Applies to a positive first line indent only.', 'typost-paragraph-styles' ); ?></span>
				</p>
			</fieldset>

			<?php
			// Text color and outline (#215). admin.js fills the selects from
			// the stored color (a palette color the palette no longer has is
			// added), shows the custom fields for Custom, and keeps the
			// contrast notice up to date.
			?>
			<fieldset class="typost-ps-edit-group typost-ps-edit-colors">
				<legend><?php esc_html_e( 'Color and outline', 'typost-paragraph-styles' ); ?></legend>
				<div class="typost-ps-edit-row">
					<p class="typost-ps-edit-field">
						<label for="typost-ps-edit-text-color"><?php esc_html_e( 'Text color', 'typost-paragraph-styles' ); ?></label>
						<span class="typost-ps-edit-color-control">
							<span class="typost-ps-color-swatch" data-swatch-for="textColor" aria-hidden="true"></span>
							<select id="typost-ps-edit-text-color" data-field="textColor" aria-describedby="typost-ps-edit-text-color-help">
								<option value=""><?php esc_html_e( 'Default (theme color)', 'typost-paragraph-styles' ); ?></option>
								<?php $render_palette_options(); ?>
								<option value="custom"><?php esc_html_e( 'Custom color', 'typost-paragraph-styles' ); ?></option>
								<option value="transparent"><?php esc_html_e( 'Transparent (outline only)', 'typost-paragraph-styles' ); ?></option>
							</select>
						</span>
						<span class="typost-ps-edit-help" id="typost-ps-edit-text-color-help"><?php esc_html_e( 'A palette color follows the theme: when the theme changes that color, every style that uses it changes too. A block’s own text color setting overrides this.', 'typost-paragraph-styles' ); ?></span>
					</p>
					<p class="typost-ps-edit-field" data-show-for-color="textColor">
						<label for="typost-ps-edit-text-color-custom"><?php esc_html_e( 'Custom text color', 'typost-paragraph-styles' ); ?></label>
						<span class="typost-ps-edit-color-control">
							<input type="text" id="typost-ps-edit-text-color-custom" data-field="textColorCustom" class="typost-ps-edit-hex" spellcheck="false" autocomplete="off" aria-describedby="typost-ps-edit-hex-help" />
							<input type="color" data-color-picker-for="textColorCustom" aria-label="<?php esc_attr_e( 'Pick the custom text color', 'typost-paragraph-styles' ); ?>" />
						</span>
					</p>
				</div>
				<div class="typost-ps-edit-row">
					<p class="typost-ps-edit-field">
						<label for="typost-ps-edit-stroke-width"><?php esc_html_e( 'Outline width (px, 0 = none)', 'typost-paragraph-styles' ); ?></label>
						<input type="number" id="typost-ps-edit-stroke-width" data-field="textStrokeWidth" min="0" max="<?php echo esc_attr( Typost_Paragraph_Styles::TEXT_STROKE_MAX ); ?>" step="0.1" />
					</p>
					<p class="typost-ps-edit-field">
						<label for="typost-ps-edit-stroke-color"><?php esc_html_e( 'Outline color', 'typost-paragraph-styles' ); ?></label>
						<span class="typost-ps-edit-color-control">
							<span class="typost-ps-color-swatch" data-swatch-for="textStrokeColor" aria-hidden="true"></span>
							<select id="typost-ps-edit-stroke-color" data-field="textStrokeColor">
								<option value=""><?php esc_html_e( 'Same as the text', 'typost-paragraph-styles' ); ?></option>
								<?php $render_palette_options(); ?>
								<option value="custom"><?php esc_html_e( 'Custom color', 'typost-paragraph-styles' ); ?></option>
							</select>
						</span>
					</p>
					<p class="typost-ps-edit-field" data-show-for-color="textStrokeColor">
						<label for="typost-ps-edit-stroke-color-custom"><?php esc_html_e( 'Custom outline color', 'typost-paragraph-styles' ); ?></label>
						<span class="typost-ps-edit-color-control">
							<input type="text" id="typost-ps-edit-stroke-color-custom" data-field="textStrokeColorCustom" class="typost-ps-edit-hex" spellcheck="false" autocomplete="off" aria-describedby="typost-ps-edit-hex-help" />
							<input type="color" data-color-picker-for="textStrokeColorCustom" aria-label="<?php esc_attr_e( 'Pick the custom outline color', 'typost-paragraph-styles' ); ?>" />
						</span>
					</p>
					<p class="typost-ps-edit-field">
						<label for="typost-ps-edit-stroke-position"><?php esc_html_e( 'Outline position', 'typost-paragraph-styles' ); ?></label>
						<select id="typost-ps-edit-stroke-position" data-field="textStrokePosition" aria-describedby="typost-ps-edit-stroke-position-help">
							<option value=""><?php esc_html_e( 'On top of the fill', 'typost-paragraph-styles' ); ?></option>
							<option value="behind"><?php esc_html_e( 'Behind the fill', 'typost-paragraph-styles' ); ?></option>
						</select>
						<span class="typost-ps-edit-help" id="typost-ps-edit-stroke-position-help"><?php esc_html_e( 'The outline is centered on the edge of each letter, so on top of the fill a thick outline makes letters look thinner. Behind the fill keeps their shape.', 'typost-paragraph-styles' ); ?></span>
					</p>
				</div>
				<p class="typost-ps-edit-help" id="typost-ps-edit-hex-help"><?php esc_html_e( 'A hex color such as #c00 or #cc0000. Add two digits for transparency: #cc000080 is half transparent.', 'typost-paragraph-styles' ); ?></p>
				<p class="typost-ps-edit-help"><?php esc_html_e( 'In Windows High Contrast mode (forced colors), the browser draws text and outline in the system text color, so outline-only text shows as solid text.', 'typost-paragraph-styles' ); ?></p>
				<?php // A polite live region, empty while the colors meet WCAG 1.4.3; admin.js fills it ?>
				<p class="typost-ps-edit-contrast" id="typost-ps-edit-contrast" role="status"></p>
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

			<?php
			// GREP styles (#196). Only where the render-time engine runs
			// (WordPress 6.9+). admin.js builds one row per rule from
			// typostPSAdmin.grep: pattern, custom expression, style, and Move
			// up / Move down / Remove buttons.
			if ( Typost_Paragraph_Styles::grep_supported() ) :
				?>
			<fieldset class="typost-ps-edit-group typost-ps-edit-grep" data-grep>
				<legend><?php esc_html_e( 'GREP styles', 'typost-paragraph-styles' ); ?></legend>
				<p class="typost-ps-edit-help" id="typost-ps-edit-grep-help">
					<?php esc_html_e( 'Apply another style to the text that matches a pattern, wherever this style is used on a whole block. The saved text does not change. Where two rules match the same text, the rule higher in the list wins. Text in fit to width blocks and in code is not matched.', 'typost-paragraph-styles' ); ?>
				</p>
				<ol class="typost-ps-grep-rules" data-grep-rules></ol>
				<p class="typost-ps-grep-empty" data-grep-empty><?php esc_html_e( 'No GREP rules.', 'typost-paragraph-styles' ); ?></p>
				<p>
					<button type="button" class="button typost-ps-grep-add" aria-describedby="typost-ps-edit-grep-help"><?php esc_html_e( 'Add GREP rule', 'typost-paragraph-styles' ); ?></button>
				</p>
			</fieldset>
			<?php endif; ?>

			<?php // The id lets showFormError() add the message to the failing field's description ?>
			<p class="typost-ps-edit-error" id="typost-ps-edit-error" role="alert" hidden></p>

			<div class="typost-ps-edit-actions">
				<button type="submit" class="button button-primary typost-ps-save-edit-btn">
					<?php esc_html_e( 'Save', 'typost-paragraph-styles' ); ?>
				</button>
				<button type="button" class="button typost-ps-cancel-edit-btn">
					<?php esc_html_e( 'Cancel', 'typost-paragraph-styles' ); ?>
				</button>
				<?php // Shown for a style based on another that sets values of its own (#200) ?>
				<button type="button" class="button typost-ps-reset-base-btn" hidden>
					<?php esc_html_e( 'Reset to Base', 'typost-paragraph-styles' ); ?>
				</button>
			</div>
		</form>
	</template>
</div>

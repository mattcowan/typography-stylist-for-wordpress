<?php
/**
 * Typography Stylist - Paragraph Styles module
 *
 * Save and load paragraph style presets for Typography Stylist. Named
 * typography configurations (font, weight, size, spacing, OpenType features,
 * variable font axes) applied from a dropdown in both editors, rendered via
 * CSS class on the frontend.
 *
 * Structured like the Glyphs Panel and Variable Fonts modules. This file
 * intentionally has NO plugin header and no plugins_loaded bootstrap — it is
 * required from typost_init() in typography-stylist.php, guarded by
 * class_exists() so the final class below can never fatally redeclare. The
 * module keeps its own text domain and consumes only core's public
 * extension API.
 *
 * @since 2.3.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// Guarded like the other bundled modules, so re-entry can never redefine these.
if ( ! defined( 'TYPOST_PS_VERSION' ) ) {
	define( 'TYPOST_PS_VERSION', '1.2.5' );
	define( 'TYPOST_PS_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
	define( 'TYPOST_PS_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
}

/**
 * Typography Stylist - Paragraph Styles
 *
 * Singleton class that hooks into Typography Stylist's extensibility system
 * to provide paragraph style presets with CSS class-based rendering.
 */
require_once __DIR__ . '/includes/class-typost-ps-transfer.php';
require_once __DIR__ . '/includes/class-typost-ps-text-ranges.php';
require_once __DIR__ . '/includes/class-typost-ps-grep.php';

final class Typost_Paragraph_Styles {

	/** @var self|null */
	private static $instance = null;

	/** @var bool Whether the style CSS was already added to the admin page */
	private $admin_style_css_added = false;

	/** @var array<string,bool> Ids of the styles whose frontend rules this request printed, as keys */
	private $printed_style_ids = array();

	/** @var string[] Style references found in blocks as they rendered */
	private $rendered_style_refs = array();

	/** @var bool Whether the editor scripts were enqueued on a frontend page */
	private $editor_on_frontend = false;

	/** @var string[]|null Memoized typost_force_enqueue_paragraph_style_ids result */
	private $forced_style_refs = null;

	/** @var array|null Memoized GREP rules by style reference (#196), see get_grep_style_map() */
	private $grep_style_map = null;

	/**
	 * Blocks whose styled element GREP rules apply to (#196): the core
	 * blocks that take a style through their className (#219) and the
	 * Typography Stylist block.
	 */
	const GREP_BLOCKS = array( 'core/paragraph', 'core/heading', 'typost/block' );

	/** @var string Option key for storing paragraph styles */
	const OPTION_KEY = 'typost_paragraph_styles';

	/** @var string Option key for the next sequential ID counter */
	const COUNTER_KEY = 'typost_paragraph_styles_next_id';

	/** @var string Transient key for caching styles data */
	const CACHE_KEY = 'typost_paragraph_styles_cache';

	/** @var string Transient key for caching generated CSS */
	// Renamed when the generated CSS changes (v2: #315), so an update never
	// serves CSS cached by the previous version for up to 12 hours.
	const CSS_CACHE_KEY = 'typost_paragraph_styles_css_v2';

	/** @var string Option storing whether the block toolbar gets a direct styles button */
	const TOOLBAR_OPTION = 'typost_ps_toolbar_button';

	/** @var string Flag: the one-time switch that turned the toolbar button on has run (#322) */
	const TOOLBAR_DEFAULT_ON_FLAG = 'typost_ps_toolbar_button_default_on';

	/** @var string REST namespace (shared with core plugin) */
	const REST_NAMESPACE = 'typost/v1';

	/** @var int Viewport breakpoints matching core plugin */
	const RESPONSIVE_FONT_MIN_VIEWPORT = 320;
	const RESPONSIVE_FONT_MAX_VIEWPORT = 1920;

	/** @var int Largest hanging-initial value in em (INITIAL_HANG_MAX in core utils.js) */
	const HANG_MAX = 1;

	/**
	 * @var string[] Case values a style can store (#214); absent = Default.
	 * Mirrors TEXT_CASE_VALUES in core utils.js and ps-utils.js.
	 */
	const TEXT_CASE_VALUES = array( 'none', 'uppercase', 'lowercase', 'capitalize', 'small-caps', 'all-small-caps' );

	/**
	 * @var string[] Alignment values a style can store (#207); absent =
	 * Default (the block's or the theme's). Start and end follow the text
	 * direction. Mirrors ALIGNMENT_VALUES in ps-utils.js.
	 */
	const ALIGNMENT_VALUES = array( 'start', 'center', 'end', 'justify' );

	/**
	 * @var string[] Last line alignment values for justified text (#207);
	 * absent = start, the browser's default for justified text. Mirrors
	 * ALIGN_LAST_VALUES in ps-utils.js.
	 */
	const ALIGN_LAST_VALUES = array( 'center', 'end', 'justify' );

	/**
	 * @var string[] Line breaking values (#207), written as `text-wrap`;
	 * absent = normal. Mirrors TEXT_WRAP_VALUES in ps-utils.js.
	 */
	const TEXT_WRAP_VALUES = array( 'balance', 'pretty' );

	/**
	 * Guard on the alignment rule (#207): a block that sets its own
	 * alignment keeps it. The Typography Stylist block writes it as an
	 * inline text-align (also under a style; `text-align:center` saved,
	 * `text-align: center` in the editor), core Paragraph and Heading
	 * blocks as a has-text-align-* class. Only a text-align declaration
	 * counts: at the start of the style attribute or after a `;`, so
	 * `text-align-last` or a custom property such as `--x-text-align` does
	 * not turn the rule off. A fit-to-width block (`typost-fit`) never takes
	 * it: each of its lines fills the width, and measurement decides line
	 * 1's hang from the block's own alignment, so a style's
	 * `--typost-hang-on: 0` would leave line 1 short (PR #329 review).
	 * Mirrors ALIGNMENT_GUARD in ps-utils.js.
	 */
	const ALIGNMENT_GUARD = ':not([style^="text-align:"], [style*=";text-align:"], [style*="; text-align:"], [class*="has-text-align-"], .typost-fit)';

	/**
	 * Guard on the indent rules (#199): a fit-to-width block (`typost-fit`)
	 * under a style that is not fit never takes them. text-indent inherits
	 * into each `.typost-line`, which is sized to fill the width, so the
	 * line runs past the edge; the padding shrinks every line; and the
	 * style's `--typost-hang-on: 0` leaves line 1 short, because measurement
	 * sized it as hung. Spacing has no such effect and stays unguarded.
	 * Mirrors INDENT_GUARD in ps-utils.js.
	 */
	const INDENT_GUARD = ':not(.typost-fit)';

	/**
	 * @var array<string,int> Units a paragraph indent or spacing value (#199)
	 * can use, with the largest value each accepts. Mirrors LENGTH_MAX in
	 * ps-utils.js.
	 */
	const LENGTH_MAX = array(
		'px' => 1000,
		'em' => 50,
	);

	/**
	 * @var string[] Indents and paragraph spacing (#199) that are plain
	 * lengths, zero or more: left and right indent (logical start and end,
	 * so they follow the text direction) and space before and after. The
	 * first line indent can be negative and has its own group. Mirrors
	 * SPACING_PROPERTIES in ps-utils.js.
	 */
	const SPACING_PROPERTIES = array( 'indentStart', 'indentEnd', 'spaceBefore', 'spaceAfter' );

	/**
	 * Most styles a Based On chain may hold, the style itself included (#200).
	 * Resolution stops there, so bad data in the option cannot loop.
	 * Mirrors MAX_BASED_ON_LEVELS in ps-utils.js.
	 */
	const MAX_BASED_ON_LEVELS = 10;

	/**
	 * Property groups that inherit as a whole (#200), keyed by the lead key
	 * that marks a style as setting the group. Mirrors BASED_ON_GROUPS in
	 * ps-utils.js.
	 */
	const BASED_ON_GROUPS = array(
		'fontSize' => array( 'fontSize', 'fontSizeUnit', 'fontSizeMin', 'fontSizePreferred', 'fontSizeMax', 'fitMaxSize' ),
		'textCase'  => array( 'textCase', 'fakeSmallCaps' ),
		'alignment' => array( 'alignment', 'alignLast' ),
		// #199: a child with its own first line indent must not keep the
		// parent's "only after the same style"
		'firstLineIndent' => array( 'firstLineIndent', 'indentAfterSame' ),
	);

	/**
	 * The value a style based on another stores to unset an inherited
	 * property outside the groups (#200). Mirrors EMPTY_PROPERTY_VALUES in
	 * ps-utils.js.
	 */
	const EMPTY_PROPERTY_VALUES = array(
		'fontId'                => 0,
		'fontWeight'            => '',
		'fontStyle'             => '',
		'letterSpacing'         => 0,
		'lineHeight'            => 0,
		'features'              => array(),
		'fontVariationSettings' => '',
		'initialHang'           => 0,
		'wordSpacing'           => 0,
		'textWrap'              => '',
		'indentStart'           => '',
		'indentEnd'             => '',
		'spaceBefore'           => '',
		'spaceAfter'            => '',
	);

	/**
	 * Get singleton instance.
	 *
	 * @return self
	 */
	public static function get_instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * Private constructor — use get_instance().
	 */
	private function __construct() {
		$this->maybe_migrate_ids();
		$this->register_hooks();
	}

	/**
	 * Register all hook callbacks.
	 */
	private function register_hooks() {
		// Translations
		add_action( 'init', array( $this, 'load_textdomain' ) );

		// Admin tab
		add_filter( 'typost_admin_tabs', array( $this, 'register_admin_tab' ) );
		add_action( 'typost_admin_tab_content_paragraph-styles', array( $this, 'render_admin_tab' ) );

		// Optional toolbar button setting (Options tab)
		add_action( 'typost_admin_options_rows', array( $this, 'render_options_row' ) );
		add_filter( 'typost_admin_options_checkboxes', array( $this, 'register_option_key' ) );
		add_filter( 'typost_export_option_details', array( $this, 'export_option_details' ) );
		add_action( 'admin_init', array( $this, 'maybe_turn_on_toolbar_button' ) );

		// Editor data
		add_filter( 'typost_editor_data', array( $this, 'add_editor_data' ) );
		// Content styled only through a style class names no font; tell core's
		// frontend font detection which fonts those classes stand for.
		add_filter( 'typost_content_font_ids', array( $this, 'font_ids_from_content' ), 10, 2 );
		// Styles forced onto every page need their fonts on every page too.
		add_filter( 'typost_force_enqueue_font_ids', array( $this, 'font_ids_from_forced_styles' ) );

		// REST routes
		add_action( 'typost_register_rest_routes', array( $this, 'register_rest_routes' ) );

		// Export and import (#205)
		add_filter( 'typost_export_sections', array( new Typost_PS_Transfer( $this ), 'register_section' ) );

		// Assets
		add_action( 'typost_editor_assets', array( $this, 'enqueue_editor_assets' ) );
		add_action( 'typost_admin_assets', array( $this, 'enqueue_admin_assets' ) );

		// Cache clear
		add_action( 'typost_cache_clear', array( $this, 'clear_cache' ) );

		// CSS output — frontend: the rules for the styles the page uses, in
		// the head; a footer pass prints the styles that blocks rendered
		// after the head (classic-theme widgets, custom query loops).
		// GREP styles (#196) wrap matches at render time; before the
		// collector, so the styles the rules apply are collected too.
		add_filter( 'render_block', array( $this, 'apply_grep_styles' ), 9, 2 );
		add_filter( 'render_block', array( $this, 'collect_rendered_style_refs' ) );
		add_action( 'wp_head', array( $this, 'output_style_css' ), 6 );
		// Last, so blocks a popup or modal plugin renders in wp_footer count.
		add_action( 'wp_footer', array( $this, 'output_late_style_css' ), PHP_INT_MAX );

		// CSS output — block editor (including iframed editors in WP 6.x+)
		add_action( 'enqueue_block_assets', array( $this, 'enqueue_editor_style_css' ) );
	}

	/**
	 * Load the module text domain.
	 */
	public function load_textdomain() {
		load_plugin_textdomain(
			'typost-paragraph-styles',
			false,
			dirname( plugin_basename( __FILE__ ) ) . '/languages'
		);
	}

	// -------------------------------------------------------------------------
	// ID Migration (old timestamp format → sequential integers)
	// -------------------------------------------------------------------------

	/**
	 * Migrate old timestamp-based IDs to sequential integers.
	 *
	 * Old format: 'ps_1709312345_123'
	 * New format: 1, 2, 3, ...
	 */
	private function maybe_migrate_ids() {
		$styles = get_option( self::OPTION_KEY, array() );
		if ( ! is_array( $styles ) || empty( $styles ) ) {
			return;
		}

		// Check if any style has the old format
		$needs_migration = false;
		foreach ( $styles as $style ) {
			if ( isset( $style['id'] ) && is_string( $style['id'] ) && strpos( $style['id'], 'ps_' ) === 0 ) {
				$needs_migration = true;
				break;
			}
		}

		if ( ! $needs_migration ) {
			return;
		}

		// Assign new sequential IDs, preserving old ID for backward-compatible CSS selectors
		$next_id = 1;
		foreach ( $styles as &$style ) {
			if ( isset( $style['id'] ) ) {
				$style['legacyId'] = $style['id'];
			}
			$style['id'] = $next_id;
			$next_id++;
		}
		unset( $style );

		update_option( self::OPTION_KEY, $styles );
		update_option( self::COUNTER_KEY, $next_id );
		$this->clear_cache();
	}

	/**
	 * Get the next sequential ID and increment the counter.
	 *
	 * @return int The next available ID.
	 */
	private function get_next_id() {
		$next_id = get_option( self::COUNTER_KEY, 1 );

		// Ensure we don't collide with existing IDs
		$styles = $this->get_styles();
		$max_id = 0;
		foreach ( $styles as $style ) {
			if ( isset( $style['id'] ) && is_numeric( $style['id'] ) ) {
				$max_id = max( $max_id, intval( $style['id'] ) );
			}
		}
		if ( $next_id <= $max_id ) {
			$next_id = $max_id + 1;
		}

		update_option( self::COUNTER_KEY, $next_id + 1 );
		return $next_id;
	}

	// -------------------------------------------------------------------------
	// CSS Generation
	// -------------------------------------------------------------------------

	/**
	 * Generate CSS for a single paragraph style.
	 *
	 * A style based on another (#200) gets one self-contained rule from its
	 * resolved properties (parent chain plus its own), so content keeps only
	 * the style's own class and a change to the parent needs no change to
	 * content. buildStyleCssBlock() reads the same resolved properties.
	 *
	 * @param array      $style  The style data.
	 * @param array|null $styles Every stored style, to resolve a parent
	 *                           chain; read from the store when omitted.
	 * @return string CSS rule block.
	 */
	public function generate_style_css( $style, $styles = null ) {
		$id    = intval( $style['id'] );
		$props = empty( $style['basedOn'] )
			? ( isset( $style['properties'] ) ? $style['properties'] : array() )
			: self::resolve_properties( $style, null === $styles ? $this->get_styles() : $styles );

		$css_rules = array();

		// Font family via CSS variable
		if ( ! empty( $props['fontId'] ) ) {
			$css_rules[] = 'font-family: var(--font-' . absint( $props['fontId'] ) . ')';
		}

		// Font weight (validated to numeric 1-1000 or keyword)
		if ( ! empty( $props['fontWeight'] ) ) {
			$weight = $props['fontWeight'];
			if ( is_numeric( $weight ) && $weight >= 1 && $weight <= 1000 ) {
				$css_rules[] = 'font-weight: ' . intval( $weight );
			} elseif ( in_array( $weight, array( 'normal', 'bold', 'lighter', 'bolder' ), true ) ) {
				$css_rules[] = 'font-weight: ' . esc_attr( $weight );
			}
		}

		// Font style (visual italic — the editors' Font Style control; '' = inherit is never stored)
		if ( ! empty( $props['fontStyle'] ) && in_array( $props['fontStyle'], array( 'normal', 'italic', 'oblique' ), true ) ) {
			$css_rules[] = 'font-style: ' . $props['fontStyle'];
		}

		// OpenType features
		if ( ! empty( $props['features'] ) && is_array( $props['features'] ) ) {
			$features    = array_map( function( $f ) {
				return '"' . esc_attr( $f ) . '" 1';
			}, $props['features'] );
			$css_rules[] = 'font-feature-settings: ' . implode( ', ', $features );
		}

		// Letter spacing
		if ( ! empty( $props['letterSpacing'] ) ) {
			$css_rules[] = 'letter-spacing: ' . ( intval( $props['letterSpacing'] ) / 1000 ) . 'em';
		}

		// Line height
		if ( ! empty( $props['lineHeight'] ) ) {
			$css_rules[] = 'line-height: ' . floatval( $props['lineHeight'] );
		}

		// Font variation settings (variable font axes)
		// Parse and rebuild to ensure safe output. Valid format: "axis" value pairs.
		if ( ! empty( $props['fontVariationSettings'] ) ) {
			$pairs       = explode( ',', $props['fontVariationSettings'] );
			$clean_pairs = array();
			foreach ( $pairs as $pair ) {
				$pair = trim( $pair );
				// Match a 4-char axis tag in quotes and a numeric value
				if ( preg_match( '/^"([a-zA-Z]{4})"\s+(-?[\d]+(?:\.[\d]+)?)$/', $pair, $m ) ) {
					$clean_pairs[] = '"' . $m[1] . '" ' . floatval( $m[2] );
				}
			}
			if ( ! empty( $clean_pairs ) ) {
				// No esc_attr() here: the pairs are rebuilt above from a strict
				// regex ([a-zA-Z]{4} tag + floatval), and HTML-escaping would
				// turn the required quotes into &quot; inside the <style> block,
				// invalidating the declaration.
				$css_rules[] = 'font-variation-settings: ' . implode( ', ', $clean_pairs );
			}
		}

		// Sizes are stored in px. A style saved after #233 carries
		// fontSizeUnit 'rem' and writes them divided by 16; a style without
		// the key was saved before and writes px exactly as it always did.
		$use_rem = isset( $props['fontSizeUnit'] ) && 'rem' === $props['fontSizeUnit'];

		// Font size — fixed numeric px value. The current editors only produce
		// 'inherit' / 'responsive' / 'fit' states, but the REST API accepts any
		// value and legacy/external data may store plain px numbers. The rem
		// form keeps decimals (36.5 → 2.28125rem), as the block's save does.
		if ( isset( $props['fontSize'] ) && is_numeric( $props['fontSize'] ) && $props['fontSize'] > 0 ) {
			$css_rules[] = $use_rem
				? 'font-size: ' . self::px_to_rem( $props['fontSize'] ) . 'rem'
				: 'font-size: ' . intval( $props['fontSize'] ) . 'px';
		}

		// Font size (responsive clamp). Fit-to-width styles emit the same
		// clamp: it mirrors the fallback save.js writes for non-styleClass fit
		// blocks — per-line calc(...cqi) sizes on span.typost-line override it
		// in container-query-capable browsers, others get fluid sizing instead
		// of inheriting the theme size. For inline spans rendered by the
		// [data-style-id] selector, fit degrades to this clamp by design.
		if ( isset( $props['fontSize'] ) && in_array( $props['fontSize'], array( 'responsive', 'fit' ), true )
			&& isset( $props['fontSizeMin'], $props['fontSizePreferred'], $props['fontSizeMax'] ) ) {
			$min  = intval( $props['fontSizeMin'] );
			$pref = intval( $props['fontSizePreferred'] );
			$max  = intval( $props['fontSizeMax'] );
			$vw   = ( ( $max - $min ) / ( self::RESPONSIVE_FONT_MAX_VIEWPORT - self::RESPONSIVE_FONT_MIN_VIEWPORT ) ) * 100;

			if ( $use_rem ) {
				$css_rules[] = sprintf(
					'font-size: clamp(%srem, %srem + %svw, %srem)',
					self::px_to_rem( $min ),
					self::px_to_rem( $pref ),
					self::responsive_zoom_vw( $min, $pref, $max ),
					self::px_to_rem( $max )
				);
			} else {
				$css_rules[] = sprintf(
					'font-size: clamp(%dpx, %srem + %svw, %dpx)',
					$min,
					round( $pref / 16, 4 ),
					round( $vw, 4 ),
					$max
				);
			}
		}

		// Hanging initial (#242): a custom property that core's block
		// style.css reads in its ::first-letter rule. An inline style cannot
		// reach a pseudo-element, so the style sets the value and the shared
		// rule applies it. buildStyleCssBlock() in ps-utils.js emits the same.
		$hang = isset( $props['initialHang'] ) ? self::normalize_hang( $props['initialHang'] ) : 0;
		if ( $hang > 0 ) {
			$css_rules[] = '--typost-hang: ' . $hang;
		}

		// Case (#214). caseDeclarations() in ps-utils.js emits the same.
		$fake_small_caps = ! ( isset( $props['fakeSmallCaps'] ) && false === $props['fakeSmallCaps'] );
		foreach ( self::case_declarations( isset( $props['textCase'] ) ? $props['textCase'] : '', $fake_small_caps ) as $declaration ) {
			$css_rules[] = $declaration[0] . ': ' . $declaration[1];
		}

		// Alignment, word spacing and line breaking (#207). Not for fit to
		// width: fit sets each line's width itself, and word spacing would
		// change the widths it measured. No !important, so a block's own
		// inline word-spacing beats the style, and a text-spacing tool or
		// user style sheet that sets it with !important overrides it
		// (WCAG 1.4.12).
		$is_fit      = isset( $props['fontSize'] ) && 'fit' === $props['fontSize'];
		$align_rules = array();
		if ( ! $is_fit ) {
			if ( ! empty( $props['wordSpacing'] ) ) {
				$css_rules[] = 'word-spacing: ' . ( intval( $props['wordSpacing'] ) / 1000 ) . 'em';
			}
			if ( '' !== self::normalize_text_wrap( isset( $props['textWrap'] ) ? $props['textWrap'] : '' ) ) {
				// The shorthand also sets text-wrap-mode to wrap, which would
				// break text inside a nowrap context (a fit-to-width line, a
				// theme's nowrap nav). text-wrap-mode: inherit gives the mode
				// back to the parent; browsers that know only the single
				// text-wrap property ignore it (PR #329 review).
				$css_rules[] = 'text-wrap: ' . $props['textWrap'];
				$css_rules[] = 'text-wrap-mode: inherit';
			}
			$align_rules = self::alignment_declarations( $props, $hang );
		}

		// Indents and paragraph spacing (#199): rules of their own, never on
		// the inline-span selector (see paragraph_layout_css())
		$layout_ids = array( (string) $id );
		if ( ! empty( $style['legacyId'] ) ) {
			$layout_ids[] = esc_attr( $style['legacyId'] );
		}
		$layout_css = self::paragraph_layout_css( $props, $hang, $layout_ids );

		if ( empty( $css_rules ) && empty( $align_rules ) && '' === $layout_css ) {
			return '';
		}

		// Three selectors per style:
		//  - `.typost-ps-N` (0,1,0): previews such as the style browser rows.
		//  - block-level and inline-span forms boosted to (0,6,0) by repeating
		//    the class / attribute. Theme heading rules are routinely more
		//    specific than a single class (`.entry-content h2` is (0,1,1); a
		//    color-scheme rule with a `:not()` reached (0,3,4) on a real site,
		//    and (0,5,2) in the editor, where WordPress prefixes theme styles
		//    with .editor-styles-wrapper)
		//    and were overriding the style's font-family and font-weight on
		//    the frontend, where save.js emits no inline styles under a
		//    styleClass. Inline `style=""` attributes still win, by design.
		// buildStyleCssBlock() in ps-utils.js must emit the same text.
		$selector = sprintf(
			".typost-ps-%d,\n.typost-styled.typost-ps-%d.typost-ps-%d.typost-ps-%d.typost-ps-%d.typost-ps-%d,\n.typost-styled[data-style-id=\"%d\"][data-style-id][data-style-id][data-style-id][data-style-id]",
			$id,
			$id,
			$id,
			$id,
			$id,
			$id,
			$id
		);

		// Backward-compatible selectors for migrated legacy IDs
		if ( ! empty( $style['legacyId'] ) ) {
			$legacy    = esc_attr( $style['legacyId'] );
			$selector .= sprintf(
				",\n.typost-ps-%s,\n.typost-styled.typost-ps-%s.typost-ps-%s.typost-ps-%s.typost-ps-%s.typost-ps-%s,\n.typost-styled[data-style-id=\"%s\"][data-style-id][data-style-id][data-style-id][data-style-id]",
				$legacy,
				$legacy,
				$legacy,
				$legacy,
				$legacy,
				$legacy,
				$legacy
			);
		}

		$css = '';
		if ( ! empty( $css_rules ) ) {
			$css = sprintf(
				"%s {\n    %s;\n}",
				$selector,
				implode( ";\n    ", $css_rules )
			);
		}

		// The alignment goes in its own rule, guarded so a block with its
		// own alignment keeps it (see ALIGNMENT_GUARD): an inline text-align
		// wins anyway, but core's has-text-align-* classes are (0,1,0) and
		// the last line alignment and the hang switch would still apply.
		if ( ! empty( $align_rules ) ) {
			$guarded = implode( ",\n", array_map( function ( $part ) {
				return $part . self::ALIGNMENT_GUARD;
			}, explode( ",\n", $selector ) ) );
			$css    .= ( '' === $css ? '' : "\n\n" ) . $guarded . " {\n    " . implode( ";\n    ", $align_rules ) . ";\n}";
		}

		if ( '' !== $layout_css ) {
			$css .= ( '' === $css ? '' : "\n\n" ) . $layout_css;
		}

		if ( $hang > 0 ) {
			$css .= self::core_block_hang_css( $id );
		}

		return $css;
	}

	/**
	 * '' for Default or an unknown value, otherwise the alignment (#207).
	 * Mirrors normalizeAlignment() in ps-utils.js.
	 *
	 * @param mixed $value Stored value.
	 * @return string
	 */
	private static function normalize_alignment( $value ) {
		return is_string( $value ) && in_array( $value, self::ALIGNMENT_VALUES, true ) ? $value : '';
	}

	/**
	 * The last line alignment as stored: only with justify, '' = start
	 * (#207). Mirrors normalizeAlignLast() in ps-utils.js.
	 *
	 * @param mixed $alignment The style's alignment.
	 * @param mixed $value     Stored last line value.
	 * @return string
	 */
	private static function normalize_align_last( $alignment, $value ) {
		return 'justify' === self::normalize_alignment( $alignment ) && is_string( $value ) && in_array( $value, self::ALIGN_LAST_VALUES, true ) ? $value : '';
	}

	/**
	 * '' for normal or an unknown value, otherwise the line breaking value
	 * (#207). Mirrors normalizeTextWrap() in ps-utils.js.
	 *
	 * @param mixed $value Stored value.
	 * @return string
	 */
	private static function normalize_text_wrap( $value ) {
		return is_string( $value ) && in_array( $value, self::TEXT_WRAP_VALUES, true ) ? $value : '';
	}

	/**
	 * The alignment declarations of a style (#207), for its guarded rule.
	 *
	 * `text-align-last` only with justified text. A centered or end-aligned
	 * style with a First Letter Hang also turns the hang off, as the block
	 * does for its own centered or end-aligned text: moving the first
	 * letter would only shift the line. Mirrors alignmentDeclarations() in
	 * ps-utils.js.
	 *
	 * @param array $props Resolved properties.
	 * @param float $hang  The style's normalized hang.
	 * @return string[] Declarations.
	 */
	private static function alignment_declarations( $props, $hang ) {
		$alignment = self::normalize_alignment( isset( $props['alignment'] ) ? $props['alignment'] : '' );
		if ( '' === $alignment ) {
			return array();
		}
		$rules = array( 'text-align: ' . $alignment );
		$last  = self::normalize_align_last( $alignment, isset( $props['alignLast'] ) ? $props['alignLast'] : '' );
		if ( '' !== $last ) {
			$rules[] = 'text-align-last: ' . $last;
		}
		if ( $hang > 0 && in_array( $alignment, array( 'center', 'end' ), true ) ) {
			$rules[] = '--typost-hang-on: 0';
		}
		return $rules;
	}

	/**
	 * Normalize an indent or spacing value (#199) to the stored form.
	 *
	 * Accepts a number with a `px` or `em` unit ("24px", "1.5em", " .5EM ").
	 * Returns '' for zero, for anything else (no unit, other units, a
	 * number alone), and for a negative value unless `$allow_negative`
	 * (only the first line indent, where negative is a hanging indent).
	 * The number is capped at LENGTH_MAX and rounded to three decimals, so
	 * it prints the same here and in JS. Mirrors normalizeLength() in
	 * ps-utils.js.
	 *
	 * @param mixed $value          Raw value.
	 * @param bool  $allow_negative Accept a negative value.
	 * @return string Length such as "1.5em", or '' for none.
	 */
	public static function normalize_length( $value, $allow_negative = false ) {
		if ( ! is_string( $value ) || ! preg_match( '/^\s*(-?)(\d+(?:\.\d*)?|\.\d+)\s*(px|em)\s*$/i', $value, $m ) ) {
			return '';
		}
		$unit = strtolower( $m[3] );
		$n    = min( (float) $m[2], self::LENGTH_MAX[ $unit ] );
		// Below 0.0005 rounds to 0; PHP would also print it in exponent form
		if ( ! is_finite( $n ) || $n < 0.0005 ) {
			return '';
		}
		$negative = '-' === $m[1];
		if ( $negative && ! $allow_negative ) {
			return '';
		}
		return ( $negative ? '-' : '' ) . round( $n, 3 ) . $unit;
	}

	/**
	 * Whether a style's first line indent applies only after a paragraph
	 * with the same style (#199). Only for a positive indent: a hanging
	 * indent is a whole-paragraph shape, which every paragraph keeps.
	 * Mirrors indentAfterSameApplies() in ps-utils.js.
	 *
	 * @param array $props Properties.
	 * @return bool
	 */
	private static function indent_after_same_applies( $props ) {
		$first = self::normalize_length( isset( $props['firstLineIndent'] ) ? $props['firstLineIndent'] : '', true );
		return '' !== $first && '-' !== $first[0] && isset( $props['indentAfterSame'] ) && true === $props['indentAfterSame'];
	}

	/**
	 * The indent and paragraph spacing rules of a style (#199).
	 *
	 * A paragraph-level setting, so the rules go on the plain preview class
	 * (the settings tab card) and the block-level selector, never on the
	 * inline-span selector: inline start and end padding would move a
	 * selected word, and text-indent and block margins do nothing on a span.
	 * Each value is a length with px or em, stored by normalize_length().
	 *
	 * - Indents are padding, with `box-sizing: border-box` only when the
	 *   style sets one: core Paragraph and Heading blocks in a constrained
	 *   layout get `margin-left/right: auto !important` from core, so a
	 *   margin indent did nothing, and padding on a content-box element
	 *   only widened it (measured on Twenty Twenty-Five, #199 review).
	 *   Logical properties, so the indents follow the text direction.
	 * - A negative first line indent is a hanging indent: the start padding
	 *   grows by its size and `text-indent` pulls the first line back. The
	 *   `hanging` keyword is shorter but too new (Chrome 146).
	 * - A first line indent turns the First Letter Hang off where it
	 *   applies (`--typost-hang-on: 0`): the hang lines a swash up with the
	 *   text edge, which an indented first line no longer starts at. The
	 *   class rule also beats the editors' hang `text-indent` rules, so the
	 *   editor and the frontend agree.
	 * - "Only after the same style" moves the first line indent into a rule
	 *   for a paragraph that follows one with the same style, as core's Text
	 *   indent does for `.wp-block-paragraph + .wp-block-paragraph`. A
	 *   Typography Stylist block carries the class on the inner visual
	 *   element, so its wrapper is matched with `:has()`; all four pairs of
	 *   block types are covered. A legacy id and the numeric id are one
	 *   style, so the previous paragraph can carry either class.
	 * - Space before and after are block margins. In a Typography Stylist
	 *   block they go on the `.wp-block-typost` wrapper and the inner
	 *   element's margins become 0: the inner margins would collapse with
	 *   the wrapper's (the larger wins) or, with block padding, add to them.
	 *   An em value on the wrapper resolves against the wrapper's inherited
	 *   font size, not the style's size, so px is the exact unit there.
	 * - A block's own settings: on a core Paragraph or Heading block the
	 *   class is on the block, so its inline margin, padding and text-indent
	 *   override the style. A Typography Stylist block differs. Its spacing
	 *   is inline on the wrapper (useBlockProps() in the editor,
	 *   Typost::add_block_support_attributes() on the frontend): its margin
	 *   overrides the style's wrapper margin, and its padding adds to the
	 *   indents, which are padding on the inner element.
	 * - Fit-to-width styles write no indents: each line fills the width, and
	 *   an indent would push line 1 past the edge. Spacing is kept. A fit
	 *   block under a style that is not fit skips the indent rules through
	 *   INDENT_GUARD, so the indents have a rule of their own.
	 *
	 * Mirrors paragraphLayoutCss() in ps-utils.js; the shared fixture
	 * `__tests__/fixtures/paragraph-layout-css.json` holds both to the same
	 * text.
	 *
	 * @param array    $props Resolved properties.
	 * @param float    $hang  The style's normalized hang.
	 * @param string[] $ids   The style's id, then its legacy id if any.
	 * @return string CSS rule blocks separated by a blank line, or ''.
	 */
	private static function paragraph_layout_css( $props, $hang, $ids ) {
		$is_fit = isset( $props['fontSize'] ) && 'fit' === $props['fontSize'];
		$length = function ( $key, $allow_negative = false ) use ( $props ) {
			return self::normalize_length( isset( $props[ $key ] ) ? $props[ $key ] : '', $allow_negative );
		};

		$start   = $is_fit ? '' : $length( 'indentStart' );
		$end     = $is_fit ? '' : $length( 'indentEnd' );
		$first   = $is_fit ? '' : $length( 'firstLineIndent', true );
		$after   = '' !== $first && self::indent_after_same_applies( $props );
		$before  = $length( 'spaceBefore' );
		$after_s = $length( 'spaceAfter' );

		$hanging   = '' !== $first && '-' === $first[0] ? substr( $first, 1 ) : '';
		$pad_start = '' !== $start && '' !== $hanging ? 'calc(' . $start . ' + ' . $hanging . ')' : ( '' !== $start ? $start : $hanging );

		$indents = array();
		if ( '' !== $pad_start || '' !== $end ) {
			$indents[] = 'box-sizing: border-box';
		}
		if ( '' !== $pad_start ) {
			$indents[] = 'padding-inline-start: ' . $pad_start;
		}
		if ( '' !== $end ) {
			$indents[] = 'padding-inline-end: ' . $end;
		}
		$indent_rules = array();
		if ( '' !== $first ) {
			$indent_rules[] = 'text-indent: ' . $first;
			if ( $hang > 0 ) {
				$indent_rules[] = '--typost-hang-on: 0';
			}
		}
		if ( ! $after ) {
			$indents = array_merge( $indents, $indent_rules );
		}
		$margins = array();
		if ( '' !== $before ) {
			$margins[] = 'margin-block-start: ' . $before;
		}
		if ( '' !== $after_s ) {
			$margins[] = 'margin-block-end: ' . $after_s;
		}

		if ( empty( $indents ) && empty( $margins ) && ! $after ) {
			return '';
		}

		$plain    = array();
		$block    = array();
		$wrapper  = array();
		$inner    = array();
		$previous = array();
		foreach ( $ids as $ref ) {
			$cls        = '.typost-ps-' . $ref;
			$s          = '.typost-styled' . str_repeat( $cls, 5 );
			$w          = '.wp-block-typost:has(> ' . $s . ')';
			$plain[]    = $cls;
			$block[]    = $s;
			$wrapper[]  = $w;
			$inner[]    = '.wp-block-typost > ' . $s;
			$previous[] = $w;
			$previous[] = $s;
		}
		// Plain and block-level forms in the same order as selectorSet():
		// per id, its preview class then its boosted class
		$main = array();
		foreach ( $plain as $i => $p ) {
			$main[] = $p;
			$main[] = $block[ $i ];
		}
		// Either class of the style can come before either class, so the one
		// :is() lists every form
		$next = array();
		foreach ( $block as $s ) {
			$next[] = ':is(' . implode( ', ', $previous ) . ') + ' . $s . self::INDENT_GUARD;
			$next[] = ':is(' . implode( ', ', $previous ) . ') + .wp-block-typost > ' . $s . self::INDENT_GUARD;
		}

		$rule = function ( $selectors, $declarations ) {
			return implode( ",\n", $selectors ) . " {\n    " . implode( ";\n    ", $declarations ) . ";\n}";
		};
		$blocks = array();
		if ( ! empty( $indents ) ) {
			$guarded  = array_map( function ( $part ) {
				return $part . self::INDENT_GUARD;
			}, $main );
			$blocks[] = $rule( $guarded, $indents );
		}
		if ( ! empty( $margins ) ) {
			$blocks[] = $rule( $main, $margins );
			$blocks[] = $rule( $wrapper, $margins );
			$zero     = array();
			if ( '' !== $before ) {
				$zero[] = 'margin-block-start: 0';
			}
			if ( '' !== $after_s ) {
				$zero[] = 'margin-block-end: 0';
			}
			$blocks[] = $rule( $inner, $zero );
		}
		if ( $after ) {
			$blocks[] = $rule( $next, $indent_rules );
		}
		return implode( "\n\n", $blocks );
	}

	/**
	 * The First Letter Hang rules for a style on core blocks (#219).
	 *
	 * The style's main rule sets `--typost-hang`, and core's block style.css
	 * consumes it only inside a Typography Stylist block. A core Paragraph
	 * or Heading carrying the style class needs its own rules, so a style
	 * with a hang adds them (a style without one adds nothing, which keeps
	 * a theme's `::first-letter` margin and paragraph indent untouched):
	 *  - frontend: `::first-letter` gets the negative start margin, which
	 *    the plain typography switch (`--typost-plain: 1`, #315) turns off;
	 *  - editor (`.block-editor-rich-text__editable`): `text-indent`, because
	 *    `::first-letter` on a contenteditable puts Home after the first
	 *    letter in Chromium (the reason style.css uses text-indent there);
	 *  - centered and end-aligned blocks (core's `has-text-align-*` classes)
	 *    turn the hang off, as the Typography Stylist block does for its
	 *    inline text-align. Separate rules, so a browser without `:dir()`
	 *    drops only those;
	 *  - a block's own text direction: the editor writes it as an inline
	 *    `direction` declaration with no `dir` attribute, which `:dir()`
	 *    does not see, so the inline declaration decides the end edge there
	 *    (both spellings, as style.css matches inline text-align). Saved
	 *    markup has `dir`, so the frontend needs only the `:dir()` rules;
	 *  - a block with an inline `text-indent` (core's Text indent) gets no
	 *    hang: in the editor that inline value beats the hang's text-indent,
	 *    and on the frontend the `::first-letter` margin would add to it.
	 * Typography Stylist block content (`.wp-block-typost *`) is left to
	 * style.css, and a drop cap wins over a hang. buildStyleCssBlock() in
	 * ps-utils.js emits the same text.
	 *
	 * @param int $id Style id.
	 * @return string CSS, starting with a blank line.
	 */
	private static function core_block_hang_css( $id ) {
		$cls    = '.typost-styled.typost-ps-' . intval( $id );
		$amount = 'calc(var(--typost-hang, 0) * var(--typost-hang-on, 1) * -1em)';
		$plain  = 'calc(var(--typost-hang, 0) * var(--typost-hang-on, 1) * (1 - var(--typost-plain, 0)) * -1em)';
		$tags   = ':is(p, h1, h2, h3, h4, h5, h6)';
		$off    = " {\n    --typost-hang-on: 0;\n}";
		$on     = " {\n    --typost-hang-on: 1;\n}";
		$rtl    = ':is([style*="direction: rtl"], [style*="direction:rtl"])';
		$ltr    = ':is([style*="direction: ltr"], [style*="direction:ltr"])';
		return "\n\n" . $cls . $tags . ':not(.wp-block-typost *, .has-drop-cap, .block-editor-rich-text__editable, [style*="text-indent"])::first-letter {' . "\n    margin-inline-start: " . $plain . ";\n}"
			. "\n\n" . $cls . '.block-editor-rich-text__editable' . $tags . ':not(.wp-block-typost *, .has-drop-cap, [style*="text-indent"]) {' . "\n    text-indent: " . $amount . ";\n}"
			. "\n\n" . $cls . '.has-text-align-center' . $off
			. "\n\n" . $cls . '.has-text-align-right:dir(ltr)' . $off
			. "\n\n" . $cls . '.has-text-align-left:dir(rtl)' . $off
			. "\n\n" . $cls . '.has-text-align-right' . $ltr . $off
			. "\n\n" . $cls . '.has-text-align-left' . $rtl . $off
			. "\n\n" . $cls . '.has-text-align-right' . $rtl . $on
			. "\n\n" . $cls . '.has-text-align-left' . $ltr . $on;
	}

	/**
	 * Generate all paragraph style CSS (cached).
	 *
	 * @return string Full CSS string for all styles.
	 */
	public function get_all_css() {
		$cached = get_transient( self::CSS_CACHE_KEY );
		if ( false !== $cached ) {
			return $cached;
		}

		$styles = $this->get_styles();
		if ( empty( $styles ) ) {
			return '';
		}

		$css_blocks = array();
		foreach ( $styles as $style ) {
			$block = $this->generate_style_css( $style, $styles );
			if ( $block ) {
				$css_blocks[] = $block;
			}
		}
		// GREP feature rules last, so they follow every style they combine
		foreach ( $styles as $style ) {
			$block = self::grep_feature_css( $style, $styles );
			if ( '' !== $block ) {
				$css_blocks[] = $block;
			}
		}

		$css = implode( "\n\n", $css_blocks );
		set_transient( self::CSS_CACHE_KEY, $css, 12 * HOUR_IN_SECONDS );
		return $css;
	}

	/**
	 * Print the rules for the paragraph styles this page uses (#227).
	 *
	 * Hooked to wp_head (priority 6, after font variables at 5). Printing
	 * every style on every page cost about 330 bytes per style, on pages
	 * with no styled text too. A style is printed when:
	 *  - the displayed content references it: the queried post on a
	 *    singular page and the synced patterns it references;
	 *  - a block that already rendered references it. A block theme renders
	 *    its whole template, template parts included, before wp_head;
	 *  - `typost_force_enqueue_paragraph_style_ids` names it;
	 *  - the page lists posts (an archive, the blog page, search results):
	 *    every style. A "load more" or infinite-scroll request returns post
	 *    HTML without running wp_head or wp_footer, so the posts it adds can
	 *    only use rules that the first page printed;
	 *  - the editor scripts are on this frontend page (every style, like the
	 *    editor in wp-admin).
	 * Blocks that render after the head print through output_late_style_css().
	 */
	public function output_style_css() {
		$refs = array_merge(
			$this->get_page_style_refs(),
			$this->rendered_style_refs,
			$this->get_forced_style_refs()
		);
		if ( $this->editor_on_frontend || $this->page_lists_posts() ) {
			$refs = array_merge( $refs, $this->get_all_style_refs() );
		}
		$this->print_style_rules( $refs, 'typost-paragraph-styles-css' );
	}

	/**
	 * Whether this request is a page that lists posts in its main loop.
	 *
	 * True for archives, the blog page and search results that have posts.
	 * False for singular pages, and for a 404 or an empty result, which have
	 * nothing to load more of.
	 *
	 * @return bool
	 */
	private function page_lists_posts() {
		global $wp_query;
		return ! is_singular() && isset( $wp_query->posts ) && is_array( $wp_query->posts ) && ! empty( $wp_query->posts );
	}

	/**
	 * Print the rules for styles that blocks referenced after wp_head.
	 *
	 * Hooked to wp_footer. A classic theme renders widgets, footers and
	 * custom query loops after the head, so the head scan cannot see them.
	 * The rules print once: a style the head printed is skipped. The editor
	 * mounted on a frontend page (a shortcode enqueues it while the content
	 * renders) gets every remaining style here.
	 */
	public function output_late_style_css() {
		$refs = $this->rendered_style_refs;
		if ( $this->editor_on_frontend ) {
			$refs = array_merge( $refs, $this->get_all_style_refs() );
		}
		$this->print_style_rules( $refs, 'typost-paragraph-styles-late-css' );
	}

	/**
	 * Record the style references in a block's rendered HTML.
	 *
	 * Hooked to the `render_block` filter, which runs for every block, nested
	 * blocks included. The strpos() checks keep the cost low for blocks with
	 * no style reference.
	 *
	 * @param string $block_content The rendered block.
	 * @return string The block, unchanged.
	 */
	public function collect_rendered_style_refs( $block_content ) {
		if ( is_string( $block_content )
			&& ( false !== strpos( $block_content, 'typost-ps-' ) || false !== strpos( $block_content, 'data-style-id' ) ) ) {
			$this->rendered_style_refs = array_values( array_unique( array_merge(
				$this->rendered_style_refs,
				$this->style_refs_from_content( $block_content )
			) ) );
		}
		return $block_content;
	}

	// -------------------------------------------------------------------------
	// GREP styles (#196)
	// -------------------------------------------------------------------------

	/**
	 * Wrap the text a style's GREP rules match, as the block renders.
	 *
	 * Hooked to `render_block` (priority 9, before the style collector). The
	 * saved content never changes: the spans exist only in the rendered
	 * HTML, so a change to a rule restyles every post on its next render.
	 * Runs on WordPress 6.9+ (Typost_PS_Text_Ranges::is_supported()); below
	 * that, the rules have no effect and the admin form does not show them.
	 *
	 * @param string $block_content Rendered block.
	 * @param array  $block         Parsed block.
	 * @return string
	 */
	public function apply_grep_styles( $block_content, $block = null ) {
		if ( ! is_string( $block_content ) || false === strpos( $block_content, 'typost-ps-' ) ) {
			return $block_content;
		}
		$name = is_array( $block ) && isset( $block['blockName'] ) ? $block['blockName'] : '';
		if ( ! in_array( $name, self::GREP_BLOCKS, true ) ) {
			return $block_content;
		}
		$map = $this->get_grep_style_map();
		if ( empty( $map['rules'] ) || ! Typost_PS_Text_Ranges::is_supported() ) {
			return $block_content;
		}
		// A full parse only for a block whose style has rules: on a site with
		// any rule, this filter sees every styled block.
		if ( ! self::references_grep_rules( $block_content, $map['rules'] ) ) {
			return $block_content;
		}
		return self::wrap_grep( $block_content, $map['rules'], $map['ids'] );
	}

	/**
	 * Whether HTML mentions the `typost-ps-{ref}` class of a style with rules.
	 *
	 * A cheap test before the parser. wrap_grep() reads the classes properly,
	 * with the same reference form (an id, or a legacy `ps_123_456`), so a
	 * false positive only costs that parse.
	 *
	 * @param string $html         HTML fragment.
	 * @param array  $rules_by_ref Rules by style reference (id or legacy id).
	 * @return bool
	 */
	public static function references_grep_rules( $html, $rules_by_ref ) {
		if ( empty( $rules_by_ref ) || ! preg_match_all( '/typost-ps-([A-Za-z0-9_-]+)/', (string) $html, $matches ) ) {
			return false;
		}
		foreach ( $matches[1] as $ref ) {
			if ( isset( $rules_by_ref[ $ref ] ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Whether HTML holds a registered shortcode, written out or as entities.
	 *
	 * GREP runs before do_shortcode (the_content, priority 11), so a shortcode
	 * is still plain text here: a pattern could match inside it. The entity
	 * form counts because wrapped text is written back decoded: `&#91;foo&#93;`,
	 * how an author shows a shortcode as text, would become a real one.
	 *
	 * @param string $html HTML fragment.
	 * @return bool
	 */
	private static function has_registered_shortcode( $html ) {
		// With no tags, the core regex would match any "[ " (do_shortcode() has the same check).
		if ( empty( $GLOBALS['shortcode_tags'] ) || ! function_exists( 'get_shortcode_regex' ) ) {
			return false;
		}
		$text = false !== strpos( $html, '&' ) ? html_entity_decode( $html, ENT_QUOTES | ENT_HTML5, 'UTF-8' ) : $html;
		if ( false === strpos( $text, '[' ) ) {
			return false;
		}
		// A regex error (false) also leaves the block alone.
		return 0 !== preg_match( '/' . get_shortcode_regex() . '/', $text );
	}

	/**
	 * Wrap GREP matches in an HTML fragment.
	 *
	 * A root is an element with the `typost-ps-N` class of a style that has
	 * rules, and (unless $require_styled is false, for the admin preview)
	 * the `typost-styled` class: a core block with a style (#219), or the
	 * Typography Stylist block's visual copy. The block's screen reader copy
	 * carries neither class, so its text never changes. Fit-to-width text
	 * (`typost-fit`) is left alone: its lines were measured in the editor,
	 * and a span with another size or features would change their width.
	 * A fragment with a registered shortcode comes back unchanged (see
	 * has_registered_shortcode()).
	 *
	 * @param string $html           HTML fragment.
	 * @param array  $rules_by_ref   Rules by style reference (id or legacy id, as strings).
	 * @param array  $valid_ids      Style ids a rule may apply, as keys.
	 * @param bool   $require_styled Whether a root needs the `typost-styled` class.
	 * @param array  $font_ids       For the admin card: style id => font id the
	 *                               admin font loader must load for its spans.
	 *                               The frontend passes none.
	 * @return string
	 */
	public static function wrap_grep( $html, $rules_by_ref, $valid_ids, $require_styled = true, $font_ids = array() ) {
		if ( self::has_registered_shortcode( (string) $html ) ) {
			return $html;
		}
		$root_for_tag = function ( $processor ) use ( $rules_by_ref, $require_styled ) {
			if ( ( $require_styled && ! $processor->has_class( 'typost-styled' ) ) || $processor->has_class( 'typost-fit' ) ) {
				return null;
			}
			foreach ( $processor->class_list() as $class_name ) {
				if ( preg_match( '/^typost-ps-([A-Za-z0-9_-]+)$/', $class_name, $m ) && isset( $rules_by_ref[ $m[1] ] ) ) {
					return $m[1];
				}
			}
			return null;
		};
		$open_tag_for = function ( $style_id ) use ( $valid_ids, $font_ids ) {
			return isset( $valid_ids[ $style_id ] ) ? Typost_PS_Grep::open_tag( $style_id, isset( $font_ids[ $style_id ] ) ? $font_ids[ $style_id ] : 0 ) : '';
		};
		$ranges_for_root = function ( $ref, $plain ) use ( $rules_by_ref, $open_tag_for ) {
			return Typost_PS_Grep::find_ranges( $plain, $rules_by_ref[ $ref ], $open_tag_for );
		};
		return Typost_PS_Text_Ranges::wrap( $html, $root_for_tag, $ranges_for_root );
	}

	/**
	 * The GREP rules of every style that has some, for this request.
	 *
	 * @return array array( 'rules' => ref => rules, 'ids' => style id => true ).
	 */
	private function get_grep_style_map() {
		if ( null === $this->grep_style_map ) {
			$rules = array();
			$ids   = array();
			foreach ( $this->get_styles() as $style ) {
				if ( ! isset( $style['id'] ) ) {
					continue;
				}
				$ids[ intval( $style['id'] ) ] = true;
				if ( empty( $style['grepRules'] ) || ! is_array( $style['grepRules'] ) ) {
					continue;
				}
				$rules[ (string) $style['id'] ] = $style['grepRules'];
				if ( ! empty( $style['legacyId'] ) ) {
					$rules[ (string) $style['legacyId'] ] = $style['grepRules'];
				}
			}
			$this->grep_style_map = array(
				'rules' => $rules,
				'ids'   => $ids,
			);
		}
		return $this->grep_style_map;
	}

	/**
	 * Style references plus the styles their GREP rules apply.
	 *
	 * One level is enough: a GREP span carries `data-style-id`, not a
	 * `typost-ps-N` class, so the rules of the style it applies never run
	 * inside it.
	 *
	 * @param array $refs Style references.
	 * @return string[]
	 */
	private function with_grep_targets( array $refs ) {
		$map = $this->get_grep_style_map();
		if ( empty( $map['rules'] ) ) {
			return $refs;
		}
		$out = array_map( 'strval', $refs );
		foreach ( $refs as $ref ) {
			$ref = (string) $ref;
			if ( isset( $map['rules'][ $ref ] ) ) {
				foreach ( Typost_PS_Grep::target_style_ids( $map['rules'][ $ref ] ) as $target ) {
					$out[] = (string) $target;
				}
			}
		}
		return array_values( array_unique( $out ) );
	}

	/**
	 * CSS that keeps a style's OpenType features inside its GREP spans.
	 *
	 * `font-feature-settings` is one property, so a span whose style sets
	 * `c2sc` would otherwise drop the `onum` of the paragraph around it. For
	 * each rule whose style sets features, when the paragraph style sets
	 * features too, this writes both lists (the paragraph's first) for that
	 * span inside that paragraph. The selector, (0,8,0), beats the span
	 * style's own (0,6,0) rule. Fonts' variation settings are not combined.
	 *
	 * @param array $style  Style record.
	 * @param array $styles Every stored style.
	 * @return string CSS, '' when there is nothing to combine.
	 */
	public static function grep_feature_css( $style, $styles ) {
		if ( empty( $style['grepRules'] ) || ! is_array( $style['grepRules'] ) || ! isset( $style['id'] ) ) {
			return '';
		}
		$own_features = self::resolved_features( $style, $styles );
		if ( empty( $own_features ) ) {
			return '';
		}

		$refs = array( (string) intval( $style['id'] ) );
		if ( ! empty( $style['legacyId'] ) ) {
			$refs[] = esc_attr( $style['legacyId'] );
		}

		$css = array();
		foreach ( Typost_PS_Grep::target_style_ids( $style['grepRules'] ) as $target_id ) {
			$target = null;
			foreach ( $styles as $candidate ) {
				if ( isset( $candidate['id'] ) && intval( $candidate['id'] ) === $target_id ) {
					$target = $candidate;
					break;
				}
			}
			if ( null === $target ) {
				continue;
			}
			$target_features = self::resolved_features( $target, $styles );
			if ( empty( $target_features ) ) {
				continue;
			}
			$features  = array_values( array_unique( array_merge( $own_features, $target_features ) ) );
			$selectors = array();
			foreach ( $refs as $ref ) {
				$selectors[] = sprintf( '.typost-ps-%1$s .typost-grep.typost-grep.typost-grep[data-style-id="%2$d"][data-style-id][data-style-id][data-style-id]', $ref, $target_id );
			}
			$css[] = sprintf(
				"%s {\n    font-feature-settings: %s;\n}",
				implode( ",\n", $selectors ),
				implode( ', ', array_map( function ( $f ) {
					return '"' . esc_attr( $f ) . '" 1';
				}, $features ) )
			);
		}
		return implode( "\n\n", $css );
	}

	/**
	 * A style's resolved OpenType features (#200 Based On included).
	 *
	 * @param array $style  Style record.
	 * @param array $styles Every stored style.
	 * @return string[]
	 */
	private static function resolved_features( $style, $styles ) {
		$props = empty( $style['basedOn'] )
			? ( isset( $style['properties'] ) ? $style['properties'] : array() )
			: self::resolve_properties( $style, $styles );
		return ! empty( $props['features'] ) && is_array( $props['features'] ) ? array_values( $props['features'] ) : array();
	}

	/**
	 * Sanitize the `grepRules` of a create or update request.
	 *
	 * Built-in patterns are open to every author (`edit_posts`, the routes'
	 * capability). Adding or changing a custom pattern needs
	 * `manage_options`: a slow pattern costs server time on every uncached
	 * render of every post that uses the style. An author may keep a custom
	 * pattern an administrator stored.
	 *
	 * @param mixed $raw      Request value.
	 * @param int   $own_id   The style's id (0 for a new style).
	 * @param array $existing The style's stored rules.
	 * @param array $styles   Every stored style.
	 * @return array See Typost_PS_Grep::sanitize_rules().
	 */
	private function sanitize_request_grep_rules( $raw, $own_id, $existing, $styles ) {
		if ( null === $raw || '' === $raw || array() === $raw ) {
			return Typost_PS_Grep::sanitize_rules( array(), array() );
		}
		$style_ids = array();
		foreach ( $styles as $style ) {
			if ( isset( $style['id'] ) ) {
				$style_ids[] = intval( $style['id'] );
			}
		}
		return Typost_PS_Grep::sanitize_rules( $raw, array(
			'own_id'           => $own_id,
			'style_ids'        => $style_ids,
			'existing'         => $existing,
			'can_write_custom' => current_user_can( 'manage_options' ),
		) );
	}

	/**
	 * The 400 response for rules that failed sanitize_rules().
	 *
	 * @param array $grep Result of sanitize_rules().
	 * @return WP_REST_Response
	 */
	private static function grep_error_response( $grep ) {
		return new WP_REST_Response( array(
			'message'   => $grep['error'],
			'field'     => 'grepRules',
			'ruleIndex' => $grep['index'],
			'ruleField' => $grep['field'],
		), 400 );
	}

	/**
	 * Whether GREP styles work on this site (WordPress 6.9+).
	 *
	 * @return bool
	 */
	public static function grep_supported() {
		return Typost_PS_Text_Ranges::is_supported();
	}

	/**
	 * The pattern choices of the admin form, in order.
	 *
	 * @return array List of array( 'value' => string, 'label' => string ).
	 */
	public static function grep_pattern_options() {
		$options = array();
		foreach ( Typost_PS_Grep::pattern_labels() as $value => $label ) {
			$options[] = array(
				'value' => $value,
				'label' => $label,
			);
		}
		return $options;
	}

	/**
	 * Print one <style> element with the rules for the referenced styles.
	 *
	 * Rules keep the order of the stored styles (the order get_all_css()
	 * uses), and each style prints at most once per request.
	 *
	 * @param array  $refs       Style references (ids or legacy ids).
	 * @param string $element_id A fixed id for the <style> element.
	 */
	private function print_style_rules( array $refs, $element_id ) {
		$blocks     = array();
		$grep       = array();
		$all_styles = $this->get_styles();
		foreach ( $this->styles_for_refs( $this->with_grep_targets( $refs ) ) as $style ) {
			$key = isset( $style['id'] ) ? (string) $style['id'] : '';
			if ( '' === $key || isset( $this->printed_style_ids[ $key ] ) ) {
				continue;
			}
			$this->printed_style_ids[ $key ] = true;
			$block                           = $this->generate_style_css( $style, $all_styles );
			if ( '' !== $block ) {
				$blocks[] = $block;
			}
			$block = self::grep_feature_css( $style, $all_styles );
			if ( '' !== $block ) {
				$grep[] = $block;
			}
		}
		// GREP feature rules after the styles they combine (#196)
		$blocks = array_merge( $blocks, $grep );
		if ( empty( $blocks ) ) {
			return;
		}

		echo "\n<style id=\"" . $element_id . "\">\n" . implode( "\n\n", $blocks ) . "\n</style>\n"; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- $element_id is a literal from this class; the CSS is generated exclusively from sanitized numeric/whitelisted values in generate_style_css().
	}

	/**
	 * Style references in the content this request displays.
	 *
	 * Raw post content carries every reference: the block's `typost-ps-N`
	 * class and `styleClass` attribute, and the inline `data-style-id`. The
	 * excerpt is read too, because a theme can show it on a singular page.
	 *
	 * A classic theme renders its block widgets after wp_head, often in the
	 * header, so their stored content is read here too: otherwise their
	 * rules would print only in the footer pass, after the text they style.
	 * The option holds every block widget, inactive ones included, so this
	 * can print a rule no widget on the page uses. A block theme renders its
	 * widgets before wp_head, where the render_block collector sees them.
	 *
	 * @return string[]
	 */
	private function get_page_style_refs() {
		$content = '';
		// A page that lists posts prints every style (page_lists_posts()),
		// so only a singular page's own post needs reading.
		$post = is_singular() ? get_queried_object() : null;
		if ( is_object( $post ) ) {
			foreach ( array( 'post_content', 'post_excerpt' ) as $field ) {
				if ( isset( $post->$field ) && is_string( $post->$field ) ) {
					$content .= "\n" . $post->$field;
				}
			}
		}

		if ( ! function_exists( 'wp_is_block_theme' ) || ! wp_is_block_theme() ) {
			$widgets = get_option( 'widget_block', array() );
			foreach ( is_array( $widgets ) ? $widgets : array() as $widget ) {
				if ( is_array( $widget ) && isset( $widget['content'] ) && is_string( $widget['content'] ) ) {
					$content .= "\n" . $widget['content'];
				}
			}
		}

		if ( '' === $content ) {
			return array();
		}

		$visited  = array();
		$content .= $this->get_synced_pattern_content( $content, $visited );
		return $this->style_refs_from_content( $content );
	}

	/**
	 * The saved content of every synced pattern that content references.
	 *
	 * A synced pattern is saved as `<!-- wp:block {"ref":N} /-->` only. Core
	 * reads patterns the same way for the editor kit scan; that helper is
	 * private, and this module uses core's public API only. Block comment
	 * attributes escape `<` and `>`, so the attribute JSON holds no `>`.
	 *
	 * @param string $content Block content.
	 * @param array  $visited Pattern ids already read (by reference), so a
	 *                        pattern that references itself cannot loop.
	 * @param int    $depth   Nesting depth (stops at 5).
	 * @return string The patterns' content, newline-separated ('' if none).
	 */
	private function get_synced_pattern_content( $content, array &$visited, $depth = 0 ) {
		if ( $depth > 5 || false === strpos( $content, 'wp:block ' ) ) {
			return '';
		}
		if ( ! preg_match_all( '/<!--\s+wp:block\s+\{[^>]*?"ref":(\d+)/', $content, $matches ) ) {
			return '';
		}

		$out = '';
		foreach ( array_unique( array_map( 'intval', $matches[1] ) ) as $ref ) {
			if ( $ref <= 0 || isset( $visited[ $ref ] ) ) {
				continue;
			}
			$visited[ $ref ] = true;
			$pattern         = get_post( $ref );
			if ( ! $pattern || ! isset( $pattern->post_type ) || 'wp_block' !== $pattern->post_type || ! is_string( $pattern->post_content ) ) {
				continue;
			}
			$out .= "\n" . $pattern->post_content;
			$out .= $this->get_synced_pattern_content( $pattern->post_content, $visited, $depth + 1 );
		}
		return $out;
	}

	/**
	 * Style ids that theme or extension CSS needs on every frontend page.
	 *
	 * Memoized for the request: the result also feeds core's
	 * `typost_force_enqueue_font_ids`, whose output must stay stable within
	 * a request.
	 *
	 * @return string[] Style ids and legacy ids, as strings.
	 */
	public function get_forced_style_refs() {
		if ( null === $this->forced_style_refs ) {
			/**
			 * Filters the paragraph styles whose CSS prints on every frontend page.
			 *
			 * Use it when a theme or extension puts a `typost-ps-N` class or a
			 * `data-style-id` in markup that the content scan cannot see.
			 * The fonts of these styles load on every page too.
			 *
			 * @since 2.3.1
			 * @param array $ids Style ids (integers, or legacy `ps_…` strings).
			 */
			$ids  = apply_filters( 'typost_force_enqueue_paragraph_style_ids', array() );
			$refs = array();
			foreach ( is_array( $ids ) ? $ids : array() as $id ) {
				if ( ( is_int( $id ) || is_string( $id ) ) && preg_match( '/^[A-Za-z0-9_-]+$/', (string) $id ) ) {
					$refs[] = (string) $id;
				}
			}
			$this->forced_style_refs = array_values( array_unique( $refs ) );
		}
		return $this->forced_style_refs;
	}

	/**
	 * Add the fonts of the forced styles to core's forced font ids.
	 *
	 * Hooked to `typost_force_enqueue_font_ids`.
	 *
	 * @param int[] $font_ids Font ids forced so far.
	 * @return int[]
	 */
	public function font_ids_from_forced_styles( $font_ids ) {
		if ( ! is_array( $font_ids ) ) {
			$font_ids = array();
		}
		foreach ( $this->styles_for_refs( $this->with_grep_targets( $this->get_forced_style_refs() ) ) as $style ) {
			$font_id = $this->resolved_font_id( $style );
			if ( $font_id > 0 ) {
				$font_ids[] = $font_id;
			}
		}
		return $font_ids;
	}

	/**
	 * The id of every stored style, as strings.
	 *
	 * @return string[]
	 */
	private function get_all_style_refs() {
		$refs = array();
		foreach ( $this->get_styles() as $style ) {
			if ( isset( $style['id'] ) ) {
				$refs[] = (string) $style['id'];
			}
		}
		return $refs;
	}

	/**
	 * Style references (ids or legacy ids) in a piece of content.
	 *
	 * Matches `data-style-id` on inline spans and `typost-ps-N` on blocks.
	 * Saved block comment JSON stores a quote as `\u0022`
	 * (`data-style-id=\u00225\u0022`: serialize_block_attributes() and the JS
	 * serializer both do this), and other JSON escapes it as `\"`, so the
	 * pattern accepts any of those quote forms, or none. The token class is
	 * the same as findParagraphStyleByClass() and the legacyId validators
	 * use: a hyphenated legacy id must not truncate at the hyphen.
	 *
	 * @param string $content Content to scan.
	 * @return string[] Unique references, as strings.
	 */
	public function style_refs_from_content( $content ) {
		if ( ! is_string( $content ) || '' === $content ) {
			return array();
		}
		$refs = array();
		if ( preg_match_all( '/data-style-id=(?:\\\\u0022|["\'\\\\])*([A-Za-z0-9_-]+)/', $content, $matches ) ) {
			$refs = $matches[1];
		}
		if ( preg_match_all( '/typost-ps-([A-Za-z0-9_-]+)/', $content, $matches ) ) {
			$refs = array_merge( $refs, $matches[1] );
		}
		return array_values( array_unique( array_map( 'strval', $refs ) ) );
	}

	/**
	 * The stored styles that references point to, in stored order.
	 *
	 * A reference matches a style's `id` or its `legacyId` (old content
	 * still carries `ps_1709…` ids). Unknown references match nothing.
	 *
	 * @param array $refs Style references.
	 * @return array Matching style records.
	 */
	private function styles_for_refs( array $refs ) {
		if ( empty( $refs ) ) {
			return array();
		}
		$lookup = array_flip( array_map( 'strval', $refs ) );

		$matched = array();
		foreach ( $this->get_styles() as $style ) {
			$style_id  = isset( $style['id'] ) ? (string) $style['id'] : '';
			$legacy_id = isset( $style['legacyId'] ) ? (string) $style['legacyId'] : '';
			if ( ( '' !== $style_id && isset( $lookup[ $style_id ] ) ) || ( '' !== $legacy_id && isset( $lookup[ $legacy_id ] ) ) ) {
				$matched[] = $style;
			}
		}
		return $matched;
	}

	/**
	 * Enqueue paragraph style CSS as inline style in the block editor.
	 *
	 * Uses enqueue_block_assets which works inside iframed editors (WP 6.x+).
	 * Only loads in admin/editor context to avoid double-loading on frontend.
	 */
	public function enqueue_editor_style_css() {
		if ( ! is_admin() ) {
			return;
		}

		$css = $this->get_all_css();
		if ( empty( $css ) ) {
			return;
		}

		// Register a dummy handle and attach inline CSS to it
		wp_register_style( 'typost-paragraph-styles-inline', false );
		wp_enqueue_style( 'typost-paragraph-styles-inline' );
		wp_add_inline_style( 'typost-paragraph-styles-inline', $css );
	}

	// -------------------------------------------------------------------------
	// Admin Tab
	// -------------------------------------------------------------------------

	/**
	 * Register the Paragraph Styles tab in admin settings.
	 *
	 * @param array $tabs Existing tabs.
	 * @return array Modified tabs.
	 */
	public function register_admin_tab( $tabs ) {
		$tabs[] = array(
			'id'       => 'paragraph-styles',
			'label'    => __( 'Paragraph Styles', 'typost-paragraph-styles' ),
			'priority' => 15,
		);
		return $tabs;
	}

	/**
	 * Render the Paragraph Styles admin tab content.
	 *
	 * @param object $instance The Typost instance.
	 */
	public function render_admin_tab( $instance ) {
		include TYPOST_PS_PLUGIN_DIR . 'includes/admin-tab.php';
	}

	// -------------------------------------------------------------------------
	// Editor Data
	// -------------------------------------------------------------------------

	/**
	 * Report the fonts that paragraph style references in content resolve to.
	 *
	 * A span applied from the block editor is `<span class="typost-styled"
	 * data-style-id="5">` and a styled block carries `typost-ps-5`: neither
	 * names a font, so core's content scan (data-font, data-font-id,
	 * --font-N) never enqueued the style's font and the frontend rendered a
	 * fallback face. Hooked to `typost_content_font_ids`.
	 *
	 * Legacy timestamp ids (`ps_1709…`) still appear in old content; they are
	 * matched against each style's `legacyId`. The scan is
	 * style_refs_from_content(), which also decides the frontend style CSS.
	 *
	 * @param int[]  $ids     Font IDs collected so far.
	 * @param string $content Content being scanned.
	 * @return int[] Font IDs including those the referenced styles use.
	 */
	public function font_ids_from_content( $ids, $content ) {
		if ( ! is_array( $ids ) ) {
			$ids = array();
		}

		$style_refs = $this->style_refs_from_content( $content );
		if ( empty( $style_refs ) ) {
			return $ids;
		}

		// The styles GREP rules apply (#196) render in this content too
		foreach ( $this->styles_for_refs( $this->with_grep_targets( $style_refs ) ) as $style ) {
			// A font the style inherits from its parent (#200) loads too
			$font_id = $this->resolved_font_id( $style );
			if ( $font_id > 0 ) {
				$ids[] = $font_id;
			}
		}

		return array_values( array_unique( array_map( 'intval', $ids ) ) );
	}

	/**
	 * The font a style renders in, its parent chain included (#200).
	 *
	 * @param array $style Style record.
	 * @return int Font id, 0 when none.
	 */
	private function resolved_font_id( $style ) {
		$props = empty( $style['basedOn'] )
			? ( isset( $style['properties'] ) ? $style['properties'] : array() )
			: self::resolve_properties( $style, $this->get_styles() );
		return isset( $props['fontId'] ) ? intval( $props['fontId'] ) : 0;
	}

	/**
	 * A style as the editors and REST clients receive it (#200).
	 *
	 * `properties` holds the resolved values, so every reader (the apply
	 * payload, the "(modified)" badge, the block re-sync, font kits, the
	 * size unit) sees what the style renders. A style based on another also
	 * carries `ownProperties`: what it stores itself, which is what a write
	 * sends back as `properties`. A style without `basedOn` is returned
	 * unchanged. resolveStyleList() in ps-utils.js builds the same shape.
	 *
	 * @param array $style  Stored style.
	 * @param array $styles Every stored style.
	 * @return array
	 */
	public static function prepare_style_for_client( $style, $styles ) {
		if ( empty( $style['basedOn'] ) ) {
			return $style;
		}
		$style['ownProperties'] = isset( $style['properties'] ) && is_array( $style['properties'] ) ? $style['properties'] : array();
		$style['properties']    = self::resolve_properties( $style, $styles );
		return $style;
	}

	/**
	 * Every stored style in the client shape (prepare_style_for_client()).
	 *
	 * @return array
	 */
	public function get_client_styles() {
		$styles = $this->get_styles();
		$client = array();
		foreach ( $styles as $style ) {
			$client[] = self::prepare_style_for_client( $style, $styles );
		}
		return $client;
	}

	/**
	 * Add paragraph styles to the editor localized data.
	 *
	 * @param array $data Existing editor data.
	 * @return array Modified editor data.
	 */
	public function add_editor_data( $data ) {
		$data['paragraphStyles']        = $this->get_client_styles();
		$data['paragraphStylesOptions'] = array(
			'toolbarButton' => $this->toolbar_button_enabled(),
		);
		return $data;
	}

	// -------------------------------------------------------------------------
	// Options tab setting
	// -------------------------------------------------------------------------

	/**
	 * Whether the direct-access toolbar button is enabled.
	 *
	 * On by default since 2.3.5 (#322): with the button off, most authors
	 * never find the styles browser from the toolbar.
	 *
	 * @since 1.2.0
	 * @return bool
	 */
	private function toolbar_button_enabled() {
		return (bool) get_option( self::TOOLBAR_OPTION, true );
	}

	/**
	 * Turn the toolbar button on once, on the first admin request after the
	 * update to 2.3.5 (#322).
	 *
	 * Every Options save stores '0' for an unchecked box, so a site that
	 * turned the button off on purpose looks the same as one that never
	 * turned it on. The button is turned on for every site one time, and the
	 * flag then keeps whatever the author sets. Same pattern as core's
	 * maybe_repair_font_library_json().
	 *
	 * @since 2.3.5
	 */
	public function maybe_turn_on_toolbar_button() {
		if ( get_option( self::TOOLBAR_DEFAULT_ON_FLAG, false ) ) {
			return;
		}
		update_option( self::TOOLBAR_OPTION, '1' );
		update_option( self::TOOLBAR_DEFAULT_ON_FLAG, true, false );
	}

	/**
	 * Render the toolbar button setting into the core Options tab.
	 *
	 * @since 1.2.0
	 */
	public function render_options_row() {
		?>
		<tr>
			<th scope="row">
				<?php esc_html_e( 'Paragraph Styles Toolbar Button', 'typost-paragraph-styles' ); ?>
			</th>
			<td>
				<input
					type="checkbox"
					id="<?php echo esc_attr( self::TOOLBAR_OPTION ); ?>"
					name="<?php echo esc_attr( self::TOOLBAR_OPTION ); ?>"
					value="1"
					data-typost-option="1"
					<?php checked( $this->toolbar_button_enabled() ); ?>
				/>
				<label for="<?php echo esc_attr( self::TOOLBAR_OPTION ); ?>">
					<?php esc_html_e( 'Add a Paragraph Styles button to the block toolbar', 'typost-paragraph-styles' ); ?>
				</label>
				<p class="description">
					<?php esc_html_e( 'Opens a browser that shows every saved paragraph style in its own typeface, so you can see a style before you apply it. The button shows in Typography Stylist blocks, and next to the “Typography Stylist Features” button in other blocks. The Paragraph Style controls in the sidebar and the editor panels do not change.', 'typost-paragraph-styles' ); ?>
				</p>
			</td>
		</tr>
		<?php
	}

	/**
	 * Register the toolbar option so core's Options save persists it.
	 *
	 * @since 1.2.0
	 * @param array $options Registered option keys.
	 * @return array
	 */
	public function register_option_key( $options ) {
		$options[] = self::TOOLBAR_OPTION;
		return $options;
	}

	/**
	 * Name the toolbar option in export files (#205).
	 *
	 * @since 2.3.5
	 * @param array $details Option name => {label, default}.
	 * @return array
	 */
	public function export_option_details( $details ) {
		$details = is_array( $details ) ? $details : array();
		$details[ self::TOOLBAR_OPTION ] = array(
			'label'   => __( 'Add a Paragraph Styles button to the block toolbar', 'typost-paragraph-styles' ),
			'default' => true,
		);
		return $details;
	}

	// -------------------------------------------------------------------------
	// REST API
	// -------------------------------------------------------------------------

	/**
	 * Register REST API routes for paragraph styles CRUD.
	 */
	public function register_rest_routes() {
		register_rest_route( self::REST_NAMESPACE, '/paragraph-styles', array(
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'rest_get_styles' ),
				'permission_callback' => array( $this, 'check_permissions' ),
			),
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( $this, 'rest_create_style' ),
				'permission_callback' => array( $this, 'check_permissions' ),
			),
		) );

		register_rest_route( self::REST_NAMESPACE, '/paragraph-styles/(?P<id>[\d]+)', array(
			array(
				'methods'             => 'PATCH',
				'callback'            => array( $this, 'rest_update_style' ),
				'permission_callback' => array( $this, 'check_permissions' ),
			),
			array(
				'methods'             => WP_REST_Server::DELETABLE,
				'callback'            => array( $this, 'rest_delete_style' ),
				'permission_callback' => array( $this, 'check_permissions' ),
			),
		) );

		// The admin tab's edit form refreshes a card from this after a save (#221)
		register_rest_route( self::REST_NAMESPACE, '/paragraph-styles/(?P<id>[\d]+)/admin-card', array(
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'rest_get_admin_card' ),
				'permission_callback' => array( $this, 'check_permissions' ),
			),
		) );
	}

	/**
	 * Permission check — matches core plugin's capability requirement.
	 *
	 * @return bool
	 */
	public function check_permissions() {
		return current_user_can( 'edit_posts' );
	}

	/**
	 * GET /paragraph-styles
	 *
	 * @return WP_REST_Response
	 */
	public function rest_get_styles() {
		return new WP_REST_Response( $this->get_client_styles(), 200 );
	}

	/**
	 * POST /paragraph-styles
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response
	 */
	public function rest_create_style( $request ) {
		$name     = trim( sanitize_text_field( $request->get_param( 'name' ) ) );
		$based_on = self::parse_based_on( $request->get_param( 'basedOn' ) );

		if ( empty( $name ) ) {
			return new WP_REST_Response( array( 'message' => __( 'Style name is required.', 'typost-paragraph-styles' ) ), 400 );
		}

		$styles = $this->get_styles();

		if ( null === $based_on ) {
			return new WP_REST_Response( array( 'message' => __( 'The style to base this style on does not exist.', 'typost-paragraph-styles' ), 'field' => 'basedOn' ), 400 );
		}
		if ( $based_on ) {
			$error = self::based_on_error( $styles, 0, $based_on );
			if ( '' !== $error ) {
				// field: the admin form marks the Based on select, not the name
				return new WP_REST_Response( array( 'message' => $error, 'field' => 'basedOn' ), 400 );
			}
		}

		// A style based on another stores only its overrides, which may
		// include empty values that unset an inherited property (#200).
		// Values equal to the parent's are dropped here, so every client
		// gets the same rule, not only the ones that compare first.
		$properties = $this->sanitize_properties( $request->get_param( 'properties' ), $based_on > 0 );
		if ( $based_on ) {
			$properties = self::drop_inherited_properties( $properties, $this->resolved_style_properties( $styles, $based_on ) );
		}

		// GREP styles (#196): a new style has no stored rules to keep
		$grep = $this->sanitize_request_grep_rules( $request->get_param( 'grepRules' ), 0, array(), $styles );
		if ( '' !== $grep['error'] ) {
			return self::grep_error_response( $grep );
		}

		$new_id = $this->get_next_id();

		$new_style = array(
			'id'         => $new_id,
			'name'       => $name,
			'created'    => current_time( 'Y-m-d' ),
			'modified'   => current_time( 'Y-m-d' ),
			'properties' => $properties,
		);
		if ( $based_on ) {
			$new_style['basedOn'] = $based_on;
		}
		if ( ! empty( $grep['rules'] ) ) {
			$new_style['grepRules'] = $grep['rules'];
		}

		$styles[] = $new_style;
		$this->save_styles( $styles );

		return new WP_REST_Response( self::prepare_style_for_client( $new_style, $styles ), 201 );
	}

	/**
	 * PATCH /paragraph-styles/{id}
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response
	 */
	public function rest_update_style( $request ) {
		$id     = intval( $request['id'] );
		$styles = $this->get_styles();
		$index  = $this->find_style_index( $styles, $id );

		if ( false === $index ) {
			return new WP_REST_Response( array( 'message' => __( 'Style not found.', 'typost-paragraph-styles' ) ), 404 );
		}

		$name = $request->get_param( 'name' );
		if ( null !== $name ) {
			$name = trim( sanitize_text_field( $name ) );
			if ( empty( $name ) ) {
				return new WP_REST_Response( array( 'message' => __( 'Style name cannot be empty.', 'typost-paragraph-styles' ) ), 400 );
			}
			$styles[ $index ]['name'] = $name;
		}

		// Based On (#200). Absent leaves it as it is; 0, '' and null remove
		// it. has_param(), not a null check: get_param() returns null for an
		// absent key and for a JSON null alike, and a null sent to detach
		// used to change nothing (review of #293)
		$old_based_on = ! empty( $styles[ $index ]['basedOn'] ) ? intval( $styles[ $index ]['basedOn'] ) : 0;
		$based_on     = $old_based_on;
		if ( $request->has_param( 'basedOn' ) ) {
			$based_on = self::parse_based_on( $request->get_param( 'basedOn' ) );
			if ( null === $based_on ) {
				return new WP_REST_Response( array( 'message' => __( 'The style to base this style on does not exist.', 'typost-paragraph-styles' ), 'field' => 'basedOn' ), 400 );
			}
			if ( $based_on && $based_on !== $old_based_on ) {
				$error = self::based_on_error( $styles, $id, $based_on );
				if ( '' !== $error ) {
					// field: the admin form marks the Based on select, not the name
					return new WP_REST_Response( array( 'message' => $error, 'field' => 'basedOn' ), 400 );
				}
			}
		}

		// The client sends the style's own properties relative to its
		// current parent: with one, only its overrides
		// (computeStyleOverrides() in ps-utils.js). A change of Based On is
		// then applied by rebase_properties(), with or without new
		// properties, so both saves follow one rule.
		// Empty values are kept only when the style has a parent now: they
		// unset what that parent sets. A style without one sends its whole
		// look, where an empty value sets nothing, and a first parent then
		// gets the empty values it needs from compute_overrides().
		$properties = $request->get_param( 'properties' );
		if ( null !== $properties ) {
			$styles[ $index ]['properties'] = $this->sanitize_properties( $properties, $old_based_on > 0 );
		}
		if ( $based_on !== $old_based_on ) {
			$styles[ $index ]['properties'] = $this->rebase_properties( $styles, $index, $based_on );
		} elseif ( $based_on && null !== $properties ) {
			// Values equal to the parent's become inherited for every
			// client, also one that sends back the resolved properties
			$styles[ $index ]['properties'] = self::drop_inherited_properties( $styles[ $index ]['properties'], $this->resolved_style_properties( $styles, $based_on ) );
		}

		if ( $based_on ) {
			$styles[ $index ]['basedOn'] = $based_on;
		} else {
			unset( $styles[ $index ]['basedOn'] );
		}

		// GREP styles (#196). Absent leaves the rules as they are, so an
		// Update Style from an editor (which sends properties only) keeps
		// them; an empty list removes them.
		if ( $request->has_param( 'grepRules' ) ) {
			$existing = isset( $styles[ $index ]['grepRules'] ) && is_array( $styles[ $index ]['grepRules'] ) ? $styles[ $index ]['grepRules'] : array();
			$grep     = $this->sanitize_request_grep_rules( $request->get_param( 'grepRules' ), $id, $existing, $styles );
			if ( '' !== $grep['error'] ) {
				return self::grep_error_response( $grep );
			}
			if ( empty( $grep['rules'] ) ) {
				unset( $styles[ $index ]['grepRules'] );
			} else {
				$styles[ $index ]['grepRules'] = $grep['rules'];
			}
		}

		$styles[ $index ]['modified'] = current_time( 'Y-m-d' );
		$this->save_styles( $styles );

		return new WP_REST_Response( self::prepare_style_for_client( $styles[ $index ], $styles ), 200 );
	}

	/**
	 * A style's own properties after its Based On changes (#200).
	 *
	 * - Removing the parent copies the resolved values into the style, so it
	 *   looks the same.
	 * - A first parent (the style had none, or its parent was deleted) keeps
	 *   the look too: the style stores what differs from the parent, and an
	 *   empty value for each property the parent sets and the style does not
	 *   (compute_overrides()). Choosing None afterwards gives the old look
	 *   back.
	 * - A move from one parent to another keeps what the style sets, except
	 *   values that equal the new parent's, which become inherited;
	 *   everything the style does not set inherits from the new parent.
	 *
	 * @param array $styles       Every stored style, the changed style's own
	 *                            properties relative to its old parent.
	 * @param int   $index        Index of the style that changes.
	 * @param int   $new_based_on The new parent id, 0 for none.
	 * @return array
	 */
	private function rebase_properties( $styles, $index, $new_based_on ) {
		$style = $styles[ $index ];
		if ( ! $new_based_on ) {
			return self::compact_properties( self::resolve_properties( $style, $styles ) );
		}
		$parent     = $this->resolved_style_properties( $styles, $new_based_on );
		$had_parent = ! empty( $style['basedOn'] ) && false !== $this->find_style_index( $styles, intval( $style['basedOn'] ) );
		if ( ! $had_parent ) {
			$look = self::compact_properties( self::resolve_properties( $style, $styles ) );
			return self::compute_overrides( $look, $parent );
		}
		$own = isset( $style['properties'] ) && is_array( $style['properties'] ) ? $style['properties'] : array();
		return self::drop_inherited_properties( $own, $parent );
	}

	/**
	 * The resolved properties of a stored style, empty when it is missing.
	 *
	 * @param array $styles   Every stored style.
	 * @param int   $style_id Style id.
	 * @return array
	 */
	private function resolved_style_properties( $styles, $style_id ) {
		$index = $this->find_style_index( $styles, $style_id );
		return false === $index ? array() : self::resolve_properties( $styles[ $index ], $styles );
	}

	/**
	 * Read a `basedOn` request value: the parent id, 0 for none, or null
	 * when the value is not a style id (#200).
	 *
	 * An integer or a string of digits is an id; null and '' mean none.
	 * Anything else (a negative number, a fraction, a word, a boolean, an
	 * array) is rejected, so it cannot link a style by accident (-3 became
	 * style 3) or remove its parent (absint( 'abc' ) is 0).
	 *
	 * @param mixed $value Request value.
	 * @return int|null
	 */
	public static function parse_based_on( $value ) {
		if ( null === $value || '' === $value ) {
			return 0;
		}
		if ( is_int( $value ) ) {
			return $value >= 0 ? $value : null;
		}
		if ( is_string( $value ) && ctype_digit( $value ) ) {
			return intval( $value );
		}
		return null;
	}

	/**
	 * DELETE /paragraph-styles/{id}
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response
	 */
	public function rest_delete_style( $request ) {
		$id     = intval( $request['id'] );
		$styles = $this->get_styles();
		$index  = $this->find_style_index( $styles, $id );

		if ( false === $index ) {
			return new WP_REST_Response( array( 'message' => __( 'Style not found.', 'typost-paragraph-styles' ) ), 404 );
		}

		// Styles based on this one get its resolved values copied in and lose
		// the link, so they look the same after the delete (#200). Styles
		// further down keep their parent, which still looks the same.
		$detached = array();
		foreach ( $styles as $i => $style ) {
			if ( ! empty( $style['basedOn'] ) && intval( $style['basedOn'] ) === $id ) {
				$styles[ $i ]['properties'] = self::compact_properties( self::resolve_properties( $style, $styles ) );
				unset( $styles[ $i ]['basedOn'] );
				$detached[] = intval( $style['id'] );
			}
		}

		// GREP rules that apply the deleted style go with it (#196)
		$grep_changed = array();
		foreach ( $styles as $i => $style ) {
			if ( empty( $style['grepRules'] ) || ! is_array( $style['grepRules'] ) ) {
				continue;
			}
			$kept = array_values( array_filter( $style['grepRules'], function ( $rule ) use ( $id ) {
				return ! ( is_array( $rule ) && isset( $rule['styleId'] ) && intval( $rule['styleId'] ) === $id );
			} ) );
			if ( count( $kept ) !== count( $style['grepRules'] ) ) {
				if ( empty( $kept ) ) {
					unset( $styles[ $i ]['grepRules'] );
				} else {
					$styles[ $i ]['grepRules'] = $kept;
				}
				$grep_changed[] = intval( $style['id'] );
			}
		}

		array_splice( $styles, $index, 1 );
		$this->save_styles( $styles );

		return new WP_REST_Response( array( 'deleted' => true, 'detached' => $detached, 'grepChanged' => $grep_changed ), 200 );
	}

	// -------------------------------------------------------------------------
	// Assets
	// -------------------------------------------------------------------------

	/**
	 * Enqueue editor JavaScript for both inline and block editors.
	 */
	public function enqueue_editor_assets() {
		// An editor mounted on a frontend page needs every style, as in
		// wp-admin, where enqueue_editor_style_css() prints them.
		if ( ! is_admin() ) {
			$this->editor_on_frontend = true;
		}

		$this->enqueue_utils_script();

		wp_enqueue_script(
			'typost-paragraph-styles-editor',
			TYPOST_PS_PLUGIN_URL . 'assets/js/editor.js',
			array( 'typost-block-editor', 'typost-paragraph-styles-utils', 'wp-element', 'wp-components', 'wp-i18n', 'wp-api-fetch', 'wp-data', 'wp-hooks', 'wp-compose', 'wp-block-editor' ),
			TYPOST_PS_VERSION,
			true
		);

		wp_set_script_translations( 'typost-paragraph-styles-editor', 'typost-paragraph-styles', TYPOST_PS_PLUGIN_DIR . 'languages' );
	}

	/**
	 * Enqueue the pure logic shared with Jest tests (UMD-lite, exposed as
	 * window.typostPSUtils). Both editors and the admin tab's edit form use it.
	 *
	 * wp-i18n: the size labels this file builds are translatable, so the
	 * handle needs its own script translations — they are not inherited
	 * from the handle that depends on it.
	 */
	private function enqueue_utils_script() {
		wp_enqueue_script(
			'typost-paragraph-styles-utils',
			TYPOST_PS_PLUGIN_URL . 'assets/js/lib/ps-utils.js',
			array( 'wp-i18n' ),
			TYPOST_PS_VERSION,
			true
		);

		wp_set_script_translations( 'typost-paragraph-styles-utils', 'typost-paragraph-styles', TYPOST_PS_PLUGIN_DIR . 'languages' );
	}

	/**
	 * Enqueue admin JavaScript and CSS for the Paragraph Styles tab.
	 *
	 * Also prints the generated style CSS, so each card's preview renders
	 * through the style's own `.typost-ps-{id}` rule. The page declares the
	 * kit and adopted fonts (`--font-N` variables, @font-face), and a browser
	 * fetches a font file only when rendered text uses it, so the previews
	 * (always shown since #226) download fonts only while this tab is open.
	 * Adobe Fonts kits are not on the page up front: core's admin-page.js
	 * loads a kit when a sample's `data-typost-font-id` comes into view.
	 */
	public function enqueue_admin_assets() {
		// The edit form builds its PATCH payload with the editors' own
		// buildPropertiesForStyleSave() (#221)
		$this->enqueue_utils_script();

		wp_enqueue_script(
			'typost-paragraph-styles-admin',
			TYPOST_PS_PLUGIN_URL . 'assets/js/admin.js',
			// wp-a11y: rename/delete are announced through wp.a11y.speak (ADM-2)
			array( 'jquery', 'wp-i18n', 'wp-a11y', 'typost-paragraph-styles-utils' ),
			TYPOST_PS_VERSION,
			true
		);

		wp_set_script_translations( 'typost-paragraph-styles-admin', 'typost-paragraph-styles', TYPOST_PS_PLUGIN_DIR . 'languages' );

		wp_enqueue_style(
			'typost-paragraph-styles-admin',
			TYPOST_PS_PLUGIN_URL . 'assets/css/admin.css',
			array(),
			TYPOST_PS_VERSION
		);

		// Core fires typost_admin_assets once per page load (from
		// admin_enqueue_scripts since #226; before that it fired twice).
		// The flag is a precaution: it skips building the CSS a second time
		// and keeps one copy if the hook ever fires twice before printing.
		if ( ! $this->admin_style_css_added ) {
			$css = $this->get_all_css();
			if ( ! empty( $css ) ) {
				wp_add_inline_style( 'typost-paragraph-styles-admin', $css );
			}
			$this->admin_style_css_added = true;
		}

		// styles: the edit form fills from the stored properties and keeps
		// the ones the admin does not touch (#221). newFontSizeUnit: a size
		// added to a style without one takes the site's new-content unit
		// (#248), like Update Style in the editor.
		$new_unit = class_exists( 'Typost' ) && method_exists( 'Typost', 'get_new_font_size_unit' )
			? Typost::get_instance()->get_new_font_size_unit()
			: 'rem';
		wp_localize_script( 'typost-paragraph-styles-admin', 'typostPSAdmin', array(
			'restUrl'         => rest_url( self::REST_NAMESPACE . '/paragraph-styles' ),
			'nonce'           => wp_create_nonce( 'wp_rest' ),
			// Client shape (#200): a child's properties are resolved, so
			// the form shows what the style renders; ownProperties and
			// basedOn let the save store only the overrides.
			'styles'          => array_values( $this->get_client_styles() ),
			'newFontSizeUnit' => 'px' === $new_unit ? 'px' : 'rem',
			// GREP styles (#196): the form shows the list only on WordPress
			// 6.9+, and offers custom patterns to administrators only (the
			// REST routes check the same capability).
			'grep'            => array(
				'supported'      => self::grep_supported(),
				'canWriteCustom' => self::grep_supported() && current_user_can( 'manage_options' ),
				'maxRules'       => Typost_PS_Grep::MAX_RULES,
				'maxLength'      => Typost_PS_Grep::MAX_PATTERN_LENGTH,
				'patterns'       => self::grep_pattern_options(),
			),
		) );
	}

	/**
	 * Resolve the font an admin style card names.
	 *
	 * A style keeps its numeric `fontId` after the font is deleted. When a
	 * replacement is mapped, `--font-{deleted}` aliases the replacement's
	 * variable, so the style renders in the replacement; with no mapping the
	 * variable is undefined, `font-family` falls back to the inherited font,
	 * and the card must not name a font that no longer exists. Replacement
	 * chains are followed (a replacement can itself be deleted and replaced),
	 * with a visited set so a cyclic mapping cannot loop.
	 *
	 * @param int   $font_id     The style's `fontId` (0 = none set).
	 * @param array $font_lookup Numeric font ID => display name, every source.
	 * @param array $mappings    Deleted font ID => replacement font ID.
	 * @return array {
	 *     @type string $status  'default' (no font set), 'found', 'replaced', or 'missing'.
	 *     @type string $name    Font name for 'found' and 'replaced'; '' otherwise.
	 *     @type int    $font_id The font the style renders in: the saved ID for
	 *                           'found', the end of the replacement chain for
	 *                           'replaced', 0 otherwise. A check on the font's
	 *                           source (a manual definition) must use this ID,
	 *                           not the saved one.
	 * }
	 */
	public static function resolve_font_label( $font_id, $font_lookup, $mappings ) {
		$font_id = absint( $font_id );
		if ( 0 === $font_id ) {
			return array( 'status' => 'default', 'name' => '', 'font_id' => 0 );
		}

		$font_lookup = is_array( $font_lookup ) ? $font_lookup : array();
		if ( isset( $font_lookup[ $font_id ] ) ) {
			return array( 'status' => 'found', 'name' => (string) $font_lookup[ $font_id ], 'font_id' => $font_id );
		}

		$mappings = is_array( $mappings ) ? $mappings : array();
		$visited  = array( $font_id => true );
		$current  = $font_id;
		while ( isset( $mappings[ $current ] ) ) {
			$current = absint( $mappings[ $current ] );
			if ( 0 === $current || isset( $visited[ $current ] ) ) {
				break;
			}
			if ( isset( $font_lookup[ $current ] ) ) {
				return array( 'status' => 'replaced', 'name' => (string) $font_lookup[ $current ], 'font_id' => $current );
			}
			$visited[ $current ] = true;
		}

		return array( 'status' => 'missing', 'name' => '', 'font_id' => 0 );
	}

	/**
	 * Font data the admin tab needs, built from core's public API.
	 *
	 * Styles store the canonical numeric `font_id`; the entries' `id` is the
	 * string kit/project slug. Keying the lookup on `id` made every card read
	 * "Default" (QA finding ADM-1), so it keys on font_id and keeps `id` only
	 * for entry shapes without one. Shared by the tab and the admin-card
	 * route (#221), so a refreshed card names fonts exactly like the page.
	 *
	 * @param object $instance The Typost instance.
	 * @return array {
	 *     @type array $lookup     Font ID => display name, every source.
	 *     @type array $options    Numeric font ID => display name, sorted by
	 *                             name: the edit form's font choices.
	 *     @type array $mappings   Deleted font ID => replacement font ID.
	 *     @type array $manual_ids Font IDs of manual definitions, as keys.
	 * }
	 */
	public static function build_admin_font_context( $instance ) {
		$lookup     = array();
		$options    = array();
		$manual_ids = array();
		$add_font   = function ( $font ) use ( &$lookup, &$options ) {
			if ( ! is_array( $font ) || ! isset( $font['name'] ) ) {
				return;
			}
			if ( isset( $font['font_id'] ) ) {
				$lookup[ (string) $font['font_id'] ] = $font['name'];
				if ( absint( $font['font_id'] ) > 0 ) {
					$options[ absint( $font['font_id'] ) ] = (string) $font['name'];
				}
			}
			if ( isset( $font['id'] ) && ! isset( $lookup[ (string) $font['id'] ] ) ) {
				$lookup[ (string) $font['id'] ] = $font['name'];
			}
		};

		if ( is_object( $instance ) ) {
			foreach ( (array) $instance->get_custom_fonts() as $font ) {
				$add_font( $font );
			}
			foreach ( (array) $instance->get_adobe_fonts() as $project ) {
				// An Adobe entry is one family and carries its own font_id;
				// older entries may also list families under `fonts`.
				$add_font( $project );
				if ( isset( $project['fonts'] ) && is_array( $project['fonts'] ) ) {
					foreach ( $project['fonts'] as $font ) {
						$add_font( $font );
					}
				}
			}
			// Manual definitions name a font that the theme or another plugin
			// loads on the site. Nothing loads it on the settings page, so its
			// preview gets a note.
			foreach ( (array) $instance->get_manual_fonts() as $font ) {
				$add_font( $font );
				if ( isset( $font['font_id'] ) ) {
					$manual_ids[ absint( $font['font_id'] ) ] = true;
				}
			}
			// Adopted WP Font Library fonts carry their numeric ID in font_id
			// (their string id is "wpl-{slug}").
			if ( method_exists( $instance, 'get_adopted_wp_fonts_by_slug' ) ) {
				foreach ( (array) $instance->get_adopted_wp_fonts_by_slug() as $font ) {
					$add_font( $font );
				}
			}
		}

		natcasesort( $options );

		// Deleted font ID => replacement font ID, so a card names the font the
		// style actually renders in (see resolve_font_label()).
		$mappings = array();
		if ( is_object( $instance ) && method_exists( $instance, 'font_sources' ) ) {
			$replacements = $instance->font_sources()->get_font_replacements();
			if ( isset( $replacements['mappings'] ) && is_array( $replacements['mappings'] ) ) {
				$mappings = $replacements['mappings'];
			}
		}

		return array(
			'lookup'     => $lookup,
			'options'    => $options,
			'mappings'   => $mappings,
			'manual_ids' => $manual_ids,
		);
	}

	/**
	 * The text a card shows for a style's font.
	 *
	 * @param array $font Result of resolve_font_label().
	 * @return string
	 */
	public static function font_display_name( $font ) {
		switch ( isset( $font['status'] ) ? $font['status'] : '' ) {
			case 'found':
				return $font['name'];
			case 'replaced':
				/* translators: %s: name of the font that replaces the style's deleted font */
				return sprintf( __( '%s (replaces a deleted font)', 'typost-paragraph-styles' ), $font['name'] );
			case 'missing':
				return __( 'Deleted font, shown in the default font', 'typost-paragraph-styles' );
			default:
				return __( 'Default', 'typost-paragraph-styles' );
		}
	}

	/**
	 * Sample text for the admin preview and its `lang`.
	 *
	 * Fixed text, rendered on the server so a later render-time rule engine
	 * can style it the same way it styles content. It carries ligature
	 * pairs, a fraction and figures so OpenType features show. `lang` drives
	 * hyphenation, so it names the admin locale only when the text is
	 * actually translated.
	 *
	 * @return array{0: string, 1: string} Text and lang.
	 */
	public static function admin_preview_text() {
		$source = 'The quick brown fox jumps over the lazy dog. First affluent offices, 1/2 off: 0123456789.';
		/* translators: Sample text for the paragraph style preview. Keep ligature pairs (fi, ffl, ffi, Th, st), a fraction and figures, so OpenType features show. */
		$text = __( 'The quick brown fox jumps over the lazy dog. First affluent offices, 1/2 off: 0123456789.', 'typost-paragraph-styles' );
		$lang = $text === $source ? 'en' : str_replace( '_', '-', get_user_locale() );
		return array( $text, $lang );
	}

	/**
	 * Render a style card's details line (the summary under its name).
	 *
	 * Used by the admin tab and by the admin-card route, which returns it
	 * after the edit form saves (#221), so both render the same markup.
	 * `data-font-label` carries the font text for the edit form, which
	 * offers the style's current font even when it was deleted.
	 *
	 * Based On (#200): for a style based on another, pass its resolved
	 * properties as $props and `own` (what it stores) plus `parent` (the
	 * parent's name) as $inheritance. The line then starts with "Based on",
	 * labels each value "Inherited" or "Override", and shows "None" for a
	 * value the style unsets (an empty override).
	 *
	 * @param array      $props       The style's properties (resolved).
	 * @param array      $font        Result of resolve_font_label() for the style.
	 * @param array|null $inheritance Null for a style without a parent, else
	 *                                array( 'own' => array, 'parent' => string ).
	 * @param array      $grep_rows   GREP rules (#196), each array( pattern
	 *                                label, style name ), in rule order.
	 * @return string HTML.
	 */
	public static function render_card_details( $props, $font, $inheritance = null, $grep_rows = array() ) {
		$props     = is_array( $props ) ? $props : array();
		$own       = is_array( $inheritance ) && isset( $inheritance['own'] ) && is_array( $inheritance['own'] ) ? $inheritance['own'] : null;
		$font_name = self::font_display_name( $font );
		$weight    = ! empty( $props['fontWeight'] ) ? $props['fontWeight'] : '400';
		$features  = isset( $props['features'] ) && is_array( $props['features'] ) ? $props['features'] : array();
		$none      = __( 'None', 'typost-paragraph-styles' );
		// A value the style unsets: it stores the key, and nothing resolved
		$unsets    = function ( $key ) use ( $own ) {
			return null !== $own && array_key_exists( $key, $own );
		};
		// Each row: label, value, the keys it shows (for its source label),
		// and optionally a second value with its own keys
		$rows      = array();

		// One label for the font and its weight, or one each when only one of
		// them is the style's own (a child that sets only the weight still
		// follows its parent's font)
		if ( null !== $own && array_key_exists( 'fontId', $own ) !== array_key_exists( 'fontWeight', $own ) ) {
			$rows[] = array( __( 'Font:', 'typost-paragraph-styles' ), $font_name, array( 'fontId' ), array( '(' . $weight . ')', array( 'fontWeight' ) ) );
		} else {
			$rows[] = array( __( 'Font:', 'typost-paragraph-styles' ), $font_name . ' (' . $weight . ')', array( 'fontId', 'fontWeight' ) );
		}

		// Font style — absent means inherit, so only real choices get a label
		$font_style_labels = array(
			'italic'  => __( 'Italic', 'typost-paragraph-styles' ),
			'oblique' => __( 'Oblique', 'typost-paragraph-styles' ),
			'normal'  => __( 'Normal (upright)', 'typost-paragraph-styles' ),
		);
		if ( ! empty( $props['fontStyle'] ) && isset( $font_style_labels[ $props['fontStyle'] ] ) ) {
			$rows[] = array( __( 'Style:', 'typost-paragraph-styles' ), $font_style_labels[ $props['fontStyle'] ], array( 'fontStyle' ) );
		} elseif ( $unsets( 'fontStyle' ) ) {
			$rows[] = array( __( 'Style:', 'typost-paragraph-styles' ), $none, array( 'fontStyle' ) );
		}

		// Font size. A rem style (#233) shows each size as "20px (1.25rem)",
		// the block Inspector's readout (#297); a px style, and one saved
		// before #233 with no unit, keeps the px-only text.
		$size_in_rem = isset( $props['fontSizeUnit'] ) && 'rem' === $props['fontSizeUnit'];
		if ( ! empty( $props['fontSize'] ) && $size_in_rem ) {
			$size_label = function ( $key ) use ( $props ) {
				if ( ! isset( $props[ $key ] ) || ! is_numeric( $props[ $key ] ) ) {
					return '?';
				}
				/* translators: %1$s: size in pixels, %2$s: the same size in rem */
				return sprintf( __( '%1$spx (%2$srem)', 'typost-paragraph-styles' ), $props[ $key ], self::px_to_rem( $props[ $key ] ) );
			};
			if ( 'responsive' === $props['fontSize'] ) {
				/* translators: %1$s: min size, %2$s: preferred size, %3$s: max size, each as "20px (1.25rem)" */
				$size_display = sprintf( __( 'Responsive (%1$s / %2$s / %3$s)', 'typost-paragraph-styles' ), $size_label( 'fontSizeMin' ), $size_label( 'fontSizePreferred' ), $size_label( 'fontSizeMax' ) );
			} elseif ( 'fit' === $props['fontSize'] ) {
				/* translators: %1$s: fallback min size, %2$s: fallback max size, each as "20px (1.25rem)" */
				$size_display = sprintf( __( 'Fit to width (fallback %1$s – %2$s)', 'typost-paragraph-styles' ), $size_label( 'fontSizeMin' ), $size_label( 'fontSizeMax' ) );
			} elseif ( is_numeric( $props['fontSize'] ) ) {
				$size_display = $size_label( 'fontSize' );
			} else {
				/* translators: %s: font size in pixels */
				$size_display = sprintf( __( '%spx', 'typost-paragraph-styles' ), $props['fontSize'] );
			}
			$rows[] = array( __( 'Size:', 'typost-paragraph-styles' ), $size_display, array( 'fontSize' ) );
		} elseif ( ! empty( $props['fontSize'] ) ) {
			if ( 'responsive' === $props['fontSize'] ) {
				$min  = isset( $props['fontSizeMin'] ) ? $props['fontSizeMin'] : '?';
				$pref = isset( $props['fontSizePreferred'] ) ? $props['fontSizePreferred'] : '?';
				$max  = isset( $props['fontSizeMax'] ) ? $props['fontSizeMax'] : '?';
				/* translators: %1$s: min size, %2$s: preferred size, %3$s: max size */
				$size_display = sprintf( __( 'Responsive (%1$s/%2$s/%3$spx)', 'typost-paragraph-styles' ), $min, $pref, $max );
			} elseif ( 'fit' === $props['fontSize'] ) {
				$min = isset( $props['fontSizeMin'] ) ? $props['fontSizeMin'] : '?';
				$max = isset( $props['fontSizeMax'] ) ? $props['fontSizeMax'] : '?';
				/* translators: %1$s: fallback min size, %2$s: fallback max size */
				$size_display = sprintf( __( 'Fit to width (fallback %1$s–%2$spx)', 'typost-paragraph-styles' ), $min, $max );
			} else {
				/* translators: %s: font size in pixels */
				$size_display = sprintf( __( '%spx', 'typost-paragraph-styles' ), $props['fontSize'] );
			}
			$rows[] = array( __( 'Size:', 'typost-paragraph-styles' ), $size_display, array( 'fontSize' ) );
		} elseif ( $unsets( 'fontSize' ) ) {
			$rows[] = array( __( 'Size:', 'typost-paragraph-styles' ), $none, array( 'fontSize' ) );
		}

		if ( ! empty( $features ) ) {
			$rows[] = array( __( 'Features:', 'typost-paragraph-styles' ), implode( ', ', $features ), array( 'features' ) );
		} elseif ( $unsets( 'features' ) ) {
			$rows[] = array( __( 'Features:', 'typost-paragraph-styles' ), $none, array( 'features' ) );
		}

		// Letter spacing and line height share one detail
		$spacing_rows = array();
		if ( ! empty( $props['letterSpacing'] ) ) {
			$em_value = round( $props['letterSpacing'] / 1000, 3 );
			/* translators: %s: letter spacing in em */
			$spacing_rows[] = array( __( 'Spacing:', 'typost-paragraph-styles' ), sprintf( __( '%sem', 'typost-paragraph-styles' ), $em_value ), array( 'letterSpacing' ) );
		} elseif ( $unsets( 'letterSpacing' ) ) {
			$spacing_rows[] = array( __( 'Spacing:', 'typost-paragraph-styles' ), $none, array( 'letterSpacing' ) );
		}
		if ( ! empty( $props['lineHeight'] ) ) {
			$spacing_rows[] = array( __( 'Line Height:', 'typost-paragraph-styles' ), (string) $props['lineHeight'], array( 'lineHeight' ) );
		} elseif ( $unsets( 'lineHeight' ) ) {
			$spacing_rows[] = array( __( 'Line Height:', 'typost-paragraph-styles' ), $none, array( 'lineHeight' ) );
		}

		// Alignment, word spacing and line breaking (#207). A fit to width
		// style writes none of them (generate_style_css()), so its card does
		// not list them either.
		$is_fit        = isset( $props['fontSize'] ) && 'fit' === $props['fontSize'];
		$align_display = '';
		$wrap_display  = '';
		if ( ! $is_fit ) {
			if ( ! empty( $props['wordSpacing'] ) ) {
				$word_em = round( $props['wordSpacing'] / 1000, 3 );
				/* translators: %s: word spacing in em */
				$spacing_rows[] = array( __( 'Word Spacing:', 'typost-paragraph-styles' ), sprintf( __( '%sem', 'typost-paragraph-styles' ), $word_em ), array( 'wordSpacing' ) );
			} elseif ( $unsets( 'wordSpacing' ) ) {
				$spacing_rows[] = array( __( 'Word Spacing:', 'typost-paragraph-styles' ), $none, array( 'wordSpacing' ) );
			}

			$align_labels = self::alignment_labels();
			if ( isset( $props['alignment'] ) && is_string( $props['alignment'] ) && isset( $align_labels[ $props['alignment'] ] ) ) {
				$align_display = $align_labels[ $props['alignment'] ];
				if ( '' !== self::normalize_align_last( $props['alignment'], isset( $props['alignLast'] ) ? $props['alignLast'] : '' ) ) {
					/* translators: 1: alignment, such as "Justify"; 2: last line alignment, such as "Center" */
					$align_display = sprintf( __( '%1$s (last line: %2$s)', 'typost-paragraph-styles' ), $align_display, $align_labels[ $props['alignLast'] ] );
				}
			} elseif ( $unsets( 'alignment' ) ) {
				$align_display = $none;
			}

			$wrap_labels = self::text_wrap_labels();
			if ( isset( $props['textWrap'] ) && is_string( $props['textWrap'] ) && isset( $wrap_labels[ $props['textWrap'] ] ) ) {
				$wrap_display = $wrap_labels[ $props['textWrap'] ];
			} elseif ( $unsets( 'textWrap' ) ) {
				$wrap_display = $none;
			}
		}

		// Indents and paragraph spacing (#199), each as its stored length. A
		// fit to width style writes no indents (paragraph_layout_css()), so
		// its card does not list them.
		$length_row = function ( $label, $key, $allow_negative = false ) use ( $props, $unsets, $none ) {
			$value = self::normalize_length( isset( $props[ $key ] ) ? $props[ $key ] : '', $allow_negative );
			if ( '' !== $value ) {
				return array( $label, $value, array( $key ) );
			}
			return $unsets( $key ) ? array( $label, $none, array( $key ) ) : null;
		};
		$indent_rows = array();
		if ( ! $is_fit ) {
			$indent_rows[] = $length_row( __( 'Left Indent:', 'typost-paragraph-styles' ), 'indentStart' );
			$indent_rows[] = $length_row( __( 'Right Indent:', 'typost-paragraph-styles' ), 'indentEnd' );
			$first_row     = $length_row( __( 'First Line:', 'typost-paragraph-styles' ), 'firstLineIndent', true );
			if ( null !== $first_row && self::indent_after_same_applies( $props ) ) {
				/* translators: %s: first line indent, such as "1.5em" */
				$first_row[1] = sprintf( __( '%s (after the same style only)', 'typost-paragraph-styles' ), $first_row[1] );
			}
			$indent_rows[] = $first_row;
		}
		$indent_rows    = array_values( array_filter( $indent_rows ) );
		$paragraph_rows = array_values(
			array_filter(
				array(
					$length_row( __( 'Space Before:', 'typost-paragraph-styles' ), 'spaceBefore' ),
					$length_row( __( 'Space After:', 'typost-paragraph-styles' ), 'spaceAfter' ),
				)
			)
		);

		// Variable font axes, shown as the sanitizer stored them
		$axes_display = ! empty( $props['fontVariationSettings'] ) ? (string) $props['fontVariationSettings'] : ( $unsets( 'fontVariationSettings' ) ? $none : '' );

		// First letter hang (#242)
		$hang_value   = isset( $props['initialHang'] ) ? self::normalize_hang( $props['initialHang'] ) : 0;
		/* translators: %s: hang in em */
		$hang_display = $hang_value > 0 ? sprintf( __( '%sem', 'typost-paragraph-styles' ), $hang_value ) : ( $unsets( 'initialHang' ) ? $none : '' );

		// Case (#214)
		$case_display = '';
		$case_labels  = self::text_case_labels();
		if ( isset( $props['textCase'] ) && is_string( $props['textCase'] ) && isset( $case_labels[ $props['textCase'] ] ) ) {
			$case_display = $case_labels[ $props['textCase'] ];
			if ( in_array( $props['textCase'], array( 'small-caps', 'all-small-caps' ), true ) && isset( $props['fakeSmallCaps'] ) && false === $props['fakeSmallCaps'] ) {
				/* translators: %s: case setting, such as "Small Caps" */
				$case_display = sprintf( __( '%s (no fake small caps)', 'typost-paragraph-styles' ), $case_display );
			}
		} elseif ( $unsets( 'textCase' ) ) {
			$case_display = $none;
		}

		// "Override" when the style stores one of the row's keys itself,
		// "Inherited" when its parent supplies the value
		$source = function ( $keys ) use ( $own ) {
			if ( null === $own || empty( $keys ) ) {
				return '';
			}
			foreach ( $keys as $key ) {
				if ( array_key_exists( $key, $own ) ) {
					return '<span class="typost-ps-detail-source is-override">' . esc_html__( 'Override', 'typost-paragraph-styles' ) . '</span>';
				}
			}
			return '<span class="typost-ps-detail-source is-inherited">' . esc_html__( 'Inherited', 'typost-paragraph-styles' ) . '</span>';
		};

		$detail = function ( $pairs ) use ( $source ) {
			$parts = array();
			foreach ( $pairs as $pair ) {
				$part = '<strong>' . esc_html( $pair[0] ) . '</strong> ' . esc_html( $pair[1] ) . ( isset( $pair[2] ) ? $source( $pair[2] ) : '' );
				// A second value with its own label: [ value, keys ]
				if ( isset( $pair[3] ) ) {
					$part .= ' ' . esc_html( $pair[3][0] ) . $source( $pair[3][1] );
				}
				$parts[] = $part;
			}
			return '<span class="typost-ps-detail">' . implode( '&nbsp;/&nbsp;', $parts ) . '</span>';
		};

		$html = '';
		if ( null !== $own ) {
			$parent = isset( $inheritance['parent'] ) && '' !== (string) $inheritance['parent'] ? (string) $inheritance['parent'] : __( 'A deleted style', 'typost-paragraph-styles' );
			$html  .= $detail( array( array( __( 'Based on:', 'typost-paragraph-styles' ), $parent ) ) );
		}
		foreach ( $rows as $row ) {
			$html .= $detail( array( $row ) );
		}
		if ( ! empty( $spacing_rows ) ) {
			$html .= $detail( $spacing_rows );
		}
		if ( '' !== $axes_display ) {
			$html .= $detail( array( array( __( 'Axes:', 'typost-paragraph-styles' ), $axes_display, array( 'fontVariationSettings' ) ) ) );
		}
		if ( '' !== $hang_display ) {
			$html .= $detail( array( array( __( 'First Letter Hang:', 'typost-paragraph-styles' ), $hang_display, array( 'initialHang' ) ) ) );
		}
		if ( '' !== $case_display ) {
			$html .= $detail( array( array( __( 'Case:', 'typost-paragraph-styles' ), $case_display, array( 'textCase' ) ) ) );
		}
		if ( '' !== $align_display ) {
			$html .= $detail( array( array( __( 'Alignment:', 'typost-paragraph-styles' ), $align_display, array( 'alignment' ) ) ) );
		}
		if ( '' !== $wrap_display ) {
			$html .= $detail( array( array( __( 'Line Breaking:', 'typost-paragraph-styles' ), $wrap_display, array( 'textWrap' ) ) ) );
		}
		if ( ! empty( $indent_rows ) ) {
			$html .= $detail( $indent_rows );
		}
		if ( ! empty( $paragraph_rows ) ) {
			$html .= $detail( $paragraph_rows );
		}
		if ( is_array( $grep_rows ) && ! empty( $grep_rows ) ) {
			$grep_parts = array();
			foreach ( $grep_rows as $grep_row ) {
				/* translators: 1: a GREP pattern, such as "Acronyms (NASA)", 2: the style applied to its matches */
				$grep_parts[] = sprintf( __( '%1$s → %2$s', 'typost-paragraph-styles' ), $grep_row[0], $grep_row[1] );
			}
			// GREP rules are not inherited through Based On, so no source label
			$html .= $detail( array( array( __( 'GREP styles:', 'typost-paragraph-styles' ), implode( '; ', $grep_parts ) ) ) );
		}

		return '<div class="typost-ps-style-card-details" data-font-label="' . esc_attr( $font_name ) . '">' . $html . '</div>';
	}

	/**
	 * Render a style card's preview (#220, #226).
	 *
	 * The sample carries the style's own `.typost-ps-{id}` class, so it
	 * renders through the generated CSS, and `data-typost-font-id` names the
	 * font the style renders in (after replacements) so core's admin font
	 * loader adds an Adobe Fonts kit when the sample comes into view.
	 *
	 * @param int   $style_id   Style ID.
	 * @param array $font       Result of resolve_font_label() for the style.
	 * @param array $manual_ids Font IDs of manual definitions, as keys.
	 * @param array $grep       Optional GREP rules to run over the sample
	 *                          (#196): array( 'rules' => rules, 'ids' =>
	 *                          style id => true, 'fonts' => style id => font
	 *                          id, so the loader also adds the kit of a font
	 *                          that only a rule's style uses ).
	 * @return string HTML.
	 */
	public static function render_card_preview( $style_id, $font, $manual_ids, $grep = null ) {
		list( $text, $lang ) = self::admin_preview_text();
		$style_id = intval( $style_id );
		$font_id  = isset( $font['font_id'] ) ? absint( $font['font_id'] ) : 0;

		$sample = '<p class="typost-ps-preview-sample ' . esc_attr( 'typost-ps-' . $style_id ) . '" lang="' . esc_attr( $lang ) . '"'
			. ( $font_id ? ' data-typost-font-id="' . esc_attr( $font_id ) . '"' : '' ) . '>' . esc_html( $text ) . '</p>';
		// GREP styles (#196) style the sample through the same engine as
		// the frontend, so the card shows what a post shows.
		if ( is_array( $grep ) && ! empty( $grep['rules'] ) && self::grep_supported() ) {
			$sample = self::wrap_grep( $sample, array( (string) $style_id => $grep['rules'] ), $grep['ids'], false, isset( $grep['fonts'] ) ? $grep['fonts'] : array() );
		}

		$html  = '<div class="typost-ps-preview" id="' . esc_attr( 'typost-ps-preview-' . $style_id ) . '">';
		$html .= $sample;
		// Check the font the style renders in: a deleted font can be replaced by a manual one.
		if ( $font_id && isset( $manual_ids[ $font_id ] ) ) {
			$html .= '<p class="typost-ps-preview-note">' . esc_html__( 'Your theme or another plugin loads this font on the site. This page cannot load it, so the preview can show a fallback font.', 'typost-paragraph-styles' ) . '</p>';
		}
		$html .= '</div>';
		return $html;
	}

	/**
	 * Case labels (#214), keyed by stored value.
	 *
	 * @return array<string,string>
	 */
	public static function text_case_labels() {
		return array(
			'none'           => __( 'Normal', 'typost-paragraph-styles' ),
			'uppercase'      => __( 'All Caps', 'typost-paragraph-styles' ),
			'lowercase'      => __( 'Lowercase', 'typost-paragraph-styles' ),
			'capitalize'     => __( 'Title Case', 'typost-paragraph-styles' ),
			'small-caps'     => __( 'Small Caps', 'typost-paragraph-styles' ),
			'all-small-caps' => __( 'All Small Caps', 'typost-paragraph-styles' ),
		);
	}

	/**
	 * Alignment labels (#207), keyed by stored value. Also the last line
	 * labels (ALIGN_LAST_VALUES is a subset).
	 *
	 * @return array<string,string>
	 */
	public static function alignment_labels() {
		return array(
			'start'   => __( 'Start', 'typost-paragraph-styles' ),
			'center'  => __( 'Center', 'typost-paragraph-styles' ),
			'end'     => __( 'End', 'typost-paragraph-styles' ),
			'justify' => __( 'Justify', 'typost-paragraph-styles' ),
		);
	}

	/**
	 * Line breaking labels (#207), keyed by stored value.
	 *
	 * @return array<string,string>
	 */
	public static function text_wrap_labels() {
		return array(
			'balance' => __( 'Balance lines', 'typost-paragraph-styles' ),
			'pretty'  => __( 'Avoid short last lines', 'typost-paragraph-styles' ),
		);
	}

	/**
	 * GET /paragraph-styles/{id}/admin-card
	 *
	 * The admin tab's edit form saves through PATCH, then asks for the
	 * card's details and preview, rendered by the same methods as the page,
	 * plus the style CSS for every card's preview (#221). One renderer, so a
	 * property added later shows the same way after a save as after a load.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response
	 */
	public function rest_get_admin_card( $request ) {
		$id     = intval( $request['id'] );
		$styles = $this->get_styles();
		$index  = $this->find_style_index( $styles, $id );

		if ( false === $index ) {
			return new WP_REST_Response( array( 'message' => __( 'Style not found.', 'typost-paragraph-styles' ) ), 404 );
		}

		$context = self::build_admin_font_context( class_exists( 'Typost' ) ? Typost::get_instance() : null );
		$parts   = self::render_admin_card_parts( $styles[ $index ], $styles, $context );

		// Based On (#200): the styles based on this one render from it, so
		// their cards change too (values, "Based on" name). Their previews
		// already follow through the CSS; their details come back here.
		// GREP styles (#196): a card whose rules apply this style names it
		// and previews it, so it comes back too.
		$related_ids = self::descendant_ids( $styles, $id );
		foreach ( $styles as $candidate ) {
			if ( isset( $candidate['id'] ) && intval( $candidate['id'] ) !== $id && in_array( $id, Typost_PS_Grep::target_style_ids( isset( $candidate['grepRules'] ) ? $candidate['grepRules'] : array() ), true ) ) {
				$related_ids[] = intval( $candidate['id'] );
			}
		}
		$related = array();
		foreach ( array_values( array_unique( $related_ids ) ) as $descendant_id ) {
			$descendant_index = $this->find_style_index( $styles, $descendant_id );
			if ( false !== $descendant_index ) {
				$related[] = array_merge( array( 'id' => $descendant_id ), self::render_admin_card_parts( $styles[ $descendant_index ], $styles, $context ) );
			}
		}

		$client = array();
		foreach ( $styles as $style ) {
			$client[] = self::prepare_style_for_client( $style, $styles );
		}

		return new WP_REST_Response( array(
			'style'   => self::prepare_style_for_client( $styles[ $index ], $styles ),
			'details' => $parts['details'],
			'preview' => $parts['preview'],
			'related' => $related,
			// Every style in the client shape, so the edit form fills from
			// the new resolved values of the styles based on this one
			'styles'  => $client,
			'css'     => $this->get_all_css(),
		), 200 );
	}

	/**
	 * A card's details line and preview, as the tab and the admin-card
	 * route render them. A style based on another (#200) shows its resolved
	 * values, labeled Inherited or Override, and its resolved font.
	 *
	 * @param array $style   Stored style.
	 * @param array $styles  Every stored style.
	 * @param array $context build_admin_font_context() result.
	 * @return array{details: string, preview: string}
	 */
	public static function render_admin_card_parts( $style, $styles, $context ) {
		$props       = self::resolve_properties( $style, $styles );
		$inheritance = null;
		if ( ! empty( $style['basedOn'] ) ) {
			$parent_name = '';
			foreach ( $styles as $candidate ) {
				if ( isset( $candidate['id'], $candidate['name'] ) && intval( $candidate['id'] ) === intval( $style['basedOn'] ) ) {
					$parent_name = $candidate['name'];
					break;
				}
			}
			$inheritance = array(
				'own'    => isset( $style['properties'] ) && is_array( $style['properties'] ) ? $style['properties'] : array(),
				'parent' => $parent_name,
			);
		}
		$font = self::resolve_font_label( isset( $props['fontId'] ) ? $props['fontId'] : 0, $context['lookup'], $context['mappings'] );

		// GREP styles (#196): listed and previewed only where they run
		$grep_rows = array();
		$grep      = null;
		if ( ! empty( $style['grepRules'] ) && is_array( $style['grepRules'] ) && self::grep_supported() ) {
			$names      = array();
			$grep_fonts = array();
			$targets    = Typost_PS_Grep::target_style_ids( $style['grepRules'] );
			foreach ( $styles as $candidate ) {
				if ( isset( $candidate['id'] ) ) {
					$names[ intval( $candidate['id'] ) ] = isset( $candidate['name'] ) ? (string) $candidate['name'] : '';
					if ( in_array( intval( $candidate['id'] ), $targets, true ) ) {
						$candidate_props = self::resolve_properties( $candidate, $styles );
						$candidate_font  = self::resolve_font_label( isset( $candidate_props['fontId'] ) ? $candidate_props['fontId'] : 0, $context['lookup'], $context['mappings'] );
						if ( $candidate_font['font_id'] ) {
							$grep_fonts[ intval( $candidate['id'] ) ] = $candidate_font['font_id'];
						}
					}
				}
			}
			$labels = Typost_PS_Grep::pattern_labels();
			foreach ( $style['grepRules'] as $rule ) {
				if ( ! is_array( $rule ) || ! isset( $rule['pattern'] ) ) {
					continue;
				}
				if ( Typost_PS_Grep::CUSTOM === $rule['pattern'] ) {
					/* translators: %s: a regular expression */
					$pattern_label = sprintf( __( 'Custom (%s)', 'typost-paragraph-styles' ), isset( $rule['regex'] ) ? (string) $rule['regex'] : '' );
				} else {
					$pattern_label = isset( $labels[ $rule['pattern'] ] ) ? $labels[ $rule['pattern'] ] : (string) $rule['pattern'];
				}
				$target      = isset( $rule['styleId'] ) ? intval( $rule['styleId'] ) : 0;
				$grep_rows[] = array( $pattern_label, isset( $names[ $target ] ) ? $names[ $target ] : __( 'A deleted style', 'typost-paragraph-styles' ) );
			}
			$grep = array(
				'rules' => $style['grepRules'],
				'ids'   => array_fill_keys( array_keys( $names ), true ),
				'fonts' => $grep_fonts,
			);
		}

		return array(
			'details' => self::render_card_details( $props, $font, $inheritance, $grep_rows ),
			'preview' => self::render_card_preview( intval( $style['id'] ), $font, $context['manual_ids'], $grep ),
		);
	}

	// -------------------------------------------------------------------------
	// Cache
	// -------------------------------------------------------------------------

	/**
	 * Clear the paragraph styles data and CSS transient caches.
	 */
	public function clear_cache() {
		delete_transient( self::CACHE_KEY );
		delete_transient( self::CSS_CACHE_KEY );
	}

	// -------------------------------------------------------------------------
	// Data Access
	// -------------------------------------------------------------------------

	/**
	 * Get all paragraph styles (cached).
	 *
	 * @return array
	 */
	public function get_styles() {
		$cached = get_transient( self::CACHE_KEY );
		if ( false !== $cached ) {
			return $cached;
		}

		$styles = get_option( self::OPTION_KEY, array() );
		if ( ! is_array( $styles ) ) {
			$styles = array();
		}

		set_transient( self::CACHE_KEY, $styles, 12 * HOUR_IN_SECONDS );
		return $styles;
	}

	/**
	 * Save styles and refresh both data and CSS caches.
	 *
	 * @param array $styles The styles array to save.
	 */
	private function save_styles( $styles ) {
		// Re-index array to ensure sequential numeric keys
		$styles = array_values( $styles );
		$this->grep_style_map = null;
		update_option( self::OPTION_KEY, $styles );
		set_transient( self::CACHE_KEY, $styles, 12 * HOUR_IN_SECONDS );
		// Regenerate CSS cache
		delete_transient( self::CSS_CACHE_KEY );
		// Core caches "which fonts does this page use" per post; a style that
		// changed font would keep serving the old @font-face until it expired.
		if ( class_exists( 'Typost' ) && method_exists( 'Typost', 'clear_font_detection_cache' ) ) {
			Typost::get_instance()->clear_font_detection_cache();
		}
	}

	/**
	 * Save the styles an import built and move the ID counter past them
	 * (#205). The counter never goes back, so an ID is never handed out
	 * twice, even for a deleted style.
	 *
	 * @param array $styles  Every style after the import.
	 * @param int   $next_id The next free ID.
	 */
	public function save_imported_styles( $styles, $next_id ) {
		if ( intval( $next_id ) > intval( get_option( self::COUNTER_KEY, 1 ) ) ) {
			update_option( self::COUNTER_KEY, intval( $next_id ) );
		}
		$this->save_styles( $styles );
	}

	/**
	 * The REST create route's sanitizing, for imported styles (#205).
	 *
	 * @param array|null $raw        Raw properties.
	 * @param bool       $keep_empty Keep the empty values of a style with a parent.
	 * @return array
	 */
	public function sanitize_style_properties( $raw, $keep_empty = false ) {
		return $this->sanitize_properties( $raw, $keep_empty );
	}

	/**
	 * Find the index of a style by ID.
	 *
	 * @param array $styles Styles array.
	 * @param int   $id     Style ID to find.
	 * @return int|false Index or false if not found.
	 */
	private function find_style_index( $styles, $id ) {
		foreach ( $styles as $i => $style ) {
			if ( isset( $style['id'] ) && intval( $style['id'] ) === intval( $id ) ) {
				return $i;
			}
		}
		return false;
	}

	/**
	 * Sanitize a properties array from user input.
	 *
	 * @param array|null $raw        Raw properties from request.
	 * @param bool       $keep_empty Keep the empty values a style based on
	 *                               another stores to unset an inherited
	 *                               property (#200): `fontStyle`, `textCase`,
	 *                               `alignment`, `textWrap`, the indents and
	 *                               spacing (#199) and
	 *                               `fontVariationSettings` as '', and
	 *                               `initialHang` as 0. Other keys keep their
	 *                               empty values either way.
	 * @return array Sanitized properties.
	 */
	private function sanitize_properties( $raw, $keep_empty = false ) {
		if ( ! is_array( $raw ) ) {
			return array();
		}

		$clean = array();

		if ( isset( $raw['fontId'] ) ) {
			$clean['fontId'] = absint( $raw['fontId'] );
		}

		if ( isset( $raw['fontWeight'] ) ) {
			$clean['fontWeight'] = sanitize_text_field( $raw['fontWeight'] );
		}

		// Whitelisted outright: unlike fontWeight there are only three valid
		// values, and CSS generation re-checks the same list.
		if ( isset( $raw['fontStyle'] ) && in_array( $raw['fontStyle'], array( 'normal', 'italic', 'oblique' ), true ) ) {
			$clean['fontStyle'] = $raw['fontStyle'];
		} elseif ( $keep_empty && isset( $raw['fontStyle'] ) && '' === $raw['fontStyle'] ) {
			$clean['fontStyle'] = '';
		}

		if ( isset( $raw['fontSize'] ) ) {
			$clean['fontSize'] = sanitize_text_field( $raw['fontSize'] );
		}

		// The min/preferred/max trio only means something for responsive and
		// fit sizes (fit keeps it as its fallback clamp). Older clients sent
		// it for every style, so fixed-size styles carried three junk numbers
		// (QA finding PS-3); the JS builder no longer sends them and the
		// server drops them for good measure.
		$size_mode   = isset( $clean['fontSize'] ) ? $clean['fontSize'] : '';
		$uses_trio   = in_array( $size_mode, array( 'responsive', 'fit' ), true );

		if ( $uses_trio && isset( $raw['fontSizeMin'] ) ) {
			$clean['fontSizeMin'] = absint( $raw['fontSizeMin'] );
		}

		if ( $uses_trio && isset( $raw['fontSizePreferred'] ) ) {
			$clean['fontSizePreferred'] = absint( $raw['fontSizePreferred'] );
		}

		if ( $uses_trio && isset( $raw['fontSizeMax'] ) ) {
			$clean['fontSizeMax'] = absint( $raw['fontSizeMax'] );
		}

		if ( isset( $raw['fitMaxSize'] ) ) {
			$clean['fitMaxSize'] = absint( $raw['fitMaxSize'] );
		}

		// Unit the style's sizes are written in (#233). Absent means px: every
		// style saved before the key existed. Anything else is dropped.
		if ( isset( $raw['fontSizeUnit'] ) && in_array( $raw['fontSizeUnit'], array( 'px', 'rem' ), true ) ) {
			$clean['fontSizeUnit'] = $raw['fontSizeUnit'];
		}

		if ( isset( $raw['letterSpacing'] ) ) {
			$clean['letterSpacing'] = intval( $raw['letterSpacing'] );
		}

		// Three decimals: the slider steps by 0.1, and a fixed precision keeps
		// float noise (1.6000000000000001 once came back from JSON, QA finding
		// PS-8) out of the option and out of the generated CSS.
		if ( isset( $raw['lineHeight'] ) ) {
			$clean['lineHeight'] = round( floatval( $raw['lineHeight'] ), 3 );
		}

		if ( isset( $raw['features'] ) && is_array( $raw['features'] ) ) {
			$clean['features'] = array_map( 'sanitize_key', $raw['features'] );
		}

		if ( ! empty( $raw['fontVariationSettings'] ) ) {
			$clean['fontVariationSettings'] = sanitize_text_field( $raw['fontVariationSettings'] );
		} elseif ( $keep_empty && isset( $raw['fontVariationSettings'] ) && '' === $raw['fontVariationSettings'] ) {
			$clean['fontVariationSettings'] = '';
		}

		// 0 = no hang, never stored (absent and 0 render the same) unless
		// it unsets an inherited hang
		if ( isset( $raw['initialHang'] ) ) {
			$hang = self::normalize_hang( $raw['initialHang'] );
			if ( $hang > 0 ) {
				$clean['initialHang'] = $hang;
			} elseif ( $keep_empty ) {
				$clean['initialHang'] = 0;
			}
		}

		// Case (#214): Default ('') is never stored. fakeSmallCaps is stored
		// only as false, and only with a small caps value (absent = allowed).
		if ( isset( $raw['textCase'] ) && in_array( $raw['textCase'], self::TEXT_CASE_VALUES, true ) ) {
			$clean['textCase'] = $raw['textCase'];
			if ( in_array( $raw['textCase'], array( 'small-caps', 'all-small-caps' ), true )
				&& isset( $raw['fakeSmallCaps'] )
				&& in_array( $raw['fakeSmallCaps'], array( false, 0, '0', 'false' ), true ) ) {
				$clean['fakeSmallCaps'] = false;
			}
		} elseif ( $keep_empty && isset( $raw['textCase'] ) && '' === $raw['textCase'] ) {
			$clean['textCase'] = '';
		}

		// Alignment (#207): Default ('') is never stored; alignLast only
		// with justified text, and never as start (the default).
		$raw_alignment = self::normalize_alignment( isset( $raw['alignment'] ) ? $raw['alignment'] : '' );
		if ( '' !== $raw_alignment ) {
			$clean['alignment'] = $raw_alignment;
			$raw_last           = self::normalize_align_last( $raw_alignment, isset( $raw['alignLast'] ) ? $raw['alignLast'] : '' );
			if ( '' !== $raw_last ) {
				$clean['alignLast'] = $raw_last;
			}
		} elseif ( $keep_empty && isset( $raw['alignment'] ) && '' === $raw['alignment'] ) {
			$clean['alignment'] = '';
		}

		// Word spacing in thousandths of an em, like letterSpacing; can be
		// negative. Held to the Edit form's range (-0.5em to 1em), so a REST
		// request cannot store a value that breaks every page using the
		// style (PR #329 review)
		if ( isset( $raw['wordSpacing'] ) ) {
			$clean['wordSpacing'] = max( -500, min( 1000, intval( $raw['wordSpacing'] ) ) );
		}

		// Line breaking: normal ('') is never stored unless it unsets an inherited value
		if ( '' !== self::normalize_text_wrap( isset( $raw['textWrap'] ) ? $raw['textWrap'] : '' ) ) {
			$clean['textWrap'] = $raw['textWrap'];
		} elseif ( $keep_empty && isset( $raw['textWrap'] ) && '' === $raw['textWrap'] ) {
			$clean['textWrap'] = '';
		}

		// Indents and paragraph spacing (#199): lengths in px or em, zero
		// or more; none ('') is never stored unless it unsets an inherited
		// value
		foreach ( self::SPACING_PROPERTIES as $key ) {
			if ( ! isset( $raw[ $key ] ) ) {
				continue;
			}
			$length = self::normalize_length( $raw[ $key ] );
			if ( '' !== $length ) {
				$clean[ $key ] = $length;
			} elseif ( $keep_empty && '' === $raw[ $key ] ) {
				$clean[ $key ] = '';
			}
		}

		// First line indent: negative is a hanging indent. "Only after a
		// paragraph with the same style" is stored only as true, and only
		// with a positive indent (indent_after_same_applies()).
		if ( isset( $raw['firstLineIndent'] ) ) {
			$first = self::normalize_length( $raw['firstLineIndent'], true );
			if ( '' !== $first ) {
				$clean['firstLineIndent'] = $first;
				if ( '-' !== $first[0] && isset( $raw['indentAfterSame'] ) && in_array( $raw['indentAfterSame'], array( true, 1, '1', 'true' ), true ) ) {
					$clean['indentAfterSame'] = true;
				}
			} elseif ( $keep_empty && '' === $raw['firstLineIndent'] ) {
				$clean['firstLineIndent'] = '';
			}
		}

		return $clean;
	}

	/**
	 * CSS declarations for a case setting (#214), as [property, value] pairs.
	 *
	 * Case is one exclusive choice, so every value sets both mechanisms: a
	 * transform resets font-variant-caps, and small caps reset
	 * text-transform (a theme that uppercases headings would otherwise turn
	 * a Small Caps style into full capitals). font-variant-caps lets the
	 * browser fake small caps when the font has none, unless
	 * font-synthesis-small-caps is none. Feature toggles use
	 * font-feature-settings, which applies after font-variant-caps, so they
	 * keep working. Mirrors caseDeclarations() in core utils.js and
	 * ps-utils.js; the order is part of the byte-identical CSS.
	 *
	 * @param mixed $text_case       Case value; anything unknown is Default.
	 * @param bool  $fake_small_caps Allow fake small caps.
	 * @return array[] Declarations, empty for Default.
	 */
	public static function case_declarations( $text_case, $fake_small_caps = true ) {
		if ( ! is_string( $text_case ) || ! in_array( $text_case, self::TEXT_CASE_VALUES, true ) ) {
			return array();
		}
		if ( 'small-caps' === $text_case || 'all-small-caps' === $text_case ) {
			return array(
				array( 'text-transform', 'none' ),
				array( 'font-variant-caps', $text_case ),
				array( 'font-synthesis-small-caps', $fake_small_caps ? 'auto' : 'none' ),
			);
		}
		return array(
			array( 'text-transform', $text_case ),
			array( 'font-variant-caps', 'normal' ),
		);
	}

	/**
	 * Normalize a hanging-initial value (#242) to em.
	 *
	 * Non-numeric, negative and empty input gives 0 (no hang). Values are
	 * capped at HANG_MAX and rounded to three decimals. Mirrors
	 * normalizeHang() in core utils.js and in ps-utils.js, so the stored
	 * value and both CSS generators agree.
	 *
	 * @param mixed $value Raw value.
	 * @return float Hang in em, 0 when off.
	 */
	public static function normalize_hang( $value ) {
		// Trim first: PHP 7.4's is_numeric() rejects trailing whitespace,
		// PHP 8 and the JS twins accept it.
		if ( is_string( $value ) ) {
			$value = trim( $value );
		}
		if ( ! is_numeric( $value ) ) {
			return 0;
		}
		$hang = (float) $value;
		// is_finite: '1e999' is INF here but Infinity (→ 0) in the JS twins
		if ( $hang <= 0 || ! is_finite( $hang ) ) {
			return 0;
		}
		return round( min( $hang, self::HANG_MAX ), 3 );
	}

	/**
	 * Convert a px size to rem for the generated CSS (#233).
	 *
	 * Divides by 16 and rounds to six decimals. Mirrors pxToRem() in
	 * assets/js/font-size-units.js (the block) and in ps-utils.js (the JS
	 * twin of this generator), so a style and a block with the same size
	 * write the same value. Below 0.0001rem gives 0: PHP prints smaller
	 * floats in exponent form (1.0E-5) where JS does not.
	 *
	 * @param mixed $px Size in px (already checked as numeric by the caller).
	 * @return float Size in rem.
	 */
	public static function px_to_rem( $px ) {
		$rem = (float) $px / 16;
		if ( ! is_finite( $rem ) || abs( $rem ) < 0.0001 ) {
			return 0;
		}
		return round( $rem, 6 );
	}

	/**
	 * The vw term of a rem style's responsive clamp (#234).
	 *
	 * The author's slope, limited so the size doubles by 500% browser zoom
	 * (WCAG 1.4.4 for fluid type): the size may reach max(4 × pref,
	 * 2.5 × min) in a 1920px window, so when Large is above that, the slope
	 * is lowered to reach it there and rounded down to four decimals.
	 * Mirrors getResponsiveZoomLimit() in assets/js/font-size-units.js
	 * (which explains the bound) and responsiveZoomVw() in ps-utils.js.
	 * Styles saved before #233 (px) keep the author's slope.
	 *
	 * @param int $min  Mobile size (px).
	 * @param int $pref Preferred size (px).
	 * @param int $max  Desktop size (px).
	 * @return float vw coefficient, four decimals.
	 */
	public static function responsive_zoom_vw( $min, $pref, $max ) {
		$vw    = ( ( $max - $min ) / ( self::RESPONSIVE_FONT_MAX_VIEWPORT - self::RESPONSIVE_FONT_MIN_VIEWPORT ) ) * 100;
		$reach = max( 4 * $pref, 2.5 * $min );
		if ( $vw > 0 && $pref >= 0 && $max > $reach ) {
			// The epsilon keeps an exact bound (2.5) from flooring to 2.4999.
			$bound = floor( ( ( ( $reach - $pref ) * 100 ) / self::RESPONSIVE_FONT_MAX_VIEWPORT ) * 10000 + 1e-7 ) / 10000;
			if ( $bound < $vw ) {
				return $bound;
			}
		}
		return round( $vw, 4 );
	}

	// -------------------------------------------------------------------------
	// Based On (#200)
	// -------------------------------------------------------------------------

	/**
	 * Resolve a style's properties through its Based On chain (#200).
	 *
	 * A style's stored `properties` hold only what it sets itself. A style
	 * with `basedOn` takes its parent's resolved value for every property it
	 * does not set. The chain is walked up to MAX_BASED_ON_LEVELS styles
	 * (the style itself included) and stops at a missing parent or a style
	 * already seen, so bad data in the option cannot loop. Then each level is
	 * merged from the root down (merge_properties()) and the empty values a
	 * child uses to unset an inherited property are dropped
	 * (compact_properties()).
	 *
	 * A style without `basedOn` returns its stored properties untouched, so
	 * every style saved before #200 renders byte for byte as before.
	 * resolveStyleProperties() in ps-utils.js is the JS twin; both read the
	 * fixture paragraph-styles/__tests__/fixtures/based-on.json.
	 *
	 * @param array $style  Style record.
	 * @param array $styles Every stored style (to find the parents).
	 * @return array Resolved properties.
	 */
	public static function resolve_properties( $style, $styles ) {
		$own = isset( $style['properties'] ) && is_array( $style['properties'] ) ? $style['properties'] : array();
		if ( empty( $style['basedOn'] ) ) {
			return $own;
		}

		$by_id = array();
		foreach ( is_array( $styles ) ? $styles : array() as $candidate ) {
			if ( isset( $candidate['id'] ) && is_numeric( $candidate['id'] ) ) {
				$by_id[ intval( $candidate['id'] ) ] = $candidate;
			}
		}

		$chain   = array( $style );
		$visited = array( isset( $style['id'] ) ? intval( $style['id'] ) : 0 => true );
		$current = $style;
		while ( ! empty( $current['basedOn'] ) && count( $chain ) < self::MAX_BASED_ON_LEVELS ) {
			$parent_id = intval( $current['basedOn'] );
			if ( ! isset( $by_id[ $parent_id ] ) || isset( $visited[ $parent_id ] ) ) {
				break;
			}
			$visited[ $parent_id ] = true;
			$current               = $by_id[ $parent_id ];
			$chain[]               = $current;
		}

		$resolved = array();
		for ( $i = count( $chain ) - 1; $i >= 0; $i-- ) {
			$level    = isset( $chain[ $i ]['properties'] ) && is_array( $chain[ $i ]['properties'] ) ? $chain[ $i ]['properties'] : array();
			$resolved = self::merge_properties( $resolved, $level );
		}
		return self::compact_properties( $resolved );
	}

	/**
	 * Lay a child's own properties over its parent's resolved ones (#200).
	 *
	 * Most keys inherit one by one. The size and the case are groups: a
	 * child that sets a size (`fontSize`) replaces the parent's whole size
	 * (unit, min/preferred/max, fit cap), and a child that sets a case
	 * (`textCase`) replaces `fakeSmallCaps` too. A merge key by key would mix
	 * a fixed child size with the parent's responsive trio, or give a Small
	 * Caps child the parent's "no fake small caps". Group keys a child stores
	 * without the group's lead key are ignored. Twin: mergeStyleProperties().
	 *
	 * @param array $base Parent's resolved properties.
	 * @param array $own  Child's own properties.
	 * @return array
	 */
	public static function merge_properties( $base, $own ) {
		$out = is_array( $base ) ? $base : array();
		if ( ! is_array( $own ) ) {
			return $out;
		}
		foreach ( self::BASED_ON_GROUPS as $lead => $keys ) {
			if ( ! array_key_exists( $lead, $own ) ) {
				continue;
			}
			foreach ( $keys as $key ) {
				unset( $out[ $key ] );
				if ( array_key_exists( $key, $own ) ) {
					$out[ $key ] = $own[ $key ];
				}
			}
		}
		foreach ( $own as $key => $value ) {
			if ( ! self::is_group_key( $key ) ) {
				$out[ $key ] = $value;
			}
		}
		return $out;
	}

	/**
	 * Drop the empty values a child stores to unset an inherited property.
	 *
	 * A child of a style with a font that wants no font of its own stores
	 * `fontId: 0`; once resolved, that empty value has done its job, and the
	 * resolved properties look like any style that sets nothing there:
	 * `fontSize: 'inherit'` drops the size group, `textCase: ''` the case
	 * group, and any other key is dropped when PHP empty() (an empty
	 * features list included) — the same test the CSS generators use, so
	 * dropping changes no CSS. Twin: compactStyleProperties().
	 *
	 * @param array $props Properties.
	 * @return array
	 */
	public static function compact_properties( $props ) {
		if ( ! is_array( $props ) ) {
			return array();
		}
		if ( array_key_exists( 'fontSize', $props ) && ( null === $props['fontSize'] || '' === $props['fontSize'] || 'inherit' === $props['fontSize'] ) ) {
			foreach ( self::BASED_ON_GROUPS['fontSize'] as $key ) {
				unset( $props[ $key ] );
			}
		}
		if ( array_key_exists( 'textCase', $props ) && ! in_array( $props['textCase'], self::TEXT_CASE_VALUES, true ) ) {
			foreach ( self::BASED_ON_GROUPS['textCase'] as $key ) {
				unset( $props[ $key ] );
			}
		}
		if ( array_key_exists( 'alignment', $props ) && ! in_array( $props['alignment'], self::ALIGNMENT_VALUES, true ) ) {
			foreach ( self::BASED_ON_GROUPS['alignment'] as $key ) {
				unset( $props[ $key ] );
			}
		}
		if ( array_key_exists( 'firstLineIndent', $props ) && '' === self::normalize_length( $props['firstLineIndent'], true ) ) {
			foreach ( self::BASED_ON_GROUPS['firstLineIndent'] as $key ) {
				unset( $props[ $key ] );
			}
		}
		foreach ( $props as $key => $value ) {
			if ( ! self::is_group_key( $key ) && empty( $value ) ) {
				unset( $props[ $key ] );
			}
		}
		return $props;
	}

	/**
	 * Remove the own properties that equal the parent's resolved values.
	 *
	 * Runs when a style's Based On changes: a value that matches the new
	 * parent becomes inherited, so a later change to the parent reaches it.
	 * Properties the style does not set stay unset, and so inherit. Groups
	 * are compared as a whole (see merge_properties()). Twin of the compare
	 * in computeStyleOverrides().
	 *
	 * @param array $own    The style's own properties.
	 * @param array $parent The new parent's resolved properties.
	 * @return array
	 */
	public static function drop_inherited_properties( $own, $parent ) {
		if ( ! is_array( $own ) ) {
			return array();
		}
		$parent = is_array( $parent ) ? $parent : array();
		foreach ( self::BASED_ON_GROUPS as $lead => $keys ) {
			if ( array_key_exists( $lead, $own ) && self::group_signature( $lead, $own ) === self::group_signature( $lead, $parent ) ) {
				foreach ( $keys as $key ) {
					unset( $own[ $key ] );
				}
			}
		}
		foreach ( array_keys( $own ) as $key ) {
			if ( ! self::is_group_key( $key ) && self::property_values_equal( $key, $own, $parent ) ) {
				unset( $own[ $key ] );
			}
		}
		return $own;
	}

	/**
	 * The own properties that make a style based on another keep a look.
	 *
	 * `$full` is the whole look; the result keeps what differs from the
	 * parent's resolved properties and stores the empty value of each
	 * property the parent sets and the look does not (EMPTY_PROPERTY_VALUES,
	 * fontSize 'inherit', textCase '', alignment '', firstLineIndent ''), so
	 * the style still does not set it.
	 * Used when a style gets its first parent (rebase_properties()). Twin of
	 * computeStyleOverrides() in ps-utils.js; both read the `overrides`
	 * cases of the shared fixture.
	 *
	 * @param array $full   The whole look (resolved, compacted).
	 * @param array $parent The parent's resolved properties.
	 * @return array
	 */
	public static function compute_overrides( $full, $parent ) {
		$full   = is_array( $full ) ? $full : array();
		$parent = is_array( $parent ) ? $parent : array();
		$out    = array();
		foreach ( self::BASED_ON_GROUPS as $lead => $keys ) {
			$mine = self::group_signature( $lead, $full );
			if ( self::group_signature( $lead, $parent ) === $mine ) {
				continue;
			}
			$no_case = 'textCase' === $lead && ! ( isset( $full['textCase'] ) && in_array( $full['textCase'], self::TEXT_CASE_VALUES, true ) );
			if ( 'none' === $mine || $no_case ) {
				$out[ $lead ] = 'fontSize' === $lead ? 'inherit' : '';
				continue;
			}
			foreach ( $keys as $key ) {
				if ( array_key_exists( $key, $full ) ) {
					$out[ $key ] = $full[ $key ];
				}
			}
		}
		$keys = array();
		foreach ( array_merge( array_keys( $full ), array_keys( $parent ) ) as $key ) {
			if ( ! self::is_group_key( $key ) ) {
				$keys[ $key ] = true;
			}
		}
		foreach ( array_keys( $keys ) as $key ) {
			if ( self::property_values_equal( $key, $full, $parent ) ) {
				continue;
			}
			if ( array_key_exists( $key, $full ) ) {
				$out[ $key ] = $full[ $key ];
			} elseif ( array_key_exists( $key, self::EMPTY_PROPERTY_VALUES ) ) {
				$out[ $key ] = self::EMPTY_PROPERTY_VALUES[ $key ];
			}
		}
		return $out;
	}

	/**
	 * Whether a key belongs to the size, the case, the alignment or the
	 * first line indent group.
	 *
	 * @param string $key Property key.
	 * @return bool
	 */
	private static function is_group_key( $key ) {
		foreach ( self::BASED_ON_GROUPS as $keys ) {
			if ( in_array( $key, $keys, true ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * A comparable form of a group, as the CSS generators read it.
	 *
	 * Size: 'none' when no size is set; else the mode, the unit (absent is
	 * px), the trio for responsive and fit, and the cap for fit. Case: the
	 * case value and whether fake small caps are allowed. Alignment (#207):
	 * 'none' when not set, else the value and the last line alignment of
	 * justified text. First line indent (#199): 'none' when not set, else
	 * the length and whether it applies only after the same style.
	 * Twin: groupSignature().
	 *
	 * @param string $lead  'fontSize', 'textCase', 'alignment' or 'firstLineIndent'.
	 * @param array  $props Properties.
	 * @return string
	 */
	private static function group_signature( $lead, $props ) {
		if ( 'firstLineIndent' === $lead ) {
			$first = self::normalize_length( isset( $props['firstLineIndent'] ) ? $props['firstLineIndent'] : '', true );
			if ( '' === $first ) {
				return 'none';
			}
			return $first . '|' . ( self::indent_after_same_applies( $props ) ? '1' : '0' );
		}
		if ( 'alignment' === $lead ) {
			$alignment = self::normalize_alignment( isset( $props['alignment'] ) ? $props['alignment'] : '' );
			if ( '' === $alignment ) {
				return 'none';
			}
			return $alignment . '|' . self::normalize_align_last( $alignment, isset( $props['alignLast'] ) ? $props['alignLast'] : '' );
		}
		if ( 'textCase' === $lead ) {
			$case = isset( $props['textCase'] ) && in_array( $props['textCase'], self::TEXT_CASE_VALUES, true ) ? $props['textCase'] : '';
			$fake = ! ( in_array( $case, array( 'small-caps', 'all-small-caps' ), true ) && isset( $props['fakeSmallCaps'] ) && false === $props['fakeSmallCaps'] );
			return $case . '|' . ( $fake ? '1' : '0' );
		}
		$size = isset( $props['fontSize'] ) ? (string) $props['fontSize'] : '';
		if ( '' === $size || 'inherit' === $size ) {
			return 'none';
		}
		$parts = array( $size, isset( $props['fontSizeUnit'] ) && 'rem' === $props['fontSizeUnit'] ? 'rem' : 'px' );
		if ( 'responsive' === $size || 'fit' === $size ) {
			foreach ( array( 'fontSizeMin', 'fontSizePreferred', 'fontSizeMax' ) as $key ) {
				$parts[] = isset( $props[ $key ] ) ? (string) intval( $props[ $key ] ) : '';
			}
		}
		if ( 'fit' === $size ) {
			$parts[] = isset( $props['fitMaxSize'] ) ? (string) intval( $props['fitMaxSize'] ) : '0';
		}
		return implode( '|', $parts );
	}

	/**
	 * Whether one non-group property has the same value in two property sets.
	 *
	 * Absent compares as the key's empty value, and values compare as the
	 * CSS generators read them (features in any order, line height to three
	 * decimals). Twin: propertyValuesEqual().
	 *
	 * @param string $key Property key.
	 * @param array  $a   Properties.
	 * @param array  $b   Properties.
	 * @return bool
	 */
	private static function property_values_equal( $key, $a, $b ) {
		$va = array_key_exists( $key, $a ) ? $a[ $key ] : null;
		$vb = array_key_exists( $key, $b ) ? $b[ $key ] : null;
		switch ( $key ) {
			case 'fontId':
				return abs( (int) $va ) === abs( (int) $vb );
			case 'letterSpacing':
			case 'wordSpacing':
				return (int) $va === (int) $vb;
			case 'lineHeight':
				return abs( (float) $va - (float) $vb ) <= 0.0005;
			case 'initialHang':
				return self::normalize_hang( $va ) === self::normalize_hang( $vb );
			case 'indentStart':
			case 'indentEnd':
			case 'spaceBefore':
			case 'spaceAfter':
				return self::normalize_length( $va ) === self::normalize_length( $vb );
			case 'features':
				$fa = is_array( $va ) ? array_map( 'strval', $va ) : array();
				$fb = is_array( $vb ) ? array_map( 'strval', $vb ) : array();
				sort( $fa );
				sort( $fb );
				return $fa === $fb;
			default:
				return (string) ( is_scalar( $va ) ? $va : '' ) === (string) ( is_scalar( $vb ) ? $vb : '' );
		}
	}

	/**
	 * Ids of the styles based on a style, directly or through others.
	 *
	 * @param array $styles   Every stored style.
	 * @param int   $style_id Style id.
	 * @return int[]
	 */
	public static function descendant_ids( $styles, $style_id ) {
		$children = array();
		foreach ( is_array( $styles ) ? $styles : array() as $style ) {
			if ( ! empty( $style['basedOn'] ) && isset( $style['id'] ) ) {
				$children[ intval( $style['basedOn'] ) ][] = intval( $style['id'] );
			}
		}
		$found = array();
		$queue = array( intval( $style_id ) );
		while ( $queue ) {
			$id = array_shift( $queue );
			foreach ( isset( $children[ $id ] ) ? $children[ $id ] : array() as $child ) {
				if ( ! isset( $found[ $child ] ) && intval( $style_id ) !== $child ) {
					$found[ $child ] = true;
					$queue[]         = $child;
				}
			}
		}
		return array_keys( $found );
	}

	/**
	 * Check a Based On choice: '' when it is allowed, else the reason.
	 *
	 * Rejects a style that does not exist, the style itself, a style based
	 * on it (a loop), and a choice that makes a chain longer than
	 * MAX_BASED_ON_LEVELS styles.
	 *
	 * @param array $styles   Every stored style.
	 * @param int   $style_id The style being changed (0 for a new style).
	 * @param int   $based_on The parent asked for (> 0).
	 * @return string
	 */
	public static function based_on_error( $styles, $style_id, $based_on ) {
		$by_id = array();
		foreach ( is_array( $styles ) ? $styles : array() as $style ) {
			if ( isset( $style['id'] ) && is_numeric( $style['id'] ) ) {
				$by_id[ intval( $style['id'] ) ] = $style;
			}
		}
		if ( ! isset( $by_id[ $based_on ] ) ) {
			return __( 'The style to base this style on does not exist.', 'typost-paragraph-styles' );
		}
		if ( $style_id && ( $based_on === $style_id || in_array( $based_on, self::descendant_ids( $styles, $style_id ), true ) ) ) {
			return __( 'A style cannot be based on itself or on a style that is based on it.', 'typost-paragraph-styles' );
		}

		// Levels above: the parent and its ancestors (a loop in stored data
		// counts as too deep).
		$above   = 0;
		$seen    = array();
		$current = $based_on;
		while ( $current && isset( $by_id[ $current ] ) && ! isset( $seen[ $current ] ) ) {
			$seen[ $current ] = true;
			$above++;
			$current = ! empty( $by_id[ $current ]['basedOn'] ) ? intval( $by_id[ $current ]['basedOn'] ) : 0;
		}
		if ( $current && isset( $seen[ $current ] ) ) {
			$above = self::MAX_BASED_ON_LEVELS;
		}

		// Levels below: the longest chain of styles based on this one.
		$below = 0;
		if ( $style_id ) {
			$depth = array( $style_id => 0 );
			$queue = array( $style_id );
			while ( $queue ) {
				$id = array_shift( $queue );
				foreach ( $by_id as $child_id => $child ) {
					if ( ! empty( $child['basedOn'] ) && intval( $child['basedOn'] ) === $id && ! isset( $depth[ $child_id ] ) ) {
						$depth[ $child_id ] = $depth[ $id ] + 1;
						$below              = max( $below, $depth[ $child_id ] );
						$queue[]            = $child_id;
					}
				}
			}
		}

		if ( $above + 1 + $below > self::MAX_BASED_ON_LEVELS ) {
			return sprintf(
				/* translators: %d: largest number of styles in a Based On chain */
				__( 'A chain of Based On styles can hold at most %d styles.', 'typost-paragraph-styles' ),
				self::MAX_BASED_ON_LEVELS
			);
		}
		return '';
	}
}

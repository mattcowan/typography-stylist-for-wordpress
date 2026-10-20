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
	define( 'TYPOST_PS_VERSION', '1.2.3' );
	define( 'TYPOST_PS_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
	define( 'TYPOST_PS_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
}

/**
 * Typography Stylist - Paragraph Styles
 *
 * Singleton class that hooks into Typography Stylist's extensibility system
 * to provide paragraph style presets with CSS class-based rendering.
 */
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

	/** @var string Option key for storing paragraph styles */
	const OPTION_KEY = 'typost_paragraph_styles';

	/** @var string Option key for the next sequential ID counter */
	const COUNTER_KEY = 'typost_paragraph_styles_next_id';

	/** @var string Transient key for caching styles data */
	const CACHE_KEY = 'typost_paragraph_styles_cache';

	/** @var string Transient key for caching generated CSS */
	const CSS_CACHE_KEY = 'typost_paragraph_styles_css';

	/** @var string Option storing whether the block toolbar gets a direct styles button */
	const TOOLBAR_OPTION = 'typost_ps_toolbar_button';

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
		'textCase' => array( 'textCase', 'fakeSmallCaps' ),
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

		// Editor data
		add_filter( 'typost_editor_data', array( $this, 'add_editor_data' ) );
		// Content styled only through a style class names no font; tell core's
		// frontend font detection which fonts those classes stand for.
		add_filter( 'typost_content_font_ids', array( $this, 'font_ids_from_content' ), 10, 2 );
		// Styles forced onto every page need their fonts on every page too.
		add_filter( 'typost_force_enqueue_font_ids', array( $this, 'font_ids_from_forced_styles' ) );

		// REST routes
		add_action( 'typost_register_rest_routes', array( $this, 'register_rest_routes' ) );

		// Assets
		add_action( 'typost_editor_assets', array( $this, 'enqueue_editor_assets' ) );
		add_action( 'typost_admin_assets', array( $this, 'enqueue_admin_assets' ) );

		// Cache clear
		add_action( 'typost_cache_clear', array( $this, 'clear_cache' ) );

		// CSS output — frontend: the rules for the styles the page uses, in
		// the head; a footer pass prints the styles that blocks rendered
		// after the head (classic-theme widgets, custom query loops).
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

		if ( empty( $css_rules ) ) {
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

		$css = sprintf(
			"%s {\n    %s;\n}",
			$selector,
			implode( ";\n    ", $css_rules )
		);

		if ( $hang > 0 ) {
			$css .= self::core_block_hang_css( $id );
		}

		return $css;
	}

	/**
	 * The First Letter Hang rules for a style on core blocks (#219).
	 *
	 * The style's main rule sets `--typost-hang`, and core's block style.css
	 * consumes it only inside a Typography Stylist block. A core Paragraph
	 * or Heading carrying the style class needs its own rules, so a style
	 * with a hang adds them (a style without one adds nothing, which keeps
	 * a theme's `::first-letter` margin and paragraph indent untouched):
	 *  - frontend: `::first-letter` gets the negative start margin;
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
		$tags   = ':is(p, h1, h2, h3, h4, h5, h6)';
		$off    = " {\n    --typost-hang-on: 0;\n}";
		$on     = " {\n    --typost-hang-on: 1;\n}";
		$rtl    = ':is([style*="direction: rtl"], [style*="direction:rtl"])';
		$ltr    = ':is([style*="direction: ltr"], [style*="direction:ltr"])';
		return "\n\n" . $cls . $tags . ':not(.wp-block-typost *, .has-drop-cap, .block-editor-rich-text__editable, [style*="text-indent"])::first-letter {' . "\n    margin-inline-start: " . $amount . ";\n}"
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
		$all_styles = $this->get_styles();
		foreach ( $this->styles_for_refs( $refs ) as $style ) {
			$key = isset( $style['id'] ) ? (string) $style['id'] : '';
			if ( '' === $key || isset( $this->printed_style_ids[ $key ] ) ) {
				continue;
			}
			$this->printed_style_ids[ $key ] = true;
			$block                           = $this->generate_style_css( $style, $all_styles );
			if ( '' !== $block ) {
				$blocks[] = $block;
			}
		}
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
		foreach ( $this->styles_for_refs( $this->get_forced_style_refs() ) as $style ) {
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

		foreach ( $this->styles_for_refs( $style_refs ) as $style ) {
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
	 * Off by default: the styles dropdown already sits in the Inspector sidebar
	 * and both editor panels, so an extra toolbar button on upgrade would be
	 * unrequested.
	 *
	 * @since 1.2.0
	 * @return bool
	 */
	private function toolbar_button_enabled() {
		return (bool) get_option( self::TOOLBAR_OPTION, false );
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
		$based_on = absint( $request->get_param( 'basedOn' ) );

		if ( empty( $name ) ) {
			return new WP_REST_Response( array( 'message' => __( 'Style name is required.', 'typost-paragraph-styles' ) ), 400 );
		}

		$styles = $this->get_styles();

		if ( $based_on ) {
			$error = self::based_on_error( $styles, 0, $based_on );
			if ( '' !== $error ) {
				// field: the admin form marks the Based on select, not the name
				return new WP_REST_Response( array( 'message' => $error, 'field' => 'basedOn' ), 400 );
			}
		}

		// A style based on another stores only its overrides, which may
		// include empty values that unset an inherited property (#200).
		$properties = $this->sanitize_properties( $request->get_param( 'properties' ), $based_on > 0 );

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

		// Based On (#200). Absent leaves it as it is; 0 removes it.
		$old_based_on = ! empty( $styles[ $index ]['basedOn'] ) ? intval( $styles[ $index ]['basedOn'] ) : 0;
		$based_on     = $old_based_on;
		if ( null !== $request->get_param( 'basedOn' ) ) {
			$based_on = absint( $request->get_param( 'basedOn' ) );
			if ( $based_on && $based_on !== $old_based_on ) {
				$error = self::based_on_error( $styles, $id, $based_on );
				if ( '' !== $error ) {
					// field: the admin form marks the Based on select, not the name
					return new WP_REST_Response( array( 'message' => $error, 'field' => 'basedOn' ), 400 );
				}
			}
		}

		$properties = $request->get_param( 'properties' );
		if ( null !== $properties ) {
			// The client sends the style's own properties: with a parent,
			// only its overrides (computeStyleOverrides() in ps-utils.js)
			$styles[ $index ]['properties'] = $this->sanitize_properties( $properties, $based_on > 0 );
		} elseif ( $based_on !== $old_based_on ) {
			$styles[ $index ]['properties'] = $this->rebase_properties( $styles, $index, $based_on );
		}

		if ( $based_on ) {
			$styles[ $index ]['basedOn'] = $based_on;
		} else {
			unset( $styles[ $index ]['basedOn'] );
		}

		$styles[ $index ]['modified'] = current_time( 'Y-m-d' );
		$this->save_styles( $styles );

		return new WP_REST_Response( self::prepare_style_for_client( $styles[ $index ], $styles ), 200 );
	}

	/**
	 * A style's own properties after its Based On changes (#200).
	 *
	 * Removing the parent copies the resolved values into the style, so it
	 * looks the same. A new parent keeps what the style sets, except values
	 * that equal the new parent's, which become inherited; everything the
	 * style does not set inherits from the new parent.
	 *
	 * @param array $styles       Every stored style (before the change).
	 * @param int   $index        Index of the style that changes.
	 * @param int   $new_based_on The new parent id, 0 for none.
	 * @return array
	 */
	private function rebase_properties( $styles, $index, $new_based_on ) {
		$style = $styles[ $index ];
		if ( ! $new_based_on ) {
			return self::compact_properties( self::resolve_properties( $style, $styles ) );
		}
		$parent_index = $this->find_style_index( $styles, $new_based_on );
		$parent       = false === $parent_index ? array() : self::resolve_properties( $styles[ $parent_index ], $styles );
		$own          = isset( $style['properties'] ) && is_array( $style['properties'] ) ? $style['properties'] : array();
		return self::drop_inherited_properties( $own, $parent );
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

		array_splice( $styles, $index, 1 );
		$this->save_styles( $styles );

		return new WP_REST_Response( array( 'deleted' => true, 'detached' => $detached ), 200 );
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
	 * @return string HTML.
	 */
	public static function render_card_details( $props, $font, $inheritance = null ) {
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
		// Each row: label, value, the keys it shows (for its source label)
		$rows      = array();

		$rows[] = array( __( 'Font:', 'typost-paragraph-styles' ), $font_name . ' (' . $weight . ')', array( 'fontId', 'fontWeight' ) );

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

		// Font size
		if ( ! empty( $props['fontSize'] ) ) {
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
				$parts[] = '<strong>' . esc_html( $pair[0] ) . '</strong> ' . esc_html( $pair[1] ) . ( isset( $pair[2] ) ? $source( $pair[2] ) : '' );
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
	 * @return string HTML.
	 */
	public static function render_card_preview( $style_id, $font, $manual_ids ) {
		list( $text, $lang ) = self::admin_preview_text();
		$style_id = intval( $style_id );
		$font_id  = isset( $font['font_id'] ) ? absint( $font['font_id'] ) : 0;

		$html  = '<div class="typost-ps-preview" id="' . esc_attr( 'typost-ps-preview-' . $style_id ) . '">';
		$html .= '<p class="typost-ps-preview-sample ' . esc_attr( 'typost-ps-' . $style_id ) . '" lang="' . esc_attr( $lang ) . '"'
			. ( $font_id ? ' data-typost-font-id="' . esc_attr( $font_id ) . '"' : '' ) . '>' . esc_html( $text ) . '</p>';
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
		$related = array();
		foreach ( self::descendant_ids( $styles, $id ) as $descendant_id ) {
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
	 * values, labelled Inherited or Override, and its resolved font.
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
				}
			}
			$inheritance = array(
				'own'    => isset( $style['properties'] ) && is_array( $style['properties'] ) ? $style['properties'] : array(),
				'parent' => $parent_name,
			);
		}
		$font = self::resolve_font_label( isset( $props['fontId'] ) ? $props['fontId'] : 0, $context['lookup'], $context['mappings'] );
		return array(
			'details' => self::render_card_details( $props, $font, $inheritance ),
			'preview' => self::render_card_preview( intval( $style['id'] ), $font, $context['manual_ids'] ),
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
	 *                               property (#200): `fontStyle`, `textCase`
	 *                               and `fontVariationSettings` as '', and
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
	 * Whether a key belongs to the size or the case group.
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
	 * case value and whether fake small caps are allowed. Twin: groupSignature().
	 *
	 * @param string $lead  'fontSize' or 'textCase'.
	 * @param array  $props Properties.
	 * @return string
	 */
	private static function group_signature( $lead, $props ) {
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
				return (int) $va === (int) $vb;
			case 'lineHeight':
				return abs( (float) $va - (float) $vb ) <= 0.0005;
			case 'initialHang':
				return self::normalize_hang( $va ) === self::normalize_hang( $vb );
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

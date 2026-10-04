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
	define( 'TYPOST_PS_VERSION', '1.2.1' );
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
	 * @param array $style The style data.
	 * @return string CSS rule block.
	 */
	public function generate_style_css( $style ) {
		$id    = intval( $style['id'] );
		$props = isset( $style['properties'] ) ? $style['properties'] : array();

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

		// Font size — fixed numeric px value. The current editors only produce
		// 'inherit' / 'responsive' / 'fit' states, but the REST API accepts any
		// value and legacy/external data may store plain px numbers.
		if ( isset( $props['fontSize'] ) && is_numeric( $props['fontSize'] ) && $props['fontSize'] > 0 ) {
			$css_rules[] = 'font-size: ' . intval( $props['fontSize'] ) . 'px';
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

			$css_rules[] = sprintf(
				'font-size: clamp(%dpx, %srem + %svw, %dpx)',
				$min,
				round( $pref / 16, 4 ),
				round( $vw, 4 ),
				$max
			);
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

		return sprintf(
			"%s {\n    %s;\n}",
			$selector,
			implode( ";\n    ", $css_rules )
		);
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
			$block = $this->generate_style_css( $style );
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
		$blocks = array();
		foreach ( $this->styles_for_refs( $refs ) as $style ) {
			$key = isset( $style['id'] ) ? (string) $style['id'] : '';
			if ( '' === $key || isset( $this->printed_style_ids[ $key ] ) ) {
				continue;
			}
			$this->printed_style_ids[ $key ] = true;
			$block                           = $this->generate_style_css( $style );
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
			$font_id = isset( $style['properties']['fontId'] ) ? intval( $style['properties']['fontId'] ) : 0;
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
			$font_id = isset( $style['properties']['fontId'] ) ? intval( $style['properties']['fontId'] ) : 0;
			if ( $font_id > 0 ) {
				$ids[] = $font_id;
			}
		}

		return array_values( array_unique( array_map( 'intval', $ids ) ) );
	}

	/**
	 * Add paragraph styles to the editor localized data.
	 *
	 * @param array $data Existing editor data.
	 * @return array Modified editor data.
	 */
	public function add_editor_data( $data ) {
		$data['paragraphStyles']        = $this->get_styles();
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
					<?php esc_html_e( 'Add a Paragraph Styles button to the Typography Stylist block toolbar', 'typost-paragraph-styles' ); ?>
				</label>
				<p class="description">
					<?php esc_html_e( 'Opens a browser showing every saved paragraph style rendered in its own typeface, so you can see a style before applying it. The styles dropdown in the sidebar and editor panels is unchanged.', 'typost-paragraph-styles' ); ?>
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
		return new WP_REST_Response( $this->get_styles(), 200 );
	}

	/**
	 * POST /paragraph-styles
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response
	 */
	public function rest_create_style( $request ) {
		$name       = trim( sanitize_text_field( $request->get_param( 'name' ) ) );
		$properties = $this->sanitize_properties( $request->get_param( 'properties' ) );

		if ( empty( $name ) ) {
			return new WP_REST_Response( array( 'message' => __( 'Style name is required.', 'typost-paragraph-styles' ) ), 400 );
		}

		$styles = $this->get_styles();

		$new_id = $this->get_next_id();

		$new_style = array(
			'id'         => $new_id,
			'name'       => $name,
			'created'    => current_time( 'Y-m-d' ),
			'modified'   => current_time( 'Y-m-d' ),
			'properties' => $properties,
		);

		$styles[] = $new_style;
		$this->save_styles( $styles );

		return new WP_REST_Response( $new_style, 201 );
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

		$properties = $request->get_param( 'properties' );
		if ( null !== $properties ) {
			$styles[ $index ]['properties'] = $this->sanitize_properties( $properties );
		}

		$styles[ $index ]['modified'] = current_time( 'Y-m-d' );
		$this->save_styles( $styles );

		return new WP_REST_Response( $styles[ $index ], 200 );
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

		array_splice( $styles, $index, 1 );
		$this->save_styles( $styles );

		return new WP_REST_Response( array( 'deleted' => true ), 200 );
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

		// Pure logic shared with Jest tests (UMD-lite, exposed as window.typostPSUtils)
		// wp-i18n: the size labels this file builds are translatable, so the
		// handle needs its own script translations — they are not inherited
		// from the editor handle that depends on it.
		wp_enqueue_script(
			'typost-paragraph-styles-utils',
			TYPOST_PS_PLUGIN_URL . 'assets/js/lib/ps-utils.js',
			array( 'wp-i18n' ),
			TYPOST_PS_VERSION,
			true
		);

		wp_set_script_translations( 'typost-paragraph-styles-utils', 'typost-paragraph-styles', TYPOST_PS_PLUGIN_DIR . 'languages' );

		wp_enqueue_script(
			'typost-paragraph-styles-editor',
			TYPOST_PS_PLUGIN_URL . 'assets/js/editor.js',
			array( 'typost-block-editor', 'typost-paragraph-styles-utils', 'wp-element', 'wp-components', 'wp-i18n', 'wp-api-fetch' ),
			TYPOST_PS_VERSION,
			true
		);

		wp_set_script_translations( 'typost-paragraph-styles-editor', 'typost-paragraph-styles', TYPOST_PS_PLUGIN_DIR . 'languages' );
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
		wp_enqueue_script(
			'typost-paragraph-styles-admin',
			TYPOST_PS_PLUGIN_URL . 'assets/js/admin.js',
			// wp-a11y: rename/delete are announced through wp.a11y.speak (ADM-2)
			array( 'jquery', 'wp-i18n', 'wp-a11y' ),
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

		wp_localize_script( 'typost-paragraph-styles-admin', 'typostPSAdmin', array(
			'restUrl' => rest_url( self::REST_NAMESPACE . '/paragraph-styles' ),
			'nonce'   => wp_create_nonce( 'wp_rest' ),
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
	 * @param array|null $raw Raw properties from request.
	 * @return array Sanitized properties.
	 */
	private function sanitize_properties( $raw ) {
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
		}

		return $clean;
	}
}

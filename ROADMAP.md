# Typography Stylist — Roadmap

Consolidated 2026-07-26, updated 2026-07-27 (plugin at 2.1.2 released; the
next release is numbered 2.2.0 — its entries are parked in changelog.txt).
This replaces the previous roadmap (last touched Dec 2025 at v1.0.6), whose
items are all accounted for below — shipped, still planned, or explicitly
parked. Items here are ideas and intentions, not committed features.

Related planning docs: `todo/` holds per-item working docs; deferred infra
work also lives in RELEASING.md § Future work.

---

## Shipped (from the old roadmap and since)

| Item | Shipped in |
|---|---|
| Live preview in the block editor (was "Planned/High") | 2.0.0 — inline editor is live-preview; Apply button removed |
| Variable font support (was "Under Consideration") | 2.1.0 — axis auto-detection, admin config, editor sliders, "Detect Axes from Font File" |
| Extended OpenType features — frac, lnum/onum/pnum/tnum, smcp/c2sc, sups/subs, ordn, case (was "Planned") | Shipped — the feature list now covers 51 features including every proposed addition |
| Variable Font Axes (2.0.0 spec) | Superseded — shipped in 2.1.0 |
| Feature presets (core part of the old "Presets Library" idea) | Shipped early — user presets + defaults; see Open below for the rest |
| Glyphs Panel (never on the old roadmap, became the 2.0.0 flagship) | 2.0.0, bundled into core |
| WordPress Font Library integration | 2.1.0 (WP 6.5+): registration, editor pickers, adoption |
| Font-only ZIP uploads (Google Fonts downloads) | 2.1.0 |
| Automatic font-weight detection (uploads, Adobe, WP Library) + retrofit button | 2.1.2 |
| wp.org Live Preview (Playground blueprint) | 2.1.2 asset cycle |

## In progress

- **Playground demo upgrade** — wedding-invitation showcase content for the
  wp.org Live Preview blueprint (design in progress; blueprint templatizes
  font IDs at runtime).
- **2.2.0 editor-robustness batch** (unreleased; entries parked in
  changelog.txt) — mixed-selection per-run property application,
  glyph-insertion styling preservation, Glyphs Panel auto-alternates and
  context-driven italic-face browsing, QFT descendant-span override and
  selection-resolver hardening, Font Style (visual italic) controls across
  block/QFT/inline editors, variable-font axis-session fixes,
  conversion-to-block styling preservation, and the style-string helper
  refactor (see Shipped).

## Planned (next up)

- **Fit-to-width font sizing** — per-line "scale text to fill 100% of the
  row" block sizing mode. Starter prompt with full design notes:
  [todo/feature-fit-to-width-sizing.md](todo/feature-fit-to-width-sizing.md).
- **Per-font-family fallbacks** (High on the old roadmap; still open) —
  fallbacks per family instead of per kit/project. Cross-referenced from
  DOCUMENTATION.md. High complexity: data migration, UI, REST, CSS gen.
- ~~**Style-string helper refactor**~~ — **done 2026-07-26** (expanded:
  canonical `parseStyleString`/`buildStyleString`, unified
  `mergeTypostSpanStyling`, shared QFT selection resolver, depth-guard
  enforcement). History:
  [todo/refactor-style-string-helpers.md](todo/refactor-style-string-helpers.md).
- **Automatic per-font feature detection** — the Glyphs Panel already parses
  GSUB and knows which features a font really has; surface that to
  auto-configure the per-font feature-visibility settings (manual visibility
  shipped in 2.0.0). Natural follow-up to 2.1.2's weight auto-detection.
- **Animations extension** — core integration hooks shipped in 2.1.0
  (`animationConfigId`, `data-animation-id`, HOOKS.md); the extension plugin
  itself is unbuilt.
- **WP Font Library parity follow-ups** — 2.0.0 known limitation partially
  stands: font ordering and feature-visibility settings for WP Library fonts
  are still unsupported (weights were handled in 2.1.2 for adopted fonts).

## Infrastructure (from RELEASING.md § Future work)

- **E2E in CI** — Playwright suite needs a live WP install; a `wp-env` job
  could run it. Deliberately skipped so far to keep the pipeline simple.
- **Real 2× banner** — `.wordpress-org/banner-1544x500.png` is an upscaled
  copy, not true retina; regenerate from source art.
- **Editor-iframe QA checklist** — [todo/editor-iframe-testing.md](todo/editor-iframe-testing.md)
  (verified March 2026 against WP 7.0-beta2; re-run on major WP releases).
- **Branch hygiene** — many merged issue branches were never pruned
  (`bugfix/#81…`, `feature/#76…`, `feature/#41-variable-fonts`, etc.).
  Housekeeping, not work.

## Ideas (under consideration, unchanged priority)

- **Font subsetting & optimization** — auto-subsetting, unused-glyph
  removal, unicode-range optimization.
- **Advanced caching strategies** — smarter loading, preload/prefetch
  hints, caching-plugin integration (transient caching + manual clear
  already exist).
- **Critical CSS integration** — @font-face extraction for above-the-fold.
- **Presets library extras** — community presets, import/export (core
  presets shipped long ago).
- **Bulk feature application** — apply features across many headings,
  site-wide defaults.
- **Theme builder integration** — Elementor, Beaver Builder, Divi controls.
- **Full Site Editing support** — global styles/theme.json typography
  controls (the font side largely arrived with 2.1.0's Font Library
  integration; the controls side has not).

## Parked / not pursuing now

- **Platform port evaluation** — an 8-platform port assessment
  (Sanity.io and Payload CMS rated strong fits; Squarespace/Contentful not
  viable) lives only on the `claude/shopify-app-port-evaluation-GwFCZ`
  branch as `SHOPIFY-PORT-EVALUATION.md` (2026-02-06). Strategic reference,
  no active work; merge the doc somewhere permanent if a port is ever
  seriously considered.
- **WooCommerce integration** — remains an idea; no demand signal since it
  was first listed.

---

## How to request features

Open a GitHub issue with the enhancement label. See CLAUDE.md, TESTING.md,
and DOCUMENTATION.md for contribution guidelines.

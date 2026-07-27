# Feature: Fit-to-Width Font Sizing ("scale to fill the row")

Status: **not started** — this doc is the starter prompt for the implementing
session. Written 2026-07-26.

## What the user wants

A new font-sizing option on the Typography Stylist block: text scales up (or
down) so it fills **100% of its available horizontal space**. Per-line: a
block with 4 lines separated by hard returns (`<br>`) should size **each line
independently** so every line spans the full container width — the classic
wedding-invitation / poster look where a short line ("and") renders huge and a
long line ("request the pleasure of your company") renders smaller, all
flush to the same width.

## Starter prompt (paste into a fresh session)

> In the Typography Stylist plugin, add a third font-sizing mode to the
> Typography Stylist block: **"Fit to width"**, alongside the existing Fixed
> and Responsive (clamp) modes. In this mode each line of the block (segments
> split on `<br>`) is sized so its text spans 100% of the block's content
> width, independently per line.
>
> Hard constraint: **the frontend must stay zero-JavaScript** (this is a core
> plugin guarantee — rendering is CSS-only). CSS has no native "fit text to
> width", so use the measure-in-editor approach:
>
> 1. In the editor (edit.js), after fonts are loaded
>    (`document.fonts.ready` in the editor iframe), measure each line's
>    natural width at a reference font size (e.g. 100px) using a hidden
>    measurement node cloned with the block's computed font-family, weight,
>    letter-spacing, and font-feature-settings — features like swashes and
>    ligatures change the width, so measure with the real styling.
> 2. Compute each line's ratio R = referenceSize / naturalWidth. The
>    fit-to-width font-size is then `calc(R * 100cqi)` — container query
>    inline-size units, so the frontend scales with the container without
>    any script. Store per-line sizes in block attributes (e.g. a
>    `fitLineSizes` array), and stamp them on per-line wrapper spans in
>    save.js. The block's frontend wrapper needs `container-type:
>    inline-size` in the stylesheet for cqi units to resolve.
> 3. Lines must not wrap in this mode: apply `white-space: nowrap` to the
>    line wrappers (document the tradeoff in the sidebar help text).
> 4. Re-measure and update `fitLineSizes` whenever content, font family,
>    weight, letter-spacing, or feature settings change (debounced), and on
>    editor font-load completion. The editor preview should apply the same
>    cqi sizing so WYSIWYG holds.
> 5. Interplay rules: fit-to-width is a BLOCK-level size mode; inline
>    `data-fontsize` spans inside the block still work (they scale
>    relative to the line's computed size — use em-relative inline sizes in
>    fit mode, or document that inline absolute sizes are ignored in this
>    mode — decide and document). The accessibility dual-heading
>    architecture (visually-hidden semantic heading) must be unaffected.
> 6. Fallback: browsers without container-query support (very old) get the
>    Responsive-mode clamp as a fallback declaration before the cqi rule.
>
> Follow the repo's development workflow: extract the measurement math and
> the line-splitting into pure functions in
> `blocks/typography-stylist/utils.js` with Jest tests (ratio math, `<br>`
> segmentation incl. nested spans, attribute round-trip), update save.js
> fixtures/tests, run `npm test` and `npm run build`, add the new
> user-facing strings to the pot + fr/es catalogs, update readme feature
> list, and park a changelog entry in changelog.txt. Verify in the editor
> AND on the frontend at 320/768/1920px via Playwright on mnc4.local
> (post 253), including a 4-line block where every line lands flush to the
> container width.

## Design notes / gotchas discovered in advance

- **Why cqi units:** they make the frontend self-scaling with zero JS. The
  editor computes only the font-to-container *ratio*, not absolute pixels,
  so the stored value stays valid at every viewport/container width. `cqw`
  would track the viewport-relative container too, but `cqi` is the
  logical-inline axis and handles writing modes.
- **Save-format churn:** per-line wrappers change save.js output → block
  validation. Add a deprecated-save entry so existing blocks don't
  invalidate.
- **Measurement fidelity:** letter-spacing in the plugin is stored in
  1/1000 em; include it in the measurement node. `font-feature-settings`
  must be applied too (swash widths are dramatic in fonts like Style
  Script).
- **The Playground demo** (`.wordpress-org/blueprints/blueprint.json`) is
  the natural showcase once this ships — the wedding-invitation demo
  content being designed for it wants exactly this feature.

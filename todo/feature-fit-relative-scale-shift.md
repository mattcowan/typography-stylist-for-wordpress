# Feature: Per-selection relative size + vertical shift inside Fit-to-Width

Status: **not started** — this doc is the starter prompt for a future
session. Written 2026-07-29. Target release: **NOT 2.2.2** (2.2.2 is
feature-complete and shipping); this is 2.3.x material.

## What the user wants

Inside a Fit-to-Width block, select part of a line (one glyph, typically)
and (a) **decrease its size relative to the fitted line size**, and
(b) **nudge it up or down** vertically. Concrete driving case: in the
wedding-invitation demo ("April & Andy" in Style Script), shrink the
ampersand to ~60% of the line's size and raise it a little so it sits
optically centered between the two names. Quote: "if I could decrease the
size of the ampersand and move it up a little bit, this would be pretty
much perfect."

## Why this needs its own mechanism (the crucial constraint)

Fit mode deliberately **ignores inline font sizes**: `style.css` has
`.typost-fit .typost-line [data-fontsize] { font-size: inherit !important }`,
the measurement effect strips `[data-fontsize]` sizes before measuring, and
the QFT Font Size control is disabled in fit mode. That's because absolute
(px/clamp) inline sizes don't scale with the container, which breaks the
stored linear width-per-size ratio.

**A relative (em) size does not break it.** `font-size: 0.6em` on an inline
span resolves against the line's computed size, so the line's total width
still scales linearly with the container — the stored `calc(R * 100cqi)`
ratio stays valid at every viewport width, as long as the scaled span is
*included* in measurement (opposite of the `data-fontsize` treatment!).
Same for vertical shift: `vertical-align: 0.35em` is em-relative, moves the
glyph without changing its horizontal advance, and needs no measurement
change at all.

So: a **new pair of attributes**, distinct from `data-fontsize` (which
stays neutralized in fit mode):

- `data-fitscale="0.6"` → `font-size: 0.6em` — relative glyph scale
- `data-fitshift="0.35"` → `vertical-align: 0.35em` (negative = down) —
  vertical nudge (the user speculated line-height might do this; it can't —
  line-height sizes the line box, `vertical-align` moves the inline box)

## Starter prompt (paste into a fresh session)

> In the Typography Stylist plugin, add per-selection relative sizing and
> vertical shift for Fit-to-Width blocks (`fontSize: "fit"` on
> `typost/block`). New span attributes on `span.typost-styled`:
> `data-fitscale` (unitless factor, emitted as `font-size: Nem`) and
> `data-fitshift` (unitless em offset, emitted as `vertical-align: Nem`),
> applied via the QFT like the other per-selection properties.
>
> Scope and design constraints:
> - **Fit blocks only** (at least for the UI): the QFT shows the two new
>   controls where the disabled Font Size control sits when
>   `fontSize === 'fit'` — e.g. a "Relative size" slider (10–100%, step 5,
>   default 100 = no attribute) and a "Vertical shift" slider (± em, fine
>   steps, default 0 = no attribute). Reset buttons remove the attributes.
>   Decide (and note) whether the attributes should also *render* in
>   non-fit contexts if hand-authored — simplest is to emit the CSS
>   unconditionally and only gate the UI.
> - **Measurement must INCLUDE the scaled spans** — em sizes scale linearly
>   with the line, so the measured ratio stays valid. Do NOT strip
>   `data-fitscale` in `measureFitLines()` (edit.js) the way
>   `[data-fontsize]` is stripped, and do NOT neutralize it in the
>   `.typost-fit .typost-line [data-fontsize]` CSS rule (style.css) — keep
>   the two attributes strictly separate. Changing a scale re-measures
>   (content change already triggers the debounced measure).
> - **Nested scales multiply** (em compounds): 0.5 inside 0.5 renders at
>   0.25. Either prevent nesting of `data-fitscale` spans (the existing
>   `canCreateNestedSpan` / `updateSpanPropertyInPlace` machinery already
>   updates-in-place when the caret is inside a span with the same
>   property) or document the compounding. Prefer update-in-place.
> - **Vertical shift and line height interact**: a raised/shrunk glyph can
>   grow or shrink the visual line box. Check the fit line's rendered
>   height in editing view vs frontend (both use the same markup, so they
>   should agree — verify, don't assume). `vertical-align` does not affect
>   measured width; no measurement change needed for shift.
> - **Apply path**: reuse the standard three-tier applier pattern
>   (updateSpanPropertyInPlace / splitSpanAndApply /
>   applyOrMergeStyling + applyStylingSafeStringMethod fallback) exactly
>   like `applyLetterSpacingOnly` — both new properties are just
>   data-attr + style-declaration pairs, so `parseStyleString`/
>   `buildStyleString` and `mergeInsertionFormatAttributes` handle them
>   with at most small additions (check the merge's owned-keys list does
>   NOT swallow them — they should inherit like letterspacing does).
> - **Detection/controls sync**: extend `parseInlineStylesAtCursor` so the
>   sliders populate from the selection, and the QFT live-preview path
>   (`applyPreviewStyles`) previews both properties at true fit sizes —
>   the WYSIWYG editing view (RichText value-transform, see
>   `todo/feature-fit-wysiwyg-editing.md`) makes this free.
> - **Save format**: attributes + inline CSS on the span, zero frontend
>   JS, screen-reader heading untouched (visual-only adjustments). Non-fit
>   save output stays byte-identical (deprecated.js invariant).
> - Follow the repo workflow: pure logic in utils.js with Jest tests
>   (round-trip through wrapFitLines/unwrapFitLines included — the wrapped
>   editing value must carry the new spans verbatim); `npm test` +
>   `npm run build`; new strings → pot + fr/es (CRLF quirk — see memory)
>   and recompile .mo; changelog under the NEXT version, not 2.2.2.
> - Verify with Playwright on mnc4.local (admin/pass), post 367: shrink
>   the "&" to ~0.6 and shift it up ~0.3em; the line re-measures and
>   re-flushes to full width with the small raised ampersand; save →
>   reload → validates; frontend matches the editor at multiple viewport
>   widths (the linear-ratio claim is the thing to prove); ratios in
>   `fitLineSizes` change when a scale is applied (the line got narrower →
>   bigger ratio).

## Design notes / gotchas known in advance

- The em-linearity argument assumes everything inside the line scales with
  font-size. `data-letterspacing` already uses em ✓. `font-optical-sizing:
  none` is already forced on fit lines ✓ (size-dependent glyph widths would
  break linearity — same reason it's disabled for the line itself).
- A scaled span whose descender/ascender leaves the line box may clip
  nothing (overflow visible) but can look different against tight
  `line-height` values — the demo's line 1 has `data-lineheight="2.5"`;
  test with a tight line-height too.
- The QFT Font Size control's fit-mode help text ("Inline font sizes are
  ignored…") should point users to the new Relative size control.
- Undo: each slider commit is a `setAttributes` content change like every
  other QFT apply — nothing special needed; the measurement write is
  already marked not-persistent (2.2.2).
- Presets/style capture: decide whether `data-fitscale`/`data-fitshift`
  participate in style presets; they're selection-scoped, so probably not
  (matches how letterspacing spans are excluded today) — verify how preset
  capture treats unknown span attrs before assuming.
- The Glyphs panel's `swap` insertions (2.2.2) preserve non-owned inherited
  attrs via `mergeInsertionFormatAttributes` — a scaled/shifted glyph that
  gets swapped for an alternate should KEEP its scale/shift; add that case
  to the merge tests.

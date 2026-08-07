# Gap: Paragraph styles saved from a Fit-to-Width block (`fontSize: 'fit'`)

Status: **RESOLVED 2026-08-06 — Option B implemented** (fit is a first-class
style property). Decisions made with Matt: styles saved from fit blocks also
capture `fitMaxSize` (always stored, 0 = uncapped, so applies are
deterministic); the inline editor keeps `'fit'` in state but shows a disabled
"Fit to Width (blocks only)" dropdown option with explanatory help text, and
serializes span `data-fontsize` as `'responsive'` (explicit degrade — the
rendered value was already the fallback clamp). `generate_style_css()` now
emits the fallback clamp for `'fit'` (restoring the no-container-query
fallback that save.js skips under styleClass), the admin tab prints
"Fit to width (fallback X–Ypx)" instead of "fitpx", and `isStyleModified`
compares min/pref/max + fitMaxSize in fit mode. Jest coverage in
`paragraph-styles/__tests__/ps-utils.test.js`.

Original analysis below, kept for the record.

---

Found 2026-08-05 while triaging
PR review on the paragraph-styles bundling (feature/#164). Not a regression:
the standalone extension had the same behavior (masked by its broken apply
event). Nothing here blocks the #164 PR.

## The gap in one sentence

A paragraph style saved while a Typography Stylist block is in Fit-to-Width
mode stores `fontSize: 'fit'`, but the module's CSS generator and the apply
paths only half-understand that value, so such styles render and apply
inconsistently.

## How 'fit' gets into a style

1. Block is in fit mode → the QFT/inspector state provider answers the
   `typost_current_editor_state` filter with the block's raw attribute:
   `fontSize: 'fit'` plus `fontSizeMin/Preferred/Max` (edit.js ~line 559).
2. User clicks "Save Current Settings as Style" → `buildPropertiesFromState()`
   (paragraph-styles/assets/js/lib/ps-utils.js) keeps any non-`'inherit'`
   fontSize, so the stored properties are
   `{fontSize: 'fit', fontSizeMin: …, fontSizePreferred: …, fontSizeMax: …, …}`.

## What currently happens with that stored style

- **CSS generator** (`generate_style_css()` in
  paragraph-styles/paragraph-styles.php): emits `font-size` only for numeric
  values (added in PR review) and `'responsive'`. `'fit'` emits **no
  font-size rule** for `.typost-ps-{id}`.
- **Frontend, the block it was saved from:** with `styleClass` set, save.js
  outputs *only* `text-align` inline (save.js:61) — the fallback clamp that
  fit mode normally emits (save.js:107) is skipped. Modern browsers still
  look right because the per-line `span.typost-line` sizes (`calc(R*100cqi)`)
  are content-level, not block-style-level. **Browsers without container-query
  support lose the responsive fallback entirely** and render at inherited
  theme size.
- **Applying the style to another block (QFT/inspector source):** the apply
  handler sets `fontSize: 'fit'` as a block attribute (edit.js:383) — the
  target block is silently switched into fit mode and re-measures its own
  lines (`fitLineSizes` is deliberately not transferable, edit.js:387-389).
  Possibly surprising, possibly delightful; never designed.
- **Applying the style from the inline editor:** the inline handler treats
  any non-`'inherit'` fontSize as responsive (block-editor.js:1806-1812), so
  spans get `data-fontsize="fit"` plus a **responsive clamp** built from the
  stored min/preferred/max — i.e. 'fit' silently degrades to responsive
  inline.
- **Admin tab display:** the size line prints `sprintf('%spx', 'fit')` →
  "fitpx" (paragraph-styles/includes/admin-tab.php, size-display branch).

## Decision needed

Pick one of:

**A. Exclude fit from styles (recommended starting point).**
`buildPropertiesFromState()` drops `fontSize` when it is `'fit'` (keep
min/pref/max? probably drop those too unless mode is 'responsive'). Styles
then capture "everything but the fit sizing", which matches fit's design
premise that per-line sizes are content-specific (same reasoning that keeps
`fitLineSizes` out of the apply event). Cheap, honest, and the admin-tab
"fitpx" display fixes itself. Cost: a user who wants "my fit look as a
style" doesn't get the mode carried over.

**B. Make fit a first-class style property.**
Keep storing `'fit'`; teach `generate_style_css()` to emit the fallback
clamp for `'fit'` (mirroring save.js:107), teach the admin tab to label it
("Fit to width"), and document that applying such a style switches the
target block into fit mode (which the QFT/inspector path already does).
Decide what the inline editor should do — probably refuse/degrade
explicitly rather than the current silent responsive clamp. More work,
and 'fit' has no meaning for inline spans, so the style becomes
surface-dependent.

**C. Do nothing, document the limitation.**

## Where to look

- `paragraph-styles/assets/js/lib/ps-utils.js` — `buildPropertiesFromState`,
  `normalizeApplyProperties` (Option A lands here, with Jest tests in
  `paragraph-styles/__tests__/ps-utils.test.js`)
- `paragraph-styles/paragraph-styles.php` — `generate_style_css()` (Option B)
- `paragraph-styles/includes/admin-tab.php` — size display branch
- `blocks/typography-stylist/save.js:56-108` — styleClass vs fit fallback clamp
- `blocks/typography-stylist/edit.js:366-406` — apply handler; `:559` state provider
- `todo/archive/feature-fit-to-width-sizing.md` (archived design record) — fit-mode rationale

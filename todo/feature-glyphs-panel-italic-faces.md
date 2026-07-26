# Feature: Glyphs Panel italic-face browsing

Status: **not started** — starter prompt for the implementing session.
Written 2026-07-26, alongside the font-style (visual italic) controls that
shipped in the 2.2.0 batch.

## The gap

The Glyphs Panel resolves ONE font file per font entry (picked by weight in
`glyphs-panel/assets/js/lib/font-loader.js` `resolveFontFile()`), which
lands on the roman face. Kits with a separate italic file — EB Garamond's
swash italic capitals are the demo's showcase — have an entire glyph/feature
set the panel cannot browse. Feature previews already render italic (fixed
in 2.2.0: they respect `data-fontstyle`, `<em>`/`<i>`, and the block
fontStyle); the panel is the remaining italic-blind surface.

## Starter prompt

> In the Glyphs Panel (glyphs-panel/ module, hand-written ES5, no build
> step), add italic-face support:
>
> 1. Extend the font-file resolution (`resolveFontFile()` in
>    lib/font-loader.js) with a style dimension: for uploaded kits, pick
>    the face whose parsed font_faces entry has style 'italic' when
>    requested (fall back to roman when the kit has none); Adobe kits
>    match `font-style: italic` blocks in the Typekit CSS.
> 2. Add a Roman/Italic toggle to the modal toolbar
>    (glyphs-panel/assets/js/glyphs-modal.js), shown only when the font
>    actually has an italic face. Auto-default from the launch context:
>    the editor snapshot should carry the selection's font style (the QFT
>    state now exposes fontStyle via inlineStylesAtSelection; wire it into
>    the context object in glyphs-panel/assets/js/editor.js openModal()).
> 3. Cache metadata per (fontId, fileUrl) as today — the italic face is a
>    different fileUrl, so idb-cache.js needs no changes; verify the
>    cacheKey covers it.
> 4. Insertion: a glyph picked from the italic face must carry
>    `data-fontstyle="italic"` + `font-style: italic` in the insertion
>    payload (lib/insertion.js buildInsertionPayload gains a styleFace
>    option) so the inserted character renders with the face it was
>    browsed from; the 2.2.0 merge machinery already preserves it.
> 5. Respect the module constraints (glyphs-panel/CLAUDE.md): metadata
>    only, IndexedDB-only caching, text-rendered cells (cells get
>    font-style: italic so the browser serves the italic face). Bump
>    TYPOST_GP_VERSION (unbuilt scripts cache-bust on it). Jest tests in
>    glyphs-panel/__tests__/ for the payload + resolution logic; strings
>    use the typost-glyphs-panel text domain (own pot/fr/es catalogs, and
>    note the po files are CRLF).
>
> Verify on mnc4.local with EB Garamond installed as a font-only ZIP
> (google/fonts ofl/ebgaramond — roman + italic files in one kit): panel
> toggle appears, italic face shows the swash capitals under 'swsh', and
> inserting one lands an italic-styled span.

## Also parked here

- Full font-style (italic) control for the INLINE editor popover (core
  heading/paragraph blocks): the TS block has block-level + QFT controls
  as of 2.2.0; the inline editor only renders previews italic. Adding the
  control there follows the 2.2.0 pattern: state + `data-fontstyle` in
  `_doApplyFeatures` attrs, a 'fontStyle' pending key in
  `_buildPatchFromPending`, and a reader (`getActiveFontStyle`).

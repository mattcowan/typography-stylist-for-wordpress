# Glyphs Panel: italic face support

**STATUS: DONE (2026-07-27), design revised.** The original plan proposed a
Roman/Italic toggle in the panel toolbar; the shipped design is
**context-driven with no toggle** (per Matt's direction): the panel loads and
displays whatever face variant is actually rendering at the editor selection.

## What shipped (2.2.0 batch)

- `pickFaceForWeight(faces, weight, style)` in
  `glyphs-panel/assets/js/lib/font-loader.js` gained a style dimension:
  exact weight + requested style → requested style any weight → exact weight →
  first face. A wrong-style face is never preferred over a right-style one.
  Threaded through every source branch of `resolveFontFile()` (uploaded kits,
  Adobe stylesheet faces, WP Font Library file lists, manual @font-face
  discovery — the manual path now collects ALL matching rules and picks).
- Editor context: both state providers (`typost_current_editor_state`) expose
  `fontStyle` — the effective style at the selection (span `data-fontstyle`,
  an `<em>`/`<i>` ancestor, or the popover's live Font Style choice). The
  glyphs `editor.js` passes it as `context.fontStyle`; `glyphs-modal.js`
  threads it into `loadMetadata()` → `resolveFontFile()`.
- Grid cells and the detail-bar preview render with the context's
  `font-style`, so the italic face is what the author actually sees.
- Cache: face URLs differ per style, so `makeCacheKey(fontId, url)` already
  keeps per-face metadata entries separate — no cache change needed.
- Inline editor (core blocks) got the full Font Style control in the same
  batch (state, `data-fontstyle` in `_doApplyFeatures`, `fontStyle` pending
  key in `_buildPatchFromPending`, `getActiveFontStyle`/`getRenderedFontStyle`
  readers), closing the item previously parked here.
- `TYPOST_GP_VERSION` bumped (script cache-bust); style-picking covered in
  `glyphs-panel/__tests__/font-loader.test.js`.

## Still open (small follow-ups)

- Insertion payloads don't stamp `data-fontstyle` on inserted glyph spans —
  the glyph inherits the italic context it's inserted into, which is correct
  for same-context insertion; a cross-style insertion option (insert an
  italic glyph into roman text) would need a `styleFace` payload option and
  a UI affordance. No demand yet.
- Admin-tab glyph browser (`source: 'admin'`) has no selection context; it
  always browses the roman face. A style picker there (admin-only) would be
  reasonable if requested.

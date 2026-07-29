# Feature: True WYSIWYG editing for Fit-to-Width blocks (single view)

Status: **DONE 2026-07-29, shipping in 2.2.2** — implemented via an approach
none of the candidates below anticipated: the RichText **value transform**.
The stored `content` stays flat; `wrapFitLines()` feeds RichText a per-line
`span.typost-line`-wrapped value **with the `<br>` separators kept between
wrappers**, and `unwrapFitLines()` strips the wrappers in onChange. Keeping
the `<br>`s makes the rich-text record's text byte-identical to the flat
model, so every store selection offset and the whole QFT machinery work
unchanged — and because the editor is still RichText, the native toolbar
(Bold/Italic/Link), caret, IME, paste, undo, and WritingFlow all survive.
The wrappers render `display:inline` in the editing view (editor.css) so
the real `<br>`s do the line breaking; empty lines are never wrapped (a
zero-length span becomes an object-replacement character in the record).
The uniform-size editing surface (`computeFitEditingFontSize`) and the
deselected preview branch were removed. Verified end-to-end with Playwright
on mnc4 post 367 (typing/caret through re-measure, Enter/Backspace merges,
QFT line-height + letter-spacing on a line-3 selection, native bold, glyph
insertion, multi-line paste, undo, save→reload validation, empty-block
first-keystroke swap, cross-block arrow nav). IME composition was not
machine-testable — worth a quick manual check.

## What the user wants

When a Typography Stylist block is in Fit-to-Width mode (`fontSize: "fit"`),
editing should happen **in a single view that renders exactly like the
frontend**: each visual line at its own measured `calc(R * 100cqi)` size.
Concrete scenario that must work: *select text in the bottom line and adjust
its line-height via the Quick Feature Toggles while the middle line renders
huge at full block width* — see the change live, in place, no mode-flipping.

What ships today (2.2.2 staged) and is NOT good enough: the exact per-line
poster preview renders only while the block is **deselected**; selecting the
block swaps in a flat RichText where all lines render at a uniform fitted
size (`computeFitEditingFontSize()` — smallest ratio so the longest line
spans the width and nothing wraps). Line structure survives, but the poster
effect vanishes exactly when you're working on it.

## Starter prompt (paste into a fresh session)

> In the Typography Stylist plugin, make editing a Fit-to-Width block
> (`fontSize: "fit"` on `typost/block`) fully WYSIWYG in a single view: while
> the block is selected and being edited, each visual line renders at its own
> per-line fit size (`calc(R * 100cqi)`, ratios in the `fitLineSizes`
> attribute), exactly like the deselected preview and the frontend.
>
> **The suggested path — but explore alternatives first.** The previous
> session's analysis (below) landed on a custom fit-aware contenteditable as
> the most promising route, but that conclusion was reached under time
> pressure and MUST be re-derived: think about this from several angles,
> sketch at least two or three genuinely different approaches, compare them
> on effort, regression risk, and how well they preserve existing editor
> machinery, and only then commit. Present the comparison and your pick
> before implementing. Candidate avenues known so far (add your own):
>
> 1. **Custom fit-aware editable (previous session's lean).** In fit mode,
>    replace the `<RichText>` with a contenteditable element rendering the
>    real per-line markup (`buildFitLinesHtml(content, fitLineSizes,
>    fitMaxSize)` — `span.typost-line` wrappers around the untouched inner
>    spans). On input, serialize the DOM back to the flat `<br>`-separated
>    `content` (strip the wrappers; utils has `splitContentIntoLines()` for
>    the other direction). Sync the DOM selection to the block-editor store
>    via `dispatch('core/block-editor').selectionChange(clientId, 'content',
>    start, end)` with offsets computed by the same convention as
>    `buildTextOffsetMap()` (text nodes accumulate; each line boundary
>    counts as 1, exactly like the `<br>` it replaces) — then the ENTIRE
>    existing QFT machinery (`resolveQftApplyRange`, all
>    `applyInline*` functions, capturedSelection) works against the
>    unchanged br-model content without modification. Hard parts to solve
>    honestly: caret preservation across React re-renders (only re-render
>    innerHTML from `content` when the editable is NOT focused, or after
>    external changes like QFT applies, restoring the caret from stored
>    offsets); Enter/Shift+Enter (insert a line break, re-normalize into
>    wrappers on the next sync); paste (intercept, sanitize to plain text or
>    inline-span-preserving HTML); IME (sync on `compositionend` only); undo
>    (debounce `setAttributes` so the editor's undo stack gets sane steps).
> 2. **RichText `multiline` content model.** RichText with a per-line
>    element (`multiline` prop) would give real per-line DOM elements that
>    CSS `:nth-child` could size, keeping ALL of RichText's caret/undo/IME
>    machinery. Concerns that killed it last time — verify rather than
>    assume: the `multiline` prop is on a deprecation path in Gutenberg;
>    block-valid tags inside an h1 are limited (span-with-display:block
>    might be viable where `<p>` is not); it changes the stored content
>    model in fit mode (br-model ↔ line-element-model conversions on every
>    mode switch), and every offset consumer (`buildTextOffsetMap` counts
>    `<br>` as 1) would need the line-boundary convention mapped.
> 3. **Wrappers in the live DOM only, fighting React.** Post-render DOM
>    manipulation of RichText's internal tree to wrap lines. Previous
>    session judged this doomed (controlled contenteditable absorbs or
>    clobbers foreign elements into the value) — confirm or refute quickly
>    before discarding.
> 4. **Anything else you can think of** — e.g. CSS tricks re-examined
>    (`::first-line` generalizations, custom highlight API limits), an
>    overlay/mirror editor, per-line sub-RichTexts (one RichText per line,
>    content split/joined at the block level — check what that does to
>    cross-line selections, Enter/Backspace at boundaries, and the QFT's
>    single-content offset model).
>
> Non-negotiable constraints:
> - **Sandbox to fit mode.** Non-fit blocks must render and edit exactly as
>   today — byte-identical save output, untouched code paths wherever
>   possible. No plugin-wide refactors.
> - **The stored content model does not change** unless the comparison
>   proves a change is strictly better AND mode-switch conversions are
>   lossless both ways (undo-safe, validation-safe). The save format
>   (typost-line wrappers, save.js) and the frontend's zero-JS guarantee are
>   fixed.
> - **QFT must keep working in fit mode** — per-selection font, weight,
>   features, letter-spacing, line-height on selections inside the fit
>   block. This is the user's headline scenario (line-height on one line
>   while another renders full-width). If an approach degrades any QFT
>   path, that's a comparison criterion, not a footnote.
> - **Measurement stays authoritative**: the `measureFitLines()` effect in
>   edit.js re-measures on content/font changes (debounced, skip-when-equal)
>   and writes `fitLineSizes`; the editable view must re-render line sizes
>   when ratios change without fighting the caret.
> - **Accessibility**: the editable is the block's text — do not clobber its
>   accessible name/role; keyboard editing (arrows across line boundaries,
>   Home/End, select-all) must behave like normal text.
> - `font-optical-sizing: none` applies to fit lines (see style.css comment
>   — auto optical sizing breaks the linear width-per-size assumption the
>   stored ratios depend on); the editing view needs the same rule or sizes
>   will lie.
>
> Follow the repo workflow: pure logic (DOM↔content serialization, offset
> mapping, caret save/restore math) as exported functions in
> `blocks/typography-stylist/utils.js` with Jest tests; run `npm test` and
> `npm run build`; new user-facing strings (if any) to the pot + fr/es
> catalogs (CRLF quirk — see memory) and recompile .mo; extend the existing
> `= 2.2.2 =` changelog entries (both changelog.txt and the readme.txt
> summary) — do NOT bump versions, 2.2.2 is already staged everywhere.
> Verify with Playwright on mnc4.local (admin/pass): post 367 is a published
> fit-to-width demo (3 lines: Fraunces / Style Script with aalt alternates /
> Fraunces, `fitLineSizes` baked). Verification must include: typing in each
> line at its true size; caret behavior across line boundaries; QFT
> line-height applied to a selection in line 3 while line 2 renders
> full-width; a QFT font change on a partial selection; undo after typing;
> paste; save → reload → block validates (no "Attempt recovery"); the
> deselected preview and frontend unchanged.

## Design notes / gotchas discovered in advance

- **Why the flat RichText can't do it:** lines between `<br>`s aren't
  elements; CSS cannot size a text range; per-line sizing requires wrapper
  elements, which can't live in the stored content without breaking the
  selection-offset machinery every QFT feature depends on
  (`buildTextOffsetMap` treats each `<br>` as offset 1 — that convention is
  load-bearing across utils.js and edit.js).
- **The offset bridge is the crux of approach 1.** If the editable's
  selection reporting speaks the br-model offset convention, nothing else in
  the plugin needs to know the DOM has wrappers. Get that one seam right and
  the blast radius stays small — which is exactly the sandboxing the user
  asked for.
- **QFT capture flow:** `handleToolbarClick` captures the store selection
  when the popover opens (`capturedSelection`), because the popover steals
  focus and collapses the live selection. Whatever editable replaces
  RichText must have populated the store BEFORE that capture (sync on the
  editable's `selectionchange`/`focusout`, not lazily).
- **External content changes while editing:** QFT applies rewrite `content`
  (`setAttributes({content})`) while focus is in the popover. The editable
  must re-render from the new content (its DOM is stale) and ideally restore
  the captured selection so consecutive QFT tweaks keep working — mirror how
  the current RichText + capturedSelection flow behaves.
- **Empty/new blocks:** a fit block with empty content has no ratios and
  nothing to wrap — falls back to plain RichText until there's content and a
  measurement (`computeFitEditingFontSize` returns '' → today's clamp
  fallback path). Keep that.
- **`fitLineSizes` staleness while typing:** ratios update ~300ms after
  edits; between keystrokes the current line's width is briefly wrong
  (line no longer exactly flush). That's inherent and fine — do not try to
  re-measure synchronously per keystroke.
- **Previous attempts for context** (both superseded): a two-click
  "select first, click again to edit" gate was built and reverted (user
  wants single-click editing); a dual preview-above-editor render was
  started and rejected as awkward. Don't resurrect either without cause.
- The current fit editing surface (uniform size via
  `computeFitEditingFontSize` + `.typost-fit-editing` container class in
  editor.css) becomes dead code if a true WYSIWYG editable lands — remove it
  (and its tests' obsolete assertions) rather than leaving both paths.
- **2.2.2 release prep is staged in the working tree** (version bumps,
  changelog promotion, readme changelog + upgrade notice). Everything is
  uncommitted; the user commits manually. Coordinate additions into the
  existing entries.

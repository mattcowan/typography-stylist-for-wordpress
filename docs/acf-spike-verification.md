# §9 — Live verification addendum (2026-08-12)

This file extends [acf-integration-extension.md](acf-integration-extension.md) with the
results of the live spike that the original study (§8) said needed a real ACF install.
Run on mnc4: ACF Pro **6.8.7**, WP 7.0.2, Typography Stylist 2.3.0-dev, spike block
`bgcandy/typost-acf-spike` in the `backgroundcandy-child` theme (temporary, uncommitted).

## Verdict

**Path A (§3) works end to end. No extension will be built.** The field-type extension
(§4/§7) stays shelved unless typography is ever needed in non-block ACF templates
(`the_field()` in PHP templates, options pages, term forms).

## Verified in the editor

- `typost/block` inserts inside the ACF block's `<InnerBlocks>`; `allowedBlocks` is
  enforced (typost/heading/paragraph yes, image no); template auto-population works.
- The full editing surface renders for the nested block: Quick Feature Toggles, Glyphs
  and Paragraph Styles toolbar buttons, every inspector panel including Variable Font
  Axes. RichText fully editable inside the ACF preview; font CSS variables are defined
  in the editor-canvas iframe (Fraunces rendered).
- ACF's own inline text editing (a `text` field) arms beside the typost block — the two
  editing models coexist in one ACF block.
- Save → reload: all blocks re-validate, attributes round-trip, no console errors.

## Verified on the frontend (unauthenticated fetch)

- Dual-heading accessibility markup emitted intact inside the ACF block output.
- `--font-36: var(--wp--preset--font-family--fraunces, "Fraunces")` + the plugin's
  Fraunces `@font-face` printed — **§2.3/§8.5 confirmed empirically**: `do_blocks()`
  detection sees fonts used only inside ACF blocks. No plugin changes needed.

## Quirks (none blocking)

1. `canInsertBlockType()` reports false for the InnerBlocks region until ACF's async
   preview render mounts the component. Invisible to humans; matters only to
   scripts/tests probing the store synchronously after insertion.
2. block.json-registered ACF blocks default to `blockVersion` **2**; ACF's inline
   editing functions return `''` unless `"acf": { "blockVersion": 3 }` is set.
   InnerBlocks works on either version.
3. ACF 6.8.7 sets `acf_doing_block_preview` unconditionally on the blockVersion-3
   render path (pro/blocks.php:963), so inline-editing data attributes leak into
   frontend markup unless the template guards the call with `$is_preview`. ACF
   behavior, not ours; harmless but untidy.

## §8 scorecard

Q5 (frontend @font-face through InnerBlocks): **confirmed**. Q1 (custom field type in
the toolbar popover): **likely yes** from source — `acf_inline_toolbar_editing_attrs()`
has no field-type allowlist, only width/expanded-editor filters — but not exercised
live. Q2–Q4: moot while the field type is shelved.

# Follow-up: inline font apply leaves legacy `data-font` attribute stale

Status: **RESOLVED 2026-08-06.** Investigation found the inline editor half
was already fixed (both write paths in `assets/js/block-editor.js` —
`_buildPatchFromPending` and `_doApplyFeatures` — write/clear `data-font`
alongside `data-font-id`, landed with the preview-resolution fix). The
still-open half was the Typography Stylist block's QFT font apply, which
passes only `data-font-id`. Fixed in the shared span helpers in
`blocks/typography-stylist/utils.js`: `mergeTypostSpanStyling`,
`updateSpanPropertyInPlace`, and `splitSpanAndApply` now remove a legacy
`data-font` on an actual font CHANGE (differing `data-font-id`), mirroring
the existing variation-settings invalidation. Same-font re-applies and
non-font applies preserve it — Glyphs Panel cross-font spans deliberately
carry raw `data-font` family names and must survive e.g. line-height applies.
Readers (`getActiveFont()` preview resolution, PHP font detection) fall back
to `data-font-id` cleanly. Jest coverage in `mergeTypostSpanStyling.test.js`
and `updateSpanPropertyInPlace.test.js`.

Original note below, kept for the record.

---

The inline editor's font apply sets only `data-font-id`, leaving any legacy
`data-font` family-name attribute stale on the span. Cosmetic metadata
inconsistency — display is unaffected (rendering keys off `data-font-id` /
`var(--font-N)`), but the stale family name can mislead anyone reading the
markup or future code that trusts `data-font`.

Fix sketch: when the inline apply path writes `data-font-id`, either update
`data-font` to the new family name or (probably better) delete it — grep for
remaining `data-font` readers first to confirm nothing depends on it.

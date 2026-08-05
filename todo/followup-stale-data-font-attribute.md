# Follow-up: inline font apply leaves legacy `data-font` attribute stale

Status: **open, low priority.** Extracted from the archived
`refactor-style-string-helpers.md` (its one parked follow-up) so the
archive holds only completed work.

The inline editor's font apply sets only `data-font-id`, leaving any legacy
`data-font` family-name attribute stale on the span. Cosmetic metadata
inconsistency — display is unaffected (rendering keys off `data-font-id` /
`var(--font-N)`), but the stale family name can mislead anyone reading the
markup or future code that trusts `data-font`.

Fix sketch: when the inline apply path writes `data-font-id`, either update
`data-font` to the new family name or (probably better) delete it — grep for
remaining `data-font` readers first to confirm nothing depends on it.

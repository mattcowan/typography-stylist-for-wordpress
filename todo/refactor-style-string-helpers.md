# Refactor: Extract `parseStyleString` / `buildStyleString` Helpers

> **STATUS: DONE (2026-07-26), expanded beyond this doc's scope.** The
> canonical helpers exist in `blocks/typography-stylist/utils.js` and every
> live parse/build site is migrated EXCEPT save.js (deliberately kept inline —
> save output must stay byte-stable for block validation; see the comment
> there). The real payoff went further than this doc anticipated: the two
> duplicated entire-span merge blocks were unified into
> `mergeTypostSpanStyling()` (fixing raw-indexed-alternate wipes and stale
> variation settings once, in one place), QFT appliers gained a shared
> selection resolver (`resolveQftApplyRange`), and the max-3 nesting rule is
> now enforced by `canCreateNestedSpan()` on every wrap path. Coverage:
> styleString.test.js, mergeTypostSpanStyling.test.js,
> resolveQftApplyRange.test.js.
>
> Remaining follow-up parked here: the inline editor's font apply sets only
> `data-font-id`, leaving any legacy `data-font` family-name attribute stale
> on the span (cosmetic metadata inconsistency; display is unaffected).



## Problem

The pattern for parsing CSS style strings into objects and building them back appears 7+ times across `blocks/typography-stylist/utils.js`:

```js
// Parse (7 sites)
existingStyle.split(';').forEach(rule => {
    const [prop, val] = rule.split(':').map(s => s.trim());
    if (prop && val) styleObj[prop] = val;
});

// Build (5 sites)
Object.entries(styleObj).map(([p, v]) => `${p}: ${v}`).join('; ');
```

## Proposed Functions

```js
/**
 * Parse a CSS style string into a property-value object.
 * @param {string} styleString - CSS style string (e.g., "font-size: 20px; font-weight: 700")
 * @return {Object} Property-value map (e.g., { 'font-size': '20px', 'font-weight': '700' })
 */
export function parseStyleString(styleString) { ... }

/**
 * Build a CSS style string from a property-value object.
 * @param {Object} styleObj - Property-value map
 * @return {string} CSS style string
 */
export function buildStyleString(styleObj) { ... }
```

## Affected Call Sites

### Parse sites (`split(';')` pattern)

| Line | Function | Notes |
|------|----------|-------|
| ~591 | `updateSpanPropertyInPlace` | Standard usage |
| ~692 | `splitSpanAndApply` | Parses parent span styles |
| ~700 | `splitSpanAndApply` | Parses new style string |
| ~932 | `applyOrMergeStyling` | Parses existing span styles |
| ~950 | `applyOrMergeStyling` | Parses new style string |
| ~1160 | `applyStylingSafeStringMethod` | Parses existing span styles |
| ~1177 | `applyStylingSafeStringMethod` | Parses new style string |
| ~1596 | `removeSpanProperty` | **Variation:** filters out a specific property during parse. Keep filter in caller: `delete result[styleProperty]` |

### Build sites (`.join('; ')` pattern)

| Line | Function |
|------|----------|
| ~596 | `updateSpanPropertyInPlace` |
| ~705 | `splitSpanAndApply` |
| ~984 | `applyOrMergeStyling` |
| ~1210 | `applyStylingSafeStringMethod` |
| ~1607 | `removeSpanProperty` |

## Gotcha: Line ~1596 Variation

One call site filters out a property during parsing:

```js
if (prop && value && prop !== styleProperty) { ... }
```

The extracted `parseStyleString` must return **all** properties. The caller handles removal:

```js
const styleObj = parseStyleString(currentStyle);
delete styleObj[styleProperty];
```

## Test Plan

### `parseStyleString` Tests

```js
describe('parseStyleString', () => {
    // Basic parsing
    it('should parse single property');
    it('should parse multiple properties');

    // Whitespace handling
    it('should handle no spaces around colon');
    it('should handle extra whitespace');
    it('should handle trailing semicolon');

    // Plugin-specific CSS values
    it('should parse font-feature-settings with multiple features');
    //   "font-feature-settings: \"ss01\" 1, \"ss02\" 1"
    //   split(':') produces ['font-feature-settings', ' "ss01" 1, "ss02" 1']
    //   Safe because font-feature-settings values don't contain colons.
    it('should parse font-family with CSS variable: var(--font-12)');
    it('should parse a full Typography Stylist style string');

    // Edge cases
    it('should return empty object for empty string');
    it('should return empty object for null/undefined');
    it('should skip malformed rules with no colon');
    it('should include all properties without filtering');
});
```

### `buildStyleString` Tests

```js
describe('buildStyleString', () => {
    it('should build single property');
    it('should build multiple properties separated by "; "');
    it('should handle empty object');

    // Round-trip stability
    it('should round-trip through parse then build');
    it('should round-trip font-feature-settings');
});
```

### Verification After Implementation

1. `npm test` -- all existing 271+ tests must still pass (they exercise style parsing indirectly)
2. Add the new unit tests above
3. `npm run build`
4. `npm test` again post-build

## Risk Assessment

**Low risk.** The parse/build logic is identical across all call sites with one documented exception (the filter at line ~1596). Existing integration tests in `applyStylingSafeStringMethod.test.js`, `splitSpanAndApply.test.js`, `updateSpanPropertyInPlace.test.js`, and `parseInlineStylesAtCursor.test.js` all exercise style parsing indirectly and will catch regressions.

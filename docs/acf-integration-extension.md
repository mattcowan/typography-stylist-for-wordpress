# Typography Stylist × Advanced Custom Fields — integration study

**Status:** design only. No code has been written. Nothing in this document has been
built or shipped.

**What was asked:** ACF has frontend/inline editing for ACF block fields — could an
extension hook into that so a Typography Stylist headline can live inside an ACF block
layout?

**Short answer:** partly, and the useful part needs no extension at all. The inline
toolbar can *never* appear inside ACF's inline editing (§2.1 explains why — it is a
hard architectural incompatibility, not a missing feature). But putting a real
Typography Stylist block inside an ACF block layout already works today via
`InnerBlocks`, and it is a one-line change to the ACF block template (§3). The genuine
extension opportunity is a **Typography Stylist ACF field type** (§4) for ACF-driven
templates that are not blocks at all.

---

## 1. What was verified, and how

Read from source rather than documentation, on 2026-08-09:

| Thing | Version | Where |
| --- | --- | --- |
| Advanced Custom Fields **Pro** | 6.8.1 | `Local Sites/loopchicago/.../advanced-custom-fields-pro` |
| WordPress | 7.0.2 | `wp-includes/js/dist/block-editor.js` |
| Typography Stylist | 2.3.0-dev | this repo |

ACF is **not installed** on the mnc4 development site, so nothing below has been
exercised in a browser. Every claim about ACF is from reading its PHP and its built
JS bundle; every claim about Typography Stylist is from this codebase. Items that
still need live confirmation are collected in §8.

---

## 2. Findings

### 2.1 ACF inline editing is `contenteditable`, not `RichText` — this is the blocker

`acf_inline_text_editing_attrs()` (`pro/blocks.php:2133`) emits:

```html
data-acf-inline-contenteditable="1"
data-acf-inline-contenteditable-field-slug="my_field"
data-acf-placeholder="Type to edit..."
```

and the editor-side handler in `assets/build/js/pro/acf-pro-blocks.min.js` responds by
setting `contentEditable = true` on the rendered element, but **only when the named
field is of type `text` or `textarea`**:

```js
(a ? a.filter(t => t.name === e && ("text" === t.type || "textarea" === t.type)) : []).length > 0
  ? (l.contentEditable = !0, l.suppressContentEditableWarning = !0, l.role = "input", ...)
```

Probing that bundle for the WordPress rich-text stack returns nothing:

| Symbol | Present in ACF blocks JS |
| --- | --- |
| `contentEditable` | yes |
| `RichText` / `richText` / `wp.richText` | **absent** |
| `allowedFormats` | **absent** |
| `execCommand` | absent |

This matters because Typography Stylist's inline editor is a **format type**:
`registerFormatType('typost/features', …)` in `assets/js/block-editor.js`, rendered
through `BlockControls` → `ToolbarGroup`. The format API only exists inside a
`RichText` component. A bare `contentEditable` div has no format registry, no toolbar
slot, and no rich-text value — so the "T" toolbar button cannot be made to appear
there by any hook, ours or ACF's.

The second consequence is about storage. Those two field types hold **plain text**.
Typography Stylist's whole output format is
`<span class="typost-styled" data-features="…" style="…">`. Even if markup could be
typed into the field, ACF escapes `text`/`textarea` values on output, so the spans
would render as visible angle brackets rather than styling.

> **Verdict:** ACF inline text editing is a dead end for the inline format toolbar.
> Do not design around it. The other ACF inline mode (`acf_inline_toolbar_editing_attrs()`,
> `pro/blocks.php:1993`) opens a popover containing ACF's own field UI — which *is* a
> place a custom ACF field type can render (§4).

### 2.2 The ACF WYSIWYG field is TinyMCE, not Gutenberg

An ACF `wysiwyg` field is `wp_editor()` — TinyMCE. It shares no code with
`@wordpress/rich-text`. Supporting OpenType features there would mean writing a
**second, parallel implementation** of the feature set as a TinyMCE plugin: a custom
toolbar button, a format applier, and its own font picker. None of the existing
`assets/js/block-editor.js` code is reusable. It would also need its own serialization
guard, since TinyMCE's cleanup can strip unknown attributes such as `data-features`.

> **Verdict:** technically possible, disproportionately expensive, and a permanent
> maintenance fork of the feature. Recommend against unless a client specifically pays
> for WYSIWYG-field typography.

### 2.3 ACF blocks are ordinary dynamic blocks, and their output *is* already scanned

ACF blocks are registered from `block.json` with an `acf` key and rendered server-side
from a PHP template. Their field values are serialized into the block delimiter in
`post_content` — **not** postmeta (ACF's own "Key Concepts" page states this, and it
follows from them being blocks).

That has a happy consequence for font loading. Detection in
`render_content_for_detection()` ([typography-stylist.php:435](../typography-stylist.php#L435))
runs `do_blocks($content)`, which invokes ACF's render callback, so **anything an ACF
block template prints — including `var(--font-N)` and `typost-styled` — is visible to
`has_styled_content()` and `get_used_fonts_in_content()`.** ACF-block-rendered
typography needs no special font-detection support.

The gap is elsewhere: **classic ACF field groups on a post store values in postmeta**,
which detection never reads. See §5.

### 2.4 `InnerBlocks` inside an ACF block already accepts `typost/block`

`pro/blocks.php:1024` parses `<InnerBlocks … />` out of the block template
(`preg_replace('/<InnerBlocks([\S\s]*?)\/>/', …)`), substituting rendered inner content
on the front end; in the editor the template is parsed as JSX (`supports.jsx`, true by
default in ACF Blocks v2+) so a genuine `<InnerBlocks>` React component mounts with
whatever props the template wrote — including `allowedBlocks` and `template`.

This is the same mechanism as any core container block, and it is subject to the same
rule this release just made visible: **a container that sets `allowedBlocks` and omits
`typost/block` will refuse the block, and refuse the inline editor's Convert action.**

---

## 3. Path A — the one to take first (no extension required)

For "a Typography Stylist headline inside an ACF block layout", the answer is to let
the ACF block's `InnerBlocks` region accept it:

```php
<?php // my-acf-block/template.php ?>
<section class="my-hero">
    <InnerBlocks
        allowedBlocks="<?php echo esc_attr( wp_json_encode( array( 'typost/block', 'core/paragraph' ) ) ); ?>"
        template="<?php echo esc_attr( wp_json_encode( array( array( 'typost/block', array( 'tagName' => 'h2' ) ) ) ) ); ?>"
    />
    <p class="my-hero__kicker"><?php the_field( 'kicker' ); ?></p>
</section>
```

The author then gets the whole Typography Stylist block — sidebar controls, Quick
Feature Toggles, glyph panel, fit-to-width, the accessible dual-heading markup — inside
the ACF layout, with the ACF fields handling everything around it. Font detection
already works (§2.3), and no plugin code changes.

**Cost:** one template edit per ACF block. **Benefit:** everything, immediately.

This is worth documenting in the plugin README as the supported ACF story regardless of
whether the extension in §4 is ever built.

---

## 4. Path B — the extension worth building: a Typography Stylist ACF field type

The case Path A does **not** cover: templates that are not blocks. A theme that renders
`the_field('hero_headline')` in `front-page.php`, an options page, a CPT with a classic
field group. Those authors have no block editor at the point of authoring.

### Shape

A separate plugin, `typography-stylist-acf`, following the same module conventions as
the bundled Glyphs Panel and Variable Fonts modules:

- `final class Typost_ACF` behind a `! class_exists()` guard
- own text domain `typography-stylist-acf` + `languages/`
- pure logic in a plain module with Jest tests
- consumes only core's **public** extension API (HOOKS.md), never internals
- hard requirement checks: bail with an admin notice unless both `class_exists('ACF')`
  and `class_exists('Typost')`

### The field type

Register `typost_headline` via `acf_register_field_type()`. It stores a **structured
array**, not a string:

```php
array(
    'content'   => 'Headlines should give you Butterflies', // HTML, may contain typost-styled spans
    'tagName'   => 'h2',
    'fontId'    => 36,
    'features'  => array( 'swsh', 'ss01' ),
    'fontSize'  => 'responsive',
    'fontSizeMin' => 16, 'fontSizePreferred' => 32, 'fontSizeMax' => 64,
    'letterSpacing' => 0,
    'styleClass'  => 'typost-ps-3', // paragraph style, when one is applied
)
```

Storing the block's attribute vocabulary verbatim is the important decision: it means
the field, the block, and any Paragraph Style speak one language, and a render helper
can reuse the block's save-time markup rules rather than reimplementing them.

### The field UI

Two honest options, and the choice is the main open design question:

1. **Reuse the block editor's React controls** by mounting them into the ACF field's
   DOM. Highest fidelity, but ACF field UIs are jQuery-driven and ACF renders fields in
   contexts where `wp-block-editor` is not enqueued (options pages, term forms). Would
   need the plugin's controls extracted from block-editor coupling first — see §5.
2. **A dedicated, simpler field UI** — font picker, feature checkboxes, size controls,
   and a live preview — built with the plugin's existing REST endpoints
   (`/typost/v1/fonts`, `/adobe-fonts`, `/manual-fonts`, `/presets`) and its admin CSS.
   Lower fidelity (no inline per-selection styling), far less coupling, works anywhere
   ACF renders. **Recommended for a first version.**

Option 2 deliberately gives up per-selection inline styling. That is the right trade:
the whole point of an ACF field is a fixed, template-driven headline, and the users who
need letter-by-letter control should be using Path A.

### The render helper

```php
typost_acf_field( 'hero_headline' );          // echo
$html = typost_acf_get_field( 'hero_headline' ); // return
```

It must produce the same markup contract as the block's `save.js`, including the
accessible dual-content pattern (visually-hidden semantic heading + `aria-hidden`
styled copy) — otherwise the extension quietly reintroduces the accessibility problem
the block exists to solve.

---

## 5. Core seams — what already exists, what an extension would need

### Already present, no core work needed

| Seam | Notes |
| --- | --- |
| `typost_force_enqueue_font_ids` (PHP filter, 2.1+) | The load-bearing one. Lets the extension declare "font 36 is used on this page" for fonts referenced only from postmeta, which content scanning cannot see. Documented in HOOKS.md. |
| `typost_editor_data` (PHP filter) | Injects extension data into `typostData`. |
| `typost_admin_tabs` / `typost_admin_tab_content_{id}` | For a settings tab, if one is wanted. |
| `typost_cache_clear` (action) | Clear extension caches alongside core's. |
| REST endpoints under `typost/v1` | Fonts, presets, paragraph styles — all `edit_posts`-gated and directly usable by a field UI. |
| `get_custom_fonts()` / `get_adobe_fonts()` / `get_manual_fonts()` | The public font API the Paragraph Styles module already uses. |
| `do_blocks()` in detection | Makes ACF *block* output automatically detectable (§2.3). |

### Would need adding to core — none of it built

1. **A markup builder the extension can call.** Today the "how to render a styled
   headline" logic lives in `blocks/typography-stylist/save.js` — JavaScript, inside
   the block build. A PHP renderer that takes the attribute array and returns the
   markup (including the dual-heading accessibility pattern and the `fontSize`/`fit`
   branches) is the single biggest missing piece. Without it, every consumer
   reimplements the contract and they drift. This would also be reusable by core's own
   future server-side rendering.
   *Suggested:* `Typost::render_styled_markup( array $attributes ): string`, plus a
   `typost_styled_markup` filter.

2. **A content-source filter for font detection.** `typost_force_enqueue_font_ids`
   answers "load this font" but not "here is more content to scan", so an extension
   must resolve font IDs itself by parsing its own values. A filter that contributes
   additional strings into `has_styled_content()` / `get_used_fonts_in_content()` would
   let ACF field values ride the existing detection and caching.
   *Suggested:* `typost_additional_content_sources` (array of strings, per queried
   object), applied inside both detection paths and included in the transient cache key.

3. **Decoupled field-picker controls.** Only needed if the field UI takes Option 1 in
   §4. The font picker already has a shared, testable core in
   `assets/js/font-options.js` (`buildFontOptions()`), which is a good precedent; the
   feature-toggle and size controls do not yet have an equivalent.

4. **Nothing for the Enter key or convert capability.** Those are block-editor concerns
   and do not apply to an ACF field.

**Assumption to flag:** items 1 and 2 are judged from this codebase's structure, not
from a built prototype. If the extension takes the "simple field UI" route, item 1 is
required and item 2 is a strong convenience; item 3 can be skipped entirely.

---

## 6. What this should *not* try to do

- **Hook the Typography Stylist toolbar into ACF inline editing.** §2.1 — impossible,
  not merely hard.
- **Store Typography Stylist markup in an ACF `text`/`textarea` field.** Escaped on
  output; the spans would be visible as literal text.
- **Reimplement the plugin's inline styling for TinyMCE.** §2.2 — a maintenance fork.
- **Reach into `Typost` internals.** The bundled modules consume the public API only;
  an external extension must hold to the same line or it breaks on every release.

---

## 7. Build prompt

Paste this into a fresh session when the extension is ready to be built. It assumes the
reader has this document available.

> Build a WordPress plugin called **Typography Stylist for ACF**
> (`typography-stylist-acf`) that adds a Typography Stylist field type to Advanced
> Custom Fields. Read `docs/acf-integration-extension.md` in the Typography Stylist
> repo first — it contains the verified findings this design rests on, in particular
> §2.1 (ACF inline editing is `contenteditable`, not `RichText`, so the inline format
> toolbar cannot be hooked into it — do not attempt it) and §5 (which core seams exist
> and which do not).
>
> **Scope for v1:**
>
> 1. Register an ACF field type `typost_headline` via `acf_register_field_type()`,
>    storing the structured attribute array in §4 — the same attribute vocabulary as
>    the `typost/block` block, so the field, the block, and Paragraph Styles stay
>    interchangeable.
> 2. Build the field UI as a **standalone control set** (Option 2 in §4), not by
>    mounting block-editor React components: a font picker, OpenType feature toggles
>    grouped by category, tag name, size mode (inherit / responsive / fixed), letter
>    spacing, and a live preview rendering in the selected font. Source its data from
>    the plugin's REST endpoints under `typost/v1` and its public PHP font API
>    (`get_custom_fonts()`, `get_adobe_fonts()`, `get_manual_fonts()`, plus adopted WP
>    Library fonts). It must work in every context ACF renders a field — post edit
>    screens, options pages, term forms — so do not depend on `wp-block-editor` being
>    enqueued.
> 3. Provide `typost_acf_field( $selector )` and `typost_acf_get_field( $selector )`
>    render helpers. Their output must match the block's save-time markup contract,
>    **including the dual-content accessibility pattern** (visually-hidden semantic
>    heading plus `aria-hidden` styled copy) and the configured screen-reader class.
>    If core has by then gained `Typost::render_styled_markup()` (§5.1), call it instead
>    of duplicating the rules.
> 4. Make fonts load on the front end. Field values live in postmeta, which the
>    plugin's content scanning never reads, so collect the font IDs used by every
>    Typography Stylist field on the queried object and return them through the
>    `typost_force_enqueue_font_ids` filter. Cache that lookup per post and clear it on
>    `save_post` and on `typost_cache_clear`.
> 5. Add a `README.md` documenting the InnerBlocks approach (§3) as the recommended
>    route for ACF *blocks*, so users are not pushed toward the field type when the
>    block would serve them better.
>
> **Constraints:**
>
> - Separate plugin. Consume only Typography Stylist's public extension API as
>   documented in `HOOKS.md`; never call internals.
> - `final class Typost_ACF` behind a `! class_exists()` guard; constants behind
>   `! defined()`; own text domain `typography-stylist-acf` with a `languages/`
>   directory; every user-facing string translated.
> - Deactivate gracefully with an admin notice if either ACF or Typography Stylist is
>   missing — never fatal.
> - No `console.log` and no `error_log` in shipped code (WordPress.org plugin rules).
> - Sanitize on save and escape on output; the stored `content` is HTML, so run it
>   through `wp_kses` with an allowlist that permits `span` with `class`, `style`, and
>   the `data-*` attributes the plugin uses.
> - Extract pure logic (attribute normalization, feature-string building, font-ID
>   collection) into testable modules with Jest tests, matching the host plugin's
>   conventions.
>
> **Before writing code**, confirm against a live ACF install: the exact
> `acf_register_field_type()` API surface for ACF 6.8+, whether the field UI can be
> rendered inside ACF's block toolbar popover
> (`acf_inline_toolbar_editing_attrs()`), and how ACF field values are exported to
> `acf-json` — the structured array must survive a field-group export/import round trip.

---

## 8. Open questions — need a live ACF install to answer

None of these block the design; each one could change a detail of it.

1. Can a custom ACF field type render inside the block **toolbar popover**
   (`acf_inline_toolbar_editing_attrs()`), or is that popover limited to ACF's built-in
   field types? If it works, an ACF-block author gets a Typography Stylist popover for
   free — a meaningfully better story than §4 alone.
2. Does an array-valued custom field type survive **`acf-json` export/import** and ACF's
   REST exposure without flattening?
3. How does ACF's **block preview** re-render on field change — is it debounced enough
   that a live font preview inside the field UI stays responsive?
4. Does the ACF **Expanded Editing Panel** (6.6+) change any of the above for complex
   field types?
5. Confirm §2.3 empirically: place a Typography Stylist block inside an ACF block's
   `InnerBlocks` on a real site and verify the frontend `@font-face` is emitted (this
   is the mechanism, but it has not been observed end to end).

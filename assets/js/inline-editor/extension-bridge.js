/**
 * The inline editor's side of the extension API (HOOKS.md): the
 * typost_current_editor_state filter, the typost-apply-block-properties,
 * typost-insert-content and typost-convert-to-block events, the
 * panel-closed actions and the toolbar-buttons-changed action.
 *
 * Moved out of the TypographyFeaturesControl constructor in block-editor.js
 * (#357). Each create*() function returns the same closure the constructor
 * used to define inline, over the component instance. The constructor still
 * creates them; extension-listeners.js registers them in componentDidMount()
 * and removes them in componentWillUnmount() (#386).
 *
 * @since 2.4.0
 */
const { normalizeTextCase } = require('../text-case.js');
const { resolveApplyWeightChoice } = require('../inline-apply-rules.js');
const { sanitizeFontVariationSettings } = require('../font-variation-settings.js');

/**
 * Build the typost_current_editor_state filter of one inline editor
 * instance: it answers for editorType 'inline' and passes anything else on.
 *
 * @param {Object} self The TypographyFeaturesControl instance
 * @return {Function} Filter callback (state, editorType)
 */
function createStateProviderFilter(self) {
    return function(state, editorType) {
        if (editorType === 'inline') {
            return {
                editorType: 'inline',
                // Text with no typost font of its own still renders in
                // something — usually a plugin font applied by the theme.
                // Resolving it means the Glyphs panel browses the font
                // the author can actually see, instead of falling back
                // to whichever font happens to be first in the list.
                fontId: self.state.selectedFontId || self.getInheritedFontId(),
                // Only a font set on the text — what persisting
                // consumers (paragraph style capture/diff, Detach)
                // must read, so the theme's font is never written
                // into a style or onto the span (#278)
                explicitFontId: self.getExplicitFontId(),
                // Rendered weight, not the '400' default: a glyph
                // inserted into a theme-bold headline was coming out
                // lighter than the text around it, because consumers
                // wrote this value onto the span they created.
                fontWeight: self.getEffectiveFontWeight(),
                // Set weight only ('' when inherited), for the same
                // persisting consumers (#278)
                explicitFontWeight: self.getSetFontWeight(),
                // Only the weight stored on the selected text ('' when
                // inherited) — what a consumer may write into the
                // span it creates (#254, see buildQftEditorState)
                selectionFontWeight: self.getStoredFontWeight(),
                // Rendered style, not just span styling — an <em>-italic
                // selection should give consumers (Glyphs panel) the
                // italic face even without a data-fontstyle span
                fontStyle: self.getRenderedFontStyle(),
                // Attr/choice-derived only — what persisting consumers
                // (paragraph style capture/diff) must read instead
                explicitFontStyle: self.getExplicitFontStyle(),
                // The span's own case (#214), so a paragraph style
                // captures it and Detach keeps it
                textCase: normalizeTextCase(self.state.textCase),
                fakeSmallCaps: self.state.fakeSmallCaps !== false,
                fontSize: self.state.fontSize,
                fontSizeMin: self.state.fontSizeMin,
                fontSizePreferred: self.state.fontSizePreferred,
                fontSizeMax: self.state.fontSizeMax,
                letterSpacing: self.state.letterSpacing,
                lineHeight: self.state.lineHeight,
                features: self.state.selectedFeatures,
                paragraphStyleId: self.state.paragraphStyleId,
                // The inline editor's style is always the selection's
                // (see HOOKS.md, Block Toolbar Buttons)
                selectionParagraphStyleId: self.state.paragraphStyleId,
                animationId: self.state.animationId,
                fontVariationSettings: self.state.fontVariationSettings
            };
        }
        return state;
    };
}

/**
 * Which property changes a typost-apply-block-properties event records, so
 * mixed selections only get those patched per-run. Style/animation ids
 * and features reset to wholesale (extensions own the full format).
 *
 * @param {Object} detail Event detail
 * @param {Object} props  detail.properties
 * @return {?string[]} Keys to record, in order, or null to reset the pending changes
 */
function resolveApplyEventChanges(detail, props) {
    if (detail.paragraphStyleId !== undefined || detail.animationId !== undefined || props.features !== undefined) {
        return null;
    }
    const keys = [];
    if (props.fontId !== undefined) { keys.push('font'); }
    if (props.fontWeight !== undefined) { keys.push('fontWeight'); }
    if (props.fontStyle !== undefined) { keys.push('fontStyle'); }
    if (props.textCase !== undefined || props.fakeSmallCaps !== undefined) { keys.push('textCase'); }
    if (props.fontSize !== undefined || props.fontSizeMin !== undefined || props.fontSizePreferred !== undefined || props.fontSizeMax !== undefined) { keys.push('fontSize'); }
    if (props.letterSpacing !== undefined) { keys.push('letterSpacing'); }
    if (props.lineHeight !== undefined) { keys.push('lineHeight'); }
    if (props.fontVariationSettings !== undefined) { keys.push('fontVariationSettings'); }
    return keys;
}

/**
 * The state an apply event sets. Uses !== undefined checks so partial
 * updates only override fields present in the event, preserving current
 * state for missing fields.
 *
 * @param {Object}   detail            Event detail
 * @param {Object}   props             detail.properties
 * @param {Object}   state             Current component state
 * @param {Function} resolveFontFamily Font ID -> family
 * @return {Object} State update
 */
function buildApplyEventState(detail, props, state, resolveFontFamily) {
    return {
        selectedFontId: props.fontId !== undefined ? (props.fontId || 0) : state.selectedFontId,
        selectedFont: props.fontId !== undefined ? (props.fontId ? resolveFontFamily(props.fontId) : '') : state.selectedFont,
        fontWeight: props.fontWeight !== undefined ? (props.fontWeight || '400') : state.fontWeight,
        fontStyle: props.fontStyle !== undefined ? (props.fontStyle || '') : state.fontStyle,
        textCase: props.textCase !== undefined ? normalizeTextCase(props.textCase) : state.textCase,
        fakeSmallCaps: props.fakeSmallCaps !== undefined ? props.fakeSmallCaps !== false : state.fakeSmallCaps,
        fontSize: props.fontSize !== undefined ? (props.fontSize || 'inherit') : state.fontSize,
        fontSizeMin: props.fontSizeMin !== undefined ? (props.fontSizeMin || 16) : state.fontSizeMin,
        fontSizePreferred: props.fontSizePreferred !== undefined ? (props.fontSizePreferred || 24) : state.fontSizePreferred,
        fontSizeMax: props.fontSizeMax !== undefined ? (props.fontSizeMax || 32) : state.fontSizeMax,
        letterSpacing: props.letterSpacing !== undefined ? (props.letterSpacing || 0) : state.letterSpacing,
        lineHeight: props.lineHeight !== undefined ? (props.lineHeight || 0) : state.lineHeight,
        selectedFeatures: props.features !== undefined ? (props.features || []) : state.selectedFeatures,
        paragraphStyleId: detail.paragraphStyleId !== undefined ? (detail.paragraphStyleId || 0) : state.paragraphStyleId,
        animationId: detail.animationId !== undefined ? (detail.animationId || 0) : state.animationId,
        fontVariationSettings: props.fontVariationSettings !== undefined ? sanitizeFontVariationSettings(props.fontVariationSettings || '') : state.fontVariationSettings
    };
}

/**
 * Build the typost-apply-block-properties listener (block property
 * application from extensions, e.g. a paragraph style or Detach).
 *
 * @param {Object} self The TypographyFeaturesControl instance
 * @return {Function} Event listener
 */
function createApplyBlockPropertiesHandler(self) {
    return function(e) {
        // Only the mounted instance may act (or ask the confirm
        // question twice). The listener is registered only while the
        // instance is mounted (#386); this test stays as a guard.
        if (!self._isMounted) {
            return;
        }
        if (e.detail && e.detail.source === 'inline' && e.detail.properties) {
            const props = e.detail.properties;
            // A paragraph style replaces whatever styling the selected
            // runs carry (applying the format drops their previous
            // attributes). The block editor asks first; so does this
            // one now (QA finding PS-2). A cancel is reported so the
            // panel that dispatched the apply can drop its badge.
            if (e.detail.paragraphStyleId && !self.confirmParagraphStyleOverride(!!e.detail.savedFromSelection)) {
                document.dispatchEvent(new CustomEvent('typost-paragraph-style-apply-cancelled', {
                    detail: { source: 'inline', paragraphStyleId: e.detail.paragraphStyleId }
                }));
                return;
            }
            // Record which properties this event changes so mixed
            // selections only get those patched per-run.
            const changes = resolveApplyEventChanges(e.detail, props);
            if (changes === null) {
                self._resetPendingChanges();
            } else {
                changes.forEach(function(key) { self._recordChange(key); });
            }
            // Three states (PR #194 review): a truthy weight from an
            // extension counts as picked and is written; a falsy one is
            // an explicit clear, which strips the weight in both apply
            // paths; an absent key leaves it untouched. Detach hands
            // back the style's weight and counts too, although it takes
            // the reset branch above (#278).
            const weightChoice = resolveApplyWeightChoice(e.detail);
            if (weightChoice) {
                self._authorPickedWeight = weightChoice.authorPicked;
                self._clearWeight = weightChoice.clearWeight;
            }
            self.setState(buildApplyEventState(e.detail, props, self.state, function(fontId) {
                return self.resolveFontFamily(fontId);
            }), function() {
                self._doApplyFeatures();
            });
        }
    };
}

/**
 * Where an insertion lands. Selection may be lost to modal focus; fall back
 * to saved bounds, then to the range captured by the extension when its UI
 * launched (detail.range), then append at the end. The result is whole
 * numbers, in order, inside the text.
 *
 * @param {Object}  value               RichText value
 * @param {?number} savedSelectionStart Saved start
 * @param {?number} savedSelectionEnd   Saved end
 * @param {?Object} detailRange         detail.range from the event
 * @return {{start: number, end: number}} Range
 */
function resolveInsertRange(value, savedSelectionStart, savedSelectionEnd, detailRange) {
    const selectionLost = value.start === value.end && savedSelectionStart !== null && savedSelectionEnd !== null && savedSelectionStart !== savedSelectionEnd;
    let start = selectionLost ? savedSelectionStart : value.start;
    let end = selectionLost ? savedSelectionEnd : value.end;
    if (!Number.isFinite(start)) {
        if (detailRange && Number.isFinite(detailRange.start)) {
            start = detailRange.start;
            end = Number.isFinite(detailRange.end) ? detailRange.end : start;
        } else {
            start = value.text.length;
            end = start;
        }
    }
    if (!Number.isFinite(end)) end = start;
    // Normalize: integers, swap if reversed, clamp to text bounds
    start = Math.floor(start);
    end = Math.floor(end);
    if (end < start) {
        const swap = start;
        start = end;
        end = swap;
    }
    start = Math.max(0, Math.min(start, value.text.length));
    end = Math.max(start, Math.min(end, value.text.length));
    return { start, end };
}

/**
 * Build the typost-insert-content listener (content insertion from
 * extensions, e.g. the Glyphs Panel). Inserts text at the cursor (or
 * replaces the selection), optionally wrapping the inserted text in a
 * typost-styled span via format attributes.
 *
 * @param {Object} self       The TypographyFeaturesControl instance
 * @param {string} formatType Format type name
 * @return {Function} Event listener
 */
function createInsertContentHandler(self, formatType) {
    return function(e) {
        if (!e.detail || e.detail.source !== 'inline' || !e.detail.text) {
            return;
        }
        // Only a mounted instance handles insertion, so an insert is
        // never applied twice. The listener is registered only while
        // the instance is mounted (#386); this test stays as a guard.
        if (!self._isMounted) {
            return;
        }
        const { insert, applyFormat } = wp.richText;
        const { value, onChange } = self.props;
        if (!value || !onChange) {
            return;
        }
        const { savedSelectionStart, savedSelectionEnd } = self.state;

        let { start, end } = resolveInsertRange(value, savedSelectionStart, savedSelectionEnd, e.detail.range);

        // A glyph that stayed selected only so its alternates could
        // replace it must not be overwritten by a different character,
        // and an alternate picked right after a caret insertion should
        // replace that glyph (GP-1). Shared logic; no-op without it.
        const adjustRange = (window.typostSharedUtils && window.typostSharedUtils.adjustInsertionRangeForSwap)
            ? window.typostSharedUtils.adjustInsertionRangeForSwap
            : function(range) { return range; };
        const adjusted = adjustRange({ start, end }, self._lastInsert || null, !!e.detail.swap, value.text);
        start = adjusted.start;
        end = adjusted.end;

        const text = String(e.detail.text).slice(0, 50);
        let newValue = insert(value, text, start, end);
        const insertEnd = start + text.length;
        self._lastInsert = { start, end: insertEnd, text, swap: !!e.detail.swap };

        // Copy formats so insertion behaves like typing (continuity).
        // When replacing a selection, inherit from the replaced range's
        // first character (the glyph being swapped) — the preceding
        // character may sit outside the styled span.
        const inherited = (end > start && value.formats[start])
            ? value.formats[start]
            : ((start > 0 && value.formats[start - 1]) ? value.formats[start - 1] : []);
        inherited.forEach(function(format) {
            newValue = applyFormat(newValue, format, start, insertEnd);
        });

        // Wrap inserted text in a typost-styled span when attributes provided.
        // applyFormat replaces the inherited typost format on the inserted
        // range, so merge the replaced format's sizing/spacing into the new
        // attributes first — a swapped glyph must keep its span's styling.
        if (e.detail.attributes && typeof e.detail.attributes === 'object') {
            const inheritedTypost = inherited.find(function(f) { return f && f.type === formatType; });
            const mergeAttrs = (window.typostSharedUtils && window.typostSharedUtils.mergeInsertionFormatAttributes)
                ? window.typostSharedUtils.mergeInsertionFormatAttributes
                : function(incoming) { return incoming; };
            newValue = applyFormat(newValue, {
                type: formatType,
                attributes: mergeAttrs(e.detail.attributes, inheritedTypost ? inheritedTypost.attributes : null)
            }, start, insertEnd);
        }

        // swap (alternates-view) insertions keep the inserted text
        // selected so the next alternate/base click replaces the same
        // glyph; sequence insertions collapse the caret after the text
        if (e.detail.swap) {
            newValue.start = start;
            newValue.end = insertEnd;
            onChange(newValue);
            self.setState({ savedSelectionStart: start, savedSelectionEnd: insertEnd });
        } else {
            newValue.start = insertEnd;
            newValue.end = insertEnd;
            onChange(newValue);
            self.setState({ savedSelectionStart: insertEnd, savedSelectionEnd: insertEnd });
        }
    };
}

/**
 * Build the typost_glyphs_panel_closed / typost_extension_panel_closed
 * action: when a panel that forced this inline Modal closed (a separate
 * Modal) is dismissed, reopen the inline editor so the author returns to
 * where they launched from. The saved selection range travels back with
 * the event because togglePopover cleared it when WordPress force-closed
 * this Modal.
 *
 * info.reopenHost === false means the panel was launched straight
 * from the block toolbar with no host modal open — reopening one
 * the author never asked for would be a surprise. An absent flag
 * (as older extensions send) keeps the reopen behavior.
 *
 * @param {Object} self The TypographyFeaturesControl instance
 * @return {Function} Action callback (src, info)
 */
function createPanelClosedHandler(self) {
    return function(src, info) {
        // Mount guard: doAction() runs the callbacks it listed when the
        // action started, so a callback removed during the action (its
        // instance unmounted) still runs, and would otherwise fire
        // typost_inline_modal_opened with stale state.
        if (!self._isMounted || src !== 'inline') {
            return;
        }
        if (info && info.reopenHost === false) {
            return;
        }
        var reopenState = { isOpen: true };
        if (info && info.range) {
            reopenState.savedSelectionStart = info.range.start;
            reopenState.savedSelectionEnd = info.range.end;
        }
        self.setState(reopenState, function() {
            window.typostHooks.doAction('typost_inline_modal_opened', self.state);
        });
    };
}

/**
 * Build the typost-convert-to-block listener: let an extension trigger the
 * conversion its own UI is offering — the word-boundary notice is only
 * useful if the fix it recommends is reachable from where the notice is
 * shown. Every mounted instance handles it, which is harmless: convert
 * reads the selected block from the store, and replaceBlocks on an
 * already-replaced client ID is a no-op.
 *
 * @param {Object} self The TypographyFeaturesControl instance
 * @return {Function} Event listener
 */
function createConvertRequestHandler(self) {
    return function() {
        if (self._isMounted) {
            self.convertToBlock();
        }
    };
}

/**
 * Build the typost_editor_toolbar_buttons_changed action: extra toolbar
 * buttons may register after this component first renders (async or
 * conditionally loaded extensions), so re-render when the registry changes.
 *
 * @param {Object} self The TypographyFeaturesControl instance
 * @return {Function} Action callback
 */
function createToolbarButtonsChangedHandler(self) {
    return function() {
        if (self._isMounted) {
            self.forceUpdate();
        }
    };
}

module.exports = {
    createStateProviderFilter: createStateProviderFilter,
    resolveApplyEventChanges: resolveApplyEventChanges,
    buildApplyEventState: buildApplyEventState,
    createApplyBlockPropertiesHandler: createApplyBlockPropertiesHandler,
    resolveInsertRange: resolveInsertRange,
    createInsertContentHandler: createInsertContentHandler,
    createPanelClosedHandler: createPanelClosedHandler,
    createConvertRequestHandler: createConvertRequestHandler,
    createToolbarButtonsChangedHandler: createToolbarButtonsChangedHandler
};

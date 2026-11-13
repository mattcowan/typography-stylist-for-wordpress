/**
 * Registration of the inline editor's extension listeners (HOOKS.md): the
 * typost_current_editor_state filter, the typost-apply-block-properties,
 * typost-insert-content and typost-convert-to-block events on the document,
 * and the typost_glyphs_panel_closed, typost_extension_panel_closed and
 * typost_editor_toolbar_buttons_changed actions. extension-bridge.js builds
 * the callbacks.
 *
 * TypographyFeaturesControl (block-editor.js) creates the callbacks in its
 * constructor, attaches them in componentDidMount() and detaches them in
 * componentWillUnmount() (#386). Until 2.4.0 the constructor also registered
 * them. With SCRIPT_DEBUG on, WordPress loads the development build of
 * React, and StrictMode constructs the component twice and runs mount,
 * unmount, mount on the instance it keeps: the listeners then stayed on the
 * instance that was thrown away, and the mounted one had none. A constructor
 * must not have side effects; mount and unmount come in pairs.
 *
 * Known gap: the editor mounts a new instance at each selection change. The
 * old instance detaches in componentWillUnmount() and the new one attaches
 * in componentDidMount(), both inside one React commit. A caller that asks
 * the typost_current_editor_state filter for 'inline' between the two (a
 * wp.data subscriber that runs during the commit) gets the value it passed
 * in, as it does when no inline editor exists. The next store change asks
 * again and gets the mounted instance's state. Until 2.4.0 the new instance
 * answered in that moment, with the state of an editor that was not mounted
 * yet. Any registration at commit time has this gap.
 *
 * @since 2.4.0
 */
const {
    createStateProviderFilter,
    createApplyBlockPropertiesHandler,
    createInsertContentHandler,
    createPanelClosedHandler,
    createConvertRequestHandler,
    createToolbarButtonsChangedHandler
} = require('./extension-bridge.js');

/**
 * Create the instance's extension callbacks and keep them on the instance.
 * Registers nothing, so an instance that is never mounted leaves nothing
 * behind.
 *
 * @param {Object} self       The TypographyFeaturesControl instance
 * @param {string} formatType Format type name
 */
function createExtensionListeners(self, formatType) {
    // State provider for extensions to read current state
    self._stateProviderFilter = createStateProviderFilter(self);
    // Block property application from extensions (a paragraph style,
    // Detach). Partial updates only override the fields in the event
    self._handleApplyBlockProperties = createApplyBlockPropertiesHandler(self);
    // Content insertion from extensions (e.g., Glyphs Panel)
    self._handleInsertContent = createInsertContentHandler(self, formatType);
    // When the Glyphs panel (a separate Modal that forced this inline Modal
    // closed) is dismissed, reopen the inline editor so the author returns
    // to where they launched from. Also registered for
    // typost_extension_panel_closed, the generic name for the same contract
    // (the Paragraph Styles browser is the second panel).
    self._handleGlyphsClosed = createPanelClosedHandler(self);
    // Convert to block, requested from an extension's UI
    self._handleConvertRequest = createConvertRequestHandler(self);
    // Re-render when an extension adds a toolbar button later
    self._handleToolbarButtonsChanged = createToolbarButtonsChangedHandler(self);
}

/**
 * Register the instance's callbacks, in the order the constructor used
 * before #386. Does nothing while they are registered already, so each
 * callback is registered once however often this runs.
 *
 * @param {Object} self  The TypographyFeaturesControl instance, after createExtensionListeners()
 * @param {Object} hooks The typostHooks registry
 * @param {Object} doc   The document that carries the CustomEvents
 */
function attachExtensionListeners(self, hooks, doc) {
    if (self._extensionListenerTargets) {
        return;
    }
    // Detach removes from the same registry and document, even when
    // window.typostHooks was replaced in between
    self._extensionListenerTargets = { hooks: hooks, doc: doc };
    hooks.addFilter('typost_current_editor_state', self._stateProviderFilter, 10);
    doc.addEventListener('typost-apply-block-properties', self._handleApplyBlockProperties);
    doc.addEventListener('typost-insert-content', self._handleInsertContent);
    hooks.addAction('typost_glyphs_panel_closed', self._handleGlyphsClosed, 10);
    hooks.addAction('typost_extension_panel_closed', self._handleGlyphsClosed, 10);
    doc.addEventListener('typost-convert-to-block', self._handleConvertRequest);
    hooks.addAction('typost_editor_toolbar_buttons_changed', self._handleToolbarButtonsChanged, 10);
}

/**
 * Remove every callback attachExtensionListeners() registered. Does nothing
 * when none is registered.
 *
 * @param {Object} self The TypographyFeaturesControl instance
 */
function detachExtensionListeners(self) {
    const targets = self._extensionListenerTargets;
    if (!targets) {
        return;
    }
    self._extensionListenerTargets = null;
    const hooks = targets.hooks;
    const doc = targets.doc;
    doc.removeEventListener('typost-apply-block-properties', self._handleApplyBlockProperties);
    doc.removeEventListener('typost-insert-content', self._handleInsertContent);
    hooks.removeFilter('typost_current_editor_state', self._stateProviderFilter);
    hooks.removeAction('typost_glyphs_panel_closed', self._handleGlyphsClosed);
    hooks.removeAction('typost_extension_panel_closed', self._handleGlyphsClosed);
    hooks.removeAction('typost_editor_toolbar_buttons_changed', self._handleToolbarButtonsChanged);
    doc.removeEventListener('typost-convert-to-block', self._handleConvertRequest);
}

module.exports = {
    createExtensionListeners: createExtensionListeners,
    attachExtensionListeners: attachExtensionListeners,
    detachExtensionListeners: detachExtensionListeners
};

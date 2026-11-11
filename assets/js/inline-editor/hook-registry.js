/**
 * Typography Stylist Hook System
 *
 * Lightweight action/filter system for extension plugins.
 * Mirrors WordPress PHP hooks. Extensions register callbacks
 * that fire at specific points in the editor lifecycle.
 *
 * block-editor.js installs the object as window.typostHooks when the inline
 * editor script loads (unless another script installed one first). There is
 * one registry per page; this module only builds it.
 *
 * @since 2.0.0
 */

/**
 * Build a new, empty hook registry.
 *
 * @return {Object} The registry: addAction, doAction, addFilter, applyFilters, removeAction, removeFilter
 */
function createHookRegistry() {
    return {
        _actions: {},
        _filters: {},
        addAction: function(name, callback, priority) {
            priority = priority || 10;
            this._actions[name] = this._actions[name] || [];
            this._actions[name].push({ callback: callback, priority: priority });
            this._actions[name].sort(function(a, b) { return a.priority - b.priority; });
        },
        doAction: function(name) {
            var args = Array.prototype.slice.call(arguments, 1);
            (this._actions[name] || []).forEach(function(h) { h.callback.apply(null, args); });
        },
        addFilter: function(name, callback, priority) {
            priority = priority || 10;
            this._filters[name] = this._filters[name] || [];
            this._filters[name].push({ callback: callback, priority: priority });
            this._filters[name].sort(function(a, b) { return a.priority - b.priority; });
        },
        applyFilters: function(name, value) {
            var args = Array.prototype.slice.call(arguments, 1);
            (this._filters[name] || []).forEach(function(h) {
                args[0] = h.callback.apply(null, args);
            });
            return args[0];
        },
        removeAction: function(name, callback) {
            if (!this._actions[name]) return;
            this._actions[name] = this._actions[name].filter(function(h) {
                return h.callback !== callback;
            });
        },
        removeFilter: function(name, callback) {
            if (!this._filters[name]) return;
            this._filters[name] = this._filters[name].filter(function(h) {
                return h.callback !== callback;
            });
        }
    };
}

module.exports = {
    createHookRegistry: createHookRegistry
};

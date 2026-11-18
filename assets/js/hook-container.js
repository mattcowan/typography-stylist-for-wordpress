/**
 * Extension hook containers: unmount what an extension rendered into one
 * when the container leaves the page (#419).
 *
 * Shared by the inline editor (assets/js/block-editor.js, through HookPoint
 * in inline-editor/modal-chrome.js, bundled with browserify) and the
 * Typography Stylist block (the Quick Feature Toggles and the sidebar,
 * bundled with wp-scripts).
 *
 * Each hook container is an empty div whose ref callback fires the hook's
 * action once (`el._hooked`). Extensions render into it with
 * `wp.element.render()`, which makes the container a legacy React root that
 * nothing unmounted: when the dialog closed or the sidebar showed another
 * block, the container left the page but the root stayed mounted, its
 * effects never cleaned up, and a `wp.data` subscription in it (the
 * Paragraph Styles panel) kept calling `typost_current_editor_state` on
 * every store change, one more panel at each open.
 *
 * Why the unmount waits a microtask and tests `isConnected`:
 * - The ref callbacks are inline functions, so React calls the old one with
 *   `null` and the new one with the element at every re-render. `null` alone
 *   does not say that the container left.
 * - React's development build (SCRIPT_DEBUG) replays effects on elements
 *   that stay on the page.
 * - The `null` call runs inside the host root's commit, before the DOM
 *   change that removes the container is complete. (Measured with React
 *   18.3.1: an `unmountComponentAtNode()` called from there logs no warning
 *   but takes effect only after the commit; the extension's effect cleanups
 *   run later still.)
 * A microtask runs after the commit, and by then a container that left is
 * no longer connected while one that stayed still is.
 *
 * Core unmounts only a root rendered into the container itself. A root that
 * an extension renders into an element it appends to the container (the
 * bundled Glyphs button), or makes with `createRoot()`, is the extension's
 * to unmount (HOOKS.md, "Container lifecycle").
 *
 * @since 2.4.0
 */

// Containers whose ref received null since the last check
let pendingContainers = [];
let checkScheduled = false;

/**
 * Run a callback after the current task's synchronous work (the commit).
 *
 * @param {Function} callback Callback
 */
function afterCommit(callback) {
	if (typeof queueMicrotask === 'function') {
		queueMicrotask(callback);
		return;
	}
	Promise.resolve().then(callback);
}

/**
 * Whether an element is still in its document.
 *
 * @param {Element} el Element
 * @return {boolean} True when connected
 */
function isOnPage(el) {
	if (typeof el.isConnected === 'boolean') {
		return el.isConnected;
	}
	const doc = el.ownerDocument;
	return !!(doc && doc.documentElement && doc.documentElement.contains(el));
}

/**
 * Unmount the legacy React root rendered into a container, if there is one.
 *
 * `_reactRootContainer` is the mark `wp.element.render()` (React 16 to 18)
 * leaves on a container, and the same test `unmountComponentAtNode()` makes
 * first. Calling it on a container that is not a root does nothing, except
 * that React's development build logs an error when the container's first
 * child is itself a root (an extension's appended element), so such a
 * container is left alone. React 19 has no `unmountComponentAtNode()`
 * (and `wp.element.render()` with it): nothing to do there.
 *
 * @param {Element} el The container
 * @return {boolean} True when a root was unmounted
 */
function unmountHookContainer(el) {
	const element = typeof window !== 'undefined' && window.wp && window.wp.element;
	if (!el || !el._reactRootContainer || !element || typeof element.unmountComponentAtNode !== 'function') {
		return false;
	}
	return element.unmountComponentAtNode(el) === true;
}

/**
 * Unmount the root of every queued container that left the page. One
 * extension's error in its cleanup does not stop the others; the first error
 * is thrown again afterward, so it still shows in the console.
 */
function releaseDetachedContainers() {
	checkScheduled = false;
	const containers = pendingContainers;
	pendingContainers = [];
	let firstError = null;
	containers.forEach((el) => {
		if (isOnPage(el)) {
			return;
		}
		try {
			unmountHookContainer(el);
		} catch (error) {
			if (!firstError) {
				firstError = error;
			}
		}
	});
	if (firstError) {
		setTimeout(() => {
			throw firstError;
		}, 0);
	}
}

/**
 * Queue a container whose ref received null, and check it after the commit.
 *
 * @param {Element} el The container
 */
function scheduleContainerRelease(el) {
	if (pendingContainers.indexOf(el) === -1) {
		pendingContainers.push(el);
	}
	if (!checkScheduled) {
		checkScheduled = true;
		afterCommit(releaseDetachedContainers);
	}
}

/**
 * Wrap a hook container's ref callback.
 *
 * `fire` receives the element and fires the hook's action as before (once
 * per element, `el._hooked`); it is called only with an element. When React
 * calls the returned ref with `null`, the element it had is checked after
 * the commit, and its root is unmounted if the element left the page.
 *
 * @param {Function} fire Called with the container element
 * @return {Function} Ref callback
 */
function hookContainerRef(fire) {
	let current = null;
	return (el) => {
		if (el) {
			current = el;
			fire(el);
			return;
		}
		if (current) {
			scheduleContainerRelease(current);
			current = null;
		}
	};
}

module.exports = {
	hookContainerRef: hookContainerRef,
	unmountHookContainer: unmountHookContainer
};

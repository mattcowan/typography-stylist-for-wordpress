/**
 * Typography Stylist Block - keyboard focus in the Reset Features panel
 * (#420).
 *
 * Every button in the panel removes itself from the page when it is pressed:
 * an opener ("Clear Individual Features", "Reset Entire Block") gives way to
 * its confirmation, and "Yes, …" and "Cancel" give way to the openers again.
 * Without help, focus then goes to the document body. The panel is a render
 * function that Edit calls (components/inspector/reset-panel.js), so it
 * cannot hold refs or effects itself: Edit calls this hook and passes the
 * result to the panel.
 *
 * The panel's buttons ask for focus with focusAfterRender(name) in the same
 * event that shows or hides the confirmation. The effect runs only when such
 * a request is made, so a change to another control, which renders the
 * sidebar again, never moves focus. It runs after the render that mounts the
 * named button, and after RichText's layout effects, which can write the
 * selection back into the canvas when the content changes.
 */

import { useRef, useState, useEffect } from '@wordpress/element';

/**
 * Focus an element if it is still in its document.
 *
 * @param {?Element} element The element, or null when it is not mounted
 * @return {boolean} True when focus() was called
 */
export function focusIfConnected(element) {
	if (!element || !element.ownerDocument || !element.ownerDocument.contains(element) || typeof element.focus !== 'function') {
		return false;
	}
	element.focus();
	return true;
}

/**
 * Refs for the panel's buttons, and a way to move focus to one of them after
 * the next render.
 *
 * The names the panel uses: 'inlineOpener', 'inlineCancel', 'fullOpener'
 * and 'fullCancel'.
 *
 * @return {{targetRef: Function, focusAfterRender: Function}} targetRef(name)
 *         gives a stable ref callback for the button `name`;
 *         focusAfterRender(name) focuses that button once it is rendered
 *         (nothing happens when it is not rendered then).
 */
export default function useResetPanelFocus() {
	const elements = useRef({});
	const callbacks = useRef({});
	// A new object for each request, so the same name asked twice runs the
	// effect twice
	const [request, setRequest] = useState(null);

	useEffect(() => {
		if (request) {
			focusIfConnected(elements.current[request.name]);
		}
	}, [request]);

	const targetRef = (name) => {
		if (!callbacks.current[name]) {
			callbacks.current[name] = (element) => {
				elements.current[name] = element;
			};
		}
		return callbacks.current[name];
	};

	const focusAfterRender = (name) => setRequest({ name });

	return { targetRef, focusAfterRender };
}

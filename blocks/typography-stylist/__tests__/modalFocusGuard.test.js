/**
 * Tests for the modal focus guard (SR-7).
 *
 * After an apply/insert, RichText writes the new selection into the canvas
 * iframe and Firefox moves focus there. The guard returns focus to the modal
 * control that had it. These tests drive the guard with a fake "canvas has
 * focus" probe so they do not depend on jsdom's iframe focus behavior.
 */
import { installModalFocusGuard, restoreModalFocus, MODAL_FOCUS_GUARD_FRAME_SELECTOR } from '../utils';

function buildModal(className = 'components-modal__frame typost-modal') {
	const frame = document.createElement('div');
	frame.className = className;
	frame.tabIndex = -1;
	const button = document.createElement('button');
	button.textContent = 'Standard Ligatures';
	frame.appendChild(button);
	document.body.appendChild(frame);
	return { frame, button };
}

describe('installModalFocusGuard', () => {
	let uninstall;
	let canvasFocused;

	beforeEach(() => {
		jest.useFakeTimers();
		document.body.innerHTML = '';
		canvasFocused = false;
		uninstall = installModalFocusGuard(document, { isCanvasFocused: () => canvasFocused, delays: [0, 80] });
	});

	afterEach(() => {
		if (uninstall) uninstall();
		jest.useRealTimers();
	});

	test('returns focus to the control that lost it when the canvas took focus', () => {
		const { button } = buildModal();
		button.focus();
		expect(document.activeElement).toBe(button);

		// The editor pulled focus into the canvas.
		canvasFocused = true;
		button.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
		button.blur();

		jest.advanceTimersByTime(0);
		expect(document.activeElement).toBe(button);
	});

	test('leaves focus alone when the canvas did not take it', () => {
		const { frame, button } = buildModal();
		const other = document.createElement('button');
		frame.appendChild(other);
		button.focus();

		button.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: other }));
		other.focus();

		jest.advanceTimersByTime(100);
		expect(document.activeElement).toBe(other);
	});

	test('leaves focus alone when the modal closed in the meantime', () => {
		const { frame, button } = buildModal();
		button.focus();
		canvasFocused = true;
		button.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
		frame.remove();
		document.body.focus();

		jest.advanceTimersByTime(100);
		expect(document.activeElement).toBe(document.body);
	});

	test('falls back to the frame when the control itself was removed', () => {
		const { frame, button } = buildModal();
		button.focus();
		canvasFocused = true;
		button.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
		button.remove();
		document.body.focus();

		jest.advanceTimersByTime(0);
		expect(document.activeElement).toBe(frame);
	});

	test('ignores focus leaving modals that are not ours', () => {
		const { button } = buildModal('components-modal__frame some-other-plugin');
		button.focus();
		canvasFocused = true;
		button.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
		button.blur();

		jest.advanceTimersByTime(100);
		expect(document.activeElement).toBe(document.body);
	});

	test('re-checks after the second delay so a late focus move is still undone', () => {
		const { button } = buildModal();
		button.focus();
		button.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
		button.blur();

		jest.advanceTimersByTime(0);
		expect(document.activeElement).toBe(document.body); // nothing to undo yet

		canvasFocused = true; // the editor's effect ran late
		jest.advanceTimersByTime(80);
		expect(document.activeElement).toBe(button);
	});

	test('is idempotent per document and uninstalls cleanly', () => {
		const again = installModalFocusGuard(document, { isCanvasFocused: () => true });
		expect(again).toBe(uninstall);

		uninstall();
		uninstall = null;
		const { button } = buildModal();
		button.focus();
		canvasFocused = true;
		button.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
		button.blur();
		jest.advanceTimersByTime(100);
		expect(document.activeElement).toBe(document.body);
	});

	test('returns null for something that is not a document', () => {
		expect(installModalFocusGuard({})).toBeNull();
	});

	test('refocuses the same-id replacement when the control re-rendered', () => {
		const { frame, button } = buildModal();
		button.id = 'inspector-toggle-control-3';
		button.focus();
		canvasFocused = true;
		button.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
		button.remove();
		const replacement = document.createElement('input');
		replacement.type = 'checkbox';
		replacement.id = 'inspector-toggle-control-3';
		frame.appendChild(replacement);

		jest.advanceTimersByTime(0);
		expect(document.activeElement).toBe(replacement);
	});

	test('restores focus when the canvas document reports focusin (Firefox path, no outer event)', () => {
		const { button } = buildModal();
		const iframe = document.createElement('iframe');
		iframe.name = 'editor-canvas';
		document.body.appendChild(iframe);
		const inner = iframe.contentDocument;
		const editable = inner.createElement('div');
		editable.setAttribute('contenteditable', 'true');
		inner.body.appendChild(editable);

		// Focus inside the modal registers the last modal control and attaches
		// the guard to the canvas document.
		button.focus();
		button.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

		// Firefox: the outer document sees no focusout; only the inner document
		// reports the editable gaining focus.
		canvasFocused = true;
		button.blur();
		editable.dispatchEvent(new inner.defaultView.FocusEvent('focusin', { bubbles: true }));

		jest.advanceTimersByTime(0);
		expect(document.activeElement).toBe(button);
	});

	test('polls while a modal is open and catches a silent focus move (no events at all)', () => {
		const { frame, button } = buildModal();
		button.focus();
		button.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

		// Firefox moved the active element with the selection: no focusout,
		// no inner focusin — only activeElement changed.
		canvasFocused = true;
		button.blur();
		expect(document.activeElement).toBe(document.body);

		jest.advanceTimersByTime(100);
		expect(document.activeElement).toBe(button);

		// Once the modal is gone the poll stops and never touches focus again.
		frame.remove();
		canvasFocused = true;
		jest.advanceTimersByTime(500);
		expect(document.activeElement).toBe(document.body);
	});

	test('the canvas focusin path does nothing once the modal is gone', () => {
		const { frame, button } = buildModal();
		const iframe = document.createElement('iframe');
		iframe.name = 'editor-canvas';
		document.body.appendChild(iframe);
		const inner = iframe.contentDocument;
		button.focus();
		button.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

		frame.remove();
		canvasFocused = true;
		inner.body.dispatchEvent(new inner.defaultView.FocusEvent('focusin', { bubbles: true }));
		jest.advanceTimersByTime(100);
		expect(document.activeElement).toBe(document.body);
	});
});

describe('restoreModalFocus', () => {
	test('reports whether focus was moved', () => {
		const { frame, button } = buildModal();
		document.body.focus();
		expect(restoreModalFocus(document, frame, button, () => true)).toBe(true);
		expect(document.activeElement).toBe(button);
		expect(restoreModalFocus(document, frame, button, () => false)).toBe(false);
		frame.remove();
		expect(restoreModalFocus(document, frame, button, () => true)).toBe(false);
	});

	test('focuses the frame first when the control refuses focus while the iframe holds it (Firefox)', () => {
		// Firefox: focus() on the element it still records as focused is a
		// no-op while a subframe has focus; focusing another node first works.
		const { frame, button } = buildModal();
		const calls = [];
		let canvasHasFocus = true;
		frame.focus = jest.fn(() => { calls.push('frame'); });
		button.focus = jest.fn(() => {
			calls.push('button');
			// the second attempt (after the frame took focus) succeeds
			if (calls.filter((c) => c === 'button').length === 2) canvasHasFocus = false;
		});
		expect(restoreModalFocus(document, frame, button, () => canvasHasFocus)).toBe(true);
		expect(calls).toEqual(['button', 'frame', 'button']);
	});

	test('the frame selector matches every plugin modal class and nothing else', () => {
		const matches = (cls) => {
			const el = document.createElement('div');
			el.className = cls;
			return el.matches(MODAL_FOCUS_GUARD_FRAME_SELECTOR);
		};
		expect(matches('components-modal__frame typost-modal')).toBe(true);
		expect(matches('components-modal__frame typost-modal typost-block-modal')).toBe(true);
		expect(matches('components-modal__frame typost-glyphs-modal')).toBe(true);
		expect(matches('components-modal__frame typost-ps-browser-modal')).toBe(true);
		expect(matches('components-modal__frame')).toBe(false);
		expect(matches('typost-modal')).toBe(false);
	});
});

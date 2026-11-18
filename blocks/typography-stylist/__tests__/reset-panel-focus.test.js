/**
 * Keyboard focus in the Reset Features panel (#420): every button there
 * removes itself from the page when it is pressed, so each one says where
 * focus goes next.
 *
 * The panel (components/inspector/reset-panel.js) is rendered here as Edit
 * renders it: a small host component keeps the two confirmation states and
 * calls useResetPanelFocus(). The WordPress components are replaced by plain
 * elements that pass on the props the panel sets (Button forwards its ref,
 * as the real one does). The real sidebar is checked in the editor
 * (tests/e2e/reset-panel-focus.spec.js, Chromium and Firefox).
 */

jest.mock('@wordpress/components', () => {
	const React = require('react');
	return {
		PanelBody: ({ title, children }) => React.createElement('section', { 'aria-label': title }, children),
		Button: React.forwardRef(({ children, onClick, 'aria-describedby': describedBy }, ref) => React.createElement('button', { ref, onClick, 'aria-describedby': describedBy }, children)),
	};
}, { virtual: true });
jest.mock('@wordpress/a11y', () => ({ speak: jest.fn() }), { virtual: true });

import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from '@wordpress/element';
import { speak } from '@wordpress/a11y';
import renderResetPanel from '../components/inspector/reset-panel';
import useResetPanelFocus, { focusIfConnected } from '../hooks/use-reset-panel-focus';
import createResetActions from '../qft/reset-actions';

/**
 * The part of Edit that renders the panel. `actions` replaces the two
 * reset actions; by default each one closes its confirmation, as the real
 * ones do.
 */
function Host({ actions = {}, other = 0 }) {
	const [showInlineResetConfirm, setShowInlineResetConfirm] = useState(false);
	const [showFullResetConfirm, setShowFullResetConfirm] = useState(false);
	const resetFocus = useResetPanelFocus();
	const clearAllInlineFeatures = actions.clear || (() => setShowInlineResetConfirm(false));
	const resetEntireBlock = actions.reset || (() => {
		setShowInlineResetConfirm(false);
		setShowFullResetConfirm(false);
	});
	return (
		<div>
			<input aria-label={`Another control ${other}`} />
			{renderResetPanel({
				showInlineResetConfirm, setShowInlineResetConfirm, showFullResetConfirm, setShowFullResetConfirm,
				clearAllInlineFeatures, resetEntireBlock, clientId: 'abc', resetFocus
			})}
		</div>
	);
}

const button = (name) => screen.getByRole('button', { name });

// The text of the elements an aria-describedby names
const description = (element) => element.getAttribute('aria-describedby').split(' ')
	.map((id) => document.getElementById(id).textContent.trim()).join(' | ');

describe('Reset Features panel: focus (#420)', () => {
	it('Clear Individual Features: Cancel takes focus, describes the confirmation, and gives focus back', () => {
		render(<Host />);
		const opener = button('Clear Individual Features');
		opener.focus();
		fireEvent.click(opener);
		expect(document.activeElement).toBe(button('Cancel'));
		// The visible text keeps the emoji; the accessible description leaves it out
		expect(description(button('Cancel'))).toBe('⚠️ Are you sure? | This will remove all inline features (typost-styled spans) from this block. Block-level settings will remain.');
		expect(button('Cancel')).toHaveAccessibleDescription('Are you sure? This will remove all inline features (typost-styled spans) from this block. Block-level settings will remain.');

		fireEvent.click(button('Cancel'));
		expect(document.activeElement).toBe(button('Clear Individual Features'));
	});

	it('Yes, Clear runs the action and gives focus back to the opener', () => {
		const clear = jest.fn();
		function WithClear() {
			return <Host actions={{ clear }} />;
		}
		const { rerender } = render(<WithClear />);
		fireEvent.click(button('Clear Individual Features'));
		expect(document.activeElement).toBe(button('Cancel'));
		// This mock leaves the confirmation open, as the real action does with
		// no content: the request finds no opener, and focus stays
		fireEvent.click(button('Yes, Clear'));
		expect(clear).toHaveBeenCalledTimes(1);
		expect(screen.queryByRole('button', { name: 'Clear Individual Features' })).toBeNull();
		rerender(<WithClear />);
		expect(document.activeElement).toBe(button('Cancel'));
	});

	it('the same target asked twice in a row is focused the second time too', () => {
		// Yes, Clear on an empty block asks for the opener while the
		// confirmation stays open (no opener, nothing happens); Cancel then
		// asks for the opener again, once it is mounted. Each request must
		// be a new value, or React keeps the old state and the effect does
		// not run.
		const clear = jest.fn();
		render(<Host actions={{ clear }} />);
		fireEvent.click(button('Clear Individual Features'));
		fireEvent.click(button('Yes, Clear'));
		expect(clear).toHaveBeenCalledTimes(1);
		expect(document.activeElement).toBe(button('Cancel'));

		fireEvent.click(button('Cancel'));
		expect(document.activeElement).toBe(button('Clear Individual Features'));
	});

	it('Yes, Clear that closes the confirmation focuses the opener', () => {
		render(<Host />);
		fireEvent.click(button('Clear Individual Features'));
		fireEvent.click(button('Yes, Clear'));
		expect(document.activeElement).toBe(button('Clear Individual Features'));
	});

	it('Reset Entire Block: Cancel takes focus, describes the confirmation, and gives focus back', () => {
		render(<Host />);
		fireEvent.click(button('Reset Entire Block'));
		expect(document.activeElement).toBe(button('Cancel'));
		expect(description(button('Cancel'))).toMatch(/^🚨 Reset Entire Block\? \| This removes all styling from the block: /);
		expect(button('Cancel')).toHaveAccessibleDescription(/^Reset Entire Block\? This removes all styling from the block: /);

		fireEvent.click(button('Cancel'));
		expect(document.activeElement).toBe(button('Reset Entire Block'));
	});

	it('Yes, Reset All runs the action once and focuses the opener', () => {
		let calls = 0;
		function WithReset() {
			const [, setOpen] = useState(0);
			return <Host actions={{ reset: () => { calls += 1; setOpen(calls); } }} />;
		}
		render(<WithReset />);
		fireEvent.click(button('Reset Entire Block'));
		// This mock leaves the confirmation open: no opener, focus stays
		fireEvent.click(button('Yes, Reset All'));
		expect(calls).toBe(1);
		expect(document.activeElement).toBe(button('Cancel'));
	});

	it('Yes, Reset All that closes the confirmation focuses the opener', () => {
		render(<Host />);
		fireEvent.click(button('Reset Entire Block'));
		fireEvent.click(button('Yes, Reset All'));
		expect(document.activeElement).toBe(button('Reset Entire Block'));
	});

	it('a render for another reason does not move focus', () => {
		const { rerender } = render(<Host other={1} />);
		fireEvent.click(button('Reset Entire Block'));
		expect(document.activeElement).toBe(button('Cancel'));

		const other = screen.getByRole('textbox');
		other.focus();
		rerender(<Host other={2} />);
		rerender(<Host other={3} />);
		expect(document.activeElement).toBe(screen.getByRole('textbox'));
	});

	it('gives each confirmation ids of its own, from the block', () => {
		render(<Host />);
		fireEvent.click(button('Clear Individual Features'));
		expect(button('Cancel').getAttribute('aria-describedby')).toBe('typost-reset-inline-title-abc typost-reset-inline-message-abc');
		fireEvent.click(button('Cancel'));
		fireEvent.click(button('Reset Entire Block'));
		expect(button('Cancel').getAttribute('aria-describedby')).toBe('typost-reset-full-title-abc typost-reset-full-message-abc');
	});

	it('the panel still renders, and moves no focus, without resetFocus', () => {
		function NoFocus() {
			const [inline, setInline] = useState(false);
			return renderResetPanel({
				showInlineResetConfirm: inline, setShowInlineResetConfirm: setInline,
				showFullResetConfirm: false, setShowFullResetConfirm: () => {},
				clearAllInlineFeatures: () => {}, resetEntireBlock: () => {}, clientId: 'x'
			});
		}
		render(<NoFocus />);
		fireEvent.click(button('Clear Individual Features'));
		expect(button('Cancel')).toBeTruthy();
		expect(document.activeElement).toBe(document.body);
	});
});

describe('focusIfConnected', () => {
	it('focuses an element in the page, and nothing else', () => {
		const inPage = document.createElement('button');
		document.body.appendChild(inPage);
		expect(focusIfConnected(inPage)).toBe(true);
		expect(document.activeElement).toBe(inPage);
		inPage.remove();

		expect(focusIfConnected(null)).toBe(false);
		expect(focusIfConnected(undefined)).toBe(false);
		expect(focusIfConnected(document.createElement('button'))).toBe(false);
	});
});

describe('clearAllInlineFeatures speaks its result (#420)', () => {
	beforeEach(() => speak.mockClear());

	it('removes the spans, closes the confirmation and speaks once, politely', () => {
		const setAttributes = jest.fn();
		const setShowInlineResetConfirm = jest.fn();
		const { clearAllInlineFeatures } = createResetActions({
			content: 'A <span class="typost-styled" data-features="dlig">b</span> c',
			resolvedApplyRange: null, setAttributes, setShowInlineResetConfirm, setShowFullResetConfirm: jest.fn()
		});
		clearAllInlineFeatures();
		expect(setAttributes).toHaveBeenCalledWith({ content: 'A b c' });
		expect(setShowInlineResetConfirm).toHaveBeenCalledWith(false);
		expect(speak).toHaveBeenCalledTimes(1);
		expect(speak).toHaveBeenCalledWith('Inline features removed from the block.', 'polite');
	});

	it('with no content: changes nothing and speaks nothing', () => {
		const setAttributes = jest.fn();
		const { clearAllInlineFeatures } = createResetActions({
			content: '', resolvedApplyRange: null, setAttributes, setShowInlineResetConfirm: jest.fn(), setShowFullResetConfirm: jest.fn()
		});
		clearAllInlineFeatures();
		expect(setAttributes).not.toHaveBeenCalled();
		expect(speak).not.toHaveBeenCalled();
	});
});

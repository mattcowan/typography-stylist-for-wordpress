/**
 * The "Remove all styling" toolbar button (#411): aria-haspopup only when a
 * dialog opens, the dialog only with the confirmation setting on, and the
 * dialog's description link to its body text.
 *
 * The WordPress components are replaced by plain elements that pass on the
 * props the button sets; the real Modal and toolbar are checked in the
 * editor (Chromium and Firefox).
 */

jest.mock('@wordpress/components', () => {
	const React = require('react');
	return {
		ToolbarGroup: ({ children }) => React.createElement('div', null, children),
		ToolbarButton: (props) => React.createElement('button', {
			'aria-label': props.label,
			'aria-haspopup': props['aria-haspopup'],
			onClick: props.onClick,
		}),
		Modal: ({ title, children, aria }) => React.createElement('div', {
			role: 'dialog',
			'aria-label': title,
			'aria-describedby': aria ? aria.describedby : undefined,
		}, children),
		Button: ({ children, onClick }) => React.createElement('button', { onClick }, children),
	};
}, { virtual: true });

import { render, screen, fireEvent } from '@testing-library/react';
import StripStylesButton from '../strip-styles/strip-styles-button';

afterEach(() => {
	delete window.typostData;
});

describe('StripStylesButton', () => {
	it('with the confirmation off: no aria-haspopup, and one click strips', () => {
		window.typostData = { showClearConfirmation: '' };
		const onStrip = jest.fn();
		render(<StripStylesButton onStrip={onStrip} />);
		const button = screen.getByRole('button', { name: 'Remove all styling' });
		expect(button.hasAttribute('aria-haspopup')).toBe(false);
		fireEvent.click(button);
		expect(onStrip).toHaveBeenCalledTimes(1);
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('with the confirmation on: aria-haspopup="dialog", and the dialog asks first', () => {
		window.typostData = { showClearConfirmation: '1' };
		const onStrip = jest.fn();
		render(<StripStylesButton onStrip={onStrip} />);
		const button = screen.getByRole('button', { name: 'Remove all styling' });
		expect(button.getAttribute('aria-haspopup')).toBe('dialog');
		fireEvent.click(button);
		expect(onStrip).not.toHaveBeenCalled();
		const dialog = screen.getByRole('dialog', { name: 'Remove all styling?' });
		// The description is the body text
		const description = document.getElementById(dialog.getAttribute('aria-describedby'));
		expect(description).not.toBeNull();
		expect(description.textContent).toMatch(/^This removes all styling from the block/);
		fireEvent.click(screen.getByRole('button', { name: 'Remove styling' }));
		expect(onStrip).toHaveBeenCalledTimes(1);
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('Cancel closes the dialog and strips nothing', () => {
		window.typostData = { showClearConfirmation: true };
		const onStrip = jest.fn();
		render(<StripStylesButton onStrip={onStrip} />);
		fireEvent.click(screen.getByRole('button', { name: 'Remove all styling' }));
		fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(onStrip).not.toHaveBeenCalled();
		expect(screen.queryByRole('dialog')).toBeNull();
	});
});

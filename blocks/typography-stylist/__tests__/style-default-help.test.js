/**
 * The help line under Font Weight, Font Family and Font Size while the block
 * has a paragraph style (#451 review): the empty option ("Theme default",
 * "(Default)", "Inherit") shows the style's value there, because the style's
 * class still applies. Without a style the line is not shown.
 */

jest.mock('@wordpress/components', () => {
	const React = require('react');
	return {
		Button: ({ children, onClick }) => React.createElement('button', { onClick }, children),
		PanelBody: ({ children }) => React.createElement('div', null, children),
		SelectControl: ({ value, options, onChange }) => React.createElement('select', {
			'aria-label': 'Font Weight',
			value,
			onChange: (event) => onChange(event.target.value),
		}, options.map((o) => React.createElement('option', { key: o.value, value: o.value }, o.label))),
	};
}, { virtual: true });

import { render, screen } from '@testing-library/react';
import { getFilteredWeightOptions } from '../utils';
import { renderStyleDefaultHelp } from '../components/inspector/override-reset';
import renderFontWeightPanel from '../components/inspector/font-weight-panel';

const HELP = /With a paragraph style, “Theme default” shows the style’s value\. To use the theme’s value, detach the style\./;

describe('renderStyleDefaultHelp', () => {
	it('names the empty option while the block has a style, also with no override', () => {
		render(renderStyleDefaultHelp({ styleOverrides: {} }, 'Theme default'));
		expect(screen.getByText(HELP)).toBeTruthy();
	});

	it('shows the line when the block overrides other settings', () => {
		render(renderStyleDefaultHelp({ styleOverrides: { fontWeight: true } }, 'Inherit'));
		expect(screen.getByText(/“Inherit” shows the style’s value/)).toBeTruthy();
	});

	it('shows nothing without an active style', () => {
		expect(renderStyleDefaultHelp({ styleOverrides: null }, 'Theme default')).toBeNull();
		expect(renderStyleDefaultHelp(undefined, 'Theme default')).toBeNull();
	});
});

describe('the Font Weight panel', () => {
	const renderPanel = (overrideControls) => render(renderFontWeightPanel({
		fontId: 0, fontVariationSettings: '', fontWeight: '', setAttributes: jest.fn(), overrideControls,
		getFilteredWeightOptions: (id, inherit) => getFilteredWeightOptions(id, {}, inherit),
	}));

	it('shows the help line under a paragraph style', () => {
		renderPanel({ styleOverrides: {}, resetStyleOverride: jest.fn() });
		expect(screen.getByText(HELP)).toBeTruthy();
	});

	it('control: no help line without a style', () => {
		renderPanel({ styleOverrides: null, resetStyleOverride: jest.fn() });
		expect(screen.getByRole('combobox', { name: 'Font Weight' })).toBeTruthy();
		expect(screen.queryByText(HELP)).toBeNull();
	});
});

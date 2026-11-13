/**
 * "Theme default" in the sidebar Font Weight select (#411 review): the
 * option list survives every weight filter, the select shows '' as "Theme
 * default" and '400' as 400, and choosing the option writes ''.
 */

jest.mock('@wordpress/components', () => {
	const React = require('react');
	return {
		PanelBody: ({ children }) => React.createElement('div', null, children),
		SelectControl: ({ value, options, onChange }) => React.createElement('select', {
			'aria-label': 'Font Weight',
			value,
			onChange: (event) => onChange(event.target.value),
		}, options.map((o) => React.createElement('option', { key: o.value, value: o.value }, o.label))),
	};
}, { virtual: true });

import { render, screen, fireEvent } from '@testing-library/react';
import { getFilteredWeightOptions } from '../utils';
import { buildSidebarWeightOptions, shouldShowWeightPanel, THEME_DEFAULT_WEIGHT } from '../strip-styles/theme-default-weight';
import renderFontWeightPanel from '../components/inspector/font-weight-panel';

const FONTS = {
	5: { availableWeights: ['400'] },
	6: { availableWeights: ['300', '700'] },
	7: { availableWeights: [] },
};

describe('buildSidebarWeightOptions', () => {
	it.each([
		['no font', 0, 9],
		['a font that is not in the map', 99, 9],
		['a font with no weight list', 7, 9],
		['a font with two weights', 6, 2],
		['a font with one weight', 5, 1],
	])('puts Theme default first for %s', (_, fontId, weights) => {
		const filtered = getFilteredWeightOptions(fontId, FONTS, false);
		const options = buildSidebarWeightOptions(filtered, 'Theme default');
		expect(options[0]).toEqual({ label: 'Theme default', value: '' });
		expect(options).toHaveLength(weights + 1);
		expect(options.slice(1)).toEqual(filtered);
	});

	it("uses '' as the value, the weight the strip writes", () => {
		expect(THEME_DEFAULT_WEIGHT).toBe('');
		expect(require('../../../assets/js/theme-look.js').THEME_LOOK_PLUGIN_ATTRIBUTES.fontWeight).toBe(THEME_DEFAULT_WEIGHT);
	});
});

describe('shouldShowWeightPanel: unchanged by the new option', () => {
	it('shows the panel for more than one weight only', () => {
		expect(shouldShowWeightPanel(getFilteredWeightOptions(0, FONTS, false))).toBe(true);
		expect(shouldShowWeightPanel(getFilteredWeightOptions(6, FONTS, false))).toBe(true);
		expect(shouldShowWeightPanel(getFilteredWeightOptions(5, FONTS, false))).toBe(false);
		expect(shouldShowWeightPanel(undefined)).toBe(false);
	});
});

describe('renderFontWeightPanel', () => {
	const renderPanel = (fontWeight, setAttributes = jest.fn(), fontId = 0) => {
		render(renderFontWeightPanel({
			fontId, fontVariationSettings: '', fontWeight, setAttributes,
			getFilteredWeightOptions: (id, inherit) => getFilteredWeightOptions(id, FONTS, inherit),
		}));
		return screen.getByRole('combobox', { name: 'Font Weight' });
	};

	it("shows Theme default for a block with no weight of its own ('')", () => {
		const select = renderPanel('');
		expect(select.value).toBe('');
		expect(select.options[select.selectedIndex].textContent).toBe('Theme default');
	});

	it("shows 400 for a block saved with the '400' default", () => {
		const select = renderPanel('400');
		expect(select.options[select.selectedIndex].textContent).toBe('400 (Normal)');
	});

	it("writes '' and nothing else when Theme default is chosen", () => {
		const setAttributes = jest.fn();
		fireEvent.change(renderPanel('700', setAttributes), { target: { value: '' } });
		expect(setAttributes).toHaveBeenCalledTimes(1);
		expect(setAttributes).toHaveBeenCalledWith({ fontWeight: '' });
	});

	it('has no panel for a font with one weight, as before', () => {
		const { container } = render(renderFontWeightPanel({
			fontId: 5, fontVariationSettings: '', fontWeight: '', setAttributes: jest.fn(),
			getFilteredWeightOptions: (id, inherit) => getFilteredWeightOptions(id, FONTS, inherit),
		}) || null);
		expect(container.innerHTML).toBe('');
	});
});

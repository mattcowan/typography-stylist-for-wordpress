/**
 * Tests for the pure helpers in assets/js/admin-page.js.
 *
 * The file's jQuery(document).ready block is inert under test: jQuery is
 * stubbed before require so loading the module only registers the exports.
 */

global.jQuery = jest.fn(() => ({ ready: jest.fn(), on: jest.fn() }));

const { formatDetectWeightsSummary } = require('../admin-page.js');

describe('formatDetectWeightsSummary', () => {
	const template = 'Weights detected for %1$s font(s); %2$s kept all weights; %3$s could not be checked.';

	test('fills all three counts from the response arrays', () => {
		const message = formatDetectWeightsSummary(
			{
				updated: [{ id: 'a' }, { id: 'b' }],
				defaulted: [{ id: 'c' }],
				failed: [],
			},
			template
		);

		expect(message).toBe('Weights detected for 2 font(s); 1 kept all weights; 0 could not be checked.');
	});

	test('treats missing arrays as zero', () => {
		expect(formatDetectWeightsSummary({}, template)).toBe(
			'Weights detected for 0 font(s); 0 kept all weights; 0 could not be checked.'
		);
		expect(formatDetectWeightsSummary(null, template)).toBe(
			'Weights detected for 0 font(s); 0 kept all weights; 0 could not be checked.'
		);
	});

	test('counts failed fonts', () => {
		const message = formatDetectWeightsSummary(
			{ updated: [], defaulted: [], failed: [{ id: 'x' }, { id: 'y' }] },
			template
		);

		expect(message).toBe('Weights detected for 0 font(s); 0 kept all weights; 2 could not be checked.');
	});
});

/**
 * Tests for the pure helpers in assets/js/admin-page.js.
 *
 * The file's jQuery(document).ready block is inert under test: jQuery is
 * stubbed before require so loading the module only registers the exports.
 */

global.jQuery = jest.fn(() => ({ ready: jest.fn(), on: jest.fn() }));

const {
	formatDetectWeightsSummary,
	mergeAdminRefreshData,
	resolvePreviewSelection,
} = require('../admin-page.js');

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

describe('mergeAdminRefreshData', () => {
	test('copies only the known data keys from the payload', () => {
		const adminData = {
			restUrl: '/wp-json/typost/v1/',
			fonts: [{ id: 'kit-1' }],
			adobeFonts: [],
			strings: { a: 'b' },
		};
		const payload = {
			fonts: [{ id: 'kit-1' }, { id: 'kit-2' }],
			adobeFonts: [{ id: 'adobe-1' }],
			manualFonts: [],
			fontFeatureVisibility: { 3: { disabled_features: ['liga'] } },
			fontOrder: ['font-2', 'font-1'],
			wpFontLibraryFonts: [{ slug: 'inter' }],
			fontListHtml: '<ul></ul>',
			adminFontCss: '@font-face {}',
		};

		mergeAdminRefreshData(adminData, payload);

		expect(adminData.fonts).toHaveLength(2);
		expect(adminData.adobeFonts).toEqual([{ id: 'adobe-1' }]);
		expect(adminData.manualFonts).toEqual([]);
		expect(adminData.fontFeatureVisibility).toEqual({ 3: { disabled_features: ['liga'] } });
		expect(adminData.fontOrder).toEqual(['font-2', 'font-1']);
		expect(adminData.wpFontLibraryFonts).toEqual([{ slug: 'inter' }]);
		// HTML/CSS payload members must not leak into typostAdmin
		expect(adminData.fontListHtml).toBeUndefined();
		expect(adminData.adminFontCss).toBeUndefined();
		// Unrelated existing keys are untouched
		expect(adminData.restUrl).toBe('/wp-json/typost/v1/');
		expect(adminData.strings).toEqual({ a: 'b' });
	});

	test('leaves keys absent from the payload unchanged', () => {
		const adminData = { fonts: [{ id: 'kit-1' }], manualFonts: [{ id: 'manual-9' }] };

		mergeAdminRefreshData(adminData, { fonts: [] });

		expect(adminData.fonts).toEqual([]);
		expect(adminData.manualFonts).toEqual([{ id: 'manual-9' }]);
	});

	test('tolerates null inputs', () => {
		expect(mergeAdminRefreshData(null, { fonts: [] })).toBeNull();
		const adminData = { fonts: [] };
		expect(mergeAdminRefreshData(adminData, null)).toBe(adminData);
	});
});

describe('resolvePreviewSelection', () => {
	const options = ['', 'Alfarn', 'Gopher', 'proxima-nova'];

	test('keeps the current selection when still available', () => {
		expect(resolvePreviewSelection('Gopher', options)).toBe('Gopher');
	});

	test('falls back to the first font when the selection was removed', () => {
		expect(resolvePreviewSelection('DeletedFont', options)).toBe('Alfarn');
	});

	test('auto-selects the first font when nothing was selected (mirrors page load)', () => {
		expect(resolvePreviewSelection('', options)).toBe('Alfarn');
	});

	test('returns the default when no fonts remain', () => {
		expect(resolvePreviewSelection('Gopher', [''])).toBe('');
		expect(resolvePreviewSelection('', [])).toBe('');
	});
});

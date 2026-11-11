/**
 * The inline style of the block's editing surface (editor-style.js, moved
 * out of Edit's buildStyle() in #356), and the feature category titles
 * (feature-categories.js).
 */

import buildEditorStyle from '../editor-style';
import getCategoryTitle from '../feature-categories';

const block = (overrides) => ({
	features: [],
	fontId: 0,
	fontFamily: '',
	fontWeight: '',
	fontStyle: '',
	letterSpacing: 0,
	lineHeight: 0,
	fontSize: 'inherit',
	fontSizeMin: 16,
	fontSizePreferred: 32,
	fontSizeMax: 64,
	sizePreviewUnit: 'rem',
	styleOverrides: null,
	fontVariationSettings: '',
	textAlign: '',
	initialHang: 0,
	textCase: '',
	fakeSmallCaps: true,
	...overrides,
});

describe('buildEditorStyle without a paragraph style', () => {
	it('writes nothing for a default block', () => {
		expect(buildEditorStyle(block())).toEqual({});
	});

	it('writes every set attribute', () => {
		const style = buildEditorStyle(block({
			features: ['liga', 'ss01'],
			fontId: 12,
			fontWeight: '700',
			fontStyle: 'italic',
			letterSpacing: 50,
			lineHeight: 1.4,
			fontVariationSettings: '"wght" 650',
			textAlign: 'center',
			initialHang: 0.2,
		}));
		expect(style).toEqual({
			fontFeatureSettings: '"liga" 1, "ss01" 1',
			fontFamily: 'var(--font-12)',
			fontWeight: '700',
			fontStyle: 'italic',
			letterSpacing: '0.05em',
			lineHeight: 1.4,
			fontVariationSettings: '"wght" 650',
			textAlign: 'center',
			'--typost-hang': '0.2',
		});
	});

	it('uses a clamp for responsive and fit sizes, in the preview unit', () => {
		expect(buildEditorStyle(block({ fontSize: 'responsive' })).fontSize).toMatch(/^clamp\(1rem, /);
		expect(buildEditorStyle(block({ fontSize: 'fit', sizePreviewUnit: 'px' })).fontSize).toMatch(/^clamp\(16px, /);
	});

	it('writes a fixed size as a length, and no size for 0', () => {
		expect(buildEditorStyle(block({ fontSize: '24', sizePreviewUnit: 'px' })).fontSize).toBe('24px');
		expect(buildEditorStyle(block({ fontSize: '24' })).fontSize).toBe('1.5rem');
		expect(buildEditorStyle(block({ fontSize: '0' })).fontSize).toBeUndefined();
	});

	it('renders the case', () => {
		expect(buildEditorStyle(block({ textCase: 'uppercase' }))).toMatchObject({ textTransform: 'uppercase' });
	});
});

describe('buildEditorStyle under a paragraph style', () => {
	it('writes only the attributes that differ from the style', () => {
		const style = buildEditorStyle(block({
			features: ['liga'],
			fontWeight: '700',
			letterSpacing: 20,
			styleOverrides: { letterSpacing: true },
		}));
		expect(style).toEqual({ letterSpacing: '0.02em' });
	});

	it('writes a hang override even at 0, so the block can cancel the style', () => {
		expect(buildEditorStyle(block({ styleOverrides: { initialHang: true } }))['--typost-hang']).toBe('0');
	});

	it('previews a case override back to Default as Normal', () => {
		expect(buildEditorStyle(block({ styleOverrides: { textCase: true } }))).toMatchObject({ textTransform: 'none' });
	});

	it('always writes the alignment', () => {
		expect(buildEditorStyle(block({ textAlign: 'right', styleOverrides: {} }))).toEqual({ textAlign: 'right' });
	});
});

describe('getCategoryTitle', () => {
	it('names the known categories and passes others through', () => {
		expect(getCategoryTitle('stylistic-sets')).toBe('Stylistic Sets');
		expect(getCategoryTitle('other')).toBe('Other Features');
		expect(getCategoryTitle('unknown-thing')).toBe('unknown-thing');
	});
});

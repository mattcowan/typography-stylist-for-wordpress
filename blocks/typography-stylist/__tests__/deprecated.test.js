/**
 * Typography Stylist Block - Deprecation Tests
 *
 * v1 is the frozen pre-fit-to-width save. Two guarantees:
 * 1. For every non-fit attribute set, the CURRENT save renders output
 *    identical to v1 — existing published blocks validate against the
 *    current save directly and never need the deprecation.
 * 2. The v1 attribute schema carries no fit keys (matching what blocks
 *    saved before the feature actually stored).
 */

import { create } from 'react-test-renderer';

jest.mock('@wordpress/block-editor');

import save from '../save';
import deprecated from '../deprecated';

const v1 = deprecated[0];

describe('Typography Stylist - deprecated save (v1, pre-fit)', () => {

	const attributeMatrix = [
		{
			label: 'minimal inherit block',
			attributes: {
				content: 'Headline',
				tagName: 'h2',
				features: [],
				screenReaderClass: 'visually-hidden',
				fontSize: 'inherit',
				fontWeight: '400',
				letterSpacing: 0,
				lineHeight: 0
			}
		},
		{
			label: 'responsive block with font and features',
			attributes: {
				content: '<span class="typost-styled" data-features="swsh" style="font-feature-settings: &quot;swsh&quot; 1">Swash</span> text<br>second line',
				tagName: 'h1',
				features: ['liga', 'dlig'],
				fontFamily: 'Fraunces',
				fontId: 12,
				screenReaderClass: 'sr-only',
				fontSize: 'responsive',
				fontSizeMin: 13,
				fontSizePreferred: 29,
				fontSizeMax: 42,
				fontWeight: '500',
				fontStyle: 'italic',
				letterSpacing: 50,
				lineHeight: 1.5,
				textAlign: 'center',
				fontVariationSettings: '"wght" 500'
			}
		},
		{
			label: 'styleClass block (class-based styling)',
			attributes: {
				content: 'Styled by class',
				tagName: 'h3',
				features: ['ss01'],
				screenReaderClass: 'visually-hidden',
				fontSize: 'inherit',
				fontWeight: '400',
				letterSpacing: 0,
				lineHeight: 0,
				styleClass: 'typost-ps-3',
				textAlign: 'right',
				layeredConfigId: 2,
				animationConfigId: 1
			}
		}
	];

	it.each(attributeMatrix)('current save matches v1 save for $label', ({ attributes }) => {
		const current = create(save({ attributes })).toJSON();
		const legacy = create(v1.save({ attributes })).toJSON();
		expect(JSON.stringify(current)).toBe(JSON.stringify(legacy));
	});

	it('v1 attributes contain no fit keys', () => {
		expect(v1.attributes.fitLineSizes).toBeUndefined();
		expect(v1.attributes.fitMaxSize).toBeUndefined();
		// Sanity: the schema still covers the long-standing attributes
		expect(v1.attributes.fontSize).toEqual({ type: 'string', default: 'inherit' });
		expect(v1.attributes.content).toEqual({ type: 'string', default: '' });
	});

	it('v1 save renders the dual-heading structure', () => {
		const tree = create(v1.save({ attributes: attributeMatrix[0].attributes })).toJSON();
		expect(tree.type).toBe('div');
		expect(tree.props.className).toBe('wp-block-typost');
		expect(tree.children).toHaveLength(2);
		expect(tree.children[1].props['aria-hidden']).toBe('true');
	});
});

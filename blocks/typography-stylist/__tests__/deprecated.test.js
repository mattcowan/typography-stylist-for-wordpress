/**
 * Typography Stylist Block - Deprecation Tests
 *
 * v1 is the frozen pre-fit-to-width save. Three guarantees:
 * 1. For inherit and responsive sizes, and for any block with a
 *    styleClass, the CURRENT save renders output identical to v1 —
 *    those published blocks validate against the current save directly.
 * 2. A fixed px size with no styleClass is the exception (#218): the
 *    current save writes the size and v1 does not, so blocks saved before
 *    the fix validate through v1 and are upgraded on the next save.
 * 3. The v1 attribute schema carries the fit keys. v1Save never reads
 *    them, but core drops attributes missing from the schema, so a fixed
 *    px block upgraded through v1 would lose a stored fit cap.
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
		},
		{
			label: 'fixed size "0" with no styleClass (zero means no size)',
			attributes: {
				content: 'Zero size',
				tagName: 'h2',
				features: [],
				screenReaderClass: 'visually-hidden',
				fontSize: '0',
				fontWeight: '400',
				letterSpacing: 0,
				lineHeight: 0,
				styleClass: ''
			}
		},
		{
			label: 'styleClass block with a fixed px size (the class renders the size)',
			attributes: {
				content: 'Styled by class',
				tagName: 'h2',
				features: [],
				screenReaderClass: 'visually-hidden',
				fontSize: '24',
				fontWeight: '400',
				letterSpacing: 0,
				lineHeight: 0,
				styleClass: 'typost-ps-4'
			}
		}
	];

	it.each(attributeMatrix)('current save matches v1 save for $label', ({ attributes }) => {
		const current = create(save({ attributes })).toJSON();
		const legacy = create(v1.save({ attributes })).toJSON();
		expect(JSON.stringify(current)).toBe(JSON.stringify(legacy));
	});

	// A paragraph style saved in the inline editor stores a fixed px size.
	// After Detach (or after a deleted style's class is cleared) the block
	// keeps that size with no styleClass.
	const fixedPxAttributes = {
		content: 'Detached headline',
		tagName: 'h2',
		features: [],
		screenReaderClass: 'visually-hidden',
		fontSize: '24',
		fontWeight: '400',
		letterSpacing: 0,
		lineHeight: 0,
		styleClass: ''
	};

	it('current save differs from v1 save for a fixed px block (#218)', () => {
		const current = create(save({ attributes: fixedPxAttributes })).toJSON();
		const legacy = create(v1.save({ attributes: fixedPxAttributes })).toJSON();
		expect(JSON.stringify(current)).not.toBe(JSON.stringify(legacy));
		expect(current.children[1].props.style.fontSize).toBe('24px');
	});

	it('v1 save keeps the pre-fix output for a fixed px block (validation path for old posts)', () => {
		const current = create(save({ attributes: fixedPxAttributes })).toJSON();
		const legacy = create(v1.save({ attributes: fixedPxAttributes })).toJSON();
		expect(legacy.children[1].props.style.fontSize).toBeUndefined();
		// Removing the new declaration from the current output gives exactly
		// what v1 renders, so stored pre-fix HTML still matches v1.
		const { fontSize, ...currentWithoutSize } = current.children[1].props.style;
		expect(currentWithoutSize).toEqual(legacy.children[1].props.style);
		expect(JSON.stringify({ ...current, children: [current.children[0], { ...current.children[1], props: { ...current.children[1].props, style: currentWithoutSize } }] }))
			.toBe(JSON.stringify(legacy));
	});

	// Core does not carry the current apiVersion into a deprecated entry.
	// Without it, core treats v1 as API version 1, adds the generated
	// `wp-block-typost-block` root class, and v1 never matches stored HTML.
	it('v1 declares the same apiVersion as block.json', () => {
		const blockJson = require('../block.json');
		expect(v1.apiVersion).toBe(blockJson.apiVersion);
	});

	// Core keeps only the attributes in a deprecation's schema. A fixed px
	// block that validates through v1 must keep any stored fit keys.
	it('v1 attributes carry the fit keys with the block.json schema', () => {
		const blockJson = require('../block.json');
		expect(v1.attributes.fitLineSizes).toEqual(blockJson.attributes.fitLineSizes);
		expect(v1.attributes.fitMaxSize).toEqual(blockJson.attributes.fitMaxSize);
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

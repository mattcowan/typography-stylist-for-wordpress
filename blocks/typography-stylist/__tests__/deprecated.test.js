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
 *
 * The v1 comparisons below render the current save without fontSizeUnit,
 * which is the px path: a block that validates through v1 is migrated to
 * fontSizeUnit 'px' (#233), so px is the output it is re-saved with.
 *
 * v2 is the frozen pre-rem save (#233); see its own describe block.
 */

import { create } from 'react-test-renderer';

jest.mock('@wordpress/block-editor');

import save from '../save';
import deprecated from '../deprecated';

// Core tries the entries in order: v2 first, then v1
const v2 = deprecated[0];
const v1 = deprecated[1];

const render = (saveFn, attributes) => JSON.stringify(create(saveFn({ attributes })).toJSON());

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

	it('v1 migrates blocks to px sizes (#233)', () => {
		expect(v1.migrate({ content: 'Old', fontSize: '24' })).toEqual({ content: 'Old', fontSize: '24', fontSizeUnit: 'px' });
	});
});

describe('Typography Stylist - deprecated save (v2, pre-rem #233)', () => {
	const base = {
		content: 'Headline',
		tagName: 'h2',
		features: [],
		fontFamily: '',
		fontId: 0,
		fontSize: 'inherit',
		fontSizeMin: 16,
		fontSizePreferred: 32,
		fontSizeMax: 64,
		fitLineSizes: [],
		fitMaxSize: 0,
		initialHang: 0,
		fitLineHangs: [],
		fontWeight: '400',
		fontStyle: '',
		letterSpacing: 0,
		lineHeight: 0,
		screenReaderClass: 'visually-hidden',
		styleClass: '',
		fontVariationSettings: '',
		layeredConfigId: 0,
		animationConfigId: 0
	};

	// Blocks with a size and no styleClass: the stored markup is px, and the
	// current save (default unit rem) writes something else, so they must
	// validate through v2.
	const sizedMatrix = [
		{ label: 'responsive 16/32/64', attributes: { ...base, fontSize: 'responsive' } },
		{ label: 'responsive 13/29/42 with a font, features and a hang', attributes: { ...base, fontSize: 'responsive', fontSizeMin: 13, fontSizePreferred: 29, fontSizeMax: 42, fontId: 12, features: ['swsh'], initialHang: 0.25, textAlign: 'left' } },
		{ label: 'fixed 24', attributes: { ...base, fontSize: '24' } },
		{ label: 'fixed 36.5', attributes: { ...base, fontSize: '36.5' } },
		{ label: 'fit with a cap, line sizes and line hangs', attributes: { ...base, fontSize: 'fit', content: 'Moonlit<br>Garden<br>Party', fitLineSizes: [0.125, 0.3003, 0.2], fitMaxSize: 96, fitLineHangs: [0, 0.1, 0] } },
		{ label: 'fit without a cap', attributes: { ...base, fontSize: 'fit', content: 'One<br>Two', fitLineSizes: [0.2, 0.3] } }
	];

	// Blocks that write no size: identical under both units, so they
	// validate against the current save directly and keep the rem default.
	const unsizedMatrix = [
		{ label: 'inherit', attributes: { ...base } },
		{ label: 'inherit with a hang', attributes: { ...base, initialHang: 0.3 } },
		{ label: 'responsive with a styleClass', attributes: { ...base, fontSize: 'responsive', styleClass: 'typost-ps-3' } },
		{ label: 'fixed 24 with a styleClass', attributes: { ...base, fontSize: '24', styleClass: 'typost-ps-4' } },
		{ label: 'fixed "0" (zero means no size)', attributes: { ...base, fontSize: '0' } }
	];

	it.each(sizedMatrix)('v2 matches the current save in px for $label (re-save after migrate is unchanged)', ({ attributes }) => {
		expect(render(save, { ...attributes, fontSizeUnit: 'px' })).toBe(render(v2.save, attributes));
	});

	it.each(sizedMatrix)('the current save in rem differs from v2 for $label (so the block validates through v2)', ({ attributes }) => {
		expect(render(save, { ...attributes, fontSizeUnit: 'rem' })).not.toBe(render(v2.save, attributes));
	});

	it.each(unsizedMatrix)('the current save in rem matches v2 for $label (validates directly)', ({ attributes }) => {
		expect(render(save, { ...attributes, fontSizeUnit: 'rem' })).toBe(render(v2.save, attributes));
	});

	it('v2 writes the pre-rem px output', () => {
		const responsive = create(v2.save({ attributes: { ...base, fontSize: 'responsive' } })).toJSON();
		expect(responsive.children[1].props.style.fontSize).toBe('clamp(16px, 2rem + 3vw, 64px)');
		const fixed = create(v2.save({ attributes: { ...base, fontSize: '24' } })).toJSON();
		expect(fixed.children[1].props.style.fontSize).toBe('24px');
		const fit = create(v2.save({ attributes: { ...base, fontSize: 'fit', content: 'A', fitLineSizes: [0.2], fitMaxSize: 96 } })).toJSON();
		expect(fit.children[1].children[0]).toBe('<span class="typost-line" style="font-size:min(calc(0.2 * 100cqi), 96px)">A</span>');
	});

	it('v2 migrates blocks to px sizes and keeps every other attribute', () => {
		const attributes = { ...base, fontSize: 'fit', fitMaxSize: 96, fitLineSizes: [0.2], fitLineHangs: [0, 0.1] };
		expect(v2.migrate(attributes)).toEqual({ ...attributes, fontSizeUnit: 'px' });
	});

	// Same core trap as v1: without apiVersion the root gets an extra class
	it('v2 declares the same apiVersion as block.json', () => {
		const blockJson = require('../block.json');
		expect(v2.apiVersion).toBe(blockJson.apiVersion);
	});

	// Core keeps only the attributes in a deprecation's schema, so v2 must
	// carry every attribute the pre-rem block had (fit, hang, extensions).
	// When block.json gains an attribute this fails on purpose: decide
	// whether v2 needs it (it never writes it) before excluding it here.
	it('v2 attributes are the block.json schema without fontSizeUnit', () => {
		const blockJson = require('../block.json');
		const { fontSizeUnit, ...withoutUnit } = blockJson.attributes;
		expect(fontSizeUnit).toEqual({ type: 'string', enum: ['px', 'rem'], default: 'rem' });
		expect(v2.attributes).toEqual(withoutUnit);
	});

	it('v2 supports match block.json', () => {
		const blockJson = require('../block.json');
		expect(v2.supports).toEqual(blockJson.supports);
	});
});

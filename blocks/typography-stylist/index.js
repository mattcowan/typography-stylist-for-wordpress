/**
 * Typography Stylist Block - Main Entry Point
 *
 * This is registered via register_block_type() in PHP,
 * but we need to import and use the edit/save functions here.
 */

import { registerBlockType, createBlock } from '@wordpress/blocks';
import Edit from './edit';
import save from './save';
import deprecated from './deprecated';
import { analyzeInlineFeatures, stripInlineFeatures, detectBlockComputedWeight } from './utils';

/**
 * The weight the block being transformed is currently rendering at.
 *
 * A core heading is bold because the theme styles h2, not because of any
 * stored attribute — and this block's fontWeight defaults to 400, which save
 * always emits, so a plain transform visibly lightens the heading. Transforms
 * only receive attributes, so the source block is located through the
 * selection, which is what the block menu acts on.
 *
 * Returns undefined (leave the default alone) when the source cannot be
 * identified with certainty — a multi-block transform, or a DOM node that
 * isn't there.
 *
 * @return {string|undefined} Weight attribute to apply, or undefined
 */
const inheritedWeightForTransform = () => {
	try {
		const blockEditor = wp.data.select('core/block-editor');
		const selected = blockEditor.getSelectedBlockClientIds
			? blockEditor.getSelectedBlockClientIds()
			: [];
		if (!selected || selected.length !== 1) {
			return undefined;
		}
		return detectBlockComputedWeight(selected[0], 'h1,h2,h3,h4,h5,h6,p') || undefined;
	} catch (error) {
		return undefined;
	}
};

/** Spread helper: only set fontWeight when one was detected. */
const inheritedWeightAttrs = () => {
	const fontWeight = inheritedWeightForTransform();
	return fontWeight ? { fontWeight } : {};
};

// Custom "T" icon for Typography Stylist
const TSIcon = () => (
	<svg width={20} height={20} viewBox="0 0 1067 1067" xmlns="http://www.w3.org/2000/svg">
		<path d="M22.621,323.219c0,116.595 86.232,204.042 200.398,204.042c81.374,0 134.814,-41.294 134.814,-100.806c0,-36.436 -26.72,-68.014 -66.799,-68.014c-71.658,0 -75.301,80.159 -122.668,80.159c-54.654,0 -87.447,-58.298 -87.447,-115.381c0,-78.945 52.225,-137.243 156.675,-137.243c78.945,0 162.748,29.149 250.194,59.512l0,647.348c0,92.305 -20.647,99.592 -117.81,105.665l0,30.363l355.859,0l0,-30.363c-97.163,-6.073 -117.81,-13.36 -117.81,-105.665l0,-609.697c65.585,20.647 133.599,36.436 206.471,36.436c144.53,0 229.547,-83.803 229.547,-184.609c0,-57.083 -32.792,-97.163 -80.159,-97.163c-40.08,0 -72.872,27.934 -72.872,69.229c0,49.796 42.509,65.585 42.509,100.806c0,36.436 -38.865,58.298 -106.879,58.298c-136.028,0 -329.139,-171.25 -534.396,-171.25c-173.679,0 -269.627,109.308 -269.627,228.333Z" fill="currentColor"/>
	</svg>
);

// Register the block
registerBlockType('typost/block', {
	icon: TSIcon,
	edit: Edit,
	save: save,
	deprecated: deprecated,
	transforms: {
		from: [
			{
				type: 'block',
				blocks: ['core/paragraph'],
				transform: (attributes) => {
					// Analyze inline features to determine conversion strategy
					const analysis = analyzeInlineFeatures(attributes.content);

					// Read the rendered weight before the source block leaves the DOM
					const inherited = inheritedWeightAttrs();

					if (analysis.shouldExtractToBlock) {
						// Full coverage with uniform features - extract to block level
						return createBlock('typost/block', {
							content: stripInlineFeatures(attributes.content),
							tagName: 'p',
							features: analysis.commonFeatures,
							...inherited
						});
					}

					// Partial coverage or mixed features - preserve inline spans
					return createBlock('typost/block', {
						content: attributes.content,
						tagName: 'p',
						features: [],
						...inherited
					});
				},
			},
			{
				type: 'block',
				blocks: ['core/heading'],
				transform: (attributes) => {
					// Analyze inline features to determine conversion strategy
					const analysis = analyzeInlineFeatures(attributes.content);

					// Read the rendered weight before the source block leaves the
					// DOM — a theme-bold heading would otherwise convert to the
					// block's default 400 and visibly lighten.
					const inherited = inheritedWeightAttrs();

					if (analysis.shouldExtractToBlock) {
						// Full coverage with uniform features - extract to block level
						return createBlock('typost/block', {
							content: stripInlineFeatures(attributes.content),
							tagName: 'h' + attributes.level,
							features: analysis.commonFeatures,
							...inherited
						});
					}

					// Partial coverage or mixed features - preserve inline spans
					return createBlock('typost/block', {
						content: attributes.content,
						tagName: 'h' + attributes.level,
						features: [],
						...inherited
					});
				},
			},
		],
		to: [
			{
				type: 'block',
				blocks: ['core/paragraph'],
				transform: (attributes) => {
					return createBlock('core/paragraph', {
						content: attributes.content
					});
				},
			},
			{
				type: 'block',
				blocks: ['core/heading'],
				transform: (attributes) => {
					// Extract heading level from tagName (h1, h2, etc.)
					const level = parseInt(attributes.tagName?.replace('h', '')) || 2;
					return createBlock('core/heading', {
						content: attributes.content,
						level: level
					});
				},
			},
		],
	},
});

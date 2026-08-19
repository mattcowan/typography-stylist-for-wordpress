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

/**
 * Block icon: the "TS" monogram — a swash T over a swash S. This identifies
 * the block itself (inserter, list view, block switcher), so it must stay in
 * sync with the `icon.src` in block.json, which is what WordPress uses server
 * side before this script runs. Source: assets/images/icons/block.svg.
 *
 * NOT the same mark as the `TSIcon` in edit.js, which is the swash T that
 * launches the Quick Feature Toggle popover. Same name, two different jobs.
 */
const TSIcon = () => (
	<svg width={24} height={24} viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
		<path d="M69.46,29.28c40.23,0,70.02,34.14,93.94,34.14,10.22,0,15-3.91,15-9.79,0-8.05-8.92-12.18-8.92-23.27,0-9.13,7.39-16.53,17.83-16.53,11.31,0,19.79,10,19.79,21.96,0,22.83-19.14,42.19-49.8,42.19-8.7,0-17.61-1.52-26.31-3.91v98.07c0,12.39,3.26,14.13,17.18,15.22v9.13h-72.85v-9.13c13.92-1.09,17.18-2.83,17.18-15.22V62.55c-14.35-4.57-27.4-8.92-37.4-8.92-16.74,0-27.18,8.26-27.18,23.27,0,7.39,3.7,13.92,9.79,13.92,7.83,0,9.57-12.83,23.7-12.83,9.57,0,17.18,7.83,17.18,17.4,0,13.05-10.22,22.4-26.96,22.4-20.22,0-38.71-14.35-38.71-40.88,0-29.14,27.62-47.62,56.54-47.62Z" fill="currentColor"/>
		<path d="M240.81,191.72c0,22.4-17.83,48.06-54.15,48.06-26.31,0-47.19-12.61-47.19-35.23,0-15.44,13.7-29.14,32.18-29.14,15,0,25.66,10.87,25.66,21.53,0,8.26-4.78,13.92-12.83,13.92-14.13,0-8.7-16.96-19.79-16.96-6.31,0-9.57,4.78-9.57,10.66,0,14.79,14.35,22.62,26.53,22.62,20.01,0,28.92-14.79,28.92-27.62,0-41.32-65.45-32.4-65.45-73.72,0-19.79,18.27-32.84,41.97-32.84,14.57,0,23.05,4.35,29.57,8.92l2.61-5.65h8.05l6.52,35.44-8.05,2.39c-8.92-19.79-22.83-28.92-34.14-28.92-8.26,0-14.35,3.91-14.35,11.74,0,23.49,63.5,21.53,63.5,74.8Z" fill="currentColor"/>
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

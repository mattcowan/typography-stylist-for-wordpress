/**
 * OpenType Stylist Block - Main Entry Point
 *
 * This is registered via register_block_type() in PHP,
 * but we need to import and use the edit/save functions here.
 */

import { registerBlockType, createBlock } from '@wordpress/blocks';
import Edit from './edit';
import save from './save';
import { analyzeInlineFeatures, stripInlineFeatures } from './utils';

// Custom "O" icon for OpenType Stylist
const OTSIcon = () => (
	<svg width={24} height={24} viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
		<g>
			<path d="M95.72,23.871C74.545,42.158,63.316,75.524,63.316,131.028c0,57.75,15.4,99.778,63.524,99.778c47.804,0,63.524-42.028,63.524-99.778c0-58.07-17.004-97.854-50.691-97.854c-19.891,0-35.933,14.438-35.933,37.537c0,15.4,6.737,25.346,17.004,25.346c11.55,0,13.154-8.983,23.741-8.983c13.154,0,21.496,9.946,21.496,22.458c0,15.4-12.513,25.987-33.688,25.987c-25.346,0-48.445-21.816-48.445-57.107c0-38.5,28.233-64.487,63.524-64.487c48.445,0,91.116,47.804,91.116,117.104c0,69.3-42.35,117.104-111.649,117.104c-69.62,0-111.649-47.804-111.649-117.104c0-67.695,38.5-101.062,76.358-114.537L95.72,23.871z" fill="currentColor" />
		</g>
	</svg>
);

// Register the block
registerBlockType('opentype-stylist/block', {
	icon: OTSIcon,
	edit: Edit,
	save: save,
	transforms: {
		from: [
			{
				type: 'block',
				blocks: ['core/paragraph'],
				transform: (attributes) => {
					// Analyze inline features to determine conversion strategy
					const analysis = analyzeInlineFeatures(attributes.content);

					if (analysis.shouldExtractToBlock) {
						// Full coverage with uniform features - extract to block level
						return createBlock('opentype-stylist/block', {
							content: stripInlineFeatures(attributes.content),
							tagName: 'p',
							features: analysis.commonFeatures
						});
					}

					// Partial coverage or mixed features - preserve inline spans
					return createBlock('opentype-stylist/block', {
						content: attributes.content,
						tagName: 'p',
						features: []
					});
				},
			},
			{
				type: 'block',
				blocks: ['core/heading'],
				transform: (attributes) => {
					// Analyze inline features to determine conversion strategy
					const analysis = analyzeInlineFeatures(attributes.content);

					if (analysis.shouldExtractToBlock) {
						// Full coverage with uniform features - extract to block level
						return createBlock('opentype-stylist/block', {
							content: stripInlineFeatures(attributes.content),
							tagName: 'h' + attributes.level,
							features: analysis.commonFeatures
						});
					}

					// Partial coverage or mixed features - preserve inline spans
					return createBlock('opentype-stylist/block', {
						content: attributes.content,
						tagName: 'h' + attributes.level,
						features: []
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

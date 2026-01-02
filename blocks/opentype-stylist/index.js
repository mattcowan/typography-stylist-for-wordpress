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

// Register the block
registerBlockType('opentype-stylist/block', {
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

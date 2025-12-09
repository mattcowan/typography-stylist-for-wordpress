/**
 * OpenType Stylist Block - Main Entry Point
 *
 * This is registered via register_block_type() in PHP,
 * but we need to import and use the edit/save functions here.
 */

import { registerBlockType, createBlock } from '@wordpress/blocks';
import Edit from './edit';
import save from './save';

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
					return createBlock('opentype-stylist/block', {
						content: attributes.content,
						tagName: 'p'
					});
				},
			},
			{
				type: 'block',
				blocks: ['core/heading'],
				transform: (attributes) => {
					return createBlock('opentype-stylist/block', {
						content: attributes.content,
						tagName: 'h' + attributes.level
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

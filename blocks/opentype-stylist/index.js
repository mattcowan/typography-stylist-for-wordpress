/**
 * OpenType Stylist Block - Main Entry Point
 *
 * This is registered via register_block_type() in PHP,
 * but we need to import and use the edit/save functions here.
 */

import { registerBlockType } from '@wordpress/blocks';
import Edit from './edit';
import save from './save';

// Register the block
registerBlockType('opentype-stylist/block', {
	edit: Edit,
	save: save,
});

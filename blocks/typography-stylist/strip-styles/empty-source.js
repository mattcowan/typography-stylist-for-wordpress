/**
 * Typography Stylist Block - a block made from an empty Paragraph or Heading
 * gets the theme's look (#412).
 *
 * The block transforms in index.js already build such a block with only its
 * tag and size unit. WordPress then runs its
 * `blocks.switchToBlockType.transformedBlock` filters on the result, and
 * since WordPress 6.1 some of them copy the source block's extra CSS class
 * (a paragraph style on a core block is such a class, #219) and its text and
 * background colors to the new block (core/customClassName/addTransforms,
 * core/color/addTransforms; read in WordPress 7.1.3). This filter runs after
 * them and takes those settings away again, for an empty source only.
 *
 * The filter itself exists since WordPress 5.8 (Gutenberg 10.7,
 * packages/blocks/src/api/factory.js), with the arguments
 * (result, source blocks, index, results).
 */

import { buildThemeLookAttributes, isEmptyBlockContent } from '../../../assets/js/theme-look.js';

// The blocks the block's own transforms convert from (index.js)
const EMPTY_SOURCE_BLOCKS = ['core/paragraph', 'core/heading'];

/**
 * Filter callback for `blocks.switchToBlockType.transformedBlock`.
 *
 * Acts only when one empty core Paragraph or Heading became one Typography
 * Stylist block. Every other transform, and a source with text, is returned
 * unchanged. Kept from the result: the tag, the size unit, and WordPress's
 * metadata (block name, notes, visibility), which is not styling.
 *
 * @param {Object}         result  The transformed block
 * @param {Object|Array}   source  The source block or blocks
 * @param {number}         index   Index of result in results
 * @param {Array}          results Every transformed block
 * @return {Object} The block, with the theme's look when the source was empty
 */
export function resetEmptySourceBlock(result, source, index, results) {
	if (!result || result.name !== 'typost/block' || !result.attributes) {
		return result;
	}
	const sources = Array.isArray(source) ? source : [source];
	if (sources.length !== 1 || (Array.isArray(results) && results.length !== 1)) {
		return result;
	}
	const from = sources[0];
	if (!from || !EMPTY_SOURCE_BLOCKS.includes(from.name) || !from.attributes) {
		return result;
	}
	if (!isEmptyBlockContent(from.attributes.content)) {
		return result;
	}
	return {
		...result,
		attributes: {
			...result.attributes,
			...buildThemeLookAttributes(),
			content: ''
		}
	};
}

export default resetEmptySourceBlock;

/**
 * Convert-to-block capability resolution
 *
 * Pure helpers behind the inline editor's "Convert to Typography Stylist
 * Block" action. Kept free of wp.data / wp.i18n so both the inline editor
 * and the unit tests can exercise the real logic: callers gather the raw
 * editor facts (block name, canRemoveBlock, canInsertBlockType, the parent
 * block's title) and this module decides whether the action is offered and,
 * when it is not, WHY.
 *
 * The "why" matters. Before 2.0 the modal explained that a conversion was
 * impossible; the 2.0 UX overhaul reduced that to hiding the button, which
 * reads as a bug rather than a constraint — most commonly when the block
 * sits inside a parent that restricts its allowed inner blocks.
 *
 * @package Typography_Stylist
 * @since 2.3.0
 */

/**
 * Block names the inline editor knows how to convert.
 *
 * Conversion rewrites the block as typost/block and carries the tag over
 * (core/heading keeps its level, core/paragraph becomes a p), so only these
 * two have a meaningful mapping.
 *
 * @type {string[]}
 */
var CONVERTIBLE_BLOCKS = ['core/heading', 'core/paragraph'];

/**
 * Reason codes returned alongside a false capability.
 *
 * - none    Conversion is available (no reason).
 * - unsupported  The selected block is not a convertible type (or none is selected).
 * - already      The selection is already inside a Typography Stylist block.
 * - locked       The block cannot be removed (locked, or a locked template/pattern).
 * - parent       The parent block does not allow typost/block among its children.
 *
 * @type {object}
 */
var CONVERT_BLOCKED = {
	NONE: 'none',
	UNSUPPORTED: 'unsupported',
	ALREADY: 'already',
	LOCKED: 'locked',
	PARENT: 'parent'
};

/**
 * Decide whether the current selection can be converted to a typost/block.
 *
 * Order matters: "already a Typography Stylist block" and "not a convertible
 * block type" are reported ahead of the capability checks, because those are
 * statements about the selection rather than about a restriction the user
 * might want to lift.
 *
 * @param {object}  facts                Raw editor facts.
 * @param {string}  facts.blockName      Selected block name ('' when nothing is selected).
 * @param {boolean} facts.canRemove      Result of canRemoveBlock() for the selected block.
 * @param {boolean} facts.canInsert      Result of canInsertBlockType('typost/block', rootClientId).
 * @param {string}  [facts.parentTitle]  Human title of the parent block, when there is a parent.
 * @return {{canConvert: boolean, reason: string, parentTitle: string}} Capability result.
 */
function resolveConvertCapability(facts) {
	var info = facts || {};
	var blockName = info.blockName || '';
	var parentTitle = info.parentTitle || '';

	if (blockName === 'typost/block') {
		return { canConvert: false, reason: CONVERT_BLOCKED.ALREADY, parentTitle: parentTitle };
	}

	if (CONVERTIBLE_BLOCKS.indexOf(blockName) === -1) {
		return { canConvert: false, reason: CONVERT_BLOCKED.UNSUPPORTED, parentTitle: parentTitle };
	}

	if (!info.canRemove) {
		return { canConvert: false, reason: CONVERT_BLOCKED.LOCKED, parentTitle: parentTitle };
	}

	if (!info.canInsert) {
		return { canConvert: false, reason: CONVERT_BLOCKED.PARENT, parentTitle: parentTitle };
	}

	return { canConvert: true, reason: CONVERT_BLOCKED.NONE, parentTitle: parentTitle };
}

/**
 * Whether a blocked conversion is worth explaining to the user.
 *
 * "Already a Typography Stylist block" and "not a convertible block type"
 * are non-events — the user did not ask for a conversion and nothing is
 * missing from the UI. Only the two capability failures get a message,
 * because in those cases the action the user expected really is absent.
 *
 * @param {string} reason Reason code from resolveConvertCapability().
 * @return {boolean} True when the modal should explain the omission.
 */
function shouldExplainConvertBlock(reason) {
	return reason === CONVERT_BLOCKED.LOCKED || reason === CONVERT_BLOCKED.PARENT;
}

module.exports = {
	CONVERTIBLE_BLOCKS: CONVERTIBLE_BLOCKS,
	CONVERT_BLOCKED: CONVERT_BLOCKED,
	resolveConvertCapability: resolveConvertCapability,
	shouldExplainConvertBlock: shouldExplainConvertBlock
};

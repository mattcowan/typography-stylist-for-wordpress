/**
 * Tests for the convert-to-block capability resolver
 * (assets/js/convert-capability.js) used by the inline editor to decide
 * whether the "Convert to Typography Stylist Block" action is offered, and
 * what to say when it is not.
 */

const {
	CONVERT_BLOCKED,
	CONVERTIBLE_BLOCKS,
	resolveConvertCapability,
	shouldExplainConvertBlock,
} = require('../../../assets/js/convert-capability.js');

const allowed = {
	blockName: 'core/heading',
	canRemove: true,
	canInsert: true,
	parentTitle: '',
};

describe('resolveConvertCapability', () => {
	it('allows conversion for a removable heading in a permissive parent', () => {
		const result = resolveConvertCapability(allowed);

		expect(result.canConvert).toBe(true);
		expect(result.reason).toBe(CONVERT_BLOCKED.NONE);
	});

	it('allows conversion for a paragraph', () => {
		const result = resolveConvertCapability({ ...allowed, blockName: 'core/paragraph' });

		expect(result.canConvert).toBe(true);
		expect(result.reason).toBe(CONVERT_BLOCKED.NONE);
	});

	it('reports a parent restriction when the block cannot be inserted', () => {
		// The real-world case: a heading inside a block whose allowedBlocks
		// list omits typost/block, so canInsertBlockType() is false.
		const result = resolveConvertCapability({
			...allowed,
			canInsert: false,
			parentTitle: 'Shape Wrap',
		});

		expect(result.canConvert).toBe(false);
		expect(result.reason).toBe(CONVERT_BLOCKED.PARENT);
		expect(result.parentTitle).toBe('Shape Wrap');
	});

	it('reports a lock when the block cannot be removed', () => {
		const result = resolveConvertCapability({ ...allowed, canRemove: false });

		expect(result.canConvert).toBe(false);
		expect(result.reason).toBe(CONVERT_BLOCKED.LOCKED);
	});

	it('prefers the lock reason over the parent reason when both fail', () => {
		const result = resolveConvertCapability({
			...allowed,
			canRemove: false,
			canInsert: false,
		});

		expect(result.reason).toBe(CONVERT_BLOCKED.LOCKED);
	});

	it('reports "already" for a Typography Stylist block regardless of capability', () => {
		const result = resolveConvertCapability({
			blockName: 'typost/block',
			canRemove: true,
			canInsert: true,
		});

		expect(result.canConvert).toBe(false);
		expect(result.reason).toBe(CONVERT_BLOCKED.ALREADY);
	});

	it('reports "unsupported" for block types with no conversion mapping', () => {
		const result = resolveConvertCapability({ ...allowed, blockName: 'core/image' });

		expect(result.canConvert).toBe(false);
		expect(result.reason).toBe(CONVERT_BLOCKED.UNSUPPORTED);
	});

	it('reports "unsupported" when nothing is selected', () => {
		expect(resolveConvertCapability({ blockName: '' }).reason).toBe(CONVERT_BLOCKED.UNSUPPORTED);
	});

	it('tolerates being called with no facts at all', () => {
		const result = resolveConvertCapability();

		expect(result.canConvert).toBe(false);
		expect(result.reason).toBe(CONVERT_BLOCKED.UNSUPPORTED);
		expect(result.parentTitle).toBe('');
	});

	it('defaults parentTitle to an empty string when the parent is unregistered', () => {
		const result = resolveConvertCapability({ ...allowed, canInsert: false });

		expect(result.parentTitle).toBe('');
	});

	it('only maps heading and paragraph', () => {
		expect(CONVERTIBLE_BLOCKS).toEqual(['core/heading', 'core/paragraph']);
	});
});

describe('shouldExplainConvertBlock', () => {
	it('explains the two capability failures', () => {
		expect(shouldExplainConvertBlock(CONVERT_BLOCKED.LOCKED)).toBe(true);
		expect(shouldExplainConvertBlock(CONVERT_BLOCKED.PARENT)).toBe(true);
	});

	it('stays silent when no action is actually missing', () => {
		// Nothing was hidden from the user in these cases, so an explanation
		// would be noise in every modal that is not a heading or paragraph.
		expect(shouldExplainConvertBlock(CONVERT_BLOCKED.NONE)).toBe(false);
		expect(shouldExplainConvertBlock(CONVERT_BLOCKED.ALREADY)).toBe(false);
		expect(shouldExplainConvertBlock(CONVERT_BLOCKED.UNSUPPORTED)).toBe(false);
	});
});

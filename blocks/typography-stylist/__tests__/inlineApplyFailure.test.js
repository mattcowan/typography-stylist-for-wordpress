/**
 * Test Suite: describeInlineApplyFailure (QA finding E-5)
 *
 * When both apply strategies refuse an inline apply (in practice the
 * nesting limit), edit.js shows and announces a message instead of the old
 * silent return. The decision logic lives in utils.js so the message and
 * the limit it quotes come from the same constant that validateNestingDepth
 * enforces, and cannot drift apart.
 */

import {
	describeInlineApplyFailure,
	validateNestingDepth,
	applyStylingSafeStringMethod,
	MAX_NESTING_DEPTH
} from '../utils';

describe('Typography Stylist - describeInlineApplyFailure', () => {
	// The exact strings edit.js will show. Without wp.i18n loaded (Jest) the
	// helper falls back to the English source and its own %d substitution.
	const NESTING_MESSAGE = `Maximum nesting depth (${MAX_NESTING_DEPTH}) reached. Select the whole styled text to change it.`;
	const GENERIC_MESSAGE = 'The styling could not be applied to this selection.';

	it('should map the string-method nesting error to the nesting message', () => {
		// The literal applyStylingSafeStringMethod() returns
		const result = describeInlineApplyFailure('Maximum nesting depth exceeded');

		expect(result).toEqual({ message: NESTING_MESSAGE, isNestingLimit: true });
	});

	it('should map the validateNestingDepth error (with the number) to the nesting message', () => {
		// Build a chain one level deeper than the limit and take the error
		// validateNestingDepth() actually produces, so the mapping is tested
		// against the real producer rather than a copied string
		let innermost = null;
		let parent = document.createElement('div');
		for (let i = 0; i < MAX_NESTING_DEPTH + 1; i++) {
			const span = document.createElement('span');
			span.className = 'typost-styled';
			parent.appendChild(span);
			parent = span;
			innermost = span;
		}
		const check = validateNestingDepth(innermost);
		expect(check.valid).toBe(false);

		const result = describeInlineApplyFailure(check.error);

		expect(result.isNestingLimit).toBe(true);
		expect(result.message).toBe(NESTING_MESSAGE);
	});

	it('should quote the limit that the apply path actually enforces', () => {
		// A fourth level through the string method refuses with the nesting
		// error; the message must quote that same limit
		const html = '<span class="typost-styled" data-fontweight="700">' +
			'<span class="typost-styled" data-fontstyle="italic">' +
			'<span class="typost-styled" data-letterspacing="50">abc</span></span></span>';
		const applied = applyStylingSafeStringMethod(html, 1, 2, { 'data-lineheight': '2' }, 'line-height: 2');
		expect(applied.success).toBe(false);

		const result = describeInlineApplyFailure(applied.error);

		expect(result.isNestingLimit).toBe(true);
		expect(result.message).toContain(`(${MAX_NESTING_DEPTH})`);
		expect(MAX_NESTING_DEPTH).toBe(3);
	});

	it('should map an unknown error to the generic message', () => {
		const result = describeInlineApplyFailure('No common parent found');

		expect(result).toEqual({ message: GENERIC_MESSAGE, isNestingLimit: false });
	});

	it('should map an empty error to the generic message', () => {
		expect(describeInlineApplyFailure('')).toEqual({ message: GENERIC_MESSAGE, isNestingLimit: false });
	});

	it('should map undefined and null to the generic message', () => {
		expect(describeInlineApplyFailure(undefined)).toEqual({ message: GENERIC_MESSAGE, isNestingLimit: false });
		expect(describeInlineApplyFailure(null)).toEqual({ message: GENERIC_MESSAGE, isNestingLimit: false });
	});

	it('should not treat a non-string error as the nesting limit', () => {
		expect(describeInlineApplyFailure({ message: 'Maximum nesting depth exceeded' }).isNestingLimit).toBe(false);
	});

	it('should use wp.i18n when it is loaded', () => {
		const __ = jest.fn((text) => `T:${text}`);
		const sprintf = jest.fn((template, ...args) => `S:${template}|${args.join(',')}`);
		window.wp = { i18n: { __, sprintf } };

		try {
			const nesting = describeInlineApplyFailure('Maximum nesting depth exceeded');
			const generic = describeInlineApplyFailure('other');

			expect(__).toHaveBeenCalledWith(
				'Maximum nesting depth (%d) reached. Select the whole styled text to change it.',
				'typography-stylist'
			);
			expect(sprintf).toHaveBeenCalledWith(
				'T:Maximum nesting depth (%d) reached. Select the whole styled text to change it.',
				MAX_NESTING_DEPTH
			);
			expect(nesting.message).toBe(`S:T:Maximum nesting depth (%d) reached. Select the whole styled text to change it.|${MAX_NESTING_DEPTH}`);
			expect(__).toHaveBeenCalledWith('The styling could not be applied to this selection.', 'typography-stylist');
			expect(generic.message).toBe('T:The styling could not be applied to this selection.');
		} finally {
			delete window.wp;
		}
	});
});

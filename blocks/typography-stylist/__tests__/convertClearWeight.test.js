/**
 * PR #194 re-review: a partial conversion after an explicit weight clear.
 *
 * The inline editor's convertToBlock() applies the selection's span with
 * applyStylingSafeStringMethod, which wraps a new span and never strips a
 * property from an enclosing one. When an extension asked for the weight to
 * be cleared (a falsy fontWeight on typost-apply-block-properties), the
 * convert path now runs the selection through removePropertyFromSelection
 * first, so the stored weight leaves the enclosing span and does not stay in
 * force around the converted text. This pins the two shared helpers in that
 * order; the component itself is a closure over wp.* globals.
 */
const { removePropertyFromSelection, applyStylingSafeStringMethod } = require('../utils.js');

describe('partial conversion after a weight clear (PR #194 re-review)', () => {
	const content = 'A <span class="typost-styled" data-fontweight="700" style="font-weight: 700">bold text</span> end';
	const start = 7; // "text"
	const end = 11;

	test('without the clear step the enclosing span keeps its weight', () => {
		const applied = applyStylingSafeStringMethod(content, start, end, { 'data-features': 'liga' }, 'font-feature-settings: "liga" 1');
		expect(applied.success).toBe(true);
		expect(applied.content).toContain('data-fontweight="700"');
		expect(applied.content).toContain('font-weight: 700');
	});

	test('with the clear step both the attribute and the declaration are gone', () => {
		const cleared = removePropertyFromSelection(content, start, end, 'data-fontweight', 'font-weight');
		expect(cleared.success).toBe(true);
		expect(cleared.content).not.toContain('data-fontweight');
		expect(cleared.content).not.toContain('font-weight');

		const applied = applyStylingSafeStringMethod(cleared.content, start, end, { 'data-features': 'liga' }, 'font-feature-settings: "liga" 1');
		expect(applied.success).toBe(true);
		expect(applied.content).not.toContain('data-fontweight');
		expect(applied.content).not.toContain('font-weight');
		expect(applied.content).toContain('data-features="liga"');
		const host = document.createElement('div');
		host.innerHTML = applied.content;
		expect(host.textContent).toBe('A bold text end');
	});

	test('a break-only span loses its weight too (PR #194 fourth review)', () => {
		// RichText counts a <br> as one position; the span holds no text node,
		// so a text-only walk never found it and the weight stayed.
		const html = 'Alpha<span class="typost-styled" data-fontweight="700" style="font-weight: 700"><br></span>Beta';
		const cleared = removePropertyFromSelection(html, 5, 6, 'data-fontweight', 'font-weight');
		expect(cleared.success).toBe(true);
		expect(cleared.content).not.toContain('data-fontweight');
		expect(cleared.content).not.toContain('font-weight');
		expect(cleared.content).toContain('<br>');
		const host = document.createElement('div');
		host.innerHTML = cleared.content;
		expect(host.textContent).toBe('AlphaBeta');
	});

	test('a selection ending on a trailing break inside a weighted span clears it', () => {
		const html = '<span class="typost-styled" data-fontweight="700" style="font-weight: 700">Bold<br></span>Next';
		// "Bold" + the break = offsets 0..5
		const cleared = removePropertyFromSelection(html, 4, 5, 'data-fontweight', 'font-weight');
		expect(cleared.success).toBe(true);
		expect(cleared.content).not.toContain('data-fontweight');
	});

	test('the shared-utils global exposes the removal helper for the inline editor', () => {
		expect(typeof window.typostSharedUtils.removePropertyFromSelection).toBe('function');
	});
});

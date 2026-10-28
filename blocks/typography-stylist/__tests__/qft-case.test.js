/**
 * #309: a Case control for selected text in the Quick Feature Toggles.
 *
 * The span form is the inline format panel's (#214): data-textcase, the
 * caseDeclarations() CSS, and data-fakesmallcaps="false" only with a small
 * caps value. The QFT write paths (caret, split, Range merge, string
 * fallback) merge over a span's old values, so normalizeInlineCaseSpans()
 * rebuilds each touched span's case afterwards. These tests run each path the
 * way edit.js does, then check the span form.
 */

import {
	buildInlineCaseApply,
	normalizeInlineCaseSpans,
	parseInlineStylesAtCursor,
	updateSpanPropertyInPlace,
	splitSpanAndApply,
	applyOrMergeStyling,
	applyStylingSafeStringMethod,
	removePropertyFromSelection,
	resolveSelectionStyleState,
	detachParagraphStyleFromSelection,
	parseStyleString
} from '../utils';

const UPPER = 'text-transform: uppercase; font-variant-caps: normal';
const SMALL_NO_FAKE = 'text-transform: none; font-variant-caps: small-caps; font-synthesis-small-caps: none';

/** The typost spans of some content, as plain objects. */
function spansOf(html) {
	const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
	return Array.from(doc.querySelectorAll('span.typost-styled')).map((span) => {
		const attrs = {};
		Array.from(span.attributes).forEach((attr) => {
			if (attr.name !== 'class' && attr.name !== 'style') {
				attrs[attr.name] = attr.value;
			}
		});
		return { text: span.textContent, attrs, style: parseStyleString(span.getAttribute('style')) };
	});
}

/** A DOM Range over [start, end) of a parsed container (single text level). */
function rangeFor(html, start, end) {
	const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
	const container = doc.body.firstChild;
	const walker = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT);
	const range = doc.createRange();
	let pos = 0;
	let node;
	while ((node = walker.nextNode())) {
		const len = node.textContent.length;
		if (start >= pos && start <= pos + len && !range.__started) {
			range.setStart(node, start - pos);
			range.__started = true;
		}
		if (end >= pos && end <= pos + len) {
			range.setEnd(node, end - pos);
			break;
		}
		pos += len;
	}
	return { doc, container, range };
}

describe('buildInlineCaseApply', () => {
	test('Default writes nothing', () => {
		expect(buildInlineCaseApply('', true)).toBeNull();
		expect(buildInlineCaseApply('bogus', true)).toBeNull();
	});

	test('a transform gives the inline panel declarations', () => {
		expect(buildInlineCaseApply('uppercase', true)).toEqual({
			attributes: { 'data-textcase': 'uppercase', 'data-fakesmallcaps': 'true' },
			styleString: UPPER,
			firstDeclaration: ['text-transform', 'uppercase']
		});
	});

	test('small caps without fake small caps', () => {
		const apply = buildInlineCaseApply('small-caps', false);
		expect(apply.attributes['data-fakesmallcaps']).toBe('false');
		expect(apply.styleString).toBe(SMALL_NO_FAKE);
	});
});

describe('parseInlineStylesAtCursor: case (#309)', () => {
	test('reads the case of the span at the selection', () => {
		const html = `<span class="typost-styled" data-textcase="small-caps" data-fakesmallcaps="false" style="${SMALL_NO_FAKE}">The</span> fox`;
		const detected = parseInlineStylesAtCursor(html, 0, 3);
		expect(detected.textCase).toBe('small-caps');
		expect(detected.fakeSmallCaps).toBe(false);
	});

	test('inherits the case from an outer span', () => {
		const html = `<span class="typost-styled" data-textcase="uppercase" style="${UPPER}"><span class="typost-styled" data-fontweight="700" style="font-weight: 700">T</span>he</span>`;
		expect(parseInlineStylesAtCursor(html, 0, 1).textCase).toBe('uppercase');
	});

	test('is null on a span without a case', () => {
		const html = '<span class="typost-styled" data-fontweight="700" style="font-weight: 700">T</span>he';
		const detected = parseInlineStylesAtCursor(html, 0, 1);
		expect(detected.textCase).toBeNull();
		expect(detected.fakeSmallCaps).toBeNull();
	});
});

describe('applying a case to selected text', () => {
	test('plain text: the string path writes the inline panel span form', () => {
		const apply = buildInlineCaseApply('uppercase', true);
		const result = applyStylingSafeStringMethod('The quick', 0, 3, apply.attributes, apply.styleString);
		const html = normalizeInlineCaseSpans(result.content, 0, 3);
		expect(spansOf(html)).toEqual([{
			text: 'The',
			attrs: { 'data-textcase': 'uppercase' },
			style: { 'text-transform': 'uppercase', 'font-variant-caps': 'normal' }
		}]);
	});

	test('the Range path merges into a whole span and drops the old case', () => {
		const before = `<span class="typost-styled" data-textcase="small-caps" data-fakesmallcaps="false" style="${SMALL_NO_FAKE}">The</span> quick`;
		const { doc, container, range } = rangeFor(before, 0, 3);
		const apply = buildInlineCaseApply('uppercase', true);
		expect(applyOrMergeStyling(range, apply.attributes, apply.styleString, doc)).toBe(true);
		const html = normalizeInlineCaseSpans(container.innerHTML, 0, 3);
		expect(spansOf(html)).toEqual([{
			text: 'The',
			attrs: { 'data-textcase': 'uppercase' },
			style: { 'text-transform': 'uppercase', 'font-variant-caps': 'normal' }
		}]);
	});

	test('switching fake small caps back on removes data-fakesmallcaps', () => {
		const before = `<span class="typost-styled" data-textcase="small-caps" data-fakesmallcaps="false" style="${SMALL_NO_FAKE}">The</span>`;
		const { doc, container, range } = rangeFor(before, 0, 3);
		const apply = buildInlineCaseApply('all-small-caps', true);
		applyOrMergeStyling(range, apply.attributes, apply.styleString, doc);
		const [span] = spansOf(normalizeInlineCaseSpans(container.innerHTML, 0, 3));
		expect(span.attrs).toEqual({ 'data-textcase': 'all-small-caps' });
		expect(span.style['font-synthesis-small-caps']).toBe('auto');
	});

	test('part of a span with a case: the split changes only the selection', () => {
		// "Title Case" on the headline, All Small Caps on its first word
		const before = `<span class="typost-styled" data-textcase="capitalize" style="text-transform: capitalize; font-variant-caps: normal">the quick fox</span>`;
		const apply = buildInlineCaseApply('all-small-caps', true);
		const result = splitSpanAndApply(before, 0, 3, 'data-textcase', apply.attributes, apply.styleString);
		expect(result.success).toBe(true);
		const spans = spansOf(normalizeInlineCaseSpans(result.content, 0, 3));
		expect(spans.map((s) => [s.text, s.attrs['data-textcase']])).toEqual([
			['the', 'all-small-caps'],
			[' quick fox', 'capitalize']
		]);
		expect(spans[0].attrs['data-fakesmallcaps']).toBeUndefined();
		expect(spans[0].style).toEqual({ 'text-transform': 'none', 'font-variant-caps': 'all-small-caps', 'font-synthesis-small-caps': 'auto' });
		expect(spans[1].style).toEqual({ 'text-transform': 'capitalize', 'font-variant-caps': 'normal' });
	});

	test('a caret inside a span with a case changes that span', () => {
		const before = `<span class="typost-styled" data-textcase="small-caps" data-fakesmallcaps="false" style="${SMALL_NO_FAKE}">The</span>`;
		const apply = buildInlineCaseApply('lowercase', true);
		const result = updateSpanPropertyInPlace(before, 1, 'data-textcase', 'lowercase',
			apply.firstDeclaration[0], apply.firstDeclaration[1], { 'data-fakesmallcaps': apply.attributes['data-fakesmallcaps'] });
		expect(result.success).toBe(true);
		const [span] = spansOf(normalizeInlineCaseSpans(result.content, 1, 1));
		expect(span.attrs).toEqual({ 'data-textcase': 'lowercase' });
		expect(span.style).toEqual({ 'text-transform': 'lowercase', 'font-variant-caps': 'normal' });
	});

	test('a case over a span with its own case: the inner case goes, so the new one shows', () => {
		// A selection past the end of a span takes the string path
		const before = `<span class="typost-styled" data-textcase="small-caps" data-fakesmallcaps="false" data-fontweight="700" style="font-weight: 700; ${SMALL_NO_FAKE}">quick</span> fox`;
		const apply = buildInlineCaseApply('uppercase', true);
		const result = applyStylingSafeStringMethod(before, 0, 9, apply.attributes, apply.styleString);
		expect(result.success).toBe(true);
		const spans = spansOf(normalizeInlineCaseSpans(result.content, 0, 9));
		expect(spans[0]).toEqual({ text: 'quick fox', attrs: { 'data-textcase': 'uppercase' }, style: { 'text-transform': 'uppercase', 'font-variant-caps': 'normal' } });
		// The inner span keeps its weight and loses its case
		expect(spans[1]).toEqual({ text: 'quick', attrs: { 'data-fontweight': '700' }, style: { 'font-weight': '700' } });
	});

	test('other properties of the span stay', () => {
		const before = `<span class="typost-styled" data-fontweight="700" style="font-weight: 700">The</span>`;
		const { doc, container, range } = rangeFor(before, 0, 3);
		const apply = buildInlineCaseApply('uppercase', true);
		applyOrMergeStyling(range, apply.attributes, apply.styleString, doc);
		const [span] = spansOf(normalizeInlineCaseSpans(container.innerHTML, 0, 3));
		expect(span.attrs).toEqual({ 'data-fontweight': '700', 'data-textcase': 'uppercase' });
		expect(span.style).toEqual({ 'font-weight': '700', 'text-transform': 'uppercase', 'font-variant-caps': 'normal' });
	});
});

describe('normalizeInlineCaseSpans', () => {
	test('leaves content outside the selection, and a well-formed span, unchanged', () => {
		const html = `<span class="typost-styled" data-textcase="small-caps" style="text-transform: none; font-variant-caps: small-caps; font-synthesis-small-caps: auto">The</span> ` +
			`<span class="typost-styled" data-textcase="uppercase" data-fakesmallcaps="true" style="${UPPER}; font-synthesis-small-caps: none">fox</span>`;
		// The second span is malformed but outside [0, 3)
		expect(normalizeInlineCaseSpans(html, 0, 3)).toBe(html);
	});

	test('leaves a paragraph style span that only stores the style\'s case', () => {
		const html = '<span class="typost-styled" data-style-id="9" data-textcase="small-caps">The</span>';
		expect(normalizeInlineCaseSpans(html, 0, 3)).toBe(html);
	});
});

describe('resetting the case of selected text', () => {
	test('removes every case attribute and declaration, and unwraps an empty span', () => {
		const html = `<span class="typost-styled" data-textcase="small-caps" data-fakesmallcaps="false" style="${SMALL_NO_FAKE}">The</span> fox`;
		const result = removePropertyFromSelection(html, 0, 3, 'data-textcase', 'text-transform');
		expect(result.content).toBe('The fox');
	});

	test('keeps the span\'s other properties', () => {
		const html = `<span class="typost-styled" data-fontweight="700" data-textcase="uppercase" style="font-weight: 700; ${UPPER}">The</span>`;
		const [span] = spansOf(removePropertyFromSelection(html, 0, 3, 'data-textcase', 'text-transform').content);
		expect(span.attrs).toEqual({ 'data-fontweight': '700' });
		expect(span.style).toEqual({ 'font-weight': '700' });
	});
});

describe('a case from a paragraph style (#309 review)', () => {
	const STYLES = [
		{ id: 437, properties: { textCase: 'uppercase', fontWeight: '700' } },
		{ id: 438, properties: { fontWeight: '700' } }
	];

	test('detection says the case comes only from the style', () => {
		const html = 'Hello <span class="typost-styled typost-ps-437" data-style-id="437" data-textcase="uppercase">wonderful</span> world';
		const detected = parseInlineStylesAtCursor(html, 6, 15);
		expect(detected.textCase).toBe('uppercase');
		expect(detected.textCaseFromStyle).toBe(true);
	});

	test('a case declared over the style is the text\'s own', () => {
		const html = `<span class="typost-styled typost-ps-437" data-style-id="437" data-textcase="lowercase" style="text-transform: lowercase; font-variant-caps: normal">wonderful</span>`;
		expect(parseInlineStylesAtCursor(html, 0, 9).textCaseFromStyle).toBe(false);
	});

	test('reset of an override puts the style\'s case back, and the span stays', () => {
		const html = `<span class="typost-styled typost-ps-437" data-style-id="437" data-textcase="small-caps" data-fakesmallcaps="false" style="${SMALL_NO_FAKE}">wonderful</span>`;
		const result = removePropertyFromSelection(html, 0, 9, 'data-textcase', 'text-transform', STYLES);
		expect(result.content).toBe('<span class="typost-styled typost-ps-437" data-style-id="437" data-textcase="uppercase">wonderful</span>');
		const detected = parseInlineStylesAtCursor(result.content, 0, 9);
		expect(detected.textCase).toBe('uppercase');
		expect(detected.textCaseFromStyle).toBe(true);
	});

	test('reset over a style without a case removes the case, and the span stays', () => {
		const html = `<span class="typost-styled typost-ps-438" data-style-id="438" data-textcase="uppercase" style="${UPPER}">wonderful</span>`;
		const result = removePropertyFromSelection(html, 0, 9, 'data-textcase', 'text-transform', STYLES);
		expect(result.content).toBe('<span class="typost-styled typost-ps-438" data-style-id="438">wonderful</span>');
	});

	test('reset over a deleted style removes the case, and the span stays', () => {
		const html = `<span class="typost-styled typost-ps-999" data-style-id="999" data-textcase="uppercase" style="${UPPER}">wonderful</span>`;
		const result = removePropertyFromSelection(html, 0, 9, 'data-textcase', 'text-transform', STYLES);
		expect(result.content).toBe('<span class="typost-styled typost-ps-999" data-style-id="999">wonderful</span>');
	});

	test('other properties declared on the style span stay', () => {
		const html = `<span class="typost-styled typost-ps-437" data-style-id="437" data-letterspacing="80" data-textcase="lowercase" style="letter-spacing: 0.08em; text-transform: lowercase; font-variant-caps: normal">wonderful</span>`;
		const [span] = spansOf(removePropertyFromSelection(html, 0, 9, 'data-textcase', 'text-transform', STYLES).content);
		expect(span.attrs).toEqual({ 'data-style-id': '437', 'data-letterspacing': '80', 'data-textcase': 'uppercase' });
		expect(span.style).toEqual({ 'letter-spacing': '0.08em' });
	});
});

describe('Detach keeps the case of the style', () => {
	test('the detached text has the style\'s case as its own, and the capture reads it', () => {
		const styles = [{ id: 9, properties: { textCase: 'small-caps', fakeSmallCaps: false } }];
		const html = '<span class="typost-styled" data-style-id="9">The</span> fox';
		const detached = detachParagraphStyleFromSelection(html, 0, 3, styles);
		expect(detached.success).toBe(true);
		const state = resolveSelectionStyleState(detached.content, 0, 3, styles);
		expect(state.textCase).toBe('small-caps');
		expect(state.fakeSmallCaps).toBe(false);
	});
});

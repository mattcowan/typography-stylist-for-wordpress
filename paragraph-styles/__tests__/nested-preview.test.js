/**
 * Tests for the editor preview of nested styles (#195) in
 * paragraph-styles/assets/js/lib/ps-utils.js: the counting twin of
 * Typost_PS_Nested::find_ranges(), held to the fixture the PHP test reads,
 * and the DOM wrapping that must always come off without a trace.
 */

const fs = require('fs');
const path = require('path');
const {
	nestedRuleRanges,
	hasNestedTextRules,
	collectNestedText,
	applyNestedPreview,
	removeNestedPreview,
	buildNestedRuleMap,
	nestedRootRef,
	NESTED_PREVIEW_ATTR,
} = require('../assets/js/lib/ps-utils.js');

const CASES = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'nested-rule-ranges.json'), 'utf8'));

function covered(plain, rules) {
	return nestedRuleRanges(plain, rules, { 2: true, 3: true }).map((r) => [r.styleId, plain.slice(r.start, r.end)]);
}

describe('counting', () => {
	test.each(CASES.map((c) => [c.name, c]))('%s (same as PHP)', (name, c) => {
		expect(covered(c.plain, c.rules)).toEqual(c.covered);
	});

	test('the fallback without Intl.Segmenter still counts a base letter and its marks as one character', () => {
		const original = Intl.Segmenter;
		Intl.Segmenter = undefined;
		try {
			expect(covered('été', [{ styleId: 2, unit: 'characters', count: 2 }])).toEqual([[2, 'ét']]);
		} finally {
			Intl.Segmenter = original;
		}
	});

	test('bad input gives nothing', () => {
		expect(nestedRuleRanges('', [{ styleId: 2, unit: 'words', count: 1 }])).toEqual([]);
		expect(nestedRuleRanges('abc', null)).toEqual([]);
		expect(hasNestedTextRules([{ unit: 'line' }])).toBe(false);
		expect(hasNestedTextRules([{ unit: 'line' }, { unit: 'words' }])).toBe(true);
	});
});

describe('reading the element', () => {
	test('a line break is a newline; code, images and SVG are one object mark; comments and wbr nothing', () => {
		document.body.innerHTML = '<p>a<br>b<code>x y</code>c<img alt="">d<!-- c -->e<wbr>f<svg><text>t</text></svg></p>';
		expect(collectNestedText(document.querySelector('p')).plain).toBe('a\nb￼c￼def￼');
	});
});

describe('the preview', () => {
	const RULES = [
		{ styleId: 2, unit: 'marker', count: 1, marker: ':', end: 'through' },
		{ styleId: 3, unit: 'words', count: 2, end: 'upto' },
	];

	test('wraps each covered piece inside its own parent, as the server does', () => {
		document.body.innerHTML = '<p class="typost-styled typost-ps-1">Step <em>2</em>: Fold in the flour.</p>';
		const p = document.querySelector('p');
		const records = applyNestedPreview(p, RULES, { 2: true, 3: true });
		expect(records.length).toBe(3);
		const open = (id) => `<span class="typost-styled typost-nested" data-style-id="${id}" data-typost-nested-preview="" style="pointer-events: none;">`;
		expect(p.innerHTML).toBe(
			`${open(2)}Step </span>`
			+ `<em>${open(2)}2</span></em>`
			+ `${open(2)}:</span> `
			+ `${open(3)}Fold in</span> the flour.`
		);
	});

	test('the pointer passes through a preview span, so a press lands on an element that stays', () => {
		// The span comes off in the capture phase of the press. If it were the
		// target, Chromium would have no node to place the caret in.
		document.body.innerHTML = '<p>Step 1: go now</p>';
		const p = document.querySelector('p');
		applyNestedPreview(p, RULES);
		const spans = Array.from(p.querySelectorAll(`[${NESTED_PREVIEW_ATTR}]`));
		expect(spans.length).toBeGreaterThan(0);
		spans.forEach((span) => expect(span.style.pointerEvents).toBe('none'));
	});

	test('removing puts the very same text nodes back', () => {
		document.body.innerHTML = '<p>Step <em>2</em>: Fold in the flour.</p>';
		const p = document.querySelector('p');
		const before = p.innerHTML;
		const nodes = [p.firstChild, p.querySelector('em').firstChild, p.lastChild];
		const records = applyNestedPreview(p, RULES);
		removeNestedPreview(p, records);
		expect(p.innerHTML).toBe(before);
		expect([p.firstChild, p.querySelector('em').firstChild, p.lastChild]).toEqual(nodes);
		expect(p.firstChild).toBe(nodes[0]);
		expect(p.childNodes).toHaveLength(3);
	});

	test('spans the editor moved out of the records are unwrapped too', () => {
		document.body.innerHTML = '<p>Step 1: go now</p>';
		const p = document.querySelector('p');
		applyNestedPreview(p, RULES);
		// As if the editor rewrote the element and the records were lost
		removeNestedPreview(p);
		expect(p.querySelector(`[${NESTED_PREVIEW_ATTR}]`)).toBeNull();
		expect(p.textContent).toBe('Step 1: go now');
	});

	// What RichText's applyValue() does to a decorated element when the block's
	// value changes while it is not selected (undo, another author's edit): it
	// reuses each child of the same node name, drops attributes the new value
	// does not have, and rewrites the text in place.
	function rewriteLikeRichText(p, firstChildText, restText) {
		const span = p.firstChild;
		Array.from(span.attributes).forEach((attr) => span.removeAttribute(attr.name));
		span.className = 'typost-styled';
		span.firstChild.data = firstChildText;
		if (span.nextSibling) {
			p.replaceChild(p.ownerDocument.createTextNode(restText), span.nextSibling);
		} else {
			p.appendChild(p.ownerDocument.createTextNode(restText));
		}
	}

	test('a value the editor wrote over the preview stays: the old text does not come back', () => {
		document.body.innerHTML = '<p>Hello world</p>';
		const p = document.querySelector('p');
		const records = applyNestedPreview(p, [{ styleId: 2, unit: 'words', count: 1, end: 'through' }]);
		rewriteLikeRichText(p, 'Hello', ' world');
		removeNestedPreview(p, records);
		expect(p.innerHTML).toBe('<span class="typost-styled">Hello</span> world');
	});

	test('a value of the same shape with other text also stays', () => {
		document.body.innerHTML = '<p>Hello world</p>';
		const p = document.querySelector('p');
		const records = applyNestedPreview(p, [{ styleId: 2, unit: 'words', count: 1, end: 'through' }]);
		// The span and the text node are both reused, so every part is still in place
		p.firstChild.firstChild.data = 'Hola ';
		p.lastChild.data = 'mundo';
		removeNestedPreview(p, records);
		expect(p.textContent).toBe('Hola mundo');
		expect(p.querySelector(`[${NESTED_PREVIEW_ATTR}]`)).toBeNull();
	});

	test('a preview span that lost only its marker is not undone', () => {
		document.body.innerHTML = '<p>Hello world</p>';
		const p = document.querySelector('p');
		const records = applyNestedPreview(p, [{ styleId: 2, unit: 'words', count: 1, end: 'through' }]);
		p.firstChild.removeAttribute(NESTED_PREVIEW_ATTR);
		removeNestedPreview(p, records);
		expect(p.firstChild.nodeName).toBe('SPAN');
		expect(p.textContent).toBe('Hello world');
	});

	test('one rewritten text node does not stop the others from going back', () => {
		document.body.innerHTML = '<p>Step <em>2</em>: Fold in the flour.</p>';
		const p = document.querySelector('p');
		const original = p.querySelector('em').firstChild;
		const records = applyNestedPreview(p, RULES);
		p.firstChild.firstChild.data = 'Stage ';
		removeNestedPreview(p, records);
		expect(p.querySelector('em').firstChild).toBe(original);
		expect(p.textContent).toBe('Stage 2: Fold in the flour.');
	});

	test('a deleted style and a First line rule write no span', () => {
		document.body.innerHTML = '<p>one two</p>';
		const p = document.querySelector('p');
		expect(applyNestedPreview(p, [{ styleId: 9, unit: 'words', count: 1 }], { 2: true })).toEqual([]);
		expect(applyNestedPreview(p, [{ styleId: 2, unit: 'line' }], { 2: true })).toEqual([]);
		expect(p.innerHTML).toBe('one two');
	});
});

describe('the editor CSS after a style changes (#354)', () => {
	const source = fs.readFileSync(path.join(__dirname, '../assets/js/editor.js'), 'utf8');

	test('asks the server for the CSS, so there is no JS twin of nested_css()', () => {
		expect(source).toMatch(/path: '\/typost\/v1\/paragraph-styles\/editor-css'/);
		expect(source).toMatch(/addEventListener\('typost-paragraph-styles-updated', refreshServerCss\)/);
	});

	test('a late response cannot replace a newer one', () => {
		expect(source).toMatch(/var request = \+\+serverCssRequest;/);
		expect(source).toMatch(/request !== serverCssRequest/);
	});

	test('the nested CSS follows the main rules, so it wins where they are equal', () => {
		const main = source.indexOf("doc.getElementById('typost-ps-dynamic-css')");
		const nested = source.indexOf("doc.getElementById('typost-ps-dynamic-nested-css')");
		expect(main).toBeGreaterThan(-1);
		expect(nested).toBeGreaterThan(main);
	});

	test('a successful read replaces the page-load rules, so a declaration a style dropped goes too', () => {
		expect(source).toMatch(/serverCssFetched = true;/);
		expect(source).toMatch(/if \(serverCssFetched\) \{\s*var loadedMain = doc\.getElementById\('typost-paragraph-styles-inline-inline-css'\);/);
		expect(source).toMatch(/loadedMain\.textContent = serverMainCss;/);
		expect(source).toMatch(/var loadedNested = doc\.getElementById\('typost-paragraph-styles-nested-inline-css'\);/);
		expect(source).toMatch(/loadedNested\.textContent = '';/);
	});

	test('a response with no CSS leaves the rules as they are', () => {
		expect(source).toMatch(/if \(!response \|\| typeof response\.main !== 'string' \|\| typeof response\.nested !== 'string'\) \{\s*return;/);
	});

	test('the read runs on every style change, also on a site with no nested rules', () => {
		const start = source.indexOf('function refreshServerCss()');
		expect(start).toBeGreaterThan(-1);
		const body = source.slice(start, source.indexOf("wp.apiFetch({ path: '/typost/v1/paragraph-styles/editor-css'", start));
		expect(body).not.toMatch(/nestedPreview|nestedRules/);
	});
});

describe('finding roots', () => {
	const STYLES = [
		{ id: 1, legacyId: 'ps_1_2', nestedRules: [{ styleId: 2, unit: 'words', count: 1 }] },
		{ id: 2, nestedRules: [{ styleId: 1, unit: 'line' }] },
		{ id: 3 },
	];

	test('the map holds the styles with a rule that wraps text, by id and legacy id', () => {
		const map = buildNestedRuleMap(STYLES);
		expect(Object.keys(map.rules).sort()).toEqual(['1', 'ps_1_2']);
		expect(map.ids).toEqual({ 1: true, 2: true, 3: true });
	});

	test('a root needs typost-styled and the class of a style with rules, and is not fit to width', () => {
		const rules = buildNestedRuleMap(STYLES).rules;
		const make = (cls) => {
			const el = document.createElement('p');
			el.className = cls;
			return el;
		};
		expect(nestedRootRef(make('typost-styled typost-ps-1'), rules)).toBe('1');
		expect(nestedRootRef(make('typost-styled typost-ps-ps_1_2'), rules)).toBe('ps_1_2');
		expect(nestedRootRef(make('typost-ps-1'), rules)).toBe('');
		expect(nestedRootRef(make('typost-styled typost-ps-1 typost-fit'), rules)).toBe('');
		expect(nestedRootRef(make('typost-styled typost-ps-2'), rules)).toBe('');
		expect(nestedRootRef(make('typost-styled typost-ps-11'), rules)).toBe('');
	});
});

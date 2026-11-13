/**
 * The content of a block with all styling removed (#411):
 * strip-styles/strip-content.js. Expected strings are exact: they are what
 * the block stores.
 */

import { stripBlockContent } from '../strip-styles/strip-content';

describe('stripBlockContent: removed formats keep their text', () => {
	it.each([
		['a Typography Stylist span', 'A <span class="typost-styled" data-features="dlig" style="font-feature-settings: &quot;dlig&quot; 1">garden</span> party', 'A garden party'],
		['bold and italic', '<strong>bold</strong> and <em>italic</em> and <b>b</b> <i>i</i>', 'bold and italic and b i'],
		['underline (a styled span)', '<span style="text-decoration: underline;">under</span>', 'under'],
		['strikethrough', '<s>old</s> new', 'old new'],
		['inline code', 'run <code>npm test</code>', 'run npm test'],
		['keyboard input', 'press <kbd>Ctrl</kbd>', 'press Ctrl'],
		['highlight and text color', '<mark style="background-color:#ff0;color:#000" class="has-inline-color">hot</mark>', 'hot'],
		['an unknown element', '<font color="red">red</font> <del>gone</del> <ins>new</ins>', 'red gone new'],
		['a span from a paragraph style', '<span class="typost-styled typost-ps-2" data-style-id="2">styled</span>', 'styled'],
	])('%s', (_, input, expected) => {
		expect(stripBlockContent(input)).toBe(expected);
	});
});

describe('stripBlockContent: kept elements', () => {
	it('keeps line breaks', () => {
		expect(stripBlockContent('one<br>two<br/><strong>three</strong>')).toBe('one<br>two<br>three');
	});

	it('keeps a link with all its attributes', () => {
		expect(stripBlockContent('<a href="https://example.com/?a=1&amp;b=2" target="_blank" rel="noreferrer noopener" data-type="page" data-id="7">go</a>'))
			.toBe('<a href="https://example.com/?a=1&amp;b=2" target="_blank" rel="noreferrer noopener" data-type="page" data-id="7">go</a>');
	});

	it('removes a styled span inside a link', () => {
		expect(stripBlockContent('<a href="/x"><span class="typost-styled" style="font-size: 2rem">big</span> link</a>'))
			.toBe('<a href="/x">big link</a>');
	});

	it('removes a styled span around a link', () => {
		expect(stripBlockContent('<span class="typost-styled" style="font-weight: 700">see <a href="/x"><strong>this</strong></a></span>'))
			.toBe('see <a href="/x">this</a>');
	});

	it('keeps subscript and superscript, without formats inside', () => {
		expect(stripBlockContent('H<sub><strong>2</strong></sub>O and 10<sup>3</sup>')).toBe('H<sub>2</sub>O and 10<sup>3</sup>');
	});

	it('keeps a language element with lang and dir', () => {
		expect(stripBlockContent('<bdo lang="ar" dir="rtl"><em>نص</em></bdo>')).toBe('<bdo lang="ar" dir="rtl">نص</bdo>');
	});

	it('keeps an abbreviation with its title', () => {
		expect(stripBlockContent('<abbr title="World Health Organization">WHO</abbr>')).toBe('<abbr title="World Health Organization">WHO</abbr>');
	});

	it('keeps a note mark', () => {
		expect(stripBlockContent('<mark class="wp-note" data-id="12"><em>noted</em></mark>')).toBe('<mark class="wp-note" data-id="12">noted</mark>');
	});

	it('keeps a footnote anchor exactly', () => {
		const fn = '<sup data-fn="0f3b" class="fn"><a href="#0f3b" id="0f3b-link">1</a></sup>';
		expect(stripBlockContent(`<em>Claim</em>${fn}`)).toBe(`Claim${fn}`);
	});

	it('changes nothing inside a footnote anchor, not even a span', () => {
		const fn = '<sup data-fn="0f3b" class="fn"><a href="#0f3b" id="0f3b-link"><span class="x">1</span></a></sup>';
		expect(stripBlockContent(fn)).toBe(fn);
	});

	it('keeps an inline image exactly', () => {
		const img = '<img class="wp-image-5" style="width: 20px" src="https://example.com/a.png" alt="A &quot;quoted&quot; alt">';
		expect(stripBlockContent(`<strong>x</strong>${img}`)).toBe(`x${img}`);
	});

	it('keeps a formula exactly', () => {
		expect(stripBlockContent('<math><mi>x</mi><mo>+</mo><mn>1</mn></math>')).toBe('<math><mi>x</mi><mo>+</mo><mn>1</mn></math>');
	});
});

describe('stripBlockContent: kept elements lose their own styling (review of #411)', () => {
	it.each([
		['a styled link', '<a href="/x" style="color:red;font-size:3em" class="typost-styled has-red-color" onclick="alert(1)" data-features="dlig" id="ref" target="_blank" rel="noopener">go</a>', '<a href="/x" id="ref" target="_blank" rel="noopener">go</a>'],
		['a link with meaningful attributes', '<a href="/x" aria-label="Read the report" aria-describedby="note1" title="T" hreflang="fr" download="r.pdf" lang="fr" data-features="dlig" class="c" style="color:red">rapport</a>', '<a href="/x" aria-label="Read the report" aria-describedby="note1" title="T" hreflang="fr" download="r.pdf" lang="fr">rapport</a>'],
		['a styled superscript', '10<sup class="typost-styled" style="font-size:3em" data-fontsize="48">3</sup>', '10<sup>3</sup>'],
		['a styled subscript', 'H<sub style="color:red" onmouseover="x()">2</sub>O', 'H<sub>2</sub>O'],
		['a styled language element', '<bdo lang="he" dir="rtl" style="font-weight:700" class="x">טקסט</bdo>', '<bdo lang="he" dir="rtl">טקסט</bdo>'],
		['a styled abbreviation', '<abbr title="As soon as possible" class="typost-styled" style="letter-spacing:.2em">ASAP</abbr>', '<abbr title="As soon as possible">ASAP</abbr>'],
		['a styled note', '<mark class="wp-note typost-styled" data-id="12" style="background:#ff0">noted</mark>', '<mark class="wp-note" data-id="12">noted</mark>'],
		['a line break with attributes', 'a<br class="x" style="display:none">b', 'a<br>b'],
	])('%s', (_, input, expected) => {
		expect(stripBlockContent(input)).toBe(expected);
		// Stable under a second strip
		expect(stripBlockContent(expected)).toBe(expected);
	});
});

describe('stripBlockContent: elements kept whole and content without text', () => {
	it('keeps a text-less svg exactly, styles inside it too', () => {
		const svg = '<svg viewBox="0 0 10 10" class="icon"><g style="fill:red"><rect width="10" height="10"></rect></g></svg>';
		expect(stripBlockContent(`<strong>A</strong>${svg}`)).toBe(`A${svg}`);
	});

	it('keeps a text-less math element exactly', () => {
		const math = '<math display="block"><mspace width="1em"></mspace></math>';
		expect(stripBlockContent(math)).toBe(math);
	});

	it('writes nothing for a template, whose content is not in the document', () => {
		expect(stripBlockContent('a<template><b>hidden</b><script>x()</script></template>b')).toBe('ab');
	});

	it('turns no escaped markup into live markup', () => {
		const escaped = '&lt;img src=x onerror=alert(1)&gt; &lt;script&gt;x()&lt;/script&gt;';
		expect(stripBlockContent(`<em>${escaped}</em>`)).toBe(escaped.replace(/&gt;/g, '>'));
		expect(stripBlockContent(stripBlockContent(`<em>${escaped}</em>`))).toBe(escaped.replace(/&gt;/g, '>'));
	});
});

describe('stripBlockContent: odd and hostile input', () => {
	it.each([
		['an empty string', '', ''],
		['undefined', undefined, ''],
		['null', null, ''],
		['plain text', 'Plain', 'Plain'],
		['nested spans', '<span class="typost-styled"><span class="typost-styled"><span class="typost-styled">deep</span></span></span>', 'deep'],
		['unclosed bold', '<strong>open', 'open'],
		['an unclosed link', '<a href="/x">open', '<a href="/x">open</a>'],
		['a stray end tag', 'a</span>b', 'ab'],
		['entities', 'Fish &amp; chips &lt;3 &gt; &quot;q&quot; caf&eacute;', 'Fish &amp; chips &lt;3 > "q" café'],
		['a non-breaking space', 'a&nbsp;b', `a${String.fromCharCode(0xa0)}b`],
		['a comment', 'a<!-- x -->b', 'ab'],
		['a script', 'a<script>alert(1)</script>b', 'ab'],
		['a style element', 'a<style>p{color:red}</style>b', 'ab'],
		['an event handler on a span', '<span onclick="alert(1)">x</span>', 'x'],
		['a RichTextData-like object', { toString: () => '<em>rich</em>' }, 'rich'],
	])('%s', (_, input, expected) => {
		expect(stripBlockContent(input)).toBe(expected);
	});

	it('keeps an attribute value with quotes and angle brackets escaped', () => {
		expect(stripBlockContent('<abbr title="a &quot;b&quot; <c> &amp; d">t</abbr>')).toBe('<abbr title="a &quot;b&quot; &lt;c&gt; &amp; d">t</abbr>');
	});

	it('changes nothing in content that has no formats', () => {
		const plain = 'Line one<br>Line <a href="/two">two</a>';
		expect(stripBlockContent(plain)).toBe(plain);
		expect(stripBlockContent(stripBlockContent(plain))).toBe(plain);
	});
});

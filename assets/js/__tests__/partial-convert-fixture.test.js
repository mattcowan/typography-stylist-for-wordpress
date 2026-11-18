/**
 * The span of the partial Convert to block fixture (#369):
 * tests/e2e/fixtures/saved-markup/partial-convert.html.
 *
 * The saved-markup spec cannot catch a broken style attribute: a block whose
 * span has `style="font-feature-settings: "dlig" 1"` still opens valid, not
 * dirty, and serializes byte for byte. So this test parses the fixture that
 * the real Convert wrote and checks what a browser reads from the span: the
 * whole style, and no attribute made out of a broken style value. It checks
 * both copies: the span in the block comment's `content` and the span in the
 * visual copy (the aria-hidden element) of the saved markup.
 *
 * TYPOST_PARTIAL_CONVERT_FIXTURE names another file to check (used to prove
 * that the test fails on a broken copy).
 */

const fs = require('fs');
const path = require('path');

const FIXTURE = process.env.TYPOST_PARTIAL_CONVERT_FIXTURE ||
	path.join(__dirname, '../../../tests/e2e/fixtures/saved-markup/partial-convert.html');

const EXPECTED_ATTRIBUTES = ['class', 'data-features', 'data-textcase', 'style'];

function parse(html) {
	const holder = document.createElement('div');
	holder.innerHTML = html;
	return holder;
}

function expectWholeStyle(span) {
	expect(span).not.toBeNull();
	expect(span.getAttribute('style')).toContain('font-feature-settings: "dlig" 1');
	expect(span.getAttributeNames().filter((name) => !EXPECTED_ATTRIBUTES.includes(name))).toEqual([]);
	expect(span.style.fontFeatureSettings).toBe('"dlig" 1');
	expect(span.textContent).toBe('garden');
}

describe('partial Convert fixture (#369)', () => {
	const markup = fs.readFileSync(FIXTURE, 'utf8');

	test('the span in the block comment content has the whole style', () => {
		const comment = markup.match(/<!-- wp:typost\/block (\{.*?\}) -->/);
		expect(comment).not.toBeNull();
		const { content } = JSON.parse(comment[1]);
		expectWholeStyle(parse(content).querySelector('span.typost-styled'));
	});

	test('the span in the visual copy has the whole style', () => {
		expectWholeStyle(parse(markup).querySelector('[aria-hidden="true"] span.typost-styled'));
	});
});

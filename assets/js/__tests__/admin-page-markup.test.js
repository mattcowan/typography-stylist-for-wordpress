/**
 * Source-level checks on the admin page template (includes/admin-page.php).
 *
 * The template is a plain PHP function with no PHPUnit fixture, so these
 * tests read the file text and assert the accessibility attributes the QA
 * findings E-11 and E-12 require are present in the markup.
 */

const fs = require('fs');
const path = require('path');

const template = fs.readFileSync(path.resolve(__dirname, '../../../includes/admin-page.php'), 'utf8');

describe('Delete Font modal markup (E-11)', () => {
	const openingTag = template.match(/<div id="typost-delete-font-modal"[^>]*>/);

	test('the modal container is a modal dialog labeled by its heading', () => {
		expect(openingTag).not.toBeNull();
		expect(openingTag[0]).toMatch(/\srole="dialog"/);
		expect(openingTag[0]).toMatch(/\saria-modal="true"/);
		expect(openingTag[0]).toMatch(/\saria-labelledby="typost-delete-font-modal-title"/);
	});

	test('the heading carries the referenced id exactly once', () => {
		expect(template).toMatch(/<h2 id="typost-delete-font-modal-title">\s*<\?php esc_html_e\('Delete Font', 'typography-stylist'\); \?>\s*<\/h2>/);
		expect(template.match(/id="typost-delete-font-modal-title"/g)).toHaveLength(1);
	});
});

describe('Settings tabs markup (#349)', () => {
	const tablist = template.match(/<nav class="typost-admin-tabs[\s\S]*?<\/nav>/);

	test('a tab has no aria-controls, which makes NVDA announce it twice', () => {
		expect(tablist).not.toBeNull();
		// The control: this is the real tab markup
		expect(tablist[0]).toMatch(/role="tab"/);
		expect(tablist[0]).toMatch(/aria-selected=/);
		expect(tablist[0]).not.toMatch(/aria-controls=/);
	});

	test('each panel still names its tab', () => {
		expect(template).toMatch(/role="tabpanel"\s+aria-labelledby="typost-tab-button-presets"/);
	});
});

describe('Fonts region markup (E-12)', () => {
	// The tag holds an inline <?php ... ?> whose ?> would end a [^>]* match,
	// so take the rest of the line (. does not cross a newline).
	const openingTag = template.match(/<div id="typost-fonts-region".*>/);

	test('the focus target after a refresh is a named region', () => {
		expect(openingTag).not.toBeNull();
		expect(openingTag[0]).toMatch(/\stabindex="-1"/);
		expect(openingTag[0]).toMatch(/\srole="region"/);
		expect(openingTag[0]).toMatch(/\saria-label="<\?php esc_attr_e\('Font list', 'typography-stylist'\); \?>"/);
	});
});

/**
 * The inline format on core blocks (#373): select a word in a core Heading
 * and in a core Paragraph with the keyboard, apply one OpenType feature and
 * one responsive size in the Typography Stylist Features dialog, and
 * compare the stored span with the expected string, character for
 * character: in the block's content, and in the post content a save
 * stores.
 *
 * The dialog applies each control as it changes, after a debounce; there
 * is no Apply button.
 *
 * New sizes are written in rem, or in px when the site has "Write new font
 * sizes in px" on. That option reaches the editor only as
 * typostData.newFontSizeUnit, which the dialog reads each time it writes a
 * size (getNewFontSizeUnit() in assets/js/font-size-units.js). So each test
 * runs twice, with that value set to 'rem' and to 'px' in the page before
 * the dialog opens: both forms are checked on every site, and the site's
 * option is never changed.
 *
 * Each test works on its own draft post. afterEach deletes it without the
 * test's page, so it goes also after a time-out.
 */
const { test, expect } = require('@playwright/test');
const { openNewPost, select, rest, deleteWithoutPage } = require('./helpers');

test.setTimeout(90000);

const TEXT = 'Moonlit garden party';
const GARDEN = [ 8, 14 ];

// The span the dialog writes for "garden" with Discretionary Ligatures and
// a responsive size of 16 / 24 / 48 (the dialog's 16 and 24, and 48 typed
// into Maximum Size)
const EXPECTED_SPAN = {
	rem: '<span data-features="dlig" data-fontsize="responsive" data-fontsize-min="16" data-fontsize-preferred="24" data-fontsize-max="48" style="font-feature-settings: &quot;dlig&quot; 1; font-size: clamp(1rem, 1.5rem + 2vw, 3rem)" class="typost-styled">garden</span>',
	px: '<span data-features="dlig" data-fontsize="responsive" data-fontsize-min="16" data-fontsize-preferred="24" data-fontsize-max="48" style="font-feature-settings: &quot;dlig&quot; 1; font-size: clamp(16px, 1.5rem + 2vw, 48px)" class="typost-styled">garden</span>',
};

const BLOCKS = [
	{ label: 'Heading', name: 'core/heading', attributes: { content: TEXT, level: 2 }, element: (inner) => `<h2 class="wp-block-heading">${inner}</h2>` },
	{ label: 'Paragraph', name: 'core/paragraph', attributes: { content: TEXT }, element: (inner) => `<p>${inner}</p>` },
];

function blockContent(page, clientId) {
	return page.evaluate((id) => String(wp.data.select('core/block-editor').getBlockAttributes(id).content), clientId);
}

// The draft of the running test, as a REST route to delete. A delete that
// fails also fails the test, so content left on the site is visible
let created = [];

test.beforeEach(() => {
	created = [];
});

test.afterEach(async ({ playwright }) => {
	const failures = await deleteWithoutPage(playwright, created.splice(0));
	failures.forEach((failure) => test.info().annotations.push({ type: 'cleanup failed', description: failure }));
	expect(failures, 'cleanup: delete what the test made').toEqual([]);
});

for (const block of BLOCKS) {
	for (const unit of [ 'rem', 'px' ]) {
		test(`Inline format on a core ${block.label}: one feature and one size write the expected span (${unit})`, async ({ page }) => {
			await openNewPost(page);
			// post-new.php made an auto-draft; the save below keeps its ID
			const postId = await page.evaluate(() => wp.data.select('core/editor').getCurrentPostId());
			created.push(`/wp/v2/posts/${postId}?force=true`);
			await page.evaluate((value) => {
				window.typostData.newFontSizeUnit = value;
			}, unit);
			const expected = `Moonlit ${EXPECTED_SPAN[unit]} party`;

			const clientId = await page.evaluate(({ name, attributes }) => {
				const block = wp.blocks.createBlock(name, attributes);
				wp.data.dispatch('core/block-editor').insertBlocks(block);
				return block.clientId;
			}, { name: block.name, attributes: block.attributes });
			await select(page, clientId, ...GARDEN);

			await page.getByRole('button', { name: 'Typography Stylist Features' }).click();
			const modal = page.locator('.components-modal__frame');
			await expect(modal).toBeVisible();

			await modal.getByRole('checkbox', { name: 'Discretionary Ligatures' }).check();
			await expect.poll(() => blockContent(page, clientId)).toContain('data-features="dlig"');

			await modal.getByRole('combobox', { name: 'Font Size' }).selectOption('responsive');
			await modal.getByRole('spinbutton', { name: 'Maximum Size (desktop)' }).fill('48');
			await expect.poll(() => blockContent(page, clientId)).toBe(expected);

			await modal.getByRole('button', { name: 'Close', exact: true }).first().click();
			await expect(modal).toHaveCount(0);
			expect(await blockContent(page, clientId)).toBe(expected);

			await page.evaluate(() => wp.data.dispatch('core/editor').savePost());
			expect(await page.evaluate(() => wp.data.select('core/editor').didPostSaveRequestSucceed())).toBe(true);
			expect(await page.evaluate(() => wp.data.select('core/editor').getCurrentPostId())).toBe(postId);
			const post = await rest(page, 'GET', `/wp/v2/posts/${postId}?context=edit`);
			expect(post.content.raw).toContain(block.element(expected));
		});
	}
}

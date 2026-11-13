/**
 * "Remove all styling" in the block toolbar (#411) and a block made from an
 * empty block (#412).
 *
 * The first test styles a Typography Stylist block (a responsive size, a
 * feature span, bold, a link, a text color, padding and alignment), clicks
 * the toolbar button and compares the stored content and attributes with
 * the expected values, character for character. One undo must bring the
 * styled block back.
 *
 * The second test turns an empty Paragraph that has a paragraph style class
 * and a color into a Typography Stylist block, as the block switcher does
 * (switchToBlockType() and replaceBlocks()), and expects a block with only
 * its tag: WordPress copies the class and the color to the new block, and the
 * plugin's filter takes them away again.
 *
 * The site's "clear confirmation" option and size unit are not changed: the
 * test sets typostData in the page. Each test works on its own draft;
 * afterEach deletes it by its ID.
 */
const { test, expect } = require('@playwright/test');
const { openNewPost, canvas, deleteWithoutPage } = require('./helpers');

test.setTimeout(90000);

const STYLED_CONTENT = 'Moonlit <span class="typost-styled" data-features="dlig" style="font-feature-settings: &quot;dlig&quot; 1">garden</span> <strong>party</strong><br><a href="https://example.com/x"><em>link</em></a>';
const STYLED = {
	content: STYLED_CONTENT,
	tagName: 'h3',
	fontSize: 'responsive',
	fontSizeMin: 20,
	fontSizePreferred: 40,
	fontSizeMax: 80,
	features: [ 'liga' ],
	fontWeight: '300',
	textAlign: 'center',
	anchor: 'keep-anchor',
	style: { color: { text: '#aa0000' }, spacing: { padding: { top: '20px' } } },
};

// The block's attributes that differ from their defaults
function storedAttributes(page, clientId) {
	return page.evaluate((id) => {
		const block = wp.data.select('core/block-editor').getBlock(id);
		const defaults = wp.blocks.getBlockType(block.name).attributes;
		const out = {};
		Object.keys(block.attributes).forEach((key) => {
			const value = block.attributes[key];
			if (value === undefined || (defaults[key] && JSON.stringify(value) === JSON.stringify(defaults[key].default))) {
				return;
			}
			out[key] = value;
		});
		return out;
	}, clientId);
}

let created = [];

test.beforeEach(() => {
	created = [];
});

test.afterEach(async ({ playwright }) => {
	const failures = await deleteWithoutPage(playwright, created.splice(0));
	failures.forEach((failure) => test.info().annotations.push({ type: 'cleanup failed', description: failure }));
	expect(failures, 'cleanup: delete what the test made').toEqual([]);
});

async function startDraft(page) {
	await openNewPost(page);
	const postId = await page.evaluate(() => wp.data.select('core/editor').getCurrentPostId());
	created.push(`/wp/v2/posts/${postId}?force=true`);
	await page.evaluate(() => {
		window.typostData.showClearConfirmation = '';
		window.typostData.newFontSizeUnit = 'rem';
	});
}

test('Remove all styling strips the block in one undo step', async ({ page }) => {
	await startDraft(page);
	const clientId = await page.evaluate((attributes) => {
		const block = wp.blocks.createBlock('typost/block', attributes);
		wp.data.dispatch('core/block-editor').insertBlocks(block);
		wp.data.dispatch('core/block-editor').selectBlock(block.clientId);
		return block.clientId;
	}, STYLED);
	await expect(canvas(page).locator(`[data-block="${clientId}"]`)).toBeVisible();
	const before = await storedAttributes(page, clientId);

	const button = page.getByRole('toolbar', { name: 'Block tools' }).getByRole('button', { name: 'Remove all styling' });
	await button.click();

	await expect.poll(() => storedAttributes(page, clientId)).toEqual({
		content: 'Moonlit garden party<br><a href="https://example.com/x">link</a>',
		tagName: 'h3',
		fontWeight: '',
		anchor: 'keep-anchor',
	});
	await expect(button).toBeFocused();
	await expect(page.locator('#a11y-speak-polite')).toHaveText(/All styling removed from the block\./);

	await page.evaluate(() => wp.data.dispatch('core/editor').undo());
	await expect.poll(() => storedAttributes(page, clientId)).toEqual(before);
});

test('An empty Paragraph becomes a block with only its tag', async ({ page }) => {
	await startDraft(page);
	const sourceId = await page.evaluate(() => {
		const block = wp.blocks.createBlock('core/paragraph', {
			content: '',
			className: 'typost-styled typost-ps-1',
			style: { color: { text: '#aa0000', background: '#eeeeee' } },
		});
		wp.data.dispatch('core/block-editor').insertBlocks(block);
		wp.data.dispatch('core/block-editor').selectBlock(block.clientId);
		return block.clientId;
	});
	await expect(canvas(page).locator(`[data-block="${sourceId}"]`)).toBeAttached();

	const newId = await page.evaluate((id) => {
		const editor = wp.data.select('core/block-editor');
		const result = wp.blocks.switchToBlockType(editor.getBlocksByClientId([ id ]), 'typost/block');
		wp.data.dispatch('core/block-editor').replaceBlocks([ id ], result);
		return result[0].clientId;
	}, sourceId);

	expect(await storedAttributes(page, newId)).toEqual({ tagName: 'p', fontWeight: '' });
});

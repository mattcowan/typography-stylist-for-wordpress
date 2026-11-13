/**
 * The Typography Stylist block's heading level button (#409) and the tag a
 * new block starts with (#410).
 *
 * The button names the block's current tag. A tag the author picks in its
 * menu is remembered in this browser (localStorage), and the next block
 * from the inserter starts with it and stores it; Heading 1 is never
 * remembered. Playwright gives each test a new browser context, so the
 * test starts with nothing remembered; it still puts back what it found.
 *
 * Works on its own draft post and deletes it afterwards.
 */
const { test, expect } = require('@playwright/test');
const { openNewPost, deleteDraft } = require('./helpers');

test.setTimeout(120000);

const KEY = 'typography_stylist_new_block_tag';

async function insertBlock(page, attributes) {
	return page.evaluate((attrs) => {
		const block = wp.blocks.createBlock('typost/block', attrs);
		wp.data.dispatch('core/block-editor').insertBlocks(block);
		return block.clientId;
	}, attributes);
}

function headingButton(page, current) {
	return page.getByRole('button', { name: `Change heading level (current: ${current})`, exact: true });
}

async function pickTag(page, clientId, current, name) {
	await page.evaluate((id) => wp.data.dispatch('core/block-editor').selectBlock(id), clientId);
	await headingButton(page, current).click();
	await page.getByRole('menuitemradio', { name, exact: true }).click();
	await expect(headingButton(page, name)).toBeVisible();
}

// Add a Typography Stylist block with the main inserter and return the
// new block's tagName and its serialized comment
async function insertFromInserter(page) {
	const before = await page.evaluate(() => wp.data.select('core/block-editor').getBlockOrder());
	const toggle = page.locator('.editor-document-tools__inserter-toggle');
	await toggle.click();
	const search = page.locator('.block-editor-inserter__main-area input[type="search"]');
	await search.fill('Typography Stylist');
	// The block's own item (its class names the block, with or without the
	// default variation), not a pattern that has the same name
	await page.locator('.block-editor-block-types-list__item[class*="editor-block-list-item-typost-block"]').first().click();
	let added;
	await expect.poll(async () => {
		added = await page.evaluate((ids) => {
			const store = wp.data.select('core/block-editor');
			const id = store.getBlockOrder().find((clientId) => ids.indexOf(clientId) === -1);
			if (!id) {
				return null;
			}
			const block = store.getBlock(id);
			return { name: block.name, tagName: block.attributes.tagName, comment: wp.blocks.serialize(block).split('\n')[0] };
		}, before);
		return added && added.name;
	}).toBe('typost/block');
	if (await page.locator('.block-editor-inserter__main-area').count()) {
		await toggle.click();
	}
	return added;
}

test.describe('Typography Stylist block - heading level button', () => {
	let remembered;

	test.beforeEach(async ({ page }) => {
		await openNewPost(page);
		remembered = await page.evaluate((key) => localStorage.getItem(key), KEY);
	});

	test.afterEach(async ({ page }) => {
		await page.evaluate(([key, value]) => {
			if (value === null) {
				localStorage.removeItem(key);
			} else {
				localStorage.setItem(key, value);
			}
		}, [KEY, remembered]).catch(() => {});
		await deleteDraft(page);
	});

	test('names the current tag and starts a new block with the tag picked last, never Heading 1', async ({ page }) => {
		await page.evaluate((key) => localStorage.removeItem(key), KEY);
		const first = await insertBlock(page, { content: 'First' });

		// The button's accessible name carries the tag, and follows a pick
		await pickTag(page, first, 'Heading 2', 'Heading 4');
		expect(await page.evaluate((id) => wp.data.select('core/block-editor').getBlockAttributes(id).tagName, first)).toBe('h4');

		// A block from the inserter starts as Heading 4 and stores it
		const second = await insertFromInserter(page);
		expect(second.tagName).toBe('h4');
		expect(second.comment).toContain('"tagName":"h4"');

		// Heading 1 is not remembered
		await pickTag(page, first, 'Heading 4', 'Heading 1');
		const third = await insertFromInserter(page);
		expect(third.tagName).toBe('h4');

		// A block that code creates with no tagName is still Heading 2
		expect(await page.evaluate(() => wp.blocks.createBlock('typost/block', {}).attributes.tagName)).toBe('h2');
	});
});

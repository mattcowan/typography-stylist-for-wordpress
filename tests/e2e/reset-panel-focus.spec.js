/**
 * Keyboard focus in the block sidebar's Reset Features panel (#420).
 *
 * "Clear Individual Features" and "Reset Entire Block" each replace the two
 * buttons with a confirmation, and every button in the panel removes itself
 * from the page when it is pressed. Before #420 focus then went to the
 * document body. Now:
 *
 * - when a confirmation opens, focus goes to its "Cancel" button;
 * - "Cancel" returns focus to the button that opened the confirmation;
 * - "Yes, Clear" and "Yes, Reset All" return focus to that button too, and
 *   the polite live region says what happened;
 * - a change to another control while a confirmation is open does not move
 *   focus;
 * - "Yes, Clear" on a block with nothing to clear (no text, or no inline
 *   features) closes the confirmation, says so, writes nothing and returns
 *   focus to the opener (#455).
 *
 * The test uses real key presses from the panel's toggle on. A real caret is
 * put in the block first: Firefox can move focus into the canvas when
 * RichText writes the selection back after the content changes (#303), so
 * the test is tagged @firefox and also runs in the firefox-focus project.
 * Each test works on its own draft; afterEach deletes it by its ID.
 */
const { test, expect } = require('@playwright/test');
const { openNewPost, editable, deleteWithoutPage } = require('./helpers');

test.setTimeout(120000);

const CONTENT = 'Moonlit <span class="typost-styled" data-features="dlig" style="font-feature-settings: &quot;dlig&quot; 1">garden</span> party';

let created = [];

test.beforeEach(() => {
	created = [];
});

test.afterEach(async ({ playwright }) => {
	const failures = await deleteWithoutPage(playwright, created.splice(0));
	failures.forEach((failure) => test.info().annotations.push({ type: 'cleanup failed', description: failure }));
	expect(failures, 'cleanup: delete what the test made').toEqual([]);
});

/**
 * A draft with one styled Typography Stylist block, a real caret in its
 * text, the block sidebar open and the Reset Features panel expanded with
 * the keyboard. Returns the block's client ID and the panel.
 */
async function startWithPanel(page, content = CONTENT) {
	await openNewPost(page);
	const postId = await page.evaluate(() => wp.data.select('core/editor').getCurrentPostId());
	created.push(`/wp/v2/posts/${postId}?force=true`);

	const clientId = await page.evaluate((text) => {
		const block = wp.blocks.createBlock('typost/block', { content: text, fontWeight: '300', letterSpacing: 40 });
		wp.data.dispatch('core/block-editor').insertBlocks(block);
		wp.data.dispatch('core/block-editor').selectBlock(block.clientId);
		return block.clientId;
	}, content);
	await editable(page, clientId).click();
	await page.keyboard.press('End');
	if (content) {
		await expect.poll(() => page.evaluate(() => wp.data.select('core/block-editor').getSelectionStart().offset)).toBeGreaterThan(0);
	}

	await page.evaluate(() => wp.data.dispatch('core/edit-post').openGeneralSidebar('edit-post/block'));
	const toggle = page.getByRole('button', { name: 'Reset Features', exact: true });
	const panel = page.locator('.components-panel__body', { has: toggle });
	await toggle.focus();
	if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
		await page.keyboard.press('Enter');
	}
	await expect(toggle).toHaveAttribute('aria-expanded', 'true');
	await page.keyboard.press('Tab');
	return { clientId, panel };
}

// The focused element: its text (not the whole page when it is the body),
// and whether it is in the panel
function focused(page) {
	return page.evaluate(() => {
		const el = document.activeElement;
		const panel = el && el.closest('.components-panel__body');
		const toggle = panel && panel.querySelector('.components-panel__body-toggle');
		return {
			text: el && el !== document.body ? (el.textContent || '').trim().slice(0, 80) : null,
			tag: el ? el.tagName : null,
			inPanel: !!toggle && toggle.textContent.trim() === 'Reset Features',
		};
	});
}

async function expectFocusOn(page, text) {
	await expect.poll(() => focused(page)).toEqual({ text, tag: 'BUTTON', inPanel: true });
}

function blockAttributes(page, clientId) {
	return page.evaluate((id) => wp.data.select('core/block-editor').getBlockAttributes(id), clientId);
}

test('Clear Individual Features: focus stays in the panel, and the result is spoken @firefox', async ({ page }) => {
	const { clientId, panel } = await startWithPanel(page);
	await expectFocusOn(page, 'Clear Individual Features');

	await page.keyboard.press('Enter');
	await expectFocusOn(page, 'Cancel');
	// Cancel carries the confirmation's question and message as its
	// description, without the aria-hidden emoji
	await expect(panel.getByRole('button', { name: 'Cancel' })).toHaveAccessibleDescription(/^Are you sure\?.*This will remove all inline features/);

	await page.keyboard.press('Enter');
	await expectFocusOn(page, 'Clear Individual Features');

	await page.keyboard.press('Enter');
	await expectFocusOn(page, 'Cancel');
	await page.keyboard.press('Shift+Tab');
	await expectFocusOn(page, 'Yes, Clear');
	await page.keyboard.press('Enter');

	await expect.poll(async () => (await blockAttributes(page, clientId)).content).toBe('Moonlit garden party');
	await expectFocusOn(page, 'Clear Individual Features');
	await expect(page.locator('#a11y-speak-polite')).toHaveText(/Inline features removed from the block\./);
	// Focus is still there after the canvas has caught up
	await page.waitForTimeout(1000);
	await expectFocusOn(page, 'Clear Individual Features');

	// One undo step restores the spans (a clear that removes spans, as before #455)
	await page.evaluate(() => wp.data.dispatch('core/editor').undo());
	await expect.poll(async () => (await blockAttributes(page, clientId)).content).toBe(CONTENT);
});

// A block with nothing to clear (#455): "Yes, Clear" closes the confirmation,
// says so, writes nothing, and gives focus back to the opener. The third
// case has a span the clear does not touch (no typost-styled class).
const NOTHING_TO_CLEAR = [
	['a block with no text', ''],
	['text with no inline features', 'Moonlit garden party'],
	['text with a span that is not a Typography Stylist span', 'Moonlit <span class="other">garden</span> party'],
];

for (const [label, content] of NOTHING_TO_CLEAR) {
	test(`Clear Individual Features on ${label}: closes, says so, writes nothing @firefox`, async ({ page }) => {
		const { clientId, panel } = await startWithPanel(page, content);
		// Save the draft, so a change after this point makes the post dirty
		await page.evaluate(() => wp.data.dispatch('core/editor').savePost());
		await expect.poll(() => page.evaluate(() => !wp.data.select('core/editor').isSavingPost() && !wp.data.select('core/editor').isEditedPostDirty())).toBe(true);
		const before = await blockAttributes(page, clientId);

		await page.keyboard.press('Enter');
		await expectFocusOn(page, 'Cancel');
		await page.keyboard.press('Shift+Tab');
		await expectFocusOn(page, 'Yes, Clear');
		await page.keyboard.press('Enter');

		// The confirmation is closed, and focus is on the opener
		await expect(panel.getByRole('button', { name: 'Yes, Clear' })).toHaveCount(0);
		await expectFocusOn(page, 'Clear Individual Features');
		await expect(page.locator('#a11y-speak-polite')).toHaveText(/No inline features to remove/);
		await expect(page.locator('#a11y-speak-polite')).not.toHaveText(/Inline features removed from the block/);
		// Nothing was written
		await page.waitForTimeout(1000);
		expect(await blockAttributes(page, clientId)).toEqual(before);
		expect(await page.evaluate(() => wp.data.select('core/editor').isEditedPostDirty()), 'the post stays clean').toBe(false);
		await expectFocusOn(page, 'Clear Individual Features');
	});
}

test('Reset Entire Block: focus stays in the panel, the result is spoken, and one undo restores the block @firefox', async ({ page }) => {
	const { clientId, panel } = await startWithPanel(page);
	await page.keyboard.press('Tab');
	await expectFocusOn(page, 'Reset Entire Block');

	await page.keyboard.press('Enter');
	await expectFocusOn(page, 'Cancel');
	await expect(panel.getByRole('button', { name: 'Cancel' })).toHaveAccessibleDescription(/^Reset Entire Block\?.*This removes all styling from the block/);

	await page.keyboard.press('Enter');
	await expectFocusOn(page, 'Reset Entire Block');

	await page.keyboard.press('Enter');
	await expectFocusOn(page, 'Cancel');
	const before = await blockAttributes(page, clientId);
	await page.keyboard.press('Shift+Tab');
	await expectFocusOn(page, 'Yes, Reset All');
	await page.keyboard.press('Enter');

	await expect.poll(async () => (await blockAttributes(page, clientId)).fontWeight).toBe('');
	expect((await blockAttributes(page, clientId)).content).toBe('Moonlit garden party');
	await expectFocusOn(page, 'Reset Entire Block');
	await expect(page.locator('#a11y-speak-polite')).toHaveText(/All styling removed from the block\./);
	await page.waitForTimeout(1000);
	await expectFocusOn(page, 'Reset Entire Block');

	await page.evaluate(() => wp.data.dispatch('core/editor').undo());
	await expect.poll(() => blockAttributes(page, clientId)).toEqual(before);
});

test('A change to another control while a confirmation is open does not move focus @firefox', async ({ page }) => {
	const { clientId } = await startWithPanel(page);
	await page.keyboard.press('Enter');
	await expectFocusOn(page, 'Cancel');

	// A change from outside the panel: the sidebar renders again
	await page.evaluate((id) => wp.data.dispatch('core/block-editor').updateBlockAttributes(id, { letterSpacing: 60 }), clientId);
	await page.waitForTimeout(500);
	await expectFocusOn(page, 'Cancel');

	// An edit in another sidebar control, with real key presses
	const anchor = page.getByRole('textbox', { name: 'HTML anchor' });
	if (!(await anchor.isVisible())) {
		await page.getByRole('button', { name: 'Advanced', exact: true }).click();
	}
	await anchor.focus();
	await page.keyboard.type('ab');
	await expect.poll(async () => (await blockAttributes(page, clientId)).anchor).toBe('ab');
	await page.waitForTimeout(500);
	expect(await page.evaluate(() => document.activeElement.getAttribute('aria-label') || (document.activeElement.labels && document.activeElement.labels[0] && document.activeElement.labels[0].textContent))).toMatch(/HTML anchor/);
});

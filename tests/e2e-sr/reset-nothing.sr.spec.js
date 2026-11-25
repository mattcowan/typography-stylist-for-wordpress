/**
 * NVDA journey for #455: "Yes, Clear" in the Reset Features panel when there
 * is nothing to clear.
 * Runs the PR's four manual NVDA steps with real key presses sent through
 * NVDA (Firefox): an empty block, plain text, then text with an inline
 * feature. Each run opens "Clear Individual Features", moves to "Yes, Clear"
 * and presses Enter, then records what NVDA said and where focus is.
 */
const { nvdaTest: test } = require('@guidepup/playwright');
const { expect } = require('@playwright/test');
const h = require('./helpers');

test.use({ nvdaStartOptions: { capture: true } });

const PANEL = '.block-editor-block-inspector';
const STYLED = 'Moonlit <span class="typost-styled" data-features="dlig" style="font-feature-settings: &quot;dlig&quot; 1">garden</span> party';

async function phraseAfter(nvda, wait) {
	await h.delay(wait || 1200);
	return nvda.lastSpokenPhrase();
}

async function focusText(page) {
	return page.evaluate(() => {
		const a = document.activeElement;
		return a ? (a.textContent || '').trim().slice(0, 60) : null;
	});
}

/** Insert a block, open its Reset Features panel, run "Yes, Clear" through NVDA. */
async function clearRun(page, nvda, content) {
	const clientId = await h.insertBlock(page, 'typost/block', { content, tagName: 'h2' });
	await page.evaluate((id) => {
		wp.data.dispatch('core/block-editor').selectBlock(id);
		const ed = wp.data.dispatch('core/edit-post');
		if (ed && ed.openGeneralSidebar) ed.openGeneralSidebar('edit-post/block');
	}, clientId);
	await page.waitForSelector(PANEL, { timeout: 30000 });
	const toggle = page.locator(PANEL + ' button.components-panel__body-toggle', { hasText: 'Reset Features' });
	await toggle.scrollIntoViewIfNeeded();
	if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
		await toggle.click();
		await h.delay(300);
	}
	const opener = page.locator(PANEL + ' button', { hasText: 'Clear Individual Features' });
	await opener.focus();
	await h.delay(300);
	await nvda.press('Enter');
	const opened = await phraseAfter(nvda);
	await nvda.press('Shift+Tab');
	const onYes = await phraseAfter(nvda, 600);
	const yesFocused = await focusText(page);
	await nvda.press('Enter');
	const result = await phraseAfter(nvda, 2500);
	const after = await page.evaluate((id) => wp.data.select('core/block-editor').getBlockAttributes(id).content, clientId);
	const before = typeof content === 'string' ? content : '';
	return { opened, onYes, yesFocused, result, focus: await focusText(page), contentChanged: String(after) !== before, after: String(after), clientId };
}

test.describe('Clear Individual Features with nothing to clear, with NVDA (#455)', () => {
	test.afterEach(async ({ page }) => {
		await h.deleteCurrentPost(page);
	});

	test('an empty block, plain text, then an inline feature', async ({ page, nvda }) => {
		await h.openNewPost(page);
		const focusTitles = await h.focusBrowser(page, nvda);

		const empty = await clearRun(page, nvda, '');
		const plain = await clearRun(page, nvda, 'Plain words only');
		const styled = await clearRun(page, nvda, STYLED);

		const log = await h.saveSpeechLog(nvda, 'reset-nothing', { focusTitles, empty, plain, styled });
		const all = log.join(' | ');
		console.log(JSON.stringify({ empty, plain, styled }, null, 2));

		expect(empty.yesFocused, 'empty: Shift+Tab reached Yes, Clear').toBe('Yes, Clear');
		expect(empty.result, 'empty: NVDA says nothing to remove').toMatch(/No inline features to remove/i);
		expect(empty.focus, 'empty: focus back on the opener').toBe('Clear Individual Features');
		expect(empty.contentChanged, 'empty: content unchanged').toBe(false);

		expect(plain.result, 'plain: NVDA says nothing to remove').toMatch(/No inline features to remove/i);
		expect(plain.result, 'plain: no false success').not.toMatch(/Inline features removed/i);
		expect(plain.focus, 'plain: focus back on the opener').toBe('Clear Individual Features');
		expect(plain.contentChanged, 'plain: content unchanged').toBe(false);

		expect(styled.result, 'styled: NVDA says the features were removed').toMatch(/Inline features removed from the block/i);
		expect(styled.focus, 'styled: focus back on the opener').toBe('Clear Individual Features');
		expect(styled.after, 'styled: the span is gone').not.toMatch(/typost-styled/);
		expect(all).toBeTruthy();
	});
});

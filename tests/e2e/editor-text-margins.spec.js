/**
 * The text of a Typography Stylist block has the same margins in the editor
 * as on the frontend (#422).
 *
 * On the frontend the visual copy has typost-styled, and style.css resets its
 * margin and padding, so only the block's own (wrapper) margins count, as for
 * a core block. In the editor the RichText has typost-styled only with a
 * paragraph style or fit to width; editor.css gives it the same reset. Without
 * it, the theme's or the browser's h1-h6 and p margins stayed on the text and
 * moved it wherever they did not collapse into the wrapper's margins.
 *
 * Each test inserts, for h1, h2 and p, a Typography Stylist block and the
 * matching core block, both with a top and bottom margin of 0 in the
 * Dimensions panel, between core Paragraphs. A core block with 0 margins is
 * the reference: its text has no margin of its own, so the space to its
 * neighbors is what the theme's flow gives. The Typography Stylist block must
 * get the same space (within 1px). Works on its own draft and deletes it.
 */
const { test, expect } = require('@playwright/test');
const { openNewPost, deleteDraft, canvas } = require('./helpers');

test.setTimeout(120000);

const ZERO = { spacing: { margin: { top: '0', bottom: '0' } } };

test.describe('Typography Stylist block - text margins in the editor (#422)', () => {
	test.beforeEach(async ({ page }) => {
		await openNewPost(page);
	});

	test.afterEach(async ({ page }) => {
		await deleteDraft(page);
	});

	test('the text has no margin or padding of its own, and the same space as a core block', async ({ page }) => {
		const ids = await page.evaluate((zero) => {
			const c = wp.blocks.createBlock;
			const para = () => c('core/paragraph', { content: 'Filler text between the blocks.' });
			const out = {};
			const blocks = [para()];
			[['h1', 1], ['h2', 2], ['p', 0]].forEach(([tag, level]) => {
				const own = c('typost/block', { content: 'Typography Stylist ' + tag, tagName: tag, style: zero });
				const core = level
					? c('core/heading', { level, content: 'Core ' + tag, style: zero })
					: c('core/paragraph', { content: 'Core ' + tag, style: zero });
				out[tag] = { own: own.clientId, core: core.clientId };
				blocks.push(own, para(), core, para());
			});
			wp.data.dispatch('core/block-editor').insertBlocks(blocks);
			return out;
		}, ZERO);

		const frame = canvas(page);
		for (const tag of Object.keys(ids)) {
			await expect(frame.locator(`[data-block="${ids[tag].own}"] .typost-block-content`)).toBeVisible();
			await expect(frame.locator(`[data-block="${ids[tag].core}"]`)).toBeVisible();
		}

		const measured = await page.evaluate((all) => {
			const f = document.querySelector('iframe[name="editor-canvas"]');
			const d = f.contentDocument;
			const win = f.contentWindow;
			const gaps = (block, text) => ({
				above: text.getBoundingClientRect().top - block.previousElementSibling.getBoundingClientRect().bottom,
				below: block.nextElementSibling.getBoundingClientRect().top - text.getBoundingClientRect().bottom,
			});
			const out = {};
			Object.keys(all).forEach((tag) => {
				const ownBlock = d.querySelector(`[data-block="${all[tag].own}"]`);
				const ownText = ownBlock.querySelector('.typost-block-content');
				const coreBlock = d.querySelector(`[data-block="${all[tag].core}"]`);
				const s = win.getComputedStyle(ownText);
				out[tag] = {
					tagName: ownText.tagName.toLowerCase(),
					box: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left']
						.map((p) => p + ' ' + s.getPropertyValue(p)),
					own: gaps(ownBlock, ownText),
					core: gaps(coreBlock, coreBlock),
				};
			});
			return out;
		}, ids);

		for (const tag of Object.keys(measured)) {
			const m = measured[tag];
			expect(m.tagName, `${tag}: the RichText tag`).toBe(tag);
			expect(m.box, `${tag}: margin and padding of the text`).toEqual([
				'margin-top 0px', 'margin-right 0px', 'margin-bottom 0px', 'margin-left 0px',
				'padding-top 0px', 'padding-right 0px', 'padding-bottom 0px', 'padding-left 0px',
			]);
			expect(Math.abs(m.own.above - m.core.above), `${tag}: space above (own ${m.own.above}, core ${m.core.above})`).toBeLessThanOrEqual(1);
			expect(Math.abs(m.own.below - m.core.below), `${tag}: space below (own ${m.own.below}, core ${m.core.below})`).toBeLessThanOrEqual(1);
		}
	});
});

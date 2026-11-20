/**
 * #458: a fit-to-width line with letter spacing fills the text box, in the
 * editor and on the frontend.
 *
 * Letter spacing is written in em on the heading (the block's own value
 * inline, or a paragraph style's class rule). An em value is resolved at the
 * element that declares it, so before the fix every fit line inherited the
 * spacing at the heading's fallback font size, not at its own size, while
 * the measurement used em at the line's size. Lines with negative spacing ran
 * past the box, lines with positive spacing stopped short. Each line now
 * reads the spacing from --typost-fit-letter-spacing and resolves it at its
 * own size.
 *
 * A second cause, for the blocks under a paragraph style: a style apply
 * copies the style's values into the block attributes (fontWeight '400'
 * when the style sets no weight), and the measurement set those on its
 * probe although only the class renders under a style. In a theme with bold
 * headings the probe measured at 400 and the lines rendered bold, 5% to 8%
 * past the box. The test makes the headings bold itself (HEADING_CSS), in
 * the editor canvas and on the frontend, so it checks this in any theme.
 *
 * One draft post with five fit blocks: block-level spacing with and without
 * a hang, the same under a paragraph style, and a block with no spacing. The
 * test creates its own styles (named "ZZ #458 …") and deletes them and the
 * post afterwards.
 *
 * The tolerance is a fraction of the box width, because CI's fonts differ
 * from the local ones. Before the fix the lines missed the edge by 2% to 5%
 * of the box.
 */
const { test, expect } = require('@playwright/test');
const { BASE, canvas, openNewPost, rest, deleteWithoutPage } = require('./helpers');

test.setTimeout(240000);

const TOLERANCE = 0.01;
// A theme's bold headings, which a style with no weight of its own shows
const HEADING_CSS = '.wp-block-typost h2 { font-weight: 700; }';
const FIT = { fontSize: 'fit', fontSizeUnit: 'rem', fontSizeMin: 16, fontSizePreferred: 32, fontSizeMax: 64 };

// The right edge of each line's text against the right edge of the
// heading's content box. A hung line starts left of the box, but its text
// must still end at the right edge, so the right edge is the test for both.
function measureLines(heading) {
	const view = heading.ownerDocument.defaultView;
	const style = view.getComputedStyle(heading);
	const rect = heading.getBoundingClientRect();
	const left = rect.left + parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth);
	const right = rect.right - parseFloat(style.paddingRight) - parseFloat(style.borderRightWidth);
	return {
		width: right - left,
		lines: Array.from(heading.querySelectorAll('.typost-line'), (line) => {
			const range = heading.ownerDocument.createRange();
			range.selectNodeContents(line);
			return { text: line.textContent, over: range.getBoundingClientRect().right - right };
		}),
	};
}

function expectLinesFill(where, label, measured) {
	expect(measured.lines.length, `${where}: ${label} shows two fit lines`).toBe(2);
	const tolerance = measured.width * TOLERANCE;
	measured.lines.forEach((line, i) => {
		// Soft, so a failure lists every line that misses the edge
		expect.soft(Math.abs(line.over), `${where}: ${label}, line ${i + 1} ("${line.text}") ends ${line.over.toFixed(1)}px from the edge of the ${measured.width.toFixed(1)}px box`).toBeLessThanOrEqual(tolerance);
	});
}

test('fit lines with letter spacing fill the box in the editor and on the frontend', async ({ page, playwright }) => {
	const cleanup = [];
	try {
		const styleSpacing = await rest(page, 'POST', '/typost/v1/paragraph-styles', {
			name: 'ZZ #458 fit letter spacing',
			properties: Object.assign({ letterSpacing: -50 }, FIT),
		});
		cleanup.push(`/typost/v1/paragraph-styles/${styleSpacing.id}`);
		const styleSpacingHang = await rest(page, 'POST', '/typost/v1/paragraph-styles', {
			name: 'ZZ #458 fit letter spacing hang',
			properties: Object.assign({ letterSpacing: 60, initialHang: 0.1 }, FIT),
		});
		cleanup.push(`/typost/v1/paragraph-styles/${styleSpacingHang.id}`);

		const cases = [
			{ label: 'Moonlit', attributes: { letterSpacing: -50 } },
			{ label: 'Silver', attributes: { letterSpacing: 60, initialHang: 0.1 } },
			{ label: 'Golden', style: styleSpacing.id },
			{ label: 'Velvet', style: styleSpacingHang.id },
			{ label: 'Amber', attributes: {} },
		];

		await openNewPost(page);
		// Before the blocks exist, so the first measurement sees bold headings
		await page.waitForFunction(() => {
			const frame = document.querySelector('iframe[name="editor-canvas"]');
			return !!(frame && frame.contentDocument && frame.contentDocument.head);
		});
		await page.frame({ name: 'editor-canvas' }).addStyleTag({ content: HEADING_CSS });
		const clientIds = await page.evaluate(({ cases, FIT }) => cases.map((c) => {
			let attributes = Object.assign({ content: `${c.label} garden<br>party tonight` }, FIT, c.attributes || {});
			if (c.style) {
				// The attributes a style apply writes: a copy of the style's
				// values, so the block has no override of its own
				const style = window.typostData.paragraphStyles.find((s) => String(s.id) === String(c.style));
				const props = window.typostPSUtils.normalizeApplyProperties(style.properties);
				attributes = Object.assign(attributes, props, { styleClass: `typost-ps-${style.id}` });
			}
			const block = wp.blocks.createBlock('typost/block', attributes);
			wp.data.dispatch('core/block-editor').insertBlocks(block);
			return block.clientId;
		}), { cases, FIT });
		const postId = await page.evaluate(() => wp.data.select('core/editor').getCurrentPostId());
		cleanup.unshift(`/wp/v2/posts/${postId}?force=true`);

		// Wait until every block has measured its lines
		await expect.poll(() => page.evaluate((ids) => ids.every((id) => {
			const sizes = wp.data.select('core/block-editor').getBlockAttributes(id).fitLineSizes;
			return Array.isArray(sizes) && sizes.length === 2;
		}), clientIds), { timeout: 60000 }).toBe(true);
		let previous = null;
		await expect.poll(async () => {
			const now = await page.evaluate((ids) => JSON.stringify(ids.map((id) => wp.data.select('core/block-editor').getBlockAttributes(id).fitLineSizes)), clientIds);
			const stable = now === previous;
			previous = now;
			return stable;
		}, { timeout: 30000, intervals: [1500] }).toBe(true);

		for (let i = 0; i < cases.length; i++) {
			const measured = await canvas(page).locator(`[data-block="${clientIds[i]}"] .typost-block-content.typost-fit`).evaluate(measureLines);
			expectLinesFill('editor', cases[i].label, measured);
		}

		await page.evaluate(() => wp.data.dispatch('core/editor').editPost({ title: 'ZZ #458 fit letter spacing', status: 'draft' }));
		await page.evaluate(() => wp.data.dispatch('core/editor').savePost());
		expect(await page.evaluate(() => wp.data.select('core/editor').didPostSaveRequestSucceed()), 'the save succeeded').toBe(true);

		await page.goto(`${BASE}/?p=${postId}&preview=true`, { waitUntil: 'load' });
		await page.addStyleTag({ content: HEADING_CSS });
		await page.evaluate(() => document.fonts.ready.then(() => true));
		for (const c of cases) {
			const heading = page.locator('.wp-block-typost .typost-fit').filter({ hasText: `${c.label} garden` });
			await expect(heading, `frontend: ${c.label} is on the page`).toHaveCount(1);
			expectLinesFill('frontend', c.label, await heading.evaluate(measureLines));
		}
	} finally {
		const failures = await deleteWithoutPage(playwright, cleanup);
		expect(failures, 'the test deleted its post and styles').toEqual([]);
	}
});

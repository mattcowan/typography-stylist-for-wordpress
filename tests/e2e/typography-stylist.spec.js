const { test, expect } = require('@playwright/test');

// Increase timeout for WordPress editor operations
test.setTimeout(90000);

test.describe('Typography Stylist - Inline Features', () => {
  test.beforeEach(async ({ page }) => {
    // Load auth state
    const authState = require('./auth.json');
    await page.context().addCookies(authState.cookies);

    // Navigate to new post
    await page.goto(`${process.env.WP_BASE_URL}/wp-admin/post-new.php`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // Wait for the editor iframe to load
    await page.waitForSelector('.block-editor-iframe__container iframe', { timeout: 30000 });
    await page.waitForTimeout(2000);

    // Close welcome guide if present (in main page, not iframe)
    try {
      const closeButton = page.locator('.edit-post-welcome-guide button[aria-label="Close"]').or(
        page.locator('.edit-post-welcome-guide button:has-text("Close")')
      ).first();

      if (await closeButton.isVisible({ timeout: 2000 })) {
        await closeButton.click();
        await page.waitForTimeout(1000);
      }
    } catch (e) {
      // Welcome guide not present, continue
    }

    // Use frameLocator to access iframe content
    const iframe = page.frameLocator('iframe[name="editor-canvas"]');

    // Click the Block Inserter button in the main toolbar
    await page.getByRole('button', { name: 'Block Inserter' }).click();
    await page.waitForTimeout(1000);

    // Search for Typography Stylist in the inserter
    const searchBox = page.getByRole('searchbox', { name: 'Search' });
    await searchBox.fill('typography stylist');
    await page.waitForTimeout(500);

    // Click on Typography Stylist option
    await page.getByRole('option', { name: 'Typography Stylist' }).click();
    await page.waitForTimeout(2000);

    // Wait for Typography Stylist block to be present in iframe
    await iframe.locator('[data-type="typost/block"]').waitFor({ state: 'visible', timeout: 10000 });

    // Close the Block Inserter to allow keyboard input to the iframe
    await page.getByRole('button', { name: 'Close Block Inserter' }).click();
    await page.waitForTimeout(500);

    // Find the contenteditable element within the block and type into it
    const editor = iframe.locator('[data-type="typost/block"] [contenteditable]').first();
    await editor.waitFor({ state: 'visible', timeout: 5000 });
    await editor.click();
    await page.waitForTimeout(1000);

    // Use pressSequentially to type into the contenteditable (works better than keyboard.type for contenteditable)
    await editor.pressSequentially('Hello Beautiful World', { delay: 50 });
    await page.waitForTimeout(1000);
  });

  test('font size persists after apply and close', async ({ page }) => {
    // Get iframe using frameLocator
    const iframe = page.frameLocator('iframe[name="editor-canvas"]');
    const editor = iframe.locator('[data-type="typost/block"] [contenteditable]').first();

    // Select "Beautiful" using keyboard navigation
    await editor.click();
    await page.keyboard.press('Home');
    await page.waitForTimeout(300);

    // Move to start of "Beautiful" (after "Hello ")
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(50);
    }

    // Select "Beautiful" (9 characters)
    await page.keyboard.down('Shift');
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(50);
    }
    await page.keyboard.up('Shift');
    await page.waitForTimeout(500);

    // Wait for Typography Stylist Features button to appear (in main page, not iframe)
    const toggleButton = page.locator('button[aria-label="Typography Stylist Features"]');
    await toggleButton.waitFor({ state: 'visible', timeout: 10000 });
    await toggleButton.click();
    await page.waitForTimeout(1000);

    // Wait for popover (in main page)
    const popover = page.locator('.typost-block-modal');
    await popover.waitFor({ state: 'visible', timeout: 10000 });

    // Change to responsive font size
    const fontSizeSelect = popover.getByLabel('Font Size (for selected text)');
    await fontSizeSelect.selectOption('responsive');
    await page.waitForTimeout(1000);

    // Wait for responsive controls to appear and fill them
    const minInput = popover.locator('input[type="number"]').nth(0);
    await minInput.waitFor({ state: 'visible', timeout: 5000 });
    await minInput.clear();
    await minInput.fill('20');
    await page.waitForTimeout(300);

    const preferredInput = popover.locator('input[type="number"]').nth(1);
    await preferredInput.clear();
    await preferredInput.fill('40');
    await page.waitForTimeout(300);

    const maxInput = popover.locator('input[type="number"]').nth(2);
    await maxInput.clear();
    await maxInput.fill('80');
    await page.waitForTimeout(500);

    // Click Apply Font Size button
    const applyButton = page.locator('button:has-text("Apply Font Size")');
    await applyButton.waitFor({ state: 'visible', timeout: 5000 });
    await applyButton.click();
    await page.waitForTimeout(2000);

    // Close popover by pressing Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);

    // Verify font size styling persists (check in iframe)
    const styledSpan = editor.locator('span.typost-styled[data-fontsize="responsive"]');
    await expect(styledSpan).toHaveText('Beautiful', { timeout: 10000 });
    await expect(styledSpan).toHaveAttribute('data-fontsize-min', '20');
    await expect(styledSpan).toHaveAttribute('data-fontsize-max', '80');

    // Verify computed style has clamp()
    const style = await styledSpan.getAttribute('style');
    expect(style).toContain('clamp(');
  });

  test('font weight persists after apply and close', async ({ page }) => {
    const iframe = page.frameLocator('iframe[name="editor-canvas"]');
    const editor = iframe.locator('[data-type="typost/block"] [contenteditable]').first();

    // Select "World" using keyboard
    await editor.click();
    await page.keyboard.press('End');
    await page.waitForTimeout(300);

    // Move back to select "World" (5 characters)
    await page.keyboard.down('Shift');
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(50);
    }
    await page.keyboard.up('Shift');
    await page.waitForTimeout(500);

    // Open Typography Stylist Features
    const toggleButton = page.locator('button[aria-label="Typography Stylist Features"]');
    await toggleButton.waitFor({ state: 'visible', timeout: 10000 });
    await toggleButton.click();
    await page.waitForTimeout(1000);

    const popover = page.locator('.typost-block-modal');
    await popover.waitFor({ state: 'visible', timeout: 10000 });

    // Find and change font weight select
    const fontWeightSelect = popover.getByLabel('Font Weight (for selected text)');
    await fontWeightSelect.selectOption('700');
    await page.waitForTimeout(500);

    // Click Apply Font Weight
    const applyButton = page.locator('button:has-text("Apply Font Weight")');
    await applyButton.waitFor({ state: 'visible', timeout: 5000 });
    await applyButton.click();
    await page.waitForTimeout(2000);

    // Close popover
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);

    // Verify font weight persists
    const styledSpan = editor.locator('span.typost-styled[data-fontweight="700"]');
    await expect(styledSpan).toHaveText('World', { timeout: 10000 });

    const style = await styledSpan.getAttribute('style');
    expect(style).toContain('font-weight');
  });

  test('letter spacing persists after apply and close', async ({ page }) => {
    const iframe = page.frameLocator('iframe[name="editor-canvas"]');
    const editor = iframe.locator('[data-type="typost/block"] [contenteditable]').first();

    // Select "Hello"
    await editor.click();
    await page.keyboard.press('Home');
    await page.waitForTimeout(300);

    // Select "Hello" (5 characters)
    await page.keyboard.down('Shift');
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(50);
    }
    await page.keyboard.up('Shift');
    await page.waitForTimeout(500);

    // Open Typography Stylist Features
    const toggleButton = page.locator('button[aria-label="Typography Stylist Features"]');
    await toggleButton.waitFor({ state: 'visible', timeout: 10000 });
    await toggleButton.click();
    await page.waitForTimeout(1000);

    const popover = page.locator('.typost-block-modal');
    await popover.waitFor({ state: 'visible', timeout: 10000 });

    // Find and adjust letter spacing range input (use spinbutton, not slider)
    const letterSpacingInput = popover.getByRole('spinbutton', { name: 'Letter Spacing (for selected text)' });
    await letterSpacingInput.fill('100');
    await page.waitForTimeout(500);

    // Click Apply Letter Spacing
    const applyButton = page.locator('button:has-text("Apply Letter Spacing")');
    await applyButton.waitFor({ state: 'visible', timeout: 5000 });
    await applyButton.click();
    await page.waitForTimeout(2000);

    // Close popover
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);

    // Verify letter spacing persists
    const styledSpan = editor.locator('span.typost-styled').first();
    await expect(styledSpan).toHaveText('Hello', { timeout: 10000 });

    const style = await styledSpan.getAttribute('style');
    expect(style).toContain('letter-spacing');
  });

  test('line height persists after apply and close', async ({ page }) => {
    const iframe = page.frameLocator('iframe[name="editor-canvas"]');
    const editor = iframe.locator('[data-type="typost/block"] [contenteditable]').first();

    // Select "Hello"
    await editor.click();
    await page.keyboard.press('Home');
    await page.waitForTimeout(300);

    // Select "Hello" (5 characters)
    await page.keyboard.down('Shift');
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(50);
    }
    await page.keyboard.up('Shift');
    await page.waitForTimeout(500);

    // Open Typography Stylist Features
    const toggleButton = page.locator('button[aria-label="Typography Stylist Features"]');
    await toggleButton.waitFor({ state: 'visible', timeout: 10000 });
    await toggleButton.click();
    await page.waitForTimeout(1000);

    const popover = page.locator('.typost-block-modal');
    await popover.waitFor({ state: 'visible', timeout: 10000 });

    // Find and adjust line height input (use spinbutton, not slider)
    const lineHeightInput = popover.getByRole('spinbutton', { name: 'Line Height (for selected text)' });
    await lineHeightInput.clear();
    await lineHeightInput.fill('1.8');
    await page.waitForTimeout(500);

    // Click Apply Line Height
    const applyButton = page.locator('button:has-text("Apply Line Height")');
    await applyButton.waitFor({ state: 'visible', timeout: 5000 });
    await applyButton.click();
    await page.waitForTimeout(2000);

    // Close popover
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);

    // Verify line height persists
    const styledSpan = editor.locator('span.typost-styled').first();
    await expect(styledSpan).toHaveText('Hello', { timeout: 10000 });

    const style = await styledSpan.getAttribute('style');
    expect(style).toContain('line-height');
  });

  test('sequential feature application works correctly', async ({ page }) => {
    const iframe = page.frameLocator('iframe[name="editor-canvas"]');
    const editor = iframe.locator('[data-type="typost/block"] [contenteditable]').first();

    // First: Apply line-height to "Beautiful"
    await editor.click();
    await page.keyboard.press('Home');
    await page.waitForTimeout(300);

    // Move to "Beautiful"
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(50);
    }

    // Select "Beautiful"
    await page.keyboard.down('Shift');
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(50);
    }
    await page.keyboard.up('Shift');
    await page.waitForTimeout(500);

    // Open popover and apply line height
    let toggleButton = page.locator('button[aria-label="Typography Stylist Features"]');
    await toggleButton.waitFor({ state: 'visible', timeout: 10000 });
    await toggleButton.click();
    await page.waitForTimeout(1000);

    let popover = page.locator('.typost-block-modal');
    await popover.waitFor({ state: 'visible', timeout: 10000 });

    const lineHeightInput = popover.getByRole('spinbutton', { name: 'Line Height (for selected text)' });
    await lineHeightInput.clear();
    await lineHeightInput.fill('1.5');
    await page.waitForTimeout(500);

    let applyButton = page.locator('button:has-text("Apply Line Height")');
    await applyButton.click();
    await page.waitForTimeout(2000);

    // Close modal by clicking Close button
    let closeButton = popover.getByRole('button', { name: 'Close' });
    await closeButton.click();
    await page.waitForTimeout(1000);

    // Second: Apply letter-spacing to "World"
    await editor.click();
    await page.keyboard.press('End');
    await page.waitForTimeout(300);

    // Select "World"
    await page.keyboard.down('Shift');
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(50);
    }
    await page.keyboard.up('Shift');
    await page.waitForTimeout(500);

    // Open popover and apply letter spacing
    toggleButton = page.locator('button[aria-label="Typography Stylist Features"]');
    await toggleButton.waitFor({ state: 'visible', timeout: 10000 });
    await toggleButton.click();
    await page.waitForTimeout(1000);

    popover = page.locator('.typost-block-modal');
    await popover.waitFor({ state: 'visible', timeout: 10000 });

    const letterSpacingInput = popover.getByRole('spinbutton', { name: 'Letter Spacing (for selected text)' });
    await letterSpacingInput.fill('50');
    await page.waitForTimeout(500);

    applyButton = page.locator('button:has-text("Apply Letter Spacing")');
    await applyButton.click();
    await page.waitForTimeout(2000);

    // Close modal by clicking Close button
    closeButton = popover.getByRole('button', { name: 'Close' });
    await closeButton.click();
    await page.waitForTimeout(1000);

    // Verify both features applied correctly to different words
    const spans = editor.locator('span.typost-styled');
    await expect(spans).toHaveCount(2, { timeout: 10000 });

    // First span should have line-height only
    const lineHeightSpan = spans.first();
    await expect(lineHeightSpan).toHaveText('Beautiful');
    const lineHeightStyle = await lineHeightSpan.getAttribute('style');
    expect(lineHeightStyle).toContain('line-height');

    // Second span should have letter-spacing only
    const letterSpacingSpan = spans.last();
    await expect(letterSpacingSpan).toHaveText('World');
    const letterSpacingStyle = await letterSpacingSpan.getAttribute('style');
    expect(letterSpacingStyle).toContain('letter-spacing');
  });
});

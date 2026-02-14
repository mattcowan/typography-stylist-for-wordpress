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
    await expect(styledSpan).toHaveAttribute('data-fontsize-preferred', '40');
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

  test('font family persists after apply and close', async ({ page }) => {
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

    // Open Typography Stylist Features
    const toggleButton = page.locator('button[aria-label="Typography Stylist Features"]');
    await toggleButton.waitFor({ state: 'visible', timeout: 10000 });
    await toggleButton.click();
    await page.waitForTimeout(1000);

    const popover = page.locator('.typost-block-modal');
    await popover.waitFor({ state: 'visible', timeout: 10000 });

    // Find and change font family select
    const fontFamilySelect = popover.getByLabel('Font Family (for selected text)');

    // Get all options to find first non-empty value
    const options = await fontFamilySelect.locator('option').all();
    let selectedValue = '';

    for (const option of options) {
      const value = await option.getAttribute('value');
      if (value && value.trim() !== '' && value !== 'inherit') {
        selectedValue = value;
        break;
      }
    }

    // Only run assertions if we have a font available
    if (selectedValue) {
      await fontFamilySelect.selectOption(selectedValue);
      await page.waitForTimeout(500);

      // Click Apply Font Family
      const applyButton = page.locator('button:has-text("Apply Font Family")');
      await applyButton.waitFor({ state: 'visible', timeout: 5000 });
      await applyButton.click();
      await page.waitForTimeout(2000);

      // Close popover
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);

      // Verify font family persists
      const styledSpan = editor.locator(`span.typost-styled[data-font-id="${selectedValue}"]`);
      await expect(styledSpan).toHaveText('Beautiful', { timeout: 10000 });

      // Verify only one span was created (selection-only application)
      const allStyledSpans = editor.locator('span.typost-styled');
      await expect(allStyledSpans).toHaveCount(1);

      // Verify CSS contains font-family
      const style = await styledSpan.getAttribute('style');
      expect(style).toContain('font-family');
    } else {
      // No fonts available - skip test gracefully
      test.skip(true, 'No custom fonts available for testing, skipping font family assertions');
    }
  });

  // ===== NEW TESTS FOR INLINE STYLE DETECTION & SMART APPLY =====

  test('detection: letter-spacing shows applied value when re-selecting styled text', async ({ page }) => {
    const iframe = page.frameLocator('iframe[name="editor-canvas"]');
    const editor = iframe.locator('[data-type="typost/block"] [contenteditable]').first();

    // Select "Beautiful"
    await editor.click();
    await page.keyboard.press('Home');
    await page.waitForTimeout(300);
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(50);
    }
    await page.keyboard.down('Shift');
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(50);
    }
    await page.keyboard.up('Shift');
    await page.waitForTimeout(500);

    // Open popover
    const toggleButton = page.locator('button[aria-label="Typography Stylist Features"]');
    await toggleButton.waitFor({ state: 'visible', timeout: 10000 });
    await toggleButton.click();
    await page.waitForTimeout(1000);

    const popover = page.locator('.typost-block-modal');
    await popover.waitFor({ state: 'visible', timeout: 10000 });

    // Set letter-spacing to 150
    const letterSpacingInput = popover.getByLabel('Letter Spacing', { exact: false });
    await letterSpacingInput.waitFor({ state: 'visible', timeout: 5000 });
    await letterSpacingInput.fill('150');
    await page.waitForTimeout(300);

    // Click Apply Letter Spacing
    const applyButton = page.locator('button:has-text("Apply Letter Spacing")');
    await applyButton.waitFor({ state: 'visible', timeout: 5000 });
    await applyButton.click();
    await page.waitForTimeout(1000);

    // Close popover
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);

    // Re-select "Beautiful"
    await editor.click();
    await page.keyboard.press('Home');
    await page.waitForTimeout(300);
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(50);
    }
    await page.keyboard.down('Shift');
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(50);
    }
    await page.keyboard.up('Shift');
    await page.waitForTimeout(500);

    // Open popover again
    await toggleButton.click();
    await page.waitForTimeout(1000);

    // Verify letter-spacing input shows 150 (not 0)
    const letterSpacingValue = await letterSpacingInput.inputValue();
    expect(letterSpacingValue).toBe('150');
  });

  test('detection: line-height shows applied value when re-selecting styled text', async ({ page }) => {
    const iframe = page.frameLocator('iframe[name="editor-canvas"]');
    const editor = iframe.locator('[data-type="typost/block"] [contenteditable]').first();

    // Select "Beautiful"
    await editor.click();
    await page.keyboard.press('Home');
    await page.waitForTimeout(300);
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(50);
    }
    await page.keyboard.down('Shift');
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(50);
    }
    await page.keyboard.up('Shift');
    await page.waitForTimeout(500);

    // Open popover
    const toggleButton = page.locator('button[aria-label="Typography Stylist Features"]');
    await toggleButton.click();
    await page.waitForTimeout(1000);

    const popover = page.locator('.typost-block-modal');
    await popover.waitFor({ state: 'visible', timeout: 10000 });

    // Set line-height to 2.0
    const lineHeightInput = popover.locator('input[type="number"][step="0.1"][min="0.5"]');
    await lineHeightInput.waitFor({ state: 'visible', timeout: 5000 });
    await lineHeightInput.fill('2.0');
    await page.waitForTimeout(300);

    // Click Apply Line Height
    const applyButton = page.locator('button:has-text("Apply Line Height")');
    await applyButton.click();
    await page.waitForTimeout(1000);

    // Close and re-open
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);

    // Re-select "Beautiful"
    await editor.click();
    await page.keyboard.press('Home');
    await page.waitForTimeout(300);
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(50);
    }
    await page.keyboard.down('Shift');
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(50);
    }
    await page.keyboard.up('Shift');
    await page.waitForTimeout(500);

    await toggleButton.click();
    await page.waitForTimeout(1000);

    // Verify line-height input shows 2.0 (not 0 or default)
    const lineHeightValue = await lineHeightInput.inputValue();
    expect(lineHeightValue).toBe('2');
  });

  test('collapsed cursor: updating letter-spacing modifies existing span in-place', async ({ page }) => {
    const iframe = page.frameLocator('iframe[name="editor-canvas"]');
    const editor = iframe.locator('[data-type="typost/block"] [contenteditable]').first();

    // First apply letter-spacing to "Beautiful"
    await editor.click();
    await page.keyboard.press('Home');
    await page.waitForTimeout(300);
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(50);
    }
    await page.keyboard.down('Shift');
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(50);
    }
    await page.keyboard.up('Shift');
    await page.waitForTimeout(500);

    const toggleButton = page.locator('button[aria-label="Typography Stylist Features"]');
    await toggleButton.click();
    await page.waitForTimeout(1000);

    const popover = page.locator('.typost-block-modal');
    const letterSpacingInput = popover.locator('input[type="number"][min="-500"]');
    await letterSpacingInput.fill('100');
    await page.waitForTimeout(300);

    const applyButton = page.locator('button:has-text("Apply Letter Spacing")');
    await applyButton.click();
    await page.waitForTimeout(1000);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);

    // Verify span exists with letter-spacing 100
    let styledSpan = editor.locator('span.typost-styled[data-letterspacing="100"]');
    await expect(styledSpan).toHaveText('Beautiful');

    // Now place collapsed cursor inside "Beautiful" (no selection)
    await editor.click();
    await page.keyboard.press('Home');
    await page.waitForTimeout(300);
    for (let i = 0; i < 8; i++) { // Position at "ti" in "Beautiful"
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(50);
    }
    await page.waitForTimeout(500);

    // Open popover again
    await toggleButton.click();
    await page.waitForTimeout(1000);

    // Change letter-spacing to 200
    await letterSpacingInput.fill('200');
    await page.waitForTimeout(300);

    // Click Apply (with collapsed cursor, should update existing span)
    await applyButton.click();
    await page.waitForTimeout(2000);

    // Close popover
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);

    // Verify: only ONE span with letter-spacing 200 (not nested, not multiple spans)
    styledSpan = editor.locator('span.typost-styled[data-letterspacing="200"]');
    await expect(styledSpan).toHaveText('Beautiful');

    // Verify no span with old value 100
    const oldSpan = editor.locator('span.typost-styled[data-letterspacing="100"]');
    await expect(oldSpan).toHaveCount(0);

    // Verify only 1 styled span total in the content
    const allSpans = editor.locator('span.typost-styled');
    await expect(allSpans).toHaveCount(1);
  });

  test('partial selection: splitting span into segments', async ({ page }) => {
    const iframe = page.frameLocator('iframe[name="editor-canvas"]');
    const editor = iframe.locator('[data-type="typost/block"] [contenteditable]').first();

    // First apply letter-spacing to entire "Beautiful"
    await editor.click();
    await page.keyboard.press('Home');
    await page.waitForTimeout(300);
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(50);
    }
    await page.keyboard.down('Shift');
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(50);
    }
    await page.keyboard.up('Shift');
    await page.waitForTimeout(500);

    const toggleButton = page.locator('button[aria-label="Typography Stylist Features"]');
    await toggleButton.click();
    await page.waitForTimeout(1000);

    const popover = page.locator('.typost-block-modal');
    const letterSpacingInput = popover.locator('input[type="number"][min="-500"]');
    await letterSpacingInput.fill('100');
    await page.waitForTimeout(300);

    const applyButton = page.locator('button:has-text("Apply Letter Spacing")');
    await applyButton.click();
    await page.waitForTimeout(1000);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);

    // Verify original span exists
    let styledSpan = editor.locator('span.typost-styled[data-letterspacing="100"]');
    await expect(styledSpan).toHaveText('Beautiful');

    // Now select just "eaut" (partial selection within "Beautiful")
    // "Beautiful" = B-e-a-u-t-i-f-u-l
    // Position at "e" (offset 1 in span)
    await editor.click();
    await page.keyboard.press('Home');
    await page.waitForTimeout(300);
    for (let i = 0; i < 7; i++) { // "Hello " + "B" = position at "e"
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(50);
    }

    // Select "eaut" (4 characters)
    await page.keyboard.down('Shift');
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(50);
    }
    await page.keyboard.up('Shift');
    await page.waitForTimeout(500);

    // Open popover
    await toggleButton.click();
    await page.waitForTimeout(1000);

    // Apply different letter-spacing (200) to the selection
    await letterSpacingInput.fill('200');
    await page.waitForTimeout(300);

    await applyButton.click();
    await page.waitForTimeout(2000);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);

    // Verify: should have 3 separate spans (not nested)
    // Span 1: "B" with letter-spacing 100
    // Span 2: "eaut" with letter-spacing 200
    // Span 3: "iful" with letter-spacing 100

    const allSpans = editor.locator('span.typost-styled');
    const spanCount = await allSpans.count();
    expect(spanCount).toBe(3);

    // Verify content of each span
    const span1 = allSpans.nth(0);
    await expect(span1).toHaveText('B');
    await expect(span1).toHaveAttribute('data-letterspacing', '100');

    const span2 = allSpans.nth(1);
    await expect(span2).toHaveText('eaut');
    await expect(span2).toHaveAttribute('data-letterspacing', '200');

    const span3 = allSpans.nth(2);
    await expect(span3).toHaveText('iful');
    await expect(span3).toHaveAttribute('data-letterspacing', '100');
  });

  test('detection: nested spans - apply font-size then features, both detected', async ({ page }) => {
    const iframe = page.frameLocator('iframe[name="editor-canvas"]');
    const editor = iframe.locator('[data-type="typost/block"] [contenteditable]').first();

    // Select "Beautiful"
    await editor.click();
    await page.keyboard.press('Home');
    await page.waitForTimeout(300);
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(50);
    }
    await page.keyboard.down('Shift');
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(50);
    }
    await page.keyboard.up('Shift');
    await page.waitForTimeout(500);

    const toggleButton = page.locator('button[aria-label="Typography Stylist Features"]');
    await toggleButton.click();
    await page.waitForTimeout(1000);

    const popover = page.locator('.typost-block-modal');

    // Apply responsive font size
    const fontSizeSelect = popover.getByLabel('Font Size (for selected text)');
    await fontSizeSelect.selectOption('responsive');
    await page.waitForTimeout(1000);

    const minInput = popover.locator('input[type="number"]').nth(0);
    await minInput.fill('20');
    await page.waitForTimeout(300);

    const applyFontSizeButton = page.locator('button:has-text("Apply Font Size")');
    await applyFontSizeButton.click();
    await page.waitForTimeout(1000);

    // Now apply an OpenType feature (ss01) to the same selection
    // First re-select "Beautiful"
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    await editor.click();
    await page.keyboard.press('Home');
    await page.waitForTimeout(300);
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(50);
    }
    await page.keyboard.down('Shift');
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(50);
    }
    await page.keyboard.up('Shift');
    await page.waitForTimeout(500);

    await toggleButton.click();
    await page.waitForTimeout(1000);

    // Toggle ss01 feature
    const ss01Checkbox = popover.locator('input[type="checkbox"][id*="ss01"]');
    await ss01Checkbox.check();
    await page.waitForTimeout(300);

    const applyFeatureButton = page.locator('button:has-text("Apply Features")');
    await applyFeatureButton.click();
    await page.waitForTimeout(1000);

    // Close popover
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);

    // Re-select "Beautiful" one more time
    await editor.click();
    await page.keyboard.press('Home');
    await page.waitForTimeout(300);
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(50);
    }
    await page.keyboard.down('Shift');
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(50);
    }
    await page.keyboard.up('Shift');
    await page.waitForTimeout(500);

    // Open popover again
    await toggleButton.click();
    await page.waitForTimeout(1000);

    // Verify BOTH font-size and ss01 feature are detected
    // Font size should be "responsive" with min 20
    const fontSizeValue = await fontSizeSelect.inputValue();
    expect(fontSizeValue).toBe('responsive');

    const minValue = await minInput.inputValue();
    expect(minValue).toBe('20');

    // ss01 checkbox should be checked
    const isChecked = await ss01Checkbox.isChecked();
    expect(isChecked).toBe(true);
  });

  test('detection: font-weight shows applied value when re-selecting styled text', async ({ page }) => {
    const iframe = page.frameLocator('iframe[name="editor-canvas"]');
    const editor = iframe.locator('[data-type="typost/block"] [contenteditable]').first();

    // Select "Beautiful"
    await editor.click();
    await page.keyboard.press('Home');
    await page.waitForTimeout(300);
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(50);
    }
    await page.keyboard.down('Shift');
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(50);
    }
    await page.keyboard.up('Shift');
    await page.waitForTimeout(500);

    const toggleButton = page.locator('button[aria-label="Typography Stylist Features"]');
    await toggleButton.click();
    await page.waitForTimeout(1000);

    const popover = page.locator('.typost-block-modal');

    // Apply font-weight 700
    const fontWeightSelect = popover.getByLabel('Font Weight (for selected text)');
    await fontWeightSelect.selectOption('700');
    await page.waitForTimeout(300);

    const applyButton = page.locator('button:has-text("Apply Font Weight")');
    await applyButton.click();
    await page.waitForTimeout(1000);

    // Close and re-open
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);

    // Re-select "Beautiful"
    await editor.click();
    await page.keyboard.press('Home');
    await page.waitForTimeout(300);
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(50);
    }
    await page.keyboard.down('Shift');
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(50);
    }
    await page.keyboard.up('Shift');
    await page.waitForTimeout(500);

    await toggleButton.click();
    await page.waitForTimeout(1000);

    // Verify font-weight dropdown shows 700 (not "inherit")
    const fontWeightValue = await fontWeightSelect.inputValue();
    expect(fontWeightValue).toBe('700');
  });
});

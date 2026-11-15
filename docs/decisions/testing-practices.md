# Testing practices

- **Topic:** what to test, how to test the plugin by hand in WordPress, and the guidelines for unit tests.
- **Issues:** none
- **Code:** the Jest tests (`__tests__/` folders), `tests/Unit/` (PHPUnit), `tests/e2e/`, [TESTING.md](../../TESTING.md)

Moved from the "Testing the Plugin" section of the root [CLAUDE.md](../../CLAUDE.md) by #361; the test commands stay in the guide.

**What to test:**
- Pure utility functions (`sanitizeFontFamily`, `buildFeatureSettingsString`)
- Business logic (`determineFeatureToggleAction`)
- Frontend rendering logic (`save.js` - semantic HTML structure, ARIA attributes)
- Accessibility implementation (dual semantic headings, screen reader compatibility)
- Edge cases (empty values, null handling, etc.)

**Manual WordPress Testing:**
1. Ensure plugin is activated in WordPress admin
2. Create/edit a post with heading blocks (H1-H6)
3. Select text and use the Typography Features button in the toolbar
4. Check frontend rendering with browser DevTools to verify `font-feature-settings` CSS
5. **Test responsive font sizing:**
   - Create Typography Stylist block
   - Set font size to "Responsive (Fluid)" in Inspector Controls
   - Adjust all three sliders independently - verify no auto-adjustment occurs
   - Set out-of-order values (e.g., Min: 64, Max: 16) - verify warning message appears
   - Preview in editor at different viewport widths
   - Check frontend with browser DevTools responsive mode (320px, 768px, 1920px)
   - Verify CSS `clamp()` output is correct

**Testing Guidelines:**
- Tests should import and test ACTUAL functions, not mock implementations
- Extract testable logic to `utils.js` for both component and tests to use
- Use AAA pattern: Arrange, Act, Assert
- Test both happy path and edge cases
- See [TESTING.md](../../TESTING.md) for the four test suites and how to run each one

# Testing Guide for OpenType Stylist

## Overview

This plugin uses **Jest** for unit testing. Tests help catch bugs before they reach users and make refactoring safer.

## Quick Start

```bash
# Run all tests once
npm test

# Run tests in watch mode (re-runs when files change)
npm run test:watch

# Run tests with coverage report
npm test -- --coverage
```

## Test Structure

```
opentype-stylist/
├── blocks/
│   └── opentype-stylist/
│       ├── edit.js                    # Component code
│       └── __tests__/                 # Tests
│           └── edit.test.js           # Test file
├── jest.config.js                     # Jest configuration
└── jest.setup.js                      # Test setup (runs before each test)
```

## What We Test

### 1. **Helper Functions** (Pure Functions)
These are the easiest to test because they:
- Have no side effects
- Always return the same output for the same input
- Don't depend on external state

Example:
```javascript
describe('sanitizeFontFamily', () => {
  it('should remove double quotes from font names', () => {
    const input = '"Arial"';
    const result = sanitizeFontFamily(input);
    expect(result).toBe('Arial');
  });
});
```

### 2. **Business Logic**
Tests for the core functionality like:
- `toggleFeature()` - Applies features inline or to block
- Feature string building
- Attribute updates

Example:
```javascript
it('should apply inline when text is selected', () => {
  const hasSelection = true;
  const result = toggleFeatureLogic('ss14', hasSelection, []);
  expect(result.type).toBe('inline');
});
```

### 3. **Edge Cases**
Tests for unusual inputs like:
- `null` or `undefined` values
- Empty strings
- Duplicate features

## Testing Best Practices

### The AAA Pattern
Every test should follow this pattern:

```javascript
it('should do something', () => {
  // ARRANGE - Set up test data
  const input = 'test';
  const expected = 'TEST';

  // ACT - Call the function
  const result = someFunction(input);

  // ASSERT - Check the result
  expect(result).toBe(expected);
});
```

### Descriptive Test Names
✅ **Good:** `should apply inline when text is selected`
❌ **Bad:** `test1` or `it works`

### Test One Thing Per Test
Each test should verify one specific behavior.

### Keep Tests Independent
Tests should not depend on each other. Each test should work on its own.

## Common Jest Matchers

```javascript
// Equality
expect(value).toBe(expected);           // Strict equality (===)
expect(value).toEqual(expected);        // Deep equality (for objects/arrays)

// Truthiness
expect(value).toBeTruthy();
expect(value).toBeFalsy();
expect(value).toBeNull();
expect(value).toBeUndefined();

// Numbers
expect(value).toBeGreaterThan(3);
expect(value).toBeLessThan(5);

// Strings
expect(string).toMatch(/pattern/);
expect(string).toContain('substring');

// Arrays
expect(array).toContain(item);
expect(array).toHaveLength(3);

// Functions
expect(fn).toHaveBeenCalled();
expect(fn).toHaveBeenCalledWith(arg);
```

## The Bug We Fixed

Our tests specifically verify the fix for the toggleFeature bug:

**Bug:** When a user selected text and clicked a checkbox, the OpenType feature was applied to the entire block instead of just the selected text.

**Fix:** Modified `toggleFeature()` to check if there's a selection and apply inline if so.

**Test:**
```javascript
it('should apply inline when text is selected', () => {
  const hasSelection = true; // User has text selected
  const result = toggleFeatureLogic('ss14', hasSelection, []);

  // Before fix: result.type would be 'block' ❌
  // After fix: result.type is 'inline' ✅
  expect(result.type).toBe('inline');
});
```

## Next Steps for Learning

1. **Start simple:** Test pure functions first
2. **Add more tests:** Test other helper functions in `edit.js`
3. **Test React components:** Learn to use `@testing-library/react`
4. **Add integration tests:** Test multiple functions working together
5. **Aim for coverage:** Try to get 80%+ code coverage

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [WordPress Scripts Testing](https://developer.wordpress.org/block-editor/reference-guides/packages/packages-scripts/#test-unit-js)

## Running Specific Tests

```bash
# Run only tests matching "sanitize"
npm test -- --testNamePattern="sanitize"

# Run only one test file
npm test -- edit.test.js

# Update snapshots
npm test -- -u
```

## Continuous Integration

Consider adding tests to your CI/CD pipeline:

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm install
      - run: npm test
```

## Test Coverage

To see which parts of your code are tested:

```bash
npm test -- --coverage
```

This generates a report showing:
- **Statements:** % of code statements executed
- **Branches:** % of if/else branches tested
- **Functions:** % of functions called
- **Lines:** % of code lines executed

Aim for at least 80% coverage on critical code paths.

---

**Remember:** Tests are documentation! They show how your code should work and make it safe to refactor.

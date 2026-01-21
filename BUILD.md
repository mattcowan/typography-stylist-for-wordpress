# Build Instructions

This document provides instructions for developers who want to rebuild the Typost plugin from source code.

## Prerequisites

- **Node.js**: Version 18 or higher
- **npm**: Version 8 or higher (comes with Node.js)
- **Git**: For version control (optional)

## Installation

1. Navigate to the plugin directory:
```bash
cd wp-content/plugins/opentype-stylist
```

2. Install dependencies:
```bash
npm install
```

This will install all required build tools and dependencies listed in `package.json`.

## Build Commands

### Full Build
Rebuild all JavaScript and CSS files:
```bash
npm run build
```

This command runs:
- Block build (React/JSX compilation)
- JavaScript transpilation and minification
- CSS minification

### Partial Builds

Build only the Gutenberg block:
```bash
npm run build:block
```

Build only JavaScript files:
```bash
npm run build:js
```

Build only CSS files:
```bash
npm run build:css
```

### Individual Asset Builds

Build block editor JavaScript:
```bash
npm run build:js:editor
```

Build admin page JavaScript:
```bash
npm run build:js:admin
```

Build block editor CSS:
```bash
npm run build:css:editor
```

Build frontend CSS:
```bash
npm run build:css:frontend
```

Build admin page CSS:
```bash
npm run build:css:admin
```

### Development Watch Mode

Automatically rebuild files when changes are detected:
```bash
npm run watch
```

This is useful during development - it watches JavaScript and CSS files and rebuilds them automatically.

## Testing

### Run Unit Tests

Run all Jest unit tests:
```bash
npm test
```

Run tests in watch mode (re-runs on file changes):
```bash
npm run test:watch
```

Generate test coverage report:
```bash
npm test -- --coverage
```

## Build Output

### JavaScript Files

**Block Editor Integration:**
- Source: `assets/js/block-editor.js` (110KB, 2,350 lines)
- Output: `assets/js/block-editor.min.js` (91KB)
- Tool: Browserify + Babelify

**Admin Page:**
- Source: `assets/js/admin-page.js` (53KB, 1,317 lines)
- Output: `assets/js/admin-page.min.js` (35KB)
- Tool: Terser

**Typography Stylist Block:**
- Sources: `blocks/typost/*.js` (index.js, edit.js, save.js, utils.js, view.js)
- Output: `blocks/typost/build/index.js` (37KB bundled)
- Tool: @wordpress/scripts (webpack + babel)

### CSS Files

**Block Editor Styles:**
- Source: `assets/css/block-editor.css` (15KB)
- Output: `assets/css/block-editor.min.css` (11KB)
- Tool: clean-css-cli

**Frontend Styles:**
- Source: `assets/css/frontend.css` (4.4KB)
- Output: `assets/css/frontend.min.css` (2.4KB)
- Tool: clean-css-cli

**Admin Page Styles:**
- Source: `assets/css/admin-page.css` (21KB)
- Output: `assets/css/admin-page.min.css` (15KB)
- Tool: clean-css-cli

## Build Tools

The following build tools are used:

- **@wordpress/scripts**: 26.19.0 - Block building and testing
- **Browserify**: 17.0.1 - JavaScript bundling
- **Babelify**: 10.0.0 - JavaScript transpilation
- **Terser**: 5.16.0 - JavaScript minification
- **clean-css-cli**: 5.6.2 - CSS minification
- **Jest**: 29.7.0 - Unit testing

See `package.json` for complete list of dependencies.

## Build Configuration

- **Babel Configuration**: `.babelrc` - Transpilation settings for ES6+ and JSX
- **Jest Configuration**: `jest.config.js` - Test framework settings
- **Package Scripts**: `package.json` - All build commands

## Packaging for Distribution

Create a distribut

ion ZIP file:
```bash
npm run package
```

This will:
1. Run full build process
2. Create a `typography-stylist.zip` file
3. Include both source and compiled files
4. Include necessary configuration files (package.json, .babelrc)
5. Include documentation (BUILD.md, SOURCE.md)

The ZIP file will be approximately 250KB and ready for WordPress.org distribution.

## Verification Checklist

After building, verify everything works:

1. **Build succeeds**: `npm run build` completes without errors
2. **Tests pass**: `npm test` shows all tests passing
3. **Files generated**: Check that minified files exist and are smaller than source files
4. **WordPress activation**: Plugin activates without PHP errors
5. **Block editor**: Typography features button appears in toolbar
6. **Frontend**: Styled content displays correctly
7. **Admin page**: Settings page loads at Settings → Typost

## Troubleshooting

### Build Errors

**"Cannot find module"**: Run `npm install` to install dependencies

**"Command not found"**: Ensure Node.js and npm are installed and in your PATH

**Babel errors**: Check that `.babelrc` exists and is valid JSON

### Test Failures

**"No tests found"**: Ensure you're in the plugin root directory

**Import errors**: Check that file paths in tests match actual file locations

**Snapshot mismatches**: Run `npm test -- -u` to update snapshots (only if changes are intentional)

### WordPress Errors

**Plugin won't activate**: Check PHP error log for syntax errors

**Block won't load**: Ensure `blocks/typost/build/index.js` was generated

**Styles missing**: Check that minified CSS files exist in `assets/css/`

## Development Workflow

1. Make changes to source files (`.js` or `.css` files, not `.min.js` or `.min.css`)
2. Run `npm run build` (or use watch mode: `npm run watch`)
3. Run `npm test` to verify no regressions
4. Test manually in WordPress
5. Create git commit (handled by user, not by Claude)

## Notes

- **DO NOT** edit minified files (*.min.js, *.min.css) directly - they will be overwritten on next build
- **DO NOT** edit `blocks/typost/build/` files directly - they are generated from block source files
- Source files are the source of truth - all changes should be made to unminified files
- After making changes, always rebuild and test before committing

## License

All source code is licensed under GPLv2 or later. See plugin header for details.

## Questions or Issues?

See SOURCE.md for detailed documentation of which files are generated from which sources.

See CLAUDE.md for plugin architecture and development guidelines.

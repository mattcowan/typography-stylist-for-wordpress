const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const pluginSlug = 'typography-stylist';
const buildDir = path.join(__dirname, '..', 'build');
const distDir = path.join(buildDir, pluginSlug);
const zipFile = path.join(__dirname, '..', `${pluginSlug}.zip`);

// Files and directories to include in the package
// Includes only essential runtime files and WordPress.org requirements
const includeList = [
  'typography-stylist.php',
  'uninstall.php',
  'includes/',
  'assets/css/*.css',     // Include both source and minified
  'assets/js/*.js',       // Include both source and minified
  'assets/fonts/',        // if you have any fonts
  'languages/',           // if you have translations
  'blocks/typography-stylist/**',  // All block files (source + build)
  'glyphs-panel/glyphs-panel.php', // Bundled Glyphs Panel module (production only)
  'glyphs-panel/assets/**',        // (excludes __tests__, jest.config.js, package.json)
  'glyphs-panel/includes/**',
  'glyphs-panel/languages/**',
  'variable-fonts/variable-fonts.php', // Bundled Variable Fonts module (production only)
  'variable-fonts/assets/**',
  'variable-fonts/includes/**',
  'variable-fonts/languages/**',
  'package.json',         // For developers
  'README.txt',           // WordPress.org readme if exists
  'readme.txt',           // lowercase variant
  'LICENSE'               // if exists
];

// Preflight: the Glyphs Panel cannot work without its bundled vendor
// libraries, and a checkout without them must never produce a ZIP that
// silently ships broken (the browser would report every font as unreadable).
const requiredVendorFiles = [
  'glyphs-panel/assets/js/vendor/opentype.min.js',
  'glyphs-panel/assets/js/vendor/wawoff2/decompress_binding.js'
];
const missingVendor = requiredVendorFiles.filter(
  rel => !fs.existsSync(path.join(__dirname, '..', rel))
);
if (missingVendor.length > 0) {
  console.error('Cannot package: required vendor libraries are missing:');
  missingVendor.forEach(rel => console.error(`  - ${rel}`));
  console.error('Restore them from the upstream releases listed in BUILD.txt.');
  process.exit(1);
}

// Preflight: core does an unconditional require_once on each bundled module's
// main file — a ZIP without one of these fatals on activation.
const requiredModuleFiles = [
  'glyphs-panel/glyphs-panel.php',
  'variable-fonts/variable-fonts.php'
];
const missingModules = requiredModuleFiles.filter(
  rel => !fs.existsSync(path.join(__dirname, '..', rel))
);
if (missingModules.length > 0) {
  console.error('Cannot package: bundled module files are missing:');
  missingModules.forEach(rel => console.error(`  - ${rel}`));
  process.exit(1);
}

// Clean previous build
console.log('Cleaning previous build...');
if (fs.existsSync(buildDir)) {
  fs.rmSync(buildDir, { recursive: true, force: true });
}
if (fs.existsSync(zipFile)) {
  fs.unlinkSync(zipFile);
}

// Create build directory structure
console.log('Creating build directory...');
fs.mkdirSync(distDir, { recursive: true });

// Copy files
console.log('Copying production files...');

// Copy main PHP file
fs.copyFileSync(
  path.join(__dirname, '..', 'typography-stylist.php'),
  path.join(distDir, 'typography-stylist.php')
);

// Copy uninstall.php
const uninstallPath = path.join(__dirname, '..', 'uninstall.php');
if (fs.existsSync(uninstallPath)) {
  fs.copyFileSync(uninstallPath, path.join(distDir, 'uninstall.php'));
  console.log('✓ Copied uninstall.php');
}

// Copy includes directory
const includesDir = path.join(__dirname, '..', 'includes');
const distIncludesDir = path.join(distDir, 'includes');
if (fs.existsSync(includesDir)) {
  fs.mkdirSync(distIncludesDir, { recursive: true });
  copyDirectory(includesDir, distIncludesDir);
}

// Copy ALL CSS files (both source and minified)
const cssDir = path.join(__dirname, '..', 'assets', 'css');
const distCssDir = path.join(distDir, 'assets', 'css');
if (fs.existsSync(cssDir)) {
  const cssFiles = fs.readdirSync(cssDir).filter(file => file.endsWith('.css'));
  if (cssFiles.length > 0) {
    fs.mkdirSync(distCssDir, { recursive: true });
    cssFiles.forEach(file => {
      fs.copyFileSync(
        path.join(cssDir, file),
        path.join(distCssDir, file)
      );
    });
    console.log(`✓ Copied ${cssFiles.length} CSS files (source + minified)`);
  }
}

// Copy ALL JS files (both source and minified)
const jsDir = path.join(__dirname, '..', 'assets', 'js');
const distJsDir = path.join(distDir, 'assets', 'js');
if (fs.existsSync(jsDir)) {
  const jsFiles = fs.readdirSync(jsDir).filter(file => file.endsWith('.js'));
  if (jsFiles.length > 0) {
    fs.mkdirSync(distJsDir, { recursive: true });
    jsFiles.forEach(file => {
      const srcPath = path.join(jsDir, file);
      // Validate JavaScript files for minification
      validateJavaScriptFile(srcPath);
      fs.copyFileSync(
        srcPath,
        path.join(distJsDir, file)
      );
    });
    console.log(`✓ Copied ${jsFiles.length} JS files (source + minified)`);
  }
}

// Copy block build directory
const blockBuildDir = path.join(__dirname, '..', 'blocks', 'typography-stylist');
const distBlockBuildDir = path.join(distDir, 'blocks', 'typography-stylist');
if (fs.existsSync(blockBuildDir)) {
  fs.mkdirSync(distBlockBuildDir, { recursive: true });
  copyDirectory(blockBuildDir, distBlockBuildDir);
  console.log('✓ Copied block build files');
}

// Copy bundled Glyphs Panel module (production files only). The module's own
// dev files — __tests__/ (skipped by copyDirectory), jest.config.js, and
// package.json — are intentionally NOT copied; only the runtime files ship.
const glyphsDir = path.join(__dirname, '..', 'glyphs-panel');
if (fs.existsSync(glyphsDir)) {
  const distGlyphsDir = path.join(distDir, 'glyphs-panel');
  fs.mkdirSync(distGlyphsDir, { recursive: true });

  // Main module file
  fs.copyFileSync(
    path.join(glyphsDir, 'glyphs-panel.php'),
    path.join(distGlyphsDir, 'glyphs-panel.php')
  );

  // Production subdirectories (copyDirectory skips __tests__/node_modules/.git)
  ['assets', 'includes', 'languages'].forEach(sub => {
    const subSrc = path.join(glyphsDir, sub);
    if (fs.existsSync(subSrc)) {
      copyDirectory(subSrc, path.join(distGlyphsDir, sub));
    }
  });
  console.log('✓ Copied Glyphs Panel module (production files only)');
}

// Copy bundled Variable Fonts module (production files only) — bundled into
// core in v2.1; core fatals without it (unconditional require_once in
// typost_init), so this copy is mandatory and preflight-checked above.
const variableFontsDir = path.join(__dirname, '..', 'variable-fonts');
const distVariableFontsDir = path.join(distDir, 'variable-fonts');
fs.mkdirSync(distVariableFontsDir, { recursive: true });

fs.copyFileSync(
  path.join(variableFontsDir, 'variable-fonts.php'),
  path.join(distVariableFontsDir, 'variable-fonts.php')
);

['assets', 'includes', 'languages'].forEach(sub => {
  const subSrc = path.join(variableFontsDir, sub);
  if (fs.existsSync(subSrc)) {
    copyDirectory(subSrc, path.join(distVariableFontsDir, sub));
  }
});
console.log('✓ Copied Variable Fonts module (production files only)');

// Copy optional files if they exist
const optionalFiles = [
  'README.txt',
  'readme.txt',
  'BUILD.txt',     // Build instructions for developers (WordPress.org requirement)
  'LICENSE',
  'package.json'  // For developers
];
optionalFiles.forEach(file => {
  const filePath = path.join(__dirname, '..', file);
  if (fs.existsSync(filePath)) {
    fs.copyFileSync(filePath, path.join(distDir, file));
    console.log(`✓ Copied ${file}`);
  }
});

// Copy optional directories if they exist and have content
const optionalDirs = ['languages', 'assets/fonts'];
optionalDirs.forEach(dir => {
  const dirPath = path.join(__dirname, '..', dir);
  if (fs.existsSync(dirPath) && fs.readdirSync(dirPath).length > 0) {
    const distDirPath = path.join(distDir, dir);
    fs.mkdirSync(distDirPath, { recursive: true });
    copyDirectory(dirPath, distDirPath);
  }
});

// Create ZIP file
console.log('Creating ZIP file...');
const output = fs.createWriteStream(zipFile);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', function() {
  console.log(`✓ Package created: ${pluginSlug}.zip (${archive.pointer()} bytes)`);
  // Clean up build directory
  console.log('Cleaning up...');
  fs.rmSync(buildDir, { recursive: true, force: true });
  console.log('✓ Packaging complete!');
});

archive.on('error', function(err) {
  console.error('Error creating ZIP file:', err.message);
  process.exit(1);
});

archive.pipe(output);

// Add the entire directory with all subdirectories
// This mimics the structure of official WordPress.org plugin ZIPs
archive.directory(distDir, pluginSlug, {
  // Ensure consistent behavior across platforms
  mode: 0755
});

archive.finalize();

// Helper function to copy directory recursively
function copyDirectory(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  // Directories to exclude from the package
  const excludeDirs = ['__tests__', '__mocks__', 'node_modules', '.git'];

  for (const entry of entries) {
    // Skip excluded directories
    if (excludeDirs.includes(entry.name)) {
      console.log(`⊘ Skipped: ${entry.name}/`);
      continue;
    }

    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      // Validate JavaScript files for minification warnings
      if (entry.name.endsWith('.js')) {
        validateJavaScriptFile(srcPath);
      }
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Helper function to validate JavaScript files
// WordPress.org flags minified files, but build/index.js is legitimately minified
function validateJavaScriptFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const fileName = path.basename(filePath);

  // Expected minified files (these are production builds and should be minified)
  const expectedMinified = [
    path.sep + 'build' + path.sep + 'index.js',    // wp-scripts build output
    'block-editor.min.js',                          // browserify output
    'admin-page.min.js',                            // terser output
    'glyphs-panel/assets/js/vendor/'                // third-party libs (opentype.js, wawoff2)
  ];

  // Check if this is an expected minified file
  const normalizedPath = filePath.replace(/\\/g, '/');
  const isExpectedMinified = expectedMinified.some(pattern =>
    normalizedPath.includes(pattern.replace(/\\/g, '/'))
  );

  // Files with .min.js extension are expected to be minified
  const hasMinExtension = fileName.endsWith('.min.js');

  // Check if file appears to be minified
  // A file is considered minified if:
  // 1. It has very few lines (<=2), OR
  // 2. Average line length is very high (>1000), OR
  // 3. It has .min.js extension and first line is very long (>300)
  const avgLineLength = content.length / lines.length;
  const firstLineLength = lines[0]?.length || 0;
  const isMinified = lines.length <= 2 ||
                     avgLineLength > 1000 ||
                     (hasMinExtension && firstLineLength > 300);

  if (isMinified && !isExpectedMinified) {
    console.warn(`⚠️  Warning: ${fileName} appears to be minified but is not in the expected list`);
    console.warn(`   Path: ${filePath}`);
  } else if (isMinified && isExpectedMinified) {
    console.log(`✓ ${fileName} is a legitimate production build (minified)`);
  }
}

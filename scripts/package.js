/**
 * Build the distributable plugin zip: typography-stylist.zip
 *
 * The file set is driven ENTIRELY by .distignore (gitignore syntax): every
 * file not excluded there is shipped. The WordPress.org release workflow
 * (10up/action-wordpress-plugin-deploy) reads the same .distignore, so the
 * zip built here matches what CI deploys to SVN trunk. To change what ships,
 * edit .distignore — never this script.
 *
 * Usage:
 *   node scripts/package.js          # build zip, clean up staging dir
 *   node scripts/package.js --keep   # build zip, keep build/typography-stylist/ for inspection
 *
 * Run the production build first (`npm run package` does both) — minified
 * assets and blocks/typography-stylist/build/ are gitignored and must exist
 * in the working tree to be packaged.
 */
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const ignore = require('ignore');

const pluginSlug = 'typography-stylist';
const rootDir = path.join(__dirname, '..');
const buildDir = path.join(rootDir, 'build');
const distDir = path.join(buildDir, pluginSlug);
const zipFile = path.join(rootDir, `${pluginSlug}.zip`);
const keepStaging = process.argv.includes('--keep');

// --- Load .distignore ---
const distignorePath = path.join(rootDir, '.distignore');
if (!fs.existsSync(distignorePath)) {
  console.error('Cannot package: .distignore not found at repo root.');
  process.exit(1);
}
const ig = ignore().add(fs.readFileSync(distignorePath, 'utf8'));

// Preflight: the Glyphs Panel cannot work without its bundled vendor
// libraries, and a checkout without them must never produce a ZIP that
// silently ships broken (the browser would report every font as unreadable).
const requiredVendorFiles = [
  'glyphs-panel/assets/js/vendor/opentype.min.js',
  'glyphs-panel/assets/js/vendor/wawoff2/decompress_binding.js'
];
const missingVendor = requiredVendorFiles.filter(
  rel => !fs.existsSync(path.join(rootDir, rel))
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
  rel => !fs.existsSync(path.join(rootDir, rel))
);
if (missingModules.length > 0) {
  console.error('Cannot package: bundled module files are missing:');
  missingModules.forEach(rel => console.error(`  - ${rel}`));
  process.exit(1);
}

// Preflight: built assets must exist (they are gitignored — a fresh checkout
// without `npm run build` must not produce a zip missing the block build).
const requiredBuiltFiles = [
  'blocks/typography-stylist/build/index.js',
  'assets/js/block-editor.min.js'
];
const missingBuilt = requiredBuiltFiles.filter(
  rel => !fs.existsSync(path.join(rootDir, rel))
);
if (missingBuilt.length > 0) {
  console.error('Cannot package: built assets are missing. Run `npm run build` first:');
  missingBuilt.forEach(rel => console.error(`  - ${rel}`));
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

// Stage every non-excluded file into build/typography-stylist/
console.log('Staging production files (.distignore-driven)...');
let fileCount = 0;
copyTree(rootDir, '');
console.log(`✓ Staged ${fileCount} files`);

// Create ZIP file
console.log('Creating ZIP file...');
const output = fs.createWriteStream(zipFile);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', function() {
  console.log(`✓ Package created: ${pluginSlug}.zip (${archive.pointer()} bytes)`);
  if (keepStaging) {
    console.log(`✓ Staging dir kept for inspection: ${distDir}`);
  } else {
    console.log('Cleaning up...');
    fs.rmSync(buildDir, { recursive: true, force: true });
  }
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

/**
 * Recursively copy everything under rootDir/relBase not excluded by
 * .distignore into the staging dir, validating JS files on the way.
 */
function copyTree(absDir, relBase) {
  const entries = fs.readdirSync(absDir, { withFileTypes: true });
  for (const entry of entries) {
    const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      // A directory is pruned if the path itself or the dir-form matches.
      if (ig.ignores(rel) || ig.ignores(`${rel}/`)) {
        continue;
      }
      copyTree(path.join(absDir, entry.name), rel);
    } else {
      if (ig.ignores(rel)) {
        continue;
      }
      const srcPath = path.join(absDir, entry.name);
      if (entry.name.endsWith('.js')) {
        validateJavaScriptFile(srcPath);
      }
      const destPath = path.join(distDir, ...rel.split('/'));
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
      fileCount++;
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

  if (isMinified && !isExpectedMinified && !hasMinExtension) {
    console.warn(`⚠️  Warning: ${fileName} appears to be minified but is not in the expected list`);
    console.warn(`   Path: ${filePath}`);
  }
}

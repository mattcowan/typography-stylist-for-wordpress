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
  'package.json',         // For developers
  'README.txt',           // WordPress.org readme if exists
  'readme.txt',           // lowercase variant
  'LICENSE'               // if exists
];

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
      fs.copyFileSync(
        path.join(jsDir, file),
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

// Copy optional files if they exist
// Excludes developer-only files (BUILD.md, SOURCE.md, .babelrc)
const optionalFiles = [
  'README.txt',
  'readme.txt',
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

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

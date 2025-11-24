const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const pluginSlug = 'headline-ligatures-and-styles';
const buildDir = path.join(__dirname, '..', 'build');
const distDir = path.join(buildDir, pluginSlug);
const zipFile = path.join(__dirname, '..', `${pluginSlug}.zip`);

// Files and directories to include in the package
const includeList = [
  'headline-ligatures-styles.php',
  'includes/',
  'assets/css/*.min.css',
  'assets/js/*.min.js',
  'assets/fonts/', // if you have any fonts
  'languages/', // if you have translations
  'README.txt', // WordPress.org readme if exists
  'LICENSE' // if exists
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
  path.join(__dirname, '..', 'headline-ligatures-styles.php'),
  path.join(distDir, 'headline-ligatures-styles.php')
);

// Copy includes directory
const includesDir = path.join(__dirname, '..', 'includes');
const distIncludesDir = path.join(distDir, 'includes');
if (fs.existsSync(includesDir)) {
  fs.mkdirSync(distIncludesDir, { recursive: true });
  copyDirectory(includesDir, distIncludesDir);
}

// Copy minified CSS files
const cssDir = path.join(__dirname, '..', 'assets', 'css');
const distCssDir = path.join(distDir, 'assets', 'css');
if (fs.existsSync(cssDir)) {
  fs.mkdirSync(distCssDir, { recursive: true });
  fs.readdirSync(cssDir)
    .filter(file => file.endsWith('.min.css'))
    .forEach(file => {
      fs.copyFileSync(
        path.join(cssDir, file),
        path.join(distCssDir, file)
      );
    });
}

// Copy minified JS files
const jsDir = path.join(__dirname, '..', 'assets', 'js');
const distJsDir = path.join(distDir, 'assets', 'js');
if (fs.existsSync(jsDir)) {
  fs.mkdirSync(distJsDir, { recursive: true });
  fs.readdirSync(jsDir)
    .filter(file => file.endsWith('.min.js'))
    .forEach(file => {
      fs.copyFileSync(
        path.join(jsDir, file),
        path.join(distJsDir, file)
      );
    });
}

// Copy optional files if they exist
const optionalFiles = ['README.txt', 'LICENSE', 'readme.txt'];
optionalFiles.forEach(file => {
  const filePath = path.join(__dirname, '..', file);
  if (fs.existsSync(filePath)) {
    fs.copyFileSync(filePath, path.join(distDir, file));
  }
});

// Copy optional directories if they exist
const optionalDirs = ['languages', 'assets/fonts'];
optionalDirs.forEach(dir => {
  const dirPath = path.join(__dirname, '..', dir);
  if (fs.existsSync(dirPath)) {
    const distDirPath = path.join(distDir, dir);
    fs.mkdirSync(distDirPath, { recursive: true });
    copyDirectory(dirPath, distDirPath);
  }
});

// Create ZIP file
console.log('Creating ZIP file...');
try {
  // Use PowerShell on Windows for creating zip
  if (process.platform === 'win32') {
    const command = `powershell -command "Compress-Archive -Path '${distDir}' -DestinationPath '${zipFile}' -Force"`;
    execSync(command, { stdio: 'inherit' });
  } else {
    // Use zip command on Unix-like systems
    execSync(`cd "${buildDir}" && zip -r "${zipFile}" "${pluginSlug}"`, { stdio: 'inherit' });
  }
  console.log(`✓ Package created: ${pluginSlug}.zip`);
} catch (error) {
  console.error('Error creating ZIP file:', error.message);
  process.exit(1);
}

// Clean up build directory
console.log('Cleaning up...');
fs.rmSync(buildDir, { recursive: true, force: true });

console.log('✓ Packaging complete!');

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

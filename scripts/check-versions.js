/**
 * Version-consistency guard. Zero dependencies.
 *
 * The plugin's version lives in FOUR places that must always agree:
 *   1. typography-stylist.php  — plugin header `Version:`
 *   2. typography-stylist.php  — `define('TYPOST_VERSION', '...')`
 *   3. readme.txt              — `Stable tag:`
 *   4. package.json            — `version`
 *
 * Modes:
 *   node scripts/check-versions.js
 *     Consistency mode (runs in CI on every push): all four must match
 *     each other. Exits 1 with a table of mismatches.
 *
 *   node scripts/check-versions.js v2.1.1
 *     Tag mode (runs before a wp.org deploy): all four must equal the tag
 *     (leading "v" stripped). This is what stops a GitHub Release tagged
 *     v2.1.1 from deploying files that still say 2.1.0 — the #1 wp.org
 *     release mistake, because `Stable tag` decides what wp.org serves.
 *
 *   node scripts/check-versions.js v2.2.0-beta.1 --prerelease
 *     Pre-release mode: header/constant/package.json must equal the BASE
 *     version (2.2.0), and Stable tag must NOT equal it — during a beta the
 *     Stable tag must keep pointing at the last stable release so wp.org
 *     never serves unreleased code.
 *
 * Also warns (never fails) when `Tested up to:` includes a patch version —
 * wp.org convention is major.minor (e.g. 6.9, not 6.9.4).
 */
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(rootDir, f), 'utf8');

const args = process.argv.slice(2);
const prerelease = args.includes('--prerelease');
const tagArg = args.find(a => !a.startsWith('--')) || null;

function extract(pattern, text, label, file) {
  const m = text.match(pattern);
  if (!m) {
    console.error(`✗ Could not find ${label} in ${file}`);
    process.exit(1);
  }
  return m[1].trim();
}

const mainPhp = read('typography-stylist.php');
const readmeTxt = read('readme.txt');
const pkg = JSON.parse(read('package.json'));

const versions = {
  'plugin header (typography-stylist.php)': extract(/^\s*\*\s*Version:\s*(.+)$/m, mainPhp, 'plugin header Version', 'typography-stylist.php'),
  'TYPOST_VERSION (typography-stylist.php)': extract(/define\(\s*'TYPOST_VERSION'\s*,\s*'([^']+)'/, mainPhp, "TYPOST_VERSION", 'typography-stylist.php'),
  'Stable tag (readme.txt)': extract(/^Stable tag:\s*(.+)$/m, readmeTxt, 'Stable tag', 'readme.txt'),
  'version (package.json)': String(pkg.version || '')
};

function table(expectedByKey) {
  const width = Math.max(...Object.keys(versions).map(k => k.length));
  for (const [key, value] of Object.entries(versions)) {
    const expected = expectedByKey ? expectedByKey[key] : null;
    const marker = expected === null || expected === undefined
      ? ''
      : (expected === 'must-differ'
        ? (value !== expectedByKey.base ? '  ✓' : `  ✗ must NOT be ${expectedByKey.base}`)
        : (value === expected ? '  ✓' : `  ✗ expected ${expected}`));
    console.log(`  ${key.padEnd(width)}  ${value}${marker}`);
  }
}

let failed = false;

if (!tagArg) {
  // Consistency mode
  const values = Object.values(versions);
  const allMatch = values.every(v => v === values[0]);
  console.log('Version consistency check:');
  table(null);
  if (!allMatch) {
    console.error('\n✗ Version mismatch — the four version sources must agree.');
    failed = true;
  } else {
    console.log(`\n✓ All version sources agree: ${values[0]}`);
  }
} else {
  const tag = tagArg.replace(/^v/, '');
  if (!prerelease) {
    // Stable tag mode: everything must equal the tag exactly.
    console.log(`Release version check against tag ${tagArg}:`);
    const expected = {};
    for (const key of Object.keys(versions)) expected[key] = tag;
    table(expected);
    if (!Object.values(versions).every(v => v === tag)) {
      console.error(`\n✗ One or more version sources do not match release tag ${tagArg}. Aborting before any deploy.`);
      failed = true;
    } else {
      console.log(`\n✓ All version sources match release tag ${tagArg}`);
    }
  } else {
    // Pre-release mode: base version everywhere except Stable tag, which
    // must still point at the previous stable release.
    const base = tag.replace(/[-+].*$/, '');
    if (base === tag) {
      console.error(`✗ --prerelease given but tag ${tagArg} has no pre-release suffix (expected e.g. v2.2.0-beta.1).`);
      process.exit(1);
    }
    console.log(`Pre-release version check against tag ${tagArg} (base ${base}):`);
    const expected = { base };
    for (const key of Object.keys(versions)) {
      expected[key] = key.startsWith('Stable tag') ? 'must-differ' : base;
    }
    table(expected);
    const stable = versions['Stable tag (readme.txt)'];
    const others = Object.entries(versions)
      .filter(([k]) => !k.startsWith('Stable tag'))
      .map(([, v]) => v);
    if (!others.every(v => v === base)) {
      console.error(`\n✗ Plugin header / TYPOST_VERSION / package.json must equal the base version ${base} for a pre-release.`);
      failed = true;
    }
    if (stable === base) {
      console.error(`\n✗ Stable tag equals ${base} — during a beta, Stable tag must keep pointing at the last STABLE release, or wp.org will try to serve unreleased code.`);
      failed = true;
    }
    if (!failed) {
      console.log(`\n✓ Pre-release versions OK (Stable tag stays at ${stable})`);
    }
  }
}

// Advisory: Tested up to should be major.minor
const testedUpTo = readmeTxt.match(/^Tested up to:\s*(.+)$/m);
if (testedUpTo && /^\d+\.\d+\.\d+/.test(testedUpTo[1].trim())) {
  console.warn(`⚠ Tested up to: ${testedUpTo[1].trim()} — wp.org convention is major.minor (e.g. ${testedUpTo[1].trim().split('.').slice(0, 2).join('.')}).`);
}

process.exit(failed ? 1 : 0);

/**
 * Version-consistency guard. Zero dependencies.
 *
 * The plugin's version lives in SIX places that must always agree:
 *   1. typography-stylist.php  — plugin header `Version:`
 *   2. typography-stylist.php  — `define('TYPOST_VERSION', '...')`
 *   3. readme.txt              — `Stable tag:`
 *   4. package.json            — `version`
 *   5. package-lock.json       — top-level `version`
 *   6. package-lock.json       — `packages[""].version`
 *
 * Modes:
 *   node scripts/check-versions.js
 *     Consistency mode (runs in CI on every push): all six must match
 *     each other. Exits 1 with a table of mismatches.
 *
 *   node scripts/check-versions.js v2.1.1
 *     Tag mode (runs before a wp.org deploy): all six must equal the tag
 *     (leading "v" stripped). This is what stops a GitHub Release tagged
 *     v2.1.1 from deploying files that still say 2.1.0 — the #1 wp.org
 *     release mistake, because `Stable tag` decides what wp.org serves.
 *
 *   node scripts/check-versions.js v2.2.0-beta.1 --prerelease
 *     Pre-release mode: header/constant/package.json/package-lock.json must
 *     equal the BASE version (2.2.0), and Stable tag must NOT equal it —
 *     during a beta the Stable tag must keep pointing at the last stable
 *     release so wp.org never serves unreleased code.
 *
 *   node scripts/check-versions.js --modules
 *     Consistency mode plus the module check below (runs in CI on a
 *     release/* pull request, before the GitHub Release is published).
 *
 * Module check (#287; always on in tag and pre-release mode): each bundled
 * module's version constant is the `?ver=` on its scripts and styles, so
 * when files under `<module>/assets/` changed since the previous stable tag,
 * the constant must differ from the one at that tag, or browsers can keep
 * the previous release's files. Only `assets/` counts: every release
 * changes each module's catalogs, and those are not cached by browsers.
 * The previous stable tag is the highest `vX.Y.Z` (or `X.Y.Z`) tag with no
 * pre-release suffix that is lower than the version being released. The
 * check needs the tags: a shallow checkout has none, and the check then
 * fails rather than passes.
 *
 * Also warns (never fails) when `Tested up to:` includes a patch version —
 * wp.org convention is major.minor (e.g. 6.9, not 6.9.4).
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(rootDir, f), 'utf8');

const args = process.argv.slice(2);
const prerelease = args.includes('--prerelease');
const checkModulesFlag = args.includes('--modules');
const tagArg = args.find(a => !a.startsWith('--')) || null;

// Bundled modules with their own version constant (see RELEASING.md §4).
const MODULES = [
  { dir: 'glyphs-panel', file: 'glyphs-panel/glyphs-panel.php', constant: 'TYPOST_GP_VERSION' },
  { dir: 'paragraph-styles', file: 'paragraph-styles/paragraph-styles.php', constant: 'TYPOST_PS_VERSION' },
  { dir: 'variable-fonts', file: 'variable-fonts/variable-fonts.php', constant: 'TYPOST_VF_VERSION' }
];

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
const lock = JSON.parse(read('package-lock.json'));
const lockRoot = (lock.packages && lock.packages['']) || {};

// Like extract(): a missing lockfile value stops with a message instead of
// an empty table cell.
function lockValue(value, label) {
  if (!value) {
    console.error(`✗ Could not find ${label} in package-lock.json`);
    process.exit(1);
  }
  return String(value);
}

const versions = {
  'plugin header (typography-stylist.php)': extract(/^\s*\*\s*Version:\s*(.+)$/m, mainPhp, 'plugin header Version', 'typography-stylist.php'),
  'TYPOST_VERSION (typography-stylist.php)': extract(/define\(\s*'TYPOST_VERSION'\s*,\s*'([^']+)'/, mainPhp, "TYPOST_VERSION", 'typography-stylist.php'),
  'Stable tag (readme.txt)': extract(/^Stable tag:\s*(.+)$/m, readmeTxt, 'Stable tag', 'readme.txt'),
  'version (package.json)': String(pkg.version || ''),
  'version (package-lock.json)': lockValue(lock.version, 'version'),
  'packages[""].version (package-lock.json)': lockValue(lockRoot.version, 'packages[""].version')
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
    console.error('\n✗ Version mismatch — the six version sources must agree.');
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
      console.error(`\n✗ Plugin header / TYPOST_VERSION / package.json / package-lock.json must equal the base version ${base} for a pre-release.`);
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

function git(gitArgs) {
  const result = spawnSync('git', gitArgs, { cwd: rootDir, encoding: 'utf8' });
  return { ok: result.status === 0, out: (result.stdout || '').trim() };
}

function parseStable(version) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return m ? m.slice(1).map(Number) : null;
}

function compareVersions(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function moduleConstant(text, constant) {
  const m = text.match(new RegExp(`define\\(\\s*'${constant}'\\s*,\\s*'([^']+)'`));
  return m ? m[1] : null;
}

// Returns true when the module check failed.
function checkModules(releaseVersion) {
  const current = parseStable(releaseVersion);
  if (!current) {
    console.error(`\n✗ Module version check: cannot read the release version ${releaseVersion}.`);
    return true;
  }
  const tags = git(['tag', '--list']);
  const previous = (tags.ok ? tags.out.split('\n') : [])
    .map(name => ({ name: name.trim(), version: parseStable(name.trim()) }))
    .filter(t => t.version && compareVersions(t.version, current) < 0)
    .sort((a, b) => compareVersions(b.version, a.version))[0];
  if (!previous) {
    console.error(`\n✗ Module version check: no stable tag lower than ${releaseVersion} was found, so the changed modules cannot be found. A shallow checkout has no tags: check out with fetch-depth: 0.`);
    return true;
  }

  console.log(`\nModule version check against ${previous.name}:`);
  let moduleFailed = false;
  for (const mod of MODULES) {
    const assets = `${mod.dir}/assets`;
    const diff = git(['diff', '--name-only', previous.name, '--', assets]);
    const untracked = git(['ls-files', '--others', '--exclude-standard', '--', assets]);
    if (!diff.ok || !untracked.ok) {
      console.error(`  ${mod.dir}  ✗ git could not compare ${assets} with ${previous.name}`);
      moduleFailed = true;
      continue;
    }
    const changed = [diff.out, untracked.out].filter(Boolean).join('\n').split('\n').filter(Boolean);
    const now = moduleConstant(read(mod.file), mod.constant);
    if (!now) {
      console.error(`  ${mod.dir}  ✗ could not find ${mod.constant} in ${mod.file}`);
      moduleFailed = true;
      continue;
    }
    if (changed.length === 0) {
      console.log(`  ${mod.dir}  no assets/ changes, ${mod.constant} ${now}  ✓`);
      continue;
    }
    const atTag = git(['show', `${previous.name}:${mod.file}`]);
    const before = atTag.ok ? moduleConstant(atTag.out, mod.constant) : null;
    if (before === null) {
      // The module is new since the tag: its version is new too.
      console.log(`  ${mod.dir}  new since ${previous.name}, ${mod.constant} ${now}  ✓`);
    } else if (before === now) {
      console.error(`  ${mod.dir}  ${changed.length} assets/ file(s) changed, ${mod.constant} still ${now}  ✗ bump it`);
      moduleFailed = true;
    } else {
      console.log(`  ${mod.dir}  ${changed.length} assets/ file(s) changed, ${mod.constant} ${before} → ${now}  ✓`);
    }
  }
  if (moduleFailed) {
    console.error(`\n✗ A module's scripts or styles changed since ${previous.name} but its version constant did not. Bump the patch number of each module marked ✗ (RELEASING.md §4 step 1).`);
  } else {
    console.log('\n✓ Module versions OK');
  }
  return moduleFailed;
}

if (tagArg || checkModulesFlag) {
  const releaseVersion = tagArg
    ? tagArg.replace(/^v/, '').replace(/[-+].*$/, '')
    : versions['plugin header (typography-stylist.php)'];
  if (checkModules(releaseVersion)) failed = true;
}

// Advisory: Tested up to should be major.minor
const testedUpTo = readmeTxt.match(/^Tested up to:\s*(.+)$/m);
if (testedUpTo && /^\d+\.\d+\.\d+/.test(testedUpTo[1].trim())) {
  console.warn(`⚠ Tested up to: ${testedUpTo[1].trim()} — wp.org convention is major.minor (e.g. ${testedUpTo[1].trim().split('.').slice(0, 2).join('.')}).`);
}

process.exit(failed ? 1 : 0);

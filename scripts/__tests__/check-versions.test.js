/**
 * Tests for scripts/check-versions.js (#286).
 *
 * The script reads its files relative to its own folder and ends with
 * process.exit(), so each test copies it into a temporary project with
 * fixture files and runs it as a child process.
 */
const fs = require( 'fs' );
const os = require( 'os' );
const path = require( 'path' );
const { spawnSync } = require( 'child_process' );

const SCRIPT = path.join( __dirname, '..', 'check-versions.js' );

const tempDirs = [];

/**
 * Writes a temporary project and returns its root.
 *
 * @param {Object} versions                Version per source.
 * @param {string} versions.header         Plugin header `Version:`.
 * @param {string} versions.constant       `TYPOST_VERSION`.
 * @param {string} versions.stable         readme.txt `Stable tag:`.
 * @param {string} versions.pkg            package.json `version`.
 * @param {string} versions.lock           package-lock.json `version`.
 * @param {string} versions.lockRoot       package-lock.json `packages[""].version`.
 * @return {string} Project root.
 */
function makeProject( { header, constant, stable, pkg, lock, lockRoot } ) {
	const root = fs.mkdtempSync( path.join( os.tmpdir(), 'typost-versions-' ) );
	tempDirs.push( root );
	fs.mkdirSync( path.join( root, 'scripts' ) );
	fs.copyFileSync( SCRIPT, path.join( root, 'scripts', 'check-versions.js' ) );
	fs.writeFileSync(
		path.join( root, 'typography-stylist.php' ),
		`<?php\n/**\n * Plugin Name: Typography Stylist\n * Version: ${ header }\n */\ndefine('TYPOST_VERSION', '${ constant }');\n`
	);
	fs.writeFileSync(
		path.join( root, 'readme.txt' ),
		`=== Typography Stylist ===\nTested up to: 6.9\nStable tag: ${ stable }\n`
	);
	fs.writeFileSync(
		path.join( root, 'package.json' ),
		JSON.stringify( { name: 'typost', version: pkg } )
	);
	fs.writeFileSync(
		path.join( root, 'package-lock.json' ),
		JSON.stringify( {
			name: 'typost',
			version: lock,
			lockfileVersion: 3,
			packages: { '': { name: 'typost', version: lockRoot } },
		} )
	);
	return root;
}

/**
 * Runs the copied script.
 *
 * @param {string}   root Project root.
 * @param {string[]} args Script arguments.
 * @return {{status: number, output: string}} Exit status and stdout + stderr.
 */
function run( root, args = [] ) {
	const result = spawnSync(
		process.execPath,
		[ path.join( root, 'scripts', 'check-versions.js' ), ...args ],
		{ encoding: 'utf8' }
	);
	return { status: result.status, output: result.stdout + result.stderr };
}

const MODULE_FILES = {
	'glyphs-panel': [ 'glyphs-panel/glyphs-panel.php', 'TYPOST_GP_VERSION' ],
	'paragraph-styles': [ 'paragraph-styles/paragraph-styles.php', 'TYPOST_PS_VERSION' ],
	'variable-fonts': [ 'variable-fonts/variable-fonts.php', 'TYPOST_VF_VERSION' ],
};

/**
 * Writes a module's main file with its version constant, guarded like the
 * real modules, and one script under its assets folder.
 *
 * @param {string} root    Project root.
 * @param {string} dir     Module folder.
 * @param {string} version Version constant value.
 */
function writeModule( root, dir, version ) {
	const [ file, constant ] = MODULE_FILES[ dir ];
	fs.mkdirSync( path.join( root, dir, 'assets', 'js' ), { recursive: true } );
	fs.writeFileSync(
		path.join( root, file ),
		`<?php\nif ( ! defined( '${ constant }' ) ) {\n\tdefine( '${ constant }', '${ version }' );\n}\n`
	);
	const script = path.join( root, dir, 'assets', 'js', 'main.js' );
	if ( ! fs.existsSync( script ) ) {
		fs.writeFileSync( script, '// v1\n' );
	}
}

/**
 * Runs git in the project.
 *
 * @param {string}   root    Project root.
 * @param {string[]} gitArgs Git arguments.
 */
function git( root, gitArgs ) {
	const result = spawnSync(
		'git',
		[ '-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...gitArgs ],
		{ cwd: root, encoding: 'utf8' }
	);
	if ( result.status !== 0 ) {
		throw new Error( `git ${ gitArgs.join( ' ' ) }: ${ result.stderr }` );
	}
}

/**
 * Commits everything in the project and optionally tags the commit.
 *
 * @param {string} root Project root.
 * @param {string} tag  Tag name, or empty for none.
 */
function commit( root, tag = '' ) {
	git( root, [ 'add', '-A' ] );
	git( root, [ 'commit', '-q', '--allow-empty', '-m', tag || 'change' ] );
	if ( tag ) {
		git( root, [ 'tag', tag ] );
	}
}

/**
 * Writes a project at `version` with all three modules at 1.0.0 and a git
 * repository whose first commit is tagged `previousTag`.
 *
 * @param {string} version     Version in all six places.
 * @param {string} previousTag Tag on the first commit.
 * @return {string} Project root.
 */
function makeReleaseProject( version, previousTag = 'v2.3.3' ) {
	const root = makeProject( ALL( version ) );
	for ( const dir of Object.keys( MODULE_FILES ) ) {
		writeModule( root, dir, '1.0.0' );
	}
	git( root, [ 'init', '-q' ] );
	commit( root, previousTag );
	return root;
}

/**
 * Changes a module's script.
 *
 * @param {string} root Project root.
 * @param {string} dir  Module folder.
 */
function changeAssets( root, dir ) {
	fs.appendFileSync( path.join( root, dir, 'assets', 'js', 'main.js' ), '// changed\n' );
}

const ALL = ( v ) => ( {
	header: v,
	constant: v,
	stable: v,
	pkg: v,
	lock: v,
	lockRoot: v,
} );

afterAll( () => {
	for ( const dir of tempDirs ) {
		fs.rmSync( dir, { recursive: true, force: true } );
	}
} );

describe( 'consistency mode', () => {
	test( 'passes when all six values agree, and lists both lockfile values', () => {
		const { status, output } = run( makeProject( ALL( '2.4.0' ) ) );
		expect( status ).toBe( 0 );
		expect( output ).toMatch( /version \(package-lock\.json\)\s+2\.4\.0/ );
		expect( output ).toMatch( /packages\[""\]\.version \(package-lock\.json\)\s+2\.4\.0/ );
	} );

	test( 'fails when the lockfile top-level version differs', () => {
		const { status, output } = run(
			makeProject( { ...ALL( '2.4.0' ), lock: '2.3.3' } )
		);
		expect( status ).toBe( 1 );
		expect( output ).toMatch( /version \(package-lock\.json\)\s+2\.3\.3/ );
	} );

	test( 'fails when the lockfile packages[""] version differs', () => {
		const { status, output } = run(
			makeProject( { ...ALL( '2.4.0' ), lockRoot: '2.3.3' } )
		);
		expect( status ).toBe( 1 );
		expect( output ).toMatch( /packages\[""\]\.version \(package-lock\.json\)\s+2\.3\.3/ );
	} );

	test( 'still fails on a package.json mismatch', () => {
		const { status, output } = run(
			makeProject( { ...ALL( '2.4.0' ), pkg: '2.3.3' } )
		);
		expect( status ).toBe( 1 );
		expect( output ).toMatch( /version \(package\.json\)\s+2\.3\.3/ );
	} );

	test( 'fails with a message when the lockfile has no packages[""] entry', () => {
		const root = makeProject( ALL( '2.4.0' ) );
		fs.writeFileSync(
			path.join( root, 'package-lock.json' ),
			JSON.stringify( { name: 'typost', version: '2.4.0', lockfileVersion: 3 } )
		);
		const { status, output } = run( root );
		expect( status ).toBe( 1 );
		expect( output ).toContain(
			'✗ Could not find packages[""].version in package-lock.json'
		);
	} );

	test( 'fails with a message when the lockfile has no top-level version', () => {
		const root = makeProject( ALL( '2.4.0' ) );
		fs.writeFileSync(
			path.join( root, 'package-lock.json' ),
			JSON.stringify( {
				name: 'typost',
				lockfileVersion: 3,
				packages: { '': { name: 'typost', version: '2.4.0' } },
			} )
		);
		const { status, output } = run( root );
		expect( status ).toBe( 1 );
		expect( output ).toContain(
			'✗ Could not find version in package-lock.json'
		);
	} );
} );

describe( 'tag mode', () => {
	test( 'passes when all six values equal the tag', () => {
		expect( run( makeReleaseProject( '2.4.0' ), [ 'v2.4.0' ] ).status ).toBe( 0 );
	} );

	test.each( [ 'lock', 'lockRoot' ] )(
		'fails when the lockfile %s value does not equal the tag',
		( key ) => {
			const root = makeReleaseProject( '2.4.0' );
			fs.writeFileSync(
				path.join( root, 'package-lock.json' ),
				JSON.stringify( {
					name: 'typost',
					version: key === 'lock' ? '2.3.3' : '2.4.0',
					lockfileVersion: 3,
					packages: { '': { name: 'typost', version: key === 'lockRoot' ? '2.3.3' : '2.4.0' } },
				} )
			);
			const { status, output } = run( root, [ 'v2.4.0' ] );
			expect( status ).toBe( 1 );
			expect( output ).toMatch( /2\.3\.3 {2}✗ expected 2\.4\.0/ );
		}
	);
} );

describe( 'pre-release mode', () => {
	test( 'passes when both lockfile values equal the base version', () => {
		const root = makeReleaseProject( '2.4.0' );
		fs.writeFileSync(
			path.join( root, 'readme.txt' ),
			'=== Typography Stylist ===\nTested up to: 6.9\nStable tag: 2.3.3\n'
		);
		expect( run( root, [ 'v2.4.0-beta.1', '--prerelease' ] ).status ).toBe( 0 );
	} );

	test.each( [ 'lock', 'lockRoot' ] )(
		'fails when the lockfile %s value is not the base version',
		( key ) => {
			const root = makeProject( {
				...ALL( '2.4.0' ),
				stable: '2.3.3',
				[ key ]: '2.4.0-beta.1',
			} );
			const { status, output } = run( root, [
				'v2.4.0-beta.1',
				'--prerelease',
			] );
			expect( status ).toBe( 1 );
			expect( output ).toMatch( /2\.4\.0-beta\.1 {2}✗ expected 2\.4\.0/ );
		}
	);
} );

describe( 'module version check (#287)', () => {
	test( 'fails and names the module when its assets changed and its constant did not', () => {
		const root = makeReleaseProject( '2.4.0' );
		changeAssets( root, 'variable-fonts' );
		commit( root );
		const { status, output } = run( root, [ 'v2.4.0' ] );
		expect( status ).toBe( 1 );
		expect( output ).toMatch( /variable-fonts {2}1 assets\/ file\(s\) changed, TYPOST_VF_VERSION still 1\.0\.0 {2}✗/ );
		expect( output ).toContain( 'Module version check against v2.3.3' );
		expect( output ).toMatch( /glyphs-panel {2}no assets\/ changes/ );
	} );

	test( 'passes when the changed module has a new constant', () => {
		const root = makeReleaseProject( '2.4.0' );
		changeAssets( root, 'variable-fonts' );
		writeModule( root, 'variable-fonts', '1.0.1' );
		commit( root );
		const { status, output } = run( root, [ 'v2.4.0' ] );
		expect( status ).toBe( 0 );
		expect( output ).toContain( 'TYPOST_VF_VERSION 1.0.0 → 1.0.1' );
	} );

	test( 'passes when only the module PHP and catalogs changed', () => {
		const root = makeReleaseProject( '2.4.0' );
		fs.mkdirSync( path.join( root, 'paragraph-styles', 'languages' ) );
		fs.writeFileSync( path.join( root, 'paragraph-styles', 'languages', 'x.po' ), 'msgid ""\n' );
		fs.appendFileSync( path.join( root, 'paragraph-styles', 'paragraph-styles.php' ), '// changed\n' );
		commit( root );
		expect( run( root, [ 'v2.4.0' ] ).status ).toBe( 0 );
	} );

	test( 'counts an asset file that is not committed yet', () => {
		const root = makeReleaseProject( '2.4.0' );
		fs.writeFileSync( path.join( root, 'glyphs-panel', 'assets', 'js', 'new.js' ), '// new\n' );
		const { status, output } = run( root, [ '--modules' ] );
		expect( status ).toBe( 1 );
		expect( output ).toMatch( /glyphs-panel {2}1 assets\/ file\(s\) changed/ );
	} );

	test( 'compares with the previous stable tag, not a beta or the tag being released', () => {
		const root = makeReleaseProject( '2.4.0' );
		changeAssets( root, 'glyphs-panel' );
		writeModule( root, 'glyphs-panel', '1.0.1' );
		commit( root, 'v2.4.0-beta.1' );
		commit( root, 'v2.4.0' );
		const { status, output } = run( root, [ 'v2.4.0' ] );
		expect( status ).toBe( 0 );
		expect( output ).toContain( 'Module version check against v2.3.3' );
		expect( output ).toContain( 'TYPOST_GP_VERSION 1.0.0 → 1.0.1' );
	} );

	test( 'picks the highest lower tag, also from tags without a leading v', () => {
		const root = makeReleaseProject( '2.4.0', 'v2.3.9' );
		commit( root, '2.3.10' );
		commit( root, 'v2.3.2' );
		const { output } = run( root, [ 'v2.4.0' ] );
		expect( output ).toContain( 'Module version check against 2.3.10' );
	} );

	test( 'runs in pre-release mode against the base version', () => {
		const root = makeReleaseProject( '2.4.0' );
		fs.writeFileSync(
			path.join( root, 'readme.txt' ),
			'=== Typography Stylist ===\nTested up to: 6.9\nStable tag: 2.3.3\n'
		);
		changeAssets( root, 'paragraph-styles' );
		commit( root );
		const { status, output } = run( root, [ 'v2.4.0-beta.1', '--prerelease' ] );
		expect( status ).toBe( 1 );
		expect( output ).toMatch( /paragraph-styles {2}1 assets\/ file\(s\) changed, TYPOST_PS_VERSION still 1\.0\.0 {2}✗/ );
	} );

	test( 'passes a module that did not exist at the previous tag', () => {
		const root = makeReleaseProject( '2.4.0' );
		fs.rmSync( path.join( root, 'variable-fonts' ), { recursive: true } );
		git( root, [ 'add', '-A' ] );
		git( root, [ 'commit', '-q', '--amend', '-m', 'v2.3.3' ] );
		git( root, [ 'tag', '-f', 'v2.3.3' ] );
		writeModule( root, 'variable-fonts', '1.0.0' );
		commit( root );
		const { status, output } = run( root, [ 'v2.4.0' ] );
		expect( status ).toBe( 0 );
		expect( output ).toContain( 'variable-fonts  new since v2.3.3' );
	} );

	test( 'fails when the module file exists at the tag but its constant cannot be read there', () => {
		const root = makeReleaseProject( '2.4.0' );
		fs.writeFileSync(
			path.join( root, 'glyphs-panel', 'glyphs-panel.php' ),
			"<?php\ndefine( \"TYPOST_GP_VERSION\", '1.0.0' );\n"
		);
		git( root, [ 'add', '-A' ] );
		git( root, [ 'commit', '-q', '--amend', '-m', 'v2.3.3' ] );
		git( root, [ 'tag', '-f', 'v2.3.3' ] );
		writeModule( root, 'glyphs-panel', '1.0.1' );
		changeAssets( root, 'glyphs-panel' );
		commit( root );
		const { status, output } = run( root, [ 'v2.4.0' ] );
		expect( status ).toBe( 1 );
		expect( output ).toContain( 'could not read TYPOST_GP_VERSION from glyphs-panel/glyphs-panel.php at v2.3.3' );
		expect( output ).not.toContain( 'glyphs-panel  new since' );
	} );

	test( 'fails with a clear message when the checkout has no tags', () => {
		const root = makeProject( ALL( '2.4.0' ) );
		for ( const dir of Object.keys( MODULE_FILES ) ) {
			writeModule( root, dir, '1.0.0' );
		}
		git( root, [ 'init', '-q' ] );
		commit( root );
		const { status, output } = run( root, [ 'v2.4.0' ] );
		expect( status ).toBe( 1 );
		expect( output ).toContain( 'no stable tag lower than 2.4.0 was found' );
		expect( output ).toContain( 'fetch-depth: 0' );
	} );

	test( 'fails when the only tag is the release itself (first release)', () => {
		const root = makeReleaseProject( '2.4.0', 'v2.4.0' );
		const { status, output } = run( root, [ 'v2.4.0' ] );
		expect( status ).toBe( 1 );
		expect( output ).toContain( 'no stable tag lower than 2.4.0 was found' );
	} );

	test( 'consistency mode without --modules does not run it', () => {
		const { status, output } = run( makeProject( ALL( '2.4.0' ) ) );
		expect( status ).toBe( 0 );
		expect( output ).not.toContain( 'Module version check' );
	} );
} );

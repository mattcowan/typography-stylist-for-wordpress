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

	test( 'fails when the lockfile has no packages[""] entry', () => {
		const root = makeProject( ALL( '2.4.0' ) );
		fs.writeFileSync(
			path.join( root, 'package-lock.json' ),
			JSON.stringify( { name: 'typost', version: '2.4.0', lockfileVersion: 3 } )
		);
		expect( run( root ).status ).toBe( 1 );
	} );
} );

describe( 'tag mode', () => {
	test( 'passes when all six values equal the tag', () => {
		expect( run( makeProject( ALL( '2.4.0' ) ), [ 'v2.4.0' ] ).status ).toBe( 0 );
	} );

	test.each( [ 'lock', 'lockRoot' ] )(
		'fails when the lockfile %s value does not equal the tag',
		( key ) => {
			const { status, output } = run(
				makeProject( { ...ALL( '2.4.0' ), [ key ]: '2.3.3' } ),
				[ 'v2.4.0' ]
			);
			expect( status ).toBe( 1 );
			expect( output ).toMatch( /2\.3\.3 {2}✗ expected 2\.4\.0/ );
		}
	);
} );

describe( 'pre-release mode', () => {
	test( 'passes when both lockfile values equal the base version', () => {
		const root = makeProject( { ...ALL( '2.4.0' ), stable: '2.3.3' } );
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

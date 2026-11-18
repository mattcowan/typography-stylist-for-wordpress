/**
 * No file of this repository names a path or a host on a developer's machine.
 *
 * This repository is public. A path such as a Windows user folder, the
 * folder of a local site tool, or a local development host tells a reader
 * about one developer's machine, and helps nobody else. Write "the test
 * site", a placeholder such as `<svn-checkout>`, or `http://localhost:8080`
 * (the value in `.env.example`) instead.
 *
 * Files: every file that git tracks, and every new file that git does not
 * ignore (it is about to be committed), as it is in the working tree.
 * Binary files (a NUL byte in the first 8 KB) are skipped. A file that git
 * tracks but that is deleted in the working tree is skipped.
 *
 * This file names the patterns, so it is the one file not checked.
 *
 * Old commits keep these names: this test does not rewrite history.
 */
const { execFileSync } = require( 'child_process' );
const fs = require( 'fs' );
const path = require( 'path' );

const ROOT = path.resolve( __dirname, '..' );
const SELF = path.relative( ROOT, __filename ).split( path.sep ).join( '/' );

const PATTERNS = [
	{ name: 'a Windows user folder', re: /[A-Za-z]:[\\/]+Users[\\/]/ },
	{ name: 'the folder of the Local site tool', re: /Local Sites/ },
	{ name: 'a WAMP install folder', re: /wamp64/i },
	{ name: 'the old development host', re: /typography-stylist:8080/i },
	{ name: 'the old plugin folder name', re: /opentype-stylist/i },
];

function listFiles() {
	const out = execFileSync(
		'git',
		[ 'ls-files', '-z', '--cached', '--others', '--exclude-standard' ],
		{ cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }
	);
	return [ ...new Set( out.toString( 'utf8' ).split( '\0' ).filter( Boolean ) ) ];
}

function findMatches( files ) {
	const hits = [];
	for ( const file of files ) {
		if ( file === SELF ) {
			continue;
		}
		let buffer;
		try {
			buffer = fs.readFileSync( path.join( ROOT, file ) );
		} catch ( error ) {
			if ( error.code === 'ENOENT' || error.code === 'EISDIR' ) {
				continue;
			}
			throw error;
		}
		if ( buffer.subarray( 0, 8000 ).includes( 0 ) ) {
			continue;
		}
		const lines = buffer.toString( 'utf8' ).split( /\r?\n/ );
		lines.forEach( ( line, index ) => {
			for ( const pattern of PATTERNS ) {
				if ( pattern.re.test( line ) ) {
					hits.push( `${ file }:${ index + 1 }: ${ pattern.name }` );
				}
			}
		} );
	}
	return hits;
}

describe( 'no local machine details in the repository', () => {
	test( 'each pattern matches a known example', () => {
		const examples = [
			'C:\\Users\\someone\\project',
			'c:/Users/someone/project',
			'~/Local Sites/example/app/public',
			'C:\\wamp64\\www\\plugin',
			'http://typography-stylist:8080/?p=1',
			'wp-content/plugins/opentype-stylist/',
		];
		for ( const pattern of PATTERNS ) {
			expect( examples.some( ( example ) => pattern.re.test( example ) ) ).toBe( true );
		}
		expect( PATTERNS.some( ( pattern ) => pattern.re.test( 'http://localhost:8080' ) ) ).toBe( false );
	} );

	test( 'the file list holds this repository', () => {
		const files = listFiles();
		expect( files ).toContain( 'typography-stylist.php' );
		expect( files ).toContain( SELF );
	} );

	test( 'no file names a local path or the old development host', () => {
		expect( findMatches( listFiles() ) ).toEqual( [] );
	} );
} );

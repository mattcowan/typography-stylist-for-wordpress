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
const os = require( 'os' );
const path = require( 'path' );

const ROOT = path.resolve( __dirname, '..' );
const SELF = path.relative( ROOT, __filename ).split( path.sep ).join( '/' );

const PATTERNS = [
	// Windows paths are not case-sensitive: C:\users is the same folder
	{ name: 'a Windows user folder', re: /[A-Za-z]:[\\/]+Users[\\/]/i },
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

/**
 * The text to scan for one listed path: a regular file's content, or a
 * symlink's own target path (never the content it points to, which can be
 * outside the repository). Anything else (a deleted file, a directory, a
 * FIFO, which would block a read) gives null.
 *
 * @param {string} root Repository root
 * @param {string} file Path relative to the root
 * @return {?Buffer} The bytes to scan, or null
 */
function readScannable( root, file ) {
	const full = path.join( root, file );
	let stat;
	try {
		stat = fs.lstatSync( full );
	} catch ( error ) {
		if ( error.code === 'ENOENT' ) {
			return null;
		}
		throw error;
	}
	if ( stat.isSymbolicLink() ) {
		return Buffer.from( fs.readlinkSync( full ), 'utf8' );
	}
	return stat.isFile() ? fs.readFileSync( full ) : null;
}

function findMatches( files, root = ROOT ) {
	const hits = [];
	for ( const file of files ) {
		if ( file === SELF ) {
			continue;
		}
		const buffer = readScannable( root, file );
		if ( ! buffer ) {
			continue;
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
	test( 'each pattern matches its known examples', () => {
		const examples = [
			[ 'a Windows user folder', 'C:\\Users\\someone\\project' ],
			[ 'a Windows user folder', 'c:/Users/someone/project' ],
			[ 'a Windows user folder', 'C:\\users\\someone\\project' ],
			[ 'the folder of the Local site tool', '~/Local Sites/example/app/public' ],
			[ 'a WAMP install folder', 'C:\\wamp64\\www\\plugin' ],
			[ 'the old development host', 'http://typography-stylist:8080/?p=1' ],
			[ 'the old plugin folder name', 'wp-content/plugins/opentype-stylist/' ],
		];
		for ( const [ name, example ] of examples ) {
			const pattern = PATTERNS.find( ( candidate ) => candidate.name === name );
			expect( { name, example, matches: pattern.re.test( example ) } ).toEqual( { name, example, matches: true } );
		}
		expect( PATTERNS.some( ( pattern ) => pattern.re.test( 'http://localhost:8080' ) ) ).toBe( false );
	} );

	test( 'only regular files and link text are scanned', () => {
		const dir = fs.mkdtempSync( path.join( os.tmpdir(), 'no-local-details-' ) );
		try {
			fs.writeFileSync( path.join( dir, 'plain.txt' ), 'see C:\\Users\\someone\\x\n' );
			fs.mkdirSync( path.join( dir, 'folder' ) );
			expect( findMatches( [ 'plain.txt', 'folder', 'gone.txt' ], dir ) ).toEqual( [ 'plain.txt:1: a Windows user folder' ] );

			// A link is scanned by its own target path, not by the target's content
			fs.writeFileSync( path.join( dir, 'outside.txt' ), 'see C:\\Users\\someone\\x\n' );
			let linked = true;
			try {
				fs.symlinkSync( 'outside.txt', path.join( dir, 'link.txt' ) );
			} catch ( error ) {
				// Windows without the symlink right: nothing to check here
				linked = false;
			}
			if ( linked ) {
				expect( findMatches( [ 'link.txt' ], dir ) ).toEqual( [] );
			}
		} finally {
			fs.rmSync( dir, { recursive: true, force: true } );
		}
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

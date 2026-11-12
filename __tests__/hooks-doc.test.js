/**
 * HOOKS.md and the code list the same hooks (#372).
 *
 * HOOKS.md is the plugin's public extension API. This test collects every
 * hook the plugin fires and every hook HOOKS.md documents, and fails when
 * the two sets are not the same. HOOKS.md does not ship (.distignore), but
 * it is always in this repository, so a missing HOOKS.md is a failure.
 *
 * Hooks in the code
 * -----------------
 * PHP: the first argument of apply_filters(), apply_filters_ref_array(),
 * apply_filters_deprecated(), do_action(), do_action_ref_array() and
 * do_action_deprecated(), in any letter case like PHP itself (DO_ACTION()
 * fires a hook too), when the name starts with `typost_` in any case
 * (so a `Typost_` name fails as undocumented). The plugin also fires
 * WordPress core hooks (`the_content`); those are not its API. A run-time
 * name whose literal start could still become `typost_` ('typ' . $x) is
 * unreadable. Files: every .php file that ships, also the
 * blocks/typography-stylist/build/index.asset.php that a build writes.
 *
 * JavaScript: the first argument of `typostHooks.applyFilters()` and
 * `typostHooks.doAction()` (`window.typostHooks` or `typostHooks`, also
 * with optional chaining), and the `hook` prop of every `<HookPoint>`
 * element: HookPoint (assets/js/inline-editor/modal-chrome.js) fires
 * `typostHooks.doAction( hook, … )` with that prop (JS_HOOK_WRAPPERS).
 * Every name fired on typostHooks counts, whatever its prefix, because the
 * registry is the plugin's own; HOOKS.md entries must start with `typost_`,
 * so a name without the prefix fails as undocumented. Files: the .js,
 * .jsx, .mjs and .cjs source that ships, without built bundles (`*.min.js`
 * and any `build/` folder) and third-party libraries (any `vendor/`
 * folder).
 *
 * "Ships" is decided by .distignore, read the same way as
 * scripts/package.js reads it: a walk of the directory tree that skips what
 * .distignore excludes (/vendor, /tests, /node_modules, __tests__ …). A walk
 * and not `git ls-files`, so that a new file is scanned before it is added
 * to git, and the test runs where git is not available. The walk asks
 * .distignore before it opens an entry, so a broken link that does not ship
 * is never touched; a broken link that would ship fails the test.
 *
 * Comments are never scanned. PHP is lexed here (comments, strings,
 * heredoc and nowdoc, inline HTML outside `<?php … ?>`), JavaScript is
 * parsed with Babel, so a hook named in a comment, a docblock example or a
 * string is not a call site.
 *
 * A name built at run time is a pattern: each run-time part becomes `{*}`
 * (PHP "typost_admin_tab_content_{$tab['id']}" is
 * `typost_admin_tab_content_{*}`; a JS template literal or a `+`
 * concatenation the same). A pattern needs a literal start.
 *
 * Call sites the test cannot read fail the test (the "readable" test):
 * a name in a variable or a constant, a name that starts with a run-time
 * part, a method or variable named like a hook function, a hook function
 * passed by name (`call_user_func( 'do_action', … )`), a typostHooks method
 * reached through an alias, destructuring, `.call()` or `.bind()`, a call
 * on another hook registry, a JS hook call inside a PHP string or in a PHP
 * file's inline HTML, a PHP short open tag, a file Babel cannot parse, an
 * unterminated PHP string or comment, and a broken link that would ship.
 * Each of them would otherwise hide a hook. A new wrapper like
 * HookPoint goes in JS_HOOK_WRAPPERS.
 *
 * Hooks in HOOKS.md
 * -----------------
 * A hook is documented when its name, in backticks, starts one of these
 * lines outside a fenced code block:
 *
 * - a heading:                 #### `typost_editor_data`
 * - the first cell of a table: | `typost_inline_modal_top` | … |
 * - a paragraph in bold:       **`typost_extension_panel_closed`** (…)
 *
 * PHP hooks count only under "## PHP Hooks", JavaScript hooks only under
 * "## JavaScript Hooks". Under PHP Hooks, a filter must be under
 * "### PHP Filters" and an action under "### PHP Actions". This filter or
 * action check is for PHP only: HOOKS.md has no JavaScript Filters and
 * Actions sections (JS hooks are grouped by where they fire, and
 * `typost_weight_control` is both), so for JavaScript only the names are
 * compared, as the issue asks. A name in prose,
 * in a list or in a code example is not an entry: an example that mentions
 * a hook in passing does not document it. A placeholder in braces
 * (`typost_admin_tab_after_{tab_id}`) makes the entry a pattern; it
 * documents every name that fits it (the placeholder stands for one or
 * more letters, digits, `_` or `-`) and the code pattern with the same
 * shape. A pattern entry needs a literal part after `typost_`: an entry
 * like `typost_{x}` would document every hook, so it fails. Backticked names that start with `typost:` or `typost-` are
 * jQuery events and CustomEvents, which this test does not cover.
 */
const fs = require( 'fs' );
const os = require( 'os' );
const path = require( 'path' );
const ignore = require( 'ignore' );
const { parseSync, traverse } = require( '@babel/core' );

const ROOT = path.resolve( __dirname, '..' );
const PREFIX = 'typost_';

// A run-time part of a hook name.
const DYN = Symbol( 'run-time part' );

const PHP_HOOK_FUNCTIONS = {
	apply_filters: 'filter',
	apply_filters_ref_array: 'filter',
	apply_filters_deprecated: 'filter',
	do_action: 'action',
	do_action_ref_array: 'action',
	do_action_deprecated: 'action',
};

const JS_HOOK_METHODS = {
	applyFilters: 'filter',
	doAction: 'action',
};

// A typostHooks call written as text in a PHP file (a string or inline
// HTML), which neither the PHP nor the JavaScript scan reads.
const JS_HOOK_CALL_IN_TEXT = /typostHooks[\s\S]*?\.\s*(applyFilters|doAction)\s*\(/;

/**
 * Components that fire a typostHooks action with a name from a prop. The
 * call inside the component (`doAction( hook, … )`) is read through its
 * JSX elements (`<HookPoint hook="typost_…" />`).
 */
const JS_HOOK_WRAPPERS = [
	{
		component: 'HookPoint',
		prop: 'hook',
		kind: 'action',
		file: 'assets/js/inline-editor/modal-chrome.js',
	},
];

const has = ( object, key ) =>
	Object.prototype.hasOwnProperty.call( object, key );

/**
 * Lists the files that ship: every file under the root that .distignore
 * does not exclude, as `/`-separated paths relative to the root. An entry
 * .distignore excludes is never opened, so a broken link there (a worktree's
 * vendor link, say) is harmless. A link that would ship but cannot be read
 * is a problem: the scan cannot tell whether it holds hooks.
 *
 * @param {string} root Repository root.
 * @return {{files: string[], problems: string[]}} Relative paths, sorted, and unreadable links.
 */
function listShippedFiles( root ) {
	const distignore = path.join( root, '.distignore' );
	if ( ! fs.existsSync( distignore ) ) {
		throw new Error(
			`.distignore is missing at ${ root }: it decides which files ship, so the hook scan cannot run without it.`
		);
	}
	const ig = ignore().add( fs.readFileSync( distignore, 'utf8' ) );
	const files = [];
	const problems = [];
	// Real paths already walked: a link loop is walked once.
	const visited = new Set();

	const walk = ( absDir, relDir ) => {
		const real = fs.realpathSync( absDir );
		if ( visited.has( real ) ) {
			return;
		}
		visited.add( real );
		for ( const entry of fs.readdirSync( absDir, { withFileTypes: true } ) ) {
			const rel = relDir ? `${ relDir }/${ entry.name }` : entry.name;
			const abs = path.join( absDir, entry.name );
			// Ask .distignore before touching the entry: stat() on a
			// broken link throws.
			if ( ig.ignores( rel ) ) {
				continue;
			}
			let isDir = entry.isDirectory();
			if ( entry.isSymbolicLink() ) {
				try {
					isDir = fs.statSync( abs ).isDirectory();
				} catch ( error ) {
					if ( ! ig.ignores( `${ rel }/` ) ) {
						problems.push(
							`${ rel } is a link whose target cannot be read (${ error.code }); the hook scan cannot tell whether it holds hooks`
						);
					}
					continue;
				}
			}
			if ( isDir ) {
				if ( ! ig.ignores( `${ rel }/` ) ) {
					walk( abs, rel );
				}
			} else {
				files.push( rel );
			}
		}
	};
	walk( root, '' );
	return { files: files.sort(), problems };
}

/**
 * Whether a shipped file is JavaScript source to scan: not a built bundle
 * and not a third-party library.
 *
 * @param {string} rel Relative path.
 * @return {boolean} True to scan it.
 */
function isJsSource( rel ) {
	if ( ! /\.(js|jsx|mjs|cjs)$/.test( rel ) || /\.min\.js$/.test( rel ) ) {
		return false;
	}
	return ! rel
		.split( '/' )
		.some( ( segment ) => segment === 'build' || segment === 'vendor' );
}

/**
 * Line number of an offset.
 *
 * @param {string} text   Source text.
 * @param {number} offset Offset into it.
 * @return {number} One-based line.
 */
function lineAt( text, offset ) {
	let line = 1;
	for ( let i = 0; i < offset && i < text.length; i++ ) {
		if ( text[ i ] === '\n' ) {
			line++;
		}
	}
	return line;
}

/**
 * Turns name parts into a literal name or a pattern.
 *
 * @param {Array<string|symbol>} segments Literal parts and DYN.
 * @return {{literal: string}|{pattern: string, prefix: string}|{unreadable: true}} The name.
 */
function classifyName( segments ) {
	const merged = [];
	for ( const segment of segments ) {
		const last = merged.length - 1;
		if ( segment === DYN ) {
			if ( merged[ last ] !== DYN ) {
				merged.push( DYN );
			}
		} else if ( typeof merged[ last ] === 'string' ) {
			merged[ last ] += segment;
		} else {
			merged.push( segment );
		}
	}
	if ( ! merged.includes( DYN ) ) {
		return { literal: merged.join( '' ) };
	}
	if ( merged[ 0 ] === DYN || merged[ 0 ] === '' ) {
		return { unreadable: true };
	}
	return {
		pattern: merged.map( ( s ) => ( s === DYN ? '{*}' : s ) ).join( '' ),
		prefix: merged[ 0 ],
	};
}

/* ------------------------------------------------------------------ */
/* PHP                                                                  */
/* ------------------------------------------------------------------ */

function skipPhpSingle( src, i ) {
	let j = i + 1;
	while ( j < src.length ) {
		if ( src[ j ] === '\\' ) {
			j += 2;
		} else if ( src[ j ] === "'" ) {
			return j + 1;
		} else {
			j++;
		}
	}
	return -1;
}

// src[ i ] is the `{` that opens `{$…}` or the `{` of `${…}`.
function skipPhpBraced( src, i ) {
	let depth = 0;
	let j = i;
	while ( j < src.length ) {
		const ch = src[ j ];
		if ( ch === "'" || ch === '"' ) {
			j = ch === "'" ? skipPhpSingle( src, j ) : skipPhpDouble( src, j, '"' );
			if ( j === -1 ) {
				return -1;
			}
			continue;
		}
		if ( ch === '{' ) {
			depth++;
		} else if ( ch === '}' ) {
			depth--;
			if ( depth === 0 ) {
				return j + 1;
			}
		}
		j++;
	}
	return -1;
}

function skipPhpDouble( src, i, quote ) {
	let j = i + 1;
	while ( j < src.length ) {
		const ch = src[ j ];
		if ( ch === '\\' ) {
			j += 2;
		} else if ( ch === quote ) {
			return j + 1;
		} else if ( ch === '{' && src[ j + 1 ] === '$' ) {
			j = skipPhpBraced( src, j );
			if ( j === -1 ) {
				return -1;
			}
		} else if ( ch === '$' && src[ j + 1 ] === '{' ) {
			j = skipPhpBraced( src, j + 1 );
			if ( j === -1 ) {
				return -1;
			}
		} else {
			j++;
		}
	}
	return -1;
}

/**
 * Lexes PHP far enough to find call sites: blanks comments and inline
 * HTML, and replaces each string with `~` (newlines kept, so offsets and
 * lines stay the same) while recording it.
 *
 * @param {string} src PHP source.
 * @return {{masked: string, strings: Map, problems: Array}} The result.
 */
function lexPhp( src ) {
	const out = src.split( '' );
	const strings = new Map();
	const problems = [];
	const n = src.length;
	const paint = ( from, to, ch ) => {
		for ( let k = from; k < to; k++ ) {
			if ( out[ k ] !== '\n' && out[ k ] !== '\r' ) {
				out[ k ] = ch;
			}
		}
	};
	const addString = ( start, end, kind ) => {
		strings.set( start, { end, kind, raw: src.slice( start, end ) } );
		paint( start, end, '~' );
	};

	let inPhp = false;
	let i = 0;
	while ( i < n ) {
		if ( ! inPhp ) {
			const open = /<\?(php\b|=|xml\b)?/gi;
			open.lastIndex = i;
			let match = open.exec( src );
			while ( match && /^xml$/i.test( match[ 1 ] || '' ) ) {
				match = open.exec( src );
			}
			if ( match && match[ 1 ] === undefined ) {
				problems.push( {
					offset: match.index,
					message:
						'opens PHP with a short open tag (<?); the test reads only <?php and <?=',
				} );
			}
			const html = src.slice( i, match ? match.index : n );
			const jsCall = JS_HOOK_CALL_IN_TEXT.exec( html );
			if ( jsCall ) {
				problems.push( {
					offset: i + jsCall.index,
					message:
						'holds a typostHooks call in inline HTML; the test does not scan JavaScript inside PHP files',
				} );
			}
			const end = match ? match.index + match[ 0 ].length : n;
			paint( i, end, ' ' );
			i = end;
			inPhp = !! match;
			continue;
		}
		const ch = src[ i ];
		const two = src.substr( i, 2 );
		if ( two === '?>' ) {
			paint( i, i + 2, ' ' );
			i += 2;
			inPhp = false;
		} else if ( two === '//' || ch === '#' ) {
			let j = i;
			while ( j < n && src[ j ] !== '\n' && src.substr( j, 2 ) !== '?>' ) {
				j++;
			}
			paint( i, j, ' ' );
			i = j;
		} else if ( two === '/*' ) {
			const close = src.indexOf( '*/', i + 2 );
			if ( close === -1 ) {
				problems.push( { offset: i, message: 'has an unterminated /* comment' } );
			}
			const j = close === -1 ? n : close + 2;
			paint( i, j, ' ' );
			i = j;
		} else if ( ch === "'" || ch === '"' || ch === '`' ) {
			const j =
				ch === "'" ? skipPhpSingle( src, i ) : skipPhpDouble( src, i, ch );
			if ( j === -1 ) {
				problems.push( { offset: i, message: 'has an unterminated string' } );
				paint( i, n, '~' );
				i = n;
			} else {
				addString(
					i,
					j,
					{ "'": 'single', '"': 'double', '`': 'backtick' }[ ch ]
				);
				i = j;
			}
		} else if ( src.startsWith( '<<<', i ) ) {
			const opener = /<<<[ \t]*(["']?)([A-Za-z_\x80-\uffff][A-Za-z0-9_\x80-\uffff]*)\1\r?\n/y;
			opener.lastIndex = i;
			const head = opener.exec( src );
			if ( ! head ) {
				i += 3;
				continue;
			}
			const closer = new RegExp(
				`\\n[ \\t]*${ head[ 2 ] }(?![A-Za-z0-9_\\x80-\\uffff])`,
				'g'
			);
			closer.lastIndex = i + head[ 0 ].length - 1;
			const tail = closer.exec( src );
			if ( ! tail ) {
				problems.push( { offset: i, message: 'has an unterminated heredoc' } );
				paint( i, n, '~' );
				i = n;
			} else {
				const end = tail.index + tail[ 0 ].length;
				addString( i, end, head[ 1 ] === "'" ? 'nowdoc' : 'heredoc' );
				i = end;
			}
		} else {
			i++;
		}
	}
	return { masked: out.join( '' ), strings, problems };
}

/**
 * Splits the body of a PHP double-quoted string into literal parts and
 * DYN for each interpolation.
 *
 * @param {string} body String body, without the quotes.
 * @return {Array<string|symbol>} Parts.
 */
function phpDoubleQuotedSegments( body ) {
	const escapes = {
		n: '\n',
		t: '\t',
		r: '\r',
		v: '\v',
		f: '\f',
		e: '\x1b',
		'\\': '\\',
		$: '$',
		'"': '"',
	};
	const segments = [];
	let literal = '';
	const flush = () => {
		segments.push( literal );
		literal = '';
	};
	let i = 0;
	while ( i < body.length ) {
		const ch = body[ i ];
		if ( ch === '\\' && i + 1 < body.length && has( escapes, body[ i + 1 ] ) ) {
			literal += escapes[ body[ i + 1 ] ];
			i += 2;
		} else if ( ch === '{' && body[ i + 1 ] === '$' ) {
			flush();
			segments.push( DYN );
			const end = skipPhpBraced( body, i );
			i = end === -1 ? body.length : end;
		} else if ( ch === '$' && body[ i + 1 ] === '{' ) {
			flush();
			segments.push( DYN );
			const end = skipPhpBraced( body, i + 1 );
			i = end === -1 ? body.length : end;
		} else if ( ch === '$' && /[A-Za-z_\x80-\uffff]/.test( body[ i + 1 ] || '' ) ) {
			flush();
			segments.push( DYN );
			i++;
			while ( i < body.length && /[A-Za-z0-9_\x80-\uffff]/.test( body[ i ] ) ) {
				i++;
			}
			if ( body[ i ] === '[' ) {
				const close = body.indexOf( ']', i );
				i = close === -1 ? body.length : close + 1;
			} else if (
				body.startsWith( '->', i ) &&
				/[A-Za-z_]/.test( body[ i + 2 ] || '' )
			) {
				i += 2;
				while ( i < body.length && /[A-Za-z0-9_]/.test( body[ i ] ) ) {
					i++;
				}
			}
		} else {
			literal += ch;
			i++;
		}
	}
	flush();
	return segments;
}

/**
 * Reads the parts of a PHP hook name argument.
 *
 * @param {Object} lexed The lexPhp() result.
 * @param {number} start First offset of the argument.
 * @param {number} end   Offset after the argument.
 * @return {Array<string|symbol>|null} Parts, or null for an empty argument.
 */
function phpArgumentSegments( lexed, start, end ) {
	const { masked, strings } = lexed;
	const parts = [];
	let depth = 0;
	let from = start;
	for ( let k = start; k < end; k++ ) {
		const ch = masked[ k ];
		if ( '([{'.includes( ch ) ) {
			depth++;
		} else if ( ')]}'.includes( ch ) ) {
			depth--;
		} else if ( ch === '.' && depth === 0 ) {
			parts.push( [ from, k ] );
			from = k + 1;
		}
	}
	parts.push( [ from, end ] );

	const segments = [];
	for ( let [ a, b ] of parts ) {
		while ( a < b && /\s/.test( masked[ a ] ) ) {
			a++;
		}
		while ( b > a && /\s/.test( masked[ b - 1 ] ) ) {
			b--;
		}
		if ( a === b ) {
			return null;
		}
		const token = strings.get( a );
		if ( ! token || token.end !== b ) {
			segments.push( DYN );
		} else if ( token.kind === 'single' ) {
			segments.push( token.raw.slice( 1, -1 ).replace( /\\(['\\])/g, '$1' ) );
		} else if ( token.kind === 'double' ) {
			segments.push( ...phpDoubleQuotedSegments( token.raw.slice( 1, -1 ) ) );
		} else {
			segments.push( DYN );
		}
	}
	return segments;
}

/**
 * Finds the plugin hooks a PHP file fires.
 *
 * @param {string} source PHP source.
 * @param {string} file   Relative path, for messages.
 * @return {{hooks: Array, problems: string[]}} Hooks and unreadable sites.
 */
function scanPhp( source, file ) {
	const hooks = [];
	const problems = [];
	const lexed = lexPhp( source );
	const { masked, strings } = lexed;
	const at = ( offset ) => `${ file }:${ lineAt( source, offset ) }`;

	for ( const problem of lexed.problems ) {
		problems.push( `${ at( problem.offset ) } ${ problem.message }` );
	}

	for ( const [ start, token ] of strings ) {
		const body = token.raw.replace( /^['"`]|['"`]$/g, '' );
		// PHP function names are case-insensitive.
		if ( has( PHP_HOOK_FUNCTIONS, body.replace( /^\\/, '' ).toLowerCase() ) ) {
			problems.push(
				`${ at( start ) } passes the hook function '${ body }' by name; the test cannot read which hook it fires`
			);
		}
		if ( JS_HOOK_CALL_IN_TEXT.test( body ) ) {
			problems.push(
				`${ at( start ) } holds a typostHooks call in a PHP string; the test does not scan JavaScript inside PHP`
			);
		}
	}

	// PHP function names are case-insensitive: DO_ACTION() fires a hook too.
	const call = /\b(apply_filters(?:_ref_array|_deprecated)?|do_action(?:_ref_array|_deprecated)?)\b/gi;
	let match;
	while ( ( match = call.exec( masked ) ) ) {
		const fn = match[ 1 ];
		const before = masked.slice( Math.max( 0, match.index - 40 ), match.index );
		const open = /^\s*\(/.exec( masked.slice( match.index + fn.length ) );
		if ( /(->|::|\$)\s*$/.test( before ) || /\bfunction\s+&?\s*$/i.test( before ) ) {
			problems.push(
				`${ at( match.index ) } has a method, variable or function named ${ fn }; the test cannot tell which hook it fires`
			);
			continue;
		}
		if ( ! open ) {
			problems.push(
				`${ at( match.index ) } names ${ fn } without calling it; the test cannot tell which hook it fires`
			);
			continue;
		}
		const argStart = match.index + fn.length + open[ 0 ].length;
		let depth = 0;
		let argEnd = argStart;
		for ( ; argEnd < masked.length; argEnd++ ) {
			const ch = masked[ argEnd ];
			if ( '([{'.includes( ch ) ) {
				depth++;
			} else if ( ')]}'.includes( ch ) ) {
				if ( depth === 0 ) {
					break;
				}
				depth--;
			} else if ( ch === ',' && depth === 0 ) {
				break;
			}
		}
		const segments = phpArgumentSegments( lexed, argStart, argEnd );
		const name = segments ? classifyName( segments ) : { unreadable: true };
		const kind = PHP_HOOK_FUNCTIONS[ fn.toLowerCase() ];
		if ( name.literal !== undefined ) {
			if ( /^typost_/i.test( name.literal ) ) {
				hooks.push( { name: name.literal, kind, at: at( match.index ) } );
			}
		} else if ( name.pattern && /^typost_/i.test( name.prefix ) ) {
			hooks.push( { name: name.pattern, kind, at: at( match.index ) } );
		} else if (
			name.pattern &&
			! PREFIX.startsWith( name.prefix.toLowerCase() )
		) {
			// A run-time name with another literal start: not a plugin hook.
		} else {
			problems.push(
				`${ at( match.index ) } calls ${ fn }() with a hook name the test cannot read; write the name as a literal string, or start it with the literal '${ PREFIX }…'`
			);
		}
	}
	return { hooks, problems };
}

/* ------------------------------------------------------------------ */
/* JavaScript                                                           */
/* ------------------------------------------------------------------ */

function propertyName( member ) {
	const prop = member.property;
	if ( ! member.computed && prop.type === 'Identifier' ) {
		return prop.name;
	}
	if ( member.computed && prop.type === 'StringLiteral' ) {
		return prop.value;
	}
	return null;
}

function isMember( node ) {
	return (
		!! node &&
		( node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression' )
	);
}

function hookMethod( node ) {
	if ( ! isMember( node ) ) {
		return null;
	}
	const name = propertyName( node );
	return name && has( JS_HOOK_METHODS, name ) ? name : null;
}

function isTypostHooks( node ) {
	if ( node.type === 'Identifier' ) {
		return node.name === 'typostHooks';
	}
	return isMember( node ) && propertyName( node ) === 'typostHooks';
}

function jsNameSegments( node ) {
	if ( node.type === 'StringLiteral' ) {
		return [ node.value ];
	}
	if ( node.type === 'TemplateLiteral' ) {
		const segments = [];
		node.quasis.forEach( ( quasi, index ) => {
			segments.push( quasi.value.cooked );
			if ( index < node.expressions.length ) {
				segments.push( DYN );
			}
		} );
		return segments;
	}
	if ( node.type === 'BinaryExpression' && node.operator === '+' ) {
		return [ ...jsNameSegments( node.left ), ...jsNameSegments( node.right ) ];
	}
	return [ DYN ];
}

// `if ( window.typostHooks && window.typostHooks.doAction )` and the like.
function isExistenceCheck( memberPath ) {
	let child = memberPath;
	let parent = memberPath.parentPath;
	while (
		parent &&
		( parent.isLogicalExpression() ||
			parent.isBinaryExpression() ||
			parent.isUnaryExpression( { operator: '!' } ) ||
			parent.isUnaryExpression( { operator: 'typeof' } ) )
	) {
		child = parent;
		parent = parent.parentPath;
	}
	return (
		!! parent &&
		( parent.isIfStatement() ||
			parent.isConditionalExpression() ||
			parent.isWhileStatement() ) &&
		parent.node.test === child.node
	);
}

function isModuleExports( node ) {
	return (
		( node.type === 'Identifier' && node.name === 'exports' ) ||
		( isMember( node ) &&
			node.object.type === 'Identifier' &&
			node.object.name === 'module' &&
			propertyName( node ) === 'exports' )
	);
}

/**
 * Finds the plugin hooks a JavaScript file fires.
 *
 * @param {string} source   JavaScript source.
 * @param {string} file     Relative path, for messages and wrappers.
 * @param {Array}  wrappers Components that fire a hook named by a prop.
 * @return {{hooks: Array, problems: string[], wrappersSeen: Set}} Result.
 */
function scanJs( source, file, wrappers = JS_HOOK_WRAPPERS ) {
	const hooks = [];
	const problems = [];
	const wrappersSeen = new Set();
	let ast;
	try {
		ast = parseSync( source, {
			filename: file,
			babelrc: false,
			configFile: false,
			sourceType: 'unambiguous',
			parserOpts: { plugins: [ 'jsx' ] },
		} );
	} catch ( error ) {
		problems.push(
			`${ file } cannot be parsed (${ String( error.message ).split( '\n' )[ 0 ] }); the test cannot read its hooks`
		);
		return { hooks, problems, wrappersSeen };
	}
	const at = ( node ) => `${ file }:${ node.loc.start.line }`;
	const wrapperNamed = ( name ) => wrappers.find( ( w ) => w.component === name );

	const enclosingWrapper = ( callPath, argName ) => {
		const candidates = wrappers.filter(
			( w ) => w.file === file && w.prop === argName
		);
		let fn = callPath.getFunctionParent();
		while ( fn && candidates.length ) {
			let id = fn.node.id;
			if ( ! id && fn.parentPath.isVariableDeclarator() ) {
				id = fn.parent.id;
			}
			const found = id && candidates.find( ( w ) => w.component === id.name );
			if ( found ) {
				return found;
			}
			fn = fn.parentPath && fn.parentPath.getFunctionParent();
		}
		return null;
	};

	const addName = ( segments, kind, node ) => {
		const name = classifyName( segments );
		if ( name.literal !== undefined ) {
			hooks.push( { name: name.literal, kind, at: at( node ) } );
			return true;
		}
		if ( name.pattern ) {
			hooks.push( { name: name.pattern, kind, at: at( node ) } );
			return true;
		}
		return false;
	};

	traverse( ast, {
		'CallExpression|OptionalCallExpression'( callPath ) {
			const callee = callPath.node.callee;
			if ( callee.type === 'Identifier' && has( JS_HOOK_METHODS, callee.name ) ) {
				problems.push(
					`${ at( callee ) } calls ${ callee.name }() without typostHooks (an alias or a destructured method); call window.typostHooks.${ callee.name }() so the test can read it`
				);
				return;
			}
			const method = hookMethod( callee );
			if ( ! method ) {
				return;
			}
			if ( ! isTypostHooks( callee.object ) ) {
				problems.push(
					`${ at( callee ) } calls .${ method }() on something other than typostHooks; the test cannot tell which registry it fires on`
				);
				return;
			}
			const kind = JS_HOOK_METHODS[ method ];
			const arg = callPath.node.arguments[ 0 ];
			if ( ! arg ) {
				problems.push( `${ at( callee ) } calls .${ method }() with no hook name` );
				return;
			}
			if ( addName( jsNameSegments( arg ), kind, callee ) ) {
				return;
			}
			if ( arg.type === 'Identifier' ) {
				const wrapper = enclosingWrapper( callPath, arg.name );
				if ( wrapper ) {
					wrappersSeen.add( wrapper.component );
					return;
				}
			}
			problems.push(
				`${ at( callee ) } calls typostHooks.${ method }() with a hook name the test cannot read; write the name as a literal string, or add the wrapper to JS_HOOK_WRAPPERS`
			);
		},
		'MemberExpression|OptionalMemberExpression'( memberPath ) {
			const method = hookMethod( memberPath.node );
			if ( ! method ) {
				return;
			}
			const parent = memberPath.parent;
			if (
				( parent.type === 'CallExpression' ||
					parent.type === 'OptionalCallExpression' ) &&
				parent.callee === memberPath.node
			) {
				return;
			}
			if ( parent.type === 'AssignmentExpression' && parent.left === memberPath.node ) {
				return;
			}
			if ( isExistenceCheck( memberPath ) ) {
				return;
			}
			problems.push(
				`${ at( memberPath.node ) } uses .${ method } without calling it (passed on, .call(), .apply() or .bind()); the test cannot tell which hook it fires`
			);
		},
		ObjectPattern( patternPath ) {
			for ( const prop of patternPath.node.properties ) {
				const key =
					prop.type === 'ObjectProperty' && ! prop.computed && prop.key.type === 'Identifier'
						? prop.key.name
						: null;
				if ( key && has( JS_HOOK_METHODS, key ) ) {
					problems.push(
						`${ at( prop ) } destructures ${ key }; the test cannot read the hooks it fires`
					);
				}
			}
		},
		JSXOpeningElement( elementPath ) {
			const tag = elementPath.node.name;
			const wrapper = tag.type === 'JSXIdentifier' && wrapperNamed( tag.name );
			if ( ! wrapper ) {
				return;
			}
			const attributes = elementPath.node.attributes;
			const attr = attributes.find(
				( a ) => a.type === 'JSXAttribute' && a.name.name === wrapper.prop
			);
			const spread = attributes.some( ( a ) => a.type === 'JSXSpreadAttribute' );
			let segments = null;
			if ( attr && attr.value && attr.value.type === 'StringLiteral' ) {
				segments = [ attr.value.value ];
			} else if ( attr && attr.value && attr.value.type === 'JSXExpressionContainer' ) {
				segments = jsNameSegments( attr.value.expression );
			}
			if ( spread || ! segments || ! addName( segments, wrapper.kind, tag ) ) {
				problems.push(
					`${ at( tag ) } renders <${ wrapper.component }> with a ${ wrapper.prop } the test cannot read; pass ${ wrapper.prop }="typost_…" as a literal`
				);
			}
		},
		Identifier( idPath ) {
			const wrapper = wrapperNamed( idPath.node.name );
			if ( ! wrapper ) {
				return;
			}
			const parent = idPath.parent;
			if (
				( parent.type === 'FunctionDeclaration' ||
					parent.type === 'FunctionExpression' ||
					parent.type === 'VariableDeclarator' ) &&
				parent.id === idPath.node
			) {
				return; // Its definition.
			}
			if (
				[ 'ImportSpecifier', 'ImportDefaultSpecifier', 'ExportSpecifier' ].includes(
					parent.type
				)
			) {
				return;
			}
			if ( parent.type === 'ObjectProperty' ) {
				const container = idPath.parentPath.parentPath;
				if ( container.isObjectPattern() ) {
					return; // const { HookPoint } = require( … )
				}
				if ( parent.key === idPath.node && ! parent.shorthand && ! parent.computed ) {
					return; // A key with the same name.
				}
				if (
					container.isObjectExpression() &&
					container.parentPath.isAssignmentExpression() &&
					isModuleExports( container.parent.left )
				) {
					return; // module.exports = { HookPoint: HookPoint }
				}
			}
			problems.push(
				`${ at( idPath.node ) } uses ${ wrapper.component } other than as <${ wrapper.component } ${ wrapper.prop }="…">; the test cannot read the hook name`
			);
		},
	} );
	return { hooks, problems, wrappersSeen };
}

/* ------------------------------------------------------------------ */
/* HOOKS.md                                                             */
/* ------------------------------------------------------------------ */

// At least one literal character after `typost_` before a placeholder:
// `typost_{x}` would document every hook.
const DOC_NAME = /^typost_[a-z0-9_]+(\{[a-z0-9_]+\}[a-z0-9_]*)*$/;

/**
 * Collects the hook entries of HOOKS.md (see the rule at the top).
 *
 * @param {string} markdown HOOKS.md text.
 * @return {{entries: Array, problems: string[]}} Entries and bad names.
 */
function collectDocumentedHooks( markdown ) {
	const entries = [];
	const problems = [];
	let fence = null;
	let section = null;
	let subsection = '';
	markdown.split( /\r?\n/ ).forEach( ( line, index ) => {
		const fenceMatch = /^\s*(`{3,}|~{3,})/.exec( line );
		if ( fenceMatch ) {
			if ( ! fence ) {
				fence = fenceMatch[ 1 ];
			} else if ( fenceMatch[ 1 ].startsWith( fence ) ) {
				fence = null;
			}
			return;
		}
		if ( fence ) {
			return;
		}
		const level2 = /^##\s+(.+?)\s*$/.exec( line );
		if ( level2 ) {
			section =
				{ 'PHP Hooks': 'php', 'JavaScript Hooks': 'js' }[ level2[ 1 ] ] || null;
			subsection = '';
			return;
		}
		const level3 = /^###\s+(.+?)\s*$/.exec( line );
		if ( level3 ) {
			subsection = level3[ 1 ];
		}
		if ( ! section ) {
			return;
		}
		const marker =
			/^#{1,6}\s+`([^`]+)`/.exec( line ) ||
			/^\|\s*`([^`]+)`\s*\|/.exec( line ) ||
			/^\*\*`([^`]+)`\*\*/.exec( line );
		if ( ! marker || ! /^typost_/i.test( marker[ 1 ] ) ) {
			return;
		}
		const name = marker[ 1 ];
		if ( ! DOC_NAME.test( name ) ) {
			problems.push(
				`HOOKS.md:${ index + 1 } has the entry \`${ name }\`, which is not a hook name (lowercase letters, digits, _ and {placeholder}, with a literal part after typost_ before any placeholder)`
			);
			return;
		}
		let kind = null;
		if ( section === 'php' ) {
			kind = { 'PHP Filters': 'filter', 'PHP Actions': 'action' }[ subsection ] || null;
		}
		entries.push( {
			name,
			canonical: name.replace( /\{[a-z0-9_]+\}/g, '{*}' ),
			section,
			kind,
			line: index + 1,
		} );
	} );
	return { entries, problems };
}

/* ------------------------------------------------------------------ */
/* Comparison                                                           */
/* ------------------------------------------------------------------ */

const isPattern = ( name ) => name.includes( '{*}' );

function patternRegExp( pattern ) {
	const source = pattern
		.split( '{*}' )
		.map( ( part ) => part.replace( /[.*+?^${}()|[\]\\]/g, '\\$&' ) )
		.join( '[A-Za-z0-9_-]+' );
	return new RegExp( `^${ source }$` );
}

// Whether a documented name (canonical form) covers a name in the code.
function documents( docName, codeName ) {
	if ( docName === codeName ) {
		return true;
	}
	return isPattern( docName ) && ! isPattern( codeName ) && patternRegExp( docName ).test( codeName );
}

// Whether a documented name (canonical form) is fired by a name in the code.
function firedBy( docName, codeName ) {
	if ( documents( docName, codeName ) ) {
		return true;
	}
	return isPattern( codeName ) && ! isPattern( docName ) && patternRegExp( codeName ).test( docName );
}

/**
 * Compares the hooks of one language with their HOOKS.md entries.
 *
 * @param {Array} codeHooks  {name, kind, at} from the scan.
 * @param {Array} docEntries Entries of the matching HOOKS.md section.
 * @return {{missingFromDoc: string[], missingFromCode: string[], wrongKind: string[]}} Mismatches.
 */
function compareHooks( codeHooks, docEntries ) {
	const byName = new Map();
	for ( const hook of codeHooks ) {
		if ( ! byName.has( hook.name ) ) {
			byName.set( hook.name, [] );
		}
		byName.get( hook.name ).push( hook );
	}
	const missingFromDoc = [];
	const wrongKind = [];
	for ( const [ name, sites ] of byName ) {
		const entries = docEntries.filter( ( e ) => documents( e.canonical, name ) );
		const where = sites.map( ( s ) => s.at ).join( ', ' );
		if ( ! entries.length ) {
			missingFromDoc.push( `${ name } (${ where }) is not in HOOKS.md` );
			continue;
		}
		for ( const kind of new Set( sites.map( ( s ) => s.kind ) ) ) {
			if (
				entries.some( ( e ) => e.kind !== null ) &&
				! entries.some( ( e ) => e.kind === kind )
			) {
				wrongKind.push(
					`${ name } is fired as a ${ kind } (${ where }) but HOOKS.md lists it under ${ entries
						.map( ( e ) => `the ${ e.kind }s (line ${ e.line })` )
						.join( ', ' ) }`
				);
			}
		}
		if ( entries.every( ( e ) => e.section === 'php' && e.kind === null ) ) {
			wrongKind.push(
				`${ name } is in HOOKS.md (line ${ entries[ 0 ].line }) outside "### PHP Filters" and "### PHP Actions"`
			);
		}
	}
	const missingFromCode = [];
	const seen = new Set();
	for ( const entry of docEntries ) {
		if ( seen.has( entry.canonical ) ) {
			continue;
		}
		seen.add( entry.canonical );
		if ( ! [ ...byName.keys() ].some( ( name ) => firedBy( entry.canonical, name ) ) ) {
			missingFromCode.push(
				`${ entry.name } (HOOKS.md:${ entry.line }) is not fired anywhere in the code`
			);
		}
	}
	return { missingFromDoc, missingFromCode, wrongKind };
}

/**
 * Scans a repository: the shipped PHP and JavaScript, and HOOKS.md.
 *
 * @param {string} root              Repository root.
 * @param {Object} [options]
 * @param {Array}  [options.wrappers] Hook wrapper components.
 * @return {Object} Files, hooks, entries, problems and mismatches.
 */
function scanRepository( root, { wrappers = JS_HOOK_WRAPPERS } = {} ) {
	const hooksDoc = path.join( root, 'HOOKS.md' );
	if ( ! fs.existsSync( hooksDoc ) ) {
		// HOOKS.md does not ship, but it is always in this repository.
		throw new Error( `HOOKS.md is missing at ${ root }: it is the public extension API and must be in the repository.` );
	}
	const walked = listShippedFiles( root );
	const phpFiles = walked.files.filter( ( f ) => f.endsWith( '.php' ) );
	const jsFiles = walked.files.filter( isJsSource );
	const problems = [ ...walked.problems ];
	const phpHooks = [];
	const jsHooks = [];
	const wrappersSeen = new Set();
	const read = ( rel ) => fs.readFileSync( path.join( root, rel ), 'utf8' );

	for ( const rel of phpFiles ) {
		const result = scanPhp( read( rel ), rel );
		phpHooks.push( ...result.hooks );
		problems.push( ...result.problems );
	}
	for ( const rel of jsFiles ) {
		const result = scanJs( read( rel ), rel, wrappers );
		jsHooks.push( ...result.hooks );
		problems.push( ...result.problems );
		result.wrappersSeen.forEach( ( name ) => wrappersSeen.add( name ) );
	}
	for ( const wrapper of wrappers ) {
		if ( ! wrappersSeen.has( wrapper.component ) ) {
			problems.push(
				`JS_HOOK_WRAPPERS lists ${ wrapper.component } in ${ wrapper.file }, but no typostHooks call there uses its ${ wrapper.prop } prop: update the list`
			);
		}
	}

	const doc = collectDocumentedHooks( fs.readFileSync( hooksDoc, 'utf8' ) );
	problems.push( ...doc.problems );
	const docPhp = doc.entries.filter( ( e ) => e.section === 'php' );
	const docJs = doc.entries.filter( ( e ) => e.section === 'js' );
	return {
		phpFiles,
		jsFiles,
		phpHooks,
		jsHooks,
		docPhp,
		docJs,
		problems,
		php: compareHooks( phpHooks, docPhp ),
		js: compareHooks( jsHooks, docJs ),
	};
}

const distinct = ( hooks ) => [ ...new Set( hooks.map( ( h ) => h.name ) ) ].sort();

/* ------------------------------------------------------------------ */
/* The repository                                                       */
/* ------------------------------------------------------------------ */

describe( 'HOOKS.md and the code list the same hooks', () => {
	let scan;
	beforeAll( () => {
		scan = scanRepository( ROOT );
	} );

	test( 'the walk reads the files that ship and skips the rest', () => {
		expect( scan.phpFiles ).toEqual(
			expect.arrayContaining( [
				'typography-stylist.php',
				'includes/admin-page.php',
				'paragraph-styles/paragraph-styles.php',
			] )
		);
		expect( scan.jsFiles ).toEqual(
			expect.arrayContaining( [
				'assets/js/block-editor.js',
				'assets/js/inline-editor/modal-chrome.js',
				'blocks/typography-stylist/edit.js',
				'glyphs-panel/assets/js/editor.js',
			] )
		);
		const notShipped = /(^|\/)(__tests__|__mocks__)\/|^(node_modules|vendor|tests|scripts|docs|private)\//;
		expect( scan.phpFiles.filter( ( f ) => notShipped.test( f ) ) ).toEqual( [] );
		// The PHP that a build writes (blocks/*/build/index.asset.php) ships
		// and is scanned; built JavaScript is not.
		expect(
			scan.jsFiles.filter(
				( f ) => notShipped.test( f ) || /(^|\/)(build|vendor)\/|\.min\.js$/.test( f )
			)
		).toEqual( [] );
	} );

	test( 'the scan finds each call form used in this code', () => {
		// One real hook per form, so a scan that silently matches nothing
		// fails here. Update a name only when its hook really goes away.
		expect( distinct( scan.phpHooks ) ).toEqual(
			expect.arrayContaining( [
				'typost_editor_data', // apply_filters( 'literal' )
				'typost_cache_clear', // do_action( 'literal' )
				'typost_admin_tab_content_{*}', // "…{$tab['id']}"
			] )
		);
		expect( distinct( scan.jsHooks ) ).toEqual(
			expect.arrayContaining( [
				'typost_can_convert_to_block', // name on the next line
				'typost_editor_toolbar_buttons', // applyFilters( 'literal' )
				'typost_glyphs_panel_closed', // after an existence check
				'typost_inline_modal_top', // <HookPoint hook="…">
				'typost_qft_modal_top', // doAction( 'literal' )
			] )
		);
	} );

	test( 'every call site is readable', () => {
		expect( scan.problems ).toEqual( [] );
	} );

	test( 'every PHP hook in the code is in HOOKS.md', () => {
		expect( scan.php.missingFromDoc ).toEqual( [] );
	} );

	test( 'every PHP hook in HOOKS.md is in the code', () => {
		expect( scan.php.missingFromCode ).toEqual( [] );
	} );

	test( 'HOOKS.md lists PHP filters under PHP Filters and actions under PHP Actions', () => {
		expect( scan.php.wrongKind ).toEqual( [] );
	} );

	test( 'every JavaScript hook in the code is in HOOKS.md', () => {
		expect( scan.js.missingFromDoc ).toEqual( [] );
	} );

	test( 'every JavaScript hook in HOOKS.md is in the code', () => {
		expect( scan.js.missingFromCode ).toEqual( [] );
	} );
} );

/* ------------------------------------------------------------------ */
/* Control cases: the scan on made-up input                             */
/* ------------------------------------------------------------------ */

describe( 'control cases', () => {
	const names = ( result ) => distinct( result.hooks );

	describe( 'PHP', () => {
		test( 'finds literal, multi-line, ref_array and interpolated names, and skips core hooks', () => {
			const result = scanPhp(
				[
					'<?php',
					"do_action( 'typost_planted_action', 1 );",
					'$v = apply_filters(',
					'	"typost_planted_filter",',
					'	$v',
					');',
					'do_action_ref_array( \'typost_planted_ref\', array() );',
					'\\apply_filters_deprecated( \'typost_planted_old\', array(), \'2.0\' );',
					'do_action( "typost_tab_{$tab[\'id\']}" );',
					"do_action( 'typost_part_' . $id );",
					"apply_filters( 'the_content', '' );",
					"apply_filters( 'core_' . $x, '' );",
				].join( '\n' ),
				'plant.php'
			);
			expect( result.problems ).toEqual( [] );
			expect( names( result ) ).toEqual( [
				'typost_part_{*}',
				'typost_planted_action',
				'typost_planted_filter',
				'typost_planted_old',
				'typost_planted_ref',
				'typost_tab_{*}',
			] );
			const filter = result.hooks.find( ( h ) => h.name === 'typost_planted_filter' );
			expect( filter ).toEqual( { name: 'typost_planted_filter', kind: 'filter', at: 'plant.php:3' } );
		} );

		test( 'does not read comments, docblocks, strings, heredoc or inline HTML', () => {
			const result = scanPhp(
				[
					'<p>do_action( \'typost_in_html\' );</p>',
					'<?php',
					"// do_action( 'typost_in_line_comment' ); ?>",
					'<b>apply_filters( \'typost_after_close_tag\' )</b>',
					'<?php',
					"# do_action( 'typost_in_hash_comment' );",
					'/**',
					" * add_filter( 'typost_in_docblock', '__return_true' );",
					" * apply_filters( 'typost_in_docblock_call' );",
					' */',
					"$s = 'do_action( \"typost_in_string\" )';",
					'$t = <<<EOT',
					"apply_filters( 'typost_in_heredoc' );",
					'EOT;',
					'$u = <<<\'EOT\'',
					"  do_action( 'typost_in_nowdoc' );",
					'  EOT;',
					"do_action( 'typost_real' ); ?>",
				].join( '\n' ),
				'plant.php'
			);
			expect( result.problems ).toEqual( [] );
			expect( names( result ) ).toEqual( [ 'typost_real' ] );
		} );

		test.each( [
			[ 'a variable', 'do_action( $hook );' ],
			[ 'a constant', 'do_action( self::HOOK );' ],
			[ 'sprintf', "apply_filters( sprintf( 'typost_%s', $x ), 1 );" ],
			[ 'a run-time start', "do_action( $prefix . '_saved' );" ],
			[ 'an interpolated start', 'do_action( "{$prefix}_saved" );' ],
			[ 'a prefix cut short', "do_action( 'typ' . $rest );" ],
			[ 'a method', "$this->do_action( 'typost_x' );" ],
			[ 'a static method', "Hooks::apply_filters( 'typost_x', 1 );" ],
			[ 'a hook function by name', "call_user_func( 'do_action', 'typost_x' );" ],
			[ 'JavaScript in a string', "echo '<script>window.typostHooks.doAction(\"typost_x\");</script>';" ],
		] )( 'reports %s as unreadable', ( label, line ) => {
			const result = scanPhp( `<?php\n${ line }\n`, 'plant.php' );
			expect( result.hooks ).toEqual( [] );
			expect( result.problems ).toHaveLength( 1 );
			expect( result.problems[ 0 ] ).toMatch( /^plant\.php:2 / );
		} );

		test( 'reports an unterminated string, which would hide the rest of the file', () => {
			const result = scanPhp(
				"<?php\ndo_action( 'typost_x );\ndo_action( 'typost_hidden' );\n",
				'plant.php'
			);
			// The quote on line 2 closes on line 3, and line 3's last quote
			// opens a string that never closes.
			expect( result.hooks ).toEqual( [] );
			expect( result.problems ).toEqual(
				expect.arrayContaining( [ 'plant.php:3 has an unterminated string' ] )
			);
		} );

		test( 'reads hook functions in any letter case, as PHP does', () => {
			const result = scanPhp(
				[
					'<?php',
					"DO_ACTION( 'typost_upper_action' );",
					"\\Apply_Filters( 'typost_mixed_filter', 1 );",
					"Do_Action_Ref_Array( 'typost_mixed_ref', array() );",
				].join( '\n' ),
				'plant.php'
			);
			expect( result.problems ).toEqual( [] );
			expect( result.hooks ).toEqual( [
				{ name: 'typost_upper_action', kind: 'action', at: 'plant.php:2' },
				{ name: 'typost_mixed_filter', kind: 'filter', at: 'plant.php:3' },
				{ name: 'typost_mixed_ref', kind: 'action', at: 'plant.php:4' },
			] );
		} );

		test( 'reports a hook function passed by name in another letter case', () => {
			const result = scanPhp( "<?php\ncall_user_func( 'DO_ACTION', 'typost_x' );\n", 'plant.php' );
			expect( result.problems ).toEqual( [
				expect.stringMatching( /^plant\.php:2 passes the hook function 'DO_ACTION' by name/ ),
			] );
		} );

		test( 'reports a typostHooks call in inline HTML', () => {
			const result = scanPhp(
				[
					'<script>window.typostHooks.applyFilters( "typost_before_php", 1 );</script>',
					'<?php $a = 1; ?>',
					'<script>',
					"window.typostHooks.doAction( 'typost_in_inline_html' );",
					'</script>',
					'<?php $b = 2;',
				].join( '\n' ),
				'plant.php'
			);
			expect( result.hooks ).toEqual( [] );
			expect( result.problems ).toEqual( [
				expect.stringMatching( /^plant\.php:1 holds a typostHooks call in inline HTML/ ),
				expect.stringMatching( /^plant\.php:4 holds a typostHooks call in inline HTML/ ),
			] );
		} );

		test( 'reports a short open tag', () => {
			const result = scanPhp( "<? do_action( 'typost_x' );", 'plant.php' );
			expect( result.problems ).toEqual( [
				expect.stringMatching( /^plant\.php:1 opens PHP with a short open tag/ ),
			] );
		} );
	} );

	describe( 'JavaScript', () => {
		const wrappers = [
			{ component: 'HookPoint', prop: 'hook', kind: 'action', file: 'plant.js' },
		];

		test( 'finds literal, multi-line, template, optional and wrapper names', () => {
			const result = scanJs(
				[
					"window.typostHooks.doAction( 'typost_planted_action', el );",
					'const v = window.typostHooks',
					'	? window.typostHooks.applyFilters(',
					"		'typost_planted_filter',",
					'		1',
					'	)',
					'	: 1;',
					'typostHooks?.doAction( `typost_tpl_${ id }` );',
					"window.typostHooks[ 'applyFilters' ]( 'typost_' + 'joined', 1 );",
					"if ( window.typostHooks && window.typostHooks.doAction ) { window.typostHooks.doAction( 'typost_checked' ); }",
					'function HookPoint( { hook, state } ) {',
					'	return <div ref={ ( el ) => window.typostHooks.doAction( hook, el, state ) } />;',
					'}',
					'const a = <HookPoint hook="typost_point_a" />;',
					"const b = <HookPoint hook={ 'typost_point_b' } state={ s } />;",
					'module.exports = { HookPoint: HookPoint };',
				].join( '\n' ),
				'plant.js',
				wrappers
			);
			expect( result.problems ).toEqual( [] );
			expect( names( result ) ).toEqual( [
				'typost_checked',
				'typost_joined',
				'typost_planted_action',
				'typost_planted_filter',
				'typost_point_a',
				'typost_point_b',
				'typost_tpl_{*}',
			] );
			expect( result.wrappersSeen ).toEqual( new Set( [ 'HookPoint' ] ) );
			expect( result.hooks.find( ( h ) => h.name === 'typost_planted_filter' ).at ).toBe( 'plant.js:3' );
		} );

		test( 'does not read comments or strings', () => {
			const result = scanJs(
				[
					"// window.typostHooks.doAction( 'typost_in_comment' );",
					'/**',
					" * window.typostHooks.applyFilters( 'typost_in_docblock', 1 );",
					' */',
					"const s = \"window.typostHooks.doAction( 'typost_in_string' )\";",
					"const t = `typostHooks.doAction( 'typost_in_template' )`;",
					'const u = <p>typostHooks.doAction( "typost_in_jsx_text" )</p>;',
				].join( '\n' ),
				'plant.js',
				wrappers
			);
			expect( result.problems ).toEqual( [] );
			expect( result.hooks ).toEqual( [] );
		} );

		test.each( [
			[ 'a variable', 'window.typostHooks.doAction( name, el );' ],
			[ 'a run-time start', 'window.typostHooks.doAction( `${ p }_x` );' ],
			[ 'another registry', "wp.hooks.doAction( 'typost_x' );" ],
			[ 'an alias', "const hooks = window.typostHooks; hooks.doAction( 'typost_x' );" ],
			[ 'a destructured method', "const { doAction } = window.typostHooks;" ],
			[ 'a bare call', "applyFilters( 'typost_x', 1 );" ],
			[ '.call()', "window.typostHooks.doAction.call( null, 'typost_x' );" ],
			[ 'a method passed on', 'run( window.typostHooks.applyFilters );' ],
			[ 'a wrapper with a run-time prop', 'const a = <HookPoint hook={ name } />;' ],
			[ 'a wrapper with spread props', 'const a = <HookPoint { ...props } />;' ],
			[ 'a wrapper called as a function', "const a = HookPoint( { hook: 'typost_x' } );" ],
			[ 'a wrapper in createElement', "const a = el( HookPoint, { hook: 'typost_x' } );" ],
			[ 'a file that does not parse', "window.typostHooks.doAction( 'typost_x' " ],
		] )( 'reports %s as unreadable', ( label, code ) => {
			const result = scanJs( code, 'other.js', wrappers );
			expect( result.problems ).toHaveLength( 1 );
			expect( result.problems[ 0 ] ).toMatch( /^other\.js/ );
		} );

		test( 'reports a variable name outside the wrapper', () => {
			const result = scanJs(
				'function Other( { hook } ) { window.typostHooks.doAction( hook ); }',
				'plant.js',
				wrappers
			);
			expect( result.problems ).toEqual( [
				expect.stringMatching( /^plant\.js:1 calls typostHooks\.doAction\(\) with a hook name the test cannot read/ ),
			] );
		} );
	} );

	describe( 'HOOKS.md', () => {
		const markdown = [
			'# Title',
			'#### `typost_outside_sections`',
			'## PHP Hooks',
			'### PHP Actions',
			'#### `typost_action_heading`',
			'#### `typost_tab_after_{tab_id}`',
			'Fired with `typost_in_prose` too.',
			'- `typost_in_list`',
			'### PHP Filters',
			'#### `typost_filter_heading` (Filter)',
			'```php',
			"#### `typost_in_fence`",
			"add_filter( 'typost_in_fence_call', 'x' );",
			'```',
			'## JavaScript Hooks',
			'| Hook Name | Location |',
			'|---|---|',
			'| `typost_table_row` | Somewhere |',
			'**`typost_bold_lead`** (*since 2.3.0*, `typostHooks` action).',
			'Text **`typost_bold_inside`** later.',
			'#### `typost:font-saved`',
			'**`typost-some-event`** (CustomEvent).',
			'#### `typost_Bad-Name`',
			'## Export Sections',
			'| `typost_other_table` | x |',
		].join( '\n' );

		test( 'counts headings, first table cells and bold leads in the two sections', () => {
			const doc = collectDocumentedHooks( markdown );
			expect( doc.entries.map( ( e ) => [ e.name, e.section, e.kind, e.line ] ) ).toEqual( [
				[ 'typost_action_heading', 'php', 'action', 5 ],
				[ 'typost_tab_after_{tab_id}', 'php', 'action', 6 ],
				[ 'typost_filter_heading', 'php', 'filter', 10 ],
				[ 'typost_table_row', 'js', null, 18 ],
				[ 'typost_bold_lead', 'js', null, 19 ],
			] );
			expect( doc.problems ).toEqual( [
				expect.stringMatching( /^HOOKS\.md:23 has the entry `typost_Bad-Name`/ ),
			] );
		} );

		test( 'rejects a pattern entry with no literal part after typost_', () => {
			const doc = collectDocumentedHooks(
				[
					'## PHP Hooks',
					'### PHP Actions',
					'#### `typost_{anything}`',
					'#### `typost_{tab}_after`',
					'#### `typost_admin_tab_after_{tab_id}`',
					'#### `typost_admin_tab_content_{tab_id}`',
				].join( '\n' )
			);
			expect( doc.entries.map( ( e ) => e.name ) ).toEqual( [
				'typost_admin_tab_after_{tab_id}',
				'typost_admin_tab_content_{tab_id}',
			] );
			expect( doc.problems ).toEqual( [
				expect.stringMatching( /^HOOKS\.md:3 has the entry `typost_\{anything\}`/ ),
				expect.stringMatching( /^HOOKS\.md:4 has the entry `typost_\{tab\}_after`/ ),
			] );
		} );
	} );

	describe( 'comparison', () => {
		const doc = ( name, kind = null ) => ( {
			name,
			canonical: name.replace( /\{[a-z0-9_]+\}/g, '{*}' ),
			section: kind ? 'php' : 'js',
			kind,
			line: 1,
		} );
		const code = ( name, kind = 'action' ) => ( { name, kind, at: 'x.php:1' } );

		test( 'reports a hook missing from HOOKS.md and an entry missing from the code', () => {
			const result = compareHooks(
				[ code( 'typost_both' ), code( 'typost_only_code' ) ],
				[ doc( 'typost_both', 'action' ), doc( 'typost_only_doc', 'action' ) ]
			);
			expect( result.missingFromDoc ).toEqual( [ 'typost_only_code (x.php:1) is not in HOOKS.md' ] );
			expect( result.missingFromCode ).toEqual( [
				'typost_only_doc (HOOKS.md:1) is not fired anywhere in the code',
			] );
			expect( result.wrongKind ).toEqual( [] );
		} );

		test( 'a pattern entry documents the literal names and the pattern that fit it', () => {
			const result = compareHooks(
				[
					code( 'typost_tab_after_fonts' ),
					code( 'typost_tab_after_help' ),
					code( 'typost_tab_content_{*}' ),
				],
				[
					doc( 'typost_tab_after_{tab_id}', 'action' ),
					doc( 'typost_tab_content_{tab_id}', 'action' ),
				]
			);
			expect( result ).toEqual( { missingFromDoc: [], missingFromCode: [], wrongKind: [] } );
		} );

		test( 'a pattern entry does not document names with another start', () => {
			const result = compareHooks(
				[ code( 'typost_tab_before_fonts' ), code( 'typost_tab_after_' ) ],
				[ doc( 'typost_tab_after_{tab_id}', 'action' ) ]
			);
			expect( result.missingFromDoc ).toEqual( [
				'typost_tab_before_fonts (x.php:1) is not in HOOKS.md',
				'typost_tab_after_ (x.php:1) is not in HOOKS.md',
			] );
			expect( result.missingFromCode ).toEqual( [
				'typost_tab_after_{tab_id} (HOOKS.md:1) is not fired anywhere in the code',
			] );
		} );

		test( 'a code pattern needs a pattern entry, not one literal entry', () => {
			const result = compareHooks(
				[ code( 'typost_tab_content_{*}' ) ],
				[ doc( 'typost_tab_content_glyphs', 'action' ) ]
			);
			expect( result.missingFromDoc ).toEqual( [
				'typost_tab_content_{*} (x.php:1) is not in HOOKS.md',
			] );
			expect( result.missingFromCode ).toEqual( [] );
		} );

		test( 'reports a PHP filter listed under the actions', () => {
			const result = compareHooks(
				[ code( 'typost_value', 'filter' ) ],
				[ doc( 'typost_value', 'action' ) ]
			);
			expect( result.wrongKind ).toEqual( [
				'typost_value is fired as a filter (x.php:1) but HOOKS.md lists it under the actions (line 1)',
			] );
		} );
	} );

	describe( 'a planted repository', () => {
		let root;
		const write = ( rel, text ) => {
			const abs = path.join( root, ...rel.split( '/' ) );
			fs.mkdirSync( path.dirname( abs ), { recursive: true } );
			fs.writeFileSync( abs, text );
		};

		beforeAll( () => {
			root = fs.mkdtempSync( path.join( os.tmpdir(), 'typost-hooks-doc-' ) );
			write( '.distignore', '/tests\n/vendor\n/node_modules\n__tests__\n/HOOKS.md\n' );
			write( 'plugin.php', "<?php\ndo_action( 'typost_planted_action' );\napply_filters( 'typost_planted_filter', 1 );\n" );
			write( 'includes/new-file.php', "<?php\ndo_action( \"typost_tab_{$id}\" );\n" );
			write( 'assets/js/editor.js', "window.typostHooks.applyFilters( 'typost_js_filter', 1 );\n" );
			write( 'assets/js/point.js', [
				'function HookPoint( { hook } ) { window.typostHooks.doAction( hook ); }',
				'const a = <HookPoint hook="typost_js_point" />;',
			].join( '\n' ) );
			// Not scanned: tests, vendor, node_modules, __tests__, bundles, libraries.
			const outside = "do_action( 'typost_outside' );\nwindow.typostHooks.doAction( 'typost_outside' );\n";
			write( 'tests/a.php', `<?php\n${ outside }` );
			write( 'vendor/b.php', `<?php\n${ outside }` );
			write( 'node_modules/c/index.js', "window.typostHooks.doAction( 'typost_outside' );\n" );
			write( 'assets/js/__tests__/d.test.js', "window.typostHooks.doAction( 'typost_outside' );\n" );
			write( 'assets/js/editor.min.js', "window.typostHooks.doAction( 'typost_outside' );\n" );
			write( 'blocks/b/build/index.js', "window.typostHooks.doAction( 'typost_outside' );\n" );
			write( 'lib/vendor/x.js', "window.typostHooks.doAction( 'typost_outside' );\n" );
			write( 'HOOKS.md', [
				'## PHP Hooks',
				'### PHP Actions',
				'#### `typost_planted_action`',
				'#### `typost_tab_{tab_id}`',
				'### PHP Filters',
				'#### `typost_documented_only`',
				'## JavaScript Hooks',
				'| `typost_js_filter` | x |',
				'```js',
				'#### `typost_js_point`',
				'```',
				'Prose about `typost_js_point`.',
			].join( '\n' ) );
		} );

		afterAll( () => {
			fs.rmSync( root, { recursive: true, force: true } );
		} );

		test( 'scans a new file, skips what does not ship, and reports both directions', () => {
			const wrappers = [
				{ component: 'HookPoint', prop: 'hook', kind: 'action', file: 'assets/js/point.js' },
			];
			const result = scanRepository( root, { wrappers } );
			expect( result.phpFiles ).toEqual( [ 'includes/new-file.php', 'plugin.php' ] );
			expect( result.jsFiles ).toEqual( [ 'assets/js/editor.js', 'assets/js/point.js' ] );
			expect( result.problems ).toEqual( [] );
			expect( distinct( result.phpHooks ) ).toEqual( [
				'typost_planted_action',
				'typost_planted_filter',
				'typost_tab_{*}',
			] );
			expect( distinct( result.jsHooks ) ).toEqual( [ 'typost_js_filter', 'typost_js_point' ] );
			expect( result.php.missingFromDoc ).toEqual( [
				'typost_planted_filter (plugin.php:3) is not in HOOKS.md',
			] );
			expect( result.php.missingFromCode ).toEqual( [
				'typost_documented_only (HOOKS.md:6) is not fired anywhere in the code',
			] );
			expect( result.js.missingFromDoc ).toEqual( [
				'typost_js_point (assets/js/point.js:2) is not in HOOKS.md',
			] );
			expect( result.js.missingFromCode ).toEqual( [] );
		} );

		test( 'reports a wrapper that is listed but not found', () => {
			const result = scanRepository( root, {
				wrappers: [ { component: 'Gone', prop: 'hook', kind: 'action', file: 'assets/js/gone.js' } ],
			} );
			expect( result.problems ).toEqual( [
				// HookPoint is no longer a known wrapper, so its call is unreadable.
				expect.stringMatching( /^assets\/js\/point\.js:1 calls typostHooks\.doAction\(\) with a hook name the test cannot read/ ),
				expect.stringMatching( /^JS_HOOK_WRAPPERS lists Gone in assets\/js\/gone\.js/ ),
			] );
		} );

		test( 'does not follow a broken link that does not ship', () => {
			// A link .distignore excludes, like this repository's vendor and
			// node_modules links in a worktree.
			const link = path.join( root, 'lib', '__tests__' );
			fs.symlinkSync( path.join( root, 'no-such-folder' ), link, 'junction' );
			try {
				const result = scanRepository( root, { wrappers: [] } );
				expect( result.phpFiles ).toEqual( [ 'includes/new-file.php', 'plugin.php' ] );
			} finally {
				fs.unlinkSync( link );
			}
		} );

		test( 'reports a broken link in a folder that ships', () => {
			const link = path.join( root, 'includes', 'broken-link' );
			fs.symlinkSync( path.join( root, 'no-such-folder' ), link, 'junction' );
			try {
				const result = scanRepository( root, { wrappers: [] } );
				expect( result.problems ).toEqual(
					expect.arrayContaining( [
						expect.stringMatching( /^includes\/broken-link is a link whose target cannot be read/ ),
					] )
				);
			} finally {
				fs.unlinkSync( link );
			}
		} );

		test( 'fails when HOOKS.md is missing', () => {
			fs.renameSync( path.join( root, 'HOOKS.md' ), path.join( root, 'HOOKS.off' ) );
			try {
				expect( () => scanRepository( root ) ).toThrow( /HOOKS\.md is missing/ );
			} finally {
				fs.renameSync( path.join( root, 'HOOKS.off' ), path.join( root, 'HOOKS.md' ) );
			}
		} );
	} );
} );

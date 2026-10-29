/**
 * Export & Import tab in the DOM (#205): the export form, the import
 * preview and the result, against markup that mirrors
 * includes/admin-export-tab.php (a parity test below holds the two
 * together) and a mocked REST layer.
 *
 * jQuery is not installed in node_modules; the script uses only $(fn) and
 * $.ajax, so a stand-in with a controllable deferred is enough.
 */

const fs = require( 'fs' );
const path = require( 'path' );

const FIXTURE = `
<div id="typost-live-region" role="status" aria-live="polite"></div>
<form id="typost-export-form" novalidate>
	<fieldset class="typost-export-sections">
		<div class="typost-export-section" data-section="paragraphStyles">
			<p><input type="checkbox" id="typost-export-section-paragraphStyles" class="typost-export-section-toggle" value="paragraphStyles" checked /></p>
			<fieldset class="typost-export-items">
				<p class="typost-export-scope">
					<input type="radio" id="typost-export-section-paragraphStyles-all" name="typost-export-section-paragraphStyles-scope" value="all" checked />
					<input type="radio" id="typost-export-section-paragraphStyles-some" name="typost-export-section-paragraphStyles-scope" value="some" />
				</p>
				<ul class="typost-export-item-list" id="typost-export-section-paragraphStyles-list" hidden>
					<li><input type="checkbox" id="typost-export-section-paragraphStyles-item-1" class="typost-export-item" value="1" data-parent="0" data-name="Body" /></li>
					<li><input type="checkbox" id="typost-export-section-paragraphStyles-item-2" class="typost-export-item" value="2" data-parent="1" data-name="Body – First" /></li>
					<li><input type="checkbox" id="typost-export-section-paragraphStyles-item-3" class="typost-export-item" value="3" data-parent="0" data-name="Kicker" /></li>
				</ul>
			</fieldset>
		</div>
		<p><input type="checkbox" id="typost-export-all-fonts" /></p>
	</fieldset>
	<div id="typost-export-notes" role="status" aria-live="polite"></div>
	<div id="typost-export-error" role="alert"></div>
	<p><button type="submit" class="button button-primary" id="typost-export-submit">Download export file</button></p>
</form>
<form id="typost-import-form" novalidate>
	<input type="file" id="typost-import-file" />
	<button type="submit" class="button" id="typost-import-preview-submit">Preview import</button>
	<div id="typost-import-error" role="alert"></div>
</form>
<div id="typost-import-preview" hidden></div>
<div id="typost-import-result" hidden></div>
`;

// The real strings, read from Typost_Export::script_strings().
const PHP = fs.readFileSync( path.resolve( __dirname, '../../../includes/class-typost-export.php' ), 'utf8' );
const STRINGS = {};
PHP.slice( PHP.indexOf( 'function script_strings()' ) ).replace( /'(\w+)'\s*=>\s*__\('((?:[^'\\]|\\.)*)', 'typography-stylist'\)/g, ( m, key, text ) => {
	STRINGS[ key ] = text.replace( /\\'/g, "'" );
	return m;
} );

const PREVIEW = {
	version: 1,
	plugin: '2.3.5',
	exported: '2026-10-28',
	fonts: [
		{ key: 'f1', name: 'Inter', family: 'Inter', source: 'kit', status: 'ambiguous', candidates: [ { value: 'id:1', label: 'Inter A' }, { value: 'id:2', label: 'Inter B' } ], choice: { action: 'map', target: '' }, usedBy: [ 'Body' ], sections: [ 'paragraphStyles' ] },
		{ key: 'f2', name: 'Gone', family: 'Gone', source: 'kit', status: 'not_found', candidates: [], choice: { action: 'none' }, usedBy: [], sections: [] },
	],
	sections: {
		paragraphStyles: {
			label: 'Paragraph styles',
			preview: {
				items: [
					{ key: 's1', name: 'Body', basedOn: '', exists: false, existingName: '', action: 'add', suggestedName: 'Body', affected: [] },
					{ key: 's2', name: 'Kicker', basedOn: '', exists: true, existingName: 'Kicker', action: 'skip', suggestedName: 'Kicker (2)', affected: [ 'Kicker Small' ] },
				],
				warnings: [ 'Check “Body”.' ],
			},
		},
	},
	unknownSections: [ 'layeredFonts' ],
	siteFonts: [ { value: 'id:1', label: 'Inter A' }, { value: 'id:2', label: 'Inter B' }, { value: 'id:9', label: 'Lora' } ],
};

function deferred() {
	const callbacks = { done: [], fail: [], always: [] };
	const d = {
		done( fn ) {
			callbacks.done.push( fn );
			return d;
		},
		fail( fn ) {
			callbacks.fail.push( fn );
			return d;
		},
		always( fn ) {
			callbacks.always.push( fn );
			return d;
		},
		resolve( value ) {
			callbacks.done.forEach( ( fn ) => fn( value ) );
			callbacks.always.forEach( ( fn ) => fn() );
		},
		reject( xhr ) {
			callbacks.fail.forEach( ( fn ) => fn( xhr ) );
			callbacks.always.forEach( ( fn ) => fn() );
		},
	};
	return d;
}

let requests;

function setup() {
	document.body.innerHTML = FIXTURE;
	requests = [];
	const $ = ( fn ) => fn();
	$.ajax = jest.fn( ( options ) => {
		const d = deferred();
		requests.push( { options, body: JSON.parse( options.data ), deferred: d } );
		return d;
	} );
	window.jQuery = $;
	window.typostExportData = { restUrl: 'https://example.test/wp-json/typost/v1/', nonce: 'n' };
	window.typostExportL10n = STRINGS;
	global.typostWithUserLocale = ( url ) => url + '?_locale=user';
	global.typostDecodeEntities = ( text ) => text;
	global.typostBeginBusy = jest.fn( () => true );
	global.typostEndBusy = jest.fn();
	jest.isolateModules( () => {
		require( '../admin-export' );
	} );
}

function setFile( text ) {
	const input = document.getElementById( 'typost-import-file' );
	const file = new File( [ text ], 'styles.json', { type: 'application/json' } );
	Object.defineProperty( input, 'files', { value: [ file ], configurable: true } );
}

function submit( id ) {
	document.getElementById( id ).dispatchEvent( new Event( 'submit', { cancelable: true } ) );
}

function change( node, value ) {
	if ( typeof value === 'boolean' ) {
		node.checked = value;
	} else {
		node.value = value;
	}
	node.dispatchEvent( new Event( 'change', { bubbles: true } ) );
}

async function waitFor( check ) {
	for ( let i = 0; i < 50; i++ ) {
		if ( check() ) {
			return;
		}
		await new Promise( ( resolve ) => setTimeout( resolve, 5 ) );
	}
	throw new Error( 'Timed out' );
}

beforeEach( setup );

describe( 'export form', () => {
	it( 'shows the style list and says which parents are added', () => {
		change( document.getElementById( 'typost-export-section-paragraphStyles-some' ), true );
		expect( document.getElementById( 'typost-export-section-paragraphStyles-list' ).hidden ).toBe( false );

		change( document.getElementById( 'typost-export-section-paragraphStyles-item-2' ), true );
		expect( document.getElementById( 'typost-export-notes' ).textContent ).toBe( '“Body” is added too, because “Body – First” is based on it.' );

		change( document.getElementById( 'typost-export-section-paragraphStyles-item-1' ), true );
		expect( document.getElementById( 'typost-export-notes' ).textContent ).toBe( '' );
	} );

	it( 'sends the chosen sections and items, then downloads the file', () => {
		const click = jest.spyOn( HTMLAnchorElement.prototype, 'click' ).mockImplementation( () => {} );
		URL.createObjectURL = jest.fn( () => 'blob:x' );
		URL.revokeObjectURL = jest.fn();

		change( document.getElementById( 'typost-export-section-paragraphStyles-some' ), true );
		change( document.getElementById( 'typost-export-section-paragraphStyles-item-3' ), true );
		change( document.getElementById( 'typost-export-all-fonts' ), true );
		submit( 'typost-export-form' );

		expect( requests ).toHaveLength( 1 );
		expect( requests[ 0 ].options.url ).toBe( 'https://example.test/wp-json/typost/v1/export?_locale=user' );
		expect( requests[ 0 ].body ).toEqual( { sections: [ 'paragraphStyles' ], allFonts: true, sectionArgs: { paragraphStyles: { items: [ 3 ] } } } );

		requests[ 0 ].deferred.resolve( { file: { format: 'typost-export' }, filename: 'typography-site.json' } );
		expect( click ).toHaveBeenCalledTimes( 1 );
		expect( click.mock.instances[ 0 ].getAttribute( 'download' ) ).toBe( 'typography-site.json' );
		expect( typostEndBusy ).toHaveBeenCalled();
		click.mockRestore();
	} );

	it( 'asks for a choice instead of sending an empty export', () => {
		change( document.getElementById( 'typost-export-section-paragraphStyles' ), false );
		submit( 'typost-export-form' );
		expect( requests ).toHaveLength( 0 );
		expect( document.getElementById( 'typost-export-error' ).textContent ).toBe( 'Choose what to export.' );

		change( document.getElementById( 'typost-export-section-paragraphStyles' ), true );
		change( document.getElementById( 'typost-export-section-paragraphStyles-some' ), true );
		submit( 'typost-export-form' );
		expect( requests ).toHaveLength( 0 );
		expect( document.getElementById( 'typost-export-error' ).textContent ).toBe( 'Choose at least one item, or choose “All”.' );
	} );

	it( 'shows the server message when the export fails', () => {
		submit( 'typost-export-form' );
		requests[ 0 ].deferred.reject( { responseJSON: { message: 'You are not allowed to export fonts.' } } );
		expect( document.getElementById( 'typost-export-error' ).textContent ).toBe( 'You are not allowed to export fonts.' );
	} );
} );

describe( 'import', () => {
	async function preview() {
		setFile( '{"format":"typost-export"}' );
		submit( 'typost-import-form' );
		await waitFor( () => requests.length === 1 );
		expect( requests[ 0 ].body ).toEqual( { fileText: '{"format":"typost-export"}' } );
		requests[ 0 ].deferred.resolve( PREVIEW );
	}

	it( 'asks for a file first', () => {
		submit( 'typost-import-form' );
		const input = document.getElementById( 'typost-import-file' );
		expect( requests ).toHaveLength( 0 );
		expect( input.getAttribute( 'aria-invalid' ) ).toBe( 'true' );
		expect( document.activeElement ).toBe( input );
		expect( document.getElementById( 'typost-import-error' ).textContent ).toBe( 'Choose an export file to import.' );
	} );

	it( 'renders the preview and moves focus to it', async () => {
		await preview();
		const container = document.getElementById( 'typost-import-preview' );
		expect( container.hidden ).toBe( false );
		expect( document.activeElement.tagName ).toBe( 'H3' );
		expect( container.textContent ).toContain( 'Exported on 2026-10-28 by Typography Stylist 2.3.5.' );
		expect( container.textContent ).toContain( 'layeredFonts' );
		expect( container.textContent ).toContain( 'Check “Body”.' );

		const font = document.getElementById( 'typost-import-font-f1' );
		expect( font.value ).toBe( '' );
		expect( font.getAttribute( 'aria-label' ) ).toBe( 'Font on this site for “Inter”' );
		expect( document.getElementById( 'typost-import-font-f2' ).value ).toBe( 'none' );

		const kicker = document.getElementById( 'typost-import-style-s2' );
		expect( Array.from( kicker.options ).map( ( o ) => o.value ) ).toEqual( [ 'skip', 'rename', 'overwrite' ] );
		expect( kicker.value ).toBe( 'skip' );
		expect( document.getElementById( kicker.getAttribute( 'aria-describedby' ) ).textContent ).toContain( 'Kicker Small' );

		const rename = document.getElementById( 'typost-import-rename-s2' );
		expect( rename.hidden ).toBe( true );
		change( kicker, 'rename' );
		expect( rename.hidden ).toBe( false );
		expect( rename.value ).toBe( 'Kicker (2)' );
	} );

	it( 'marks an unchosen font and does not send the import', async () => {
		await preview();
		const container = document.getElementById( 'typost-import-preview' );
		container.querySelector( '.button-primary' ).click();

		expect( requests ).toHaveLength( 1 );
		const font = document.getElementById( 'typost-import-font-f1' );
		expect( font.getAttribute( 'aria-invalid' ) ).toBe( 'true' );
		expect( document.activeElement ).toBe( font );
		expect( document.getElementById( 'typost-import-run-error' ).textContent ).toBe( 'Choose a font on this site for “Inter”.' );
	} );

	it( 'sends the choices and shows the result', async () => {
		await preview();
		change( document.getElementById( 'typost-import-font-f1' ), 'map:id:2' );
		change( document.getElementById( 'typost-import-style-s2' ), 'rename' );
		document.getElementById( 'typost-import-preview' ).querySelector( '.button-primary' ).click();

		expect( requests ).toHaveLength( 2 );
		expect( requests[ 1 ].options.url ).toBe( 'https://example.test/wp-json/typost/v1/import?_locale=user' );
		expect( requests[ 1 ].body ).toEqual( {
			fileText: '{"format":"typost-export"}',
			choices: {
				fonts: { f1: { action: 'map', target: 'id:2' }, f2: { action: 'none' } },
				sections: { paragraphStyles: { s1: { action: 'add' }, s2: { action: 'rename', name: 'Kicker (2)' } } },
				include: [ 'paragraphStyles' ],
			},
		} );

		requests[ 1 ].deferred.resolve( {
			fonts: { added: [], notFound: [ 'Gone' ] },
			sections: { paragraphStyles: { added: [ 'Body' ], renamed: [ { from: 'Kicker', to: 'Kicker (2)' } ], overwritten: [], skipped: [], warnings: [] } },
			notImported: [],
		} );
		const result = document.getElementById( 'typost-import-result' );
		expect( result.hidden ).toBe( false );
		expect( document.getElementById( 'typost-import-preview' ).hidden ).toBe( true );
		expect( document.activeElement.textContent ).toBe( 'Import finished' );
		expect( Array.from( result.querySelectorAll( 'h4' ) ).map( ( h ) => h.textContent ) ).toEqual( [ 'Added', 'Added with a new name', 'Fonts not found (the styles use the theme font)' ] );
		expect( result.textContent ).toContain( '“Kicker” as “Kicker (2)”' );
	} );

	it( 'keeps the preview and shows the server message when the import fails', async () => {
		await preview();
		change( document.getElementById( 'typost-import-font-f1' ), 'map:id:1' );
		const button = document.getElementById( 'typost-import-preview' ).querySelector( '.button-primary' );
		button.click();
		requests[ 1 ].deferred.reject( { responseJSON: { message: '“Kicker”: Nothing was saved.' } } );

		expect( document.getElementById( 'typost-import-preview' ).hidden ).toBe( false );
		expect( document.getElementById( 'typost-import-run-error' ).textContent ).toBe( '“Kicker”: Nothing was saved.' );
		expect( document.activeElement ).toBe( button );
	} );

	it( 'a font that only left-out parts use needs no choice and is not sent', async () => {
		await preview();
		change( document.getElementById( 'typost-import-include-paragraphStyles' ), false );
		const font = document.getElementById( 'typost-import-font-f1' );
		expect( font.disabled ).toBe( true );
		// A font no part uses still imports as chosen.
		expect( document.getElementById( 'typost-import-font-f2' ).disabled ).toBe( false );

		document.getElementById( 'typost-import-preview' ).querySelector( '.button-primary' ).click();
		expect( requests ).toHaveLength( 2 );
		expect( requests[ 1 ].body.choices.fonts ).toEqual( { f2: { action: 'none' } } );
		expect( requests[ 1 ].body.choices.include ).toEqual( [] );

		change( document.getElementById( 'typost-import-include-paragraphStyles' ), true );
		expect( font.disabled ).toBe( false );
	} );

	it( 'cancel waits while an import runs', async () => {
		await preview();
		change( document.getElementById( 'typost-import-font-f1' ), 'map:id:1' );
		const buttons = document.getElementById( 'typost-import-preview' ).querySelectorAll( '.typost-import-actions button' );
		buttons[ 0 ].click();
		expect( buttons[ 1 ].disabled ).toBe( true );

		requests[ 1 ].deferred.reject( { responseJSON: { message: 'No.' } } );
		expect( buttons[ 1 ].disabled ).toBe( false );
	} );

	it( 'a failed preview removes the previous file’s preview', async () => {
		await preview();
		setFile( 'not json' );
		submit( 'typost-import-form' );
		await waitFor( () => requests.length === 2 );
		requests[ 1 ].deferred.reject( { responseJSON: { message: 'This file is not valid JSON, so it cannot be imported. Nothing was saved.' } } );

		const container = document.getElementById( 'typost-import-preview' );
		expect( container.hidden ).toBe( true );
		expect( container.querySelector( 'button' ) ).toBeNull();
		expect( document.getElementById( 'typost-import-error' ).textContent ).toContain( 'not valid JSON' );
	} );

	it( 'cancel closes the preview and returns to the file field', async () => {
		await preview();
		const buttons = document.getElementById( 'typost-import-preview' ).querySelectorAll( '.typost-import-actions button' );
		buttons[ 1 ].click();
		expect( document.getElementById( 'typost-import-preview' ).hidden ).toBe( true );
		expect( document.activeElement ).toBe( document.getElementById( 'typost-import-file' ) );
	} );
} );

describe( 'import of sections in the generic row form', () => {
	const ROWS_PREVIEW = {
		version: 1,
		plugin: '2.3.5',
		exported: '2026-10-29',
		fonts: [ { key: 'f1', name: 'Inter', family: 'Inter', source: 'kit', status: 'found', candidates: [ { value: 'id:1', label: 'Inter A' } ], choice: { action: 'map', target: 'id:1' }, usedBy: [ 'Feature Visibility' ], sections: [ 'featureVisibility' ] } ],
		sections: {
			featureVisibility: {
				label: 'Feature Visibility',
				preview: { rows: [ { key: 'f1', name: 'Inter', note: 'Check the font.', current: 'ornm', incoming: 'ss15', choices: [ { value: 'apply', label: 'Use the settings in the file' }, { value: 'keep', label: 'Keep the settings on this site' } ], choice: 'keep' } ] },
			},
			options: {
				label: 'Options',
				preview: {
					rows: [ { key: 'typost_new_font_sizes_px', name: 'Write new font sizes in px', current: 'Off', incoming: 'On', choices: [ { value: 'keep', label: 'Keep the value on this site' }, { value: 'apply', label: 'Use the value in the file' } ], choice: '' } ],
					notes: [ '3 other options have the same value on this site.' ],
				},
			},
		},
		unknownSections: [],
		siteFonts: [ { value: 'id:1', label: 'Inter A' } ],
	};

	async function preview() {
		setFile( '{}' );
		submit( 'typost-import-form' );
		await waitFor( () => requests.length === 1 );
		requests[ 0 ].deferred.resolve( ROWS_PREVIEW );
	}

	it( 'shows each row with both values and its choices', async () => {
		await preview();
		const container = document.getElementById( 'typost-import-preview' );
		expect( container.textContent ).toContain( '3 other options have the same value on this site.' );

		const option = document.getElementById( 'typost-import-row-options-typost_new_font_sizes_px' );
		expect( option.value ).toBe( '' );
		expect( Array.from( option.options ).map( ( o ) => o.textContent ) ).toEqual( [ 'Choose…', 'Keep the value on this site', 'Use the value in the file' ] );
		expect( option.getAttribute( 'aria-label' ) ).toBe( 'What to do with “Write new font sizes in px”' );
		const cells = Array.from( option.closest( 'tr' ).children ).map( ( c ) => c.textContent );
		expect( cells.slice( 1, 3 ) ).toEqual( [ 'Off', 'On' ] );

		const font = document.getElementById( 'typost-import-row-featureVisibility-f1' );
		expect( font.value ).toBe( 'keep' );
		expect( Array.from( font.options ).map( ( o ) => o.value ) ).toEqual( [ 'apply', 'keep' ] );
		expect( document.getElementById( font.getAttribute( 'aria-describedby' ) ).textContent ).toBe( 'Check the font.' );
	} );

	it( 'marks an option with no choice and does not send the import', async () => {
		await preview();
		document.getElementById( 'typost-import-preview' ).querySelector( '.button-primary' ).click();

		expect( requests ).toHaveLength( 1 );
		const option = document.getElementById( 'typost-import-row-options-typost_new_font_sizes_px' );
		expect( option.getAttribute( 'aria-invalid' ) ).toBe( 'true' );
		expect( document.activeElement ).toBe( option );
		expect( document.getElementById( 'typost-import-run-error' ).textContent ).toBe( 'Choose what to do with “Write new font sizes in px”.' );
	} );

	it( 'sends the answers and shows the groups the server names', async () => {
		await preview();
		change( document.getElementById( 'typost-import-row-options-typost_new_font_sizes_px' ), 'apply' );
		document.getElementById( 'typost-import-preview' ).querySelector( '.button-primary' ).click();

		expect( requests ).toHaveLength( 2 );
		expect( requests[ 1 ].body.choices.sections ).toEqual( {
			featureVisibility: { f1: 'keep' },
			options: { typost_new_font_sizes_px: 'apply' },
		} );

		requests[ 1 ].deferred.resolve( {
			fonts: { added: [], notFound: [] },
			sections: { options: { groups: [ { heading: 'Options changed', items: [ 'Write new font sizes in px: On' ] } ] } },
			notImported: [],
		} );
		const result = document.getElementById( 'typost-import-result' );
		expect( Array.from( result.querySelectorAll( 'h4' ) ).map( ( h ) => h.textContent ) ).toEqual( [ 'Options changed' ] );
		expect( result.textContent ).toContain( 'Write new font sizes in px: On' );
	} );

	it( 'does not ask for the options when that part is left out', async () => {
		await preview();
		change( document.getElementById( 'typost-import-include-options' ), false );
		document.getElementById( 'typost-import-preview' ).querySelector( '.button-primary' ).click();
		expect( requests ).toHaveLength( 2 );
		expect( requests[ 1 ].body.choices.include ).toEqual( [ 'featureVisibility' ] );
	} );
} );

describe( 'strings', () => {
	it( 'every string the script uses is localized', () => {
		const source = fs.readFileSync( path.resolve( __dirname, '../admin-export.js' ), 'utf8' );
		const used = [ ...new Set( [ ...source.matchAll( /l10n\.(\w+)/g ) ].map( ( m ) => m[ 1 ] ) ) ];
		expect( used.length ).toBeGreaterThan( 40 );
		expect( used.filter( ( key ) => ! ( key in STRINGS ) ) ).toEqual( [] );
	} );
} );

describe( 'fixture parity with includes/admin-export-tab.php', () => {
	const template = fs.readFileSync( path.resolve( __dirname, '../../../includes/admin-export-tab.php' ), 'utf8' );

	it( 'uses only ids and classes the template renders', () => {
		const ids = [ ...FIXTURE.matchAll( /id="([^"]+)"/g ) ].map( ( m ) => m[ 1 ] ).filter( ( id ) => id !== 'typost-live-region' );
		expect( template ).toContain( "$field = 'typost-export-section-' . $id;" );
		expect( template ).toContain( "$item_field = $field . '-item-' . (int) $item['id'];" );
		ids.forEach( ( id ) => {
			const section = id.match( /^typost-export-section-paragraphStyles(-[a-z]+)?(-\d+)?$/ );
			if ( ! section ) {
				expect( template ).toContain( `id="${ id }"` );
			} else if ( section[ 1 ] && section[ 1 ] !== '-item' ) {
				// Built as $field . '-all', '-some', '-list'.
				expect( template ).toContain( `$field . '${ section[ 1 ] }'` );
			}
		} );
		[ 'typost-export-section', 'typost-export-section-toggle', 'typost-export-scope', 'typost-export-item-list', 'typost-export-item' ].forEach( ( cls ) => {
			expect( template ).toMatch( new RegExp( `class="[^"]*\\b${ cls }\\b` ) );
		} );
		expect( template ).toContain( 'data-parent=' );
		expect( template ).toContain( 'data-name=' );
		expect( template ).toContain( 'data-section=' );
	} );
} );

/**
 * Export & Import tab helpers (#205).
 */

const fs = require( 'fs' );
const path = require( 'path' );
const {
	formatString,
	addedParents,
	fontChoiceValue,
	fontChoiceFromValue,
	fontSelectOptions,
	styleActions,
	fontLeftOut,
	collectErrors,
	buildImportChoices,
	resultGroups,
	errorMessage,
	exportTabUrl,
	rowFieldId,
	rowSectionIds,
} = require( '../admin-export' );

const l10n = {
	chooseFont: 'Choose a font…',
	groupMatches: 'Matching fonts',
	groupAllFonts: 'All fonts on this site',
	addFont: 'Add it to this site',
	noFont: 'None (use the theme font)',
	errorChooseFont: 'Choose a font on this site for “%s”.',
	errorRenameEmpty: 'Enter a new name for “%s”.',
	errorRenameTaken: '“%2$s” is already used. Enter another name for “%1$s”.',
	errorChooseRow: 'Choose what to do with “%s”.',
	resultAdded: 'Added',
	resultRenamed: 'Added with a new name',
	resultRenamedItem: '“%1$s” as “%2$s”',
	resultOverwritten: 'Overwritten',
	resultSkipped: 'Skipped',
	resultFontsAdded: 'Fonts added to this site',
	resultFontsMissing: 'Fonts not found',
	resultNotImported: 'Parts not imported',
	resultWarnings: 'Check these styles',
};

describe( 'formatString', () => {
	it( 'fills positional and ordered placeholders', () => {
		expect( formatString( '%2$s before %1$s', [ 'a', 'b' ] ) ).toBe( 'b before a' );
		expect( formatString( '%s and %d', [ 'x', 3 ] ) ).toBe( 'x and 3' );
	} );

	it( 'leaves a placeholder without a value as it is', () => {
		expect( formatString( '%1$s %2$s', [ 'a' ] ) ).toBe( 'a %2$s' );
	} );

	it( 'does not read a value as a pattern', () => {
		expect( formatString( '%s', [ '$&' ] ) ).toBe( '$&' );
	} );

	it( 'does not fill a placeholder inside a value', () => {
		expect( formatString( '%2$s / %1$s', [ 'a', 'x%sy' ] ) ).toBe( 'x%sy / a' );
		expect( formatString( '%1$s and %s', [ 'Intro %d', 'b' ] ) ).toBe( 'Intro %d and Intro %d' );
	} );
} );

describe( 'addedParents', () => {
	const items = [
		{ id: 1, name: 'Body', parent: 0 },
		{ id: 2, name: 'Body – First', parent: 1 },
		{ id: 3, name: 'Body – First Small', parent: 2 },
		{ id: 4, name: 'Kicker', parent: 0 },
	];

	it( 'adds the whole chain above a chosen item', () => {
		expect( addedParents( items, [ 3 ] ) ).toEqual( [
			{ name: 'Body – First', because: 'Body – First Small' },
			{ name: 'Body', because: 'Body – First' },
		] );
	} );

	it( 'adds nothing that was chosen already, and each parent once', () => {
		expect( addedParents( items, [ 3, 1 ] ) ).toEqual( [ { name: 'Body – First', because: 'Body – First Small' } ] );
		expect( addedParents( items, [ 2, 3 ] ) ).toEqual( [ { name: 'Body', because: 'Body – First' } ] );
		expect( addedParents( items, [ 4 ] ) ).toEqual( [] );
	} );

	it( 'stops at a loop in stored data', () => {
		const loop = [
			{ id: 1, name: 'A', parent: 2 },
			{ id: 2, name: 'B', parent: 1 },
		];
		expect( addedParents( loop, [ 1 ] ) ).toEqual( [ { name: 'B', because: 'A' } ] );
	} );
} );

describe( 'font choices', () => {
	it( 'turns a preview choice into a select value and back', () => {
		expect( fontChoiceValue( { action: 'map', target: 'id:4' } ) ).toBe( 'map:id:4' );
		expect( fontChoiceValue( { action: 'map', target: '' } ) ).toBe( '' );
		expect( fontChoiceValue( { action: 'add' } ) ).toBe( 'add' );
		expect( fontChoiceValue( { action: 'none' } ) ).toBe( 'none' );
		expect( fontChoiceFromValue( 'map:wpl:lora' ) ).toEqual( { action: 'map', target: 'wpl:lora' } );
		expect( fontChoiceFromValue( 'add' ) ).toEqual( { action: 'add' } );
		expect( fontChoiceFromValue( '' ) ).toBeNull();
		expect( fontChoiceFromValue( 'map:' ) ).toBeNull();
	} );

	it( 'lists the matches, then add, none and every other font', () => {
		const row = {
			status: 'ambiguous',
			candidates: [ { value: 'id:1', label: 'Inter A' }, { value: 'id:2', label: 'Inter B' } ],
		};
		const site = [ { value: 'id:1', label: 'Inter A' }, { value: 'id:2', label: 'Inter B' }, { value: 'id:9', label: 'Lora' } ];
		expect( fontSelectOptions( row, site, l10n ) ).toEqual( [
			{ value: '', label: 'Choose a font…' },
			{ group: 'Matching fonts', options: [ { value: 'map:id:1', label: 'Inter A' }, { value: 'map:id:2', label: 'Inter B' } ] },
			{ value: 'none', label: 'None (use the theme font)' },
			{ group: 'All fonts on this site', options: [ { value: 'map:id:9', label: 'Lora' } ] },
		] );
	} );

	it( 'offers add only when the file can add the font', () => {
		const values = ( row ) => fontSelectOptions( row, [], l10n ).map( ( o ) => o.value );
		expect( values( { status: 'addable', candidates: [] } ) ).toEqual( [ 'add', 'none' ] );
		expect( values( { status: 'not_found', candidates: [] } ) ).toEqual( [ 'none' ] );
	} );
} );

describe( 'styleActions', () => {
	it( 'offers skip, rename and overwrite for a name that exists', () => {
		expect( styleActions( { exists: true, action: 'skip' } ) ).toEqual( [ 'skip', 'rename', 'overwrite' ] );
	} );

	it( 'offers rename and skip for a name repeated in the file', () => {
		expect( styleActions( { exists: false, action: 'rename' } ) ).toEqual( [ 'rename', 'skip' ] );
	} );

	it( 'offers add and skip otherwise', () => {
		expect( styleActions( { exists: false, action: 'add' } ) ).toEqual( [ 'add', 'skip' ] );
	} );
} );

describe( 'collectErrors and buildImportChoices', () => {
	const preview = {
		fonts: [ { key: 'f1', name: 'Inter' }, { key: 'f2', name: 'Lora' } ],
		sections: {
			paragraphStyles: {
				label: 'Paragraph styles',
				preview: {
					items: [
						{ key: 's1', name: 'Body', exists: true, existingName: 'body' },
						{ key: 's2', name: 'Kicker', exists: false },
						{ key: 's3', name: 'Note', exists: false },
					],
				},
			},
		},
	};

	const state = ( overrides ) => ( {
		fonts: { f1: 'map:id:1', f2: 'none' },
		styles: { s1: { action: 'skip' }, s2: { action: 'add' }, s3: { action: 'add' } },
		include: { paragraphStyles: true },
		...overrides,
	} );

	it( 'finds no errors in a complete state', () => {
		expect( collectErrors( preview, state(), l10n ) ).toEqual( [] );
	} );

	it( 'asks for a font that has no choice', () => {
		expect( collectErrors( preview, state( { fonts: { f1: '', f2: 'none' } } ), l10n ) ).toEqual( [
			{ message: 'Choose a font on this site for “Inter”.', kind: 'font', key: 'f1', field: 'typost-import-font-f1' },
		] );
	} );

	it( 'checks rename names against the site and the file', () => {
		const errors = collectErrors( preview, state( {
			styles: {
				s1: { action: 'rename', name: ' ' },
				s2: { action: 'add' },
				s3: { action: 'rename', name: 'KICKER' },
			},
		} ), l10n );
		expect( errors.map( ( e ) => e.message ) ).toEqual( [
			'Enter a new name for “Body”.',
			'“KICKER” is already used. Enter another name for “Note”.',
		] );
	} );

	it( 'treats an existing name as taken', () => {
		const errors = collectErrors( preview, state( { styles: { s1: { action: 'skip' }, s2: { action: 'rename', name: 'Body' }, s3: { action: 'add' } } } ), l10n );
		expect( errors ).toHaveLength( 1 );
	} );

	it( 'does not check styles of a section left out', () => {
		const errors = collectErrors( preview, state( { styles: { s1: { action: 'rename', name: '' } }, include: { paragraphStyles: false } } ), l10n );
		expect( errors ).toEqual( [] );
	} );

	it( 'builds the request choices', () => {
		const choices = buildImportChoices( preview, state( {
			styles: { s1: { action: 'rename', name: ' Body 2 ' }, s2: { action: 'add', name: 'x' }, s3: { action: 'skip' } },
		} ) );
		expect( choices ).toEqual( {
			fonts: { f1: { action: 'map', target: 'id:1' }, f2: { action: 'none' } },
			sections: { paragraphStyles: { s1: { action: 'rename', name: 'Body 2' }, s2: { action: 'add' }, s3: { action: 'skip' } } },
			include: [ 'paragraphStyles' ],
		} );
	} );

	it( 'leaves out a section the author unchecked', () => {
		expect( buildImportChoices( preview, state( { include: { paragraphStyles: false } } ) ).include ).toEqual( [] );
	} );

	describe( 'a font only left-out sections use', () => {
		const withSections = {
			...preview,
			fonts: [ { key: 'f1', name: 'Inter', sections: [ 'paragraphStyles' ] }, { key: 'f2', name: 'Lora', sections: [] } ],
		};
		const leftOut = state( { fonts: { f1: '', f2: 'none' }, include: { paragraphStyles: false } } );

		it( 'is left out only when every section that uses it is', () => {
			expect( fontLeftOut( withSections.fonts[ 0 ], leftOut ) ).toBe( true );
			expect( fontLeftOut( withSections.fonts[ 0 ], state() ) ).toBe( false );
			// A font no section uses is never left out.
			expect( fontLeftOut( withSections.fonts[ 1 ], leftOut ) ).toBe( false );
			// Rows from a preview without `sections` behave as before.
			expect( fontLeftOut( { key: 'f1' }, leftOut ) ).toBe( false );
		} );

		it( 'needs no choice and is not sent', () => {
			expect( collectErrors( withSections, leftOut, l10n ) ).toEqual( [] );
			expect( buildImportChoices( withSections, leftOut ).fonts ).toEqual( { f2: { action: 'none' } } );
		} );
	} );
} );

describe( 'sections in the generic row form', () => {
	const preview = {
		fonts: [],
		sections: {
			options: {
				label: 'Options',
				preview: {
					rows: [
						{ key: 'typost_new_font_sizes_px', name: 'Write new font sizes in px', choices: [ { value: 'keep' }, { value: 'apply' } ], choice: '' },
						{ key: 'typost_admin_color_scheme', name: 'Admin Color Scheme', choices: [ { value: 'keep' }, { value: 'apply' } ], choice: '' },
					],
				},
			},
			featureVisibility: {
				label: 'Feature Visibility',
				preview: { rows: [ { key: 'f1', name: 'Inter', choices: [ { value: 'apply' }, { value: 'keep' } ], choice: 'apply' } ] },
			},
			layeredFonts: { label: 'Layers', preview: { items: [ { name: 'A' } ] } },
		},
	};
	const state = ( rows, include ) => ( { fonts: {}, styles: {}, rows, include: include || {} } );

	it( 'finds the sections that send rows', () => {
		expect( rowSectionIds( preview ) ).toEqual( [ 'options', 'featureVisibility' ] );
	} );

	it( 'gives each row a select id made of id characters only', () => {
		expect( rowFieldId( 'options', 'typost_new_font_sizes_px' ) ).toBe( 'typost-import-row-options-typost_new_font_sizes_px' );
		expect( rowFieldId( 'x', 'a b"c' ) ).toBe( 'typost-import-row-x-a_b_c' );
	} );

	it( 'asks for every row with no answer', () => {
		const errors = collectErrors( preview, state( { options: { typost_new_font_sizes_px: 'apply', typost_admin_color_scheme: '' }, featureVisibility: { f1: 'apply' } } ), l10n );
		expect( errors ).toEqual( [ {
			message: 'Choose what to do with “Admin Color Scheme”.',
			kind: 'row',
			key: 'typost_admin_color_scheme',
			field: 'typost-import-row-options-typost_admin_color_scheme',
		} ] );
	} );

	it( 'does not ask for rows of a section left out', () => {
		expect( collectErrors( preview, state( {}, { options: false, featureVisibility: false } ), l10n ) ).toEqual( [] );
	} );

	it( 'sends each answer under its section', () => {
		const choices = buildImportChoices( preview, state( { options: { typost_new_font_sizes_px: 'apply', typost_admin_color_scheme: 'keep' }, featureVisibility: { f1: 'keep' } } ) );
		expect( choices.sections ).toEqual( {
			options: { typost_new_font_sizes_px: 'apply', typost_admin_color_scheme: 'keep' },
			featureVisibility: { f1: 'keep' },
		} );
		expect( choices.include ).toEqual( [ 'options', 'featureVisibility', 'layeredFonts' ] );
	} );

	it( 'lists the groups a section names in the result', () => {
		const groups = resultGroups( {
			sections: {
				options: { groups: [ { heading: 'Options changed', items: [ 'Write new font sizes in px: On' ] }, { heading: 'Empty', items: [] } ] },
			},
		}, l10n );
		expect( groups ).toEqual( [ { heading: 'Options changed', items: [ 'Write new font sizes in px: On' ] } ] );
	} );
} );

describe( 'exportTabUrl', () => {
	it( 'opens this tab, keeping the other parameters', () => {
		expect( exportTabUrl( 'https://example.test/wp-admin/options-general.php?page=typography-stylist' ) )
			.toBe( 'https://example.test/wp-admin/options-general.php?page=typography-stylist&tab=export' );
		expect( exportTabUrl( 'https://example.test/wp-admin/options-general.php?page=typography-stylist&tab=fonts#x' ) )
			.toBe( 'https://example.test/wp-admin/options-general.php?page=typography-stylist&tab=export' );
	} );
} );

describe( 'resultGroups', () => {
	it( 'lists every non-empty group, warnings last', () => {
		const groups = resultGroups( {
			fonts: { added: [ 'Proxima Nova' ], notFound: [] },
			sections: {
				paragraphStyles: {
					added: [ 'Body' ],
					renamed: [ { from: 'Kicker', to: 'Kicker (2)' } ],
					overwritten: [],
					skipped: [ 'Note' ],
					warnings: [ 'Check it.' ],
				},
			},
			notImported: [ 'layeredFonts' ],
		}, l10n );
		expect( groups ).toEqual( [
			{ heading: 'Added', items: [ 'Body' ] },
			{ heading: 'Added with a new name', items: [ '“Kicker” as “Kicker (2)”' ] },
			{ heading: 'Skipped', items: [ 'Note' ] },
			{ heading: 'Fonts added to this site', items: [ 'Proxima Nova' ] },
			{ heading: 'Parts not imported', items: [ 'layeredFonts' ] },
			{ heading: 'Check these styles', items: [ 'Check it.' ] },
		] );
	} );

	it( 'is empty when nothing happened', () => {
		expect( resultGroups( { fonts: { added: [], notFound: [] }, sections: {}, notImported: [] }, l10n ) ).toEqual( [] );
	} );
} );

describe( 'errorMessage', () => {
	it( 'reads the REST error message, with a fallback', () => {
		expect( errorMessage( { responseJSON: { message: 'Bad file.' } }, 'Failed.' ) ).toBe( 'Bad file.' );
		expect( errorMessage( {}, 'Failed.' ) ).toBe( 'Failed.' );
		expect( errorMessage( null, 'Failed.' ) ).toBe( 'Failed.' );
	} );
} );

describe( 'admin-export.js source', () => {
	const source = fs.readFileSync( path.join( __dirname, '..', 'admin-export.js' ), 'utf8' );

	it( 'sends every REST call in the admin language and as JSON (#296)', () => {
		const calls = source.match( /\$\.ajax\(/g ) || [];
		expect( calls ).toHaveLength( 1 );
		expect( source ).toMatch( /url: typostWithUserLocale\(data\.restUrl \+ path\)/ );
		expect( source ).toMatch( /dataType: 'json'/ );
	} );

	it( 'never writes markup', () => {
		expect( source ).not.toMatch( /\.innerHTML|\.html\(|insertAdjacentHTML|outerHTML/ );
	} );

	it( 'has no console logging', () => {
		expect( source ).not.toMatch( /console\./ );
	} );
} );

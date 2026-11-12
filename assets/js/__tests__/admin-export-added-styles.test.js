/**
 * The styles an export adds, as the Export & Import tab announces them
 * before the export (addedParents()) and as the server adds them (#358).
 *
 * The server side reads the same fixture in
 * tests/Unit/ParagraphStylesExportAddedStylesTest.php. Cases labeled
 * `differs:` pin what each side does today where the two lists do not match.
 */

const { addedParents } = require( '../admin-export' );
const fixture = require( '../../../paragraph-styles/__tests__/fixtures/export-added-styles.json' );

// The rows the tab gets from Typost_PS_Transfer::items(): a parent is the
// basedOn id when that style exists, else 0.
const itemsOf = ( styles ) => {
	const ids = new Set( styles.map( ( s ) => s.id ) );
	return styles.map( ( s ) => ( { id: s.id, name: s.name, parent: s.basedOn && ids.has( s.basedOn ) ? s.basedOn : 0 } ) );
};

const BASED_ON = /^“(.+)” was added because “(.+)” is based on it\.$/;

test( 'the fixture is read', () => {
	expect( fixture.cases.length ).toBeGreaterThanOrEqual( 5 );
} );

describe.each( fixture.cases.map( ( c ) => [ c.label, c ] ) )( '%s', ( label, c ) => {
	const client = addedParents( itemsOf( c.styles ), c.items ).map( ( a ) => [ a.name, a.because ] );

	test( 'the client announces what the fixture says', () => {
		expect( client ).toEqual( c.client );
	} );

	// The server notes as [name, because] pairs; a GREP or nested note has
	// no Based On pair and stays a whole string, so it never matches.
	const serverPairs = c.server.map( ( note ) => ( BASED_ON.test( note ) ? note.match( BASED_ON ).slice( 1 ) : [ note ] ) );

	if ( ! /^differs:/.test( label ) ) {
		test( 'the server adds the same styles for the same reasons', () => {
			expect( serverPairs ).toEqual( c.client );
		} );
	} else {
		test( 'the server side in the fixture really differs (else the label is stale)', () => {
			expect( serverPairs ).not.toEqual( c.client );
		} );
	}
} );

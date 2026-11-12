/**
 * The saved-markup fixtures (#373): which file holds what, what each block
 * must load as, and the paragraph style the style fixtures refer to.
 *
 * Read by saved-markup.spec.js (the check) and generate.js (which writes
 * the files). See README.md in this folder.
 *
 * Each fixture:
 * - file:   the post content, as the editor saved it.
 * - title:  the test name.
 * - paths:  for each block in the file, in order, the save() that validates
 *           it when the editor parses it: 'current', 'v2' or 'v1' (the
 *           deprecated entries in blocks/typography-stylist/deprecated.js),
 *           or 'core' for a core block.
 * - after:  for a block that loads through a deprecation: the content the
 *           editor writes once anything in the post is edited (the current
 *           save, with the attributes the entry's migrate() set). Without
 *           it, the editor must write the file back byte for byte. Until
 *           the post is edited, the editor saves the stored content as it
 *           is, for every fixture.
 * - measured: a fit-to-width block. The editor measures its lines when it
 *           opens and stores the result, and the result depends on the
 *           fonts of the machine, the browser and the theme. The measured
 *           numbers are compared only for being there; everything else
 *           byte for byte. See README.md.
 * - style:  the file refers to the paragraph style STYLE below, written as
 *           {{STYLE_ID}}. The spec creates the style and puts its ID in.
 */

// Written in place of the style's ID in the files
const STYLE_ID_TOKEN = '{{STYLE_ID}}';

// The paragraph style that the style fixtures use, with the properties it
// had when generate.js wrote them, so the block's own copy of the values
// matches the style as it did then. The style must exist: for a style that
// is not there, the editor removes the class from the block and the post is
// dirty (checked). The editor does not read the style's values again when
// it opens the post. The spec adds a time to the name and deletes the
// style after the test.
const STYLE = {
	name: 'ZZ E2E saved markup',
	properties: {
		fontWeight: '700',
		letterSpacing: 50,
		features: [ 'dlig' ],
		fontSize: 'responsive',
		fontSizeMin: 20,
		fontSizePreferred: 28,
		fontSizeMax: 40,
		fontSizeUnit: 'rem',
	},
};

const FIXTURES = [
	{
		file: 'v1-fixed-px.html',
		title: 'v1: a fixed px size from before #218',
		paths: [ 'v1' ],
		after: 'v1-fixed-px.after.html',
	},
	{
		file: 'v1-fixed-px.after.html',
		title: 'v1 after the upgrade: fixed size in px',
		paths: [ 'current' ],
	},
	{
		file: 'v2-responsive-px.html',
		title: 'v2: a responsive size in px from before #233',
		paths: [ 'v2' ],
		after: 'v2-responsive-px.after.html',
	},
	{
		file: 'v2-responsive-px.after.html',
		title: 'v2 after the upgrade: responsive size in px',
		paths: [ 'current' ],
	},
	{
		file: 'responsive-rem.html',
		title: 'responsive size in rem, slope limited for zoom (#234)',
		paths: [ 'current' ],
	},
	{
		file: 'fit-rem-word-sizes.html',
		title: 'fit to width in rem, with word sizes (#235)',
		paths: [ 'current' ],
		measured: true,
	},
	{
		file: 'first-letter-hang.html',
		title: 'first letter hang (#242)',
		paths: [ 'current' ],
	},
	{
		file: 'case.html',
		title: 'case: small caps without fake small caps (#214)',
		paths: [ 'current' ],
	},
	{
		file: 'style-class.html',
		title: 'block with a paragraph style class',
		paths: [ 'current' ],
		style: true,
	},
	{
		file: 'after-detach.html',
		title: 'block after Detach Style',
		paths: [ 'current' ],
	},
	{
		file: 'inline-spans.html',
		title: 'inline spans: rem, px, fixed size and case',
		paths: [ 'core', 'core', 'core' ],
	},
	{
		file: 'inline-style-id.html',
		title: 'inline span with a paragraph style id',
		paths: [ 'core' ],
		style: true,
	},
];

// The attribute names each block type in the fixtures has on a site with
// only this plugin, as generate.js recorded them. Another plugin can add
// attributes to every block type, and a block that loads through a
// deprecation then writes such an attribute into its comment; the spec
// leaves those attributes out of its comparison and says so.
const REGISTERED_FILE = 'registered-attributes.json';
const REGISTERED_BLOCKS = [ 'typost/block', 'core/heading', 'core/paragraph' ];

module.exports = { STYLE_ID_TOKEN, STYLE, FIXTURES, REGISTERED_FILE, REGISTERED_BLOCKS };

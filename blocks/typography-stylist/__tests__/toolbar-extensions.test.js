/**
 * Tests for the extension toolbar button plumbing (v2.3.0):
 *
 * - resolveBlockSelectionRange() — the selection snapshot both the Quick
 *   Feature Toggle button and the extension toolbar buttons take before a
 *   modal steals focus.
 * - buildQftEditorState() — the single source of the 'qft' editor state, shared
 *   by the typost_current_editor_state filter and the toolbar click context.
 * - filterToolbarButtons() — which registered descriptors an editor renders.
 */

import {
	resolveBlockSelectionRange,
	buildQftEditorState,
	filterToolbarButtons,
} from '../utils';

const BLOCK = 'block-a';
const OTHER = 'block-b';
const sel = (clientId, offset) => ({ clientId, offset });

describe('resolveBlockSelectionRange', () => {
	test('returns the range for a selection inside this block', () => {
		expect(resolveBlockSelectionRange(sel(BLOCK, 2), sel(BLOCK, 7), BLOCK))
			.toEqual({ start: 2, end: 7 });
	});

	test('normalizes a right-to-left selection', () => {
		expect(resolveBlockSelectionRange(sel(BLOCK, 9), sel(BLOCK, 4), BLOCK))
			.toEqual({ start: 4, end: 9 });
	});

	test('a collapsed caret is not a selection', () => {
		expect(resolveBlockSelectionRange(sel(BLOCK, 3), sel(BLOCK, 3), BLOCK)).toBeNull();
	});

	test('a selection spanning into another block is not this block\'s to act on', () => {
		expect(resolveBlockSelectionRange(sel(BLOCK, 2), sel(OTHER, 5), BLOCK)).toBeNull();
		expect(resolveBlockSelectionRange(sel(OTHER, 2), sel(BLOCK, 5), BLOCK)).toBeNull();
	});

	test('missing selection objects resolve to null', () => {
		expect(resolveBlockSelectionRange(null, sel(BLOCK, 5), BLOCK)).toBeNull();
		expect(resolveBlockSelectionRange(sel(BLOCK, 5), null, BLOCK)).toBeNull();
		expect(resolveBlockSelectionRange(null, null, BLOCK)).toBeNull();
	});

	test('an absent offset counts as 0', () => {
		expect(resolveBlockSelectionRange({ clientId: BLOCK }, sel(BLOCK, 4), BLOCK))
			.toEqual({ start: 0, end: 4 });
	});
});

describe('buildQftEditorState', () => {
	test('reports the block-level font when no inline font is at the cursor', () => {
		const state = buildQftEditorState({ fontId: 12, fontWeight: '700' });
		expect(state.editorType).toBe('qft');
		expect(state.fontId).toBe(12);
		expect(state.fontWeight).toBe('700');
	});

	test('the inline font at the cursor wins over the block font', () => {
		expect(buildQftEditorState({ fontId: 12, inlineFontId: '40' }).fontId).toBe(40);
	});

	test('falls back to the theme-inherited font when the block has none', () => {
		// Text with no plugin font still renders in something; reporting 0 left
		// the Glyphs panel to browse whichever font came first in the list.
		expect(buildQftEditorState({ fontId: 0, inheritedFontId: 1 }).fontId).toBe(1);
	});

	test('an explicit block font wins over the inherited one', () => {
		expect(buildQftEditorState({ fontId: 12, inheritedFontId: 1 }).fontId).toBe(12);
	});

	test('reports 0 when nothing resolves, rather than a font the author never chose', () => {
		expect(buildQftEditorState({ fontId: 0 }).fontId).toBe(0);
		expect(buildQftEditorState({ fontId: 0, inheritedFontId: 0 }).fontId).toBe(0);
	});

	test('the weight at the selection wins over the block attribute', () => {
		// A span's weight — including one inherited from an ancestor span,
		// which parseInlineStylesAtCursor() resolves — is the weight the
		// selected text actually renders at. Reporting the block attribute
		// instead made the Glyphs panel draw its cells in the block's weight
		// and insert glyphs at that weight, so a glyph swapped into a bold
		// run came back lighter than the text around it.
		expect(buildQftEditorState({ fontWeight: '400', selectionFontWeight: '700' }).fontWeight).toBe('700');
	});

	test('falls back to the block weight when the selection carries none', () => {
		expect(buildQftEditorState({ fontWeight: '600' }).fontWeight).toBe('600');
		expect(buildQftEditorState({ fontWeight: '600', selectionFontWeight: null }).fontWeight).toBe('600');
	});

	test('the effective style at the selection wins over the block attribute', () => {
		expect(buildQftEditorState({ fontStyle: '', inlineFontStyle: 'italic' }).fontStyle).toBe('italic');
		expect(buildQftEditorState({ fontStyle: 'italic' }).fontStyle).toBe('italic');
	});

	test('explicitFontStyle excludes <em>-derived italic but keeps span/attribute values', () => {
		// Selection inside <em> only: rendered says italic, explicit stays ''
		const emOnly = buildQftEditorState({ fontStyle: '', inlineFontStyle: 'italic', inlineExplicitFontStyle: null });
		expect(emOnly.fontStyle).toBe('italic');
		expect(emOnly.explicitFontStyle).toBe('');
		// A data-fontstyle span reports on both channels
		const span = buildQftEditorState({ fontStyle: '', inlineFontStyle: 'italic', inlineExplicitFontStyle: 'italic' });
		expect(span.explicitFontStyle).toBe('italic');
		// The block attribute is an explicit author choice
		expect(buildQftEditorState({ fontStyle: 'italic' }).explicitFontStyle).toBe('italic');
	});

	test('parses the paragraph style id out of the style class', () => {
		expect(buildQftEditorState({ styleClass: 'typost-ps-7' }).paragraphStyleId).toBe(7);
		expect(buildQftEditorState({ styleClass: 'some-other-class' }).paragraphStyleId).toBe(0);
		expect(buildQftEditorState({}).paragraphStyleId).toBe(0);
	});

	test('fills defaults so consumers never read undefined', () => {
		const state = buildQftEditorState({});
		expect(state.fitMaxSize).toBe(0);
		expect(state.fontVariationSettings).toBe('');
		expect(state.layeredConfigId).toBe(0);
		expect(state.animationConfigId).toBe(0);
		expect(state.content).toBe('');
		expect(state.tagName).toBe('h2');
	});

	test('tolerates a missing state object', () => {
		expect(buildQftEditorState(undefined).editorType).toBe('qft');
	});
});

describe('filterToolbarButtons', () => {
	const valid = { id: 'glyphs', onClick: () => {} };

	test('keeps a descriptor with no editors list in every editor', () => {
		expect(filterToolbarButtons([valid], 'qft')).toEqual([valid]);
		expect(filterToolbarButtons([valid], 'inline')).toEqual([valid]);
	});

	test('honours an explicit editors list', () => {
		const qftOnly = { id: 'paragraph-styles', onClick: () => {}, editors: ['qft'] };
		expect(filterToolbarButtons([qftOnly], 'qft')).toEqual([qftOnly]);
		expect(filterToolbarButtons([qftOnly], 'inline')).toEqual([]);
	});

	test('drops descriptors that could not be rendered or clicked', () => {
		expect(filterToolbarButtons([
			null,
			{ onClick: () => {} },              // no id — React needs a key
			{ id: 'no-handler' },               // nothing would happen on click
			{ id: 'bad-handler', onClick: 'x' },
			valid,
		], 'qft')).toEqual([valid]);
	});

	test('a non-array filter result yields no buttons', () => {
		expect(filterToolbarButtons(undefined, 'qft')).toEqual([]);
		expect(filterToolbarButtons('nope', 'qft')).toEqual([]);
	});
});

/**
 * Case (#214): All Caps, Lowercase, Title Case, Small Caps and All Small
 * Caps as a block setting a paragraph style can store. Pure helpers, the
 * shared editor state, the paragraph-style override diff, and save output.
 */

import { renderToString } from '@wordpress/element';
import {
	TEXT_CASE_VALUES,
	normalizeTextCase,
	isSmallCapsCase,
	caseDeclarations,
	stylePropertyOverrides,
	buildQftEditorState,
	caseStyleObject,
	patchTypostFormatAttributes,
	countInlineParagraphStyleConflicts,
	stripParagraphStyleOverrides,
} from '../utils';
import {
	buildInlineCaseAttributes,
	readInlineCase,
	buildInlineCasePatch,
} from '../../../assets/js/text-case.js';
import { buildConvertBlockAttributes } from '../../../assets/js/inline-apply-rules.js';

jest.mock('@wordpress/block-editor');

// eslint-disable-next-line import/first -- the mock must be set up first
import save from '../save';

const psUtils = require('../../../paragraph-styles/assets/js/lib/ps-utils.js');

describe('normalizeTextCase', () => {
	test('keeps every known value', () => {
		TEXT_CASE_VALUES.forEach((value) => {
			expect(normalizeTextCase(value)).toBe(value);
		});
	});

	test('anything else is Default', () => {
		[undefined, null, '', 'UPPERCASE', 'full-width', 'small-caps;color:red', 1, true, {}].forEach((value) => {
			expect(normalizeTextCase(value)).toBe('');
		});
	});

	test('only the two small caps values use font-variant-caps', () => {
		expect(isSmallCapsCase('small-caps')).toBe(true);
		expect(isSmallCapsCase('all-small-caps')).toBe(true);
		['', 'none', 'uppercase', 'lowercase', 'capitalize', 'junk'].forEach((value) => {
			expect(isSmallCapsCase(value)).toBe(false);
		});
	});
});

describe('caseDeclarations', () => {
	test('Default writes nothing, so older blocks and styles render as before', () => {
		expect(caseDeclarations('')).toEqual([]);
		expect(caseDeclarations(undefined, false)).toEqual([]);
	});

	test('a transform resets font-variant-caps', () => {
		expect(caseDeclarations('uppercase')).toEqual([
			['text-transform', 'uppercase'],
			['font-variant-caps', 'normal'],
		]);
		expect(caseDeclarations('capitalize')[0]).toEqual(['text-transform', 'capitalize']);
	});

	test('Normal resets both a theme transform and theme small caps', () => {
		expect(caseDeclarations('none')).toEqual([
			['text-transform', 'none'],
			['font-variant-caps', 'normal'],
		]);
	});

	test('small caps reset text-transform and allow fake small caps by default', () => {
		expect(caseDeclarations('all-small-caps')).toEqual([
			['text-transform', 'none'],
			['font-variant-caps', 'all-small-caps'],
			['font-synthesis-small-caps', 'auto'],
		]);
		expect(caseDeclarations('small-caps', true)[2]).toEqual(['font-synthesis-small-caps', 'auto']);
	});

	test('fake small caps off turns synthesis off', () => {
		expect(caseDeclarations('small-caps', false)[2]).toEqual(['font-synthesis-small-caps', 'none']);
	});

	test('never writes font-feature-settings, so smcp/c2sc toggles keep working', () => {
		TEXT_CASE_VALUES.forEach((value) => {
			caseDeclarations(value, false).forEach(([property]) => {
				expect(property).not.toBe('font-feature-settings');
			});
		});
	});

	test('matches the Paragraph Styles twin for every value', () => {
		TEXT_CASE_VALUES.concat(['', 'junk']).forEach((value) => {
			[true, false, undefined].forEach((fake) => {
				expect(psUtils.caseDeclarations(value, fake)).toEqual(caseDeclarations(value, fake));
			});
		});
		expect(psUtils.TEXT_CASE_VALUES).toEqual(TEXT_CASE_VALUES);
	});
});

describe('editor state and style overrides', () => {
	test('the shared QFT state reports case, Default and fake allowed when unset', () => {
		expect(buildQftEditorState({ textCase: 'uppercase' }).textCase).toBe('uppercase');
		expect(buildQftEditorState({ textCase: 'small-caps', fakeSmallCaps: false }).fakeSmallCaps).toBe(false);
		const unset = buildQftEditorState({});
		expect(unset.textCase).toBe('');
		expect(unset.fakeSmallCaps).toBe(true);
	});

	test('a block case that differs from its style renders inline', () => {
		expect(stylePropertyOverrides({ textCase: 'uppercase' }, { textCase: 'lowercase' }).textCase).toBe(true);
		expect(stylePropertyOverrides({ textCase: '' }, { textCase: 'uppercase' }).textCase).toBe(true);
	});

	test('the same case is not an override, and a style without one matches Default', () => {
		expect(stylePropertyOverrides({ textCase: 'uppercase', fakeSmallCaps: true }, { textCase: 'uppercase' })).not.toHaveProperty('textCase');
		expect(stylePropertyOverrides({ textCase: '', fakeSmallCaps: true }, {})).not.toHaveProperty('textCase');
	});

	test('fake small caps counts only with a small caps value', () => {
		expect(stylePropertyOverrides({ textCase: 'small-caps', fakeSmallCaps: false }, { textCase: 'small-caps' }).textCase).toBe(true);
		expect(stylePropertyOverrides({ textCase: 'small-caps', fakeSmallCaps: false }, { textCase: 'small-caps', fakeSmallCaps: false })).not.toHaveProperty('textCase');
		expect(stylePropertyOverrides({ textCase: 'uppercase', fakeSmallCaps: false }, { textCase: 'uppercase' })).not.toHaveProperty('textCase');
	});
});

describe('save output', () => {
	const base = {
		content: 'Kicker',
		tagName: 'h2',
		features: [],
		fontFamily: '',
		fontId: 0,
		fontSize: 'inherit',
		fontSizeMin: 16,
		fontSizePreferred: 32,
		fontSizeMax: 64,
		fitLineSizes: [],
		fitMaxSize: 0,
		fontWeight: '400',
		fontStyle: '',
		letterSpacing: 0,
		lineHeight: 0,
		screenReaderClass: 'visually-hidden',
		styleClass: '',
		fontVariationSettings: '',
	};

	test('Default (and absent attributes) leaves the markup unchanged', () => {
		const before = renderToString(save({ attributes: base }));
		const withDefault = renderToString(save({ attributes: { ...base, textCase: '', fakeSmallCaps: true } }));
		expect(withDefault).toBe(before);
		expect(before).not.toContain('text-transform');
		expect(before).not.toContain('font-variant-caps');
	});

	test('All Caps is written on the visible copy only, and the stored text keeps its case', () => {
		const html = renderToString(save({ attributes: { ...base, textCase: 'uppercase' } }));
		expect(html).toContain('text-transform:uppercase');
		expect(html).toContain('font-variant-caps:normal');
		expect(html.split('text-transform').length - 1).toBe(1);
		expect(html).toContain('Kicker');
		expect(html).not.toContain('KICKER');
	});

	test('Small Caps with fake small caps off', () => {
		const html = renderToString(save({ attributes: { ...base, textCase: 'small-caps', fakeSmallCaps: false } }));
		expect(html).toContain('font-variant-caps:small-caps');
		expect(html).toContain('font-synthesis-small-caps:none');
		expect(html).toContain('text-transform:none');
	});

	test('under a paragraph style the class supplies the case', () => {
		const html = renderToString(save({ attributes: { ...base, textCase: 'uppercase', styleClass: 'typost-ps-3' } }));
		expect(html).not.toContain('text-transform');
	});
});

describe('caseStyleObject (editor previews)', () => {
	test('camelCase keys, same values as caseDeclarations', () => {
		expect(caseStyleObject('all-small-caps', false)).toEqual({
			textTransform: 'none',
			fontVariantCaps: 'all-small-caps',
			fontSynthesisSmallCaps: 'none',
		});
		expect(caseStyleObject('uppercase')).toEqual({ textTransform: 'uppercase', fontVariantCaps: 'normal' });
	});

	test('Default and unknown values add nothing', () => {
		expect(caseStyleObject('')).toEqual({});
		expect(caseStyleObject('junk', false)).toEqual({});
	});
});

describe('inline span case (inline editor)', () => {
	test('Default writes no attributes', () => {
		expect(buildInlineCaseAttributes('')).toEqual({});
		expect(buildInlineCaseAttributes('bogus', false)).toEqual({});
	});

	test('data-fakesmallcaps is written only as "false", only with small caps', () => {
		expect(buildInlineCaseAttributes('uppercase', false)).toEqual({ 'data-textcase': 'uppercase' });
		expect(buildInlineCaseAttributes('small-caps', true)).toEqual({ 'data-textcase': 'small-caps' });
		expect(buildInlineCaseAttributes('small-caps', false)).toEqual({ 'data-textcase': 'small-caps', 'data-fakesmallcaps': 'false' });
	});

	test('the attributes read back to the same case', () => {
		[['', true], ['none', true], ['capitalize', true], ['all-small-caps', false], ['small-caps', true]].forEach(([textCase, fake]) => {
			expect(readInlineCase(buildInlineCaseAttributes(textCase, fake))).toEqual({ textCase, fakeSmallCaps: fake });
		});
	});

	test('a span with no case, or an unknown one, reads as Default with fake allowed', () => {
		expect(readInlineCase(undefined)).toEqual({ textCase: '', fakeSmallCaps: true });
		expect(readInlineCase({ 'data-textcase': 'UPPERCASE' })).toEqual({ textCase: '', fakeSmallCaps: true });
	});

	test('a mixed-selection patch replaces another case and keeps the rest of the run', () => {
		const run = {
			'data-font-id': '12',
			'data-textcase': 'small-caps',
			'data-fakesmallcaps': 'false',
			style: 'font-family: var(--font-12); text-transform: none; font-variant-caps: small-caps; font-synthesis-small-caps: none',
		};
		const patched = patchTypostFormatAttributes(run, buildInlineCasePatch('uppercase', true));
		expect(patched['data-font-id']).toBe('12');
		expect(patched['data-textcase']).toBe('uppercase');
		expect(patched).not.toHaveProperty('data-fakesmallcaps');
		expect(patched.style).toContain('font-family: var(--font-12)');
		expect(patched.style).toContain('text-transform: uppercase');
		expect(patched.style).toContain('font-variant-caps: normal');
		expect(patched.style).not.toContain('font-synthesis-small-caps');
	});

	test('a patch back to Default removes every case attribute and declaration', () => {
		const run = { 'data-textcase': 'uppercase', 'data-fontweight': '700', style: 'font-weight: 700; text-transform: uppercase; font-variant-caps: normal' };
		const patched = patchTypostFormatAttributes(run, buildInlineCasePatch('', true));
		expect(patched).toEqual({ 'data-fontweight': '700', style: 'font-weight: 700' });
	});

	test('a span whose only setting is its case loses the format at Default', () => {
		const run = { 'data-textcase': 'lowercase', style: 'text-transform: lowercase; font-variant-caps: normal' };
		expect(patchTypostFormatAttributes(run, buildInlineCasePatch('', true))).toBeNull();
	});
});

describe('paragraph styles and an inline span case', () => {
	const TYPE = 'typost/features';
	const formats = (length, from, to, attributes) => Array.from({ length }, (unused, i) => (
		i >= from && i < to ? [{ type: TYPE, attributes }] : undefined
	));

	test('a span with its own case counts as styling a paragraph style replaces', () => {
		expect(countInlineParagraphStyleConflicts(formats(10, 2, 6, { 'data-textcase': 'uppercase' }), 0, 10, TYPE)).toBe(1);
		// Legacy style-only span
		expect(countInlineParagraphStyleConflicts(formats(10, 2, 6, { style: 'text-transform: uppercase' }), 0, 10, TYPE)).toBe(1);
	});

	test('applying a style in the block strips the span case so the class shows', () => {
		// After the style span was applied around a span with its own case
		const html = '<span class="typost-styled typost-ps-3" data-style-id="3">'
			+ '<span class="typost-styled" data-textcase="uppercase" style="text-transform: uppercase; font-variant-caps: normal">Kicker</span>'
			+ '</span>';
		const result = stripParagraphStyleOverrides(html, 0, 6, '3');
		expect(result.stripped).toBe(1);
		expect(result.content).not.toContain('text-transform');
		expect(result.content).not.toContain('data-textcase');
		expect(result.content).toContain('data-style-id="3"');
	});

	test('Detach in the inline editor hands the span case back (inline-shaped state)', () => {
		// The inline editor reports its span case; Detach dispatches
		// buildPropertiesFromState(state) with no style, which the inline
		// handler writes onto the span
		const inlineState = { editorType: 'inline', fontId: 0, fontWeight: '400', features: [], letterSpacing: 0, lineHeight: 0, fontSize: 'inherit', textCase: 'small-caps', fakeSmallCaps: false };
		const detail = psUtils.buildApplyEventDetail(null, 'inline', psUtils.buildPropertiesFromState(inlineState));
		expect(detail.paragraphStyleId).toBe(0);
		expect(detail.properties.textCase).toBe('small-caps');
		expect(detail.properties.fakeSmallCaps).toBe(false);
	});

	test('the inline editor state is compared, so a different span case shows "(modified)"', () => {
		expect(psUtils.isStyleModified({ textCase: '', fakeSmallCaps: true }, { textCase: 'uppercase' })).toBe(true);
		expect(psUtils.isStyleModified({ textCase: 'uppercase', fakeSmallCaps: true }, { textCase: 'uppercase' })).toBe(false);
	});
});

describe('Convert to block carries the case', () => {
	test('a whole-block conversion gives the block the case', () => {
		const attrs = buildConvertBlockAttributes({
			partialSelection: false,
			isNewBlock: true,
			content: 'Kicker',
			tagName: 'h2',
			state: { selectedFeatures: [], textCase: 'all-small-caps', fakeSmallCaps: false },
		});
		expect(attrs.textCase).toBe('all-small-caps');
		expect(attrs.fakeSmallCaps).toBe(false);
	});

	test('fakeSmallCaps is stored only as false, with a small caps value', () => {
		const convert = (state) => buildConvertBlockAttributes({ partialSelection: false, isNewBlock: true, content: 'Kicker', tagName: 'h2', state: { selectedFeatures: [], ...state } });
		// An earlier "off" choice left in the modal state does not reach All Caps
		const caps = convert({ textCase: 'uppercase', fakeSmallCaps: false });
		expect(caps.textCase).toBe('uppercase');
		expect(caps).not.toHaveProperty('fakeSmallCaps');
		// Allowed is the block default, so it is not stored
		expect(convert({ textCase: 'small-caps', fakeSmallCaps: true })).not.toHaveProperty('fakeSmallCaps');
	});

	test('an existing block takes both values from the modal, so an old "off" does not stay', () => {
		const update = (state) => buildConvertBlockAttributes({ partialSelection: false, isNewBlock: false, content: 'Kicker', state: { selectedFeatures: [], ...state } });
		expect(update({ textCase: 'small-caps', fakeSmallCaps: true })).toMatchObject({ textCase: 'small-caps', fakeSmallCaps: true });
		expect(update({ textCase: 'all-small-caps', fakeSmallCaps: false })).toMatchObject({ textCase: 'all-small-caps', fakeSmallCaps: false });
		expect(update({ textCase: 'uppercase', fakeSmallCaps: false })).toMatchObject({ textCase: 'uppercase', fakeSmallCaps: true });
		expect(update({})).toMatchObject({ textCase: '', fakeSmallCaps: true });
	});

	test('no case set, no case attributes (Default, byte-identical save)', () => {
		const attrs = buildConvertBlockAttributes({ partialSelection: false, isNewBlock: true, content: 'Kicker', tagName: 'h2', state: { selectedFeatures: [] } });
		expect(attrs).not.toHaveProperty('textCase');
		expect(attrs).not.toHaveProperty('fakeSmallCaps');
	});

	test('a partial conversion leaves the case on the span, not the block', () => {
		const attrs = buildConvertBlockAttributes({ partialSelection: true, isNewBlock: true, content: 'x', tagName: 'h2', state: { textCase: 'uppercase' } });
		expect(attrs).not.toHaveProperty('textCase');
	});
});

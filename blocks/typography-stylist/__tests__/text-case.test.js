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
} from '../utils';

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

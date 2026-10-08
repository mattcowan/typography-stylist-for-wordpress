/**
 * Test Suite: site setting to write new font sizes in px (#248)
 *
 * New content writes rem by default (#233). The Options setting "Write new
 * font sizes in px" (typostData.newFontSizeUnit === 'px') makes new content
 * write px. block.json's fontSizeUnit default stays 'rem', because it also
 * decides how saved blocks parse: a new block stores its unit explicitly
 * when it is created, so blocks saved under either setting keep their unit.
 */

import { create } from 'react-test-renderer';

jest.mock('@wordpress/block-editor');

import save from '../save';
import blockJson from '../block.json';
import { buildInlineFontSizeSpan, getNewFontSizeUnit } from '../utils';

const units = require('../../../assets/js/font-size-units.js');
const { buildConvertBlockAttributes } = require('../../../assets/js/inline-apply-rules.js');
const {
	buildPropertiesFromState,
	buildPropertiesForStyleSave
} = require('../../../paragraph-styles/assets/js/lib/ps-utils.js');

const defaults = Object.fromEntries(
	Object.entries(blockJson.attributes)
		.filter(([, def]) => def.default !== undefined)
		.map(([name, def]) => [name, def.default])
);

// The font-size of the visible copy, as save() renders it
function savedFontSize(attributes) {
	const tree = create(save({ attributes: { ...defaults, ...attributes } })).toJSON();
	return tree.children[1].props.style.fontSize;
}

afterEach(() => {
	delete window.typostData;
});

describe('getNewFontSizeUnit', () => {
	test('rem unless the site asks for px', () => {
		expect(units.getNewFontSizeUnit({ newFontSizeUnit: 'px' })).toBe('px');
		expect(units.getNewFontSizeUnit({ newFontSizeUnit: 'rem' })).toBe('rem');
		expect(units.getNewFontSizeUnit({})).toBe('rem');
		expect(units.getNewFontSizeUnit(null)).toBe('rem');
	});

	test('a stringified flag never reads as px', () => {
		// wp_localize_script() stringifies; only the exact string 'px' counts
		expect(units.getNewFontSizeUnit({ newFontSizeUnit: '1' })).toBe('rem');
		expect(units.getNewFontSizeUnit({ newFontSizeUnit: true })).toBe('rem');
		expect(units.getNewFontSizeUnit({ newFontSizeUnit: 'PX' })).toBe('rem');
	});

	test('reads window.typostData by default', () => {
		expect(getNewFontSizeUnit()).toBe('rem');
		window.typostData = { newFontSizeUnit: 'px' };
		expect(getNewFontSizeUnit()).toBe('px');
		expect(units.getNewFontSizeUnit()).toBe('px');
	});
});

describe('block.json keeps the rem default', () => {
	test('the default does not follow the setting (it decides how saved blocks parse)', () => {
		expect(blockJson.attributes.fontSizeUnit.default).toBe('rem');
	});
});

describe('buildNewBlockUnitVariation (inserter)', () => {
	test('px registers a default inserter variation that stores px', () => {
		expect(units.buildNewBlockUnitVariation('px')).toEqual({
			name: 'typost-new-font-size-unit',
			isDefault: true,
			scope: ['inserter'],
			attributes: { fontSizeUnit: 'px' }
		});
	});

	test('the variation keeps the block title, icon and description', () => {
		const variation = units.buildNewBlockUnitVariation('px');
		expect(variation).not.toHaveProperty('title');
		expect(variation).not.toHaveProperty('icon');
		expect(variation).not.toHaveProperty('description');
	});

	test('rem registers nothing: the block default already is rem', () => {
		expect(units.buildNewBlockUnitVariation('rem')).toBeNull();
		expect(units.buildNewBlockUnitVariation(undefined)).toBeNull();
	});
});

describe('blocks keep the unit they were saved with', () => {
	test('a block inserted under the px setting writes px', () => {
		expect(savedFontSize({ fontSize: 'responsive', fontSizeUnit: 'px' })).toBe('clamp(16px, 2rem + 3vw, 64px)');
	});

	test('a block saved under the rem setting keeps rem after the setting changes to px', () => {
		window.typostData = { newFontSizeUnit: 'px' };
		expect(savedFontSize({ fontSize: 'responsive' })).toBe('clamp(1rem, 2rem + 3vw, 4rem)');
	});

	test('a block saved under the px setting keeps px after the setting changes back', () => {
		window.typostData = { newFontSizeUnit: 'rem' };
		expect(savedFontSize({ fontSize: '24', fontSizeUnit: 'px' })).toBe('24px');
	});
});

describe('Convert to block (inline editor)', () => {
	test('a new block stores the unit, partial and whole selection', () => {
		expect(buildConvertBlockAttributes({
			partialSelection: true, isNewBlock: true, content: 'x', tagName: 'h2', fontSizeUnit: 'px'
		}).fontSizeUnit).toBe('px');
		expect(buildConvertBlockAttributes({
			partialSelection: false, isNewBlock: true, content: 'x', tagName: 'h2', fontSizeUnit: 'px', state: { fontSize: 'responsive' }
		}).fontSizeUnit).toBe('px');
		expect(buildConvertBlockAttributes({
			partialSelection: false, isNewBlock: true, content: 'x', tagName: 'h2', fontSizeUnit: 'rem', state: {}
		}).fontSizeUnit).toBe('rem');
	});

	test('an existing block keeps its own unit', () => {
		expect(buildConvertBlockAttributes({
			partialSelection: true, isNewBlock: false, content: 'x', fontSizeUnit: 'px'
		})).not.toHaveProperty('fontSizeUnit');
		expect(buildConvertBlockAttributes({
			partialSelection: false, isNewBlock: false, content: 'x', fontSizeUnit: 'px', state: {}
		})).not.toHaveProperty('fontSizeUnit');
	});

	test('no unit given leaves the block default', () => {
		expect(buildConvertBlockAttributes({
			partialSelection: true, isNewBlock: true, content: 'x', tagName: 'h2'
		})).not.toHaveProperty('fontSizeUnit');
	});
});

describe('inline spans', () => {
	test('QFT writes new sizes in the site unit', () => {
		expect(buildInlineFontSizeSpan('responsive', 16, 32, 64, 'px').fontSize).toBe('clamp(16px, 2rem + 3vw, 64px)');
		expect(buildInlineFontSizeSpan('24', 16, 32, 64, 'px').fontSize).toBe('24px');
		expect(buildInlineFontSizeSpan('24', 16, 32, 64, 'rem').fontSize).toBe('1.5rem');
		// Default stays rem (#233)
		expect(buildInlineFontSizeSpan('24', 16, 32, 64).fontSize).toBe('1.5rem');
	});

	test('the inline editor rebuild: new sizes take the site unit, existing sizes keep theirs', () => {
		const { resolveSpanFontSizeUnit } = units;
		expect(resolveSpanFontSizeUnit({ sizeChanged: true, newUnit: 'px' })).toBe('px');
		expect(resolveSpanFontSizeUnit({ sizeChanged: false, newUnit: 'px' })).toBe('px');
		// A rem span the author did not touch stays rem under the px setting
		expect(resolveSpanFontSizeUnit({ sizeChanged: false, spanStyle: 'font-size: 1.5rem', newUnit: 'px' })).toBe('rem');
		// …and a px span stays px under the rem setting
		expect(resolveSpanFontSizeUnit({ sizeChanged: false, spanStyle: 'font-size: 24px', newUnit: 'rem' })).toBe('px');
		// A rem style's span keeps the style's unit on Detach
		const styles = [{ id: 4, properties: { fontSize: '24', fontSizeUnit: 'rem' } }];
		expect(resolveSpanFontSizeUnit({ sizeChanged: false, styleId: 4, styles, newUnit: 'px' })).toBe('rem');
	});
});

describe('paragraph styles', () => {
	test('a new style stores the site unit', () => {
		expect(buildPropertiesFromState({ fontSize: '24' }, 'px').fontSizeUnit).toBe('px');
		expect(buildPropertiesFromState({ fontSize: '24' }, 'rem').fontSizeUnit).toBe('rem');
		expect(buildPropertiesFromState({ fontSize: '24' }).fontSizeUnit).toBe('rem');
		expect(buildPropertiesFromState({ fontSize: 'inherit' }, 'px')).not.toHaveProperty('fontSizeUnit');
	});

	test('Save as New takes the site unit, even from a rem style', () => {
		const base = { fontSize: '24', fontSizeUnit: 'rem' };
		expect(buildPropertiesForStyleSave({ fontSize: '24' }, base, false, 'px').fontSizeUnit).toBe('px');
	});

	test('Update Style keeps a sized style\'s own unit under either setting', () => {
		expect(buildPropertiesForStyleSave({ fontSize: '28' }, { fontSize: '24', fontSizeUnit: 'rem' }, true, 'px').fontSizeUnit).toBe('rem');
		expect(buildPropertiesForStyleSave({ fontSize: '28' }, { fontSize: '24', fontSizeUnit: 'px' }, true, 'rem').fontSizeUnit).toBe('px');
		expect(buildPropertiesForStyleSave({ fontSize: '28' }, { fontSize: '24' }, true, 'rem').fontSizeUnit).toBe('px');
	});

	test('Update Style on a style with no size takes the site unit', () => {
		expect(buildPropertiesForStyleSave({ fontSize: '24' }, { fontWeight: '700' }, true, 'px').fontSizeUnit).toBe('px');
	});
});

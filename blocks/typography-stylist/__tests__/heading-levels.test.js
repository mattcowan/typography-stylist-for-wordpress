/**
 * Test Suite: the heading level button and menu (#409)
 *
 * The button shows the icon of the block's tag and names the tag; the menu
 * lists the eight tags with icon and name. The icons are placeholders until
 * the swash artwork arrives, so these tests hold the structure the artwork
 * drops into, not the path data.
 */

import { create } from 'react-test-renderer';

jest.mock(
	'@wordpress/components',
	() => ({
		ToolbarGroup: function ToolbarGroup() {
			return null;
		},
		ToolbarDropdownMenu: function ToolbarDropdownMenu() {
			return null;
		}
	}),
	{ virtual: true }
);

import {
	HEADING_LEVEL_ICON_PATHS,
	HEADING_LEVEL_ICON_VIEWBOX,
	renderHeadingLevelIcon,
	getHeadingLevels,
	findHeadingLevel,
	getHeadingLevelButton
} from '../heading-levels';
import renderHeadingLevelToolbar, { buildHeadingLevelControls } from '../components/heading-level-toolbar';

const { HEADING_LEVEL_TAGS, REMEMBERED_TAG_STORAGE_KEY } = require('../../../assets/js/new-block-tag.js');

const NAMES = {
	h1: 'Heading 1',
	h2: 'Heading 2',
	h3: 'Heading 3',
	h4: 'Heading 4',
	h5: 'Heading 5',
	h6: 'Heading 6',
	p: 'Paragraph',
	div: 'Div'
};

// The path data an icon element draws
const pathOf = (icon) => icon.props.children.props.d;

afterEach(() => {
	window.localStorage.clear();
	delete window.wp;
});

describe('the tag list', () => {
	test('lists the shared tags in menu order, with the menu\'s names', () => {
		expect(getHeadingLevels().map((level) => level.value)).toEqual(HEADING_LEVEL_TAGS);
		getHeadingLevels().forEach((level) => {
			expect(level.name).toBe(NAMES[level.value]);
		});
	});

	test('has an icon for each tag, and no icon for anything else', () => {
		expect(Object.keys(HEADING_LEVEL_ICON_PATHS).sort()).toEqual([...HEADING_LEVEL_TAGS].sort());
		getHeadingLevels().forEach((level) => {
			expect(pathOf(level.icon)).toBe(HEADING_LEVEL_ICON_PATHS[level.value]);
		});
	});

	test('each tag has its own icon (Heading 1 is not Heading 6)', () => {
		const paths = HEADING_LEVEL_TAGS.map((tag) => HEADING_LEVEL_ICON_PATHS[tag]);
		expect(new Set(paths).size).toBe(HEADING_LEVEL_TAGS.length);
		// A path starts with a move; an exported `d` may use the relative "m"
		paths.forEach((d) => expect(d).toMatch(/^[Mm]/));
	});

	test('findHeadingLevel', () => {
		expect(findHeadingLevel('h4').name).toBe('Heading 4');
		expect(findHeadingLevel('section')).toBeNull();
		expect(findHeadingLevel(undefined)).toBeNull();
		expect(findHeadingLevel('toString')).toBeNull();
	});
});

describe('renderHeadingLevelIcon', () => {
	test.each(HEADING_LEVEL_TAGS)('%s: a 24 x 24 SVG in currentColor, hidden from the accessibility tree', (tag) => {
		const tree = create(renderHeadingLevelIcon(tag)).toJSON();
		expect(tree.type).toBe('svg');
		expect(tree.props).toEqual(expect.objectContaining({
			width: 24,
			height: 24,
			viewBox: HEADING_LEVEL_ICON_VIEWBOX,
			'aria-hidden': 'true',
			focusable: 'false'
		}));
		expect(tree.children).toHaveLength(1);
		expect(tree.children[0].type).toBe('path');
		expect(tree.children[0].props.fill).toBe('currentColor');
		expect(tree.children[0].props.d).toBe(HEADING_LEVEL_ICON_PATHS[tag]);
	});

	test('the viewBox is the one of the "T", "G" and "P"', () => {
		expect(HEADING_LEVEL_ICON_VIEWBOX).toBe('0 0 256 256');
	});

	test.each([['section'], [''], [undefined], ['toString'], ['__proto__']])('%p has no icon', (tag) => {
		expect(renderHeadingLevelIcon(tag)).toBeNull();
	});
});

describe('getHeadingLevelButton', () => {
	test.each(HEADING_LEVEL_TAGS)('%s: the button shows the tag\'s icon and names the tag', (tag) => {
		const button = getHeadingLevelButton(tag);
		expect(pathOf(button.icon)).toBe(HEADING_LEVEL_ICON_PATHS[tag]);
		expect(button.label).toBe(`Change heading level (current: ${NAMES[tag]})`);
	});

	test('after a pick the button follows the new tag', () => {
		expect(pathOf(getHeadingLevelButton('h2').icon)).not.toBe(pathOf(getHeadingLevelButton('h4').icon));
	});

	test('no stored tag is the block.json default, Heading 2', () => {
		expect(getHeadingLevelButton(undefined).label).toContain('Heading 2');
		expect(getHeadingLevelButton('').label).toContain('Heading 2');
		expect(pathOf(getHeadingLevelButton(null).icon)).toBe(HEADING_LEVEL_ICON_PATHS.h2);
	});

	test('a tag outside the menu keeps the old dashicon and names the stored value', () => {
		const button = getHeadingLevelButton('section');
		expect(button.icon).toBe('heading');
		expect(button.label).toBe('Change heading level (current: section)');
	});
});

describe('buildHeadingLevelControls', () => {
	test('eight items with icon and name; only the current tag is active', () => {
		const controls = buildHeadingLevelControls('h3', () => {});
		expect(controls.map((c) => c.title)).toEqual(HEADING_LEVEL_TAGS.map((tag) => NAMES[tag]));
		expect(controls.map((c) => c.isActive)).toEqual([false, false, true, false, false, false, false, false]);
		controls.forEach((control, i) => {
			expect(pathOf(control.icon)).toBe(HEADING_LEVEL_ICON_PATHS[HEADING_LEVEL_TAGS[i]]);
			expect(control.role).toBe('menuitemradio');
		});
	});

	test('a tag outside the menu marks no item', () => {
		expect(buildHeadingLevelControls('section', () => {}).some((c) => c.isActive)).toBe(false);
	});

	test('each item writes its tagName, as before', () => {
		const setAttributes = jest.fn();
		buildHeadingLevelControls('h2', setAttributes).forEach((control) => control.onClick());
		expect(setAttributes.mock.calls.map((call) => call[0])).toEqual(HEADING_LEVEL_TAGS.map((tagName) => ({ tagName })));
	});

	test('a pick is remembered for the next block, except Heading 1', () => {
		const controls = buildHeadingLevelControls('h2', () => {});
		const byTag = (tag) => controls[HEADING_LEVEL_TAGS.indexOf(tag)];
		byTag('h4').onClick();
		expect(window.localStorage.getItem(REMEMBERED_TAG_STORAGE_KEY)).toBe('h4');
		byTag('h1').onClick();
		expect(window.localStorage.getItem(REMEMBERED_TAG_STORAGE_KEY)).toBe('h4');
		byTag('div').onClick();
		expect(window.localStorage.getItem(REMEMBERED_TAG_STORAGE_KEY)).toBe('div');
	});

	test('a pick updates the inserter variation at once', () => {
		const registered = [];
		window.wp = {
			blocks: {
				getBlockVariations: () => registered.slice(),
				registerBlockVariation: (name, variation) => registered.push(variation),
				unregisterBlockVariation: (name, variationName) => {
					const i = registered.findIndex((v) => v.name === variationName);
					if (i !== -1) {
						registered.splice(i, 1);
					}
				}
			}
		};
		buildHeadingLevelControls('h2', () => {})[4].onClick();
		expect(registered.map((v) => v.attributes)).toEqual([{ tagName: 'h5' }]);
	});

	test('storage that throws: the tag is still written to the block', () => {
		const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
		Object.defineProperty(window, 'localStorage', {
			configurable: true,
			get() {
				throw new Error('SecurityError');
			}
		});
		const setAttributes = jest.fn();
		try {
			expect(() => buildHeadingLevelControls('h2', setAttributes)[3].onClick()).not.toThrow();
		} finally {
			if (descriptor) {
				Object.defineProperty(window, 'localStorage', descriptor);
			} else {
				delete window.localStorage;
			}
		}
		expect(setAttributes).toHaveBeenCalledWith({ tagName: 'h4' });
	});
});

describe('renderHeadingLevelToolbar', () => {
	test('one toolbar group with the menu; the menu keeps its old name', () => {
		const group = renderHeadingLevelToolbar({ tagName: 'h4', setAttributes: () => {} });
		expect(group.type.name).toBe('ToolbarGroup');
		const menu = group.props.children;
		expect(menu.type.name).toBe('ToolbarDropdownMenu');
		expect(menu.props.label).toBe('Change heading level (current: Heading 4)');
		expect(pathOf(menu.props.icon)).toBe(HEADING_LEVEL_ICON_PATHS.h4);
		expect(menu.props.menuProps).toEqual({ 'aria-label': 'Change heading level' });
		expect(menu.props.controls).toHaveLength(8);
	});
});

describe('edit.js', () => {
	const fs = require('fs');
	const path = require('path');
	const edit = fs.readFileSync(path.join(__dirname, '..', 'edit.js'), 'utf8');

	test('renders the heading level menu with one call', () => {
		// The call, however it is formatted (the import line has no "(")
		expect(edit.match(/renderHeadingLevelToolbar\(/g)).toHaveLength(1);
	});

	test('no longer builds the menu inline', () => {
		expect(edit).not.toMatch(/icon="heading"/);
		expect(edit).not.toMatch(/__\('Heading 1'/);
	});
});

/**
 * Detach on a Typography Stylist block whose text keeps the theme's size
 * (#364): the Line indent stays in em, because the block's CSS resolves it
 * against the text's own size, and the padding takes theme.json's size when
 * the canvas proves it, else px at the size measured now, as before.
 *
 * @jest-environment jsdom
 */

const fs = require('fs');
const path = require('path');
const {
	buildDetachBlockSettings,
	themeTextSizeCss,
	readThemeTextSizeBasis,
} = require('../assets/js/lib/ps-utils');

// A style with no size of its own, as on the test site's case in the issue
const STYLE = { spaceBefore: '1em', indentStart: '2em', indentEnd: '1em', firstLineIndent: '1.5em' };
// The Typography Stylist route's options for a block with an inherited size
const TYPOST = { textIndent: true, keepMarginEm: true, textIndentInEm: true, fontSizePx: 40.2, emBasis: '' };
const PRESET = 'var(--wp--preset--font-size--x-large)';

describe('buildDetachBlockSettings with the theme\'s text size (#364)', () => {
	it('keeps the first line indent in em, and the padding in px when theme.json gives no size', () => {
		const result = buildDetachBlockSettings(STYLE, {}, TYPOST);
		expect(result.attributes.style).toEqual({
			spacing: { margin: { top: '1em' }, padding: { left: '80.4px', right: '40.2px' } },
			typography: { textIndent: '1.5em' },
		});
		// Only the padding was converted; the notice says so and nothing else
		expect(result.emConverted).toBe(true);
		expect(result.followsTextSize).toBe(false);
	});

	it('says nothing when only the first line indent stays, since it stays in em', () => {
		const result = buildDetachBlockSettings({ firstLineIndent: '1.5em' }, {}, TYPOST);
		expect(result.attributes.style).toEqual({ typography: { textIndent: '1.5em' } });
		expect(result.emConverted).toBe(false);
		expect(result.followsTextSize).toBe(false);
		expect(result.removed).toEqual([]);
	});

	it('multiplies the padding by theme.json\'s size when the canvas proved it', () => {
		const result = buildDetachBlockSettings(STYLE, {}, Object.assign({}, TYPOST, { themeEmBasis: PRESET }));
		expect(result.attributes.style).toEqual({
			spacing: { margin: { top: '1em' }, padding: { left: `calc(2 * ${PRESET})`, right: `calc(1 * ${PRESET})` } },
			typography: { textIndent: '1.5em' },
		});
		// calc() shows empty in core's sidebar: that notice sentence applies
		expect(result.followsTextSize).toBe(true);
		expect(result.emConverted).toBe(false);
	});

	it('multiplies a fixed theme.json size in its unit, as a fixed block size does', () => {
		const result = buildDetachBlockSettings(STYLE, {}, Object.assign({}, TYPOST, { themeEmBasis: '2.25rem' }));
		expect(result.attributes.style.spacing.padding).toEqual({ left: '4.5rem', right: '2.25rem' });
		expect(result.followsTextSize).toBe(false);
		expect(result.emConverted).toBe(false);
	});

	it('writes the left indent to the right padding in right-to-left text', () => {
		const result = buildDetachBlockSettings({ indentStart: '2em' }, {}, Object.assign({}, TYPOST, { isRtl: true, themeEmBasis: PRESET }));
		expect(result.attributes.style.spacing.padding).toEqual({ right: `calc(2 * ${PRESET})` });
	});

	it.each([[''], [undefined], ['keep'], ['bogus'], ['0rem'], ['50%'], [12]])('theme basis %p gives px, as before', (themeEmBasis) => {
		const result = buildDetachBlockSettings({ indentStart: '2em' }, {}, Object.assign({}, TYPOST, { themeEmBasis }));
		expect(result.attributes.style.spacing.padding.left).toBe('80.4px');
		expect(result.emConverted).toBe(true);
	});

	it('changes nothing for a block with its own size: the #363 basis wins', () => {
		const own = Object.assign({}, TYPOST, { emBasis: '20px', themeEmBasis: PRESET });
		expect(buildDetachBlockSettings(STYLE, {}, own).attributes.style).toEqual({
			spacing: { margin: { top: '1em' }, padding: { left: '40px', right: '20px' } },
			typography: { textIndent: '30px' },
		});
		const responsive = Object.assign({}, TYPOST, { emBasis: 'clamp(1rem, 2rem + 3vw, 4rem)', themeEmBasis: PRESET });
		expect(buildDetachBlockSettings({ firstLineIndent: '1.5em' }, {}, responsive).attributes.style.typography.textIndent)
			.toBe('calc(1.5 * clamp(1rem, 2rem + 3vw, 4rem))');
	});

	it('changes nothing when the style had a size of its own: the text then was not at the theme\'s size', () => {
		const result = buildDetachBlockSettings(Object.assign({ fontSize: '24' }, STYLE), {}, Object.assign({}, TYPOST, { themeEmBasis: PRESET }));
		expect(result.attributes.style).toEqual({
			spacing: { margin: { top: '1em' }, padding: { left: '80.4px', right: '40.2px' } },
			typography: { textIndent: '60.3px' },
		});
		expect(result.followsTextSize).toBe(false);
	});

	it('changes nothing on a core block, which does not pass the options and always has a basis', () => {
		const core = { textIndent: true, fontSizePx: 20, emBasis: 'keep', coreBlock: true };
		expect(buildDetachBlockSettings({ firstLineIndent: '1.5em', indentStart: '2em' }, {}, core).attributes.style)
			.toEqual({ spacing: { padding: { left: '2em' } }, typography: { textIndent: '1.5em' } });
	});

	it('without textIndentInEm the first line indent is px at the measured size, as before #364', () => {
		const result = buildDetachBlockSettings({ firstLineIndent: '1.5em' }, {}, Object.assign({}, TYPOST, { textIndentInEm: false }));
		expect(result.attributes.style.typography.textIndent).toBe('60.3px');
		expect(result.emConverted).toBe(true);
	});

	it('keeps a fit block as before: no indents, no first line indent', () => {
		const result = buildDetachBlockSettings(STYLE, {}, Object.assign({}, TYPOST, { isFit: true, themeEmBasis: PRESET }));
		expect(result.attributes.style).toEqual({ spacing: { margin: { top: '1em' } } });
	});

	it('does not overwrite the block\'s own Line indent or padding', () => {
		const result = buildDetachBlockSettings(STYLE, { style: { typography: { textIndent: '10px' }, spacing: { padding: { left: '3px' } } } }, Object.assign({}, TYPOST, { themeEmBasis: PRESET }));
		expect(result.attributes.style.typography).toEqual({ textIndent: '10px' });
		expect(result.attributes.style.spacing.padding).toEqual({ left: '3px', right: `calc(1 * ${PRESET})` });
	});
});

describe('themeTextSizeCss (#364)', () => {
	const ELEMENTS = {
		typography: { fontSize: 'var:preset|font-size|medium' },
		elements: {
			heading: { typography: { fontSize: '2rem' } },
			h2: { typography: { fontSize: 'var:preset|font-size|x-large' } },
			h4: { typography: { fontSize: 'clamp(1.1rem, 1.1rem + ((1vw - 0.2rem) * 0.767), 1.5rem)' } },
		},
	};

	it('maps a preset reference to its custom property, as core\'s style engine does', () => {
		expect(themeTextSizeCss(ELEMENTS, {}, 'h2')).toBe(PRESET);
		expect(themeTextSizeCss(ELEMENTS, {}, 'H2')).toBe(PRESET);
		expect(themeTextSizeCss({ elements: { h1: { typography: { fontSize: 'var:preset|font-size|xxLarge' } } } }, {}, 'h1'))
			.toBe('var(--wp--preset--font-size--xx-large)');
	});

	it('takes the heading element when the tag has none, and the root size for a paragraph', () => {
		expect(themeTextSizeCss(ELEMENTS, {}, 'h3')).toBe('2rem');
		expect(themeTextSizeCss(ELEMENTS, {}, 'p')).toBe('var(--wp--preset--font-size--medium)');
		expect(themeTextSizeCss(ELEMENTS, {}, 'h4')).toBe('clamp(1.1rem, 1.1rem + ((1vw - 0.2rem) * 0.767), 1.5rem)');
	});

	it('gives nothing without a usable size', () => {
		for (const [styles, tag] of [
			[null, 'h2'], [{}, 'h2'], [ELEMENTS, 'div'], [ELEMENTS, ''], [{ elements: { h2: { typography: { fontSize: '150%' } } } }, 'h2'],
			[{ elements: { h2: { typography: { fontSize: { ref: 'styles.elements.h1.typography.fontSize' } } } } }, 'h2'],
			[{ elements: { h2: { typography: { fontSize: '  ' } } } }, 'h2'], [{ elements: { h2: 'x' } }, 'h2'],
		]) {
			expect(themeTextSizeCss(styles, {}, tag)).toBe('');
		}
	});

	it('makes a plain size fluid as core does when fluid typography is on', () => {
		const calls = [];
		const fluid = (args) => {
			calls.push(args);
			return 'clamp(2.5rem, 2rem + 2vw, 3.625rem)';
		};
		const styles = { elements: { h1: { typography: { fontSize: '3.625rem' } } } };
		const features = { typography: { fluid: true }, layout: { wideSize: '1200px' } };
		expect(themeTextSizeCss(styles, features, 'h1', fluid)).toBe('clamp(2.5rem, 2rem + 2vw, 3.625rem)');
		// Core's getTypographyFontSizeValue() arguments
		expect(calls[0]).toEqual({ minimumFontSize: undefined, maximumFontSize: undefined, fontSize: '3.625rem', minimumFontSizeLimit: undefined, maximumViewportWidth: '1200px', minimumViewportWidth: undefined });
		// An object's own maximum wins over the wide size
		themeTextSizeCss(styles, { typography: { fluid: { maxViewportWidth: '1600px', minFontSize: '15px' } }, layout: { wideSize: '1200px' } }, 'h1', fluid);
		expect(calls[1]).toEqual({ minimumFontSize: undefined, maximumFontSize: undefined, fontSize: '3.625rem', minimumFontSizeLimit: '15px', maximumViewportWidth: '1600px', minimumViewportWidth: undefined });
	});

	describe('a preset', () => {
		const FEATURES = {
			typography: {
				fluid: true,
				fontSizes: {
					default: [{ slug: 'small', size: '13px' }, { slug: 'x-large', size: '42px' }],
					theme: [{ slug: 'small', size: '0.875rem', fluid: false }, { slug: 'x-large', size: '1.75rem', fluid: { min: '1.75rem', max: '2rem' } }],
				},
			},
			layout: { wideSize: '1340px' },
		};
		const clampOf = (args) => `clamp(${args.minimumFontSize}, x, ${args.maximumFontSize})`;

		it('that is not fluid gives its length, which Detach multiplies like a fixed size', () => {
			const styles = { elements: { h5: { typography: { fontSize: 'var:preset|font-size|small' } } } };
			expect(themeTextSizeCss(styles, FEATURES, 'h5', clampOf)).toBe('0.875rem');
			// The var() form the core data store returns, too
			expect(themeTextSizeCss({ elements: { h5: { typography: { fontSize: 'var(--wp--preset--font-size--small)' } } } }, FEATURES, 'h5', clampOf)).toBe('0.875rem');
		});

		it('that is fluid stays the custom property', () => {
			const calls = [];
			const styles = { elements: { h2: { typography: { fontSize: 'var(--wp--preset--font-size--x-large)' } } } };
			expect(themeTextSizeCss(styles, FEATURES, 'h2', (a) => { calls.push(a); return clampOf(a); })).toBe(PRESET);
			expect(calls[0]).toMatchObject({ minimumFontSize: '1.75rem', maximumFontSize: '2rem', fontSize: '1.75rem', maximumViewportWidth: '1340px' });
		});

		it('that is unknown, or with no fluid function, stays the custom property unless its size is plain', () => {
			expect(themeTextSizeCss({ elements: { h2: { typography: { fontSize: 'var:preset|font-size|huge' } } } }, FEATURES, 'h2', clampOf))
				.toBe('var(--wp--preset--font-size--huge)');
			expect(themeTextSizeCss({ elements: { h2: { typography: { fontSize: 'var:preset|font-size|x-large' } } } }, FEATURES, 'h2')).toBe('1.75rem');
			// Fluid off for the site: a preset without its own fluid setting is its size
			expect(themeTextSizeCss({ elements: { h2: { typography: { fontSize: 'var:preset|font-size|small' } } } }, { typography: { fontSizes: [{ slug: 'small', size: '13px' }] } }, 'h2', clampOf)).toBe('13px');
		});
	});

	it.each([
		// Core's getTypographyValueAndUnit(): a finite number is px; a string is
		// coerced by isFinite() the same way; then digits with rem, px or em
		[1200, 1200],
		[1200.5, 1200.5],
		['1200', '1200'],
		['1200px', '1200px'],
		['75rem', '75rem'],
		['80em', '80em'],
		['0', '0'],
		// Rejected: the maximum is then left to core's default. Core takes the
		// wide size only when it is truthy, so the number 0 is rejected
		[0, undefined],
		[' 1200px', undefined],
		['1200px ', undefined],
		['100vw', undefined],
		['-1200px', undefined],
		['1e3', undefined],
		['', undefined],
		[Infinity, undefined],
		[NaN, undefined],
		[true, undefined],
		[null, undefined],
	])('takes the wide size %p as the maximum viewport only where core does (%p)', (wideSize, expected) => {
		const calls = [];
		themeTextSizeCss({ elements: { h1: { typography: { fontSize: '3rem' } } } }, { typography: { fluid: true }, layout: { wideSize } }, 'h1', (a) => {
			calls.push(a);
			return 'clamp(1rem, 1vw, 3rem)';
		});
		expect(calls[0].maximumViewportWidth).toBe(expected);
	});

	it('keeps the size when fluid typography is off, or core gives no fluid value', () => {
		const styles = { elements: { h1: { typography: { fontSize: '3.625rem' } } } };
		const never = () => { throw new Error('not called'); };
		expect(themeTextSizeCss(styles, { typography: { fluid: false } }, 'h1', never)).toBe('3.625rem');
		expect(themeTextSizeCss(styles, { typography: { fluid: {} } }, 'h1', never)).toBe('3.625rem');
		expect(themeTextSizeCss(styles, { typography: { fluid: true } }, 'h1', () => null)).toBe('3.625rem');
		expect(themeTextSizeCss(styles, { typography: { fluid: true } }, 'h1', never)).toBe('3.625rem');
		expect(themeTextSizeCss(styles, { typography: { fluid: true } }, 'h1')).toBe('3.625rem');
	});
});

describe('readThemeTextSizeBasis (#364)', () => {
	let styles;
	let computed;
	let core;
	beforeEach(() => {
		styles = { elements: { h2: { typography: { fontSize: 'var:preset|font-size|x-large' } } } };
		computed = { text: '40px', probe: '40px' };
		core = null;
		window.wp = {
			data: {
				select: (name) => (name === 'core' ? core : { getSettings: () => ({ __experimentalStyles: styles, __experimentalFeatures: {} }) }),
			},
			blockEditor: {},
		};
		document.body.innerHTML = '<div data-block="a" class="wp-block-typost"><h2 class="typost-block-content">x</h2></div>';
		// jsdom resolves neither var() nor calc(); stand in for the browser's values
		jest.spyOn(window, 'getComputedStyle').mockImplementation((el) => (
			el.classList.contains('typost-block-content') ? { fontSize: computed.text } : { paddingLeft: computed.probe, fontSize: '16px' }
		));
	});
	afterEach(() => {
		jest.restoreAllMocks();
		delete window.wp;
		document.body.innerHTML = '';
	});

	it('returns theme.json\'s size when the probe resolves it to the text\'s size, and removes the probe', () => {
		expect(readThemeTextSizeBasis('a')).toBe(PRESET);
		expect(document.querySelector('[data-block="a"]').children).toHaveLength(1);
	});

	it('accepts a probe within 0.1px', () => {
		computed.probe = '40.06px';
		expect(readThemeTextSizeBasis('a')).toBe(PRESET);
	});

	it('rejects a probe larger than the text by more than 0.1px, not only a smaller one', () => {
		computed.text = '40px';
		computed.probe = '40.2px';
		expect(readThemeTextSizeBasis('a')).toBe('');
		computed.probe = '39.8px';
		expect(readThemeTextSizeBasis('a')).toBe('');
	});

	it('returns nothing when the probe disagrees: the theme sets the size in its own CSS', () => {
		computed.probe = '35px';
		expect(readThemeTextSizeBasis('a')).toBe('');
		expect(document.querySelector('[data-block="a"]').children).toHaveLength(1);
	});

	it('reads the core data store\'s global styles where the editor sets no __experimentalStyles (WordPress 7.1)', () => {
		styles = undefined;
		const base = { styles: { elements: { heading: { typography: { fontSize: '1rem' } }, h2: { typography: { fontSize: PRESET } } } } };
		let user = {};
		core = {
			__experimentalGetCurrentThemeBaseGlobalStyles: () => base,
			__experimentalGetCurrentGlobalStylesId: () => 7,
			getEditedEntityRecord: (kind, name, id) => (kind === 'root' && name === 'globalStyles' && id === 7 ? { styles: user } : null),
		};
		expect(readThemeTextSizeBasis('a')).toBe(PRESET);
		// The Site Editor's user styles win, as on the page
		user = { elements: { h2: { typography: { fontSize: 'var:preset|font-size|huge' } } } };
		expect(readThemeTextSizeBasis('a')).toBe('var(--wp--preset--font-size--huge)');
		// A user record that sets something else on the element keeps the
		// theme's size: the merge is deep, as core's
		user = { elements: { h2: { color: { text: 'red' } } } };
		expect(readThemeTextSizeBasis('a')).toBe(PRESET);
		// A record not loaded yet reads as missing: px then
		core.__experimentalGetCurrentThemeBaseGlobalStyles = () => undefined;
		user = undefined;
		expect(readThemeTextSizeBasis('a')).toBe('');
		core.__experimentalGetCurrentThemeBaseGlobalStyles = () => { throw new Error('no store'); };
		expect(readThemeTextSizeBasis('a')).toBe('');
	});

	it('returns nothing without theme.json styles, a tag size, a rendered block or a client id', () => {
		styles = null;
		expect(readThemeTextSizeBasis('a')).toBe('');
		styles = { elements: {} };
		expect(readThemeTextSizeBasis('a')).toBe('');
		styles = { elements: { h2: { typography: { fontSize: 'var:preset|font-size|x-large' } } } };
		expect(readThemeTextSizeBasis('missing')).toBe('');
		expect(readThemeTextSizeBasis('')).toBe('');
		document.body.innerHTML = '<div data-block="a"><p>no visual copy</p></div>';
		expect(readThemeTextSizeBasis('a')).toBe('');
	});

	it('returns nothing outside the block editor', () => {
		delete window.wp;
		expect(readThemeTextSizeBasis('a')).toBe('');
	});
});

describe('the Typography Stylist Detach route (#364)', () => {
	const source = fs.readFileSync(path.join(__dirname, '../../blocks/typography-stylist/hooks/use-apply-block-properties.js'), 'utf8');
	const start = source.indexOf('.buildDetachBlockSettings(');
	const call = source.slice(start, source.indexOf(');', start));

	it('says the Line indent resolves em against the text, and passes the checked theme size only when the block has no size', () => {
		expect(start).toBeGreaterThan(-1);
		expect(call).toMatch(/textIndentInEm: true/);
		expect(call).toMatch(/themeEmBasis: !detachEmBasis && psUtils\.readThemeTextSizeBasis \? psUtils\.readThemeTextSizeBasis\(curClientId\) : ''/);
	});

	it('the core block route passes neither, so it is unchanged', () => {
		const editor = fs.readFileSync(path.join(__dirname, '../assets/js/editor.js'), 'utf8');
		const at = editor.indexOf('.buildDetachBlockSettings(');
		const coreCall = editor.slice(at, editor.indexOf(');', at));
		expect(coreCall).not.toMatch(/textIndentInEm|themeEmBasis/);
	});
});

/**
 * The span of a partial "Convert to Typography Stylist Block" (#454).
 *
 * The span carries the attributes that the block's Quick Feature Toggles
 * write for the same settings (data-font-id, data-fontweight,
 * data-fontstyle, data-letterspacing, data-lineheight,
 * data-font-variation-settings), and a raw feature value ("salt" 2) in
 * data-feature-settings, as the inline editor keeps it. The branch for
 * plain text and the branch for text with tags build the span from the same
 * attribute map, so they write the same attributes.
 */

const { buildConvertSpanParts, buildPartialConvertContent } = require('../inline-editor/convert-to-block.js');
const utils = require('../../../blocks/typography-stylist/utils.js');

const BASE_STATE = {
	selectedFeatures: [],
	selectedFont: '',
	selectedFontId: 0,
	fontSize: 'inherit',
	fontSizeMin: 16,
	fontSizePreferred: 24,
	fontSizeMax: 32,
	fontWeight: '400',
	fontStyle: '',
	textCase: '',
	fakeSmallCaps: true,
	letterSpacing: 0,
	lineHeight: 0,
	paragraphStyleId: 0,
	animationId: 0,
	fontVariationSettings: '',
};

// Every setting the span can carry
const FULL_STATE = Object.assign({}, BASE_STATE, {
	selectedFeatures: ['dlig', 'salt'],
	selectedFont: 'Bookmania',
	selectedFontId: 7,
	fontStyle: 'italic',
	letterSpacing: 25,
	lineHeight: 1.2,
	fontSize: 'responsive',
	textCase: 'small-caps',
	fakeSmallCaps: false,
	fontVariationSettings: '"wght" 650, "opsz" 36',
});
const RAW = '"salt" 2';

function spanOf(html) {
	const holder = document.createElement('div');
	holder.innerHTML = html;
	return holder.querySelector('span.typost-styled');
}

function attributesOf(span) {
	return span.getAttributeNames().map((name) => [ name, span.getAttribute(name) ]);
}

function convert(args) {
	return buildPartialConvertContent(Object.assign({
		spanWeight: '700',
		sizeUnit: 'rem',
		clearWeight: false,
		shared: utils,
		rawFeatureSettings: RAW,
		state: FULL_STATE,
	}, args));
}

describe('partial Convert span attributes (#454)', () => {
	test('plain text: the span has the attributes the Quick Feature Toggles write', () => {
		const span = spanOf(convert({ existingContent: 'Moonlit garden party', fullText: 'Moonlit garden party', start: 8, end: 14, shared: undefined }));
		expect(span.getAttribute('data-font-id')).toBe('7');
		expect(span.getAttribute('data-fontweight')).toBe('700');
		expect(span.getAttribute('data-fontstyle')).toBe('italic');
		expect(span.getAttribute('data-letterspacing')).toBe('25');
		expect(span.getAttribute('data-lineheight')).toBe('1.2');
		expect(span.getAttribute('data-font-variation-settings')).toBe('"wght" 650, "opsz" 36');
		expect(span.getAttribute('data-features')).toBe('dlig,salt');
		expect(span.getAttribute('data-feature-settings')).toBe('"salt" 2');
		expect(span.style.fontStyle).toBe('italic');
		expect(span.style.fontVariationSettings).toBe('"wght" 650, "opsz" 36');
		// The raw value keeps "salt" 2; only the tag it does not cover gets 1
		expect(span.style.fontFeatureSettings).toBe('"salt" 2, "dlig" 1');
		expect(span.textContent).toBe('garden');
	});

	test('the block reads the font, the weight and the other settings back from the span', () => {
		const content = convert({ existingContent: 'Moonlit garden party', fullText: 'Moonlit garden party', start: 8, end: 14, shared: undefined });
		const read = utils.parseInlineStylesAtCursor(content, 8, 14);
		expect(read.fontId).toBe('7');
		expect(read.fontWeight).toBe('700');
		expect(read.explicitFontStyle).toBe('italic');
		expect(read.letterSpacing).toBe(25);
		expect(read.lineHeight).toBe(1.2);
		expect(read.fontVariationSettings).toBe('"wght" 650, "opsz" 36');
	});

	test('both branches write the same attributes for the same settings', () => {
		const plain = spanOf(convert({ existingContent: 'Moonlit garden party', fullText: 'Moonlit garden party', start: 8, end: 14, shared: undefined }));
		const tagged = spanOf(convert({ existingContent: 'Moonlit garden <em>party</em>', fullText: 'Moonlit garden party', start: 8, end: 14 }));
		expect(tagged.textContent).toBe('garden');
		expect(attributesOf(tagged)).toEqual(attributesOf(plain));
		// Each branch with the settings of buildConvertSpanParts(), nothing more
		const parts = buildConvertSpanParts(FULL_STATE, '700', 'rem', RAW);
		expect(attributesOf(plain)).toEqual([ [ 'class', 'typost-styled' ] ].concat(Object.entries(parts.attributes), [ [ 'style', parts.styleString ] ]));
	});

	test('both branches write the same attributes for a feature, a case and a size only', () => {
		const state = Object.assign({}, BASE_STATE, { selectedFeatures: ['dlig'], textCase: 'uppercase', fontSize: 'responsive' });
		const args = { state: state, spanWeight: '', rawFeatureSettings: '' };
		const plain = spanOf(convert(Object.assign({ existingContent: 'Moonlit garden party', fullText: 'Moonlit garden party', start: 8, end: 14, shared: undefined }, args)));
		const tagged = spanOf(convert(Object.assign({ existingContent: '<strong>Moonlit</strong> garden party', fullText: 'Moonlit garden party', start: 8, end: 14 }, args)));
		expect(attributesOf(tagged)).toEqual(attributesOf(plain));
		expect(plain.hasAttribute('data-font-id')).toBe(false);
		expect(plain.hasAttribute('data-fontweight')).toBe(false);
		expect(plain.hasAttribute('data-feature-settings')).toBe(false);
	});

	// The plain-text branch serializes the span itself (it does not need the
	// shared applier); for text with &, <, > and quotes, its content is the
	// content the shared applier writes on the same text, byte for byte
	test('plain text: the content is the shared applier\'s on the escaped text', () => {
		const text = 'Fish & <chips> "party" \'n\' more';
		const escaped = 'Fish &amp; &lt;chips&gt; "party" \'n\' more';
		const content = convert({ existingContent: escaped, fullText: text, start: 5, end: 22, shared: undefined });
		const parts = buildConvertSpanParts(FULL_STATE, '700', 'rem', RAW);
		const applied = utils.applyStylingSafeStringMethod(escaped, 5, 22, Object.assign({}, parts.attributes), parts.styleString);
		expect(applied.success).toBe(true);
		expect(content).toBe(applied.content);
		expect(spanOf(content).textContent).toBe('& <chips> "party"');
	});

	test('data-features is sanitized and escaped in both branches', () => {
		const state = Object.assign({}, BASE_STATE, { selectedFeatures: ['dl"ig<b>', 'ss01;', '"><img src=x>'] });
		const args = { state: state, spanWeight: '', rawFeatureSettings: '' };
		const plainHtml = convert(Object.assign({ existingContent: 'Moonlit garden party', fullText: 'Moonlit garden party', start: 8, end: 14, shared: undefined }, args));
		const taggedHtml = convert(Object.assign({ existingContent: 'Moonlit garden <em>party</em>', fullText: 'Moonlit garden party', start: 8, end: 14 }, args));
		[ plainHtml, taggedHtml ].forEach((html) => {
			const holder = document.createElement('div');
			holder.innerHTML = html;
			expect(holder.querySelector('img')).toBeNull();
			const span = spanOf(html);
			expect(span.getAttributeNames()).toEqual([ 'class', 'data-features', 'style' ]);
			expect(span.getAttribute('data-features')).toBe('dligb,ss01,img src=x');
			expect(span.textContent).toBe('garden');
		});
	});

	test('a raw feature value cannot add a declaration, and invalid axes are dropped', () => {
		const state = Object.assign({}, BASE_STATE, { fontVariationSettings: '"wght" 700; color: red' });
		const parts = buildConvertSpanParts(state, '', 'rem', '"salt" 2; color: red');
		expect(parts.attributes['data-feature-settings']).toBe('"salt" 2 color: red');
		expect(parts.styleString).not.toContain(';');
		expect(parts.attributes).not.toHaveProperty('data-font-variation-settings');
		expect(parts.styleString).not.toContain('font-variation-settings');
	});

	// convertToBlock() reads the raw value from the selection's format (at
	// the saved bounds when the modal took the selection) and passes it on
	test('convertToBlock() passes the selection\'s raw feature value to the span', () => {
		const React = require('react');
		const created = [];
		const savedWp = global.wp;
		const savedData = global.typostData;
		let edit = null;
		const format = { type: 'typost/features', attributes: { 'data-features': 'salt', 'data-feature-settings': '"salt" 2' } };
		const block = { clientId: 'b1', name: 'core/paragraph', attributes: { content: 'Moonlit garden party' } };
		global.typostData = { features: [], presets: [], customFonts: [], paragraphStyles: [] };
		global.wp = {
			richText: {
				registerFormatType: (name, settings) => { edit = settings.edit; },
				applyFormat: (value) => value,
				removeFormat: (value) => value,
				getActiveFormat: () => undefined,
				slice: (value) => value,
				getTextContent: (value) => (value && value.text) || '',
			},
			blockEditor: {},
			element: { Component: React.Component, Fragment: React.Fragment, createElement: React.createElement },
			components: { Modal: () => null },
			i18n: { __: (text) => text, sprintf: (text) => text, isRTL: () => false },
			compose: { compose: () => (component) => component, debounce: (fn) => fn },
			data: {
				withSelect: () => (component) => component,
				select: () => ({
					getSelectedBlockClientId: () => 'b1',
					getBlock: (id) => (id === 'b1' ? block : null),
					getSelectedBlock: () => null,
				}),
				dispatch: () => ({ replaceBlocks: () => {}, updateBlockAttributes: () => {}, createInfoNotice: () => {} }),
			},
			blocks: { createBlock: (name, attributes) => { created.push(attributes); return { name, attributes }; } },
		};
		try {
			jest.isolateModules(() => {
				require('../block-editor.js');
			});
			const Control = edit({}).type;
			// The modal took the selection: the live value is a caret, the
			// saved bounds hold "garden", and the format is at the saved start
			const formats = [];
			for (let i = 8; i < 14; i++) {
				formats[i] = [ format ];
			}
			const self = Object.create(Control.prototype);
			self.props = { value: { text: 'Moonlit garden party', formats, start: 3, end: 3 } };
			self.state = Object.assign({}, BASE_STATE, { selectedFeatures: ['salt'], savedSelectionStart: 8, savedSelectionEnd: 14 });
			self._pendingChanges = { keys: new Set(), featureToggles: [] };
			self._clearWeight = false;
			self._authorPickedWeight = false;
			self.getBlockInheritedWeight = () => '';
			self.getExplicitFontWeight = () => '';
			self.getEffectiveFontWeight = () => '400';
			self.getZoomNoticeUnit = () => 'rem';
			self.setState = () => {};
			jest.useFakeTimers();
			self.convertToBlock();
			jest.useRealTimers();
			expect(created).toHaveLength(1);
			const span = spanOf(created[0].content);
			expect(span.textContent).toBe('garden');
			expect(span.getAttribute('data-feature-settings')).toBe('"salt" 2');
			expect(span.style.fontFeatureSettings).toBe('"salt" 2');
		} finally {
			global.wp = savedWp;
			global.typostData = savedData;
		}
	});

	test('no settings: no data attributes, and an empty raw value or a zero spacing writes nothing', () => {
		const parts = buildConvertSpanParts(BASE_STATE, '', 'rem', '');
		expect(parts.attributes).toEqual({});
		expect(parts.styleString).toBe('');
		const nonNumeric = buildConvertSpanParts(Object.assign({}, BASE_STATE, { letterSpacing: 'wide', lineHeight: 'tall', selectedFontId: 'abc', selectedFeatures: undefined, fontStyle: null, fontVariationSettings: null }), '', 'rem', undefined);
		expect(nonNumeric.attributes).toEqual({});
		expect(nonNumeric.styleString).toBe('');
	});
});

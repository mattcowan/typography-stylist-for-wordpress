/**
 * Tests for the pure font-loader helpers: CSS @font-face parsing,
 * URL/face selection, and binary format sniffing.
 */

const {
	parseSrcUrls,
	formatFromUrl,
	pickBestUrl,
	pickFaceForWeight,
	sniffFormat
} = require('../assets/js/lib/font-loader.js');

describe('parseSrcUrls', () => {
	test('parses a typical webfont kit @font-face block', () => {
		const css = `
			@font-face {
				font-family: 'Esmeralda Pro';
				src: url('/wp-content/uploads/typography-stylist/fonts/kit-1/fonts/Esmeralda.woff2') format('woff2'),
				     url('/wp-content/uploads/typography-stylist/fonts/kit-1/fonts/Esmeralda.woff') format('woff');
				font-weight: 400;
				font-style: normal;
			}
		`;
		const faces = parseSrcUrls(css);
		expect(faces).toHaveLength(1);
		expect(faces[0].family).toBe('Esmeralda Pro');
		expect(faces[0].weight).toBe('400');
		expect(faces[0].style).toBe('normal');
		expect(faces[0].urls).toEqual([
			{ url: '/wp-content/uploads/typography-stylist/fonts/kit-1/fonts/Esmeralda.woff2', format: 'woff2' },
			{ url: '/wp-content/uploads/typography-stylist/fonts/kit-1/fonts/Esmeralda.woff', format: 'woff' }
		]);
	});

	test('multiple faces (weights) in one kit', () => {
		const css = `
			@font-face { font-family: X; src: url(a-regular.woff2) format('woff2'); font-weight: 400; }
			@font-face { font-family: X; src: url(a-bold.woff2) format('woff2'); font-weight: 700; }
		`;
		const faces = parseSrcUrls(css);
		expect(faces).toHaveLength(2);
		expect(faces[1].weight).toBe('700');
	});

	test('infers format from extension when format() hint missing', () => {
		const faces = parseSrcUrls('@font-face { font-family: Y; src: url(font.woff2); }');
		expect(faces[0].urls[0].format).toBe('woff2');
	});

	test('skips data: URIs', () => {
		const faces = parseSrcUrls('@font-face { font-family: Z; src: url(data:font/woff2;base64,AAAA) format("woff2"), url(z.woff) format("woff"); }');
		expect(faces[0].urls).toHaveLength(1);
		expect(faces[0].urls[0].url).toBe('z.woff');
	});

	test('faces without urls are dropped; empty/invalid input', () => {
		expect(parseSrcUrls('@font-face { font-family: NoSrc; }')).toEqual([]);
		expect(parseSrcUrls('')).toEqual([]);
		expect(parseSrcUrls(null)).toEqual([]);
	});
});

describe('formatFromUrl', () => {
	test('maps extensions, ignoring query strings', () => {
		expect(formatFromUrl('a/b.woff2?v=3')).toBe('woff2');
		expect(formatFromUrl('a/b.woff')).toBe('woff');
		expect(formatFromUrl('a/b.ttf#x')).toBe('truetype');
		expect(formatFromUrl('a/b.otf')).toBe('opentype');
		expect(formatFromUrl('a/b.eot')).toBe('embedded-opentype');
		expect(formatFromUrl('a/b.svg')).toBe('');
	});
});

describe('pickBestUrl', () => {
	test('prefers woff2 over woff over ttf', () => {
		const urls = [
			{ url: 'f.ttf', format: 'truetype' },
			{ url: 'f.woff', format: 'woff' },
			{ url: 'f.woff2', format: 'woff2' }
		];
		expect(pickBestUrl(urls).url).toBe('f.woff2');
	});

	test('excludes EOT/unknown formats', () => {
		expect(pickBestUrl([{ url: 'f.eot', format: 'embedded-opentype' }])).toBeNull();
		expect(pickBestUrl([])).toBeNull();
	});
});

describe('pickFaceForWeight', () => {
	const faces = [
		{ family: 'X', weight: '400', style: 'normal', urls: [] },
		{ family: 'X', weight: '700', style: 'italic', urls: [] },
		{ family: 'X', weight: '700', style: 'normal', urls: [] }
	];

	test('exact weight + normal style preferred', () => {
		expect(pickFaceForWeight(faces, '700').style).toBe('normal');
	});

	test('normal/bold keywords normalize to 400/700', () => {
		expect(pickFaceForWeight(faces, 'bold').weight).toBe('700');
		expect(pickFaceForWeight(faces, 'normal').weight).toBe('400');
	});

	test('falls back to first face for unmatched weight', () => {
		expect(pickFaceForWeight(faces, '300')).toBe(faces[0]);
	});

	test('empty faces → null', () => {
		expect(pickFaceForWeight([], '400')).toBeNull();
	});
});

describe('sniffFormat', () => {
	function bufferWithTag(bytes) {
		const buffer = new ArrayBuffer(8);
		const view = new DataView(buffer);
		bytes.forEach((b, i) => view.setUint8(i, b));
		return buffer;
	}

	test('detects WOFF2 (wOF2)', () => {
		expect(sniffFormat(bufferWithTag([0x77, 0x4F, 0x46, 0x32]))).toBe('woff2');
	});

	test('detects WOFF (wOFF)', () => {
		expect(sniffFormat(bufferWithTag([0x77, 0x4F, 0x46, 0x46]))).toBe('woff');
	});

	test('detects SFNT variants (TTF, OTTO, true)', () => {
		expect(sniffFormat(bufferWithTag([0x00, 0x01, 0x00, 0x00]))).toBe('sfnt');
		expect(sniffFormat(bufferWithTag([0x4F, 0x54, 0x54, 0x4F]))).toBe('sfnt');
		expect(sniffFormat(bufferWithTag([0x74, 0x72, 0x75, 0x65]))).toBe('sfnt');
	});

	test('unknown/too-short buffers', () => {
		expect(sniffFormat(bufferWithTag([0x4D, 0x5A, 0x00, 0x00]))).toBe('unknown');
		expect(sniffFormat(new ArrayBuffer(2))).toBe('unknown');
		expect(sniffFormat(null)).toBe('unknown');
	});
});

/**
 * Tests for the pure font-loader helpers: CSS @font-face parsing,
 * URL/face selection, and binary format sniffing.
 */

const {
	parseSrcUrls,
	formatFromUrl,
	normalizeFetchUrl,
	pickBestUrl,
	pickFaceForWeight,
	sniffFormat
} = require('../assets/js/lib/font-loader.js');

describe('normalizeFetchUrl', () => {
	const httpsPage = { protocol: 'https:', host: 'mnc4.com' };
	const httpPage = { protocol: 'http:', host: 'mnc4.com' };

	test('upgrades a same-host http:// font URL to https on an HTTPS page', () => {
		expect(normalizeFetchUrl(
			'http://mnc4.com/bus1984/wp-content/uploads/typography-stylist/fonts/kit-1/font.woff2',
			httpsPage
		)).toBe('https://mnc4.com/bus1984/wp-content/uploads/typography-stylist/fonts/kit-1/font.woff2');
	});

	test('leaves a cross-origin http:// URL untouched (other origin may not serve HTTPS)', () => {
		const url = 'http://cdn.example.com/font.woff2';
		expect(normalizeFetchUrl(url, httpsPage)).toBe(url);
	});

	test('does not change URLs when the page is not HTTPS', () => {
		const url = 'http://mnc4.com/font.woff2';
		expect(normalizeFetchUrl(url, httpPage)).toBe(url);
	});

	test('leaves already-secure, protocol-relative, and root-relative URLs as-is', () => {
		expect(normalizeFetchUrl('https://mnc4.com/font.woff2', httpsPage)).toBe('https://mnc4.com/font.woff2');
		expect(normalizeFetchUrl('//mnc4.com/font.woff2', httpsPage)).toBe('//mnc4.com/font.woff2');
		expect(normalizeFetchUrl('/wp-content/uploads/font.woff2', httpsPage)).toBe('/wp-content/uploads/font.woff2');
	});

	test('returns non-string and malformed input unchanged', () => {
		expect(normalizeFetchUrl(null, httpsPage)).toBe(null);
		expect(normalizeFetchUrl('http://', httpsPage)).toBe('http://');
	});
});

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

	// Variable fonts: the plugin's generated @font-face CSS (font-only ZIP
	// uploads) emits format('truetype-variations') / format('woff2-variations')
	// and a font-weight range. These must normalize to the base format so
	// pickBestUrl() doesn't discard the only available file (the "No readable
	// font file" bug for variable fonts).
	test('normalizes -variations format hints to the base format', () => {
		const css = `
			@font-face {
				font-family: 'Fraunces';
				src: url('fonts/fraunces.ttf') format('truetype-variations');
				font-weight: 100 900;
				font-style: normal;
			}
		`;
		const faces = parseSrcUrls(css);
		expect(faces).toHaveLength(1);
		expect(faces[0].weight).toBe('100 900');
		expect(faces[0].urls).toEqual([
			{ url: 'fonts/fraunces.ttf', format: 'truetype' }
		]);
	});

	test('normalizes woff2-variations and CSS4 space syntax', () => {
		const faces = parseSrcUrls(
			"@font-face { font-family: A; src: url(a.woff2) format('woff2-variations'); }" +
			"@font-face { font-family: B; src: url(b.woff2) format('woff2 variations'); }"
		);
		expect(faces[0].urls[0].format).toBe('woff2');
		expect(faces[1].urls[0].format).toBe('woff2');
	});

	test('variable font face survives pickBestUrl (regression: no-file error)', () => {
		const faces = parseSrcUrls(
			"@font-face { font-family: 'EB Garamond'; src: url('fonts/eb-garamond.ttf') format('truetype-variations'); font-weight: 400 800; }"
		);
		const best = pickBestUrl(faces[0].urls);
		expect(best).not.toBeNull();
		expect(best.url).toBe('fonts/eb-garamond.ttf');
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

describe('failure classification (tagError / errorReason / errorDetail)', () => {
	const { tagError, errorReason, errorDetail } = require('../assets/js/lib/font-loader.js');

	test('tagError attaches a reason and returns the same error', () => {
		const err = new Error('Failed to load http://x/vendor/opentype.min.js');
		expect(tagError(err, 'vendor-load-failed')).toBe(err);
		expect(err.typostReason).toBe('vendor-load-failed');
	});

	test('tagError does not overwrite an existing reason (innermost tag wins)', () => {
		const err = tagError(new Error('boom'), 'decompress-failed');
		tagError(err, 'vendor-load-failed');
		expect(err.typostReason).toBe('decompress-failed');
	});

	test('tagError tolerates null/undefined errors', () => {
		expect(tagError(null, 'vendor-load-failed')).toBe(null);
		expect(tagError(undefined, 'vendor-load-failed')).toBe(undefined);
	});

	test('errorReason reads the tag and defaults untagged errors to parse-failed', () => {
		expect(errorReason(tagError(new Error('x'), 'vendor-load-failed'))).toBe('vendor-load-failed');
		expect(errorReason(tagError(new Error('x'), 'decompress-failed'))).toBe('decompress-failed');
		expect(errorReason(new Error('opentype threw'))).toBe('parse-failed');
		expect(errorReason(null)).toBe('parse-failed');
	});

	test('errorDetail returns the message or an empty string', () => {
		expect(errorDetail(new Error('Failed to load x'))).toBe('Failed to load x');
		expect(errorDetail(null)).toBe('');
		expect(errorDetail({})).toBe('');
	});
});

describe('shouldFallBackToMainThread', () => {
	const { shouldFallBackToMainThread } = require('../assets/js/lib/font-loader.js');

	test('falls back when the worker was unavailable or timed out (null result)', () => {
		expect(shouldFallBackToMainThread(null)).toBe(true);
		expect(shouldFallBackToMainThread(undefined)).toBe(true);
	});

	test('falls back on worker-internal vendor load failures (may be worker-specific, e.g. CSP)', () => {
		expect(shouldFallBackToMainThread({ ok: false, reason: 'vendor-load-failed' })).toBe(true);
	});

	test('treats genuine parse and decompress failures as definitive (main thread would just repeat them)', () => {
		expect(shouldFallBackToMainThread({ ok: false, reason: 'parse-failed' })).toBe(false);
		expect(shouldFallBackToMainThread({ ok: false, reason: 'decompress-failed' })).toBe(false);
	});

	test('does not fall back on success', () => {
		expect(shouldFallBackToMainThread({ ok: true, meta: {} })).toBe(false);
	});
});

describe('resetLoaderState', () => {
	const { resetLoaderState } = require('../assets/js/lib/font-loader.js');

	test('is exported and safe to call outside a browser (no worker state)', () => {
		expect(typeof resetLoaderState).toBe('function');
		expect(() => resetLoaderState()).not.toThrow();
	});
});

describe('resolveFontFile (adobe): family matching', () => {
	const { resolveFontFile } = require('../assets/js/lib/font-loader.js');

	const kitCss = [
		'@font-face { font-family: "alpha-vf"; font-weight: 400; src: url(https://use.typekit.net/af/alpha.woff2) format("woff2"); }',
		'@font-face { font-family: "beta-vf"; font-weight: 400; src: url(https://use.typekit.net/af/beta.woff2) format("woff2"); }'
	].join('\n');

	beforeEach(() => {
		global.fetch = jest.fn().mockResolvedValue({
			ok: true,
			text: () => Promise.resolve(kitCss)
		});
	});

	afterEach(() => {
		delete global.fetch;
	});

	test('matches the entry font_family (singular, per-family entries)', async () => {
		const result = await resolveFontFile({
			source: 'adobe',
			entry: { css_url: 'https://use.typekit.net/kit.css', font_family: 'beta-vf' }
		});
		expect(result.ok).toBe(true);
		expect(result.url).toBe('https://use.typekit.net/af/beta.woff2');
	});

	test('still honors legacy font_families arrays', async () => {
		const result = await resolveFontFile({
			source: 'adobe',
			entry: { css_url: 'https://use.typekit.net/kit.css', font_families: ['beta-vf'] }
		});
		expect(result.ok).toBe(true);
		expect(result.url).toBe('https://use.typekit.net/af/beta.woff2');
	});

	test('falls back to the first face when the entry names no family', async () => {
		const result = await resolveFontFile({
			source: 'adobe',
			entry: { css_url: 'https://use.typekit.net/kit.css' }
		});
		expect(result.ok).toBe(true);
		expect(result.url).toBe('https://use.typekit.net/af/alpha.woff2');
	});
});

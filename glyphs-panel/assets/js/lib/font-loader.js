/**
 * Glyphs Panel — Font Loading Pipeline
 *
 * Resolves a font file URL per font source, fetches the binary, decompresses
 * WOFF2 when needed (wawoff2), and parses it with opentype.js. Vendor
 * libraries are lazy-loaded only when the panel first needs them.
 *
 * The parsed binary is used for METADATA extraction only (see metadata.js)
 * and discarded immediately — no outline data is retained.
 *
 * Every failure is returned as a value ({ok: false, reason}) so the UI can
 * show a notice instead of breaking:
 *   'no-file'            — no fetchable file URL for this font source
 *   'cors'               — cross-origin fetch blocked
 *   'fetch-failed'       — network/HTTP error
 *   'unsupported-format' — not WOFF2/WOFF/TTF/OTF (e.g. EOT-only kit)
 *   'parse-failed'       — binary could not be parsed
 *
 * Pure helpers (parseSrcUrls, pickBestUrl, pickFaceForWeight, sniffFormat)
 * are unit-tested; the fetch/vendor orchestration is browser-only.
 *
 * Dual export: window.typostGlyphs.* for the browser, module.exports for Jest.
 */
(function() {
	'use strict';

	var FORMAT_PREFERENCE = { woff2: 0, woff: 1, truetype: 2, ttf: 2, opentype: 3, otf: 3 };

	/**
	 * Parse @font-face blocks out of CSS text.
	 *
	 * @param {string} cssContent CSS containing @font-face rules
	 * @return {Array<{family: string, weight: string, style: string,
	 *                 urls: Array<{url: string, format: string}>}>}
	 */
	function parseSrcUrls(cssContent) {
		if (!cssContent || typeof cssContent !== 'string') {
			return [];
		}
		var faces = [];
		var faceRegex = /@font-face\s*\{((?:[^{}]+|\{[^{}]*\})*)\}/gi;
		var faceMatch;

		while ((faceMatch = faceRegex.exec(cssContent)) !== null) {
			var body = faceMatch[1];

			var familyMatch = body.match(/font-family\s*:\s*['"]?([^'";]+)['"]?\s*;?/i);
			var weightMatch = body.match(/font-weight\s*:\s*([^;]+);?/i);
			var styleMatch = body.match(/font-style\s*:\s*([^;]+);?/i);

			var urls = [];
			var srcRegex = /url\(\s*['"]?([^'")]+)['"]?\s*\)(?:\s*format\(\s*['"]?([^'")]+)['"]?\s*\))?/gi;
			var srcMatch;
			while ((srcMatch = srcRegex.exec(body)) !== null) {
				var url = srcMatch[1].trim();
				// Skip data URIs and IE-only ?#iefix variants
				if (url.indexOf('data:') === 0) {
					continue;
				}
				urls.push({
					url: url,
					format: (srcMatch[2] || formatFromUrl(url)).toLowerCase()
				});
			}

			if (urls.length > 0) {
				faces.push({
					family: familyMatch ? familyMatch[1].trim() : '',
					weight: weightMatch ? weightMatch[1].trim() : 'normal',
					style: styleMatch ? styleMatch[1].trim() : 'normal',
					urls: urls
				});
			}
		}
		return faces;
	}

	/**
	 * Guess the font format from a URL's extension.
	 *
	 * @param {string} url Font file URL
	 * @return {string} Format keyword ('woff2', 'woff', 'truetype', ...)
	 */
	function formatFromUrl(url) {
		var clean = (url || '').split(/[?#]/)[0].toLowerCase();
		if (/\.woff2$/.test(clean)) return 'woff2';
		if (/\.woff$/.test(clean)) return 'woff';
		if (/\.ttf$/.test(clean)) return 'truetype';
		if (/\.otf$/.test(clean)) return 'opentype';
		if (/\.eot$/.test(clean)) return 'embedded-opentype';
		return '';
	}

	/**
	 * Pick the best parseable URL from a face's src list.
	 * Preference: woff2 > woff > ttf > otf. EOT/unknown are excluded.
	 *
	 * @param {Array<{url: string, format: string}>} urls
	 * @return {{url: string, format: string}|null}
	 */
	function pickBestUrl(urls) {
		var candidates = (urls || []).filter(function(entry) {
			return FORMAT_PREFERENCE[entry.format] !== undefined;
		});
		candidates.sort(function(a, b) {
			return FORMAT_PREFERENCE[a.format] - FORMAT_PREFERENCE[b.format];
		});
		return candidates[0] || null;
	}

	/**
	 * Pick the face best matching a requested weight.
	 * Prefers exact weight + normal style, then exact weight, then first face.
	 *
	 * @param {Array} faces  Parsed faces from parseSrcUrls()
	 * @param {string|number} weight Requested weight ('400', 700, 'normal')
	 * @return {Object|null}
	 */
	function pickFaceForWeight(faces, weight) {
		if (!faces || faces.length === 0) {
			return null;
		}
		var want = normalizeWeight(weight);
		var exactNormal = null;
		var exact = null;
		for (var i = 0; i < faces.length; i++) {
			var w = normalizeWeight(faces[i].weight);
			if (w === want) {
				if (/normal/i.test(faces[i].style || 'normal') && !exactNormal) {
					exactNormal = faces[i];
				}
				if (!exact) {
					exact = faces[i];
				}
			}
		}
		return exactNormal || exact || faces[0];
	}

	function normalizeWeight(weight) {
		var w = String(weight || '').trim().toLowerCase();
		if (w === 'normal' || w === '') return '400';
		if (w === 'bold') return '700';
		// Variable font ranges like '100 900' → match anything (use first token)
		return w.split(/\s+/)[0];
	}

	/**
	 * Sniff a font binary's container format from its first 4 bytes.
	 *
	 * @param {ArrayBuffer} buffer Font file bytes
	 * @return {'woff2'|'woff'|'sfnt'|'unknown'}
	 */
	function sniffFormat(buffer) {
		if (!buffer || buffer.byteLength < 4) {
			return 'unknown';
		}
		var view = new DataView(buffer);
		var tag = view.getUint32(0);
		if (tag === 0x774F4632) return 'woff2';  // 'wOF2'
		if (tag === 0x774F4646) return 'woff';   // 'wOFF'
		if (tag === 0x00010000 || tag === 0x4F54544F || tag === 0x74727565) return 'sfnt'; // TTF / 'OTTO' / 'true'
		return 'unknown';
	}

	// -------------------------------------------------------------------------
	// Browser-only: lazy vendor loading
	// -------------------------------------------------------------------------

	var opentypePromise = null;
	var wawoff2Promise = null;

	function vendorUrls() {
		var data = (typeof window !== 'undefined' && window.typostData && window.typostData.glyphsPanel) || {};
		return data.vendorUrls || {};
	}

	function loadScript(url) {
		return new Promise(function(resolve, reject) {
			var script = document.createElement('script');
			script.src = url;
			script.onload = resolve;
			script.onerror = function() {
				reject(new Error('Failed to load ' + url));
			};
			document.head.appendChild(script);
		});
	}

	function ensureOpentypeLoaded() {
		if (typeof window.opentype !== 'undefined') {
			return Promise.resolve(window.opentype);
		}
		if (!opentypePromise) {
			opentypePromise = loadScript(vendorUrls().opentype).then(function() {
				return window.opentype;
			});
		}
		return opentypePromise;
	}

	/**
	 * Load the wawoff2 Emscripten module (embedded WASM, single file).
	 * Defines a global `Module`; loaded on demand only when a WOFF2 file
	 * actually needs decompressing.
	 */
	function ensureWawoff2Loaded() {
		if (!wawoff2Promise) {
			wawoff2Promise = new Promise(function(resolve, reject) {
				var mod = {
					onRuntimeInitialized: function() {
						resolve(mod);
					}
				};
				// Emscripten classic script picks up the pre-defined global Module
				window.Module = mod;
				loadScript(vendorUrls().wawoff2).catch(reject);
			});
		}
		return wawoff2Promise;
	}

	function decompressWoff2(buffer) {
		return ensureWawoff2Loaded().then(function(mod) {
			var result = mod.decompress(new Uint8Array(buffer));
			if (!result) {
				throw new Error('WOFF2 decompression failed');
			}
			// Copy into a standalone ArrayBuffer for opentype.parse
			return result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength);
		});
	}

	// -------------------------------------------------------------------------
	// Browser-only: per-source file resolution
	// -------------------------------------------------------------------------

	/**
	 * Resolve the best font file URL for a font reference.
	 *
	 * @param {Object} fontRef {source: 'uploaded'|'adobe'|'manual', entry, fontId, weight}
	 * @return {Promise<{ok: true, url: string, partialCoverage: boolean}|{ok: false, reason: string}>}
	 */
	function resolveFontFile(fontRef) {
		var source = fontRef.source;
		var entry = fontRef.entry || {};

		if (source === 'uploaded') {
			var faces = parseSrcUrls(entry.css_content || '');
			var face = pickFaceForWeight(faces, fontRef.weight);
			var best = face && pickBestUrl(face.urls);
			if (!best) {
				return Promise.resolve({ ok: false, reason: 'no-file' });
			}
			return Promise.resolve({ ok: true, url: best.url, partialCoverage: false });
		}

		if (source === 'adobe') {
			if (!entry.css_url) {
				return Promise.resolve({ ok: false, reason: 'no-file' });
			}
			return fetch(entry.css_url, { mode: 'cors' }).then(function(response) {
				// A response that came back but isn't 2xx is an ordinary HTTP
				// failure, not a CORS restriction — classify it as such so the
				// notice isn't misleading.
				if (!response.ok) {
					return { ok: false, reason: 'fetch-failed' };
				}
				return response.text().then(function(cssText) {
					var faces = parseSrcUrls(cssText);
					// Match one of the kit's family names when possible
					var families = (entry.font_families || []).map(function(f) {
						return String(f).toLowerCase();
					});
					var face = faces.filter(function(f) {
						return families.length === 0 || families.indexOf(f.family.toLowerCase()) !== -1;
					})[0] || faces[0];
					var best = face && pickBestUrl(face.urls);
					if (!best) {
						return { ok: false, reason: 'no-file' };
					}
					// Adobe serves dynamically subset files — glyph list may be incomplete
					return { ok: true, url: best.url, partialCoverage: true };
				});
			}).catch(function() {
				// fetch() only rejects on network failure or a blocked
				// cross-origin request — CORS is the dominant cause here.
				return { ok: false, reason: 'cors' };
			});
		}

		if (source === 'manual') {
			var url = findFontFaceUrlInDocument(entry.font_family || '');
			if (!url) {
				return Promise.resolve({ ok: false, reason: 'no-file' });
			}
			return Promise.resolve({ ok: true, url: url, partialCoverage: false });
		}

		if (source === 'wpFontLibrary') {
			// File URLs resolved server-side from merged theme.json fontFace[].src
			// (typost_gp_get_wp_font_files) and shipped as glyphsPanel.wpFontFiles
			var data = (typeof window !== 'undefined' && window.typostData && window.typostData.glyphsPanel) || {};
			var fileFaces = (data.wpFontFiles || {})[entry.slug] || [];
			var faceObjs = fileFaces.map(function(face) {
				return {
					family: '',
					weight: face.weight || 'normal',
					style: face.style || 'normal',
					urls: [{ url: face.url, format: formatFromUrl(face.url) }]
				};
			});
			var wpFace = pickFaceForWeight(faceObjs, fontRef.weight);
			var wpBest = wpFace && pickBestUrl(wpFace.urls);
			if (!wpBest) {
				return Promise.resolve({ ok: false, reason: 'no-file' });
			}
			return Promise.resolve({ ok: true, url: wpBest.url, partialCoverage: false });
		}

		return Promise.resolve({ ok: false, reason: 'no-file' });
	}

	/**
	 * Best-effort @font-face discovery for manual/CDN fonts: walk accessible
	 * stylesheets looking for a rule matching the family name.
	 *
	 * @param {string} fontFamily CSS font-family value (may include fallbacks)
	 * @return {string|null} Font file URL
	 */
	function findFontFaceUrlInDocument(fontFamily) {
		var primary = (fontFamily || '').split(',')[0].replace(/['"]/g, '').trim().toLowerCase();
		if (!primary || typeof document === 'undefined') {
			return null;
		}
		var sheets = document.styleSheets;
		for (var i = 0; i < sheets.length; i++) {
			var rules;
			try {
				rules = sheets[i].cssRules; // throws SecurityError on cross-origin sheets
			} catch (e) {
				continue;
			}
			if (!rules) {
				continue;
			}
			for (var j = 0; j < rules.length; j++) {
				var rule = rules[j];
				if (rule.type !== CSSRule.FONT_FACE_RULE) {
					continue;
				}
				var family = (rule.style.getPropertyValue('font-family') || '').replace(/['"]/g, '').trim().toLowerCase();
				if (family !== primary) {
					continue;
				}
				var faces = parseSrcUrls('@font-face {' + rule.style.cssText + '}');
				var best = faces[0] && pickBestUrl(faces[0].urls);
				if (best) {
					// Resolve relative URLs against the stylesheet's href
					try {
						return new URL(best.url, sheets[i].href || document.baseURI).href;
					} catch (e) {
						return best.url;
					}
				}
			}
		}
		return null;
	}

	// -------------------------------------------------------------------------
	// Browser-only: Web Worker parsing (with main-thread fallback)
	// -------------------------------------------------------------------------

	var workerInstance;          // undefined = not tried, null = unavailable
	var workerSeq = 0;
	var workerPending = {};

	function getWorker() {
		if (workerInstance !== undefined) {
			return workerInstance;
		}
		workerInstance = null;
		try {
			var data = (window.typostData && window.typostData.glyphsPanel) || {};
			if (!data.workerUrl || typeof Worker === 'undefined') {
				return null;
			}
			var worker = new Worker(data.workerUrl);
			worker.onmessage = function(e) {
				var msg = e.data || {};
				var pending = workerPending[msg.id];
				if (pending) {
					delete workerPending[msg.id];
					pending(msg);
				}
			};
			worker.onerror = function() {
				// Resolve all pending parses as unavailable → main-thread fallback
				Object.keys(workerPending).forEach(function(id) {
					var pending = workerPending[id];
					delete workerPending[id];
					pending(null);
				});
			};
			workerInstance = worker;
		} catch (e) {
			workerInstance = null;
		}
		return workerInstance;
	}

	/**
	 * Parse a font buffer to metadata in the worker.
	 * Resolves null when the worker is unavailable, errors, or times out
	 * (caller falls back to main-thread parsing).
	 *
	 * @param {ArrayBuffer} buffer Font bytes (a copy — it is transferred)
	 * @param {Object} info        Metadata info (see buildFontMetadata)
	 * @return {Promise<Object|null>} {ok, meta|reason} or null
	 */
	function parseMetadataInWorker(buffer, info) {
		var worker = getWorker();
		if (!worker) {
			return Promise.resolve(null);
		}
		var data = (window.typostData && window.typostData.glyphsPanel) || {};
		return new Promise(function(resolve) {
			var id = ++workerSeq;
			var timer = setTimeout(function() {
				delete workerPending[id];
				resolve(null);
			}, 30000);
			workerPending[id] = function(msg) {
				clearTimeout(timer);
				resolve(msg);
			};
			try {
				worker.postMessage({
					type: 'parse',
					id: id,
					buffer: buffer,
					vendorUrls: vendorUrls(),
					metadataUrl: data.metadataUrl,
					info: info
				}, [buffer]);
			} catch (e) {
				clearTimeout(timer);
				delete workerPending[id];
				resolve(null);
			}
		});
	}

	/**
	 * Full pipeline to METADATA: resolve → fetch → parse in worker (fallback:
	 * main thread) → buildFontMetadata.
	 *
	 * @param {Object} fontRef {source, entry, fontId, weight}
	 * @param {Object} info    Base metadata info (fontId, source, family,
	 *                         featureLabels, pluginVersion, parsedAt)
	 * @return {Promise<{ok: true, meta: Object}|{ok: false, reason: string}>}
	 */
	function loadAndBuildMetadata(fontRef, info) {
		return resolveFontFile(fontRef).then(function(resolved) {
			if (!resolved.ok) {
				return resolved;
			}
			return fetch(resolved.url, { mode: 'cors' }).then(function(response) {
				if (!response.ok) {
					return { ok: false, reason: 'fetch-failed' };
				}
				return response.arrayBuffer().then(function(buffer) {
					var format = sniffFormat(buffer);
					if (format === 'unknown') {
						return { ok: false, reason: 'unsupported-format' };
					}
					var fullInfo = Object.assign({}, info, {
						fileUrl: resolved.url,
						byteLength: buffer.byteLength,
						partialCoverage: !!resolved.partialCoverage
					});

					// Worker gets a copy (transfer detaches it); the original
					// buffer stays usable for the main-thread fallback
					return parseMetadataInWorker(buffer.slice(0), fullInfo).then(function(workerResult) {
						if (workerResult && workerResult.ok && workerResult.meta) {
							return { ok: true, meta: workerResult.meta };
						}
						if (workerResult && workerResult.ok === false) {
							return workerResult; // definitive parse failure
						}
						// Worker unavailable — parse on the main thread
						var bufferPromise = (format === 'woff2')
							? decompressWoff2(buffer)
							: Promise.resolve(buffer);
						return ensureOpentypeLoaded().then(function(opentype) {
							return bufferPromise.then(function(parseBuffer) {
								var font = opentype.parse(parseBuffer);
								var meta = window.typostGlyphs.buildFontMetadata(font, fullInfo);
								if (!meta) {
									return { ok: false, reason: 'parse-failed' };
								}
								return { ok: true, meta: meta };
							});
						}).catch(function() {
							return { ok: false, reason: 'parse-failed' };
						});
					});
				});
			}).catch(function() {
				return { ok: false, reason: 'cors' };
			});
		});
	}

	/**
	 * Full pipeline: resolve → fetch → sniff → decompress → parse.
	 *
	 * @param {Object} fontRef {source, entry, fontId, weight}
	 * @return {Promise<{ok: true, font: Object, fileUrl: string, byteLength: number,
	 *                   partialCoverage: boolean}|{ok: false, reason: string}>}
	 */
	function loadAndParseFont(fontRef) {
		return resolveFontFile(fontRef).then(function(resolved) {
			if (!resolved.ok) {
				return resolved;
			}
			return fetch(resolved.url, { mode: 'cors' }).then(function(response) {
				if (!response.ok) {
					return { ok: false, reason: 'fetch-failed' };
				}
				return response.arrayBuffer().then(function(buffer) {
					var format = sniffFormat(buffer);
					if (format === 'unknown') {
						return { ok: false, reason: 'unsupported-format' };
					}

					var bufferPromise = (format === 'woff2')
						? decompressWoff2(buffer)
						: Promise.resolve(buffer); // opentype.js parses WOFF + SFNT natively

					return ensureOpentypeLoaded().then(function(opentype) {
						return bufferPromise.then(function(parseBuffer) {
							var font = opentype.parse(parseBuffer);
							return {
								ok: true,
								font: font,
								fileUrl: resolved.url,
								byteLength: buffer.byteLength,
								partialCoverage: !!resolved.partialCoverage
							};
						});
					}).catch(function() {
						return { ok: false, reason: 'parse-failed' };
					});
				});
			}).catch(function() {
				return { ok: false, reason: 'cors' };
			});
		});
	}

	var api = {
		parseSrcUrls: parseSrcUrls,
		formatFromUrl: formatFromUrl,
		pickBestUrl: pickBestUrl,
		pickFaceForWeight: pickFaceForWeight,
		sniffFormat: sniffFormat,
		resolveFontFile: resolveFontFile,
		findFontFaceUrlInDocument: findFontFaceUrlInDocument,
		loadAndParseFont: loadAndParseFont,
		loadAndBuildMetadata: loadAndBuildMetadata
	};

	if (typeof window !== 'undefined') {
		window.typostGlyphs = window.typostGlyphs || {};
		Object.assign(window.typostGlyphs, api);
	}
	if (typeof module !== 'undefined' && module.exports) {
		module.exports = api;
	}
})();

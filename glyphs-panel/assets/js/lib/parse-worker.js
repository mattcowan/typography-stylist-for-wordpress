/**
 * Glyphs Panel — Font Parse Worker
 *
 * Parses font binaries off the main thread: sniff → WOFF2 decompress
 * (wawoff2) → opentype.js parse → buildFontMetadata. Keeps the editor
 * responsive for large fonts.
 *
 * Message in:  { type: 'parse', id, buffer: ArrayBuffer,
 *                vendorUrls: {opentype, wawoff2}, metadataUrl, info }
 * Message out: { id, ok: true, meta } | { id, ok: false, reason, detail }
 *
 * Failure reasons distinguish environment problems from font problems:
 *   'vendor-load-failed' — importScripts of a vendor library failed (404,
 *                          CSP, worker restrictions); never the font's fault
 *   'decompress-failed'  — wawoff2 could not decompress the WOFF2 data
 *   'parse-failed'       — opentype.js could not parse, or no usable cmap
 *
 * Vendor libraries and metadata.js are importScripts'd lazily on first parse.
 * The main thread (font-loader.js) falls back to main-thread parsing when
 * worker creation fails, a parse times out, or this worker reports
 * 'vendor-load-failed' (the page context may still be able to load vendors).
 */
'use strict';

var wawoff2Ready = null;
var scriptsLoaded = false;

// Error tagging (mirrors font-loader.js, which this worker cannot import)
function tagError(err, reason) {
	if (err && !err.typostReason) {
		err.typostReason = reason;
	}
	return err;
}

function errorReason(err) {
	return (err && err.typostReason) || 'parse-failed';
}

function errorDetail(err) {
	return err && err.message ? String(err.message) : '';
}

function ensureWawoff2(url) {
	if (!wawoff2Ready) {
		wawoff2Ready = new Promise(function(resolve, reject) {
			// Emscripten single-file build picks up the pre-defined global Module
			self.Module = {
				onRuntimeInitialized: function() {
					resolve(self.Module);
				}
			};
			try {
				importScripts(url);
			} catch (e) {
				reject(tagError(e, 'vendor-load-failed'));
			}
		});
		// Failed loads must not stick for the worker's lifetime — clearing the
		// memo lets a later retry re-attempt the importScripts
		wawoff2Ready.catch(function() {
			wawoff2Ready = null;
		});
	}
	return wawoff2Ready;
}

self.onmessage = function(e) {
	var msg = e.data || {};
	if (msg.type !== 'parse' || !msg.buffer) {
		return;
	}

	var done = function(result) {
		result.id = msg.id;
		self.postMessage(result);
	};

	try {
		if (!scriptsLoaded) {
			try {
				importScripts(msg.vendorUrls.opentype, msg.metadataUrl);
			} catch (loadErr) {
				done({ ok: false, reason: 'vendor-load-failed', detail: errorDetail(loadErr) });
				return;
			}
			scriptsLoaded = true;
		}

		var view = new DataView(msg.buffer);
		var tag = view.getUint32(0);
		var bufferPromise;
		if (tag === 0x774F4632) { // 'wOF2'
			bufferPromise = ensureWawoff2(msg.vendorUrls.wawoff2).then(function(mod) {
				var out;
				try {
					out = mod.decompress(new Uint8Array(msg.buffer));
				} catch (decompressErr) {
					throw tagError(decompressErr, 'decompress-failed');
				}
				if (!out) {
					throw tagError(new Error('WOFF2 decompression returned no data'), 'decompress-failed');
				}
				return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
			});
		} else {
			bufferPromise = Promise.resolve(msg.buffer);
		}

		bufferPromise.then(function(parseBuffer) {
			var font = self.opentype.parse(parseBuffer);
			var meta = self.typostGlyphs.buildFontMetadata(font, msg.info);
			if (!meta) {
				done({ ok: false, reason: 'parse-failed', detail: 'No character map (cmap) found in font' });
				return;
			}
			done({ ok: true, meta: meta });
		}).catch(function(err) {
			done({ ok: false, reason: errorReason(err), detail: errorDetail(err) });
		});
	} catch (err) {
		done({ ok: false, reason: errorReason(err), detail: errorDetail(err) });
	}
};

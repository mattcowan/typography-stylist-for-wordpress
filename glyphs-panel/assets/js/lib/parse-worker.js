/**
 * Glyphs Panel — Font Parse Worker
 *
 * Parses font binaries off the main thread: sniff → WOFF2 decompress
 * (wawoff2) → opentype.js parse → buildFontMetadata. Keeps the editor
 * responsive for large fonts.
 *
 * Message in:  { type: 'parse', id, buffer: ArrayBuffer,
 *                vendorUrls: {opentype, wawoff2}, metadataUrl, info }
 * Message out: { id, ok: true, meta } | { id, ok: false, reason }
 *
 * Vendor libraries and metadata.js are importScripts'd lazily on first parse.
 * The main thread (font-loader.js) falls back to main-thread parsing when
 * worker creation fails or a parse times out.
 */
'use strict';

var wawoff2Ready = null;
var scriptsLoaded = false;

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
				reject(e);
			}
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
			importScripts(msg.vendorUrls.opentype, msg.metadataUrl);
			scriptsLoaded = true;
		}

		var view = new DataView(msg.buffer);
		var tag = view.getUint32(0);
		var bufferPromise;
		if (tag === 0x774F4632) { // 'wOF2'
			bufferPromise = ensureWawoff2(msg.vendorUrls.wawoff2).then(function(mod) {
				var out = mod.decompress(new Uint8Array(msg.buffer));
				if (!out) {
					throw new Error('WOFF2 decompression failed');
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
				done({ ok: false, reason: 'parse-failed' });
				return;
			}
			done({ ok: true, meta: meta });
		}).catch(function() {
			done({ ok: false, reason: 'parse-failed' });
		});
	} catch (err) {
		done({ ok: false, reason: 'parse-failed' });
	}
};

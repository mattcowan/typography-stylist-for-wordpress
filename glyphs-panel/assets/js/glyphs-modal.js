/**
 * Glyphs Panel — Modal UI
 *
 * Illustrator-style glyph browser: full character grid (windowed for
 * performance), search, Unicode-block filter, OpenType feature filter,
 * hover detail bar, and click-to-insert.
 *
 * Glyph cells are rendered as plain text styled with the already-loaded
 * webfont. Feature alternates render as their base character with
 * font-feature-settings applied — the browser performs the substitution.
 * No outline data is extracted or stored (font EULA safe).
 *
 * Built with wp.element.createElement (no JSX/build step).
 */
(function(wp) {
	'use strict';

	if (!wp || !wp.element) {
		return;
	}

	var el = wp.element.createElement;
	var useState = wp.element.useState;
	var useEffect = wp.element.useEffect;
	var useRef = wp.element.useRef;
	var useMemo = wp.element.useMemo;
	var Fragment = wp.element.Fragment;
	var Modal = wp.components.Modal;
	var Button = wp.components.Button;
	var SelectControl = wp.components.SelectControl;
	var TextControl = wp.components.TextControl;
	var Spinner = wp.components.Spinner;
	var Notice = wp.components.Notice;
	var __ = wp.i18n.__;
	var sprintf = wp.i18n.sprintf;

	var CELL_SIZE = 56;
	var OVERSCAN_ROWS = 3;

	// -------------------------------------------------------------------------
	// Data helpers
	// -------------------------------------------------------------------------

	function G() {
		return window.typostGlyphs || {};
	}

	/**
	 * Build the selectable font list from typostData sources.
	 */
	function getFontSources() {
		var data = window.typostData || {};
		var list = [];

		(data.fonts || []).forEach(function(font) {
			list.push({
				key: 'uploaded:' + font.id,
				source: 'uploaded',
				fontId: parseInt(font.font_id, 10) || 0,
				label: font.name || font.id,
				family: (font.font_faces && font.font_faces[0] && font.font_faces[0].family) || font.name || '',
				fallbacks: font.fallbacks || '',
				entry: font
			});
		});

		(data.adobeFonts || []).forEach(function(font) {
			list.push({
				key: 'adobe:' + font.id,
				source: 'adobe',
				fontId: parseInt(font.font_id, 10) || 0,
				label: (font.name || font.id) + ' — Adobe Fonts',
				family: (font.font_families && font.font_families[0]) || font.name || '',
				fallbacks: font.fallbacks || '',
				entry: font
			});
		});

		(data.manualFonts || []).forEach(function(font) {
			list.push({
				key: 'manual:' + font.id,
				source: 'manual',
				fontId: parseInt(font.font_id, 10) || 0,
				label: font.name || font.id,
				family: (font.font_family || '').split(',')[0].replace(/['"]/g, '').trim() || font.name || '',
				fallbacks: '',
				entry: font
			});
		});

		// WP Font Library fonts (theme + Font Library installs). No numeric
		// font_id / CSS variable — cssFamily is used for insertion instead.
		var glyphsPanel = data.glyphsPanel || {};
		(data.wpFontLibraryFonts || []).forEach(function(font) {
			// Only list fonts we have file URLs for — others can't be parsed
			if (!glyphsPanel.wpFontFiles || !glyphsPanel.wpFontFiles[font.slug]) {
				return;
			}
			list.push({
				key: 'wpFontLibrary:' + font.slug,
				source: 'wpFontLibrary',
				fontId: 0,
				label: font.name + ' — ' + __('WP Font Library', 'typost-glyphs-panel'),
				family: (font.font_family || '').split(',')[0].replace(/['"]/g, '').trim() || font.name || '',
				cssFamily: font.font_family || '',
				fallbacks: '',
				entry: font
			});
		});

		return list;
	}

	function getFeatureLabels() {
		var map = {};
		((window.typostData || {}).features || []).forEach(function(feature) {
			map[feature.id] = feature.name;
		});
		return map;
	}

	function pluginVersion() {
		var data = (window.typostData || {}).glyphsPanel || {};
		return data.version || '';
	}

	/**
	 * Load metadata for a font source: IndexedDB cache first, then
	 * fetch + parse + cache.
	 *
	 * @param {Object} fontSource Entry from getFontSources()
	 * @param {string} weight     Context font weight (face selection)
	 * @param {string} style      Context font style ('italic' loads the italic
	 *                            face — the variant actually rendering at the
	 *                            editor selection)
	 * @param {boolean} forceRefresh Skip the cache
	 * @return {Promise<{ok: true, meta: Object}|{ok: false, reason: string}>}
	 */
	function loadMetadata(fontSource, weight, style, forceRefresh) {
		var lib = G();
		var ref = {
			source: fontSource.source,
			entry: fontSource.entry,
			fontId: fontSource.fontId,
			weight: weight,
			style: style || ''
		};
		var cacheOpts = {
			schema: lib.METADATA_SCHEMA,
			pluginVersion: pluginVersion(),
			now: Date.now()
		};

		return lib.resolveFontFile(ref).then(function(resolved) {
			if (!resolved.ok) {
				return resolved;
			}
			var cacheKey = lib.makeCacheKey(fontSource.fontId, resolved.url);

			var cachedPromise = forceRefresh
				? lib.cache.remove(cacheKey).then(function() { return null; })
				: lib.cache.get(cacheKey);

			return cachedPromise.then(function(cached) {
				if (cached && lib.isValidEntry(cached, cacheOpts)) {
					return { ok: true, meta: cached };
				}
				// Parse in a Web Worker (falls back to the main thread inside)
				return lib.loadAndBuildMetadata(ref, {
					fontId: fontSource.fontId,
					source: fontSource.source,
					family: fontSource.family,
					featureLabels: getFeatureLabels(),
					pluginVersion: pluginVersion(),
					parsedAt: Date.now()
				}).then(function(result) {
					if (!result.ok) {
						return result;
					}
					lib.cache.put(result.meta);
					return result;
				});
			});
		});
	}

	function reasonMessage(reason) {
		var messages = {
			'no-file': __('No readable font file is available for this font source. Glyph browsing works best with uploaded webfont kits.', 'typost-glyphs-panel'),
			'cors': __('The font file could not be fetched (cross-origin restriction). Glyph browsing is unavailable for this font.', 'typost-glyphs-panel'),
			'fetch-failed': __('The font file could not be downloaded. Please try again.', 'typost-glyphs-panel'),
			'unsupported-format': __('This font kit only contains formats that cannot be read for glyph browsing (e.g. EOT).', 'typost-glyphs-panel'),
			'vendor-load-failed': __('The font-parsing libraries bundled with the plugin could not be loaded. This is an installation problem, not a problem with the font — the plugin\'s vendor files may be missing. Try reinstalling the plugin.', 'typost-glyphs-panel'),
			'decompress-failed': __('The font file could not be decompressed. The file may be damaged.', 'typost-glyphs-panel'),
			'parse-failed': __('The font file could not be read. It may be malformed or use unsupported features.', 'typost-glyphs-panel')
		};
		return messages[reason] || messages['parse-failed'];
	}

	// -------------------------------------------------------------------------
	// Modal component
	// -------------------------------------------------------------------------

	function GlyphsModal(props) {
		var source = props.source; // 'inline' | 'qft'
		var context = props.context || {};
		var onClose = props.onClose;
		var lib = G();

		var fonts = useMemo(getFontSources, []);

		// Default to the font active in the editor context. fonts[i].fontId is a
		// number; context.fontId may arrive as a number (block-level) or a string
		// (inline data-font-id), so normalize before comparing.
		var initialKey = useMemo(function() {
			var ctxFontId = parseInt(context.fontId, 10) || 0;
			for (var i = 0; i < fonts.length; i++) {
				if (ctxFontId && fonts[i].fontId === ctxFontId) {
					return fonts[i].key;
				}
			}
			return fonts.length ? fonts[0].key : '';
		}, []); // eslint-disable-line react-hooks/exhaustive-deps

		var selectedKeyState = useState(initialKey);
		var selectedKey = selectedKeyState[0];
		var setSelectedKey = selectedKeyState[1];

		var statusState = useState({ state: fonts.length ? 'loading' : 'empty' });
		var status = statusState[0];
		var setStatus = statusState[1];

		var searchState = useState('');
		var search = searchState[0];
		var setSearch = searchState[1];

		var blockFilterState = useState('all');
		var blockFilter = blockFilterState[0];
		var setBlockFilter = blockFilterState[1];

		var featureFilterState = useState('');
		var featureFilter = featureFilterState[0];
		var setFeatureFilter = featureFilterState[1];

		var hoveredState = useState(null);
		var hovered = hoveredState[0];
		var setHovered = hoveredState[1];

		var insertedMsgState = useState('');
		var insertedMsg = insertedMsgState[0];
		var setInsertedMsg = insertedMsgState[1];

		// Alternates-for-character view: when a character (or short sequence)
		// is entered, the grid shows its feature variants. Pre-filled from the
		// editor selection so a selected glyph opens straight to its
		// alternates instead of the full grid.
		var altCharState = useState(lib.initialAltCharFromSelection(context.selectionText));
		var altChar = altCharState[0];
		var setAltChar = altCharState[1];
		// True until the first metadata load validates the pre-filled value
		var autoAltPendingRef = useRef(!!lib.initialAltCharFromSelection(context.selectionText));

		var scrollTopState = useState(0);
		var scrollTop = scrollTopState[0];
		var setScrollTop = scrollTopState[1];

		var gridSizeState = useState({ width: 600, height: 360 });
		var gridSize = gridSizeState[0];
		var setGridSize = gridSizeState[1];

		var gridRef = useRef(null);
		var loadSeq = useRef(0);

		// Keyboard navigation: the active cell index within the full items list.
		// Focus stays on the grid container; the active cell is exposed via
		// aria-activedescendant so it survives virtualization (cells unmount as
		// the window scrolls).
		var focusedIndexState = useState(0);
		var focusedIndex = focusedIndexState[0];
		var setFocusedIndex = focusedIndexState[1];

		// Skips announcing the result count on the initial font load (only
		// announce when the author changes search/filters).
		var countAnnouncedRef = useRef(false);

		var selectedFont = null;
		for (var fi = 0; fi < fonts.length; fi++) {
			if (fonts[fi].key === selectedKey) {
				selectedFont = fonts[fi];
			}
		}

		// Load metadata when the selected font changes
		function startLoad(forceRefresh) {
			if (!selectedFont) {
				return;
			}
			// Server-side precheck: when the vendor files are missing on disk,
			// report that honestly instead of a generic parse failure. A
			// user-initiated retry (forceRefresh) still attempts the real load
			// in case the files were restored since the page rendered.
			var data = (window.typostData || {}).glyphsPanel || {};
			if (!forceRefresh && data.vendorMissing && data.vendorMissing.length) {
				setStatus({
					state: 'error',
					reason: 'vendor-load-failed',
					detail: sprintf(/* translators: %s: comma-separated file paths */ __('Missing files: %s', 'typost-glyphs-panel'), data.vendorMissing.join(', '))
				});
				return;
			}
			var seq = ++loadSeq.current;
			setStatus({ state: 'loading' });
			loadMetadata(selectedFont, context.fontWeight || '400', context.fontStyle || '', forceRefresh).then(function(result) {
				if (seq !== loadSeq.current) {
					return; // a newer load superseded this one
				}
				if (result.ok) {
					setStatus({ state: 'ready', meta: result.meta });
				} else {
					setStatus({ state: 'error', reason: result.reason, detail: result.detail || '' });
				}
			}).catch(function() {
				if (seq === loadSeq.current) {
					setStatus({ state: 'error', reason: 'parse-failed' });
				}
			});
		}

		// Retry after an error: forget failed loader state (vendor scripts,
		// worker) and re-run the load bypassing the metadata cache
		function handleRetry() {
			if (lib.resetLoaderState) {
				lib.resetLoaderState();
			}
			startLoad(true);
		}

		var fontLoadedOnceRef = useRef(false);
		useEffect(function() {
			// Reset filters only when SWITCHING fonts — on the initial mount the
			// alternates value may be pre-filled from the editor selection and
			// must survive until metadata validates it.
			if (fontLoadedOnceRef.current) {
				setFeatureFilter('');
				setBlockFilter('all');
				setAltChar('');
				setScrollTop(0);
				if (gridRef.current) {
					gridRef.current.scrollTop = 0;
				}
			}
			fontLoadedOnceRef.current = true;
			startLoad(false);
		}, [selectedKey]); // eslint-disable-line react-hooks/exhaustive-deps

		// Track grid container size for windowing
		useEffect(function() {
			if (!gridRef.current || typeof ResizeObserver === 'undefined') {
				return;
			}
			var observer = new ResizeObserver(function(entries) {
				var rect = entries[0].contentRect;
				setGridSize({ width: rect.width, height: rect.height });
			});
			observer.observe(gridRef.current);
			return function() {
				observer.disconnect();
			};
		}, [status.state]);

		var meta = status.state === 'ready' ? status.meta : null;

		// Alternates view takes over the grid when a character (single
		// codepoint) or a short sequence (exact-ligature view) is set
		var altCps = useMemo(function() {
			var chars = Array.from((altChar || '').trim());
			return chars.length >= 1 ? chars.map(function(c) {
				return c.codePointAt(0);
			}) : null;
		}, [altChar]);

		// Validate the selection-pre-filled alternates value once metadata is
		// ready: a sequence with no exact ligatures falls back to its first
		// character; a character the font lacks falls back to the full grid.
		useEffect(function() {
			if (!meta || !autoAltPendingRef.current) {
				return;
			}
			autoAltPendingRef.current = false;
			var chars = Array.from((altChar || '').trim());
			if (!chars.length) {
				return;
			}
			var toCps = function(arr) {
				return arr.map(function(c) {
					return c.codePointAt(0);
				});
			};
			var items = lib.buildAlternateItems(meta, toCps(chars));
			// For a sequence, a lone base cell (no ligature alternates) isn't a
			// useful landing view — fall back to the first character's alternates
			var meaningful = chars.length > 1
				? items.filter(function(item) { return !item.base; }).length
				: items.length;
			if (meaningful > 0) {
				return;
			}
			if (chars.length > 1 && lib.buildAlternateItems(meta, toCps([chars[0]])).length > 0) {
				setAltChar(chars[0]);
				return;
			}
			setAltChar('');
		}, [meta]); // eslint-disable-line react-hooks/exhaustive-deps -- one-shot validation of the launch value

		// Items: alternates view OR (feature filter → block filter → search)
		var baseItems = useMemo(function() {
			if (!meta) {
				return [];
			}
			if (altCps !== null) {
				return lib.buildAlternateItems(meta, altCps);
			}
			return lib.buildGridItems(meta, featureFilter || null);
		}, [meta, featureFilter, altCps]);

		var blockCounts = useMemo(function() {
			return lib.countByBlock(baseItems);
		}, [baseItems]);

		var items = useMemo(function() {
			if (altCps !== null) {
				return baseItems; // alternates view: no block/search filtering
			}
			var filtered = lib.filterByBlock(baseItems, blockFilter);
			return lib.filterBySearch(filtered, search, meta && meta.names);
		}, [baseItems, blockFilter, search, meta, altCps]);

		// Reset keyboard focus to the first cell and scroll to top whenever the
		// result set changes (font, filter, search, or alternates view).
		useEffect(function() {
			setFocusedIndex(0);
			setScrollTop(0);
			if (gridRef.current) {
				gridRef.current.scrollTop = 0;
			}
		}, [selectedKey, blockFilter, featureFilter, search, altCps]);

		// Announce the result count to assistive technology when search/filters
		// change (skipping the initial load). Debounced so typing isn't chatty.
		useEffect(function() {
			if (!meta) {
				return;
			}
			if (!countAnnouncedRef.current) {
				countAnnouncedRef.current = true;
				return;
			}
			var timer = setTimeout(function() {
				if (window.wp && window.wp.a11y && window.wp.a11y.speak) {
					window.wp.a11y.speak(sprintf(/* translators: %d: glyph count */ __('%d glyphs', 'typost-glyphs-panel'), items.length));
				}
			}, 600);
			return function() { clearTimeout(timer); };
		}, [items.length, meta]);

		// Windowing
		var columns = lib.computeColumns(gridSize.width, CELL_SIZE);
		var win = lib.computeWindow(scrollTop, gridSize.height, CELL_SIZE, columns, items.length, OVERSCAN_ROWS);

		// Cell font style
		var cellFontFamily = selectedFont
			? '"' + selectedFont.family + '"' + (selectedFont.fallbacks ? ', ' + selectedFont.fallbacks : '')
			: 'inherit';
		// Render cells in the face variant the panel loaded (context-driven:
		// an italic selection browses — and displays — the italic face)
		var cellFontStyle = /italic|oblique/i.test(context.fontStyle || '') ? 'italic' : 'normal';

		function cellFeatureSettings(item) {
			var tag = item.feature || (altCps === null ? featureFilter : null);
			if (tag) {
				// Indexed alternates (salt/aalt) select the Nth variant
				var index = item.altIndex || 1;
				return '"' + tag + '" ' + index;
			}
			// All view / base cell: show base glyphs without ligature substitution
			return '"liga" 0, "calt" 0';
		}

		function itemText(item) {
			return item.type === 'lig' ? item.text : String.fromCodePoint(item.cp);
		}

		function itemFeatureTag(item) {
			return item.feature || (altCps === null ? featureFilter : null) || null;
		}

		function itemLabel(item) {
			var parts = [itemText(item)];
			if (item.type === 'lig' && !item.base) {
				parts.push(__('ligature', 'typost-glyphs-panel'));
			} else if (item.type === 'lig') {
				// Base cell of the sequence-alternates view: plain characters
			} else {
				parts.push('U+' + item.cp.toString(16).toUpperCase().padStart(4, '0'));
			}
			var tag = itemFeatureTag(item);
			if (tag) {
				var feature = meta && meta.features && meta.features[tag];
				var tagLabel = tag + (feature && feature.label !== tag ? ' (' + feature.label + ')' : '');
				if (item.altIndex && item.altCount > 1) {
					tagLabel += ' ' + sprintf(/* translators: 1: alternate number, 2: total alternates */ __('#%1$d of %2$d', 'typost-glyphs-panel'), item.altIndex, item.altCount);
				}
				parts.push(tagLabel);
			} else if (altCps !== null) {
				parts.push(__('base glyph', 'typost-glyphs-panel'));
			}
			return parts.join(' — ');
		}

		// Show the confirmation notice AND announce it to assistive technology,
		// since the visual Notice is not a live region (WCAG 4.1.3).
		function announce(msg) {
			setInsertedMsg(msg);
			if (window.wp && window.wp.a11y && window.wp.a11y.speak) {
				window.wp.a11y.speak(msg);
			}
		}

		function handleInsert(item) {
			var text = itemText(item);
			var tag = itemFeatureTag(item);

			// Admin browse mode: copy the character instead of inserting
			if (source === 'admin') {
				var copied = function() {
					announce(sprintf(/* translators: %s: character */ __('Copied "%s" to clipboard', 'typost-glyphs-panel'), text));
				};
				var failed = function() {
					announce(__('Could not copy to clipboard.', 'typost-glyphs-panel'));
				};
				// execCommand fallback for non-secure contexts (HTTP dev sites),
				// where navigator.clipboard is unavailable
				var legacyCopy = function() {
					var textarea = document.createElement('textarea');
					textarea.value = text;
					textarea.style.position = 'fixed';
					textarea.style.opacity = '0';
					document.body.appendChild(textarea);
					textarea.select();
					var ok = false;
					try {
						ok = document.execCommand('copy');
					} catch (e) {
						ok = false;
					}
					document.body.removeChild(textarea);
					(ok ? copied : failed)();
				};
				if (navigator.clipboard && navigator.clipboard.writeText) {
					navigator.clipboard.writeText(text).then(copied, legacyCopy);
				} else {
					legacyCopy();
				}
				return;
			}

			var payload = lib.buildInsertionPayload({
				text: text,
				featureTag: tag,
				featureIndex: item.altIndex || 1,
				panelFontId: selectedFont ? selectedFont.fontId : 0,
				panelFontFamily: (selectedFont && !selectedFont.fontId) ? (selectedFont.cssFamily || '"' + selectedFont.family + '"') : '',
				contextFontId: context.fontId || 0,
				contextFeatures: context.features || [],
				contextFontWeight: context.fontWeight || ''
			});
			lib.dispatchInsert(source, payload, {
				clientId: context.clientId,
				range: context.range
			});
			var detail = tag ? (item.altIndex > 1 ? tag + ' ' + item.altIndex : tag) : null;
			announce(detail
				? sprintf(/* translators: 1: character, 2: OpenType feature tag */ __('Inserted "%1$s" (%2$s)', 'typost-glyphs-panel'), text, detail)
				: sprintf(/* translators: %s: character */ __('Inserted "%s"', 'typost-glyphs-panel'), text));
		}

		// Feature filter options
		var featureOptions = [{ value: '', label: __('All glyphs', 'typost-glyphs-panel') }];
		if (meta && meta.features) {
			Object.keys(meta.features).sort().forEach(function(tag) {
				var feature = meta.features[tag];
				var count = (feature.codepoints || []).length +
					Object.keys(feature.alts || {}).length +
					(feature.ligatures || []).length;
				featureOptions.push({
					value: tag,
					label: tag + ' — ' + feature.label + ' (' + count + ')'
				});
			});
		}

		// Block filter options (zero-count blocks hidden)
		var blockOptions = [{
			value: 'all',
			label: sprintf(/* translators: %d: glyph count */ __('All blocks (%d)', 'typost-glyphs-panel'), blockCounts.all || 0)
		}];
		(lib.UNICODE_BLOCKS || []).forEach(function(block) {
			if (blockCounts[block.id]) {
				blockOptions.push({ value: block.id, label: block.label + ' (' + blockCounts[block.id] + ')' });
			}
		});
		if (blockCounts.other) {
			blockOptions.push({ value: 'other', label: __('Other', 'typost-glyphs-panel') + ' (' + blockCounts.other + ')' });
		}

		// Visible cells, chunked into rows of `columns` for the grid/row/gridcell
		// structure. firstIndex is row-aligned (see computeWindow), so each chunk
		// is a clean grid row.
		var cols = Math.max(1, columns);
		var visible = items.slice(win.firstIndex, win.lastIndex);
		var visibleRows = [];
		for (var ri = 0; ri < visible.length; ri += cols) {
			visibleRows.push(visible.slice(ri, ri + cols));
		}
		var totalRows = Math.max(1, Math.ceil(items.length / cols));

		// The active cell (clamped — items can shrink under a stale focusedIndex).
		var activeIndex = items.length ? Math.max(0, Math.min(focusedIndex, items.length - 1)) : 0;

		function cellDomId(index) {
			return 'typost-glyph-cell-' + index;
		}

		// Scroll the grid so the row containing `index` is fully in view.
		function ensureIndexVisible(index) {
			if (!gridRef.current) {
				return;
			}
			var rowTop = Math.floor(index / cols) * CELL_SIZE;
			var rowBottom = rowTop + CELL_SIZE;
			var viewTop = gridRef.current.scrollTop;
			var viewBottom = viewTop + gridRef.current.clientHeight;
			if (rowTop < viewTop) {
				gridRef.current.scrollTop = rowTop;
			} else if (rowBottom > viewBottom) {
				gridRef.current.scrollTop = rowBottom - gridRef.current.clientHeight;
			}
		}

		function moveFocus(index) {
			var clamped = Math.max(0, Math.min(items.length - 1, index));
			setFocusedIndex(clamped);
			setHovered(items[clamped]);
			ensureIndexVisible(clamped);
		}

		// Arrow-key / Home / End / Page navigation across the (virtualized) grid.
		// Focus never leaves the grid container, so cells can unmount freely.
		function handleGridKeyDown(e) {
			if (!items.length) {
				return;
			}
			var pageRows = Math.max(1, Math.floor(gridSize.height / CELL_SIZE));
			switch (e.key) {
				case 'ArrowRight': moveFocus(activeIndex + 1); break;
				case 'ArrowLeft': moveFocus(activeIndex - 1); break;
				case 'ArrowDown': moveFocus(activeIndex + cols); break;
				case 'ArrowUp': moveFocus(activeIndex - cols); break;
				case 'Home': moveFocus(e.ctrlKey ? 0 : activeIndex - (activeIndex % cols)); break;
				case 'End': moveFocus(e.ctrlKey ? items.length - 1 : activeIndex - (activeIndex % cols) + (cols - 1)); break;
				case 'PageDown': moveFocus(activeIndex + cols * pageRows); break;
				case 'PageUp': moveFocus(activeIndex - cols * pageRows); break;
				case 'Enter':
				case ' ':
					if (items[activeIndex]) {
						handleInsert(items[activeIndex]);
					}
					break;
				default:
					return; // let other keys (Tab, typing) behave normally
			}
			e.preventDefault();
		}

		var searchPlaceholder = meta && meta.hasGlyphNames
			? __('Search: character, U+0041, or glyph name', 'typost-glyphs-panel')
			: __('Search: character or U+0041', 'typost-glyphs-panel');

		var targetText;
		if (source === 'admin') {
			targetText = __('Browse only — click a glyph to copy it', 'typost-glyphs-panel');
		} else if (context.selectionText) {
			targetText = sprintf(/* translators: %s: selected text */ __('Replaces selection: "%s"', 'typost-glyphs-panel'), context.selectionText.length > 20 ? context.selectionText.slice(0, 20) + '…' : context.selectionText);
		} else {
			targetText = __('Inserts at cursor', 'typost-glyphs-panel');
		}

		return el(Modal, {
			title: __('Glyphs', 'typost-glyphs-panel'),
			className: 'typost-glyphs-modal',
			onRequestClose: onClose,
			shouldCloseOnClickOutside: false
		},
			// Header row: font selector + target indicator
			el('div', { className: 'typost-glyphs-header' },
				el(SelectControl, {
					label: __('Font', 'typost-glyphs-panel'),
					__next40pxDefaultSize: true,
					value: selectedKey,
					options: fonts.map(function(font) {
						return { value: font.key, label: font.label };
					}),
					onChange: setSelectedKey,
					__nextHasNoMarginBottom: true
				}),
				el('span', { className: 'typost-glyphs-target' }, targetText)
			),

			// Status area
			fonts.length === 0 && el(Notice, { status: 'warning', isDismissible: false },
				__('No fonts are configured in Typography Stylist. Upload a webfont kit to browse glyphs.', 'typost-glyphs-panel')),
			status.state === 'loading' && el('div', { className: 'typost-glyphs-loading' },
				el(Spinner), ' ', __('Reading font data…', 'typost-glyphs-panel')),
			status.state === 'error' && el(Notice, {
				status: 'warning',
				isDismissible: false,
				actions: [{
					label: __('Try again', 'typost-glyphs-panel'),
					onClick: handleRetry,
					variant: 'secondary'
				}]
			},
				reasonMessage(status.reason),
				status.detail && el('div', { className: 'typost-glyphs-error-detail' }, status.detail)),
			meta && meta.partialCoverage && el(Notice, { status: 'info', isDismissible: false },
				__('Adobe Fonts serves dynamically subset files — this glyph list may be incomplete.', 'typost-glyphs-panel')),
			insertedMsg && el(Notice, {
				status: 'success',
				isDismissible: true,
				onRemove: function() { setInsertedMsg(''); }
			}, insertedMsg),

			// Toolbar + grid (only when ready)
			meta && el(Fragment, null,
				el('div', { className: 'typost-glyphs-toolbar' },
					// 1. Alternates-for-character
					el('div', { className: 'typost-glyphs-altchar' },
						el(TextControl, {
							label: __('Alternates for character', 'typost-glyphs-panel'),
							__next40pxDefaultSize: true,
							hideLabelFromVision: false,
							placeholder: __('Alternates for…', 'typost-glyphs-panel'),
							value: altChar,
							// A short sequence ("Th") shows its exact ligature alternates
							maxLength: 8,
							onChange: function(value) {
								setAltChar(Array.from(value || '').slice(0, 4).join(''));
							},
							__nextHasNoMarginBottom: true
						}),
						!altChar && context.selectionText && el(Button, {
							variant: 'tertiary',
							isSmall: true,
							onClick: function() {
								setAltChar(
									lib.initialAltCharFromSelection(context.selectionText) ||
									Array.from(context.selectionText)[0] || ''
								);
							}
						}, sprintf(/* translators: %s: character(s) */ __('Use "%s"', 'typost-glyphs-panel'),
							lib.initialAltCharFromSelection(context.selectionText) ||
							Array.from(context.selectionText)[0] || '')),
						altChar && el(Button, {
							variant: 'tertiary',
							isSmall: true,
							onClick: function() { setAltChar(''); }
						}, __('All glyphs', 'typost-glyphs-panel'))
					),
					// 2. Search
					altCps === null && el(TextControl, {
						label: __('Search', 'typost-glyphs-panel'),
						__next40pxDefaultSize: true,
						hideLabelFromVision: false,
						placeholder: searchPlaceholder,
						value: search,
						onChange: setSearch,
						__nextHasNoMarginBottom: true
					}),
					// 3. OpenType feature ("All glyphs")
					altCps === null && el(SelectControl, {
						label: __('OpenType feature', 'typost-glyphs-panel'),
						__next40pxDefaultSize: true,
						hideLabelFromVision: false,
						value: featureFilter,
						options: featureOptions,
						onChange: function(value) {
							setFeatureFilter(value);
							setBlockFilter('all');
							setScrollTop(0);
							if (gridRef.current) {
								gridRef.current.scrollTop = 0;
							}
						},
						__nextHasNoMarginBottom: true
					}),
					// 4. Unicode block ("All blocks")
					altCps === null && el(SelectControl, {
						label: __('Unicode block', 'typost-glyphs-panel'),
						__next40pxDefaultSize: true,
						hideLabelFromVision: false,
						value: blockFilter,
						options: blockOptions,
						onChange: setBlockFilter,
						__nextHasNoMarginBottom: true
					})
				),

				// Windowed grid. role="grid" with arrow-key navigation: focus stays
				// on the container and the active cell is tracked via
				// aria-activedescendant so it survives virtualization.
				el('div', {
					className: 'typost-glyphs-grid',
					ref: gridRef,
					tabIndex: 0,
					role: 'grid',
					'aria-label': __('Glyphs', 'typost-glyphs-panel'),
					'aria-rowcount': totalRows,
					'aria-colcount': cols,
					'aria-activedescendant': items.length ? cellDomId(activeIndex) : undefined,
					onScroll: function(e) {
						setScrollTop(e.target.scrollTop);
					},
					onKeyDown: handleGridKeyDown,
					onFocus: function() { ensureIndexVisible(activeIndex); }
				},
					el('div', {
						className: 'typost-glyphs-grid-track',
						style: { height: win.totalHeight + 'px', paddingTop: win.padTop + 'px' }
					},
						visibleRows.map(function(rowItems, rIdx) {
							var rowNumber = (win.firstIndex / cols) + rIdx;
							return el('div', {
								key: rowNumber,
								className: 'typost-glyphs-grid-row',
								role: 'row',
								'aria-rowindex': rowNumber + 1
							},
								rowItems.map(function(item, cIdx) {
									var index = win.firstIndex + rIdx * cols + cIdx;
									return el('button', {
										key: index,
										id: cellDomId(index),
										className: 'typost-glyph-cell' + (index === activeIndex ? ' is-active' : ''),
										type: 'button',
										role: 'gridcell',
										'aria-colindex': cIdx + 1,
										tabIndex: -1,
										style: {
											width: CELL_SIZE + 'px',
											height: CELL_SIZE + 'px',
											fontFamily: cellFontFamily,
											fontWeight: context.fontWeight || 'normal',
											fontStyle: cellFontStyle,
											fontFeatureSettings: cellFeatureSettings(item)
										},
										'aria-label': itemLabel(item),
										title: itemLabel(item),
										onClick: function() {
											setFocusedIndex(index);
											setHovered(item);
											handleInsert(item);
											// Keep keyboard control on the grid container
											if (gridRef.current) { gridRef.current.focus(); }
										},
										onMouseEnter: function() { setHovered(item); }
									}, itemText(item));
								})
							);
						})
					),
					items.length === 0 && el('p', { className: 'typost-glyphs-empty' },
						altCps !== null
							? __('This character is not available in the selected font.', 'typost-glyphs-panel')
							: __('No glyphs match the current search and filters.', 'typost-glyphs-panel'))
				),

				// Detail bar
				el('div', { className: 'typost-glyphs-detail' },
					hovered ? el(Fragment, null,
						el('span', {
							className: 'typost-glyphs-detail-preview',
							style: {
								fontFamily: cellFontFamily,
								fontWeight: context.fontWeight || 'normal',
								fontStyle: cellFontStyle,
								fontFeatureSettings: cellFeatureSettings(hovered)
							},
							'aria-hidden': 'true'
						}, itemText(hovered)),
						el('span', { className: 'typost-glyphs-detail-info' },
							itemLabel(hovered),
							hovered.type !== 'lig' && meta.names && meta.names[String(hovered.cp)]
								? ' · ' + meta.names[String(hovered.cp)]
								: '',
							hovered.altCount ? ' · ' + sprintf(/* translators: %d: number of alternates */ __('%d alternates', 'typost-glyphs-panel'), hovered.altCount) : ''
						)
					) : el('span', { className: 'typost-glyphs-detail-hint' },
						__('Hover a glyph for details. Click to insert.', 'typost-glyphs-panel'))
				),

				// Footer
				el('div', { className: 'typost-glyphs-footer' },
					el(Button, {
						variant: 'tertiary',
						onClick: function() { startLoad(true); }
					}, __('Re-read font', 'typost-glyphs-panel')),
					meta.skippedLookups > 0 && el('span', { className: 'typost-glyphs-footnote' },
						sprintf(/* translators: %d: number of skipped lookups */ __('%d contextual substitution rules are not browsable.', 'typost-glyphs-panel'), meta.skippedLookups)),
					el('span', { className: 'typost-glyphs-count' },
						sprintf(/* translators: %d: glyph count */ __('%d glyphs', 'typost-glyphs-panel'), items.length))
				)
			)
		);
	}

	window.typostGlyphs = window.typostGlyphs || {};
	window.typostGlyphs.GlyphsModal = GlyphsModal;

})(window.wp);

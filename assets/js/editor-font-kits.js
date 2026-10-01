/**
 * Typography Stylist - Adobe Fonts kits in the block editor (#230)
 *
 * The editor used to enqueue every Adobe Fonts kit stylesheet in the editor
 * page and again in the canvas iframe: 154 requests on a site with 77 kits,
 * for a post that used two. PHP now enqueues only the kits that the edited
 * post's saved content uses (enqueue_adobe_fonts()), and this script adds
 * the rest on demand:
 *
 * - fonts that the blocks use, read from the block editor store (attributes,
 *   inline spans, paragraph style references), so picking a font, pasting,
 *   undo and inserting a pattern all load their kit;
 * - fonts that a preview shows before they are applied, through
 *   window.typostFontKits.ensureFontId() (the inline modal, the Paragraph
 *   Styles browser, the Glyphs panel).
 *
 * Every kit is added to the editor page and to each canvas iframe. The canvas
 * is rebuilt on device preview and zoom changes, with a fresh <head>, so the
 * store subscription re-checks the canvas documents on each change.
 *
 * Hand-written ES5 with no build step, like the bundled modules. The pure
 * helpers are exported for Jest.
 */
(function(root) {
    'use strict';

    /**
     * Adobe Fonts kit stylesheet URLs for a numeric font ID.
     *
     * Twin of typostAdobeCssUrlsForFontId() in admin-page.js (separate page,
     * separate script); admin-font-loader.test.js checks both give the same
     * result, so they cannot drift apart.
     *
     * @param {Array}         adobeFonts typostData.adobeFonts.
     * @param {number|string} fontId     Numeric font ID.
     * @return {string[]} Unique https stylesheet URLs (empty when none match).
     */
    function adobeCssUrlsForFontId(adobeFonts, fontId) {
        var id = parseInt(fontId, 10);
        var urls = [];
        if (!id || !Array.isArray(adobeFonts)) {
            return urls;
        }
        adobeFonts.forEach(function(font) {
            if (!font || parseInt(font.font_id, 10) !== id) {
                return;
            }
            var url = typeof font.css_url === 'string' ? font.css_url : '';
            if (/^https:\/\//i.test(url) && urls.indexOf(url) === -1) {
                urls.push(url);
            }
        });
        return urls;
    }

    /**
     * Font IDs and paragraph style references named in a piece of markup.
     *
     * Mirrors the PHP content scan: `data-font-id="N"`, `var(--font-N)`,
     * `data-style-id="…"` and `typost-ps-…`. Serialized block attributes can
     * escape the quotes, so the quote is optional.
     *
     * @param {string} html Markup or a class string.
     * @return {{fontIds: number[], styleRefs: string[]}}
     */
    function referencesFromHtml(html) {
        var out = { fontIds: [], styleRefs: [] };
        if (typeof html !== 'string' || '' === html) {
            return out;
        }
        var match;
        var fontPatterns = [/data-font-id=["'\\]*(\d+)/g, /--font-(\d+)/g];
        fontPatterns.forEach(function(pattern) {
            while ((match = pattern.exec(html)) !== null) {
                var id = parseInt(match[1], 10);
                if (id > 0 && out.fontIds.indexOf(id) === -1) {
                    out.fontIds.push(id);
                }
            }
        });
        var stylePatterns = [/data-style-id=["'\\]*([A-Za-z0-9_-]+)/g, /typost-ps-([A-Za-z0-9_-]+)/g];
        stylePatterns.forEach(function(pattern) {
            while ((match = pattern.exec(html)) !== null) {
                if (out.styleRefs.indexOf(match[1]) === -1) {
                    out.styleRefs.push(match[1]);
                }
            }
        });
        return out;
    }

    /**
     * An attribute value as a string, when it can hold markup.
     *
     * RichText attributes are RichTextData objects since WordPress 6.5; their
     * toString() returns the HTML. Plain objects and arrays are skipped.
     *
     * @param {*} value Attribute value.
     * @return {string}
     */
    function attributeText(value) {
        if (typeof value === 'string') {
            return value;
        }
        if (value && typeof value === 'object' && !Array.isArray(value) &&
            typeof value.toString === 'function' && value.toString !== Object.prototype.toString) {
            try {
                var text = value.toString();
                return typeof text === 'string' ? text : '';
            } catch (e) {
                return '';
            }
        }
        return '';
    }

    /**
     * Every font ID that a block tree uses.
     *
     * Reads the block-level `fontId`, a `paragraphStyleId`, and every
     * string-like attribute (inline spans in `content`, the `styleClass`
     * class). Paragraph style references resolve to the style's `fontId`,
     * matching a style by its ID or its legacy ID.
     *
     * @param {Array} blocks          Block tree (getBlocks()).
     * @param {Array} paragraphStyles typostData.paragraphStyles.
     * @return {number[]} Unique positive font IDs.
     */
    function collectFontIdsFromBlocks(blocks, paragraphStyles) {
        var ids = [];
        var styleRefs = [];

        function addId(id) {
            id = parseInt(id, 10);
            if (id > 0 && ids.indexOf(id) === -1) {
                ids.push(id);
            }
        }

        function addStyleRef(ref) {
            ref = String(ref);
            if (ref && ref !== '0' && styleRefs.indexOf(ref) === -1) {
                styleRefs.push(ref);
            }
        }

        function walk(list) {
            (Array.isArray(list) ? list : []).forEach(function(block) {
                if (!block) {
                    return;
                }
                var attrs = block.attributes || {};
                addId(attrs.fontId);
                if (attrs.paragraphStyleId) {
                    addStyleRef(attrs.paragraphStyleId);
                }
                Object.keys(attrs).forEach(function(key) {
                    var refs = referencesFromHtml(attributeText(attrs[key]));
                    refs.fontIds.forEach(addId);
                    refs.styleRefs.forEach(addStyleRef);
                });
                walk(block.innerBlocks);
            });
        }

        walk(blocks);

        if (styleRefs.length && Array.isArray(paragraphStyles)) {
            paragraphStyles.forEach(function(style) {
                if (!style) {
                    return;
                }
                var id = style.id !== undefined ? String(style.id) : '';
                var legacy = style.legacyId ? String(style.legacyId) : '';
                if ((id && styleRefs.indexOf(id) !== -1) || (legacy && styleRefs.indexOf(legacy) !== -1)) {
                    addId(style.properties && style.properties.fontId);
                }
            });
        }

        return ids;
    }

    /**
     * Add the replacement targets of deleted font IDs.
     *
     * Content keeps a deleted font's ID; `--font-{deleted}` aliases the
     * replacement's variable, so the replacement's kit is the one to load.
     * Chains are followed with a visited set, so a cyclic mapping ends.
     *
     * @param {number[]} ids      Font IDs.
     * @param {Object}   mappings Deleted font ID => replacement font ID.
     * @return {number[]} The IDs plus every replacement target.
     */
    function withReplacements(ids, mappings) {
        var out = [];
        var map = mappings && typeof mappings === 'object' ? mappings : {};
        (Array.isArray(ids) ? ids : []).forEach(function(start) {
            var current = parseInt(start, 10);
            var visited = {};
            while (current > 0 && !visited[current]) {
                visited[current] = true;
                if (out.indexOf(current) === -1) {
                    out.push(current);
                }
                current = parseInt(map[current], 10);
            }
        });
        return out;
    }

    /**
     * Keeps a set of wanted kit stylesheets present in a group of documents.
     *
     * @param {Object}   options
     * @param {Function} options.getDocuments  Returns the documents to serve.
     * @param {Function} options.getAdobeFonts Returns the adobeFonts array.
     * @return {{ensureFontIds: Function, sync: Function, wantedUrls: Function}}
     */
    function createKitLoader(options) {
        var wanted = [];

        function baseUrl(href) {
            return String(href || '').split('?')[0].split('#')[0];
        }

        function hasKit(doc, url) {
            var links = doc.querySelectorAll('link[rel="stylesheet"]');
            var base = baseUrl(url);
            for (var i = 0; i < links.length; i++) {
                if (baseUrl(links[i].href) === base) {
                    return true;
                }
            }
            return false;
        }

        function addToDocument(doc) {
            if (!doc || !doc.head) {
                return 0;
            }
            // sync() runs on every store change (every key while typing).
            // A document that already has every wanted kit is skipped at
            // once; a rebuilt canvas is a new document without the marker.
            if (doc.__typostKitCount === wanted.length) {
                return 0;
            }
            var added = 0;
            wanted.forEach(function(url) {
                if (hasKit(doc, url)) {
                    return;
                }
                var link = doc.createElement('link');
                link.rel = 'stylesheet';
                link.href = url;
                link.setAttribute('data-typost-adobe-kit', '');
                doc.head.appendChild(link);
                added++;
            });
            doc.__typostKitCount = wanted.length;
            return added;
        }

        /**
         * Add every wanted kit to every document that lacks it.
         *
         * @return {number} Number of <link> elements added.
         */
        function sync() {
            var added = 0;
            (options.getDocuments() || []).forEach(function(doc) {
                added += addToDocument(doc);
            });
            return added;
        }

        /**
         * Want the kits for these font IDs, then sync.
         *
         * @param {Array} fontIds Numeric font IDs.
         * @return {number} Number of <link> elements added.
         */
        function ensureFontIds(fontIds) {
            var adobeFonts = options.getAdobeFonts() || [];
            (Array.isArray(fontIds) ? fontIds : [fontIds]).forEach(function(id) {
                adobeCssUrlsForFontId(adobeFonts, id).forEach(function(url) {
                    if (wanted.indexOf(url) === -1) {
                        wanted.push(url);
                    }
                });
            });
            return sync();
        }

        return {
            ensureFontIds: ensureFontIds,
            sync: sync,
            wantedUrls: function() { return wanted.slice(); }
        };
    }

    var api = {
        adobeCssUrlsForFontId: adobeCssUrlsForFontId,
        referencesFromHtml: referencesFromHtml,
        attributeText: attributeText,
        collectFontIdsFromBlocks: collectFontIdsFromBlocks,
        withReplacements: withReplacements,
        createKitLoader: createKitLoader
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    // ---------------------------------------------------------------------
    // Editor wiring
    // ---------------------------------------------------------------------

    if (typeof window === 'undefined' || typeof document === 'undefined' || !root.wp || !root.wp.data) {
        return;
    }

    // typostData is localized onto a script that prints after this one, so
    // read it at call time, never at load time.
    function data() {
        return root.typostData || {};
    }

    function canvasDocuments() {
        var docs = [document];
        var frames = document.querySelectorAll('iframe[name="editor-canvas"]');
        for (var i = 0; i < frames.length; i++) {
            try {
                if (frames[i].contentDocument) {
                    docs.push(frames[i].contentDocument);
                }
            } catch (e) { /* not ready */ }
            if (!frames[i].__typostKitLoadHooked) {
                // A rebuilt canvas fires load on the same iframe element
                frames[i].__typostKitLoadHooked = true;
                frames[i].addEventListener('load', function() { loader.sync(); });
            }
        }
        return docs;
    }

    var loader = createKitLoader({
        getDocuments: canvasDocuments,
        getAdobeFonts: function() { return data().adobeFonts || []; }
    });

    function ensureFontId(fontId) {
        return loader.ensureFontIds(withReplacements([fontId], data().fontReplacements));
    }

    root.typostFontKits = {
        ensureFontId: ensureFontId,
        ensureFontIds: function(ids) {
            return loader.ensureFontIds(withReplacements(ids, data().fontReplacements));
        },
        sync: loader.sync
    };
    // The Glyphs panel asks this name for a kit (it exists on the settings
    // page too, where admin-page.js defines it).
    if (!root.typostAdminFonts) {
        root.typostAdminFonts = { ensureFontId: ensureFontId };
    }

    var lastBlocks = null;
    var pending = null;

    function scanBlocks() {
        pending = null;
        var editor = root.wp.data.select('core/block-editor');
        if (!editor || typeof editor.getBlocks !== 'function') {
            return;
        }
        var ids = collectFontIdsFromBlocks(editor.getBlocks(), data().paragraphStyles);
        loader.ensureFontIds(withReplacements(ids, data().fontReplacements));
    }

    root.wp.data.subscribe(function() {
        var editor = root.wp.data.select('core/block-editor');
        if (!editor || typeof editor.getBlocks !== 'function') {
            return;
        }
        // Cheap on every tick: a rebuilt canvas has a fresh <head> without
        // the kits. sync() adds nothing when every document has them.
        loader.sync();
        var blocks = editor.getBlocks();
        if (blocks === lastBlocks) {
            return;
        }
        lastBlocks = blocks;
        // Typing changes the block tree on every key; scan after a pause.
        if (pending) {
            clearTimeout(pending);
        }
        pending = setTimeout(scanBlocks, 250);
    });
})(typeof window !== 'undefined' ? window : this);

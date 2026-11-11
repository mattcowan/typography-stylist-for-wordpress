/**
 * Read what a block renders: its text element and the computed font family
 * and weight, in the editor canvas.
 *
 * Moved out of block-editor.js unchanged (#357). The block's own
 * detectBlockComputedFont() / detectBlockComputedWeight() in
 * blocks/typography-stylist/utils.js are different functions (they take a
 * client ID and a selector), not copies.
 *
 * @since 2.4.0
 */

/**
 * Find the element that actually renders a block's text, so computed
 * styles can be read from it.
 *
 * @param {string} blockClientId - Block's client ID
 * @param {string} blockName - Block type name (e.g., 'core/heading')
 * @param {Document} targetDocument - Document to query (defaults to document)
 * @return {Element|null} The text element, or null when it cannot be found
 */
function findBlockTextElement(blockClientId, blockName, targetDocument) {
    if (!blockClientId || !blockName) {
        return null;
    }

    const doc = targetDocument || document;

    // Find the block wrapper element
    const blockWrapper = doc.querySelector(`[data-block="${blockClientId}"]`);
    if (!blockWrapper) {
        return null;
    }

    // Find the actual text element based on block type
    // Note: WordPress 6.5+ puts data-block directly on the element (e.g., <h2 data-block="...">)
    // Older versions use a wrapper div. We support both structures.
    let textElement = null;

    // Core heading blocks (h1-h6)
    if (blockName === 'core/heading') {
        // Check if blockWrapper itself is the heading (new WordPress structure)
        if (blockWrapper.matches('h1, h2, h3, h4, h5, h6')) {
            textElement = blockWrapper;
        } else {
            // Fall back to finding heading inside wrapper (old WordPress structure)
            textElement = blockWrapper.querySelector('h1, h2, h3, h4, h5, h6');
        }
    }
    // Core paragraph blocks
    else if (blockName === 'core/paragraph') {
        // Check if blockWrapper itself is the paragraph (new WordPress structure)
        if (blockWrapper.matches('p')) {
            textElement = blockWrapper;
        } else {
            // Fall back to finding paragraph inside wrapper (old WordPress structure)
            textElement = blockWrapper.querySelector('p');
        }
    }
    // GenerateBlocks headline blocks
    else if (blockName === 'generateblocks/headline') {
        textElement = blockWrapper.querySelector('[class*="gb-headline"]');
    }
    // Typography Stylist blocks
    else if (blockName === 'typost/block') {
        textElement = blockWrapper.querySelector('.typost-block-content');
    }
    // Fallback: try common RichText elements
    else {
        textElement = blockWrapper.querySelector('h1, h2, h3, h4, h5, h6, p, [contenteditable="true"]');
    }

    return textElement;
}

/**
 * Get block's inherited font-family from computed styles
 * Detects the current font applied by theme or block settings
 *
 * @param {string} blockClientId - Block's client ID
 * @param {string} blockName - Block type name (e.g., 'core/heading')
 * @param {Document} targetDocument - Document to query (defaults to document)
 * @param {Window} targetWindow - Window context for getComputedStyle (defaults to window)
 * @return {string} Font family string from computed styles, or empty string if not found
 */
function getBlockInheritedFont(blockClientId, blockName, targetDocument, targetWindow) {
    const textElement = findBlockTextElement(blockClientId, blockName, targetDocument);
    if (!textElement) {
        return '';
    }

    const win = targetWindow || window;
    const fontFamily = win.getComputedStyle(textElement).getPropertyValue('font-family');
    return fontFamily ? fontFamily.replace(/['"]/g, '') : '';
}

/**
 * Get a block's rendered font-weight from computed styles.
 *
 * Themes make headings bold through CSS, not through any stored attribute,
 * so this is the only way to know what a core heading actually looks like
 * before converting it to a Typography Stylist block.
 *
 * @since 2.3.0
 * @param {string} blockClientId - Block's client ID
 * @param {string} blockName - Block type name (e.g., 'core/heading')
 * @param {Document} targetDocument - Document to query (defaults to document)
 * @param {Window} targetWindow - Window context for getComputedStyle (defaults to window)
 * @return {string} Computed weight (e.g. '700'), or '' when it cannot be read
 */
function getBlockInheritedWeight(blockClientId, blockName, targetDocument, targetWindow) {
    const textElement = findBlockTextElement(blockClientId, blockName, targetDocument);
    if (!textElement) {
        return '';
    }

    const win = targetWindow || window;
    const weight = win.getComputedStyle(textElement).getPropertyValue('font-weight');
    if (!weight) {
        return '';
    }

    // Browsers report keywords on some platforms; map them to numbers so
    // the value is always a valid block attribute.
    const keywords = { normal: '400', bold: '700', bolder: '700', lighter: '300' };
    const normalized = String(weight).trim().toLowerCase();
    if (keywords[normalized]) {
        return keywords[normalized];
    }
    return /^\d+$/.test(normalized) ? normalized : '';
}

/**
 * The selected block's rendered font family, read in the editor canvas.
 * Detects the current font applied by theme or block settings.
 *
 * @return {string} Font family string from computed styles, or empty string if not found
 */
function getSelectedBlockInheritedFont() {
    const { select } = wp.data;
    const selectedBlockClientId = select('core/block-editor').getSelectedBlockClientId();

    if (!selectedBlockClientId) {
        return '';
    }

    // Get the selected block to determine its type
    const selectedBlock = select('core/block-editor').getBlock(selectedBlockClientId);
    if (!selectedBlock) {
        return '';
    }

    // WordPress editor uses an iframe for the canvas
    const editorIframe = document.querySelector('iframe[name="editor-canvas"]');
    const targetDocument = editorIframe?.contentDocument || document;
    const targetWindow = editorIframe?.contentWindow || window;

    // Use the standalone utility function
    return getBlockInheritedFont(
        selectedBlockClientId,
        selectedBlock.name,
        targetDocument,
        targetWindow
    );
}

/**
 * The selected block's rendered font weight, read in the editor canvas.
 *
 * Used when converting to a Typography Stylist block: a core heading is
 * bold because the theme says so, not because of any stored attribute,
 * and the block would otherwise be created with the default 400 and
 * visibly lighten.
 *
 * @return {string} Computed weight as a string (e.g. '700'), or '' if undetectable
 */
function getSelectedBlockInheritedWeight() {
    const { select } = wp.data;
    const selectedBlockClientId = select('core/block-editor').getSelectedBlockClientId();
    const selectedBlock = selectedBlockClientId ? select('core/block-editor').getBlock(selectedBlockClientId) : null;
    if (!selectedBlock) {
        return '';
    }

    // Block content lives in the editor canvas iframe (WP 6.3+)
    const editorIframe = document.querySelector('iframe[name="editor-canvas"]');
    const targetDocument = editorIframe?.contentDocument || document;
    const targetWindow = editorIframe?.contentWindow || window;

    return getBlockInheritedWeight(
        selectedBlockClientId,
        selectedBlock.name,
        targetDocument,
        targetWindow
    );
}

module.exports = {
    findBlockTextElement: findBlockTextElement,
    getBlockInheritedFont: getBlockInheritedFont,
    getBlockInheritedWeight: getBlockInheritedWeight,
    getSelectedBlockInheritedFont: getSelectedBlockInheritedFont,
    getSelectedBlockInheritedWeight: getSelectedBlockInheritedWeight
};

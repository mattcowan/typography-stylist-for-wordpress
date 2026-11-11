/**
 * Escaping, sanitizing and flag helpers of the inline editor.
 *
 * block-editor.js publishes most of them on window.typostUtils (tests read
 * them there). Moved out of block-editor.js unchanged (#357).
 *
 * @since 2.4.0
 */

/**
 * HTML-escape text to prevent XSS
 * @param {string} text - Text to escape
 * @return {string} HTML-escaped text
 */
function escapeHTML(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Escape a value for a double-quoted HTML attribute. escapeHTML() leaves
 * quotes alone (innerHTML does not escape them in text).
 */
function escapeAttribute(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Check if content contains actual HTML tags (not just < characters)
 * @param {string} content - Content to check
 * @return {boolean} True if content contains HTML tags
 */
function hasHTMLTags(content) {
    if (!content) return false;
    return /<[^>]+>/.test(content);
}

/**
 * Validate selection bounds
 * @param {number} start - Selection start offset
 * @param {number} end - Selection end offset
 * @param {number} textLength - Total text length
 * @return {object} Validation result with valid flag and optional error message
 */
function validateSelectionBounds(start, end, textLength) {
    if (start < 0 || end < 0) {
        return { valid: false, error: 'Selection offsets cannot be negative' };
    }
    if (start > end) {
        return { valid: false, error: 'Start offset cannot be greater than end offset' };
    }
    if (end > textLength) {
        return { valid: false, error: 'Selection end exceeds text length' };
    }
    return { valid: true };
}

/**
 * Read a boolean flag out of typostData.
 *
 * These options are stored as '1'/'0' strings and wp_localize_script()
 * stringifies whatever it is handed, so an uncast '0' arrives as the
 * string "0" — truthy in JavaScript, which silently inverted every such
 * setting. PHP now casts them, but a localized-data transient written
 * before that fix can still hold the old strings for up to an hour, so
 * treat "0" and "false" as off here too.
 *
 * @since 2.3.0
 * @param {*} value Raw value from typostData
 * @return {boolean} Whether the flag is on
 */
function isFlagEnabled(value) {
    if (value === undefined || value === null || value === false) {
        return false;
    }
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        return normalized !== '' && normalized !== '0' && normalized !== 'false';
    }
    return !!value;
}

/**
 * Sanitize font family value to prevent CSS injection
 * Removes characters that could break out of CSS style strings
 * @param {string} font - Font family name
 * @return {string} Sanitized font family name
 */
function sanitizeFontFamily(font) {
    if (!font) return '';
    // Remove quotes, semicolons, and angle brackets that could break style string or inject HTML
    return font.replace(/["';<>]/g, '');
}

/**
 * Sanitize CSS value to prevent injection
 * @param {string|number} value - CSS value
 * @return {string} Sanitized CSS value
 */
function sanitizeCSSValue(value) {
    if (value === null || value === undefined) return '';
    const stringValue = String(value);
    // Remove dangerous characters that could break out of CSS
    return stringValue.replace(/[;<>"']/g, '');
}

module.exports = {
    escapeHTML: escapeHTML,
    escapeAttribute: escapeAttribute,
    hasHTMLTags: hasHTMLTags,
    validateSelectionBounds: validateSelectionBounds,
    isFlagEnabled: isFlagEnabled,
    sanitizeFontFamily: sanitizeFontFamily,
    sanitizeCSSValue: sanitizeCSSValue
};

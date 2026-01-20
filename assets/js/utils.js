/**
 * Shared utility functions for Typography Stylist
 */

/**
 * HTML-escape text to prevent XSS
 * @param {string} text - Text to escape
 * @return {string} HTML-escaped text
 */
export function escapeHTML(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Check if content contains actual HTML tags (not just < characters)
 * @param {string} content - Content to check
 * @return {boolean} True if content contains HTML tags
 */
export function hasHTMLTags(content) {
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
export function validateSelectionBounds(start, end, textLength) {
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

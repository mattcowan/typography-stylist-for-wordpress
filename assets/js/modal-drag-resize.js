/**
 * Modal Drag and Resize Utilities
 * Pure functions for draggable/resizable modal functionality
 *
 * @package OpenType_Stylist
 */

/**
 * Constrain position to viewport bounds
 * Keeps at least MIN_VISIBLE pixels of the modal visible
 *
 * @param {number} x - Desired X position
 * @param {number} y - Desired Y position
 * @param {number} width - Modal width
 * @param {number} height - Modal height
 * @return {Object} Constrained { x, y }
 */
function constrainToViewport(x, y, width, height) { // eslint-disable-line no-unused-vars
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const MIN_VISIBLE = 50; // Keep at least 50px of header visible

    // Ensure at least MIN_VISIBLE pixels of the modal remain visible
    // Note: width and height kept in signature for API consistency but not used
    // Simple constraint: don't allow dragging past left/top edges, keep MIN_VISIBLE on right/bottom
    const minX = 0;
    const maxX = Math.max(0, viewportWidth - MIN_VISIBLE);
    const minY = 0;
    const maxY = Math.max(0, viewportHeight - MIN_VISIBLE);

    return {
        x: Math.max(minX, Math.min(x, maxX)),
        y: Math.max(minY, Math.min(y, maxY))
    };
}

/**
 * Calculate drag delta
 *
 * @param {MouseEvent} e - Current mouse event
 * @param {number} startX - Drag start X
 * @param {number} startY - Drag start Y
 * @return {Object} { deltaX, deltaY }
 */
function calculateDragDelta(e, startX, startY) {
    return {
        deltaX: e.clientX - startX,
        deltaY: e.clientY - startY
    };
}

/**
 * Calculate new size based on resize
 *
 * @param {MouseEvent} e - Current mouse event
 * @param {string} direction - Resize direction ('n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw')
 * @param {Object} startState - Initial resize state
 * @param {number} startState.startX - Mouse X when resize started
 * @param {number} startState.startY - Mouse Y when resize started
 * @param {number} startState.startWidth - Modal width when resize started
 * @param {number} startState.startHeight - Modal height when resize started
 * @param {number} startState.startModalX - Modal X position when resize started
 * @param {number} startState.startModalY - Modal Y position when resize started
 * @return {Object} { width, height, x, y }
 */
function calculateResize(e, direction, startState) {
    const { startX, startY, startWidth, startHeight, startModalX, startModalY } = startState;
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;

    const MIN_WIDTH = 300;
    const MIN_HEIGHT = 200;
    const MAX_WIDTH = window.innerWidth - 20;
    const MAX_HEIGHT = window.innerHeight - 20;

    let newWidth = startWidth;
    let newHeight = startHeight;
    let newX = startModalX;
    let newY = startModalY;

    // Apply deltas based on direction
    if (direction.includes('e')) {
        newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + deltaX));
    }
    if (direction.includes('s')) {
        newHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, startHeight + deltaY));
    }
    if (direction.includes('w')) {
        const proposedWidth = startWidth - deltaX;
        if (proposedWidth >= MIN_WIDTH && proposedWidth <= MAX_WIDTH) {
            newWidth = proposedWidth;
            newX = startModalX + deltaX;
        }
    }
    if (direction.includes('n')) {
        const proposedHeight = startHeight - deltaY;
        if (proposedHeight >= MIN_HEIGHT && proposedHeight <= MAX_HEIGHT) {
            newHeight = proposedHeight;
            newY = startModalY + deltaY;
        }
    }

    return { width: newWidth, height: newHeight, x: newX, y: newY };
}

/**
 * Get cursor style for resize handle
 *
 * @param {string} direction - Resize direction
 * @return {string} CSS cursor value
 */
function getResizeCursor(direction) {
    const cursors = {
        'n': 'ns-resize',
        's': 'ns-resize',
        'e': 'ew-resize',
        'w': 'ew-resize',
        'ne': 'nesw-resize',
        'nw': 'nwse-resize',
        'se': 'nwse-resize',
        'sw': 'nesw-resize'
    };
    return cursors[direction] || 'default';
}

// CommonJS exports for browserify
module.exports = {
    constrainToViewport: constrainToViewport,
    calculateDragDelta: calculateDragDelta,
    calculateResize: calculateResize,
    getResizeCursor: getResizeCursor
};

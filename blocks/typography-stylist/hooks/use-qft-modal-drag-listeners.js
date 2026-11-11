/**
 * Typography Stylist Block - document listeners for dragging and resizing
 * the Quick Feature Toggles modal.
 *
 * Moved out of edit.js unchanged (#356). Edit calls this hook where the two
 * effects used to be, so the effect order is the same as before.
 */

import { useEffect } from '@wordpress/element';

/**
 * Attach mousemove/mouseup listeners to the document while a drag or resize
 * of the QFT modal is in progress.
 *
 * @param {Object} frame The object useQftModalFrame() returned.
 */
export default function useQftModalDragListeners({
	isDragging,
	dragStartX,
	dragStartY,
	isResizing,
	resizeStartX,
	resizeStartY,
	resizeStartWidth,
	resizeStartHeight,
	resizeStartModalX,
	resizeStartModalY,
	resizeDirection,
	modalX,
	modalY,
	modalWidth,
	modalHeight,
	handleDragMove,
	handleDragEnd,
	handleResizeMove,
	handleResizeEnd
}) {
	// Add/remove drag and resize event listeners
	useEffect(() => {
		if (isDragging) {
			document.addEventListener('mousemove', handleDragMove);
			document.addEventListener('mouseup', handleDragEnd);
			return () => {
				document.removeEventListener('mousemove', handleDragMove);
				document.removeEventListener('mouseup', handleDragEnd);
			};
		}
	}, [isDragging, dragStartX, dragStartY, modalX, modalY]);

	useEffect(() => {
		if (isResizing) {
			document.addEventListener('mousemove', handleResizeMove);
			document.addEventListener('mouseup', handleResizeEnd);
			return () => {
				document.removeEventListener('mousemove', handleResizeMove);
				document.removeEventListener('mouseup', handleResizeEnd);
			};
		}
	}, [isResizing, resizeStartX, resizeStartY, resizeStartWidth, resizeStartHeight, resizeStartModalX, resizeStartModalY, resizeDirection, modalWidth, modalHeight, modalX, modalY]);
}

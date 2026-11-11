/**
 * Typography Stylist Block - the Quick Feature Toggles modal frame:
 * position, size, keyboard moving, mouse dragging and resizing.
 *
 * Moved out of edit.js unchanged (#356). The document listeners that follow
 * a drag or resize are in use-qft-modal-drag-listeners.js, which Edit calls
 * where those effects used to be, so the effect order is unchanged.
 */

import { useState } from '@wordpress/element';
import { calculateResize } from '../../../assets/js/modal-drag-resize';

/**
 * State and handlers for the QFT modal's own header (drag, arrow keys) and
 * resize handles.
 *
 * @return {Object} Position and size, the drag/resize flags, the header key,
 *                  drag start and resize start handlers, and what
 *                  useQftModalDragListeners() needs.
 */
export default function useQftModalFrame() {
	// Modal position and size state
	const [modalX, setModalX] = useState(() => {
		const viewportWidth = window.innerWidth;
		const modalWidth = 500;
		return Math.max(0, (viewportWidth - modalWidth) / 2);
	});
	const [modalY, setModalY] = useState(() => {
		const viewportHeight = window.innerHeight;
		const modalHeight = 600;
		return Math.max(0, (viewportHeight - modalHeight) / 2);
	});
	const [modalWidth, setModalWidth] = useState(500);
	const [modalHeight, setModalHeight] = useState(600);

	// Drag state
	const [isDragging, setIsDragging] = useState(false);
	const [dragStartX, setDragStartX] = useState(0);
	const [dragStartY, setDragStartY] = useState(0);

	// Resize state
	const [isResizing, setIsResizing] = useState(false);
	const [resizeStartX, setResizeStartX] = useState(0);
	const [resizeStartY, setResizeStartY] = useState(0);
	const [resizeStartWidth, setResizeStartWidth] = useState(0);
	const [resizeStartHeight, setResizeStartHeight] = useState(0);
	const [resizeStartModalX, setResizeStartModalX] = useState(0);
	const [resizeStartModalY, setResizeStartModalY] = useState(0);
	const [resizeDirection, setResizeDirection] = useState(null);

	/**
	 * Move the modal with the arrow keys.
	 *
	 * The header advertises `role="toolbar"` and takes focus, so a keyboard
	 * user reaches it and is told it is operable. Without this it answered to
	 * nothing — a 2.1.1 failure, and the mouse-only twin of a control the
	 * inline editor has always had (handleHeaderKeyDown in block-editor.js).
	 *
	 * Clamping matches handleDragMove below rather than the inline editor's,
	 * so dragging and arrow-keying cannot come to rest in different places.
	 */
	const handleHeaderKeyDown = (e) => {
		const STEP = 10;
		const MIN_VISIBLE = 50;

		let nextX = modalX;
		let nextY = modalY;
		let moved = false;

		switch (e.key) {
			case 'ArrowUp':
				nextY = modalY - STEP;
				moved = true;
				break;
			case 'ArrowDown':
				nextY = modalY + STEP;
				moved = true;
				break;
			case 'ArrowLeft':
				nextX = modalX - STEP;
				moved = true;
				break;
			case 'ArrowRight':
				nextX = modalX + STEP;
				moved = true;
				break;
			default:
				break;
		}

		if (!moved) {
			return;
		}

		e.preventDefault();
		e.stopPropagation();

		setModalX(Math.max(0, Math.min(nextX, window.innerWidth - MIN_VISIBLE)));
		setModalY(Math.max(0, Math.min(nextY, window.innerHeight - MIN_VISIBLE)));
	};

	// Drag handlers
	const handleDragStart = (e) => {
		// Don't drag if clicking close button
		// Any header button (Move panel, Close) is not a drag handle
		if (e.target.closest('.components-button')) {
			return;
		}

		// Only drag from header
		if (!e.target.closest('.typost-modal-header')) {
			return;
		}

		e.preventDefault();
		e.stopPropagation();

		setIsDragging(true);
		setDragStartX(e.clientX);
		setDragStartY(e.clientY);
	};

	const handleDragMove = (e) => {
		if (!isDragging) return;

		const deltaX = e.clientX - dragStartX;
		const deltaY = e.clientY - dragStartY;

		const newX = modalX + deltaX;
		const newY = modalY + deltaY;

		// Constrain to viewport
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;
		const MIN_VISIBLE = 50;

		const constrainedX = Math.max(0, Math.min(newX, viewportWidth - MIN_VISIBLE));
		const constrainedY = Math.max(0, Math.min(newY, viewportHeight - MIN_VISIBLE));

		setModalX(constrainedX);
		setModalY(constrainedY);
		setDragStartX(e.clientX);
		setDragStartY(e.clientY);
	};

	const handleDragEnd = () => {
		setIsDragging(false);
	};

	// Resize handlers
	const handleResizeStart = (e, direction) => {
		e.preventDefault();
		e.stopPropagation();

		setIsResizing(true);
		setResizeDirection(direction);
		setResizeStartX(e.clientX);
		setResizeStartY(e.clientY);
		setResizeStartWidth(modalWidth);
		setResizeStartHeight(modalHeight);
		setResizeStartModalX(modalX);
		setResizeStartModalY(modalY);
	};

	const handleResizeMove = (e) => {
		if (!isResizing) return;

		const newDimensions = calculateResize(e, resizeDirection, {
			startX: resizeStartX,
			startY: resizeStartY,
			startWidth: resizeStartWidth,
			startHeight: resizeStartHeight,
			startModalX: resizeStartModalX,
			startModalY: resizeStartModalY
		});

		setModalWidth(newDimensions.width);
		setModalHeight(newDimensions.height);
		setModalX(newDimensions.x);
		setModalY(newDimensions.y);
	};

	const handleResizeEnd = () => {
		setIsResizing(false);
		setResizeDirection(null);
	};

	return {
		modalX,
		modalY,
		modalWidth,
		modalHeight,
		isDragging,
		isResizing,
		handleHeaderKeyDown,
		handleDragStart,
		handleResizeStart,
		// For useQftModalDragListeners
		dragStartX,
		dragStartY,
		resizeStartX,
		resizeStartY,
		resizeStartWidth,
		resizeStartHeight,
		resizeStartModalX,
		resizeStartModalY,
		resizeDirection,
		handleDragMove,
		handleDragEnd,
		handleResizeMove,
		handleResizeEnd
	};
}

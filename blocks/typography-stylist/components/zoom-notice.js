/**
 * Typography Stylist Block - zoom notice for responsive sizes.
 *
 * Shown under the responsive size sliders in the Inspector and in the Quick
 * Feature Toggles. Moved out of edit.js unchanged (#356).
 */

import { __, sprintf } from '@wordpress/i18n';
import { Notice } from '@wordpress/components';
import { useRef, useEffect } from '@wordpress/element';
import { speak } from '@wordpress/a11y';
import { getResponsiveZoomNotice } from '../utils';

/**
 * Zoom notice for responsive sizes (#234), beside the out-of-order note in
 * the Inspector and the Quick Feature Toggles. A rem size grows more slowly
 * than set when its slope would not double by 500% zoom ('slower'); a px
 * size — saved before #233, or new under the #248 px setting — keeps its
 * slope, so it is told it fails.
 *
 * Speech: the visible text carries the live slider values, and core's
 * Notice speaks its text again every time the text changes — once per
 * slider step. So the Notice speaks nothing itself, and a value-free
 * sentence is spoken only when the notice appears or changes kind after
 * mount. Never on mount: in the QFT modal that is the tick the dialog takes
 * focus, and a notice spoken then is read before the dialog's name.
 *
 * @param {Object} props
 * @param {number} props.min       Mobile size (px)
 * @param {number} props.preferred Intermediate size (px)
 * @param {number} props.max       Large size (px)
 * @param {string} props.unit      Unit the size is written in ('px' or 'rem')
 * @return {Element|null} Notice, or null when the size doubles
 */
function ZoomNotice({ min, preferred, max, unit }) {
	const notice = getResponsiveZoomNotice(min, preferred, max, unit);
	const kind = notice ? notice.kind : null;
	const previousKind = useRef(kind);
	useEffect(() => {
		if (kind && kind !== previousKind.current) {
			speak(kind === 'slower'
				? __('To stay readable when a reader zooms in, this size grows more slowly than set.', 'typography-stylist')
				: __('This size does not double when a reader zooms to 500%.', 'typography-stylist'), 'polite');
		}
		previousKind.current = kind;
	}, [kind]);
	if (!notice) {
		return null;
	}
	return (
		<Notice status="warning" isDismissible={false} spokenMessage="" className="typost-size-zoom-notice">
			{notice.kind === 'slower'
				? sprintf(
					/* translators: 1: font size in px that the text reaches, 2: the Large font size in px, 3: the smallest Intermediate size in px that reaches the Large size */
					__('To stay readable when a reader zooms in, this size grows more slowly than set: %1$spx in a 1920px window instead of %2$spx. To reach %2$spx, set Intermediate to at least %3$spx.', 'typography-stylist'),
					notice.reach,
					notice.max,
					notice.minPreferred
				)
				: sprintf(
					/* translators: 1: the largest Large font size in px that doubles with zoom, 2: the smallest Intermediate size in px that doubles with zoom */
					__('This size does not double when a reader zooms to 500%%. Set Large to %1$spx or less, or Intermediate to at least %2$spx.', 'typography-stylist'),
					notice.reach,
					notice.minPreferred
				)}
		</Notice>
	);
}

export default ZoomNotice;

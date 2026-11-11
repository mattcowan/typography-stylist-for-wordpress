/**
 * Typography Stylist Block - the First Letter Hang panel in the block sidebar.
 *
 * Moved out of edit.js unchanged (#356). A render function, not a component:
 * Edit calls it at the place in its render where this markup was, so
 * the markup and every filter and translation call in it are evaluated
 * exactly when and as often as before. It must not call hooks: it runs inside
 * Edit's render, some calls only on a condition
 * (__tests__/render-functions-no-hooks.test.js).
 */

import { PanelBody, RangeControl } from '@wordpress/components';
import { __, isRTL, sprintf } from '@wordpress/i18n';
import { INITIAL_HANG_MAX, hasBlockTextIndent, initialHangApplies, normalizeHang, resolveHangTextAlign, setFitLineHang } from '../../utils';

/**
 * The hang of the first letter, per line in fit-to-width mode (#242).
 *
 * @param {Object} props Values, state and handlers from Edit, by name.
 * @return {Element} The panel.
 */
export default function renderFirstLetterHangPanel(props) {
	const {
		activeParagraphStyle, attributes, fitLineHangs, fontSize, hangLinePreviews, initialHang,
		setAttributes, textAlign
	} = props;

	return (
		<PanelBody title={__('First Letter Hang', 'typography-stylist')} initialOpen={false}>
			<p style={{ fontSize: '12px', color: '#757575', marginTop: 0, marginBottom: '16px' }}>
				{fontSize === 'fit'
					? __('Moves the first letter of a line into the margin, so a swash hangs outside the text edge and the main shape of the letter lines up with the edge. The value is in em: 0.1 is one tenth of the font size, so the hang scales with the text. Each line has its own value.', 'typography-stylist')
					: __('Moves the first letter into the margin, so a swash hangs outside the text edge and the main shape of the letter lines up with the edge. The value is in em: 0.1 is one tenth of the font size, so the hang scales with the text. Only the first line hangs.', 'typography-stylist')}
			</p>
			<RangeControl
				label={fontSize === 'fit' ? sprintf(
					/* translators: 1: line number, 2: start of the line's text. */
					__('Line %1$d: %2$s', 'typography-stylist'),
					1,
					hangLinePreviews[0] || ''
				) : __('First letter', 'typography-stylist')}
				value={normalizeHang(initialHang)}
				onChange={(value) => setAttributes({ initialHang: normalizeHang(value) })}
				min={0}
				max={INITIAL_HANG_MAX}
				step={0.01}
				help={normalizeHang(initialHang) === 0 ? __('Off', 'typography-stylist') : `${normalizeHang(initialHang)}em`}
				allowReset
				resetFallbackValue={0}
			/>
			{fontSize === 'fit' && hangLinePreviews.map((preview, i) => {
				// Line 1 is the control above; empty lines have no letter to hang
				if (i === 0 || !preview) {
					return null;
				}
				const lineHang = normalizeHang(Array.isArray(fitLineHangs) ? fitLineHangs[i] : 0);
				return (
					<RangeControl
						key={i}
						label={sprintf(
							/* translators: 1: line number, 2: start of the line's text. */
							__('Line %1$d: %2$s', 'typography-stylist'),
							i + 1,
							preview
						)}
						value={lineHang}
						onChange={(value) => setAttributes({ fitLineHangs: setFitLineHang(fitLineHangs, i, value) })}
						min={0}
						max={INITIAL_HANG_MAX}
						step={0.01}
						help={lineHang === 0 ? __('Off', 'typography-stylist') : `${lineHang}em`}
						allowReset
						resetFallbackValue={0}
					/>
				);
			})}
			{/* The block's own alignment, else the style's (#207), which the
			    guarded style rule skips on fit blocks (PR #329 review) */}
			{!initialHangApplies(resolveHangTextAlign(
				textAlign,
				activeParagraphStyle && activeParagraphStyle.properties ? activeParagraphStyle.properties.alignment : '',
				fontSize === 'fit',
				isRTL()
			), isRTL()) && (
				<p style={{ fontSize: '12px', color: '#757575', marginTop: '8px', marginBottom: '8px' }}>
					{__('The hang has no effect while the text is centered or aligned to the end. Align the text to the start to use it.', 'typography-stylist')}
				</p>
			)}
			{/* The block's own Line indent turns the hang off (#348, style.css); only said when there is a hang to lose */}
			{fontSize !== 'fit' && normalizeHang(initialHang) > 0 && hasBlockTextIndent(attributes.style) && (
				<p style={{ fontSize: '12px', color: '#757575', marginTop: '8px', marginBottom: '8px' }}>
					{__('The hang has no effect while the block has a Line indent. Remove the Line indent to use the hang.', 'typography-stylist')}
				</p>
			)}
			<p style={{ fontSize: '12px', color: '#757575', marginTop: '8px', marginBottom: 0 }}>
				{__('The swash draws outside the block. Some themes cut off content that goes outside its container, and then the swash is cut off on the site. Check the published page.', 'typography-stylist')}
			</p>
		</PanelBody>
	);
}
